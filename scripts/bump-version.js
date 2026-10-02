#!/usr/bin/env node
const fs=require('fs'), path=require('path');
const mode=process.argv[2]||'patch';
const file=path.join(__dirname,'..','index.html');
let out=fs.readFileSync(file,'utf8');
const m=out.match(/window\.RETZEF_VERSION\s*=\s*["'](\d+)\.(\d+)\.(\d+)["']/);
if(!m) throw new Error('RETZEF_VERSION marker not found');
let [major,minor,patch]=m.slice(1).map(Number);
if(mode==='major'){major++;minor=0;patch=0;} else if(mode==='minor'){minor++;} else if(mode==='patch'){patch++;} else throw new Error('Use major, minor, or patch');
const next=`${major}.${minor}.${patch}`;
out=out.replace(/window\.RETZEF_VERSION\s*=\s*["']\d+\.\d+\.\d+["']/,`window.RETZEF_VERSION='${next}'`);
out=out.replace(/(<span id="retzef-version-value"[^>]*>)[^<]*(<\/span>)/,`$1${next}$2`);
out=out.replace(/(<ul[^>]*data-retzef-changelog[^>]*>)/,`$1\n        <li>${next} — עדכון גרסה אוטומטי ותיקוני מערכת.</li>`);
fs.writeFileSync(file,out); console.log(`Retzef version: ${next}`);
