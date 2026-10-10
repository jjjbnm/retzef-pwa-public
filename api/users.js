const PREFIX = 'retzef:profile:';
const { sendTo } = require('../lib/push');
function cookie(req, name) { const raw = req.headers.cookie || ''; const hit = raw.split(';').map(x => x.trim()).find(x => x.startsWith(name + '=')); return hit ? decodeURIComponent(hit.slice(name.length + 1)) : ''; }
function body(req) { if (!req.body) return {}; if (typeof req.body === 'object') return req.body; try { return JSON.parse(req.body); } catch (_) { return {}; } }
function cfg() { return { url: process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL, token: process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN }; }
async function redis(command, ...args) { const { url, token } = cfg(); if (!url || !token) throw new Error('storage_not_configured'); const r = await fetch(`${url}/${command}/${args.map(encodeURIComponent).join('/')}`, { headers: { Authorization: `Bearer ${token}` } }); const d = await r.json(); if (!r.ok || d.error) throw new Error(d.error || 'storage_error'); return d.result; }
async function profile(username) { const raw = await redis('get', `${PREFIX}${username.toLowerCase()}`); return raw ? (typeof raw === 'string' ? JSON.parse(raw) : raw) : null; }
function publicUser(p) { return { username: p.username, displayName: p.displayName || p.username, avatarUrl: p.avatarUrl || (p.username === 'retzef_support' ? '/icons/icon-192.png' : ''), role: p.role || 'member', banned: p.banned === true, banReason: p.banReason || '', online: Date.now() - Number(p.lastSeen || 0) < 120000, statusVisible: p.privacy?.statusVisible !== false, subscriptionVisible: p.privacy?.subscriptionVisible === true }; }
function knownStatus(username) { const known = { 'ban.original': 'בעלים', 'oobbn98': 'הכול טוב', 'dahan324': 'סבבה', 'albinocapybara': 'הכול טוב', 'user1691117561269': 'הכול טוב' }; return known[String(username || '').toLowerCase()] || ''; }
function coinNumber(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  const normalized = String(value ?? '').replace(/[,_\s]/g, '');
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}
function walletOf(p) {
  const wallet = p && p.wallet && typeof p.wallet === 'object' ? p.wallet : {};
  const rawBalance = wallet.balance ?? wallet.coins ?? p?.walletBalance ?? p?.coins ?? p?.balance ?? 0;
  return { balance: Math.max(0, Math.floor(coinNumber(rawBalance))), transactions: Array.isArray(wallet.transactions) ? wallet.transactions.slice(0, 50) : [] };
}
async function supportRequests() { const rows = await redis('lrange', 'retzef:support:requests', '0', '99'); return (rows || []).map(x => { try { return JSON.parse(x); } catch (_) { return null; } }).filter(Boolean); }
async function joinRequests() { const rows = await redis('lrange', 'retzef:join:requests', '0', '99'); return (rows || []).map(x => { try { return JSON.parse(x); } catch (_) { return null; } }).filter(Boolean); }
async function relationshipRequests(username) { const rows = await redis('lrange', `retzef:relationship:requests:${username}`, '0', '99'); return (rows || []).map(x => { try { return JSON.parse(x); } catch (_) { return null; } }).filter(Boolean); }
module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const input = req.method === 'GET' ? (req.query || {}) : body(req); const action = String(input.action || '');
  if (req.method === 'POST' && action === 'join') {
    try {
      const name = String(input.name || '').trim().slice(0, 60) || 'לא נמסר'; const username = String(input.username || '').trim().replace(/^@/, '').slice(0, 60).toLowerCase(); const age = Number(input.age); const gender = String(input.gender || '').trim();
      if (!username || !/^[a-z0-9._-]{2,60}$/i.test(username) || !Number.isInteger(age) || age < 1 || age > 120 || !['', 'בן', 'בת'].includes(gender)) return res.status(400).json({ error: 'invalid_join_details' });
      const item = { id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, name, username, age, gender, createdAt: new Date().toISOString(), status: 'new', from: cookie(req, 'retzef_profile_id').toLowerCase() || null };
      if (age > 15) { const bannedProfile = { username, displayName: name, role: 'member', age, banned: true, banReason: 'גדול מדי בשביל הקבוצה' }; await redis('set', `${PREFIX}${username}`, JSON.stringify(bannedProfile)); try { await sendTo('ban.original', { title: 'חסימת גיל אוטומטית', body: `@${username}: גדול מדי בשביל הקבוצה`, url: '/' }); } catch (_) {} item.status = 'denied'; item.reason = 'גדול מדי בשביל הקבוצה'; }
      await redis('lpush', 'retzef:join:requests', JSON.stringify(item)); await redis('ltrim', 'retzef:join:requests', '0', '199');
      res.setHeader('Set-Cookie', `retzef_join_id=${encodeURIComponent(item.id)}; Path=/; Max-Age=31536000; SameSite=Lax; Secure`);
      let notificationSent = false; try { notificationSent = await sendTo('ban.original', { title: 'בקשת הצטרפות חדשה', body: `${name}, גיל ${age}, ביקש/ה להצטרף`, url: '/' }); } catch (notificationError) { console.error('join notification:', notificationError.message); }
      return res.status(201).json({ submitted: true, saved: true, notificationSent });
    } catch (e) { console.error('join request:', e.message); return res.status(503).json({ error: e.message === 'storage_not_configured' ? e.message : 'storage_error' }); }
  }
  if (req.method === 'POST' && action === 'logout') {
    res.setHeader('Set-Cookie', [
      'retzef_profile_id=; Path=/; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Lax; Secure',
      'retzef_join_id=; Path=/; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Lax; Secure'
    ]);
    return res.status(200).json({ loggedOut: true });
  }
  if (req.method === 'POST' && action === 'supportForm') {
    try {
      const username = String(input.username || '').trim().replace(/^@/, '').slice(0, 60).toLowerCase();
      const name = String(input.name || '').trim().slice(0, 80);
      const email = String(input.email || '').trim().slice(0, 160);
      const device = String(input.device || '').trim().slice(0, 80);
      const category = String(input.category || '').trim();
      const reason = String(input.reason || '').trim().slice(0, 80);
      const description = String(input.description || '').trim().slice(0, 3000);
      const categories = ['account', 'login', 'app', 'payments', 'privacy', 'suggestions', 'content', 'managers', 'accessibility', 'cooperation', 'general', 'community', 'notifications', 'profile', 'username', 'verification', 'browser', 'performance', 'installation', 'updates', 'language', 'translation', 'events', 'boards', 'chat', 'voice', 'wallet', 'refund', 'legal', 'feedback', 'data', 'technical', 'other'];
      if (!/^[a-z0-9._-]{2,60}$/i.test(username) || (!email || !/^\S+@\S+\.\S+$/.test(email)) || !categories.includes(category) || !device || !reason || !description) return res.status(400).json({ error: 'invalid_support_details' });
      const queueNumber = Number(await redis('incr', 'retzef:support:ticket-counter')) || 1;
      const ticketNumber = `${queueNumber}#`;
      const item = { id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, ticketNumber, from: cookie(req, 'retzef_profile_id').toLowerCase() || null, username, name: name || 'לא נמסר', email, device, category, reason, description, quote: description, createdAt: new Date().toISOString(), status: 'new' };
      await redis('lpush', 'retzef:support:requests', JSON.stringify(item)); await redis('ltrim', 'retzef:support:requests', '0', '199');
      try { await sendTo('retzef_support', { title: `פניית תמיכה חדשה · ${ticketNumber}`, body: `פנייה חדשה מ־@${username}: ${reason}`, url: '/' }); } catch (_) {}
      const categoryNames = { account: 'פרצו לי לחשבון', login: 'בעיית התחברות', app: 'תקלה באפליקציה', payments: 'מנויים ותשלומים', community: 'קבוצה, סטטוס או משתמש', other: 'נושא אחר' };
      const reasonNames = { hacked: 'חשבון נפרץ', password: 'שכחתי סיסמה', locked: 'החשבון ננעל', details: 'שונו פרטים בלי אישור', failed: 'לא מצליח/ה להתחבר', code: 'קוד התחברות לא הגיע', tiktok: 'TikTok לא נפתח', broken: 'האפליקציה לא עובדת', blank: 'מסך לבן או טעינה שלא נגמרת', button: 'כפתור לא מגיב', error: 'מופיעה שגיאה', subscription: 'בעיה במנוי', payment: 'תשלום נכשל', charge: 'חיוב לא מוכר', status: 'שאלה על סטטוס או באן', rules: 'שאלה על חוקי הקבוצה', user: 'דיווח על משתמש', question: 'שאלה כללית', suggestion: 'הצעה לשיפור' };
      const categoryName = categoryNames[category] || category;
      const reasonName = reasonNames[reason] || reason;
      const supportDetails = `שם משתמש: ${username}
שם: ${name || 'לא נמסר'}
מייל ליצירת קשר: ${email}
איזה מכשיר?: ${device}
קטגוריה: ${categoryName}
מה קרה?: ${reasonName}
הסבר: ${description}`;
      const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
      const mailPayload = { username, name, email, toEmail: email, fromEmail: 'retzef.support@gmail.com', replyTo: 'retzef.support@gmail.com', subject: `כרטיס תמיכה ${ticketNumber} · רצף`, ticketNumber, device, category, categoryName, reason, reasonName, description, supportDetails };
      const resendKey = process.env.RESEND_API_KEY;
      const appsScriptUrl = process.env.GOOGLE_APPS_SCRIPT_URL;
      let mailResult = null;
      if (resendKey) {
        const mailResponse = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ from: process.env.RESEND_FROM_EMAIL || 'retzef.support@gmail.com', to: [email], reply_to: 'retzef.support@gmail.com', subject: mailPayload.subject, html: `<div dir="rtl"><h2>כרטיס התמיכה שלך נשלח בהצלחה</h2><p>מספרך בתור זה <b>${escapeHtml(ticketNumber)}</b></p><p>שלום ${escapeHtml(name || username)},</p><p>קיבלנו את הפנייה שלך ונחזור אליך בהקדם.</p><hr><h3>מידע שנשלח בטופס</h3><p><b>שם משתמש:</b> ${escapeHtml(username)}<br><b>שם:</b> ${escapeHtml(name || 'לא נמסר')}<br><b>מייל ליצירת קשר:</b> ${escapeHtml(email)}<br><b>איזה מכשיר?:</b> ${escapeHtml(device)}<br><b>קטגוריה:</b> ${escapeHtml(categoryName)}<br><b>מה קרה?:</b> ${escapeHtml(reasonName)}<br><b>הסבר:</b><br>${escapeHtml(description).replace(/\n/g, '<br>')}</p></div>` }) });
        mailResult = await mailResponse.json(); if (!mailResponse.ok || !mailResult.id) throw new Error(mailResult.message || 'email_delivery_failed');
      } else if (appsScriptUrl) {
        const mailResponse = await fetch(appsScriptUrl, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(mailPayload) });
        mailResult = await mailResponse.json(); if (!mailResponse.ok || mailResult.ok === false) throw new Error(mailResult.error || 'email_delivery_failed');
      } else throw new Error('email_not_configured');
      return res.status(201).json({ forwarded: true, submitted: true, ticketNumber, emailSent: true, request: item });
    } catch (e) { console.error('support form:', e.message); return res.status(503).json({ error: e.message === 'storage_not_configured' ? e.message : 'storage_error' }); }
  }
  const me = cookie(req, 'retzef_profile_id').toLowerCase();
  if (req.method === 'GET' && input.joinMine === '1') { try { const id = cookie(req, 'retzef_join_id'); const rows = await joinRequests(); return res.status(200).json({ requests: id ? rows.filter(x => x.id === id).map(x => ({ id: x.id, status: x.status, reason: x.reason || '', createdAt: x.createdAt })) : [] }); } catch (_) { return res.status(503).json({ error: 'storage_error' }); } }
  if (!me) return res.status(401).json({ error: 'tiktok_login_required' });
  try {
    const mine = await profile(me); if (!mine) return res.status(401).json({ error: 'tiktok_login_required' });
    if (req.method === 'POST' && action === 'switchAccount') {
      const target = String(input.username || '').replace(/^@/, '').trim().toLowerCase();
      const saved = Array.isArray(mine.savedAccounts) ? mine.savedAccounts : [];
      if (!/^[a-z0-9._-]{2,128}$/.test(target) || !saved.some(item => String(item?.username || '').toLowerCase() === target)) return res.status(403).json({ error: 'account_not_saved' });
      const targetProfile = await profile(target);
      if (!targetProfile) return res.status(404).json({ error: 'profile_not_found' });
      res.setHeader('Set-Cookie', `retzef_profile_id=${encodeURIComponent(target)}; Path=/; Max-Age=31536000; SameSite=Lax; Secure`);
      return res.status(200).json({ switched: true, profile: { ...publicUser(targetProfile), wallet: walletOf(targetProfile) } });
    }
    if (req.method === 'GET' && input.clientState === '1') {
      const state = mine.clientState && typeof mine.clientState === 'object' ? mine.clientState : {};
      return res.status(200).json({ clientState: state });
    }
    if (req.method === 'POST' && action === 'clientState') {
      const next = input.state && typeof input.state === 'object' ? input.state : {};
      const safe = {
        subscriptionId: String(next.subscriptionId || '').slice(0, 256),
        subscriptionName: String(next.subscriptionName || '').slice(0, 160),
        lastChatRequest: String(next.lastChatRequest || '').slice(0, 256),
        lastChatMessage: String(next.lastChatMessage || '').slice(0, 256),
        lastSupportRequest: String(next.lastSupportRequest || '').slice(0, 256),
        settings: next.settings && typeof next.settings === 'object' ? next.settings : {},
        cart: Array.isArray(next.cart) ? next.cart.slice(0, 50).map(x => ({ name: String(x.name || '').slice(0, 160), price: Number(x.price) || 0 })) : []
      };
      mine.clientState = safe;
      await redis('set', `${PREFIX}${me}`, JSON.stringify(mine));
      return res.status(200).json({ clientState: safe });
    }

    if (req.method === 'GET' && input.savedAccounts === '1') return res.status(200).json({ accounts: Array.isArray(mine.savedAccounts) ? mine.savedAccounts.slice(0, 10) : [] });
    if (req.method === 'POST' && action === 'saveAccount') {
      const account = input.account && typeof input.account === 'object' ? input.account : {};
      const username = String(account.username || '').replace(/^@/, '').trim().toLowerCase();
      if (!/^[a-z0-9._-]{2,128}$/.test(username)) return res.status(400).json({ error: 'invalid_username' });
      const saved = { username, displayName: String(account.displayName || username).slice(0, 120), avatarUrl: String(account.avatarUrl || '').slice(0, 1000), role: String(account.role || 'member').slice(0, 30) };
      mine.savedAccounts = [saved, ...(Array.isArray(mine.savedAccounts) ? mine.savedAccounts : []).filter(x => String(x.username || '').toLowerCase() !== username)].slice(0, 10);
      await redis('set', `${PREFIX}${me}`, JSON.stringify(mine));
      return res.status(200).json({ saved: true, accounts: mine.savedAccounts });
    }
    if (req.method === 'GET') {
      const scan = await redis('scan', '0', 'match', `${PREFIX}*`, 'count', '100');
      const keys = Array.isArray(scan) && Array.isArray(scan[1]) ? scan[1] : [];
      const users = (await Promise.all(keys.slice(0, 100).map(k => profile(k.slice(PREFIX.length))))).filter(Boolean).filter(p => String(p.username || '').toLowerCase() !== me);
      const visibleUsers = await Promise.all(users.map(async p => { const targetUsername = String(p.username).toLowerCase(); const approved = await redis('sismember', `retzef:chat:accepted:${me}`, targetUsername); const pendingRows = await redis('lrange', `retzef:chat:requests:${targetUsername}`, '0', '49'); const chatPending = (pendingRows || []).some(row => { try { return JSON.parse(row).from === me; } catch (_) { return false; } }); const result = { ...publicUser(p), chatApproved: String(approved) === '1' || approved === true, chatPending, safeRelationship: (mine.safeContacts || {})[targetUsername] || null, blockedByMe: (mine.blockedUsers || []).includes(targetUsername), mutedByMe: (mine.mutedUsers || []).includes(targetUsername) }; if (result.chatApproved && result.statusVisible) result.status = p.status || knownStatus(p.username); if (result.chatApproved && result.subscriptionVisible) result.subscription = p.subscription || p.subscriptionName || ''; return result; }));
      const requests = await redis('lrange', `retzef:chat:requests:${me}`, '0', '49'); const safeRequests = await relationshipRequests(me);
      const result = { me: { ...publicUser(mine), devicePreferences: mine.devicePreferences || {}, wallet: walletOf(mine), payments: Array.isArray(mine.paymentHistory) ? mine.paymentHistory.slice(0, 50) : [] }, users: visibleUsers, requests: (requests || []).map(x => { try { return JSON.parse(x); } catch (_) { return null; } }).filter(Boolean), relationshipRequests: safeRequests };
      if (['owner', 'admin'].includes(mine.role) || ['retzef_support', 'ban.original', 'shirel'].includes(me)) result.supportRequests = await supportRequests();
      if (me === 'ban.original') result.joinRequests = await joinRequests();
      return res.status(200).json(result);
    }
    if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });
    if (action === 'privacy') {
      mine.privacy = { statusVisible: input.statusVisible !== false, subscriptionVisible: input.subscriptionVisible === true };
      await redis('set', `${PREFIX}${me}`, JSON.stringify(mine)); return res.status(200).json({ privacy: mine.privacy });
    }
    if (action === 'devicePreferences') {
      mine.devicePreferences = { reduceMotion: input.reduceMotion === true, notifications: input.notifications === true };
      await redis('set', `${PREFIX}${me}`, JSON.stringify(mine)); return res.status(200).json({ devicePreferences: mine.devicePreferences });
    }
    if (action === 'walletGrant') { if (me !== 'ban.original') return res.status(403).json({ error: 'owner_only' }); const amount = Math.floor(Number(input.amount)); if (!Number.isInteger(amount) || amount < 1 || amount > 100000) return res.status(400).json({ error: 'invalid_amount' }); const targetProfile = await profile(target); const wallet = walletOf(targetProfile); wallet.balance += amount; wallet.transactions.unshift({ type: 'grant', amount, reason: String(input.reason || 'הענקה מהבעלים').trim().slice(0, 160), by: me, createdAt: new Date().toISOString() }); targetProfile.wallet = wallet; await redis('set', `${PREFIX}${target}`, JSON.stringify(targetProfile)); try { await sendTo(target, { title: 'קיבלת מטבעות רצף', body: `נוספו לך ${amount} מטבעות לארנק`, url: '/' }); } catch (_) {} return res.status(200).json({ username: target, wallet }); }
    if (action === 'support') {
      const quote = String(input.quote || '').trim().slice(0, 2000); if (!quote) return res.status(400).json({ error: 'quote_required' });
      const item = { id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, from: me, displayName: mine.displayName || me, quote, createdAt: new Date().toISOString(), status: 'new' };
      await redis('lpush', 'retzef:support:requests', JSON.stringify(item)); await redis('ltrim', 'retzef:support:requests', '0', '199');
      await sendTo('retzef_support', { title: 'פניית תמיכה חדשה', body: `פנייה חדשה מ־@${me}`, url: '/' });
      return res.status(201).json({ forwarded: true, request: item });
    }
    if (action === 'joinDecision') {
      if (me !== 'ban.original' || !['approve', 'deny'].includes(input.decision)) return res.status(403).json({ error: 'owner_only' });
      const requestId = String(input.requestId || ''); const rows = await joinRequests(); const found = rows.find(x => x.id === requestId); if (!found) return res.status(404).json({ error: 'join_request_not_found' });
      const reason = String(input.reason || '').trim().slice(0, 500); if (input.decision === 'deny' && !reason) return res.status(400).json({ error: 'denial_reason_required' });
      found.status = input.decision === 'approve' ? 'approved' : 'denied'; found.reason = input.decision === 'deny' ? reason : ''; found.decidedAt = new Date().toISOString(); await redis('del', 'retzef:join:requests'); for (let i = rows.length - 1; i >= 0; i--) await redis('rpush', 'retzef:join:requests', JSON.stringify(rows[i]));
      if (found.from) await sendTo(found.from, { title: input.decision === 'approve' ? 'בקשת ההצטרפות אושרה' : 'בקשת ההצטרפות נדחתה', body: input.decision === 'approve' ? 'הבאן המקורי אישר את בקשתך.' : `הבקשה נדחתה: ${reason}`, url: '/' });
      return res.status(200).json({ updated: true, status: found.status });
    }
    if (action === 'giftCodeRedeem') {
      const code = String(input.code || '').trim().toUpperCase().replace(/\s+/g, '');
      if (!/^[A-Z0-9_-]{4,32}$/.test(code)) return res.status(400).json({ error: 'invalid_code' });
      const key = `retzef:gift:${code}`;
      const raw = await redis('get', key); let gift = raw ? (typeof raw === 'string' ? JSON.parse(raw) : raw) : null;
      const systemGifts = { DHD1000: 1000, DHD1001: 1000, DHD50938482: 509384483, STARTERPACK: 10, NEWINRETZEF: 50 };
      if (!gift && Object.prototype.hasOwnProperty.call(systemGifts, code)) { gift = { code, amount: systemGifts[code], maxUses: -1, oneTimePerAccount: ['STARTERPACK','NEWINRETZEF'].includes(code), uses: 0, usedBy: [], expiresAt: '', createdBy: 'system', createdAt: new Date().toISOString() }; await redis('set', key, JSON.stringify(gift)); }
      if (!gift) return res.status(404).json({ error: 'code_not_found' });
      const oneTime = gift.oneTimePerAccount === true || Number(gift.maxUses) === 1;
      if (oneTime && Array.isArray(gift.usedBy) && gift.usedBy.includes(me)) return res.status(409).json({ error: 'already_redeemed' });
      if (gift.expiresAt && Date.parse(gift.expiresAt) < Date.now()) return res.status(400).json({ error: 'code_expired' });
      if (Number(gift.maxUses) > 0 && Number(gift.uses || 0) >= Number(gift.maxUses)) return res.status(400).json({ error: 'code_used_up' });
      if (oneTime) { const claimed = await redis('set', `retzef:gift:redeemed:${code}:${me}`, '1', 'NX', 'EX', '31536000'); if (!claimed) return res.status(409).json({ error: 'already_redeemed' }); }
      const wallet = walletOf(mine); const now = new Date().toISOString();
      wallet.balance += Math.floor(Number(gift.amount) || 0);
      wallet.transactions.unshift({ type: 'gift', amount: Math.floor(Number(gift.amount) || 0), reason: `קוד מתנה ${code}`, code, createdAt: now });
      gift.uses = Number(gift.uses || 0) + 1; gift.usedBy = Array.isArray(gift.usedBy) ? gift.usedBy.slice(0, 10000) : []; gift.usedBy.push(me);
      mine.wallet = wallet;
      await redis('set', `${PREFIX}${me}`, JSON.stringify(mine)); await redis('set', key, JSON.stringify(gift));
      return res.status(200).json({ wallet, amount: gift.amount, valueShekels: (Math.floor(Number(gift.amount) || 0) / 10).toFixed(2) });
    }
    if (action === 'walletDonate') {
      const recipient = String(input.username || '').replace(/^@/, '').trim().toLowerCase();
      const amount = Math.floor(Number(input.amount));
      const reason = String(input.reason || 'תרומה').trim().slice(0, 160) || 'תרומה';
      if (!/^[a-z0-9._-]{2,128}$/.test(recipient) || recipient === me) return res.status(400).json({ error: 'invalid_recipient' });
      if (!Number.isInteger(amount) || amount < 1 || amount > 100000) return res.status(400).json({ error: 'invalid_amount' });
      const targetProfile = await profile(recipient);
      if (!targetProfile || targetProfile.banned === true) return res.status(404).json({ error: 'recipient_not_found', message: 'ה־Trade התבטל — המשתמש לא נמצא.' });
      const senderBefore = walletOf(mine);
      const recipientBefore = walletOf(targetProfile);
      if (senderBefore.balance < amount) return res.status(400).json({ error: 'insufficient_coins', balance: senderBefore.balance, message: 'ה־Trade התבטל — אין מספיק מטבעות.' });
      const senderAfter = walletOf(mine); const recipientAfter = walletOf(targetProfile); const now = new Date().toISOString();
      senderAfter.balance -= amount;
      senderAfter.transactions.unshift({ type: 'donate', amount: -amount, reason: `תרומה ל־@${recipient}: ${reason}`, to: recipient, createdAt: now });
      recipientAfter.balance += amount;
      recipientAfter.transactions.unshift({ type: 'donation', amount, reason: `תרומה מ־@${me}: ${reason}`, from: me, createdAt: now });
      mine.wallet = senderAfter; targetProfile.wallet = recipientAfter;
      try {
        await redis('set', `${PREFIX}${me}`, JSON.stringify(mine));
        await redis('set', `${PREFIX}${recipient}`, JSON.stringify(targetProfile));
        const senderCheck = await profile(me); const recipientCheck = await profile(recipient);
        if (!senderCheck || !recipientCheck || walletOf(senderCheck).balance !== senderAfter.balance || walletOf(recipientCheck).balance !== recipientAfter.balance) throw new Error('trade_verification_failed');
      } catch (_) {
        try { await redis('set', `${PREFIX}${me}`, JSON.stringify({ ...mine, wallet: senderBefore })); await redis('set', `${PREFIX}${recipient}`, JSON.stringify({ ...targetProfile, wallet: recipientBefore })); } catch (_) {}
        return res.status(409).json({ error: 'recipient_balance_not_updated', message: 'ה־Trade התבטל — המשתמש לא קיבל את המטבעות.' });
      }
      try { await sendTo(recipient, { title: 'קיבלת תרומה בארנק', body: `קיבלת ${amount} מטבעות מ־@${me}`, url: '/' }); } catch (_) {}
      return res.status(200).json({ wallet: senderAfter, recipient, message: '✅ ה־Trade הושלם' });
    }
    if (action === 'walletSpend') {
      const reason = String(input.reason || 'רכישה באפליקציה').trim().slice(0, 160);
      if (/^מנוי סרטון/.test(reason)) return res.status(410).json({ error: 'product_unavailable', message: 'מנויי הסרטון אינם זמינים.' });
      if (/^תג/.test(reason)) return res.status(400).json({ error: 'badges_not_available_with_coins' });
      const amount = Math.floor(Number(input.amount));
      if (!Number.isInteger(amount) || amount < 1 || amount > 100000) return res.status(400).json({ error: 'invalid_amount' });
      const wallet = walletOf(mine);
      if (wallet.balance < amount) return res.status(400).json({ error: 'insufficient_coins', balance: wallet.balance });
      wallet.balance -= amount;
      const paymentId = `coin-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const now = new Date().toISOString();
      wallet.transactions.unshift({ type: 'spend', amount: -amount, reason, paymentId, createdAt: now });
      mine.wallet = wallet;
      let subscription = null;
      if (/רצף פלוס/.test(reason)) {
        const durationMs = /שנה/.test(reason) ? 365*86400000 : /חודש/.test(reason) ? 30*86400000 : /שבוע/.test(reason) ? 7*86400000 : /3 ימים/.test(reason) ? 3*86400000 : 30*86400000;
        subscription = reason.replace(/\s*\(מתחדש\)$/, '').trim();
        mine.subscription = subscription; mine.subscriptionName = subscription;
        mine.subscriptionExpiresAt = Date.now() + durationMs; mine.subscriptionSource = 'coins';
      }
      mine.paymentHistory = [{ id: paymentId, name: subscription || reason, method: 'coins', amount, currency: 'RETZEF_COINS', valueShekels: (amount / 10).toFixed(2), createdAt: now }, ...(Array.isArray(mine.paymentHistory) ? mine.paymentHistory : [])].slice(0, 50);
      await redis('set', `${PREFIX}${me}`, JSON.stringify(mine));
      return res.status(200).json({ wallet, paymentId, subscription, subscriptionName: mine.subscriptionName || '', subscriptionExpiresAt: mine.subscriptionExpiresAt || null });
    }
    const target = String(input.username || '').replace(/^@/, '').trim().toLowerCase();
    if (!target || target === me || !(await profile(target))) return res.status(404).json({ error: 'user_not_found' });
    if (action === 'ban' || action === 'unban') {
      if (me !== 'ban.original') return res.status(403).json({ error: 'owner_only' });
      const targetProfile = await profile(target); if (!targetProfile) return res.status(404).json({ error: 'user_not_found' });
      targetProfile.banned = action === 'ban'; targetProfile.banReason = action === 'ban' ? (String(input.reason || '').trim().slice(0, 500) || 'הפרת כללי הקבוצה') : ''; await redis('set', `${PREFIX}${target}`, JSON.stringify(targetProfile));
      if (action === 'ban') { try { await sendTo(target, { title: 'החשבון נחסם', body: targetProfile.banReason, url: '/' }); } catch (_) {} try { await sendTo('ban.original', { title: 'חשבון נחסם', body: `@${target}: ${targetProfile.banReason}`, url: '/' }); } catch (_) {} }
      return res.status(200).json({ banned: action === 'ban', username: target, reason: targetProfile.banReason });
    }
    if (action === 'block' || action === 'unblock') {
      const blocked = new Set(Array.isArray(mine.blockedUsers) ? mine.blockedUsers : []); if (action === 'block') blocked.add(target); else blocked.delete(target); mine.blockedUsers = [...blocked]; await redis('set', `${PREFIX}${me}`, JSON.stringify(mine)); return res.status(200).json({ blocked: action === 'block', username: target });
    }
    if (action === 'mute' || action === 'unmute') {
      const muted = new Set(Array.isArray(mine.mutedUsers) ? mine.mutedUsers : []); if (action === 'mute') muted.add(target); else muted.delete(target); mine.mutedUsers = [...muted]; await redis('set', `${PREFIX}${me}`, JSON.stringify(mine)); return res.status(200).json({ muted: action === 'mute', username: target });
    }
    if (action === 'relationshipRequest') { const targetProfile = await profile(target); if (!targetProfile) return res.status(404).json({ error: 'user_not_found' }); if ((mine.blockedUsers || []).includes(target) || (targetProfile.blockedUsers || []).includes(me)) return res.status(403).json({ error: 'user_blocked' }); if ((mine.safeContacts || {})[target] === 'safe') return res.status(200).json({ sent: true, already: true }); const rows = await relationshipRequests(target); if (rows.some(x => x.from === me)) return res.status(200).json({ sent: true, pending: true }); const item = { id: `${Date.now()}-${Math.random().toString(36).slice(2,8)}`, from: me, to: target, relationship: 'safe', createdAt: new Date().toISOString() }; await redis('lpush', `retzef:relationship:requests:${target}`, JSON.stringify(item)); await redis('ltrim', `retzef:relationship:requests:${target}`, '0', '49'); try { await sendTo(target, { title: 'בקשת חבר בטוח', body: `@${me} רוצה להוסיף אותך כחבר בטוח`, url: '/' }); } catch (_) {} return res.status(201).json({ sent: true, pending: true }); }
    if (action === 'relationshipRespond') { const decision = String(input.decision || ''); if (!['accept','deny'].includes(decision)) return res.status(400).json({ error: 'invalid_decision' }); const from = String(input.username || '').replace(/^@/,'').trim().toLowerCase(); const rows = await relationshipRequests(me); const found = rows.find(x => x.from === from); if (!found) return res.status(404).json({ error: 'relationship_request_not_found' }); const kept = rows.filter(x => x !== found); await redis('del', `retzef:relationship:requests:${me}`); for (let i = kept.length - 1; i >= 0; i--) await redis('rpush', `retzef:relationship:requests:${me}`, JSON.stringify(kept[i])); if (decision === 'accept') { const other = await profile(from); if (!other) return res.status(404).json({ error: 'user_not_found' }); mine.safeContacts = { ...(mine.safeContacts || {}), [from]: 'safe' }; other.safeContacts = { ...(other.safeContacts || {}), [me]: 'safe' }; await redis('set', `${PREFIX}${me}`, JSON.stringify(mine)); await redis('set', `${PREFIX}${from}`, JSON.stringify(other)); try { await sendTo(from, { title: 'בקשת חבר בטוח אושרה', body: `@${me} אישר/ה את הבקשה`, url: '/' }); } catch (_) {} } return res.status(200).json({ accepted: decision === 'accept' }); }
    if (action === 'relationshipChallenge') { const relationship = String(input.relationship || ''); if (relationship !== 'family') return res.status(400).json({ error: 'invalid_relationship' }); const method = ['bluetooth','wifi','qr','code'].includes(String(input.method || '')) ? String(input.method) : null; if (!method) return res.status(400).json({ error: 'verification_method_required' }); const targetProfile = await profile(target); if (!targetProfile) return res.status(404).json({ error: 'user_not_found' }); const code = String(Math.floor(100000 + Math.random() * 900000)); const challenge = { code, from: me, to: target, relationship, method, expiresAt: Date.now() + 600000 }; await redis('set', `retzef:relationship:challenge:${code}`, JSON.stringify(challenge), 'EX', '600'); try { await sendTo(target, { title: 'בקשת אימות משפחה', body: `@${me} שלח/ה בקשת אימות באמצעות ${method}`, url: '/' }); } catch (_) {} return res.status(201).json({ code, method, expiresAt: challenge.expiresAt }); }
    if (action === 'relationshipVerify') { const code = String(input.code || '').replace(/\D/g, '').slice(0, 6); const raw = await redis('get', `retzef:relationship:challenge:${code}`); const challenge = raw ? (typeof raw === 'string' ? JSON.parse(raw) : raw) : null; if (!challenge || challenge.expiresAt < Date.now() || ![challenge.from, challenge.to].includes(me)) return res.status(400).json({ error: 'invalid_or_expired_verification' }); const other = challenge.from === me ? challenge.to : challenge.from; const otherProfile = await profile(other); if (!otherProfile) return res.status(404).json({ error: 'user_not_found' }); const relationship = challenge.relationship === 'safe' ? 'safe' : 'family'; mine.safeContacts = { ...(mine.safeContacts || {}), [other]: relationship }; otherProfile.safeContacts = { ...(otherProfile.safeContacts || {}), [me]: relationship }; await redis('set', `${PREFIX}${me}`, JSON.stringify(mine)); await redis('set', `${PREFIX}${other}`, JSON.stringify(otherProfile)); await redis('del', `retzef:relationship:challenge:${code}`); return res.status(200).json({ verified: true, relationship, username: other }); }
    if (action === 'relationship') { const relationship = ['safe','family',''].includes(String(input.relationship || '')) ? String(input.relationship || '') : null; if (relationship === null) return res.status(400).json({ error: 'invalid_relationship' }); mine.safeContacts = { ...(mine.safeContacts || {}) }; if (relationship) mine.safeContacts[target] = relationship; else delete mine.safeContacts[target]; await redis('set', `${PREFIX}${me}`, JSON.stringify(mine)); return res.status(200).json({ username: target, relationship: relationship || null }); }
    if (action === 'request') {
      if ((mine.blockedUsers || []).includes(target)) return res.status(403).json({ error: 'user_blocked' });
      const targetProfile = await profile(target); if ((targetProfile.blockedUsers || []).includes(me)) return res.status(403).json({ error: 'user_blocked' });
      const existingRows = await redis('lrange', `retzef:chat:requests:${target}`, '0', '49');
      if ((existingRows || []).some(row => { try { return JSON.parse(row).from === me; } catch (_) { return false; } })) return res.status(200).json({ sent: true, pending: true });
      const item = JSON.stringify({ from: me, createdAt: new Date().toISOString() }); await redis('lpush', `retzef:chat:requests:${target}`, item); await sendTo(target, { title: 'בקשת צ׳אט חדשה', body: `@${me} רוצה להתחיל צ׳אט איתך`, url: '/' }); return res.status(201).json({ sent: true, pending: true });
    }
    if (action === 'accept' || action === 'deny') {
      const rows = await redis('lrange', `retzef:chat:requests:${me}`, '0', '99'); const kept = []; let found = false;
      for (const row of rows || []) { let item; try { item = JSON.parse(row); } catch (_) { kept.push(row); continue; } if (item.from === target && !found) { found = true; continue; } kept.push(row); }
      await redis('del', `retzef:chat:requests:${me}`); for (let i = kept.length - 1; i >= 0; i--) await redis('rpush', `retzef:chat:requests:${me}`, kept[i]);
      if (!found) return res.status(404).json({ error: 'request_not_found' });
      if (action === 'accept') { await redis('sadd', `retzef:chat:accepted:${me}`, target); await redis('sadd', `retzef:chat:accepted:${target}`, me); }
      return res.status(200).json({ accepted: action === 'accept' });
    }
    if (action === 'close') {
      await redis('srem', `retzef:chat:accepted:${me}`, target); await redis('srem', `retzef:chat:accepted:${target}`, me); return res.status(200).json({ closed: true });
    }
    return res.status(400).json({ error: 'invalid_action' });
  } catch (e) { console.error('users API:', e.message); return res.status(503).json({ error: e.message === 'storage_not_configured' ? e.message : 'storage_error' }); }
};
