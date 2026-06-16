/** Returns the n8n admin token or null when missing / still a blank n8n export placeholder. */
export function getN8nAdminToken(): string | null {
  const token = process.env.N8N_ADMIN_TOKEN?.trim();
  if (!token || token.startsWith('__n8n_BLANK')) return null;
  return token;
}

export const N8N_ADMIN_TOKEN_SETUP_HINT =
  'Set N8N_ADMIN_TOKEN in frontend/.env.local to the value of the Admin Token credential in n8n (Credentials → Admin Token), then restart the dev server.';
