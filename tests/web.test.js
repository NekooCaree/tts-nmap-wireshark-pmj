'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createApp } = require('../services/web-toko/server');
test('TokoKu isolated functional API', async t => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tokoku-test-'));
  let server = createApp({ dataDir, log: false }).listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  let base = 'http://127.0.0.1:' + server.address().port;
  t.after(async () => { await new Promise(resolve => server.close(resolve)); fs.rmSync(dataDir, { recursive: true, force: true }); });
  function client() {
    return { cookie: '', async request(url, method = 'GET', body, headers = {}) {
      const response = await fetch(base + url, { method, headers: { ...(this.cookie ? { Cookie: this.cookie } : {}), ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });
      const set = response.headers.get('set-cookie'); if (set) this.cookie = set.split(';')[0];
      const text = await response.text(); let data; try { data = JSON.parse(text); } catch { data = text; }
      return { status: response.status, headers: response.headers, data };
    } };
  }
  const guest = client(), a = client(), b = client();
  let orderId;
  const shipping = { fullname: 'Mahasiswa A', address: 'Jalan Contoh 123', payment: 'card', card_number: '4111111111111111', expiry: '12/30', cvv: '123' };
  await t.test('anonymous requests cannot checkout or read private data', async () => {
    for (const route of ['/api/cart', '/api/orders']) assert.equal((await guest.request(route)).status, 401);
    assert.equal((await guest.request('/api/checkout', 'POST', shipping)).status, 401);
    assert.equal((await guest.request('/api/me')).data.user, null);
  });
  await t.test('wrong password fails; valid login issues an HttpOnly session', async () => {
    assert.equal((await guest.request('/api/login', 'POST', { username: 'mahasiswa-demo', password: 'wrong123' })).status, 401);
    const r = await a.request('/api/login', 'POST', { username: 'mahasiswa-demo', password: 'belajar123' });
    assert.equal(r.status, 200); assert.match(r.headers.get('set-cookie'), /HttpOnly/); assert.match(r.headers.get('set-cookie'), /SameSite=Lax/);
    assert.equal((await a.request('/api/me')).data.user.username, 'mahasiswa-demo');
    assert.equal(r.data.user.passwordHash, undefined); assert.equal(r.data.demoSession, undefined);
  });
  await t.test('registration validates credentials and rejects duplicate usernames', async () => {
    assert.equal((await b.request('/api/register', 'POST', { username: 'student-b', password: 'testpass123', fullname: 'Student B' })).status, 201);
    assert.equal((await guest.request('/api/register', 'POST', { username: 'STUDENT-B', password: 'testpass123', fullname: 'B' })).status, 409);
    assert.equal((await guest.request('/api/register', 'POST', { username: 'x', password: 'tiny', fullname: 'B' })).status, 400);
  });
  await t.test('profile and favorite changes persist without leaking password hashes', async () => {
    assert.equal((await a.request('/api/profile', 'PATCH', { fullname: '<script>example</script>', address: 'Jalan Dummy' })).status, 200);
    assert.deepEqual((await a.request('/api/favorites/mouse', 'POST', {})).data.user.favorites, ['mouse']);
    const raw = fs.readFileSync(path.join(dataDir, 'store.json'), 'utf8');
    assert.ok(!raw.includes('belajar123')); assert.ok(!raw.includes('testpass123'));
    assert.equal((await a.request('/api/favorites/unknown', 'POST', {})).status, 404);
  });
  await t.test('cart merges guest products; invalid quantities and unknown products are rejected', async () => {
    assert.equal((await a.request('/api/cart/merge', 'POST', { items: [{ id: 'headphone', quantity: 1 }] })).status, 200);
    const r = await a.request('/api/cart/items', 'POST', { id: 'headphone', quantity: 1, price: 1 });
    assert.equal(r.data.total, 698000);
    for (const quantity of [-1, 0, 11, 1.5, '2']) assert.equal((await a.request('/api/cart/items/headphone', 'PATCH', { quantity })).status, 400);
    assert.equal((await a.request('/api/cart/items', 'POST', { id: '__proto__', quantity: 1 })).status, 400);
    assert.equal((await a.request('/api/cart/merge', 'POST', { items: [null] })).status, 400);
    assert.equal((await a.request('/api/cart/merge', 'POST', { items: [{ id: 'mouse', quantity: 1 }, { id: 'mouse', quantity: 1 }] })).status, 400);
  });
  await t.test('checkout accepts only dummy card and computes total from server cart', async () => {
    assert.equal((await a.request('/api/checkout', 'POST', { ...shipping, card_number: '5555555555554444' })).status, 400);
    const r = await a.request('/api/checkout', 'POST', { ...shipping, total: 1, items: [{ id: 'mouse', quantity: 1, price: 1 }] });
    assert.equal(r.status, 201); assert.equal(r.data.total, 698000); orderId = r.data.orderId;
    assert.equal((await a.request('/api/cart')).data.items.length, 0);
    assert.equal((await a.request('/api/products/headphone')).data.stock, 98);
    const raw = fs.readFileSync(path.join(dataDir, 'store.json'), 'utf8');
    assert.ok(!raw.includes('4111111111111111')); assert.ok(!raw.includes('"cvv"'));
    assert.equal((await a.request('/api/checkout', 'POST', shipping)).status, 400);
  });
  await t.test('another account cannot read, download or mutate this order', async () => {
    assert.equal((await b.request('/api/orders')).data.length, 0);
    assert.equal((await b.request('/api/orders/' + orderId)).status, 404);
    assert.equal((await b.request('/api/orders/' + orderId + '/invoice')).status, 404);
    for (const action of ['cancel', 'advance']) assert.equal((await b.request('/api/orders/' + orderId + '/' + action, 'POST', {})).status, 404);
    const r = await a.request('/api/orders/' + orderId + '/invoice');
    assert.equal(r.status, 200); assert.match(r.data, /698000/); assert.match(r.headers.get('content-disposition'), /attachment/);
  });
  await t.test('cancellation restores stock once, and repeat cancellation fails', async () => {
    assert.equal((await a.request('/api/orders/' + orderId + '/cancel', 'POST', {})).data.status, 'Dibatalkan');
    assert.equal((await a.request('/api/orders/' + orderId + '/cancel', 'POST', {})).status, 409);
    assert.equal((await a.request('/api/products/headphone')).data.stock, 100);
  });
  await t.test('COD order status advances; shipped orders cannot be cancelled', async () => {
    await b.request('/api/cart/items', 'POST', { id: 'mouse', quantity: 1 });
    const r = await b.request('/api/checkout', 'POST', { fullname: 'B', address: 'Contoh', payment: 'cod' });
    assert.equal(r.status, 201); const route = '/api/orders/' + r.data.orderId;
    assert.equal((await b.request(route + '/advance', 'POST', {})).data.status, 'Dikirim');
    assert.equal((await b.request(route + '/cancel', 'POST', {})).status, 409);
    assert.equal((await b.request(route + '/advance', 'POST', {})).data.status, 'Selesai');
    assert.equal((await b.request(route + '/advance', 'POST', {})).status, 409);
  });
  await t.test('origin, body size and diagnostic restrictions are enforced', async () => {
    assert.equal((await a.request('/api/cart', 'DELETE', undefined, { Origin: 'https://untrusted.example' })).status, 403);
    assert.equal((await guest.request('/api/login', 'POST', { username: 'x'.repeat(40000) })).status, 413);
    const r = await fetch(base + '/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{bad' }); assert.equal(r.status, 400);
    for (const route of ['/api/ping?host=127.0.0.1', '/api/dns-lookup?host=localhost']) assert.equal((await guest.request(route)).status, 400);
  });
  await t.test('all shop pages and real JPEG assets are served locally; teacher docs are private', async () => {
    for (const p of ['index', 'product', 'cart', 'checkout', 'account', 'login', 'orders', 'lab']) {
      const r = await guest.request('/' + p + '.html'); assert.equal(r.status, 200); assert.match(r.data, /<html lang="id">/); assert.ok(!r.data.includes('cdn.'));
    }
    for (const id of ['headphone', 'keyboard', 'speaker', 'mouse']) {
      const r = await fetch(base + '/assets/' + id + '.jpg'); assert.equal(r.status, 200); assert.match(r.headers.get('content-type'), /image\/jpeg/);
      const bytes = new Uint8Array(await r.arrayBuffer()); assert.deepEqual([...bytes.slice(0, 3)], [255, 216, 255]); assert.ok(bytes.length > 20000);
    }
    for (const route of ['/docs/03-answer-key.md', '/store.json', '/.env']) assert.equal((await guest.request(route)).status, 404);
  });
  await t.test('logout invalidates captured session immediately', async () => {
    const saved = a.cookie;
    assert.equal((await a.request('/api/logout', 'POST', {})).status, 200);
    a.cookie = saved; assert.equal((await a.request('/api/orders')).status, 401);
  });
  await t.test('accounts, profile, cart, favorites and orders survive a server restart', async () => {
    await b.request('/api/cart/items', 'POST', { id: 'speaker', quantity: 2 });
    await new Promise(resolve => server.close(resolve));
    server = createApp({ dataDir, log: false }).listen(0, '127.0.0.1');
    await new Promise(resolve => server.once('listening', resolve)); base = 'http://127.0.0.1:' + server.address().port;
    assert.equal((await b.request('/api/cart')).status, 401);
    assert.equal((await b.request('/api/login', 'POST', { username: 'student-b', password: 'testpass123' })).status, 200);
    assert.equal((await b.request('/api/cart')).data.total, 518000);
    assert.equal((await b.request('/api/orders')).data[0].status, 'Selesai');
    await a.request('/api/login', 'POST', { username: 'mahasiswa-demo', password: 'belajar123' });
    assert.equal((await a.request('/api/me')).data.user.fullname, '<script>example</script>');
    assert.deepEqual((await a.request('/api/me')).data.user.favorites, ['mouse']);
    assert.equal((await a.request('/api/orders')).data[0].status, 'Dibatalkan');
  });
});

