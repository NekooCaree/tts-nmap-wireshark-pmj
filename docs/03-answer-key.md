# Kunci jawaban pengajar

Materi ini disimpan sebagai Markdown, tidak disajikan oleh Express. Output di bawah merupakan contoh teks; output scan aktual pengajar dapat berbeda karena versi Nmap, OS host, NAT, dan firewall. Dummy banner bukan bukti software yang terpasang.

Pembaruan 11 Oktober: FTP menerima akun latihan `mahasiswa / ftpbelajar123` dengan kode 230; contoh 530 di bawah berlaku untuk anonymous/password salah. LIST/RETR/STOR memakai koneksi data pasif 30000–30009. Website mempunyai sesi login dan pesanan tersimpan. Jawaban praktikum toko/FTP terbaru dijelaskan dalam docs/07; naskah mengajar tetap terpisah dari public web.

## Nmap

1. **Pemetaan port**: `-sS` mengirim SYN; SYN-ACK menunjukkan open, RST menunjukkan closed, tidak ada jawaban atau beberapa ICMP error dapat menunjukkan filtered. Rentang 1–10000 melewatkan 27017. `-sn` adalah host discovery tanpa port scan. Tanpa `-sV`, kolom SERVICE umumnya lookup nomor port.
2. **Version scan**: delapan port terbuka. Banner/probe menyebut vsftpd, OpenSSH, Postfix, MySQL, Redis, HTTP, Telnet, MongoDB. FTP/SSH/SMTP/MySQL mengirim data awal; Redis/MongoDB biasanya menunggu request. Nmap menggunakan pola response. Ini lab yang sengaja membuktikan pola tersebut bisa ditiru.
3. **Aggressive**: `-A` mencakup `-sV`, OS detection, script default, traceroute. Bisa menemukan title TokoKu dan header. OS/traceroute tidak selalu tersedia. Banyak request `/`, robots.txt, dan sebagainya berasal dari probe, bukan kunjungan manusia.
4. **OS detection**: fingerprint TCP/IP stack berasal dari host/kernel/VM, dipengaruhi NAT dan firewall. Docker Python tidak berubah menjadi Ubuntu 20.04 hanya karena banner Telnet menyebutnya. Ketiadaan port closed yang diketahui dapat menurunkan akurasi.
5. **Banner**: 220 vsFTPd, identifikasi SSH, 220 ESMTP Postfix. Informasi ini bisa dibaca tanpa login. Redis INFO mengembalikan versi setelah command.
6. **HTTP**: header `Server: TokoKu/1.0 (EduLab)`, title TokoKu. Header dapat diubah aplikasi, bukan bukti Apache/nginx/Express terpasang. `X-Powered-By` tidak dikirim. Label Nmap http-proxy pada 8080 tidak berarti aplikasi menyediakan proxy.
7. **FTP anonymous**: gagal; 331 meminta password, 530 menolak login. `ftp-anon` mungkin tidak mencetak hasil ketika ditolak. Open hanya berarti TCP listener, bukan izin akses.
8. **Manual grabbing**: FTP 220/331/530/221, SMTP 220/250/221. TCP membawa byte; arti status berada pada protokol aplikasi masing-masing. SMTP response multiline memakai `250-` hingga baris final `250 `.

### Output scan yang telah diuji

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

Banner web custom dapat memunculkan blok fingerprint submission Nmap; itu keterbatasan database fingerprint, bukan error socket. Banner MySQL mempunyai length LE 3-byte + sequence 0 + protocol 10; SSH punya message 20 KEXINIT, tetapi tidak menyelesaikan pertukaran kunci. MongoDB merespons OP_QUERY dengan OP_REPLY dan OP_MSG dengan OP_MSG BSON; tidak mengimplementasikan database.

### Dialog FTP

```text
S: 220 (vsFTPd 3.0.3)
C: USER anonymous
S: 331 Please specify the password.
C: PASS demo@example.com
S: 530 Login incorrect.
C: QUIT
S: 221 Goodbye.
```

### Dialog SMTP

```text
S: 220 mail.tokoku-lab.local ESMTP Postfix
C: EHLO mahasiswa.local
S: 250-mail.tokoku-lab.local
S: 250-PIPELINING
S: 250 8BITMIME
C: QUIT
S: 221 Bye
```

## Wireshark

1. **FTP plaintext**: byte ASCII banner terlihat pada payload. Pasangan alamat/port mengidentifikasi client/server. USER/PASS contoh dapat terlihat meskipun login ditolak.
2. **SMTP**: EHLO dan kemampuan PIPELINING/8BITMIME plaintext. Tidak ada STARTTLS/relay/email nyata. Capture tidak menunjukkan pengiriman email karena MAIL/RCPT/DATA ditolak.
3. **Login**: body JSON menyertakan password. `type=password` hanya menyamarkan karakter di UI; tidak mengenkripsi HTTP.
4. **Stream**: Wireshark menyusun segmen TCP dua arah. HTTP keep-alive dapat menaruh lebih dari satu request dalam stream. Pilih request yang benar dan lihat arah/URI. Checkout menggunakan kartu dummy; membaca data uji bukan transaksi keuangan.
5. **Handshake**: client SYN dengan sequence X; server SYN-ACK dengan ack X+1 dan sequence Y; client ACK dengan ack Y+1. Flag ACK dapat muncul pada paket data berikutnya. SYN scan sering mengakhiri SYN-ACK dengan RST.
6. **DNS**: browser memanggil HTTP endpoint; container menjalankan DNS ke resolver. Tipe A meminta IPv4. Resolver Docker dapat mengubah port internal; gunakan capture UDP pada namespace web. DNS cache/egress dapat mengubah jumlah paket; alamat example.com berubah, jangan menilai angka IP tertentu sebagai jawaban wajib.
7. **ICMP**: echo request type 8 dan reply type 0, cocokkan identifier/sequence. ICMP tidak memakai port TCP/UDP. Jaringan bisa memblokir reply; request terlihat tetap merupakan bukti trigger.
8. **HTTPS**: TLS mengenkripsi payload pada link browser–terminator. Capture laptop peserta tidak membaca body plaintext tanpa material dekripsi. Sisi internal setelah terminasi TLS masih HTTP. Mengirim data melalui HTTPS tidak otomatis menjadikan penyimpanan/log data aman.

### Login stream contoh

```text
POST /api/login HTTP/1.1
Content-Type: application/json
...
{"username":"mahasiswa-demo","password":"belajar123"}
```

### Checkout body contoh

```json
{"fullname":"Mahasiswa Contoh","address":"Jl. Praktikum No. 1","card_number":"4111 1111 1111 1111","expiry":"12/30","cvv":"123","items":[{"id":"headphone","quantity":1}]}
```

### TCP / DNS / ICMP contoh

```text
Client:ephemeral -> Server:8080  SYN
Server:8080 -> Client:ephemeral  SYN, ACK
Client:ephemeral -> Server:8080  ACK
DNS Standard query     A example.com
DNS Standard response  A <IPv4 yang berubah>
ICMP Echo request  id=... seq=1
ICMP Echo reply    id=... seq=1
```

## Penilaian laporan yang disarankan (100)

| Bukti/penjelasan | Poin |
| --- | --- |
| Delapan port/state/version dan batas banner palsu | 25 |
| Banner FTP/SMTP serta hasil NSE | 15 |
| Login/checkout HTTP dan Follow TCP Stream | 20 |
| Handshake TCP | 10 |
| DNS dan ICMP, termasuk titik capture | 20 |
| HTTP vs HTTPS dan etika target berizin | 10 |

Terima penjelasan yang benar atas hasil OS tidak pasti atau ICMP terblokir. Jangan memaksa mahasiswa menuliskan hasil “berhasil” bila bukti berbeda. Tidak ada penilaian otomatis di website pada versi proyek ini.
