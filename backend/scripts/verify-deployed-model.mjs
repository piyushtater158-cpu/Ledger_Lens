import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const EXPECTED_MODEL = 'google/gemini-2.5-flash';
const WORKFLOWS = [
  { id: 'vqSkkv9egxmIVpdv', label: 'Workflow A' },
  { id: 'LmdFhorOYBoJgXGl', label: 'Workflow B' },
];

const __dirname = dirname(fileURLToPath(import.meta.url));
const env = {};
for (const line of readFileSync(join(__dirname, '..', '..', '.env'), 'utf8').split(/\r?\n/)) {
  const m = line.match(/^([^#=]+)=(.*)$/);
  if (m) env[m[1].trim()] = m[2].trim();
}

const base = env.N8N_BASE_URL.replace(/\/$/, '');
const headers = { 'X-N8N-API-KEY': env.N8N_API_KEY };

let ok = true;

for (const { id, label } of WORKFLOWS) {
  const wf = await fetch(`${base}/api/v1/workflows/${id}`, { headers }).then((r) => r.json());
  console.log(`\n${label} — ${wf.name} (${id})`);
  console.log(`  active: ${wf.active}`);
  console.log(`  description includes Gemma: ${wf.description?.includes(EXPECTED_MODEL) ?? false}`);

  for (const name of ['OpenRouter Analyze Image', 'OpenRouter Analyze Document']) {
    const node = wf.nodes.find((n) => n.name === name);
    const code = node?.parameters?.jsCode || '';
    const modelMatch = code.match(/OPENROUTER_MODEL = '([^']+)'/);
    const model = modelMatch?.[1] || 'MISSING';
    const reasoningNone = code.includes("reasoning: { effort: 'none' }");
    const modelOk = model === EXPECTED_MODEL;
    if (!modelOk) ok = false;
    console.log(`  ${name}: model=${model} reasoning_none=${reasoningNone} ${modelOk ? 'OK' : 'MISMATCH'}`);
  }
}

if (!ok) {
  console.error('\nVerification failed: live workflow model does not match expected.');
  process.exit(1);
}

console.log('\nAll live workflows verified.');
