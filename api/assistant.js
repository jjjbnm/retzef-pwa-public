function localAnswer(question, profile) {
  const text = String(question || '').toLowerCase();
  const who = profile && (profile.displayName || profile.username) ? `אתה מחובר בתור ${profile.displayName || profile.username} (@${profile.username || ''}).` : 'אין כרגע פרופיל TikTok מחובר.';
  if (text.trim() === 'הבאן המקורי') return '🥚 מצאת Easter egg! עוד סוד קטן: מתחילת 1 באוקטובר לא צריך לקנות מנוי כדי לשלוח סרטון יותר.';
  if (/^\s*(היי|שלום|הי|אהלן)/.test(text) && !/מנוי|משתמש|מחובר/.test(text)) return 'היי! אני העוזר של רצף, איך אפשר לעזור?';
  if (/לאיזה משתמש|מי אני|מחובר בתור|איזה משתמש/.test(text)) return who;
  if (/איזה מנוי|המנוי שלי|מנוי יש לי/.test(text)) return 'אין לי כרגע נתוני מנוי אישיים על החשבון שלך. אפשר לבדוק ולרכוש מנוי בטאב מנויים; אל תשלח פרטי תשלום בצ׳אט.';
  if (/גיל|בן כמה|גיל כניסה|לאיזה גיל/.test(text)) return 'גיל הכניסה לקבוצה הוא 15- כרגע, והוא יעלה ל-16- בשנת 2027.';
  if (/סטטוס שלי|מה הסטטוס|איזה סטטוס/.test(text)) return profile?.role ? `לפי הפרופיל המחובר, התפקיד שלך הוא ${profile.role}. לפרטי הסטטוס המלאים פתח את טאב סטטוס.` : 'כדי לבדוק את הסטטוס שלך, התחבר עם TikTok ופתח את טאב סטטוס.';
  if (/בעלים/.test(text)) return 'בעל הקבוצה הוא הבאן המקורי 👑.';
  if (/מנהלת|מנהל/.test(text)) return 'המנהלת היא shirel 👩‍💼.';
  if (/סולם|צבע|סטטוס/.test(text)) return 'סולם הסטטוס הוא: 🟢 הכול טוב, 🟡 אזהרה ראשונה, 🟠 אזהרה שנייה/בסיכון, 🔴 אזהרה חמורה/בסכנה, ⚫ באן, ☠️ חסימה לצמיתות.';
  if (/חוק|חוקים/.test(text)) return 'חוקי הבסיס: לא לספים, לא לקלל, לא לשנות שם או תמונת קבוצה, ואסור להזכיר את המדינות האסורות לפי חוקי הקבוצה.';
  if (/סקר/.test(text)) return 'סקר זמין רק בלוח העדכונים. הוא כולל שאלה, לפחות שתי תשובות וכפתור להוספת תשובות.';
  if (/אירוע/.test(text)) return 'פרסום אירוע כולל שם האירוע, תיאור, מתי יתחיל ומתי ייגמר.';
  if (/קובץ|apk|100mb/.test(text)) return 'בפרסום קובץ אסור להעלות APK או קובץ מעל 100MB.';
  if (/לוח מודעות|מודעה|עדכון/.test(text)) return 'לוח מודעות מיועד להודעות. לוח עדכונים דורש את הקוד מודעות9באן; סקרים זמינים רק בו.';
  if (/חנות|paypal|תשלום/.test(text)) return 'החנות כוללת תגים ושירותים שונים, והתשלום מתבצע דרך PayPal.';
  return 'הבנתי. במה תרצה שאעזור? אפשר לכתוב שאלה או בקשה מלאה, למשל: "לאיזה משתמש אני מחובר?" או "מה גיל הכניסה?"';
}
function getCookie(req, name) { const raw=req.headers.cookie||''; const found=raw.split(';').map(x=>x.trim()).find(x=>x.startsWith(name+'=')); return found?decodeURIComponent(found.slice(name.length+1)):''; }
async function getProfile(req) {
  const id=getCookie(req,'retzef_profile_id'); const url=process.env.KV_REST_API_URL||process.env.UPSTASH_REDIS_REST_URL; const token=process.env.KV_REST_API_TOKEN||process.env.UPSTASH_REDIS_REST_TOKEN;
  if(!id||!url||!token)return null; const r=await fetch(`${url}/get/${encodeURIComponent('retzef:profile:'+id.toLowerCase())}`,{headers:{Authorization:`Bearer ${token}`}}); const d=await r.json(); return d.result?(typeof d.result==='string'?JSON.parse(d.result):d.result):null;
}
module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });
  let input={}; try { input=typeof req.body==='object'?req.body:JSON.parse(req.body||'{}'); } catch (_) {}
  const question=String(input.message||'').trim().slice(0,2000); if(!question)return res.status(400).json({error:'message_required'});
  const profile=await getProfile(req).catch(()=>null); const fallback=localAnswer(question,profile);
  const key=process.env.OPENAI_API_KEY||process.env.BUILT_IN_FORGE_API_KEY;
  if(!key)return res.status(200).json({answer:fallback});
  try {
    const configuredBase=process.env.OPENAI_API_BASE||process.env.BUILT_IN_FORGE_API_URL||'https://api.openai.com/v1'; const base=configuredBase.replace(/\/$/,''); const endpoint=base.endsWith('/v1')?base+'/chat/completions':base+'/v1/chat/completions';
    const profileText=profile?`הפרופיל המחובר: display name=${profile.displayName||''}, username=@${profile.username||''}, role=${profile.role||'member'}.`:'אין פרופיל TikTok מחובר.';
    const system=`אתה העוזר של רצף. קודם זהה את הכוונה של כל ההודעה ורק אחר כך ענה. אל תגיב לפי מילת מפתח בודדת: אם המשתמש מזכיר את המילה "רצף", "TikTok", "סטטוס" או כל מילה אחרת רק בתוך דוגמה, ציטוט, הודעה אוטומטית או סיפור — אל תניח שהוא שאל על המילה הזו. ענה לבקשה האמיתית של המשתמש. אם אין שאלה או בקשה ברורה, אמור שהבנת ובקש ממנו לנסח במה לעזור. אל תכתוב "הנה סיכום מהיר על רצף" ואל תדביק סיכום כללי אם לא ביקשו אותו. אם אומרים היי בלבד, ענה: היי! אני העוזר של רצף, איך אפשר לעזור? ענה על כל נושא רלוונטי: משתמש TikTok מחובר, מנוי, גיל, חוקים, סטטוס, סולם 🟢🟡🟠🔴⚫☠️, חנות, PayPal, לוחות, סקרים, אירועים וקבצים. גיל כניסה: 15- כרגע ו-16- ב-2027. חוקים: לא לספים, לא לקלל, לא לשנות שם/תמונת קבוצה ואיסור הזכרת המדינות האסורות. הבעלים הוא הבאן המקורי ומנהלת היא shirel. מנוי סרטון רגיל/פלוס קובע מה מותר לשלוח; רצף פלוס/פרימיום נותנים הטבות קהילה. סקר זמין רק בעדכונים, שקודו מודעות9באן. APK וקובץ מעל 100MB אסורים. אם אין מידע אישי על מנוי, אמור זאת ואל תמציא. ${profileText}`;
    const response=await fetch(endpoint,{method:'POST',headers:{Authorization:'Bearer '+key,'Content-Type':'application/json'},body:JSON.stringify({model:process.env.AI_MODEL||'gpt-5-mini',messages:[{role:'system',content:system},{role:'user',content:question}],max_completion_tokens:700})}); const data=await response.json(); const answer=data.choices?.[0]?.message?.content; return res.status(200).json({answer:response.ok&&answer?answer:fallback});
  } catch (error) { console.error('assistant api error',error.message); return res.status(200).json({answer:fallback}); }
};
