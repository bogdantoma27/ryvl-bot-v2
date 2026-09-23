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
      const fulfill=options=>route.fulfill({...options,headers:{'access-control-allow-origin':'*'}});
      if(url.pathname==='/api/vpg/performance') {
        if(unavailable)return fulfill({status:503,json:{message:'test outage'}});
        const result=structuredClone(data);result.activeCompetition=url.searchParams.get('competition')||'Superliga-Romania';
        if(empty){result.recentResults=[];result.upcomingFixtures=[];result.standings=[];}
        return fulfill({json:result});
      }
      if(url.pathname==='/api/vpg/superliga/today')return fulfill({json:{date:'2026-09-23',season:2,results:[match],fixtures:[fixture],updatedAt:'2026-09-23T20:00:00Z'}});
      if(url.pathname==='/api/auth/me')return fulfill({status:401,json:{message:'Sign in required'}});
      return fulfill({json:{guilds:[],results:[],fixtures:[],standings:[],transfers:[]}});
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
    await page.getByRole('link',{name:'Privacy Policy',exact:true}).click();await expect(page.getByRole('heading',{name:'Privacy Policy',exact:true})).toBeVisible();await expect(page.getByText('Public browsing does not require an account.',{exact:true})).toBeVisible();count++;
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
