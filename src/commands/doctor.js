import fs from 'fs/promises';
import path from 'path';

// ANSI coloring helpers
const green = (text) => `\x1b[32m${text}\x1b[0m`;
const yellow = (text) => `\x1b[33m${text}\x1b[0m`;
const red = (text) => `\x1b[31m${text}\x1b[0m`;
const bold = (text) => `\x1b[1m${text}\x1b[0m`;
const cyan = (text) => `\x1b[36m${text}\x1b[0m`;

async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function checkEnv() {
  const issues = [];
  const envExamplePath = path.join(process.cwd(), '.env.example');
  const envPath = path.join(process.cwd(), '.env');

  if (await fileExists(envExamplePath)) {
    console.log(cyan('Memeriksa Environment Variables...'));
    if (!(await fileExists(envPath))) {
      issues.push('File .env tidak ditemukan, tetapi .env.example ada. Anda harus membuat file .env.');
      return issues;
    }

    const envExampleContent = await fs.readFile(envExamplePath, 'utf-8');
    const envContent = await fs.readFile(envPath, 'utf-8');

    const extractKeys = (content) => {
      return content.split('\n')
        .map(line => line.trim())
        .filter(line => line && !line.startsWith('#') && line.includes('='))
        .map(line => line.split('=')[0].trim());
    };

    const exampleKeys = extractKeys(envExampleContent);
    const actualKeys = extractKeys(envContent);

    const missingKeys = exampleKeys.filter(key => !actualKeys.includes(key));
    if (missingKeys.length > 0) {
      issues.push(`Kehilangan variabel di .env yang ada di .env.example: ${missingKeys.join(', ')}`);
    } else {
      console.log(green('✔ Semua environment variable telah terisi.'));
    }
  }
  return issues;
}

async function checkPackageJson() {
  const issues = [];
  const pkgPath = path.join(process.cwd(), 'package.json');
  
  if (await fileExists(pkgPath)) {
    console.log(cyan('Memeriksa package.json...'));
    try {
      const content = await fs.readFile(pkgPath, 'utf-8');
      const pkg = JSON.parse(content);
      const scripts = pkg.scripts || {};
      
      const isReactOrNext = pkg.dependencies?.next || pkg.dependencies?.react;
      
      if (isReactOrNext && !scripts.build) {
        issues.push('Proyek frontend terdeteksi, tetapi skrip "build" tidak ditemukan di package.json.');
      }
      
      if (!scripts.start && !isReactOrNext) {
        issues.push('Skrip "start" tidak ditemukan di package.json. Container mungkin tidak tahu cara menjalankan aplikasi.');
      } else {
        console.log(green('✔ Skrip jalankan paket terdeteksi dengan baik.'));
      }
    } catch (e) {
      issues.push('package.json ada tetapi gagal diparsing.');
    }
  }
  return issues;
}

async function checkDatabaseMigrations() {
  const issues = [];
  const cwd = process.cwd();

  console.log(cyan('Memeriksa Database & Migrasi...'));

  // Cek Prisma
  const hasPrisma = await fileExists(path.join(cwd, 'prisma', 'schema.prisma'));
  if (hasPrisma) {
    const hasMigrations = await fileExists(path.join(cwd, 'prisma', 'migrations'));
    if (!hasMigrations) {
      issues.push('Prisma ORM terdeteksi, tetapi folder "prisma/migrations" tidak ditemukan. Pastikan Anda sudah menjalankan migrasi sebelum deploy.');
    } else {
      console.log(green('✔ Prisma ORM & direktori migrasi terdeteksi.'));
    }
  }

  // Cek Laravel
  const isLaravel = await fileExists(path.join(cwd, 'artisan'));
  if (isLaravel) {
    const hasMigrations = await fileExists(path.join(cwd, 'database', 'migrations'));
    if (!hasMigrations) {
      issues.push('Proyek Laravel terdeteksi, tetapi folder "database/migrations" tidak ditemukan.');
    } else {
      console.log(green('✔ Proyek Laravel & direktori migrasi terdeteksi.'));
    }
  }

  // Cek file SQL mentah
  const hasSqlDump = await fileExists(path.join(cwd, 'database.sql'));
  if (!hasPrisma && !isLaravel && hasSqlDump) {
    console.log(green('✔ File database.sql ditemukan untuk import otomatis.'));
  }

  return issues;
}

import { autoPatch, generateNotes, generateDiagnostics } from '../utils/patcher.js';

export async function doctorCommand() {
  console.log(bold(cyan('\n--- Memulai Diagnostik Proyek (PreDeploy Doctor) ---\n')));
  
  let allIssues = [];
  
  allIssues.push(...await checkEnv());
  allIssues.push(...await checkPackageJson());
  allIssues.push(...await checkDatabaseMigrations());

  console.log('\n' + bold('Hasil Diagnostik:'));
  if (allIssues.length === 0) {
    console.log(green('✔ Proyek Anda siap untuk dideploy! Tidak ada isu konfigurasi kritis yang ditemukan.\n'));
  } else {
    console.log(red(`❌ Ditemukan ${allIssues.length} isu yang dapat menyebabkan deployment gagal:`));
    allIssues.forEach((issue, idx) => {
      console.log(yellow(`  ${idx + 1}. ${issue}`));
    });
    console.log('\nSilakan perbaiki isu-isu di atas sebelum melakukan deployment.\n');
  }

  // Langkah 3, 4, 5: Auto-Patching, Notes, & Diagnostics
  console.log(cyan('Mengeksekusi langkah Auto-Patching & Pembuatan Laporan...'));
  
  const patches = await autoPatch(allIssues);
  patches.forEach(p => console.log(green(`✔ Auto-Patch: ${p}`)));

  const notesPath = await generateNotes(allIssues);
  console.log(green(`✔ Catatan tindakan manual (Notes) berhasil dibuat di: ${notesPath}`));

  const diagPath = await generateDiagnostics(allIssues);
  console.log(green(`✔ File log diagnostik berhasil dibuat di: ${diagPath}\n`));
}
