/**
 * Print openAiApi credential id/name from live n8n (no secret values).
 */
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = join(__dirname, '..', '..', '.env');
const env = {};
for (const line of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
  const m = line.match(/^([^#=]+)=(.*)$/);
  if (m) env[m[1].trim()] = m[2].trim();
}

const base = env.N8N_BASE_URL.replace(/\/$/, '');
const headers = { 'X-N8N-API-KEY': env.N8N_API_KEY };
const TARGET_NAME = 'OpenRouterCredentialsSaved';

async function listFromWorkflows() {
  const res = await fetch(`${base}/api/v1/workflows?limit=100`, { headers });
  const { data: workflows } = await res.json();
  const found = new Map();

  for (const w of workflows) {
    const full = await fetch(`${base}/api/v1/workflows/${w.id}`, { headers }).then((r) => r.json());
    for (const node of full.nodes || []) {
      for (const [type, cred] of Object.entries(node.credentials || {})) {
        if (cred?.id) found.set(`${type}:${cred.id}`, { type, id: cred.id, name: cred.name, node: node.name, workflow: w.name });
      }
    }
  }
  return found;
}

async function listFromCredentialsApi() {
  const res = await fetch(`${base}/api/v1/credentials`, { headers });
  const ct = res.headers.get('content-type') || '';
  console.log(`credentials API status=${res.status} content-type=${ct}`);
  if (!res.ok || !ct.includes('application/json')) {
    const preview = (await res.text()).slice(0, 120);
    console.log(`credentials API body preview: ${preview}`);
    return [];
  }
  const { data } = await res.json();
  return data || [];
}

const fromWorkflows = await listFromWorkflows();
const fromApi = await listFromCredentialsApi();

console.log('All credentials on workflow nodes:');
for (const entry of fromWorkflows.values()) {
  console.log(`  [${entry.workflow}] ${entry.node}: ${entry.type} "${entry.name}" -> ${entry.id}`);
}

console.log('All credentials from API:');
for (const c of fromApi) {
  console.log(`  ${c.type} "${c.name}" -> ${c.id}`);
}

const needle = TARGET_NAME.toLowerCase();
const apiMatch = fromApi.find((c) => (c.name || '').toLowerCase().includes(needle));
const wfMatch = [...fromWorkflows.values()].find((e) => (e.name || '').toLowerCase().includes(needle));

const match = apiMatch || wfMatch;

if (match) {
  const id = match.id;
  const name = match.name;
  const type = match.type || 'openAiApi';
  console.log(`\nMATCH: ${type} "${name}" -> ${id}`);
} else {
  console.log(`\nNo credential named "${TARGET_NAME}" found.`);
}
