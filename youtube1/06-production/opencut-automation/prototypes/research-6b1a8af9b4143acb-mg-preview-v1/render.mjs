#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {chromium} from 'playwright';

const HERE=import.meta.dirname, ROOT=path.resolve(HERE,'..','..'), PLAN=JSON.parse(fs.readFileSync(path.join(HERE,'mg-plan.json'),'utf8'));
const OUT=path.join(ROOT,'out','prototypes','research-6b1a8af9b4143acb-mg-preview-v1'), FRAMES=path.join(OUT,'frames');
const VIDEO=path.join(OUT,'research-6b1a8af9b4143acb-mg-preview-v1.mp4'), THUMB=path.join(OUT,'thumbnail.jpg'), CONTACT=path.join(OUT,'contact-sheet.jpg');
const AUDIO=path.join(ROOT,'out','newsroom','jobs','production-38b942bd6f69a92105bfd57952bee9da2d7f506a','project','narration','narration-final.m4a');
const hash=f=>crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
if(hash(AUDIO)!==PLAN.narration.audioSha256)throw new Error('Approved narration bytes changed');
fs.mkdirSync(FRAMES,{recursive:true});for(const f of fs.readdirSync(FRAMES))fs.rmSync(path.join(FRAMES,f),{force:true});
const edge='C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const browser=await chromium.launch({headless:true,executablePath:edge});
const workers=Array.from({length:6},async(_,worker)=>{const page=await browser.newPage({viewport:{width:1080,height:1920},deviceScaleFactor:1});const url=new URL(`file:///${path.join(HERE,'board.html').replaceAll('\\','/')}`);for(let frame=worker;frame<PLAN.canvas.frames;frame+=6){url.searchParams.set('frame',String(frame));await page.goto(url.href,{waitUntil:'load'});await page.evaluate(()=>document.fonts.ready);await page.screenshot({path:path.join(FRAMES,`frame-${String(frame+1).padStart(6,'0')}.png`),animations:'disabled'});if(frame%240===worker)process.stdout.write(`worker ${worker}: ${frame}/${PLAN.canvas.frames}\n`)}await page.close()});
await Promise.all(workers);await browser.close();
const ff=args=>execFileSync('ffmpeg',['-hide_banner','-loglevel','error','-y',...args],{stdio:'inherit',windowsHide:true});
ff(['-i',path.join(FRAMES,'frame-000817.png'),'-vf','scale=540:960:flags=lanczos','-q:v','3',THUMB]);
ff(['-framerate','24','-i',path.join(FRAMES,'frame-%06d.png'),'-vf',"select='not(mod(n\\,112))',scale=270:480:flags=lanczos,tile=4x3",'-frames:v','1','-q:v','4',CONTACT]);
ff(['-framerate','24','-i',path.join(FRAMES,'frame-%06d.png'),'-i',AUDIO,'-map','0:v:0','-map','1:a:0','-frames:v','1344','-r','24','-c:v','libx264','-preset','medium','-crf','18','-pix_fmt','yuv420p','-c:a','aac','-b:a','160k','-movflags','+faststart',VIDEO]);
const assets=PLAN.cuts.filter(c=>c.asset).map(c=>({cutId:c.id,path:c.asset,sha256:hash(path.join(HERE,c.asset))}));
const manifest={schema:'police-father-mg-preview-creator-v1',nonAuthoritative:true,privateOnly:true,headlineStatus:PLAN.headlineStatus,canvas:PLAN.canvas,narration:PLAN.narration,policy:PLAN.policy,cuts:PLAN.cuts,assets,outputs:{video:{path:VIDEO,sha256:hash(VIDEO)},thumbnail:{path:THUMB,sha256:hash(THUMB)},contactSheet:{path:CONTACT,sha256:hash(CONTACT)}}};
fs.writeFileSync(path.join(OUT,'creator-manifest.json'),JSON.stringify(manifest,null,2)+'\n','utf8');fs.rmSync(FRAMES,{recursive:true,force:true});console.log(JSON.stringify(manifest.outputs,null,2));
