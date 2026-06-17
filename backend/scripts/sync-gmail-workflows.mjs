/**
 * Sync V2 Gmail workflow node scripts to local JSON and live n8n (C + D only).
 * Usage: node backend/scripts/sync-gmail-workflows.mjs
 */
import { readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const nodesDir = join(root, 'src', 'nodes');
const workflowsDir = join(root, 'workflows');

const WORKFLOW_C_ID = 'DKeKAKn620xgkpQZ';
const WORKFLOW_D_ID = 'njpNl9MZDkFvu7eF';

function loadEnv() {
  const envPath = join(root, '..', '.env');
  const text = readFileSync(envPath, 'utf8');
  const env = {};
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m) env[m[1].trim()] = m[2].trim();
  }
  return env;
}

function stripNodeComments(src) {
  return src.replace(/^\/\*\*[\s\S]*?\*\/\s*/m, '').trim();
}

function readNode(name) {
  return '\n' + stripNodeComments(readFileSync(join(nodesDir, name), 'utf8')) + '\n';
}

function readParseNode(name) {
  const helpers = stripNodeComments(readFileSync(join(nodesDir, 'extractionHelpers.js'), 'utf8'));
  const body = stripNodeComments(readFileSync(join(nodesDir, name), 'utf8'));
  return '\n' + helpers + '\n\n' + body + '\n';
}

function patchWorkflowC(wf) {
  for (const node of wf.nodes) {
    if (node.name === 'Parse Attachments') {
      node.parameters.jsCode = readNode('parseAttachments.js');
    }
    if (node.name === 'Parse Discover Body') {
      node.parameters.jsCode = readNode('parseDiscoverBody.js');
    }
    if (node.name === 'Receive Gmail Discover') {
      node.credentials = {
        httpHeaderAuth: { id: 'REIlq9U7MYnIUAey', name: 'Admin Token' },
      };
    }
  }
  return wf;
}

function ensureClassifyNode(nodes) {
  const restore = nodes.find((n) => n.name === 'Restore Row After Download');
  const existing = nodes.find((n) => n.name === 'Classify Invoice Attachment');
  const classifyNode = {
    id: existing?.id || 'classify-invoice-attachment-v2',
    name: 'Classify Invoice Attachment',
    type: 'n8n-nodes-base.code',
    typeVersion: 2,
    position: [(restore?.position?.[0] ?? 700) + 120, restore?.position?.[1] ?? 220],
    parameters: {
      mode: 'runOnceForEachItem',
      jsCode: readNode('classifyInvoiceAttachment.js'),
    },
  };
  if (existing) Object.assign(existing, classifyNode, { id: existing.id });
  else nodes.push(classifyNode);
}

function patchWorkflowD(wf) {
  ensureClassifyNode(wf.nodes);
  const openRouterJs = readNode('prepareOpenRouterPayload.js');
  const parseJs = readParseNode('parseRowResult.js');

  for (const node of wf.nodes) {
    if (node.name === 'Parse Extract Body') {
      node.parameters.jsCode = readNode('parseExtractBody.js');
    }
    if (node.name === 'Restore Row After Download') {
      node.parameters.jsCode = readNode('gmailAttachmentToInvoiceFile.js');
    }
    if (node.name === 'Classify Invoice Attachment') {
      node.parameters.jsCode = readNode('classifyInvoiceAttachment.js');
    }
    if (node.name === 'OpenRouter Analyze Image' || node.name === 'OpenRouter Analyze Document') {
      node.parameters.jsCode = openRouterJs;
    }
    if (node.name === 'Parse Image Result' || node.name === 'Parse Document Result') {
      node.parameters.jsCode = parseJs;
    }
    if (node.name === 'Is Extractable?') {
      node.parameters.conditions.conditions[0].leftValue =
        '={{ $json._isPaymentInvoice === true && ($json._fileClass === "document" || $json._fileClass === "image") }}';
    }
    if (node.name === 'Receive Gmail Extract') {
      node.credentials = {
        httpHeaderAuth: { id: 'REIlq9U7MYnIUAey', name: 'Admin Token' },
      };
    }
  }

  wf.connections['Restore Row After Download'] = {
    main: [[{ node: 'Classify Invoice Attachment', type: 'main', index: 0 }]],
  };
  wf.connections['Classify Invoice Attachment'] = {
    main: [[{ node: 'Is Extractable?', type: 'main', index: 0 }]],
  };

  return wf;
}

async function deployWorkflow(env, wf) {
  const base = env.N8N_BASE_URL.replace(/\/$/, '');
  const payload = {
    name: wf.name,
    nodes: wf.nodes,
    connections: wf.connections,
    settings: wf.settings || { executionOrder: 'v1' },
  };
  const res = await fetch(`${base}/api/v1/workflows/${wf.id}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'X-N8N-API-KEY': env.N8N_API_KEY,
    },
    body: JSON.stringify(payload),
  });
  const body = await res.text();
  if (!res.ok) throw new Error(`Deploy ${wf.id} failed ${res.status}: ${body}`);
  console.log(`Deployed workflow ${wf.id} (${wf.name})`);
}

async function main() {
  const env = loadEnv();
  if (!env.N8N_API_KEY || !env.N8N_BASE_URL) {
    throw new Error('Missing N8N_API_KEY or N8N_BASE_URL in .env');
  }

  const wfCPath = join(workflowsDir, 'gmail-discover.workflow.json');
  const wfDPath = join(workflowsDir, 'gmail-extract.workflow.json');

  const wfC = patchWorkflowC(JSON.parse(readFileSync(wfCPath, 'utf8')));
  const wfD = patchWorkflowD(JSON.parse(readFileSync(wfDPath, 'utf8')));
  wfC.id = WORKFLOW_C_ID;
  wfD.id = WORKFLOW_D_ID;

  writeFileSync(wfCPath, JSON.stringify(wfC, null, 2) + '\n');
  writeFileSync(wfDPath, JSON.stringify(wfD, null, 2) + '\n');
  console.log('Updated local gmail workflow JSON files');

  await deployWorkflow(env, wfC);
  await deployWorkflow(env, wfD);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
