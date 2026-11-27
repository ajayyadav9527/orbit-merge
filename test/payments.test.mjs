import {test} from 'node:test';import assert from 'node:assert/strict';import {DatabaseSync} from 'node:sqlite';import {createHmac} from 'node:crypto';import {schema,order,settle,balance,consume,validOrder,verifyInitData} from '../payments.mjs';
function setup(){const db=new DatabaseSync(':memory:');schema(db);return db;}
test('verified successful payment grants once on duplicate webhook',()=>{const db=setup(),o=order(db,42,'undos');const p={invoice_payload:o.key,currency:'XTR',total_amount:25,telegram_payment_charge_id:'charge1'};assert.ok(validOrder(db,o.key,42,'XTR',25));assert.equal(settle(db,p,42),true);assert.equal(settle(db,p,42),false);assert.equal(balance(db,42).undos,5);assert.equal(validOrder(db,o.key,42,'XTR',25),false);consume(db,42,'undos','12345678-1234-1234-1234-123456789abc');consume(db,42,'undos','12345678-1234-1234-1234-123456789abc');assert.equal(balance(db,42).undos,4);});
test('reject wrong user, amount, currency and empty balance',()=>{const db=setup(),o=order(db,42,'rescues'),p={invoice_payload:o.key,currency:'XTR',total_amount:50,telegram_payment_charge_id:'charge2'};assert.throws(()=>settle(db,p,43));assert.throws(()=>settle(db,{...p,total_amount:1},42));assert.throws(()=>settle(db,{...p,currency:'USD'},42));assert.equal(balance(db,42).rescues,0);assert.throws(()=>consume(db,42,'rescues'));assert.throws(()=>consume(db,42,'not_a_column'));});
test('initData accepts signed identity and rejects tampering/expiry',()=>{const token='test-only-token',now=Date.now(),p=new URLSearchParams({auth_date:String(Math.floor(now/1000)),user:JSON.stringify({id:42,first_name:'Player'})});const text=[...p.entries()].sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>`${k}=${v}`).join('\n');const secret=createHmac('sha256','WebAppData').update(token).digest();p.set('hash',createHmac('sha256',secret).update(text).digest('hex'));assert.equal(verifyInitData(p.toString(),token,now).id,42);assert.throws(()=>verifyInitData(p.toString(),token,now+7200000));p.set('user',JSON.stringify({id:99}));assert.throws(()=>verifyInitData(p.toString(),token,now));});
test('shuffles pack settles, reports balance, consumes idempotently, and migrates legacy accounts table',()=>{
 const db=setup();
 const o=order(db,42,'shuffles');
 assert.equal(o.price,25);
 assert.equal(o.quantity,3);
 assert.ok(validOrder(db,o.key,42,'XTR',25));
 const p={invoice_payload:o.key,currency:'XTR',total_amount:25,telegram_payment_charge_id:'shuffle-charge-1'};
 assert.equal(settle(db,p,42),true);
 assert.equal(settle(db,p,42),false);
 assert.deepEqual({...balance(db,42)},{undos:0,shuffles:3,rescues:0});
 const key='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
 consume(db,42,'shuffles',key);
 consume(db,42,'shuffles',key);
 assert.deepEqual({...balance(db,42)},{undos:0,shuffles:2,rescues:0});

 const legacyDb=new DatabaseSync(':memory:');
 legacyDb.exec('CREATE TABLE accounts(user_id INTEGER PRIMARY KEY,undos INTEGER NOT NULL DEFAULT 0,rescues INTEGER NOT NULL DEFAULT 0);');
 legacyDb.prepare('INSERT INTO accounts(user_id,undos,rescues) VALUES(7,2,1)').run();
 schema(legacyDb);
 assert.deepEqual({...balance(legacyDb,7)},{undos:2,shuffles:0,rescues:1});
 const lo=order(legacyDb,7,'shuffles');
 settle(legacyDb,{invoice_payload:lo.key,currency:'XTR',total_amount:25,telegram_payment_charge_id:'legacy-shuf'},7);
 assert.deepEqual({...balance(legacyDb,7)},{undos:2,shuffles:3,rescues:1});
 consume(legacyDb,7,'shuffles','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
 assert.deepEqual({...balance(legacyDb,7)},{undos:2,shuffles:2,rescues:1});
});

test('rejects prototype-property products and supports direct balance() on legacy DB without schema()',()=>{
 const db=setup();
 assert.throws(()=>order(db,42,'toString'),/Unknown booster\./);
 db.prepare('INSERT INTO orders(id,user_id,product,amount,created) VALUES(?,?,?,?,?)').run('proto-ord',42,'toString',25,Date.now());
 assert.throws(()=>settle(db,{invoice_payload:'proto-ord',currency:'XTR',total_amount:25,telegram_payment_charge_id:'proto-charge'},42),/Invalid product\./);

 const legacyNoSchema=new DatabaseSync(':memory:');
 legacyNoSchema.exec('CREATE TABLE accounts(user_id INTEGER PRIMARY KEY,undos INTEGER NOT NULL DEFAULT 0,rescues INTEGER NOT NULL DEFAULT 0);');
 legacyNoSchema.prepare('INSERT INTO accounts(user_id,undos,rescues) VALUES(10,2,1)').run();
 assert.deepEqual({...balance(legacyNoSchema,10)},{undos:2,shuffles:0,rescues:1});
});

