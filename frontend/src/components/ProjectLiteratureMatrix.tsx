/** 项目文献矩阵：把已保存文献整理成可复制到综述草稿的证据表。 */
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { getProjectLiteratureMatrix } from "@/lib/api";
import type { LiteratureMatrixResult, LiteratureMatrixRow } from "@/lib/types";

type Props = {
  projectId: string;
};

const MATRIX_COLUMNS: { key: keyof LiteratureMatrixRow; label: string; minWidth: string }[] = [
  { key: "author_year", label: "作者年份", minWidth: "min-w-[130px]" },
  { key: "title", label: "文献标题", minWidth: "min-w-[220px]" },
  { key: "research_question", label: "研究问题", minWidth: "min-w-[220px]" },
  { key: "method", label: "方法", minWidth: "min-w-[160px]" },
  { key: "sample_or_data", label: "样本/数据", minWidth: "min-w-[180px]" },
  { key: "key_findings", label: "主要发现", minWidth: "min-w-[240px]" },
  { key: "limitations", label: "局限", minWidth: "min-w-[200px]" },
  { key: "relevance_to_project", label: "可借鉴点", minWidth: "min-w-[240px]" },
  { key: "evidence_level", label: "证据等级", minWidth: "min-w-[120px]" },
];

export default function ProjectLiteratureMatrix({ projectId }: Props) {
  const [matrix, setMatrix] = useState<LiteratureMatrixResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const loadMatrix = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await getProjectLiteratureMatrix(projectId);
      setMatrix(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "文献矩阵加载失败");
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    loadMatrix();
  }, [loadMatrix]);

  const markdown = useMemo(() => {
    if (!matrix?.rows.length) return "";
    return buildMatrixMarkdown(matrix.rows);
  }, [matrix]);

  const handleCopy = async () => {
    if (!markdown) return;
    try {
      await navigator.clipboard.writeText(markdown);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setError("复制失败，请确认浏览器允许剪贴板权限");
    }
  };

  if (loading && !matrix) {
    return (
      <div className="rounded-sm border border-[#e8e1d5] bg-white p-8 text-center text-sm text-[#8b7b6b]">
        正在生成文献矩阵...
      </div>
    );
  }

  if (error && !matrix) {
    return (
      <div className="rounded-sm border border-red-200 bg-red-50/60 p-6 text-center">
        <p className="text-sm text-red-700">{error}</p>
        <button onClick={loadMatrix} className="mt-3 text-xs tracking-wide text-[#8b6914] hover:underline">
          重新加载
        </button>
      </div>
    );
  }

  if (!matrix || matrix.total === 0) {
    return (
      <section className="rounded-sm border border-[#e8e1d5] bg-white p-8 text-center">
        <p className="text-sm text-[#5c4a3a]">暂无可生成矩阵的文献</p>
        <p className="mt-2 text-xs text-[#9b8b7a]">请先在文献检索结果中保存文献到项目文献库。</p>
      </section>
    );
  }

  return (
    <section className="space-y-5">
      <div className="flex flex-col gap-4 border-b border-[#e8e1d5] pb-5 md:flex-row md:items-end md:justify-between">
        <div className="decorative-rule">
          <p
            className="text-[11px] uppercase tracking-[0.2em] text-[#8b7355]"
            style={{ fontFamily: "var(--font-cormorant), serif" }}
          >
            Literature Matrix
          </p>
          <h2
            className="mt-1 text-2xl font-semibold text-[#2d2a26]"
            style={{ fontFamily: "var(--font-cormorant), serif" }}
          >
            文献矩阵
          </h2>
          <p className="mt-2 max-w-2xl text-xs leading-relaxed text-[#8b7b6b]">
            共整理 {matrix.total} 篇文献。矩阵只基于已保存的题名、摘要和元数据生成；证据不足的字段会显式标记，避免把推测写成结论。
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={loadMatrix}
            disabled={loading}
            className="rounded-sm border border-[#d8cbb8] px-4 py-2 text-xs text-[#5c4a3a] transition-colors hover:bg-[#f7f0e6] disabled:opacity-50"
          >
            {loading ? "刷新中..." : "刷新矩阵"}
          </button>
          <button
            onClick={handleCopy}
            disabled={!markdown}
            className="rounded-sm bg-[#1a1815] px-4 py-2 text-xs tracking-wide text-[#f8f1e7] transition-colors hover:bg-[#2d2a26] disabled:opacity-50"
          >
            {copied ? "已复制" : "复制 Markdown"}
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-sm border border-red-200 bg-red-50/60 px-4 py-3 text-xs text-red-700">
          {error}
        </div>
      )}

      <div className="overflow-hidden rounded-sm border border-[#e8e1d5] bg-white shadow-sm shadow-[#1a1815]/5">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-xs">
            <thead className="bg-[#f3eadc] text-[#5c4a3a]">
              <tr>
                {MATRIX_COLUMNS.map((column) => (
                  <th key={column.key} className={`${column.minWidth} border-b border-[#e1d5c5] px-4 py-3 font-medium`}>
                    {column.label}
                  </th>
                ))}
                <th className="min-w-[180px] border-b border-[#e1d5c5] px-4 py-3 font-medium">风险提示</th>
              </tr>
            </thead>
            <tbody>
              {matrix.rows.map((row, index) => (
                <tr key={`${row.title}-${index}`} className="align-top odd:bg-white even:bg-[#fcfaf6]">
                  {MATRIX_COLUMNS.map((column) => (
                    <td key={column.key} className="border-b border-[#f0e8dd] px-4 py-3 leading-relaxed text-[#3a342d]">
                      {formatCell(row[column.key])}
                    </td>
                  ))}
                  <td className="border-b border-[#f0e8dd] px-4 py-3 leading-relaxed text-[#9a5a2e]">
                    {row.warnings.length ? row.warnings.join("；") : "无"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

function buildMatrixMarkdown(rows: LiteratureMatrixRow[]) {
  const headers = MATRIX_COLUMNS.map((column) => column.label).concat("风险提示");
  const divider = headers.map(() => "---");
  const body = rows.map((row) =>
    MATRIX_COLUMNS
      .map((column) => sanitizeMarkdownCell(formatCell(row[column.key])))
      .concat(sanitizeMarkdownCell(row.warnings.length ? row.warnings.join("；") : "无"))
  );
  return [headers, divider, ...body].map((cells) => `| ${cells.join(" | ")} |`).join("\n");
}

function formatCell(value: LiteratureMatrixRow[keyof LiteratureMatrixRow]) {
  if (Array.isArray(value)) return value.join("；") || "暂无";
  return String(value || "暂无");
}

function sanitizeMarkdownCell(value: string) {
  return value.replace(/\|/g, "\\|").replace(/\s+/g, " ").trim();
}
