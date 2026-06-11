import readline from 'readline/promises';
import fs from 'fs/promises';
import path from 'path';
import { getGitRemoteUrl, getGitBranch, parseGitRepository } from '../utils/git.js';
import { writeLocalConfig } from '../utils/config.js';

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

  // 2. Setup project configuration (Always offline/local run configuration for now)
  const defaultName = repoIdentifier ? repoIdentifier.split('/').pop() : 'app';
  const appName = await ask(`Masukkan nama aplikasi lokal (default: ${defaultName}): `) || defaultName;
  const containerPort = await ask('Masukkan port aplikasi yang diekspos (default: 3000): ') || '3000';

  await writeLocalConfig({
    name: appName,
    gitRepository: repoIdentifier || null,
    gitBranch: currentBranch || 'main',
    portsExposes: containerPort,
    offline: true
  });

  console.log(green(`\n✔ Konfigurasi proyek lokal berhasil disimpan di ${bold('.coolify-local.json')}!`));
  
  // 3. Update .gitignore
  await updateGitignore();

  console.log(green(`\nLangkah berikutnya:`));
  console.log(`1. Buat file ${bold('.env')} di root proyek ini (salin variabel dari Coolify jika ada).`);
  console.log(`2. Jalankan perintah ${bold('cld up')} untuk membangun & menjalankan aplikasi lokal.`);
}
