import fs from 'fs/promises';
import path from 'path';

/**
 * Detect project type based on files in the workspace
 */
export async function detectProjectType() {
  const cwd = process.cwd();
  
  try {
    await fs.access(path.join(cwd, 'package.json'));
    return 'node';
  } catch (_) {}

  try {
    const isPhp = await fs.access(path.join(cwd, 'composer.json'))
      .then(() => true)
      .catch(async () => {
        try {
          await fs.access(path.join(cwd, 'index.php'));
          return true;
        } catch (_) {
          return false;
        }
      });
    if (isPhp) return 'php';
  } catch (_) {}

  return 'static';
}

/**
 * Detect port by parsing Dockerfile or reading project configurations
 */
export async function detectPort() {
  const cwd = process.cwd();
  
  // 0. Check local .env file first
  try {
    const envPath = path.join(cwd, '.env');
    const content = await fs.readFile(envPath, 'utf-8');
    const lines = content.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const equalsIdx = trimmed.indexOf('=');
      if (equalsIdx !== -1) {
        const key = trimmed.slice(0, equalsIdx).trim();
        let val = trimmed.slice(equalsIdx + 1).trim();
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
          val = val.slice(1, -1);
        }
        if (key === 'PORT' || key === 'APP_PORT' || key === 'CONTAINER_PORT') {
          if (/^\d+$/.test(val)) {
            return val;
          }
        }
      }
    }
  } catch (_) {}

  // 1. Check existing Dockerfiles
  const dockerfiles = ['Dockerfile.coolify', 'Dockerfile'];
  for (const file of dockerfiles) {
    try {
      const content = await fs.readFile(path.join(cwd, file), 'utf-8');
      const match = content.match(/EXPOSE\s+(\d+)/i);
      if (match && match[1]) {
        return match[1];
      }
    } catch (_) {}
  }

  // 2. Check package.json for Node.js projects
  try {
    const pkgContent = await fs.readFile(path.join(cwd, 'package.json'), 'utf-8');
    const pkg = JSON.parse(pkgContent);
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };

    if (deps['next'] || deps['nuxt'] || deps['react-scripts']) {
      return '3000';
    }
    if (deps['vite']) {
      return '5173';
    }
    if (deps['gatsby']) {
      return '8000';
    }
    if (deps['astro']) {
      return '4321';
    }
  } catch (_) {}

  // 3. Check PHP project defaults
  const type = await detectProjectType();
  if (type === 'php') {
    // If it's Laravel, standard artisan port is 8000. For apache/general PHP, Docker usually exposes 80.
    try {
      await fs.access(path.join(cwd, 'artisan'));
      return '8000';
    } catch (_) {
      return '80';
    }
  }

  return '3000';
}

/**
 * Generate a template Dockerfile content based on project type
 */
export function generateDefaultDockerfile(type) {
  if (type === 'node') {
    return `FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev || npm install
COPY . .
EXPOSE 3000
CMD ["npm", "start"]
`;
  }
  
  if (type === 'php') {
    return `FROM php:8.2-apache
COPY . /var/www/html/
EXPOSE 80
`;
  }

  // Fallback / Static
  return `FROM nginx:alpine
COPY . /usr/share/nginx/html
EXPOSE 80
`;
}
