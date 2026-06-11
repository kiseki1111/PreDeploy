import readline from 'readline/promises';
import fs from 'fs/promises';
import path from 'path';
import { getGitRemoteUrl, getGitBranch, parseGitRepository } from '../utils/git.js';
import { 
  readGlobalConfig, 
  writeGlobalConfig, 
  writeLocalConfig 
} from '../utils/config.js';
import { verifyConnection, listApplications } from '../utils/api.js';

// ANSI coloring helpers
const green = (text) => `\x1b[32m${text}\x1b[0m`;
const yellow = (text) => `\x1b[33m${text}\x1b[0m`;
const red = (text) => `\x1b[31m${text}\x1b[0m`;
const bold = (text) => `\x1b[1m${text}\x1b[0m`;
const cyan = (text) => `\x1b[36m${text}\x1b[0m`;

/**
 * Ask a question via readline
 */
async function ask(query) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  try {
    const answer = await rl.question(query);
    return answer.trim();
  } finally {
    rl.close();
  }
}

/**
 * Appends files to .gitignore if not already ignored.
 */
async function updateGitignore() {
  const gitignorePath = path.join(process.cwd(), '.gitignore');
  const filesToIgnore = ['.env', '.coolify-local.json', 'Dockerfile.coolify'];
  
  try {
    let content = '';
    try {
      content = await fs.readFile(gitignorePath, 'utf-8');
    } catch (err) {
      if (err.code !== 'ENOENT') throw err;
      // If gitignore doesn't exist, we will create it
    }

    const lines = content.split('\n').map(l => l.trim());
    const toAppend = [];

    for (const file of filesToIgnore) {
      if (!lines.includes(file)) {
        toAppend.push(file);
      }
    }

    if (toAppend.length > 0) {
      const appendStr = (content.endsWith('\n') || content === '' ? '' : '\n') + 
                        '\n# Coolify Local Debugger config\n' + 
                        toAppend.join('\n') + '\n';
      await fs.appendFile(gitignorePath, appendStr, 'utf-8');
      console.log(green(`✔ Menambahkan ${toAppend.join(', ')} ke .gitignore.`));
    }
  } catch (error) {
    console.log(yellow(`⚠ Gagal memperbarui .gitignore secara otomatis: ${error.message}`));
  }
}

async function startOfflineMode(repoIdentifier, currentBranch) {
  console.log(bold(yellow('\n--- Mode Offline (Mandiri) Aktif ---')));
  console.log('Anda dapat mengonfigurasi proyek lokal tanpa memerlukan koneksi API Coolify.\n');

  const defaultName = repoIdentifier ? repoIdentifier.split('/').pop() : 'app';
  const appName = await ask(`Masukkan nama aplikasi (default: ${defaultName}): `) || defaultName;
  const containerPort = await ask('Masukkan port kontainer yang diekspos aplikasi (default: 3000): ') || '3000';
  const buildArgsStr = await ask('Masukkan nama variabel build-time (pisahkan dengan koma, contoh: VITE_API_URL,NEXT_PUBLIC_URL) atau kosongkan: ');
  
  const buildArgs = buildArgsStr 
    ? buildArgsStr.split(',').map(s => s.trim()).filter(Boolean)
    : [];

  await writeLocalConfig({
    appUuid: `offline-${Math.random().toString(36).substring(2, 11)}`,
    name: appName,
    gitRepository: repoIdentifier || null,
    gitBranch: currentBranch || 'main',
    portsExposes: containerPort,
    buildArgs: buildArgs,
    offline: true
  });

  console.log(green(`\n✔ Konfigurasi proyek offline berhasil dibuat di ${bold('.coolify-local.json')}!`));
  await updateGitignore();
  console.log(green(`\nLangkah berikutnya:`));
  console.log(`1. Buka dashboard Coolify Anda di browser.`);
  console.log(`2. Salin semua variabel lingkungan dari menu "Developer View" di aplikasi Anda.`);
  console.log(`3. Jalankan ${bold('cld pull')} untuk melihat panduan penyalinan atau buat file ${bold('.env')} sendiri dan tempel di sana.`);
  console.log(`4. Jalankan ${bold('cld up')} untuk mem-build dan menjalankan container secara lokal.`);
}

export async function initCommand() {
  console.log(bold(cyan('\n--- Inisialisasi Coolify Local Debugger ---\n')));

  // Check if force offline flag is passed
  const isOfflineFlag = process.argv.includes('--offline') || process.argv.includes('-o');

  // 1. Check Git environment
  const remoteUrl = await getGitRemoteUrl();
  const currentBranch = await getGitBranch();
  const repoIdentifier = parseGitRepository(remoteUrl);

  if (isOfflineFlag) {
    await startOfflineMode(repoIdentifier, currentBranch);
    return;
  }

  if (!remoteUrl) {
    console.log(yellow('Peringatan: Folder ini bukan repository Git atau tidak memiliki remote origin.'));
    const confirmOffline = await ask('Apakah Anda ingin menggunakan Mode Offline/Mandiri? (y/n): ');
    if (confirmOffline.toLowerCase() === 'y') {
      await startOfflineMode(null, null);
    } else {
      console.log(red('Proses dibatalkan. Hubungkan ke repositori Git terlebih dahulu atau gunakan Mode Offline.'));
    }
    return;
  }

  console.log(`Deteksi Git Lokal:`);
  console.log(`  - Repository: ${cyan(repoIdentifier)}`);
  console.log(`  - Branch Aktif: ${cyan(currentBranch || 'none')}\n`);

  // 2. Load / setup global configuration
  let globalConfig = await readGlobalConfig();
  let { apiUrl, apiToken } = globalConfig;

  let useOfflineFallback = false;

  if (!apiUrl || !apiToken) {
    console.log(yellow('Kredensial API Coolify belum dikonfigurasi.'));
    const choice = await ask('Hubungkan ke API Coolify atau masuk ke Mode Offline? (pilih: api/offline, default api): ');
    
    if (choice.toLowerCase() === 'offline') {
      await startOfflineMode(repoIdentifier, currentBranch);
      return;
    }

    while (true) {
      apiUrl = await ask('Masukkan URL API Coolify (contoh: https://coolify.yourdomain.com): ');
      if (!apiUrl) {
        console.log(red('URL API tidak boleh kosong.'));
        continue;
      }
      if (!apiUrl.startsWith('http://') && !apiUrl.startsWith('https://')) {
        apiUrl = `https://${apiUrl}`;
      }

      apiToken = await ask('Masukkan API Token Coolify (atau ketik "offline" untuk batal dan masuk Mode Offline): ');
      if (!apiToken) {
        console.log(red('API Token tidak boleh kosong.'));
        continue;
      }

      if (apiToken.toLowerCase() === 'offline') {
        useOfflineFallback = true;
        break;
      }

      console.log('Memverifikasi koneksi ke Coolify...');
      try {
        await verifyConnection(apiUrl, apiToken);
        console.log(green('✔ Berhasil terhubung ke Coolify!\n'));
        break;
      } catch (err) {
        console.log(red(`❌ Gagal terhubung ke Coolify: ${err.message}`));
        const retryChoice = await ask('Coba lagi, atau masuk ke Mode Offline? (retry/offline, default retry): ');
        if (retryChoice.toLowerCase() === 'offline') {
          useOfflineFallback = true;
          break;
        }
      }
    }

    if (useOfflineFallback) {
      await startOfflineMode(repoIdentifier, currentBranch);
      return;
    }

    // Save global config
    await writeGlobalConfig({ apiUrl, apiToken });
    console.log(green('✔ Kredensial global disimpan di folder home (~/.coolify-local-global.json).'));
  } else {
    console.log(green(`✔ Menggunakan kredensial API Coolify yang sudah ada di: ${apiUrl}`));
    const switchOffline = await ask('Apakah Anda ingin beralih ke Mode Offline untuk proyek ini? (y/n, default n): ');
    if (switchOffline.toLowerCase() === 'y') {
      await startOfflineMode(repoIdentifier, currentBranch);
      return;
    }
    console.log('');
  }

  // 3. Fetch applications list and find matches
  console.log('Mengambil daftar aplikasi dari Coolify...');
  let apps = [];
  try {
    apps = await listApplications();
  } catch (error) {
    console.log(red(`❌ Gagal mengambil daftar aplikasi dari API: ${error.message}`));
    const goOffline = await ask('Apakah Anda ingin menggunakan Mode Offline/Mandiri sebagai cadangan? (y/n): ');
    if (goOffline.toLowerCase() === 'y') {
      await startOfflineMode(repoIdentifier, currentBranch);
    }
    return;
  }

  if (!Array.isArray(apps) || apps.length === 0) {
    console.log(red('Tidak ditemukan aplikasi apapun di akun Coolify Anda.'));
    const goOffline = await ask('Apakah Anda ingin menggunakan Mode Offline/Mandiri? (y/n): ');
    if (goOffline.toLowerCase() === 'y') {
      await startOfflineMode(repoIdentifier, currentBranch);
    }
    return;
  }

  // Find matches based on git repository URL
  const matches = apps.filter(app => {
    if (!app.git_repository) return false;
    const appRepo = parseGitRepository(app.git_repository);
    return appRepo && appRepo.toLowerCase() === repoIdentifier.toLowerCase();
  });

  let selectedApp = null;
  const listToShow = matches.length > 0 ? matches : apps;

  if (matches.length > 0) {
    console.log(green(`Ditemukan ${matches.length} aplikasi yang cocok dengan repository Anda:\n`));
  } else {
    console.log(yellow(`Tidak ada aplikasi yang cocok secara langsung dengan "${repoIdentifier}".`));
    console.log('Menampilkan seluruh daftar aplikasi di Coolify:\n');
  }

  listToShow.forEach((app, index) => {
    const branchInfo = app.git_branch ? `[branch: ${app.git_branch}]` : '';
    const desc = app.description ? ` - ${app.description}` : '';
    console.log(`  [${bold(index + 1)}] ${bold(app.name)} ${cyan(branchInfo)}${desc}`);
  });
  console.log(`  [${bold(listToShow.length + 1)}] Masukkan UUID aplikasi secara manual`);

  while (true) {
    const choiceStr = await ask(`\nPilih aplikasi (1-${listToShow.length + 1}): `);
    const choiceIdx = parseInt(choiceStr, 10) - 1;

    if (choiceIdx >= 0 && choiceIdx < listToShow.length) {
      selectedApp = listToShow[choiceIdx];
      break;
    } else if (choiceIdx === listToShow.length) {
      const manualUuid = await ask('Masukkan UUID Aplikasi Coolify: ');
      if (!manualUuid) {
        console.log(red('UUID tidak boleh kosong.'));
        continue;
      }
      selectedApp = { uuid: manualUuid, name: 'Manual App' };
      break;
    } else {
      console.log(red(`Pilihan tidak valid. Silakan pilih antara 1 dan ${listToShow.length + 1}.`));
    }
  }

  // 4. Save local configuration
  await writeLocalConfig({
    appUuid: selectedApp.uuid,
    name: selectedApp.name,
    gitRepository: selectedApp.git_repository || null,
    gitBranch: selectedApp.git_branch || null
  });

  console.log(green(`\n✔ Berhasil mengikat repository lokal ke aplikasi Coolify: ${bold(selectedApp.name)} (${selectedApp.uuid})`));
  
  // 5. Update .gitignore
  await updateGitignore();

  console.log(green(`\nInisialisasi selesai! Sekarang Anda dapat menjalankan ${bold('cld pull')} untuk menarik konfigurasi.`));
}
