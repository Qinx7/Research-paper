"use client";

// 聊天消息区：渲染对话、流式状态，以及与回答绑定的文献依据。
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { renderMarkdown } from "@/lib/markdown";
import type { ChatMessage, SearchEvidenceBundle, SearchResultItem, ProjectContextItem } from "@/lib/types";
import ThinkingIndicator from "./ThinkingIndicator";
import { CHAT_THEME, SOURCE_LABELS } from "./chatTheme";

interface ChatMessagesProps {
  messages: ChatMessage[];
  streamingContent: string;
  streamingEvidence: SearchEvidenceBundle | null;
  isStreaming: boolean;
  statusText: string;
}

type AnalysisTab = "overview" | "evidence" | "limits";

export default function ChatMessages({
  messages,
  streamingContent,
  streamingEvidence,
  isStreaming,
  statusText,
}: ChatMessagesProps) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const streamScopeRef = useRef<string | null>(null);
  if (!streamScopeRef.current) streamScopeRef.current = Math.random().toString(36).slice(2, 8);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamingContent, statusText]);

  if (messages.length === 0 && !isStreaming) {
    return (
      <div className="flex-1 overflow-y-auto px-7 py-6" style={{ background: CHAT_THEME.bg }}>
        <div className="mx-auto flex min-h-full max-w-[820px] items-center">
          <div className="w-full">
            <div className="mb-7 flex items-start gap-3">
              <AiAvatar />
              <div className="min-w-0 flex-1">
                <MessageBubble>
                  <p className="whitespace-pre-wrap">
                    您好，我是 Scholar AI。请输入研究问题、论文主题或关键词，我会优先返回可核验的学术文献结果。
                    {"\n\n"}
                    文献搜索只负责检索和展示依据；研究方向分析与论文写作请从左侧模块进入。
                  </p>
                </MessageBubble>
                <MessageTime value="09:00" align="left" />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <StarterCard title="快速检索" text="适合查找某个主题下的核心论文。" />
              <StarterCard title="综述模式" text="适合了解研究脉络、热点和空白。" />
              <StarterCard title="深度检索" text="适合需要更充分依据的论文准备。" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto px-7 py-6" style={{ background: CHAT_THEME.bg, scrollbarWidth: "none" }}>
      <div className="mx-auto max-w-[820px]">
        {messages.map((message) => (
          <MessageItem key={message.id} message={message} />
        ))}

        {isStreaming && (
          <AssistantBlock
            id={streamScopeRef.current}
            content={streamingContent}
            evidence={streamingEvidence}
            fallback={<ThinkingIndicator text={statusText || "正在思考"} />}
          />
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}

function MessageItem({ message }: { message: ChatMessage }) {
  if (message.role === "user") {
    return <UserBlock content={message.content} createdAt={message.created_at} />;
  }

  return (
    <AssistantBlock
      id={message.id}
      content={message.content}
      evidence={normalizeEvidence(message.search_results)}
      createdAt={message.created_at}
    />
  );
}

function AssistantBlock({
  id,
  content,
  evidence,
  createdAt,
  fallback,
}: {
  id: string;
  content: string;
  evidence: SearchEvidenceBundle | null;
  createdAt?: string;
  fallback?: ReactNode;
}) {
  return (
    <div className="mb-7 flex items-start gap-3">
      <AiAvatar />
      <div className="min-w-0 flex-1">
        <MessageBubble>
          {content ? (
            <div className="prose prose-sm max-w-none" style={{ color: CHAT_THEME.text }}>
              {renderMarkdown(content, id)}
            </div>
          ) : (
            fallback
          )}
        </MessageBubble>
        <MessageTime value={createdAt} align="left" />
        {evidence && <EvidenceResults evidence={evidence} />}
      </div>
    </div>
  );
}

function UserBlock({ content, createdAt }: { content: string; createdAt: string }) {
  return (
    <div className="mb-7 flex justify-end">
      <div className="flex items-start gap-3">
        <div>
          <div
            className="max-w-[480px] rounded-xl px-4 py-3 text-[13.5px] leading-7"
            style={{ background: CHAT_THEME.primary, color: CHAT_THEME.card }}
          >
            <p className="whitespace-pre-wrap">{content}</p>
          </div>
          <MessageTime value={createdAt} align="right" />
        </div>
        <div
          className="mt-0.5 flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-full text-[11px] font-semibold"
          style={{ background: CHAT_THEME.muted, color: CHAT_THEME.mid }}
        >
          我
        </div>
      </div>
    </div>
  );
}

function EvidenceResults({ evidence }: { evidence: SearchEvidenceBundle }) {
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const [selectedPaper, setSelectedPaper] = useState<SearchResultItem | null>(null);
  const external = evidence.external_papers || [];
  const projectItems = evidence.project_context_items || [];
  const statuses = evidence.source_statuses || {};
  const hasEvidence = external.length > 0 || projectItems.length > 0;

  return (
    <div className="mt-4">
      <div className="mb-3 flex items-center gap-2">
        <div className="h-px flex-1" style={{ background: CHAT_THEME.border }} />
        <span className="text-[11px] uppercase tracking-[0.08em]" style={{ color: CHAT_THEME.low }}>
          {hasEvidence ? `找到 ${external.length} 篇文献${projectItems.length ? ` · ${projectItems.length} 条内部依据` : ""}` : "暂无相关文献"}
        </span>
        <div className="h-px flex-1" style={{ background: CHAT_THEME.border }} />
      </div>

      {Object.keys(statuses).length > 0 && (
        <div className="mb-3 flex flex-wrap gap-2">
          {Object.entries(statuses).map(([source, info]) => (
            <span
              key={source}
              className="rounded px-2 py-1 text-[11px]"
              style={{
                background: CHAT_THEME.primarySoft,
                border: `1px solid ${CHAT_THEME.border}`,
                color: CHAT_THEME.mid,
              }}
            >
              {SOURCE_LABELS[source] || source} · {formatSourceStatus(info.status, info.count)}
            </span>
          ))}
        </div>
      )}

      {!hasEvidence && (
        <div
          className="rounded-lg px-4 py-3 text-xs"
          style={{ background: CHAT_THEME.card, border: `1px dashed ${CHAT_THEME.border}`, color: CHAT_THEME.low }}
        >
          暂无相关文献
        </div>
      )}

      {external.length > 0 && (
        <div className="flex flex-col gap-3">
          {external.slice(0, 6).map((paper, index) => {
            const key = `${paper.source}-${paper.title}-${index}`;
            return (
              <PaperCard
                key={key}
                paper={paper}
                index={index + 1}
                expanded={expandedKey === key}
                onToggle={() => setExpandedKey(expandedKey === key ? null : key)}
                onAnalyze={() => setSelectedPaper(paper)}
              />
            );
          })}
        </div>
      )}

      {projectItems.length > 0 && (
        <div className="mt-3 flex flex-col gap-2.5">
          {projectItems.slice(0, 4).map((item, index) => (
            <ProjectEvidenceCard key={`${item.title}-${index}`} item={item} index={index + 1} />
          ))}
        </div>
      )}

      {selectedPaper && <PaperAnalysisPanel paper={selectedPaper} onClose={() => setSelectedPaper(null)} />}
    </div>
  );
}

function PaperCard({
  paper,
  index,
  expanded,
  onToggle,
  onAnalyze,
}: {
  paper: SearchResultItem;
  index: number;
  expanded: boolean;
  onToggle: () => void;
  onAnalyze: () => void;
}) {
  const sourceLabel = SOURCE_LABELS[paper.source] || paper.source;
  const authors = formatAuthors(paper.authors);
  const hasAbstract = Boolean(paper.abstract?.trim());

  return (
    <article
      className="overflow-hidden rounded-xl transition-all"
      style={{
        background: CHAT_THEME.card,
        border: `1px solid ${expanded ? CHAT_THEME.accentBorder : CHAT_THEME.border}`,
        boxShadow: expanded ? "0 14px 34px rgba(24,35,43,0.08)" : "none",
      }}
    >
      <button type="button" onClick={onToggle} className="flex w-full items-start gap-3 p-4 text-left">
        <span
          className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded text-[10px] font-bold"
          style={{ background: CHAT_THEME.primary, color: CHAT_THEME.card, fontFamily: "monospace" }}
        >
          {index}
        </span>
        <span className="min-w-0 flex-1">
          <span className="mb-1.5 flex flex-wrap items-center gap-1.5">
            <SourceBadge source={paper.source} />
            {paper.venue && (
              <span className="text-[11.5px]" style={{ color: CHAT_THEME.mid }}>
                {paper.venue}
              </span>
            )}
            {paper.year && (
              <span className="rounded px-1.5 py-0.5 text-[10.5px]" style={{ background: CHAT_THEME.muted, color: CHAT_THEME.mid, fontFamily: "monospace" }}>
                {paper.year}
              </span>
            )}
          </span>
          <span className="block text-[15px] font-semibold leading-5" style={{ color: CHAT_THEME.text, fontFamily: "var(--font-cormorant), serif" }}>
            {paper.title}
          </span>
          <span className="mt-1.5 block text-[12px] leading-5" style={{ color: CHAT_THEME.mid, fontFamily: "monospace" }}>
            {authors}
          </span>
        </span>
        <span className="flex shrink-0 items-center gap-2">
          <span className="text-[11.5px]" style={{ color: CHAT_THEME.accent }}>
            被引 {paper.citation_count ?? 0}
          </span>
          <ChevronIcon expanded={expanded} />
        </span>
      </button>

      <div style={{ borderTop: `1px solid rgba(24,35,43,0.07)` }}>
        <div className="px-4 py-4">
          <p className={`text-[13px] leading-7 ${expanded ? "" : "line-clamp-4"}`} style={{ color: CHAT_THEME.text }}>
            {hasAbstract ? paper.abstract : "当前来源未返回摘要。建议打开原文或切换检索范围获取更完整的文献信息。"}
          </p>

          <div className="mt-3 flex flex-wrap gap-1.5">
            <MetaChip>{sourceLabel}</MetaChip>
            {paper.year && <MetaChip>{String(paper.year)}</MetaChip>}
            {paper.venue && <MetaChip>{paper.venue}</MetaChip>}
            <MetaChip>引用 {paper.citation_count ?? 0}</MetaChip>
          </div>

          <div className="mt-4 flex items-center gap-2 pt-3" style={{ borderTop: `1px solid rgba(24,35,43,0.07)` }}>
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onAnalyze();
              }}
              className="rounded-lg px-4 py-2 text-[12.5px] font-medium"
              style={{ background: CHAT_THEME.primary, color: CHAT_THEME.card }}
            >
              深度分析
            </button>
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onToggle();
              }}
              className="rounded-lg px-3 py-2 text-[12px]"
              style={{ background: CHAT_THEME.muted, color: CHAT_THEME.mid }}
            >
              {expanded ? "收起摘要" : "展开摘要"}
            </button>
            {paper.url && (
              <a
                href={paper.url}
                target="_blank"
                rel="noreferrer"
                className="ml-auto text-[11.5px] font-medium"
                style={{ color: CHAT_THEME.accent }}
                onClick={(event) => event.stopPropagation()}
              >
                打开原文
              </a>
            )}
          </div>
        </div>
      </div>
    </article>
  );
}

function PaperAnalysisPanel({ paper, onClose }: { paper: SearchResultItem; onClose: () => void }) {
  const [tab, setTab] = useState<AnalysisTab>("overview");
  const sourceLabel = SOURCE_LABELS[paper.source] || paper.source;
  const authors = formatAuthors(paper.authors, 4);

  return (
    <div
      className="fixed inset-0 z-40 flex"
      style={{ background: "rgba(24,35,43,0.28)" }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="flex-1" />
      <aside
        className="flex h-full w-[62%] min-w-[560px] flex-col overflow-hidden"
        style={{ background: CHAT_THEME.bg, borderLeft: `1px solid ${CHAT_THEME.border}` }}
      >
        <div className="flex items-start gap-4 px-6 pb-4 pt-5" style={{ background: CHAT_THEME.card, borderBottom: `1px solid ${CHAT_THEME.border}` }}>
          <div className="min-w-0 flex-1">
            <div className="mb-2.5 flex flex-wrap items-center gap-2">
              <SourceBadge source={paper.source} />
              {paper.venue && <MetaChip>{paper.venue}</MetaChip>}
              {paper.year && <MetaChip>{String(paper.year)}</MetaChip>}
              <span className="rounded px-2 py-0.5 text-xs" style={{ background: CHAT_THEME.accentSoft, color: CHAT_THEME.accentLight, border: `1px solid ${CHAT_THEME.accentBorder}` }}>
                {paper.citation_count ?? 0} 引用
              </span>
            </div>
            <h2 className="text-[17px] font-semibold leading-6" style={{ color: CHAT_THEME.text, fontFamily: "var(--font-cormorant), serif" }}>
              {paper.title}
            </h2>
            <p className="mt-1.5 text-[12px]" style={{ color: CHAT_THEME.mid, fontFamily: "monospace" }}>
              {authors}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="grid h-8 w-8 shrink-0 place-items-center rounded-full"
            style={{ background: CHAT_THEME.muted, color: CHAT_THEME.mid }}
            title="关闭"
          >
            ×
          </button>
        </div>

        <div className="flex items-center gap-2 px-6 py-3" style={{ background: CHAT_THEME.card, borderBottom: `1px solid ${CHAT_THEME.border}` }}>
          {paper.url && (
            <a
              href={paper.url}
              target="_blank"
              rel="noreferrer"
              className="rounded-lg px-4 py-2 text-[12.5px] font-medium"
              style={{ background: CHAT_THEME.primary, color: CHAT_THEME.card }}
            >
              打开原文链接
            </a>
          )}
          <span className="text-xs" style={{ color: CHAT_THEME.low }}>
            基于当前检索返回的题名、摘要和元数据展示
          </span>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5" style={{ scrollbarWidth: "none" }}>
          <section className="mb-5" style={{ borderBottom: `1px solid ${CHAT_THEME.border}` }}>
            <SectionTitle label="摘要" />
            <p className="pb-5 text-[13.5px] leading-7" style={{ color: CHAT_THEME.text }}>
              {paper.abstract?.trim() || "当前来源未返回摘要，因此这里不补写不存在的内容。"}
            </p>
          </section>

          <div className="mb-5 flex gap-1 rounded-xl p-1" style={{ background: CHAT_THEME.card, border: `1px solid ${CHAT_THEME.border}` }}>
            {[
              ["overview", "概要分析"],
              ["evidence", "依据字段"],
              ["limits", "可信边界"],
            ].map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setTab(value as AnalysisTab)}
                className="flex-1 rounded-lg py-2 text-[12px] font-medium transition-colors"
                style={{
                  background: tab === value ? CHAT_THEME.bg : "transparent",
                  border: tab === value ? `1px solid ${CHAT_THEME.border}` : "1px solid transparent",
                  color: tab === value ? CHAT_THEME.text : CHAT_THEME.low,
                }}
              >
                {label}
              </button>
            ))}
          </div>

          <AnalysisContent tab={tab} paper={paper} sourceLabel={sourceLabel} />
        </div>
      </aside>
    </div>
  );
}

function AnalysisContent({
  tab,
  paper,
  sourceLabel,
}: {
  tab: AnalysisTab;
  paper: SearchResultItem;
  sourceLabel: string;
}) {
  if (tab === "evidence") {
    return (
      <div className="space-y-3">
        <FactRow label="来源" value={sourceLabel} />
        <FactRow label="年份" value={paper.year ? String(paper.year) : "未返回"} />
        <FactRow label="期刊/会议" value={paper.venue || "未返回"} />
        <FactRow label="作者" value={formatAuthors(paper.authors, 8)} />
        <FactRow label="引用数" value={`${paper.citation_count ?? 0}`} />
      </div>
    );
  }

  if (tab === "limits") {
    return (
      <div className="space-y-3">
        <InsightCard index={1} text={paper.abstract ? "当前分析主要依据检索源返回的摘要与元数据，尚不能替代全文精读。" : "该来源未返回摘要，当前只能确认题名、来源和部分元数据。"} />
        <InsightCard index={2} text="若用于论文写作，建议打开原文核对研究方法、样本、结论和引用格式。" />
        <InsightCard index={3} text="系统不会在缺少字段时补造 DOI、实验数据或全文结论。" />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <InsightCard index={1} text={`这篇文献来自 ${sourceLabel}，可作为当前回答的一条外部文献依据。`} />
      <InsightCard index={2} text={paper.venue ? `返回的发表载体为 ${paper.venue}，年份为 ${paper.year || "未返回"}。` : "当前来源未返回发表载体，建议打开原文进一步核对。"} />
      <InsightCard index={3} text={paper.abstract ? "摘要字段已返回，可用于判断与问题的主题相关性。" : "摘要字段缺失，相关性判断需要依赖题名和来源元数据。"} />
    </div>
  );
}

function ProjectEvidenceCard({ item, index }: { item: ProjectContextItem; index: number }) {
  return (
    <article
      className="rounded-xl px-4 py-3"
      style={{ background: CHAT_THEME.successSoft, border: `1px solid rgba(46,107,91,0.22)` }}
    >
      <p className="text-[12.5px] font-medium leading-5" style={{ color: CHAT_THEME.text }}>
        [P{index}] {item.kind} · {item.title}
      </p>
      <p className="mt-1.5 line-clamp-3 text-[11px] leading-5" style={{ color: CHAT_THEME.mid }}>
        {item.content_excerpt}
      </p>
      {item.action_url && (
        <a
          href={item.action_url.startsWith("/api/") ? `http://127.0.0.1:8000${item.action_url}` : item.action_url}
          target="_blank"
          rel="noreferrer"
          className="mt-2 inline-block text-[11px] font-medium"
          style={{ color: CHAT_THEME.success }}
        >
          {item.action_label || "打开材料"}
        </a>
      )}
    </article>
  );
}

function MessageBubble({ children }: { children: ReactNode }) {
  return (
    <div
      className="rounded-xl px-4 py-3 text-[13.5px] leading-7"
      style={{ background: CHAT_THEME.card, border: `1px solid ${CHAT_THEME.border}`, color: CHAT_THEME.text }}
    >
      {children}
    </div>
  );
}

function StarterCard({ title, text }: { title: string; text: string }) {
  return (
    <div className="rounded-xl px-4 py-4" style={{ background: CHAT_THEME.card, border: `1px solid ${CHAT_THEME.border}` }}>
      <h3 className="text-[13px] font-semibold" style={{ color: CHAT_THEME.text }}>
        {title}
      </h3>
      <p className="mt-2 text-[12px] leading-5" style={{ color: CHAT_THEME.mid }}>
        {text}
      </p>
    </div>
  );
}

function AiAvatar() {
  return (
    <div
      className="mt-0.5 flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-full text-[10px] font-bold"
      style={{ background: CHAT_THEME.primary, color: CHAT_THEME.card }}
    >
      AI
    </div>
  );
}

function MessageTime({ value, align }: { value?: string; align: "left" | "right" }) {
  const text = useMemo(() => formatTime(value), [value]);
  if (!text) return null;
  return (
    <div className={`mt-1 text-[11px] ${align === "right" ? "text-right" : "text-left"}`} style={{ color: CHAT_THEME.low }}>
      {text}
    </div>
  );
}

function SourceBadge({ source }: { source: string }) {
  return (
    <span className="rounded px-1.5 py-0.5 text-[10.5px] font-medium" style={{ background: CHAT_THEME.accentSoft, color: CHAT_THEME.accentLight }}>
      {SOURCE_LABELS[source] || source}
    </span>
  );
}

function MetaChip({ children }: { children: ReactNode }) {
  return (
    <span className="rounded px-2 py-0.5 text-[11px]" style={{ background: CHAT_THEME.muted, color: CHAT_THEME.mid }}>
      {children}
    </span>
  );
}

function SectionTitle({ label }: { label: string }) {
  return (
    <div className="mb-3 flex items-center gap-1.5">
      <span className="h-4 w-0.5 rounded-full" style={{ background: CHAT_THEME.primary }} />
      <span className="text-[11.5px] font-medium tracking-[0.03em]" style={{ color: CHAT_THEME.text }}>
        {label}
      </span>
    </div>
  );
}

function FactRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl px-4 py-3" style={{ background: CHAT_THEME.card, border: `1px solid ${CHAT_THEME.border}` }}>
      <div className="text-[11px]" style={{ color: CHAT_THEME.low }}>{label}</div>
      <div className="mt-1 text-[13px] leading-6" style={{ color: CHAT_THEME.text }}>{value}</div>
    </div>
  );
}

function InsightCard({ index, text }: { index: number; text: string }) {
  return (
    <div className="flex gap-3 rounded-xl px-4 py-3" style={{ background: CHAT_THEME.card, border: `1px solid ${CHAT_THEME.border}` }}>
      <span className="shrink-0 text-[10px]" style={{ color: CHAT_THEME.low, fontFamily: "monospace" }}>
        {String(index).padStart(2, "0")}
      </span>
      <p className="text-[13.5px] leading-7" style={{ color: CHAT_THEME.text }}>{text}</p>
    </div>
  );
}

function ChevronIcon({ expanded }: { expanded: boolean }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke={CHAT_THEME.low}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ transform: expanded ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.2s" }}
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

function normalizeEvidence(
  payload: ChatMessage["search_results"] | SearchEvidenceBundle | null | undefined,
): SearchEvidenceBundle | null {
  if (!payload) return null;
  if (Array.isArray(payload)) {
    return {
      external_papers: payload,
      project_context_items: [],
    };
  }
  return payload;
}

function formatAuthors(authors: string[] | null | undefined, limit = 3) {
  if (!authors || authors.length === 0) return "未知作者";
  const visible = authors.slice(0, limit).join(", ");
  return authors.length > limit ? `${visible} et al.` : visible;
}

function formatTime(value?: string) {
  if (!value) return "";
  if (/^\d{2}:\d{2}$/.test(value)) return value;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatSourceStatus(status: string, count: number) {
  if (status === "ok") return `已返回 ${count} 条`;
  if (status === "no_results") return "暂无结果";
  if (status === "rate_limited") return "当前限流";
  if (status === "gateway_timeout") return "服务超时";
  if (status === "blocked") return "访问受限";
  if (status === "error" || status === "http_error") return "请求失败";
  return count > 0 ? `已返回 ${count} 条` : "状态未知";
}
