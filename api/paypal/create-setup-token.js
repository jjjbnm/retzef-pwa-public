const PAYPAL_API_BASE = process.env.PAYPAL_API_BASE || 'https://api-m.sandbox.paypal.com';
async function getAccessToken() {
  const auth = Buffer.from(`${process.env.PAYPAL_CLIENT_ID}:${process.env.PAYPAL_CLIENT_SECRET}`).toString('base64');
  const response = await fetch(`${PAYPAL_API_BASE}/v1/oauth2/token`, { method: 'POST', headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'grant_type=client_credentials' });
  const data = await response.json();
  if (!response.ok || !data.access_token) throw new Error('paypal_auth_failed');
  return data.access_token;
}
module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*'); res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS'); res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });
  try {
    const token = await getAccessToken();
    const response = await fetch(`${PAYPAL_API_BASE}/v3/vault/setup-tokens`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ payment_source: { card: {} } }) });
    const data = await response.json();
    if (!response.ok || !data.id) return res.status(502).json({ error: 'setup_token_creation_failed', details: data });
    return res.status(200).json({ id: data.id });
  } catch (error) { console.error('create-setup-token:', error.message); return res.status(500).json({ error: 'server_error' }); }
};
