import {test} from 'node:test';import assert from 'node:assert/strict';import {DatabaseSync} from 'node:sqlite';import {readFileSync} from 'node:fs';import {createHmac} from 'node:crypto';import {balance,settle,consume,identity,makeWorker} from '../worker/index.mjs';
function database(){const raw=new DatabaseSync(':memory:');raw.exec(readFileSync(new URL('../drizzle/0000_orbit_commerce.sql',import.meta.url),'utf8'));return {raw,prepare(sql){const s=raw.prepare(sql);return {args:[],bind(...args){this.args=args;return this;},async first(){return s.get(...this.args)||null;},async run(){return s.run(...this.args);},exec(){return s.run(...this.args);}};},async batch(statements){raw.exec('BEGIN IMMEDIATE');try{const result=statements.map(s=>s.exec());raw.exec('COMMIT');return result;}catch(e){raw.exec('ROLLBACK');throw e;}}};}
test('D1 transactions deduplicate concurrent payment delivery and booster retries',async()=>{const db=database();await balance(db,42);db.raw.prepare('INSERT INTO orders(id,user_id,product,amount,created) VALUES(?,?,?,?,?)').run('one',42,'undos',25,Date.now());const p={invoice_payload:'one',currency:'XTR',total_amount:25,telegram_payment_charge_id:'charge1'};await Promise.all([settle(db,p,42),settle(db,p,42)]);assert.equal((await balance(db,42)).undos,5);const key='12345678-1234-1234-1234-123456789abc';await Promise.all([consume(db,42,'undos',key),consume(db,42,'undos',key)]);assert.equal((await balance(db,42)).undos,4);await assert.rejects(()=>consume(db,43,'undos',key));assert.equal((await balance(db,42)).undos,4);});
test('duplicate charge on a second order rolls back its inventory grant',async()=>{const db=database();for(const id of ['one','two'])db.raw.prepare('INSERT INTO orders(id,user_id,product,amount,created) VALUES(?,?,?,?,?)').run(id,42,'rescues',50,Date.now());const p={invoice_payload:'one',currency:'XTR',total_amount:50,telegram_payment_charge_id:'same-charge'};await settle(db,p,42);await assert.rejects(()=>settle(db,{...p,invoice_payload:'two'},42));assert.equal((await balance(db,42)).rescues,3);assert.equal(db.raw.prepare('SELECT paid FROM orders WHERE id=?').get('two').paid,0);});
test('Web Crypto authentication matches Telegram HMAC and rejects altered identity',async()=>{const token='test-token',p=new URLSearchParams({auth_date:String(Math.floor(Date.now()/1000)),user:JSON.stringify({id:42})});const check=[...p.entries()].sort(([a],[b])=>a<b?-1:1).map(([k,v])=>`${k}=${v}`).join('\n');const secret=createHmac('sha256','WebAppData').update(token).digest();p.set('hash',createHmac('sha256',secret).update(check).digest('hex'));assert.equal((await identity(p.toString(),token)).id,42);p.set('user','{"id":43}');await assert.rejects(()=>identity(p.toString(),token));});
test('unconfigured production worker fails closed for payments and webhook',async()=>{const worker=makeWorker({'/index.html':{body:'Orbit Merge',type:'text/html'}});let r=await worker.fetch(new Request('https://game.test/api/config'),{});assert.equal((await r.json()).payments,false);r=await worker.fetch(new Request('https://game.test/telegram/webhook',{method:'POST',body:'{}'}),{});assert.equal(r.status,403);r=await worker.fetch(new Request('https://game.test/'),{});assert.equal(r.status,200);assert.equal(await r.text(),'Orbit Merge');});
test('D1 transactions settle, report balance, and consume shuffles including legacy schema migration',async()=>{
 const db=database();
 await balance(db,42);
 db.raw.prepare('INSERT INTO orders(id,user_id,product,amount,created) VALUES(?,?,?,?,?)').run('shuf-one',42,'shuffles',25,Date.now());
 const p={invoice_payload:'shuf-one',currency:'XTR',total_amount:25,telegram_payment_charge_id:'shuf-charge-1'};
 await Promise.all([settle(db,p,42),settle(db,p,42)]);
 assert.deepEqual({...await balance(db,42)},{undos:0,shuffles:3,rescues:0});
 const key='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
 await Promise.all([consume(db,42,'shuffles',key),consume(db,42,'shuffles',key)]);
 assert.deepEqual({...await balance(db,42)},{undos:0,shuffles:2,rescues:0});
 await assert.rejects(()=>consume(db,43,'shuffles','dddddddd-dddd-4ddd-8ddd-dddddddddddd'));

 const legacyRaw=new DatabaseSync(':memory:');
 legacyRaw.exec('CREATE TABLE accounts(user_id INTEGER PRIMARY KEY,undos INTEGER NOT NULL DEFAULT 0,rescues INTEGER NOT NULL DEFAULT 0);CREATE TABLE orders(id TEXT PRIMARY KEY,user_id INTEGER NOT NULL,product TEXT NOT NULL,amount INTEGER NOT NULL,created INTEGER NOT NULL,paid INTEGER NOT NULL DEFAULT 0,charge TEXT UNIQUE);CREATE TABLE consumptions(id TEXT PRIMARY KEY,user_id INTEGER NOT NULL,kind TEXT NOT NULL,applied INTEGER NOT NULL DEFAULT 0);');
 const legacyDb={raw:legacyRaw,prepare(sql){const s=legacyRaw.prepare(sql);return {args:[],bind(...args){this.args=args;return this;},async first(){return s.get(...this.args)||null;},async run(){return s.run(...this.args);},exec(){return s.run(...this.args);}};},async batch(statements){legacyRaw.exec('BEGIN IMMEDIATE');try{const result=statements.map(s=>s.exec());legacyRaw.exec('COMMIT');return result;}catch(e){legacyRaw.exec('ROLLBACK');throw e;}}};
 legacyDb.raw.prepare('INSERT INTO orders(id,user_id,product,amount,created) VALUES(?,?,?,?,?)').run('legacy-shuf',9,'shuffles',25,Date.now());
 await settle(legacyDb,{invoice_payload:'legacy-shuf',currency:'XTR',total_amount:25,telegram_payment_charge_id:'legacy-charge'},9);
 assert.deepEqual({...await balance(legacyDb,9)},{undos:0,shuffles:3,rescues:0});
 await consume(legacyDb,9,'shuffles','eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee');
 assert.deepEqual({...await balance(legacyDb,9)},{undos:0,shuffles:2,rescues:0});
});

test('worker settle rejects prototype-property products and handles concurrent same/conflicting D1 settles',async()=>{
 const raw=new DatabaseSync(':memory:');
 raw.exec(readFileSync(new URL('../drizzle/0000_orbit_commerce.sql',import.meta.url),'utf8'));
 const asyncDb={
  raw,
  prepare(sql){
   const s=raw.prepare(sql);
   return {
    args:[],
    bind(...args){this.args=args;return this;},
    async first(){await Promise.resolve();return s.get(...this.args)||null;},
    async run(){await Promise.resolve();return s.run(...this.args);},
    exec(){return s.run(...this.args);}
   };
  },
  async batch(statements){
   await Promise.resolve();
   raw.exec('BEGIN IMMEDIATE');
   try{const result=statements.map(s=>s.exec());raw.exec('COMMIT');return result;}
   catch(e){raw.exec('ROLLBACK');throw e;}
  }
 };

 raw.prepare('INSERT INTO orders(id,user_id,product,amount,created) VALUES(?,?,?,?,?)').run('proto-ord',42,'toString',25,Date.now());
 await assert.rejects(()=>settle(asyncDb,{invoice_payload:'proto-ord',currency:'XTR',total_amount:25,telegram_payment_charge_id:'ch-proto'},42),/Invalid product\./);

 raw.prepare('INSERT INTO orders(id,user_id,product,amount,created) VALUES(?,?,?,?,?)').run('ord-same',42,'shuffles',25,Date.now());
 const sameRes=await Promise.all([
  settle(asyncDb,{invoice_payload:'ord-same',currency:'XTR',total_amount:25,telegram_payment_charge_id:'ch-same'},42),
  settle(asyncDb,{invoice_payload:'ord-same',currency:'XTR',total_amount:25,telegram_payment_charge_id:'ch-same'},42)
 ]);
 assert.deepEqual(sameRes,[true,false]);
 assert.equal((await balance(asyncDb,42)).shuffles,3);

 raw.prepare('INSERT INTO orders(id,user_id,product,amount,created) VALUES(?,?,?,?,?)').run('ord-conflict',42,'shuffles',25,Date.now());
 const conflictRes=await Promise.allSettled([
  settle(asyncDb,{invoice_payload:'ord-conflict',currency:'XTR',total_amount:25,telegram_payment_charge_id:'ch-A'},42),
  settle(asyncDb,{invoice_payload:'ord-conflict',currency:'XTR',total_amount:25,telegram_payment_charge_id:'ch-B'},42)
 ]);
 assert.equal(conflictRes.filter(r=>r.status==='fulfilled'&&r.value===true).length,1);
 assert.equal(conflictRes.filter(r=>r.status==='rejected'&&/Conflicting payment\./.test(r.reason.message)).length,1);
 assert.equal((await balance(asyncDb,42)).shuffles,6);
});
