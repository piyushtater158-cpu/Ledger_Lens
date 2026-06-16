import { NextResponse } from 'next/server';
import { getN8nAdminToken, N8N_ADMIN_TOKEN_SETUP_HINT } from '@/lib/n8n-config';

export async function GET() {
  const token = getN8nAdminToken();
  return NextResponse.json({
    n8nReady: !!token,
    message: token ? null : N8N_ADMIN_TOKEN_SETUP_HINT,
  });
}
