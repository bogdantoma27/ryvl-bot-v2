from pathlib import Path

def put(path, content):
    p=Path(path);p.parent.mkdir(parents=True, exist_ok=True);p.write_text(content.lstrip('\n'), encoding='utf-8')

put('ryvl-discord-bot/server/test/notification-policy.test.cjs', r'''
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const policy = require('../dist/vpg/notification-policy.js');
const { buildClubWebUrl } = require('../dist/config/public-url.js');

test('strict RYVL aliases normalize case/spacing but exclude look-alike teams', () => {
  for (const name of ['RYVL', 'RYVL Esports', '  ryvl   ESPORTS ', 'ＲＹＶＬ']) assert.equal(policy.isRyvlTeam(name), true, name);
  for (const name of ['Rival United', 'NotRYVL', 'RYVL Academy', 'RYVL Esports B', '', null]) assert.equal(policy.isRyvlTeam(name), false, String(name));
});
test('a resolved team slug takes precedence when match slugs exist', () => {
  const identity = policy.resolveRyvlIdentity([{teamName:'RYVL Esports',teamSlug:'actual-ryvl'}]);
  assert.equal(policy.isRyvlSide('RYVL Esports', 'another-club', identity), false);
  assert.equal(policy.isRyvlSide('Renamed club', 'actual-ryvl', identity), true);
  assert.equal(policy.isRyvlSide(' ryvl ', null, identity), true);
});
test('Sunday post starts at 10:00 Romania during summer time', () => {
  assert.equal(policy.standingsDue(new Date('2026-09-27T06:59:59Z')), false);
  assert.equal(policy.standingsDue(new Date('2026-09-27T07:00:00Z')), true);
  assert.equal(policy.standingsDue(new Date('2026-09-28T07:00:00Z')), false);
});
test('Sunday post remains at 10:00 Romania after daylight saving ends', () => {
  assert.equal(policy.standingsDue(new Date('2026-11-01T07:59:59Z')), false);
  assert.equal(policy.standingsDue(new Date('2026-11-01T08:00:00Z')), true);
  assert.equal(policy.standingsDue(new Date('2026-10-25T08:00:00Z')), true);
});
test('daily fixture filtering uses Romanian midnight, deduplicates and ignores invalid dates', () => {
  const rows = [{id:1,datetime:'2026-09-22T20:59:59Z'}, {id:2,datetime:'2026-09-22T21:00:00Z'}, {id:3,datetime:'2026-09-23T20:59:59Z'}, {id:4,datetime:'2026-09-23T21:00:00Z'}, {id:5,datetime:'invalid'}];
  assert.deepEqual(policy.fixturesOnDay([...rows,rows[1]], '2026-09-23').map(m=>m.id), [2,3]);
});
test('daily fixture schedule is configurable without changing server timezone', () => {
  assert.equal(policy.dailyTimeReached(new Date('2026-09-23T06:59:00Z'), '10:00'), false);
  assert.equal(policy.dailyTimeReached(new Date('2026-09-23T07:00:00Z'), '10:00'), true);
  assert.equal(policy.dailyTimeReached(new Date('2026-09-23T07:00:00Z'), '12:30'), false);
});
test('poll interval uses elapsed time and first check is immediately due', () => {
  const now = new Date('2026-09-23T10:00:00Z');
  assert.equal(policy.intervalDue(null, 120, now), true);
  assert.equal(policy.intervalDue(new Date('2026-09-23T09:58:01Z'), 120, now), false);
  assert.equal(policy.intervalDue(new Date('2026-09-23T09:58:00Z'), 120, now), true);
});
test('notification settings reject unexpected fields and unsafe intervals', () => {
  assert.deepEqual(policy.validateNotificationSettings({pollIntervalSec:120,fixturesTime:'10:00',resultsEnabled:true}), {pollIntervalSec:120,fixturesTime:'10:00',resultsEnabled:true});
  for (const value of [{pollIntervalSec:0},{pollIntervalSec:3601},{pollIntervalSec:'120'},{fixturesTime:'25:00'},{resultsEnabled:'true'},{guildId:'another-guild'}]) assert.throws(()=>policy.validateNotificationSettings(value));
});
test('club button uses FRONTEND_URL for both Oracle IP and a later custom domain', () => {
  assert.equal(buildClubWebUrl('http://130.61.228.100', '12345'), 'http://130.61.228.100/club?guildId=12345');
  assert.equal(buildClubWebUrl('https://app.example.com/', '12345'), 'https://app.example.com/club?guildId=12345');
  assert.throws(()=>buildClubWebUrl('ftp://example.com', '12345'));
});
''')

put('ryvl-discord-bot/server/test/notification-delivery.test.cjs', r'''
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { deliverResults, deliverSnapshot, collectPages, notificationNonce } = require('../dist/vpg/notification-delivery.js');
// In-memory storage implements the same receipt contract as PostgreSQL; assertions inspect delivery outcomes.
class Store {
  constructor(rows = new Map()) { this.rows=rows; }
  async get(key) { return this.rows.get(key)||null; }
  async save(row) { this.rows.set(row.key, {...row}); }
  async baseline(rows) { for(const row of rows) if(!this.rows.has(row.key)) this.rows.set(row.key,{...row}); }
}
const match=(id,score=2)=>({id,datetime:'2026-09-23T19:00:00Z',status:'complete',homeName:'RYVL Esports',awayName:'Other',homeScore:score,awayScore:1,matchDay:1});
const run=(store,matches,send)=>deliverResults({store,matches,send,season:2,scope:'ryvl'});

test('initial history is baselined without posting it', async()=>{
  const store=new Store();const sent=[];
  const result=await run(store,[match(1),match(2)],async m=>{sent.push(m.id);return 'msg';});
  assert.equal(result.baselined,true);assert.deepEqual(sent,[]);
  await run(store,[match(1),match(2),match(3)],async m=>{sent.push(m.id);return 'msg3';});
  assert.deepEqual(sent,[3]);
});
test('an empty initial season does not swallow the first future result',async()=>{
  const store=new Store();await run(store,[],async()=>{throw Error('unexpected');});
  const sent=[];await run(store,[match(1)],async m=>{sent.push(m.id);return 'msg1';});
  assert.deepEqual(sent,[1]);
});
test('receipt persistence prevents duplicate posts after a service restart',async()=>{
  const store=new Store();await run(store,[],async()=> '');let sends=0;
  await run(store,[match(1)],async()=>{sends++;return 'msg1';});
  await run(new Store(store.rows),[match(1)],async()=>{sends++;return 'unexpected';});
  assert.equal(sends,1);
});
test('failed Discord delivery remains unprocessed and is retried',async()=>{
  const store=new Store();await run(store,[],async()=> '');
  const failed=await run(store,[match(1)],async()=>{throw Error('temporary outage');});
  assert.equal(failed.errors.length,1);assert.equal(await store.get('2:1'),null);
  const result=await run(store,[match(1)],async()=> 'recovered');
  assert.equal(result.postedCount,1);assert.equal((await store.get('2:1')).messageId,'recovered');
});
test('general and RYVL channels have independent delivery and retry receipts',async()=>{
  const general=new Store(),ryvl=new Store();
  await run(general,[],async()=> '');await run(ryvl,[],async()=> '');
  await run(general,[match(1)],async()=> 'general-message');
  await run(ryvl,[match(1)],async()=>{throw Error('RYVL channel permission problem');});
  let generalRepeat=false;await run(general,[match(1)],async()=>{generalRepeat=true;return '';});
  const retry=await run(ryvl,[match(1)],async()=> 'ryvl-message');
  assert.equal(generalRepeat,false);assert.equal(retry.postedCount,1);
});
test('a corrected score edits the tracked message instead of creating another',async()=>{
  const store=new Store();await run(store,[],async()=> '');
  await run(store,[match(1)],async()=> 'original');
  let previous;const result=await run(store,[match(1,3)],async(m,id)=>{previous=id;assert.equal(m.homeScore,3);return id;});
  assert.equal(previous,'original');assert.equal(result.updatedCount,1);assert.equal(result.postedCount,0);
});
test('unconfirmed or null-score matches are never announced as results',async()=>{
  const store=new Store();await run(store,[],async()=> '');let calls=0;
  await run(store,[{...match(1),homeScore:null},{...match(2),status:'scheduled'}],async()=>{calls++;return '';});
  assert.equal(calls,0);
});
test('daily fixtures do not post empty days and late additions edit the existing post',async()=>{
  const store=new Store();let calls=0,previous;
  const send=async id=>{calls++;previous=id;return 'daily-message';};
  assert.equal(await deliverSnapshot({store,key:'today',version:[],empty:true,send}),false);
  await deliverSnapshot({store,key:'today',version:[1],send});
  await deliverSnapshot({store,key:'today',version:[1,2],send});
  await deliverSnapshot({store,key:'today',version:[1,2],send});
  assert.equal(calls,2);assert.equal(previous,'daily-message');
});
test('weekly standings are posted once even if Sunday scheduler runs repeatedly',async()=>{
  const store=new Store();let calls=0;const send=async()=>{calls++;return 'weekly';};
  await deliverSnapshot({store,key:'sunday-1',version:1,once:true,send});
  await deliverSnapshot({store,key:'sunday-1',version:2,once:true,send});
  await deliverSnapshot({store,key:'sunday-2',version:2,once:true,send});
  assert.equal(calls,2);
});
test('pagination includes matches after the first API page',async()=>{
  const rows=Array.from({length:45},(_,i)=>({id:i+1}));
  const result=await collectPages(async(limit,offset)=>rows.slice(offset,offset+limit));
  assert.equal(result.length,45);assert.equal(result[44].id,45);
});
test('partial/repeated pagination fails instead of committing an incomplete baseline',async()=>{
  const rows=Array.from({length:20},(_,i)=>({id:i+1}));
  await assert.rejects(collectPages(async()=>rows),/repeated/);
  await assert.rejects(collectPages(async(limit,offset)=>{if(offset)throw Error('API outage');return rows;}),/API outage/);
});
test('Discord retry nonce is deterministic and fits the API limit',()=>{
  assert.equal(notificationNonce('same'),notificationNonce('same'));
  assert.notEqual(notificationNonce('same'),notificationNonce('different'));
  assert.ok(notificationNonce('same').length<=25);
});
''')

put('ryvl-discord-bot/server/test/notifications-database.test.cjs', r'''
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const safeDatabase = process.env.RUN_DATABASE_TESTS === '1' && /^postgres(?:ql)?:\/\/[^@]+@(?:localhost|127\.0\.0\.1):5432\/ryvl_ci(?:\?|$)/.test(process.env.DATABASE_URL || '');
test('additive notification schema preserves guild channels and persists independent receipts', {skip: !safeDatabase}, async()=>{
  const { PrismaClient }=require('@prisma/client');const prisma=new PrismaClient();
  const guildId='999999999999900001';
  try {
    const guild=await prisma.guild.upsert({where:{id:guildId},create:{id:guildId,name:'CI only',defaultFixturesChannelId:'keep-this-channel'},update:{}});
    await prisma.vpgNotificationConfig.upsert({where:{guildId},create:{guildId},update:{pollIntervalSec:180}});
    const config=await prisma.vpgNotificationConfig.findUnique({where:{guildId}});
    assert.equal(config.fixturesTime,'10:00');assert.ok(config.pollIntervalSec>=120);
    assert.equal((await prisma.guild.findUnique({where:{id:guildId}})).defaultFixturesChannelId,'keep-this-channel');
    for(const channelId of ['general','ryvl']) await prisma.vpgNotificationDelivery.upsert({
      where:{guildId_channelId_topic_itemKey:{guildId,channelId,topic:'result:test',itemKey:'2:100'}},
      create:{guildId,channelId,topic:'result:test',itemKey:'2:100',fingerprint:'value',discordMessageId:channelId},update:{},
    });
    assert.equal(await prisma.vpgNotificationDelivery.count({where:{guildId,topic:'result:test'}}),2);
    const now=new Date();
    await prisma.vpgNotificationConfig.update({where:{guildId},data:{leaseUntil:null,leaseToken:null}});
    const acquire=token=>prisma.vpgNotificationConfig.updateMany({where:{guildId,OR:[{leaseUntil:null},{leaseUntil:{lt:now}}]},data:{leaseToken:token,leaseUntil:new Date(Date.now()+60000)}});
    const concurrent=await Promise.all([acquire('one'),acquire('two')]);
    assert.equal(concurrent.reduce((n,r)=>n+r.count,0),1,'Only one overlapping poller may hold the database lease');
  } finally {await prisma.guild.deleteMany({where:{id:guildId}});await prisma.$disconnect();}
});
''')

put('ryvl-discord-bot/web/test/browser-smoke.cjs', r'''
'use strict';
// Run against the production Angular build with deterministic API fixtures; no Discord writes.
const fs=require('node:fs');const path=require('node:path');const http=require('node:http');const assert=require('node:assert/strict');
const {chromium,expect}=require(path.join(process.env.PLAYWRIGHT_NODE_PATH || process.cwd()+'/node_modules','@playwright/test'));
const browserDir=path.resolve(__dirname,'../dist/web/browser');const root=fs.existsSync(path.join(browserDir,'index.html'))?browserDir:path.resolve(__dirname,'../dist/web');
const contentTypes={'.html':'text/html','.js':'application/javascript','.css':'text/css','.png':'image/png','.svg':'image/svg+xml','.ico':'image/x-icon','.woff2':'font/woff2'};
const server=http.createServer((req,res)=>{
  const pathname=new URL(req.url,'http://localhost').pathname;
  const file=path.resolve(root,'.'+decodeURIComponent(pathname));
  if(!file.startsWith(root+path.sep)&&file!==root){res.writeHead(403);return res.end();}
  const target=fs.existsSync(file)&&fs.statSync(file).isFile()?file:path.join(root,'index.html');
  res.setHeader('Content-Type',contentTypes[path.extname(target)]||'application/octet-stream');res.end(fs.readFileSync(target));
});
const fixture={id:10,datetime:'2026-09-23T19:00:00Z',status:'scheduled',matchDay:3,homeName:'RYVL Esports',awayName:'Test Opponent',homeScore:null,awayScore:null};
const match={...fixture,id:11,status:'complete',homeScore:3,awayScore:1};
const record={played:1,wins:1,draws:0,losses:0,goalsFor:3,goalsAgainst:1};
const data={teamName:'RYVL Esports',activeCompetition:'Superliga-Romania',competitions:[{id:'one',slug:'Superliga-Romania',name:'Superliga România',season:2,active:true},{id:'two',slug:'cup-test',name:'Test Cup',season:1,active:true}],stats:{competitionName:'Superliga România',competitionSlug:'Superliga-Romania',played:1,wins:1,draws:0,losses:0,points:3,winRate:100,goalsFor:3,goalsAgainst:1,goalDifference:2,goalsPerMatch:3,concededPerMatch:1,cleanSheets:0,currentStreak:['W'],homeRecord:record,awayRecord:{...record,played:0,wins:0},standingsPosition:2,totalTeams:2},recentResults:[match],upcomingFixtures:[fixture],standings:[{position:1,teamName:'Other Club',teamSlug:'other',played:2,wins:2,draws:0,losses:0,scoreFor:6,scoreAgainst:1,goalDifference:5,points:6},{position:2,teamName:'RYVL Esports',teamSlug:'ryvl',played:1,wins:1,draws:0,losses:0,scoreFor:3,scoreAgainst:1,goalDifference:2,points:3}],warnings:[]};
(async()=>{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const origin='http://127.0.0.1:'+server.address().port;
  const executable=['/usr/bin/google-chrome','/usr/bin/chromium','/usr/bin/chromium-browser'].find(fs.existsSync);
  const browser=await chromium.launch({headless:true,...(executable?{executablePath:executable}:{}),args:['--no-sandbox']});
  let count=0;
  try {
    const context=await browser.newContext({viewport:{width:1440,height:1000}});
    const page=await context.newPage();const errors=[];page.on('pageerror',error=>errors.push(error.message));
    let unavailable=false,empty=false;
    await page.route('**/api/**', async route=>{
      const url=new URL(route.request().url());
      if(url.pathname==='/api/vpg/performance') {
        if(unavailable)return route.fulfill({status:503,json:{message:'test outage'}});
        const result=structuredClone(data);result.activeCompetition=url.searchParams.get('competition')||'Superliga-Romania';
        if(empty){result.recentResults=[];result.upcomingFixtures=[];result.standings=[];}
        return route.fulfill({json:result});
      }
      if(url.pathname==='/api/vpg/superliga/today')return route.fulfill({json:{date:'2026-09-23',season:2,results:[match],fixtures:[fixture],updatedAt:'2026-09-23T20:00:00Z'}});
      if(url.pathname==='/api/auth/me')return route.fulfill({status:401,json:{message:'Sign in required'}});
      return route.fulfill({json:{guilds:[],results:[],fixtures:[],standings:[],transfers:[]}});
    });
    await page.goto(origin+'/performance');
    await expect(page.getByRole('heading',{name:'Team performance',exact:true})).toBeVisible();
    await expect(page.getByRole('tab',{name:'Overview',exact:true})).toHaveAttribute('aria-selected','true');count++;
    await page.getByRole('tab',{name:'Match Results',exact:true}).click();
    await expect(page.getByRole('heading',{name:'RYVL match results',exact:true})).toBeVisible();assert.equal(new URL(page.url()).pathname,'/performance');count++;
    await page.getByRole('button',{name:'Test Cup',exact:true}).click();
    await expect(page.getByRole('heading',{name:'RYVL match results',exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'Test Cup',exact:true})).toHaveAttribute('aria-pressed','true');count++;
    await page.getByRole('tab',{name:'Fixtures',exact:true}).click();await expect(page.getByRole('heading',{name:'RYVL fixtures',exact:true})).toBeVisible();count++;
    await page.getByRole('tab',{name:'League Table',exact:true}).click();await expect(page.getByRole('table')).toBeVisible();await expect(page.getByRole('rowheader',{name:'RYVL Esports',exact:true})).toBeVisible();count++;
    await page.getByRole('tab',{name:'League Table',exact:true}).press('Home');await expect(page.getByRole('tab',{name:'Overview',exact:true})).toBeFocused();count++;
    await expect(page.getByRole('link',{name:/All Results|Full Calendar/})).toHaveCount(0);await expect(page.getByRole('link',{name:'Competitions',exact:true})).toHaveCount(0);count++;
    await expect(page.getByRole('link',{name:'YouTube ↗',exact:true})).toHaveAttribute('href','https://www.youtube.com/@ryvlesports');await expect(page.getByRole('link',{name:'Twitch ↗',exact:true})).toHaveAttribute('href','https://twitch.tv/ryvlesports');count++;
    await page.getByRole('link',{name:'Privacy Policy',exact:true}).click();await expect(page.getByRole('heading',{name:'Privacy Policy',exact:true})).toBeVisible();await expect(page.getByText('ryvl_token',{exact:true})).toBeVisible();count++;
    await page.getByRole('link',{name:'Terms of Service',exact:true}).click();await expect(page.getByRole('heading',{name:'Terms of Service',exact:true})).toBeVisible();count++;
    await page.goto(origin+'/live');await expect(page.getByRole('heading',{name:'Match Center',exact:true})).toBeVisible();assert.equal(new URL(page.url()).pathname,'/match-center');await expect(page.getByText(/TRAINING & PREPARATION DAY|Next Game Night/)).toHaveCount(0);count++;
    await page.goto(origin+'/competitions');await expect(page.getByRole('heading',{name:'Team performance',exact:true})).toBeVisible();assert.equal(new URL(page.url()).pathname,'/performance');count++;
    await page.goto(origin+'/about');await expect(page.getByText('Manual 11v11',{exact:true})).toHaveCount(0);await expect(page.getByText('Tier 1 Circuit',{exact:true})).toHaveCount(0);count++;
    await page.goto(origin+'/');await expect(page.getByText('#WERYVL • VPG SUPERLIGA ROMÂNIA',{exact:true})).toHaveCount(0);count++;
    unavailable=true;await page.goto(origin+'/performance');await expect(page.getByRole('alert')).toBeVisible();unavailable=false;await page.getByRole('button',{name:'Try again',exact:true}).click();await expect(page.getByRole('heading',{name:'Recent form',exact:true})).toBeVisible();count++;
    empty=true;await page.getByRole('button',{name:'Refresh',exact:true}).click();await page.getByRole('tab',{name:'Fixtures',exact:true}).click();await expect(page.getByText('No upcoming RYVL fixtures in this competition yet.',{exact:true})).toBeVisible();empty=false;count++;
    await page.setViewportSize({width:375,height:812});await page.goto(origin+'/performance');await expect(page.getByRole('heading',{name:'Team performance',exact:true})).toBeVisible();
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1),'Mobile viewport must not overflow horizontally');
    await page.getByRole('button',{name:'Toggle navigation',exact:true}).click();await expect(page.locator('#public-mobile-navigation')).toBeVisible();await page.locator('#public-mobile-navigation').getByRole('link',{name:'Match Center',exact:true}).click();await expect(page.locator('#public-mobile-navigation')).toHaveCount(0);count++;
    assert.deepEqual(errors,[],'No Angular runtime errors');
    console.log(`Browser smoke checks passed: ${count} scenarios (desktop + mobile).`);
    await context.close();
  } finally {await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);server.close();process.exitCode=1;});
''')
print('Prepared scheduling, delivery, database and real-browser regression tests.')
