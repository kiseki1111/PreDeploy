import { readGlobalConfig } from './config.js';

/**
 * Custom error class for Coolify API errors
 */
export class CoolifyApiError extends Error {
  constructor(message, status, responseText) {
    super(message);
    this.name = 'CoolifyApiError';
    this.status = status;
    this.responseText = responseText;
  }
}

/**
 * Internal request helper.
 */
async function makeRequest(endpoint, options = {}) {
  const globalConfig = await readGlobalConfig();
  const { apiUrl, apiToken } = globalConfig;

  if (!apiUrl || !apiToken) {
    throw new Error('Coolify API not configured. Please run "cld init" first.');
  }

  // Ensure base URL does not end with a slash, and starts with http/https
  let baseUrl = apiUrl.trim();
  if (baseUrl.endsWith('/')) {
    baseUrl = baseUrl.slice(0, -1);
  }

  // Ensure v1 path is correct
  const url = `${baseUrl}/api/v1${endpoint}`;

  const headers = {
    'Authorization': `Bearer ${apiToken}`,
    'Accept': 'application/json',
    'Content-Type': 'application/json',
    ...options.headers,
  };

  try {
    const response = await fetch(url, {
      ...options,
      headers,
    });

    const contentType = response.headers.get('content-type') || '';
    let data;
    
    if (contentType.includes('application/json')) {
      data = await response.json();
    } else {
      data = await response.text();
    }

    if (!response.ok) {
      const errorMsg = data && typeof data === 'object' && data.message 
        ? data.message 
        : `API Request failed with status ${response.status}`;
      throw new CoolifyApiError(
        errorMsg,
        response.status,
        typeof data === 'string' ? data : JSON.stringify(data)
      );
    }

    return data;
  } catch (error) {
    if (error instanceof CoolifyApiError) {
      throw error;
    }
    throw new Error(`Koneksi ke server Coolify gagal: ${error.message}`);
  }
}

/**
 * Validates connection and credentials to a Coolify API.
 * @param {string} apiUrl 
 * @param {string} apiToken 
 */
export async function verifyConnection(apiUrl, apiToken) {
  let baseUrl = apiUrl.trim();
  if (baseUrl.endsWith('/')) {
    baseUrl = baseUrl.slice(0, -1);
  }
  const url = `${baseUrl}/api/v1/applications`;

  const response = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${apiToken}`,
      'Accept': 'application/json',
    }
  });

  if (!response.ok) {
    let message = `Status ${response.status}`;
    try {
      const json = await response.json();
      if (json.message) message = json.message;
    } catch (_) {}
    throw new Error(message);
  }

  return true;
}

/**
 * Retrieves a list of all applications.
 */
export async function listApplications() {
  return await makeRequest('/applications');
}

/**
 * Retrieves details for a specific application.
 * @param {string} uuid Application UUID
 */
export async function getApplication(uuid) {
  return await makeRequest(`/applications/${uuid}`);
}

/**
 * Retrieves list of environment variables for a specific application.
 * @param {string} uuid Application UUID
 */
export async function getApplicationEnvs(uuid) {
  return await makeRequest(`/applications/${uuid}/envs`);
}
