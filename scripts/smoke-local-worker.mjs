import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, rm, unlink, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { dirname, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

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
const stateDirectory = await mkdtemp(
  resolve(tmpdir(), 'unirise-worker-smoke-'),
);

function run(command, args, options = {}) {
  return new Promise((resolveRun, reject) => {
    const child = spawn(command, args, {
      cwd: root,
      stdio: 'pipe',
      windowsHide: true,
      ...options,
    });
    let output = '';
    child.stdout.on('data', (chunk) => {
      output += String(chunk);
    });
    child.stderr.on('data', (chunk) => {
      output += String(chunk);
    });
    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) resolveRun(output);
      else reject(new Error(`${command} exited ${code}: ${output}`));
    });
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
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          Origin: `http://127.0.0.1:${port}`,
          'Content-Type': 'application/json',
          'CF-Connecting-IP': '203.0.113.31',
        },
        body: '{',
      });
      const body = await response.json();
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

async function stopWorker(child) {
  if (!child || child.exitCode !== null) return;
  const exited = new Promise((resolveExit) => child.once('exit', resolveExit));
  child.kill('SIGTERM');
  await Promise.race([
    exited,
    new Promise((resolveTimeout) =>
      setTimeout(() => {
        child.kill('SIGKILL');
        resolveTimeout();
      }, 5_000),
    ),
  ]);
}

async function removeStateDirectory() {
  let lastError;
  for (let attempt = 0; attempt < 20; attempt += 1) {
    try {
      await rm(stateDirectory, { recursive: true, force: true });
      return;
    } catch (error) {
      lastError = error;
      await new Promise((resolveWait) => setTimeout(resolveWait, 250));
    }
  }
  throw lastError;
}

let worker;
let createdEnvFile = false;
try {
  if (existsSync(envFile)) {
    throw new Error(
      'Refusing to replace an existing root .dev.vars during smoke testing.',
    );
  }
  await writeFile(
    envFile,
    [
      'GROQ_API_KEY=smoke-groq-sentinel',
      'RESEND_API_KEY=smoke-resend-sentinel',
      'RESEND_FROM_EMAIL=smoke@example.test',
      'ADMIN_AUTH_PEPPER=smoke-admin-pepper-at-least-32-characters',
      'ANALYTICS_HASH_PEPPER=smoke-analytics-pepper-at-least-32-characters',
      '',
    ].join('\n'),
    'utf8',
  );
  createdEnvFile = true;

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
      stateDirectory,
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
      stateDirectory,
      '--port',
      String(port),
      '--ip',
      '127.0.0.1',
      '--log-level',
      'error',
    ],
    { cwd: root, stdio: 'pipe', windowsHide: true },
  );
  await waitForConfiguredLeadsRoute(port);
  console.log('Local Worker smoke test passed.');
} finally {
  await stopWorker(worker);
  if (createdEnvFile) await unlink(envFile).catch(() => undefined);
  await removeStateDirectory();
}
