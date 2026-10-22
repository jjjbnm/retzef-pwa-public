// Discord OAuth login. The client secret is server-side only.
const CLIENT_ID = process.env.DISCORD_CLIENT_ID || '1562816898813399122';
const MAIN_ORIGIN = 'https://chi-liart-74.vercel.app';
const ALLOWED_RETURNS = new Set(['https://chi-liart-74.vercel.app','https://retzef-pwa.vercel.app','https://retzef-pwa-public.vercel.app']);
module.exports = async (req,res)=>{
  const returnTo=String(req.query?.return_to||MAIN_ORIGIN).replace(/\/$/,'');
  const safeReturn=ALLOWED_RETURNS.has(returnTo)?returnTo:MAIN_ORIGIN;
  const state=Buffer.from(JSON.stringify({nonce:crypto.randomUUID(),returnTo:safeReturn})).toString('base64url');
  res.setHeader('Set-Cookie',`retzef_discord_oauth_state=${encodeURIComponent(state)}; Path=/; Max-Age=600; HttpOnly; Secure; SameSite=Lax`);
  const redirect=`${MAIN_ORIGIN}/api/discord/callback`;
  const params=new URLSearchParams({client_id:CLIENT_ID,response_type:'code',redirect_uri:redirect,scope:'identify',state});
  return res.redirect(302,`https://discord.com/oauth2/authorize?${params.toString()}`);
};
