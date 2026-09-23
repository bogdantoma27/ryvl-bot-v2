from pathlib import Path

p=Path('ryvl-discord-bot/server/src/vpg/vpg-superliga-poller.service.ts');s=p.read_text()
if 'private readonly weeklyAttempts' not in s:
    s=s.replace('  private readonly active = new Set<string>();','  private readonly active = new Set<string>();\n  private readonly weeklyAttempts = new Map<string, Date>();')
    s=s.replace("    const weeklyDue = standingsDue(now) && (force || intervalDue(config.lastPolledAt, config.pollIntervalSec, now));", "    const weeklyDue = standingsDue(now) && (force || intervalDue(this.weeklyAttempts.get(guild.id), config.pollIntervalSec, now));")
    s=s.replace('    this.active.add(guild.id);','    this.active.add(guild.id);\n    if (weeklyDue) this.weeklyAttempts.set(guild.id, now);')
    s=s.replace("          const table = await this.cached(`table:${league.slug}:${league.season}`, () => this.vpgService.fetchStandings(league.season, league.slug));", """          // Result delivery must not depend on the standings endpoint being available.
          // When slugs are unavailable, the exact RYVL aliases remain the safe fallback.
          let table: VpgStandingsRow[] = [];
          try {
            table = await this.cached(`table:${league.slug}:${league.season}`, () => this.vpgService.fetchStandings(league.season, league.slug));
          } catch (error) {
            if (weeklyDue) errors.push(`Standings unavailable for ${league.name}`);
            this.logger.warn(`Standings unavailable for ${league.slug}; using exact team-name matching for results.`);
          }""")
    p.write_text(s)

p=Path('ryvl-discord-bot/server/src/vpg/vpg.service.ts');s=p.read_text()
s=s.replace("import { collectPages } from './notification-delivery';", "import { collectPages, completedResult } from './notification-delivery';")
s=s.replace("    const ryvlMatches = allMatches.filter(\n      (m) => isRyvlMatch(m, identity),", "    const ryvlMatches = allMatches.filter(\n      (m) => isRyvlMatch(m, identity) && completedResult(m),")
s=s.replace("    const list = Array.isArray(json?.data) ? json.data : Array.isArray(json) ? json : [];", "    if (!Array.isArray(json?.data) && !Array.isArray(json)) throw new Error('VPG returned an invalid match page');\n    const list = Array.isArray(json?.data) ? json.data : json;")
p.write_text(s)

# Keep the requested modern Angular control-flow formatting consistent.
for folder in ['public','performance']:
    for p in Path(f'ryvl-discord-bot/web/src/app/features/{folder}').glob('*.ts'):
        s=p.read_text().replace('@for(', '@for (').replace('@if (', '@if(')
        p.write_text(s)

p=Path('ryvl-discord-bot/web/src/app/features/performance/vpg-notifications.component.ts');s=p.read_text()
s=s.replace("    if (!guildId || guildId === 'default') return;", "    if (!guildId || guildId === 'default') { this.loading.set(false); return; }")
p.write_text(s)

p=Path('ryvl-discord-bot/server/test/notifications-database.test.cjs');s=p.read_text()
if 'Sunday 10:00 job is not delayed by a recent results poll' not in s:
    s+=r'''

test('Sunday 10:00 job is not delayed by a recent results poll', {skip: !safeDatabase}, async(t)=>{
  const { PrismaClient }=require('@prisma/client');const prisma=new PrismaClient();
  const { VpgSuperligaPollerService }=require('../dist/vpg/vpg-superliga-poller.service.js');
  const guildId='999999999999900010',channelId='999999999999900011';let sends=0;
  const vpg={getCompetitions:async()=>[],fetchLatestSeason:async()=>2,fetchAllMatches:async()=>[],fetchStandings:async()=>[
    {position:1,teamName:'RYVL Esports',teamSlug:'ryvl',played:1,wins:1,draws:0,losses:0,points:3,scoreFor:2,scoreAgainst:1,goalDifference:1},
  ]};
  const channel={guildId,type:0,send:async()=>({id:String(++sends)})};
  const discord={client:{isReady:()=>true,user:{id:'bot-test'},channels:{fetch:async()=>channel}}};
  const poller=new VpgSuperligaPollerService(prisma,vpg,discord);
  try {
    await prisma.guild.create({data:{id:guildId,name:'CI Sunday',defaultStandingsChannelId:channelId}});
    await prisma.vpgNotificationConfig.create({data:{guildId,lastPolledAt:new Date('2026-09-27T06:59:59Z'),lastFixturesPolledAt:new Date('2026-09-27T06:59:59Z')}});
    t.mock.timers.enable({apis:['Date'],now:new Date('2026-09-27T07:00:00Z')});
    await poller.pollAllGuildsLiveResults();assert.equal(sends,1);
    await poller.pollAllGuildsLiveResults();assert.equal(sends,1);
  } finally {t.mock.timers.reset();await prisma.guild.deleteMany({where:{id:guildId}});await prisma.$disconnect();}
});
'''
    p.write_text(s)
print('Final review: exact Sunday trigger, resilient independent feeds and template consistency.')
