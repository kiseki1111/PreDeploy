import test from 'node:test';
import assert from 'node:assert';
import { parseGitRepository } from '../src/utils/git.js';
import { detectProjectType, detectPort, generateDefaultDockerfile } from '../src/utils/detect.js';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

test('Git Repository URL Parsing', async (t) => {
  await t.test('should parse HTTPS github URLs', () => {
    const url = 'https://github.com/username/my-awesome-project';
    assert.strictEqual(parseGitRepository(url), 'username/my-awesome-project');
  });

  await t.test('should parse HTTPS URLs with .git extension', () => {
    const url = 'https://github.com/username/my-awesome-project.git';
    assert.strictEqual(parseGitRepository(url), 'username/my-awesome-project');
  });

  await t.test('should parse SSH git URLs', () => {
    const url = 'git@github.com:username/my-awesome-project.git';
    assert.strictEqual(parseGitRepository(url), 'username/my-awesome-project');
  });

  await t.test('should parse SSH git URLs without .git extension', () => {
    const url = 'git@github.com:username/my-awesome-project';
    assert.strictEqual(parseGitRepository(url), 'username/my-awesome-project');
  });

  await t.test('should parse SSH git URLs with ssh:// scheme', () => {
    const url = 'ssh://git@github.com/username/my-awesome-project.git';
    assert.strictEqual(parseGitRepository(url), 'username/my-awesome-project');
  });

  await t.test('should handle edge cases and return null/fallback', () => {
    assert.strictEqual(parseGitRepository(''), null);
    assert.strictEqual(parseGitRepository(null), null);
  });
});

test('Smart Detection Utilities', async (t) => {
  const originalCwd = process.cwd();
  let tempDir;

  t.beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cld-test-'));
    process.chdir(tempDir);
  });

  t.afterEach(async () => {
    process.chdir(originalCwd);
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  await t.test('detectProjectType should detect node when package.json exists', async () => {
    await fs.writeFile(path.join(tempDir, 'package.json'), '{}', 'utf-8');
    const type = await detectProjectType();
    assert.strictEqual(type, 'node');
  });

  await t.test('detectProjectType should detect php when index.php exists', async () => {
    await fs.writeFile(path.join(tempDir, 'index.php'), '<?php', 'utf-8');
    const type = await detectProjectType();
    assert.strictEqual(type, 'php');
  });

  await t.test('detectPort should parse EXPOSE from Dockerfile', async () => {
    await fs.writeFile(path.join(tempDir, 'Dockerfile'), 'FROM node\nEXPOSE 8080', 'utf-8');
    const port = await detectPort();
    assert.strictEqual(port, '8080');
  });

  await t.test('detectPort should read from .env file', async () => {
    await fs.writeFile(path.join(tempDir, '.env'), 'PORT=4000\nAPP_PORT=3000\n', 'utf-8');
    const port = await detectPort();
    assert.strictEqual(port, '4000');
  });

  await t.test('detectPort should fallback to framework port', async () => {
    await fs.writeFile(path.join(tempDir, 'package.json'), JSON.stringify({ dependencies: { vite: '^5.0.0' } }), 'utf-8');
    const port = await detectPort();
    assert.strictEqual(port, '5173');
  });

  await t.test('generateDefaultDockerfile should return templates', () => {
    const nodeDoc = generateDefaultDockerfile('node');
    assert.ok(nodeDoc.includes('node:20-alpine'));
    
    const phpDoc = generateDefaultDockerfile('php');
    assert.ok(phpDoc.includes('php:8.2-apache'));
  });
});
