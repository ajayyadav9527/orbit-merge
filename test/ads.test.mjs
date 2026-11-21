import {test} from 'node:test';
import assert from 'node:assert/strict';
import {
  completedReward,
  completedMonetagReward,
  showMonetagRewarded,
  HEADER_AD_CREATIVES,
  HEADER_AD_INTERVAL_MS,
  HEADER_AD_SMARTLINK,
  getNextAdIndex
} from '../dist/ads.js';

test('header ad banner rotating creatives and interval match specifications', () => {
  assert.equal(HEADER_AD_INTERVAL_MS, 8000);
  assert.equal(HEADER_AD_SMARTLINK, 'https://www.profitablecpmrate.com/fptf61s1k?key=c6c4c05ef1c8dfb208da70557431b997');
  assert.equal(HEADER_AD_CREATIVES.length, 4);

  assert.equal(HEADER_AD_CREATIVES[0].tag, '[SPONSOR]');
  assert.equal(HEADER_AD_CREATIVES[0].icon, '🪐');
  assert.equal(HEADER_AD_CREATIVES[0].text, 'Free Orbit Mystery Booster: +1 Shuffle & Undo!');
  assert.equal(HEADER_AD_CREATIVES[0].cta, '» Claim');

  assert.equal(HEADER_AD_CREATIVES[1].tag, '[FEATURED]');
  assert.equal(HEADER_AD_CREATIVES[1].icon, '🚀');
  assert.equal(HEADER_AD_CREATIVES[1].text, 'Top Trending Telegram Mini Apps & Web3 Games');
  assert.equal(HEADER_AD_CREATIVES[1].cta, '» Play Now');

  assert.equal(HEADER_AD_CREATIVES[2].tag, '[BONUS]');
  assert.equal(HEADER_AD_CREATIVES[2].icon, '⭐');
  assert.equal(HEADER_AD_CREATIVES[2].text, 'Unlock Cosmic Nova Stars & Galactic Themes');
  assert.equal(HEADER_AD_CREATIVES[2].cta, '» Get Stars');

  assert.equal(HEADER_AD_CREATIVES[3].tag, '[EVENT]');
  assert.equal(HEADER_AD_CREATIVES[3].icon, '🏆');
  assert.equal(HEADER_AD_CREATIVES[3].text, 'Compete for Rank #1 in Orbit Merge Arena');
  assert.equal(HEADER_AD_CREATIVES[3].cta, '» Join Event');

  // Verify smooth cyclic rotation indexing
  assert.equal(getNextAdIndex(0, 4), 1);
  assert.equal(getNextAdIndex(1, 4), 2);
  assert.equal(getNextAdIndex(2, 4), 3);
  assert.equal(getNextAdIndex(3, 4), 0);
});

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
