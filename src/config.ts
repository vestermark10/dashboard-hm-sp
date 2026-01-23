/**
 * Frontend Configuration
 *
 * Vite automatically sets import.meta.env.MODE based on the command:
 * - "development" when running `npm run dev`
 * - "production" when running `npm run build`
 */

const config = {
  development: {
    apiBaseUrl: 'http://localhost:3001',
  },
  production: {
    apiBaseUrl: 'http://192.168.1.130:3001',
  },
} as const;

type Environment = keyof typeof config;

const currentEnv = (import.meta.env.MODE as Environment) || 'development';

export const API_BASE_URL = config[currentEnv].apiBaseUrl;
