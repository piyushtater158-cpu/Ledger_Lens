import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getN8nAdminToken, N8N_ADMIN_TOKEN_SETUP_HINT } from '@/lib/n8n-config';

type DiscoverBody = {
  query?: string;
  after: number;
  before: number;
  maxMessages?: number;
};

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
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

  const body = (await request.json()) as DiscoverBody;
  if (!Number.isFinite(body?.after) || !Number.isFinite(body?.before)) {
    return NextResponse.json({ error: 'after and before are required unix epoch seconds' }, { status: 400 });
  }

  const n8nUrl = `${process.env.N8N_BASE_URL?.replace(/\/$/, '')}/webhook/gmail-discover`;

  let n8nRes: Response;
  try {
    n8nRes = await fetch(n8nUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Admin-Token': adminToken,
      },
      body: JSON.stringify({
        googleAccessToken: session.accessToken,
        query: body.query || '',
        after: body.after,
        before: body.before,
        maxMessages: body.maxMessages ?? 200,
      }),
    });
  } catch {
    return NextResponse.json({ error: 'Cannot reach n8n' }, { status: 503 });
  }

  if (!n8nRes.ok) {
    const text = await n8nRes.text().catch(() => 'Unknown error');
    return NextResponse.json({ error: text }, { status: n8nRes.status });
  }

  const data = (await n8nRes.json()) as {
    error?: string;
    errorCode?: number;
    invoices?: unknown[];
    truncated?: boolean;
    scanned?: number;
  };

  if (data.error) {
    const status =
      data.errorCode === 401 ? 401 : data.errorCode === 403 ? 403 : 502;
    return NextResponse.json({ error: data.error }, { status });
  }

  return NextResponse.json(data);
}
