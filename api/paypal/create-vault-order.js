const PAYPAL_API_BASE = process.env.PAYPAL_API_BASE || 'https://api-m.sandbox.paypal.com';
const PREFIX = 'retzef:profile:';
function cookie(req, name) { const raw = req.headers.cookie || ''; const hit = raw.split(';').map(x => x.trim()).find(x => x.startsWith(name + '=')); return hit ? decodeURIComponent(hit.slice(name.length + 1)) : ''; }
function cfg() { return { url: process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL, token: process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN }; }
async function redis(command, ...args) { const { url, token } = cfg(); if (!url || !token) throw new Error('storage_not_configured'); const r = await fetch(`${url}/${command}/${args.map(encodeURIComponent).join('/')}`, { headers: { Authorization: `Bearer ${token}` } }); const d = await r.json(); if (!r.ok || d.error) throw new Error(d.error || 'storage_error'); return d.result; }
async function getAccessToken() { const auth = Buffer.from(`${process.env.PAYPAL_CLIENT_ID}:${process.env.PAYPAL_CLIENT_SECRET}`).toString('base64'); const r = await fetch(`${PAYPAL_API_BASE}/v1/oauth2/token`, { method:'POST', headers:{Authorization:`Basic ${auth}`,'Content-Type':'application/x-www-form-urlencoded'}, body:'grant_type=client_credentials' }); const d=await r.json(); if(!r.ok||!d.access_token)throw new Error('paypal_auth_failed'); return d.access_token; }
module.exports = async (req,res)=>{
  res.setHeader('Cache-Control','no-store'); res.setHeader('Access-Control-Allow-Origin','*'); res.setHeader('Access-Control-Allow-Methods','POST, OPTIONS'); res.setHeader('Access-Control-Allow-Headers','Content-Type');
  if(req.method==='OPTIONS')return res.status(200).end(); if(req.method!=='POST')return res.status(405).json({error:'method_not_allowed'});
  try{
    const me=cookie(req,'retzef_profile_id').toLowerCase(); if(!me)return res.status(401).json({error:'tiktok_login_required'});
    const body=typeof req.body==='object'?req.body:JSON.parse(req.body||'{}'); const item=String(body.item||'').trim().slice(0,160); const amount=Number(body.price); const methodId=String(body.paymentMethodId||'').trim();
    if(!item||!Number.isFinite(amount)||amount<=0||!methodId)return res.status(400).json({error:'invalid_order'});
    const raw=await redis('get',`${PREFIX}${me}`); const profile=raw?(typeof raw==='string'?JSON.parse(raw):raw):null; const method=(Array.isArray(profile?.savedPaymentMethods)?profile.savedPaymentMethods:[]).find(x=>String(x.id||'')===methodId); if(!method?.vaultId)return res.status(404).json({error:'payment_method_not_found'});
    const payment_source=method.type==='card'?{card:{vault_id:String(method.vaultId)}}:{paypal:{vault_id:String(method.vaultId)}};
    const token=await getAccessToken(); const r=await fetch(`${PAYPAL_API_BASE}/v2/checkout/orders`,{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify({intent:'CAPTURE',payment_source,purchase_units:[{description:`רצף — ${item}`,amount:{currency_code:'ILS',value:amount.toFixed(2)}}]})}); const d=await r.json(); if(!r.ok||!d.id)return res.status(502).json({error:'vault_order_failed',details:d}); return res.status(200).json({id:d.id});
  }catch(e){console.error('vault order:',e.message);return res.status(500).json({error:'server_error'});}
};
