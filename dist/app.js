import {W,H,newGame,nextLevel,available,drop,undo,rescue,dailySeed} from './engine.js';
import {completedReward,showRewarded,completedMonetagReward,showMonetagRewarded} from './ads.js';
const $=s=>document.querySelector(s),tg=window.Telegram?.WebApp;
const STORAGE='orbit-merge-v1';let stored;try{stored=JSON.parse(localStorage.getItem(STORAGE)||'null');}catch{}
let game=stored?.game&&Array.isArray(stored.game.board)&&stored.game.board.length===W*H?stored.game:newGame();
let records=stored?.records||{best:0,largest:0,games:1},freeUndo=stored?.freeUndo??1,account=null,busy=false,config={},pending=stored?.pending||null,adAvailable=false;
const dailyDate = new Date().toISOString().slice(0, 10);
const dailyStorage = 'orbit-merge-daily-' + dailyDate;
let dailyMode = false;
let regularGame;
let dailyGame = newGame(dailySeed(dailyDate));
try {
 const savedDaily = JSON.parse(localStorage.getItem('orbit-merge-daily') || 'null');
 if (savedDaily?.key === dailyStorage && savedDaily.game?.board?.length === W * H) dailyGame = savedDaily.game;
} catch {}

function toggleDaily() {
 if (busy || pending) return;
 if (dailyMode) {
  dailyGame = game;
  game = regularGame;
 } else {
  regularGame = game;
  game = dailyGame;
 }
 dailyMode = !dailyMode;
 $('#daily').textContent = dailyMode ? 'Back to free play' : 'Daily challenge';
 $('#daily-share').hidden = !dailyMode;
 $('#daily-info').textContent = dailyMode ? 'Same puzzle for everyone. No boosters. New puzzle at midnight UTC.' : '';
 $('#status').textContent = '';
 render();
}
function save(){try{if(dailyMode){localStorage.setItem("orbit-merge-daily",JSON.stringify({key:dailyStorage,game}));return true;}localStorage.setItem(STORAGE,JSON.stringify({game,records,freeUndo,pending}));return true;}catch{$('#status').textContent='Browser storage is unavailable. Progress lasts for this session.';return false;}}
function planet(level){const el=document.createElement('span');el.className=`planet l${Math.min(level,10)}`;el.textContent=(2**level).toLocaleString();return el;}
function render(){
 $('#score').textContent=game.score.toLocaleString();if(!dailyMode){records.best=Math.max(records.best,game.score);records.largest=Math.max(records.largest,...game.board);}$('#best').textContent=records.best.toLocaleString();
 const board=$('#board');board.replaceChildren();for(let r=0;r<H;r++)for(let c=0;c<W;c++){const cell=document.createElement('div');const n=game.board[r*W+c];cell.className=`cell${n?' filled':''}`;cell.setAttribute('aria-label',`Row ${r+1}, lane ${c+1}: ${n?2**n:'empty'}`);if(n)cell.append(planet(n));cell.addEventListener('click',()=>play(c));board.append(cell);}
 const lanes=$('#lanes');lanes.replaceChildren();for(let c=0;c<W;c++){const b=document.createElement('button');b.className='lane';b.textContent='↓';b.ariaLabel=`Drop in lane ${c+1}`;b.disabled=!available(game,c)||game.over||busy;b.addEventListener('click',()=>play(c));lanes.append(b);}
 for(const id of ['undo','new','restart','rescue','ad']) document.getElementById(id).hidden=dailyMode; document.getElementById('over-copy').textContent=dailyMode?'Share your score or return to free play.':'A new universe is always free.'; for(const [id,offset] of [['next',0],['after',1]]){const n=nextLevel(game,offset),el=$('#'+id);el.className=`planet l${n}${offset?' small':''}`;el.textContent=2**n;}
 const largest=Math.max(0,...game.board);$('#progress').textContent=`${largest?2**largest:0} / 32`;$('#mission').textContent=largest>=5?'Mission complete! How far can you go?':'Your first mission: make a 32 planet';
 $('#undo-count').textContent=freeUndo?'1 free':`${account?.undos||0} left`;$('#undo').disabled=!game.history.length||busy;$('#gameover').hidden=!game.over;$('#rescue').textContent=`Use a rescue (${account?.rescues||0} left)`;$('#rescue').disabled=busy;$('#ad').disabled=busy||!adAvailable||!!game.adUsed;$('#ad').textContent=game.adUsed?'Ad rescue used this orbit':adAvailable?'Watch an ad · rescue this orbit':'Rewarded ad unavailable';
 $('#record-score').textContent=records.best.toLocaleString();$('#record-planet').textContent=records.largest?2**records.largest:'—';$('#record-games').textContent=records.games;save();
}
function play(c){if(busy)return;if(pending){$('#status').textContent='Finish your pending booster by pressing its button again.';return;}const result=drop(game,c);if(!result){$('#status').textContent='That lane is full. Try another one.';return;}$('#status').textContent=result.chain>1?`${result.chain}-step chain! A little planning goes a long way.`:result.chain?'A new planet. Nicely placed.':'';try{tg?.HapticFeedback?.impactOccurred(result.chain?'medium':'light');}catch{}render();}
function start(){if(dailyMode||busy)return;if(pending){$('#status').textContent='Finish your pending booster first. Reopen the game to retry safely.';return;}game=newGame();freeUndo=1;records.games++;$('#status').textContent='A fresh orbit. Your first undo is free.';render();}
async function api(path,body){const r=await fetch('/api/'+path,{method:'POST',headers:{'content-type':'application/json','x-telegram-init-data':tg?.initData||''},body:JSON.stringify(body||{})});let result;try{result=await r.json();}catch{throw new Error('Purchases are unavailable on this preview.');}if(!r.ok){const e=new Error(result.error||'Please try again.');e.rejected=true;throw e;}return result;}
async function spend(kind){if(pending&&pending.kind!==kind)throw new Error('Finish the other pending booster first.');if(!pending)pending={kind,request_id:crypto.randomUUID(),game:structuredClone(game)};if(!save()){pending=null;throw new Error('Paid boosters need browser storage to safely recover interrupted requests.');}try{account=await api('consume',{kind,request_id:pending.request_id});game=pending.game;if(kind==='undos')undo(game);else rescue(game);pending=null;save();}catch(e){if(e.rejected){pending=null;save();}throw e;}}
async function refreshAccount(){account=await api('account');$('#balance').textContent=`Your boosters: ${account.undos} undos · ${account.rescues} rescues`;render();}
$('#undo').addEventListener('click',async()=>{if(!game.history.length||busy)return;busy=true;render();try{if(freeUndo){freeUndo--;undo(game);}else await spend('undos');$('#status').textContent='Last drop undone.';}catch(e){$('#status').textContent=e.message+(pending?' Press Undo to retry safely.':' You can always start a new game for free.');}finally{busy=false;render();}});
$('#rescue').addEventListener('click',async()=>{if(!game.over||busy)return;busy=true;render();try{await spend('rescues');$('#status').textContent='Room to breathe. Keep your orbit going.';}catch(e){$('#status').textContent=e.message;}finally{busy=false;render();}});
$('#new').addEventListener('click',()=>{if(game.drops&&!game.over){if(!confirm('Start a new orbit? Your current board will be replaced.'))return;}start();});$('#restart').addEventListener('click',start);
document.querySelectorAll('[data-view]').forEach(b=>b.addEventListener('click',()=>{document.querySelectorAll('.view').forEach(v=>v.hidden=v.id!==b.dataset.view);document.querySelectorAll('.tab').forEach(t=>{t.classList.toggle('selected',t===b);if(t===b)t.setAttribute('aria-current','page');else t.removeAttribute('aria-current');});}));
$('#help').addEventListener('click',()=>$('#help-dialog').showModal());$('#close-help').addEventListener('click',()=>$('#help-dialog').close());
$('#share').addEventListener('click',async()=>{const url=config.botUsername?`https://t.me/${config.botUsername}?startapp=play`:location.origin;const text='A little space to play. Try Orbit Merge!';if(tg?.initData)tg.openTelegramLink(`https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`);else if(navigator.share){try{await navigator.share({title:'Orbit Merge',text,url});}catch{}}else{try{await navigator.clipboard.writeText(url);$('#share').textContent='Game link copied';}catch{$('#share').textContent='Copy the URL from your address bar';}}});
const purchaseStorage = 'orbit-merge-pending-order';
let pendingPurchase;
try { pendingPurchase = localStorage.getItem(purchaseStorage); } catch {}

function rememberPurchase(orderId) {
 pendingPurchase = orderId;
 try {
  if (orderId) localStorage.setItem(purchaseStorage, orderId);
  else localStorage.removeItem(purchaseStorage);
 } catch {}
}

async function checkPurchase(orderId, attempts = 1) {
 const status = $('#shop-status');
 for (let attempt = 0; attempt < attempts; attempt++) {
  try {
   if ((await api('order', {orderId})).paid) {
    await refreshAccount();
    if (pendingPurchase === orderId) rememberPurchase(null);
    status.textContent = 'Purchase confirmed. Boosters added to your balance.';
    return;
   }
  } catch {}
  if (attempt + 1 < attempts) await new Promise(resolve => setTimeout(resolve, 1200));
 }
 status.textContent = 'Awaiting confirmation. Check status again or contact payment support with your Telegram receipt.';
}

const buyButtons = [...document.querySelectorAll('[data-product]')];
$('#check-purchase').addEventListener('click', () => {
 if (pendingPurchase) checkPurchase(pendingPurchase);
 else refreshAccount().catch(error => { $('#shop-status').textContent = error.message; });
});
for (const button of buyButtons) {
 button.addEventListener('click', async () => {
  if (busy) return;
  busy = true;
  buyButtons.forEach(item => item.disabled = true);
  const status = $('#shop-status');
  const unlock = () => { busy = false; buyButtons.forEach(item => item.disabled = false); };
  status.textContent = 'Opening Telegram Stars checkout…';
  try {
   const {url, orderId} = await api('invoice', {product: button.dataset.product});
   tg.openInvoice(url, async result => {
    if (result === 'paid' || result === 'pending') {
     rememberPurchase(orderId);
     status.textContent = 'Checking payment confirmation…';
     try { await checkPurchase(orderId, 6); } finally { unlock(); }
    } else {
     status.textContent = result === 'cancelled' ? 'Purchase cancelled.' : 'Checkout did not complete.';
     unlock();
    }
   });
  } catch (error) {
   status.textContent = error.message;
   unlock();
  }
 });
}
window.addEventListener('keydown',e=>{if($('#play').hidden||$('#help-dialog').open)return;if(/^[1-5]$/.test(e.key))play(Number(e.key)-1);});
try{tg?.ready();tg?.expand();tg?.setHeaderColor('#f3f6fc');tg?.setBackgroundColor('#f3f6fc');}catch{}
render();
try{const r=await fetch('/api/config');if(r.ok)config=await r.json();}catch{}
if(config.payments&&tg?.initData){try{await refreshAccount();$('#commerce-status').textContent='Telegram Stars · Secure one-time purchases';document.querySelectorAll('.buy').forEach(b=>b.disabled=false);$('#mode').textContent='TELEGRAM';}catch(e){$('#commerce-status').textContent=e.message;}}
if(pending&&account){busy=true;try{await spend(pending.kind);$('#status').textContent='Your interrupted booster was recovered.';}catch(e){$('#status').textContent=e.message;}finally{busy=false;render();}}
// Load the ad provider only after an explicit Watch action.
adAvailable=!!((config.monetag||config.ads&&/^\d+$/.test(config.adsBlockId||''))&&tg?.initData);render();
$('#ad').addEventListener('click',async()=>{if(dailyMode||!adAvailable||busy||!game.over||game.adUsed||pending)return;busy=true;render();try{const completed=config.monetag?completedMonetagReward(await showMonetagRewarded(config.monetag)):completedReward(await showRewarded(config.adsBlockId));if(completed){rescue(game);game.adUsed=true;$('#status').textContent='Ad completed. Your orbit has room again.';}else $('#status').textContent='Ad not completed. No rescue was used.';}catch{$('#status').textContent='Ad skipped or unavailable. No rescue was used.';}finally{busy=false;render();}});

document.getElementById('daily').addEventListener('click', toggleDaily);
document.getElementById('daily-share').addEventListener('click', async () => {
 const url = 'https://t.me/OrbitMergeAjayBot/play?startapp=daily';
 const message = 'Orbit Merge daily · ' + dailyDate + ' · My score: ' + game.score + '. Try the same puzzle!';
 if (tg?.initData) {
  tg.openTelegramLink('https://t.me/share/url?url=' + encodeURIComponent(url) + '&text=' + encodeURIComponent(message));
 } else {
  try {
   await navigator.clipboard.writeText(message + ' ' + url);
   document.getElementById('status').textContent = 'Challenge link copied.';
  } catch {
   document.getElementById('status').textContent = url;
  }
 }
});
if (tg?.initDataUnsafe?.start_param === 'daily' || new URLSearchParams(location.search).get('mode') === 'daily') toggleDaily();