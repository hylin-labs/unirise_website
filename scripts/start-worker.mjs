import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const config = resolve(root, 'dist', 'server', 'wrangler.json');
const envFile = resolve(root, '.dev.vars');
const wrangler = resolve(
  root,
  'node_modules',
  'wrangler',
  'bin',
  'wrangler.js',
);

if (!existsSync(config)) {
  throw new Error(
    'Missing dist/server/wrangler.json. Run npm run build first.',
  );
}
if (!existsSync(envFile)) {
  throw new Error(
    'Missing .dev.vars. Copy .dev.vars.example and set local values.',
  );
}

const child = spawn(
  process.execPath,
  [
    wrangler,
    'dev',
    '--config',
    config,
    '--env-file',
    envFile,
    ...process.argv.slice(2),
  ],
  { cwd: root, stdio: 'inherit', windowsHide: true },
);

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => child.kill(signal));
}

child.on('error', (error) => {
  throw error;
});
child.on('exit', (code, signal) => {
  if (signal) process.exitCode = 1;
  else process.exitCode = code ?? 1;
});
