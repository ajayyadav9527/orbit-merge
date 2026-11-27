import {W,H,newGame,nextLevel,available,targetRow,drop,undo,rescue,shuffle,dailySeed} from './engine.js';
import {requestRewardedAd} from './ads.js';

const $=s=>document.querySelector(s),getTg=()=>window.Telegram?.WebApp;
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

const pagesOrigin='https://ajayyadav9527.github.io';
const defaultConfig = {
 monetag: location.origin===pagesOrigin&&location.pathname.startsWith('/orbit-merge/') ? {
  zone: '12304789',
  scriptUrl: 'https://libtl.com/sdk.js'
 } : null,
 botUsername: 'OrbitMergeAjayBot',
 adsterraSmartlink: 'https://www.profitablecpmrate.com/fptf61s1k?key=c6c4c05ef1c8dfb208da70557431b997'
};

let game=stored?.game&&Array.isArray(stored.game.board)&&stored.game.board.length===W*H?stored.game:newGame();
let records=stored?.records||{best:0,largest:0,games:1,merges:0,missionIdx:0,theme:'default'};
if(!records.streak||typeof records.streak!=='object')records.streak={count:0,lastClaimDate:'',lastAdBoostDate:''};
if(!Array.isArray(records.unlockedThemes))records.unlockedThemes=[];
if(!records.themeTrials||typeof records.themeTrials!=='object')records.themeTrials={};
let freeUndo=stored?.freeUndo??1,freeShuffle=stored?.freeShuffle??1,pendingNextShuffle=Math.max(0,Number(stored?.pendingNextShuffle||0)),account=null,busy=false,config={...defaultConfig},pending=stored?.pending||null,adAvailable=!!defaultConfig.monetag;
let hoveredLane=null,lastDropChain=0,lastMergedPos=null,lastScoredPoints=0,pendingTrialTheme=null,themeTrialDenied=false;
let friendTarget=0;

const THEME_MILESTONES={'nebula-gold':1500,'void-eclipse':3000};
const THEME_LABELS={default:'Nebula',cyber:'Cyber',solar:'Solar','nebula-gold':'Nebula Gold','void-eclipse':'Void Eclipse'};
function isThemeUnlocked(id){
 if(!Object.hasOwn(THEME_MILESTONES,id))return true;
 if((records.best||0)>=THEME_MILESTONES[id])return true;
 if(records.unlockedThemes.includes(id))return true;
 return Number(records.themeTrials?.[id]||0)>Date.now();
}
function applyTheme(theme){
 const nextTheme=isThemeUnlocked(theme)?theme:'default';
 records.theme=nextTheme;
 if(nextTheme==='default')document.documentElement.removeAttribute('data-theme');
 else document.documentElement.setAttribute('data-theme',nextTheme);
}
applyTheme(records.theme||'default');

const starsBackendActive=()=>Boolean(config.payments&&getTg()?.initData&&account!==null);
const watchRewardedAd=placement=>requestRewardedAd(config,placement);

const MISSIONS=[
 {title:'Mission 1: Discover a 16 Planet',target:16,check:(g)=>Math.max(0,...g.board)>=4,progress:(g)=>`${Math.max(0,...g.board)?2**Math.min(4,Math.max(...g.board)):0} / 16`,reward:'+1 Free Undo',grant:()=>{freeUndo++;}},
 {title:'Mission 2: Trigger a 1-Step Cascade',target:1,check:(g,c)=>c>=1,progress:(g,c)=>`${Math.min(1,c||0)} / 1`,reward:'+1 Free Shuffle',grant:()=>{freeShuffle++;}},
 {title:'Mission 3: Score 300 in one orbit',target:300,check:(g)=>g.score>=300,progress:(g)=>`${Math.min(300,g.score)} / 300`,reward:'+1 Free Undo',grant:()=>{freeUndo++;}},
 {title:'Mission 4: Discover a 64 Planet',target:64,check:(g)=>Math.max(0,...g.board)>=6,progress:(g)=>`${Math.max(0,...g.board)?2**Math.min(6,Math.max(...g.board)):0} / 64`,reward:'+1 Free Rescue',grant:()=>{if(account)account.rescues++;}},
 {title:'Mission 5: Reach 1,000 High Score',target:1000,check:(g)=>g.score>=1000,progress:(g)=>`${Math.min(1000,g.score)} / 1000`,reward:'+1 Free Shuffle',grant:()=>{freeShuffle++;}},
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
  try{getTg()?.HapticFeedback?.notificationOccurred('success');}catch{}
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
  localStorage.setItem(STORAGE,JSON.stringify({game,records,freeUndo,freeShuffle,pending,pendingNextShuffle}));
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
 if(friendTarget)$('#friend-challenge').classList.toggle('beaten',game.score>friendTarget);
 $('#score').textContent=game.score.toLocaleString();
 if(!dailyMode){
  records.best=Math.max(records.best,game.score);
  records.largest=Math.max(records.largest,...game.board);
  for(const [themeId,milestone] of Object.entries(THEME_MILESTONES)){
   if(records.best>=milestone&&!records.unlockedThemes.includes(themeId))records.unlockedThemes.push(themeId);
  }
 }
 $('#best').textContent=records.best.toLocaleString();

 const curMission=MISSIONS[Math.min(records.missionIdx||0,MISSIONS.length-1)];
 $('#mission').textContent=records.missionIdx>=MISSIONS.length?'All missions complete! Galaxy Legend.':curMission.title;
 $('#progress').textContent=records.missionIdx>=MISSIONS.length?'★ ★ ★':curMission.progress(game,lastDropChain);

 renderBoard();
 renderLanes();

 for(const id of ['undo','shuffle','new','restart','rescue','ad','ad-double-score','ad-bonus-shuffle','gameover-share'])document.getElementById(id).hidden=dailyMode;
 document.getElementById('over-copy').textContent=dailyMode?'Share your score or return to free play.':'A new universe is always free.';

 for(const [id,offset] of [['next',0],['after',1]]){
  const n=nextLevel(game,offset),el=$('#'+id);
  el.className=`planet l${n}${offset?' small':''}`;el.textContent=2**n;
 }

 const hasPaidUndo=(account?.undos||0)>0;
 const hasPaidShuffle=(account?.shuffles||0)>0;
 const canAdUndo=!dailyMode&&!game.over&&game.history.length>0&&freeUndo===0&&!hasPaidUndo&&!pending&&!starsBackendActive()&&adAvailable;
 const canAdShuffle=!dailyMode&&!game.over&&game.board.filter(Boolean).length>=2&&freeShuffle===0&&!hasPaidShuffle&&!pending&&!starsBackendActive()&&adAvailable;

 $('#undo-count').textContent=freeUndo>1?`${freeUndo} free`:freeUndo?'1 free':starsBackendActive()?`${account?.undos||0} left`:'0 free';
 $('#undo').disabled=(!game.history.length&&pending?.kind!=='undos')||busy;

 $('#shuffle-count').textContent=freeShuffle>1?`${freeShuffle} free`:freeShuffle?'1 free':starsBackendActive()?`${account?.shuffles||0} left`:'0 free';
 $('#shuffle').disabled=(game.over&&pending?.kind!=='shuffles')||busy||(game.board.filter(Boolean).length<2&&pending?.kind!=='shuffles');

 $('#ad-recovery').hidden=!(canAdUndo||canAdShuffle);
 $('#ad-undo').hidden=!canAdUndo;
 $('#ad-undo').disabled=busy;
 $('#ad-shuffle').hidden=!canAdShuffle;
 $('#ad-shuffle').disabled=busy;

 $('#gameover').hidden=!game.over;
 $('#rescue').textContent=`Use a rescue (${account?.rescues||0} left)`;
 $('#rescue').disabled=busy;
 $('#ad').disabled=busy||!adAvailable||!!game.adUsed;
 $('#ad').textContent=game.adUsed?'Ad rescue used this orbit':adAvailable?'Watch an ad · rescue this orbit':'Rewarded ad unavailable';
 $('#ad-double-score').hidden=dailyMode||game.score<=0;
 $('#ad-double-score').disabled=busy||!adAvailable||!!game.scoreDoubled;
 $('#ad-double-score').textContent=game.scoreDoubled?'2x Final Score applied ✓':'📺 Watch Ad · 2x Final Score';
 $('#ad-bonus-shuffle').hidden=dailyMode;
 $('#ad-bonus-shuffle').disabled=busy||!adAvailable||!!game.nextBonusShuffleClaimed;
 $('#ad-bonus-shuffle').textContent=game.nextBonusShuffleClaimed?'Bonus Shuffle queued ✓':'📺 Watch Ad · +1 Shuffle Next Orbit';
 $('#sponsor-drop-btn').disabled=busy||!adAvailable;
 $('#gameover-story').hidden=dailyMode||typeof getTg()?.shareToStory!=='function';
 $('#gameover-story').disabled=busy;
 $('#share-story').hidden=typeof getTg()?.shareToStory!=='function';

 $('#record-score').textContent=records.best.toLocaleString();
 $('#record-planet').textContent=records.largest?2**records.largest:'—';
 $('#record-merges').textContent=(records.merges||0).toLocaleString();
 $('#record-games').textContent=records.games;

 updateDailySupplyUI();
 updateStreakUI();
 updateThemesUI();
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
 try{getTg()?.HapticFeedback?.impactOccurred(result.chain>1?'medium':'light');}catch{}

 checkMissions();
 render();

 if(game.over){
  sfx.gameOver();
  try{getTg()?.HapticFeedback?.notificationOccurred('warning');}catch{}
 }
}

function start(){
 if(dailyMode||busy)return;
 if(pending){$('#status').textContent='Finish your pending booster first. Reopen the game to retry safely.';return;}
 const bonusShuffles=pendingNextShuffle||0;
 game=newGame();freeUndo=1;freeShuffle=1+bonusShuffles;pendingNextShuffle=0;records.games++;
 lastDropChain=0;lastMergedPos=null;hoveredLane=null;
 $('#status').textContent=bonusShuffles?`A fresh orbit! Started with +${bonusShuffles} bonus shuffle${bonusShuffles>1?'s':''}.`:'A fresh orbit. Your first undo & shuffle are free.';
 sfx.drop();
 render();
}

async function api(path,body){
 const r=await fetch('/api/'+path,{method:'POST',headers:{'content-type':'application/json','x-telegram-init-data':getTg()?.initData||''},body:JSON.stringify(body||{}),signal:AbortSignal.timeout(12000)});
 let result;try{result=await r.json();}catch{const e=new Error('Purchases are unavailable on this preview.');e.rejected=true;throw e;}
 if(!r.ok){const e=new Error(result.error||'Please try again.');e.rejected=r.status>=400&&r.status<500&&![401,403,408,429].includes(r.status);throw e;}
 return result;
}

function updateCommerceUI(){
 const signedIn=!!getTg()?.initData;
 if(account){
  $('#balance').textContent=`Your boosters: ${account.undos||0} undos · ${account.shuffles||0} shuffles · ${account.rescues||0} rescues`;
 }
 if(config.payments&&signedIn&&account!==null){
  $('#commerce-status').textContent='Telegram Stars · Secure one-time purchases';
  document.querySelectorAll('[data-product]').forEach(b=>b.disabled=false);
  $('#mode').textContent='TELEGRAM';
 }
 $('#open-telegram-shop').hidden=signedIn;
 $('#check-purchase').hidden=!signedIn||!config.payments;
 if(!signedIn){
  $('#commerce-status').textContent='Open the game in Telegram to buy a pack.';
 }else if(configReady&&!config.payments){
  $('#commerce-status').textContent='Stars purchases are unavailable right now. You can still claim free boosters.';
 }
}

async function spend(kind){
 if(pending&&pending.kind!==kind)throw new Error('Finish the other pending booster first.');
 if(!pending)pending={kind,request_id:crypto.randomUUID(),game:structuredClone(game)};
 if(!save()){pending=null;throw new Error('Paid boosters need browser storage to safely recover interrupted requests.');}
 try{
  account=await api('consume',{kind,request_id:pending.request_id});
  updateCommerceUI();
  game=pending.game;
  if(kind==='undos')undo(game);
  else if(kind==='shuffles')shuffle(game);
  else rescue(game);
  pending=null;save();
 }catch(e){if(e.rejected){pending=null;save();}throw e;}
}

async function refreshAccount(){
 account=await api('account');
 updateCommerceUI();
 render();
}

$('#undo').addEventListener('click',async()=>{
 if((!game.history.length&&pending?.kind!=='undos')||busy)return;
 if(freeUndo>0&&!pending){
  freeUndo--;undo(game);sfx.undo();
  $('#status').textContent='Last drop undone.';
  render();return;
 }
 const canRetryPending=pending?.kind==='undos'&&config.payments&&getTg()?.initData;
 if(pending&&!canRetryPending){
  $('#status').textContent='Finish your pending booster by pressing its button again (or press New orbit to reset).';
  render();return;
 }
 if(!starsBackendActive()&&!canRetryPending){
  $('#status').textContent='Out of free Undos — tap "Watch Ad · +1 Undo" below.';
  render();return;
 }
 busy=true;render();
 try{
  await spend('undos');
  sfx.undo();
  $('#status').textContent='Last drop undone.';
 }catch(e){
  $('#status').textContent=e.message+(pending?' Press Undo to retry safely.':'');
 }finally{busy=false;render();}
});

$('#shuffle').addEventListener('click',async()=>{
 if((game.over&&pending?.kind!=='shuffles')||busy||(game.board.filter(Boolean).length<2&&pending?.kind!=='shuffles'))return;
 if(freeShuffle>0&&!pending){
  freeShuffle--;shuffle(game);sfx.shuffle();
  try{getTg()?.HapticFeedback?.impactOccurred('medium');}catch{}
  $('#status').textContent='Cosmic shuffle! Planets rearranged.';
  render();return;
 }
 const canRetryPending=pending?.kind==='shuffles'&&config.payments&&getTg()?.initData;
 if(pending&&!canRetryPending){
  $('#status').textContent='Finish your pending booster by pressing its button again (or press New orbit to reset).';
  render();return;
 }
 if(!starsBackendActive()&&!canRetryPending){
  $('#status').textContent='Out of free Shuffles — tap "Watch Ad · +1 Shuffle" below.';
  render();return;
 }
 busy=true;render();
 try{
  await spend('shuffles');
  sfx.shuffle();
  try{getTg()?.HapticFeedback?.impactOccurred('medium');}catch{}
  $('#status').textContent='Cosmic shuffle! Planets rearranged.';
 }catch(e){
  $('#status').textContent=e.message+(pending?' Press Shuffle to retry safely.':'');
 }finally{busy=false;render();}
});

$('#ad-undo').addEventListener('click',async()=>{
 if(dailyMode||game.over||busy||!game.history.length||!adAvailable)return;
 busy=true;render();
 try{
  const ok=await watchRewardedAd('undo');
  if(ok===true){
   freeUndo++;
   sfx.fanfare();
   try{getTg()?.HapticFeedback?.notificationOccurred('success');}catch{}
   $('#status').textContent='Ad completed! +1 Free Undo added.';
  }else{
   $('#status').textContent='Ad not completed. Undo booster was not awarded.';
  }
 }finally{busy=false;render();}
});

$('#ad-shuffle').addEventListener('click',async()=>{
 if(dailyMode||game.over||busy||game.board.filter(Boolean).length<2||!adAvailable)return;
 busy=true;render();
 try{
  const ok=await watchRewardedAd('shuffle');
  if(ok===true){
   freeShuffle++;
   sfx.fanfare();
   try{getTg()?.HapticFeedback?.notificationOccurred('success');}catch{}
   $('#status').textContent='Ad completed! +1 Free Shuffle added.';
  }else{
   $('#status').textContent='Ad not completed. Shuffle booster was not awarded.';
  }
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
 if((game.drops&&!game.over)||pending){
  if(!confirm(pending?'Discard your pending booster and start a new orbit? Current board will reset.':'Start a new orbit? Current board will reset.'))return;
 }
 if(pending){pending=null;save();}
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

function updateThemesUI(){
 const activeTheme=isThemeUnlocked(records.theme)?records.theme:'default';
 if(records.theme!==activeTheme)applyTheme(activeTheme);
 document.querySelectorAll('.theme-btn').forEach(b=>{
  const id=b.dataset.setTheme;
  const unlocked=isThemeUnlocked(id);
  b.classList.toggle('active',id===activeTheme);
  b.classList.toggle('locked',!unlocked);
  if(THEME_MILESTONES[id]){
   const label=THEME_LABELS[id]||id;
   b.textContent=unlocked?label:`🔒 ${label}`;
  }
 });
 const bar=$('#theme-trial-bar'),text=$('#theme-trial-text'),trialBtn=$('#theme-trial-btn');
 if(!bar||!text||!trialBtn)return;
 if(pendingTrialTheme&&!isThemeUnlocked(pendingTrialTheme)){
  const label=THEME_LABELS[pendingTrialTheme]||pendingTrialTheme;
  const milestone=THEME_MILESTONES[pendingTrialTheme];
  bar.hidden=false;
  text.textContent=themeTrialDenied?'Ad not completed. 24h trial was not unlocked.':`Unlock ${label} at ${milestone.toLocaleString()} Best Score, or try free for 24h:`;
  trialBtn.disabled=busy||!adAvailable;
 }else{
  pendingTrialTheme=null;
  themeTrialDenied=false;
  bar.hidden=true;
 }
}

document.querySelectorAll('[data-set-theme]').forEach(btn=>{
 btn.addEventListener('click',()=>{
  const theme=btn.dataset.setTheme;
  themeTrialDenied=false;
  if(isThemeUnlocked(theme)){
   pendingTrialTheme=null;
   applyTheme(theme);
   updateThemesUI();
   save();
  }else{
   pendingTrialTheme=theme;
   updateThemesUI();
  }
 });
});

$('#theme-trial-btn').addEventListener('click',async()=>{
 if(!pendingTrialTheme||busy||!adAvailable)return;
 const targetTheme=pendingTrialTheme;
 themeTrialDenied=false;
 busy=true;render();
 try{
  const ok=await watchRewardedAd('theme_trial');
  if(ok===true){
   records.themeTrials[targetTheme]=Date.now()+86400000;
   pendingTrialTheme=null;
   themeTrialDenied=false;
   applyTheme(targetTheme);
   sfx.fanfare();
   try{getTg()?.HapticFeedback?.notificationOccurred('success');}catch{}
   $('#status').textContent=`✨ 24h ${THEME_LABELS[targetTheme]||targetTheme} theme trial unlocked!`;
  }else{
   themeTrialDenied=true;
   $('#status').textContent='Ad not completed. 24h trial was not unlocked.';
  }
 }finally{busy=false;render();}
});

function prevUtcDate(dateStr){
 const d=new Date(dateStr+'T00:00:00Z');
 d.setUTCDate(d.getUTCDate()-1);
 return d.toISOString().slice(0,10);
}

const STREAK_REWARDS=[
 {day:1,short:'+1 Undo',label:'+1 Free Undo',grant:()=>{freeUndo+=1;}},
 {day:2,short:'+1 Shuf',label:'+1 Free Shuffle',grant:()=>{freeShuffle+=1;}},
 {day:3,short:'1U + 1S',label:'+1 Free Undo & +1 Free Shuffle',grant:()=>{freeUndo+=1;freeShuffle+=1;}},
 {day:4,short:'+2 Undo',label:'+2 Free Undos',grant:()=>{freeUndo+=2;}},
 {day:5,short:'+2 Shuf',label:'+2 Free Shuffles',grant:()=>{freeShuffle+=2;}},
 {day:6,short:'2U + 1S',label:'+2 Free Undos & +1 Free Shuffle',grant:()=>{freeUndo+=2;freeShuffle+=1;}},
 {day:7,short:'2U+2S ★',label:'+2 Free Undos, +2 Free Shuffles & 24h Nebula Gold Trial',grant:()=>{freeUndo+=2;freeShuffle+=2;records.themeTrials['nebula-gold']=Math.max(Number(records.themeTrials['nebula-gold']||0),Date.now()+86400000);}}
];

function updateStreakUI(){
 const card=$('#streak-card'),badge=$('#streak-badge'),desc=$('#streak-desc'),daysEl=$('#streak-days'),claimBtn=$('#streak-claim-btn'),boostBtn=$('#streak-2x-btn'),repairBtn=$('#streak-repair-btn');
 if(!card||!badge||!desc||!daysEl||!claimBtn||!boostBtn||!repairBtn)return;
 const st=records.streak;
 const yesterday=prevUtcDate(dailyDate);
 const claimedToday=st.lastClaimDate===dailyDate;
 const isBroken=st.count>0&&!!st.lastClaimDate&&!claimedToday&&st.lastClaimDate!==yesterday;
 const nextDay=claimedToday?st.count:isBroken?1:((st.count%7)+1);
 badge.textContent=`Day ${st.count||0} / 7`;
 if(claimedToday){
  const curIdx=Math.max(0,Math.min(6,(st.count||1)-1));
  desc.textContent=`Day ${st.count} claimed (${STREAK_REWARDS[curIdx].label}). ${st.lastAdBoostDate===dailyDate?'2x boost claimed!':'Watch an ad to double today’s reward.'}`;
  claimBtn.textContent='Claimed Today ✓';
  claimBtn.disabled=true;
 }else if(isBroken){
  desc.textContent=`Streak paused at Day ${st.count}. Watch an ad to repair it, or start fresh at Day 1.`;
  claimBtn.textContent='Start Day 1 (+1 Undo)';
  claimBtn.disabled=busy;
 }else{
  const nextReward=STREAK_REWARDS[nextDay-1];
  desc.textContent=`Claim Day ${nextDay}: ${nextReward.label}.`;
  claimBtn.textContent=`Claim Day ${nextDay}`;
  claimBtn.disabled=busy;
 }
 boostBtn.hidden=!(claimedToday&&st.lastAdBoostDate!==dailyDate&&adAvailable);
 boostBtn.disabled=busy;
 repairBtn.hidden=!(isBroken&&adAvailable);
 repairBtn.disabled=busy;
 if(!repairBtn.hidden)repairBtn.textContent=`📺 Watch Ad · Repair Day ${st.count} Streak`;

 daysEl.replaceChildren();
 for(const item of STREAK_REWARDS){
  const cell=document.createElement('div');
  const isDone=claimedToday?item.day<=st.count:(!isBroken&&item.day<=st.count);
  const isCurrent=!claimedToday&&item.day===nextDay;
  cell.className=`streak-day${isDone?' done':''}${isCurrent?' current':''}`;
  const strong=document.createElement('strong');
  strong.textContent=`D${item.day}`;
  const span=document.createElement('span');
  span.textContent=item.short;
  cell.append(strong,span);
  daysEl.append(cell);
 }
}

$('#streak-claim-btn').addEventListener('click',()=>{
 const st=records.streak;
 if(busy||st.lastClaimDate===dailyDate)return;
 const yesterday=prevUtcDate(dailyDate);
 st.count=st.lastClaimDate===yesterday?(st.count%7)+1:1;
 st.lastClaimDate=dailyDate;
 const reward=STREAK_REWARDS[st.count-1];
 reward.grant();
 sfx.fanfare();
 try{getTg()?.HapticFeedback?.notificationOccurred('success');}catch{}
 $('#shop-status').textContent=`🔥 Day ${st.count} streak claimed: ${reward.label}!`;
 render();
});

$('#streak-repair-btn').addEventListener('click',async()=>{
 const st=records.streak;
 const yesterday=prevUtcDate(dailyDate);
 const isBroken=st.count>0&&!!st.lastClaimDate&&st.lastClaimDate!==dailyDate&&st.lastClaimDate!==yesterday;
 if(busy||!isBroken||!adAvailable)return;
 busy=true;render();
 try{
  const ok=await watchRewardedAd('streak_repair');
  if(ok===true){
   st.lastClaimDate=yesterday;
   sfx.fanfare();
   try{getTg()?.HapticFeedback?.notificationOccurred('success');}catch{}
   const nextDay=(st.count%7)+1;
   $('#shop-status').textContent=`🔥 Streak repaired at Day ${st.count}! Tap Claim Day ${nextDay}.`;
  }else{
   $('#shop-status').textContent='Ad not completed. Streak was not repaired.';
  }
 }finally{busy=false;render();}
});

$('#streak-2x-btn').addEventListener('click',async()=>{
 const st=records.streak;
 if(busy||st.lastClaimDate!==dailyDate||st.lastAdBoostDate===dailyDate||!adAvailable)return;
 busy=true;render();
 try{
  const ok=await watchRewardedAd('streak_double');
  if(ok===true){
   const idx=Math.max(0,Math.min(6,(st.count||1)-1));
   const reward=STREAK_REWARDS[idx];
   reward.grant();
   st.lastAdBoostDate=dailyDate;
   sfx.fanfare();
   try{getTg()?.HapticFeedback?.notificationOccurred('success');}catch{}
   $('#shop-status').textContent=`🔥 2x Streak Bonus: ${reward.label}!`;
  }else{
   $('#shop-status').textContent='Ad not completed. 2x streak bonus was not awarded.';
  }
 }finally{busy=false;render();}
});

function updateDailySupplyUI(){
 const btn=$('#daily-supply-btn'),btn2x=$('#daily-supply-2x-btn'),desc=$('#daily-supply-desc');
 if(!btn||!desc)return;
 const claimed=records.lastDailySupply===dailyDate;
 const doubled=records.lastDailySupply2x===dailyDate;
 if(claimed){
  btn.textContent='Claimed';
  btn.disabled=true;
  if(btn2x){
   btn2x.hidden=doubled||!adAvailable;
   btn2x.disabled=busy||doubled||!adAvailable;
  }
  desc.textContent=doubled?'2x Daily Supply unlocked for today!':'Daily supply claimed! Watch an ad for +1 Undo & +1 Shuffle (2x).';
 }else{
  btn.textContent='Claim';
  btn.disabled=busy;
  if(btn2x)btn2x.hidden=true;
  desc.textContent='Claim 1 free mystery booster every day.';
 }
}

$('#daily-supply-btn').addEventListener('click',()=>{
 if(busy||records.lastDailySupply===dailyDate)return;
 const grantUndo=Math.random()<0.5;
 if(grantUndo)freeUndo++;else freeShuffle++;
 records.lastDailySupply=dailyDate;
 sfx.fanfare();
 try{getTg()?.HapticFeedback?.notificationOccurred('success');}catch{}
 $('#shop-status').textContent=`🎁 Daily supply claimed: +1 Free ${grantUndo?'Undo':'Shuffle'} added!`;
 render();
});

$('#daily-supply-2x-btn').addEventListener('click',async()=>{
 if(busy||records.lastDailySupply!==dailyDate||records.lastDailySupply2x===dailyDate||!adAvailable)return;
 busy=true;render();
 try{
  const ok=await watchRewardedAd('daily_supply_double');
  if(ok===true){
   freeUndo++;freeShuffle++;
   records.lastDailySupply2x=dailyDate;
   sfx.fanfare();
   try{getTg()?.HapticFeedback?.notificationOccurred('success');}catch{}
   $('#shop-status').textContent='🎁 2x Daily Supply unlocked: +1 Free Undo & +1 Free Shuffle added!';
  }else{
   $('#shop-status').textContent='Ad not completed. 2x Daily Supply was not awarded.';
  }
 }finally{busy=false;render();}
});

const sponsorDropBtn=$('#sponsor-drop-btn');
if(sponsorDropBtn){
 sponsorDropBtn.addEventListener('click',async()=>{
  if(busy||!adAvailable)return;
  busy=true;
  sponsorDropBtn.disabled=true;
  render();
  try{
   const success=await watchRewardedAd('sponsor_drop');
   if(success===true){
    const grantUndo=Math.random()<0.5;
    if(grantUndo) freeUndo++; else freeShuffle++;
    sfx.fanfare();
    try{getTg()?.HapticFeedback?.notificationOccurred('success');}catch{}
    $('#shop-status').textContent=`🎁 Sponsor Orbit Drop claimed! +1 Free ${grantUndo?'Undo':'Shuffle'} added!`;
   }else{
    $('#shop-status').textContent='Ad not completed. Sponsor drop was not awarded.';
   }
  }catch{
   $('#shop-status').textContent='Sponsor ad unavailable. No booster was awarded.';
  }finally{
   busy=false;
   sponsorDropBtn.disabled=false;
   render();
  }
 });
}

function buildChallengeShare(scoreOverride){
 const challengePts=Math.max(200,scoreOverride??records.best,game.score||0);
 const bot=config.botUsername||defaultConfig.botUsername||'OrbitMergeAjayBot';
 const botUrl=`https://t.me/${bot}?startapp=beat_${challengePts}`;
 const webUrl=`${location.origin}${location.pathname}?beat=${challengePts}`;
 const shareUrl=getTg()?.initData?botUrl:webUrl;
 const maxP=records.largest?2**records.largest:'32';
 const text=`🪐 Orbit Merge Record!\n🏆 Best Score: ${records.best.toLocaleString()}\n⭐ Highest Planet: ${maxP}\n🎮 Merges: ${(records.merges||0).toLocaleString()}\nCan you beat ${challengePts} PTS? Play free:`;
 return {challengePts,botUrl,webUrl,shareUrl,text};
}

async function handleShareClick(scoreOverride,buttonEl){
 const tg=getTg();
 const {shareUrl,text}=buildChallengeShare(scoreOverride);
 if(!records.shareBonus){records.shareBonus=true;freeShuffle++;save();render();$('#status').textContent='🎉 Share bonus: +1 Free Shuffle added!';}
 if(tg?.initData&&typeof tg?.openTelegramLink==='function'){
  tg.openTelegramLink(`https://t.me/share/url?url=${encodeURIComponent(shareUrl)}&text=${encodeURIComponent(text)}`);
 }else if(navigator.share){
  try{await navigator.share({title:'Orbit Merge',text,url:shareUrl});}catch{}
 }else{
  try{await navigator.clipboard.writeText(`${text} ${shareUrl}`);if(buttonEl)buttonEl.textContent='Challenge link copied!';}catch{if(buttonEl)buttonEl.textContent='Copy from address bar';}
 }
}

function shareScoreToStory(scoreOverride){
 const tg=getTg();
 if(typeof tg?.shareToStory!=='function')return;
 const {botUrl,challengePts}=buildChallengeShare(scoreOverride);
 try{
  tg.shareToStory('https://ajayyadav9527.github.io/orbit-merge/game_banner.png',{
   text:`🪐 Can you beat ${challengePts.toLocaleString()} PTS in Orbit Merge?`,
   widget_link:{url:botUrl,name:'Play Orbit Merge'}
  });
 }catch{}
}

$('#share').addEventListener('click',()=>handleShareClick(records.best,$('#share')));
$('#gameover-share').addEventListener('click',()=>handleShareClick(Math.max(records.best,game.score),$('#gameover-share')));
$('#share-story').addEventListener('click',()=>shareScoreToStory(records.best));
$('#gameover-story').addEventListener('click',()=>shareScoreToStory(Math.max(records.best,game.score)));

const browserPromoLinks={
 ApexFootballQuizAjayBot:'https://ajayyadav9527.github.io/football-quiz-tma/?ref=from_orbit',
 ApexSerpent3DRoyaleBot:'https://ajayyadav9527.github.io/apex-serpent-royale/?ref=from_orbit'
};

function updatePromoLinks(tg){
 for(const link of document.querySelectorAll('[data-promo-url]')){
  const telegramUrl=link.dataset.promoUrl;
  const bot=new URL(telegramUrl).pathname.slice(1);
  link.href=tg?.initData?telegramUrl:browserPromoLinks[bot]||telegramUrl;
 }
}

document.addEventListener('click',e=>{
 const promo=e.target.closest('[data-promo-url]');
 const tg=getTg();
 if(!promo||!tg?.initData||typeof tg.openTelegramLink!=='function')return;
 try{tg.openTelegramLink(promo.href);e.preventDefault();}catch{}
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
  }catch(e){
   if(e.rejected&&e.message==='Order not found.'){
    if(pendingPurchase===orderId)rememberPurchase(null);
    status.textContent='This order could not be found. Contact payment support if you have a receipt.';
    return;
   }
  }
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
  if(busy)return;
  const status=$('#shop-status');
  const previousOrder=pendingPurchase;
  busy=true;buyButtons.forEach(b=>b.disabled=true);
  const unlock=()=>{busy=false;buyButtons.forEach(b=>b.disabled=false);};
  status.textContent='Opening Telegram Stars checkout…';
  let orderId;
  try{
   const tg=getTg();
   if(!tg?.openInvoice)throw new Error('Open Orbit Merge in Telegram to buy boosters.');
   const invoice=await api('invoice',{product:button.dataset.product});
   orderId=invoice.orderId;
   if(!invoice.url||!orderId)throw new Error('Checkout is unavailable. Try again in a moment.');
   rememberPurchase(orderId);
   tg.openInvoice(invoice.url,async res=>{
    if(res==='paid'||res==='pending'){
     status.textContent='Checking payment confirmation…';
     try{await checkPurchase(orderId,6);}finally{unlock();}
    }else{
     if(pendingPurchase===orderId)rememberPurchase(previousOrder);
     status.textContent=res==='cancelled'?'Purchase cancelled.':'Checkout did not complete.';
     unlock();
    }
   });
  }catch(e){
   if(orderId&&pendingPurchase===orderId)rememberPurchase(previousOrder);
   status.textContent=e.message;unlock();
  }
 });
}

window.addEventListener('keydown',e=>{
 if($('#play').hidden||$('#help-dialog').open)return;
 if(/^[1-5]$/.test(e.key))play(Number(e.key)-1);
 if(e.key==='u'||e.key==='U')$('#undo').click();
 if(e.key==='s'||e.key==='S')$('#shuffle').click();
});

export function initFixedHeaderAdBar(){
 const bar=document.getElementById('fixed-header-ad-bar');
 if(!bar)return null;
 const slides=bar.querySelectorAll('.header-ad-slide');
 if(!slides||slides.length<=1)return null;
 let idx=0;
 const timer=setInterval(()=>{
  slides[idx].classList.remove('active');
  idx=(idx+1)%slides.length;
  slides[idx].classList.add('active');
 },8000);

 const openAd=()=>{
  const smartlink=config.adsterraSmartlink||defaultConfig.adsterraSmartlink||'https://www.profitablecpmrate.com/fptf61s1k?key=c6c4c05ef1c8dfb208da70557431b997';
  const tg=getTg();
  if(tg?.openLink){
   try{tg.openLink(smartlink);return;}catch{}
  }
  window.open(smartlink,'_blank','noopener,noreferrer');
 };

 bar.addEventListener('click',e=>{
  e.preventDefault();
  openAd();
 });
 bar.addEventListener('keydown',e=>{
  if(e.key==='Enter'||e.key===' '){
   e.preventDefault();
   openAd();
  }
 });
 return timer;
}

$('#ad').addEventListener('click',async()=>{
 if(dailyMode||!adAvailable||busy||!game.over||game.adUsed||pending)return;
 busy=true;render();
 try{
  const granted=await watchRewardedAd('game_over_rescue');
  if(granted===true){
   rescue(game);game.adUsed=true;
   sfx.fanfare();
   $('#status').textContent='Sponsor ad completed. Your orbit has room again.';
  }else{
   $('#status').textContent='Ad not completed. No rescue was used.';
  }
 }catch{
  $('#status').textContent='Ad skipped or unavailable. No rescue was used.';
 }finally{busy=false;render();}
});

$('#ad-double-score').addEventListener('click',async()=>{
 if(dailyMode||!adAvailable||busy||!game.over||game.scoreDoubled||game.score<=0||pending)return;
 busy=true;render();
 try{
  const granted=await watchRewardedAd('game_over_score_double');
  if(granted===true){
   game.score*=2;
   game.scoreDoubled=true;
   records.best=Math.max(records.best,game.score);
   sfx.fanfare();
   try{getTg()?.HapticFeedback?.notificationOccurred('success');}catch{}
   $('#status').textContent=`2x Final Score unlocked! New score: ${game.score.toLocaleString()}.`;
  }else{
   $('#status').textContent='Ad not completed. Score was not doubled.';
  }
 }catch{
  $('#status').textContent='Ad skipped or unavailable. Score was not doubled.';
 }finally{busy=false;render();}
});

$('#ad-bonus-shuffle').addEventListener('click',async()=>{
 if(dailyMode||!adAvailable||busy||!game.over||game.nextBonusShuffleClaimed||pending)return;
 busy=true;render();
 try{
  const granted=await watchRewardedAd('game_over_next_shuffle');
  if(granted===true){
   pendingNextShuffle=(pendingNextShuffle||0)+1;
   game.nextBonusShuffleClaimed=true;
   sfx.fanfare();
   try{getTg()?.HapticFeedback?.notificationOccurred('success');}catch{}
   $('#status').textContent='+1 Bonus Shuffle queued for your next orbit!';
  }else{
   $('#status').textContent='Ad not completed. Bonus Shuffle was not awarded.';
  }
 }catch{
  $('#status').textContent='Ad skipped or unavailable. Bonus Shuffle was not awarded.';
 }finally{busy=false;render();}
});

$('#daily').addEventListener('click',toggleDaily);
$('#daily-share').addEventListener('click',async()=>{
 const url='https://t.me/OrbitMergeAjayBot/play?startapp=daily';
 const msg=`Orbit Merge Daily · ${dailyDate}\nScore: ${game.score}\nSame puzzle for everyone. Zero boosters. Can you beat me?\n${url}`;
 const tg=getTg();
 if(tg?.initData){
  tg.openTelegramLink('https://t.me/share/url?url='+encodeURIComponent(url)+'&text='+encodeURIComponent(msg));
 }else{
  try{await navigator.clipboard.writeText(msg);$('#status').textContent='Daily challenge link copied!';}catch{$('#status').textContent=url;}
 }
});

let tgInitialized=false,configReady=false,dailyParamApplied=false,beatParamApplied=false,shopParamApplied=false,starsInitPromise=null;
function applyStartParams(){
 const q=new URLSearchParams(location.search);
 const sp=getTg()?.initDataUnsafe?.start_param||q.get('tgWebAppStartParam');
 if(!shopParamApplied&&sp==='shop'){
  shopParamApplied=true;
  document.querySelector('[data-view="shop"]').click();
 }
 if(!dailyParamApplied&&(sp==='daily'||q.get('mode')==='daily')){
  dailyParamApplied=true;
  if(!dailyMode)toggleDaily();
 }
 if(!beatParamApplied){
  const beatParam=Number(String(sp||q.get('beat')||'').match(/^(?:beat_)?(\d+)$/)?.[1]);
  if(Number.isSafeInteger(beatParam)&&beatParam>0){
   beatParamApplied=true;
   $('#status').textContent=`⚡ Incoming Challenge: Beat ${beatParam} PTS!`;
   $('#friend-challenge').hidden=false;
   $('#challenge-score').textContent=beatParam.toLocaleString();
   friendTarget=beatParam;
  }
 }
}

function initTelegramWebApp(){
 const tg=getTg();
 updatePromoLinks(tg);
 if(!tg)return false;
 if(!tgInitialized){
  tgInitialized=true;
  try{tg.ready?.();tg.expand?.();tg.setHeaderColor?.('#f3f6fc');tg.setBackgroundColor?.('#f3f6fc');}catch{}
 }
 applyStartParams();
 return true;
}

async function recoverPendingBooster(){
 if(!pending||busy||!config.payments||!getTg()?.initData)return;
 busy=true;render();
 try{
  await spend(pending.kind);
  $('#status').textContent='Your interrupted booster was recovered.';
 }catch(e){
  $('#status').textContent=e.message+(pending?' Press its button again to retry safely.':'');
 }finally{busy=false;render();}
}

async function initStarsSession(){
 if(!config.payments||!getTg()?.initData)return;
 if(starsInitPromise)return starsInitPromise;
 starsInitPromise=(async()=>{
  if(account===null){
   try{
    await refreshAccount();
   }catch(e){
    $('#commerce-status').textContent=e.message;
   }
  }
  await recoverPendingBooster();
 })();
 try{await starsInitPromise;}finally{starsInitPromise=null;}
}

async function onTelegramSdkReady(){
 initTelegramWebApp();
 updateCommerceUI();
 render();
 if(configReady&&config.payments&&getTg()?.initData){
  await initStarsSession();
 }
}

const tgScript=document.querySelector('script[src*="telegram-web-app.js"]');
if(tgScript)tgScript.addEventListener('load',()=>{onTelegramSdkReady();},{once:true});
window.addEventListener('load',()=>{onTelegramSdkReady();},{once:true});

initTelegramWebApp();
initFixedHeaderAdBar();
setupEventDelegation();
applyStartParams();
render();

try{
 const r=await fetch(new URL('./api/config',import.meta.url),{signal:AbortSignal.timeout(5000)});
 if(r.ok){
  const serverConfig=await r.json();
  config={...defaultConfig, ...serverConfig};
  if(!config.botUsername)config.botUsername=defaultConfig.botUsername;
 }
}catch{}
configReady=true;
adAvailable=!!((/^\d+$/.test(config.monetag?.zone||'')&&/^https:\/\//.test(config.monetag?.scriptUrl||''))||(config.ads&&/^\d+$/.test(config.adsBlockId||'')));
updateCommerceUI();
await initStarsSession();
render();
