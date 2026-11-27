const enc=new TextEncoder();
export const products={undos:{title:'Second chances',description:'5 undos for Orbit Merge',price:25,quantity:5},shuffles:{title:'Cosmic Shuffle',description:'3 shuffles for Orbit Merge',price:25,quantity:3},rescues:{title:'Room to breathe',description:'3 rescues for Orbit Merge',price:50,quantity:3}};
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json','cache-control':'no-store','x-content-type-options':'nosniff'}});
async function hmac(key,text){const k=await crypto.subtle.importKey('raw',typeof key==='string'?enc.encode(key):key,{name:'HMAC',hash:'SHA-256'},false,['sign']);return new Uint8Array(await crypto.subtle.sign('HMAC',k,enc.encode(text)));}
function equal(a,b){if(a.length!==b.length)return false;let n=0;for(let i=0;i<a.length;i++)n|=a.charCodeAt(i)^b.charCodeAt(i);return n===0;}
export async function identity(raw,token,now=Date.now()){
 if(!raw||!token)throw new Error('Open the game inside Telegram to use purchases.');
 const p=new URLSearchParams(raw),hash=p.get('hash');if(!hash||!/^[a-f0-9]{64}$/.test(hash)||new Set(p.keys()).size!==[...p.keys()].length)throw new Error('Invalid Telegram authentication.');p.delete('hash');
 const text=[...p.entries()].sort(([a],[b])=>a<b?-1:a>b?1:0).map(([k,v])=>`${k}=${v}`).join('\n');
 const secret=await hmac('WebAppData',token),digest=await hmac(secret,text),expected=[...digest].map(b=>b.toString(16).padStart(2,'0')).join('');if(!equal(hash,expected))throw new Error('Invalid Telegram authentication.');
 const age=Math.floor(now/1000)-Number(p.get('auth_date'));if(!Number.isFinite(age)||age< -30||age>3600)throw new Error('Telegram session expired. Reopen the game.');const u=JSON.parse(p.get('user')||'null');if(!Number.isSafeInteger(u?.id)||u.id<=0)throw new Error('Invalid Telegram user.');return u;
}
const migratedDbs=new WeakSet();
async function ensureAccountsSchema(db){
 if(!db||migratedDbs.has(db))return;
 try{
  const row=await db.prepare("SELECT name FROM pragma_table_info('accounts') WHERE name='shuffles'").first();
  if(!row)await db.prepare('ALTER TABLE accounts ADD COLUMN shuffles INTEGER NOT NULL DEFAULT 0 CHECK(shuffles>=0)').run();
  migratedDbs.add(db);
 }catch{}
}
export async function balance(db,id){await ensureAccountsSchema(db);await db.prepare('INSERT OR IGNORE INTO accounts(user_id) VALUES(?)').bind(id).run();return db.prepare('SELECT undos,shuffles,rescues FROM accounts WHERE user_id=?').bind(id).first();}
export async function settle(db,p,user){
 await ensureAccountsSchema(db);
 const o=await db.prepare('SELECT * FROM orders WHERE id=?').bind(p.invoice_payload).first();if(!o||o.user_id!==user||p.currency!=='XTR'||p.total_amount!==o.amount||typeof p.telegram_payment_charge_id!=='string')throw new Error('Payment does not match an order.');
 if(o.paid){if(o.charge!==p.telegram_payment_charge_id)throw new Error('Conflicting payment.');return false;}
 const product=Object.hasOwn(products,o.product)?products[o.product]:null;if(!product)throw new Error('Invalid product.');
 // D1 batch is transactional: a duplicate charge rolls back the inventory update.
 const results=await db.batch([
 db.prepare('INSERT OR IGNORE INTO accounts(user_id) VALUES(?)').bind(user),
 db.prepare(`UPDATE accounts SET ${o.product}=${o.product}+? WHERE user_id=? AND EXISTS(SELECT 1 FROM orders WHERE id=? AND paid=0)`).bind(product.quantity,user,o.id),
 db.prepare('UPDATE orders SET paid=1,charge=? WHERE id=? AND paid=0').bind(p.telegram_payment_charge_id,o.id)
 ]);
 const orderUpdate=results?.[2];
 const changed=orderUpdate?.meta?.changes??orderUpdate?.changes;
 if(changed===0){
  const latest=await db.prepare('SELECT paid,charge FROM orders WHERE id=?').bind(o.id).first();
  if(latest?.paid){
   if(latest.charge!==p.telegram_payment_charge_id)throw new Error('Conflicting payment.');
   return false;
  }
 }
 return true;
}
export async function consume(db,user,kind,key){
 await ensureAccountsSchema(db);
 if(!Object.hasOwn(products,kind)||typeof key!=='string'||!/^[a-f0-9-]{36}$/.test(key))throw new Error('Invalid booster action.');
 await db.batch([
 db.prepare(`INSERT OR IGNORE INTO consumptions(id,user_id,kind,applied) SELECT ?,?,?,0 WHERE EXISTS(SELECT 1 FROM accounts WHERE user_id=? AND ${kind}>0)`).bind(key,user,kind,user),
 db.prepare(`UPDATE accounts SET ${kind}=${kind}-1 WHERE user_id=? AND ${kind}>0 AND EXISTS(SELECT 1 FROM consumptions WHERE id=? AND user_id=? AND kind=? AND applied=0)`).bind(user,key,user,kind),
 db.prepare('UPDATE consumptions SET applied=1 WHERE id=? AND user_id=? AND kind=? AND applied=0').bind(key,user,kind)
 ]);
 const action=await db.prepare('SELECT * FROM consumptions WHERE id=?').bind(key).first();if(!action)throw new Error('No boosters left. Find optional boosters in the shop.');if(action.user_id!==user||action.kind!==kind)throw new Error('Action conflict.');return balance(db,user);
}
async function bot(env,method,data){const r=await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/${method}`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(data),signal:AbortSignal.timeout(8000)});const body=await r.json();if(!r.ok||!body.ok)throw new Error('Telegram service unavailable. Please try again.');return body.result;}
async function body(req){const text=await req.text();if(text.length>24000)throw new Error('Request too large.');return text?JSON.parse(text):{};}
function configured(env){return !!(env.DB&&env.TELEGRAM_BOT_TOKEN&&env.TELEGRAM_WEBHOOK_SECRET&&/^https:\/\//.test(env.PUBLIC_ORIGIN||'')&&/^\d+$/.test(env.OWNER_CHAT_ID||''));}
const requests=new Map();function throttle(user){const now=Date.now(),old=requests.get(user)||{at:now,n:0};if(now-old.at>60000){old.at=now;old.n=0;}if(++old.n>30)throw new Error('Too many requests. Wait a minute.');requests.set(user,old);if(requests.size>5000)for(const [k,v] of requests)if(now-v.at>60000)requests.delete(k);}
export function makeWorker(assets){return {async fetch(req,env){const url=new URL(req.url),ready=configured(env),live=ready&&env.PAYMENTS_ENABLED==='true';try{
 const monetag=env.ADS_ENABLED==='true'&&env.AD_PROVIDER==='monetag'&&/^\d+$/.test(env.MONETAG_ZONE||'')&&/^https:\/\//.test(env.MONETAG_SDK_URL||'') ? {zone:env.MONETAG_ZONE,scriptUrl:env.MONETAG_SDK_URL} : null;
 if(req.method==='GET'&&url.pathname==='/api/config')return json({payments:live,botUsername:'OrbitMergeAjayBot',monetag,ads:env.AD_PROVIDER!=='monetag'&&env.ADS_ENABLED==='true'&&/^\d+$/.test(env.ADSGRAM_BLOCK_ID||''),adsBlockId:env.ADS_ENABLED==='true'?env.ADSGRAM_BLOCK_ID:null});
 if(req.method==='GET'&&url.pathname==='/health')return json({ok:true,storage:!!env.DB,paymentsConfigured:ready,paymentsEnabled:live});
 if(url.pathname==='/telegram/webhook'&&req.method==='POST'){
 if(!ready||!equal(req.headers.get('x-telegram-bot-api-secret-token')||'',env.TELEGRAM_WEBHOOK_SECRET))return json({error:'Forbidden'},403);
 const update=await body(req),q=update.pre_checkout_query,m=update.message;
 if(q){const o=await env.DB.prepare('SELECT * FROM orders WHERE id=?').bind(q.invoice_payload).first();const ok=!!(live&&o&&!o.paid&&o.user_id===q.from.id&&q.currency==='XTR'&&q.total_amount===o.amount);await bot(env,'answerPreCheckoutQuery',{pre_checkout_query_id:q.id,ok,...(!ok?{error_message:'This order is unavailable. Please open a new invoice.'}:{})});}
 if(m?.successful_payment)await settle(env.DB,m.successful_payment,m.from.id);
 if(m?.text?.startsWith('/start'))await bot(env,'sendMessage',{chat_id:m.chat.id,text:'Welcome to Orbit Merge! New games are always free.',reply_markup:{inline_keyboard:[[{text:'Play Orbit Merge',web_app:{url:env.PUBLIC_ORIGIN}}]]}});
 if(m?.text&&String(m.from.id)===env.OWNER_CHAT_ID&&m.chat.type==='private'){
 if(m.text==='/tickets'){const result=await env.DB.prepare('SELECT id,user_id,body FROM support_tickets ORDER BY id DESC LIMIT 10').all();await bot(env,'sendMessage',{chat_id:m.chat.id,text:result.results.length?result.results.map(t=>`#${t.id} · user ${t.user_id}\n${t.body}`).join('\n\n').slice(0,3900):'No payment support requests yet.'});}
 const reply=m.text.match(/^\/reply\s+(\d+)\s+([\s\S]{1,2000})$/);if(reply){const ticket=await env.DB.prepare('SELECT user_id FROM support_tickets WHERE id=?').bind(Number(reply[1])).first();if(ticket){await bot(env,'sendMessage',{chat_id:ticket.user_id,text:`Orbit Merge support #${reply[1]}\n${reply[2]}`});await bot(env,'sendMessage',{chat_id:m.chat.id,text:`Reply sent for ticket #${reply[1]}.`});}else await bot(env,'sendMessage',{chat_id:m.chat.id,text:'Ticket not found.'});}
 }
 if(m?.text?.startsWith('/paysupport')){
 const result=await env.DB.prepare('INSERT OR IGNORE INTO support_tickets(update_id,user_id,body,created) VALUES(?,?,?,?) RETURNING id').bind(update.update_id,m.from.id,m.text.slice(0,2000),Date.now()).first();
 if(result){await bot(env,'sendMessage',{chat_id:env.OWNER_CHAT_ID,text:`Orbit Merge payment support #${result.id}\nTelegram user: ${m.from.id}\n${m.text.slice(0,2000)}\nReply with /reply ${result.id} YOUR ANSWER. Use /tickets to review recent requests. Review the receipt before any refund.`});}
 await bot(env,'sendMessage',{chat_id:m.chat.id,text:'Your payment support request is recorded. Send /paysupport followed by the purchase date, issue and Telegram receipt reference. Never send passwords or login codes. The game owner will review it.'});}
 if(m?.text?.startsWith('/privacy'))await bot(env,'sendMessage',{chat_id:m.chat.id,text:'Practice progress stays on your device. We store Telegram IDs, order/payment IDs, paid balances and support requests to deliver purchases. Use /paysupport for data requests. Optional rewarded ads use AdsGram only when you choose to watch.'});
 return json({ok:true});}
 if(url.pathname.startsWith('/api/')){
 if(req.method!=='POST')return json({error:'Method not allowed'},405);if(!ready)return json({error:'Purchases are not available yet. Enjoy free play.'},503);if(req.headers.get('origin')&&req.headers.get('origin')!==env.PUBLIC_ORIGIN)return json({error:'Origin not allowed'},403);
 const user=await identity(req.headers.get('x-telegram-init-data'),env.TELEGRAM_BOT_TOKEN);throttle(user.id);const data=await body(req);
 if(url.pathname==='/api/account')return json(await balance(env.DB,user.id));
 if(url.pathname==='/api/order'){
  if(typeof data.orderId!=='string'||data.orderId.length!==36)return json({error:'Invalid order reference.'},400);
  const purchase=await env.DB.prepare('SELECT paid FROM orders WHERE id=? AND user_id=?').bind(data.orderId,user.id).first();
  if(!purchase)return json({error:'Order not found.'},404);
  return json({paid:purchase.paid===1});
 }
 if(url.pathname==='/api/consume')return json(await consume(env.DB,user.id,data.kind,data.request_id));
 if(url.pathname==='/api/invoice'){
 if(!live)return json({error:'Purchases are not enabled yet.'},503);const p=Object.hasOwn(products,data.product)?products[data.product]:null;if(!p)throw new Error('Unknown booster.');const key=crypto.randomUUID();await env.DB.prepare('INSERT INTO orders(id,user_id,product,amount,created) VALUES(?,?,?,?,?)').bind(key,user.id,data.product,p.price,Date.now()).run();
 const link=await bot(env,'createInvoiceLink',{title:p.title,description:p.description,payload:key,provider_token:'',currency:'XTR',prices:[{label:p.title,amount:p.price}]});return json({url:link,orderId:key});}
 return json({error:'Not found'},404);}
 const asset=assets[url.pathname==='/'?'/index.html':url.pathname];if(!asset)return json({error:'Not found'},404);if(!['GET','HEAD'].includes(req.method))return json({error:'Method not allowed'},405);
 const responseBody=req.method==='HEAD'?null:asset.base64?Uint8Array.from(atob(asset.base64),character=>character.charCodeAt(0)):asset.body;
 return new Response(responseBody,{headers:{'content-type':asset.type,'cache-control':asset.base64?'public, max-age=86400':'no-cache','x-content-type-options':'nosniff','referrer-policy':'strict-origin-when-cross-origin'}});
 }catch(e){if(url.pathname==='/telegram/webhook')return json({error:'Processing failed; retry delivery.'},500);return json({error:e.message},400);}}};}
