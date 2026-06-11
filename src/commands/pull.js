import fs from 'fs/promises';
import path from 'path';
import { readLocalConfig } from '../utils/config.js';
import { getApplication, getApplicationEnvs } from '../utils/api.js';

// ANSI coloring helpers
const green = (text) => `\x1b[32m${text}\x1b[0m`;
const yellow = (text) => `\x1b[33m${text}\x1b[0m`;
const red = (text) => `\x1b[31m${text}\x1b[0m`;
const bold = (text) => `\x1b[1m${text}\x1b[0m`;
const cyan = (text) => `\x1b[36m${text}\x1b[0m`;

/**
 * Formats an environment variable value to be compatible with .env files.
 * Wraps values in quotes if they contain spaces, quotes, or newlines.
 */
export function formatEnvValue(value) {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (str.includes('\n') || str.includes(' ') || str.includes('"') || str.includes("'")) {
    // Escape existing double quotes and wrap in double quotes
    return `"${str.replace(/"/g, '\\"')}"`;
  }
  return str;
}

export async function pullCommand() {
  console.log(bold(cyan('\n--- Menarik Konfigurasi dari Coolify ---\n')));

  // 1. Read local config
  const localConfig = await readLocalConfig();
  const { appUuid, name, offline } = localConfig;

  if (!appUuid) {
    console.log(red('Error: Repository ini belum diikat ke aplikasi Coolify manapun.'));
    console.log(yellow('Silakan jalankan "cld init" terlebih dahulu untuk menghubungkannya.'));
    return;
  }

  if (offline) {
    console.log(bold(yellow('Aplikasi ini terkonfigurasi dalam Mode Offline (Mandiri).')));
    console.log('Untuk memuat variabel lingkungan dari Coolify, lakukan langkah-langkah manual berikut:\n');
    console.log(`  1. Buka dashboard Coolify Anda di browser.`);
    console.log(`  2. Masuk ke halaman aplikasi -> menu ${bold('Environment Variables')}.`);
    console.log(`  3. Klik tombol ${bold('Developer View')} untuk menampilkan semua teks variabel.`);
    console.log(`  4. Salin (copy) seluruh teks variabel tersebut.`);
    console.log(`  5. Buat file baru bernama ${bold('.env')} di root folder proyek lokal ini.`);
    console.log(`  6. Tempel (paste) teks tersebut ke dalam file ${bold('.env')} dan simpan.`);
    console.log(green(`\n✔ Setelah file ${bold('.env')} selesai dibuat, silakan jalankan ${bold('cld up')} untuk memulai container lokal.`));
    return;
  }

  console.log(`Menghubungi Coolify untuk aplikasi: ${bold(name)} (${cyan(appUuid)})...`);

  // 2. Fetch application info and env variables
  let appInfo, envs;
  try {
    appInfo = await getApplication(appUuid);
    envs = await getApplicationEnvs(appUuid);
  } catch (error) {
    console.log(red(`❌ Gagal mengambil konfigurasi dari API Coolify: ${error.message}`));
    return;
  }

  // 3. Generate .env file
  console.log('Memproses Variabel Lingkungan...');
  let buildEnvs = [];
  let runtimeEnvs = [];

  for (const env of envs) {
    // Use real_value (decrypted / resolved) if available, otherwise fallback to value
    const val = env.real_value !== undefined && env.real_value !== null ? env.real_value : env.value;
    const formatted = `${env.key}=${formatEnvValue(val)}`;
    
    if (env.is_buildtime) {
      buildEnvs.push(formatted);
    } else {
      runtimeEnvs.push(formatted);
    }
  }

  const envFilePath = path.join(process.cwd(), '.env');
  let envFileContent = `# DIBUAT OTOMATIS OLEH COOLIFY LOCAL DEBUGGER (cld)\n`;
  envFileContent += `# Aplikasi: ${name} (${appUuid})\n`;
  envFileContent += `# Tanggal Tarik: ${new Date().toISOString()}\n\n`;

  if (buildEnvs.length > 0) {
    envFileContent += `# --- VARIABEL BUILD-TIME ---\n`;
    envFileContent += buildEnvs.join('\n') + '\n\n';
  }

  if (runtimeEnvs.length > 0) {
    envFileContent += `# --- VARIABEL RUNTIME ---\n`;
    envFileContent += runtimeEnvs.join('\n') + '\n';
  }

  try {
    await fs.writeFile(envFilePath, envFileContent, 'utf-8');
    console.log(green(`✔ Berhasil membuat/memperbarui file ${bold('.env')} dengan ${envs.length} variabel lingkungan.`));
  } catch (error) {
    console.log(red(`❌ Gagal menulis file .env: ${error.message}`));
    return;
  }

  // 4. Process Build Pack configuration (Dockerfile / Nixpacks / Docker Compose)
  const buildPack = appInfo.build_pack ? appInfo.build_pack.toLowerCase() : 'dockerfile';
  console.log(`Tipe Build Pack Coolify: ${bold(buildPack)}`);

  if (buildPack === 'dockerfile') {
    if (appInfo.dockerfile) {
      const dockerfilePath = path.join(process.cwd(), 'Dockerfile.coolify');
      try {
        await fs.writeFile(dockerfilePath, appInfo.dockerfile, 'utf-8');
        console.log(green(`✔ Menemukan custom Dockerfile di Coolify. Disimpan ke ${bold('Dockerfile.coolify')}.`));
      } catch (err) {
        console.log(red(`❌ Gagal menyimpan Dockerfile.coolify: ${err.message}`));
      }
    } else {
      console.log(yellow('⚠ Aplikasi menggunakan build pack "Dockerfile", tetapi menggunakan file Dockerfile lokal.'));
      console.log('  Pastikan Anda memiliki file "Dockerfile" di root proyek Anda.');
    }
  } else if (buildPack === 'dockercompose') {
    const composeContent = appInfo.docker_compose || appInfo.docker_compose_raw;
    if (composeContent) {
      const composePath = path.join(process.cwd(), 'docker-compose.coolify.yml');
      try {
        await fs.writeFile(composePath, composeContent, 'utf-8');
        console.log(green(`✔ Menemukan konfigurasi Docker Compose. Disimpan ke ${bold('docker-compose.coolify.yml')}.`));
      } catch (err) {
        console.log(red(`❌ Gagal menyimpan docker-compose.coolify.yml: ${err.message}`));
      }
    }
  } else if (buildPack === 'nixpacks') {
    console.log(cyan('ℹ Info: Nixpacks digunakan untuk mem-build aplikasi ini di Coolify.'));
    console.log('  Untuk menjalankan Nixpacks secara lokal, pastikan Anda telah menginstal CLI Nixpacks (https://nixpacks.com)');
    console.log('  atau Anda dapat membuat Dockerfile sendiri di lokal untuk proses debugging.');
  }

  console.log(green(`\n✔ Proses tarik konfigurasi selesai! Jalankan ${bold('cld up')} untuk memulai container lokal.`));
}
