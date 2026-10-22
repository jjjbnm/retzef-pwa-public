// TikTok OAuth callback for Vercel: api/callback.js
const ROLES = {
  'ban.original': 'owner',
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
async function getProfile(username) { const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL; const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN; if (!url || !token || !username) return null; const r = await fetch(`${url}/get/${encodeURIComponent(`retzef:profile:${String(username).toLowerCase()}`)}`, { headers: { Authorization: `Bearer ${token}` } }); const d = await r.json(); return d.result ? (typeof d.result === 'string' ? JSON.parse(d.result) : d.result) : null; }
async function deleteProfile(username) { if (!username) return; const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL; const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN; if (!url || !token) return; await fetch(`${url}/del/${encodeURIComponent(`retzef:profile:${String(username).toLowerCase()}`)}`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } }); }
async function getProfileByTikTokId(openId) { if (!openId) return null; const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL; const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN; if (!url || !token) return null; const r = await fetch(`${url}/get/${encodeURIComponent(`retzef:tiktok:open_id:${openId}`)}`, { headers: { Authorization: `Bearer ${token}` } }); const d = await r.json(); const username = d.result ? String(d.result) : ''; return username ? { username, profile: await getProfile(username) } : null; }
async function saveTikTokIndex(openId, username) { if (!openId || !username) return; const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL; const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN; if (!url || !token) return; await fetch(`${url}/set/${encodeURIComponent(`retzef:tiktok:open_id:${openId}`)}/${encodeURIComponent(String(username).toLowerCase())}`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } }); }
function getCookie(req, name) { const raw = req.headers?.cookie || ''; const hit = raw.split(';').map(x => x.trim()).find(x => x.startsWith(`${name}=`)); return hit ? decodeURIComponent(hit.slice(name.length + 1)) : ''; }
async function savePendingTikTok(data) {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) throw new Error('profile_storage_not_configured');
  const key = `retzef:tiktok:pending:${require('crypto').randomBytes(24).toString('hex')}`;
  await fetch(`${url}/setex/${encodeURIComponent(key)}/900/${encodeURIComponent(JSON.stringify(data))}`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
  return key.slice('retzef:tiktok:pending:'.length);
}
async function getPendingTikTok(tokenValue) {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL; const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token || !tokenValue) return null;
  const r = await fetch(`${url}/get/${encodeURIComponent(`retzef:tiktok:pending:${tokenValue}`)}`, { headers: { Authorization: `Bearer ${token}` } }); const d = await r.json();
  return d.result ? (typeof d.result === 'string' ? JSON.parse(d.result) : d.result) : null;
}
async function getJoinRequest(username) { const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL; const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN; if (!url || !token) return null; const r = await fetch(`${url}/lrange/retzef%3Ajoin%3Arequests/0/199`, { headers: { Authorization: `Bearer ${token}` } }); const d = await r.json(); return (d.result || []).map(x => { try { return typeof x === 'string' ? JSON.parse(x) : x; } catch (_) { return null; } }).find(x => x && String(x.username || '').toLowerCase() === String(username || '').toLowerCase()) || null; }



function discordReturn(value){const allowed=new Set(['https://chi-liart-74.vercel.app','https://retzef-pwa.vercel.app','https://retzef-pwa-public.vercel.app']);const v=String(value||'').replace(/\/$/,'');return allowed.has(v)?v:'https://chi-liart-74.vercel.app';}
function handleDiscordLogin(req,res){const returnTo=discordReturn(req.query?.return_to);const state=Buffer.from(JSON.stringify({nonce:crypto.randomUUID(),returnTo})).toString('base64url');res.setHeader('Set-Cookie',`retzef_discord_oauth_state=${encodeURIComponent(state)}; Path=/; Max-Age=600; HttpOnly; Secure; SameSite=Lax`);const redirect='https://chi-liart-74.vercel.app/api/callback?provider=discord';const params=new URLSearchParams({client_id:process.env.DISCORD_CLIENT_ID||'1562816898813399122',response_type:'code',redirect_uri:redirect,scope:'identify',state});return res.redirect(302,`https://discord.com/oauth2/authorize?${params.toString()}`);}
async function handleDiscordPrivacy(req,res){const c=Object.fromEntries(String(req.headers?.cookie||'').split(';').map(x=>x.trim()).filter(Boolean).map(x=>{const i=x.indexOf('=');return [x.slice(0,i),decodeURIComponent(x.slice(i+1))]}));const id=c.retzef_discord_id;if(!id)return res.status(401).json({error:'discord_not_connected'});const url=process.env.KV_REST_API_URL||process.env.UPSTASH_REDIS_REST_URL,token=process.env.KV_REST_API_TOKEN||process.env.UPSTASH_REDIS_REST_TOKEN;if(!url||!token)return res.status(503).json({error:'storage_not_configured'});const kv=async(command,...args)=>{const r=await fetch(`${url}/${command}/${args.map(encodeURIComponent).join('/')}`,{method:command==='set'?'POST':'GET',headers:{Authorization:`Bearer ${token}`}});const d=await r.json();if(!r.ok||d.error)throw new Error(d.error||'storage_error');return d.result;};const raw=await kv('get',`retzef:discord:${id}`);const a=raw?(typeof raw==='string'?JSON.parse(raw):raw):null;if(!a)return res.status(404).json({error:'discord_not_found'});if(req.method==='POST'){a.publicVisible=Boolean(req.body?.publicVisible);await kv('set',`retzef:discord:${id}`,JSON.stringify(a));}return res.status(200).json({discord:{username:a.username,globalName:a.globalName||'',avatar:a.avatar||'',publicVisible:a.publicVisible===true}});}

async function handleDiscordCallback(req,res,query){
  const CLIENT_ID=process.env.DISCORD_CLIENT_ID||'1562816898813399122'; const CLIENT_SECRET=process.env.DISCORD_CLIENT_SECRET; const MAIN_ORIGIN='https://chi-liart-74.vercel.app';
  const ALLOWED=new Set(['https://chi-liart-74.vercel.app','https://retzef-pwa.vercel.app','https://retzef-pwa-public.vercel.app']);
  const cookies=Object.fromEntries(String(req.headers?.cookie||'').split(';').map(x=>x.trim()).filter(Boolean).map(x=>{const i=x.indexOf('=');return [x.slice(0,i),decodeURIComponent(x.slice(i+1))]})); let state={}; try{state=JSON.parse(Buffer.from(String(query.state||''),'base64url').toString())}catch(_){ }
  const saved=String(cookies.retzef_discord_oauth_state||''); const returnTo=ALLOWED.has(String(state.returnTo||''))?state.returnTo:MAIN_ORIGIN; const fail=(code)=>res.redirect(302,`${returnTo}/?discord_error=${encodeURIComponent(code)}`);
  if(!query.code||!saved||saved!==String(query.state||''))return fail('invalid_state'); if(!CLIENT_SECRET)return fail('server_not_configured');
  try{const tokenRes=await fetch('https://discord.com/api/oauth2/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:CLIENT_ID,client_secret:CLIENT_SECRET,grant_type:'authorization_code',code:String(query.code),redirect_uri:`${MAIN_ORIGIN}/api/callback?provider=discord`})}); const token=await tokenRes.json(); if(!tokenRes.ok||!token.access_token)return fail('token_exchange_failed');
    const userRes=await fetch('https://discord.com/api/users/@me',{headers:{Authorization:`Bearer ${token.access_token}`}}); const user=await userRes.json(); if(!userRes.ok||!user.id)return fail('profile_failed');
    const discord={id:String(user.id),username:String(user.username||''),globalName:String(user.global_name||''),avatar:user.avatar?`https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png`:'',connectedAt:new Date().toISOString(),publicVisible:false};
    const url=process.env.KV_REST_API_URL||process.env.UPSTASH_REDIS_REST_URL,tokenKey=process.env.KV_REST_API_TOKEN||process.env.UPSTASH_REDIS_REST_TOKEN; if(!url||!tokenKey)throw new Error('storage_not_configured');
    const set=async(key,value)=>{const r=await fetch(`${url}/set/${encodeURIComponent(key)}/${encodeURIComponent(JSON.stringify(value))}`,{method:'POST',headers:{Authorization:`Bearer ${tokenKey}`}});if(!r.ok)throw new Error('storage_error');};
    await set(`retzef:discord:${user.id}`,{...discord,retzefUsername:String(cookies.retzef_profile_id||'').toLowerCase()});
    res.setHeader('Set-Cookie',[`retzef_discord_id=${encodeURIComponent(user.id)}; Path=/; Max-Age=31536000; Secure; SameSite=Lax`,`retzef_discord_oauth_state=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`]); return res.redirect(302,`${returnTo}/?discord_connected=1`);
  }catch(e){console.error('Discord OAuth error:',e.message);return fail('server_error');}
}

module.exports = async (req, res) => {
  const query = req && req.query && typeof req.query === 'object' ? req.query : {};
  if (String(query.provider || '') === 'discord') { if (String(query.action || '') === 'privacy') return handleDiscordPrivacy(req, res); if (!query.code) return handleDiscordLogin(req, res); return handleDiscordCallback(req, res, query); }
  const { code, error: tiktokError } = query;
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
    const rawUsername = user.username || displayName || user.open_id || '';
    const username = String(rawUsername).trim();
    if (!username) return res.redirect(302, '/?tiktok_error=missing_username');
    const addAccountFlow = String(query.state || '') === 'retzef_add_account';
    const previousUsername = addAccountFlow ? '' : getCookie(req, 'retzef_profile_id');
    const indexed = await getProfileByTikTokId(user.open_id);
    const existingProfile = indexed?.profile || (previousUsername ? await getProfile(previousUsername) : null) || await getProfile(username);
    const oldUsername = indexed?.username || (existingProfile && previousUsername ? previousUsername : (existingProfile?.username || ''));
    const retzefUsername = indexed?.username || existingProfile?.username || username;
    const profileAvatar = username === 'retzef_support' ? '/icons/icon-192.png' : (user.avatar_url || existingProfile?.avatarUrl || '');
    if (existingProfile?.banned === true) return res.redirect(302, `/?tiktok_error=${encodeURIComponent('account_banned')}&ban_reason=${encodeURIComponent(existingProfile.banReason || 'החשבון נחסם')}`);
    const joinRequest = await getJoinRequest(username);
    if (joinRequest && joinRequest.status !== 'approved') return res.redirect(302, `/?tiktok_error=${encodeURIComponent(joinRequest.status === 'denied' ? 'join_denied' : 'join_pending')}&ban_reason=${encodeURIComponent(joinRequest.reason || 'יש להמתין לאישור הבאן המקורי')}`);
    // TikTok Login Kit does not normally expose the account's country or IP.
    // Keep any optional country field only if TikTok ever returns one, and record
    // the country of the IP used during this login separately.
    const accountCountry = user.country_code || user.country || user.region || '';
    const loginCountry = String(req.headers['x-vercel-ip-country'] || '').toUpperCase();
    if (!existingProfile && !addAccountFlow) {
      const pendingToken = await savePendingTikTok({ openId: user.open_id || '', unionId: user.union_id || '', tiktokUsername: username, displayName, avatarUrl: profileAvatar, accountCountry, loginCountry, createdAt: Date.now() });
      res.setHeader('Set-Cookie', `retzef_tiktok_pending=${encodeURIComponent(pendingToken)}; Path=/; Max-Age=900; HttpOnly; Secure; SameSite=Lax`);
      return res.redirect(302, `/?tiktok_ok=1&tiktok_new=1&display_name=${encodeURIComponent(displayName)}&avatar=${encodeURIComponent(profileAvatar)}&tiktok_username=${encodeURIComponent(username)}`);
    }
    const params = new URLSearchParams({
      tiktok_ok: '1',
      username: retzefUsername,
      display_name: displayName,
      avatar: profileAvatar,
      role: resolveRole(retzefUsername),
      account_added: addAccountFlow ? '1' : '0',
      account_existing: existingProfile ? '1' : '0',
    });
    try {
      await saveProfile(retzefUsername, { ...(existingProfile || {}), username: retzefUsername, displayName, avatarUrl: profileAvatar, role: existingProfile?.role || resolveRole(username), tiktokOpenId: user.open_id || existingProfile?.tiktokOpenId || '', tiktokUnionId: user.union_id || existingProfile?.tiktokUnionId || '', age: Number(joinRequest?.age || existingProfile?.age || 0), accountCountry, loginCountry, banned: false, banReason: '' });
      await saveTikTokIndex(user.open_id, retzefUsername);
      if (oldUsername && String(oldUsername).toLowerCase() !== username.toLowerCase()) await deleteProfile(oldUsername);
    } catch (storageError) {
      console.error('Profile storage unavailable; continuing login:', storageError.message);
    }
    if (String(query.state || '') !== 'retzef_add_account') res.setHeader('Set-Cookie', `retzef_profile_id=${encodeURIComponent(retzefUsername)}; Path=/; Max-Age=31536000; Secure; SameSite=Lax`);
    return res.redirect(302, `/?${params.toString()}`);
  } catch (err) {
    console.error('TikTok callback error:', err);
    return res.redirect(302, '/?tiktok_error=server_error');
  }
};
