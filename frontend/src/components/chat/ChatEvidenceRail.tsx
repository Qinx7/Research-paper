"use client";

import type { SearchEvidenceBundle, SearchResultItem, ProjectContextItem, SourceStatusInfo } from "@/lib/types";

interface ChatEvidenceRailProps {
  evidence: SearchEvidenceBundle | null;
  isStreaming: boolean;
  statusText: string;
}

const sourceLabels: Record<string, string> = {
  pubmed: "PubMed",
  openalex: "OpenAlex",
  semantic_scholar: "Semantic Scholar",
  crossref: "Crossref",
  arxiv: "arXiv",
  cnki: "CNKI",
  cqvip: "维普",
};

export default function ChatEvidenceRail({ evidence, isStreaming, statusText }: ChatEvidenceRailProps) {
  const external = evidence?.external_papers || [];
  const projectItems = evidence?.project_context_items || [];
  const statuses = evidence?.source_statuses || {};
  const taskId = evidence?.task_id || null;
  const hasEvidence = external.length > 0 || projectItems.length > 0 || Object.keys(statuses).length > 0 || Boolean(taskId);

  return (
    <aside className="hidden xl:flex w-[360px] shrink-0 flex-col border-l border-slate-200 bg-white">
      <div className="border-b border-slate-200 px-5 py-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
              Evidence Monitor
            </p>
            <h2 className="mt-1 text-base font-semibold text-slate-950">检索依据</h2>
            {taskId ? (
              <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.14em] text-slate-400" title={taskId}>
                task · {taskId.slice(0, 8)}
              </p>
            ) : null}
          </div>
          <span className={`h-2.5 w-2.5 rounded-full ${isStreaming ? "bg-cyan-500" : "bg-slate-300"}`} />
        </div>
        <p className="mt-3 text-xs leading-5 text-slate-500">
          {isStreaming ? statusText : hasEvidence ? "最近一次回答的证据快照" : "暂无检索证据"}
        </p>
      </div>

      <div className="grid grid-cols-3 border-b border-slate-200 text-center">
        <Metric label="文献" value={external.length} />
        <Metric label="项目" value={projectItems.length} />
        <Metric label="来源" value={Object.keys(statuses).length} />
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-5">
        {!hasEvidence ? (
          <div className="flex min-h-[420px] flex-col justify-center border border-dashed border-slate-200 bg-slate-50 px-5 text-center">
            <p className="text-sm font-medium text-slate-800">等待检索结果</p>
            <p className="mt-2 text-xs leading-5 text-slate-500">
              开启学术检索后，外部文献、项目材料和来源状态会汇总在这里。
            </p>
          </div>
        ) : (
          <div className="space-y-5">
            <SourceStatusPanel statuses={statuses} />
            <PaperPanel papers={external} />
            <ProjectPanel items={projectItems} />
          </div>
        )}
      </div>
    </aside>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="border-r border-slate-200 py-3 last:border-r-0">
      <p className="text-lg font-semibold tabular-nums text-slate-950">{value}</p>
      <p className="mt-0.5 text-[11px] text-slate-400">{label}</p>
    </div>
  );
}

function SourceStatusPanel({ statuses }: { statuses: Record<string, SourceStatusInfo> }) {
  if (Object.keys(statuses).length === 0) return null;

  return (
    <section>
      <SectionTitle title="来源状态" />
      <div className="mt-3 space-y-2">
        {Object.entries(statuses).map(([source, info]) => (
          <div key={source} className="flex items-center justify-between border border-slate-200 bg-white px-3 py-2">
            <div className="min-w-0">
              <p className="truncate text-xs font-semibold text-slate-800">{sourceLabels[source] || source}</p>
              <p className="mt-0.5 text-[11px] text-slate-400">{formatSourceStatus(info.status, info.count)}</p>
            </div>
            <span className={`h-2 w-2 rounded-full ${statusColor(info.status)}`} />
          </div>
        ))}
      </div>
    </section>
  );
}

function PaperPanel({ papers }: { papers: SearchResultItem[] }) {
  return (
    <section>
      <SectionTitle title="外部文献" count={papers.length} />
      {papers.length === 0 ? (
        <EmptyLine text="暂无相关文献" />
      ) : (
        <div className="mt-3 space-y-3">
          {papers.slice(0, 6).map((paper, index) => (
            <article key={`${paper.title}-${index}`} className="border border-slate-200 bg-slate-50/70 p-3">
              <div className="flex items-start justify-between gap-3">
                <p className="text-xs font-semibold leading-5 text-slate-900">[{index + 1}] {paper.title}</p>
                <div className="flex shrink-0 flex-wrap justify-end gap-1">
                  <span className="border border-cyan-200 bg-cyan-50 px-2 py-0.5 text-[10px] font-medium text-cyan-700">
                    {sourceLabels[paper.source] || paper.source}
                  </span>
                  {paper.is_open_access ? (
                    <span className="border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-700">
                      开放获取
                    </span>
                  ) : null}
                </div>
              </div>
              <p className="mt-2 line-clamp-2 text-[11px] leading-5 text-slate-500">
                {(paper.authors || []).slice(0, 3).join("，") || "未知作者"}
                {paper.year ? ` · ${paper.year}` : ""}
                {paper.venue ? ` · ${paper.venue}` : ""}
              </p>
              {paper.quality_flags?.length ? (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {paper.quality_flags.slice(0, 4).map((flag) => (
                    <span key={flag} className="rounded border border-slate-200 bg-white px-1.5 py-0.5 text-[10px] text-slate-600">
                      {flag}
                    </span>
                  ))}
                </div>
              ) : null}
              <div className="mt-2 flex items-center justify-between text-[11px] text-slate-500">
                <span>被引 {paper.citation_count ?? 0}</span>
                {paper.url && (
                  <a href={paper.url} target="_blank" rel="noreferrer" className="font-medium text-cyan-700 hover:text-cyan-900">
                    原文
                  </a>
                )}
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function ProjectPanel({ items }: { items: ProjectContextItem[] }) {
  return (
    <section>
      <SectionTitle title="项目内证据" count={items.length} />
      {items.length === 0 ? (
        <EmptyLine text="暂无项目资料命中" />
      ) : (
        <div className="mt-3 space-y-3">
          {items.slice(0, 5).map((item, index) => (
            <article key={`${item.title}-${index}`} className="border border-emerald-200 bg-emerald-50/60 p-3">
              <p className="text-xs font-semibold leading-5 text-slate-900">
                [P{index + 1}] {item.kind === "paper_note" ? "内部证据卡片" : item.kind === "project_paper" ? "项目文献" : item.kind} · {item.title}
              </p>
              {item.kind === "paper_note" && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {item.note_type && <EvidenceChip>{noteTypeLabel(item.note_type)}</EvidenceChip>}
                  {item.source_title && <EvidenceChip>{item.source_title}</EvidenceChip>}
                  {typeof item.confidence === "number" && <EvidenceChip>可信度 {item.confidence}/100</EvidenceChip>}
                  {(item.score_reasons || []).slice(0, 3).map((reason) => (
                    <EvidenceChip key={reason}>{reason}</EvidenceChip>
                  ))}
                </div>
              )}
              {item.kind === "project_paper" && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {item.venue && <EvidenceChip>{item.venue}</EvidenceChip>}
                  {item.year && <EvidenceChip>{String(item.year)}</EvidenceChip>}
                  {item.source && <EvidenceChip>{sourceLabels[item.source] || item.source}</EvidenceChip>}
                  {typeof item.citation_count === "number" && <EvidenceChip>引用 {item.citation_count}</EvidenceChip>}
                  {(item.score_reasons || []).slice(0, 3).map((reason) => (
                    <EvidenceChip key={reason}>{reason}</EvidenceChip>
                  ))}
                </div>
              )}
              <p className="mt-2 line-clamp-3 text-[11px] leading-5 text-slate-600">
                {item.kind === "paper_note" ? item.evidence_text || item.content_excerpt : item.content_excerpt}
              </p>
              {item.action_url && (
                <a
                  href={item.action_url.startsWith("/api/") ? `http://127.0.0.1:8000${item.action_url}` : item.action_url}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-2 inline-block text-[11px] font-medium text-emerald-700 hover:text-emerald-900"
                >
                  {item.action_label || "打开材料"}
                </a>
              )}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function EvidenceChip({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded border border-emerald-200 bg-white/70 px-1.5 py-0.5 text-[10px] font-medium text-emerald-800">
      {children}
    </span>
  );
}

function noteTypeLabel(type: string) {
  const labels: Record<string, string> = {
    summary: "摘要笔记",
    quote: "原文摘录",
    method: "方法",
    finding: "发现",
    limitation: "局限",
    idea: "想法",
  };
  return labels[type] || type;
}

function SectionTitle({ title, count }: { title: string; count?: number }) {
  return (
    <div className="flex items-center justify-between">
      <h3 className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">{title}</h3>
      {typeof count === "number" && <span className="text-[11px] text-slate-400">{count}</span>}
    </div>
  );
}

function EmptyLine({ text }: { text: string }) {
  return <div className="mt-3 border border-dashed border-slate-200 bg-slate-50 px-3 py-3 text-xs text-slate-400">{text}</div>;
}

function statusColor(status: string) {
  if (status === "ok") return "bg-emerald-500";
  if (status === "rate_limited" || status === "gateway_timeout") return "bg-amber-500";
  if (status === "error" || status === "http_error" || status === "blocked") return "bg-rose-500";
  return "bg-slate-300";
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
