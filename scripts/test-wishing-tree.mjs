import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
const require = createRequire(import.meta.url);
const { createWishingTreeHandler } = require('../lib/wishing-tree.js');
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'dear-december-api-'));
let now = Date.now(), server, base;
async function start(dataDir = directory, rateLimit = 100) {
  const handler = createWishingTreeHandler({ dataDir, clock: () => now, rateLimit });
  server = http.createServer((req, res) => { const url = new URL(req.url, 'http://localhost');handler(req, res, url); });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
}
async function close() { server.closeAllConnections();await new Promise(resolve => server.close(resolve)); }
const endpoint = '/api/wishing-tree/letters';
const letter = (overrides = {}) => ({ author: '겨울 손님', to: '당신', message: '올겨울에도 따뜻한 마음이 가득하기를.\n메리 크리스마스!', decoration: 'letter', publicConsent: true, requestId: randomUUID(), ...overrides });
const post = payload => fetch(base + endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
try {
  await start();
  let response = await fetch(base + endpoint), data = await response.json();
  assert.equal(data.total, 0);assert.equal(data.pages, 1);assert.deepEqual(data.items, []);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  for (const overrides of [{author:' '},{message:' '},{message:'a'.repeat(501)},{decoration:'script'},{publicConsent:false},{requestId:'invalid'},{to:'a'.repeat(25)}]) {
    response = await post(letter(overrides));assert.equal(response.status, 400, JSON.stringify(overrides));
  }
  response = await fetch(base + endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://elsewhere.example' }, body: JSON.stringify(letter()) });assert.equal(response.status, 403);
  response = await fetch(base + endpoint, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: '{}' });assert.equal(response.status, 415);
  response = await fetch(base + endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{' });assert.equal(response.status, 400);
  response = await fetch(base + endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(letter({message:'한'.repeat(5000)})) });assert.equal(response.status, 413);
  const payload = letter({ message: '<img src=x onerror=alert(1)>\n따뜻한 겨울', decoration: 'star' });
  response = await post(payload);assert.equal(response.status, 201);const first = await response.json();
  assert.equal(first.letter.message, payload.message);assert.ok(first.deleteToken);assert.ok(!('tokenHash' in first.letter));assert.ok(!('requestId' in first.letter));
  const retry = await post(payload);assert.equal(retry.status, 200);assert.deepEqual(await retry.json(), first);
  response = await post({...payload, message:'다른 편지'});assert.equal(response.status, 409);
  const batch = await Promise.all(Array.from({length:28},(_,i)=>post(letter({author:`방문자 ${i}`,decoration:['letter','star','gift','bauble'][i%4]}))));
  assert.ok(batch.every(result=>result.status===201));
  data = await (await fetch(base + endpoint)).json();assert.equal(data.total, 29);assert.equal(data.items.length, 24);assert.equal(data.pages, 2);
  assert.ok(data.items.every(item=>Object.keys(item).sort().join() === ['id','author','to','message','decoration','createdAt'].sort().join()));
  data = await (await fetch(base + endpoint + '?page=2')).json();assert.equal(data.items.length, 5);assert.equal(data.items.at(-1).id, first.letter.id);
  assert.equal((await fetch(base + endpoint + '?page=0')).status, 400);
  assert.equal((await fetch(base + endpoint + '?page=NaN')).status, 400);
  assert.equal((await fetch(base + endpoint, {method:'PUT'})).status, 405);
  await close();await start();
  data = await (await fetch(base + endpoint)).json();assert.equal(data.total, 29, 'letters survive server restart');
  const target = base + endpoint + '/' + first.letter.id;
  assert.equal((await fetch(target,{method:'DELETE'})).status,403);
  assert.equal((await fetch(target,{method:'DELETE',headers:{Authorization:'Bearer '+'0'.repeat(64)}})).status,403);
  assert.equal((await fetch(target,{method:'DELETE',headers:{Authorization:'Bearer '+first.deleteToken}})).status,200);
  assert.equal((await post(payload)).status,409,'retry cannot resurrect deleted letter');
  await close();await start();
  data=await(await fetch(base+endpoint)).json();assert.equal(data.total,28,'deletion survives server restart');
  await close();
  const limited=fs.mkdtempSync(path.join(directory,'rate-'));await start(limited,1);
  assert.equal((await post(letter())).status,201);response=await post(letter());assert.equal(response.status,429);assert.ok(response.headers.get('retry-after'));
  now+=61000;assert.equal((await post(letter())).status,201);await close();
  const damaged=fs.mkdtempSync(path.join(directory,'damaged-'));fs.writeFileSync(path.join(damaged,'letters.jsonl'),'incomplete');await start(damaged);
  assert.equal((await fetch(base+endpoint)).status,503);assert.equal((await post(letter())).status,503);assert.equal(fs.readFileSync(path.join(damaged,'letters.jsonl'),'utf8'),'incomplete');
  await close();
  console.log('PASS: validation, public consent, origin checks, payload limits, pagination, concurrent writes, secret exclusion, idempotency, restart persistence, authorized deletion, rate limits, and damaged-store recovery.');
} finally {if(server?.listening)await close();fs.rmSync(directory,{recursive:true,force:true});}
