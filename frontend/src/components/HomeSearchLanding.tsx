/** 极简学术搜索首页：首屏聚焦文献检索入口。 */
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/AuthContext";
import type { LibraryScope, ResearchMode } from "@/lib/types";

const SUGGESTIONS = [
  "检索增强生成在多跳推理任务中的最新进展",
  "大语言模型用于高校课堂反馈分析的中文文献",
  "多模态基础模型在教育场景中的应用研究",
];

const MODE_OPTIONS: { value: ResearchMode; label: string }[] = [
  { value: "quick_search", label: "快速" },
  { value: "literature_review", label: "综述" },
  { value: "deep_research", label: "深度" },
];

const SCOPE_OPTIONS: { value: LibraryScope; label: string }[] = [
  { value: "all", label: "全部" },
  { value: "cn", label: "中文" },
  { value: "en", label: "英文" },
];

export default function HomeSearchLanding() {
  const router = useRouter();
  const { user, loading: authLoading, logout } = useAuth();
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState<ResearchMode>("literature_review");
  const [scope, setScope] = useState<LibraryScope>("all");

  const submitSearch = (nextQuery = query) => {
    const trimmed = nextQuery.trim();
    if (!trimmed) return;
    const params = new URLSearchParams({ query: trimmed, mode, scope });
    router.push(`/chat?${params.toString()}`);
  };

  return (
    <div className="min-h-screen bg-[#fbfaf7] text-[#111111]">
      <header className="flex h-16 items-center justify-between border-b border-[#e8e5dc] px-6 md:px-10">
        <a href="/" className="flex items-center gap-3">
          <span className="grid h-9 w-9 place-items-center rounded-full bg-[#111111] text-sm font-semibold text-white">
            研
          </span>
          <span className="text-sm font-semibold tracking-wide">Scholar Research</span>
        </a>

        <nav className="hidden items-center gap-6 text-sm text-[#5f5d57] md:flex">
          <a href="/chat" className="transition-colors hover:text-[#111111]">文献检索</a>
          <a href="/research" className="transition-colors hover:text-[#111111]">研究方向</a>
          <a href="/writing" className="transition-colors hover:text-[#111111]">论文写作</a>
        </nav>

        <div className="flex items-center gap-3">
          {authLoading ? (
            <span className="text-xs text-[#9b978f]">...</span>
          ) : user ? (
            <>
              <span className="hidden text-xs text-[#5f5d57] sm:inline">{user.username}</span>
              <button
                type="button"
                onClick={() => {
                  logout();
                  window.location.reload();
                }}
                className="rounded-full border border-[#dedbd2] px-4 py-2 text-xs text-[#5f5d57] transition-colors hover:border-[#111111] hover:text-[#111111]"
              >
                退出
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => router.push("/login")}
              className="rounded-full bg-[#111111] px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[#2a2a2a]"
            >
              登录
            </button>
          )}
        </div>
      </header>

      <main className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-6xl flex-col px-6">
        <section className="flex flex-1 flex-col items-center justify-center py-16 text-center">
          <div className="mb-7">
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-[#e5e1d6] bg-white px-3 py-1 text-xs text-[#6b675f] shadow-sm">
              <span className="h-2 w-2 rounded-full bg-[#1b7f4b]" />
              文献驱动型科研 Agent
            </div>
            <h1 className="text-balance text-[42px] font-semibold leading-[1.08] tracking-[-0.01em] md:text-[64px]">
              从一个研究问题开始，
              <br className="hidden md:block" />
              检索可信学术文献
            </h1>
            <p className="mx-auto mt-5 max-w-2xl text-base leading-8 text-[#5f5d57]">
              首页只做文献检索。输入论文主题、研究问题或关键词，系统会进入文献搜索工作台并返回可核验的来源。
            </p>
          </div>

          <div className="w-full max-w-4xl rounded-[28px] border border-[#dedbd2] bg-white p-3 text-left shadow-[0_18px_70px_rgba(17,17,17,0.08)]">
            <div className="flex min-h-[76px] items-center gap-3 px-3">
              <textarea
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    submitSearch();
                  }
                }}
                rows={1}
                placeholder="输入研究问题，例如：检索增强生成在多跳推理任务中的最新进展？"
                className="max-h-36 min-h-12 flex-1 resize-none bg-transparent py-4 text-lg leading-7 text-[#111111] outline-none placeholder:text-[#a5a39c]"
              />
              <button
                type="button"
                onClick={() => submitSearch()}
                disabled={!query.trim()}
                className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-[#111111] text-white transition-colors hover:bg-[#2a2a2a] disabled:cursor-not-allowed disabled:bg-[#d8d5cc]"
                title="开始检索"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 12h14" />
                  <path d="m13 6 6 6-6 6" />
                </svg>
              </button>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#eeece6] px-3 py-3">
              <div className="flex flex-wrap items-center gap-2">
                {MODE_OPTIONS.map((option) => (
                  <SegmentButton
                    key={option.value}
                    active={mode === option.value}
                    label={option.label}
                    onClick={() => setMode(option.value)}
                  />
                ))}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {SCOPE_OPTIONS.map((option) => (
                  <SegmentButton
                    key={option.value}
                    active={scope === option.value}
                    label={option.label}
                    onClick={() => setScope(option.value)}
                    muted
                  />
                ))}
              </div>
            </div>
          </div>

          <div className="mt-8 w-full max-w-4xl text-left">
            <p className="mb-3 text-sm font-medium text-[#5f5d57]">试试这些问题：</p>
            <div className="space-y-3">
              {SUGGESTIONS.map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => submitSearch(item)}
                  className="flex w-full items-center justify-between rounded-2xl border border-[#e5e1d6] bg-white px-5 py-4 text-left text-sm text-[#24231f] shadow-sm transition-all hover:border-[#111111] hover:shadow-md"
                >
                  <span>{item}</span>
                  <svg className="shrink-0 text-[#7a776f]" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="11" cy="11" r="7" />
                    <path d="m20 20-3.5-3.5" />
                  </svg>
                </button>
              ))}
            </div>
          </div>
        </section>

        <footer className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 border-t border-[#eeece6] py-6 text-xs text-[#8b887f]">
          <span>CNKI</span>
          <span>Semantic Scholar</span>
          <span>OpenAlex</span>
          <span>CQVIP</span>
          <span>Research Direction</span>
          <span>Paper Writing</span>
        </footer>
      </main>
    </div>
  );
}

function SegmentButton({
  label,
  active,
  muted,
  onClick,
}: {
  label: string;
  active: boolean;
  muted?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-full px-3.5 py-2 text-xs font-medium transition-colors"
      style={{
        background: active ? (muted ? "#f1eee6" : "#111111") : "transparent",
        color: active ? (muted ? "#111111" : "#ffffff") : "#6b675f",
        border: `1px solid ${active ? (muted ? "#dedbd2" : "#111111") : "#e5e1d6"}`,
      }}
    >
      {label}
    </button>
  );
}
