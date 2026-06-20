"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import KnowledgeGraph from "@/components/KnowledgeGraph";
import PaperWorkflow from "@/components/PaperWorkflow";
import ProjectLiteratureLibrary from "@/components/ProjectLiteratureLibrary";
import ProjectLiteratureMatrix from "@/components/ProjectLiteratureMatrix";
import ZoteroSync from "@/components/ZoteroSync";
import {
  deleteProject,
  getDefenseOutline,
  getProject,
  getProjectWorkspace,
  indexOutcomeKnowledge,
} from "@/lib/api";
import type {
  DefensePPTOutline,
  Project,
  ProjectWorkspaceChapter,
  ProjectWorkspaceSnapshot,
} from "@/lib/types";

type ViewMode = "overview" | "literature" | "matrix" | "paper" | "knowledge" | "zotero" | "delivery";

const VIEWS: { key: ViewMode; label: string }[] = [
  { key: "overview", label: "项目概览" },
  { key: "delivery", label: "交付工作台" },
  { key: "literature", label: "文献库" },
  { key: "matrix", label: "文献矩阵" },
  { key: "paper", label: "论文工作流" },
  { key: "knowledge", label: "知识图谱" },
  { key: "zotero", label: "Zotero 导入" },
];

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
  const [defenseOutline, setDefenseOutline] = useState<DefensePPTOutline | null>(null);
  const [view, setView] = useState<ViewMode>("overview");
  const [kgRefreshKey, setKgRefreshKey] = useState(0);
  const [knowledgeExpanded, setKnowledgeExpanded] = useState(false);
  const [indexingOutcomeId, setIndexingOutcomeId] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const setViewWithQuery = useCallback((nextView: ViewMode) => {
    setView(nextView);
    const nextParams = new URLSearchParams(searchParams.toString());
    if (nextView === "overview") {
      nextParams.delete("view");
    } else {
      nextParams.set("view", nextView);
    }
    const query = nextParams.toString();
    router.replace(query ? `/projects/${projectId}?${query}` : `/projects/${projectId}`);
  }, [projectId, router, searchParams]);

  const loadWorkspace = useCallback(async () => {
    const snapshot = await getProjectWorkspace(projectId);
    setWorkspace(snapshot);

    const latestDraftId = snapshot.delivery.latest_draft?.id;
    if (!latestDraftId) {
      setDefenseOutline(null);
      return;
    }

    try {
      const outline = await getDefenseOutline(latestDraftId);
      setDefenseOutline(outline);
    } catch {
      setDefenseOutline(null);
    }
  }, [projectId]);

  useEffect(() => {
    const requestedView = searchParams.get("view");
    if (isViewMode(requestedView)) {
      setView(requestedView);
    }
  }, [searchParams]);

  useEffect(() => {
    getProject(projectId).then(setProject).catch(() => setProject(null));
    loadWorkspace().catch(() => {
      setWorkspace(null);
      setDefenseOutline(null);
    });
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

  return (
    <div className="min-h-screen bg-[#faf7f2] paper-texture">
      <header className="border-b border-[#3d3830] bg-[#1a1815]">
        <div className="mx-auto max-w-6xl px-6 py-6">
          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={() => router.push("/")}
              className="inline-flex items-center gap-2 text-xs tracking-wide text-[#b8a898] transition-colors hover:text-[#e8e0d0]"
            >
              返回首页
            </button>
          </div>
          <h1
            className="mt-4 text-2xl font-semibold tracking-wide text-[#e8e0d0]"
            style={{ fontFamily: "var(--font-cormorant), serif" }}
          >
            {project?.name || "项目详情"}
          </h1>
          {project?.research_field ? (
            <p className="mt-1 text-xs tracking-wide text-[#8b7355]">{project.research_field}</p>
          ) : null}
        </div>
      </header>

      <nav className="sticky top-0 z-40 border-b border-[#e8e1d5] bg-white">
        <div className="mx-auto flex max-w-6xl items-center px-6">
          {VIEWS.map((item) => (
            <button
              key={item.key}
              onClick={() => setViewWithQuery(item.key)}
              className={`relative px-5 py-3.5 text-xs tracking-wide transition-all duration-300 ${
                view === item.key ? "font-medium text-[#2d2a26]" : "text-[#8b7b6b] hover:text-[#5c4a3a]"
              }`}
              style={{ fontFamily: view === item.key ? "var(--font-cormorant), serif" : undefined }}
            >
              {item.label}
              <span
                className={`absolute bottom-0 left-1/2 h-[2px] -translate-x-1/2 bg-[#b8860b] transition-all duration-300 ${
                  view === item.key ? "w-8 opacity-100" : "w-0 opacity-0"
                }`}
              />
            </button>
          ))}
        </div>
      </nav>

      <div className="mx-auto max-w-6xl animate-fade-up px-6 py-10" key={view}>
        {view === "overview" && (
          <div className="space-y-8">
            <div className="decorative-rule">
              <p
                className="text-[11px] uppercase tracking-[0.2em] text-[#8b7355]"
                style={{ fontFamily: "var(--font-cormorant), serif" }}
              >
                Project Overview
              </p>
              <h2
                className="mt-1 text-2xl font-semibold text-[#2d2a26]"
                style={{ fontFamily: "var(--font-cormorant), serif" }}
              >
                项目概览
              </h2>
            </div>

            <p className="text-[11px] uppercase tracking-wide text-[#b8a898]">项目 ID · {projectId}</p>

            <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-5">
              <OverviewCard
                title="开题阶段"
                description="从研究方向、项目设计一路承接到开题报告。"
                action="进入研究页"
                onClick={() => router.push(`/research?project_id=${projectId}`)}
              />
              <OverviewCard
                title="论文阶段"
                description="上传成果、生成大纲、逐章撰写并衔接答辩材料。"
                action="进入论文工作流"
                onClick={() => setViewWithQuery("paper")}
              />
              <OverviewCard
                title="交付工作台"
                description="集中查看草稿、开题报告和答辩材料的可交付状态。"
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

            <section className="rounded-sm border border-[#e8e1d5] bg-white p-7">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p
                    className="text-[11px] uppercase tracking-[0.2em] text-[#8b7355]"
                    style={{ fontFamily: "var(--font-cormorant), serif" }}
                  >
                    Project Knowledge
                  </p>
                  <h3
                    className="mt-1 text-xl font-medium text-[#2d2a26]"
                    style={{ fontFamily: "var(--font-cormorant), serif" }}
                  >
                    项目知识工作台
                  </h3>
                </div>
                <button
                  onClick={() => setKnowledgeExpanded((current) => !current)}
                  className="rounded-sm border border-[#e8e1d5] px-3 py-1.5 text-[11px] tracking-wide text-[#8b7355] transition-colors hover:border-[#d4c8b0] hover:text-[#5c4a3a]"
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

              <div className="mt-6 space-y-3">
                {(workspace?.outcomes || []).slice(0, 5).map((outcome) => (
                  <div key={outcome.id} className="flex items-start justify-between gap-4 border-t border-[#f1ece4] pt-3 first:border-t-0 first:pt-0">
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-[#2d2a26]">{outcome.name}</div>
                      <div className="mt-1 text-xs text-[#8b7b6b]">
                        {outcome.outcome_type || "成果"} · {formatKnowledgeStatus(outcome.knowledge_status, outcome.chunk_count)}
                      </div>
                      {outcome.cited_by_chapters.length > 0 ? (
                        <div className="mt-1 text-[11px] text-[#b8860b]">
                          已被引用：{outcome.cited_by_chapters.join("、")}
                        </div>
                      ) : null}
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <button
                        onClick={() => handleIndexKnowledge(outcome.id)}
                        disabled={indexingOutcomeId === outcome.id}
                        className="rounded-sm border border-[#e8e1d5] px-2 py-1 text-[10px] text-[#8b7355] transition-colors hover:border-[#d4c8b0] hover:text-[#5c4a3a] disabled:opacity-40"
                      >
                        {indexingOutcomeId === outcome.id ? "解析中" : "解析入库"}
                      </button>
                      {outcome.download_url ? (
                        <a
                          href={outcome.download_url}
                          target="_blank"
                          rel="noreferrer"
                          className="rounded-sm border border-[#e8e1d5] px-2 py-1 text-[10px] text-[#8b7355] transition-colors hover:border-[#d4c8b0] hover:text-[#5c4a3a]"
                        >
                          下载
                        </a>
                      ) : null}
                    </div>
                  </div>
                ))}
                {workspace && workspace.outcomes.length === 0 ? (
                  <p className="text-xs text-[#8b7b6b]">
                    当前项目还没有成果材料。上传成果并入知识库后，这里会显示章节引用、来源跳转和交付承接情况。
                  </p>
                ) : null}
              </div>

              {knowledgeExpanded ? (
                <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-3">
                  <KnowledgePanel
                    title="成果入库状态"
                    items={(workspace?.outcomes || []).map((outcome) => ({
                      title: outcome.name,
                      meta: `${outcome.outcome_type || "成果"} · ${formatKnowledgeStatus(outcome.knowledge_status, outcome.chunk_count)}`,
                      tail: outcome.cited_by_chapters.length ? `${outcome.cited_by_chapters.length} 章引用` : "",
                    }))}
                    emptyText="暂无成果材料。"
                  />
                  <KnowledgePanel
                    title="章节知识映射"
                    items={(workspace?.chapters || []).map((chapter) => ({
                      title: chapter.title,
                      meta: `${formatChapterStatus(chapter.status)} · ${chapter.evidence_count} 条依据 · ${chapter.word_count} 字`,
                      tail: chapter.data_based ? "真实数据" : "",
                    }))}
                    emptyText="暂无草稿章节映射。"
                  />
                  <KnowledgePanel
                    title="证据与资料线索"
                    items={[
                      ...linkedNotes.slice(0, 6).map((note) => ({
                        title: note.title,
                        meta: `${note.note_type || "证据卡片"}${note.confidence ? ` · ${note.confidence}/100` : ""}`,
                        tail: "卡片",
                      })),
                      ...linkedChunks.slice(0, 6).map((chunk) => ({
                        title: chunk.title,
                        meta: `${chunk.source_type || "资料片段"} · ${chunk.source_filename || "来源文件"}`,
                        tail: "资料",
                      })),
                    ]}
                    emptyText="暂无可展示的证据卡片或资料片段。"
                  />
                </div>
              ) : null}
            </section>

            {workspace?.chapters?.length ? (
              <section className="rounded-sm border border-[#e8e1d5] bg-white p-7">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p
                      className="text-[11px] uppercase tracking-[0.2em] text-[#8b7355]"
                      style={{ fontFamily: "var(--font-cormorant), serif" }}
                    >
                      Chapter Mapping
                    </p>
                    <h3
                      className="mt-1 text-xl font-medium text-[#2d2a26]"
                      style={{ fontFamily: "var(--font-cormorant), serif" }}
                    >
                      章节依据映射
                    </h3>
                  </div>
                  <button
                    onClick={() => setViewWithQuery("paper")}
                    className="rounded-sm border border-[#e8e1d5] px-3 py-1.5 text-[11px] tracking-wide text-[#8b7355] transition-colors hover:border-[#d4c8b0] hover:text-[#5c4a3a]"
                  >
                    进入论文工作流
                  </button>
                </div>

                <div className="mt-6 grid grid-cols-1 gap-4 xl:grid-cols-2">
                  {workspace.chapters.map((chapter) => (
                    <ChapterTraceCard key={chapter.chapter_key} chapter={chapter} />
                  ))}
                </div>
              </section>
            ) : null}

            <div className="border-t border-[#e8e1d5] pt-8">
              {!deleteConfirm ? (
                <button
                  onClick={() => setDeleteConfirm(true)}
                  className="text-xs tracking-wide text-[#b8a898] transition-colors hover:text-[#c44]"
                >
                  删除此项目
                </button>
              ) : (
                <div className="flex max-w-md items-center gap-3 rounded-sm border border-red-200 bg-red-50/50 p-4">
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
          <DeliveryWorkspace
            projectId={projectId}
            workspace={workspace}
            defenseOutline={defenseOutline}
            onOpenResearch={() => router.push(`/research?project_id=${projectId}`)}
            onOpenWriting={() => setViewWithQuery("paper")}
          />
        )}

        {view === "literature" ? <ProjectLiteratureLibrary projectId={projectId} /> : null}
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

function DeliveryWorkspace({
  projectId,
  workspace,
  defenseOutline,
  onOpenResearch,
  onOpenWriting,
}: {
  projectId: string;
  workspace: ProjectWorkspaceSnapshot | null;
  defenseOutline: DefensePPTOutline | null;
  onOpenResearch: () => void;
  onOpenWriting: () => void;
}) {
  const latestDraft = workspace?.delivery.latest_draft ?? null;
  const latestProposal = workspace?.delivery.latest_proposal ?? null;
  const defense = workspace?.delivery.defense ?? null;

  return (
    <div className="space-y-8">
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

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
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
        />
        <DeliveryCard
          title="开题报告"
          subtitle={latestProposal ? "已生成最新开题报告" : "尚未生成开题报告"}
          description={latestProposal ? latestProposal.title : "从研究页进入项目设计后可继续生成开题报告与开题材料。"}
          primaryLabel={latestProposal ? "打开研究页" : "前往研究页"}
          onPrimary={onOpenResearch}
          secondaryLinks={latestProposal ? [
            { label: "下载 DOCX", href: latestProposal.download_docx_url },
            { label: "下载 PDF", href: latestProposal.download_pdf_url },
          ] : []}
        />
        <DeliveryCard
          title="答辩材料"
          subtitle={defense?.ready ? (defenseOutline ? `${defenseOutline.total_slides} 页答辩大纲可生成` : "已具备答辩材料生成基础") : "当前草稿尚不足以形成答辩材料"}
          description={defense?.has_real_data ? "当前草稿包含真实数据标记，可直接进入答辩材料生成。" : "当前草稿真实数据标记不足，建议补充成果材料后再生成答辩材料。"}
          primaryLabel="进入论文工作流"
          onPrimary={onOpenWriting}
          secondaryLinks={defenseOutline ? [
            { label: `大纲 ${defenseOutline.total_slides} 页`, href: `/projects/${projectId}?view=paper` },
          ] : []}
        />
      </div>

      <section className="rounded-sm border border-[#e8e1d5] bg-white p-7">
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
          <KnowledgeStat label="开题报告" value={latestProposal ? "已生成" : "待生成"} />
          <KnowledgeStat label="答辩大纲" value={defenseOutline ? `${defenseOutline.total_slides} 页` : "待生成"} />
          <KnowledgeStat label="真实数据" value={defense?.has_real_data ? "已具备" : "不足"} />
        </div>
      </section>
    </div>
  );
}

function ChapterTraceCard({ chapter }: { chapter: ProjectWorkspaceChapter }) {
  const [expanded, setExpanded] = useState(false);
  const hasEvidence = chapter.evidence_count > 0;

  return (
    <div className="rounded-sm border border-[#e8e1d5] bg-white p-5">
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
                actionLabel={outcome.download_url ? "下载文件" : outcome.action_label}
                href={outcome.download_url || outcome.action_url}
                external={Boolean(outcome.download_url)}
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
                actionLabel="下载来源文件"
                href={chunk.download_url}
                external
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
  items: React.ReactNode[];
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
}: {
  badge: string;
  title: string;
  meta: string;
  description?: string;
  actionLabel: string;
  href: string;
  external?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-sm border border-[#ece5d8] bg-white p-3">
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
      <a
        href={href}
        target={external ? "_blank" : undefined}
        rel={external ? "noreferrer" : undefined}
        className="shrink-0 rounded-sm border border-[#e8e1d5] px-3 py-1.5 text-[11px] tracking-wide text-[#8b7355] transition-colors hover:border-[#d4c8b0] hover:text-[#5c4a3a]"
      >
        {actionLabel}
      </a>
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
}: {
  title: string;
  subtitle: string;
  description: string;
  primaryLabel: string;
  onPrimary: () => void;
  secondaryLinks: { label: string; href: string }[];
}) {
  return (
    <div className="rounded-sm border border-[#e8e1d5] bg-white p-6">
      <h3 className="text-lg font-medium text-[#2d2a26]" style={{ fontFamily: "var(--font-cormorant), serif" }}>
        {title}
      </h3>
      <p className="mt-2 text-sm text-[#8b7355]">{subtitle}</p>
      <p className="mt-4 text-xs leading-relaxed text-[#8b7b6b]">{description}</p>
      <div className="mt-5 flex flex-wrap gap-2">
        <button
          onClick={onPrimary}
          className="rounded-sm bg-[#1a1815] px-4 py-2 text-[11px] uppercase tracking-wide text-[#e8e0d0]"
        >
          {primaryLabel}
        </button>
        {secondaryLinks.map((item) => (
          <a
            key={item.label}
            href={item.href}
            target="_blank"
            rel="noreferrer"
            className="rounded-sm border border-[#e8e1d5] px-4 py-2 text-[11px] uppercase tracking-wide text-[#8b7355]"
          >
            {item.label}
          </a>
        ))}
      </div>
    </div>
  );
}

function KnowledgeStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-sm border border-[#efe8dc] bg-[#fcfbf8] px-4 py-4">
      <div className="text-[11px] uppercase tracking-wide text-[#8b7355]">{label}</div>
      <div className="mt-2 text-lg font-medium text-[#2d2a26]">{value}</div>
    </div>
  );
}

function KnowledgePanel({
  title,
  items,
  emptyText,
}: {
  title: string;
  items: { title: string; meta: string; tail?: string }[];
  emptyText: string;
}) {
  return (
    <div className="rounded-sm border border-[#efe8dc] bg-[#fcfbf8] p-5">
      <h4 className="text-sm font-medium text-[#2d2a26]" style={{ fontFamily: "var(--font-cormorant), serif" }}>
        {title}
      </h4>
      <div className="mt-4 space-y-3">
        {items.length > 0 ? (
          items.map((item, index) => (
            <div key={`${item.title}-${index}`} className="flex items-start justify-between gap-3 border-t border-[#f1ece4] pt-3 first:border-t-0 first:pt-0">
              <div className="min-w-0">
                <div className="truncate text-sm text-[#2d2a26]">{item.title}</div>
                <div className="mt-1 text-xs text-[#8b7b6b]">{item.meta}</div>
              </div>
              {item.tail ? <span className="shrink-0 text-[11px] text-[#b8860b]">{item.tail}</span> : null}
            </div>
          ))
        ) : (
          <p className="text-xs text-[#8b7b6b]">{emptyText}</p>
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
      className="accent-card group cursor-pointer rounded-sm border border-[#e8e1d5] bg-white p-7 transition-all duration-300 hover:-translate-y-0.5 hover:border-[#d4c8b0] hover:shadow-xl hover:shadow-[#1a1815]/6"
    >
      <h3 className="mb-3 text-lg font-medium text-[#2d2a26]" style={{ fontFamily: "var(--font-cormorant), serif" }}>
        {title}
      </h3>
      <p className="mb-6 text-xs leading-relaxed text-[#8b7b6b]">{description}</p>
      <span className="text-[10px] uppercase tracking-wider text-[#b8860b] transition-colors group-hover:text-[#8b6914]">
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
