# TokoKu 2 — login, transaksi, Nmap, Wireshark, dan FTP

Panduan ini untuk pengajar dan mahasiswa. Naskah pengajar tetap di **docs/06-naskah-pengajar.txt**, di luar folder public website. Seluruh akun, alamat, dan transaksi adalah contoh praktikum.

## 1. Terapkan pembaruan di Windows

Buka Docker Desktop, pilih Linux containers, dan tunggu engine siap. Di PowerShell:

```powershell
Set-Location -LiteralPath 'D:\KULIAH TEKNIK INFORMATIKA\Semester 5\Ast PMJ\nmap-fake-services-lab'
powershell -ExecutionPolicy Bypass -File .\scripts\start-desktop.ps1
```

**Jangan gunakan -NoBuild untuk pembaruan ini.** Script membangun ulang image yang berubah, menjalankan stack dengan dua file Compose, dan menunggu healthcheck. FTP membutuhkan download dependensi kecil; foto sudah berada dalam source. Simpan .env yang sudah ada agar password desktop tetap sama.

Sesudah script selesai, buka [desktop lokal](http://127.0.0.1:6080/). Username/password gerbang tersedia di .runtime/akses-desktop.txt. Jika membagikan akses internet:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\start-ngrok.ps1
```

Gunakan tunnel menuju port **6080**. Jika tunnel yang sesuai sudah aktif, script memakainya kembali. ERR_NGROK_334 berarti domain masih digunakan tunnel lain: hentikan tunnel lama milikmu sebelum memulai yang baru. Tidak perlu memasukkan authtoken ke kolom login website/desktop.

Di browser desktop, buka **http://172.31.250.10:8080/**. Jika tampilan lama masih muncul, tekan Ctrl+Shift+R.

Bila hanya ingin toko/FTP lokal tanpa desktop:

```powershell
docker compose up -d --build --wait
```

Buka [toko lokal](http://127.0.0.1:8080/). Untuk mempertahankan mode desktop yang sudah dipakai, gunakan start-desktop.ps1; jangan berpindah-pindah overlay di tengah praktikum.

## 2. Tiga akun yang berbeda

| Akses | Username | Password |
| --- | --- | --- |
| Gerbang desktop lewat ngrok | Mengikuti .runtime/akses-desktop.txt | Mengikuti berkas tersebut |
| Website TokoKu | mahasiswa-demo | belajar123 |
| FTP latihan | mahasiswa | ftpbelajar123 |

Akun FTP mengikuti FTP_USER / FTP_PASSWORD bila pengajar mengubahnya di .env. Anonymous ditolak. Akun toko lain harus dibuat melalui tab **Daftar akun**, bukan langsung memakai username sembarang.

Satu link masih membuka **satu desktop bersama**. Bergantian mengendalikan layar. Akun toko berbeda memisahkan pesanan, tetapi browser desktop yang sama tetap berbagi sesi aktif. Keluar sebelum mahasiswa berikutnya login.

## 3. Coba semua alur toko

1. Cari produk, pilih kategori Audio/Workspace, dan urutkan harga.
2. Buka detail produk, pilih jumlah, lalu tambah ke keranjang.
3. Login memakai akun demo atau daftar username sendiri; password minimal 8 karakter.
4. Tekan ikon hati untuk menyimpan favorit. Buka Akun saya untuk melihat favorit dan mengubah nama/alamat contoh.
5. Di Keranjang, tambah/kurangi jumlah, hapus barang, atau kosongkan seluruhnya.
6. Checkout memakai COD simulasi atau kartu uji: **4111 1111 1111 1111**, expiry **12/30**, CVV **123**. Nomor kartu lain ditolak.
7. Buka Pesanan saya: lihat rincian penerima dan unduh bukti .txt.
8. Untuk pesanan **Diproses**, pilih Batalkan agar stok kembali; atau pilih **Simulasi: kirim pesanan** untuk menjadi Dikirim, kemudian **pesanan diterima** untuk menjadi Selesai.
9. Pesanan Dikirim/Selesai tidak dapat dibatalkan. Pembatalan tidak dapat mengembalikan stok dua kali.
10. Keluar dari akun, lalu login kembali untuk memeriksa data tersimpan.

Harga/total berasal dari server, bukan angka yang dikirim browser. Stok awal 100 per produk dan maksimal 10 per produk dalam satu keranjang. Fitur pengiriman adalah tombol simulasi; tidak ada transaksi bank/kurir sungguhan.

## 4. Wireshark: amati login dan checkout

Di **desktop Linux dalam browser**, jalankan:

```bash
wireshark &
```

Pilih interface yang menuju target (biasanya eth0), lalu Start capture. Buka Firefox desktop ke http://172.31.250.10:8080/ dan jalankan langkah toko di atas.

| Aktivitas | Display filter | Yang diamati |
| --- | --- | --- |
| Semua trafik target | ip.addr == 172.31.250.10 | Alamat dan port client/server |
| Permintaan HTTP | http.request | GET gambar/produk dan POST tindakan |
| Login | http.request.method == "POST" && http.request.uri == "/api/login" | Username/password contoh |
| Checkout | http.request.uri == "/api/checkout" | Data penerima, metode bayar, respons pesanan |
| Cookie sesi | http.cookie || http.set_cookie | Cookie dari login dan request berikutnya |
| Handshake | tcp.flags.syn == 1 | SYN serta SYN/ACK |
| Semua HTTP lab | tcp.port == 8080 | Fallback jika dissector HTTP belum aktif |

Klik paket login → klik kanan → Follow → TCP Stream. Password salah menghasilkan HTTP 401; password benar menghasilkan 200 dan Set-Cookie. Password di penyimpanan server berupa hash, tetapi **payload HTTP di kabel tetap plaintext**. Jangan memasukkan akun/alamat/kartu asli.

Jika filter http kosong, pilih paket TCP port 8080 → Decode As → HTTP. Simpan hasil capture di /home/student/lab-files dengan ekstensi .pcapng.

HTTPS ngrok melindungi koneksi laptop ke desktop. Trafik Firefox **di dalam desktop** menuju target menggunakan HTTP internal; Wireshark laptop mahasiswa tidak menangkap trafik internal itu secara otomatis.

## 5. Nmap: kenali layanan sebelum login

Jalankan dari terminal **desktop Linux**, bukan PowerShell laptop mahasiswa:

```bash
nmap -sT -Pn -n -sV -p 21,22,23,25,3306,6379,8080,27017 172.31.250.10
nmap -sT -Pn -n -sV -p 21 --script ftp-anon 172.31.250.10
nmap -sT -Pn -n -p 8080 --script http-title,http-headers 172.31.250.10
```

- -sT: TCP connect scan, cocok untuk user desktop tanpa sudo.
- -Pn: lewati host discovery.
- -n: jangan melakukan reverse DNS.
- -sV: kirim probe untuk mengidentifikasi layanan.
- -p: hanya port latihan yang ditentukan.
- ftp-anon: periksa akses anonymous, yang ditolak pada konfigurasi ini.

Port FTP open tidak berarti login anonymous diizinkan. Banner FTP sengaja tetap menyerupai vsftpd 3.0.3, sedangkan mesin transfer sebenarnya pyftpdlib. Enam protokol lain tetap simulasi; banner bukan bukti kerentanan yang benar-benar ada.

Pada desktop, proxy juga membuka **30000–30009** untuk data FTP. Full scan -p- dapat menemukan port tambahan tersebut; itu bukan sepuluh aplikasi bisnis baru. Scan hanya target lab yang disediakan, bukan IP/domain edge ngrok.

## 6. FTP: login, unduh, unggah, ganti nama, hapus

Command berikut untuk terminal **Linux dalam desktop**. Curl sudah tersedia. Mulai capture Wireshark sebelum menjalankannya.

```bash
# Lihat daftar file. --user mengirim akun FTP melalui USER/PASS.
curl --user mahasiswa:ftpbelajar123 ftp://172.31.250.10/

# Unduh file contoh; -o menentukan nama berkas lokal.
curl --user mahasiswa:ftpbelajar123 ftp://172.31.250.10/README.txt -o README-lab.txt
cat README-lab.txt

# Buat file dummy milik kelompok A.
cd /home/student/lab-files
printf 'Halo dari kelompok A\nIsi file ini untuk praktikum FTP.\n' > latihan-A.txt

# Unggah; -T membaca file lokal dan mengirim STOR.
curl --user mahasiswa:ftpbelajar123 -T latihan-A.txt ftp://172.31.250.10/uploads/latihan-A.txt

# Unduh kembali untuk membandingkan isi.
curl --user mahasiswa:ftpbelajar123 ftp://172.31.250.10/uploads/latihan-A.txt -o hasil-unduh-A.txt
diff latihan-A.txt hasil-unduh-A.txt

# Ganti nama file milik kelompok A.
curl --user mahasiswa:ftpbelajar123 --quote 'RNFR /uploads/latihan-A.txt' --quote 'RNTO /uploads/selesai-A.txt' ftp://172.31.250.10/uploads/

# Hapus file latihan milik kelompok A setelah bukti disimpan.
curl --user mahasiswa:ftpbelajar123 --quote 'DELE /uploads/selesai-A.txt' ftp://172.31.250.10/uploads/
```

Ganti akhiran A menjadi identitas kelompok. Akun FTP ini berbagi folder; jangan menghapus file kelompok lain. Maksimal 2 MiB per file dan 100 file. Folder dibuat oleh server; pembuatan subfolder, append/resume, active FTP, akses shell, dan penulisan di luar /uploads dinonaktifkan. File unggahan tidak menjadi kode website dan tidak dieksekusi.

Untuk mencoba dari **PowerShell pengajar**, gunakan curl.exe dan host 127.0.0.1:

```powershell
curl.exe --user mahasiswa:ftpbelajar123 ftp://127.0.0.1/
'Salam dari PowerShell' | Set-Content -LiteralPath .\latihan-windows.txt
curl.exe --user mahasiswa:ftpbelajar123 -T .\latihan-windows.txt ftp://127.0.0.1/uploads/latihan-windows.txt
```

Jika memakai FileZilla, pengaturannya: protocol FTP, host 172.31.250.10 dari desktop atau 127.0.0.1 dari Windows pengajar, port 21, logon Normal, akun di tabel, **plain FTP**, transfer **Passive**. Plain FTP sengaja digunakan untuk latihan payload. SFTP berbeda protokol; SSH dummy lab tidak menyediakan transfer file.

Filter Wireshark:

```text
ftp || ftp-data
ftp.request.command == "USER" || ftp.request.command == "PASS"
tcp.port == 21 || (tcp.port >= 30000 && tcp.port <= 30009)
```

Amati kode 220 (banner), 331 (password diminta), 230 (login sukses), 530 (gagal), PASV/EPSV (port data), LIST/NLST (daftar), RETR (unduh), STOR (unggah), RNFR/RNTO (ganti nama), DELE (hapus), dan 226 (transfer selesai). Untuk membaca isi file, ikuti TCP stream **koneksi data**, bukan hanya port 21.

## 7. Materi yang diberikan ke mahasiswa

Berikan link ngrok, akun gerbang desktop dari pengajar, akun toko/FTP contoh, IP target, serta panduan ini. Lima tugas dengan bukti:

1. Bandingkan hasil scan FTP open dengan anonymous login gagal. Mengapa keduanya tidak bertentangan?
2. Bandingkan paket login toko salah dan benar: method, URL, kode HTTP, dan cookie.
3. Checkout dua headphone. Temukan total 698.000 dari respons, lalu jelaskan mengapa harga harus dihitung server.
4. Unggah lalu unduh file TXT. Tunjukkan control connection dan data connection FTP serta buktikan isinya sama.
5. Batalkan pesanan berstatus Diproses, amati stok kembali, lalu jelaskan perbedaan autentikasi, hak akses, dan enkripsi.

Kumpulkan hasil Nmap, file .pcapng, screenshot paket, dan jawaban singkat. Simpan naskah/kunci jawaban pengajar secara terpisah.

## 8. Penyimpanan dan kendala

- Volume web-data: akun, password hash, profil, favorit, keranjang, stok, pesanan.
- Volume ftp-data: README/katalog contoh dan file /uploads.
- Volume desktop-files: hasil praktikum mahasiswa.
- Rebuild biasa dan docker compose down tanpa -v mempertahankan volume. Reset proyek atau down -v menghapus data volume. Jangan dipakai untuk sekadar memperbarui tampilan.
- Cookie login habis setelah 8 jam atau restart server. Login ulang; data akun tetap ada.
- Foto JPEG lokal memiliki kredit di services/web-toko/public/assets/credits.json.
- FTP 530: periksa akun .env; jangan memakai username toko atau password gerbang desktop.
- FTP login sukses, transfer gagal: gunakan passive/EPSV; periksa port data 30000–30009 dan rebuild lab-target bersama ftp-fake. Jalankan transfer bergantian bila port pasif sedang penuh.
- FTP 550: pastikan tujuan /uploads/nama-file.txt, tidak menulis README/katalog, dan kapasitas folder belum penuh.
- File >2 MiB: transfer dibatalkan dan file parsial dibersihkan.
- Error dependency: jalankan perintah log berikut sendiri, menggunakan kedua file Compose.

```powershell
docker compose -f docker-compose.yml -f docker-compose.desktop.yml --profile desktop ps
docker compose -f docker-compose.yml -f docker-compose.desktop.yml --profile desktop logs --tail 80 web-toko ftp-fake lab-target lab-desktop desktop-gateway
```

## 9. Verifikasi perubahan

Pada 11 Oktober 2026, pengujian lokal terisolasi lulus: 13 skenario API toko, 8 interaksi DOM dengan request tiruan, dan 6 skenario FTP dengan transfer nyata ke server uji sementara. Konfigurasi Compose dasar, desktop, dan prod juga tervalidasi. Pengujian ini tidak menjalankan Docker/ngrok, tidak memindai target lab, dan tidak menguji tampilan secara visual dalam browser. Pengajar tetap perlu rebuild dan memeriksa stack aktual.

Untuk pengembang, dari root proyek:

```powershell
npm.cmd ci --prefix services/web-toko --ignore-scripts
node --test tests/web.test.js
npm.cmd install --prefix .runtime/ui-tests --ignore-scripts jsdom@26.1.0
$env:NODE_PATH = (Resolve-Path .runtime/ui-tests/node_modules).Path
node --test tests/ui.test.js
python -m pip install --target .runtime/python-deps -r services/ftp-fake/requirements.txt
$env:PYTHONPATH = (Resolve-Path .runtime/python-deps).Path
python -m unittest discover -s tests -p test_ftp_sandbox.py -v
```

Tes integrasi lama (test_protocols.py, test_desktop_*.py) memerlukan stack yang **sudah** dijalankan pengajar. Arsip Nmap/PCAP tanggal 7–8 Oktober adalah baseline lama, bukan hasil scan FTP baru.

Rujukan: command transfer/quote mengikuti [manual curl](https://curl.se/docs/manpage.html); anonymous enumeration mengikuti [Nmap ftp-anon](https://nmap.org/nsedoc/scripts/ftp-anon.html); field filter mengikuti [Wireshark FTP](https://www.wireshark.org/docs/dfref/f/ftp.html). Implementasi FTP mengikuti [pyftpdlib](https://pyftpdlib.readthedocs.io/en/latest/tutorial.html).

