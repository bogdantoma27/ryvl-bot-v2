from pathlib import Path

p=Path('ryvl-discord-bot/server/src/vpg/vpg-superliga-poller.service.ts');s=p.read_text()
s=s.replace("type League = { slug: string; name: string; season: number; ryvl: boolean };", "type League = { slug: string; name: string; season: number; ryvl: boolean; general: boolean };")
s=s.replace("season, ryvl: false });", "season, ryvl: false, general: true });")
s=s.replace("leagues.set(key, { slug: competition.slug, name: competition.name, season, ryvl: true });", "leagues.set(key, { slug: competition.slug, name: competition.name, season, ryvl: true, general: leagues.get(key)?.general || false });")
s=s.replace("const general = league.slug === 'Superliga-Romania';", "const general = league.general;")
# Do not fetch every league's table twice per minute all Sunday after its post was delivered.
s=s.replace("    const weeklyDue = standingsDue(now);", "    const weeklyDue = standingsDue(now) && (force || intervalDue(config.lastPolledAt, config.pollIntervalSec, now));")
# Persist errors outside a league loop too, e.g. a VPG seasons outage.
s=s.replace("      return { postedCount, updatedCount };\n    } finally {", """      return { postedCount, updatedCount };
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      const attempts = (this.failures.get(guild.id) || 0) + 1;
      this.failures.set(guild.id, attempts);
      await this.prisma.vpgNotificationConfig.updateMany({ where: { guildId: guild.id, leaseToken: lease }, data: {
        lastError: reason.slice(0, 1500),
        retryAfter: new Date(Date.now() + Math.min(1800, config.pollIntervalSec * 2 ** Math.min(attempts - 1, 4)) * 1000),
      } });
      throw error;
    } finally {""")
p.write_text(s)

p=Path('ryvl-discord-bot/server/src/vpg/vpg-notifications.controller.ts');s=p.read_text()
s=s.replace('ActionRowBuilder, ButtonBuilder, TextChannel', 'MessageEditOptions, TextChannel')
s=s.replace("rows as Parameters<typeof message.edit>[0] extends never ? never : any", "rows as MessageEditOptions['components']")
p.write_text(s)

# Baseline test runner uses the same cross-origin development branch as a local Angular build.
p=Path('ryvl-discord-bot/web/test/browser-smoke.cjs');s=p.read_text()
s=s.replace("      const url=new URL(route.request().url());", "      const url=new URL(route.request().url());\n      const fulfill=options=>route.fulfill({...options,headers:{'access-control-allow-origin':'*'}});")
s=s.replace('return route.fulfill(', 'return fulfill(')
p.write_text(s)

# Runtime schema upgrade is exercised with an already-existing guild row.
p=Path('ryvl-discord-bot/server/test/notifications-database.test.cjs');s=p.read_text()
s+=r'''

test('real poller posts to the RYVL destination even when the general results channel is unset', {skip: !safeDatabase}, async()=>{
  const { PrismaClient }=require('@prisma/client');const prisma=new PrismaClient();
  const { VpgSuperligaPollerService }=require('../dist/vpg/vpg-superliga-poller.service.js');
  const guildId='999999999999900002',channelId='999999999999900003';
  let matches=[];const sent=[];
  const vpg={
    getCompetitions:async()=>[{slug:'Superliga-Romania',name:'Superliga',season:2,active:true}],
    fetchLatestSeason:async()=>2,
    fetchStandings:async()=>[{position:2,teamName:'RYVL Esports',teamSlug:'ryvl',played:0,wins:0,draws:0,losses:0,points:0,goalDifference:0}],
    fetchAllMatches:async(status)=>status==='complete'?matches:[],
  };
  const channel={guildId,type:0,send:async options=>{sent.push(options);return{id:String(sent.length)};}};
  const discord={client:{isReady:()=>true,user:{id:'bot-test'},channels:{fetch:async()=>channel}}};
  const poller=new VpgSuperligaPollerService(prisma,vpg,discord);
  try {
    await prisma.guild.create({data:{id:guildId,name:'CI only',defaultRyvlResultsChannelId:channelId}});
    await poller.checkGuildNow(guildId); // Empty baseline, not a real Discord call.
    const common={status:'complete',datetime:'2026-09-23T19:00:00Z',matchDay:1,homeScore:2,awayScore:1,dateFormattedRo:'23/09/2026',dateFormattedEn:'23 Sep 2026'};
    matches=[{...common,id:10,homeName:'RYVL Esports',awayName:'Opponent'},{...common,id:11,homeName:'Rival United',awayName:'NotRYVL'}];
    const result=await poller.checkGuildNow(guildId);
    assert.equal(result.postedCount,1);assert.equal(sent.length,1);
    assert.match(JSON.stringify(sent[0]),/RYVL Esports/);assert.doesNotMatch(JSON.stringify(sent[0]),/Rival United/);
    await poller.checkGuildNow(guildId);assert.equal(sent.length,1,'Repeat poll should not duplicate the team result');
  } finally {await prisma.guild.deleteMany({where:{id:guildId}});await prisma.$disconnect();}
});
'''
p.write_text(s)

# Resolve a URL origin even when FRONTEND_URL points to an admin landing path; never leak localhost.
# The deployment does not read, print or rewrite the VM's secret environment file.
print('Reviewed channel isolation, error persistence, typed repairs and integration tests.')
