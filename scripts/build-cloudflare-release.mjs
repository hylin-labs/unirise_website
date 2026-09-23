import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

function required(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} must be set for a Cloudflare release build.`);
  return value;
}

const root = process.cwd();
const source = resolve(root, 'dist/server/wrangler.json');
const output = resolve(root, 'dist/server/wrangler.cloudflare.json');
const config = JSON.parse(await readFile(source, 'utf8'));

config.name = required('CLOUDFLARE_WORKER_NAME');
config.d1_databases = [
  {
    binding: 'DB',
    database_name: required('CLOUDFLARE_D1_DATABASE_NAME'),
    database_id: required('CLOUDFLARE_D1_DATABASE_ID'),
  },
];
config.r2_buckets = [
  {
    binding: 'DOCUMENTS',
    bucket_name: required('CLOUDFLARE_R2_BUCKET_NAME'),
  },
];

await writeFile(output, `${JSON.stringify(config, null, 2)}\n`);
console.log(`Cloudflare release configuration written to ${output}.`);
