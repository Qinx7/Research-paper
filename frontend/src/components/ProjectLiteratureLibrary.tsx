/** 项目文献库：展示从首页检索结果沉淀到项目中的文献。 */
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getProjectLiteratureMatrix, listProjectPapers, removeProjectPaper } from "@/lib/api";
import type { LiteratureMatrixResult, SavedPaper } from "@/lib/types";

export default function ProjectLiteratureLibrary({
  projectId,
  highlightedPaperId = null,
}: {
  projectId: string;
  highlightedPaperId?: string | null;
}) {
  const router = useRouter();
  const [papers, setPapers] = useState<SavedPaper[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [matrix, setMatrix] = useState<LiteratureMatrixResult | null>(null);
  const [matrixLoading, setMatrixLoading] = useState(false);
  const [matrixMessage, setMatrixMessage] = useState<string | null>(null);

  const loadPapers = () => {
    setLoading(true);
    setError(null);
    listProjectPapers(projectId)
      .then(setPapers)
      .catch((err) => setError(err instanceof Error ? err.message : "文献库加载失败"))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadPapers();
  }, [projectId]);

  useEffect(() => {
    if (!highlightedPaperId || !papers.length) return;
    const timer = window.setTimeout(() => {
      const node = document.getElementById(`project-paper-${highlightedPaperId}`);
      node?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 120);
    return () => window.clearTimeout(timer);
  }, [highlightedPaperId, papers]);

  const handleRemove = async (paperId: string) => {
    setRemovingId(paperId);
    try {
      await removeProjectPaper(projectId, paperId);
      setPapers((items) => items.filter((paper) => paper.id !== paperId));
    } catch (err) {
      setError(err instanceof Error ? err.message : "移除文献失败");
    } finally {
      setRemovingId(null);
    }
  };

  const handleLoadMatrix = async () => {
    setMatrixLoading(true);
    setMatrixMessage(null);
    try {
      const result = await getProjectLiteratureMatrix(projectId);
      setMatrix(result);
    } catch (err) {
      setMatrixMessage(err instanceof Error ? err.message : "文献矩阵生成失败");
    } finally {
      setMatrixLoading(false);
    }
  };

  const handleCopyMatrix = async () => {
    if (!matrix) return;
    try {
      await navigator.clipboard.writeText(matrixToMarkdown(matrix));
      setMatrixMessage("已复制 Markdown 文献矩阵");
    } catch {
      setMatrixMessage("复制失败，请手动选择表格内容");
    }
  };

  if (loading) {
    return (
      <div className="rounded-sm border border-[#e8e1d5] bg-white p-8 text-sm text-[#8b7b6b]">
        正在加载项目文献库...
      </div>
    );
  }

  return (
    <section className="space-y-6">
      <div className="decorative-rule">
        <p
          className="text-[11px] uppercase tracking-[0.2em] text-[#8b7355]"
          style={{ fontFamily: "var(--font-cormorant), serif" }}
        >
          Project Library
        </p>
        <h2
          className="mt-1 text-2xl font-semibold text-[#2d2a26]"
          style={{ fontFamily: "var(--font-cormorant), serif" }}
        >
          项目文献库
        </h2>
      </div>

      <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
        <LibraryStat label="已收藏文献" value={String(papers.length)} />
        <LibraryStat label="中文/国内来源" value={String(papers.filter((paper) => ["cnki", "cqvip"].includes(paper.source || "")).length)} />
        <LibraryStat label="英文/开放来源" value={String(papers.filter((paper) => !["cnki", "cqvip"].includes(paper.source || "")).length)} />
      </div>

      {papers.length > 0 ? (
        <LiteratureMatrixPanel
          matrix={matrix}
          loading={matrixLoading}
          message={matrixMessage}
          onGenerate={handleLoadMatrix}
          onCopy={handleCopyMatrix}
        />
      ) : null}

      {error ? (
        <div className="rounded-sm border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      {papers.length === 0 ? (
        <div className="rounded-sm border border-dashed border-[#d9d0c0] bg-white p-10 text-center">
          <h3 className="text-lg font-medium text-[#2d2a26]">还没有保存文献</h3>
          <p className="mx-auto mt-3 max-w-xl text-sm leading-7 text-[#8b7b6b]">
            回到首页检索文献，在右侧 References 中展开文献并点击“加入项目”，文献就会沉淀到这里。
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {papers.map((paper) => (
            <article
              key={paper.id}
              id={`project-paper-${paper.id}`}
              className="rounded-sm border border-[#e8e1d5] bg-white p-6 shadow-sm"
              style={highlightedPaperId === paper.id ? { boxShadow: "0 0 0 2px rgba(184,134,11,0.24)", background: "#fffaf0" } : undefined}
            >
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="mb-3 flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-[#f3efe6] px-3 py-1 text-[11px] font-medium text-[#8b7355]">
                      {sourceLabel(paper.source)}
                    </span>
                    <span className="text-[11px] text-[#b8a898]">{paper.year || "未知年份"}</span>
                    <span className="text-[11px] text-[#b8a898]">{paper.citation_count ?? 0} citations</span>
                  </div>
                  <h3
                    className="text-xl font-semibold leading-8 text-[#2d2a26]"
                    style={{ fontFamily: "var(--font-cormorant), serif" }}
                  >
                    {paper.title}
                  </h3>
                  <p className="mt-2 text-xs leading-6 text-[#8b7b6b]">
                    {formatAuthors(paper.authors)} · {paper.venue || "未知期刊/会议"}
                  </p>
                  <p className="mt-4 line-clamp-4 text-sm leading-7 text-[#5c4a3a]">
                    {paper.abstract || "当前文献暂无摘要，建议打开来源链接进一步核验。"}
                  </p>
                </div>

                <div className="flex shrink-0 flex-col gap-2">
                  <button
                    type="button"
                    onClick={() => router.push(`/projects/${projectId}/literature/${paper.id}`)}
                    className="rounded-full bg-[#2d2a26] px-4 py-2 text-xs font-medium text-white transition-colors hover:bg-[#1a1815]"
                  >
                    查看详情
                  </button>
                  {paper.url ? (
                    <a
                      href={paper.url}
                      target="_blank"
                      rel="noreferrer"
                      className="rounded-full border border-[#d7cbb8] px-4 py-2 text-xs font-medium text-[#5c4a3a] transition-colors hover:border-[#8b7355]"
                    >
                      查看来源
                    </a>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => handleRemove(paper.id)}
                    disabled={removingId === paper.id}
                    className="rounded-full border border-red-100 px-4 py-2 text-xs font-medium text-red-600 transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {removingId === paper.id ? "移除中..." : "移出项目"}
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function LibraryStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-sm border border-[#e8e1d5] bg-white p-5">
      <p className="text-[11px] uppercase tracking-[0.18em] text-[#b8a898]">{label}</p>
      <p className="mt-2 text-3xl font-semibold text-[#2d2a26]" style={{ fontFamily: "monospace" }}>
        {value}
      </p>
    </div>
  );
}

function LiteratureMatrixPanel({
  matrix,
  loading,
  message,
  onGenerate,
  onCopy,
}: {
  matrix: LiteratureMatrixResult | null;
  loading: boolean;
  message: string | null;
  onGenerate: () => void;
  onCopy: () => void;
}) {
  return (
    <section className="rounded-sm border border-[#e8e1d5] bg-white p-6 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-[11px] uppercase tracking-[0.2em] text-[#8b7355]" style={{ fontFamily: "var(--font-cormorant), serif" }}>
            Literature Matrix
          </p>
          <h3 className="mt-1 text-xl font-semibold text-[#2d2a26]" style={{ fontFamily: "var(--font-cormorant), serif" }}>
            项目文献矩阵
          </h3>
          <p className="mt-2 max-w-2xl text-sm leading-7 text-[#8b7b6b]">
            把项目文献库整理成综述表格。缺少摘要的文献会标记为“证据不足”，不会补写研究方法、样本或结论。
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={onGenerate}
            disabled={loading}
            className="rounded-full bg-[#2d2a26] px-4 py-2 text-xs font-medium text-white transition-colors hover:bg-[#1a1815] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? "生成中..." : matrix ? "重新生成" : "生成文献矩阵"}
          </button>
          {matrix ? (
            <button
              type="button"
              onClick={onCopy}
              className="rounded-full border border-[#d7cbb8] px-4 py-2 text-xs font-medium text-[#5c4a3a] transition-colors hover:border-[#8b7355]"
            >
              复制 Markdown
            </button>
          ) : null}
        </div>
      </div>

      {message ? (
        <div className="mt-4 rounded-sm border border-[#eadfcd] bg-[#fbf7ef] px-4 py-3 text-sm text-[#8b7355]">
          {message}
        </div>
      ) : null}

      {matrix ? (
        <div className="mt-5 overflow-x-auto">
          <table className="min-w-[1100px] border-collapse text-left text-xs">
            <thead>
              <tr className="border-b border-[#e8e1d5] text-[#8b7355]">
                <th className="px-3 py-3 font-medium">作者年份</th>
                <th className="px-3 py-3 font-medium">题名</th>
                <th className="px-3 py-3 font-medium">方法</th>
                <th className="px-3 py-3 font-medium">样本/数据</th>
                <th className="px-3 py-3 font-medium">主要发现</th>
                <th className="px-3 py-3 font-medium">证据等级</th>
              </tr>
            </thead>
            <tbody>
              {matrix.rows.map((row, index) => (
                <tr key={`${row.title}-${index}`} className="border-b border-[#f0e8dc] align-top">
                  <td className="px-3 py-4 text-[#5c4a3a]">{row.author_year}</td>
                  <td className="px-3 py-4 font-medium text-[#2d2a26]">{row.title}</td>
                  <td className="px-3 py-4 text-[#5c4a3a]">{row.method}</td>
                  <td className="px-3 py-4 text-[#5c4a3a]">{row.sample_or_data}</td>
                  <td className="px-3 py-4 text-[#5c4a3a]">{row.key_findings}</td>
                  <td className="px-3 py-4">
                    <span className="rounded-full bg-[#f3efe6] px-2 py-1 text-[11px] text-[#8b7355]">{row.evidence_level}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  );
}

function sourceLabel(source: string | null) {
  const labels: Record<string, string> = {
    pubmed: "PubMed",
    cnki: "知网",
    cqvip: "维普",
    openalex: "OpenAlex",
    semantic_scholar: "Semantic Scholar",
    crossref: "Crossref",
    arxiv: "arXiv",
  };
  return source ? labels[source] || source : "未知来源";
}

function formatAuthors(authors: string | null) {
  if (!authors) return "未知作者";
  return authors.split(";").filter(Boolean).slice(0, 4).join("、") || "未知作者";
}

function matrixToMarkdown(matrix: LiteratureMatrixResult) {
  const header = "| 作者年份 | 题名 | 方法 | 样本/数据 | 主要发现 | 局限 | 证据等级 |";
  const divider = "| --- | --- | --- | --- | --- | --- | --- |";
  const rows = matrix.rows.map((row) => (
    `| ${escapeMarkdownCell(row.author_year)} | ${escapeMarkdownCell(row.title)} | ${escapeMarkdownCell(row.method)} | ${escapeMarkdownCell(row.sample_or_data)} | ${escapeMarkdownCell(row.key_findings)} | ${escapeMarkdownCell(row.limitations)} | ${escapeMarkdownCell(row.evidence_level)} |`
  ));
  return [header, divider, ...rows].join("\n");
}

function escapeMarkdownCell(value: string) {
  return (value || "").replace(/\|/g, "\\|").replace(/\n/g, " ");
}
