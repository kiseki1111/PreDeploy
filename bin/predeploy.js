#!/usr/bin/env node

import { initCommand } from '../src/commands/init.js';
import { pullCommand } from '../src/commands/pull.js';
import { upCommand } from '../src/commands/up.js';
import { doctorCommand } from '../src/commands/doctor.js';
import { generateCommand } from '../src/commands/generate.js';

// ANSI coloring helpers
const green = (text) => `\x1b[32m${text}\x1b[0m`;
const yellow = (text) => `\x1b[33m${text}\x1b[0m`;
const red = (text) => `\x1b[31m${text}\x1b[0m`;
const bold = (text) => `\x1b[1m${text}\x1b[0m`;
const cyan = (text) => `\x1b[36m${text}\x1b[0m`;

const version = '1.0.0';

function printHelp() {
  console.log(`
${bold(cyan('PreDeploy - v' + version))}
Agnostic CLI tool to scan, patch, and dry-run your applications for zero-crash deployments.

${bold('PENGGUNAAN:')}
  ${green('predeploy')} <command> [opsi]
  ${green('pd')} <command> [opsi]

${bold('COMMANDS:')}
  ${bold(green('doctor'))}       Memindai proyek untuk mencari celah konfigurasi & kesiapan deploy.
  ${bold(green('init'))}         Menginisialisasi konfigurasi lokal (.predeploy.json).
  ${bold(green('pull'))}         Menarik konfigurasi dari remote provider.
  ${bold(green('up'))} | ${bold(green('run'))}    Membangun Docker image lokal dan menjalankan simulasi dry-run.

${bold('OPSI:')}
  ${bold(green('-p, --port'))}    Menentukan host port lokal (default: terdeteksi otomatis).
  ${bold(green('-h, --help'))}    Menampilkan bantuan penggunaan ini.
  ${bold(green('-v, --version'))} Menampilkan versi aplikasi.

${bold('CONTOH PENGGUNAAN:')}
  1. Periksa kesiapan proyek:
     $ ${cyan('pd doctor')}
  2. Jalankan simulasi lokal:
     $ ${cyan('pd up')}
  `);
}

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  if (!command || args.includes('-h') || args.includes('--help')) {
    printHelp();
    return;
  }

  if (args.includes('-v') || args.includes('--version')) {
    console.log(`predeploy version ${version}`);
    return;
  }

  switch (command.toLowerCase()) {
    case 'doctor':
      await doctorCommand();
      break;

    case 'generate':
      await generateCommand();
      break;

    case 'init':
      await initCommand();
      break;
      
    case 'pull':
      await pullCommand();
      break;
      
    case 'up':
    case 'run': {
      // Parse optional port parameter
      let port = null;
      const portIdx = args.findIndex(arg => arg === '-p' || arg === '--port');
      if (portIdx !== -1 && args[portIdx + 1]) {
        port = parseInt(args[portIdx + 1], 10);
        if (isNaN(port)) {
          console.log(red('Error: Port yang dimasukkan harus berupa angka.'));
          return;
        }
      }
      await upCommand({ port });
      break;
    }
      
    default:
      console.log(red(`Error: Command "${command}" tidak dikenal.`));
      printHelp();
      process.exit(1);
  }
}

main().catch((err) => {
  console.error(red(`\nTerjadi kesalahan fatal: ${err.message}`));
  process.exit(1);
});
