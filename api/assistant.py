import json
import os
import re
import urllib.error
import urllib.parse
import urllib.request
from http.server import BaseHTTPRequestHandler


MAX_QUESTION_LENGTH = 2000


def usable_answer(value):
    if isinstance(value, list):
        parts = []
        for item in value:
            if isinstance(item, str):
                parts.append(item)
            elif isinstance(item, dict):
                parts.append(str(item.get("text") or item.get("content") or ""))
        value = "".join(parts)
    if isinstance(value, dict):
        value = value.get("text") or value.get("content") or value.get("answer") or ""
    answer = str(value or "").strip()
    if not answer or re.fullmatch(r"n\s*/\s*a|n/|null|undefined|empty", answer, re.I):
        return ""
    return answer


def local_answer(question, profile=None):
    text = str(question or "").lower()
    profile = profile or {}
    username = profile.get("username") or ""
    display_name = profile.get("displayName") or username
    who = (
        f"אתה מחובר בתור {display_name} (@{username})."
        if display_name
        else "אין כרגע פרופיל TikTok מחובר."
    )
    if text.strip() == "הבאן המקורי":
        return "🥚 מצאת Easter egg! עוד סוד קטן: מתחילת 1 באוקטובר לא צריך לקנות מנוי כדי לשלוח סרטון יותר."
    if re.match(r"^\s*(היי|שלום|הי|אהלן)", text) and not re.search(r"מנוי|משתמש|מחובר", text):
        return "היי! אני העוזר של רצף, איך אפשר לעזור?"
    if re.search(r"לאיזה משתמש|מי אני|מחובר בתור|איזה משתמש", text):
        return who
    if re.search(r"איזה מנוי|המנוי שלי|מנוי יש לי", text):
        return "אין לי כרגע נתוני מנוי אישיים על החשבון שלך. אפשר לבדוק ולרכוש מנוי בטאב מנויים; אל תשלח פרטי תשלום בצ׳אט."
    if re.search(r"גיל|בן כמה|גיל כניסה|לאיזה גיל", text):
        return "גיל הכניסה לקבוצה הוא 15- כרגע, והוא יעלה ל-16- בשנת 2027."
    if re.search(r"סטטוס שלי|מה הסטטוס|איזה סטטוס", text):
        role = profile.get("role")
        return f"לפי הפרופיל המחובר, התפקיד שלך הוא {role}. לפרטי הסטטוס המלאים פתח את טאב סטטוס." if role else "כדי לבדוק את הסטטוס שלך, התחבר עם TikTok ופתח את טאב סטטוס."
    if "בעלים" in text:
        return "בעל הקבוצה הוא הבאן המקורי 👑."
    if re.search(r"מנהלת|מנהל", text):
        return "המנהלת היא shirel 👩‍💼."
    if re.search(r"סולם|צבע|סטטוס", text):
        return "סולם הסטטוס הוא: 🟢 הכול טוב, 🟡 אזהרה ראשונה, 🟠 אזהרה שנייה/בסיכון, 🔴 אזהרה חמורה/בסכנה, ⚫ באן, ☠️ חסימה לצמיתות."
    if re.search(r"חוק|חוקים", text):
        return "חוקי הבסיס: לא לספים, לא לקלל, לא לשנות שם או תמונת קבוצה, ואסור להזכיר את המדינות האסורות לפי חוקי הקבוצה."
    if "סקר" in text:
        return "סקר זמין רק בלוח העדכונים. הוא כולל שאלה, לפחות שתי תשובות וכפתור להוספת תשובות."
    if "אירוע" in text:
        return "פרסום אירוע כולל שם האירוע, תיאור, מתי יתחיל ומתי ייגמר."
    if re.search(r"קובץ|apk|100mb", text):
        return "בפרסום קובץ אסור להעלות APK או קובץ מעל 100MB."
    if re.search(r"לוח מודעות|מודעה|עדכון", text):
        return "לוח מודעות מיועד להודעות. לוח עדכונים דורש את הקוד מודעות9באן; סקרים זמינים רק בו."
    if re.search(r"חנות|paypal|תשלום", text):
        return "החנות כוללת תגים ושירותים שונים, והתשלום מתבצע דרך PayPal."
    return 'הבנתי. במה תרצה שאעזור? אפשר לכתוב שאלה או בקשה מלאה, למשל: "לאיזה משתמש אני מחובר?" או "מה גיל הכניסה?"'


def cookies(headers):
    result = {}
    for part in headers.get("Cookie", "").split(";"):
        if "=" in part:
            key, value = part.strip().split("=", 1)
            result[key] = urllib.parse.unquote(value)
    return result


def get_profile(headers):
    profile_id = cookies(headers).get("retzef_profile_id")
    url = os.environ.get("KV_REST_API_URL") or os.environ.get("UPSTASH_REDIS_REST_URL")
    token = os.environ.get("KV_REST_API_TOKEN") or os.environ.get("UPSTASH_REDIS_REST_TOKEN")
    if not profile_id or not url or not token:
        return None
    key = urllib.parse.quote("retzef:profile:" + profile_id.lower(), safe="")
    request = urllib.request.Request(f"{url.rstrip('/')}/get/{key}", headers={"Authorization": f"Bearer {token}"})
    try:
        with urllib.request.urlopen(request, timeout=4) as response:
            data = json.loads(response.read().decode("utf-8"))
        result = data.get("result")
        return json.loads(result) if isinstance(result, str) else result
    except Exception:
        return None


def model_answer(data):
    choices = data.get("choices") or []
    if choices and isinstance(choices[0], dict):
        message = choices[0].get("message") or {}
        answer = usable_answer(message.get("content"))
        if answer:
            return answer
    answer = usable_answer(data.get("output_text"))
    if answer:
        return answer
    output = data.get("output") or []
    values = []
    for item in output:
        if isinstance(item, dict):
            for content in item.get("content") or []:
                if isinstance(content, dict):
                    values.append(content.get("text") or "")
    return usable_answer("".join(values))


def ask_model(question, profile):
    key = os.environ.get("OPENAI_API_KEY") or os.environ.get("BUILT_IN_FORGE_API_KEY")
    if not key:
        return ""
    configured = os.environ.get("OPENAI_API_BASE") or os.environ.get("BUILT_IN_FORGE_API_URL") or "https://api.openai.com/v1"
    base = configured.rstrip("/")
    endpoint = base + "/chat/completions" if base.endswith("/v1") else base + "/v1/chat/completions"
    profile_text = (
        f"הפרופיל המחובר: display name={profile.get('displayName', '')}, username=@{profile.get('username', '')}, role={profile.get('role', 'member')}."
        if profile else "אין פרופיל TikTok מחובר."
    )
    system = (
        "אתה העוזר של רצף. קודם זהה את הכוונה של כל ההודעה ורק אחר כך ענה. "
        "אל תגיב לפי מילת מפתח בודדת. ענה לבקשה האמיתית של המשתמש. "
        "אם אין שאלה או בקשה ברורה, בקש ממנו לנסח במה לעזור. ענה בעברית, בקצרה ובדיוק. "
        "אם אין מידע אישי על מנוי, אמור זאת ואל תמציא. מידע קבוע: גיל כניסה 15- כרגע ו-16- ב-2027; "
        f"הבעלים הוא הבאן המקורי; המנהלת היא shirel; APK וקובץ מעל 100MB אסורים. {profile_text}"
    )
    payload = {
        "model": os.environ.get("AI_MODEL", "gpt-5-mini"),
        "messages": [{"role": "system", "content": system}, {"role": "user", "content": question}],
        "max_completion_tokens": 700,
    }
    request = urllib.request.Request(
        endpoint,
        data=json.dumps(payload, ensure_ascii=False).encode("utf-8"),
        headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=12) as response:
            data = json.loads(response.read().decode("utf-8"))
        return model_answer(data)
    except Exception:
        return ""


class handler(BaseHTTPRequestHandler):
    def _json(self, status, payload):
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_POST(self):
        try:
            length = int(self.headers.get("Content-Length", "0"))
            raw = self.rfile.read(length).decode("utf-8")
            data = json.loads(raw or "{}")
        except Exception:
            data = {}
        question = str(data.get("message") or "").strip()[:MAX_QUESTION_LENGTH]
        if not question:
            self._json(400, {"error": "message_required"})
            return
        profile = get_profile(self.headers)
        fallback = local_answer(question, profile)
        answer = ask_model(question, profile) or fallback
        self._json(200, {"answer": answer, "source": "model" if answer != fallback else "local"})

    def do_GET(self):
        self._json(405, {"error": "method_not_allowed"})

    def log_message(self, *_args):
        return
