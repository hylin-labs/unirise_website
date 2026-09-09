import { spawn } from 'node:child_process';
import { rmSync } from 'node:fs';
import { mkdtemp } from 'node:fs/promises';
import { createServer } from 'node:net';
import { dirname, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import {
  createExclusiveFile,
  fetchWithTimeout,
  removeOwnedTemporaryFile,
  removeOwnedTemporaryFileSync,
  removeTemporaryArtifact,
  runCommand,
  terminateChildTree,
  terminateChildTreeSync,
} from './smoke-process.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const node = process.execPath;
const wrangler = resolve(
  root,
  'node_modules',
  'wrangler',
  'bin',
  'wrangler.js',
);
const startWorker = resolve(root, 'scripts', 'start-worker.mjs');
const config = resolve(root, 'dist', 'server', 'wrangler.json');
const envFile = resolve(root, '.dev.vars');
const smokeEnvContents = [
  'GROQ_API_KEY=smoke-groq-sentinel',
  'RESEND_API_KEY=smoke-resend-sentinel',
  'RESEND_FROM_EMAIL=smoke@example.test',
  'ADMIN_AUTH_PEPPER=smoke-admin-pepper-at-least-32-characters',
  'ANALYTICS_HASH_PEPPER=smoke-analytics-pepper-at-least-32-characters',
  '',
].join('\n');
const commandTimeoutMs = 120_000;
const workerReadyTimeoutMs = 20_000;
const activeChildren = new Set();
const smokeState = { directory: undefined };
let worker;
let createdEnvFile = false;
let cleanupPromise;
let shuttingDown = false;

function run(command, args, options = {}) {
  return runCommand(command, args, {
    cwd: root,
    timeoutMs: commandTimeoutMs,
    onSpawn: (child) => activeChildren.add(child),
    onExit: (child) => activeChildren.delete(child),
    ...options,
  });
}

function runNpm(args) {
  if (process.platform !== 'win32') return run('npm', args);
  return run(process.env.ComSpec ?? 'cmd.exe', [
    '/d',
    '/s',
    '/c',
    `npm ${args.join(' ')}`,
  ]);
}

async function freePort() {
  const server = createServer();
  await new Promise((resolveListen, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolveListen);
  });
  const address = server.address();
  if (!address || typeof address === 'string')
    throw new Error('No free TCP port');
  const { port } = address;
  await new Promise((resolveClose, reject) =>
    server.close((error) => (error ? reject(error) : resolveClose())),
  );
  return port;
}

async function waitForConfiguredLeadsRoute(port) {
  const url = `http://127.0.0.1:${port}/api/leads`;
  let lastError;
  const deadline = Date.now() + workerReadyTimeoutMs;
  while (Date.now() < deadline) {
    try {
      const { response, body } = await fetchWithTimeout(
        url,
        {
          method: 'POST',
          headers: {
            Origin: `http://127.0.0.1:${port}`,
            'Content-Type': 'application/json',
            'CF-Connecting-IP': '203.0.113.31',
          },
          body: '{',
        },
        {
          consume: async (result) => ({
            response: result,
            body: await result.json(),
          }),
        },
      );
      if (response.status === 400 && body.error === 'invalid_request') return;
      throw new Error(
        `Unexpected response: ${response.status} ${JSON.stringify(body)}`,
      );
    } catch (error) {
      lastError = error;
      await new Promise((resolveWait) => setTimeout(resolveWait, 250));
    }
  }
  throw lastError ?? new Error('Worker did not become ready');
}

async function cleanup() {
  if (cleanupPromise) return cleanupPromise;
  cleanupPromise = (async () => {
    const children = [...activeChildren];
    const results = await Promise.allSettled(
      children.map((child) => terminateChildTree(child)),
    );
    activeChildren.clear();
    results.forEach((result, index) => {
      if (result.status === 'rejected') activeChildren.add(children[index]);
    });
    const workerResult = await Promise.allSettled([terminateChildTree(worker)]);
    const artifactResults = await Promise.allSettled([
      ...(createdEnvFile
        ? [removeOwnedTemporaryFile(envFile, smokeEnvContents)]
        : []),
      ...(smokeState.directory
        ? [removeTemporaryArtifact(smokeState.directory)]
        : []),
    ]);
    const failures = [...results, ...workerResult, ...artifactResults].filter(
      (result) => result.status === 'rejected',
    );
    if (failures.length > 0) throw new AggregateError(failures);
  })();
  return cleanupPromise;
}

async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  try {
    await cleanup();
  } catch (error) {
    console.error(`Smoke cleanup after ${signal} failed:`, error);
  }
  process.exit(signal === 'SIGINT' ? 130 : 143);
}

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, () => void shutdown(signal));
}

process.once('exit', () => {
  for (const child of activeChildren) terminateChildTreeSync(child);
  terminateChildTreeSync(worker);
  try {
    if (createdEnvFile) removeOwnedTemporaryFileSync(envFile, smokeEnvContents);
  } catch {}
  try {
    if (smokeState.directory)
      rmSync(smokeState.directory, { recursive: true, force: true });
  } catch {}
});

smokeState.directory = await mkdtemp(
  resolve(tmpdir(), 'unirise-worker-smoke-'),
);
let failure;
try {
  createdEnvFile = await createExclusiveFile(envFile, smokeEnvContents);
  if (!createdEnvFile) {
    throw new Error(
      'Refusing to replace an existing root .dev.vars during smoke testing.',
    );
  }

  await runNpm(['run', 'build']);
  for (const migration of [
    '0000_add_visitor_statistics.sql',
    '0001_add_chat_rate_limits.sql',
    '0002_add_admin_content_leads_analytics.sql',
  ]) {
    await run(node, [
      wrangler,
      'd1',
      'execute',
      'site-creator-d1',
      '--local',
      '--config',
      config,
      '--persist-to',
      smokeState.directory,
      '--file',
      resolve(root, 'drizzle', migration),
      '--yes',
    ]);
  }

  const port = await freePort();
  worker = spawn(
    node,
    [
      startWorker,
      '--persist-to',
      smokeState.directory,
      '--port',
      String(port),
      '--ip',
      '127.0.0.1',
      '--log-level',
      'error',
    ],
    {
      cwd: root,
      stdio: 'pipe',
      windowsHide: true,
      detached: process.platform !== 'win32',
    },
  );
  await waitForConfiguredLeadsRoute(port);
  console.log('Local Worker smoke test passed.');
} catch (error) {
  failure = error;
}
try {
  await cleanup();
} catch (cleanupError) {
  if (failure) console.error('Smoke cleanup failed:', cleanupError);
  else failure = cleanupError;
}
if (failure) throw failure;
