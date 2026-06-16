import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getN8nAdminToken, N8N_ADMIN_TOKEN_SETUP_HINT } from '@/lib/n8n-config';

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
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

  const n8nUrl = `${process.env.N8N_BASE_URL?.replace(/\/$/, '')}/webhook/extract`;

  let n8nRes: Response;
  try {
    n8nRes = await fetch(n8nUrl, {
      method: 'POST',
      headers: { 'X-Admin-Token': adminToken },
      body: n8nForm,
    });
  } catch {
    return NextResponse.json(
      { error: 'Cannot reach n8n — check N8N_BASE_URL' },
      { status: 503 }
    );
  }

  if (!n8nRes.ok) {
    const text = await n8nRes.text().catch(() => 'Unknown error');
    return NextResponse.json({ error: text }, { status: n8nRes.status });
  }

  const blob = await n8nRes.blob();
  return new Response(blob, {
    headers: {
      'Content-Type':
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="filled-invoices.xlsx"',
    },
  });
}
