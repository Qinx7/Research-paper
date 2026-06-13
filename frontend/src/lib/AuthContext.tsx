"use client";

import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import type { UserInfo, TokenResponse } from "./types";
import { getToken, setToken, register as apiRegister, login as apiLogin, getMe } from "./api";

interface AuthState {
  user: UserInfo | null;
  token: string | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, username: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserInfo | null>(null);
  const [token, setTokenState] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // 启动时从 localStorage 恢复 token
  useEffect(() => {
    const saved = getToken();
    if (saved) {
      setTokenState(saved);
      getMe()
        .then(setUser)
        .catch(() => {
          setToken(null);
          setTokenState(null);
        })
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  const handleAuth = useCallback(async (result: TokenResponse) => {
    setToken(result.access_token);
    setTokenState(result.access_token);
    setUser({
      id: result.user_id,
      email: result.email,
      username: result.username,
      is_active: true,
      created_at: "",
    });
  }, []);

  const loginFn = useCallback(async (email: string, password: string) => {
    const result = await apiLogin({ email, password });
    await handleAuth(result);
  }, [handleAuth]);

  const registerFn = useCallback(async (email: string, username: string, password: string) => {
    const result = await apiRegister({ email, username, password });
    await handleAuth(result);
  }, [handleAuth]);

  const logout = useCallback(() => {
    setToken(null);
    setTokenState(null);
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, token, loading, login: loginFn, register: registerFn, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
