# Coolify Local Debugger (cld) 🚀

**Coolify Local Debugger (`cld`)** adalah tool CLI (Command Line Interface) berbasis Node.js yang dirancang khusus untuk membantu para developer menjalankan dan mendebug aplikasi mereka di lingkungan lokal (`localhost`) dengan konfigurasi yang sama persis seperti di server Staging/Production Coolify.

Dengan `cld`, Anda tidak perlu lagi melakukan commit dan push ke GitHub secara terus-menerus hanya untuk memicu antrean build & deploy yang lama di server Coolify saat sedang mencari/memperbaiki bug (*debugging*).

---

## 🌟 Fitur Utama

- **Mode Offline (Mandiri)**: Dapat digunakan penuh walaupun API pada server Coolify Anda dinonaktifkan (seperti server kampus/kantor yang dikunci admin).
- **Validasi Sinkronisasi Git Otomatis**:
  - Mendeteksi jika terdapat perubahan file lokal yang belum di-commit (`git status`).
  - Memeriksa komit terbaru di GitHub secara otomatis (`git fetch`). Jika versi lokal Anda tertinggal, proses build akan **dihentikan** untuk mencegah Anda men-debug kode yang tidak sinkron.
- **Aktivasi Docker Desktop Otomatis**: Jika mesin Docker Anda dideteksi belum berjalan saat mengetik `cld up`, tool ini secara otomatis akan membuka aplikasi Docker Desktop dan menunggu hingga engine siap sebelum melanjutkan proses build.
- **Auto-Inject Build-Args**: Mendeteksi secara cerdas variabel lingkungan di `.env` yang berawalan dengan prefix build-time umum (seperti `VITE_`, `NEXT_PUBLIC_`, `NUXT_`, `REACT_APP_`, dll.) dan menyuntikkannya sebagai `--build-arg` saat build Docker image.
- **Zero Dependencies**: Sangat ringan, cepat di-install, dan hanya memanfaatkan API bawaan Node.js.

---

## 📋 Prasyarat Sistem

Sebelum menggunakan tool ini, pastikan komputer Anda sudah terpasang:
1. **Node.js** (Versi 18 ke atas)
2. **Git**
3. **Docker Desktop** (Pastikan terintegrasi dengan WSL jika Anda menggunakan Windows)

---

## 🚀 Cara Instalasi (Untuk Pengguna Lain)

Agar orang lain dapat menggunakan tool ini dari repositori GitHub Anda, ikuti instruksi berikut:

1. **Clone Repositori ini ke komputer lokal:**
   ```bash
   git clone https://github.com/kiseki1111/Coolify-Local-Debugger.git
   ```

2. **Masuk ke folder repositori:**
   ```bash
   cd Coolify-Local-Debugger
   ```

3. **Hubungkan CLI ke sistem secara global:**
   ```bash
   npm link
   ```
   *Catatan untuk pengguna Windows: Pastikan Anda membuka PowerShell/CMD dengan hak akses Administrator jika terjadi kendala izin.*

Setelah proses di atas selesai, perintah **`cld`** sudah dapat dipanggil dari folder mana pun di terminal Anda.

---

## 📖 Tutorial Cara Pemakaian Lengkap

### Langkah 1: Inisialisasi Proyek Lokal (`cld init`)
Buka terminal dan masuk ke folder proyek aplikasi yang ingin Anda debug (folder kode proyek Anda yang terhubung ke GitHub dan di-deploy di Coolify), lalu jalankan:

```bash
cld init
```

Logika yang berjalan:
1. Tool mendeteksi remote Git dan branch proyek Anda saat ini.
2. Anda akan diminta memasukkan nama aplikasi (misal: `tugas-sig`).
3. Anda akan diminta memasukkan **port kontainer tempat aplikasi Anda berjalan di dalam Docker** (misalnya port `80` untuk base image PHP-Apache, port `3000` untuk Next.js/React, atau port `8000` untuk Laravel).
4. Tool membuat file konfigurasi `.coolify-local.json` lokal dan otomatis menambahkannya (beserta file `.env`) ke `.gitignore` Anda agar aman.

---

### Langkah 2: Siapkan File Variabel Lingkungan (`.env`)
Aplikasi Anda membutuhkan konfigurasi environment variable dari server.
1. Jalankan perintah:
   ```bash
   cld pull
   ```
   *(Perintah ini akan menampilkan panduan menyalin variabel dari dashboard Coolify)*
2. Buka dashboard Coolify Anda di browser, masuk ke halaman aplikasi Anda -> tab **Environment Variables**.
3. Klik tombol **Developer view** di kanan atas untuk menampilkan teks mentah.
4. Salin (copy) seluruh teks variabel tersebut.
5. Buat file baru bernama **`.env`** di folder utama proyek lokal Anda, tempel (paste) variabel tersebut di dalamnya, lalu simpan.

> [!TIP]
> **Praktik Terbaik Database Lokal:**
> Demi keamanan, jangan arahkan host database ke server Staging/Production asli. Buatlah database MySQL kosong di localhost Anda (misal via XAMPP/Laragon), import struktur/data di sana, lalu ubah variabel di file `.env` lokal Anda:
> ```env
> DB_HOST=host.docker.internal  # Agar kontainer Docker lokal bisa mengakses database di localhost laptop Anda
> DB_USER=root
> DB_PASS=password_mysql_lokal_anda
> ```

---

### Langkah 3: Bangun dan Jalankan Kontainer Lokal (`cld up`)
Pastikan kode lokal Anda sudah rapi dan siap dijalankan, ketik perintah:

```bash
cld up
```

*   **Pengecekan Otomatis**: Tool akan memeriksa jika ada perubahan kode yang belum di-commit atau tertinggal dari GitHub, serta memastikan Docker aktif.
*   **Kustomisasi Port**: Secara default, port localhost akan mengikuti port kontainer. Jika Anda ingin memetakan ke port lain di localhost (misalnya aplikasi di dalam Docker berjalan di port `80`, tetapi Anda ingin membukanya di browser pada `http://localhost:3000`), jalankan dengan opsi `-p`:
    ```bash
    cld up -p 3000
    ```

Setelah sukses, buka browser Anda di alamat yang ditunjukkan di terminal (misalnya `http://localhost:3000`) untuk mulai men-debug secara instan!

---

## 🛠️ Pemecahan Masalah (Troubleshooting)

#### 1. Error `ERR_EMPTY_RESPONSE` di Browser saat Membuka localhost
- **Penyebab**: Terjadi ketidakcocokan port. Port aplikasi di dalam Docker berbeda dengan port yang didefinisikan saat `cld init`. (Misalnya base image PHP-Apache berjalan di port `80`, tetapi Anda mengonfigurasi port `3000`).
- **Solusi**: Edit file `.coolify-local.json` Anda secara manual dan ubah nilai `"portsExposes"` menjadi port kontainer yang benar (misalnya `"portsExposes": "80"`), lalu jalankan kembali `cld up -p 3000`.

#### 2. Perubahan Kode Lokal Tidak Muncul di Browser
- **Penyebab**: Perubahan kode lokal belum di-build ulang ke dalam Docker Image.
- **Solusi**: Tekan `Ctrl + C` di terminal untuk mematikan container, lalu jalankan `cld up` lagi untuk mem-build kode terbaru ke dalam container Docker.

---

## 📄 Lisensi
Proyek ini dilisensikan di bawah Lisensi ISC.
