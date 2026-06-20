/** 论文写作页：提供章节目录、正文编辑区和 AI 建议面板。 */
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import ChatSidebar from "@/components/chat/ChatSidebar";
import WorkbenchSettingsPanel from "@/components/chat/WorkbenchSettingsPanel";
import {
  checkCompliance,
  createDraft,
  generateAbstract,
  generateChapter,
  getDefenseOutline,
  getDraft,
  getDraftDownloadUrl,
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
  DefensePPTOutline,
  Draft,
  Outcome,
  PersistedProjectDesign,
  Project,
} from "@/lib/types";
import { CHAT_THEME } from "@/components/chat/chatTheme";
import {
  buildEditedChapterPayload,
  getDraftChapterRecord,
  getDraftCompletionSummary,
  getDraftReferences,
} from "@/lib/draftKnowledge";

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
type PageZoom = 90 | 100 | 110;
type PageWidthMode = "standard" | "wide";

export default function WritingPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [designs, setDesigns] = useState<PersistedProjectDesign[]>([]);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [activeDraft, setActiveDraft] = useState<Draft | null>(null);
  const [activeChapterKey, setActiveChapterKey] = useState(CHAPTER_KEYS[0]);
  const [editorContent, setEditorContent] = useState("");
  const [loading, setLoading] = useState(true);
  const [draftLoading, setDraftLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [checking, setChecking] = useState(false);
  const [abstractResult, setAbstractResult] = useState<AbstractResult | null>(null);
  const [complianceResult, setComplianceResult] = useState<ComplianceResult | null>(null);
  const [outcomes, setOutcomes] = useState<Outcome[]>([]);
  const [defenseOutline, setDefenseOutline] = useState<DefensePPTOutline | null>(null);
  const [rightTab, setRightTab] = useState<RightPanelTab>("suggestions");
  const [pageZoom, setPageZoom] = useState<PageZoom>(100);
  const [pageWidthMode, setPageWidthMode] = useState<PageWidthMode>("standard");
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

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
        setSelectedProjectId((current) => current ?? items[0]?.id ?? null);
      })
      .catch(() => setProjects([]))
      .finally(() => setLoading(false));
  }, [authLoading, user]);

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
        const firstDraft = draftItems[0] ?? null;
        setActiveDraft(firstDraft ? await getDraft(firstDraft.id) : null);
      })
      .catch(() => {
        setDrafts([]);
        setDesigns([]);
        setActiveDraft(null);
      })
      .finally(() => setDraftLoading(false));
  }, [selectedProjectId]);

  useEffect(() => {
    if (!selectedProjectId) {
      setOutcomes([]);
      return;
    }
    listOutcomes({ project_id: selectedProjectId })
      .then(setOutcomes)
      .catch(() => setOutcomes([]));
  }, [selectedProjectId]);

  useEffect(() => {
    if (!activeDraft) {
      setEditorContent("");
      return;
    }

    const section = getSection(activeDraft, activeChapterKey);
    setEditorContent(section?.content || "");
  }, [activeDraft, activeChapterKey]);

  useEffect(() => {
    if (!activeDraft) {
      setDefenseOutline(null);
      return;
    }
    getDefenseOutline(activeDraft.id)
      .then(setDefenseOutline)
      .catch(() => setDefenseOutline(null));
  }, [activeDraft?.id]);

  const selectedProject = useMemo(
    () => projects.find((project) => project.id === selectedProjectId) ?? null,
    [projects, selectedProjectId],
  );

  const latestDesign = designs[0] ?? null;
  const designContent = (latestDesign?.content ?? null) as DesignContent | null;
  const activeSection = activeDraft ? getSection(activeDraft, activeChapterKey) : null;
  const activeChapterRecord = getDraftChapterRecord(activeDraft, activeChapterKey);
  const wordCount = editorContent.replace(/\s+/g, "").length;
  const { completedCount, progress } = getDraftCompletionSummary(activeDraft, CHAPTER_KEYS);
  const currentTitle = activeSection?.title || FALLBACK_CHAPTERS[activeChapterKey] || "章节";
  const isDirty = activeSection ? editorContent !== activeSection.content : Boolean(editorContent);
  const designReferences = designContent?.references || [];
  const draftReferences = getDraftReferences(activeDraft);
  const references = [...designReferences, ...draftReferences].filter(Boolean);
  const hasDesign = Boolean(latestDesign);
  const hasOutcomes = outcomes.length > 0;
  const hasReferences = references.length > 0;
  const isResultSensitiveChapter = ["chapter_4_implementation", "chapter_5_experiment"].includes(activeChapterKey);
  const chapterSuggestions = getChapterSuggestions(activeChapterKey, hasOutcomes);
  const evidenceReadyCount = [hasDesign, hasOutcomes, hasReferences].filter(Boolean).length;
  const saveStateLabel = saving ? "保存中" : isDirty ? "未保存" : "已同步";
  const pageMaxWidth = pageWidthMode === "wide" ? 940 : 820;
  const workspaceMaxWidth = pageWidthMode === "wide" ? 1020 : 900;
  const evidenceBadges = [
    { label: hasDesign ? "有项目设计" : "缺项目设计", tone: hasDesign ? "good" : "warn" },
    { label: hasOutcomes ? "有成果材料" : "缺成果材料", tone: hasOutcomes ? "good" : "warn" },
    { label: hasReferences ? "有引用依据" : "缺引用依据", tone: hasReferences ? "good" : "warn" },
    ...(isResultSensitiveChapter ? [{ label: activeChapterRecord?.data_based ? "当前章节含真实结果标记" : "结果章节需真实数据", tone: "warn" }] : []),
  ] as { label: string; tone: "good" | "warn" }[];
  const chapterCitations = activeChapterRecord?.citations || [];
  const chapterNoteMatches = paperNotesForChapter(activeChapterKey, references, draftReferences);

  const loadDraftById = useCallback(async (draftId: string) => {
    setDraftLoading(true);
    setError(null);
    try {
      const draft = await getDraft(draftId);
      setActiveDraft(draft);
      setActiveChapterKey(draft.sections[0]?.key || CHAPTER_KEYS[0]);
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
      content[activeChapterKey] = buildEditedChapterPayload(content[activeChapterKey], currentTitle, editorContent);
      const updated = await updateDraft(activeDraft.id, { content });
      setActiveDraft(updated);
      setNotice("已保存当前章节");
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存失败");
    } finally {
      setSaving(false);
    }
  }, [activeDraft, activeChapterKey, currentTitle, editorContent]);

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
      setEditorContent(result.content || "");
      const updated = await getDraft(activeDraft.id);
      setActiveDraft(updated);
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
      await navigator.clipboard?.writeText(editorContent);
      setNotice("已复制当前章节");
    } catch {
      setNotice("当前浏览器不支持自动复制");
    }
  };

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

      <main className="grid min-w-0 flex-1 grid-cols-1 lg:grid-cols-[240px_minmax(0,1fr)] xl:grid-cols-[240px_minmax(0,1fr)_280px] 2xl:grid-cols-[260px_minmax(0,1fr)_280px]">
        <aside className="hidden min-h-0 flex-col border-r lg:flex" style={{ background: CHAT_THEME.card, borderColor: CHAT_THEME.border }}>
          <div className="border-b px-5 py-5" style={{ borderColor: CHAT_THEME.border }}>
            <h1 className="text-[20px] font-semibold leading-tight" style={{ fontFamily: "var(--font-cormorant), serif" }}>
              论文写作
            </h1>
            <p className="mt-2 text-xs leading-5" style={{ color: CHAT_THEME.mid }}>
              基于项目设计与文献依据生成论文草稿
            </p>
          </div>

          <div className="border-b px-4 py-4" style={{ borderColor: CHAT_THEME.border }}>
            <select
              value={selectedProjectId ?? ""}
              onChange={(event) => setSelectedProjectId(event.target.value || null)}
              className="h-10 w-full rounded-lg px-3 text-xs outline-none"
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

            <div className="mt-4">
              <div className="mb-1.5 flex justify-between text-[11px]" style={{ color: CHAT_THEME.mid }}>
                <span>完成进度</span>
                <span>{progress}%</span>
              </div>
              <div className="h-1 overflow-hidden rounded-full" style={{ background: "#d8d0c0" }}>
                <div className="h-full rounded-full" style={{ width: `${progress}%`, background: CHAT_THEME.primary }} />
              </div>
            </div>
          </div>

          <div className="border-b px-4 py-4" style={{ borderColor: CHAT_THEME.border }}>
            <div className="mb-2 flex items-center justify-between">
              <span className="text-[12px] font-medium">草稿</span>
              <button
                type="button"
                onClick={handleNewDraft}
                disabled={!selectedProject || draftLoading}
                className="rounded px-2 py-1 text-[11px] disabled:opacity-40"
                style={{ background: CHAT_THEME.primary, color: CHAT_THEME.bg }}
              >
                新建
              </button>
            </div>
            {drafts.length === 0 ? (
              <p className="rounded-lg border border-dashed px-3 py-4 text-center text-xs" style={{ borderColor: CHAT_THEME.border, color: CHAT_THEME.mid }}>
                暂无草稿
              </p>
            ) : (
              <div className="max-h-28 space-y-1 overflow-y-auto" style={{ scrollbarWidth: "none" }}>
                {drafts.map((draft) => (
                  <button
                    key={draft.id}
                    type="button"
                    onClick={() => loadDraftById(draft.id)}
                    className="w-full rounded-lg px-3 py-2 text-left text-xs transition-colors"
                    style={{
                      background: activeDraft?.id === draft.id ? "rgba(24,48,29,0.1)" : "transparent",
                      color: activeDraft?.id === draft.id ? CHAT_THEME.primary : CHAT_THEME.text,
                    }}
                  >
                    <div className="truncate font-medium">{draft.title}</div>
                    <div className="mt-0.5 text-[10px]" style={{ color: CHAT_THEME.mid }}>
                      v{draft.version} · {draft.sections.filter((section) => section.status !== "draft").length}/6 章
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4" style={{ scrollbarWidth: "none" }}>
            <div className="mb-3 text-[12px] font-medium">章节结构</div>
            {CHAPTER_KEYS.map((key) => {
              const section = activeDraft ? getSection(activeDraft, key) : null;
              const active = key === activeChapterKey;
              const title = section?.title || FALLBACK_CHAPTERS[key];
              const count = section?.content?.replace(/\s+/g, "").length || 0;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setActiveChapterKey(key)}
                  className="mb-1 flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-[13px]"
                  style={{
                    background: active ? "rgba(24,48,29,0.1)" : "transparent",
                    color: active ? CHAT_THEME.primary : CHAT_THEME.text,
                  }}
                >
                  <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: count > 0 ? CHAT_THEME.primary : CHAT_THEME.low }} />
                  <span className="min-w-0 flex-1 truncate">{title}</span>
                  <span className="text-[10px]" style={{ color: CHAT_THEME.mid }}>
                    {count}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="border-t px-5 py-4 text-xs" style={{ borderColor: CHAT_THEME.border, color: CHAT_THEME.mid }}>
            {latestDesign ? "已关联项目设计" : "尚未关联项目设计"}
          </div>
        </aside>

        <section className="flex min-h-0 flex-col">
          <header
            className="grid min-h-16 shrink-0 grid-cols-1 items-center gap-3 border-b px-4 py-3 sm:grid-cols-[minmax(0,1fr)_auto] lg:grid-cols-[minmax(0,1fr)_auto_auto] lg:px-7"
            style={{ background: CHAT_THEME.card, borderColor: CHAT_THEME.border }}
          >
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold" style={{ color: CHAT_THEME.text }}>
                {activeDraft?.title || "论文草稿"}
              </div>
              <div className="mt-1 flex min-w-0 items-center gap-2 text-xs" style={{ color: CHAT_THEME.mid }}>
                <span className="truncate">{currentTitle}</span>
                <span>·</span>
                <span>{formatSectionStatus(activeSection?.status)}</span>
              </div>
            </div>

            <div className="hidden items-center gap-2 lg:flex">
              <StatusPill label={saveStateLabel} tone={isDirty ? "warn" : "good"} />
              <StatusPill label={`进度 ${progress}%`} />
              {generating && <StatusPill label="AI 生成中" tone="good" />}
            </div>

            <div className="flex items-center gap-2 sm:justify-end">
              <SegmentedControl<PageWidthMode>
                value={pageWidthMode}
                options={[
                  { label: "标准", value: "standard" },
                  { label: "宽版", value: "wide" },
                ]}
                onChange={setPageWidthMode}
              />
              <SegmentedControl<PageZoom>
                value={pageZoom}
                options={[
                  { label: "90%", value: 90 },
                  { label: "100%", value: 100 },
                  { label: "110%", value: 110 },
                ]}
                onChange={setPageZoom}
              />
              <ToolbarButton label="续写" onClick={handleGenerateChapter} disabled={!activeDraft || generating} />
              <ToolbarButton label="复制" onClick={handleCopy} muted />
            </div>
          </header>

          <div
            className="min-h-0 flex-1 overflow-y-auto px-3 py-5 sm:px-5 lg:px-8 lg:py-8"
            style={{ background: "#e9e4da", scrollbarWidth: "none" }}
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
                description="点击左侧“新建”，创建第一份可编辑草稿。"
                actionLabel="新建草稿"
                onAction={handleNewDraft}
              />
            ) : (
              <div className="mx-auto flex w-full flex-col items-center" style={{ maxWidth: workspaceMaxWidth }}>
                <DocumentRuler maxWidth={pageMaxWidth} />
                <article
                  className="min-h-[760px] w-full origin-top border px-5 py-7 shadow-[0_18px_45px_rgba(54,43,29,0.18)] sm:px-9 sm:py-9 lg:min-h-[1040px] lg:px-16 lg:py-14"
                  style={{
                    maxWidth: pageMaxWidth,
                    transform: `scale(${pageZoom / 100})`,
                    marginBottom: `${(pageZoom - 100) * 8}px`,
                    background: "#fffdf8",
                    borderColor: "rgba(73, 62, 44, 0.18)",
                  }}
                >
                  <div className="mb-8 flex flex-col gap-4 border-b pb-6 sm:flex-row sm:items-start sm:justify-between sm:gap-6" style={{ borderColor: "rgba(73, 62, 44, 0.14)" }}>
                    <div className="min-w-0">
                      <h2 className="text-[30px] font-semibold leading-tight" style={{ fontFamily: "var(--font-cormorant), serif" }}>
                        {currentTitle}
                      </h2>
                      <p className="mt-2 text-xs" style={{ color: CHAT_THEME.mid }}>
                        {activeDraft.title} · {formatSectionStatus(activeSection?.status)}
                      </p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {evidenceBadges.map((badge) => (
                          <EvidenceBadge key={badge.label} label={badge.label} tone={badge.tone} />
                        ))}
                      </div>
                      {isResultSensitiveChapter && !hasOutcomes && (
                        <p
                          className="mt-3 max-w-2xl rounded-lg px-3 py-2 text-[12px] leading-6"
                          style={{ background: CHAT_THEME.warnSoft, color: CHAT_THEME.warn, border: `1px solid rgba(160, 92, 35, 0.2)` }}
                        >
                          当前缺少真实成果材料，本章只应生成系统设计、实验方案或待验证描述，不应生成实验结果、性能结论或具体统计数据。
                        </p>
                      )}
                    </div>
                    <span className="shrink-0 text-xs" style={{ color: CHAT_THEME.mid }}>
                      {wordCount} 字
                    </span>
                  </div>

                  <textarea
                    value={editorContent}
                    onChange={(event) => setEditorContent(event.target.value)}
                    placeholder="在这里编辑当前章节。也可以点击右上角“续写”让 AI 基于项目资料生成本章内容。"
                    className="min-h-[540px] w-full resize-none bg-transparent text-[15px] leading-8 outline-none sm:min-h-[640px] sm:text-[16px] lg:min-h-[760px]"
                    style={{ color: CHAT_THEME.text, fontFamily: "Georgia, 'Times New Roman', 'Noto Serif SC', serif" }}
                  />
                </article>

                <div
                  className="mt-3 flex w-full flex-wrap items-center justify-between gap-3 rounded-lg px-4 py-2 text-[11px]"
                  style={{ maxWidth: pageMaxWidth, background: "rgba(255, 253, 248, 0.82)", color: CHAT_THEME.mid, border: `1px solid rgba(73, 62, 44, 0.12)` }}
                >
                  <span>页面视图</span>
                  <span>{wordCount} 字</span>
                  <span>进度 {progress}%</span>
                  <span>{pageZoom}%</span>
                  <span>{formatSectionStatus(activeSection?.status)}</span>
                  <span>证据 {evidenceReadyCount}/3</span>
                  <span>{saveStateLabel}</span>
                  <span>Ctrl+S 保存</span>
                </div>
              </div>
            )}
          </div>

          <footer className="flex min-h-14 shrink-0 flex-col gap-3 border-t px-4 py-3 sm:flex-row sm:items-center sm:justify-between lg:px-7" style={{ background: CHAT_THEME.card, borderColor: CHAT_THEME.border }}>
            <div className="text-xs" style={{ color: error ? "#9a2f2f" : CHAT_THEME.mid }}>
              {error || notice || "编辑后请保存当前章节"}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {activeDraft && (
                <a
                  href={getDraftDownloadUrl(activeDraft.id, "docx")}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-lg px-4 py-2 text-xs font-medium"
                  style={{ background: CHAT_THEME.muted, color: CHAT_THEME.text, border: `1px solid ${CHAT_THEME.border}` }}
                >
                  导出 DOCX
                </a>
              )}
              <button
                type="button"
                onClick={handleSave}
                disabled={!activeDraft || saving}
                className="rounded-lg px-5 py-2 text-xs font-medium disabled:opacity-40"
                style={{ background: CHAT_THEME.primary, color: CHAT_THEME.bg }}
              >
                {saving ? "保存中..." : "保存"}
              </button>
            </div>
          </footer>
        </section>

        <aside className="hidden min-h-0 flex-col border-l xl:flex" style={{ background: CHAT_THEME.card, borderColor: CHAT_THEME.border }}>
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

                <SidePanel title="当前章节知识依据">
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
                </SidePanel>

                <SidePanel title="生成与检查">
                  <ActionButton label={generating ? "生成中..." : "生成当前章节"} onClick={handleGenerateChapter} disabled={!activeDraft || generating} />
                  <ActionButton label={generating ? "生成中..." : "生成摘要"} onClick={handleGenerateAbstract} disabled={!activeDraft || generating} />
                  <ActionButton label={checking ? "检查中..." : "合规检查"} onClick={handleCheckCompliance} disabled={!activeDraft || checking} danger />
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

                <SidePanel title="草稿引用">
                  {draftReferences.slice(0, 6).map((reference, index) => (
                    <ReferenceItem key={`${reference}-${index}`} prefix={`引用 ${index + 1}`} text={reference} actionable />
                  ))}
                  {draftReferences.length === 0 && (
                    <p className="text-[12px] leading-6" style={{ color: CHAT_THEME.mid }}>
                      当前草稿暂无引用记录。可先在文献搜索中保存文献，或在后续生成章节时沉淀引用。
                    </p>
                  )}
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
                  <StatLine label="答辩大纲" value={defenseOutline ? `${defenseOutline.total_slides} 页` : "待生成"} />
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

                <SidePanel title="答辩 PPT 大纲">
                  {defenseOutline ? (
                    <>
                      {defenseOutline.slides.slice(0, 6).map((slide) => (
                        <div key={slide.page} className="mb-2 rounded-lg px-3 py-2 text-[11px] leading-5" style={{ background: CHAT_THEME.bg, color: CHAT_THEME.text }}>
                          第 {slide.page} 页 · {slide.title}
                        </div>
                      ))}
                      {!defenseOutline.has_real_data && (
                        <p className="mt-2 text-[11px] leading-5" style={{ color: CHAT_THEME.warn }}>
                          当前大纲提示真实数据不足，建议补充成果材料后再生成答辩 PPT。
                        </p>
                      )}
                    </>
                  ) : (
                    <p className="text-[12px] leading-6" style={{ color: CHAT_THEME.mid }}>
                      暂无答辩 PPT 大纲。可在后续完整工作流中生成。
                    </p>
                  )}
                </SidePanel>
              </>
            )}
          </div>
        </aside>
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

function SegmentedControl<T extends string | number>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { label: string; value: T }[];
  onChange: (value: T) => void;
}) {
  return (
    <div className="hidden rounded-lg p-0.5 lg:flex" style={{ background: CHAT_THEME.muted, border: `1px solid ${CHAT_THEME.border}` }}>
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={String(option.value)}
            type="button"
            onClick={() => onChange(option.value)}
            className="rounded-md px-2.5 py-1.5 text-[11px] font-medium"
            style={{
              background: active ? CHAT_THEME.card : "transparent",
              color: active ? CHAT_THEME.text : CHAT_THEME.mid,
            }}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

function StatusPill({ label, tone = "neutral" }: { label: string; tone?: "neutral" | "good" | "warn" }) {
  const colorMap = {
    neutral: { bg: CHAT_THEME.muted, text: CHAT_THEME.mid, border: CHAT_THEME.border },
    good: { bg: CHAT_THEME.primarySoft, text: CHAT_THEME.primary, border: "rgba(24, 48, 29, 0.16)" },
    warn: { bg: CHAT_THEME.warnSoft, text: CHAT_THEME.warn, border: "rgba(160, 92, 35, 0.2)" },
  }[tone];

  return (
    <span
      className="rounded-full px-2.5 py-1 text-[11px] font-medium"
      style={{ background: colorMap.bg, color: colorMap.text, border: `1px solid ${colorMap.border}` }}
    >
      {label}
    </span>
  );
}

function DocumentRuler({ maxWidth }: { maxWidth: number }) {
  return (
    <div
      className="mb-2 h-8 w-full overflow-hidden rounded-t-lg border px-4 sm:px-8 lg:px-10"
      style={{ maxWidth, background: "#f8f4ea", borderColor: "rgba(73, 62, 44, 0.14)" }}
    >
      <div
        className="h-full"
        style={{
          backgroundImage:
            "repeating-linear-gradient(to right, rgba(73,62,44,0.28) 0 1px, transparent 1px 24px), repeating-linear-gradient(to right, rgba(73,62,44,0.46) 0 1px, transparent 1px 96px)",
          backgroundPosition: "0 100%",
          backgroundSize: "100% 10px, 100% 16px",
          backgroundRepeat: "repeat-x",
        }}
      />
    </div>
  );
}

function EvidenceBadge({ label, tone }: { label: string; tone: "good" | "warn" }) {
  const isWarn = tone === "warn";
  return (
    <span
      className="rounded-full px-2.5 py-1 text-[11px] font-medium"
      style={{
        background: isWarn ? CHAT_THEME.warnSoft : CHAT_THEME.primarySoft,
        color: isWarn ? CHAT_THEME.warn : CHAT_THEME.primary,
        border: `1px solid ${isWarn ? "rgba(160, 92, 35, 0.2)" : "rgba(24, 48, 29, 0.16)"}`,
      }}
    >
      {label}
    </span>
  );
}

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
