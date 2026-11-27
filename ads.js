let controllerPromise;
let monetagPromise;

export const HEADER_AD_CREATIVES = [
 { tag: '[SPONSOR]', icon: '🪐', text: 'Orbit Merge sponsor offer', cta: 'Visit sponsor ↗' },
 { tag: '[SPONSOR]', icon: '🚀', text: 'Featured sponsor offer', cta: 'Visit sponsor ↗' },
 { tag: '[SPONSOR]', icon: '⭐', text: 'Explore a sponsor offer', cta: 'Visit sponsor ↗' },
 { tag: '[SPONSOR]', icon: '🏆', text: 'Support Orbit Merge', cta: 'Visit sponsor ↗' }
];
export const HEADER_AD_INTERVAL_MS = 8000;
export const HEADER_AD_SMARTLINK = 'https://www.profitablecpmrate.com/fptf61s1k?key=c6c4c05ef1c8dfb208da70557431b997';

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
 if (typeof window !== 'undefined' && typeof window[functionName] === 'function') {
  const res = await window[functionName](
   targetZone === '12304789' && !zone
    ? undefined
    : {type: 'end', ymid: crypto.randomUUID(), requestVar, timeout: 10}
  );
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
 const res = await show({type: 'end', ymid: crypto.randomUUID(), requestVar, timeout: 10});
 return res;
}

export async function requestRewardedAd(config = {}, requestVar) {
 try {
  if (config.monetag?.zone && config.monetag?.scriptUrl) {
   const res = await showMonetagRewarded({...config.monetag,requestVar});
   return completedMonetagReward(res);
  }
  if (config.ads && config.adsBlockId) {
   const res = await showRewarded(config.adsBlockId);
   return completedReward(res);
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
