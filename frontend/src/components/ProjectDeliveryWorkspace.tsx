"use client";

import { useState } from "react";
import { generateHtmlDeckArtifact, openHtmlPreviewWithAuth } from "@/lib/api";
import type { ProjectWorkspaceSnapshot } from "@/lib/types";

const THEME = {
  panel: "#ffffff",
  panelSoft: "#f3f7fb",
  border: "#dfe7ef",
  text: "#16202a",
  muted: "#647282",
  faint: "#93a0ad",
  blue: "#168fe3",
  blueDark: "#0d72bd",
  blueSoft: "#eaf6ff",
  shadow: "0 14px 32px rgba(15, 35, 55, 0.07)",
};

type HtmlDeckTheme = "paper" | "swiss";

export default function ProjectDeliveryWorkspace({
  workspace,
  onOpenResearch,
  onOpenWriting,
}: {
  workspace: ProjectWorkspaceSnapshot | null;
  onOpenResearch: () => void;
  onOpenWriting: () => void;
}) {
  const latestDraft = workspace?.delivery.latest_draft ?? null;
  const [deckMessage, setDeckMessage] = useState<string | null>(null);
  const [generatingDraftDeck, setGeneratingDraftDeck] = useState(false);
  const [htmlDeckTheme, setHtmlDeckTheme] = useState<HtmlDeckTheme>("paper");

  const handlePreviewDraftDeck = async () => {
    if (!latestDraft?.id) return;
    setGeneratingDraftDeck(true);
    setDeckMessage(null);
    try {
      const artifact = await generateHtmlDeckArtifact({
        draft_id: latestDraft.id,
        deck_title: latestDraft.title,
        theme: htmlDeckTheme,
      });
      await openHtmlPreviewWithAuth(artifact.preview_url);
      setDeckMessage("已打开论文草稿 HTML Deck 预览。");
    } catch (error: any) {
      setDeckMessage(error?.message || "论文草稿 HTML Deck 预览失败");
    } finally {
      setGeneratingDraftDeck(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="decorative-rule">
        <p
          className="text-[11px] uppercase tracking-[0.2em] text-[#8b7355]"
          style={{ fontFamily: "var(--font-cormorant), serif" }}
        >
          Delivery Workspace
        </p>
        <h2
          className="mt-1 text-2xl font-semibold text-[#2d2a26]"
          style={{ fontFamily: "var(--font-cormorant), serif" }}
        >
          交付工作台
        </h2>
      </div>

      <section className="rounded-2xl border p-6" style={{ background: THEME.panel, borderColor: THEME.border, boxShadow: THEME.shadow }}>
        <div>
          <p className="text-[11px] uppercase tracking-[0.18em] text-[#8b7355]">HTML Deck Theme</p>
          <p className="mt-1 text-sm text-[#8b7b6b]">实验型网页 Deck 预览将使用这里选择的风格。</p>
        </div>
        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
          <HtmlDeckThemeCard
            title="Paper"
            subtitle="论文页风格"
            description="偏纸面、衬线字体，适合学术汇报和论文导出预览。"
            active={htmlDeckTheme === "paper"}
            onClick={() => setHtmlDeckTheme("paper")}
          />
          <HtmlDeckThemeCard
            title="Swiss"
            subtitle="现代展示风格"
            description="更现代的无衬线演示观感，适合路演、预演和页面展示。"
            active={htmlDeckTheme === "swiss"}
            onClick={() => setHtmlDeckTheme("swiss")}
          />
        </div>
      </section>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        <DeliveryCard
          title="论文草稿"
          subtitle={latestDraft ? `${latestDraft.completion_rate}% 完成 · v${latestDraft.version}` : "尚未创建草稿"}
          description={latestDraft ? `${latestDraft.completed_chapters}/${latestDraft.total_chapters} 章已形成可写作内容。` : "先进入论文工作流创建并生成草稿。"}
          primaryLabel={latestDraft ? "继续写作" : "进入论文工作流"}
          onPrimary={onOpenWriting}
          secondaryLinks={latestDraft ? [
            { label: "下载 DOCX", href: latestDraft.download_docx_url },
            { label: "下载 PDF", href: latestDraft.download_pdf_url },
          ] : []}
          secondaryActions={latestDraft ? [
            { label: generatingDraftDeck ? "生成中..." : "预览 HTML Deck", onClick: handlePreviewDraftDeck, disabled: generatingDraftDeck },
          ] : []}
        />
        <DeliveryCard
          title="通用 PPT"
          subtitle="从研究页继续生成展示材料"
          description="研究页会基于当前项目设计生成通用 PPT，项目页保留论文草稿 HTML Deck 预览。"
          primaryLabel="打开研究页"
          onPrimary={onOpenResearch}
          secondaryLinks={[]}
        />
      </div>

      {deckMessage ? (
        <div className="rounded-2xl border px-4 py-3 text-sm" style={{ background: THEME.panel, borderColor: THEME.border, color: THEME.muted }}>
          {deckMessage}
        </div>
      ) : null}

      <section className="rounded-2xl border p-7" style={{ background: THEME.panel, borderColor: THEME.border, boxShadow: THEME.shadow }}>
        <div className="mb-5">
          <p
            className="text-[11px] uppercase tracking-[0.2em] text-[#8b7355]"
            style={{ fontFamily: "var(--font-cormorant), serif" }}
          >
            Delivery Status
          </p>
          <h3
            className="mt-1 text-xl font-medium text-[#2d2a26]"
            style={{ fontFamily: "var(--font-cormorant), serif" }}
          >
            可交付状态总览
          </h3>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
          <KnowledgeStat label="论文草稿" value={latestDraft ? `${latestDraft.completion_rate}%` : "未开始"} />
          <KnowledgeStat label="通用 PPT" value="可从研究页生成" />
          <KnowledgeStat label="HTML Deck 预览" value={latestDraft ? "可生成" : "待内容"} />
          <KnowledgeStat label="成果材料" value={`${workspace?.stats.outcomes_total ?? 0} 项`} />
        </div>
      </section>
    </div>
  );
}

function DeliveryCard({
  title,
  subtitle,
  description,
  primaryLabel,
  onPrimary,
  secondaryLinks,
  secondaryActions,
}: {
  title: string;
  subtitle: string;
  description: string;
  primaryLabel: string;
  onPrimary: () => void;
  secondaryLinks: { label: string; href: string }[];
  secondaryActions?: { label: string; onClick: () => void; disabled?: boolean }[];
}) {
  return (
    <div className="rounded-2xl border p-6" style={{ background: THEME.panel, borderColor: THEME.border }}>
      <h3 className="text-lg font-medium" style={{ fontFamily: "var(--font-cormorant), serif", color: THEME.text }}>
        {title}
      </h3>
      <p className="mt-2 text-sm" style={{ color: THEME.blueDark }}>{subtitle}</p>
      <p className="mt-4 text-xs leading-relaxed" style={{ color: THEME.muted }}>{description}</p>
      <div className="mt-5 flex flex-wrap gap-2">
        <button
          onClick={onPrimary}
          className="rounded-full px-4 py-2 text-[11px] font-semibold"
          style={{ background: THEME.blue, color: "#ffffff" }}
        >
          {primaryLabel}
        </button>
        {secondaryLinks.map((item) => (
          <a
            key={item.label}
            href={item.href}
            target="_blank"
            rel="noreferrer"
            className="rounded-full border px-4 py-2 text-[11px] font-medium"
            style={{ borderColor: THEME.border, color: THEME.muted }}
          >
            {item.label}
          </a>
        ))}
        {(secondaryActions || []).map((item) => (
          <button
            key={item.label}
            type="button"
            onClick={item.onClick}
            disabled={item.disabled}
            className="rounded-full border px-4 py-2 text-[11px] font-medium disabled:opacity-50"
            style={{ borderColor: THEME.border, color: THEME.muted }}
          >
            {item.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function HtmlDeckThemeCard({
  title,
  subtitle,
  description,
  active,
  onClick,
}: {
  title: string;
  subtitle: string;
  description: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-2xl border p-4 text-left transition-all"
      style={{
        borderColor: active ? "#b8daf7" : THEME.border,
        background: active ? THEME.blueSoft : THEME.panelSoft,
        boxShadow: active ? "0 0 0 1px rgba(24,143,227,0.14)" : "none",
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[11px] uppercase tracking-[0.16em]" style={{ color: THEME.faint }}>{subtitle}</div>
          <div
            className="mt-2 text-lg font-medium"
            style={{ fontFamily: title === "Swiss" ? "\"Helvetica Neue\", Arial, sans-serif" : "var(--font-cormorant), serif", color: THEME.text }}
          >
            {title}
          </div>
        </div>
        <span
          className="rounded-full px-2.5 py-1 text-[10px] uppercase tracking-wide"
          style={{
            background: active ? THEME.panel : THEME.panelSoft,
            color: active ? THEME.blueDark : THEME.muted,
          }}
        >
          {active ? "当前使用" : "可选"}
        </span>
      </div>
      <p className="mt-3 text-xs leading-6" style={{ color: THEME.muted }}>{description}</p>
    </button>
  );
}

function KnowledgeStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border px-4 py-4" style={{ background: THEME.panelSoft, borderColor: THEME.border }}>
      <div className="text-[11px] uppercase tracking-wide" style={{ color: THEME.faint }}>{label}</div>
      <div className="mt-2 text-lg font-medium" style={{ color: THEME.text }}>{value}</div>
    </div>
  );
}
