import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getN8nAdminToken, N8N_ADMIN_TOKEN_SETUP_HINT } from '@/lib/n8n-config';

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  // #region agent log
  fetch('http://127.0.0.1:7278/ingest/2c22404a-379e-4acd-837f-babf35680249',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'6dd146'},body:JSON.stringify({sessionId:'6dd146',location:'extract/route.ts:entry',message:'extract POST entry',data:{hasSession:!!session,hasAccessToken:!!session?.accessToken,adminTokenSet:!!process.env.N8N_ADMIN_TOKEN,n8nBaseUrl:process.env.N8N_BASE_URL??null},timestamp:Date.now(),hypothesisId:'H5',runId:'exec69-debug'})}).catch(()=>{});
  // #endregion
  if (session?.error === 'RefreshAccessTokenError') {
    return NextResponse.json({ error: 'Google session expired — sign in again' }, { status: 401 });
  }
  if (!session?.accessToken) {
    return NextResponse.json({ error: 'Unauthorized — sign in first' }, { status: 401 });
  }

  const adminToken = getN8nAdminToken();
  if (!adminToken) {
    return NextResponse.json({ error: N8N_ADMIN_TOKEN_SETUP_HINT }, { status: 503 });
  }

  const incoming = await request.formData();
  const file = incoming.get('file') as File | null;
  if (!file) {
    return NextResponse.json({ error: 'No file provided' }, { status: 400 });
  }

  const n8nForm = new FormData();
  n8nForm.append('file', file);
  n8nForm.append('googleAccessToken', session.accessToken);
  // #region agent log
  fetch('http://127.0.0.1:7278/ingest/2c22404a-379e-4acd-837f-babf35680249',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'6dd146'},body:JSON.stringify({sessionId:'6dd146',location:'extract/route.ts:request-file',message:'Forwarding file to n8n',data:{fileName:file.name,fileSize:file.size,fileType:file.type||''},timestamp:Date.now(),hypothesisId:'H5',runId:'exec69-debug'})}).catch(()=>{});
  // #endregion

  const n8nUrl = `${process.env.N8N_BASE_URL?.replace(/\/$/, '')}/webhook/extract`;

  let n8nRes: Response;
  try {
    n8nRes = await fetch(n8nUrl, {
      method: 'POST',
      headers: { 'X-Admin-Token': adminToken },
      body: n8nForm,
    });
  } catch (err) {
    // #region agent log
    fetch('http://127.0.0.1:7278/ingest/2c22404a-379e-4acd-837f-babf35680249',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'6dd146'},body:JSON.stringify({sessionId:'6dd146',location:'extract/route.ts:fetch-error',message:'n8n fetch threw',data:{n8nUrl,errorType:err instanceof Error?err.name:'unknown'},timestamp:Date.now(),hypothesisId:'H5',runId:'exec69-debug'})}).catch(()=>{});
    // #endregion
    return NextResponse.json(
      { error: 'Cannot reach n8n — check N8N_BASE_URL' },
      { status: 503 }
    );
  }

  if (!n8nRes.ok) {
    const text = await n8nRes.text().catch(() => 'Unknown error');
    // #region agent log
    fetch('http://127.0.0.1:7278/ingest/2c22404a-379e-4acd-837f-babf35680249',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'6dd146'},body:JSON.stringify({sessionId:'6dd146',location:'extract/route.ts:n8n-error',message:'n8n returned error',data:{n8nStatus:n8nRes.status,n8nErrorPreview:text.slice(0,120),n8nUrl},timestamp:Date.now(),hypothesisId:'H5',runId:'exec69-debug'})}).catch(()=>{});
    // #endregion
    return NextResponse.json({ error: text }, { status: n8nRes.status });
  }

  const blob = await n8nRes.blob();
  // #region agent log
  fetch('http://127.0.0.1:7278/ingest/2c22404a-379e-4acd-837f-babf35680249',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'6dd146'},body:JSON.stringify({sessionId:'6dd146',location:'extract/route.ts:response-ok',message:'Received xlsx from n8n',data:{status:n8nRes.status,blobSize:blob.size,contentType:n8nRes.headers.get('content-type')||''},timestamp:Date.now(),hypothesisId:'H5',runId:'exec69-debug'})}).catch(()=>{});
  // #endregion
  return new Response(blob, {
    headers: {
      'Content-Type':
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="filled-invoices.xlsx"',
    },
  });
}
