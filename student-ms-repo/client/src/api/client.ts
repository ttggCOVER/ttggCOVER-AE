// Axios 客户端 — 拦截 401 自动跳登录
import axios, { AxiosError } from 'axios';

export const api = axios.create({
  baseURL: '/api',
  timeout: 30000,
});

// 注入 token
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('sms_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// 401 → 清登录态 + 跳登录（保留当前 path 用于回跳）
api.interceptors.response.use(
  (r) => r,
  (err: AxiosError) => {
    if (err.response?.status === 401) {
      localStorage.removeItem('sms_token');
      localStorage.removeItem('sms_user');
      if (!window.location.pathname.startsWith('/login')) {
        const from = encodeURIComponent(window.location.pathname + window.location.search);
        window.location.href = `/login?from=${from}`;
      }
    }
    return Promise.reject(err);
  },
);

// 提取后端错误 message 的统一辅助
export function apiError(err: unknown): string {
  if (axios.isAxiosError(err)) {
    const data = err.response?.data as { error?: string; rule?: string } | undefined;
    if (data?.error) {
      return data.rule ? `[${data.rule}] ${data.error}` : data.error;
    }
    return err.message;
  }
  return err instanceof Error ? err.message : String(err);
}
