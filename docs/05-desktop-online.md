# Desktop praktikum online

## Alur pengajar

### 1. Siapkan komputer pengajar

Buka Docker Desktop dari Start Menu. Tunggu engine siap dan gunakan Linux containers. Docker menjalankan seluruh lab di komputer pengajar; mahasiswa cukup membuka link dari browser di laptop/PC. Sediakan koneksi internet dan sekitar 2–3 GB RAM kosong. Biarkan komputer tetap hidup selama kelas.

Buka **PowerShell Windows** dan pindah ke folder proyek. Lokasi pada komputer pengajar saat panduan ini dibuat:

```powershell
cd 'D:\KULIAH TEKNIK INFORMATIKA\Semester 5\Ast PMJ\nmap-fake-services-lab'
docker info --format '{{.OSType}}'
```

Hasil command kedua harus `linux`. Jika muncul error `dockerDesktopLinuxEngine` / named pipe tidak ditemukan, engine belum bisa dihubungi. Buka atau restart Docker Desktop, tunggu siap, lalu ulangi berikcommand tersebut. Jalankan tahap berikut setelah hasilnya `linux`.

### 2. Jalankan desktop lab

Pada PowerShell yang sama:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\start-desktop.ps1
docker compose -f docker-compose.yml -f docker-compose.desktop.yml --profile desktop ps
```

Build awal mengunduh paket desktop; tunggu hingga script selesai tanpa error. Pada run berikutnya Docker dapat memakai cache. Daftar service harus menunjukkan status healthy, termasuk `lab-target`, `lab-desktop`, dan `desktop-gateway`.

Buka `http://127.0.0.1:6080` di Chrome/Edge pengajar. Untuk melihat login kelas:

```powershell
Get-Content .\.runtime\akses-desktop.txt
```

Username default `praktikum`; password dibuat script dan tersimpan lokal. Isi dialog Sign in lalu klik **Buka desktop**. Terminal Linux tersedia di layar desktop. File akses ini bukan authtoken ngrok.

### 3. Buat link internet

Setelah akses desktop lokal siap, jalankan pada PowerShell Windows:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\start-ngrok.ps1
```

Script memakai authtoken ngrok yang sudah disimpan pada `%LOCALAPPDATA%\ngrok\ngrok.yml`; tidak perlu memasukkan token lagi. Script mencetak `Link mahasiswa: https://...`. Gunakan URL yang dicetak pada run tersebut. Tunnel mengarah ke **127.0.0.1:6080** untuk desktop.

Script menjalankan ngrok di background. Jangan menjalankan command ngrok tambahan untuk domain yang sama. Jika tunnel proyek yang sama sudah aktif, script memakai URL tersebut kembali. URL terakhir juga dapat dilihat dengan:

```powershell
Get-Content .\.runtime\link-mahasiswa.txt
```

File ini menyimpan URL terakhir, bukan pemeriksaan apakah tunnel sedang online. Link hanya berfungsi selama gateway, ngrok, komputer pengajar, dan internet berjalan.

### 4. Bagikan akses kepada mahasiswa

Bagikan URL HTTPS yang dicetak serta username/password kelas dari `.runtime/akses-desktop.txt`. **Jangan bagikan authtoken akun ngrok**. Mahasiswa membuka link di browser, memilih Visit Site jika ada pemberitahuan ngrok, mengisi dialog Sign in, lalu memilih **Buka desktop**.

Desktop ini **satu layar dengan mouse dan keyboard bersama**. Pilih satu operator atau bergantian per kelompok; peserta lain dapat mengamati. Belum ada sesi desktop independen untuk setiap mahasiswa. Nmap dan Wireshark berjalan di desktop lab. Semua command Linux pada bagian praktikum di bawah diketik di terminal **di dalam desktop browser**; command pengelolaan Docker/ngrok tetap di PowerShell Windows pengajar.

Pada Linux: `bash scripts/start-desktop.sh`, lalu `ngrok http http://127.0.0.1:6080`. Nmap/Wireshark sudah terpasang di image, bukan di laptop mahasiswa. Build pertama perlu internet untuk paket. Menjalankan desktop berikutnya bisa memakai `start-desktop.ps1 -NoBuild`.

## Yang diberikan kepada mahasiswa

Bagikan link desktop dan login kelas, lalu teks berikut:

> Buka link, masuk dengan akun kelas, dan pilih Buka desktop. Di terminal desktop jalankan Nmap ke 172.31.250.10. Untuk capture, buka Wireshark dari menu klik kanan, pilih eth0, dan mulai capture sebelum membuat trafik. Simpan hasil di /home/student/lab-files/NAMA-KELOMPOK. Gunakan data dummy dan scan hanya target lab yang ditentukan. Kita memakai desktop bersama, jadi bergantian mengendalikan mouse dan keyboard.

## Praktikum 1: delapan port dan versi layanan

Jalankan **di terminal desktop**:

```bash
mkdir -p ~/lab-files/kelompok-1
nmap -sT -Pn -n -sV -p 21,22,23,25,3306,6379,8080,27017 172.31.250.10 -oA ~/lab-files/kelompok-1/hasil-nmap
```

`-sT` memakai TCP connect sehingga tidak membutuhkan root. `-Pn` melewati host discovery dan `-n` menghindari reverse DNS. `-sV` mengirim probe untuk mengenali protokol/versi. Banner honeypot adalah data latihan; tidak membuktikan aplikasi asli atau OS sebenarnya. Label HTTP di 8080 bisa berbeda menurut database Nmap.

Lanjutkan enumerasi yang sesuai:

```bash
nmap -sT -Pn -n -p 21,22,23,25 --script banner 172.31.250.10
nmap -sT -Pn -n -p 8080 --script http-title,http-headers 172.31.250.10
nmap -sT -Pn -n -p 21 --script ftp-anon 172.31.250.10
nmap -sT -Pn -n -p 6379 --script redis-info 172.31.250.10
nmap -sT -Pn -n -p 27017 --script mongodb-info 172.31.250.10
```

NSE `banner` memakai koneksi awal; server yang menunggu request, misalnya MongoDB, tidak otomatis mengirim banner teks. Login database/SSH tetap ditolak. FTP menerima akun `mahasiswa / ftpbelajar123` untuk transfer file latihan, sedangkan anonymous ditolak. Lihat docs/07-tokoku-ftp-praktikum.md. Mahasiswa tidak mendapatkan shell atau database sungguhan.

## Praktikum 2: capture scan

1. Ketik `wireshark &` di terminal, atau klik kanan area kosong desktop → Wireshark.
2. Klik dua kali interface **eth0** untuk memulai capture.
3. Ulangi command Nmap di terminal.
4. Hentikan capture, gunakan display filter:

```text
ip.addr == 172.31.250.10
tcp.flags.syn == 1 && tcp.flags.ack == 0
tcp.flags.syn == 1 && tcp.flags.ack == 1
tcp.port == 21
```

Amati SYN → SYN/ACK → ACK dari scan `-sT`, lalu paket probe dan jawaban layanan. Klik paket FTP → Follow → TCP Stream untuk melihat banner.

## Praktikum 3: HTTP plaintext

Dengan capture eth0 masih berjalan, buka browser **di dalam desktop**:

```bash
firefox-esr http://172.31.250.10:8080 &
```

Buka Login, isi `mahasiswa-demo` dan `belajar123`, lalu kirim. Filter `http` atau `http.request.method == "POST"`. Klik paket `/api/login` → Follow → TCP Stream untuk melihat JSON username/password dummy. Jika port 8080 belum dikenali sebagai HTTP, gunakan Analyze → Decode As → HTTP untuk TCP port 8080.

Opsional checkout: pilih produk, isi nama/alamat contoh, kartu `4111 1111 1111 1111`, expiry `12/30`, CVV `123`. Paket `/api/checkout` berisi data uji yang dikirim ke server. Tidak ada pembayaran nyata.

Link ngrok HTTPS melindungi akses remote desktop. Di jaringan latihan, browser desktop → TokoKu sengaja memakai HTTP. Wireshark desktop menangkap HTTP internal ini; Wireshark di laptop mahasiswa hanya akan melihat trafik HTTPS menuju ngrok, bukan plaintext HTTP internal.

## Praktikum 4: ICMP dan DNS pada eth0

Jalankan di terminal desktop sambil capture:

```bash
ping -c 3 172.31.250.10
dig @172.31.250.10 tokoku.lab
```

Filter `icmp`: amati echo request type 8 dan echo reply type 0. Filter `dns`: amati query A tokoku.lab dan jawaban 172.31.250.10. DNS ini hanya fixture lokal untuk dua nama, tanpa forwarding/rekursi internet. DNS/ICMP dari tombol website dibangkitkan di container **server web**, sehingga perlu capture server sesuai `02-wireshark-exercises.md`; bukan capture eth0 desktop.

## Lima soal untuk laporan

1. Daftarkan delapan port TCP terbuka, nama protokol, dan versi hasil `-sV`. Mengapa banner tidak membuktikan versi software yang sebenarnya?
2. Tunjukkan tiga paket TCP handshake untuk satu port. Apa flag dan nomor sequence/acknowledgment-nya? Mengapa scan `-sT` menyelesaikan handshake?
3. Temukan banner FTP serta jawaban saat login anonymous. Apakah server mengizinkan login? Lampirkan stream sebagai bukti.
4. Temukan username/password dummy pada POST login. Mengapa bisa terbaca di capture desktop walaupun link masuk lab memakai HTTPS?
5. Tunjukkan pasangan DNS query/response dan ICMP request/reply. Tuliskan transaction ID DNS, alamat jawabannya, serta type ICMP.

Kumpulkan hasil `.nmap`/`.xml`, satu `.pcapng`, dan laporan jawaban. Ini soal laporan; tidak ada penilaian otomatis tambahan di mode desktop.

## Simpan dan ambil hasil

Gunakan File → Save As di Wireshark dan pilih `/home/student/lab-files/kelompok-1/latihan.pcapng`. Volume tetap ada setelah desktop dihentikan. Pengajar menyalin hasil ke folder lokal:

```powershell
New-Item -ItemType Directory -Path .\hasil-kelas -Force
docker cp nmap-fake-services-lab-lab-desktop-1:/home/student/lab-files/. .\hasil-kelas
```

File `PETUNJUK.txt` diperbarui setiap start; nama file hasil lain tidak ditimpa. Semua peserta desktop bersama bisa melihat file dalam volume tersebut. Jangan simpan data pribadi. Export hasil sebelum menjalankan reset; reset menghapus volume.

## Berhenti dan pemecahan masalah

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\stop-desktop.ps1
docker compose -f docker-compose.yml -f docker-compose.desktop.yml --profile desktop ps
docker compose -f docker-compose.yml -f docker-compose.desktop.yml --profile desktop logs --tail 60 lab-desktop desktop-gateway lab-target
```

- `dockerDesktopLinuxEngine` tidak ditemukan: jalankan Docker Desktop dan tunggu Linux engine siap.
- `ERR_NGROK_334`: endpoint domain yang sama masih aktif di proses/mesin lain. Hentikan tunnel lama, lalu jalankan script ngrok lagi. Pooling membagi koneksi dan tidak membuat sesi desktop mahasiswa terpisah.
- Dialog username/password: masukkan login kelas di `.runtime/akses-desktop.txt`; authtoken ngrok tidak dipakai untuk login desktop.
- noVNC terputus: periksa Docker dan ngrok masih hidup, reload link, kemudian Connect. Koneksi membutuhkan WebSocket.
- Desktop langsung exited (1), log `Server is already active for display 1`: file lock X11 tertinggal setelah container berhenti mendadak. Overlay desktop sekarang memakai `/tmp` sementara (tmpfs), sehingga lock/socket lama hilang saat restart. Terapkan overlay terbaru dengan `powershell -ExecutionPolicy Bypass -File .\scripts\start-desktop.ps1 -NoBuild`; hasil di volume lab-files tetap tersimpan. Folder `/tmp` hanya untuk file sementara, jangan digunakan untuk menyimpan hasil praktikum.
- Wireshark tidak mempunyai interface: periksa `docker compose -f docker-compose.yml -f docker-compose.desktop.yml exec lab-desktop dumpcap -D`. Desktop memakai non-root dumpcap dengan file capabilities; jangan menambahkan no-new-privileges pada desktop karena akan memblokir mekanisme itu.
- Image gagal dibuat: build awal mengunduh paket Debian (~300 MB), pastikan koneksi internet dan ruang disk. Sediakan sekitar 2–3 GB RAM kosong, hindari banyak tab Firefox.
- Subnet bertabrakan: ganti subnet dan IP statis secara konsisten dalam compose, menu desktop, welcome, Firefox, DNS fixture, dan panduan. Jangan asal memakai IP target berbeda tanpa memperbarui konfigurasi.

## Bukti pengujian lokal

Pada 7 Oktober 2026, Nmap 7.93 di desktop mengenali delapan port beserta banner FTP, SSH, Telnet, SMTP, MySQL, Redis, HTTP TokoKu, dan MongoDB. Sebanyak 17 pengujian protokol lulus melalui target desktop; enam pengujian DNS dan integritas relay juga lulus. Empat pengujian gateway memeriksa penolakan akses tanpa/salah password, halaman berpassword, serta WebSocket hingga handshake RFB dan ukuran desktop. Pengujian gateway yang sama berhasil melalui URL HTTPS ngrok.

Capture sebagai user student berhasil membaca eth0. Berkas contoh `captures/desktop-target.pcapng` hanya menyertakan trafik target lab, dengan SYN/SYN-ACK, HTTP login dummy, dua pasangan ICMP echo, dan DNS query/answer. `captures/nmap-desktop.nmap`/`.xml` merupakan hasil scan desktop asli. Ini bukti protokol dan capture; pemeriksaan visual browser otomatis belum selesai karena browser otomatis tidak dapat melewati dialog Basic Auth. Buka link melalui browser biasa dan login menggunakan akun kelas.

Untuk mengulang pemeriksaan gateway di host setelah start desktop (Python 3 diperlukan):

```powershell
python tests/test_desktop_gateway.py
# Opsional: pemeriksaan melalui URL HTTPS ngrok yang aktif.
$env:DESKTOP_TEST_URL = 'https://DOMAIN-NGROK-KELAS'
python tests/test_desktop_gateway.py
Remove-Item Env:DESKTOP_TEST_URL
```

Tes jaringan dijalankan di container desktop dengan menyalin `tests/test_protocols.py` dan `tests/test_desktop_network.py` ke `/tmp`, lalu menjalankannya memakai Python 3. Untuk tes protokol set `LAB_TEST_HOST=172.31.250.10`. `tests/verify_desktop_capture.py` membuat capture berisi trafik dummy; script tersebut ditujukan ke container desktop yang telah berjalan.

Saat desktop sedang bebas, `python tests/verify_desktop_restart.py --allow-restart` menguji restart setelah SIGKILL dan penghentian normal pada container yang sama. Tes memastikan desktop kembali healthy, file sementara hilang, dan file hasil praktikum tetap tersimpan. Jangan jalankan tes restart selama mahasiswa melakukan capture.

Pada 8 Oktober 2026, masalah restart akibat `/tmp/.X1-lock` diperbaiki dengan tmpfs `/tmp`, init process untuk child process, dan waktu shutdown 20 detik. Dua skenario restart pada container yang sama lulus; file hasil di volume tetap ada, `start-desktop.ps1 -NoBuild` selesai tanpa error, dan pemeriksaan gateway lokal kembali lulus. Mekanisme [tmpfs Docker](https://docs.docker.com/engine/storage/tmpfs/) membuang isi folder sementara saat container berhenti.

## Rujukan resmi

[noVNC embedding](https://github.com/novnc/noVNC/blob/master/docs/EMBEDDING.md), [ngrok WebSockets](https://ngrok.com/docs/using-ngrok-with/websockets), [Wireshark Unix install](https://www.wireshark.org/docs/wsug_html_chunked/ChBuildInstallUnixInstallBins.html).
