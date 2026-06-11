import { readLocalConfig } from '../utils/config.js';

// ANSI coloring helpers
const green = (text) => `\x1b[32m${text}\x1b[0m`;
const yellow = (text) => `\x1b[33m${text}\x1b[0m`;
const red = (text) => `\x1b[31m${text}\x1b[0m`;
const bold = (text) => `\x1b[1m${text}\x1b[0m`;
const cyan = (text) => `\x1b[36m${text}\x1b[0m`;

export async function pullCommand() {
  console.log(bold(cyan('\n--- Menarik Konfigurasi ---\n')));

  // Read local config to verify init is done
  const localConfig = await readLocalConfig();
  const { name } = localConfig;

  if (!name) {
    console.log(red('Error: Folder ini belum diinisialisasi.'));
    console.log(yellow('Silakan jalankan "cld init" terlebih dahulu untuk mengaturnya.'));
    return;
  }

  console.log(bold(yellow(`Aplikasi "${name}" dikonfigurasi dalam Mode Lokal/Offline.`)));
  console.log('Untuk memuat variabel lingkungan dari Coolify, silakan ikuti petunjuk manual berikut:\n');
  console.log(`  1. Buka dashboard Coolify di browser Anda.`);
  console.log(`  2. Masuk ke halaman proyek Anda -> tab ${bold('Environment Variables')}.`);
  console.log(`  3. Klik tombol ${bold('Developer view')} di kanan atas untuk menampilkan format teks raw.`);
  console.log(`  4. Salin (copy) semua variabel tersebut.`);
  console.log(`  5. Buat file bernama ${bold('.env')} di folder utama proyek lokal Anda.`);
  console.log(`  6. Tempel (paste) variabel tersebut ke dalam file ${bold('.env')} dan simpan.`);
  console.log(green(`\n✔ Setelah file ${bold('.env')} dibuat, Anda dapat langsung menjalankan ${bold('cld up')}.`));
}
