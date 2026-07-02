"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import KnowledgeGraph from "@/components/KnowledgeGraph";
import PaperWorkflow from "@/components/PaperWorkflow";
import ProjectDeliveryWorkspace from "@/components/ProjectDeliveryWorkspace";
import ProjectLiteratureLibrary from "@/components/ProjectLiteratureLibrary";
import ProjectLiteratureMatrix from "@/components/ProjectLiteratureMatrix";
import ZoteroSync from "@/components/ZoteroSync";
import { groupDocumentSearchResults } from "@/lib/documentSearchGrouping.mjs";
import { highlightDocumentSearchText } from "@/lib/documentSearchHighlight.mjs";
import { buildOutcomeKnowledgeSummary } from "@/lib/outcomeKnowledgeSummary.mjs";
import { buildDocumentUsageLinks } from "@/lib/documentSearchUsage.mjs";
import {
  deleteProject,
  getProject,
  getProjectWorkspace,
  indexOutcomeKnowledge,
  searchProjectDocuments,
} from "@/lib/api";
import type {
  Project,
  ProjectDocumentSearchResult,
  ProjectWorkspaceChapter,
  ProjectWorkspaceSnapshot,
} from "@/lib/types";

type ViewMode = "overview" | "literature" | "matrix" | "paper" | "knowledge" | "zotero" | "delivery";
type HighlightType = "outcome" | "chunk" | "paper" | "note";

const VIEWS: { key: ViewMode; label: string }[] = [
  { key: "overview", label: "项目概览" },
  { key: "delivery", label: "交付工作台" },
  { key: "literature", label: "文献库" },
  { key: "matrix", label: "文献矩阵" },
  { key: "paper", label: "论文工作流" },
  { key: "knowledge", label: "知识图谱" },
  { key: "zotero", label: "Zotero 导入" },
];

const PROJECT_THEME = {
  pageBg: "#f7f9fb",
  panel: "#ffffff",
  panelSoft: "#f3f7fb",
  border: "#dfe7ef",
  borderStrong: "#cbd8e6",
  text: "#16202a",
  muted: "#647282",
  faint: "#93a0ad",
  blue: "#168fe3",
  blueDark: "#0d72bd",
  blueSoft: "#eaf6ff",
  green: "#1f9d68",
  warn: "#b7791f",
  warnSoft: "#fff7e8",
  shadow: "0 14px 32px rgba(15, 35, 55, 0.07)",
};

function isViewMode(value: string | null): value is ViewMode {
  return Boolean(value && VIEWS.some((item) => item.key === value));
}

export default function ProjectDetailPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const projectId = params.id as string;

  const [project, setProject] = useState<Project | null>(null);
  const [workspace, setWorkspace] = useState<ProjectWorkspaceSnapshot | null>(null);
  const [view, setView] = useState<ViewMode>("overview");
  const [kgRefreshKey, setKgRefreshKey] = useState(0);
  const [knowledgeExpanded, setKnowledgeExpanded] = useState(false);
  const [indexingOutcomeId, setIndexingOutcomeId] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [documentQuery, setDocumentQuery] = useState("");
  const [documentSearching, setDocumentSearching] = useState(false);
  const [documentResults, setDocumentResults] = useState<ProjectDocumentSearchResult[]>([]);
  const [documentSearchError, setDocumentSearchError] = useState<string | null>(null);

  const highlightType = searchParams.get("highlight_type") as HighlightType | null;
  const highlightId = searchParams.get("highlight_id");
  const highlightChapterKey = searchParams.get("chapter_key");

  const setViewWithQuery = useCallback((nextView: ViewMode) => {
    setView(nextView);
    const nextParams = new URLSearchParams(searchParams.toString());
    if (nextView === "overview") nextParams.delete("view");
    else nextParams.set("view", nextView);
    const query = nextParams.toString();
    router.replace(query ? `/projects/${projectId}?${query}` : `/projects/${projectId}`);
  }, [projectId, router, searchParams]);

  const loadWorkspace = useCallback(async () => {
    const snapshot = await getProjectWorkspace(projectId);
    setWorkspace(snapshot);
  }, [projectId]);

  useEffect(() => {
    const requestedView = searchParams.get("view");
    if (isViewMode(requestedView)) setView(requestedView);
  }, [searchParams]);

  useEffect(() => {
    if (!highlightChapterKey) return;
    setKnowledgeExpanded(true);
    const timer = window.setTimeout(() => {
      const node = document.getElementById(`chapter-trace-${highlightChapterKey}`);
      node?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 120);
    return () => window.clearTimeout(timer);
  }, [highlightChapterKey, view, workspace?.chapters]);

  useEffect(() => {
    getProject(projectId).then(setProject).catch(() => setProject(null));
    loadWorkspace().catch(() => setWorkspace(null));
  }, [loadWorkspace, projectId]);

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await deleteProject(projectId);
      router.push("/");
    } catch (error: any) {
      alert(`删除项目失败：${error?.message || "未知错误"}`);
      setDeleting(false);
      setDeleteConfirm(false);
    }
  };

  const handleIndexKnowledge = async (outcomeId: string) => {
    setIndexingOutcomeId(outcomeId);
    try {
      await indexOutcomeKnowledge(outcomeId);
      await loadWorkspace();
    } finally {
      setIndexingOutcomeId(null);
    }
  };

  const handleDocumentSearch = async () => {
    const query = documentQuery.trim();
    if (!query) {
      setDocumentResults([]);
      setDocumentSearchError(null);
      return;
    }
    setDocumentSearching(true);
    setDocumentSearchError(null);
    try {
      const results = await searchProjectDocuments(projectId, query, 12);
      setDocumentResults(results);
    } catch (error: any) {
      setDocumentSearchError(error?.message || "资料搜索失败");
      setDocumentResults([]);
    } finally {
      setDocumentSearching(false);
    }
  };

  const linkedNotes = useMemo(() => {
    const seen = new Set<string>();
    const items = [];
    for (const chapter of workspace?.chapters || []) {
      for (const note of chapter.linked_notes) {
        if (seen.has(note.id)) continue;
        seen.add(note.id);
        items.push(note);
      }
    }
    return items;
  }, [workspace?.chapters]);

  const linkedChunks = useMemo(() => {
    const seen = new Set<string>();
    const items = [];
    for (const chapter of workspace?.chapters || []) {
      for (const chunk of chapter.linked_chunks) {
        if (seen.has(chunk.id)) continue;
        seen.add(chunk.id);
        items.push(chunk);
      }
    }
    return items;
  }, [workspace?.chapters]);

  const groupedDocumentResults = useMemo(
    () => groupDocumentSearchResults(documentResults),
    [documentResults],
  );

  const writingHref = useMemo(() => {
    const params = new URLSearchParams();
    params.set("project_id", projectId);
    const draftId = workspace?.delivery.latest_draft?.id;
    if (draftId) params.set("draft_id", draftId);
    return `/writing?${params.toString()}`;
  }, [projectId, workspace?.delivery.latest_draft?.id]);

  return (
    <div className="min-h-screen" style={{ background: PROJECT_THEME.pageBg }}>
      <header className="border-b" style={{ borderColor: PROJECT_THEME.border, background: PROJECT_THEME.panel }}>
        <div className="mx-auto max-w-6xl px-6 py-5">
          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={() => router.push("/")}
              className="inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors"
              style={{ borderColor: PROJECT_THEME.border, color: PROJECT_THEME.muted }}
            >
              返回首页
            </button>
          </div>
          <h1
            className="mt-4 text-2xl font-semibold tracking-wide"
            style={{ fontFamily: "var(--font-cormorant), serif", color: PROJECT_THEME.text }}
          >
            {project?.name || "项目详情"}
          </h1>
          {project?.research_field ? (
            <p className="mt-1 text-xs tracking-wide" style={{ color: PROJECT_THEME.faint }}>
              {project.research_field}
            </p>
          ) : null}
        </div>
      </header>

      <nav className="sticky top-0 z-40 border-b backdrop-blur" style={{ borderColor: PROJECT_THEME.border, background: "rgba(255,255,255,0.92)" }}>
        <div className="mx-auto flex max-w-6xl items-center gap-1 overflow-x-auto px-6 py-2">
          {VIEWS.map((item) => (
            <button
              key={item.key}
              onClick={() => setViewWithQuery(item.key)}
              className={`shrink-0 rounded-full border px-4 py-2 text-xs tracking-wide transition-all duration-300 ${view === item.key ? "font-medium" : ""}`}
              style={{
                fontFamily: view === item.key ? "var(--font-cormorant), serif" : undefined,
                color: view === item.key ? PROJECT_THEME.blueDark : PROJECT_THEME.muted,
                background: view === item.key ? PROJECT_THEME.blueSoft : "transparent",
                borderColor: view === item.key ? "#b8daf7" : "transparent",
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
      </nav>

      <div className="mx-auto max-w-6xl animate-fade-up px-6 py-8" key={view}>
        {view === "overview" && (
          <div className="space-y-8">
            <div className="decorative-rule">
              <p className="text-[11px] uppercase tracking-[0.2em] text-[#8b7355]" style={{ fontFamily: "var(--font-cormorant), serif" }}>
                Project Overview
              </p>
              <h2 className="mt-1 text-2xl font-semibold text-[#2d2a26]" style={{ fontFamily: "var(--font-cormorant), serif" }}>
                项目概览
              </h2>
            </div>

            <p className="text-[11px] uppercase tracking-wide text-[#b8a898]">项目 ID · {projectId}</p>

            <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-5">
              <OverviewCard
                title="研究阶段"
                description="从研究方向、项目设计一路承接到通用 PPT 生成。"
                action="进入研究页"
                onClick={() => router.push(`/research?project_id=${projectId}`)}
              />
              <OverviewCard
                title="论文阶段"
                description="上传成果、生成大纲并逐章撰写论文内容。"
                action="进入论文工作流"
                onClick={() => router.push(writingHref)}
              />
              <OverviewCard
                title="交付工作台"
                description="集中查看草稿、通用 PPT 与 HTML Deck 预览等交付状态。"
                action="打开交付"
                onClick={() => setViewWithQuery("delivery")}
              />
              <OverviewCard
                title="知识图谱"
                description="查看文献关系网络、主题聚类与时间演进。"
                action="查看图谱"
                onClick={() => setViewWithQuery("knowledge")}
              />
              <OverviewCard
                title="文献矩阵"
                description="把项目文献整理成综述写作可复用的结构化矩阵。"
                action="打开矩阵"
                onClick={() => setViewWithQuery("matrix")}
              />
            </div>

            <section className="rounded-2xl border p-6" style={{ background: PROJECT_THEME.panel, borderColor: PROJECT_THEME.border, boxShadow: PROJECT_THEME.shadow }}>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-[11px] uppercase tracking-[0.2em]" style={{ fontFamily: "var(--font-cormorant), serif", color: PROJECT_THEME.faint }}>
                    Project Knowledge
                  </p>
                  <h3 className="mt-1 text-xl font-medium" style={{ fontFamily: "var(--font-cormorant), serif", color: PROJECT_THEME.text }}>
                    项目知识工作台
                  </h3>
                </div>
                <button
                  onClick={() => setKnowledgeExpanded((current) => !current)}
                  className="rounded-full border px-3 py-1.5 text-[11px] font-medium transition-colors"
                  style={{ borderColor: PROJECT_THEME.border, color: PROJECT_THEME.muted }}
                >
                  {knowledgeExpanded ? "收起明细" : "展开知识工作台"}
                </button>
              </div>

              <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-4">
                <KnowledgeStat label="成果材料" value={`${workspace?.stats.outcomes_total ?? 0} 项`} />
                <KnowledgeStat label="已入知识库" value={`${workspace?.stats.indexed_outcomes ?? 0} 项`} />
                <KnowledgeStat label="草稿数量" value={`${workspace?.stats.drafts_total ?? 0} 份`} />
                <KnowledgeStat label="证据卡片" value={`${workspace?.stats.evidence_cards_total ?? 0} 条`} />
              </div>

              <div className="mt-5 space-y-2.5">
                {(workspace?.outcomes || []).slice(0, 5).map((outcome) => {
                  const highlighted = highlightType === "outcome" && highlightId === outcome.id;
                  return (
                    <div
                      key={outcome.id}
                      className="flex items-start justify-between gap-4 rounded-xl border p-3"
                      style={{
                        borderColor: highlighted ? "#b8daf7" : PROJECT_THEME.border,
                        background: highlighted ? PROJECT_THEME.blueSoft : PROJECT_THEME.panelSoft,
                      }}
                    >
                      <div className="min-w-0">
                        <div className="text-sm font-medium" style={{ color: PROJECT_THEME.text }}>{outcome.name}</div>
                        <div className="mt-1 text-xs" style={{ color: PROJECT_THEME.muted }}>
                          {outcome.outcome_type || "成果"} · {formatKnowledgeStatus(outcome.knowledge_status, outcome.chunk_count)}
                        </div>
                        {buildOutcomeKnowledgeSummary(outcome.extra_data) ? (
                          <div className="mt-1 text-[11px]" style={{ color: PROJECT_THEME.muted }}>
                            {buildOutcomeKnowledgeSummary(outcome.extra_data)}
                          </div>
                        ) : null}
                        {outcome.cited_by_chapters.length > 0 ? (
                          <div className="mt-1 text-[11px]" style={{ color: PROJECT_THEME.blueDark }}>
                            已被引用：{outcome.cited_by_chapters.join("、")}
                          </div>
                        ) : null}
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <button
                          onClick={() => handleIndexKnowledge(outcome.id)}
                          disabled={indexingOutcomeId === outcome.id}
                        className="rounded-full border px-2.5 py-1 text-[10px] transition-colors disabled:opacity-40"
                        style={{ borderColor: PROJECT_THEME.border, color: PROJECT_THEME.muted }}
                        >
                          {indexingOutcomeId === outcome.id ? "解析中" : "解析入库"}
                        </button>
                        {outcome.download_url ? (
                          <a
                            href={outcome.download_url}
                            target="_blank"
                            rel="noreferrer"
                          className="rounded-full border px-2.5 py-1 text-[10px] transition-colors"
                          style={{ borderColor: PROJECT_THEME.border, color: PROJECT_THEME.muted }}
                          >
                            下载
                          </a>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
                {workspace && workspace.outcomes.length === 0 ? (
                  <p className="text-xs" style={{ color: PROJECT_THEME.muted }}>
                    当前项目还没有成果材料。上传成果并入知识库后，这里会显示章节引用、来源跳转和交付承接情况。
                  </p>
                ) : null}
              </div>

              {knowledgeExpanded ? (
                <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
                  <KnowledgePanel
                    title="成果入库状态"
                    items={(workspace?.outcomes || []).map((outcome) => ({
                      key: outcome.id,
                      title: outcome.name,
                      meta: `${outcome.outcome_type || "成果"} · ${formatKnowledgeStatus(outcome.knowledge_status, outcome.chunk_count)}`,
                      tail: outcome.cited_by_chapters.length ? `${outcome.cited_by_chapters.length} 章引用` : "",
                      highlighted: highlightType === "outcome" && highlightId === outcome.id,
                    }))}
                    emptyText="暂无成果材料。"
                  />
                  <KnowledgePanel
                    title="章节知识映射"
                    items={(workspace?.chapters || []).map((chapter) => ({
                      key: chapter.chapter_key,
                      title: chapter.title,
                      meta: `${formatChapterStatus(chapter.status)} · ${chapter.evidence_count} 条依据 · ${chapter.word_count} 字`,
                      tail: chapter.data_based ? "真实数据" : "",
                      highlighted: highlightChapterKey === chapter.chapter_key,
                    }))}
                    emptyText="暂无草稿章节映射。"
                  />
                  <KnowledgePanel
                    title="证据与资料线索"
                    items={[
                      ...linkedNotes.slice(0, 6).map((note) => ({
                        key: note.id,
                        title: note.title,
                        meta: `${note.note_type || "证据卡片"}${note.confidence ? ` · ${note.confidence}/100` : ""}`,
                        tail: "卡片",
                        highlighted: highlightType === "note" && highlightId === note.id,
                      })),
                      ...linkedChunks.slice(0, 6).map((chunk) => ({
                        key: chunk.id,
                        title: chunk.title,
                        meta: `${chunk.source_type || "资料片段"} · ${chunk.source_filename || "来源文件"}`,
                        tail: "资料",
                        highlighted: highlightType === "chunk" && highlightId === chunk.id,
                      })),
                    ]}
                    emptyText="暂无可展示的证据卡片或资料片段。"
                  />
                </div>
              ) : null}
            </section>

            <section className="rounded-2xl border p-6" style={{ background: PROJECT_THEME.panel, borderColor: PROJECT_THEME.border, boxShadow: PROJECT_THEME.shadow }}>
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <p className="text-[11px] uppercase tracking-[0.2em]" style={{ fontFamily: "var(--font-cormorant), serif", color: PROJECT_THEME.faint }}>
                    Document Search
                  </p>
                  <h3 className="mt-1 text-xl font-medium" style={{ fontFamily: "var(--font-cormorant), serif", color: PROJECT_THEME.text }}>
                    项目资料全文搜索
                  </h3>
                </div>
                <span className="text-[11px] text-[#8b7b6b]">搜索已解析入知识库的项目资料片段</span>
              </div>

              <div className="mt-5 flex flex-col gap-3 lg:flex-row">
                <input
                  value={documentQuery}
                  onChange={(event) => setDocumentQuery(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") void handleDocumentSearch();
                  }}
                  placeholder="输入关键词，例如：RAG、实验数据、问卷、访谈..."
                  className="h-11 flex-1 rounded-2xl border px-4 text-sm outline-none"
                  style={{ borderColor: PROJECT_THEME.border, background: PROJECT_THEME.panelSoft, color: PROJECT_THEME.text }}
                />
                <button
                  onClick={() => void handleDocumentSearch()}
                  disabled={documentSearching}
                  className="rounded-full px-5 py-2.5 text-[11px] font-semibold text-white disabled:opacity-50"
                  style={{ background: PROJECT_THEME.blue }}
                >
                  {documentSearching ? "搜索中..." : "搜索资料"}
                </button>
              </div>

              {documentSearchError ? (
                <p className="mt-4 text-sm text-[#9a2f2f]">{documentSearchError}</p>
              ) : null}

              <div className="mt-6 space-y-3">
                {groupedDocumentResults.length > 0 ? (
                  groupedDocumentResults.map((group: {
                    source_filename: string;
                    title: string;
                    source_type: string | null;
                    download_url: string;
                    hits: ProjectDocumentSearchResult[];
                  }) => (
                    <div key={`${group.source_filename}-${group.download_url}`} className="rounded-2xl border p-4" style={{ background: PROJECT_THEME.panelSoft, borderColor: PROJECT_THEME.border }}>
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-medium" style={{ color: PROJECT_THEME.text }}>{group.title}</div>
                          <div className="mt-1 text-xs" style={{ color: PROJECT_THEME.muted }}>
                            {group.source_filename || "来源文件"}
                            {group.source_type ? ` · ${group.source_type}` : ""}
                          </div>
                          <div className="mt-4 space-y-3">
                            {group.hits.map((item: ProjectDocumentSearchResult) => (
                              <div key={item.chunk_id} className="rounded-2xl border bg-white p-3" style={{ borderColor: PROJECT_THEME.border }}>
                                {item.section_title ? (
                                  <div className="mb-2 text-[11px]" style={{ color: PROJECT_THEME.faint }}>
                                    所属章节：{item.section_title}
                                  </div>
                                ) : null}
                                <p className="text-xs leading-6" style={{ color: PROJECT_THEME.muted }}>
                                  {highlightDocumentSearchText(item.content_excerpt, documentQuery).map((part: { text: string; highlight: boolean }, index: number) => (
                                    <span
                                      key={`${item.chunk_id}-${index}`}
                                      className={part.highlight ? "rounded-sm px-0.5" : undefined}
                                      style={part.highlight ? { background: PROJECT_THEME.warnSoft, color: "#6f4f00" } : undefined}
                                    >
                                      {part.text}
                                    </span>
                                  ))}
                                </p>
                                {item.score_reasons.length > 0 ? (
                                  <div className="mt-3 flex flex-wrap gap-2">
                                    {item.score_reasons.map((reason, index) => {
                                      const semantic = reason.includes("语义相似");
                                      return (
                                        <span
                                          key={`${item.chunk_id}-${reason}-${index}`}
                                          className="rounded-full border px-2.5 py-1 text-[10px]"
                                          style={{
                                            borderColor: semantic ? "#b8daf7" : PROJECT_THEME.border,
                                            background: semantic ? "#eaf6ff" : PROJECT_THEME.panel,
                                            color: semantic ? PROJECT_THEME.blueDark : PROJECT_THEME.muted,
                                          }}
                                        >
                                          {reason}
                                        </span>
                                      );
                                    })}
                                  </div>
                                ) : null}
                              </div>
                            ))}
                          </div>
                          {buildDocumentUsageLinks(group, workspace, projectId).length > 0 ? (
                              <div className="mt-4 border-t pt-4" style={{ borderColor: PROJECT_THEME.border }}>
                                <div className="mb-2 text-[11px] uppercase tracking-[0.16em]" style={{ color: PROJECT_THEME.faint }}>
                                写作页使用情况
                              </div>
                              <div className="flex flex-wrap gap-2">
                                {buildDocumentUsageLinks(group, workspace, projectId).map((link: { key: string; title: string; href: string }) => (
                                  <a
                                    key={link.key}
                                    href={link.href}
                                    className="rounded-full border bg-white px-3 py-1.5 text-[11px] tracking-wide transition-colors"
                                    style={{ borderColor: PROJECT_THEME.border, color: PROJECT_THEME.muted }}
                                  >
                                    查看 {link.title}
                                  </a>
                                ))}
                              </div>
                            </div>
                          ) : null}
                        </div>
                        <a
                          href={group.download_url}
                          target="_blank"
                          rel="noreferrer"
                          className="shrink-0 rounded-full border px-3 py-1.5 text-[11px] tracking-wide transition-colors"
                          style={{ borderColor: PROJECT_THEME.border, color: PROJECT_THEME.muted }}
                        >
                          下载原文件
                        </a>
                      </div>
                    </div>
                  ))
                ) : documentQuery.trim() && !documentSearching ? (
                  <p className="text-xs text-[#8b7b6b]">
                    当前没有命中结果。可以换一个更具体的关键词，或者先确认资料已经完成“解析入知识库”。
                  </p>
                ) : (
                  <p className="text-xs text-[#8b7b6b]">
                    这里可以直接搜索项目上传资料中的正文内容，不必等到对话或写作环节被动命中。
                  </p>
                )}
              </div>
            </section>

            {workspace?.chapters?.length ? (
              <section className="rounded-2xl border p-6" style={{ background: PROJECT_THEME.panel, borderColor: PROJECT_THEME.border, boxShadow: PROJECT_THEME.shadow }}>
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-[11px] uppercase tracking-[0.2em]" style={{ fontFamily: "var(--font-cormorant), serif", color: PROJECT_THEME.faint }}>
                      Chapter Mapping
                    </p>
                    <h3 className="mt-1 text-xl font-medium" style={{ fontFamily: "var(--font-cormorant), serif", color: PROJECT_THEME.text }}>
                      章节依据映射
                    </h3>
                  </div>
                  <button
                    onClick={() => router.push(writingHref)}
                    className="rounded-full border px-3 py-1.5 text-[11px] font-medium transition-colors"
                    style={{ borderColor: PROJECT_THEME.border, color: PROJECT_THEME.muted }}
                  >
                    进入论文工作流
                  </button>
                </div>

                <div className="mt-6 grid grid-cols-1 gap-4 xl:grid-cols-2">
                  {workspace.chapters.map((chapter) => (
                    <ChapterTraceCard
                      key={chapter.chapter_key}
                      chapter={chapter}
                      highlightedChapter={highlightChapterKey === chapter.chapter_key}
                      highlightedType={highlightType}
                      highlightedId={highlightId}
                    />
                  ))}
                </div>
              </section>
            ) : null}

            <div className="border-t pt-8" style={{ borderColor: PROJECT_THEME.border }}>
              {!deleteConfirm ? (
                <button
                  onClick={() => setDeleteConfirm(true)}
                  className="rounded-full border px-3 py-1.5 text-xs font-medium transition-colors hover:text-[#c44]"
                  style={{ borderColor: PROJECT_THEME.border, color: PROJECT_THEME.faint }}
                >
                  删除此项目
                </button>
              ) : (
                <div className="flex max-w-md items-center gap-3 rounded-2xl border bg-red-50/50 p-4" style={{ borderColor: "rgba(220, 38, 38, 0.22)" }}>
                  <span className="text-xs text-red-700">
                    确定要删除此项目吗？所有关联的文献记录、论文草稿和成果文件都将被永久删除，且不可恢复。
                  </span>
                  <button
                    onClick={handleDelete}
                    disabled={deleting}
                    className="shrink-0 rounded-sm bg-red-600 px-3 py-1.5 text-xs text-white transition-colors hover:bg-red-700 disabled:opacity-50"
                  >
                    {deleting ? "删除中…" : "确认删除"}
                  </button>
                  <button
                    onClick={() => setDeleteConfirm(false)}
                    disabled={deleting}
                    className="shrink-0 text-xs text-[#8b7b6b] transition-colors hover:text-[#2d2a26]"
                  >
                    取消
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {view === "delivery" && (
          <ProjectDeliveryWorkspace
            workspace={workspace}
            onOpenResearch={() => router.push(`/research?project_id=${projectId}`)}
            onOpenWriting={() => router.push(writingHref)}
          />
        )}

        {view === "literature" ? <ProjectLiteratureLibrary projectId={projectId} highlightedPaperId={highlightType === "paper" ? highlightId : null} /> : null}
        {view === "matrix" ? <ProjectLiteratureMatrix projectId={projectId} /> : null}
        {view === "paper" ? <PaperWorkflow projectId={projectId} onBack={() => setViewWithQuery("overview")} /> : null}
        {view === "knowledge" ? <KnowledgeGraph key={kgRefreshKey} projectId={projectId} /> : null}
        {view === "zotero" ? (
          <ZoteroSync projectId={projectId} onImportComplete={() => setKgRefreshKey((current) => current + 1)} />
        ) : null}
      </div>
    </div>
  );
}

function ChapterTraceCard({
  chapter,
  highlightedChapter,
  highlightedType,
  highlightedId,
}: {
  chapter: ProjectWorkspaceChapter;
  highlightedChapter?: boolean;
  highlightedType?: HighlightType | null;
  highlightedId?: string | null;
}) {
  const [expanded, setExpanded] = useState(false);
  const hasEvidence = chapter.evidence_count > 0;

  useEffect(() => {
    if (highlightedChapter && hasEvidence) {
      setExpanded(true);
    }
  }, [hasEvidence, highlightedChapter]);

  return (
    <div
      id={`chapter-trace-${chapter.chapter_key}`}
      className="rounded-sm border border-[#e8e1d5] bg-white p-5"
      style={highlightedChapter ? { boxShadow: "0 0 0 2px rgba(184,134,11,0.24)", background: "#fffaf0" } : undefined}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h4 className="text-base font-medium text-[#2d2a26]" style={{ fontFamily: "var(--font-cormorant), serif" }}>
            {chapter.title}
          </h4>
          <p className="mt-1 text-xs text-[#8b7b6b]">
            {formatChapterStatus(chapter.status)} · {chapter.word_count} 字 · {chapter.evidence_count} 条依据
          </p>
        </div>
        {chapter.data_based ? (
          <span className="rounded-sm bg-[#f7efe0] px-2 py-1 text-[10px] uppercase tracking-wide text-[#8a5a00]">
            真实数据
          </span>
        ) : null}
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {chapter.linked_outcomes.slice(0, 3).map((outcome) => (
          <a
            key={outcome.id}
            href={outcome.download_url || outcome.action_url}
            target={outcome.download_url ? "_blank" : undefined}
            rel={outcome.download_url ? "noreferrer" : undefined}
            className="rounded-full border border-[#e8e1d5] bg-[#fcfbf8] px-3 py-1.5 text-[11px] text-[#5c4a3a]"
          >
            成果 · {outcome.name}
          </a>
        ))}
        {chapter.linked_papers.slice(0, 3).map((paper) => (
          <a
            key={paper.id}
            href={paper.action_url}
            className="rounded-full border border-[#e8e1d5] bg-[#fcfbf8] px-3 py-1.5 text-[11px] text-[#5c4a3a]"
          >
            文献 · {paper.title}
          </a>
        ))}
        {chapter.linked_notes.slice(0, 2).map((note) => (
          <span
            key={note.id}
            className="rounded-full border border-[#e8e1d5] bg-[#fcfbf8] px-3 py-1.5 text-[11px] text-[#5c4a3a]"
          >
            证据 · {note.title}
          </span>
        ))}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-[#f1ece4] pt-4">
        <EvidenceCountPill label="成果" value={chapter.linked_outcomes.length} />
        <EvidenceCountPill label="文献" value={chapter.linked_papers.length} />
        <EvidenceCountPill label="证据卡片" value={chapter.linked_notes.length} />
        <EvidenceCountPill label="资料片段" value={chapter.linked_chunks.length} />
        <button
          type="button"
          onClick={() => setExpanded((current) => !current)}
          disabled={!hasEvidence}
          className="ml-auto rounded-sm border border-[#e8e1d5] px-3 py-1.5 text-[11px] tracking-wide text-[#8b7355] transition-colors hover:border-[#d4c8b0] hover:text-[#5c4a3a] disabled:cursor-not-allowed disabled:opacity-40"
        >
          {expanded ? "收起详细依据" : "展开详细依据"}
        </button>
      </div>

      {expanded ? (
        <div className="mt-5 space-y-4">
          <EvidenceDetailSection
            title="关联成果"
            emptyText="当前章节没有直接匹配到成果材料。"
            items={chapter.linked_outcomes.map((outcome) => (
              <EvidenceLinkCard
                key={outcome.id}
                badge="成果"
                title={outcome.name}
                meta={outcome.outcome_type || "成果材料"}
                actionLabel="查看成果"
                href={outcome.action_url || outcome.download_url || "#"}
                external={false}
                secondaryLabel={outcome.download_url ? "下载文件" : undefined}
                secondaryHref={outcome.download_url || undefined}
                highlighted={highlightedType === "outcome" && highlightedId === outcome.id}
              />
            ))}
          />

          <EvidenceDetailSection
            title="关联文献"
            emptyText="当前章节没有直接命中文献库条目。"
            items={chapter.linked_papers.map((paper) => (
              <EvidenceLinkCard
                key={paper.id}
                badge="文献"
                title={paper.title}
                meta={[paper.venue, paper.year ? `${paper.year}` : null, paper.citation_count ? `被引 ${paper.citation_count}` : null].filter(Boolean).join(" · ") || "项目文献库"}
                actionLabel={paper.action_label}
                href={paper.action_url}
                highlighted={highlightedType === "paper" && highlightedId === paper.id}
              />
            ))}
          />

          <EvidenceDetailSection
            title="证据卡片"
            emptyText="当前章节还没有沉淀到可复用证据卡片。"
            items={chapter.linked_notes.map((note) => (
              <EvidenceLinkCard
                key={note.id}
                badge="证据"
                title={note.title}
                meta={[note.note_type || "证据卡片", note.confidence ? `可信度 ${note.confidence}/100` : null].filter(Boolean).join(" · ")}
                description={note.evidence_text || "该证据卡片暂无摘录，需进入文献视图查看。"}
                actionLabel={note.action_label}
                href={note.action_url}
                highlighted={highlightedType === "note" && highlightedId === note.id}
              />
            ))}
          />

          <EvidenceDetailSection
            title="资料片段"
            emptyText="当前章节没有命中上传资料片段。"
            items={chapter.linked_chunks.map((chunk) => (
              <EvidenceLinkCard
                key={chunk.id}
                badge="资料"
                title={chunk.title}
                meta={[chunk.source_type || "资料片段", chunk.source_filename || null].filter(Boolean).join(" · ")}
                actionLabel="查看片段"
                href={chapter.action_url}
                secondaryLabel="下载原文件"
                secondaryHref={chunk.download_url}
                highlighted={highlightedType === "chunk" && highlightedId === chunk.id}
              />
            ))}
          />
        </div>
      ) : null}
    </div>
  );
}

function EvidenceCountPill({ label, value }: { label: string; value: number }) {
  return (
    <span className="rounded-full border border-[#ece5d8] bg-[#fcfbf8] px-2.5 py-1 text-[10px] uppercase tracking-wide text-[#8b7355]">
      {label} · {value}
    </span>
  );
}

function EvidenceDetailSection({
  title,
  items,
  emptyText,
}: {
  title: string;
  items: ReactNode[];
  emptyText: string;
}) {
  return (
    <section className="rounded-sm border border-[#f0eadf] bg-[#fcfbf8] p-4">
      <div className="mb-3 text-[11px] uppercase tracking-[0.18em] text-[#8b7355]">{title}</div>
      {items.length > 0 ? <div className="space-y-3">{items}</div> : <p className="text-xs leading-6 text-[#8b7b6b]">{emptyText}</p>}
    </section>
  );
}

function EvidenceLinkCard({
  badge,
  title,
  meta,
  description,
  actionLabel,
  href,
  external = false,
  secondaryLabel,
  secondaryHref,
  highlighted = false,
}: {
  badge: string;
  title: string;
  meta: string;
  description?: string;
  actionLabel: string;
  href: string;
  external?: boolean;
  secondaryLabel?: string;
  secondaryHref?: string;
  highlighted?: boolean;
}) {
  return (
    <div
      className="flex items-start justify-between gap-4 rounded-sm border border-[#ece5d8] bg-white p-3"
      style={highlighted ? { background: "#fff8e8", borderColor: "#e2c88f" } : undefined}
    >
      <div className="min-w-0 flex-1">
        <div className="mb-1 flex items-center gap-2">
          <span className="rounded-sm bg-[#f7efe0] px-2 py-0.5 text-[10px] uppercase tracking-wide text-[#8a5a00]">
            {badge}
          </span>
          <div className="truncate text-sm font-medium text-[#2d2a26]">{title}</div>
        </div>
        <div className="text-[11px] text-[#8b7355]">{meta}</div>
        {description ? <p className="mt-2 text-xs leading-6 text-[#8b7b6b]">{description}</p> : null}
      </div>
      <div className="flex shrink-0 flex-col gap-2">
        <a
          href={href}
          target={external ? "_blank" : undefined}
          rel={external ? "noreferrer" : undefined}
          className="rounded-sm border border-[#e8e1d5] px-3 py-1.5 text-[11px] tracking-wide text-[#8b7355] transition-colors hover:border-[#d4c8b0] hover:text-[#5c4a3a]"
        >
          {actionLabel}
        </a>
        {secondaryHref && secondaryLabel ? (
          <a
            href={secondaryHref}
            target="_blank"
            rel="noreferrer"
            className="rounded-sm border border-[#e8e1d5] px-3 py-1.5 text-[11px] tracking-wide text-[#8b7355] transition-colors hover:border-[#d4c8b0] hover:text-[#5c4a3a]"
          >
            {secondaryLabel}
          </a>
        ) : null}
      </div>
    </div>
  );
}

function KnowledgeStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border px-4 py-4" style={{ background: PROJECT_THEME.panelSoft, borderColor: PROJECT_THEME.border }}>
      <div className="text-[11px] uppercase tracking-wide" style={{ color: PROJECT_THEME.faint }}>{label}</div>
      <div className="mt-2 text-lg font-medium" style={{ color: PROJECT_THEME.text }}>{value}</div>
    </div>
  );
}

function KnowledgePanel({
  title,
  items,
  emptyText,
}: {
  title: string;
  items: { key: string; title: string; meta: string; tail?: string; highlighted?: boolean }[];
  emptyText: string;
}) {
  return (
    <div className="rounded-2xl border p-5" style={{ background: PROJECT_THEME.panelSoft, borderColor: PROJECT_THEME.border }}>
      <h4 className="text-sm font-medium" style={{ fontFamily: "var(--font-cormorant), serif", color: PROJECT_THEME.text }}>
        {title}
      </h4>
      <div className="mt-4 space-y-3">
        {items.length > 0 ? (
          items.map((item) => (
            <div
              key={item.key}
              className="flex items-start justify-between gap-3 border-t pt-3 first:border-t-0 first:pt-0"
              style={{
                borderColor: PROJECT_THEME.border,
                ...(item.highlighted ? { background: PROJECT_THEME.blueSoft, marginInline: "-8px", paddingInline: "8px", borderRadius: "8px" } : undefined),
              }}
            >
              <div className="min-w-0">
                <div className="truncate text-sm" style={{ color: PROJECT_THEME.text }}>{item.title}</div>
                <div className="mt-1 text-xs" style={{ color: PROJECT_THEME.muted }}>{item.meta}</div>
              </div>
              {item.tail ? <span className="shrink-0 text-[11px]" style={{ color: PROJECT_THEME.blueDark }}>{item.tail}</span> : null}
            </div>
          ))
        ) : (
          <p className="text-xs" style={{ color: PROJECT_THEME.muted }}>{emptyText}</p>
        )}
      </div>
    </div>
  );
}

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
      className="accent-card group cursor-pointer rounded-2xl border p-7 transition-all duration-300 hover:-translate-y-0.5"
      style={{ background: PROJECT_THEME.panel, borderColor: PROJECT_THEME.border, boxShadow: PROJECT_THEME.shadow }}
    >
      <h3 className="mb-3 text-lg font-medium" style={{ fontFamily: "var(--font-cormorant), serif", color: PROJECT_THEME.text }}>
        {title}
      </h3>
      <p className="mb-6 text-xs leading-relaxed" style={{ color: PROJECT_THEME.muted }}>{description}</p>
      <span className="text-[10px] uppercase tracking-wider" style={{ color: PROJECT_THEME.blueDark }}>
        {action} →
      </span>
    </div>
  );
}

function formatKnowledgeStatus(status: string, chunkCount: number) {
  if (status === "indexed") return `已入库 ${chunkCount} 段`;
  if (status === "parsing") return "解析中";
  if (status === "failed") return "解析失败";
  return "待解析";
}

function formatChapterStatus(status: string) {
  if (status === "generated") return "已生成";
  if (status === "edited") return "已编辑";
  if (status === "final") return "已定稿";
  return "草稿";
}
