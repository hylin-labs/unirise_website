import { spawn, spawnSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { open, readFile, rm } from 'node:fs/promises';

function wait(milliseconds) {
  return new Promise((resolveWait) => setTimeout(resolveWait, milliseconds));
}

function waitForExit(child, timeoutMs) {
  if (child.exitCode !== null || child.signalCode !== null) {
    return Promise.resolve(true);
  }
  return new Promise((resolveExit) => {
    const finish = (exited) => {
      clearTimeout(timeout);
      child.off('exit', onExit);
      child.off('error', onError);
      resolveExit(exited);
    };
    const timeout = setTimeout(() => {
      finish(false);
    }, timeoutMs);
    const onExit = () => finish(true);
    const onError = () => finish(false);
    child.once('exit', onExit);
    child.once('error', onError);
  });
}

async function terminateWindowsTree(child) {
  if (!child.pid) return;
  const taskkill = spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], {
    stdio: 'ignore',
    windowsHide: true,
  });
  const completed = await waitForExit(taskkill, 5_000);
  if (!completed) {
    taskkill.kill('SIGKILL');
    throw new Error('taskkill timed out');
  }
  if (taskkill.exitCode !== 0 || taskkill.signalCode !== null) {
    throw new Error(
      `taskkill exited ${taskkill.exitCode ?? taskkill.signalCode ?? 'unknown'}`,
    );
  }
}

function terminateWindowsTreeSync(child) {
  const result = spawnSync(
    'taskkill',
    ['/pid', String(child.pid), '/T', '/F'],
    {
      stdio: 'ignore',
      timeout: 5_000,
      windowsHide: true,
    },
  );
  if (result.status !== 0 || result.error || result.signal) {
    throw (
      result.error ??
      new Error(
        `taskkill exited ${result.status ?? result.signal ?? 'unknown'}`,
      )
    );
  }
}

export async function terminateChildTree(
  child,
  {
    graceMs = 5_000,
    forceMs = 5_000,
    platform = process.platform,
    terminateWindowsTree: terminateWindows = terminateWindowsTree,
  } = {},
) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;

  if (platform === 'win32') {
    try {
      await terminateWindows(child);
    } catch (error) {
      throw new Error(
        'Windows taskkill failed; tree termination is unconfirmed.',
        {
          cause: error,
        },
      );
    }
    if (await waitForExit(child, forceMs)) return;
    child.kill('SIGKILL');
    if (await waitForExit(child, forceMs)) return;
    throw new Error('Child process did not exit after Windows termination.');
  }

  try {
    process.kill(-child.pid, 'SIGTERM');
  } catch {
    child.kill('SIGTERM');
  }
  if (await waitForExit(child, graceMs)) return;

  try {
    process.kill(-child.pid, 'SIGKILL');
  } catch {
    child.kill('SIGKILL');
  }
  if (!(await waitForExit(child, forceMs))) {
    throw new Error('Child process did not exit after termination.');
  }
}

export function terminateChildTreeSync(
  child,
  {
    platform = process.platform,
    terminateWindowsTreeSync: terminateWindows = terminateWindowsTreeSync,
  } = {},
) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  if (platform === 'win32') {
    try {
      terminateWindows(child);
    } catch (error) {
      throw new Error(
        'Windows taskkill failed; tree termination is unconfirmed.',
        {
          cause: error,
        },
      );
    }
    return true;
  }
  try {
    process.kill(-child.pid, 'SIGKILL');
  } catch {
    child.kill('SIGKILL');
  }
  return true;
}

export function runCommand(
  command,
  args,
  { timeoutMs = 120_000, onSpawn, onExit, ...options } = {},
) {
  return new Promise((resolveRun, reject) => {
    const child = spawn(command, args, {
      cwd: process.cwd(),
      stdio: 'pipe',
      windowsHide: true,
      detached: process.platform !== 'win32',
      ...options,
    });
    onSpawn?.(child);
    let output = '';
    let settled = false;
    let timedOut = false;
    const settle = (callback, value, notifyExit = true) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      if (notifyExit) onExit?.(child);
      callback(value);
    };
    const timeout = setTimeout(() => {
      timedOut = true;
      void terminateChildTree(child).then(
        () =>
          settle(
            reject,
            new Error(`${command} timed out after ${timeoutMs}ms: ${output}`),
          ),
        (error) => settle(reject, error, false),
      );
    }, timeoutMs);

    child.stdout.on('data', (chunk) => {
      output += String(chunk);
    });
    child.stderr.on('data', (chunk) => {
      output += String(chunk);
    });
    child.on('error', (error) => settle(reject, error, false));
    child.on('exit', (code, signal) => {
      if (timedOut) return;
      if (code === 0) settle(resolveRun, output);
      else {
        settle(
          reject,
          new Error(
            `${command} exited ${code ?? signal ?? 'unknown'}: ${output}`,
          ),
        );
      }
    });
  });
}

export async function createExclusiveFile(path, contents) {
  let handle;
  try {
    handle = await open(path, 'wx');
  } catch (error) {
    if (error && typeof error === 'object' && error.code === 'EEXIST') {
      return false;
    }
    throw error;
  }
  try {
    await handle.writeFile(contents, 'utf8');
    return true;
  } finally {
    await handle.close();
  }
}

export async function removeOwnedTemporaryFile(path, contents) {
  let current;
  try {
    current = await readFile(path, 'utf8');
  } catch (error) {
    if (error && typeof error === 'object' && error.code === 'ENOENT') return;
    throw error;
  }
  if (current !== contents) {
    throw new Error(`Refusing to delete a changed temporary file: ${path}`);
  }
  await removeTemporaryArtifact(path);
}

export function removeOwnedTemporaryFileSync(path, contents) {
  try {
    if (readFileSync(path, 'utf8') === contents)
      rmSync(path, { recursive: true, force: true });
  } catch {}
}

export async function fetchWithTimeout(
  input,
  init = {},
  { timeoutMs = 2_000, fetcher = fetch, consume = (response) => response } = {},
) {
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(new Error('readiness request timed out')),
    timeoutMs,
  );
  try {
    const response = await fetcher(input, {
      ...init,
      signal: controller.signal,
    });
    return await consume(response);
  } finally {
    clearTimeout(timeout);
  }
}

export async function removeTemporaryArtifact(
  path,
  { attempts = 20, delayMs = 250 } = {},
) {
  let lastError;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      await rm(path, { recursive: true, force: true });
      if (!existsSync(path)) return;
      lastError = new Error(`Temporary artifact still exists: ${path}`);
    } catch (error) {
      lastError = error;
    }
    await wait(delayMs);
  }
  throw lastError ?? new Error(`Unable to remove temporary artifact: ${path}`);
}
