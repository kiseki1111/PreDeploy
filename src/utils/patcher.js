import fs from 'fs/promises';
import path from 'path';
import os from 'os';

async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function ensureDir(dirPath) {
  if (!(await fileExists(dirPath))) {
    await fs.mkdir(dirPath, { recursive: true });
  }
}

export async function backupEnv() {
  const envPath = path.join(process.cwd(), '.env');
  if (!(await fileExists(envPath))) return null;

  const backupDir = path.join(process.cwd(), '.predeploy', 'backup');
  await ensureDir(backupDir);

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = path.join(backupDir, `.env.${timestamp}`);

  await fs.copyFile(envPath, backupPath);
  return backupPath;
}

export async function generateNotes(issues) {
  const notesDir = path.join(process.cwd(), '.predeploy');
  await ensureDir(notesDir);
  const notesPath = path.join(notesDir, 'PREDEPLOY-NOTES.md');

  if (issues.length === 0) {
    await fs.writeFile(notesPath, '# PreDeploy Notes\n\nSemua konfigurasi tampak baik. Tidak ada tindakan manual yang diperlukan.\n', 'utf-8');
    return notesPath;
  }

  let content = '# Tindakan Manual Diperlukan (Action Required)\n\n';
  content += 'PreDeploy mendeteksi beberapa isu yang **tidak dapat diperbaiki secara otomatis**. Anda harus memperbaiki hal-hal berikut sebelum melakukan deployment:\n\n';

  issues.forEach((issue, index) => {
    content += `${index + 1}. **${issue}**\n`;
  });

  await fs.writeFile(notesPath, content, 'utf-8');
  return notesPath;
}

export async function generateDiagnostics(issues) {
  const diagDir = path.join(process.cwd(), '.predeploy', 'diagnostics');
  await ensureDir(diagDir);
  
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const diagPath = path.join(diagDir, `diagnostic-${timestamp}.json`);

  const diagnosticData = {
    timestamp: new Date().toISOString(),
    platform: os.platform(),
    nodeVersion: process.version,
    cwd: process.cwd(),
    issuesFound: issues,
    status: issues.length > 0 ? 'NEEDS_ATTENTION' : 'READY',
  };

  await fs.writeFile(diagPath, JSON.stringify(diagnosticData, null, 2), 'utf-8');
  return diagPath;
}

export async function autoPatch(issues) {
  const patched = [];
  
  // Example auto-patching logic
  // If package.json is missing start script for node, we could inject one, but for now we just backup env.
  const backupPath = await backupEnv();
  if (backupPath) {
    patched.push(`File .env berhasil di-backup ke ${backupPath}`);
  }

  return patched;
}
