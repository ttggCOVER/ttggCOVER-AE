import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// 从 server/src/ 向上到 server/，再读 .env
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

function required(key: string, fallback?: string): string {
  const v = process.env[key] ?? fallback;
  if (v === undefined || v === '') {
    if (fallback === undefined) {
      // DEEPSEEK_API_KEY 允许空（走降级）
      throw new Error(`[env] missing required env: ${key}`);
    }
    return fallback;
  }
  return v;
}

export const env = {
  PORT: parseInt(process.env.PORT ?? '3001', 10),
  NODE_ENV: process.env.NODE_ENV ?? 'development',
  JWT_SECRET: required('JWT_SECRET', 'dev-secret-change-me-please-32bytes'),
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN ?? '8h',
  // LLM（允许为空 → 走降级）
  DEEPSEEK_API_KEY: process.env.DEEPSEEK_API_KEY ?? '',
  DEEPSEEK_BASE_URL: process.env.DEEPSEEK_BASE_URL ?? 'https://api.deepseek.com',
  DEEPSEEK_MODEL: process.env.DEEPSEEK_MODEL ?? 'deepseek-chat',
  CLIENT_ORIGIN: process.env.CLIENT_ORIGIN ?? 'http://localhost:5173',
  TZ: process.env.TZ ?? 'Australia/Melbourne',
};

export type Env = typeof env;
