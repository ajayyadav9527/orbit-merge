import {test} from 'node:test';
import assert from 'node:assert/strict';
import {
  completedReward,
  completedMonetagReward,
  showMonetagRewarded,
  requestRewardedAd,
  HEADER_AD_CREATIVES,
  HEADER_AD_INTERVAL_MS,
  HEADER_AD_SMARTLINK,
  HEADER_SMARTLINK_COOLDOWN_MS,
  canOpenHeaderSmartlink,
  markHeaderSmartlinkOpened,
  REWARDED_AD_COOLDOWN_MS,
  canShowRewardedAd,
  markRewardedAdValued,
  getNextAdIndex
} from '../dist/ads.js';

test('header ad banner rotating creatives and interval match specifications', () => {
  assert.equal(HEADER_AD_INTERVAL_MS, 8000);
  assert.equal(HEADER_AD_SMARTLINK, 'https://www.profitablecpmrate.com/fptf61s1k?key=c6c4c05ef1c8dfb208da70557431b997');
  assert.equal(HEADER_AD_CREATIVES.length, 4);

  for (const creative of HEADER_AD_CREATIVES) {
    assert.equal(creative.tag, '[PROMOTED]');
    assert.equal(creative.cta, 'Open promoted link');
    assert.match(creative.text, /promoted offer/i);
  }

  // Verify smooth cyclic rotation indexing
  assert.equal(getNextAdIndex(0, 4), 1);
  assert.equal(getNextAdIndex(1, 4), 2);
  assert.equal(getNextAdIndex(2, 4), 3);
  assert.equal(getNextAdIndex(3, 4), 0);
});

test('partner link has a per-session 60-second frequency cap', () => {
  const values = new Map();
  const storage = {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value)
  };
  assert.equal(HEADER_SMARTLINK_COOLDOWN_MS, 60_000);
  assert.equal(canOpenHeaderSmartlink(100_000, storage), true);
  markHeaderSmartlinkOpened(100_000, storage);
  assert.equal(canOpenHeaderSmartlink(159_999, storage), false);
  assert.equal(canOpenHeaderSmartlink(160_000, storage), true);
});

test('valued reward ads have a per-session 60-second cap', () => {
  const values = new Map();
  const storage = {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value)
  };
  assert.equal(REWARDED_AD_COOLDOWN_MS, 60_000);
  assert.equal(canShowRewardedAd(100_000, storage), true);
  markRewardedAdValued(100_000, storage);
  assert.equal(canShowRewardedAd(159_999, storage), false);
  assert.equal(canShowRewardedAd(160_000, storage), true);
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
  assert.equal(res, 'ok');
  assert.equal(completedMonetagReward(res), false);
 } finally {
  globalThis.window = origWindow;
 }
});

test('showMonetagRewarded preserves explicit skip responses and requestRewardedAd strictly gates completion',async()=>{
 const origWindow = globalThis.window;
 const config = { monetag: { zone: '12304789', scriptUrl: 'https://libtl.com/sdk.js' } };
 try {
  globalThis.window = { show_12304789: async () => ({ reward_event_type: 'skip' }) };
  const skipRes = await showMonetagRewarded();
  assert.equal(completedMonetagReward(skipRes), false);
  assert.equal(await requestRewardedAd(config), false);

  globalThis.window = { show_12304789: async () => false };
  assert.equal(await requestRewardedAd(config), false);

  globalThis.window = { show_12304789: async () => { throw new Error('User closed ad'); } };
  assert.equal(await requestRewardedAd(config), false);

  globalThis.window = { show_12304789: async () => ({ reward_event_type: 'valued' }) };
  assert.equal(await requestRewardedAd(config), true);
  assert.equal(await requestRewardedAd({monetag: null}), false);

  globalThis.window = {};
  assert.equal(await requestRewardedAd({}), false);
 } finally {
  globalThis.window = origWindow;
 }
});
