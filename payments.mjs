import {createHmac,timingSafeEqual,randomUUID} from 'node:crypto';
export const PRODUCTS={undos:{title:'Second chances',description:'5 undos for Orbit Merge',price:25,quantity:5},shuffles:{title:'Cosmic Shuffle',description:'3 shuffles for Orbit Merge',price:25,quantity:3},rescues:{title:'Room to breathe',description:'3 rescues for Orbit Merge',price:50,quantity:3}};
export function verifyInitData(raw,token,now=Date.now()){
 if(!raw||!token)throw new Error('Open the game inside Telegram to use purchases.');
 const p=new URLSearchParams(raw),hash=p.get('hash');if(!hash||!/^[a-f0-9]{64}$/.test(hash))throw new Error('Invalid Telegram authentication.');
 const keys=[...p.keys()];if(new Set(keys).size!==keys.length)throw new Error('Invalid Telegram authentication.');p.delete('hash');
 const check=[...p.entries()].sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>`${k}=${v}`).join('\n');
 const secret=createHmac('sha256','WebAppData').update(token).digest(),expected=createHmac('sha256',secret).update(check).digest();
 if(!timingSafeEqual(expected,Buffer.from(hash,'hex')))throw new Error('Invalid Telegram authentication.');
 const age=Math.floor(now/1000)-Number(p.get('auth_date'));if(!Number.isFinite(age)||age< -30||age>3600)throw new Error('Telegram session expired. Reopen the game.');
 const user=JSON.parse(p.get('user')||'null');if(!Number.isSafeInteger(user?.id)||user.id<=0)throw new Error('Invalid Telegram user.');return user;
}
const migratedDbs=new WeakSet();
function ensureAccountsSchema(db){
 if(!db||migratedDbs.has(db))return;
 try{
  const cols=db.prepare('PRAGMA table_info(accounts)').all();
  if(cols.length&&!cols.some(c=>c.name==='shuffles'))db.exec('ALTER TABLE accounts ADD COLUMN shuffles INTEGER NOT NULL DEFAULT 0 CHECK(shuffles>=0);');
  if(cols.length)migratedDbs.add(db);
 }catch{}
}
export function schema(db){db.exec(`PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS accounts(user_id INTEGER PRIMARY KEY,undos INTEGER NOT NULL DEFAULT 0 CHECK(undos>=0),shuffles INTEGER NOT NULL DEFAULT 0 CHECK(shuffles>=0),rescues INTEGER NOT NULL DEFAULT 0 CHECK(rescues>=0));CREATE TABLE IF NOT EXISTS orders(id TEXT PRIMARY KEY,user_id INTEGER NOT NULL,product TEXT NOT NULL,amount INTEGER NOT NULL,created INTEGER NOT NULL,paid INTEGER NOT NULL DEFAULT 0,charge TEXT UNIQUE);CREATE TABLE IF NOT EXISTS consumptions(id TEXT PRIMARY KEY,user_id INTEGER NOT NULL,kind TEXT NOT NULL);`);ensureAccountsSchema(db);}
export function balance(db,id){ensureAccountsSchema(db);db.prepare('INSERT OR IGNORE INTO accounts(user_id) VALUES (?)').run(id);return db.prepare('SELECT undos,shuffles,rescues FROM accounts WHERE user_id=?').get(id);}
export function order(db,id,product){const p=Object.hasOwn(PRODUCTS,product)?PRODUCTS[product]:null;if(!p)throw new Error('Unknown booster.');const key=randomUUID();db.prepare('INSERT INTO orders(id,user_id,product,amount,created) VALUES(?,?,?,?,?)').run(key,id,product,p.price,Date.now());return {key,...p};}
export function validOrder(db,payload,user,currency,amount){const o=db.prepare('SELECT * FROM orders WHERE id=?').get(payload);return !!o&&o.user_id===user&&currency==='XTR'&&o.amount===amount&&!o.paid;}
export function orderStatus(db,user,id){
 const row=db.prepare('SELECT paid FROM orders WHERE id=? AND user_id=?').get(id,user);
 return row ? {paid:row.paid===1} : null;
}
export function settle(db,payment,user){ensureAccountsSchema(db);db.exec('BEGIN IMMEDIATE');try{const o=db.prepare('SELECT * FROM orders WHERE id=?').get(payment.invoice_payload);if(!o||o.user_id!==user||payment.currency!=='XTR'||payment.total_amount!==o.amount)throw new Error('Payment does not match an order.');if(o.paid){if(o.charge!==payment.telegram_payment_charge_id)throw new Error('Conflicting payment.');db.exec('COMMIT');return false;}const p=Object.hasOwn(PRODUCTS,o.product)?PRODUCTS[o.product]:null;if(!p)throw new Error('Invalid product.');balance(db,user);db.prepare(`UPDATE accounts SET ${o.product}=${o.product}+? WHERE user_id=?`).run(p.quantity,user);db.prepare('UPDATE orders SET paid=1,charge=? WHERE id=?').run(payment.telegram_payment_charge_id,o.id);db.exec('COMMIT');return true;}catch(e){db.exec('ROLLBACK');throw e;}}
export function consume(db,user,kind,key){if(!Object.hasOwn(PRODUCTS,kind))throw new Error('Unknown booster.');if(typeof key!=='string'||!/^[a-f0-9-]{36}$/.test(key))throw new Error('Invalid action ID.');ensureAccountsSchema(db);db.exec('BEGIN IMMEDIATE');try{const old=db.prepare('SELECT * FROM consumptions WHERE id=?').get(key);if(old){if(old.user_id!==user||old.kind!==kind)throw new Error('Action conflict.');const result=balance(db,user);db.exec('COMMIT');return result;}balance(db,user);const r=db.prepare(`UPDATE accounts SET ${kind}=${kind}-1 WHERE user_id=? AND ${kind}>0`).run(user);if(!r.changes)throw new Error('No boosters left. Find optional boosters in the shop.');db.prepare('INSERT INTO consumptions(id,user_id,kind) VALUES(?,?,?)').run(key,user,kind);const result=balance(db,user);db.exec('COMMIT');return result;}catch(e){db.exec('ROLLBACK');throw e;}}
