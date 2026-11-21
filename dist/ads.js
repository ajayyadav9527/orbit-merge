let controllerPromise;
let monetagPromise;
export function completedMonetagReward(result) {
 return result?.reward_event_type === 'valued';
}

export async function showMonetagRewarded({zone, scriptUrl} = {}) {
 if (typeof window !== 'undefined' && typeof window.show_12304789 === 'function') {
  return window.show_12304789().then(() => ({ reward_event_type: 'valued' }));
 }
 const targetZone = zone || '12310273';
 const targetScript = scriptUrl || 'https://alwingulla.com/88/tag.min.js';
 if (!/^\d+$/.test(targetZone)) throw new Error('Invalid Monetag zone.');
 const source = new URL(targetScript);
 if (source.protocol !== 'https:') throw new Error('Monetag SDK requires HTTPS.');
 const functionName = 'show_' + targetZone;
 if (typeof window !== 'undefined' && typeof window[functionName] === 'function') {
  return window[functionName]({type: 'end', ymid: crypto.randomUUID(), requestVar: 'game_over_rescue', timeout: 10});
 }
 if (!monetagPromise) {
  monetagPromise = new Promise((resolve, reject) => {
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
   const timer = setTimeout(() => fail('Monetag SDK timed out.'), 6000);
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
 return show({type: 'end', ymid: crypto.randomUUID(), requestVar: 'game_over_rescue', timeout: 10});
}

export function completedReward(result){return result?.done===true&&result?.error===false;}
export async function showRewarded(blockId){
 if(!/^\d+$/.test(blockId||''))throw new Error('Rewarded ads are not configured.');
 if(!controllerPromise)controllerPromise=(async()=>{if(!window.Adsgram)await new Promise((resolve,reject)=>{const script=document.createElement('script');script.src='https://sad.adsgram.ai/js/sad.min.js';script.onload=resolve;script.onerror=()=>reject(new Error('Ad service unavailable.'));document.head.append(script);});return window.Adsgram.init({blockId,debug:false});})();
 let controller;try{controller=await controllerPromise;}catch(e){controllerPromise=null;throw e;}return controller.show();
}
