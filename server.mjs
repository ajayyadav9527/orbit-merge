import {createServer} from 'node:http';
import {readFile,mkdir} from 'node:fs/promises';
import {DatabaseSync} from 'node:sqlite';
import {fileURLToPath} from 'node:url';
import {resolve,extname,dirname} from 'node:path';
import {timingSafeEqual} from 'node:crypto';
import {verifyInitData,schema,balance,order,orderStatus,validOrder,settle,consume} from './payments.mjs';
const root=dirname(fileURLToPath(import.meta.url)),token=process.env.TELEGRAM_BOT_TOKEN||'',hook=process.env.TELEGRAM_WEBHOOK_SECRET||'',origin=process.env.PUBLIC_ORIGIN||'',support=process.env.SUPPORT_USERNAME||'';
const live=!!(token&&hook&&/^https:\/\//.test(origin)&&/^[A-Za-z0-9_]{5,32}$/.test(support));
const dataDir=resolve(process.env.DATA_DIR||resolve(root,'data'));await mkdir(dataDir,{recursive:true});const db=new DatabaseSync(resolve(dataDir,'orbit.sqlite'));schema(db);
async function bot(method,payload){const r=await fetch(`https://api.telegram.org/bot${token}/${method}`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(payload),signal:AbortSignal.timeout(8000)});const j=await r.json();if(!r.ok||!j.ok)throw new Error('Telegram service unavailable. Please try again.');return j.result;}
async function json(req){let s='';for await(const chunk of req){s+=chunk;if(s.length>24000)throw new Error('Request too large.');}return s?JSON.parse(s):{};}
const mime={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.png':'image/png','.txt':'text/plain; charset=utf-8','.xml':'application/xml; charset=utf-8'};
const limited=new Map();function rate(id){const now=Date.now(),last=limited.get(id)||[];const fresh=last.filter(t=>now-t<60000);if(fresh.length>=30)throw new Error('Too many requests. Wait a minute.');fresh.push(now);limited.set(id,fresh);if(limited.size>10000)for(const [k,v]of limited)if(v.at(-1)<now-60000)limited.delete(k);}
const server=createServer(async(req,res)=>{const url=new URL(req.url,'http://localhost');const respond=(status,data)=>{res.writeHead(status,{'content-type':'application/json','cache-control':'no-store','x-content-type-options':'nosniff'});res.end(JSON.stringify(data));};try{
 if(req.method==='GET'&&url.pathname==='/api/config')return respond(200,{payments:live,botUsername:process.env.BOT_USERNAME||null,ads:false});
 if(url.pathname==='/telegram/webhook'&&req.method==='POST'){
 const supplied=Buffer.from(String(req.headers['x-telegram-bot-api-secret-token']||'')),expected=Buffer.from(hook);if(!live||supplied.length!==expected.length||!timingSafeEqual(supplied,expected))return respond(403,{error:'Forbidden'});
 const update=await json(req);if(update.pre_checkout_query){const q=update.pre_checkout_query;const ok=validOrder(db,q.invoice_payload,q.from.id,q.currency,q.total_amount);await bot('answerPreCheckoutQuery',{pre_checkout_query_id:q.id,ok,...(!ok?{error_message:'This order is invalid or already paid. Open a new invoice.'}:{})});}
 if(update.message?.successful_payment)settle(db,update.message.successful_payment,update.message.from.id);
 const m=update.message;if(m?.text?.startsWith('/start'))await bot('sendMessage',{chat_id:m.chat.id,text:'Welcome to Orbit Merge! Drop planets, merge matches, and make a bigger universe. New games are always free.',reply_markup:{inline_keyboard:[[{text:'Play Orbit Merge',web_app:{url:origin}}]]}});
 if(m?.text?.startsWith('/paysupport'))await bot('sendMessage',{chat_id:m.chat.id,text:`For purchase help or a refund request, contact @${support}. Include the purchase date and your Telegram payment receipt. Never send passwords or login codes.`});
 if(m?.text?.startsWith('/privacy'))await bot('sendMessage',{chat_id:m.chat.id,text:`Practice stays on your device. We store your Telegram user ID, paid booster balances, and order/payment IDs to deliver purchases and handle support. Contact @${support} for data requests.`});
 return respond(200,{ok:true});
 }
 if(url.pathname.startsWith('/api/')){if(req.method!=='POST')return respond(405,{error:'Method not allowed'});if(!live)return respond(503,{error:'Purchases are not live yet. Enjoy free play.'});if(req.headers.origin&&req.headers.origin!==origin)return respond(403,{error:'Origin not allowed'});const user=verifyInitData(req.headers['x-telegram-init-data'],token);rate(user.id);const body=await json(req);
 if(url.pathname==='/api/account')return respond(200,balance(db,user.id));
 if(url.pathname==='/api/consume')return respond(200,consume(db,user.id,body.kind,body.request_id));
 if(url.pathname==='/api/order'){
  if(typeof body.orderId!=='string'||body.orderId.length!==36)return respond(400,{error:'Invalid order reference.'});
  const status=orderStatus(db,user.id,body.orderId);
  return status?respond(200,status):respond(404,{error:'Order not found.'});
 }
 if(url.pathname==='/api/invoice'){const o=order(db,user.id,body.product);const link=await bot('createInvoiceLink',{title:o.title,description:o.description,payload:o.key,provider_token:'',currency:'XTR',prices:[{label:o.title,amount:o.price}]});return respond(200,{url:link,orderId:o.key});}
 return respond(404,{error:'Not found'});}
 if(req.method!=='GET'&&req.method!=='HEAD')return respond(405,{error:'Method not allowed'});
 const files={'/':'index.html','/index.html':'index.html','/style.css':'style.css','/app.js':'app.js','/engine.js':'engine.js','/ads.js':'ads.js','/app_icon.png':'app_icon.png','/game_banner.png':'game_banner.png','/robots.txt':'robots.txt','/sitemap.xml':'sitemap.xml'};const name=files[url.pathname];if(!name)return respond(404,{error:'Not found'});const file=await readFile(resolve(root,'dist',name));res.writeHead(200,{'content-type':mime[extname(name)],'x-content-type-options':'nosniff','referrer-policy':'strict-origin-when-cross-origin','content-security-policy':"default-src 'self'; script-src 'self' https://telegram.org; style-src 'self'; connect-src 'self'; img-src 'self' data:; object-src 'none'; base-uri 'self'; form-action 'self'",'cache-control':'no-cache'});res.end(req.method==='HEAD'?undefined:file);
 }catch(e){if(url.pathname==='/telegram/webhook'){console.error('Webhook processing failed; Telegram should retry.');return respond(500,{error:'Processing failed'});}respond(400,{error:e.message});}});
server.listen(Number(process.env.PORT)||4173,process.env.HOST||'127.0.0.1',()=>console.log(`Orbit Merge listening on port ${Number(process.env.PORT)||4173} · purchases ${live?'configured':'disabled'}`));
function shutdown(){server.close(()=>{db.close();process.exit(0);});setTimeout(()=>process.exit(1),10000).unref();}process.once('SIGTERM',shutdown);process.once('SIGINT',shutdown);

