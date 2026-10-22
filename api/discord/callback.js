// Discord OAuth callback. Never expose DISCORD_CLIENT_SECRET to the browser.
const CLIENT_ID = process.env.DISCORD_CLIENT_ID || '1562816898813399122';
const CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET;
const MAIN_ORIGIN = 'https://chi-liart-74.vercel.app';
const ALLOWED_RETURNS = new Set(['https://chi-liart-74.vercel.app','https://retzef-pwa.vercel.app','https://retzef-pwa-public.vercel.app']);
function cookies(req){return Object.fromEntries(String(req.headers?.cookie||'').split(';').map(x=>x.trim()).filter(Boolean).map(x=>{const i=x.indexOf('=');return [x.slice(0,i),decodeURIComponent(x.slice(i+1))]}));}
async function kv(command,...args){const url=process.env.KV_REST_API_URL||process.env.UPSTASH_REDIS_REST_URL;const token=process.env.KV_REST_API_TOKEN||process.env.UPSTASH_REDIS_REST_TOKEN;if(!url||!token)throw new Error('storage_not_configured');const r=await fetch(`${url}/${command}/${args.map(encodeURIComponent).join('/')}`,{method:command==='set'?'POST':'GET',headers:{Authorization:`Bearer ${token}`}});const d=await r.json();if(!r.ok||d.error)throw new Error(d.error||'storage_error');return d.result;}
async function getProfile(username){if(!username)return null;const raw=await kv('get',`retzef:profile:${username.toLowerCase()}`);return raw?(typeof raw==='string'?JSON.parse(raw):raw):null;}
module.exports=async(req,res)=>{const q=req.query||{};const c=cookies(req);let state={};try{state=JSON.parse(Buffer.from(String(q.state||''),'base64url').toString())}catch(_){}
 const saved=String(c.retzef_discord_oauth_state||'');const safeReturn=ALLOWED_RETURNS.has(String(state.returnTo||''))?state.returnTo:MAIN_ORIGIN;const fail=(code)=>res.redirect(302,`${safeReturn}/?discord_error=${encodeURIComponent(code)}`);
 if(!q.code||!saved||saved!==String(q.state||''))return fail('invalid_state');if(!CLIENT_SECRET)return fail('server_not_configured');
 try{const tokenRes=await fetch('https://discord.com/api/oauth2/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:CLIENT_ID,client_secret:CLIENT_SECRET,grant_type:'authorization_code',code:String(q.code),redirect_uri:`${MAIN_ORIGIN}/api/discord/callback`})});const token=await tokenRes.json();if(!tokenRes.ok||!token.access_token)return fail('token_exchange_failed');
 const userRes=await fetch('https://discord.com/api/users/@me',{headers:{Authorization:`Bearer ${token.access_token}`}});const user=await userRes.json();if(!userRes.ok||!user.id)return fail('profile_failed');
 const username=String(c.retzef_profile_id||'').toLowerCase();let profile=username?await getProfile(username):null;const discord={id:String(user.id),username:String(user.username||''),globalName:String(user.global_name||''),avatar:user.avatar?`https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png`: '',connectedAt:new Date().toISOString(),publicVisible:false};
 if(profile){profile.discord=discord;await kv('set',`retzef:profile:${username}`,JSON.stringify(profile));}
 await kv('set',`retzef:discord:${user.id}`,JSON.stringify({...discord,retzefUsername:username||''}));
 res.setHeader('Set-Cookie',[`retzef_discord_id=${encodeURIComponent(user.id)}; Path=/; Max-Age=31536000; Secure; SameSite=Lax`,`retzef_discord_oauth_state=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`]);return res.redirect(302,`${safeReturn}/?discord_connected=1`);
 }catch(e){console.error('Discord OAuth error:',e.message);return fail('server_error');}};
