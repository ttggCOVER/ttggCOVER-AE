import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import type { User } from '@sms/shared';

interface AuthCtx {
  user: User | null;
  token: string | null;
  login: (token: string, user: User) => void;
  logout: () => void;
  loading: boolean;
}

const Ctx = createContext<AuthCtx>(null!);

export function useAuth() {
  return useContext(Ctx);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem('sms_token'));
  const [user, setUser] = useState<User | null>(() => {
    const raw = localStorage.getItem('sms_user');
    return raw ? (JSON.parse(raw) as User) : null;
  });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (token) localStorage.setItem('sms_token', token);
    else localStorage.removeItem('sms_token');
    if (user) localStorage.setItem('sms_user', JSON.stringify(user));
    else localStorage.removeItem('sms_user');
  }, [token, user]);

  function login(t: string, u: User) {
    setToken(t);
    setUser(u);
  }
  function logout() {
    setToken(null);
    setUser(null);
  }

  return <Ctx.Provider value={{ user, token, login, logout, loading }}>{children}</Ctx.Provider>;
}
