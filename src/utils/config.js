import fs from 'fs/promises';
import path from 'path';
import os from 'os';

const GLOBAL_CONFIG_FILE = path.join(os.homedir(), '.predeploy-global.json');
const LOCAL_CONFIG_FILE = path.join(process.cwd(), '.predeploy.json');

/**
 * Reads global configuration.
 * Returns { apiUrl, apiToken } or empty object.
 */
export async function readGlobalConfig() {
  try {
    const data = await fs.readFile(GLOBAL_CONFIG_FILE, 'utf-8');
    return JSON.parse(data);
  } catch (error) {
    if (error.code === 'ENOENT') {
      return {};
    }
    throw error;
  }
}

/**
 * Writes global configuration.
 * @param {Object} config { apiUrl, apiToken }
 */
export async function writeGlobalConfig(config) {
  const data = JSON.stringify(config, null, 2);
  await fs.writeFile(GLOBAL_CONFIG_FILE, data, 'utf-8');
}

/**
 * Reads local project configuration.
 * Returns { appUuid, name } or empty object.
 */
export async function readLocalConfig() {
  try {
    const data = await fs.readFile(LOCAL_CONFIG_FILE, 'utf-8');
    return JSON.parse(data);
  } catch (error) {
    if (error.code === 'ENOENT') {
      return {};
    }
    throw error;
  }
}

/**
 * Writes local project configuration.
 * @param {Object} config { appUuid, name }
 */
export async function writeLocalConfig(config) {
  const data = JSON.stringify(config, null, 2);
  await fs.writeFile(LOCAL_CONFIG_FILE, data, 'utf-8');
}
