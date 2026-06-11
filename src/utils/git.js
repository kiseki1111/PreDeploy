import { exec } from 'child_process';
import { promisify } from 'util';

const execPromise = promisify(exec);

/**
 * Gets the remote origin URL of the current git repository.
 * Returns the URL string, or null if not a git repository or no remote.
 */
export async function getGitRemoteUrl() {
  try {
    const { stdout } = await execPromise('git config --get remote.origin.url');
    return stdout.trim();
  } catch (error) {
    return null;
  }
}

/**
 * Gets the active branch name of the current git repository.
 * Returns the branch name, or null.
 */
export async function getGitBranch() {
  try {
    const { stdout } = await execPromise('git branch --show-current');
    return stdout.trim();
  } catch (error) {
    return null;
  }
}

/**
 * Parses git remote URL into a clean repository format, e.g. "username/repo"
 * @param {string} url The git remote URL (HTTPS or SSH)
 */
export function parseGitRepository(url) {
  if (!url) return null;
  
  // Strip trailing .git
  let cleaned = url.trim();
  if (cleaned.endsWith('.git')) {
    cleaned = cleaned.slice(0, -4);
  }
  
  // Format 1: git@github.com:username/repo
  // Format 2: ssh://git@github.com/username/repo
  // Format 3: https://github.com/username/repo
  
  // Check if SSH format (contains git@ and :)
  if (cleaned.includes('git@')) {
    // Split by '@' to separate user/host, then get the part after the host
    const afterAt = cleaned.split('git@')[1];
    // The path could be separated by ':' (GitHub/GitLab SSH standard) or '/'
    const separatorIndex = afterAt.indexOf(':');
    if (separatorIndex !== -1) {
      return afterAt.slice(separatorIndex + 1);
    }
    const slashIndex = afterAt.indexOf('/');
    if (slashIndex !== -1) {
      return afterAt.slice(slashIndex + 1);
    }
  }
  
  // Check if HTTP/HTTPS format
  try {
    const parsedUrl = new URL(cleaned);
    // Path name starts with /username/repo
    // We slice the leading slash and return
    let pathname = parsedUrl.pathname;
    if (pathname.startsWith('/')) {
      pathname = pathname.slice(1);
    }
    return pathname;
  } catch (e) {
    // If not a valid URL (e.g. customized host config in SSH)
    // Try simple regex or manual splitting
    const parts = cleaned.split('/');
    if (parts.length >= 2) {
      return `${parts[parts.length - 2]}/${parts[parts.length - 1]}`;
    }
  }
  
  return cleaned;
}
