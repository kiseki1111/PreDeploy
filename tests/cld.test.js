import test from 'node:test';
import assert from 'node:assert';
import { parseGitRepository } from '../src/utils/git.js';

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
