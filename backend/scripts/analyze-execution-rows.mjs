import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const env = {};
for (const line of readFileSync(join(__dirname, '..', '..', '.env'), 'utf8').split(/\r?\n/)) {
  const m = line.match(/^([^#=]+)=(.*)$/);
  if (m) env[m[1].trim()] = m[2].trim();
}

const id = process.argv[2] || '85';
const base = env.N8N_BASE_URL.replace(/\/$/, '');
const headers = { 'X-N8N-API-KEY': env.N8N_API_KEY };

const d = await fetch(`${base}/api/v1/executions/${id}?includeData=true`, { headers }).then((r) =>
  r.json()
);
const wf = d.data?.resultData?.runData || {};

function items(nodeName, runIndex = -1) {
  const runs = wf[nodeName];
  if (!runs?.length) return [];
  const run = runs[runIndex < 0 ? runs.length - 1 : runIndex];
  return run?.data?.main?.[0] || [];
}

function truncate(s, n = 300) {
  const t = String(s ?? '');
  return t.length > n ? t.slice(0, n) + '…' : t;
}

console.log(`=== EXEC ${id} row-level extraction ===\n`);

for (const it of items('Parse Document Extraction')) {
  const j = it.json;
  console.log(`--- idx=${j._idx} ${j._fileName || ''} ---`);
  console.log('  status:', j._status);
  console.log('  payee:', j._extractedPayee || '(empty)');
  console.log('  acct:', j._extractedAcct || '(empty)');
  console.log('  ifsc:', j._extractedIfsc || '(empty)');
  console.log('  amount:', j._extractedAmount || '(empty)');
  console.log('  confidence:', j._confidence);
  console.log('  parseSource:', j._parseSource || '');
}

console.log('\n--- OpenRouter HTTP Document responses ---\n');
for (const it of items('OpenRouter HTTP Document')) {
  const prepIdx = it.json?._prepareIdx;
  const j = it.json;
  const err = j?.error?.message || j?.error;
  const text =
    j?.choices?.[0]?.message?.content ||
    j?.message?.content ||
    j?.text ||
    '';
  console.log(`idx=${prepIdx ?? '?'} http status in body error:`, err || '(none)');
  console.log('  model text:', truncate(text, 500));
  console.log('');
}

console.log('--- OpenRouter Analyze Document prepare ---\n');
for (const it of items('OpenRouter Analyze Document')) {
  const j = it.json;
  console.log(
    `idx=${j._prepareIdx ?? '?'} mime=${j._prepareMime || ''} mode=${j._prepareMode || '?'} error=${j.error || '(none)'} hasBody=${!!j._openRouterBody}`
  );
  if (j._openRouterBody?.messages?.[0]?.content) {
    const types = j._openRouterBody.messages[0].content.map((c) => c.type + (c.file?.filename ? ':' + c.file.filename : ''));
    console.log('  content parts:', types.join(', '));
  }
}

console.log('\n--- Parse Image Extraction ---\n');
for (const it of items('Parse Image Extraction')) {
  const j = it.json;
  console.log(`idx=${j._idx} status=${j._status} payee=${j._extractedPayee || ''} acct=${j._extractedAcct || ''}`);
}

console.log('\n--- Final output rows ---\n');
for (const it of items('Sort Rows By Index')) {
  console.log(JSON.stringify(it.json, null, 0));
}
