/**
 * Validates n8n Admin Token is present in frontend/.env.local.
 * n8n's API redacts secret fields, so the token must be copied from the n8n UI.
 *
 * Usage: bun run check-n8n-token
 */
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const envLocalPath = resolve(__dirname, '..', '.env.local');

const envLocal = readFileSync(envLocalPath, 'utf8');
const match = envLocal.match(/^N8N_ADMIN_TOKEN=(.*)$/m);
const token = (match?.[1] ?? '').trim();

if (!token || token.startsWith('__n8n_BLANK')) {
  console.error('N8N_ADMIN_TOKEN is missing or still a placeholder in frontend/.env.local');
  console.error('');
  console.error('Fix:');
  console.error('  1. Open https://n8n.piyushtater.com → Credentials → Admin Token');
  console.error('  2. Copy the Value field (the secret, not the header name)');
  console.error('  3. Set N8N_ADMIN_TOKEN=<that value> in frontend/.env.local');
  console.error('  4. Restart: bun dev');
  process.exit(1);
}

console.log('N8N_ADMIN_TOKEN is set. Restart bun dev if you just changed .env.local.');
