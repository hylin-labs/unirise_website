import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { cp, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { bilingualRouteInventory } from '../lib/public-route-inventory.mjs';
import {
  fetchWithTimeout,
  runCommand,
  removeTemporaryArtifact,
  terminateChildTree,
} from './smoke-process.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const temporary = await mkdtemp(resolve(tmpdir(), 'unirise-bilingual-smoke-'));
const configuration = resolve(temporary, 'server', 'wrangler.json');
const state = resolve(temporary, 'state');
const wrangler = resolve(root, 'node_modules/wrangler/bin/wrangler.js');
// No inherited provider or Cloudflare credentials enter this isolated process.
const processEnvironment = Object.fromEntries(
  Object.entries(process.env).filter(
    ([key]) =>
      !/KEY|TOKEN|SECRET|PEPPER|CLOUDFLARE|WRANGLER|RESEND|GROQ/i.test(key),
  ),
);
processEnvironment.WRANGLER_SEND_METRICS = 'false';
processEnvironment.CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV = 'false';
let worker;
const children = new Set();
let cleanupPromise;
function cleanup() {
  return (cleanupPromise ??= (async () => {
    const processes = [...new Set([...children, ...(worker ? [worker] : [])])];
    const termination = await Promise.allSettled(
      processes.map(terminateChildTree),
    );
    const removal = await Promise.allSettled([
      removeTemporaryArtifact(temporary),
    ]);
    const failures = [...termination, ...removal]
      .filter((result) => result.status === 'rejected')
      .map((result) => result.reason);
    if (failures.length)
      throw new AggregateError(
        failures,
        'Bilingual smoke cleanup completed with failures.',
      );
  })());
}
for (const signal of ['SIGINT', 'SIGTERM'])
  process.once(signal, () => {
    void cleanup().finally(() => process.exit(signal === 'SIGINT' ? 130 : 143));
  });
const run = (args) =>
  runCommand(process.execPath, [wrangler, ...args], {
    cwd: temporary,
    env: processEnvironment,
    timeoutMs: 120000,
    onSpawn: (child) => children.add(child),
    onExit: (child) => children.delete(child),
  });

let primaryFailure;
let cleanupFailure;
try {
  await cp(resolve(root, 'dist/server'), resolve(temporary, 'server'), {
    recursive: true,
  });
  const config = JSON.parse(await readFile(configuration, 'utf8'));
  config.main = 'smoke-entry.mjs';
  config.assets.directory = resolve(root, 'dist/client');
  config.vars = {
    GROQ_API_KEY: 'smoke-only',
    RESEND_API_KEY: 'smoke-only',
    RESEND_FROM_EMAIL: 'smoke@example.test',
    ADMIN_AUTH_PEPPER: 'smoke-admin-pepper-at-least-32-characters',
    ANALYTICS_HASH_PEPPER: 'smoke-analytics-pepper-at-least-32-characters',
  };
  config.triggers = {};
  await writeFile(configuration, JSON.stringify(config));
  const envFile = resolve(temporary, '.dev.vars');
  await writeFile(
    envFile,
    'GROQ_API_KEY=smoke-only\nRESEND_API_KEY=smoke-only\nRESEND_FROM_EMAIL=smoke@example.test\nADMIN_AUTH_PEPPER=smoke-admin-pepper-at-least-32-characters\nANALYTICS_HASH_PEPPER=smoke-analytics-pepper-at-least-32-characters\n',
    { flag: 'wx' },
  );
  // This wrapper exists only in the temporary build copy. All outbound fetches
  // fail closed except the fixed in-process Groq response; no network is used.
  await writeFile(
    resolve(temporary, 'server/smoke-entry.mjs'),
    `
globalThis.fetch = async (input) => {
  const url = typeof input === 'string' ? input : input.url;
  if (url !== 'https://api.groq.com/openai/v1/chat/completions') throw new Error('smoke_outbound_blocked');
  return Response.json({ choices: [{ message: { content: 'Smoke inspection information.' } }] });
};
const {default: application} = await import('./index.js');
export default { async fetch(request, env, context) {
  const path = new URL(request.url).pathname;
  if (path === '/__smoke/inventory') {
    const news = await env.DB.prepare('SELECT legacy_id FROM managed_news WHERE status = ?').bind('published').all();
    const downloads = await env.DB.prepare('SELECT legacy_id FROM managed_downloads WHERE status = ?').bind('published').all();
    return Response.json({ newsIds: news.results.map(x => x.legacy_id), downloadIds: downloads.results.map(x => x.legacy_id) });
  }
  if (path === '/__smoke/english') {
    await env.DB.prepare("INSERT INTO chat_knowledge (id,title,href,body,tags_json,status) VALUES ('smoke-en','Smoke','/catalog?type=brand&id=2','煙霧測試','[]','published')").run();
    const payload = {kind:'knowledge',text:{title:'Smoke inspection',body:'Smokeinspection verified equipment.',tags:['smokeinspection']},literals:{href:'/catalog?type=brand&id=2'}};
    await env.DB.prepare("INSERT INTO content_translations (id,resource_type,resource_id,locale,payload_json,status,source_version,origin) VALUES ('smoke-en','knowledge','smoke-en','en',?,'needs_review',1,'ai')").bind(JSON.stringify(payload)).run();
    return Response.json({ok:true});
  }
  return application.fetch(request, env, context);
} };
`,
  );
  for (const migration of [
    '0000_add_visitor_statistics.sql',
    '0001_add_chat_rate_limits.sql',
    '0002_add_admin_content_leads_analytics.sql',
    '0003_add_bilingual_content.sql',
    '0004_add_document_knowledge.sql',
    '0005_add_document_extraction_metadata.sql',
    '0006_add_structured_knowledge_foundation.sql',
    '0007_add_line_contact_settings.sql',
  ]) {
    await run([
      'd1',
      'execute',
      'site-creator-d1',
      '--local',
      '--config',
      configuration,
      '--persist-to',
      state,
      '--file',
      resolve(root, 'drizzle', migration),
      '--yes',
    ]);
  }
  const server = createServer();
  await new Promise((done, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', done);
  });
  const port = server.address().port;
  await new Promise((done) => server.close(done));
  const origin = `http://127.0.0.1:${port}`;
  worker = spawn(
    process.execPath,
    [
      wrangler,
      'dev',
      '--local',
      '--config',
      configuration,
      '--env-file',
      envFile,
      '--persist-to',
      state,
      '--port',
      String(port),
      '--ip',
      '127.0.0.1',
      '--log-level',
      'error',
    ],
    {
      cwd: temporary,
      env: processEnvironment,
      stdio: 'pipe',
      windowsHide: true,
      detached: process.platform !== 'win32',
    },
  );
  let stderr = '';
  worker.stderr.on('data', (data) => {
    stderr = (stderr + data).slice(-3000);
  });
  worker.stdout.resume();
  const get = async (path, options) =>
    fetchWithTimeout(origin + path, options, {
      consume: async (response) => ({
        status: response.status,
        text: await response.text(),
      }),
    });
  const deadline = Date.now() + 45000;
  while (true) {
    try {
      assert.equal((await get('/')).status, 200);
      break;
    } catch (error) {
      if (Date.now() > deadline || worker.exitCode !== null)
        throw new Error(`Worker startup failed: ${stderr}`, { cause: error });
      await new Promise((done) => setTimeout(done, 250));
    }
  }
  const inventory = JSON.parse((await get('/__smoke/inventory')).text);
  const paths = new Set(bilingualRouteInventory(inventory));
  const assets = new Set();
  for (const path of paths) {
    const page = await get(path);
    assert.equal(page.status, 200, path);
    assert.match(page.text, /aria-label="Language"/, path);
    const selector = page.text.match(
      /<nav aria-label="Language">([\s\S]*?)<\/nav>/,
    )?.[1];
    const languageLinks = [...(selector ?? '').matchAll(/href="([^"]+)"/g)];
    assert.equal(
      languageLinks.length,
      2,
      `Two accessible language choices: ${path}`,
    );
    for (const [, href] of languageLinks)
      assert.equal(
        new URL(href.replaceAll('&amp;', '&'), origin).origin,
        origin,
      );
    for (const [, href] of page.text.matchAll(/href="([^"<>]+)"/g)) {
      const decoded = href.replaceAll('&amp;', '&');
      if (!decoded.startsWith('/') || decoded.startsWith('//')) continue;
      const linked = new URL(decoded, origin);
      if (
        /^\/(en\/?)?(catalog|news|downloads|contact|inquiry)?$/.test(
          linked.pathname,
        )
      ) {
        paths.add(linked.pathname + linked.search);
      } else {
        assets.add(linked.pathname + linked.search);
      }
    }
    for (const [, src] of page.text.matchAll(
      /(?:src|poster)="(\/reference\/[^"<>]+)"/g,
    ))
      assets.add(src.replaceAll('&amp;', '&'));
  }
  for (const asset of assets)
    assert.equal((await get(asset)).status, 200, asset);
  const post = (locale, message) =>
    get('/api/chat', {
      method: 'POST',
      headers: { Origin: origin, 'Content-Type': 'application/json' },
      body: JSON.stringify({ locale, message }),
    });
  assert.equal((await post('invalid', 'test')).status, 400);
  const fallbackResponse = await post('en', 'smokeinspection');
  assert.equal(fallbackResponse.status, 200, fallbackResponse.text);
  const fallback = JSON.parse(fallbackResponse.text);
  assert.deepEqual(fallback.sources, []);
  assert.match(fallback.answer, /does not currently provide/);
  const chineseDetail = await get('/news?id=3944');
  const englishDetail = await get('/en/news?id=3944');
  const title = chineseDetail.text.match(/<h2[^>]*>(.*?)<\/h2>/s)?.[1];
  assert.ok(
    title && englishDetail.text.includes(title),
    'Missing English detail keeps its Chinese source usable',
  );
  assert.equal((await get('/__smoke/english')).status, 200);
  const answerResponse = await post('en', 'smokeinspection');
  assert.equal(answerResponse.status, 200, answerResponse.text);
  const answer = JSON.parse(answerResponse.text);
  assert.equal(answer.answer, 'Smoke inspection information.');
  assert.ok(answer.sources.length > 0);
  assert.ok(answer.sources.every((source) => source.href.startsWith('/en/')));
  console.log(
    `Bilingual Worker smoke passed: ${paths.size} public routes, ${assets.size} local assets, locale rejection, missing-English fallback, mocked English chat sources.`,
  );
} catch (error) {
  primaryFailure = error;
} finally {
  try {
    await cleanup();
  } catch (error) {
    cleanupFailure = error;
  }
}
if (primaryFailure) {
  if (cleanupFailure)
    console.error(
      'Bilingual smoke cleanup failed after the primary failure:',
      cleanupFailure,
    );
  throw primaryFailure;
}
if (cleanupFailure) throw cleanupFailure;
