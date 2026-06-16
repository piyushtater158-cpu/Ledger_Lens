import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getN8nAdminToken, N8N_ADMIN_TOKEN_SETUP_HINT } from '@/lib/n8n-config';

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  // #region agent log
  fetch('http://127.0.0.1:7278/ingest/2c22404a-379e-4acd-837f-babf35680249',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'bc92db'},body:JSON.stringify({sessionId:'bc92db',location:'extract-row/route.ts:entry',message:'extract-row POST entry',data:{hasSession:!!session,hasAccessToken:!!session?.accessToken,sessionError:session?.error??null},timestamp:Date.now(),hypothesisId:'A',runId:'pre-fix'})}).catch(()=>{});
  // #endregion
  if (session?.error === 'RefreshAccessTokenError') {
    return NextResponse.json({ error: 'Google session expired — sign in again' }, { status: 401 });
  }
  if (!session?.accessToken) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const adminToken = getN8nAdminToken();
  if (!adminToken) {
    return NextResponse.json({ error: N8N_ADMIN_TOKEN_SETUP_HINT }, { status: 503 });
  }

  const { driveLink } = (await request.json()) as { driveLink: string };
  if (!driveLink) {
    return NextResponse.json({ error: 'driveLink required' }, { status: 400 });
  }

  const n8nUrl = `${process.env.N8N_BASE_URL?.replace(/\/$/, '')}/webhook/extract-row`;

  let n8nRes: Response;
  try {
    n8nRes = await fetch(n8nUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Admin-Token': adminToken,
      },
      body: JSON.stringify({ driveLink, googleAccessToken: session.accessToken }),
    });
  } catch {
    return NextResponse.json({ error: 'Cannot reach n8n' }, { status: 503 });
  }

  if (!n8nRes.ok) {
    const text = await n8nRes.text().catch(() => 'Unknown error');
    // #region agent log
    fetch('http://127.0.0.1:7278/ingest/2c22404a-379e-4acd-837f-babf35680249',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'bc92db'},body:JSON.stringify({sessionId:'bc92db',location:'extract-row/route.ts:n8n-error',message:'n8n returned error',data:{n8nStatus:n8nRes.status,n8nErrorPreview:text.slice(0,120)},timestamp:Date.now(),hypothesisId:'C',runId:'pre-fix'})}).catch(()=>{});
    // #endregion
    return NextResponse.json({ error: text }, { status: n8nRes.status });
  }

  const data = await n8nRes.json();
  // #region agent log
  fetch('http://127.0.0.1:7278/ingest/2c22404a-379e-4acd-837f-babf35680249',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'bc92db'},body:JSON.stringify({sessionId:'bc92db',location:'extract-row/route.ts:success',message:'n8n extract-row response',data:{status:data?.status??null,payeeLen:String(data?.payee??'').length},timestamp:Date.now(),hypothesisId:'B,C',runId:'pre-fix'})}).catch(()=>{});
  // #endregion
  return NextResponse.json(data);
}
