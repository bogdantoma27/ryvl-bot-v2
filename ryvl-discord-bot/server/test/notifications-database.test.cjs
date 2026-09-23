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
