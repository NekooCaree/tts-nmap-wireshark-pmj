# Praktikum Nmap: delapan latihan

Target hanya IP lab yang diberikan pengajar. `<IP>` adalah placeholder: ganti dengan `127.0.0.1` untuk lokal atau IP VPS milik kelas. VPS memakai SSH dummy `2222` secara default; ganti port `22` menjadi `2222` dalam latihan 2 dan 5. Hak admin/root diperlukan untuk SYN scan dan OS detection. Pada Windows gunakan Nmap + Npcap, jalankan PowerShell sebagai Administrator; bila loopback raw scan bermasalah gunakan `-sT`.

## 1. Pemetaan port TCP

```bash
sudo nmap -sS -p 1-10000 <IP>
# Discovery host terpisah (hanya target lab):
nmap -sn <IP>
```

Expected: `Host is up`; port 21, 22, 23, 25, 3306, 6379, 8080 terbuka untuk lokal. Port 27017 tidak termasuk rentang scan ini. Nama pada kolom SERVICE tanpa `-sV` umumnya berasal dari tabel nomor port.

Diskusi: Mengapa `-sS -p 1-10000` merupakan port scan, bukan hanya host discovery? Mengapa MongoDB tidak muncul?

## 2. Fingerprint semua layanan

```bash
nmap -sV -p 21,22,23,25,3306,6379,8080,27017 <IP>
# VPS default:
nmap -sV -p 21,2222,23,25,3306,6379,8080,27017 <IP>
```

Expected: FTP vsftpd 3.0.3, SSH OpenSSH 8.2p1, SMTP Postfix, MySQL 5.7.38-log, Redis 6.2.6, HTTP, Telnet, MongoDB. HTTP bisa dikenali sebagai `http` tanpa nama produk TokoKu; header custom tidak otomatis terdapat dalam database fingerprint Nmap. Versi/tulisan Telnet dan MongoDB bergantung versi Nmap/probe yang dipakai.

Diskusi: Apakah banner sebuah layanan membuktikan perangkat lunak itu benar-benar terpasang? Apa beda `-sV` dengan scan biasa?

## 3. Aggressive scan pada web

```bash
sudo nmap -A -p 8080 <IP>
```

Expected: HTTP title `TokoKu — Teknologi untuk keseharian`, beberapa hasil NSE, kemungkinan informasi OS/traceroute. Opsi `-A` mengaktifkan version detection, OS detection, script default, dan traceroute. Hanya satu port terbuka tidak menjamin OS terdeteksi.

Diskusi: Informasi tambahan apa yang didapat? Mengapa script default dapat membuat banyak request?

## 4. OS detection

```bash
sudo nmap -O <IP>
```

Expected: tebakan OS atau pesan tidak ada kecocokan. Hasil mengukur TCP/IP stack host, kernel Docker/VM, NAT, dan firewall; bukan teks `Ubuntu` pada banner dummy. Pada Windows Docker Desktop hasil bisa berbeda dengan Linux VPS.

Diskusi: Mengapa banner Ubuntu pada Telnet tidak memastikan OS target Ubuntu 20.04?

## 5. Banner NSE

```bash
nmap --script banner -p 21,22,25 <IP>
```

Expected: `220 (vsFTPd 3.0.3)`, `SSH-2.0-OpenSSH_8.2p1 Ubuntu-4ubuntu0.5`, `220 mail.tokoku-lab.local ESMTP Postfix`.

Diskusi: Mana protokol yang mengirim data sebelum client mengirim request? Mengapa Redis memerlukan PING/INFO dahulu?

## 6. HTTP headers dan title

```bash
nmap --script http-headers,http-title -p 8080 <IP>
```

Expected: `Server: TokoKu/1.0 (EduLab)` dan judul halaman TokoKu. `X-Powered-By` dinonaktifkan.

Diskusi: Apa yang dapat dipalsukan melalui header Server? Apakah header merupakan bukti versi web framework?

## 7. FTP anonymous

```bash
nmap --script ftp-anon -p 21 <IP>
```

Expected: anonymous login ditolak (kode `530`; teks respons dapat berbeda). Script bisa tidak menampilkan blok output ketika autentikasi ditolak; port tetap terbuka. Akun FTP `mahasiswa / ftpbelajar123` dapat login untuk transfer file; lihat docs/07-tokoku-ftp-praktikum.md.

Diskusi: Mengapa port terbuka tidak sama dengan akses file berhasil? Apa beda status 331 dan 530?

## 8. Banner grabbing manual

```bash
nc <IP> 21
# ketik: USER anonymous, PASS demo@example.com, QUIT
nc <IP> 25
# ketik: EHLO mahasiswa.local, QUIT
```

Gunakan `ncat`/`ncat.exe` bawaan installer Nmap jika `nc` tidak ada. Untuk CRLF konsisten: `ncat --crlf <IP> 21`. Di PowerShell: `ncat.exe --crlf <IP> 25`.

Expected FTP untuk anonymous/password salah: banner 220 → USER mendapat 331 → PASS mendapat 530. Untuk akun latihan yang benar, PASS mendapat 230. SMTP: banner 220 → EHLO mendapat tiga baris 250 → QUIT mendapat 221.

Diskusi: Mengapa nomor balasan berbeda walaupun koneksi sama-sama TCP?

## Bukti laporan

Kumpulkan command, output port/state/service/version, satu dialog manual, dan penjelasan OS vs banner. Simpan hasil dengan `nmap -sV -p 21,22,23,25,3306,6379,8080,27017 -oA captures/hasil-lab <IP>`. Tidak ada eksploitasi atau brute force pada latihan ini.
