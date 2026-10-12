'use strict';
const $ = s => document.querySelector(s);
const e = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = value => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(value);
const page = document.body.dataset.page;
let user = null, products = [], cart = { items: [], total: 0 }, category = 'Semua', search = '', sort = 'default', toastTimer;
async function api(url, method = 'GET', body) {
  const response = await fetch(url, { method, credentials: 'same-origin', headers: body === undefined ? {} : { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  const data = await response.json();
  if (!response.ok) { const error = new Error(data.error || 'Permintaan gagal.'); error.status = response.status; throw error; }
  return data;
}
function toast(message, error = false) {
  clearTimeout(toastTimer); const el = $('#toast'); el.textContent = message; el.className = error ? 'error' : ''; el.hidden = false;
  toastTimer = setTimeout(() => { el.hidden = true; }, 4500);
}
function guestItems() {
  try {
    const stored = JSON.parse(localStorage.getItem('tokoku-cart-v2') || '[]');
    if (!Array.isArray(stored)) return [];
    const seen = new Set();
    return stored.filter(i => i && products.some(p => p.id === i.id) && Number.isInteger(i.quantity) && i.quantity >= 1 && i.quantity <= 10 && !seen.has(i.id) && seen.add(i.id)).map(i => ({ id: i.id, quantity: i.quantity }));
  } catch { return []; }
}
function saveGuest(items) { localStorage.setItem('tokoku-cart-v2', JSON.stringify(items)); }
async function loadCart() {
  if (user) cart = await api('/api/cart');
  else {
    cart.items = guestItems().map(i => ({ ...products.find(p => p.id === i.id), quantity: i.quantity }));
    cart.total = cart.items.reduce((sum, i) => sum + i.price * i.quantity, 0);
  }
  renderHeader();
}
async function mergeGuest() {
  const items = guestItems();
  if (items.length) { await api('/api/cart/merge', 'POST', { items }); saveGuest([]); }
}
function renderHeader() {
  const count = cart.items.reduce((sum, i) => sum + i.quantity, 0);
  $('#header').innerHTML = '<div class="topline">TOKOKU EDULAB &nbsp; · &nbsp; Belanja simulasi, pengalaman nyata.</div><nav class="nav" aria-label="Navigasi utama"><a class="brand" href="/">TokoKu<span>.</span></a><div class="navlinks"><a href="/#koleksi"' + (page === 'index' ? ' aria-current="page"' : '') + '>Koleksi</a><a href="/orders.html"' + (page === 'orders' ? ' aria-current="page"' : '') + '>Pesanan</a><a href="/lab.html"' + (page === 'lab' ? ' aria-current="page"' : '') + '>Ruang praktikum</a></div><div class="navright"><a href="' + (user ? '/account.html' : '/login.html') + '">' + (user ? e(user.username) : 'Masuk') + '</a><a href="/cart.html">Keranjang <span class="count">' + count + '</span></a></div></nav>';
}
function renderFooter() {
  $('#footer').innerHTML = '<div class="footer"><div><a class="brand" href="/">TokoKu<span>.</span></a><br>Toko simulasi untuk belajar jaringan.<br>Gunakan akun, alamat, dan pembayaran contoh.</div><div>Foto produk nyata sebagai ilustrasi. Produk &amp; harga bersifat simulasi.<br><a href="/assets/credits.json">Kredit foto Unsplash</a> &nbsp; · &nbsp; <a href="/lab.html">Panduan praktikum</a><br>Tidak ada pembayaran atau pengiriman barang nyata.</div></div>';
}
function head(title, subtitle) { return '<div class="pagehead"><p class="eyebrow">TOKOKU / ' + e(title) + '</p><h1>' + e(title) + '</h1><p class="muted">' + e(subtitle) + '</p></div>'; }
function empty(title, copy, url = '/#koleksi', link = 'Jelajahi koleksi') { return '<div class="empty"><h2>' + e(title) + '</h2><p>' + e(copy) + '</p><a class="button" href="' + e(url) + '">' + e(link) + '</a></div>'; }
function productCard(p) {
  const liked = !!user?.favorites.includes(p.id);
  return '<article class="card"><div class="productimage"><a href="/product.html?id=' + p.id + '"><img src="' + p.image + '" alt="Foto ilustrasi ' + e(p.name) + '" loading="lazy" width="600" height="600"></a><button class="favorite" data-action="favorite" data-id="' + p.id + '" aria-label="' + (liked ? 'Hapus dari' : 'Simpan ke') + ' favorit: ' + e(p.name) + '" aria-pressed="' + liked + '">' + (liked ? '♥' : '♡') + '</button></div><div class="cardbody"><p class="eyebrow">' + e(p.category) + '</p><h3><a href="/product.html?id=' + p.id + '">' + e(p.name) + '</a></h3><p class="price">' + money(p.price) + '</p><button class="button secondary" data-action="add" data-id="' + p.id + '"' + (!p.stock ? ' disabled' : '') + '>' + (p.stock ? '+ Tambah ke keranjang' : 'Stok habis') + '</button></div></article>';
}
function renderProducts() {
  let result = products.filter(p => (category === 'Semua' || p.category === category) && (p.name + ' ' + p.description).toLowerCase().includes(search.toLowerCase()));
  if (sort === 'low') result.sort((a, b) => a.price - b.price);
  if (sort === 'high') result.sort((a, b) => b.price - a.price);
  if (sort === 'name') result.sort((a, b) => a.name.localeCompare(b.name));
  $('#product-grid').innerHTML = result.length ? result.map(productCard).join('') : empty('Belum ada yang cocok', 'Coba kata kunci atau kategori lain.');
  $('#product-count').textContent = result.length + ' produk pilihan';
}
function renderHome() {
  $('#main').innerHTML = '<section class="hero"><div class="hero-copy"><p class="eyebrow">PILIHAN KECIL, HARI LEBIH BAIK</p><h1>Ruang nyaman.<br>Ide tanpa batas.</h1><p class="lead">Temukan teman baru untuk meja kerja dan waktu santaimu. Sederhana, fungsional, dan penuh karakter.</p><a href="#koleksi" class="button">Temukan favoritmu &nbsp; ↗</a></div><div class="hero-art"><img src="/assets/headphone.jpg" alt="Headphone hitam di atas latar kuning" width="1200" height="1200" fetchpriority="high"><div class="hero-tag">Studio Headphone &nbsp; · &nbsp; ' + money(349000) + '</div></div></section><div class="benefits"><div>01 &nbsp; Pilihan terkurasi<span>Perlengkapan untuk keseharian.</span></div><div>02 &nbsp; Keranjang tersimpan<span>Lanjutkan belanja setelah login.</span></div><div>03 &nbsp; Belajar sambil mencoba<span>Seluruh transaksi adalah simulasi.</span></div></div><section id="koleksi"><div class="sectionhead"><div><p class="eyebrow">TEMUKAN PILIHANMU</p><h2>Koleksi untuk keseharian</h2></div><span id="product-count" class="muted small"></span></div><div class="toolbar"><div class="filters" aria-label="Kategori">' + ['Semua', 'Audio', 'Workspace'].map(c => '<button class="chip" data-action="category" data-category="' + c + '" aria-pressed="' + (category === c) + '">' + c + '</button>').join('') + '</div><input id="search" class="search" type="search" placeholder="Cari produk…" aria-label="Cari produk"><select id="sort" aria-label="Urutkan produk"><option value="default">Pilihan TokoKu</option><option value="low">Harga terendah</option><option value="high">Harga tertinggi</option><option value="name">Nama A–Z</option></select></div><div id="product-grid" class="grid"></div></section><aside class="banner"><div><h3>Di balik setiap klik, ada cerita jaringan.</h3><p class="small muted">Amati login, checkout, dan transfer file dalam praktikum Nmap &amp; Wireshark.</p></div><a class="button secondary" href="/lab.html">Masuk ruang praktikum ↗</a></aside>';
  renderProducts();
  $('#search').addEventListener('input', event => { search = event.target.value; renderProducts(); });
  $('#sort').addEventListener('change', event => { sort = event.target.value; renderProducts(); });
}
function renderLogin(register = false) {
  if (user) { $('#main').innerHTML = head('Kamu sudah masuk', 'Akun aktif: ' + user.username) + '<div class="actions"><a class="button" href="/account.html">Buka akun saya</a><button class="button secondary" data-action="logout">Keluar</button></div>'; return; }
  $('#main').innerHTML = '<section class="auth"><div class="auth-side"><p class="eyebrow">SELAMAT DATANG DI TOKOKU</p><h1>Temukan hal baik<br>untuk harimu.</h1><p class="lead">Simpan pilihan favorit, lanjutkan belanja, dan ikuti setiap pesananmu.</p><div class="notice">Akun demo praktikum:<br><strong>mahasiswa-demo</strong> / <strong>belajar123</strong><br>Daftar dengan username sendiri agar pesanan terpisah.</div><img class="auth-photo" src="/assets/keyboard.jpg" alt="Keyboard untuk meja kerja" width="600" height="300"></div><div class="panel"><div class="auth-tabs"><button class="chip" data-action="auth-login" aria-pressed="' + !register + '">Masuk</button><button class="chip" data-action="auth-register" aria-pressed="' + register + '">Daftar akun</button></div><h2>' + (register ? 'Buat akun praktikum' : 'Senang bertemu lagi.') + '</h2><form class="form" id="auth-form" data-mode="' + (register ? 'register' : 'login') + '">' + (register ? '<label>Nama contoh<input name="fullname" maxlength="80" required autocomplete="name" placeholder="Mahasiswa A"></label>' : '') + '<label>Username<input name="username" maxlength="40" required autocomplete="username" ' + (register ? 'pattern="[a-zA-Z0-9_-]{3,40}" minlength="3"' : '') + ' placeholder="mahasiswa-demo"></label><label>Password<input name="password" type="password" maxlength="80" required ' + (register ? 'minlength="8" autocomplete="new-password"' : 'autocomplete="current-password"') + ' placeholder="' + (register ? 'Minimal 8 karakter' : 'Masukkan password') + '"></label><p class="notice form-message" role="alert"></p><button class="button full" type="submit">' + (register ? 'Buat akun' : 'Masuk ke TokoKu') + '</button></form><p class="small muted">Gunakan password khusus lab. Jangan gunakan data pribadi asli.</p></div></section>';
}
function summary(button = '') {
  return '<aside class="panel"><h2>Ringkasan belanja</h2><div class="summary-line"><span>' + cart.items.reduce((n, i) => n + i.quantity, 0) + ' barang</span><span>' + money(cart.total) + '</span></div><div class="summary-line"><span>Pengiriman simulasi</span><span>Gratis</span></div><div class="summary-line total"><span>Total</span><span>' + money(cart.total) + '</span></div>' + button + '<p class="small muted">Tidak ada tagihan uang nyata. Harga dihitung kembali oleh server saat checkout.</p></aside>';
}
function renderCart() {
  $('#main').innerHTML = head('Keranjang belanja', user ? 'Pilihanmu tersimpan di akun ' + user.username + '.' : 'Belanja sebagai tamu. Login saat siap membuat pesanan.');
  if (!cart.items.length) { $('#main').innerHTML += empty('Keranjang masih kosong', 'Mulai dengan sesuatu yang kamu suka.'); return; }
  $('#main').innerHTML += '<div class="split"><section class="panel">' + cart.items.map(i => '<article class="cartrow"><a href="/product.html?id=' + i.id + '"><img src="' + i.image + '" alt="' + e(i.name) + '"></a><div><h3><a href="/product.html?id=' + i.id + '">' + e(i.name) + '</a></h3><p class="muted">' + money(i.price) + '</p><div class="quantity"><button data-action="quantity" data-id="' + i.id + '" data-quantity="' + (i.quantity - 1) + '" aria-label="Kurangi ' + e(i.name) + '"' + (i.quantity === 1 ? ' disabled' : '') + '>−</button><span>' + i.quantity + '</span><button data-action="quantity" data-id="' + i.id + '" data-quantity="' + (i.quantity + 1) + '" aria-label="Tambah ' + e(i.name) + '"' + (i.quantity >= Math.min(10, i.stock) ? ' disabled' : '') + '>+</button></div></div><div class="cartactions"><p class="price">' + money(i.quantity * i.price) + '</p><button class="textbutton" data-action="remove" data-id="' + i.id + '">Hapus</button></div></article>').join('') + '<div class="actions"><a class="textbutton" href="/#koleksi">Lanjut belanja</a><button class="textbutton" data-action="clear">Kosongkan keranjang</button></div></section>' + summary('<a class="button full" href="' + (user ? '/checkout.html' : '/login.html?next=checkout') + '">' + (user ? 'Lanjut ke checkout' : 'Login untuk checkout') + ' →</a>') + '</div>';
}
function loginRequired() {
  $('#main').innerHTML = head('Masuk untuk melanjutkan', 'Akses keranjang tersimpan, profil, dan pesanan milikmu.') + empty('Akunmu, pilihanmu', 'Gunakan akun demo atau daftar akun praktikum sendiri.', '/login.html?next=' + page, 'Masuk / daftar');
}
function renderCheckout() {
  if (!user) return loginRequired();
  if (!cart.items.length) { $('#main').innerHTML = head('Checkout', 'Selesaikan pesanan simulasimu.') + empty('Keranjang masih kosong', 'Tambahkan produk sebelum checkout.'); return; }
  $('#main').innerHTML = head('Satu langkah lagi.', 'Lengkapi alamat contoh dan pilih cara pembayaran simulasi.') + '<div class="split"><form id="checkout-form" class="panel form"><h2>Informasi penerima</h2><label>Nama penerima (contoh)<input name="fullname" required maxlength="80" autocomplete="name" value="' + e(user.fullname) + '"></label><label>Alamat contoh<textarea name="address" required maxlength="200">' + e(user.address) + '</textarea></label><h2>Pembayaran simulasi</h2><label>Metode pembayaran<select id="payment" name="payment"><option value="card">Kartu dummy</option><option value="cod">COD simulasi</option></select></label><div id="card-fields" class="form"><div class="notice">Kartu uji: <strong>4111 1111 1111 1111</strong> · <strong>12/30</strong> · CVV <strong>123</strong>. Hanya data ini yang diterima.</div><label>Nomor kartu dummy<input name="card_number" value="4111 1111 1111 1111" maxlength="23" inputmode="numeric" required autocomplete="off"></label><div class="row"><label>Masa berlaku<input name="expiry" value="12/30" maxlength="5" required autocomplete="off"></label><label>CVV dummy<input name="cvv" value="123" maxlength="3" inputmode="numeric" required autocomplete="off"></label></div></div><p class="notice form-message" role="alert"></p><button class="button full" type="submit">Buat pesanan · ' + money(cart.total) + '</button><a class="textbutton" href="/cart.html">Kembali ke keranjang</a></form>' + summary('<div class="stack">' + cart.items.map(i => '<div class="summary-line"><span>' + e(i.name) + ' × ' + i.quantity + '</span><span>' + money(i.price * i.quantity) + '</span></div>').join('') + '</div>') + '</div>';
  $('#payment').addEventListener('change', event => { const card = event.target.value === 'card'; $('#card-fields').hidden = !card; $('#card-fields').querySelectorAll('input').forEach(input => { input.required = card; input.disabled = !card; }); });
}
function renderProduct() {
  const p = products.find(p => p.id === new URLSearchParams(location.search).get('id'));
  if (!p) { $('#main').innerHTML = empty('Produk tidak ditemukan', 'Pilih salah satu produk dari koleksi.'); return; }
  $('#main').innerHTML = '<div class="breadcrumb"><a href="/">Koleksi</a> / ' + e(p.name) + '</div><div class="split"><img class="detailphoto" src="' + p.image + '" alt="Foto ilustrasi ' + e(p.name) + '" width="1200" height="1200"><section class="detailcopy"><p class="eyebrow">' + e(p.category) + '</p><h1>' + e(p.name) + '</h1><p class="price">' + money(p.price) + '</p><p class="lead">' + e(p.description) + '</p><ul><li>Stok simulasi: ' + p.stock + ' unit</li><li>Maksimal 10 unit per produk dalam keranjang</li><li>Pengiriman dan pembayaran untuk latihan</li></ul><label class="quantity-input">Jumlah<input id="detail-quantity" type="number" min="1" max="' + Math.max(1, Math.min(10, p.stock)) + '" value="1"></label><div class="actions"><button class="button" data-action="detail-add" data-id="' + p.id + '"' + (!p.stock ? ' disabled' : '') + '>Tambah ke keranjang</button><button class="button secondary" data-action="favorite" data-id="' + p.id + '" aria-pressed="' + !!user?.favorites.includes(p.id) + '">' + (user?.favorites.includes(p.id) ? '♥ Tersimpan' : '♡ Simpan favorit') + '</button></div><p class="small muted">Foto nyata untuk ilustrasi; nama dan harga adalah data simulasi.</p></section></div>';
}
function renderAccount() {
  if (!user) return loginRequired();
  $('#main').innerHTML = head('Halo, ' + user.fullname + '.', 'Kelola profil dan simpan pilihan favoritmu.') + '<div class="split"><form id="profile-form" class="panel form"><h2>Profil saya</h2><label>Username<input value="' + e(user.username) + '" disabled></label><label>Nama contoh<input name="fullname" required maxlength="80" value="' + e(user.fullname) + '"></label><label>Alamat contoh<textarea name="address" required maxlength="200">' + e(user.address) + '</textarea></label><p class="notice form-message" role="alert"></p><button class="button" type="submit">Simpan perubahan</button></form><aside class="panel"><h2>Ruang pribadimu</h2><p class="muted">Keranjang, favorit, dan pesanan tersimpan pada akun ini. Gunakan username berbeda untuk setiap mahasiswa.</p><div class="stack"><a class="button secondary" href="/orders.html">Lihat pesanan saya →</a><a class="button secondary" href="/cart.html">Buka keranjang →</a><button class="button danger" data-action="logout">Keluar dari akun</button></div></aside></div><div class="sectionhead"><h2>Favorit saya</h2><span class="muted small">' + user.favorites.length + ' produk</span></div><div class="grid">' + (products.filter(p => user.favorites.includes(p.id)).map(productCard).join('') || empty('Belum ada favorit', 'Tekan ikon hati pada produk yang kamu sukai.')) + '</div>';
}
async function renderOrders() {
  if (!user) return loginRequired();
  const orders = await api('/api/orders');
  const selected = new URLSearchParams(location.search).get('id');
  $('#main').innerHTML = head('Pesanan saya', 'Lihat rincian, unduh bukti pesanan, atau jalankan simulasi status pengiriman.') + (selected ? '<p class="notice success">Pesanan ' + e(selected) + ' berhasil dibuat.</p>' : '') + '<div class="stack">' + (orders.map(o => '<article class="order"><div class="orderhead"><div><p class="eyebrow">' + new Date(o.createdAt).toLocaleString('id-ID') + '</p><h3>' + e(o.id) + '</h3></div><span class="badge">' + e(o.status) + '</span></div><ul>' + o.items.map(i => '<li>' + e(i.name) + ' × ' + i.quantity + ' — ' + money(i.price * i.quantity) + '</li>').join('') + '</ul><p><strong>' + money(o.total) + '</strong> <span class="small muted">· ' + (o.payment === 'card' ? 'Kartu dummy ****1111' : 'COD simulasi') + '</span></p><details><summary>Rincian penerima</summary><p class="small">' + e(o.fullname) + '<br>' + e(o.address) + '</p></details><div class="actions"><a class="button secondary" href="/api/orders/' + o.id + '/invoice" download>Unduh bukti .txt</a>' + (o.status === 'Diproses' ? '<button class="button danger" data-action="cancel-order" data-id="' + o.id + '">Batalkan pesanan</button>' : '') + (['Diproses', 'Dikirim'].includes(o.status) ? '<button class="button" data-action="advance-order" data-id="' + o.id + '">Simulasi: ' + (o.status === 'Diproses' ? 'kirim pesanan' : 'pesanan diterima') + '</button>' : '') + '</div></article>').join('') || empty('Belum ada pesanan', 'Pesanan dari checkout akan tampil di sini.')) + '</div>';
}
function renderLab() {
  $('#main').innerHTML = head('Ruang praktikum.', 'Belajar membaca lalu lintas dari tindakan yang benar-benar berjalan.') + '<div class="notice">Buka website ini melalui Firefox di desktop lab. Jalankan Nmap dan Wireshark di desktop yang sama. Target praktikum: <strong>172.31.250.10</strong>. Link ngrok mengantar ke desktop; alamat ngrok bukan target port scan lab.</div><div class="sectionhead"><h2>Dari klik ke paket jaringan</h2></div><div class="labgrid"><section class="panel"><p class="eyebrow">01 / WEBSITE</p><h2>Login sampai checkout</h2><ol><li>Mulai capture Wireshark pada interface yang menuju 172.31.250.10 (biasanya eth0).</li><li>Masuk memakai <code>mahasiswa-demo / belajar123</code> atau daftar akun sendiri.</li><li>Tambah produk, ubah jumlah, lalu checkout kartu dummy.</li><li>Lihat pesanan, unduh bukti, lalu batalkan atau lanjutkan status simulasi.</li></ol><pre>http.request\nhttp.request.method == "POST"\nhttp.request.uri contains "/api/"\ntcp.port == 8080</pre><p>Gunakan Follow → TCP Stream pada permintaan login. HTTP internal lab menampilkan username dan password contoh. Cookie sesi adalah bukti login; jangan gunakan kredensial asli.</p><a class="button secondary" href="/login.html">Buka halaman login</a></section><section class="panel"><p class="eyebrow">02 / NMAP</p><h2>Kenali layanan target</h2><pre>nmap -sT -sV -Pn -p 21,22,23,25,3306,6379,8080,27017 172.31.250.10\n\nnmap -sT -sV -Pn -p 21 --script ftp-anon 172.31.250.10</pre><p>Bandingkan port, status, dan layanan. FTP memerlukan akun; anonymous ditolak. Sebagian banner sengaja disimulasikan dan tidak membuktikan versi perangkat lunak asli.</p><pre>ip.addr == 172.31.250.10\ntcp.flags.syn == 1 &amp;&amp; tcp.flags.ack == 0</pre></section><section class="panel"><p class="eyebrow">03 / FTP</p><h2>Transfer file sungguhan</h2><p>Akun bawaan: <code>mahasiswa / ftpbelajar123</code>. Jika diubah pengajar, gunakan akun yang diberikan. Tulis file hanya di <code>/uploads</code>.</p><pre>curl --user mahasiswa:ftpbelajar123 ftp://172.31.250.10/\ncurl --user mahasiswa:ftpbelajar123 ftp://172.31.250.10/README.txt -o README-lab.txt\nprintf \'Halo dari mahasiswa A\\n\' &gt; latihan-A.txt\ncurl --user mahasiswa:ftpbelajar123 -T latihan-A.txt ftp://172.31.250.10/uploads/latihan-A.txt</pre><p>Perintah untuk terminal Linux dalam desktop lab. File latihan maksimal 2 MiB; gunakan nama file berbeda tiap mahasiswa.</p><pre>ftp || ftp-data\nftp.request.command == "USER" || ftp.request.command == "PASS"\ntcp.port == 21 || (tcp.port &gt;= 30000 &amp;&amp; tcp.port &lt;= 30009)</pre></section><section class="panel"><p class="eyebrow">04 / TRAFIK TAMBAHAN</p><h2>Amati request &amp; response</h2><div class="actions"><button class="button secondary" data-action="trigger" data-path="/api/products">GET produk</button><button class="button secondary" data-action="trigger" data-path="/api/version">Versi aplikasi</button><button class="button secondary" data-action="trigger" data-path="/api/dns-lookup">DNS server</button><button class="button secondary" data-action="trigger" data-path="/api/ping">Ping server</button></div><pre id="lab-result" aria-live="polite">Hasil permintaan akan tampil di sini.</pre><p>DNS/Ping tombol di atas berasal dari container web. Agar paket DNS/ICMP terlihat langsung di Wireshark desktop, jalankan:</p><pre>dig @172.31.250.10 tokoku.lab\nping -c 2 172.31.250.10</pre><p>Filter: <code>dns || icmp</code>. Simpan capture sebagai <code>.pcapng</code> untuk laporan.</p></section></div>';
}
async function addItem(id, quantity) {
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 10) throw new Error('Jumlah harus 1–10.');
  if (user) await api('/api/cart/items', 'POST', { id, quantity });
  else {
    const items = guestItems(), existing = items.find(i => i.id === id), p = products.find(p => p.id === id);
    const total = (existing?.quantity || 0) + quantity;
    if (total > Math.min(10, p.stock)) throw new Error('Jumlah melebihi stok atau batas 10 unit.');
    if (existing) existing.quantity = total; else items.push({ id, quantity });
    saveGuest(items);
  }
  await loadCart(); toast('Produk ditambahkan ke keranjang.');
}
async function changeCart(id, quantity) {
  if (user) await api('/api/cart/items/' + encodeURIComponent(id), quantity ? 'PATCH' : 'DELETE', quantity ? { quantity } : undefined);
  else {
    const items = guestItems().filter(i => i.id !== id || quantity > 0);
    const found = items.find(i => i.id === id);
    if (found) found.quantity = quantity;
    saveGuest(items);
  }
  await loadCart(); renderCart();
}
function confirmAction(message) {
  const dialog = $('#confirm-dialog'); $('#confirm-message').textContent = message; dialog.returnValue = 'cancel'; dialog.showModal();
  return new Promise(resolve => dialog.addEventListener('close', () => resolve(dialog.returnValue === 'ok'), { once: true }));
}
document.addEventListener('click', async event => {
  const button = event.target.closest('button[data-action]');
  if (!button || button.disabled) return;
  const action = button.dataset.action, id = button.dataset.id;
  button.disabled = true;
  try {
    if (action === 'add' || action === 'detail-add') await addItem(id, action === 'add' ? 1 : Number($('#detail-quantity').value));
    if (action === 'category') { category = button.dataset.category; document.querySelectorAll('[data-action="category"]').forEach(b => b.setAttribute('aria-pressed', b.dataset.category === category)); renderProducts(); }
    if (action === 'auth-login' || action === 'auth-register') renderLogin(action === 'auth-register');
    if (action === 'quantity') await changeCart(id, Number(button.dataset.quantity));
    if (action === 'remove') await changeCart(id, 0);
    if (action === 'clear' && await confirmAction('Hapus semua produk dari keranjang?')) { if (user) await api('/api/cart', 'DELETE'); else saveGuest([]); await loadCart(); renderCart(); }
    if (action === 'favorite') {
      if (!user) { location.href = '/login.html?next=account'; return; }
      user = (await api('/api/favorites/' + encodeURIComponent(id), 'POST', {})).user;
      if (page === 'index') renderProducts(); if (page === 'product') renderProduct(); if (page === 'account') renderAccount();
      toast(user.favorites.includes(id) ? 'Disimpan ke favorit.' : 'Dihapus dari favorit.');
    }
    if (action === 'logout') { await api('/api/logout', 'POST', {}); location.href = '/login.html'; }
    if (['cancel-order', 'advance-order'].includes(action) && await confirmAction(action === 'cancel-order' ? 'Batalkan pesanan ini? Stok akan dikembalikan.' : 'Lanjutkan status pesanan ke tahap simulasi berikutnya?')) {
      await api('/api/orders/' + encodeURIComponent(id) + '/' + (action === 'cancel-order' ? 'cancel' : 'advance'), 'POST', {});
      history.replaceState(null, '', '/orders.html'); await renderOrders(); toast('Status pesanan diperbarui.');
    }
    if (action === 'trigger') { $('#lab-result').textContent = 'Mengirim permintaan…'; try { $('#lab-result').textContent = JSON.stringify(await api(button.dataset.path), null, 2); } catch (err) { $('#lab-result').textContent = err.message; throw err; } }
  } catch (error) { toast(error.message, true); }
  finally { if (button.isConnected) button.disabled = false; }
});
document.addEventListener('submit', async event => {
  const form = event.target;
  if (!['auth-form', 'profile-form', 'checkout-form'].includes(form.id)) return;
  event.preventDefault();
  const submit = form.querySelector('[type="submit"]'), message = form.querySelector('.form-message');
  if (submit.disabled) return;
  submit.disabled = true; message.textContent = ''; message.className = 'notice form-message';
  try {
    const data = Object.fromEntries(new FormData(form));
    if (form.id === 'auth-form') {
      user = (await api('/api/' + form.dataset.mode, 'POST', data)).user;
      await mergeGuest();
      const next = new URLSearchParams(location.search).get('next');
      location.href = ['checkout', 'account', 'orders', 'cart'].includes(next) ? '/' + next + '.html' : '/account.html';
    }
    if (form.id === 'profile-form') { user = (await api('/api/profile', 'PATCH', data)).user; renderHeader(); message.classList.add('success'); message.textContent = 'Profil berhasil disimpan.'; }
    if (form.id === 'checkout-form') { const result = await api('/api/checkout', 'POST', data); location.href = '/orders.html?id=' + encodeURIComponent(result.orderId); }
  } catch (error) { message.classList.add('error'); message.textContent = error.message; }
  finally { submit.disabled = false; }
});
async function init() {
  renderFooter();
  [products, { user }] = await Promise.all([api('/api/products'), api('/api/me')]);
  if (user && guestItems().length) await mergeGuest();
  await loadCart();
  const routes = { index: renderHome, login: renderLogin, cart: renderCart, product: renderProduct, checkout: renderCheckout, account: renderAccount, orders: renderOrders, lab: renderLab };
  await (routes[page] || renderHome)();
  if (location.hash === '#koleksi') $('#koleksi')?.scrollIntoView();
}
init().catch(error => { renderHeader(); $('#main').innerHTML = head('TokoKu belum dapat dimuat', error.message) + '<p class="notice">Pastikan server web berjalan, lalu muat ulang halaman.</p><button class="button" id="reload">Coba lagi</button>'; $('#reload').addEventListener('click', () => location.reload()); });

