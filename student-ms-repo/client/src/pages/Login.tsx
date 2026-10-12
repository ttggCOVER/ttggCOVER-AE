import { useState } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { GraduationCap, LogIn } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { api } from '../api/client';
import type { LoginResponse } from '@sms/shared';

const SEED_ACCOUNTS = [
  { email: 'admin1@school.local', password: 'password123', label: 'admin 张敏（咨询一部）' },
  { email: 'admin2@school.local', password: 'password123', label: 'admin 李超（咨询二部）' },
  { email: 'teacher1@school.local', password: 'password123', label: 'teacher 王老师' },
];

export function Login() {
  const nav = useNavigate();
  const [params] = useSearchParams();
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit(e?: React.FormEvent, preset?: typeof SEED_ACCOUNTS[number]) {
    e?.preventDefault();
    setErr(null);
    setLoading(true);
    const em = preset?.email ?? email;
    const pw = preset?.password ?? password;
    try {
      const r = await api.post<LoginResponse>('/auth/login', { email: em, password: pw });
      login(r.data.token, r.data.user);
      const from = params.get('from');
      nav(from ? decodeURIComponent(from) : '/dashboard');
    } catch (e: any) {
      setErr(e.response?.data?.error ?? '登录失败');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-brand-soft to-white px-4">
      <div className="w-full max-w-md bg-white rounded-xl shadow-lg border border-gray-200 p-8">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-lg bg-brand text-white flex items-center justify-center">
            <GraduationCap className="w-5 h-5" />
          </div>
          <div>
            <div className="text-lg font-semibold text-ink">学生管理系统</div>
            <div className="text-xs text-ink-soft">Austin Education</div>
          </div>
        </div>
        <p className="text-sm text-ink-soft mb-6">请登录后开始</p>

        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="text-xs text-ink-soft">邮箱</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              placeholder="admin1@school.local"
              className="mt-1 w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:border-brand"
            />
          </div>
          <div>
            <label className="text-xs text-ink-soft">密码</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              placeholder="password123"
              className="mt-1 w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:border-brand"
            />
          </div>
          {err && <div className="text-sm text-bad">{err}</div>}
          <button
            type="submit"
            disabled={loading}
            className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 bg-brand text-white rounded text-sm font-medium hover:bg-brand-dark disabled:opacity-50"
          >
            <LogIn className="w-4 h-4" /> 登录
          </button>
        </form>

        <div className="mt-6 pt-4 border-t border-gray-200">
          <div className="text-xs text-ink-soft mb-2">快捷登录（seed 账号）：</div>
          <div className="space-y-1.5">
            {SEED_ACCOUNTS.map((a) => (
              <button
                key={a.email}
                onClick={(e) => submit(undefined, a)}
                disabled={loading}
                className="w-full text-left px-3 py-1.5 text-xs bg-gray-50 hover:bg-gray-100 rounded border border-gray-200 transition-colors"
              >
                <span className="font-medium text-ink">{a.label}</span>
                <span className="text-ink-soft ml-2">{a.email}</span>
              </button>
            ))}
          </div>
          <div className="text-[11px] text-ink-soft mt-3">
            密码均为 <code className="bg-gray-100 px-1">password123</code>
          </div>
        </div>
      </div>
    </div>
  );
}
