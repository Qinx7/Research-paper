/** 论文写作页：承载项目草稿、连续章节编辑、AI 审查修订、资料证据与导出。 */
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import {
  checkCompliance,
  confirmComplianceIssue,
  createDraft,
  downloadWithAuth,
  generateAbstract,
  generateFullDraft,
  generateOutline,
  generateWritingPlan,
  getDraft,
  getDraftDownloadUrl,
  getComplianceStatus,
  listDrafts,
  listProjects,
  reviewChapter,
  reviewFullDraft,
  reviseChapter,
  reviseFullDraft,
  searchProjectDocuments,
  updateDraft,
} from "@/lib/api";
import { useAuth } from "@/lib/AuthContext";
import type {
  AbstractResult,
  ComplianceIssue,
  ComplianceResult,
  Draft,
  ProjectDocumentSearchResult,
  Project,
} from "@/lib/types";
import {
  buildEditedChapterPayload,
  getDraftChapterRecord,
  getDraftCompletionSummary,
} from "@/lib/draftKnowledge";
import { buildFullDraftSections } from "@/lib/fullDraftView.mjs";
import { normalizeWritingPlan } from "@/lib/writingPlan.mjs";
import { normalizeWritingReview } from "@/lib/writingReview.mjs";
import { normalizeWritingRevision } from "@/lib/writingRevision.mjs";
import { normalizeFullDraftReview } from "@/lib/writingFullReview.mjs";
import { normalizeFullDraftRevision } from "@/lib/writingFullRevision.mjs";
import { buildRevisionStatus } from "@/lib/writingRevisionStatus.mjs";
import { buildRevisionCompare } from "@/lib/writingRevisionCompare.mjs";

const CHAPTER_LABELS: Record<string, string> = {
  chapter_1_introduction: "第一章 绪论",
  chapter_2_theory: "第二章 相关理论与技术基础",
  chapter_3_design: "第三章 系统需求分析与总体设计",
  chapter_4_implementation: "第四章 系统实现",
  chapter_5_experiment: "第五章 实验设计与结果分析",
  chapter_6_conclusion: "第六章 总结与展望",
};

type WritingPlanView = {
  goal: string;
  recommendedStructure: string[];
  evidenceGaps: string[];
  risks: string[];
  notes: string;
};

type WritingReviewView = {
  chapterKey: string;
  passed: boolean;
  summary: string;
  issues: {
    severity: string;
    title: string;
    detail: string;
    suggestion: string;
  }[];
  focusAreas: string[];
};

type WritingRevisionView = {
  chapterKey: string;
  title: string;
  content: string;
  changeSummary: string[];
  resolvedIssues: string[];
  citations: string[];
  dataBased: boolean;
};

type FullDraftReviewView = {
  passed: boolean;
  summary: string;
  issues: {
    severity: string;
    title: string;
    detail: string;
    suggestion: string;
  }[];
  focusAreas: string[];
  chapterFlags: Record<string, string[]>;
};

type FullDraftRevisionView = {
  title: string;
  fullText: string;
  changeSummary: string[];
  resolvedIssues: string[];
  remainingIssues: string[];
};

function CenteredState({
  title,
  description,
  actionLabel,
  onAction,
}: {
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <div className="flex min-h-screen items-center justify-center px-6">
      <div className="max-w-md rounded-2xl border border-[#dfe7ef] bg-white p-8 text-center shadow-sm">
        <h1 className="text-2xl font-semibold text-[#16202a]">{title}</h1>
        <p className="mt-4 text-sm leading-7 text-[#647282]">{description}</p>
        {actionLabel && onAction ? (
          <button
            type="button"
            onClick={onAction}
            className="mt-6 rounded-full bg-[#168fe3] px-5 py-2.5 text-sm font-medium text-white"
          >
            {actionLabel}
          </button>
        ) : null}
      </div>
    </div>
  );
}

function WritingSidePanel({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-4">
      <div className="mb-2 text-[11px] font-black uppercase tracking-[0.14em] text-[#6f7f91]">{title}</div>
      <div className="rounded-xl border border-[#dbe4ef] bg-white p-3 shadow-[0_8px_24px_rgba(24,54,91,0.04)]">{children}</div>
    </section>
  );
}

function SuggestionCard({ text }: { text: string }) {
  return (
    <div className="mb-2 rounded-lg border border-[#e1e8f0] bg-[#f7faff] px-3 py-2 last:mb-0">
      <p className="text-[11.5px] leading-5 text-[#324256]">{text}</p>
    </div>
  );
}

function ContinuousChapterTextarea({
  value,
  active,
  onFocus,
  onChange,
}: {
  value: string;
  active: boolean;
  onFocus: () => void;
  onChange: (value: string) => void;
}) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    const node = textareaRef.current;
    if (!node) return;
    node.style.height = "0px";
    node.style.height = `${Math.max(220, node.scrollHeight)}px`;
  }, [value]);

  return (
    <textarea
      ref={textareaRef}
      value={value}
      onFocus={onFocus}
      onChange={(event) => onChange(event.target.value)}
      className="w-full resize-none border-0 bg-transparent px-0 py-0 text-[15.5px] leading-8 outline-none"
      style={{
        minHeight: 220,
        color: "#202a35",
        fontFamily: "Georgia, 'Times New Roman', 'Noto Serif SC', serif",
        boxShadow: active ? "inset 0 0 0 1px rgba(37,99,235,0.12)" : "none",
      }}
    />
  );
}

function ChapterBadge({ severity }: { severity: string }) {
  const tone =
    severity === "warning"
      ? "bg-[#fff7e8] text-[#8a5a00]"
      : severity === "error"
        ? "bg-red-100 text-red-700"
        : "bg-[#edf5ff] text-[#1d62c7]";

  return <span className={`rounded px-1.5 py-0.5 text-[10px] ${tone}`}>{severity}</span>;
}

export default function WritingPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();

  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string>("");
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [activeDraft, setActiveDraft] = useState<Draft | null>(null);
  const [activeChapterKey, setActiveChapterKey] = useState("chapter_1_introduction");

  const [editorContents, setEditorContents] = useState<Record<string, string>>({});
  const [writingPlan, setWritingPlan] = useState<WritingPlanView | null>(null);
  const [chapterReview, setChapterReview] = useState<WritingReviewView | null>(null);
  const [chapterRevision, setChapterRevision] = useState<WritingRevisionView | null>(null);
  const [fullDraftReview, setFullDraftReview] = useState<FullDraftReviewView | null>(null);
  const [fullDraftRevision, setFullDraftRevision] = useState<FullDraftRevisionView | null>(null);
  const [revisionBaselineContent, setRevisionBaselineContent] = useState("");
  const [abstractResult, setAbstractResult] = useState<AbstractResult | null>(null);
  const [complianceResult, setComplianceResult] = useState<ComplianceResult | null>(null);
  const [documentQuery, setDocumentQuery] = useState("");
  const [documentResults, setDocumentResults] = useState<ProjectDocumentSearchResult[]>([]);
  const [documentSearching, setDocumentSearching] = useState(false);
  const [documentSearchError, setDocumentSearchError] = useState<string | null>(null);

  const [loading, setLoading] = useState(true);
  const [draftLoading, setDraftLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [fullDraftGenerating, setFullDraftGenerating] = useState(false);
  const [writingPlanGenerating, setWritingPlanGenerating] = useState(false);
  const [outlineGenerating, setOutlineGenerating] = useState(false);
  const [abstractGenerating, setAbstractGenerating] = useState(false);
  const [reviewLoading, setReviewLoading] = useState(false);
  const [revisionLoading, setRevisionLoading] = useState(false);
  const [fullReviewLoading, setFullReviewLoading] = useState(false);
  const [fullRevisionLoading, setFullRevisionLoading] = useState(false);
  const [complianceLoading, setComplianceLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [downloadFormat, setDownloadFormat] = useState<"docx" | "pdf">("docx");
  const [preselectedProjectId, setPreselectedProjectId] = useState<string | null>(null);
  const [preselectedDraftId, setPreselectedDraftId] = useState<string | null>(null);

  const chapterRefs = useRef<Record<string, HTMLElement | null>>({});

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    setPreselectedProjectId(params.get("project_id"));
    setPreselectedDraftId(params.get("draft_id"));
  }, []);

  const loadProjects = useCallback(async () => {
    const items = await listProjects();
    setProjects(items);
    setSelectedProjectId((current) => {
      if (current && items.some((item) => item.id === current)) return current;
      if (preselectedProjectId && items.some((item) => item.id === preselectedProjectId)) return preselectedProjectId;
      return items[0]?.id || "";
    });
  }, [preselectedProjectId]);

  const loadDrafts = useCallback(async (projectId: string, preferredDraftId?: string | null) => {
    if (!projectId) {
      setDrafts([]);
      setActiveDraft(null);
      return;
    }
    const items = await listDrafts(projectId);
    setDrafts(items);
    if (!items.length) {
      setActiveDraft(null);
      return;
    }
    const targetDraftId =
      preferredDraftId && items.some((item) => item.id === preferredDraftId)
        ? preferredDraftId
        : items[0].id;
    const draft = await getDraft(targetDraftId);
    setActiveDraft(draft);
  }, []);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      setLoading(false);
      return;
    }
    setLoading(true);
    loadProjects().finally(() => setLoading(false));
  }, [authLoading, loadProjects, user]);

  useEffect(() => {
    if (!selectedProjectId) return;
    setDraftLoading(true);
    loadDrafts(selectedProjectId, preselectedDraftId)
      .catch(() => setError("加载草稿失败"))
      .finally(() => setDraftLoading(false));
  }, [loadDrafts, preselectedDraftId, selectedProjectId]);

  useEffect(() => {
    if (!activeDraft) {
      setEditorContents({});
      setWritingPlan(null);
      setChapterReview(null);
      setChapterRevision(null);
      setFullDraftReview(null);
      setFullDraftRevision(null);
      setAbstractResult(null);
      return;
    }
    const content = activeDraft.content || {};
    const next: Record<string, string> = {};
    for (const key of Object.keys(CHAPTER_LABELS)) {
      const record = content[key];
      next[key] = record && typeof record === "object" && typeof (record as { content?: string }).content === "string"
        ? (record as { content: string }).content
        : "";
    }
    setEditorContents(next);
    setWritingPlan(normalizeWritingPlan(content._writing_plan) as WritingPlanView | null);
    setFullDraftReview(normalizeFullDraftReview(content._full_review) as FullDraftReviewView | null);
    setFullDraftRevision(normalizeFullDraftRevision(content._full_revision) as FullDraftRevisionView | null);
  }, [activeDraft]);

  const sections = useMemo(
    () => buildFullDraftSections(activeDraft, CHAPTER_LABELS),
    [activeDraft],
  );
  const activeSection = sections.find((item) => item.key === activeChapterKey) || sections[0] || null;
  const draftSummary = getDraftCompletionSummary(activeDraft, sections.map((item) => item.key));
  const revisionStatus = useMemo(
    () => buildRevisionStatus(chapterReview, chapterRevision),
    [chapterReview, chapterRevision],
  );
  const revisionCompare = useMemo(
    () => buildRevisionCompare(revisionBaselineContent, chapterRevision?.content || ""),
    [revisionBaselineContent, chapterRevision?.content],
  );
  const selectedRecord = getDraftChapterRecord(activeDraft, activeChapterKey);
  const selectedTitle = selectedRecord?.title || activeSection?.title || CHAPTER_LABELS[activeChapterKey];
  const selectedContent = editorContents[activeChapterKey] || "";
  const selectedCitations = selectedRecord?.citations || [];
  const selectedCompliance = useMemo(() => {
    if (!complianceResult) return null;
    return complianceResult.chapters?.[activeChapterKey] || null;
  }, [complianceResult, activeChapterKey]);
  const userInitial = (user?.username || user?.email || "U").slice(0, 1).toUpperCase();

  const handleCreateDraft = async () => {
    if (!selectedProjectId) return;
    setDraftLoading(true);
    setError(null);
    try {
      const draft = await createDraft({ project_id: selectedProjectId, title: "毕业论文" });
      const full = await getDraft(draft.id);
      setActiveDraft(full);
      await loadDrafts(selectedProjectId);
      setNotice("已创建新草稿");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "创建草稿失败");
    } finally {
      setDraftLoading(false);
    }
  };

  const handleSelectDraft = async (draftId: string) => {
    setDraftLoading(true);
    setError(null);
    try {
      const draft = await getDraft(draftId);
      setActiveDraft(draft);
      const params = new URLSearchParams();
      if (selectedProjectId) params.set("project_id", selectedProjectId);
      params.set("draft_id", draftId);
      router.replace(`/writing?${params.toString()}`);
      setChapterReview(null);
      setChapterRevision(null);
      setFullDraftReview(null);
      setFullDraftRevision(null);
      setAbstractResult(null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "加载草稿失败");
    } finally {
      setDraftLoading(false);
    }
  };

  const handleSaveAll = async () => {
    if (!activeDraft) return;
    setSaving(true);
    setError(null);
    try {
      const content = { ...(activeDraft.content || {}) };
      for (const section of sections) {
        content[section.key] = buildEditedChapterPayload(
          getDraftChapterRecord(activeDraft, section.key) || undefined,
          section.title,
          editorContents[section.key] || "",
        );
      }
      const updated = await updateDraft(activeDraft.id, { content });
      setActiveDraft(updated);
      setNotice("已保存整篇草稿");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "保存失败");
    } finally {
      setSaving(false);
    }
  };

  const handleGenerateFullDraft = async () => {
    if (!activeDraft) return;
    setFullDraftGenerating(true);
    setError(null);
    try {
      const updated = await generateFullDraft(activeDraft.id);
      setActiveDraft(updated);
      setChapterReview(null);
      setChapterRevision(null);
      setFullDraftReview(null);
      setFullDraftRevision(null);
      setAbstractResult(null);
      setNotice("已生成完整初稿");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "整篇初稿生成失败");
    } finally {
      setFullDraftGenerating(false);
    }
  };

  const handleGenerateWritingPlan = async () => {
    if (!activeDraft) return;
    setWritingPlanGenerating(true);
    setError(null);
    try {
      const result = await generateWritingPlan(activeDraft.id);
      setWritingPlan(normalizeWritingPlan(result) as WritingPlanView | null);
      setNotice("已生成写作计划");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "写作计划生成失败");
    } finally {
      setWritingPlanGenerating(false);
    }
  };

  const handleGenerateOutline = async () => {
    if (!activeDraft) return;
    setOutlineGenerating(true);
    setError(null);
    try {
      await generateOutline(activeDraft.id);
      const updated = await getDraft(activeDraft.id);
      setActiveDraft(updated);
      setNotice("已生成论文大纲");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "论文大纲生成失败");
    } finally {
      setOutlineGenerating(false);
    }
  };

  const handleGenerateAbstract = async () => {
    if (!activeDraft) return;
    setAbstractGenerating(true);
    setError(null);
    try {
      const result = await generateAbstract(activeDraft.id);
      setAbstractResult(result);
      setNotice("已生成摘要");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "摘要生成失败");
    } finally {
      setAbstractGenerating(false);
    }
  };

  const handleReviewCurrent = async () => {
    if (!activeDraft || !activeSection) return;
    setReviewLoading(true);
    setError(null);
    try {
      const result = await reviewChapter(activeDraft.id, activeSection.key);
      setChapterReview(normalizeWritingReview(result) as WritingReviewView | null);
      setChapterRevision(null);
      setNotice("已完成当前章节审查");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "章节审查失败");
    } finally {
      setReviewLoading(false);
    }
  };

  const handleCheckCompliance = async () => {
    if (!activeDraft) return;
    setComplianceLoading(true);
    setError(null);
    try {
      const result = await checkCompliance(activeDraft.id, false);
      setComplianceResult(result);
      setNotice("已完成合规检查");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "合规检查失败");
    } finally {
      setComplianceLoading(false);
    }
  };

  const handleComplianceAction = async (
    issueIndex: number,
    action: "accept" | "ignore" | "fixed",
  ) => {
    if (!activeDraft || !selectedCompliance) return;
    try {
      await confirmComplianceIssue(activeDraft.id, activeChapterKey, issueIndex, action);
      const status = await getComplianceStatus(activeDraft.id);
      if (status.checked) {
        setComplianceResult(status);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "合规确认失败");
    }
  };

  const handleReviseCurrent = async () => {
    if (!activeDraft || !activeSection) return;
    setRevisionLoading(true);
    setError(null);
    try {
      setRevisionBaselineContent(editorContents[activeSection.key] || "");
      const result = await reviseChapter(activeDraft.id, activeSection.key);
      const nextContent = result.content || "";
      setEditorContents((current) => ({ ...current, [activeSection.key]: nextContent }));
      setChapterRevision(normalizeWritingRevision(result) as WritingRevisionView | null);
      const updated = await getDraft(activeDraft.id);
      setActiveDraft(updated);
      setNotice("已修订当前章节");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "章节修订失败");
    } finally {
      setRevisionLoading(false);
    }
  };

  const handleReviewFullDraft = async () => {
    if (!activeDraft) return;
    setFullReviewLoading(true);
    setError(null);
    try {
      const result = await reviewFullDraft(activeDraft.id);
      setFullDraftReview(normalizeFullDraftReview(result) as FullDraftReviewView | null);
      setFullDraftRevision(null);
      const updated = await getDraft(activeDraft.id);
      setActiveDraft(updated);
      setNotice("已完成整篇审查");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "整篇审查失败");
    } finally {
      setFullReviewLoading(false);
    }
  };

  const handleReviseFullDraft = async () => {
    if (!activeDraft) return;
    setFullRevisionLoading(true);
    setError(null);
    try {
      const result = await reviseFullDraft(activeDraft.id);
      setFullDraftRevision(normalizeFullDraftRevision(result) as FullDraftRevisionView | null);
      setChapterReview(null);
      setChapterRevision(null);
      const updated = await getDraft(activeDraft.id);
      setActiveDraft(updated);
      setNotice("已完成整篇修订");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "整篇修订失败");
    } finally {
      setFullRevisionLoading(false);
    }
  };

  const handleSearchProjectDocuments = async () => {
    const query = documentQuery.trim();
    if (!selectedProjectId || !query) {
      setDocumentResults([]);
      setDocumentSearchError(null);
      return;
    }
    setDocumentSearching(true);
    setDocumentSearchError(null);
    try {
      const results = await searchProjectDocuments(selectedProjectId, query, 6);
      setDocumentResults(results);
    } catch (err: unknown) {
      setDocumentSearchError(err instanceof Error ? err.message : "项目资料搜索失败");
      setDocumentResults([]);
    } finally {
      setDocumentSearching(false);
    }
  };

  const handleInsertDocumentResult = (item: ProjectDocumentSearchResult) => {
    const excerpt = (item.content_excerpt || "").trim();
    if (!excerpt) return;
    setEditorContents((current) => {
      const previous = current[activeChapterKey] || "";
      const nextContent = previous.trim()
        ? `${previous.trim()}\n\n[项目资料依据]\n${excerpt}`
        : `[项目资料依据]\n${excerpt}`;
      return { ...current, [activeChapterKey]: nextContent };
    });
    setNotice("已插入当前章节");
    focusChapter(activeChapterKey);
  };

  const buildDocumentResultProjectUrl = (item: ProjectDocumentSearchResult) => {
    const params = new URLSearchParams();
    params.set("highlight_type", "chunk");
    params.set("highlight_id", item.chunk_id);
    params.set("view", "overview");
    return `/projects/${selectedProjectId}?${params.toString()}`;
  };

  const handleDownload = async () => {
    if (!activeDraft) return;
    await downloadWithAuth(
      getDraftDownloadUrl(activeDraft.id, downloadFormat),
      `${activeDraft.title || "draft"}.${downloadFormat}`,
    );
  };

  const focusChapter = (key: string) => {
    setActiveChapterKey(key);
    chapterRefs.current[key]?.scrollIntoView({ behavior: "smooth", block: "start" });
    chapterRefs.current[key]?.focus();
  };

  if (authLoading || loading) {
    return <CenteredState title="正在加载写作页..." description="正在读取项目与草稿数据。" />;
  }

  if (!user) {
    return <CenteredState title="请先登录" description="写作页需要读取你的项目和草稿。" actionLabel="前往登录" onAction={() => router.push("/login")} />;
  }

  if (projects.length === 0) {
    return (
      <CenteredState
        title="暂无可写作项目"
        description="论文写作需要先绑定一个研究项目。请先回到首页或项目管理创建项目，再进入写作工作区。"
        actionLabel="返回首页创建"
        onAction={() => router.push("/")}
      />
    );
  }

  return (
    <div className="h-screen overflow-hidden bg-[#f5f7fa] text-[#182230]">
      <header className="flex h-16 items-center justify-between border-b border-[#d8e1ec] bg-white/95 px-8 shadow-[0_1px_0_rgba(24,34,48,0.02)] backdrop-blur">
        <div className="flex min-w-0 items-center gap-8">
          <button type="button" onClick={() => router.push("/")} className="text-lg font-black text-[#1d5fd1]">
            论文写作
          </button>
          <nav className="hidden items-center gap-6 text-xs font-black uppercase tracking-[0.14em] text-[#6f7f91] xl:flex">
            <button type="button" onClick={() => router.push("/")}>首页</button>
            <button type="button" onClick={() => router.push("/research")}>研究方向</button>
            <button type="button" onClick={() => router.push("/projects")}>项目管理</button>
          </nav>
        </div>

        <div className="flex min-w-0 items-center gap-3">
          {notice ? <div className="hidden max-w-[360px] truncate rounded-full bg-[#ecfdf5] px-3 py-1.5 text-xs font-bold text-[#1f8f5f] lg:block">{notice}</div> : null}
          {error ? <div className="hidden max-w-[360px] truncate rounded-full bg-[#fff3f3] px-3 py-1.5 text-xs font-bold text-[#a44545] lg:block">{error}</div> : null}
          <button type="button" onClick={handleSaveAll} disabled={!activeDraft || saving} className="rounded-lg border border-[#cfd9e6] bg-white px-4 py-2 text-xs font-black text-[#405166] transition-colors hover:bg-[#f3f6fa] disabled:cursor-not-allowed disabled:opacity-50">
            {saving ? "保存中..." : "保存"}
          </button>
          <button type="button" onClick={handleDownload} disabled={!activeDraft} className="rounded-lg bg-[#2563eb] px-4 py-2 text-xs font-black text-white shadow-[0_10px_24px_rgba(37,99,235,0.18)] transition-colors hover:bg-[#1d4ed8] disabled:cursor-not-allowed disabled:bg-[#9fb4d7]">
            导出
          </button>
          <div className="grid h-9 w-9 place-items-center rounded-full border border-[#cfd9e6] bg-[#f7faff] text-xs font-black text-[#2563eb]">
            {userInitial}
          </div>
        </div>
      </header>

      <div className="grid h-[calc(100vh-64px)] grid-cols-[300px_minmax(0,1fr)_340px] overflow-hidden">
        <aside className="flex min-h-0 flex-col border-r border-[#d8e1ec] bg-[#f8fafc]">
          <div className="border-b border-[#d8e1ec] p-5">
            <div className="mb-2 text-[11px] font-black uppercase tracking-[0.14em] text-[#7b8a9d]">当前项目</div>
            <select
              value={selectedProjectId}
              onChange={(event) => {
                const nextProjectId = event.target.value;
                setSelectedProjectId(nextProjectId);
                const params = new URLSearchParams();
                if (nextProjectId) params.set("project_id", nextProjectId);
                router.replace(nextProjectId ? `/writing?${params.toString()}` : "/writing");
              }}
              className="h-11 w-full rounded-lg border border-[#cfd9e6] bg-white px-3 text-sm font-semibold text-[#1f2d3d] outline-none"
            >
              {projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </select>
          </div>

          <div className="border-b border-[#d8e1ec] p-5">
            <div className="mb-3 flex items-center justify-between">
              <span className="text-[11px] font-black uppercase tracking-[0.14em] text-[#7b8a9d]">草稿</span>
              <button type="button" onClick={handleCreateDraft} disabled={!selectedProjectId || draftLoading} className="rounded-lg bg-[#2563eb] px-3 py-1.5 text-xs font-black text-white disabled:cursor-not-allowed disabled:bg-[#a9b8cf]">
                新建
              </button>
            </div>
            <div className="max-h-44 space-y-1 overflow-y-auto pr-1" style={{ scrollbarWidth: "thin" }}>
              {drafts.length ? drafts.map((draft) => (
                <button
                  key={draft.id}
                  type="button"
                  onClick={() => handleSelectDraft(draft.id)}
                  className={`w-full rounded-lg border px-3 py-2 text-left text-sm transition-colors ${
                    activeDraft?.id === draft.id
                      ? "border-[#bfd3ff] bg-[#edf5ff] text-[#1d4ed8]"
                      : "border-transparent bg-white text-[#1f2d3d] hover:border-[#d8e1ec]"
                  }`}
                >
                  <div className="truncate font-bold">{draft.title}</div>
                  <div className="mt-0.5 text-[11px] text-[#7b8a9d]">v{draft.version}</div>
                </button>
              )) : (
                <div className="rounded-lg border border-dashed border-[#cfd9e6] bg-white px-3 py-5 text-center text-xs text-[#7b8a9d]">暂无草稿</div>
              )}
            </div>
          </div>

          {activeDraft ? (
            <div className="flex min-h-0 flex-1 flex-col p-5">
              <div className="mb-5">
                <div className="mb-2 flex items-center justify-between text-[11px] font-black uppercase tracking-[0.14em] text-[#7b8a9d]">
                  <span>整篇进度</span>
                  <span>{draftSummary.progress}%</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-[#e5edf6]">
                  <div className="h-full rounded-full bg-[#2563eb]" style={{ width: `${draftSummary.progress}%` }} />
                </div>
              </div>

              <div className="mb-2 text-[11px] font-black uppercase tracking-[0.14em] text-[#7b8a9d]">章节导航</div>
              <div className="min-h-0 flex-1 space-y-1 overflow-y-auto pr-1" style={{ scrollbarWidth: "thin" }}>
                {sections.map((section) => (
                  <button
                    key={section.key}
                    type="button"
                    onClick={() => focusChapter(section.key)}
                    className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                      activeChapterKey === section.key ? "bg-[#edf5ff] text-[#1d4ed8]" : "bg-white text-[#1f2d3d] hover:bg-[#f1f5fb]"
                    }`}
                  >
                    <span className="truncate">{section.title}</span>
                    <span className="ml-2 text-[11px] text-[#7b8a9d]">{section.wordCount}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </aside>

        <main className="flex min-h-0 flex-col overflow-hidden bg-[#f3f6fa]">
          {!activeDraft ? (
            <div className="flex min-h-0 flex-1 items-center justify-center px-8 text-center">
              <div className="max-w-md rounded-2xl border border-[#d8e1ec] bg-white px-8 py-10 shadow-[0_20px_60px_rgba(24,54,91,0.08)]">
                <h2 className="text-2xl font-semibold">先创建一份整篇草稿</h2>
                <p className="mt-3 text-sm leading-7 text-[#647282]">
                  创建后可以直接在这一页生成完整初稿、整篇编辑、当前章节审查与修订。
                </p>
                <button type="button" onClick={handleCreateDraft} disabled={!selectedProjectId || draftLoading} className="mt-6 rounded-lg bg-[#2563eb] px-5 py-2.5 text-sm font-black text-white disabled:bg-[#a9b8cf]">
                  新建草稿
                </button>
              </div>
            </div>
          ) : (
            <div className="min-h-0 flex-1 overflow-y-auto px-6 py-8" style={{ scrollbarWidth: "thin" }}>
              <div className="sticky top-0 z-20 mx-auto mb-8 flex w-fit items-center gap-1 rounded-xl border border-[#d8e1ec] bg-white p-1 shadow-[0_10px_32px_rgba(24,54,91,0.08)]">
                <button type="button" className="rounded-lg px-3 py-2 text-sm font-black text-[#536273] hover:bg-[#f1f5fb]">B</button>
                <button type="button" className="rounded-lg px-3 py-2 text-sm italic text-[#536273] hover:bg-[#f1f5fb]">I</button>
                <button type="button" className="rounded-lg px-3 py-2 text-sm underline text-[#536273] hover:bg-[#f1f5fb]">U</button>
                <div className="mx-1 h-6 w-px bg-[#d8e1ec]" />
                <button type="button" onClick={handleGenerateWritingPlan} disabled={writingPlanGenerating} className="rounded-lg px-3 py-2 text-xs font-black text-[#536273] hover:bg-[#f1f5fb] disabled:opacity-50">
                  {writingPlanGenerating ? "计划中..." : "写作计划"}
                </button>
                <button type="button" onClick={handleGenerateOutline} disabled={outlineGenerating} className="rounded-lg px-3 py-2 text-xs font-black text-[#536273] hover:bg-[#f1f5fb] disabled:opacity-50">
                  {outlineGenerating ? "大纲中..." : "生成大纲"}
                </button>
                <button type="button" onClick={handleGenerateFullDraft} disabled={fullDraftGenerating} className="rounded-lg px-3 py-2 text-xs font-black text-[#2563eb] hover:bg-[#edf5ff] disabled:opacity-50">
                  {fullDraftGenerating ? "生成中..." : "完整初稿"}
                </button>
                <div className="mx-1 h-6 w-px bg-[#d8e1ec]" />
                <button type="button" onClick={handleReviewFullDraft} disabled={fullReviewLoading || !activeDraft} className="rounded-lg px-3 py-2 text-xs font-black text-[#536273] hover:bg-[#f1f5fb] disabled:opacity-50">
                  {fullReviewLoading ? "审查中..." : "整篇审查"}
                </button>
                <button type="button" onClick={handleReviseFullDraft} disabled={fullRevisionLoading || !fullDraftReview} className="rounded-lg px-3 py-2 text-xs font-black text-[#536273] hover:bg-[#f1f5fb] disabled:opacity-50">
                  {fullRevisionLoading ? "修订中..." : "整篇修订"}
                </button>
              </div>

              <article className="mx-auto min-h-[1120px] w-full max-w-[820px] border border-[#d8e1ec] bg-white px-16 py-16 shadow-[0_12px_40px_rgba(24,54,91,0.08)] md:px-20 md:py-20">
                <div className="mb-12 border-b border-[#e4eaf2] pb-8">
                  <div className="text-[11px] font-black uppercase tracking-[0.18em] text-[#7b8a9d]">论文写作编辑器</div>
                  <h1 className="mt-4 text-[34px] font-semibold leading-tight tracking-[-0.02em] text-[#192331]">{activeDraft.title}</h1>
                  <p className="mt-3 text-sm text-[#7b8a9d]">
                    共 {sections.length} 个章节，当前完成 {draftSummary.progress}%。
                  </p>
                </div>

                {sections.map((section) => (
                  <section
                    key={section.key}
                    className={`scroll-mt-28 py-8 first:pt-0 ${activeChapterKey === section.key ? "rounded-xl bg-[#fbfdff]" : ""}`}
                    ref={(node) => { chapterRefs.current[section.key] = node; }}
                    tabIndex={-1}
                  >
                    <div className="mb-5 flex items-start justify-between gap-4">
                      <div>
                        <div className="text-[11px] font-black uppercase tracking-[0.18em] text-[#8b98a8]">章节</div>
                        <h2 className="mt-2 text-[24px] font-semibold leading-tight text-[#192331]">{section.title}</h2>
                      </div>
                      <button
                        type="button"
                        onClick={() => setActiveChapterKey(section.key)}
                        className={`rounded-full px-3 py-1.5 text-xs font-black ${
                          activeChapterKey === section.key ? "bg-[#edf5ff] text-[#1d4ed8]" : "bg-[#f1f5fb] text-[#7b8a9d]"
                        }`}
                      >
                        当前章节
                      </button>
                    </div>
                    <ContinuousChapterTextarea
                      value={editorContents[section.key] || ""}
                      onFocus={() => setActiveChapterKey(section.key)}
                      onChange={(nextValue) => setEditorContents((current) => ({ ...current, [section.key]: nextValue }))}
                      active={activeChapterKey === section.key}
                    />
                  </section>
                ))}
              </article>

              <div className="mx-auto my-8 flex w-full max-w-[820px] items-center justify-center gap-6 text-xs font-bold text-[#7b8a9d]">
                <span>章节：{sections.length}</span>
                <span>当前字数：{selectedContent.replace(/\s+/g, "").length}</span>
                <span>引用：{selectedCitations.length}</span>
              </div>
            </div>
          )}
        </main>

        <aside className="flex min-h-0 flex-col border-l border-[#d8e1ec] bg-[#eef2f7]">
          <div className="border-b border-[#d8e1ec] p-5">
            <div className="mb-4 flex items-center gap-3">
              <div className="grid h-10 w-10 place-items-center rounded-lg bg-[#2563eb] text-white">文</div>
              <div>
                <h2 className="text-lg font-semibold text-[#1d4ed8]">资料来源</h2>
                <p className="text-xs font-semibold text-[#6f7f91]">项目资料与写作助手</p>
              </div>
            </div>
            <div className="relative">
              <input
                value={documentQuery}
                onChange={(event) => setDocumentQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    void handleSearchProjectDocuments();
                  }
                }}
                placeholder="搜索引用或资料片段..."
                className="h-10 w-full rounded-lg border border-[#d8e1ec] bg-white pl-3 pr-24 text-sm outline-none focus:border-[#2563eb]"
              />
              <button
                type="button"
                onClick={handleSearchProjectDocuments}
                disabled={!selectedProjectId || documentSearching}
                className="absolute right-1 top-1 rounded-md bg-[#edf5ff] px-3 py-1.5 text-xs font-black text-[#1d4ed8] disabled:opacity-50"
              >
                {documentSearching ? "搜索中" : "搜索"}
              </button>
            </div>
            {documentSearchError ? <p className="mt-2 text-xs text-[#a44545]">{documentSearchError}</p> : null}
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-4" style={{ scrollbarWidth: "thin" }}>
            <WritingSidePanel title="当前章节动作">
              <button type="button" onClick={handleGenerateAbstract} disabled={!activeDraft || abstractGenerating} className="mb-2 w-full rounded-lg bg-[#edf5ff] px-3 py-2 text-left text-sm font-semibold text-[#1d4ed8] disabled:opacity-50">
                {abstractGenerating ? "摘要生成中..." : "生成摘要"}
              </button>
              <button type="button" onClick={handleReviewCurrent} disabled={!activeDraft || reviewLoading || !selectedContent.trim()} className="mb-2 w-full rounded-lg bg-[#f3f6fa] px-3 py-2 text-left text-sm font-semibold text-[#405166] disabled:opacity-50">
                {reviewLoading ? "审查中..." : "审查当前章节"}
              </button>
              <button type="button" onClick={handleReviseCurrent} disabled={!activeDraft || revisionLoading || !chapterReview} className="mb-2 w-full rounded-lg bg-[#1f2d3d] px-3 py-2 text-left text-sm font-semibold text-white disabled:opacity-50">
                {revisionLoading ? "修订中..." : "修订当前章节"}
              </button>
              <button type="button" onClick={handleCheckCompliance} disabled={!activeDraft || complianceLoading} className="w-full rounded-lg bg-[#fff7e8] px-3 py-2 text-left text-sm font-semibold text-[#8a5a00] disabled:opacity-50">
                {complianceLoading ? "合规检查中..." : "合规检查"}
              </button>
            </WritingSidePanel>

            <WritingSidePanel title="项目资料搜索">
              {documentResults.length > 0 ? (
                <div className="space-y-3">
                  {documentResults.map((item) => (
                    <div key={item.chunk_id} className="rounded-lg border border-[#d8e1ec] bg-white px-3 py-3 text-[11.5px] leading-5 transition-colors hover:border-[#2563eb]">
                      <div className="mb-2 flex items-center justify-between gap-2">
                        <span className="rounded bg-[#edf5ff] px-2 py-0.5 text-[10px] font-black uppercase text-[#1d4ed8]">资料</span>
                      </div>
                      <div className="font-semibold text-[#192331]">{item.title}</div>
                      <div className="mt-1 text-[#647282]">{item.content_excerpt}</div>
                      {item.score_reasons?.length ? (
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {item.score_reasons.slice(0, 3).map((reason, index) => (
                            <span key={`${item.chunk_id}-${index}`} className="rounded bg-[#f1f5fb] px-1.5 py-0.5 text-[10px] text-[#536273]">
                              {reason}
                            </span>
                          ))}
                        </div>
                      ) : null}
                      <div className="mt-3 flex gap-2">
                        <button type="button" onClick={() => handleInsertDocumentResult(item)} className="rounded bg-[#1f2d3d] px-2 py-1 text-[10px] font-black text-white">
                          插入当前章节
                        </button>
                        <a href={buildDocumentResultProjectUrl(item)} className="rounded bg-[#edf5ff] px-2 py-1 text-[10px] font-black text-[#1d4ed8]">
                          去项目页定位
                        </a>
                      </div>
                    </div>
                  ))}
                </div>
              ) : documentQuery.trim() && !documentSearching && !documentSearchError ? (
                <p className="text-xs leading-6 text-[#647282]">当前没有命中结果，确认资料已经完成解析入库后再试。</p>
              ) : (
                <p className="text-xs leading-6 text-[#647282]">输入关键词后可检索项目资料，并将命中的片段插入当前章节。</p>
              )}
            </WritingSidePanel>

            {selectedCitations.length > 0 ? (
              <WritingSidePanel title="当前章节引用">
                <div className="space-y-2 text-xs leading-5 text-[#405166]">
                  {selectedCitations.map((item) => (
                    <p key={item}>• {item}</p>
                  ))}
                </div>
              </WritingSidePanel>
            ) : null}

            {writingPlan ? (
              <WritingSidePanel title="写作计划">
                <p className="text-sm leading-6 text-[#192331]">{writingPlan.goal}</p>
              </WritingSidePanel>
            ) : null}

            {fullDraftReview ? (
              <WritingSidePanel title="整篇审查">
                <div className="space-y-3">
                  <div className={`rounded-lg px-3 py-2 text-sm ${fullDraftReview.passed ? "bg-[#ecfdf5] text-[#1f8f5f]" : "bg-[#fff3f3] text-[#a44545]"}`}>
                    {fullDraftReview.summary}
                  </div>
                  {fullDraftReview.focusAreas.length > 0 ? (
                    <div className="flex flex-wrap gap-1.5">
                      {fullDraftReview.focusAreas.map((item) => (
                        <span key={item} className="rounded bg-[#f1f5fb] px-2 py-1 text-[11px] text-[#647282]">{item}</span>
                      ))}
                    </div>
                  ) : null}
                  {fullDraftReview.issues.slice(0, 5).map((issue) => (
                    <div key={`${issue.severity}-${issue.title}`} className="rounded-lg border border-[#d8e1ec] bg-[#f7faff] px-3 py-2 text-sm">
                      <div className="mb-1 flex items-center gap-2">
                        <ChapterBadge severity={issue.severity} />
                        <span className="font-medium">{issue.title}</span>
                      </div>
                      <p>{issue.detail}</p>
                      <p className="mt-1 text-[#647282]">建议：{issue.suggestion}</p>
                    </div>
                  ))}
                  {Object.keys(fullDraftReview.chapterFlags || {}).length > 0 ? (
                    <div className="rounded-lg border border-[#d8e1ec] bg-white px-3 py-2 text-sm">
                      <div className="mb-2 text-[11px] font-black uppercase tracking-[0.08em] text-[#7b8a9d]">关联章节定位</div>
                      <div className="space-y-2">
                        {Object.entries(fullDraftReview.chapterFlags).map(([chapterKey, flags]) => (
                          <button
                            key={chapterKey}
                            type="button"
                            onClick={() => focusChapter(chapterKey)}
                            className="w-full rounded-lg bg-[#f7faff] px-3 py-2 text-left text-xs leading-5 text-[#405166] hover:bg-[#edf5ff]"
                          >
                            <span className="font-semibold text-[#1d4ed8]">{CHAPTER_LABELS[chapterKey] || chapterKey}</span>
                            <span className="mt-1 block text-[#647282]">{flags.join("；")}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>
              </WritingSidePanel>
            ) : null}

            {chapterReview && chapterReview.chapterKey === activeChapterKey ? (
              <WritingSidePanel title="章节审查">
                <div className="space-y-3">
                  <div className={`rounded-lg px-3 py-2 text-sm ${chapterReview.passed ? "bg-[#ecfdf5] text-[#1f8f5f]" : "bg-[#fff3f3] text-[#a44545]"}`}>
                    {chapterReview.summary}
                  </div>
                  {chapterReview.issues.map((issue) => (
                    <div key={issue.title} className="rounded-lg border border-[#d8e1ec] bg-[#f7faff] px-3 py-2 text-sm">
                      <div className="mb-1 flex items-center gap-2">
                        <ChapterBadge severity={issue.severity} />
                        <span className="font-medium">{issue.title}</span>
                      </div>
                      <p>{issue.detail}</p>
                      <p className="mt-1 text-[#647282]">建议：{issue.suggestion}</p>
                    </div>
                  ))}
                </div>
              </WritingSidePanel>
            ) : null}

            {chapterRevision && chapterRevision.chapterKey === activeChapterKey ? (
              <WritingSidePanel title="修订结果">
                <div className="space-y-3 text-sm">
                  {chapterRevision.changeSummary.length > 0 ? (
                    <div>
                      <div className="mb-1 text-[11px] uppercase tracking-[0.08em] text-[#7b8a9d]">变更摘要</div>
                      {chapterRevision.changeSummary.map((item) => (
                        <p key={item}>• {item}</p>
                      ))}
                    </div>
                  ) : null}
                  {revisionCompare?.changed ? (
                    <div className="space-y-2">
                      <div className="rounded-lg border border-[#d8e1ec] bg-[#f7faff] px-3 py-2">
                        <div className="mb-1 text-[11px] text-[#7b8a9d]">修订前</div>
                        {revisionCompare.beforeExcerpt.map((item, index) => (
                          <p key={`before-${index}`}>{item}</p>
                        ))}
                      </div>
                      <div className="rounded-lg border border-[#d8e1ec] bg-[#f7faff] px-3 py-2">
                        <div className="mb-1 text-[11px] text-[#7b8a9d]">修订后</div>
                        {revisionCompare.afterExcerpt.map((item, index) => (
                          <p key={`after-${index}`}>{item}</p>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>
              </WritingSidePanel>
            ) : null}

            {revisionStatus ? (
              <WritingSidePanel title="修订状态">
                <div className="space-y-3 text-sm">
                  <div className="grid grid-cols-2 gap-2">
                    <div className="rounded-lg bg-[#ecfdf5] px-3 py-2 text-[#1f8f5f]">已解决 {revisionStatus.resolvedCount} 项</div>
                    <div className="rounded-lg bg-[#fff3f3] px-3 py-2 text-[#a44545]">剩余 {revisionStatus.remainingCount} 项</div>
                  </div>
                  <div className="rounded-lg border border-[#d8e1ec] bg-[#f7faff] px-3 py-2">下一步：{revisionStatus.nextAction}</div>
                </div>
              </WritingSidePanel>
            ) : null}

            {fullDraftRevision ? (
              <WritingSidePanel title="整篇修订结果">
                <div className="space-y-3 text-sm">
                  {fullDraftRevision.changeSummary.length > 0 ? (
                    <div>
                      <div className="mb-1 text-[11px] uppercase tracking-[0.08em] text-[#7b8a9d]">变更摘要</div>
                      {fullDraftRevision.changeSummary.map((item) => (
                        <p key={item}>• {item}</p>
                      ))}
                    </div>
                  ) : null}
                  {fullDraftRevision.resolvedIssues.length > 0 ? (
                    <div>
                      <div className="mb-1 text-[11px] uppercase tracking-[0.08em] text-[#7b8a9d]">已解决</div>
                      {fullDraftRevision.resolvedIssues.map((item) => (
                        <SuggestionCard key={item} text={item} />
                      ))}
                    </div>
                  ) : null}
                  {fullDraftRevision.remainingIssues.length > 0 ? (
                    <div>
                      <div className="mb-1 text-[11px] uppercase tracking-[0.08em] text-[#7b8a9d]">仍需处理</div>
                      {fullDraftRevision.remainingIssues.map((item) => (
                        <SuggestionCard key={item} text={item} />
                      ))}
                    </div>
                  ) : (
                    <div className="rounded-lg bg-[#ecfdf5] px-3 py-2 text-[#1f8f5f]">当前整篇修订没有遗留问题。</div>
                  )}
                </div>
              </WritingSidePanel>
            ) : null}

            {abstractResult ? (
              <WritingSidePanel title="摘要">
                <p className="text-sm leading-6 text-[#192331]">{abstractResult.abstract_cn}</p>
              </WritingSidePanel>
            ) : null}

            {complianceResult ? (
              <WritingSidePanel title="合规概览">
                <div className="text-lg font-semibold">{complianceResult.overall_score}</div>
                <p className="text-sm text-[#647282]">{complianceResult.passed ? "合规检查通过" : "存在合规问题，请逐条确认。"}</p>
              </WritingSidePanel>
            ) : null}

            {selectedCompliance ? (
              <WritingSidePanel title="当前章节合规问题">
                {selectedCompliance.issues.length > 0 ? (
                  selectedCompliance.issues.map((issue: ComplianceIssue, index: number) => (
                    <div key={`${issue.location}-${index}`} className="mb-2 rounded-lg border border-[#d8e1ec] bg-[#f7faff] px-3 py-2 text-sm">
                      <div className="mb-1 flex items-center gap-2">
                        <ChapterBadge severity={issue.severity} />
                        <span className="font-medium">{issue.location}</span>
                      </div>
                      <p>{issue.description}</p>
                      <div className="mt-2 flex gap-2">
                        <button type="button" onClick={() => handleComplianceAction(index, "accept")} className="rounded bg-white px-2 py-1 text-[11px]">确认</button>
                        <button type="button" onClick={() => handleComplianceAction(index, "ignore")} className="rounded bg-white px-2 py-1 text-[11px]">忽略</button>
                        <button type="button" onClick={() => handleComplianceAction(index, "fixed")} className="rounded bg-white px-2 py-1 text-[11px]">已修正</button>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-sm leading-6 text-[#647282]">当前章节暂无合规问题。</p>
                )}
              </WritingSidePanel>
            ) : null}
          </div>

          <div className="border-t border-[#d8e1ec] bg-[#e8eef6] p-5">
            <div className="mb-3 flex items-center gap-2">
              <select value={downloadFormat} onChange={(event) => setDownloadFormat(event.target.value as "docx" | "pdf")} className="h-10 flex-1 rounded-lg border border-[#cfd9e6] bg-white px-3 text-sm">
                <option value="docx">DOCX</option>
                <option value="pdf">PDF</option>
              </select>
              <button type="button" onClick={handleDownload} disabled={!activeDraft} className="h-10 rounded-lg bg-white px-4 text-sm font-black text-[#1f2d3d] shadow-sm disabled:opacity-50">
                下载
              </button>
            </div>
            <button type="button" onClick={handleSearchProjectDocuments} disabled={!selectedProjectId || !documentQuery.trim() || documentSearching} className="w-full rounded-lg border border-[#cfd9e6] bg-white py-3 text-sm font-black text-[#1f2d3d] transition-colors hover:bg-[#edf5ff] disabled:opacity-50">
              搜索并添加来源
            </button>
          </div>
        </aside>
      </div>
    </div>
  );
}
