/** 论文写作页：提供章节目录、正文编辑区和 AI 建议面板。 */
"use client";

import { forwardRef, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import ChatSidebar from "@/components/chat/ChatSidebar";
import WorkbenchSettingsPanel from "@/components/chat/WorkbenchSettingsPanel";
import {
  checkCompliance,
  createDraft,
  generateAbstract,
  generateChapter,
  getDraft,
  getDraftDownloadUrl,
  getProjectWorkspace,
  listOutcomes,
  listDrafts,
  listProjectDesigns,
  listProjects,
  updateDraft,
} from "@/lib/api";
import { useAuth } from "@/lib/AuthContext";
import type {
  AbstractResult,
  ChatMessage,
  ComplianceResult,
  Draft,
  Outcome,
  PersistedProjectDesign,
  Project,
  ProjectWorkspaceLinkedOutcome,
  ProjectWorkspaceSnapshot,
} from "@/lib/types";
import { CHAT_THEME } from "@/components/chat/chatTheme";
import {
  buildEditedChapterPayload,
  getDraftChapterRecord,
  getDraftCompletionSummary,
  getDraftReferences,
} from "@/lib/draftKnowledge";
import { findChapterKnowledge, getChapterKnowledgeActions } from "@/lib/projectKnowledge.mjs";
import { buildDocumentReferenceItems, stripInlineReferenceSection } from "@/lib/writingReferences.mjs";

const CHAPTER_KEYS = [
  "chapter_1_introduction",
  "chapter_2_theory",
  "chapter_3_design",
  "chapter_4_implementation",
  "chapter_5_experiment",
  "chapter_6_conclusion",
];

const FALLBACK_CHAPTERS: Record<string, string> = {
  chapter_1_introduction: "1. 引言",
  chapter_2_theory: "2. 相关工作",
  chapter_3_design: "3. 方法",
  chapter_4_implementation: "4. 实现",
  chapter_5_experiment: "5. 实验",
  chapter_6_conclusion: "6. 结论",
};

type DesignContent = {
  topic?: string;
  references?: string[];
  methods?: string[];
  expected_outputs?: string[];
  research_questions?: string[];
};

type RightPanelTab = "suggestions" | "references" | "delivery";
type ChapterKnowledgeActionItem = {
  key: string;
  title: string;
  subtitle: string;
  href: string;
  actionLabel: string;
  external: boolean;
};

export default function WritingPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [preselectedProjectId, setPreselectedProjectId] = useState<string | null>(null);
  const [preselectedDraftId, setPreselectedDraftId] = useState<string | null>(null);
  const [preselectedChapterKey, setPreselectedChapterKey] = useState<string | null>(null);
  const [designs, setDesigns] = useState<PersistedProjectDesign[]>([]);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [activeDraft, setActiveDraft] = useState<Draft | null>(null);
  const [activeChapterKey, setActiveChapterKey] = useState(CHAPTER_KEYS[0]);
  const [editorContents, setEditorContents] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [draftLoading, setDraftLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [checking, setChecking] = useState(false);
  const [abstractResult, setAbstractResult] = useState<AbstractResult | null>(null);
  const [complianceResult, setComplianceResult] = useState<ComplianceResult | null>(null);
  const [outcomes, setOutcomes] = useState<Outcome[]>([]);
  const [workspaceSnapshot, setWorkspaceSnapshot] = useState<ProjectWorkspaceSnapshot | null>(null);
  const [rightTab, setRightTab] = useState<RightPanelTab>("suggestions");
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const chapterTextareaRefs = useRef<Record<string, HTMLTextAreaElement | null>>({});

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    setPreselectedProjectId(params.get("project_id"));
    setPreselectedDraftId(params.get("draft_id"));
    setPreselectedChapterKey(params.get("chapter_key"));
  }, []);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      setLoading(false);
      return;
    }

    setLoading(true);
    listProjects()
      .then((items) => {
        setProjects(items);
        setSelectedProjectId((current) => {
          if (current) return current;
          if (preselectedProjectId && items.some((item) => item.id === preselectedProjectId)) return preselectedProjectId;
          return items[0]?.id ?? null;
        });
      })
      .catch(() => setProjects([]))
      .finally(() => setLoading(false));
  }, [authLoading, preselectedProjectId, user]);

  useEffect(() => {
    if (!selectedProjectId) {
      setDrafts([]);
      setActiveDraft(null);
      setDesigns([]);
      return;
    }

    setDraftLoading(true);
    Promise.all([listDrafts(selectedProjectId), listProjectDesigns(selectedProjectId)])
      .then(async ([draftItems, designItems]) => {
        setDrafts(draftItems);
        setDesigns(designItems);
        const targetDraftId = preselectedDraftId && draftItems.some((draft) => draft.id === preselectedDraftId)
          ? preselectedDraftId
          : draftItems[0]?.id ?? null;
        if (!targetDraftId) {
          setActiveDraft(null);
          return;
        }
        const draft = await getDraft(targetDraftId);
        setActiveDraft(draft);
        setActiveChapterKey(preselectedChapterKey && CHAPTER_KEYS.includes(preselectedChapterKey)
          ? preselectedChapterKey
          : draft.sections[0]?.key || CHAPTER_KEYS[0]);
      })
      .catch(() => {
        setDrafts([]);
        setDesigns([]);
        setActiveDraft(null);
      })
      .finally(() => setDraftLoading(false));
  }, [preselectedChapterKey, preselectedDraftId, selectedProjectId]);

  useEffect(() => {
    if (!selectedProjectId) {
      setOutcomes([]);
      setWorkspaceSnapshot(null);
      return;
    }
    listOutcomes({ project_id: selectedProjectId })
      .then(setOutcomes)
      .catch(() => setOutcomes([]));
  }, [selectedProjectId]);

  const refreshWorkspaceSnapshot = useCallback(async (projectId: string, draftId?: string | null) => {
    try {
      const snapshot = await getProjectWorkspace(projectId, draftId ?? null);
      setWorkspaceSnapshot(snapshot);
    } catch {
      setWorkspaceSnapshot(null);
    }
  }, []);

  useEffect(() => {
    if (!activeDraft) {
      setEditorContents({});
      return;
    }
    const nextContents: Record<string, string> = {};
    for (const key of CHAPTER_KEYS) {
      const section = getSection(activeDraft, key);
      nextContents[key] = section?.content || "";
    }
    setEditorContents(nextContents);
  }, [activeDraft]);

  useEffect(() => {
    if (!selectedProjectId) return;
    void refreshWorkspaceSnapshot(selectedProjectId, activeDraft?.id);
  }, [activeDraft?.id, refreshWorkspaceSnapshot, selectedProjectId]);

  const selectedProject = useMemo(
    () => projects.find((project) => project.id === selectedProjectId) ?? null,
    [projects, selectedProjectId],
  );

  const latestDesign = designs[0] ?? null;
  const designContent = (latestDesign?.content ?? null) as DesignContent | null;
  const activeSection = activeDraft ? getSection(activeDraft, activeChapterKey) : null;
  const activeChapterRecord = getDraftChapterRecord(activeDraft, activeChapterKey);
  const activeChapterContent = editorContents[activeChapterKey] || "";
  const documentReferences = useMemo(
    () => buildDocumentReferenceItems(getDraftReferences(activeDraft)),
    [activeDraft],
  );
  const totalWordCount = useMemo(
    () => CHAPTER_KEYS.reduce((sum, key) => sum + (editorContents[key] || "").replace(/\s+/g, "").length, 0),
    [editorContents],
  );
  const { progress } = getDraftCompletionSummary(activeDraft, CHAPTER_KEYS);
  const currentTitle = activeSection?.title || FALLBACK_CHAPTERS[activeChapterKey] || "章节";
  const isDirty = useMemo(() => {
    if (!activeDraft) {
      return CHAPTER_KEYS.some((key) => Boolean(editorContents[key]));
    }
    return CHAPTER_KEYS.some((key) => {
      const section = getSection(activeDraft, key);
      return (editorContents[key] || "") !== (section?.content || "");
    });
  }, [activeDraft, editorContents]);
  const designReferences = designContent?.references || [];
  const draftReferences = getDraftReferences(activeDraft);
  const references = [...designReferences, ...draftReferences].filter(Boolean);
  const hasOutcomes = outcomes.length > 0;
  const isResultSensitiveChapter = ["chapter_4_implementation", "chapter_5_experiment"].includes(activeChapterKey);
  const chapterSuggestions = getChapterSuggestions(activeChapterKey, hasOutcomes);
  const saveStateLabel = saving ? "保存中" : isDirty ? "未保存" : "已同步";
  const chapterCitations = activeChapterRecord?.citations || [];
  const chapterNoteMatches = paperNotesForChapter(activeChapterKey, references, draftReferences);
  const activeChapterKnowledge = findChapterKnowledge(workspaceSnapshot, activeChapterKey);
  const chapterKnowledgeActions = getChapterKnowledgeActions(activeChapterKnowledge, {
    projectId: selectedProjectId,
    chapterKey: activeChapterKey,
  });
  const activeChapterIndex = CHAPTER_KEYS.indexOf(activeChapterKey);
  const previousChapterKey = activeChapterIndex > 0 ? CHAPTER_KEYS[activeChapterIndex - 1] : null;
  const nextChapterKey = activeChapterIndex >= 0 && activeChapterIndex < CHAPTER_KEYS.length - 1
    ? CHAPTER_KEYS[activeChapterIndex + 1]
    : null;

  const loadDraftById = useCallback(async (draftId: string, chapterKey?: string | null) => {
    setDraftLoading(true);
    setError(null);
    try {
      const draft = await getDraft(draftId);
      setActiveDraft(draft);
      const nextChapterKey = chapterKey && CHAPTER_KEYS.includes(chapterKey) ? chapterKey : draft.sections[0]?.key || CHAPTER_KEYS[0];
      setActiveChapterKey(nextChapterKey);
    } catch (err) {
      setError(err instanceof Error ? err.message : "草稿加载失败");
    } finally {
      setDraftLoading(false);
    }
  }, []);

  const refreshDrafts = useCallback(async (projectId: string, nextDraftId?: string) => {
    const draftItems = await listDrafts(projectId);
    setDrafts(draftItems);
    const target = nextDraftId || activeDraft?.id || draftItems[0]?.id;
    if (target) await loadDraftById(target);
  }, [activeDraft?.id, loadDraftById]);

  const handleNewDraft = async () => {
    if (!selectedProject) return;
    setDraftLoading(true);
    setError(null);
    try {
      const draft = await createDraft({
        project_id: selectedProject.id,
        title: latestDesign?.topic || selectedProject.name || "毕业论文",
      });
      await refreshDrafts(selectedProject.id, draft.id);
      setNotice("已创建新草稿");
    } catch (err) {
      setError(err instanceof Error ? err.message : "新建草稿失败");
    } finally {
      setDraftLoading(false);
    }
  };

  const handleSave = useCallback(async () => {
    if (!activeDraft) return;
    setSaving(true);
    setError(null);
    try {
      const content = { ...(activeDraft.content || {}) };
      for (const key of CHAPTER_KEYS) {
        const title = getSection(activeDraft, key)?.title || FALLBACK_CHAPTERS[key] || "章节";
        content[key] = buildEditedChapterPayload(content[key], title, stripInlineReferenceSection(editorContents[key] || ""));
      }
      const updated = await updateDraft(activeDraft.id, { content });
      setActiveDraft(updated);
      if (selectedProjectId) await refreshWorkspaceSnapshot(selectedProjectId, updated.id);
      setNotice("已保存整篇草稿");
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存失败");
    } finally {
      setSaving(false);
    }
  }, [activeDraft, editorContents, refreshWorkspaceSnapshot, selectedProjectId]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== "s") return;
      event.preventDefault();
      if (!activeDraft || saving) return;
      void handleSave();
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [activeDraft, saving, handleSave]);

  const handleGenerateChapter = async () => {
    if (!activeDraft) return;
    setGenerating(true);
    setError(null);
    try {
      const result = await generateChapter(activeDraft.id, activeChapterKey);
      setEditorContents((current) => ({
        ...current,
        [activeChapterKey]: result.content || "",
      }));
      const updated = await getDraft(activeDraft.id);
      setActiveDraft(updated);
      if (selectedProjectId) await refreshWorkspaceSnapshot(selectedProjectId, updated.id);
      setNotice("AI 已生成当前章节");
    } catch (err) {
      setError(err instanceof Error ? err.message : "章节生成失败");
    } finally {
      setGenerating(false);
    }
  };

  const handleGenerateAbstract = async () => {
    if (!activeDraft) return;
    setGenerating(true);
    setError(null);
    try {
      const result = await generateAbstract(activeDraft.id);
      setAbstractResult(result);
      setNotice("摘要已生成");
    } catch (err) {
      setError(err instanceof Error ? err.message : "摘要生成失败");
    } finally {
      setGenerating(false);
    }
  };

  const handleCheckCompliance = async () => {
    if (!activeDraft) return;
    setChecking(true);
    setError(null);
    try {
      const result = await checkCompliance(activeDraft.id, false);
      setComplianceResult(result);
      setNotice("合规检查完成");
    } catch (err) {
      setError(err instanceof Error ? err.message : "合规检查失败");
    } finally {
      setChecking(false);
    }
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard?.writeText(activeChapterContent);
      setNotice("已复制当前章节");
    } catch {
      setNotice("当前浏览器不支持自动复制");
    }
  };

  const scrollToChapter = useCallback((chapterKey: string) => {
    setActiveChapterKey(chapterKey);
    const node = chapterTextareaRefs.current[chapterKey];
    node?.scrollIntoView({ behavior: "smooth", block: "start" });
    node?.focus();
  }, []);

  if (authLoading || loading) {
    return <CenteredState title="正在加载论文写作..." description="正在读取项目、草稿和写作上下文。" />;
  }

  if (!user) {
    return (
      <CenteredState
        title="请先登录"
        description="论文写作工作区需要读取你的项目和草稿。"
        actionLabel="前往登录"
        onAction={() => router.push("/login")}
      />
    );
  }

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: CHAT_THEME.bg, color: CHAT_THEME.text }}>
      <ChatSidebar
        activeModule="writing"
        currentId={null}
        onSelect={(_id: string, _messages: ChatMessage[]) => {}}
        onNewChat={() => router.push("/")}
        onOpenSettings={() => setSettingsOpen(true)}
        refreshKey={0}
        searchEntryMode="home"
      />

      <main className="grid min-w-0 flex-1 grid-cols-1 lg:grid-cols-[220px_minmax(0,1fr)]">
        <aside className="hidden min-h-0 flex-col border-r lg:flex" style={{ background: CHAT_THEME.card, borderColor: CHAT_THEME.border }}>
          <div className="border-b px-4 py-4" style={{ borderColor: CHAT_THEME.border }}>
            <h1 className="text-[20px] font-semibold" style={{ fontFamily: "var(--font-cormorant), serif" }}>
              论文写作
            </h1>
          </div>

          <div className="border-b px-4 py-4" style={{ borderColor: CHAT_THEME.border }}>
            <div className="mb-2 text-[12px] font-medium" style={{ color: CHAT_THEME.mid }}>
              项目
            </div>
            <select
              value={selectedProjectId ?? ""}
              onChange={(event) => setSelectedProjectId(event.target.value || null)}
              className="h-10 w-full rounded-xl px-3 text-xs outline-none"
              style={{ background: CHAT_THEME.bg, border: `1px solid ${CHAT_THEME.border}`, color: CHAT_THEME.text }}
            >
              {projects.length === 0 ? (
                <option value="">暂无项目</option>
              ) : (
                projects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.name}
                  </option>
                ))
              )}
            </select>
          </div>

          <div className="border-b px-4 py-4" style={{ borderColor: CHAT_THEME.border }}>
            <div className="mb-2 flex items-center justify-between">
              <span className="text-[12px] font-medium">草稿</span>
              <button
                type="button"
                onClick={handleNewDraft}
                disabled={!selectedProject || draftLoading}
                className="rounded-lg px-2.5 py-1 text-[11px] disabled:opacity-40"
                style={{ background: CHAT_THEME.primarySoft, color: CHAT_THEME.primary }}
              >
                新建
              </button>
            </div>
            <select
              value={activeDraft?.id ?? ""}
              onChange={(event) => {
                if (!event.target.value) return;
                void loadDraftById(event.target.value);
              }}
              disabled={drafts.length === 0 || draftLoading}
              className="h-10 w-full rounded-xl px-3 text-xs outline-none disabled:opacity-50"
              style={{ background: CHAT_THEME.bg, border: `1px solid ${CHAT_THEME.border}`, color: CHAT_THEME.text }}
            >
              {drafts.length === 0 ? (
                <option value="">暂无草稿</option>
              ) : (
                drafts.map((draft) => (
                  <option key={draft.id} value={draft.id}>
                    {draft.title}
                  </option>
                ))
              )}
            </select>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4" style={{ scrollbarWidth: "none" }}>
            <div className="mb-3 text-[12px] font-medium" style={{ color: CHAT_THEME.mid }}>
              章节
            </div>
            <div className="space-y-2">
              {CHAPTER_KEYS.map((key, index) => {
                const section = activeDraft ? getSection(activeDraft, key) : null;
                const active = key === activeChapterKey;
                const title = section?.title || FALLBACK_CHAPTERS[key];
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => scrollToChapter(key)}
                    className="w-full rounded-xl border px-3 py-3 text-left transition-colors"
                    style={{
                      background: active ? "rgba(24,48,29,0.1)" : CHAT_THEME.bg,
                      color: active ? CHAT_THEME.primary : CHAT_THEME.text,
                      borderColor: active ? "rgba(24,48,29,0.18)" : CHAT_THEME.border,
                    }}
                  >
                    <div className="text-[12px] font-medium">{index + 1}. {title}</div>
                    <div className="mt-1 text-[10px]" style={{ color: active ? CHAT_THEME.primary : CHAT_THEME.mid }}>
                      {formatSectionStatus(section?.status)}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </aside>

        <section className="relative flex min-h-0 flex-col">
          <header className="border-b px-4 py-4 lg:px-6" style={{ background: CHAT_THEME.card, borderColor: CHAT_THEME.border }}>
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="min-w-0">
                <div className="truncate text-[12px]" style={{ color: CHAT_THEME.mid }}>
                  {selectedProject?.name || "未选择项目"}
                </div>
                <h2 className="truncate text-[30px] font-semibold" style={{ fontFamily: "var(--font-cormorant), serif", color: CHAT_THEME.text }}>
                  {currentTitle}
                </h2>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <ToolbarButton
                  label="上一章"
                  onClick={() => previousChapterKey && scrollToChapter(previousChapterKey)}
                  disabled={!previousChapterKey}
                  muted
                />
                <ToolbarButton
                  label="下一章"
                  onClick={() => nextChapterKey && scrollToChapter(nextChapterKey)}
                  disabled={!nextChapterKey}
                  muted
                />
                <ToolbarButton
                  label="章节依据"
                  onClick={() => setInspectorOpen((current) => !current)}
                  muted
                />
                <ToolbarButton label={generating ? "续写中..." : "AI续写"} onClick={handleGenerateChapter} disabled={!activeDraft || generating} />
                <ToolbarButton label={saving ? "保存中..." : "保存"} onClick={handleSave} disabled={!activeDraft || saving} />
                {activeDraft && (
                  <a
                    href={getDraftDownloadUrl(activeDraft.id, "docx")}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-lg px-4 py-2 text-xs font-medium"
                    style={{ background: CHAT_THEME.muted, color: CHAT_THEME.text, border: `1px solid ${CHAT_THEME.border}` }}
                  >
                    导出
                  </a>
                )}
              </div>
            </div>
          </header>

          <div
            className="min-h-0 flex-1 overflow-y-auto px-4 py-5 lg:px-6 lg:py-6"
            style={{ background: "#e6e0d5", scrollbarWidth: "none" }}
          >
            {projects.length === 0 ? (
              <EmptyCanvas
                title="还没有研究项目"
                description="请先从文献搜索或完整研究流程创建一个项目，再进入论文写作。"
                actionLabel="返回首页"
                onAction={() => router.push("/")}
              />
            ) : !activeDraft ? (
              <EmptyCanvas
                title="还没有论文草稿"
                description="先创建一份草稿，再开始写作。"
                actionLabel="新建草稿"
                onAction={handleNewDraft}
              />
            ) : (
              <article
                className="mx-auto min-h-[900px] w-full max-w-[960px] border bg-[#fffdf8] px-8 py-8 shadow-[0_12px_32px_rgba(54,43,29,0.12)] lg:px-14 lg:py-12"
                style={{ borderColor: "rgba(73, 62, 44, 0.18)" }}
              >
                <div className="mb-8 flex items-start justify-between gap-4 border-b pb-5" style={{ borderColor: "rgba(73, 62, 44, 0.14)" }}>
                  <div className="min-w-0">
                    <div className="text-[11px] uppercase tracking-[0.18em]" style={{ color: CHAT_THEME.low }}>
                      Chapter {activeChapterIndex + 1}
                    </div>
                    <h3 className="mt-2 text-[32px] font-semibold leading-tight" style={{ fontFamily: "var(--font-cormorant), serif", color: CHAT_THEME.text }}>
                      {currentTitle}
                    </h3>
                  </div>
                  <div className="shrink-0 text-right text-[11px]" style={{ color: CHAT_THEME.mid }}>
                    <div>{saveStateLabel}</div>
                    <div className="mt-1">{totalWordCount} 字</div>
                  </div>
                </div>
                <div className="space-y-10">
                  {CHAPTER_KEYS.map((key, index) => {
                    const section = activeDraft ? getSection(activeDraft, key) : null;
                    const title = section?.title || FALLBACK_CHAPTERS[key];
                    const chapterContent = editorContents[key] || "";
                    const chapterWordCount = chapterContent.replace(/\s+/g, "").length;
                    const resultSensitive = ["chapter_4_implementation", "chapter_5_experiment"].includes(key);
                    const active = activeChapterKey === key;

                    return (
                      <section
                        key={key}
                        className="scroll-mt-24 border-b pb-8 last:border-b-0"
                        style={{ borderColor: "rgba(73, 62, 44, 0.10)" }}
                      >
                        <div className="mb-4 flex items-start justify-between gap-4">
                          <div className="min-w-0">
                            <div className="text-[11px] uppercase tracking-[0.18em]" style={{ color: active ? CHAT_THEME.primary : CHAT_THEME.low }}>
                              Chapter {index + 1}
                            </div>
                            <h3
                              className="mt-2 text-[28px] font-semibold leading-tight"
                              style={{ fontFamily: "var(--font-cormorant), serif", color: CHAT_THEME.text }}
                            >
                              {title}
                            </h3>
                            <div className="mt-2 text-[11px]" style={{ color: active ? CHAT_THEME.primary : CHAT_THEME.mid }}>
                              {formatSectionStatus(section?.status)}
                            </div>
                          </div>
                          <div className="shrink-0 text-right text-[11px]" style={{ color: CHAT_THEME.mid }}>
                            <div>{chapterWordCount} 字</div>
                            {active ? <div className="mt-1">当前编辑章节</div> : null}
                          </div>
                        </div>

                        {resultSensitive && !hasOutcomes ? (
                          <p
                            className="mb-5 rounded-xl px-4 py-3 text-[12px] leading-6"
                            style={{ background: CHAT_THEME.warnSoft, color: CHAT_THEME.warn, border: "1px solid rgba(160, 92, 35, 0.2)" }}
                          >
                            当前缺少真实成果材料，本章只应写方案或待验证内容，不应直接写实验结果和具体结论。
                          </p>
                        ) : null}

                        <AutoGrowingTextarea
                          registerRef={(node) => {
                            chapterTextareaRefs.current[key] = node;
                          }}
                          value={stripInlineReferenceSection(chapterContent)}
                          onFocus={() => setActiveChapterKey(key)}
                          onChange={(value) => {
                            setActiveChapterKey(key);
                            setEditorContents((current) => ({
                              ...current,
                              [key]: value,
                            }));
                          }}
                          placeholder={`直接在这里续写${title}。需要依据时，点击右上角“章节依据”。`}
                          active={active}
                        />
                      </section>
                    );
                  })}

                  {documentReferences.length > 0 ? (
                    <section
                      className="scroll-mt-24 border-t pt-10"
                      style={{ borderColor: "rgba(73, 62, 44, 0.16)" }}
                    >
                      <div className="mb-4">
                        <div className="text-[11px] uppercase tracking-[0.18em]" style={{ color: CHAT_THEME.low }}>
                          References
                        </div>
                        <h3
                          className="mt-2 text-[28px] font-semibold leading-tight"
                          style={{ fontFamily: "var(--font-cormorant), serif", color: CHAT_THEME.text }}
                        >
                          参考文献
                        </h3>
                      </div>
                      <div className="space-y-4 text-[15px] leading-8" style={{ color: CHAT_THEME.text, fontFamily: "Georgia, 'Times New Roman', 'Noto Serif SC', serif" }}>
                        {documentReferences.map((reference, index) => (
                          <p key={`${reference}-${index}`}>[{index + 1}] {reference}</p>
                        ))}
                      </div>
                    </section>
                  ) : null}
                </div>
              </article>
            )}
          </div>

          <footer className="border-t px-4 py-3 lg:px-6" style={{ background: CHAT_THEME.card, borderColor: CHAT_THEME.border }}>
            <div className="text-xs" style={{ color: error ? "#9a2f2f" : CHAT_THEME.mid }}>
              {error || notice || "打开页面即可直接写，辅助信息已收进“章节依据”。"}
            </div>
          </footer>

          {inspectorOpen && (
            <aside
              className="absolute inset-y-0 right-0 z-20 flex w-[340px] flex-col border-l shadow-[-16px_0_40px_rgba(34,27,18,0.18)]"
              style={{ background: CHAT_THEME.card, borderColor: CHAT_THEME.border }}
            >
              <div className="flex items-center justify-between border-b px-4 py-4" style={{ borderColor: CHAT_THEME.border }}>
                <div>
                  <p className="text-[11px] uppercase tracking-[0.16em]" style={{ color: CHAT_THEME.low }}>
                    Assistant Drawer
                  </p>
                  <h3 className="mt-1 text-[18px] font-semibold" style={{ color: CHAT_THEME.text }}>
                    本章辅助信息
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setInspectorOpen(false)}
                  className="rounded-full px-3 py-1.5 text-[11px] font-medium"
                  style={{ background: CHAT_THEME.muted, color: CHAT_THEME.text }}
                >
                  关闭
                </button>
              </div>

              <div className="flex h-14 shrink-0 items-center gap-2 border-b px-4" style={{ borderColor: CHAT_THEME.border }}>
                <PanelTabButton label="建议" active={rightTab === "suggestions"} onClick={() => setRightTab("suggestions")} />
                <PanelTabButton label="引用" active={rightTab === "references"} onClick={() => setRightTab("references")} />
                <PanelTabButton label="交付" active={rightTab === "delivery"} onClick={() => setRightTab("delivery")} />
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4" style={{ scrollbarWidth: "none" }}>
                {rightTab === "suggestions" && (
                  <>
                    <SidePanel title="AI 写作建议">
                      {chapterSuggestions.map((text) => (
                        <Suggestion key={text} text={text} />
                      ))}
                    </SidePanel>

                    <SidePanel title="生成与检查">
                      <ActionButton label={generating ? "生成中..." : "生成当前章节"} onClick={handleGenerateChapter} disabled={!activeDraft || generating} />
                      <ActionButton label={generating ? "生成中..." : "生成摘要"} onClick={handleGenerateAbstract} disabled={!activeDraft || generating} />
                      <ActionButton label={checking ? "检查中..." : "合规检查"} onClick={handleCheckCompliance} disabled={!activeDraft || checking} danger />
                      <ActionButton label="复制当前章节" onClick={handleCopy} disabled={!activeChapterContent} />
                    </SidePanel>

                    {abstractResult && (
                      <SidePanel title="摘要结果">
                        <p className="text-[12px] leading-6" style={{ color: CHAT_THEME.text }}>{abstractResult.abstract_cn}</p>
                        <p className="mt-2 text-[11px]" style={{ color: CHAT_THEME.mid }}>
                          关键词：{abstractResult.keywords_cn.join("、")}
                        </p>
                      </SidePanel>
                    )}

                    {complianceResult && (
                      <SidePanel title="合规概览">
                        <div className="text-2xl font-semibold" style={{ fontFamily: "monospace", color: CHAT_THEME.text }}>
                          {complianceResult.overall_score}
                        </div>
                        <p className="mt-2 text-[12px] leading-6" style={{ color: CHAT_THEME.mid }}>
                          {complianceResult.passed ? "当前草稿通过基础合规检查。" : "当前草稿存在需要确认的问题。"}
                        </p>
                      </SidePanel>
                    )}
                  </>
                )}

                {rightTab === "references" && (
                  <>
                    <SidePanel title="项目设计依据">
                      {latestDesign?.topic && (
                        <p className="mb-3 text-[12px] leading-6" style={{ color: CHAT_THEME.text }}>
                          {latestDesign.topic}
                        </p>
                      )}
                      {(designContent?.research_questions || []).slice(0, 3).map((item, index) => (
                        <ReferenceItem key={`question-${index}`} prefix="问题" text={item} actionable />
                      ))}
                      {(designContent?.methods || []).slice(0, 3).map((item, index) => (
                        <ReferenceItem key={`method-${index}`} prefix="方法" text={item} actionable />
                      ))}
                      {designReferences.slice(0, 5).map((reference, index) => (
                        <ReferenceItem key={`${reference}-${index}`} prefix={`文献 ${index + 1}`} text={reference} actionable />
                      ))}
                      {!latestDesign && (
                        <p className="text-[12px] leading-6" style={{ color: CHAT_THEME.mid }}>
                          暂无项目设计。可先完成研究方向和项目设计后，再作为论文写作依据。
                        </p>
                      )}
                    </SidePanel>

                    <SidePanel title="当前章节直接依据">
                      {chapterCitations.length > 0 ? (
                        chapterCitations.slice(0, 6).map((citation, index) => (
                          <ReferenceItem key={`${citation}-${index}`} prefix={`引用 ${index + 1}`} text={citation} actionable />
                        ))
                      ) : (
                        <p className="text-[12px] leading-6" style={{ color: CHAT_THEME.mid }}>
                          当前章节还没有沉淀引用。先生成章节或在项目文献中保存依据后，这里会显示本章直接使用的引用。
                        </p>
                      )}

                      {chapterNoteMatches.length > 0 && (
                        <div className="mt-4 border-t pt-4" style={{ borderColor: CHAT_THEME.border }}>
                          <p className="mb-2 text-[11px] tracking-wide" style={{ color: CHAT_THEME.low }}>关联证据线索</p>
                          {chapterNoteMatches.map((item, index) => (
                            <ReferenceItem key={`${item}-${index}`} prefix={`线索 ${index + 1}`} text={item} actionable />
                          ))}
                        </div>
                      )}

                      {chapterKnowledgeActions.outcomes.length ? (
                        <div className="mt-4 border-t pt-4" style={{ borderColor: CHAT_THEME.border }}>
                          <p className="mb-2 text-[11px] tracking-wide" style={{ color: CHAT_THEME.low }}>本章使用的成果材料</p>
                          {chapterKnowledgeActions.outcomes.slice(0, 4).map((item: ChapterKnowledgeActionItem, index: number) => (
                            <KnowledgeActionItem key={item.key} prefix={`成果 ${index + 1}`} item={item} />
                          ))}
                        </div>
                      ) : null}

                      {chapterKnowledgeActions.chunks.length ? (
                        <div className="mt-4 border-t pt-4" style={{ borderColor: CHAT_THEME.border }}>
                          <p className="mb-2 text-[11px] tracking-wide" style={{ color: CHAT_THEME.low }}>本章命中的资料片段</p>
                          {chapterKnowledgeActions.chunks.slice(0, 4).map((item: ChapterKnowledgeActionItem, index: number) => (
                            <KnowledgeActionItem key={item.key} prefix={`资料 ${index + 1}`} item={item} />
                          ))}
                        </div>
                      ) : null}

                      {chapterKnowledgeActions.papers.length ? (
                        <div className="mt-4 border-t pt-4" style={{ borderColor: CHAT_THEME.border }}>
                          <p className="mb-2 text-[11px] tracking-wide" style={{ color: CHAT_THEME.low }}>本章关联的项目文献</p>
                          {chapterKnowledgeActions.papers.slice(0, 3).map((item: ChapterKnowledgeActionItem, index: number) => (
                            <KnowledgeActionItem key={item.key} prefix={`文献 ${index + 1}`} item={item} />
                          ))}
                        </div>
                      ) : null}

                      {chapterKnowledgeActions.notes.length ? (
                        <div className="mt-4 border-t pt-4" style={{ borderColor: CHAT_THEME.border }}>
                          <p className="mb-2 text-[11px] tracking-wide" style={{ color: CHAT_THEME.low }}>本章关联的证据卡片</p>
                          {chapterKnowledgeActions.notes.slice(0, 3).map((item: ChapterKnowledgeActionItem, index: number) => (
                            <KnowledgeActionItem key={item.key} prefix={`证据 ${index + 1}`} item={item} />
                          ))}
                        </div>
                      ) : null}
                    </SidePanel>

                    <SidePanel title="项目成果">
                      <StatLine label="成果材料" value={`${outcomes.length} 项`} />
                      {outcomes.slice(0, 5).map((outcome) => (
                        <div key={outcome.id} className="mb-2 rounded-lg px-3 py-2 text-[11px] leading-5" style={{ background: CHAT_THEME.bg, color: CHAT_THEME.text }}>
                          <div className="font-medium">{outcome.name}</div>
                          <div className="mt-1" style={{ color: CHAT_THEME.low }}>{outcome.outcome_type}</div>
                          {outcome.description && (
                            <div className="mt-1" style={{ color: CHAT_THEME.mid }}>
                              {outcome.description}
                            </div>
                          )}
                        </div>
                      ))}
                      {outcomes.length === 0 && (
                        <p className="text-[12px] leading-6" style={{ color: CHAT_THEME.mid }}>
                          暂无成果材料。涉及实现、实验和结果章节前，建议先上传实验记录、截图、数据表或系统成果。
                        </p>
                      )}
                      {activeChapterKnowledge?.linked_outcomes?.length ? (
                        <div className="mt-3 border-t pt-3" style={{ borderColor: CHAT_THEME.border }}>
                          <p className="mb-2 text-[11px] tracking-wide" style={{ color: CHAT_THEME.low }}>当前章节已使用</p>
                          {activeChapterKnowledge.linked_outcomes.map((outcome: ProjectWorkspaceLinkedOutcome) => (
                            <div key={outcome.id} className="mb-2 rounded-lg px-3 py-2 text-[11px] leading-5" style={{ background: CHAT_THEME.card, color: CHAT_THEME.text }}>
                              {outcome.name}
                            </div>
                          ))}
                        </div>
                      ) : null}
                    </SidePanel>
                  </>
                )}

                {rightTab === "delivery" && (
                  <>
                    <SidePanel title="交付状态">
                      <StatLine label="草稿进度" value={`${progress}%`} />
                      <StatLine label="当前章节" value={formatSectionStatus(activeSection?.status)} />
                      <StatLine label="成果材料" value={`${outcomes.length} 项`} />
                      <StatLine label="合规检查" value={complianceResult ? `${complianceResult.overall_score} 分` : "尚未检查"} />
                    </SidePanel>

                    <SidePanel title="导出草稿">
                      {activeDraft ? (
                        <div className="grid grid-cols-2 gap-2">
                          <DownloadLink href={getDraftDownloadUrl(activeDraft.id, "docx")} label="DOCX" />
                          <DownloadLink href={getDraftDownloadUrl(activeDraft.id, "pdf")} label="PDF" />
                        </div>
                      ) : (
                        <p className="text-[12px] leading-6" style={{ color: CHAT_THEME.mid }}>
                          创建草稿后可导出 DOCX 或 PDF。
                        </p>
                      )}
                    </SidePanel>

                  </>
                )}
              </div>
            </aside>
          )}
        </section>
      </main>

      {settingsOpen && <WorkbenchSettingsPanel onClose={() => setSettingsOpen(false)} />}
    </div>
  );
}

function getSection(draft: Draft, key: string) {
  return draft.sections.find((section) => section.key === key) ?? null;
}

function getChapterSuggestions(chapterKey: string, hasOutcomes: boolean) {
  if (chapterKey === "chapter_1_introduction" || chapterKey === "chapter_2_theory") {
    return [
      "优先引用真实文献背景，避免把常识性判断写成已验证结论。",
      "每个研究现状判断最好能对应至少一条文献依据。",
      "不足和空白应来自文献对比，不要凭空扩大研究意义。",
    ];
  }

  if (chapterKey === "chapter_3_design") {
    return [
      "围绕项目设计说明研究方法、技术路线和系统边界。",
      "方法描述应能对应已有设计或可实现方案。",
      "不要在方法章节提前给出尚未验证的实验结论。",
    ];
  }

  if (chapterKey === "chapter_4_implementation" || chapterKey === "chapter_5_experiment") {
    return hasOutcomes
      ? [
          "优先引用项目成果、截图、实验记录或真实数据。",
          "涉及指标、数量、性能提升时必须能找到对应依据。",
          "不确定的数据用待验证描述，不写成确定结论。",
        ]
      : [
          "当前缺少成果材料，只适合写实现方案、实验设计或待验证内容。",
          "不要生成准确率、耗时、样本量、提升比例等具体结果。",
          "建议先上传实验记录、截图、数据表或系统成果。",
        ];
  }

  return [
    "总结应回扣研究目标和已完成内容。",
    "限制部分应明确哪些结论尚未被真实数据验证。",
    "展望不要写成已经完成的功能或实验结果。",
  ];
}

function paperNotesForChapter(chapterKey: string, references: string[], draftReferences: string[]) {
  const signals = [...references, ...draftReferences];
  if (chapterKey === "chapter_1_introduction" || chapterKey === "chapter_2_theory") {
    return signals.filter((item) => item.includes("文献") || item.includes("DOI")).slice(0, 4);
  }
  if (chapterKey === "chapter_4_implementation" || chapterKey === "chapter_5_experiment") {
    return signals.filter((item) => !item.includes("文献")).slice(0, 4);
  }
  return signals.slice(0, 4);
}

function ToolbarButton({
  label,
  onClick,
  disabled,
  muted,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  muted?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="rounded-lg px-4 py-2 text-xs font-medium disabled:opacity-40"
      style={{
        background: muted ? CHAT_THEME.muted : CHAT_THEME.primary,
        color: muted ? CHAT_THEME.text : CHAT_THEME.bg,
        border: `1px solid ${muted ? CHAT_THEME.border : "transparent"}`,
      }}
    >
      {label}
    </button>
  );
}

const AutoGrowingTextarea = forwardRef<HTMLTextAreaElement, {
  value: string;
  onChange: (value: string) => void;
  onFocus: () => void;
  placeholder: string;
  active: boolean;
  registerRef?: (node: HTMLTextAreaElement | null) => void;
}>(function AutoGrowingTextarea({
  value,
  onChange,
  onFocus,
  placeholder,
  active,
  registerRef,
}, forwardedRef) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    const node = textareaRef.current;
    if (!node) return;
    node.style.height = "0px";
    node.style.height = `${Math.max(220, node.scrollHeight)}px`;
  }, [value]);

  return (
    <textarea
      ref={(node) => {
        textareaRef.current = node;
        registerRef?.(node);
        if (typeof forwardedRef === "function") {
          forwardedRef(node);
        } else if (forwardedRef) {
          forwardedRef.current = node;
        }
      }}
      value={value}
      onFocus={onFocus}
      onChange={(event) => onChange(event.target.value)}
      placeholder={placeholder}
      className="w-full resize-none bg-transparent text-[16px] leading-8 outline-none"
      style={{
        minHeight: 220,
        color: CHAT_THEME.text,
        fontFamily: "Georgia, 'Times New Roman', 'Noto Serif SC', serif",
        boxShadow: active ? "inset 0 0 0 1px rgba(24,48,29,0.08)" : "none",
      }}
    />
  );
});

function PanelTabButton({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-lg px-4 py-2 text-sm font-medium"
      style={{
        background: active ? CHAT_THEME.bg : "transparent",
        color: active ? CHAT_THEME.text : CHAT_THEME.mid,
        border: `1px solid ${active ? CHAT_THEME.border : "transparent"}`,
      }}
    >
      {label}
    </button>
  );
}

function ActionButton({
  label,
  onClick,
  disabled,
  danger,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="mb-2 w-full rounded-lg px-3 py-2 text-left text-xs font-medium disabled:opacity-40"
      style={{
        background: danger ? "rgba(130,40,40,0.08)" : CHAT_THEME.bg,
        color: danger ? "#822828" : CHAT_THEME.text,
        border: `1px solid ${danger ? "rgba(130,40,40,0.18)" : CHAT_THEME.border}`,
      }}
    >
      {label}
    </button>
  );
}

function SidePanel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-4">
      <h3 className="mb-2 text-[12px] font-semibold" style={{ color: CHAT_THEME.text }}>
        {title}
      </h3>
      <div className="rounded-xl p-3" style={{ background: CHAT_THEME.muted, border: `1px solid ${CHAT_THEME.border}` }}>
        {children}
      </div>
    </section>
  );
}

function Suggestion({ text }: { text: string }) {
  return (
    <div className="mb-2 rounded-lg px-3 py-2 text-[12px] leading-6 last:mb-0" style={{ background: CHAT_THEME.card, color: CHAT_THEME.text }}>
      {text}
    </div>
  );
}

function ReferenceItem({ prefix, text, actionable = false }: { prefix: string; text: string; actionable?: boolean }) {
  return (
    <div className="mb-2 rounded-lg px-3 py-2 text-[11px] leading-5" style={{ background: CHAT_THEME.bg, color: CHAT_THEME.mid }}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 break-words">
          <span className="font-medium" style={{ color: CHAT_THEME.text }}>{prefix}：</span>
          {text}
        </div>
        {actionable ? (
          <button
            type="button"
            onClick={() => navigator.clipboard?.writeText(text)}
            className="shrink-0 rounded border px-2 py-1 text-[10px]"
            style={{ borderColor: CHAT_THEME.border, color: CHAT_THEME.low }}
          >
            复制
          </button>
        ) : null}
      </div>
    </div>
  );
}

function KnowledgeActionItem({
  prefix,
  item,
}: {
  prefix: string;
  item: {
    title: string;
    subtitle: string;
    sectionTitle?: string;
    sourceHint?: string;
    href: string;
    actionLabel: string;
    external: boolean;
    downloadHref?: string;
    downloadLabel?: string;
  };
}) {
  return (
    <div className="mb-2 rounded-lg px-3 py-2 text-[11px] leading-5" style={{ background: CHAT_THEME.bg, color: CHAT_THEME.mid }}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 break-words">
          <span className="font-medium" style={{ color: CHAT_THEME.text }}>{prefix}：</span>
          {item.title}
          {item.subtitle ? (
            <div className="mt-1" style={{ color: CHAT_THEME.low }}>
              {item.subtitle}
            </div>
          ) : null}
          {item.sourceHint ? (
            <div className="mt-1 text-[10px]" style={{ color: CHAT_THEME.mid }}>
              {item.sourceHint}
            </div>
          ) : null}
          {item.sectionTitle ? (
            <div className="mt-1" style={{ color: CHAT_THEME.low }}>
              所属章节：{item.sectionTitle}
            </div>
          ) : null}
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <a
            href={item.href}
            target={item.external ? "_blank" : undefined}
            rel={item.external ? "noreferrer" : undefined}
            className="rounded border px-2 py-1 text-[10px]"
            style={{ borderColor: CHAT_THEME.border, color: CHAT_THEME.low }}
          >
            {item.actionLabel}
          </a>
          {item.downloadHref && item.downloadLabel ? (
            <a
              href={item.downloadHref}
              target="_blank"
              rel="noreferrer"
              className="rounded border px-2 py-1 text-[10px]"
              style={{ borderColor: CHAT_THEME.border, color: CHAT_THEME.low }}
            >
              {item.downloadLabel}
            </a>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function DownloadLink({ href, label }: { href: string; label: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="rounded-lg px-3 py-2 text-center text-xs font-medium"
      style={{ background: CHAT_THEME.bg, color: CHAT_THEME.text, border: `1px solid ${CHAT_THEME.border}` }}
    >
      {label}
    </a>
  );
}

function StatLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="mb-2 flex items-center justify-between text-[12px] last:mb-0">
      <span style={{ color: CHAT_THEME.mid }}>{label}</span>
      <span className="font-medium" style={{ color: CHAT_THEME.text }}>
        {value}
      </span>
    </div>
  );
}

function EmptyCanvas({
  title,
  description,
  actionLabel,
  onAction,
}: {
  title: string;
  description: string;
  actionLabel: string;
  onAction: () => void;
}) {
  return (
    <div className="mx-auto flex min-h-[520px] max-w-md flex-col items-center justify-center text-center">
      <h2 className="text-2xl font-semibold" style={{ fontFamily: "var(--font-cormorant), serif" }}>
        {title}
      </h2>
      <p className="mt-3 text-sm leading-7" style={{ color: CHAT_THEME.mid }}>
        {description}
      </p>
      <button
        type="button"
        onClick={onAction}
        className="mt-6 rounded-full px-5 py-2.5 text-sm font-medium"
        style={{ background: CHAT_THEME.primary, color: CHAT_THEME.bg }}
      >
        {actionLabel}
      </button>
    </div>
  );
}

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
    <div className="flex min-h-screen items-center justify-center px-6" style={{ background: CHAT_THEME.bg }}>
      <div className="max-w-md rounded-2xl p-8 text-center" style={{ background: CHAT_THEME.card, border: `1px solid ${CHAT_THEME.border}` }}>
        <h1 className="text-2xl font-semibold" style={{ fontFamily: "var(--font-cormorant), serif", color: CHAT_THEME.text }}>
          {title}
        </h1>
        <p className="mt-4 text-sm leading-7" style={{ color: CHAT_THEME.mid }}>{description}</p>
        {actionLabel && onAction && (
          <button
            type="button"
            onClick={onAction}
            className="mt-6 rounded-full px-5 py-2.5 text-sm font-medium"
            style={{ background: CHAT_THEME.primary, color: CHAT_THEME.bg }}
          >
            {actionLabel}
          </button>
        )}
      </div>
    </div>
  );
}

function formatSectionStatus(status?: string) {
  if (status === "generated") return "已生成";
  if (status === "edited") return "已编辑";
  if (status === "final") return "已定稿";
  return "草稿";
}
