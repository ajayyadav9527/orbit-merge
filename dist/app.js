import {W,H,newGame,nextLevel,available,targetRow,drop,undo,rescue,shuffle,dailySeed} from './engine.js';
import {completedReward,showRewarded,completedMonetagReward,showMonetagRewarded} from './ads.js';

const $=s=>document.querySelector(s),tg=window.Telegram?.WebApp;
const STORAGE='orbit-merge-v1';
let stored;try{stored=JSON.parse(localStorage.getItem(STORAGE)||'null');}catch{}

class SoundFX {
 constructor(){
  this.ctx=null;
  this.masterGain=null;
  this.muted=localStorage.getItem('orbit-sound-muted')==='true';
 }
 init(){
  if(!this.ctx&&(window.AudioContext||window.webkitAudioContext)){
   try{
    const AudioCtx=window.AudioContext||window.webkitAudioContext;
    this.ctx=new AudioCtx();
    this.masterGain=this.ctx.createGain();
    this.masterGain.gain.setValueAtTime(this.muted?0:1,this.ctx.currentTime);
    this.masterGain.connect(this.ctx.destination);
   }catch{}
  }
  if(this.ctx&&this.ctx.state==='suspended'){
   this.ctx.resume().catch(()=>{});
  }
 }
 toggle(){
  this.muted=!this.muted;
  localStorage.setItem('orbit-sound-muted',String(this.muted));
  if(this.masterGain&&this.ctx){
   try{this.masterGain.gain.setValueAtTime(this.muted?0:1,this.ctx.currentTime);}catch{}
  }
  return !this.muted;
 }
 tone(freq,type='sine',dur=0.15,vol=0.12){
  if(this.muted)return;
  try{
   this.init();
   if(!this.ctx||this.ctx.state==='closed')return;
   const now=this.ctx.currentTime;
   const osc=this.ctx.createOscillator(),g=this.ctx.createGain();
   osc.type=type;
   osc.frequency.setValueAtTime(freq,now);
   g.gain.setValueAtTime(Math.max(vol,0.0001),now);
   g.gain.exponentialRampToValueAtTime(0.0001,now+dur);
   osc.connect(g);
   g.connect(this.masterGain||this.ctx.destination);
   osc.onended=()=>{
    try{
     osc.disconnect();
     g.disconnect();
    }catch{}
   };
   osc.start(now);
   osc.stop(now+dur);
  }catch{}
 }
 drop(){this.tone(170,'triangle',0.12,0.14);}
 merge(level,chain=1){
  const notes=[261.63,293.66,329.63,392.00,440.00,523.25,587.33,659.25,783.99,880.00,1046.50];
  const base=notes[Math.min(Math.max(0,level-1),notes.length-1)];
  const mult=1+(chain-1)*0.15;
  this.tone(base*mult,'sine',0.24,0.18);
  if(level>=5)setTimeout(()=>this.tone(base*1.5*mult,'triangle',0.26,0.12),55);
 }
 undo(){this.tone(220,'sine',0.12,0.1);}
 shuffle(){
  [220,277.18,329.63,440].forEach((f,i)=>setTimeout(()=>this.tone(f,'sine',0.15,0.1),i*40));
 }
 gameOver(){
  this.tone(220,'sawtooth',0.3,0.1);
  setTimeout(()=>this.tone(165,'sine',0.4,0.1),140);
 }
 fanfare(){
  [523.25,659.25,783.99,1046.50].forEach((f,i)=>setTimeout(()=>this.tone(f,'sine',0.22,0.15),i*75));
 }
}

const sfx=new SoundFX();
const unlockAudio=()=>{
 sfx.init();
 ['pointerdown','keydown','touchstart','click'].forEach(evt=>{
  window.removeEventListener(evt,unlockAudio);
 });
};
['pointerdown','keydown','touchstart','click'].forEach(evt=>{
 window.addEventListener(evt,unlockAudio,{passive:true,once:true});
});
$('#sound').textContent=sfx.muted?'🔇':'🔊';
$('#sound').addEventListener('click',()=>{
 const on=sfx.toggle();
 $('#sound').textContent=on?'🔊':'🔇';
 if(on)sfx.drop();
});

let game=stored?.game&&Array.isArray(stored.game.board)&&stored.game.board.length===W*H?stored.game:newGame();
let records=stored?.records||{best:0,largest:0,games:1,merges:0,missionIdx:0,theme:'default'};
let freeUndo=stored?.freeUndo??1,freeShuffle=stored?.freeShuffle??1,account=null,busy=false,config={},pending=stored?.pending||null,adAvailable=false;
let hoveredLane=null,lastDropChain=0,lastMergedPos=null,lastScoredPoints=0;

if(records.theme&&records.theme!=='default'){
 document.documentElement.setAttribute('data-theme',records.theme);
 document.querySelectorAll('.theme-btn').forEach(b=>b.classList.toggle('active',b.dataset.setTheme===records.theme));
}

const MISSIONS=[
 {title:'Mission 1: Discover a 32 Planet',target:32,check:(g)=>Math.max(0,...g.board)>=5,progress:(g)=>`${Math.max(0,...g.board)?2**Math.min(5,Math.max(...g.board)):0} / 32`,reward:'+1 Free Undo',grant:()=>{freeUndo++;}},
 {title:'Mission 2: Trigger a 2-Step Cascade',target:2,check:(g,c)=>c>=2,progress:(g,c)=>`${Math.min(2,c||0)} / 2`,reward:'+1 Free Shuffle',grant:()=>{freeShuffle++;}},
 {title:'Mission 3: Score 1,000 in one orbit',target:1000,check:(g)=>g.score>=1000,progress:(g)=>`${Math.min(1000,g.score)} / 1000`,reward:'+1 Free Undo',grant:()=>{freeUndo++;}},
 {title:'Mission 4: Discover a 128 Planet',target:128,check:(g)=>Math.max(0,...g.board)>=7,progress:(g)=>`${Math.max(0,...g.board)?2**Math.min(7,Math.max(...g.board)):0} / 128`,reward:'+1 Free Rescue',grant:()=>{if(account)account.rescues++;}},
 {title:'Mission 5: Reach 3,000 High Score',target:3000,check:(g)=>g.score>=3000,progress:(g)=>`${Math.min(3000,g.score)} / 3000`,reward:'+1 Free Shuffle',grant:()=>{freeShuffle++;}},
 {title:'Mastery: Forge a 2048 Cosmic Star',target:2048,check:(g)=>Math.max(0,...g.board)>=11,progress:(g)=>`${Math.max(0,...g.board)?2**Math.min(11,Math.max(...g.board)):0} / 2048`,reward:'Supernova Master',grant:()=>{}}
];

const dailyDate=new Date().toISOString().slice(0,10);
const dailyStorage='orbit-merge-daily-'+dailyDate;
let dailyMode=false,regularGame;
let dailyGame=newGame(dailySeed(dailyDate));
try{
 const savedDaily=JSON.parse(localStorage.getItem('orbit-merge-daily')||'null');
 if(savedDaily?.key===dailyStorage&&savedDaily.game?.board?.length===W*H)dailyGame=savedDaily.game;
}catch{}

function checkMissions(){
 if(dailyMode)return;
 const idx=records.missionIdx||0;
 if(idx>=MISSIONS.length)return;
 const m=MISSIONS[idx];
 if(m.check(game,lastDropChain)){
  records.missionIdx=idx+1;
  m.grant();
  sfx.fanfare();
  try{tg?.HapticFeedback?.notificationOccurred('success');}catch{}
  $('#status').textContent=`🎉 ${m.title} cleared! Reward: ${m.reward}!`;
  save();
 }
}

function toggleDaily(){
 if(busy||pending)return;
 if(dailyMode){dailyGame=game;game=regularGame;}
 else{regularGame=game;game=dailyGame;}
 dailyMode=!dailyMode;
 lastDropChain=0;lastMergedPos=null;hoveredLane=null;
 $('#daily').textContent=dailyMode?'Back to free play':'Daily challenge';
 $('#daily-share').hidden=!dailyMode;
 $('#daily-info').textContent=dailyMode?'Same puzzle for everyone. No boosters. New puzzle at midnight UTC.':'';
 $('#status').textContent='';
 render();
}

function save(){
 try{
  if(dailyMode){localStorage.setItem('orbit-merge-daily',JSON.stringify({key:dailyStorage,game}));return true;}
  localStorage.setItem(STORAGE,JSON.stringify({game,records,freeUndo,freeShuffle,pending}));
  return true;
 }catch{
  $('#status').textContent='Browser storage is unavailable. Progress lasts for this session.';
  return false;
 }
}

function planet(level,pop=false){
 const el=document.createElement('span');
 el.className=`planet l${Math.min(level,10)}${pop?' pop':''}`;
 el.textContent=(2**level).toLocaleString();
 return el;
}

function initBoard(){
 const board=$('#board');
 if(!board||board.children.length===W*H)return;
 board.replaceChildren();
 for(let r=0;r<H;r++){
  for(let c=0;c<W;c++){
   const pos=r*W+c;
   const cell=document.createElement('div');
   cell.className='cell';
   cell.dataset.pos=String(pos);
   cell.dataset.col=String(c);
   cell.dataset.row=String(r);
   cell.setAttribute('aria-label',`Row ${r+1}, lane ${c+1}: empty`);
   board.append(cell);
  }
 }
}

function initLanes(){
 const lanes=$('#lanes');
 if(!lanes||lanes.children.length===W)return;
 lanes.replaceChildren();
 for(let c=0;c<W;c++){
  const b=document.createElement('button');
  b.className='lane';
  b.textContent='↓';
  b.ariaLabel=`Drop in lane ${c+1}`;
  b.dataset.col=String(c);
  lanes.append(b);
 }
}

function renderBoard(){
 initBoard();
 const board=$('#board');
 if(!board)return;
 const ghostRow=hoveredLane!==null?targetRow(game,hoveredLane):-1;

 for(let r=0;r<H;r++){
  for(let c=0;c<W;c++){
   const pos=r*W+c;
   const n=game.board[pos];
   const cell=board.children[pos];
   if(!cell)continue;

   const isGhost=hoveredLane===c&&r===ghostRow&&!n;
   cell.classList.toggle('filled',!!n);
   cell.classList.toggle('ghost',isGhost);

   const label=`Row ${r+1}, lane ${c+1}: ${n?2**n:'empty'}`;
   if(cell.getAttribute('aria-label')!==label)cell.setAttribute('aria-label',label);

   let planetEl=cell.querySelector('.planet');
   if(n){
    const isPop=lastMergedPos===pos;
    const targetClass=`planet l${Math.min(n,10)}${isPop?' pop':''}`;
    const targetText=(2**n).toLocaleString();
    if(!planetEl){
     cell.prepend(planet(n,isPop));
    }else{
     if(isPop&&planetEl.classList.contains('pop')){
      planetEl.classList.remove('pop');
      void planetEl.offsetWidth;
     }
     if(planetEl.className!==targetClass)planetEl.className=targetClass;
     if(planetEl.textContent!==targetText)planetEl.textContent=targetText;
    }
   }else if(planetEl){
    planetEl.remove();
   }
  }
 }
}

function renderLanes(){
 initLanes();
 const lanes=$('#lanes');
 if(!lanes)return;
 for(let c=0;c<W;c++){
  const b=lanes.children[c];
  if(!b)continue;
  const isDisabled=!available(game,c)||game.over||busy;
  if(b.disabled!==isDisabled)b.disabled=isDisabled;
  b.classList.toggle('active-lane',hoveredLane===c);
 }
}

function setupEventDelegation(){
 const board=$('#board');
 if(board){
  board.addEventListener('click',e=>{
   const cell=e.target.closest('.cell');
   if(!cell)return;
   const col=Number(cell.dataset.col);
   if(!Number.isNaN(col))play(col);
  });
  board.addEventListener('mouseover',e=>{
   const cell=e.target.closest('.cell');
   if(!cell)return;
   const col=Number(cell.dataset.col);
   if(!Number.isNaN(col)&&hoveredLane!==col){hoveredLane=col;renderGhost();}
  });
  board.addEventListener('mouseleave',()=>{
   if(hoveredLane!==null){hoveredLane=null;renderGhost();}
  });
 }

 const lanes=$('#lanes');
 if(lanes){
  lanes.addEventListener('click',e=>{
   const btn=e.target.closest('.lane');
   if(!btn||btn.disabled)return;
   const col=Number(btn.dataset.col);
   if(!Number.isNaN(col))play(col);
  });
  lanes.addEventListener('mouseover',e=>{
   const btn=e.target.closest('.lane');
   if(!btn)return;
   const col=Number(btn.dataset.col);
   if(!Number.isNaN(col)&&hoveredLane!==col){hoveredLane=col;renderGhost();}
  });
  lanes.addEventListener('mouseleave',()=>{
   if(hoveredLane!==null){hoveredLane=null;renderGhost();}
  });
 }
}

function render(){
 $('#score').textContent=game.score.toLocaleString();
 if(!dailyMode){
  records.best=Math.max(records.best,game.score);
  records.largest=Math.max(records.largest,...game.board);
 }
 $('#best').textContent=records.best.toLocaleString();

 const curMission=MISSIONS[Math.min(records.missionIdx||0,MISSIONS.length-1)];
 $('#mission').textContent=records.missionIdx>=MISSIONS.length?'All missions complete! Galaxy Legend.':curMission.title;
 $('#progress').textContent=records.missionIdx>=MISSIONS.length?'★ ★ ★':curMission.progress(game,lastDropChain);

 renderBoard();
 renderLanes();

 for(const id of ['undo','shuffle','new','restart','rescue','ad'])document.getElementById(id).hidden=dailyMode;
 document.getElementById('over-copy').textContent=dailyMode?'Share your score or return to free play.':'A new universe is always free.';

 for(const [id,offset] of [['next',0],['after',1]]){
  const n=nextLevel(game,offset),el=$('#'+id);
  el.className=`planet l${n}${offset?' small':''}`;el.textContent=2**n;
 }

 $('#undo-count').textContent=freeUndo?'1 free':`${account?.undos||0} left`;
 $('#undo').disabled=!game.history.length||busy;

 $('#shuffle-count').textContent=freeShuffle?'1 free':`${account?.shuffles||0} left`;
 $('#shuffle').disabled=game.over||busy||game.board.filter(Boolean).length<2;

 $('#gameover').hidden=!game.over;
 $('#rescue').textContent=`Use a rescue (${account?.rescues||0} left)`;
 $('#rescue').disabled=busy;
 $('#ad').disabled=busy||!adAvailable||!!game.adUsed;
 $('#ad').textContent=game.adUsed?'Ad rescue used this orbit':adAvailable?'Watch an ad · rescue this orbit':'Rewarded ad unavailable';

 $('#record-score').textContent=records.best.toLocaleString();
 $('#record-planet').textContent=records.largest?2**records.largest:'—';
 $('#record-merges').textContent=(records.merges||0).toLocaleString();
 $('#record-games').textContent=records.games;

 updateDailySupplyUI();
 save();
}

function renderGhost(){
 const ghostRow=hoveredLane!==null?targetRow(game,hoveredLane):-1;
 const board=$('#board');
 if(board){
  for(let idx=0;idx<W*H;idx++){
   const cell=board.children[idx];
   if(!cell)continue;
   const c=idx%W,r=Math.floor(idx/W);
   const isGhost=hoveredLane===c&&r===ghostRow&&!game.board[idx];
   cell.classList.toggle('ghost',isGhost);
  }
 }
 const lanes=$('#lanes');
 if(lanes){
  for(let c=0;c<W;c++){
   const btn=lanes.children[c];
   if(btn)btn.classList.toggle('active-lane',hoveredLane===c);
  }
 }
}

function spawnScorePopup(pos,points,chain){
 const board=$('#board');
 if(!board)return;
 const cell=board.children[pos];
 if(!cell)return;
 const popup=document.createElement('span');
 popup.className='score-popup';
 popup.textContent=`+${points}${chain>1?' x'+chain:''}`;
 cell.append(popup);
 setTimeout(()=>popup.remove(),650);
}

function play(c){
 if(busy)return;
 if(pending){$('#status').textContent='Finish your pending booster by pressing its button again.';return;}
 const prevScore=game.score;
 const result=drop(game,c);
 if(!result){$('#status').textContent='That lane is full. Try another one.';return;}

 sfx.drop();
 lastDropChain=result.chain||0;
 lastMergedPos=result.chain>0?result.at:null;
 lastScoredPoints=game.score-prevScore;

 if(result.chain>0){
  records.merges=(records.merges||0)+result.chain;
  sfx.merge(result.level||2,result.chain);
  spawnScorePopup(result.at,lastScoredPoints,result.chain);
 }

 $('#status').textContent=result.chain>1?`${result.chain}-step cascade! Nicely calculated.`:result.chain?'Planets merged. Space expands.':'';
 try{tg?.HapticFeedback?.impactOccurred(result.chain>1?'medium':'light');}catch{}

 checkMissions();
 render();

 if(game.over){
  sfx.gameOver();
  try{tg?.HapticFeedback?.notificationOccurred('warning');}catch{}
 }
}

function start(){
 if(dailyMode||busy)return;
 if(pending){$('#status').textContent='Finish your pending booster first. Reopen the game to retry safely.';return;}
 game=newGame();freeUndo=1;freeShuffle=1;records.games++;
 lastDropChain=0;lastMergedPos=null;hoveredLane=null;
 $('#status').textContent='A fresh orbit. Your first undo & shuffle are free.';
 sfx.drop();
 render();
}

async function api(path,body){
 const r=await fetch('/api/'+path,{method:'POST',headers:{'content-type':'application/json','x-telegram-init-data':tg?.initData||''},body:JSON.stringify(body||{})});
 let result;try{result=await r.json();}catch{throw new Error('Purchases are unavailable on this preview.');}
 if(!r.ok){const e=new Error(result.error||'Please try again.');e.rejected=true;throw e;}
 return result;
}

async function spend(kind){
 if(pending&&pending.kind!==kind)throw new Error('Finish the other pending booster first.');
 if(!pending)pending={kind,request_id:crypto.randomUUID(),game:structuredClone(game)};
 if(!save()){pending=null;throw new Error('Paid boosters need browser storage to safely recover interrupted requests.');}
 try{
  account=await api('consume',{kind,request_id:pending.request_id});
  game=pending.game;
  if(kind==='undos')undo(game);
  else if(kind==='shuffles')shuffle(game);
  else rescue(game);
  pending=null;save();
 }catch(e){if(e.rejected){pending=null;save();}throw e;}
}

async function refreshAccount(){
 account=await api('account');
 $('#balance').textContent=`Your boosters: ${account.undos||0} undos · ${account.shuffles||0} shuffles · ${account.rescues||0} rescues`;
 render();
}

$('#undo').addEventListener('click',async()=>{
 if(!game.history.length||busy)return;
 busy=true;render();
 try{
  if(freeUndo){freeUndo--;undo(game);}
  else await spend('undos');
  sfx.undo();
  $('#status').textContent='Last drop undone.';
 }catch(e){
  $('#status').textContent=e.message+(pending?' Press Undo to retry safely.':'');
 }finally{busy=false;render();}
});

$('#shuffle').addEventListener('click',async()=>{
 if(game.over||busy||game.board.filter(Boolean).length<2)return;
 busy=true;render();
 try{
  if(freeShuffle){freeShuffle--;shuffle(game);}
  else await spend('shuffles');
  sfx.shuffle();
  try{tg?.HapticFeedback?.impactOccurred('medium');}catch{}
  $('#status').textContent='Cosmic shuffle! Planets rearranged.';
 }catch(e){
  $('#status').textContent=e.message;
 }finally{busy=false;render();}
});

$('#rescue').addEventListener('click',async()=>{
 if(!game.over||busy)return;
 busy=true;render();
 try{
  await spend('rescues');
  sfx.fanfare();
  $('#status').textContent='Room to breathe. Keep your orbit going.';
 }catch(e){$('#status').textContent=e.message;}finally{busy=false;render();}
});

$('#new').addEventListener('click',()=>{
 if(game.drops&&!game.over){if(!confirm('Start a new orbit? Current board will reset.'))return;}
 start();
});
$('#restart').addEventListener('click',start);

document.querySelectorAll('[data-view]').forEach(b=>b.addEventListener('click',()=>{
 document.querySelectorAll('.view').forEach(v=>v.hidden=v.id!==b.dataset.view);
 document.querySelectorAll('.tab').forEach(t=>{
  t.classList.toggle('selected',t===b);
  if(t===b)t.setAttribute('aria-current','page');else t.removeAttribute('aria-current');
 });
}));

$('#help').addEventListener('click',()=>$('#help-dialog').showModal());
$('#close-help').addEventListener('click',()=>$('#help-dialog').close());

document.querySelectorAll('[data-set-theme]').forEach(btn=>{
 btn.addEventListener('click',()=>{
  const theme=btn.dataset.setTheme;
  records.theme=theme;
  if(theme==='default')document.documentElement.removeAttribute('data-theme');
  else document.documentElement.setAttribute('data-theme',theme);
  document.querySelectorAll('.theme-btn').forEach(b=>b.classList.toggle('active',b===btn));
  save();
 });
});

function updateDailySupplyUI(){
 const btn=$('#daily-supply-btn'),desc=$('#daily-supply-desc');
 if(!btn||!desc)return;
 const claimed=records.lastDailySupply===dailyDate;
 if(claimed){
  btn.textContent='Claimed';
  btn.disabled=true;
  desc.textContent='Daily supply opened for today. Come back tomorrow!';
 }else{
  btn.textContent='Claim';
  btn.disabled=false;
  desc.textContent=adAvailable?'Watch sponsor ad · claim 1 free booster!':'Claim 1 free mystery booster today!';
 }
}

$('#daily-supply-btn').addEventListener('click',async()=>{
 if(busy||records.lastDailySupply===dailyDate)return;
 busy=true;
 try{
  let success=false;
  if(adAvailable){
   const res=config.monetag?completedMonetagReward(await showMonetagRewarded(config.monetag)):completedReward(await showRewarded(config.adsBlockId));
   success=!!res;
  }else{
   success=true;
  }
  if(success){
   const grantUndo=Math.random()<0.5;
   if(grantUndo)freeUndo++;else freeShuffle++;
   records.lastDailySupply=dailyDate;
   sfx.fanfare();
   try{tg?.HapticFeedback?.notificationOccurred('success');}catch{}
   $('#shop-status').textContent=`🎁 Mystery reward unlocked: +1 Free ${grantUndo?'Undo':'Shuffle'} added!`;
  }else{
   $('#shop-status').textContent='Ad not completed. Mystery booster was not awarded.';
  }
 }catch{
  $('#shop-status').textContent='Sponsor supply temporarily unavailable. Try again shortly.';
 }finally{
  busy=false;
  render();
 }
});

$('#share').addEventListener('click',async()=>{
 const url=config.botUsername?`https://t.me/${config.botUsername}?startapp=play`:location.origin;
 const maxP=records.largest?2**records.largest:'32';
 const text=`🪐 Orbit Merge Record!\n🏆 Best Score: ${records.best.toLocaleString()}\n⭐ Highest Planet: ${maxP}\n🎮 Merges: ${(records.merges||0).toLocaleString()}\nCan you build a bigger universe? Play free:`;
 if(tg?.initData)tg.openTelegramLink(`https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`);
 else if(navigator.share){try{await navigator.share({title:'Orbit Merge',text,url});}catch{}}
 else{try{await navigator.clipboard.writeText(text+' '+url);$('#share').textContent='Record summary copied!';}catch{$('#share').textContent='Copy from address bar';}}
});

const purchaseStorage='orbit-merge-pending-order';
let pendingPurchase;try{pendingPurchase=localStorage.getItem(purchaseStorage);}catch{}
function rememberPurchase(orderId){pendingPurchase=orderId;try{if(orderId)localStorage.setItem(purchaseStorage,orderId);else localStorage.removeItem(purchaseStorage);}catch{}}

async function checkPurchase(orderId,attempts=1){
 const status=$('#shop-status');
 for(let attempt=0;attempt<attempts;attempt++){
  try{
   if((await api('order',{orderId})).paid){
    await refreshAccount();
    if(pendingPurchase===orderId)rememberPurchase(null);
    status.textContent='Purchase confirmed. Boosters added to your balance.';
    return;
   }
  }catch{}
  if(attempt+1<attempts)await new Promise(r=>setTimeout(r,1200));
 }
 status.textContent='Awaiting confirmation. Check status again or contact payment support with your Telegram receipt.';
}

const buyButtons=[...document.querySelectorAll('[data-product]')];
$('#check-purchase').addEventListener('click',()=>{
 if(pendingPurchase)checkPurchase(pendingPurchase);
 else refreshAccount().catch(e=>{$('#shop-status').textContent=e.message;});
});

for(const button of buyButtons){
 button.addEventListener('click',async()=>{
  if(busy)return;busy=true;buyButtons.forEach(b=>b.disabled=true);
  const status=$('#shop-status');
  const unlock=()=>{busy=false;buyButtons.forEach(b=>b.disabled=false);};
  status.textContent='Opening Telegram Stars checkout…';
  try{
   const {url,orderId}=await api('invoice',{product:button.dataset.product});
   tg.openInvoice(url,async res=>{
    if(res==='paid'||res==='pending'){
     rememberPurchase(orderId);
     status.textContent='Checking payment confirmation…';
     try{await checkPurchase(orderId,6);}finally{unlock();}
    }else{
     status.textContent=res==='cancelled'?'Purchase cancelled.':'Checkout did not complete.';
     unlock();
    }
   });
  }catch(e){status.textContent=e.message;unlock();}
 });
}

window.addEventListener('keydown',e=>{
 if($('#play').hidden||$('#help-dialog').open)return;
 if(/^[1-5]$/.test(e.key))play(Number(e.key)-1);
 if(e.key==='u'||e.key==='U')$('#undo').click();
 if(e.key==='s'||e.key==='S')$('#shuffle').click();
});

try{tg?.ready();tg?.expand();tg?.setHeaderColor('#f3f6fc');tg?.setBackgroundColor('#f3f6fc');}catch{}
setupEventDelegation();
render();

try{const r=await fetch('/api/config');if(r.ok)config=await r.json();}catch{}
if(config.payments&&tg?.initData){
 try{
  await refreshAccount();
  $('#commerce-status').textContent='Telegram Stars · Secure one-time purchases';
  document.querySelectorAll('.buy').forEach(b=>b.disabled=false);
  $('#mode').textContent='TELEGRAM';
 }catch(e){$('#commerce-status').textContent=e.message;}
}

if(pending&&account){
 busy=true;
 try{
  await spend(pending.kind);
  $('#status').textContent='Your interrupted booster was recovered.';
 }catch(e){$('#status').textContent=e.message;}finally{busy=false;render();}
}

adAvailable=!!((config.monetag||config.ads&&/^\d+$/.test(config.adsBlockId||''))&&tg?.initData);
render();

$('#ad').addEventListener('click',async()=>{
 if(dailyMode||!adAvailable||busy||!game.over||game.adUsed||pending)return;
 busy=true;render();
 try{
  const completed=config.monetag?completedMonetagReward(await showMonetagRewarded(config.monetag)):completedReward(await showRewarded(config.adsBlockId));
  if(completed){
   rescue(game);game.adUsed=true;
   sfx.fanfare();
   $('#status').textContent='Ad completed. Your orbit has room again.';
  }else $('#status').textContent='Ad not completed. No rescue was used.';
 }catch{$('#status').textContent='Ad skipped or unavailable. No rescue was used.';}finally{busy=false;render();}
});

$('#daily').addEventListener('click',toggleDaily);
$('#daily-share').addEventListener('click',async()=>{
 const url='https://t.me/OrbitMergeAjayBot/play?startapp=daily';
 const msg=`Orbit Merge Daily · ${dailyDate}\nScore: ${game.score}\nSame puzzle for everyone. Zero boosters. Can you beat me?\n${url}`;
 if(tg?.initData){
  tg.openTelegramLink('https://t.me/share/url?url='+encodeURIComponent(url)+'&text='+encodeURIComponent(msg));
 }else{
  try{await navigator.clipboard.writeText(msg);$('#status').textContent='Daily challenge link copied!';}catch{$('#status').textContent=url;}
 }
});

if(tg?.initDataUnsafe?.start_param==='daily'||new URLSearchParams(location.search).get('mode')==='daily')toggleDaily();
