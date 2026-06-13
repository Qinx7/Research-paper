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
  const wordCount = editorContent.replace(/\s+/g, "").length;
  const completedCount = activeDraft?.sections.filter((section) => section.status !== "draft").length ?? 0;
  const progress = Math.round((completedCount / CHAPTER_KEYS.length) * 100);
  const currentTitle = activeSection?.title || FALLBACK_CHAPTERS[activeChapterKey] || "章节";
  const isDirty = activeSection ? editorContent !== activeSection.content : Boolean(editorContent);
  const references = [
    ...(designContent?.references || []),
    ...((activeDraft?.references || []).map((reference) => JSON.stringify(reference))),
  ].filter(Boolean);

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

  const handleSave = async () => {
    if (!activeDraft) return;
    setSaving(true);
    setError(null);
    try {
      const content = { ...(activeDraft.content || {}) };
      content[activeChapterKey] = {
        title: currentTitle,
        content: editorContent,
        status: editorContent.trim() ? "edited" : "draft",
        data_based: content[activeChapterKey]?.data_based ?? false,
      };
      const updated = await updateDraft(activeDraft.id, { content });
      setActiveDraft(updated);
      setNotice("已保存当前章节");
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存失败");
    } finally {
      setSaving(false);
    }
  };

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

  const sidebarNoop = () => {};

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
        onNewChat={() => router.push("/chat")}
        onOpenSettings={() => setSettingsOpen(true)}
        refreshKey={0}
      />

      <main className="grid min-w-0 flex-1 grid-cols-[260px_minmax(0,1fr)_280px]">
        <aside className="flex min-h-0 flex-col border-r" style={{ background: CHAT_THEME.card, borderColor: CHAT_THEME.border }}>
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
          <header className="flex h-14 shrink-0 items-center justify-between border-b px-7" style={{ background: CHAT_THEME.card, borderColor: CHAT_THEME.border }}>
            <div className="flex min-w-0 items-center gap-2 text-xs" style={{ color: CHAT_THEME.mid }}>
              <span>论文草稿</span>
              <span>›</span>
              <span className="truncate font-medium" style={{ color: CHAT_THEME.text }}>
                {currentTitle}
              </span>
              {generating && (
                <span className="rounded px-2 py-0.5" style={{ background: CHAT_THEME.primarySoft, color: CHAT_THEME.primary }}>
                  AI 生成中
                </span>
              )}
              {isDirty && (
                <span className="rounded px-2 py-0.5" style={{ background: CHAT_THEME.warnSoft, color: CHAT_THEME.warn }}>
                  未保存
                </span>
              )}
            </div>

            <div className="flex items-center gap-2">
              <FormatButton label="B" title="加粗（视觉占位）" />
              <FormatButton label="I" title="斜体（视觉占位）" />
              <FormatButton label="≡" title="段落（视觉占位）" />
              <span className="mx-1 h-5 w-px" style={{ background: CHAT_THEME.border }} />
              <ToolbarButton label="改写" onClick={sidebarNoop} muted />
              <ToolbarButton label="续写" onClick={handleGenerateChapter} disabled={!activeDraft || generating} />
              <ToolbarButton label="复制" onClick={handleCopy} muted />
            </div>
          </header>

          <div className="min-h-0 flex-1 overflow-y-auto px-12 py-10" style={{ scrollbarWidth: "none" }}>
            {projects.length === 0 ? (
              <EmptyCanvas
                title="还没有研究项目"
                description="请先从文献搜索或完整研究流程创建一个项目，再进入论文写作。"
                actionLabel="返回文献搜索"
                onAction={() => router.push("/chat")}
              />
            ) : !activeDraft ? (
              <EmptyCanvas
                title="还没有论文草稿"
                description="点击左侧“新建”，创建第一份可编辑草稿。"
                actionLabel="新建草稿"
                onAction={handleNewDraft}
              />
            ) : (
              <article className="mx-auto max-w-[760px]">
                <div className="mb-6 flex items-start justify-between gap-4">
                  <div>
                    <h2 className="text-[28px] font-semibold" style={{ fontFamily: "var(--font-cormorant), serif" }}>
                      {currentTitle}
                    </h2>
                    <p className="mt-2 text-xs" style={{ color: CHAT_THEME.mid }}>
                      {activeDraft.title} · {formatSectionStatus(activeSection?.status)}
                    </p>
                  </div>
                  <span className="text-xs" style={{ color: CHAT_THEME.mid }}>
                    {wordCount} 字
                  </span>
                </div>

                <div className="mb-6 h-px" style={{ background: CHAT_THEME.border }} />

                <textarea
                  value={editorContent}
                  onChange={(event) => setEditorContent(event.target.value)}
                  placeholder="在这里编辑当前章节。也可以点击右上角“续写”让 AI 基于项目资料生成本章内容。"
                  className="min-h-[560px] w-full resize-none bg-transparent text-[16px] leading-9 outline-none"
                  style={{ color: CHAT_THEME.text }}
                />
              </article>
            )}
          </div>

          <footer className="flex h-14 shrink-0 items-center justify-between border-t px-7" style={{ background: CHAT_THEME.card, borderColor: CHAT_THEME.border }}>
            <div className="text-xs" style={{ color: error ? "#9a2f2f" : CHAT_THEME.mid }}>
              {error || notice || "编辑后请保存当前章节"}
            </div>
            <div className="flex items-center gap-2">
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

        <aside className="flex min-h-0 flex-col border-l" style={{ background: CHAT_THEME.card, borderColor: CHAT_THEME.border }}>
          <div className="flex h-14 shrink-0 items-center gap-2 border-b px-4" style={{ borderColor: CHAT_THEME.border }}>
            <PanelTabButton label="建议" active={rightTab === "suggestions"} onClick={() => setRightTab("suggestions")} />
            <PanelTabButton label="引用" active={rightTab === "references"} onClick={() => setRightTab("references")} />
            <PanelTabButton label="交付" active={rightTab === "delivery"} onClick={() => setRightTab("delivery")} />
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4" style={{ scrollbarWidth: "none" }}>
            {rightTab === "suggestions" && (
              <>
                <SidePanel title="AI 写作建议">
                  <Suggestion text="补充与当前章节直接相关的项目成果、实验记录或检索依据。" />
                  <Suggestion text="避免编造统计数值、实验结果和不存在的参考文献。" />
                  <Suggestion text="每一段结论最好能对应文献依据或项目材料。" />
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
                <SidePanel title="关联文献">
                  {latestDesign?.topic && (
                    <p className="mb-3 text-[12px] leading-6" style={{ color: CHAT_THEME.text }}>{latestDesign.topic}</p>
                  )}
                  {references.slice(0, 8).map((reference, index) => (
                    <div key={`${reference}-${index}`} className="mb-2 rounded-lg px-3 py-2 text-[11px] leading-5" style={{ background: CHAT_THEME.bg, color: CHAT_THEME.mid }}>
                      [{index + 1}] {reference}
                    </div>
                  ))}
                  {references.length === 0 && (
                    <p className="text-[12px] leading-6" style={{ color: CHAT_THEME.mid }}>
                      暂无可展示引用。可先在文献搜索中检索并沉淀项目依据。
                    </p>
                  )}
                </SidePanel>

                <SidePanel title="项目成果">
                  <StatLine label="成果材料" value={`${outcomes.length} 项`} />
                  {outcomes.slice(0, 5).map((outcome) => (
                    <div key={outcome.id} className="mb-2 rounded-lg px-3 py-2 text-[11px]" style={{ background: CHAT_THEME.bg, color: CHAT_THEME.text }}>
                      <div className="font-medium">{outcome.name}</div>
                      <div className="mt-1" style={{ color: CHAT_THEME.low }}>{outcome.outcome_type}</div>
                    </div>
                  ))}
                  {outcomes.length === 0 && <p className="text-[12px] leading-6" style={{ color: CHAT_THEME.mid }}>暂无成果材料。</p>}
                </SidePanel>
              </>
            )}

            {rightTab === "delivery" && (
              <>
                <SidePanel title="交付状态">
                  <StatLine label="草稿进度" value={`${progress}%`} />
                  <StatLine label="当前章节" value={formatSectionStatus(activeSection?.status)} />
                  <StatLine label="成果材料" value={`${outcomes.length} 项`} />
                  <StatLine label="答辩大纲" value={defenseOutline ? `${defenseOutline.total_slides} 页` : "待生成"} />
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

function FormatButton({ label, title }: { label: string; title: string }) {
  return (
    <button
      type="button"
      className="grid h-8 w-8 place-items-center rounded-lg text-xs font-semibold"
      style={{ background: CHAT_THEME.muted, color: CHAT_THEME.mid, border: `1px solid ${CHAT_THEME.border}` }}
      title={title}
    >
      {label}
    </button>
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
