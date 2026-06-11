import test from 'node:test';
import assert from 'node:assert';
import { parseGitRepository } from '../src/utils/git.js';
import { formatEnvValue } from '../src/commands/pull.js';

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

test('Environment Variable Formatting', async (t) => {
  await t.test('should leave simple alphanumeric values unchanged', () => {
    assert.strictEqual(formatEnvValue('simplevalue123'), 'simplevalue123');
    assert.strictEqual(formatEnvValue('true'), 'true');
  });

  await t.test('should wrap values containing spaces in quotes', () => {
    assert.strictEqual(formatEnvValue('value with spaces'), '"value with spaces"');
  });

  await t.test('should wrap values containing single quotes in double quotes', () => {
    assert.strictEqual(formatEnvValue("value'with'quotes"), '"value\'with\'quotes"');
  });

  await t.test('should escape internal double quotes and wrap in double quotes', () => {
    assert.strictEqual(formatEnvValue('value"with"quotes'), '"value\\"with\\"quotes"');
  });

  await t.test('should handle multiline values properly', () => {
    assert.strictEqual(formatEnvValue('line1\nline2'), '"line1\nline2"');
  });

  await t.test('should return empty string for null or undefined', () => {
    assert.strictEqual(formatEnvValue(null), '');
    assert.strictEqual(formatEnvValue(undefined), '');
  });
});
