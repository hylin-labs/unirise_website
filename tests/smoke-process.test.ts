import { EventEmitter } from 'node:events';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  createExclusiveFile,
  fetchWithTimeout,
  removeOwnedTemporaryFile,
  removeTemporaryArtifact,
  runCommand,
  terminateChildTree,
} from '../scripts/smoke-process.mjs';

describe('local Worker smoke process helpers', () => {
  const temporaryPaths: string[] = [];

  afterEach(async () => {
    await Promise.all(
      temporaryPaths
        .splice(0)
        .map((path) =>
          removeTemporaryArtifact(path, { attempts: 2, delayMs: 1 }),
        ),
    );
  });

  it('bounds a hung subprocess and terminates it', async () => {
    const startedAt = Date.now();

    await expect(
      runCommand(process.execPath, ['-e', 'setInterval(() => {}, 1_000)'], {
        timeoutMs: 100,
      }),
    ).rejects.toThrow('timed out after 100ms');

    expect(Date.now() - startedAt).toBeLessThan(5_000);
  });

  it('removes and verifies temporary files and directories', async () => {
    const directory = await mkdtemp(resolve(tmpdir(), 'unirise-smoke-helper-'));
    const file = resolve(directory, '.dev.vars');
    await writeFile(file, 'SMOKE_SENTINEL=value\n');
    temporaryPaths.push(directory);

    await removeTemporaryArtifact(file, { attempts: 2, delayMs: 1 });
    expect(existsSync(file)).toBe(false);

    await removeTemporaryArtifact(directory, { attempts: 2, delayMs: 1 });
    expect(existsSync(directory)).toBe(false);
    temporaryPaths.pop();
  });

  it('never replaces an existing environment file during exclusive creation', async () => {
    const directory = await mkdtemp(resolve(tmpdir(), 'unirise-smoke-helper-'));
    const file = resolve(directory, '.dev.vars');
    temporaryPaths.push(directory);
    await writeFile(file, 'USER_VALUE=keep\n');

    await expect(
      createExclusiveFile(file, 'SMOKE_VALUE=temporary\n'),
    ).resolves.toBe(false);
    await expect(readFile(file, 'utf8')).resolves.toBe('USER_VALUE=keep\n');
  });

  it('never deletes an environment file whose contents changed after creation', async () => {
    const directory = await mkdtemp(resolve(tmpdir(), 'unirise-smoke-helper-'));
    const file = resolve(directory, '.dev.vars');
    temporaryPaths.push(directory);
    const smokeContents = 'SMOKE_VALUE=temporary\n';
    await expect(createExclusiveFile(file, smokeContents)).resolves.toBe(true);
    await writeFile(file, 'USER_VALUE=keep\n');

    await expect(removeOwnedTemporaryFile(file, smokeContents)).rejects.toThrow(
      'Refusing to delete a changed temporary file',
    );
    await expect(readFile(file, 'utf8')).resolves.toBe('USER_VALUE=keep\n');
  });

  it('aborts an individual readiness fetch that never responds', async () => {
    let wasAborted = false;
    const fetcher = (_input: RequestInfo | URL, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          wasAborted = true;
          reject(init.signal?.reason);
        });
      });

    await expect(
      fetchWithTimeout(
        'http://127.0.0.1:8787/api/leads',
        {},
        {
          timeoutMs: 10,
          fetcher,
        },
      ),
    ).rejects.toThrow('readiness request timed out');
    expect(wasAborted).toBe(true);
  });

  it('keeps the readiness timeout active while a response body is unresponsive', async () => {
    let wasAborted = false;
    const fetcher = (_input: RequestInfo | URL, init?: RequestInit) =>
      Promise.resolve({
        json: () =>
          new Promise<never>((_resolve, reject) => {
            init?.signal?.addEventListener('abort', () => {
              wasAborted = true;
              reject(init.signal?.reason);
            });
          }),
      } as unknown as Response);

    await expect(
      fetchWithTimeout(
        'http://127.0.0.1:8787/api/leads',
        {},
        {
          timeoutMs: 10,
          fetcher,
          consume: async (response) => response.json(),
        },
      ),
    ).rejects.toThrow('readiness request timed out');
    expect(wasAborted).toBe(true);
  });

  it('rejects Windows termination when the child remains alive', async () => {
    const child = Object.assign(new EventEmitter(), {
      pid: 42,
      exitCode: null,
      signalCode: null,
      kill: () => true,
    });

    await expect(
      terminateChildTree(child, {
        platform: 'win32',
        forceMs: 1,
        terminateWindowsTree: async () => undefined,
      }),
    ).rejects.toThrow('did not exit after Windows termination');
  });
});
