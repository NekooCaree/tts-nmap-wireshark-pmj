# Fake Services Lab — TokoKu

Delapan layanan pada satu target untuk praktikum port scanning, service enumeration, banner grabbing, NSE, dan Wireshark. Enam layanan memakai Python socket/stdlib untuk respons simulasi. FTP memakai pyftpdlib dengan login dan transfer file sungguhan di folder latihan. TokoKu memakai Express.js, CSS lokal, foto produk nyata, sesi login, keranjang, dan pesanan tersimpan. Tidak ada akses shell SSH, database, atau relay email sungguhan.

**Hanya untuk lab milik pengajar.** Semua akun/kartu/pesanan adalah data latihan. HTTP dan FTP di jaringan internal sengaja plaintext untuk Wireshark. Password web disimpan sebagai hash scrypt; password dan kartu tidak dicetak dalam log aplikasi, dan nomor kartu lengkap/CVV tidak disimpan. Kode ini bukan pola toko produksi.

**Pembaruan TokoKu + FTP:** baca [cara rebuild, akun, dan simulasi lengkap](docs/07-tokoku-ftp-praktikum.md). Login toko: `mahasiswa-demo / belajar123`. FTP: `mahasiswa / ftpbelajar123`. Password gerbang desktop berbeda dan tetap mengikuti `.runtime/akses-desktop.txt`.

## Praktikum lewat satu link ngrok (tools asli)

Mode desktop menambahkan desktop Linux di browser. Mahasiswa memakai Nmap asli dari terminal dan GUI Wireshark asli. Instalasi tools ada di container pengajar; laptop mahasiswa hanya memerlukan browser. Link ini membuka **satu desktop bersama**, cocok untuk demo atau satu kelompok bergantian. Tidak menyediakan desktop terpisah bagi setiap mahasiswa.

Di PowerShell, pada folder proyek:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\start-desktop.ps1
powershell -ExecutionPolicy Bypass -File .\scripts\start-ngrok.ps1
```

Script pertama membuat password kelas acak di `.env`, membangun desktop, lalu menunggu healthcheck. Script kedua memakai konfigurasi/authtoken ngrok yang sudah disimpan di `%LOCALAPPDATA%\ngrok\ngrok.yml`, dan mencetak URL HTTPS. Tidak perlu memasukkan token lagi. Buka URL, isi username/password kelas dari `.runtime/akses-desktop.txt`, kemudian pilih **Buka desktop**. Password kelas berbeda dari authtoken akun ngrok. Rahasia lokal tidak masuk ZIP.

Desktop lokal tersedia di [127.0.0.1:6080](http://127.0.0.1:6080/). Pengajar juga bisa menjalankan `ngrok http http://127.0.0.1:6080` secara manual dengan konfigurasi ngrok yang benar. Gunakan satu tunnel aktif; jika ERR_NGROK_334, hentikan tunnel domain yang sama dari terminal/mesin lama. Jangan arahkan tunnel ini ke port 8080 karena port tersebut hanya membuka website toko.

Di terminal **di dalam desktop**, jalankan:

```bash
nmap -sT -Pn -n -sV -p 21,22,23,25,3306,6379,8080,27017 172.31.250.10
wireshark &
firefox-esr http://172.31.250.10:8080 &
```

Wireshark: pilih `eth0`, mulai capture, ulangi scan atau login toko, lalu gunakan filter `ip.addr == 172.31.250.10` / `http`. `ping -c 3 172.31.250.10` dan `dig @172.31.250.10 tokoku.lab` menghasilkan paket ICMP/DNS yang bisa ditangkap di interface yang sama. DNS lab memakai record contoh tetap. IP ini private dan dipakai **di dalam desktop**, bukan untuk Nmap di laptop mahasiswa. Domain ngrok menjadi pintu akses desktop, bukan target scan delapan port.

Laptop pengajar, Docker Desktop, dan tunnel harus tetap hidup selama praktikum. Build awal mengunduh sekitar 300 MB paket desktop dan memakai sekitar 1,3 GB ruang image. Desktop dibatasi 1200 MB RAM; sediakan sekitar 2–3 GB RAM kosong. Firefox banyak tab bisa mendekati batas ini.

Hentikan desktop/tunnel proyek dengan:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\stop-desktop.ps1
```

Berkas mahasiswa di `/home/student/lab-files` tetap tersimpan dalam volume. `scripts/reset.sh` menghapus volume beserta berkas tersebut. Untuk Linux gunakan `bash scripts/start-desktop.sh`, lalu `ngrok http http://127.0.0.1:6080`.


## Jalankan di Windows

1. Jalankan Docker Desktop dengan Linux containers dan tunggu engine siap.
2. Buka PowerShell pada folder `nmap-fake-services-lab`.
3. Jalankan:

```powershell
if (!(Test-Path .env)) { Copy-Item .env.example .env }
docker compose up -d --build --wait
docker compose ps
```

Buka [TokoKu lokal](http://127.0.0.1:8080/) dan [halaman trigger trafik](http://127.0.0.1:8080/lab.html). Installer Nmap/Npcap dan Wireshark diperlukan untuk praktik di laptop. Tidak perlu Node/Python lokal untuk menjalankan container. Windows tidak wajib mempunyai `make`; command Compose di atas ekuivalen dengan `make up`.

```powershell
nmap -sV -p 21,22,23,25,3306,6379,8080,27017 127.0.0.1
# Jika nmap belum di PATH:
& 'C:\Program Files (x86)\Nmap\nmap.exe' -sV -p 21,22,23,25,3306,6379,8080,27017 127.0.0.1
# Berhenti:
docker compose down
```

Pada Git Bash dapat menggunakan `bash scripts/start.sh` dan `bash scripts/test-scan.sh`. WSL perlu Nmap dalam distro WSL serta akses IP host yang sesuai; native Windows Nmap adalah cara paling langsung untuk scan published loopback Windows.

## Linux / macOS dengan Make

```bash
test -f .env || cp .env.example .env
make up
make test
make logs
make down
```

Docker Compose minimal 2.24.4 untuk overlay prod. Base image mengikuti spesifikasi: `python:3.12-slim`, `node:20-alpine`; ini versi lab yang diminta, bukan rekomendasi lifecycle untuk aplikasi produksi. Express dipatok di package-lock dan diinstal menggunakan npm ci.

## Arsitektur

```text
Mahasiswa (Nmap / Ncat / Wireshark / Browser)
                 |
          satu IP target
                 |
       Docker host / VPS / Windows
                 |
           bridge: labnet
    +------------+------------------+
    | :21    ftp-fake   vsftpd 3.0.3 |
    | :22    ssh-fake   OpenSSH 8.2  | <-- VPS host port 2222 -> container 22
    | :23    telnet     Linux banner|
    | :25    smtp      Postfix      |
    | :3306  mysql     5.7.38-log    |
    | :6379  redis     6.2.6        |
    | :8080  web       TokoKu       | --> DNS / ICMP target latihan
    | :27017 mongodb   4.4.18       |
    +-------------------------------+
                 |
    opsional capture-web (namespace web)
                 +--> captures/web-toko.pcap
```

Lokal hanya bind **127.0.0.1**. Prod bind **0.0.0.0** pada IPv4; batasi IP kelas menggunakan firewall provider atau DOCKER-USER. Container dasar memakai filesystem read-only, user non-root, batas memori/PID dan log berotasi. Volume `web-data` menyimpan data toko; `ftp-data` menyimpan file FTP. Enam layanan dummy memakai stdlib; FTP memasang dependensi yang dipatok di requirements.txt. Desktop opsional memakai filesystem writable untuk preferensi dan hasil praktikum. User desktop tetap non-root; hanya binary `dumpcap` diberi file capabilities NET_RAW/NET_ADMIN agar capture berfungsi tanpa sudo. Desktop tidak memiliki Docker socket atau mount folder pribadi host.

Mode desktop memakai jaringan `desktopnet` internal `172.31.250.0/24`: desktop → `lab-target` (172.31.250.10) → delapan layanan. Proxy meneruskan delapan port layanan dan sepuluh port data FTP pasif `30000–30009`, hanya ke backend tetap. DNS contoh hanya menjawab `target.lab` dan `tokoku.lab` tanpa rekursi. Gateway nginx mengautentikasi HTTP dan WebSocket sebelum akses noVNC. Gateway menambahkan port loopback 6080; published port layanan dasar tetap hanya loopback. IP forwarding dimatikan pada proxy/gateway/desktop. Desktop tidak mendapatkan rute internet; backend website tetap dapat menjalankan trigger DNS/ping yang diizinkan.

## Hasil scan nyata

Baseline dari Nmap 7.991 pada Windows, 7 Oktober 2026, sebelum pembaruan FTP dan toko 11 Oktober. Hasil ini arsip, bukan verifikasi build terbaru:

```text
PORT      STATE SERVICE    VERSION
21/tcp    open  ftp        vsftpd 3.0.3
22/tcp    open  ssh        OpenSSH 8.2p1 Ubuntu 4ubuntu0.5 (Ubuntu Linux; protocol 2.0)
23/tcp    open  telnet     Linux telnetd
25/tcp    open  smtp       Postfix smtpd
3306/tcp  open  mysql      MySQL 5.7.38-log
6379/tcp  open  redis      Redis key-value store 6.2.6
8080/tcp  open  http-proxy TokoKu/1.0 (EduLab)
27017/tcp open  mongodb    MongoDB 4.4.18
```

Nmap dapat menampilkan `http-proxy` pada 8080 serta fingerprint submission untuk header custom TokoKu yang belum memiliki hard match. Website ini **tidak** menjadi forward proxy. `http-title` dan `http-headers` mengonfirmasi HTTP, judul, serta header. Teks hasil dapat berbeda antara versi database Nmap. Banner palsu tidak membuktikan versi software/OS nyata. SSH KEX adalah dummy; OS detection membaca stack host/VM, bukan banner Ubuntu.

Output bukti scan berada di `captures/nmap-services.{nmap,xml,gnmap}` setelah pengajar melakukan scan dengan `-oA`. Berkas captures hasil run tidak diperlukan untuk build.

## Toko dan kontrak API

Koleksi → detail produk → keranjang → login/daftar → checkout → pesanan. Login: `mahasiswa-demo` / `belajar123`; username lain harus didaftarkan terlebih dahulu. Akun, profil, favorit, keranjang, stok, dan pesanan disimpan pada volume `web-data`. Sesi cookie HttpOnly berlaku 8 jam dan berakhir ketika server restart. Checkout menerima COD simulasi atau kartu dummy `4111 1111 1111 1111`, expiry `12/30`, CVV `123`. Kartu lengkap dan password tidak disimpan di localStorage atau pesanan. Keranjang tamu saja disimpan lokal lalu digabung saat login.

| Endpoint | Fungsi |
| --- | --- |
| GET /api/health | Status dan penanda edukasi |
| GET /api/version | Versi TokoKu, target diagnostik yang diizinkan |
| GET /api/products | Katalog empat produk |
| POST /api/register, /api/login, /api/logout | Daftar, verifikasi password, cookie sesi, keluar |
| GET /api/me; PATCH /api/profile | Akun aktif dan perubahan nama/alamat |
| GET /api/products/:id | Detail produk dan stok simulasi |
| GET/DELETE /api/cart; POST /api/cart/merge | Keranjang tersimpan, kosongkan, gabung keranjang tamu |
| POST /api/cart/items; PATCH/DELETE /api/cart/items/:id | Tambah, ubah jumlah, hapus |
| POST /api/favorites/:id | Simpan/hapus favorit |
| POST /api/checkout | fullname, address, payment=card/cod, kartu dummy jika card; keranjang dari server |
| GET /api/orders; GET /api/orders/:id | Daftar/detail pesanan akun aktif |
| POST /api/orders/:id/cancel; POST /api/orders/:id/advance | Batalkan dengan pengembalian stok, simulasi status pengiriman |
| GET /api/orders/:id/invoice | Unduh bukti pesanan teks |
| GET /api/dns-lookup?host=example.com | Query A asli dari server, host allowlist |
| GET /api/ping?host=8.8.8.8 | Dua echo request asli dari server, tanpa shell |

Tambahkan keranjang melalui POST `/api/cart/items` dengan `{"id":"headphone","quantity":1}` setelah login. Checkout mengambil keranjang dan harga dari server. Body maksimal 32 KiB, jumlah 1–10 per produk, kapasitas 500 akun/10.000 pesanan. DNS/ping dibatasi delapan trigger per IP setiap sepuluh detik. Tidak ada target bebas atau command shell dari input pengguna. Ping berhasil atau gagal bergantung egress jaringan; capture request tetap berguna.

## Capture Wireshark

Windows: pilih Adapter for loopback traffic capture untuk published localhost. DNS dan ping halaman Lab berjalan dari **container server**, sehingga gunakan namespace capture berikut:

```bash
docker compose -f docker-compose.yml -f docker-compose.capture.yml --profile capture up -d --build capture-web
# Klik tombol di /lab.html atau login/checkout dummy.
docker compose -f docker-compose.yml -f docker-compose.capture.yml --profile capture stop capture-web
```

Buka `captures/web-toko.pcap` di Wireshark. Filter `http`, `dns`, `icmp`; Decode As HTTP port 8080 bila dibutuhkan. Tool capture menyimpan seluruh UDP agar port hasil translasi resolver Docker tidak hilang, ditambah HTTP/8080, TCP DNS, ICMP. Hentikan capture setelah praktikum; menjalankannya ulang akan menimpa PCAP yang sama. FTP/SMTP dipantau dari loopback Windows atau capture host VPS, bukan namespace web.

## Deploy VPS

Lihat [panduan lengkap VPS](docs/04-deploy-vps.md) untuk Ubuntu 24.04, Docker resmi, port SSH administrasi, firewall Docker, dan rate limit.

```bash
cp .env.example .env
# Default VPS_SSH_PORT=2222 agar tidak bentrok dengan SSH administrasi 22.
sudo make prod
# Ekuivalen:
sudo docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build --wait
```

Mahasiswa memakai `http://<IP_VPS>:8080` untuk web dan `nmap -sV -p 21,2222,23,25,3306,6379,8080,27017 <IP_VPS>` untuk scan. Tidak ada deployment VPS atau tunnel publik yang dijalankan otomatis oleh proyek ini. Ngrok HTTP hanya dapat mengekspos website; scan IP ngrok membaca edge ngrok, bukan semua layanan Docker.

## Materi

- [8 latihan Nmap](docs/01-nmap-exercises.md)
- [8 latihan Wireshark](docs/02-wireshark-exercises.md)
- [Kunci jawaban pengajar](docs/03-answer-key.md) — tidak disajikan web
- [Deploy VPS](docs/04-deploy-vps.md)
- [TokoKu, FTP, dan cara rebuild](docs/07-tokoku-ftp-praktikum.md)

Bagikan docs/01 dan docs/02 serta IP lab kepada mahasiswa. Kunci jawaban dapat disimpan terpisah oleh pengajar.

## Verifikasi dan reset

```bash
make test
# Tes protokol stdlib opsional; container harus sudah sehat:
python -m unittest discover -s tests -p test_protocols.py -v
make reset
```

`make test` memakai Nmap lokal; jika tidak tersedia, warning dan exit 1. Scan berhasil exit 0 tidak otomatis membuktikan semua port terbuka: lihat output. Script mendukung parameter target: `bash scripts/test-scan.sh <IP>` dan `SCAN_PORTS=21,2222,...` untuk VPS/custom port. Tes Python default menguji port lokal standar; jalankan dengan konfigurasi default.

`make reset` menghapus container/network/volume/image lokal **proyek ini saja**, termasuk tool capture. Source, PCAP, dan resource Docker proyek lain tetap ada; cache build bersama tidak dipangkas. Ini menyesuaikan permintaan reset agar tidak menggunakan `docker system prune` global.

## Troubleshooting

| Gejala | Tindakan |
| --- | --- |
| Docker API pipe LinuxEngine tidak ada | Jalankan Docker Desktop, pilih Linux containers, tunggu engine Ready; cek `docker info` |
| Port already allocated | Cek `Get-NetTCPConnection -State Listen` / `sudo ss -lntp`; ubah host port pada .env dan command scan |
| SSH 22 VPS bentrok | Pakai VPS_SSH_PORT=2222; jangan hentikan sshd administrasi |
| Permission denied pada port rendah | Compose sudah menyediakan sysctl unprivileged_port_start=0; prod menambah NET_BIND_SERVICE. Jika rootless host melarang host port <1024, gunakan host port 2121/2222/2323/2525 |
| Compose tidak mengenal !override | Perbarui Compose >=2.24.4; lokal tidak memerlukan tag ini |
| Nmap loopback raw scan bermasalah | Gunakan native Windows Nmap/Npcap terbaru dan `-sT -Pn -n`; SYN/-O membutuhkan admin |
| Filter HTTP kosong pada 8080 | Decode As → HTTP; mulai dengan tcp.port == 8080 |
| DNS/ICMP tidak terlihat di laptop | Capture di server/web namespace; request pemicu dari browser berbeda dengan trafik keluar container |
| Ping timeout / DNS 502 | Periksa konektivitas egress; beberapa provider memblokir ICMP. Capture bisa tetap menunjukkan request |
| Tampilan lama / tombol tidak berubah | Rebuild web-toko dan muat ulang Ctrl+Shift+R; CSS, JavaScript, dan foto semuanya lokal |
| FTP bisa login tetapi transfer gagal | Pakai passive/EPSV, periksa relay dan port 30000–30009; lihat docs/07 |
| Service tidak sehat | `docker compose logs --tail 80 <service>`; cek `docker compose ps` |

## Struktur folder

```text
nmap-fake-services-lab/
├── docker-compose.yml
├── docker-compose.prod.yml
├── docker-compose.capture.yml
├── docker-compose.desktop.yml
├── README.md
├── .env.example
├── .gitignore
├── Makefile
├── services/
│   ├── web-toko/
│   │   ├── Dockerfile
│   │   ├── .dockerignore
│   │   ├── package.json
│   │   ├── package-lock.json
│   │   ├── server.js
│   │   └── public/
│   │       ├── index.html
│   │       ├── login.html
│   │       ├── checkout.html
│   │       ├── cart.html
│   │       ├── product.html
│   │       ├── account.html
│   │       ├── orders.html
│   │       ├── assets/      # 4 foto JPEG lokal + credits.json
│   │       ├── lab.html
│   │       ├── style.css
│   │       └── app.js
│   ├── ftp-fake/       # Dockerfile + server.py + requirements.txt
│   ├── ssh-fake/       # Dockerfile + server.py
│   ├── smtp-fake/      # Dockerfile + server.py
│   ├── mysql-fake/     # Dockerfile + server.py
│   ├── redis-fake/     # Dockerfile + server.py
│   ├── telnet-fake/    # Dockerfile + server.py
│   └── mongodb-fake/   # Dockerfile + server.py
├── docs/
│   ├── 01-nmap-exercises.md
│   ├── 02-wireshark-exercises.md
│   ├── 03-answer-key.md
│   ├── 04-deploy-vps.md
│   ├── 05-desktop-online.md
│   ├── 06-naskah-pengajar.txt
│   └── 07-tokoku-ftp-praktikum.md
├── scripts/
│   ├── test-scan.sh
│   ├── start.sh
│   ├── reset.sh
│   ├── start-desktop.ps1
│   ├── start-desktop.sh
│   ├── start-ngrok.ps1
│   └── stop-desktop.ps1
├── tests/                 # protokol, gateway, DNS/relay dan capture desktop
├── tools/
│   ├── capture/Dockerfile
│   ├── desktop/           # Linux + Nmap + Wireshark + noVNC
│   ├── desktop-gateway/   # nginx + autentikasi kelas
│   └── target-proxy/      # satu IP target TCP + fixture DNS UDP
└── captures/.gitkeep
```

## Rujukan protokol

[Nmap version detection](https://nmap.org/book/man-version-detection.html), [SSH RFC 4253](https://datatracker.ietf.org/doc/html/rfc4253), [MySQL HandshakeV10](https://dev.mysql.com/doc/dev/mysql-server/latest/page_protocol_connection_phase_packets_protocol_handshake_v10.html), [MongoDB wire protocol](https://www.mongodb.com/docs/manual/reference/mongodb-wire-protocol/), [pyftpdlib](https://pyftpdlib.readthedocs.io/en/latest/tutorial.html), [kredit foto](services/web-toko/public/assets/credits.json).
