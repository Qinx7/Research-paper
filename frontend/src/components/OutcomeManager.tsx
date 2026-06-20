"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import * as api from "../lib/api";
import type { Outcome, OutcomeTypeInfo, OutcomeSummary, ReadinessCheck } from "../lib/types";

interface Props {
  projectId: string;
  onReadyChange?: (ready: boolean) => void;
}

const OUTCOME_TYPE_LABELS: Record<string, string> = {
  prototype: "系统原型",
  code: "代码文件",
  screenshot: "系统截图",
  experiment_data: "实验数据",
  survey_data: "问卷数据",
  experiment_record: "实验记录",
  chart: "图表",
  paper_draft: "论文草稿",
  other: "其他",
};

export default function OutcomeManager({ projectId, onReadyChange }: Props) {
  const [outcomes, setOutcomes] = useState<Outcome[]>([]);
  const [types, setTypes] = useState<OutcomeTypeInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [summary, setSummary] = useState<OutcomeSummary | null>(null);
  const [readiness, setReadiness] = useState<ReadinessCheck | null>(null);
  const [checkingReadiness, setCheckingReadiness] = useState(false);
  const [indexingIds, setIndexingIds] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // 上传表单
  const [file, setFile] = useState<File | null>(null);
  const [outcomeType, setOutcomeType] = useState("other");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  const loadOutcomes = useCallback(async () => {
    try {
      const data = await api.listOutcomes({ project_id: projectId });
      setOutcomes(data);
    } catch {
      setError("加载成果列表失败");
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  const loadTypes = useCallback(async () => {
    try {
      const data = await api.listOutcomeTypes();
      setTypes(data);
    } catch { /* 使用默认类型 */ }
  }, []);

  useEffect(() => {
    loadOutcomes();
    loadTypes();
  }, [projectId]); // 只依赖 projectId，避免函数引用导致的无限循环

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] || null;
    setFile(f);
    if (f && !name) setName(f.name);
  };

  const handleUpload = async () => {
    if (!file || !name.trim()) return;
    setUploading(true);
    setError(null);
    try {
      await api.uploadOutcome({
        file,
        project_id: projectId,
        outcome_type: outcomeType,
        name: name.trim(),
        description: description.trim() || undefined,
      });
      setFile(null);
      setName("");
      setDescription("");
      if (fileRef.current) fileRef.current.value = "";
      await loadOutcomes();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "上传失败");
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await api.deleteOutcome(id);
      setOutcomes((prev) => prev.filter((o) => o.id !== id));
    } catch {
      setError("删除失败");
    }
  };

  const handleDownload = async (outcome: Outcome) => {
    if (!outcome.file_url) return;
    try {
      await api.downloadWithAuth(outcome.file_url, outcome.name);
    } catch {
      setError("下载失败");
    }
  };

  const handleIndexKnowledge = async (outcome: Outcome) => {
    setIndexingIds((prev) => new Set(prev).add(outcome.id));
    setError(null);
    try {
      await api.indexOutcomeKnowledge(outcome.id);
      await loadOutcomes();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "解析入知识库失败");
    } finally {
      setIndexingIds((prev) => {
        const next = new Set(prev);
        next.delete(outcome.id);
        return next;
      });
    }
  };

  const handleSummarize = async () => {
    setError(null);
    try {
      const result = await api.summarizeOutcomes(projectId);
      setSummary(result);
    } catch {
      setError("汇总分析失败");
    }
  };

  const handleCheckReadiness = async () => {
    setCheckingReadiness(true);
    setError(null);
    try {
      const result = await api.checkReadiness(projectId);
      setReadiness(result);
      onReadyChange?.(result.ready);
    } catch {
      setError("就绪检查失败");
    } finally {
      setCheckingReadiness(false);
    }
  };

  if (loading) return <div className="text-gray-400 py-8 text-center">加载中...</div>;

  return (
    <div className="space-y-6">
      {/* 错误提示 */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
          {error}
          <button className="ml-3 underline" onClick={() => setError(null)}>关闭</button>
        </div>
      )}

      {/* 上传区 */}
      <div className="bg-white border border-gray-200 rounded-xl p-5">
        <h3 className="font-semibold text-gray-800 mb-4">上传项目成果</h3>
        <p className="mb-4 text-xs text-gray-500">
          支持将 TXT / MD / DOCX / 文本型 PDF 解析入项目知识库；扫描版 PDF 暂不支持 OCR。
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm text-gray-600 mb-1">文件</label>
            <input
              ref={fileRef}
              type="file"
              onChange={handleFileChange}
              className="w-full text-sm text-gray-600 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
            />
          </div>
          <div>
            <label className="block text-sm text-gray-600 mb-1">成果类型</label>
            <select
              value={outcomeType}
              onChange={(e) => setOutcomeType(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            >
              {(types.length > 0 ? types : [
                { id: "other", label: "其他", description: "", icon: "" },
                { id: "experiment_data", label: "实验数据", description: "", icon: "" },
                { id: "code", label: "代码文件", description: "", icon: "" },
                { id: "screenshot", label: "系统截图", description: "", icon: "" },
                { id: "prototype", label: "系统原型", description: "", icon: "" },
                { id: "chart", label: "图表", description: "", icon: "" },
              ] as OutcomeTypeInfo[]).map((t) => (
                <option key={t.id} value={t.id}>{t.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm text-gray-600 mb-1">名称</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="成果名称"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-sm text-gray-600 mb-1">描述（可选）</label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="简要描述"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            />
          </div>
        </div>
        <button
          onClick={handleUpload}
          disabled={!file || !name.trim() || uploading}
          className="mt-4 px-6 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {uploading ? "上传中..." : "上传成果"}
        </button>
      </div>

      {/* 分析和就绪检查 */}
      <div className="flex gap-3">
        <button
          onClick={handleSummarize}
          disabled={outcomes.length === 0}
          className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm hover:bg-gray-200 disabled:opacity-50"
        >
          AI 汇总分析
        </button>
        <button
          onClick={handleCheckReadiness}
          disabled={outcomes.length === 0 || checkingReadiness}
          className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm hover:bg-gray-200 disabled:opacity-50"
        >
          {checkingReadiness ? "检查中..." : "论文就绪检查"}
        </button>
      </div>

      {/* 就绪状态 */}
      {readiness && (
        <div className={`border rounded-xl p-4 ${readiness.ready ? "bg-green-50 border-green-200" : "bg-yellow-50 border-yellow-200"}`}>
          <div className="flex items-center gap-2 mb-2">
            <span className={`text-lg ${readiness.ready ? "" : ""}`}>
              {readiness.ready ? "已就绪" : "尚不充分"}
            </span>
            <span className="text-sm text-gray-500">完备度 {readiness.score}/100</span>
          </div>
          {readiness.missing_types.length > 0 && (
            <p className="text-sm text-gray-600 mb-1">缺少：{readiness.missing_types.join("、")}</p>
          )}
          <p className="text-sm text-gray-700">{readiness.suggestion}</p>
        </div>
      )}

      {/* AI 汇总 */}
      {summary && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
          <h4 className="font-semibold text-blue-900 mb-2">AI 成果汇总</h4>
          <p className="text-sm text-blue-800 whitespace-pre-wrap">{summary.summary_text}</p>
          {summary.missing_items.length > 0 && (
            <div className="mt-2 text-sm text-blue-700">
              <span className="font-medium">待补充：</span>
              {summary.missing_items.join("、")}
            </div>
          )}
        </div>
      )}

      {/* 成果列表 */}
      <div>
        <h3 className="font-semibold text-gray-800 mb-3">
          已上传成果（{outcomes.length}）
        </h3>
        {outcomes.length === 0 ? (
          <p className="text-gray-400 text-sm py-4 text-center">暂未上传成果，请先上传文件。</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {outcomes.map((o) => (
              <div key={o.id} className="bg-white border border-gray-200 rounded-lg p-4 flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
                      {OUTCOME_TYPE_LABELS[o.outcome_type] || o.outcome_type}
                    </span>
                    <KnowledgeStatusBadge outcome={o} indexing={indexingIds.has(o.id)} />
                  </div>
                  <p className="font-medium text-gray-800 text-sm truncate">{o.name}</p>
                  {o.description && (
                    <p className="text-xs text-gray-500 mt-1 truncate">{o.description}</p>
                  )}
                  {o.extra_data?.knowledge_error && (
                    <p className="mt-2 text-xs text-red-500 line-clamp-2">{o.extra_data.knowledge_error}</p>
                  )}
                </div>
                <div className="flex gap-2 ml-3 shrink-0">
                  {isKnowledgeParsable(o) && (
                    <button
                      onClick={() => handleIndexKnowledge(o)}
                      disabled={indexingIds.has(o.id)}
                      className="text-xs text-emerald-600 hover:underline disabled:opacity-50"
                    >
                      {knowledgeActionLabel(o, indexingIds.has(o.id))}
                    </button>
                  )}
                  {o.file_url && (
                    <button
                      onClick={() => handleDownload(o)}
                      className="text-xs text-blue-600 hover:underline"
                    >
                      下载
                    </button>
                  )}
                  <button
                    onClick={() => handleDelete(o.id)}
                    className="text-xs text-red-500 hover:underline"
                  >
                    删除
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function isKnowledgeParsable(outcome: Outcome) {
  const path = `${outcome.file_path || outcome.name || ""}`.toLowerCase();
  return [".txt", ".md", ".docx", ".pdf"].some((ext) => path.endsWith(ext));
}

function knowledgeActionLabel(outcome: Outcome, indexing: boolean) {
  if (indexing) return "解析中...";
  const status = outcome.extra_data?.knowledge_status;
  if (status === "indexed") return "重新解析";
  if (status === "failed") return "重试解析";
  return "解析入库";
}

function KnowledgeStatusBadge({ outcome, indexing }: { outcome: Outcome; indexing: boolean }) {
  const status = indexing ? "parsing" : outcome.extra_data?.knowledge_status || "pending";
  const count = outcome.extra_data?.knowledge_chunk_count || 0;
  const styles: Record<string, string> = {
    indexed: "bg-emerald-50 text-emerald-700 border-emerald-200",
    parsing: "bg-amber-50 text-amber-700 border-amber-200",
    failed: "bg-red-50 text-red-700 border-red-200",
    pending: "bg-slate-50 text-slate-500 border-slate-200",
  };
  const labels: Record<string, string> = {
    indexed: `已入库${count ? ` ${count} 段` : ""}`,
    parsing: "解析中",
    failed: "解析失败",
    pending: "未解析",
  };
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full border ${styles[status] || styles.pending}`}>
      {labels[status] || labels.pending}
    </span>
  );
}
