import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const env = {};
for (const line of readFileSync(join(__dirname, '..', '..', '.env'), 'utf8').split(/\r?\n/)) {
  const m = line.match(/^([^#=]+)=(.*)$/);
  if (m) env[m[1].trim()] = m[2].trim();
}

const base = env.N8N_BASE_URL.replace(/\/$/, '');
const headers = { 'X-N8N-API-KEY': env.N8N_API_KEY };
const wf = await fetch(`${base}/api/v1/workflows/vqSkkv9egxmIVpdv`, { headers }).then((r) => r.json());

for (const name of ['OpenRouter Analyze Image', 'OpenRouter Analyze Document']) {
  const node = wf.nodes.find((n) => n.name === name);
  const preparesBody = node?.parameters?.jsCode?.includes('_openRouterBody');
  console.log(`${name}: preparesBody=${preparesBody} hasOpenRouterCred=${!!node?.credentials?.openRouterApi}`);
}
for (const name of ['OpenRouter HTTP Image', 'OpenRouter HTTP Document']) {
  const node = wf.nodes.find((n) => n.name === name);
  const cred = node?.credentials?.openRouterApi;
  console.log(`${name}: type=${node?.type} cred=${cred ? `${cred.name} (${cred.id})` : 'MISSING'}`);
}
