import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const env = {};
for (const line of readFileSync(join(__dirname, '..', '..', '.env'), 'utf8').split(/\r?\n/)) {
  const m = line.match(/^([^#=]+)=(.*)$/);
  if (m) env[m[1].trim()] = m[2].trim();
}

const id = process.argv[2] || '79';
const base = env.N8N_BASE_URL.replace(/\/$/, '');
const headers = { 'X-N8N-API-KEY': env.N8N_API_KEY };
const d = await fetch(`${base}/api/v1/executions/${id}?includeData=true`, { headers }).then((r) =>
  r.json()
);

if (d.message) {
  console.error('API error:', d.message);
  process.exit(1);
}

const wf = d.data?.resultData?.runData || {};
for (const [name, nodes] of Object.entries(wf)) {
  if (!/openrouter/i.test(name)) continue;
  const last = nodes[nodes.length - 1];
  const j = last?.data?.main?.[0]?.[0]?.json;
  console.log('NODE:', name);
  console.log('status:', last?.executionStatus);
  console.log('nodeError:', JSON.stringify(last?.error));
  console.log('json:', JSON.stringify(j, null, 2));
  console.log('---');
}
