#!/usr/bin/env node
const fs=require('fs'), path=require('path');
const requested=process.argv[2]||'patch';
const source=process.argv.slice(3).join(' ').trim();
let mode=requested, description=process.env.RETZEF_CHANGELOG||'';
if(requested==='auto'){
  const msg=source.toLowerCase();
  const addition=/(feat|feature|add|added|new|נוסף|הוספ|תכונה|שיפור משמעותי|יכולת חדשה)/i.test(msg);
  mode=addition?'minor':'patch';
  if(/profile|display.?name|client.?public|חיפוש|פרופיל|public/i.test(msg)) description=addition?'נוסף חיפוש פרופילים לפי Display Name ונוספו הרשאות Client Public קבועות.':'תוקנו הרשאות פרופיל וחשיפת Client Public.';
  else if(/discord/i.test(msg)) description=addition?'נוספה והותאמה התחברות Discord בממשק.':'תוקנה התחברות Discord.';
  else if(/fix|bug|תיקון|תקלה|שגיאה/i.test(msg)) description='תוקנו תקלות ושופרה יציבות המערכת.';
  else description=addition?'נוספה יכולת חדשה במערכת.':'תוקנו תקלות ושופרה יציבות המערכת.';
}
if(!['major','minor','patch'].includes(mode)) throw new Error('Use major, minor, patch, or auto');
if(!description) description=mode==='minor'?'נוספה יכולת חדשה במערכת.':mode==='major'?'עודכן מבנה מרכזי של האפליקציה.':'תוקנו תקלות ושופרה יציבות המערכת.';
const file=path.join(__dirname,'..','index.html'); let out=fs.readFileSync(file,'utf8');
const m=out.match(/window\.RETZEF_VERSION\s*=\s*["'](\d+)\.(\d+)\.(\d+)["']/); if(!m) throw new Error('RETZEF_VERSION marker not found');
let [major,minor,patch]=m.slice(1).map(Number); if(mode==='major'){major++;minor=0;patch=0;} else if(mode==='minor'){minor++;patch=0;} else patch++;
const next=`${major}.${minor}.${patch}`;
out=out.replace(/window\.RETZEF_VERSION\s*=\s*["']\d+\.\d+\.\d+["']/,`window.RETZEF_VERSION='${next}'`);
out=out.replace(/(<span id="retzef-version-value"[^>]*>)[^<]*(<\/span>)/,`$1${next}$2`);
const safe=description.replace(/[<>]/g,'').replace(/\s+/g,' ').trim();
out=out.replace(/(<ul[^>]*data-retzef-changelog[^>]*>)/,`$1\n        <li>${next} — ${safe}</li>`);
fs.writeFileSync(file,out); console.log(`Retzef version: ${next} (${mode}) — ${safe}`);
