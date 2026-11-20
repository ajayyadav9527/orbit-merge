let controllerPromise;
let monetagPromise;
export function completedMonetagReward(result) {
 return result?.reward_event_type === 'valued';
}

export async function showMonetagRewarded({zone, scriptUrl}) {
 if (!/^\d+$/.test(zone)) throw new Error('Invalid Monetag zone.');
 const source = new URL(scriptUrl);
 if (source.protocol !== 'https:') throw new Error('Monetag SDK requires HTTPS.');
 const functionName = 'show_' + zone;
 if (!monetagPromise) {
  monetagPromise = new Promise((resolve, reject) => {
   const script = document.createElement('script');
   script.src = source.href;
   script.dataset.zone = zone;
   script.dataset.sdk = functionName;
   script.onload = () => typeof window[functionName] === 'function'
    ? resolve(window[functionName])
    : reject(new Error('Monetag SDK unavailable.'));
   script.onerror = () => reject(new Error('Monetag SDK failed to load.'));
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
