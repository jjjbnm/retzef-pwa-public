function cookie(req, name) { const raw = req.headers.cookie || ''; const hit = raw.split(';').map(x => x.trim()).find(x => x.startsWith(name + '=')); return hit ? decodeURIComponent(hit.slice(name.length + 1)).toLowerCase() : ''; }
const { sendTo } = require('../lib/push');
function body(req) { if (!req.body) return {}; if (typeof req.body === 'object') return req.body; try { return JSON.parse(req.body); } catch (_) { return {}; } }
const cfg = () => ({ url: process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL, token: process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN });
async function redis(command, ...args) { const { url, token } = cfg(); if (!url || !token) throw new Error('storage_not_configured'); const r = await fetch(`${url}/${command}/${args.map(encodeURIComponent).join('/')}`, { headers: { Authorization: `Bearer ${token}` } }); const d = await r.json(); if (!r.ok || d.error) throw new Error(d.error || 'storage_error'); return d.result; }
async function profile(username) { const raw = await redis('get', `retzef:profile:${username}`); return raw ? (typeof raw === 'string' ? JSON.parse(raw) : raw) : null; }
function key(a, b) { return `retzef:chat:${[a, b].sort().join(':')}`; }
function voiceAllowed(a, b) { const ageA = Number(a.age || 0), ageB = Number(b.age || 0); const safeA = a.safeContacts || {}, safeB = b.safeContacts || {}; return (ageA >= 13 && ageB >= 13) || ['safe','family'].includes(safeA[b.username]) || ['safe','family'].includes(safeB[a.username]); }
module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store'); const me = cookie(req, 'retzef_profile_id'); if (!me) return res.status(401).json({ error: 'tiktok_login_required' });
  try {
    const input = req.method === 'POST' ? body(req) : req.query; const other = String(input.username || '').replace(/^@/, '').toLowerCase();
    if (req.method === 'GET' && String(input.callInbox || '') === '1') { const rows = await redis('lrange', `retzef:call:${me}`, '0', '49'); const parsed = (rows || []).reverse().map(x => { try { return JSON.parse(x); } catch (_) { return null; } }).filter(Boolean); const events = (await Promise.all(parsed.map(async ev => { if (ev.action === 'invite' && await redis('get', `retzef:call:state:${ev.callId}:${me}`)) return null; return ev; }))).filter(Boolean); return res.status(200).json({ events }); }
    if (req.method === 'GET' && String(input.inbox || '') === '1') { const rows = await redis('lrange', `retzef:inbox:${me}`, '0', '99'); return res.status(200).json({ messages: (rows || []).reverse().map(x => { try { return JSON.parse(x); } catch (_) { return null; } }).filter(Boolean), inbox: true }); }
    if (!other || other === me) return res.status(400).json({ error: 'user_required' });
    const otherProfile = await profile(other); if (!otherProfile) return res.status(404).json({ error: 'user_not_found' });
    const myProfile = await profile(me); if ((myProfile?.blockedUsers || []).includes(other) || (otherProfile.blockedUsers || []).includes(me)) return res.status(403).json({ error: 'user_blocked' });
    const privilegedSender = ['ban.real', 'retzef_support'].includes(me);
    if (req.method === 'POST' && String(input.callAction || '')) {
      const approved = await redis('sismember', `retzef:chat:accepted:${me}`, other); if (Number(approved) !== 1 && approved !== true) return res.status(403).json({ error: 'chat_not_approved' });
      const callAction = String(input.callAction); const callId = String(input.callId || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 80); if (!callId) return res.status(400).json({ error: 'call_id_required' }); if (['reject','end'].includes(callAction)) { await redis('set', `retzef:call:state:${callId}:${me}`, callAction, 'EX', '300'); await redis('set', `retzef:call:state:${callId}:${other}`, callAction, 'EX', '300'); } if (callAction === 'answer' && Date.now() - Number(otherProfile.lastSeen || 0) > 120000) { await redis('set', `retzef:call:state:${callId}:${me}`, 'offline', 'EX', '300'); try { await sendTo(other, { title: 'לא ניתן לענות לשיחה', body: `@${me} ניסה/תה לענות, אבל היית לא מחובר/ת`, url: '/' }); } catch (_) {} return res.status(409).json({ error: 'caller_offline', message: 'המתקשר חייב להיות מחובר כדי לענות לשיחה.' }); } if (!voiceAllowed(myProfile, otherProfile)) return res.status(403).json({ error: 'voice_requires_13_or_trusted_contact' });
      const event = JSON.stringify({ callId, action: callAction, from: me, to: other, data: input.data || null, createdAt: new Date().toISOString() }); await redis('lpush', `retzef:call:${other}`, event); await redis('ltrim', `retzef:call:${other}`, '0', '49'); if (['invite','answer','reject','end'].includes(callAction)) try { await sendTo(other, { title: callAction === 'invite' ? 'שיחה קולית נכנסת' : 'עדכון שיחה קולית', body: callAction === 'invite' ? `@${me} מתקשר/ת אליך` : 'פתחו את הצ׳אט לצפייה', url: '/' }); } catch (_) {} return res.status(201).json({ sent: true, event: JSON.parse(event) });
    }
    if (req.method === 'POST' && input.inbox === true) {
      if (!privilegedSender) return res.status(403).json({ error: 'inbox_read_only' });
      const message = String(input.message || '').trim().slice(0, 2000); if (!message) return res.status(400).json({ error: 'message_required' });
      const item = JSON.stringify({ from: me, to: other, message, inbox: true, createdAt: new Date().toISOString() }); await redis('lpush', `retzef:inbox:${other}`, item); await redis('ltrim', `retzef:inbox:${other}`, '0', '199'); if (!(otherProfile.mutedUsers || []).includes(me)) await sendTo(other, { title: `Inbox חדש מ־@${me}`, body: message.slice(0, 120), url: '/' }); return res.status(201).json({ message: JSON.parse(item), inbox: true });
    }
    const accepted = await redis('sismember', `retzef:chat:accepted:${me}`, other);
    if (Number(accepted) !== 1 && accepted !== true) return res.status(403).json({ error: 'chat_not_approved' });
    if (req.method === 'GET') { const rows = await redis('lrange', key(me, other), '0', '99'); return res.status(200).json({ messages: (rows || []).reverse().map(x => { try { return JSON.parse(x); } catch (_) { return null; } }).filter(Boolean) }); }
    if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });
    const message = String(input.message || '').trim().slice(0, 2000); if (!message) return res.status(400).json({ error: 'message_required' });
    const item = JSON.stringify({ from: me, to: other, message, createdAt: new Date().toISOString() }); await redis('lpush', key(me, other), item); await redis('ltrim', key(me, other), '0', '199'); if (!(otherProfile.mutedUsers || []).includes(me)) await sendTo(other, { title: `הודעה חדשה מ־@${me}`, body: message.slice(0, 120), url: '/' }); return res.status(201).json({ message: JSON.parse(item) });
  } catch (e) { console.error('chat API:', e.message); return res.status(503).json({ error: e.message === 'storage_not_configured' ? e.message : 'storage_error' }); }
};
