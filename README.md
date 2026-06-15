# PreDeploy 🚀

**PreDeploy** (sebelumnya Coolify Local Debugger) adalah tool CLI (*Command Line Interface*) agnostik berbasis Node.js yang dirancang untuk memastikan **"Zero-Crash Deployment"**. 

Alat ini membantu Anda memindai celah konfigurasi, mem-*backup* variabel lingkungan, mensimulasikan lingkungan *server* secara lokal, dan meng-generate skrip *CI/CD* secara otomatis, tidak peduli platform apa yang Anda gunakan untuk *hosting* (Vercel, Railway, VPS, VPS dengan Coolify, dll).

---

## 🌟 Fitur Utama

- **Project Scanning & Gap Analysis (`pd doctor`)**: Memindai proyek Anda untuk mencari file konfigurasi penting (seperti `.env`, dependensi `package.json`, dan status migrasi database).
- **Auto-Patching & Backup**: Otomatis membuat arsip *backup* file `.env` setiap kali menjalankan diagnostik, mencegah hilangnya kredensial.
- **Action Required Notes**: Menghasilkan dokumen `PREDEPLOY-NOTES.md` berisi poin-poin krusial yang perlu Anda perbaiki secara manual sebelum melempar aplikasi ke server.
- **Local Dry-Run Simulation (`pd up`)**: Menguji *build* dan *run* aplikasi di dalam *container* Docker lokal yang mereplikasi lingkungan *production Linux*.
- **CI/CD Auto-Generation (`pd generate`)**: Membuatkan skrip GitHub Actions (`deploy.yml`) secara otomatis agar *deploy* selanjutnya bisa berjalan di latar belakang hanya dengan `git push`.

---

## 🛠 Instalasi

### Prasyarat:
- **Node.js** v16.0+ terinstal.
- **Docker** terinstal dan berjalan (Hanya dibutuhkan untuk fitur Dry-Run `pd up`).
- **Git** terinstal di sistem Anda.

### Cara Menginstal:
Saat ini, proyek diinstal secara global dari kode sumber lokal:

1. Kloning repository ini ke direktori lokal (misal: di `~/tools/predeploy`):
   ```bash
   git clone https://github.com/kiseki1111/Coolify-Local-Debugger.git predeploy
   ```
2. Masuk ke direktori:
   ```bash
   cd predeploy
   ```
3. Install dependensi dan kaitkan ke sistem operasi secara global:
   ```bash
   npm install
   npm link
   ```

Setelah itu, perintah `pd` (singkatan dari PreDeploy) atau `predeploy` bisa digunakan dari mana saja!

---

## 🚀 Cara Menggunakan PreDeploy

Buka terminal dan arahkan ke root *folder* proyek aplikasi Anda yang ingin di-deploy, lalu ikuti langkah-langkah ini:

### 1. Inisialisasi Proyek
```bash
pd init
```
Perintah ini akan membuat file konfigurasi `.predeploy.json` dan otomatis menyembunyikan konfigurasi tersebut di `.gitignore`.

### 2. Pindai Kesiapan Deploy (Doctor)
```bash
pd doctor
```
Alat ini akan mengecek:
- Kesamaan isi `.env` vs `.env.example`.
- Kelengkapan *script* di `package.json`.
- Kesiapan direktori migrasi (Mendukung Prisma dan Laravel).

Jika ditemukan masalah, PreDeploy otomatis membuat folder `.predeploy/` yang berisi arsip *backup* `.env`, file JSON diagnostik, dan file panduan `PREDEPLOY-NOTES.md`.

### 3. Simulasi Dry-Run (Opsional tapi Direkomendasikan)
```bash
pd up
# atau
pd up -p 8080
```
Perintah ini membangun image Docker dari proyek Anda dan menjalankannya. Jika aplikasi berjalan lancar di sini, Anda bisa yakin 99% aplikasi tidak akan error saat di-*deploy* ke server asli.

### 4. Buat Skrip CI/CD Otomatis
```bash
pd generate
```
PreDeploy akan membuatkan *pipeline* `deploy.yml` (contohnya GitHub Actions). Anda hanya perlu mengedit token rahasianya, melakukan commit, dan aplikasi Anda sudah otomatis ter-deploy ke *server* saat di-push ke GitHub!

---

## 📂 Struktur Direktori `.predeploy/`

Ketika `pd doctor` mendeteksi anomali, folder ini akan terbuat otomatis di root proyek Anda:
- `.predeploy/backup/` : Menyimpan arsip dari `.env` lokal berdasarkan tanggal.
- `.predeploy/diagnostics/` : File log JSON detail seputar eksekusi sistem.
- `PREDEPLOY-NOTES.md` : Panduan perbaikan manual.

---

## ⚙️ Menghapus PreDeploy (Unlink)

Jika Anda ingin mencopot alias CLI ini:
```bash
# Kembali ke folder instalasi predeploy
cd path/ke/folder/predeploy
npm unlink
```

---

*Diciptakan agar setiap developer bisa merasakan "Zero-Crash Deployment".*
