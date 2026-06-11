import { spawn, exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';
import { readLocalConfig } from '../utils/config.js';
import { hasUncommittedChanges, fetchRemote, getBehindCommitsCount } from '../utils/git.js';

const execPromise = promisify(exec);

// ANSI coloring helpers
const green = (text) => `\x1b[32m${text}\x1b[0m`;
const yellow = (text) => `\x1b[33m${text}\x1b[0m`;
const red = (text) => `\x1b[31m${text}\x1b[0m`;
const bold = (text) => `\x1b[1m${text}\x1b[0m`;
const cyan = (text) => `\x1b[36m${text}\x1b[0m`;

/**
 * Helper to run a command and inherit stdout/stderr/stdin
 */
function runCommand(command, args) {
  return new Promise((resolve, reject) => {
    console.log(cyan(`Menjalankan: ${command} ${args.join(' ')}`));
    const child = spawn(command, args, { stdio: 'inherit', shell: true });

    child.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Command failed with exit code ${code}`));
      }
    });

    child.on('error', (err) => {
      reject(err);
    });
  });
}

/**
 * Simple parser for local .env files
 */
async function parseLocalEnv() {
  const envPath = path.join(process.cwd(), '.env');
  try {
    const content = await fs.readFile(envPath, 'utf-8');
    const envs = {};
    const lines = content.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const equalsIdx = trimmed.indexOf('=');
      if (equalsIdx !== -1) {
        const key = trimmed.slice(0, equalsIdx).trim();
        let val = trimmed.slice(equalsIdx + 1).trim();
        // Remove quotes if wrapped
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
          val = val.slice(1, -1);
        }
        // Unescape escaped double quotes
        val = val.replace(/\\"/g, '"');
        envs[key] = val;
      }
    }
    return envs;
  } catch (_) {
    return {};
  }
}

async function isDockerRunning() {
  try {
    await execPromise('docker info');
    return true;
  } catch (_) {
    return false;
  }
}

async function ensureDockerRunning() {
  const running = await isDockerRunning();
  if (running) return true;

  console.log(yellow('Docker Engine belum aktif. Mencoba mengaktifkan Docker Desktop secara otomatis...'));

  if (process.platform === 'win32') {
    const defaultPath = 'C:\\Program Files\\Docker\\Docker\\Docker Desktop.exe';
    try {
      await fs.access(defaultPath);
      const child = spawn(defaultPath, [], { detached: true, stdio: 'ignore' });
      child.unref();
    } catch (_) {
      console.log(red('❌ Gagal mengaktifkan secara otomatis: Executable Docker Desktop tidak ditemukan di:'));
      console.log(`   ${defaultPath}`);
      console.log(yellow('Silakan buka aplikasi Docker Desktop secara manual terlebih dahulu.'));
      return false;
    }
  } else if (process.platform === 'darwin') {
    try {
      await execPromise('open -a "Docker"');
    } catch (_) {
      return false;
    }
  } else {
    try {
      await execPromise('sudo systemctl start docker');
    } catch (_) {
      return false;
    }
  }

  const maxAttempts = 30; // 60 seconds
  console.log('Menunggu Docker Engine aktif (maksimal 60 detik)...');
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    process.stdout.write('.');
    await new Promise(resolve => setTimeout(resolve, 2000));
    if (await isDockerRunning()) {
      process.stdout.write('\n');
      console.log(green('✔ Docker Engine berhasil diaktifkan!\n'));
      return true;
    }
  }
  process.stdout.write('\n');
  console.log(red('❌ Docker Engine tidak kunjung aktif setelah 60 detik.'));
  console.log(yellow('Silakan periksa Docker Desktop Anda secara manual.'));
  return false;
}

export async function upCommand(options = {}) {
  console.log(bold(cyan('\n--- Memulai Container Lokal ---\n')));

  // 1. Read local config
  const localConfig = await readLocalConfig();
  const { name, portsExposes } = localConfig;

  if (!name) {
    console.log(red('Error: Folder ini belum diinisialisasi.'));
    console.log(yellow('Silakan jalankan "cld init" terlebih dahulu untuk mengaturnya.'));
    return;
  }

  // 1b. Ensure Docker is running
  const dockerOk = await ensureDockerRunning();
  if (!dockerOk) return;

  // 2. Git Commit & Sync Verification
  console.log('Memverifikasi status Git repositori...');
  
  // A. Check for uncommitted changes
  const uncommitted = await hasUncommittedChanges();
  if (uncommitted) {
    console.log(yellow('⚠ Peringatan: Terdapat perubahan lokal yang belum dikomit di repositori Anda.'));
  }

  // B. Sync check with GitHub
  console.log('Melakukan sinkronisasi dengan remote origin (GitHub)...');
  const fetched = await fetchRemote();
  if (!fetched) {
    console.log(yellow('⚠ Gagal melakukan "git fetch". Memulai aplikasi tanpa pengecekan remote (offline).'));
  } else {
    const behindCount = await getBehindCommitsCount();
    if (behindCount > 0) {
      console.log(red(`\n❌ Error: Repositori lokal Anda tertinggal ${behindCount} komit dari GitHub.`));
      console.log(yellow('Pastikan lokal Anda berada di commit terbaru untuk menjaga sinkronisasi.'));
      console.log(bold('Silakan jalankan perintah "git pull" terlebih dahulu sebelum menjalankan aplikasi.\n'));
      return;
    }
    console.log(green('✔ Git tersinkronisasi: lokal Anda berada di commit terbaru GitHub.\n'));
  }

  // 3. Check if .env exists
  const envPath = path.join(process.cwd(), '.env');
  try {
    await fs.access(envPath);
  } catch (err) {
    console.log(red('Error: File ".env" tidak ditemukan.'));
    console.log(yellow('Silakan buat file ".env" terlebih dahulu (bisa mengikuti instruksi dari "cld pull").'));
    return;
  }

  // 4. Handle Dockerfile detection
  let dockerfileToUse = 'Dockerfile';
  try {
    await fs.access(path.join(process.cwd(), 'Dockerfile.coolify'));
    dockerfileToUse = 'Dockerfile.coolify';
  } catch (_) {
    try {
      await fs.access(path.join(process.cwd(), 'Dockerfile'));
      dockerfileToUse = 'Dockerfile';
    } catch (_) {
      console.log(red('Error: Tidak ditemukan file "Dockerfile" di root proyek.'));
      console.log(yellow('Pastikan Anda memiliki file "Dockerfile" untuk melakukan build lokal.'));
      return;
    }
  }

  console.log(`Menggunakan Dockerfile: ${bold(dockerfileToUse)}`);

  // 5. Gather build-time args from .env
  // Automatically pass variables with common build-time prefixes (VITE_, NEXT_PUBLIC_, etc.)
  const buildArgs = [];
  const localEnvs = await parseLocalEnv();
  const buildtimePrefixes = ['VITE_', 'NEXT_PUBLIC_', 'NUXT_', 'REACT_APP_', 'PUBLIC_', 'PORT'];
  
  for (const [key, val] of Object.entries(localEnvs)) {
    const isBuildTime = buildtimePrefixes.some(prefix => key.startsWith(prefix));
    if (isBuildTime) {
      buildArgs.push('--build-arg');
      buildArgs.push(`${key}=${val}`);
    }
  }

  const containerName = `cld-${name.toLowerCase().replace(/[^a-z0-9]/g, '-')}`;
  const tag = `coolify-local-${name.toLowerCase().replace(/[^a-z0-9]/g, '-')}`;

  console.log(`Membangun Docker Image (${bold(tag)})...`);

  const buildParams = [
    'build',
    '-f', dockerfileToUse,
    '-t', tag,
    ...buildArgs,
    '.'
  ];

  try {
    await runCommand('docker', buildParams);
    console.log(green('\n✔ Docker Image berhasil di-build!\n'));
  } catch (error) {
    console.log(red(`❌ Proses build Docker gagal: ${error.message}`));
    return;
  }

  // 6. Running the container
  const containerPort = portsExposes || '3000';
  const hostPort = options.port || containerPort;

  console.log(`Menjalankan Container...`);
  console.log(`  - Nama Container: ${cyan(containerName)}`);
  console.log(`  - Port Mapping:    ${cyan(`http://localhost:${hostPort}`)} -> Dalam Container: ${cyan(containerPort)}`);
  console.log(yellow('\nTekan Ctrl+C untuk menghentikan container.\n'));

  // Clean up any existing container with same name first
  try {
    const { execSync } = await import('child_process');
    execSync(`docker rm -f ${containerName}`, { stdio: 'ignore' });
  } catch (_) {}

  const runParams = [
    'run',
    '--rm',
    '-it',
    '--name', containerName,
    '-p', `${hostPort}:${containerPort}`,
    '--env-file', '.env',
    tag
  ];

  try {
    await runCommand('docker', runParams);
  } catch (error) {
    console.log(red(`❌ Container berhenti dengan error: ${error.message}`));
  }
}
