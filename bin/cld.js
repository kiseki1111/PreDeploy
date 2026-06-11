#!/usr/bin/env node

import { initCommand } from '../src/commands/init.js';
import { pullCommand } from '../src/commands/pull.js';
import { upCommand } from '../src/commands/up.js';

// ANSI coloring helpers
const green = (text) => `\x1b[32m${text}\x1b[0m`;
const yellow = (text) => `\x1b[33m${text}\x1b[0m`;
const red = (text) => `\x1b[31m${text}\x1b[0m`;
const bold = (text) => `\x1b[1m${text}\x1b[0m`;
const cyan = (text) => `\x1b[36m${text}\x1b[0m`;

const version = '1.0.0';

function printHelp() {
  console.log(`
${bold(cyan('Coolify Local Debugger (cld) - v' + version))}
Sikronkan konfigurasi aplikasi Coolify Anda untuk didebug secara lokal.

${bold('PENGGUNAAN:')}
  ${green('cld')} <command> [opsi]

${bold('COMMANDS:')}
  ${bold(green('init'))}         Mengikat repository git lokal saat ini dengan aplikasi Coolify.
  ${bold(green('pull'))}         Menarik environment variables dan Dockerfile dari Coolify ke lokal (.env).
  ${bold(green('up'))} | ${bold(green('run'))}    Membangun Docker image lokal dan menjalankan container aplikasi.

${bold('OPSI:')}
  ${bold(green('-p, --port'))}    Menentukan host port lokal (default: port dari konfigurasi Coolify).
  ${bold(green('-h, --help'))}    Menampilkan bantuan penggunaan ini.
  ${bold(green('-v, --version'))} Menampilkan versi aplikasi cld.

${bold('CONTOH PENGGUNAAN:')}
  1. Jalankan inisialisasi pertama kali:
     $ ${cyan('cld init')}
  2. Tarik variabel lingkungan & konfigurasi:
     $ ${cyan('cld pull')}
  3. Jalankan aplikasi di localhost:
     $ ${cyan('cld up')}
  4. Jalankan aplikasi dengan custom port:
     $ ${cyan('cld up -p 8080')}
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
    console.log(`cld version ${version}`);
    return;
  }

  switch (command.toLowerCase()) {
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
