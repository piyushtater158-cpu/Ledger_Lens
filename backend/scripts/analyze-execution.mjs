import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const env = {};
for (const line of readFileSync(join(__dirname, '..', '..', '.env'), 'utf8').split(/\r?\n/)) {
  const m = line.match(/^([^#=]+)=(.*)$/);
  if (m) env[m[1].trim()] = m[2].trim();
}

const ids = process.argv.slice(2);
if (!ids.length) ids.push('82', '83');

const base = env.N8N_BASE_URL.replace(/\/$/, '');
const headers = { 'X-N8N-API-KEY': env.N8N_API_KEY };

function itemCount(run) {
  return run?.data?.main?.[0]?.length ?? 0;
}

function branchCounts(run) {
  const main = run?.data?.main || [];
  return { true: main[0]?.length ?? 0, false: main[1]?.length ?? 0 };
}

for (const id of ids) {
  const d = await fetch(`${base}/api/v1/executions/${id}?includeData=true`, { headers }).then((r) =>
    r.json()
  );
  if (d.message) {
    console.error(`EXEC ${id} API error:`, d.message);
    continue;
  }

  const wf = d.data?.resultData?.runData || {};
  console.log(`\n=== EXEC ${id} ===`);
  console.log('status:', d.status, 'finished:', d.finished, 'stoppedAt:', d.stoppedAt || 'running');
  console.log('lastNodeExecuted:', d.data?.resultData?.lastNodeExecuted);
  console.log('error:', JSON.stringify(d.data?.resultData?.error || null));

  const detect = wf['Detect Columns & Add Token']?.[0];
  const detectItems = detect?.data?.main?.[0] || [];
  console.log('\nDetect Columns items:', detectItems.length);
  for (const it of detectItems) {
    const j = it.json;
    console.log(
      `  idx=${j._idx} class=? mime=? link=${String(j._driveLink || '').slice(0, 70)} payee=${j._payee || ''}`
    );
  }

  const classify = wf['Classify MimeType']?.[0];
  const classifyItems = classify?.data?.main?.[0] || [];
  console.log('\nClassify MimeType items:', classifyItems.length);
  for (const it of classifyItems) {
    const j = it.json;
    console.log(
      `  idx=${j._idx} mime=${j._mimeType || ''} class=${j._fileClass || ''} status=${j._status || ''} name=${j._fileName || ''}`
    );
  }

  const isExtract = wf['Is Extractable?']?.[0];
  const extBranches = branchCounts(isExtract);
  console.log('\nIs Extractable? true=', extBranches.true, 'false=', extBranches.false);

  const isImg = wf['Is Image File?']?.[0];
  const imgBranches = branchCounts(isImg);
  console.log('Is Image File? true(image)=', imgBranches.true, 'false(document)=', imgBranches.false);
  const docBranchItems = isImg?.data?.main?.[1] || [];
  const imgBranchItems = isImg?.data?.main?.[0] || [];
  console.log('  image branch idx:', imgBranchItems.map((it) => it.json._idx).join(', ') || '(none)');
  console.log('  document branch idx:', docBranchItems.map((it) => it.json._idx).join(', ') || '(none)');
  console.log(
    '  document branch with binary:',
    docBranchItems.filter((it) => it.binary?.invoiceFile).length,
    '/',
    docBranchItems.length
  );

  const restore = wf['Restore Row After Download']?.[0];
  const restoreItems = restore?.data?.main?.[0] || [];
  console.log('\nRestore Row items:', restoreItems.length);
  for (const it of restoreItems) {
    const j = it.json;
    console.log(
      `  idx=${j._idx} downloadFailed=${!!j._downloadFailed} converted=${!!j._convertedFromOffice} officeTextLen=${(j._officeDocText || '').length} status=${j._status || ''}`
    );
  }

  for (const name of [
    'OpenRouter Analyze Image',
    'OpenRouter Analyze Document',
    'OpenRouter HTTP Image',
    'OpenRouter HTTP Document',
    'Parse Image Extraction',
    'Parse Document Extraction',
    'Merge Extraction Results',
    'Merge All Rows',
    'Sort Rows By Index',
  ]) {
    const runs = wf[name];
    if (!runs?.length) {
      console.log(`${name}: (not reached)`);
      continue;
    }
    const last = runs[runs.length - 1];
    console.log(
      `${name}: ${runs.length} run(s), lastStatus=${last.executionStatus}, items=${itemCount(last)}, timeMs=${last.executionTime}`
    );
    if (/OpenRouter Analyze/.test(name)) {
      const j = last?.data?.main?.[0]?.[0]?.json;
      if (j?.error) console.log('  prepare error:', j.error);
      if (j?._openRouterBody) console.log('  has body: yes, mime hint in content types');
    }
    if (/OpenRouter HTTP/.test(name)) {
      const j = last?.data?.main?.[0]?.[0]?.json;
      const err = last?.error || j?.error;
      if (err) console.log('  http error:', JSON.stringify(err).slice(0, 200));
    }
  }
}
