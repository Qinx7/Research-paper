"use client";

import PipelineWizard from "@/components/PipelineWizard";

export default function PipelinePage() {
  return (
    <div className="min-h-screen bg-[#faf7f2] paper-texture">
      <header className="sticky top-0 z-50 border-b border-[#3d3830] bg-[#1a1815]">
        <div className="mx-auto flex max-w-6xl items-end justify-between px-6">
          <a href="/" className="group flex flex-col py-4 leading-none">
            <span
              className="mb-0.5 text-[10px] uppercase tracking-[0.25em] text-[#8b7355]"
              style={{ fontFamily: "var(--font-cormorant), serif", letterSpacing: "0.3em" }}
            >
              Research Agent
            </span>
            <span
              className="text-lg font-semibold tracking-wide text-[#e8e0d0] transition-colors group-hover:text-[#d4a745]"
              style={{ fontFamily: "var(--font-cormorant), serif" }}
            >
              学术科研助手
            </span>
          </a>

          <nav className="hidden items-center gap-5 pb-3 md:flex">
            <a href="/" className="text-[11px] uppercase tracking-wide text-[#9b8e7c] transition-colors hover:text-[#d4a745]">
              文献检索
            </a>
            <a href="/research" className="text-[11px] uppercase tracking-wide text-[#9b8e7c] transition-colors hover:text-[#d4a745]">
              研究方向
            </a>
            <a href="/writing" className="text-[11px] uppercase tracking-wide text-[#9b8e7c] transition-colors hover:text-[#d4a745]">
              论文写作
            </a>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-10">
        <div className="mb-6 rounded-[26px] border border-[rgba(26,22,18,0.1)] bg-[#f7f4ec] px-6 py-5 shadow-[0_18px_60px_rgba(26,22,18,0.05)]">
          <p className="text-[11px] uppercase tracking-[0.16em] text-[#9e9282]">Legacy Research Flow</p>
          <h1 className="mt-2 text-2xl font-semibold text-[#1a1612]" style={{ fontFamily: "var(--font-cormorant), serif" }}>
            完整研究流程入口
          </h1>
          <p className="mt-3 text-sm leading-7 text-[#5c5242]">
            首页已经收敛为文献检索入口。如果你需要从需求分析一路生成研究方向、项目设计与成果，这里保留完整研究流程作为过渡入口。
          </p>
        </div>

        <PipelineWizard />
      </main>
    </div>
  );
}
