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

export async function initCommand() {
  console.log(bold(cyan('\n--- Inisialisasi Coolify Local Debugger ---\n')));

  // 1. Check Git environment
  const remoteUrl = await getGitRemoteUrl();
  const currentBranch = await getGitBranch();

  if (!remoteUrl) {
    console.log(red('Error: Folder ini bukan repository Git atau tidak memiliki remote origin.'));
    console.log(yellow('Silakan jalankan "git init" dan tambahkan remote origin terlebih dahulu.'));
    return;
  }

  const repoIdentifier = parseGitRepository(remoteUrl);
  console.log(`Deteksi Git Lokal:`);
  console.log(`  - Repository: ${cyan(repoIdentifier)}`);
  console.log(`  - Branch Aktif: ${cyan(currentBranch || 'none')}\n`);

  // 2. Load / setup global configuration
  let globalConfig = await readGlobalConfig();
  let { apiUrl, apiToken } = globalConfig;

  if (!apiUrl || !apiToken) {
    console.log(yellow('Kredensial API Coolify belum dikonfigurasi.'));
    
    while (true) {
      apiUrl = await ask('Masukkan URL API Coolify (contoh: https://coolify.yourdomain.com): ');
      if (!apiUrl) {
        console.log(red('URL API tidak boleh kosong.'));
        continue;
      }
      if (!apiUrl.startsWith('http://') && !apiUrl.startsWith('https://')) {
        apiUrl = `https://${apiUrl}`;
      }

      apiToken = await ask('Masukkan API Token Coolify: ');
      if (!apiToken) {
        console.log(red('API Token tidak boleh kosong.'));
        continue;
      }

      console.log('Memverifikasi koneksi ke Coolify...');
      try {
        await verifyConnection(apiUrl, apiToken);
        console.log(green('✔ Berhasil terhubung ke Coolify!\n'));
        break;
      } catch (err) {
        console.log(red(`❌ Gagal terhubung ke Coolify: ${err.message}`));
        console.log(yellow('Silakan masukkan kembali kredensial Anda.\n'));
      }
    }

    // Save global config
    await writeGlobalConfig({ apiUrl, apiToken });
    console.log(green('✔ Kredensial global disimpan di folder home (~/.coolify-local-global.json).'));
  } else {
    console.log(green(`✔ Menggunakan kredensial API Coolify yang sudah ada di: ${apiUrl}\n`));
  }

  // 3. Fetch applications list and find matches
  console.log('Mengambil daftar aplikasi dari Coolify...');
  let apps = [];
  try {
    apps = await listApplications();
  } catch (error) {
    console.log(red(`❌ Gagal mengambil daftar aplikasi: ${error.message}`));
    return;
  }

  if (!Array.isArray(apps) || apps.length === 0) {
    console.log(red('Tidak ditemukan aplikasi apapun di akun Coolify Anda.'));
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
