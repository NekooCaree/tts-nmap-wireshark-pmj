'use strict';
// DOM-only tests with mocked fetch. No browser, live lab, or external URL is opened.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');
const { products } = require('../services/web-toko/server');
const publicDir = path.join(__dirname, '../services/web-toko/public');
const script = fs.readFileSync(path.join(publicDir, 'app.js'), 'utf8');
const tick = () => new Promise(resolve => setTimeout(resolve, 20));
function fixture(page, signedIn = false, query = '') {
  const dom = new JSDOM(fs.readFileSync(path.join(publicDir, page + '.html'), 'utf8'), { url: 'http://tokoku.test/' + page + '.html' + query, runScripts: 'outside-only' });
  const { window } = dom, calls = [];
  let user = signedIn ? { id: 'a', username: 'student-a', fullname: '<img src=x onerror=alert(1)>', address: 'Alamat contoh', favorites: [] } : null;
  let items = [];
  window.fetch = async (url, options = {}) => {
    const data = options.body ? JSON.parse(options.body) : undefined;
    const method = options.method || 'GET'; calls.push({ url, method, data });
    let result, status = 200;
    if (url === '/api/products') result = products.map(p => ({ ...p, stock: 100 }));
    else if (url === '/api/me') result = { user };
    else if (url === '/api/orders') result = [{ id: 'EDU-TEST', createdAt: '2026-10-11T10:00:00Z', status: 'Diproses', fullname: '<script>hello</script>', address: 'Contoh', payment: 'cod', items: [{ id: 'mouse', name: 'Wireless Mouse', price: 159000, quantity: 1 }], total: 159000 }];
    else if (url.startsWith('/api/favorites/')) { user.favorites = user.favorites.length ? [] : [url.split('/').at(-1)]; result = { user }; }
    else if (url === '/api/profile') { user = { ...user, ...data }; result = { user }; }
    else if (url === '/api/login') { status = 401; result = { error: 'Username atau password salah.' }; }
    else if (url === '/api/checkout') { status = 400; result = { error: 'Stok berubah. Periksa kembali keranjang.' }; }
    else if (url === '/api/version') result = { app: 'TokoKu', version: '2.0' };
    else if (url.startsWith('/api/cart')) {
      if (url.endsWith('/merge')) items = data.items.map(i => ({ ...products.find(p => p.id === i.id), quantity: i.quantity, stock: 100 }));
      if (url.endsWith('/items') && method === 'POST') items.push({ ...products.find(p => p.id === data.id), quantity: data.quantity, stock: 100 });
      result = { items, total: items.reduce((s, i) => s + i.price * i.quantity, 0) };
    } else throw new Error('Unexpected mocked request: ' + method + ' ' + url);
    return { ok: status < 400, status, json: async () => structuredClone(result) };
  };
  return { window, calls, start() { window.eval(script); }, close() { window.close(); } };
}
test('catalog search, category and guest cart controls', async t => {
  const f = fixture('index'); t.after(() => f.close()); f.start(); await tick();
  assert.equal(f.window.document.querySelectorAll('.card').length, 4);
  const input = f.window.document.querySelector('#search'); input.value = 'mouse'; input.dispatchEvent(new f.window.Event('input')); assert.equal(f.window.document.querySelectorAll('.card').length, 1);
  f.window.document.querySelector('[data-action="add"]').click(); await tick();
  assert.equal(JSON.parse(f.window.localStorage.getItem('tokoku-cart-v2'))[0].id, 'mouse');
  assert.equal(f.window.document.querySelector('.count').textContent, '1');
  input.value = ''; input.dispatchEvent(new f.window.Event('input'));
  f.window.document.querySelector('[data-category="Audio"]').click(); await tick();
  assert.equal(f.window.document.querySelectorAll('.card').length, 2);
});
test('guest cart restores and quantity/remove persist', async t => {
  const f = fixture('cart'); t.after(() => f.close());
  f.window.localStorage.setItem('tokoku-cart-v2', JSON.stringify([{ id: 'mouse', quantity: 2 }]));
  f.start(); await tick();
  f.window.document.querySelector('[data-quantity="3"]').click(); await tick();
  assert.equal(JSON.parse(f.window.localStorage.getItem('tokoku-cart-v2'))[0].quantity, 3);
  f.window.document.querySelector('[data-action="remove"]').click(); await tick();
  assert.match(f.window.document.querySelector('main').textContent, /Keranjang masih kosong/);
});
test('login error is visible and registration tab has the expected fields', async t => {
  const f = fixture('login'); t.after(() => f.close()); f.start(); await tick();
  const form = f.window.document.querySelector('#auth-form');
  form.elements.username.value = 'wrong-user'; form.elements.password.value = 'wrongpass';
  form.dispatchEvent(new f.window.Event('submit', { bubbles: true, cancelable: true })); await tick();
  assert.match(form.textContent, /Username atau password salah/);
  assert.equal(f.calls.at(-1).data.password, 'wrongpass');
  assert.equal(form.querySelector('[type="submit"]').disabled, false);
  f.window.document.querySelector('[data-action="auth-register"]').click(); await tick();
  assert.ok(f.window.document.querySelector('[name="fullname"]'));
  assert.equal(f.window.document.querySelector('#auth-form').dataset.mode, 'register');
});
test('favorites and profile form update authenticated state with escaped text', async t => {
  const f = fixture('account', true); t.after(() => f.close()); f.start(); await tick();
  assert.equal(f.window.document.querySelectorAll('main img').length, 0);
  assert.match(f.window.document.querySelector('h1').textContent, /<img src=x/);
  const form = f.window.document.querySelector('#profile-form'); form.elements.fullname.value = 'Mahasiswa baru'; form.elements.address.value = 'Jalan baru';
  form.dispatchEvent(new f.window.Event('submit', { bubbles: true, cancelable: true })); await tick();
  assert.equal(f.calls.at(-1).method, 'PATCH'); assert.match(form.textContent, /Profil berhasil disimpan/);
});
test('product quantity and favorite buttons call their APIs', async t => {
  const f = fixture('product', true, '?id=headphone'); t.after(() => f.close()); f.start(); await tick();
  f.window.document.querySelector('#detail-quantity').value = '3';
  f.window.document.querySelector('[data-action="detail-add"]').click(); await tick();
  assert.ok(f.calls.some(c => c.url === '/api/cart/items' && c.data.quantity === 3));
  f.window.document.querySelector('[data-action="favorite"]').click(); await tick();
  assert.equal(f.window.document.querySelector('[data-action="favorite"]').getAttribute('aria-pressed'), 'true');
});
test('checkout COD toggle and server errors keep form usable', async t => {
  const f = fixture('checkout', true); t.after(() => f.close());
  f.window.localStorage.setItem('tokoku-cart-v2', JSON.stringify([{ id: 'mouse', quantity: 1 }]));
  f.start(); await tick();
  const payment = f.window.document.querySelector('#payment'); payment.value = 'cod'; payment.dispatchEvent(new f.window.Event('change'));
  assert.equal(f.window.document.querySelector('#card-fields').hidden, true);
  const form = f.window.document.querySelector('#checkout-form');
  form.dispatchEvent(new f.window.Event('submit', { bubbles: true, cancelable: true })); await tick();
  assert.match(form.textContent, /Stok berubah/);
  const request = f.calls.find(c => c.url === '/api/checkout');
  assert.equal(request.data.payment, 'cod'); assert.equal(request.data.cvv, undefined);
  assert.equal(form.querySelector('[type="submit"]').disabled, false);
});
test('order actions render and recipient content is escaped', async t => {
  const f = fixture('orders', true); t.after(() => f.close()); f.start(); await tick();
  assert.ok(f.window.document.querySelector('[data-action="cancel-order"]'));
  assert.ok(f.window.document.querySelector('[data-action="advance-order"]'));
  assert.equal(f.window.document.querySelector('[download]').getAttribute('href'), '/api/orders/EDU-TEST/invoice');
  assert.equal(f.window.document.querySelectorAll('main script').length, 0);
});
test('lab traffic button shows the returned result', async t => {
  const f = fixture('lab'); t.after(() => f.close()); f.start(); await tick();
  f.window.document.querySelector('[data-path="/api/version"]').click(); await tick();
  assert.match(f.window.document.querySelector('#lab-result').textContent, /2.0/);
  assert.match(f.window.document.querySelector('main').textContent, /30009/);
});

