# Deploy lab ke VPS Ubuntu 24.04

Gunakan VPS lab tersendiri yang boleh menjalankan layanan simulasi. Ini bukan deployment aplikasi bisnis. Mahasiswa memakai **IP VPS dan nomor port** untuk Nmap; satu link HTTP ngrok hanya meneruskan web dan tidak membuka tujuh protokol TCP lainnya.

## 1. Siapkan akses administrasi

- Catat IP publik VPS dan CIDR/IP publik peserta yang diberi izin.
- Pastikan SSH administrasi tetap dapat diakses. Default proyek: admin SSH host `22`, SSH dummy container dipublikasikan pada **2222**.
- Jangan memilih `VPS_SSH_PORT=22` ketika sshd host masih menggunakan 22. Jika benar-benar perlu dummy di 22, pindahkan sshd administrasi dengan pengujian pada sesi kedua/console provider terlebih dahulu; proyek ini tidak mengubah sshd host.
- Buka port admin SSH hanya untuk pengajar di firewall provider.

## 2. Install Docker dan Compose dari repositori resmi

```bash
sudo apt-get update
sudo apt-get install -y ca-certificates curl make unzip
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc
sudo tee /etc/apt/sources.list.d/docker.sources > /dev/null <<EOF
Types: deb
URIs: https://download.docker.com/linux/ubuntu
Suites: noble
Components: stable
Architectures: $(dpkg --print-architecture)
Signed-By: /etc/apt/keyrings/docker.asc
EOF
sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo docker version
sudo docker compose version
```

Compose **2.24.4 atau lebih baru** diperlukan untuk tag `!override`. Docker daemon membutuhkan hak root; panduan ini memakai `sudo make` tanpa mengubah keanggotaan group Docker.

## 3. Upload/clone dan atur konfigurasi

Proyek belum mempunyai remote Git. Upload ZIP melalui SSH administrasi:

```bash
# Di komputer pengajar, sesuaikan nama user dan IP:
scp nmap-fake-services-lab.zip pengajar@<IP_VPS>:~/
# Di VPS:
unzip nmap-fake-services-lab.zip
cd nmap-fake-services-lab
cp .env.example .env
```

Jika sudah dibuat repository sendiri: `git clone <URL_REPOSITORY_ANDA>` lalu masuk ke folder hasil clone. Tidak ada URL repository yang dibuat atau diasumsikan oleh proyek ini.

Default `.env`: `VPS_SSH_PORT=2222`, web 8080, sisanya 21/23/25/3306/6379/27017. FTP juga menggunakan port pasif 30000–30009. Isi `FTP_PASV_ADDRESS` dengan IP publik VPS, serta ubah `FTP_USER`/`FTP_PASSWORD` untuk kelas jika perlu. Sesuaikan target DNS/ping hanya jika pengajar ingin target latihan lain. Data tetap dummy.

## 4. Atur firewall sebelum menjalankan prod

Di security group/firewall provider, izinkan peserta hanya ke TCP `21,2222,23,25,3306,6379,8080,27017` dan rentang TCP `30000–30009` untuk transfer FTP. Batasi semuanya ke IP kelas.

UFW dapat membantu melindungi proses host:

```bash
sudo ufw allow OpenSSH
# Contoh CIDR dokumentasi saja; GANTI dengan CIDR publik kelas yang sebenarnya.
CLASS_CIDR='203.0.113.0/24'
sudo ufw allow proto tcp from "$CLASS_CIDR" to any port 21,2222,23,25,3306,6379,8080,27017
sudo ufw allow proto tcp from "$CLASS_CIDR" to any port 30000:30009
sudo ufw status verbose
```

**Docker published ports dapat melewati aturan UFW.** Karena itu pembatasan provider dan/atau chain Docker harus diterapkan. Contoh berikut untuk Docker dengan backend **iptables**, IPv4, bukan backend nftables Docker. Ia membatasi traffic yang di-forward ke container dengan original destination port lab, bukan SSH host.

```bash
# Jalankan sesudah Docker terpasang, sebelum make prod.
ip route show default
LAB_IF='ens3'                 # GANTI dengan interface default VPS
CLASS_CIDR='203.0.113.0/24'   # GANTI dengan IP/CIDR kelas
sudo iptables -nL DOCKER-USER # Harus ada; jangan terapkan contoh ini jika chain tidak tersedia.
sudo iptables -N TOKOKU-LAB
sudo iptables -A TOKOKU-LAB -m conntrack --ctstate ESTABLISHED,RELATED -j RETURN
# Batasi koneksi TCP baru per IP; cap thread internal melindungi tiap service.
sudo iptables -A TOKOKU-LAB -p tcp -m conntrack --ctstate NEW -m hashlimit \
  --hashlimit-above 100/second --hashlimit-burst 200 --hashlimit-mode srcip \
  --hashlimit-name tokoku-new -j DROP
sudo iptables -A TOKOKU-LAB -s "$CLASS_CIDR" -j RETURN
sudo iptables -A TOKOKU-LAB -j DROP
for lab_port in 21 2222 23 25 3306 6379 8080 27017 $(seq 30000 30009); do
  sudo iptables -I DOCKER-USER 1 -i "$LAB_IF" -p tcp -m conntrack \
    --ctorigdstport "$lab_port" -j TOKOKU-LAB
done
```

Ini contoh setup satu kali; jangan menjalankan `-N` berulang pada chain yang sudah ada. Untuk beberapa CIDR, tambahkan satu rule RETURN per CIDR **sebelum** DROP terakhir. Port harus mengikuti `.env`. Persistensi rules harus dikelola pengajar (misalnya iptables-persistent); periksa kembali setelah reboot. IPv6 tidak dipublikasikan oleh konfigurasi ini. Gunakan `--max-rate 100` saat latihan SYN scan bila rate limit membuat beberapa hasil filtered.

## 5. Jalankan dan verifikasi

```bash
sudo docker compose -f docker-compose.yml -f docker-compose.prod.yml config
sudo make prod
sudo docker compose ps
# Dari laptop peserta yang diizinkan:
nmap -sV -p 21,2222,23,25,3306,6379,8080,27017 <IP_VPS>
```

Website: `http://<IP_VPS>:8080/`. Login, checkout, serta button trafik hanya menggunakan data contoh. `make prod` bind IPv4 0.0.0.0 dan restart unless-stopped; delapan healthcheck tetap diwarisi dari Compose dasar. File prod adalah overlay `-f`, bukan file standalone atau directive `extends` literal.

## 6. Capture dan bagikan

Untuk capture sisi server, ikuti docs/02. Jika server sudah prod, sertakan ketiga file agar konfigurasi tidak berubah menjadi localhost:

```bash
sudo docker compose -f docker-compose.yml -f docker-compose.prod.yml -f docker-compose.capture.yml \
  --profile capture up -d --build capture-web
# Setelah trigger:
sudo docker compose -f docker-compose.yml -f docker-compose.prod.yml -f docker-compose.capture.yml \
  --profile capture stop capture-web
```

Kirim ke mahasiswa: IP VPS, daftar port, waktu sesi, delapan latihan Nmap, delapan latihan Wireshark, dan PCAP **data contoh**. Kunci jawaban docs/03 sebaiknya disimpan oleh pengajar. Mahasiswa tetap membutuhkan Nmap/Npcap dan Wireshark untuk praktik langsung di laptop; website ini tidak menjalankan Nmap di browser.

## 7. Akhiri kelas

```bash
sudo docker compose -f docker-compose.yml -f docker-compose.prod.yml -f docker-compose.capture.yml --profile capture down
# Atau reset image/resource proyek setelah menyalin bukti yang dibutuhkan:
sudo make reset
```

Hapus akses port lab dari firewall provider seusai kelas. Reset tidak menghapus source, folder captures, atau Docker project lain. Akun/keranjang/pesanan tersimpan di volume `web-data`, file FTP di `ftp-data`; reset proyek menghapus volume tersebut. Log berotasi 2 × 5 MiB per service.

## Rujukan

- [Install Docker Ubuntu](https://docs.docker.com/engine/install/ubuntu/)
- [Docker dan firewall](https://docs.docker.com/engine/network/packet-filtering-firewalls/)
- [Compose merge dan !override](https://docs.docker.com/reference/compose-file/merge/)
