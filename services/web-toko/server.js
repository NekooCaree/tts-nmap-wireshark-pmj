'use strict';
const express = require('express');
const path = require('node:path');
const fs = require('node:fs');
const dns = require('node:dns').promises;
const { execFile } = require('node:child_process');
const { randomBytes, scryptSync, timingSafeEqual } = require('node:crypto');
const products = [
  { id: 'headphone', name: 'Studio Headphone', category: 'Audio', price: 349000, image: '/assets/headphone.jpg', description: 'Teman mendengarkan musik dan fokus pada pekerjaan. Desain over-ear untuk meja belajar favoritmu.' },
  { id: 'keyboard', name: 'Compact Keyboard', category: 'Workspace', price: 429000, image: '/assets/keyboard.jpg', description: 'Sentuhan baru untuk meja kerjamu. Keyboard ringkas dengan tampilan bersih dan karakter yang hangat.' },
  { id: 'speaker', name: 'Pocket Speaker', category: 'Audio', price: 259000, image: '/assets/speaker.jpg', description: 'Bawa suasana favorit ke mana saja. Speaker portabel untuk menemani waktu santai setelah belajar.' },
  { id: 'mouse', name: 'Wireless Mouse', category: 'Workspace', price: 159000, image: '/assets/mouse.jpg', description: 'Gerak leluasa, meja lebih lega. Mouse nirkabel dengan bentuk sederhana untuk aktivitas sehari-hari.' }
];
const byId = new Map(products.map(p => [p.id, p]));
const textOK = (v, max) => typeof v === 'string' && v.trim().length > 0 && v.length <= max;
function hashPassword(password, salt = randomBytes(16).toString('hex')) {
  return salt + ':' + scryptSync(password, salt, 32).toString('hex');
}
function matchesPassword(password, hash) {
  const [salt, digest] = hash.split(':');
  return timingSafeEqual(Buffer.from(digest, 'hex'), Buffer.from(hashPassword(password, salt).split(':')[1], 'hex'));
}
function createApp({ dataDir = process.env.TOKOKU_DATA_DIR || path.join(__dirname, '../../.runtime/web-data'), log = true } = {}) {
  fs.mkdirSync(dataDir, { recursive: true });
  const filename = path.join(dataDir, 'store.json');
  let state = fs.existsSync(filename) ? JSON.parse(fs.readFileSync(filename, 'utf8')) : {
    version: 2, users: [{ id: 'demo', username: 'mahasiswa-demo', passwordHash: hashPassword('belajar123'), fullname: 'Mahasiswa Demo', address: 'Jalan Praktikum No. 1', cart: [], favorites: [] }],
    orders: [], stock: Object.fromEntries(products.map(p => [p.id, 100]))
  };
  if (state.version !== 2 || !Array.isArray(state.users) || !Array.isArray(state.orders) || !state.stock) throw new Error('Format store.json tidak valid. Pulihkan backup data.');
  function save() {
    fs.writeFileSync(filename + '.tmp', JSON.stringify(state, null, 2), { mode: 0o600 });
    fs.renameSync(filename + '.tmp', filename);
  }
  function commit(change) {
    const backup = structuredClone(state);
    try { const result = change(); save(); return result; }
    catch (error) { state = backup; throw error; }
  }
  save();
  const app = express(), sessions = new Map(), attempts = new Map(), diagnosticCalls = new Map();
  const dnsHosts = new Set((process.env.DNS_ALLOWED_HOSTS || 'example.com').split(',').map(s => s.trim().toLowerCase()));
  const pingHosts = new Set((process.env.PING_ALLOWED_HOSTS || '8.8.8.8,1.1.1.1').split(',').map(s => s.trim()));
  const cleanUser = u => ({ id: u.id, username: u.username, fullname: u.fullname, address: u.address, favorites: u.favorites });
  const fail = (res, status, error) => res.status(status).json({ error });
  app.disable('x-powered-by');
  app.use((req, res, next) => {
    res.set({ Server: 'TokoKu/1.0 (EduLab)', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'same-origin', 'Content-Security-Policy': "default-src 'self'; img-src 'self'; script-src 'self'; style-src 'self'; frame-ancestors 'self'; base-uri 'self'; form-action 'self'" });
    if (log) console.log(req.method + ' ' + req.path.replace(/[\r\n\x00-\x1f]/g, ''));
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && req.headers.origin) {
      try { if (new URL(req.headers.origin).host !== req.headers.host) return fail(res, 403, 'Origin permintaan tidak cocok.'); }
      catch { return fail(res, 403, 'Origin tidak valid.'); }
    }
    next();
  });
  app.use(express.json({ limit: '32kb' }));
  app.use(express.urlencoded({ extended: false, limit: '32kb', parameterLimit: 30 }));
  app.use((req, _res, next) => {
    const cookie = (req.headers.cookie || '').split(';').map(s => s.trim()).find(s => s.startsWith('tokoku_session='));
    req.sessionId = cookie ? cookie.slice('tokoku_session='.length) : '';
    const session = sessions.get(req.sessionId);
    if (session && session.expires > Date.now()) req.user = state.users.find(u => u.id === session.userId);
    else if (session) sessions.delete(req.sessionId);
    next();
  });
  function requireUser(req, res, next) { if (!req.user) return fail(res, 401, 'Silakan login terlebih dahulu.'); next(); }
  function startSession(req, res, user) {
    sessions.delete(req.sessionId);
    for (const [id, s] of sessions) if (s.expires <= Date.now()) sessions.delete(id);
    if (sessions.size >= 1000) sessions.delete(sessions.keys().next().value);
    const token = randomBytes(32).toString('hex');
    sessions.set(token, { userId: user.id, expires: Date.now() + 8 * 3600000 });
    // HTTP is intentional inside the isolated lab; the cookie can be observed in a capture.
    res.cookie('tokoku_session', token, { httpOnly: true, sameSite: 'lax', maxAge: 8 * 3600000, path: '/' });
  }
  function authLimit(req, res, next) {
    const now = Date.now();
    for (const [key, v] of attempts) if (v.until <= now) attempts.delete(key);
    const entry = attempts.get(req.ip) || { count: 0, until: now + 60000 };
    entry.count++; attempts.set(req.ip, entry);
    if (entry.count > 60) return fail(res, 429, 'Terlalu banyak percobaan. Tunggu satu menit.');
    next();
  }
  const cartResult = u => ({ items: u.cart.map(i => ({ ...byId.get(i.id), quantity: i.quantity, stock: state.stock[i.id] })), total: u.cart.reduce((n, i) => n + byId.get(i.id).price * i.quantity, 0) });
  app.get('/api/health', (_req, res) => res.json({ status: 'ok', lab: 'Fake Services Lab', eduOnly: true }));
  app.get('/api/version', (_req, res) => res.json({ app: 'TokoKu', version: '2.0', eduOnly: true, dnsHosts: [...dnsHosts], pingHosts: [...pingHosts] }));
  app.get('/api/products', (_req, res) => res.json(products.map(p => ({ ...p, stock: state.stock[p.id] }))));
  app.get('/api/products/:id', (req, res) => { const p = byId.get(req.params.id); return p ? res.json({ ...p, stock: state.stock[p.id] }) : fail(res, 404, 'Produk tidak ditemukan.'); });
  app.get('/api/me', (req, res) => res.json({ user: req.user ? cleanUser(req.user) : null }));
  app.post('/api/register', authLimit, (req, res) => {
    const { username, password, fullname } = req.body || {};
    if (typeof username !== 'string' || !/^[a-zA-Z0-9_-]{3,40}$/.test(username) || !textOK(password, 80) || password.length < 8 || !textOK(fullname, 80)) return fail(res, 400, 'Nama wajib diisi. Username 3–40 huruf/angka/_/-. Password 8–80 karakter.');
    if (state.users.some(u => u.username === username.toLowerCase())) return fail(res, 409, 'Username sudah digunakan.');
    if (state.users.length >= 500) return fail(res, 409, 'Kapasitas 500 akun praktikum tercapai.');
    const user = { id: randomBytes(12).toString('hex'), username: username.toLowerCase(), passwordHash: hashPassword(password), fullname: fullname.trim(), address: '', cart: [], favorites: [] };
    commit(() => state.users.push(user)); startSession(req, res, user);
    res.status(201).json({ success: true, user: cleanUser(user), message: 'Akun dibuat. Selamat datang!' });
  });
  app.post('/api/login', authLimit, (req, res) => {
    const { username, password } = req.body || {};
    if (!textOK(username, 40) || !textOK(password, 80)) return fail(res, 400, 'Isi username dan password.');
    const user = state.users.find(u => u.username === username.toLowerCase().trim());
    if (!user || !matchesPassword(password, user.passwordHash)) return fail(res, 401, 'Username atau password salah.');
    startSession(req, res, user);
    res.json({ success: true, username: user.username, user: cleanUser(user), message: 'Login berhasil.' });
  });
  app.post('/api/logout', (req, res) => { sessions.delete(req.sessionId); res.clearCookie('tokoku_session', { path: '/', httpOnly: true, sameSite: 'lax' }); res.json({ success: true }); });
  app.patch('/api/profile', requireUser, (req, res) => {
    const { fullname, address } = req.body || {};
    if (!textOK(fullname, 80) || !textOK(address, 200)) return fail(res, 400, 'Isi nama dan alamat contoh (maks. 80/200 karakter).');
    commit(() => Object.assign(req.user, { fullname: fullname.trim(), address: address.trim() }));
    res.json({ user: cleanUser(req.user), message: 'Profil disimpan.' });
  });
  app.get('/api/cart', requireUser, (req, res) => res.json(cartResult(req.user)));
  app.post('/api/cart/merge', requireUser, (req, res) => {
    const items = req.body?.items;
    if (!Array.isArray(items) || items.length > products.length || new Set(items.map(i => i?.id)).size !== items.length || items.some(i => !i || !byId.has(i.id) || !Number.isInteger(i.quantity) || i.quantity < 1 || i.quantity > 10)) return fail(res, 400, 'Keranjang tidak valid.');
    commit(() => { for (const i of items) { const existing = req.user.cart.find(c => c.id === i.id); const quantity = Math.min(10, (existing?.quantity || 0) + i.quantity); if (existing) existing.quantity = quantity; else req.user.cart.push({ id: i.id, quantity }); } });
    res.json(cartResult(req.user));
  });
  app.post('/api/cart/items', requireUser, (req, res) => {
    const { id, quantity = 1 } = req.body || {}, existing = req.user.cart.find(i => i.id === id);
    if (!byId.has(id) || !Number.isInteger(quantity) || quantity < 1 || (existing?.quantity || 0) + quantity > 10) return fail(res, 400, 'Jumlah maksimal 10 per produk.');
    if ((existing?.quantity || 0) + quantity > state.stock[id]) return fail(res, 409, 'Stok tidak mencukupi.');
    commit(() => { if (existing) existing.quantity += quantity; else req.user.cart.push({ id, quantity }); }); res.json(cartResult(req.user));
  });
  app.patch('/api/cart/items/:id', requireUser, (req, res) => {
    const item = req.user.cart.find(i => i.id === req.params.id), quantity = req.body?.quantity;
    if (!item) return fail(res, 404, 'Item tidak ada di keranjang.');
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 10) return fail(res, 400, 'Jumlah harus 1–10.');
    if (quantity > state.stock[item.id]) return fail(res, 409, 'Stok tidak mencukupi.');
    commit(() => { item.quantity = quantity; }); res.json(cartResult(req.user));
  });
  app.delete('/api/cart/items/:id', requireUser, (req, res) => { commit(() => { req.user.cart = req.user.cart.filter(i => i.id !== req.params.id); }); res.json(cartResult(req.user)); });
  app.delete('/api/cart', requireUser, (req, res) => { commit(() => { req.user.cart = []; }); res.json(cartResult(req.user)); });
  app.post('/api/favorites/:id', requireUser, (req, res) => {
    if (!byId.has(req.params.id)) return fail(res, 404, 'Produk tidak ditemukan.');
    commit(() => { const i = req.user.favorites.indexOf(req.params.id); if (i < 0) req.user.favorites.push(req.params.id); else req.user.favorites.splice(i, 1); });
    res.json({ user: cleanUser(req.user) });
  });
  app.post('/api/checkout', requireUser, (req, res) => {
    const { fullname, address, payment = 'card', card_number, expiry, cvv } = req.body || {};
    if (!textOK(fullname, 80) || !textOK(address, 200)) return fail(res, 400, 'Isi nama dan alamat contoh.');
    if (!['card', 'cod'].includes(payment)) return fail(res, 400, 'Metode pembayaran tidak valid.');
    if (payment === 'card' && (String(card_number || '').replace(/[ -]/g, '') !== '4111111111111111' || expiry !== '12/30' || cvv !== '123')) return fail(res, 400, 'Gunakan kartu dummy 4111 1111 1111 1111, expiry 12/30, CVV 123.');
    if (!req.user.cart.length) return fail(res, 400, 'Keranjang masih kosong.');
    if (req.user.cart.some(i => i.quantity > state.stock[i.id])) return fail(res, 409, 'Stok berubah. Periksa kembali keranjang.');
    if (state.orders.length >= 10000) return fail(res, 409, 'Kapasitas pesanan praktikum tercapai.');
    const order = { id: 'EDU-' + randomBytes(6).toString('hex').toUpperCase(), userId: req.user.id, createdAt: new Date().toISOString(), status: 'Diproses', fullname: fullname.trim(), address: address.trim(), payment, last4: payment === 'card' ? '1111' : null, items: req.user.cart.map(i => ({ id: i.id, name: byId.get(i.id).name, price: byId.get(i.id).price, quantity: i.quantity })), total: cartResult(req.user).total };
    commit(() => { state.orders.push(order); for (const i of req.user.cart) state.stock[i.id] -= i.quantity; req.user.cart = []; });
    res.status(201).json({ success: true, eduOnly: true, orderId: order.id, total: order.total, order, message: 'Pesanan simulasi dibuat. Tidak ada pembayaran atau pengiriman nyata.' });
  });
  app.get('/api/orders', requireUser, (req, res) => res.json(state.orders.filter(o => o.userId === req.user.id).slice().reverse()));
  app.use('/api/orders/:id', requireUser, (req, res, next) => { req.order = state.orders.find(o => o.id === req.params.id && o.userId === req.user.id); if (!req.order) return fail(res, 404, 'Pesanan tidak ditemukan.'); next(); });
  app.get('/api/orders/:id', (req, res) => res.json(req.order));
  app.post('/api/orders/:id/cancel', (req, res) => {
    if (req.order.status !== 'Diproses') return fail(res, 409, 'Hanya pesanan Diproses yang dapat dibatalkan.');
    commit(() => { req.order.status = 'Dibatalkan'; for (const i of req.order.items) state.stock[i.id] += i.quantity; }); res.json(req.order);
  });
  app.post('/api/orders/:id/advance', (req, res) => {
    const next = { Diproses: 'Dikirim', Dikirim: 'Selesai' }[req.order.status];
    if (!next) return fail(res, 409, 'Pesanan sudah berada pada status akhir.');
    commit(() => { req.order.status = next; }); res.json(req.order);
  });
  app.get('/api/orders/:id/invoice', (req, res) => {
    const o = req.order;
    const lines = ['TOKOKU — BUKTI PESANAN SIMULASI', o.id, o.createdAt, 'Status: ' + o.status, 'Nama: ' + o.fullname, 'Alamat: ' + o.address, '', ...o.items.map(i => i.name + ' x' + i.quantity + ': Rp' + i.price * i.quantity), '', 'Total: Rp' + o.total, 'Pembayaran: ' + (o.payment === 'card' ? 'Kartu dummy ****1111' : 'COD simulasi'), 'Tidak ada transaksi uang nyata.'];
    res.attachment(o.id + '.txt').type('text/plain').send(lines.join('\n'));
  });
  function diagnosticLimit(req, res, next) {
    const now = Date.now();
    for (const [key, item] of diagnosticCalls) if (now - item.start > 10000) diagnosticCalls.delete(key);
    const item = diagnosticCalls.get(req.ip) || { start: now, count: 0 }; item.count++; diagnosticCalls.set(req.ip, item);
    if (item.count > 8) return fail(res, 429, 'Tunggu 10 detik sebelum mengulang trigger jaringan.'); next();
  }
  app.get('/api/dns-lookup', diagnosticLimit, async (req, res) => {
    const host = typeof req.query.host === 'string' ? req.query.host.toLowerCase() : 'example.com';
    if (!/^[a-z0-9][a-z0-9.-]{0,251}$/.test(host) || !dnsHosts.has(host)) return fail(res, 400, 'Host DNS tidak termasuk daftar latihan.');
    const resolver = new dns.Resolver({ timeout: 2000, tries: 1 });
    try { res.json({ host, addresses: await resolver.resolve4(host), generatedBy: 'web-toko container', protocol: 'DNS' }); }
    catch (error) { res.status(502).json({ host, error: error.code || 'DNS_FAILED' }); }
  });
  app.get('/api/ping', diagnosticLimit, (req, res) => {
    const host = typeof req.query.host === 'string' ? req.query.host : '8.8.8.8';
    if (!pingHosts.has(host) || !/^[0-9.]+$/.test(host)) return fail(res, 400, 'Target ping tidak termasuk daftar latihan.');
    execFile('/bin/ping', ['-n', '-c', '2', '-W', '2', host], { timeout: 6000, maxBuffer: 65536 }, (error, stdout, stderr) => res.status(error ? 502 : 200).json({ host, success: !error, output: stdout + stderr, generatedBy: 'web-toko container', protocol: 'ICMP' }));
  });
  app.get('/robots.txt', (_req, res) => res.type('text').send('User-agent: *\nDisallow: /lab.html\n'));
  app.use(express.static(path.join(__dirname, 'public'), { etag: false }));
  app.use((_req, res) => fail(res, 404, 'Halaman tidak ditemukan.'));
  app.use((error, _req, res, _next) => { const status = [400, 413].includes(error.status) ? error.status : 500; if (status === 500 && log) console.error(error.message); fail(res, status, status === 413 ? 'Request terlalu besar.' : status === 400 ? 'Body request tidak valid.' : 'Data gagal disimpan atau server mengalami gangguan.'); });
  return app;
}
if (require.main === module) {
  const server = createApp().listen(Number(process.env.PORT || 8080), '0.0.0.0', () => console.log('TokoKu EduLab siap.'));
  server.requestTimeout = 10000; server.headersTimeout = 12000;
  process.on('SIGTERM', () => server.close(() => process.exit(0)));
}
module.exports = { createApp, products };

