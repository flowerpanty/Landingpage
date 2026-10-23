import assert from 'node:assert/strict';
import http from 'node:http';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {calculateChristmasOrder:calculate,validateChristmasOrder,christmasOrderStatus}=require('../lib/christmas-order.js');
const {createOrderApiHandler}=require('../lib/order-api.js');
const catalog=require('../data/christmas-products.json');
const items=catalog.products.map(p=>({sku:p.sku,quantity:1,price:1}));
assert.equal(calculate(items).totalPrice,57500);
assert.equal(calculate(items.slice(0,2)).totalPrice,17500);
assert.equal(calculate([items[2]]).totalPrice,17000);
assert.deepEqual(calculate([items[2]]).orderItems.map(p=>[p.sku,p.quantity]),[['christmas-brookie-set',1]]);
for(const value of [0,-1,0.5,NaN,Infinity,'1',null,Number.MAX_SAFE_INTEGER]) assert.throws(()=>calculate([{sku:items[0].sku,quantity:value}]));
for(const bad of [[],null,[{sku:'unknown',quantity:1}],[items[0],items[0]]]) assert.throws(()=>calculate(bad));
const body={source:'christmas',catalogVersion:catalog.version,items,customerName:'LOCAL MOCK ONLY',customerPhone:'010-0000-0000',deliveryDate:'2026-12-20',pickupTime:'14:30',deliveryMethod:'pickup',request:'',privacyConsent:true,idempotencyKey:'12345678-1234-1234-1234-123456789012',totalPrice:1};
assert.equal(validateChristmasOrder(body).totalPrice,57500);
for(const patch of [{customerName:''},{customerPhone:'123'},{deliveryDate:'2026-02-30'},{deliveryDate:'2026-13-01'},{pickupTime:'25:00'},{deliveryMethod:'delivery'},{catalogVersion:'old'},{privacyConsent:false},{idempotencyKey:''},{idempotencyKey:'-'.repeat(36)}])assert.throws(()=>validateChristmasOrder({...body,...patch}));
let forwards=0;
const handler=createOrderApiHandler({fetchImpl:async()=>{forwards++;throw new Error('Should never forward unavailable Christmas orders');}});
const server=http.createServer(handler);await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const base=`http://127.0.0.1:${server.address().port}`;
const post=payload=>fetch(`${base}/api/landing-orders`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
try{
 const status=await fetch(base+'/api/christmas-order-status');assert.equal(status.status,200);assert.equal(status.headers.get('cache-control'),'no-store');assert.deepEqual(await status.json(),christmasOrderStatus());
 const responses=await Promise.all([post(body),post(body)]);for(const response of responses){assert.equal(response.status,503);assert.equal((await response.json()).success,false);}
 assert.equal((await post({...body,items:[]})).status,400);assert.equal(forwards,0);
 console.log('Christmas order: server SKU repricing, set independence, invalid input, capability closed, duplicate requests not forwarded, no production writes PASS');
}finally{await new Promise(resolve=>server.close(resolve));}
