let controllerPromise;
let monetagPromise;

export const HEADER_AD_CREATIVES = [
 { tag: '[PROMOTED]', icon: '🪐', text: 'Browse a promoted offer', cta: 'Open promoted link' },
 { tag: '[PROMOTED]', icon: '🚀', text: 'Browse a promoted offer', cta: 'Open promoted link' },
 { tag: '[PROMOTED]', icon: '⭐', text: 'Browse a promoted offer', cta: 'Open promoted link' },
 { tag: '[PROMOTED]', icon: '🏆', text: 'Browse a promoted offer', cta: 'Open promoted link' }
];
export const HEADER_AD_INTERVAL_MS = 8000;
export const HEADER_AD_SMARTLINK = 'https://www.profitablecpmrate.com/fptf61s1k?key=c6c4c05ef1c8dfb208da70557431b997';
export const HEADER_SMARTLINK_COOLDOWN_MS = 60_000;
export const REWARDED_AD_COOLDOWN_MS = 60_000;

export function canOpenHeaderSmartlink(now = Date.now(), storage) {
 try {
  const targetStorage = storage ?? globalThis.sessionStorage;
  const lastOpened = Number(targetStorage?.getItem('orbit_merge_partner_link_last_ts') || 0);
  return !lastOpened || now - lastOpened >= HEADER_SMARTLINK_COOLDOWN_MS;
 } catch {
  return true;
 }
}

export function markHeaderSmartlinkOpened(now = Date.now(), storage) {
 try {
  const targetStorage = storage ?? globalThis.sessionStorage;
  targetStorage?.setItem('orbit_merge_partner_link_last_ts', String(now));
 } catch {}
}

export function canShowRewardedAd(now = Date.now(), storage) {
 try {
  const targetStorage = storage ?? globalThis.sessionStorage;
  const lastValued = Number(targetStorage?.getItem('orbit_merge_rewarded_last_valued_ts') || 0);
  return !lastValued || now - lastValued >= REWARDED_AD_COOLDOWN_MS;
 } catch {
  return true;
 }
}

export function markRewardedAdValued(now = Date.now(), storage) {
 try {
  const targetStorage = storage ?? globalThis.sessionStorage;
  targetStorage?.setItem('orbit_merge_rewarded_last_valued_ts', String(now));
 } catch {}
}

export function getNextAdIndex(currentIndex, totalCount) {
 return (currentIndex + 1) % totalCount;
}

export function completedMonetagReward(result) {
 return result?.reward_event_type === 'valued';
}

export async function showMonetagRewarded({zone, scriptUrl, requestVar='game_over_rescue'} = {}) {
 const targetZone = zone || '12304789';
 const targetScript = scriptUrl || 'https://libtl.com/sdk.js';
 if (!/^\d+$/.test(targetZone)) throw new Error('Invalid Monetag zone.');
 const source = new URL(targetScript);
 if (source.protocol !== 'https:') throw new Error('Monetag SDK requires HTTPS.');
 const functionName = 'show_' + targetZone;
 const ymid = globalThis.crypto?.randomUUID?.() || `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
 const payload = {type: 'end', ymid, requestVar, timeout: 10};
 if (typeof window !== 'undefined' && typeof window[functionName] === 'function') {
  const res = await window[functionName](payload);
  return res;
 }
 if (!monetagPromise) {
  monetagPromise = new Promise((resolve, reject) => {
   if (typeof document === 'undefined') {
    reject(new Error('Monetag SDK unavailable.'));
    return;
   }
   const script = document.createElement('script');
   script.src = source.href;
   script.dataset.zone = targetZone;
   script.dataset.sdk = functionName;
   const fail = message => {
    clearTimeout(timer);
    script.onload = script.onerror = null;
    script.remove();
    reject(new Error(message));
   };
   const timer = setTimeout(() => fail('Monetag SDK timed out.'), 2500);
   script.onload = () => {
    if (typeof window[functionName] !== 'function') {
     fail('Monetag SDK unavailable.');
     return;
    }
    clearTimeout(timer);
    resolve(window[functionName]);
   };
   script.onerror = () => fail('Monetag SDK failed to load.');
   document.head.append(script);
  }).catch(error => {
   monetagPromise = null;
   throw error;
  });
 }
 const show = await monetagPromise;
 const res = await show(payload);
 return res;
}

export async function requestRewardedAd(config = {}, requestVar) {
 try {
  if (!canShowRewardedAd()) return false;
  let completed = false;
  if (config.monetag?.zone && config.monetag?.scriptUrl) {
   const res = await showMonetagRewarded({...config.monetag,requestVar});
   completed = completedMonetagReward(res);
  } else if (config.ads && config.adsBlockId) {
   const res = await showRewarded(config.adsBlockId);
   completed = completedReward(res);
  }
  if (completed) {
   markRewardedAdValued();
   return true;
  }
  return false;
 } catch {
  return false;
 }
}

export function completedReward(result){return result?.done===true&&result?.error===false;}
export async function showRewarded(blockId){
 if(!/^\d+$/.test(blockId||''))throw new Error('Rewarded ads are not configured.');
 if(!controllerPromise)controllerPromise=(async()=>{if(!window.Adsgram)await new Promise((resolve,reject)=>{const script=document.createElement('script');script.src='https://sad.adsgram.ai/js/sad.min.js';script.onload=resolve;script.onerror=()=>reject(new Error('Ad service unavailable.'));document.head.append(script);});return window.Adsgram.init({blockId,debug:false});})();
 let controller;try{controller=await controllerPromise;}catch(e){controllerPromise=null;throw e;}return controller.show();
}
