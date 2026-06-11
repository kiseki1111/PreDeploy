import { spawn } from 'child_process';
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
 * Helper to run a command and inherit stdout/stderr/stdin
 */
function runCommand(command, args) {
  return new Promise((resolve, reject) => {
    console.log(cyan(`Executing: ${command} ${args.join(' ')}`));
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

export async function upCommand(options = {}) {
  console.log(bold(cyan('\n--- Memulai Container Lokal ---\n')));

  // 1. Read local config
  const localConfig = await readLocalConfig();
  const { appUuid, name, offline, portsExposes, buildArgs: offlineBuildArgs } = localConfig;

  if (!appUuid) {
    console.log(red('Error: Repository ini belum diikat ke aplikasi Coolify manapun.'));
    console.log(yellow('Silakan jalankan "cld init" terlebih dahulu untuk menghubungkannya.'));
    return;
  }

  // 2. Check if .env exists
  const envPath = path.join(process.cwd(), '.env');
  try {
    await fs.access(envPath);
  } catch (err) {
    console.log(red('Error: File ".env" tidak ditemukan.'));
    console.log(yellow('Silakan buat file ".env" atau jalankan "cld pull" terlebih dahulu.'));
    return;
  }

  // 3. Fetch latest application details or use offline configurations
  let appInfo = {};
  let buildArgs = [];

  if (offline) {
    console.log(bold(yellow('Mode Offline Aktif: Menggunakan konfigurasi lokal.')));
    appInfo = {
      ports_exposes: portsExposes || '3000',
      build_pack: 'dockerfile'
    };

    // Gather build-time args from local .env
    const localEnvs = await parseLocalEnv();
    const keys = offlineBuildArgs || [];
    for (const key of keys) {
      if (localEnvs[key] !== undefined) {
        buildArgs.push('--build-arg');
        buildArgs.push(`${key}=${localEnvs[key]}`);
      }
    }
  } else {
    console.log('Mengambil konfigurasi build terbaru dari Coolify...');
    try {
      appInfo = await getApplication(appUuid);
      const envs = await getApplicationEnvs(appUuid);
      
      const buildEnvs = envs.filter(e => e.is_buildtime);
      for (const env of buildEnvs) {
        const val = env.real_value !== undefined && env.real_value !== null ? env.real_value : env.value;
        buildArgs.push('--build-arg');
        buildArgs.push(`${env.key}=${val}`);
      }
    } catch (error) {
      console.log(yellow(`⚠ Gagal terhubung ke API Coolify (${error.message}).`));
      console.log('Menggunakan konfigurasi lokal yang ada...');
      appInfo = { build_pack: 'dockerfile', ports_exposes: '3000' };
    }
  }

  const buildPack = appInfo.build_pack ? appInfo.build_pack.toLowerCase() : 'dockerfile';

  // 4. Handle Docker Compose build pack
  if (buildPack === 'dockercompose') {
    const composeFile = 'docker-compose.coolify.yml';
    let hasCompose = false;
    try {
      await fs.access(path.join(process.cwd(), composeFile));
      hasCompose = true;
    } catch (_) {
      try {
        await fs.access(path.join(process.cwd(), 'docker-compose.yml'));
        hasCompose = true;
      } catch (_) {}
    }

    if (!hasCompose) {
      console.log(red('Error: File docker-compose tidak ditemukan.'));
      console.log(yellow('Silakan jalankan "cld pull" terlebih dahulu.'));
      return;
    }

    const composeFileName = hasCompose ? (await fs.access(path.join(process.cwd(), composeFile)).then(() => composeFile).catch(() => 'docker-compose.yml')) : 'docker-compose.yml';
    console.log(`Menjalankan Docker Compose (${composeFileName})...`);
    
    try {
      await runCommand('docker', ['compose', '-f', composeFileName, 'up', '--build']);
    } catch (error) {
      console.log(red(`❌ Gagal menjalankan Docker Compose: ${error.message}`));
    }
    return;
  }

  // 5. Handle Dockerfile build pack
  let dockerfileToUse = 'Dockerfile';
  try {
    await fs.access(path.join(process.cwd(), 'Dockerfile.coolify'));
    dockerfileToUse = 'Dockerfile.coolify';
  } catch (_) {
    try {
      await fs.access(path.join(process.cwd(), 'Dockerfile'));
      dockerfileToUse = 'Dockerfile';
    } catch (_) {
      console.log(red('Error: Tidak ditemukan file "Dockerfile" atau "Dockerfile.coolify".'));
      console.log(yellow('Silakan buat Dockerfile di root proyek atau jalankan "cld pull" jika file Dockerfile dikonfigurasi di Coolify.'));
      return;
    }
  }

  console.log(`Menggunakan Dockerfile: ${bold(dockerfileToUse)}`);

  const cleanUuid = appUuid.replace('offline-', '');
  const tag = `coolify-local-${cleanUuid.slice(0, 8)}`;
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
  // Port mapping
  const containerPort = appInfo.ports_exposes || '3000';
  const hostPort = options.port || containerPort;
  const containerName = `cld-${name.toLowerCase().replace(/[^a-z0-9]/g, '-')}`;

  console.log(`Menjalankan Container...`);
  console.log(`  - Container Name: ${cyan(containerName)}`);
  console.log(`  - Port Mapping:   ${cyan(`http://localhost:${hostPort}`)} -> Inside: ${cyan(containerPort)}`);
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
