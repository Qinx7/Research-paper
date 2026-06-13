"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import PaperWorkflow from "@/components/PaperWorkflow";
import KnowledgeGraph from "@/components/KnowledgeGraph";
import ZoteroSync from "@/components/ZoteroSync";
import { getToken, deleteProject } from "@/lib/api";

type ViewMode = "overview" | "paper" | "knowledge" | "zotero";

const VIEWS: { key: ViewMode; label: string }[] = [
  { key: "overview", label: "项目概览" },
  { key: "paper", label: "论文工作流" },
  { key: "knowledge", label: "知识图谱" },
  { key: "zotero", label: "Zotero 导入" },
];

export default function ProjectDetailPage() {
  const params = useParams();
  const router = useRouter();
  const projectId = params.id as string;

  const [project, setProject] = useState<{ name: string; research_field: string | null } | null>(null);
  const [view, setView] = useState<ViewMode>("overview");
  const [kgRefreshKey, setKgRefreshKey] = useState(0);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    const headers: Record<string, string> = {};
    const token = getToken();
    if (token) headers["Authorization"] = `Bearer ${token}`;
    fetch(`http://127.0.0.1:8000/api/projects/${projectId}`, { headers })
      .then((r) => r.json())
      .then(setProject)
      .catch(() => {});
  }, [projectId]);

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await deleteProject(projectId);
      router.push("/");
    } catch (e: any) {
      alert("删除项目失败：" + (e.message || "未知错误"));
      setDeleting(false);
      setDeleteConfirm(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#faf7f2] paper-texture">
      {/* ======== 暗色刊头 ======== */}
      <header className="bg-[#1a1815] border-b border-[#3d3830]">
        <div className="max-w-6xl mx-auto px-6 py-6">
          <button
            onClick={() => router.push("/")}
            className="group inline-flex items-center gap-2 text-xs text-[#6b6358] hover:text-[#b8a898]
                       transition-colors mb-3 tracking-wide"
          >
            <svg
              width="14" height="14" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="1.5"
              className="group-hover:-translate-x-1 transition-transform"
            >
              <path d="M19 12H5m0 0l7 7m-7-7l7-7" />
            </svg>
            返回首页
          </button>
          <h1
            className="text-2xl font-semibold text-[#e8e0d0] tracking-wide"
            style={{ fontFamily: "var(--font-cormorant), serif" }}
          >
            {project?.name || "项目详情"}
          </h1>
          {project?.research_field && (
            <p className="text-xs text-[#8b7355] mt-1 tracking-wide">{project.research_field}</p>
          )}
        </div>
      </header>

      {/* ======== 标签导航 ======== */}
      <nav className="bg-white border-b border-[#e8e1d5] sticky top-0 z-40">
        <div className="max-w-6xl mx-auto px-6 flex items-center gap-0">
          {VIEWS.map((v) => (
            <button
              key={v.key}
              onClick={() => setView(v.key)}
              className={`relative px-5 py-3.5 text-xs tracking-wide transition-all duration-300 ${
                view === v.key
                  ? "text-[#2d2a26] font-medium"
                  : "text-[#8b7b6b] hover:text-[#5c4a3a]"
              }`}
              style={{ fontFamily: view === v.key ? "var(--font-cormorant), serif" : undefined }}
            >
              {v.label}
              <span
                className={`absolute bottom-0 left-1/2 -translate-x-1/2 h-[2px] bg-[#b8860b]
                           transition-all duration-300 ease-out ${
                             view === v.key ? "w-8 opacity-100" : "w-0 opacity-0"
                           }`}
              />
            </button>
          ))}
        </div>
      </nav>

      {/* ======== 内容区 ======== */}
      <div className="max-w-6xl mx-auto py-10 px-6 animate-fade-up" key={view}>
        {/* ---- 概览 ---- */}
        {view === "overview" && (
          <div className="space-y-8">
            <div className="decorative-rule">
              <p
                className="text-[11px] tracking-[0.2em] uppercase text-[#8b7355]"
                style={{ fontFamily: "var(--font-cormorant), serif" }}
              >
                Project Overview
              </p>
              <h2
                className="text-2xl font-semibold text-[#2d2a26] mt-1"
                style={{ fontFamily: "var(--font-cormorant), serif" }}
              >
                项目概览
              </h2>
            </div>

            <p className="text-[11px] tracking-wide uppercase text-[#b8a898]">
              项目 ID · {projectId}
            </p>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              {/* 开题阶段卡片 */}
              <OverviewCard
                title="开题阶段"
                description="需求分析 → 文献检索 → 研究方向 → 项目设计 → 开题 PPT 与开题报告"
                action="进入开题"
                onClick={() => router.push("/")}
              />
              {/* 论文阶段卡片 */}
              <OverviewCard
                title="论文阶段"
                description="上传项目成果 → 生成论文大纲 → 逐章撰写正文 → 生成答辩 PPT"
                action="进入论文工作流"
                onClick={() => setView("paper")}
              />
              {/* 知识图谱卡片 */}
              <OverviewCard
                title="知识图谱"
                description="文献关系网络 · 时间演进分析 · 主题聚类 · 引用影响力排序"
                action="查看图谱"
                onClick={() => setView("knowledge")}
              />
            </div>

            {/* 删除项目 */}
            <div className="pt-8 border-t border-[#e8e1d5]">
              {!deleteConfirm ? (
                <button
                  onClick={() => setDeleteConfirm(true)}
                  className="text-xs text-[#b8a898] hover:text-[#c44] transition-colors tracking-wide"
                >
                  删除此项目
                </button>
              ) : (
                <div className="flex items-center gap-3 p-4 rounded-sm border border-red-200 bg-red-50/50 max-w-md">
                  <span className="text-xs text-red-700">确定要删除此项目吗？所有关联的文献记录、论文草稿和成果文件将被永久删除，不可恢复。</span>
                  <button
                    onClick={handleDelete}
                    disabled={deleting}
                    className="shrink-0 rounded-sm bg-red-600 text-white px-3 py-1.5 text-xs hover:bg-red-700 disabled:opacity-50 transition-colors"
                  >
                    {deleting ? "删除中…" : "确认删除"}
                  </button>
                  <button
                    onClick={() => setDeleteConfirm(false)}
                    disabled={deleting}
                    className="shrink-0 text-xs text-[#8b7b6b] hover:text-[#2d2a26] transition-colors"
                  >
                    取消
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ---- 论文工作流 ---- */}
        {view === "paper" && (
          <PaperWorkflow projectId={projectId} onBack={() => setView("overview")} />
        )}

        {/* ---- 知识图谱 ---- */}
        {view === "knowledge" && (
          <KnowledgeGraph key={kgRefreshKey} projectId={projectId} />
        )}

        {/* ---- Zotero 导入 ---- */}
        {view === "zotero" && (
          <ZoteroSync
            projectId={projectId}
            onImportComplete={() => setKgRefreshKey((k) => k + 1)}
          />
        )}
      </div>
    </div>
  );
}

/** 概览卡片 —— 编辑风格，左侧强调线 */
function OverviewCard({
  title,
  description,
  action,
  onClick,
}: {
  title: string;
  description: string;
  action: string;
  onClick: () => void;
}) {
  return (
    <div
      onClick={onClick}
      className="accent-card group cursor-pointer bg-white border border-[#e8e1d5] rounded-sm p-7
                 transition-all duration-300
                 hover:shadow-xl hover:shadow-[#1a1815]/6 hover:border-[#d4c8b0] hover:-translate-y-0.5"
    >
      <h3
        className="text-lg font-medium text-[#2d2a26] mb-3"
        style={{ fontFamily: "var(--font-cormorant), serif" }}
      >
        {title}
      </h3>
      <p className="text-xs text-[#8b7b6b] leading-relaxed mb-6">{description}</p>
      <span className="text-[10px] tracking-wider uppercase text-[#b8860b] group-hover:text-[#8b6914] transition-colors">
        {action} →
      </span>
    </div>
  );
}
