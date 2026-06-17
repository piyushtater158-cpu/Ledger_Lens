/**
 * Sync node .js sources into workflow JSON and deploy to live n8n.
 * Usage: node backend/scripts/sync-and-deploy-workflows.mjs
 *        node backend/scripts/sync-and-deploy-workflows.mjs --local-only
 *        node backend/scripts/sync-and-deploy-workflows.mjs --gmail-extract-only
 */
import { readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const workflowsDir = join(root, 'workflows');
const nodesDir = join(root, 'src', 'nodes');

const OPENROUTER_MODEL = 'google/gemini-2.5-flash';
const EXTRACTABLE_CONDITION =
  '={{ $json._fileClass === "document" || $json._fileClass === "image" }}';
const OPENROUTER_CREDENTIAL_TYPE = 'openRouterApi';
const OPENROUTER_CREDENTIAL_PREFERRED_NAMES = [
  'OpenRouterCredentialsSaved',
  'OpenRouter account',
];
const DEFAULT_OPENROUTER_CREDENTIAL = {
  openRouterApi: { id: 'bDCaYQ5pU52IShxl', name: 'OpenRouter account' },
};

const GEMINI_NODE_NAMES = new Set([
  'Gemini Analyze Image',
  'Gemini Analyze Document',
]);
const OPENROUTER_NODE_NAMES = new Set([
  'OpenRouter Analyze Image',
  'OpenRouter Analyze Document',
]);
const OPENROUTER_HTTP_NODE_NAMES = new Set([
  'OpenRouter HTTP Image',
  'OpenRouter HTTP Document',
]);
const ANALYZE_NODE_NAMES = new Set([...GEMINI_NODE_NAMES, ...OPENROUTER_NODE_NAMES]);

const OPENROUTER_HTTP_PAIRS = [
  ['OpenRouter Analyze Image', 'OpenRouter HTTP Image', 'Parse Image Extraction'],
  ['OpenRouter Analyze Document', 'OpenRouter HTTP Document', 'Parse Document Extraction'],
];

const OPENROUTER_HTTP_NODE_IDS = {
  'OpenRouter HTTP Image': 'a1b2c3d4-openrouter-http-image-0001',
  'OpenRouter HTTP Document': 'a1b2c3d4-openrouter-http-doc-0001',
};

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

function toN8nJs(src) {
  return '\n' + stripNodeComments(src) + '\n';
}

function readNode(name) {
  return toN8nJs(readFileSync(join(nodesDir, name), 'utf8'));
}

function readParseNode(name) {
  const helpers = stripNodeComments(readFileSync(join(nodesDir, 'extractionHelpers.js'), 'utf8'));
  const body = stripNodeComments(readFileSync(join(nodesDir, name), 'utf8'));
  return toN8nJs(helpers + '\n\n' + body);
}

function renameConnectionKey(connections, oldName, newName) {
  if (!connections[oldName]) return;
  connections[newName] = connections[oldName];
  delete connections[oldName];
  for (const key of Object.keys(connections)) {
    for (const outputs of connections[key].main || []) {
      for (const edge of outputs) {
        if (edge.node === oldName) edge.node = newName;
      }
    }
  }
}

const OPENROUTER_HTTP_RESILIENCE = {
  onError: 'continueRegularOutput',
  retryOnFail: true,
  maxTries: 5,
  waitBetweenTries: 15000,
};

function stripOpenRouterRetrySettings(node) {
  if (!OPENROUTER_NODE_NAMES.has(node.name)) return;
  delete node.onError;
  delete node.retryOnFail;
  delete node.maxTries;
  delete node.waitBetweenTries;
}

function applyOpenRouterHttpResilience(node) {
  if (!OPENROUTER_HTTP_NODE_NAMES.has(node.name)) return;
  Object.assign(node, OPENROUTER_HTTP_RESILIENCE);
}

function migrateAnalyzeNode(node, openRouterJs) {
  if (!ANALYZE_NODE_NAMES.has(node.name)) return;

  const newName = node.name.replace(/^Gemini /, 'OpenRouter ');
  node.name = newName;
  node.type = 'n8n-nodes-base.code';
  node.typeVersion = 2;
  stripOpenRouterRetrySettings(node);
  node.parameters = {
    mode: 'runOnceForEachItem',
    jsCode: openRouterJs,
  };
  delete node.credentials?.googlePalmApi;
  // Prepare step only — auth lives on the HTTP Request node.
  delete node.credentials?.openRouterApi;
}

function createOpenRouterHttpNode(name, analyzeNode, openRouterCredential) {
  const yOffset = name.includes('Document') ? 192 : 0;
  return {
    id: OPENROUTER_HTTP_NODE_IDS[name],
    name,
    type: 'n8n-nodes-base.httpRequest',
    typeVersion: 4.2,
    position: [
      (analyzeNode?.position?.[0] ?? 2688) + 112,
      analyzeNode?.position?.[1] ?? yOffset,
    ],
    parameters: {
      method: 'POST',
      url: 'https://openrouter.ai/api/v1/chat/completions',
      authentication: 'predefinedCredentialType',
      nodeCredentialType: 'openRouterApi',
      sendHeaders: true,
      headerParameters: {
        parameters: [
          { name: 'HTTP-Referer', value: 'https://ledgerlens.app' },
          { name: 'X-Title', value: 'LedgerLens Invoice Extraction' },
        ],
      },
      sendBody: true,
      specifyBody: 'json',
      jsonBody: '={{ $json._openRouterBody ? JSON.stringify($json._openRouterBody) : JSON.stringify({ error: $json.error || "Missing OpenRouter request body" }) }}',
      options: { timeout: 120000 },
    },
    credentials: openRouterCredential || DEFAULT_OPENROUTER_CREDENTIAL,
    ...OPENROUTER_HTTP_RESILIENCE,
  };
}

function ensureOpenRouterHttpNodes(nodes, openRouterCredential) {
  for (const [analyzeName, httpName] of OPENROUTER_HTTP_PAIRS.map((p) => [p[0], p[1]])) {
    const analyzeNode = nodes.find((n) => n.name === analyzeName);
    const existing = nodes.find((n) => n.name === httpName);
    const httpNode = createOpenRouterHttpNode(httpName, analyzeNode, openRouterCredential);
    if (existing) {
      Object.assign(existing, httpNode, { id: existing.id || httpNode.id });
      if (openRouterCredential) existing.credentials = openRouterCredential;
      applyOpenRouterHttpResilience(existing);
    } else {
      nodes.push(httpNode);
    }
  }
}

function resolveParseNodeName(nodes, kind) {
  const candidates =
    kind === 'image'
      ? ['Parse Image Extraction', 'Parse Image Result']
      : ['Parse Document Extraction', 'Parse Document Result'];
  for (const name of candidates) {
    if (nodes.some((n) => n.name === name)) return name;
  }
  return candidates[0];
}

function rewireOpenRouterHttpConnections(connections, nodes) {
  const imageParse = resolveParseNodeName(nodes, 'image');
  const docParse = resolveParseNodeName(nodes, 'document');
  connections['OpenRouter Analyze Image'] = {
    main: [[{ node: 'OpenRouter HTTP Image', type: 'main', index: 0 }]],
  };
  connections['OpenRouter Analyze Document'] = {
    main: [[{ node: 'OpenRouter HTTP Document', type: 'main', index: 0 }]],
  };
  connections['OpenRouter HTTP Image'] = {
    main: [[{ node: imageParse, type: 'main', index: 0 }]],
  };
  connections['OpenRouter HTTP Document'] = {
    main: [[{ node: docParse, type: 'main', index: 0 }]],
  };
}

function migrateConnections(connections) {
  renameConnectionKey(connections, 'Gemini Analyze Image', 'OpenRouter Analyze Image');
  renameConnectionKey(connections, 'Gemini Analyze Document', 'OpenRouter Analyze Document');
  renameConnectionKey(connections, 'Merge Gemini Results', 'Merge Extraction Results');
}

function patchWorkflow(wf, opts) {
  const {
    classifyJs,
    classifyGmailJs,
    parseJs,
    detectColumnsJs,
    rebuildFinalRowJs,
    restoreRowJs,
    openRouterJs,
  } = opts;
  const connections = { ...wf.connections };

  for (const node of wf.nodes) {
    migrateAnalyzeNode(node, openRouterJs);

    if (node.name === 'Merge Gemini Results') {
      node.name = 'Merge Extraction Results';
    }

    if (node.name === 'Detect Columns & Add Token' && detectColumnsJs) {
      node.parameters.jsCode = detectColumnsJs;
    }
    if (node.name === 'Rebuild Final Row' && rebuildFinalRowJs) {
      node.parameters.jsCode = rebuildFinalRowJs;
    }
    if (node.name === 'Classify MimeType') {
      node.parameters.jsCode = classifyJs;
    }
    if (node.name === 'Classify Invoice Attachment' && classifyGmailJs) {
      node.parameters.jsCode = classifyGmailJs;
    }
    if (node.name === 'Restore Row After Download' && restoreRowJs) {
      node.parameters.jsCode = restoreRowJs;
    }
    if (node.name === 'Download Invoice File') {
      node.parameters.url = '={{ $json._downloadUrl }}';
    }
    if (
      node.name === 'Is PDF or Image?' ||
      node.name === 'Is Extractable?'
    ) {
      node.name = 'Is Extractable?';
      node.parameters.conditions.conditions[0].leftValue = EXTRACTABLE_CONDITION;
    }
    if (OPENROUTER_NODE_NAMES.has(node.name) && openRouterJs) {
      node.parameters.jsCode = openRouterJs;
      delete node.credentials?.openRouterApi;
      stripOpenRouterRetrySettings(node);
    }
    if (OPENROUTER_HTTP_NODE_NAMES.has(node.name)) {
      applyOpenRouterHttpResilience(node);
    }
    if (
      node.name === 'Parse Image Extraction' ||
      node.name === 'Parse Document Extraction' ||
      node.name === 'Parse Image Result' ||
      node.name === 'Parse Document Result'
    ) {
      node.parameters.jsCode = parseJs;
    }
    if (node.name === 'Respond Unsupported' && node.type === 'n8n-nodes-base.respondToWebhook') {
      node.parameters.responseBody =
        '={{ JSON.stringify({ payee: "", accountNumber: "", ifsc: "", amount: "", currency: "", confidence: 0, status: $json._status || "unsupported" }) }}';
    }
  }

  renameConnectionKey(connections, 'Is PDF or Image?', 'Is Extractable?');
  migrateConnections(connections);
  ensureOpenRouterHttpNodes(wf.nodes, DEFAULT_OPENROUTER_CREDENTIAL);
  rewireOpenRouterHttpConnections(connections, wf.nodes);
  wf.connections = connections;

  if (wf.description) {
    wf.description = wf.description
      .replace(/Gemini 2\.5 Flash/gi, `OpenRouter ${OPENROUTER_MODEL}`)
      .replace(/OpenRouter\s+[\w/.:-]+/gi, `OpenRouter ${OPENROUTER_MODEL}`)
      .replace(/via Gemini/gi, 'via OpenRouter');
  }

  return wf;
}

async function fetchCredentialsList(env) {
  try {
    const res = await fetch(`${env.N8N_BASE_URL}/api/v1/credentials`, {
      headers: { 'X-N8N-API-KEY': env.N8N_API_KEY },
    });
    if (!res.ok) return [];
    const contentType = res.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) return [];
    const data = await res.json();
    return data.data || [];
  } catch {
    return [];
  }
}

async function resolveOpenRouterCredential(env, liveNodes) {
  if (env.OPENROUTER_CREDENTIAL_ID) {
    return {
      openRouterApi: {
        id: env.OPENROUTER_CREDENTIAL_ID,
        name: env.OPENROUTER_CREDENTIAL_NAME || 'OpenRouter account',
      },
    };
  }

  for (const node of liveNodes || []) {
    if (OPENROUTER_NODE_NAMES.has(node.name) && node.credentials?.openRouterApi) {
      return { openRouterApi: node.credentials.openRouterApi };
    }
  }

  for (const node of liveNodes || []) {
    if (node.credentials?.openRouterApi) {
      return { openRouterApi: node.credentials.openRouterApi };
    }
  }

  const creds = await fetchCredentialsList(env);
  for (const preferredName of OPENROUTER_CREDENTIAL_PREFERRED_NAMES) {
    const match = creds.find(
      (c) => c.type === OPENROUTER_CREDENTIAL_TYPE && c.name === preferredName,
    );
    if (match) {
      console.log(`Auto-linked OpenRouter credential: ${match.name} (${match.id})`);
      return { openRouterApi: { id: match.id, name: match.name } };
    }
  }

  const openRouter = creds.find((c) => c.type === OPENROUTER_CREDENTIAL_TYPE);
  if (openRouter) {
    console.log(`Auto-linked OpenRouter credential: ${openRouter.name} (${openRouter.id})`);
    return { openRouterApi: { id: openRouter.id, name: openRouter.name } };
  }

  console.log(`Using default OpenRouter credential: ${DEFAULT_OPENROUTER_CREDENTIAL.openRouterApi.name}`);
  return DEFAULT_OPENROUTER_CREDENTIAL;
}

const KNOWN_CREDENTIALS = {
  'Receive File Upload': {
    httpHeaderAuth: { id: 'REIlq9U7MYnIUAey', name: 'Admin Token' },
  },
  'Receive Row Re-run': {
    httpHeaderAuth: { id: 'REIlq9U7MYnIUAey', name: 'Admin Token' },
  },
};

function ensureCredentials(node, openRouterCredential) {
  const known = KNOWN_CREDENTIALS[node.name];
  if (known) {
    node.credentials = { ...(node.credentials || {}), ...known };
  }

  if (OPENROUTER_HTTP_NODE_NAMES.has(node.name) && openRouterCredential) {
    node.credentials = {
      ...(node.credentials || {}),
      ...openRouterCredential,
    };
  }
}

function normalizeLiveNodes(liveNodes, openRouterJs) {
  for (const node of liveNodes) {
    migrateAnalyzeNode(node, openRouterJs);
    if (node.name === 'Merge Gemini Results') {
      node.name = 'Merge Extraction Results';
    }
  }
}

function mergePatchesOntoLive(live, patched, openRouterCredential) {
  const openRouterJs =
    patched.nodes.find((n) => n.name === 'OpenRouter Analyze Image')?.parameters?.jsCode || '';
  normalizeLiveNodes(live.nodes, openRouterJs);

  const patchByName = new Map(patched.nodes.map((n) => [n.name, n]));
  const legacyAnalyzeNames = new Map([
    ['Gemini Analyze Image', 'OpenRouter Analyze Image'],
    ['Gemini Analyze Document', 'OpenRouter Analyze Document'],
  ]);
  const ifNodeNames = new Set(['Is PDF or Image?', 'Is Extractable?']);

  for (const node of live.nodes) {
    const patch =
      patchByName.get(node.name) ||
      patchByName.get(legacyAnalyzeNames.get(node.name)) ||
      (ifNodeNames.has(node.name) ? patchByName.get('Is Extractable?') : undefined);

    if (!patch) {
      ensureCredentials(node, openRouterCredential);
      continue;
    }

    if (patch.name === 'Detect Columns & Add Token') {
      node.parameters.jsCode = patch.parameters.jsCode;
    }
    if (patch.name === 'Rebuild Final Row') {
      node.parameters.jsCode = patch.parameters.jsCode;
    }
    if (patch.name === 'Classify MimeType') {
      node.parameters.jsCode = patch.parameters.jsCode;
    }
    if (patch.name === 'Restore Row After Download') {
      node.parameters.jsCode = patch.parameters.jsCode;
    }
    if (patch.name === 'Download Invoice File') {
      node.parameters.url = patch.parameters.url;
    }
    if (ifNodeNames.has(node.name) || ifNodeNames.has(patch.name)) {
      node.name = 'Is Extractable?';
      node.parameters.conditions = patch.parameters.conditions;
    }

    if (
      OPENROUTER_NODE_NAMES.has(patch.name) ||
      GEMINI_NODE_NAMES.has(node.name)
    ) {
      node.name = patch.name;
      node.type = patch.type;
      node.typeVersion = patch.typeVersion;
      node.parameters = patch.parameters;
      stripOpenRouterRetrySettings(node);
      delete node.credentials?.googlePalmApi;
    }

    if (OPENROUTER_HTTP_NODE_NAMES.has(node.name)) {
      applyOpenRouterHttpResilience(node);
    }

    if (patch.name === 'Merge Extraction Results' && node.name === 'Merge Gemini Results') {
      node.name = 'Merge Extraction Results';
    }
    if (node.name === 'Merge Gemini Results') {
      node.name = 'Merge Extraction Results';
    }

    if (
      patch.name === 'Parse Image Extraction' ||
      patch.name === 'Parse Document Extraction' ||
      patch.name === 'Parse Image Result' ||
      patch.name === 'Parse Document Result'
    ) {
      node.parameters.jsCode = patch.parameters.jsCode;
    }

    ensureCredentials(node, openRouterCredential);
  }

  const connections = { ...live.connections };
  renameConnectionKey(connections, 'Is PDF or Image?', 'Is Extractable?');
  migrateConnections(connections);
  ensureOpenRouterHttpNodes(live.nodes, openRouterCredential);
  rewireOpenRouterHttpConnections(connections, live.nodes);
  live.connections = connections;
  return live;
}

async function fetchWorkflow(env, id) {
  const base = env.N8N_BASE_URL.replace(/\/$/, '');
  const res = await fetch(`${base}/api/v1/workflows/${id}`, {
    headers: { 'X-N8N-API-KEY': env.N8N_API_KEY },
  });
  const body = await res.text();
  if (!res.ok) throw new Error(`Fetch ${id} failed ${res.status}: ${body}`);
  return JSON.parse(body);
}

async function deployWorkflow(env, patched, openRouterCredential) {
  const base = env.N8N_BASE_URL.replace(/\/$/, '');
  const id = patched.id;
  const live = await fetchWorkflow(env, id);
  const merged = mergePatchesOntoLive(live, patched, openRouterCredential);
  const payload = {
    name: merged.name,
    nodes: merged.nodes,
    connections: merged.connections,
    settings: merged.settings || { executionOrder: 'v1' },
  };
  if (patched.description) {
    payload.description = patched.description;
  }

  const res = await fetch(`${base}/api/v1/workflows/${id}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'X-N8N-API-KEY': env.N8N_API_KEY,
    },
    body: JSON.stringify(payload),
  });

  const body = await res.text();
  if (!res.ok) {
    throw new Error(`Deploy ${id} failed ${res.status}: ${body}`);
  }
  console.log(`Deployed workflow ${id} (${merged.name})`);
}

function assertNoSecrets(wf) {
  const serialized = JSON.stringify(wf);
  const suspicious = [
    /sk-or-v1-[A-Za-z0-9]+/,
    /Bearer eyJ[A-Za-z0-9._-]+/,
    /"apiKey"\s*:\s*"[^"]+"/,
  ];
  for (const pattern of suspicious) {
    if (pattern.test(serialized)) {
      throw new Error(`Workflow export appears to contain a secret matching ${pattern}`);
    }
  }
}

async function main() {
  const onlyB = process.argv.includes('--workflow-b-only');
  const onlyGmailExtract = process.argv.includes('--gmail-extract-only');
  const localOnly = process.argv.includes('--local-only');
  const env = localOnly ? {} : loadEnv();
  if (!localOnly && (!env.N8N_API_KEY || !env.N8N_BASE_URL)) {
    throw new Error('Missing N8N_API_KEY or N8N_BASE_URL in .env');
  }

  const classifyA = readNode('classifyMimeType.js');
  const classifyB = readNode('classifyMimeType-workflow-b.js');
  const classifyGmail = readNode('classifyInvoiceAttachment.js');
  const parseA = readParseNode('parseGeminiExtraction.js');
  const parseB = readParseNode('parseRowResult.js');
  const detectColumnsJs = readNode('detectColumns.js');
  const rebuildFinalRowJs = readNode('rebuildFinalRow.js');
  const restoreRowJs = readNode('restoreRowAfterDownload.js');
  const openRouterJs = readNode('prepareOpenRouterPayload.js');

  const workflowAPath = join(workflowsDir, 'invoice-extraction.workflow.json');
  const workflowBPath = join(workflowsDir, 'invoice-extract-row.workflow.json');
  const workflowDPath = join(workflowsDir, 'gmail-extract.workflow.json');

  const wfA = patchWorkflow(JSON.parse(readFileSync(workflowAPath, 'utf8')), {
    classifyJs: classifyA,
    parseJs: parseA,
    detectColumnsJs,
    rebuildFinalRowJs,
    restoreRowJs,
    openRouterJs,
  });
  const wfB = patchWorkflow(JSON.parse(readFileSync(workflowBPath, 'utf8')), {
    classifyJs: classifyB,
    parseJs: parseB,
    restoreRowJs,
    openRouterJs,
  });
  const wfD = patchWorkflow(JSON.parse(readFileSync(workflowDPath, 'utf8')), {
    classifyGmailJs: classifyGmail,
    parseJs: parseB,
    openRouterJs,
  });

  assertNoSecrets(wfA);
  assertNoSecrets(wfB);
  assertNoSecrets(wfD);

  writeFileSync(workflowAPath, JSON.stringify(wfA, null, 2) + '\n');
  writeFileSync(workflowBPath, JSON.stringify(wfB, null, 2) + '\n');
  writeFileSync(workflowDPath, JSON.stringify(wfD, null, 2) + '\n');
  console.log('Updated local workflow JSON files');

  if (localOnly) {
    console.log('Skipping deploy (--local-only)');
    return;
  }

  const liveA = await fetchWorkflow(env, wfA.id);
  const liveB = await fetchWorkflow(env, wfB.id);
  const liveD = onlyGmailExtract ? await fetchWorkflow(env, wfD.id) : null;
  const openRouterCredential = await resolveOpenRouterCredential(env, [
    ...liveA.nodes,
    ...liveB.nodes,
    ...(liveD?.nodes || []),
  ]);

  if (!openRouterCredential) {
    console.warn(
      'Warning: No OpenRouter openRouterApi credential found. Assign OpenRouter credential to analyze nodes in n8n UI, or set OPENROUTER_CREDENTIAL_ID in .env',
    );
  }

  if (onlyGmailExtract) {
    await deployWorkflow(env, wfD, openRouterCredential);
    return;
  }

  if (onlyB) {
    await deployWorkflow(env, wfB, openRouterCredential);
    return;
  }

  await deployWorkflow(env, wfA, openRouterCredential);
  await deployWorkflow(env, wfB, openRouterCredential);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
