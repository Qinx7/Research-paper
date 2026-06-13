"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/AuthContext";

export default function LoginPage() {
  const router = useRouter();
  const { login, register } = useAuth();

  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      if (mode === "login") {
        await login(email, password);
      } else {
        await register(email, username, password);
      }
      router.push("/");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "操作失败");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#faf7f2] paper-texture flex items-center justify-center">
      {/* 装饰元素 —— 左上角刊名 */}
      <div className="fixed top-6 left-8 hidden lg:block">
        <a
          href="/"
          className="text-[10px] tracking-[0.3em] uppercase text-[#b8a898] hover:text-[#8b7355] transition-colors"
          style={{ fontFamily: "var(--font-cormorant), serif" }}
        >
          Research Agent
        </a>
      </div>

      {/* 表单卡片 */}
      <div className="relative w-full max-w-md mx-4">
        {/* 卡片阴影层 —— 增加深度 */}
        <div className="absolute inset-0 bg-[#1a1815]/5 rounded-sm translate-y-1" />

        <div className="relative bg-white border border-[#e8e1d5] rounded-sm p-10 shadow-lg">
          {/* 刊头 */}
          <div className="text-center mb-10">
            <p
              className="text-[10px] tracking-[0.25em] uppercase text-[#8b7355] mb-2"
              style={{ fontFamily: "var(--font-cormorant), serif" }}
            >
              Research Agent
            </p>
            <p
              className="text-2xl font-semibold text-[#2d2a26] mb-1"
              style={{ fontFamily: "var(--font-cormorant), serif" }}
            >
              学术科研助手
            </p>
            <div className="flex justify-center mt-3">
              <span className="block w-8 h-[1px] bg-[#b8860b]" />
            </div>
          </div>

          {/* 错误提示 */}
          {error && (
            <div className="bg-[#fef2f2] border border-[#f5c6cb] rounded-sm p-3 mb-6 text-xs text-[#a33]">
              {error}
            </div>
          )}

          {/* 表单 */}
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-[11px] tracking-wider uppercase text-[#8b7355] mb-2">
                邮箱
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="example@email.com"
                required
                className="w-full px-0 py-2 bg-transparent border-0 border-b border-[#d4c8b0]
                           text-sm text-[#2d2a26] placeholder:text-[#c4b8a8]
                           focus:outline-none focus:border-[#b8860b] transition-colors"
              />
            </div>

            {mode === "register" && (
              <div>
                <label className="block text-[11px] tracking-wider uppercase text-[#8b7355] mb-2">
                  用户名
                </label>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="至少 2 个字符"
                  required
                  minLength={2}
                  className="w-full px-0 py-2 bg-transparent border-0 border-b border-[#d4c8b0]
                             text-sm text-[#2d2a26] placeholder:text-[#c4b8a8]
                             focus:outline-none focus:border-[#b8860b] transition-colors"
                />
              </div>
            )}

            <div>
              <label className="block text-[11px] tracking-wider uppercase text-[#8b7355] mb-2">
                密码
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="至少 6 位"
                required
                minLength={6}
                className="w-full px-0 py-2 bg-transparent border-0 border-b border-[#d4c8b0]
                           text-sm text-[#2d2a26] placeholder:text-[#c4b8a8]
                           focus:outline-none focus:border-[#b8860b] transition-colors"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 mt-2 bg-[#1a1815] text-[#d4a745] text-xs tracking-[0.2em]
                         uppercase hover:bg-[#2d2a26] hover:text-[#e8c86a]
                         disabled:opacity-40 disabled:cursor-not-allowed
                         transition-all duration-300"
            >
              {loading ? "处理中..." : mode === "login" ? "登录" : "创建账户"}
            </button>
          </form>

          {/* 切换模式 */}
          <div className="mt-8 pt-6 border-t border-[#f0ebe0] text-center">
            <span className="text-xs text-[#b8a898]">
              {mode === "login" ? "还没有账户？" : "已有账户？"}
            </span>
            <button
              onClick={() => { setMode(mode === "login" ? "register" : "login"); setError(null); }}
              className="ml-2 text-xs text-[#8b7355] hover:text-[#b8860b] font-medium transition-colors
                         tracking-wide uppercase"
            >
              {mode === "login" ? "注册" : "登录"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
