# Praktikum Wireshark: delapan latihan

Gunakan data dummy. Capture filter diisi **sebelum** Start; display filter diterapkan setelah capture. Pada Windows localhost pilih **Adapter for loopback traffic capture** dari Npcap. Pada VPS pilih NIC yang menerima trafik mahasiswa atau bridge Docker. Port HTTP lab adalah **8080**; jika Wireshark tidak otomatis mengenali HTTP: klik kanan paket → Decode As → TCP port 8080 → HTTP. `tcp.port == 8080` tetap dapat dipakai sebagai filter awal.

DNS dan ICMP tombol web berasal dari **server web-toko**. Capture di laptop mahasiswa hanya memperlihatkan HTTP request pemicunya, bukan trafik keluar server. Gunakan capture sisi server untuk latihan 6–7:

```bash
docker compose -f docker-compose.yml -f docker-compose.capture.yml --profile capture up -d --build capture-web
# Buka /lab.html dan klik trigger. Kemudian hentikan untuk memfinalkan PCAP:
docker compose -f docker-compose.yml -f docker-compose.capture.yml --profile capture stop capture-web
```

File: `captures/web-toko.pcap`, buka File → Open di Wireshark. Capture ini mencakup HTTP, seluruh UDP (termasuk DNS), TCP DNS, ICMP di namespace web; FTP/SMTP di namespace lain tidak masuk. Untuk FTP/SMTP lokal gunakan capture loopback Windows; VPS dapat memakai `sudo tcpdump -i any -s0 -w lab-host.pcap 'tcp port 21 or tcp port 25 or tcp port 8080 or tcp portrange 30000-30009'`. Rentang tambahan mencakup data FTP. Salin PCAP VPS ke laptop dengan `scp` memakai akun SSH administrasi host.

## 1. Banner FTP

- Capture filter: `tcp port 21`.
- Display filter: `tcp.port == 21` atau `ftp` setelah dissector mengenali port.
- Pemicu: `ncat --crlf <IP> 21`, kirim USER/PASS dummy.
- Expected: `220 (vsFTPd 3.0.3)`, 331, lalu 530 untuk anonymous/password salah atau 230 untuk akun FTP yang benar. Semuanya plaintext. Filter `ftp || ftp-data` untuk login sekaligus transfer; fallback `tcp.port == 21 || (tcp.port >= 30000 && tcp.port <= 30009)`. Lihat docs/07 untuk unggah/unduh.
- Diskusi: informasi apa terlihat sebelum autentikasi?

## 2. Dialog SMTP

- Capture filter: `tcp port 25`.
- Display filter: `smtp` atau `tcp.port == 25`.
- Pemicu: `ncat --crlf <IP> 25`, kirim `EHLO mahasiswa.local`, `QUIT`.
- Expected: hostname, PIPELINING, 8BITMIME, 221 Bye. Mail delivery ditolak.
- Diskusi: apa arti response multiline dengan tanda `-` lalu spasi?

## 3. Body login HTTP

- Capture filter: `tcp port 8080`.
- Display filter: `http.request.method == "POST"`.
- Pemicu: `/login.html` → Login simulasi, atau Trigger login demo di `/lab.html`.
- Expected: `POST /api/login`; body JSON berisi `mahasiswa-demo`, `belajar123`.
- Diskusi: apakah input HTML `type=password` mengenkripsi data jaringan?

## 4. Follow TCP Stream

- Capture filter: `tcp port 8080`.
- Display filter: `http.request.uri == "/api/login"`.
- Klik kanan POST login → Follow → TCP Stream. Jika body terpisah beberapa segmen, stream akan menyusunnya.
- Expected: header HTTP dan `"password":"belajar123"` dapat dibaca. Catat nomor `tcp.stream`.
- Diskusi: apa beda membaca paket tunggal dan stream? Ulangi pada checkout untuk melihat kartu dummy.

## 5. TCP three-way handshake

- Capture filter: `tcp port 21` (atau 8080).
- Display filter: `tcp.flags.syn == 1`; lalu `tcp.stream == N` untuk melihat ACK terakhir.
- Pemicu: koneksi ncat **baru** ke 21. Browser dapat memakai ulang keep-alive sehingga request berikutnya tidak memiliki handshake baru.
- Expected: SYN client → SYN,ACK server → ACK client, dilanjutkan banner/data.
- Diskusi: mengapa SYN scan `-sS` biasanya berakhir RST dan tidak menyelesaikan handshake?

## 6. DNS query

- Capture sisi web server. Capture filter: `udp port 53 or tcp port 53`.
- Display filter: `dns` atau `dns.qry.name == "example.com"`.
- Pemicu: Trigger DNS lookup.
- Expected: query A dan response alamat IPv4, atau kegagalan lookup jika resolver/egress tidak tersedia. DNS Docker menggunakan resolver 127.0.0.11 dan port internal dapat ditranslasikan: capture `any` paling jelas; pada sisi host tambahkan `udp` bila filter port 53 terlalu sempit.
- Diskusi: siapa client DNS—browser atau server web? Bagaimana cache DNS dapat memengaruhi capture?

## 7. ICMP echo

- Capture sisi web server. Capture filter: `icmp`.
- Display filter: `icmp.type == 8 || icmp.type == 0`.
- Pemicu: Trigger ICMP ping.
- Expected: dua echo request ke 8.8.8.8, mungkin echo reply. Error di UI tidak otomatis berarti request tidak dikirim: banyak jaringan/provider memblokir ICMP reply.
- Diskusi: apa beda ICMP dengan TCP? Mengapa ICMP tidak memiliki nomor port?

## 8. Bandingkan HTTP dan HTTPS

- HTTP lokal: capture filter `tcp port 8080`, display filter `http`.
- HTTPS jika sudah disediakan oleh pengajar: capture filter `tcp port 443`, display filter `tls`. Misalnya ngrok HTTP endpoint diarahkan ke port 8080 oleh pengajar.
- Expected: pada laptop client, HTTP menampilkan body; HTTPS memperlihatkan TLS record terenkripsi. Sisi server setelah terminasi TLS ngrok tetap bisa melihat HTTP internal.
- Diskusi: mengapa memakai ngrok HTTPS tidak menjadikan layanan FTP/MySQL/Redis dapat dipindai melalui satu URL? Apa beda enkripsi transport dan penyimpanan password aman?

## Bukti laporan

Kumpulkan PCAP contoh, screenshot banner, body login, urutan SYN/SYN-ACK/ACK, query DNS, echo ICMP, dan pembandingan HTTP/TLS. Catat interface dan titik capture pada setiap bukti. Hindari capture aktivitas pribadi di luar sesi lab.
