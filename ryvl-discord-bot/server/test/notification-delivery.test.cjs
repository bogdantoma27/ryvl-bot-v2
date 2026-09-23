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
