import { spawn, exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import { createReadStream } from 'fs';
import path from 'path';
import net from 'net';
import { readLocalConfig, writeLocalConfig } from '../utils/config.js';
import { hasUncommittedChanges, fetchRemote, getBehindCommitsCount, getGitRemoteUrl, getGitBranch, parseGitRepository } from '../utils/git.js';
import { detectProjectType, generateDefaultDockerfile, detectPort } from '../utils/detect.js';

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

function checkTcpConnection(host, port, timeout = 1000) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let resolved = false;

    socket.setTimeout(timeout);
    
    socket.connect(port, host, () => {
      resolved = true;
      socket.destroy();
      resolve(true);
    });

    socket.on('error', () => {
      if (!resolved) {
        resolved = true;
        resolve(false);
      }
    });

    socket.on('timeout', () => {
      if (!resolved) {
        resolved = true;
        socket.destroy();
        resolve(false);
      }
    });
  });
}

async function handleDatabaseFallback(localEnvs) {
  const dbHostRaw = localEnvs.DB_HOST || localEnvs.DB_HOSTNAME;
  if (!dbHostRaw) {
    return;
  }

  const dbConnection = (localEnvs.DB_CONNECTION || localEnvs.DB_TYPE || 'mysql').toLowerCase();
  const isPostgres = dbConnection.includes('postgres') || dbConnection.includes('pgsql');
  const isMysql = dbConnection.includes('mysql') || dbConnection.includes('maria');

  if (!isMysql && !isPostgres) {
    return;
  }

  const defaultPort = isPostgres ? 5432 : 3306;
  const dbPort = parseInt(localEnvs.DB_PORT || defaultPort, 10);
  const dbName = localEnvs.DB_DATABASE || localEnvs.DB_NAME || '';
  const dbUser = localEnvs.DB_USER || localEnvs.DB_USERNAME || (isPostgres ? 'postgres' : 'root');
  const dbPassword = localEnvs.DB_PASSWORD || localEnvs.DB_PASS || '';

  const isLocalHost = ['host.docker.internal', 'localhost', '127.0.0.1', '0.0.0.0'].includes(dbHostRaw);
  const checkHost = isLocalHost ? '127.0.0.1' : dbHostRaw;

  console.log(`Menghubungkan ke database (${dbConnection}) di ${checkHost}:${dbPort}...`);
  const isConnected = await checkTcpConnection(checkHost, dbPort);

  if (isConnected) {
    console.log(green(`✔ Database terdeteksi aktif di ${checkHost}:${dbPort}.\n`));
    return;
  }

  console.log(yellow(`⚠ Database tidak aktif di ${checkHost}:${dbPort}.`));

  if (!isLocalHost) {
    console.log(yellow(`Database host bukan localhost (${dbHostRaw}), tidak bisa melakukan fallback ke Docker otomatis.`));
    return;
  }

  console.log(cyan(`Mencoba menggunakan database dari Docker...`));
  const containerName = isPostgres ? 'cld-db-postgres' : 'cld-db-mysql';

  let containerState = 'none';
  try {
    const { stdout } = await execPromise(`docker inspect -f "{{.State.Running}}" ${containerName}`);
    containerState = stdout.trim() === 'true' ? 'running' : 'stopped';
  } catch (_) {}

  if (containerState === 'running') {
    console.log(green(`✔ Container database "${containerName}" sudah berjalan di Docker.`));
  } else if (containerState === 'stopped') {
    console.log(yellow(`Ditemukan container database "${containerName}" dalam keadaan mati. Menghidupkannya kembali...`));
    try {
      await execPromise(`docker start ${containerName}`);
      console.log(green(`✔ Container "${containerName}" berhasil dijalankan.`));
    } catch (err) {
      console.log(red(`❌ Gagal menjalankan container "${containerName}": ${err.message}`));
      return;
    }
  } else {
    console.log(yellow(`Membuat container database baru "${containerName}" di Docker...`));
    const runParams = ['run', '-d', '--name', containerName, '-p', `${dbPort}:${isPostgres ? 5432 : 3306}`];

    if (isPostgres) {
      runParams.push('-e', `POSTGRES_PASSWORD=${dbPassword || 'postgres'}`);
      if (dbUser && dbUser !== 'postgres') {
        runParams.push('-e', `POSTGRES_USER=${dbUser}`);
      }
      if (dbName) {
        runParams.push('-e', `POSTGRES_DB=${dbName}`);
      }
      runParams.push('postgres:15');
    } else {
      if (dbPassword) {
        runParams.push('-e', `MYSQL_ROOT_PASSWORD=${dbPassword}`);
      } else {
        runParams.push('-e', 'MYSQL_ALLOW_EMPTY_PASSWORD=yes');
      }
      if (dbName) {
        runParams.push('-e', `MYSQL_DATABASE=${dbName}`);
      }
      if (dbUser && dbUser !== 'root') {
        runParams.push('-e', `MYSQL_USER=${dbUser}`);
        runParams.push('-e', `MYSQL_PASSWORD=${dbPassword || 'password'}`);
      }
      runParams.push('mysql:8');
    }

    try {
      await runCommand('docker', runParams);
      console.log(green(`✔ Container "${containerName}" berhasil dibuat.`));
    } catch (err) {
      console.log(red(`❌ Gagal membuat container database: ${err.message}`));
      return;
    }
  }

  const maxAttempts = 30;
  console.log(`Menunggu database siap menerima koneksi di port ${dbPort}...`);
  let ready = false;
  for (let i = 1; i <= maxAttempts; i++) {
    process.stdout.write('.');
    await new Promise(r => setTimeout(r, 1500));
    if (await checkTcpConnection('127.0.0.1', dbPort)) {
      process.stdout.write('\n');
      console.log(green(`✔ Database berhasil terhubung di 127.0.0.1:${dbPort}!\n`));
      ready = true;
      break;
    }
  }

  if (!ready) {
    process.stdout.write('\n');
    console.log(red(`❌ Database di Docker tidak merespons setelah 45 detik.`));
    return;
  }

  const sqlPath = path.join(process.cwd(), 'database.sql');
  try {
    await fs.access(sqlPath);
    console.log(cyan(`Menemukan file "database.sql". Memulai proses import ke database "${dbName}"...`));

    await new Promise(r => setTimeout(r, 3000));

    const importArgs = isPostgres
      ? ['exec', '-i', containerName, 'psql', '-U', dbUser || 'postgres', '-d', dbName]
      : ['exec', '-i', containerName, 'mysql', '-u', dbUser || 'root', ...(dbPassword ? [`-p${dbPassword}`] : []), ...(dbName ? [dbName] : [])];

    const child = spawn('docker', importArgs, { shell: true });
    const fileStream = createReadStream(sqlPath);
    fileStream.pipe(child.stdin);

    await new Promise((resolve, reject) => {
      child.on('close', (code) => {
        if (code === 0) {
          console.log(green(`✔ Schema "database.sql" berhasil di-import ke Docker database!\n`));
          resolve();
        } else {
          reject(new Error(`Import exited with code ${code}`));
        }
      });
      child.on('error', reject);
    });
  } catch (err) {
    if (err.code !== 'ENOENT') {
      console.log(yellow(`⚠ Gagal meng-import database.sql secara otomatis: ${err.message}`));
    }
  }
}

export async function upCommand(options = {}) {
  console.log(bold(cyan('\n--- Memulai Container Lokal ---\n')));

  // 1. Read local config
  let localConfig = await readLocalConfig();
  let { name, portsExposes } = localConfig;

  if (!name) {
    console.log(cyan('Mengotomatiskan inisialisasi konfigurasi (Zero-Config)...'));
    const remoteUrl = await getGitRemoteUrl();
    const repoIdentifier = parseGitRepository(remoteUrl);
    const defaultName = repoIdentifier ? repoIdentifier.split('/').pop() : path.basename(process.cwd());
    name = defaultName;
    const currentBranch = await getGitBranch();
    const containerPort = await detectPort();
    portsExposes = containerPort;

    localConfig = {
      name,
      gitRepository: repoIdentifier || null,
      gitBranch: currentBranch || 'main',
      portsExposes: containerPort,
      offline: true
    };

    await writeLocalConfig(localConfig);
    console.log(green(`✔ Auto-inisialisasi berhasil. Konfigurasi disimpan ke .coolify-local.json`));
  }

  // 1b. Ensure Docker is running
  const dockerOk = await ensureDockerRunning();
  if (!dockerOk) return;

  // 2. Git Commit & Sync Verification
  const remoteUrl = await getGitRemoteUrl();
  if (!remoteUrl) {
    console.log(yellow('⚠ Proyek ini bukan repositori Git dengan remote origin. Melewati pengecekan Git.\n'));
  } else {
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
  }

  // 3. Check if .env exists
  const envPath = path.join(process.cwd(), '.env');
  try {
    await fs.access(envPath);
  } catch (err) {
    const envExamplePath = path.join(process.cwd(), '.env.example');
    try {
      await fs.access(envExamplePath);
      await fs.copyFile(envExamplePath, envPath);
      console.log(green('✔ File ".env" tidak ditemukan. Menyalin dari ".env.example" secara otomatis.\n'));
    } catch (_) {
      await fs.writeFile(envPath, '', 'utf-8');
      console.log(green('✔ File ".env" tidak ditemukan. Membuat file ".env" kosong secara otomatis.\n'));
    }
  }

  // 3b. Verify Database and fallback to Docker if needed
  const localEnvs = await parseLocalEnv();
  await handleDatabaseFallback(localEnvs);

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
      const type = await detectProjectType();
      const defaultDockerfileContent = generateDefaultDockerfile(type);
      await fs.writeFile(path.join(process.cwd(), 'Dockerfile'), defaultDockerfileContent, 'utf-8');
      dockerfileToUse = 'Dockerfile';
      console.log(green(`✔ Tidak ditemukan Dockerfile. Membuat Dockerfile default untuk proyek ${bold(type)} secara otomatis.\n`));
    }
  }

  console.log(`Menggunakan Dockerfile: ${bold(dockerfileToUse)}`);

  // 5. Gather build-time args from .env
  // Automatically pass variables with common build-time prefixes (VITE_, NEXT_PUBLIC_, etc.)
  const buildArgs = [];
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
