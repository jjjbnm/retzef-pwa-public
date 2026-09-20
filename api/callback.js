// TikTok OAuth callback for Vercel: api/callback.js
const ROLES = {
  'ban.real': 'owner',
  'הבאן המקורי': 'owner',
  'oobbn98': 'admin',
  'shirel': 'admin',
  'retzef_support': 'admin',
  'קבוצת רצף תמיכה': 'admin',
};
function resolveRole(username) {
  if (!username) return 'member';
  return ROLES[username.toLowerCase()] || 'member';
}

async function saveProfile(username, profile) {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) throw new Error('profile_storage_not_configured');
  const response = await fetch(`${url}/set/${encodeURIComponent(`retzef:profile:${username.toLowerCase()}`)}/${encodeURIComponent(JSON.stringify(profile))}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) throw new Error('profile_storage_error');
}
async function getProfile(username) { const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL; const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN; if (!url || !token) return null; const r = await fetch(`${url}/get/${encodeURIComponent(`retzef:profile:${username.toLowerCase()}`)}`, { headers: { Authorization: `Bearer ${token}` } }); const d = await r.json(); return d.result ? (typeof d.result === 'string' ? JSON.parse(d.result) : d.result) : null; }
async function getJoinRequest(username) { const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL; const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN; if (!url || !token) return null; const r = await fetch(`${url}/lrange/retzef%3Ajoin%3Arequests/0/199`, { headers: { Authorization: `Bearer ${token}` } }); const d = await r.json(); return (d.result || []).map(x => { try { return typeof x === 'string' ? JSON.parse(x) : x; } catch (_) { return null; } }).find(x => x && String(x.username || '').toLowerCase() === String(username || '').toLowerCase()) || null; }

module.exports = async (req, res) => {
  const { code, error: tiktokError } = req.query;
  if (tiktokError) return res.redirect(302, `/?tiktok_error=${encodeURIComponent(tiktokError)}`);
  if (!code) return res.redirect(302, '/?tiktok_error=missing_code');

  const CLIENT_KEY = process.env.TIKTOK_CLIENT_KEY;
  const CLIENT_SECRET = process.env.TIKTOK_CLIENT_SECRET;
  const REDIRECT_URI = process.env.TIKTOK_REDIRECT_URI;
  if (!CLIENT_KEY || !CLIENT_SECRET || !REDIRECT_URI) {
    return res.redirect(302, '/?tiktok_error=server_not_configured');
  }

  try {
    const tokenRes = await fetch('https://open.tiktokapis.com/v2/oauth/token/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_key: CLIENT_KEY,
        client_secret: CLIENT_SECRET,
        code,
        grant_type: 'authorization_code',
        redirect_uri: REDIRECT_URI,
      }),
    });
    const tokenData = await tokenRes.json();
    if (!tokenData.access_token) return res.redirect(302, '/?tiktok_error=token_exchange_failed');

    const userRes = await fetch(
      'https://open.tiktokapis.com/v2/user/info/?fields=open_id,union_id,avatar_url,display_name,username',
      { headers: { Authorization: `Bearer ${tokenData.access_token}` } }
    );
    const userData = await userRes.json();
    const user = userData?.data?.user || {};
    if (userData?.error?.code && userData.error.code !== 'ok') {
      console.error('TikTok user info error:', userData);
      return res.redirect(302, `/?tiktok_error=${encodeURIComponent(userData.error.code)}`);
    }
    const displayName = user.display_name || user.username || '';
    const username = user.username || displayName || user.open_id || '';
    const existingProfile = await getProfile(username);
    if (existingProfile?.banned === true) return res.redirect(302, `/?tiktok_error=${encodeURIComponent('account_banned')}&ban_reason=${encodeURIComponent(existingProfile.banReason || 'החשבון נחסם')}`);
    const joinRequest = await getJoinRequest(username);
    if (joinRequest && joinRequest.status !== 'approved') return res.redirect(302, `/?tiktok_error=${encodeURIComponent(joinRequest.status === 'denied' ? 'join_denied' : 'join_pending')}&ban_reason=${encodeURIComponent(joinRequest.reason || 'יש להמתין לאישור הבאן המקורי')}`);
    // TikTok Login Kit does not normally expose the account's country or IP.
    // Keep any optional country field only if TikTok ever returns one, and record
    // the country of the IP used during this login separately.
    const accountCountry = user.country_code || user.country || user.region || '';
    const loginCountry = String(req.headers['x-vercel-ip-country'] || '').toUpperCase();
    const params = new URLSearchParams({
      tiktok_ok: '1',
      username,
      display_name: displayName,
      avatar: user.avatar_url || '',
      role: resolveRole(username),
    });
    try {
      await saveProfile(username, { ...(existingProfile || {}), username, displayName, avatarUrl: user.avatar_url || '', role: resolveRole(username), age: Number(joinRequest?.age || existingProfile?.age || 0), accountCountry, loginCountry, banned: false, banReason: '' });
    } catch (storageError) {
      console.error('Profile storage unavailable; continuing login:', storageError.message);
    }
    res.setHeader('Set-Cookie', `retzef_profile_id=${encodeURIComponent(username)}; Path=/; Max-Age=31536000; Secure; SameSite=Lax`);
    return res.redirect(302, `/?${params.toString()}`);
  } catch (err) {
    console.error('TikTok callback error:', err);
    return res.redirect(302, '/?tiktok_error=server_error');
  }
};
