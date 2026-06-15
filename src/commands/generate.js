import fs from 'fs/promises';
import path from 'path';
import readline from 'readline/promises';

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

const GITHUB_ACTION_TEMPLATE = `name: Deploy Application

on:
  push:
    branches:
      - main
      - master

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout Code
        uses: actions/checkout@v3

      # Tambahkan step deployment Anda di sini
      # Contoh untuk SSH / Vercel / Railway / Coolify API webhook
      - name: Trigger Deploy
        run: |
          echo "Memulai proses deploy otomatis..."
          # curl -X POST "\${{ secrets.DEPLOY_WEBHOOK_URL }}"
`;

export async function generateCommand() {
  console.log(bold(cyan('\n--- Generator CI/CD Pipeline (PreDeploy) ---\n')));

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  try {
    const answer = await rl.question('Pilih platform CI/CD yang ingin dibuatkan script-nya:\n1. GitHub Actions\n2. GitLab CI\nPilihan (1/2): ');

    if (answer.trim() === '1') {
      const dirPath = path.join(process.cwd(), '.github', 'workflows');
      const filePath = path.join(dirPath, 'deploy.yml');

      if (!(await fileExists(dirPath))) {
        await fs.mkdir(dirPath, { recursive: true });
      }

      await fs.writeFile(filePath, GITHUB_ACTION_TEMPLATE, 'utf-8');
      console.log(green(`\n✔ Berhasil membuat file GitHub Actions di: ${bold('.github/workflows/deploy.yml')}`));
      console.log(yellow(`Silakan edit file tersebut dan sesuaikan "secrets" atau URL webhook deployment Anda.`));
    } else if (answer.trim() === '2') {
      console.log(yellow('\nFitur GitLab CI sedang dalam pengembangan. Silakan gunakan GitHub Actions untuk sementara.'));
    } else {
      console.log(red('\nPilihan tidak valid. Dibatalkan.'));
    }
  } finally {
    rl.close();
  }
}
