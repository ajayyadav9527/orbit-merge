import {test} from 'node:test';
import assert from 'node:assert/strict';
import {completedReward, completedMonetagReward, showMonetagRewarded} from '../dist/ads.js';

test('only an explicitly completed rewarded ad earns a rescue',()=>{
 assert.equal(completedReward({done:true,error:false}),true);
 for(const result of [null,undefined,{}, {done:false,error:false},{done:true,error:true},{done:true},{done:'true',error:false}]) {
  assert.equal(completedReward(result),false);
 }
});

test('completedMonetagReward verifies valued event type',()=>{
 assert.equal(completedMonetagReward({reward_event_type:'valued'}),true);
 for(const result of [null,undefined,{},{reward_event_type:'skip'},{reward_event_type:null},{reward_event_type:'VALUED'}]) {
  assert.equal(completedMonetagReward(result),false);
 }
});

test('showMonetagRewarded uses window.show_12304789 when running in Telegram Mini App',async()=>{
 let tmaCalled = false;
 const origWindow = globalThis.window;
 globalThis.window = {
  show_12304789: async () => {
   tmaCalled = true;
   return 'ok';
  }
 };
 try {
  const res = await showMonetagRewarded();
  assert.equal(tmaCalled, true);
  assert.deepEqual(res, {reward_event_type: 'valued'});
  assert.equal(completedMonetagReward(res), true);
 } finally {
  globalThis.window = origWindow;
 }
});
