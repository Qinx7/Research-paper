"use client";

import React, { useState, useEffect, useCallback } from "react";
import * as api from "../lib/api";
import type {
  Draft, DraftOutline, ChapterResult, AbstractResult,
  PPTStyle, DefensePPTResponse, DefenseScript,
  ComplianceResult, ComplianceIssue,
} from "../lib/types";
import type { TaskStatus } from "../lib/api";
import OutcomeManager from "./OutcomeManager";
import StageWrapper from "./StageWrapper";

// ========== 章节映射 ==========

const CHAPTER_KEYS = [
  "chapter_1_introduction",
  "chapter_2_theory",
  "chapter_3_design",
  "chapter_4_implementation",
  "chapter_5_experiment",
  "chapter_6_conclusion",
];

const CHAPTER_LABELS: Record<string, string> = {
  chapter_1_introduction: "第一章 绪论",
  chapter_2_theory: "第二章 相关理论与技术基础",
  chapter_3_design: "第三章 系统需求分析与总体设计",
  chapter_4_implementation: "第四章 系统实现",
  chapter_5_experiment: "第五章 实验设计与结果分析",
  chapter_6_conclusion: "第六章 总结与展望",
};

const WORKFLOW_STAGES: Record<number, string> = {
  1: "成果管理",
  2: "论文写作",
  3: "答辩 PPT",
};

// ========== 快速步骤指示器 ==========

function WorkflowStepIndicator({ currentStep, onStepClick }: {
  currentStep: number; onStepClick: (s: number) => void;
}) {
  return (
    <div className="flex items-center justify-center gap-2 mb-8">
      {[1, 2, 3].map((step) => (
        <React.Fragment key={step}>
          <button
            onClick={() => onStepClick(step)}
            className={`w-8 h-8 rounded-full text-sm font-medium flex items-center justify-center border-2 transition-colors ${
              step === currentStep
                ? "border-blue-600 bg-blue-600 text-white"
                : step < currentStep
                  ? "border-green-500 bg-green-50 text-green-700"
                  : "border-gray-300 bg-white text-gray-400"
            }`}
          >
            {step < currentStep ? "✓" : step}
          </button>
          {step < 3 && <div className="w-12 h-0.5 bg-gray-200" />}
        </React.Fragment>
      ))}
      <span className="ml-3 text-sm text-gray-500">{WORKFLOW_STAGES[currentStep]}</span>
    </div>
  );
}


// ========== 主组件 ==========

interface Props {
  projectId: string;
  onBack?: () => void;
}

export default function PaperWorkflow({ projectId, onBack }: Props) {
  const [step, setStep] = useState(1);
  const [outcomesReady, setOutcomesReady] = useState(false);

  // 论文状态
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [activeDraft, setActiveDraft] = useState<Draft | null>(null);
  const [draftLoading, setDraftLoading] = useState(false);
  const [draftError, setDraftError] = useState<string | null>(null);

  // 大纲
  const [outlineGenerating, setOutlineGenerating] = useState(false);
  const [outline, setOutline] = useState<DraftOutline | null>(null);

  // 章节生成状态
  const [activeChapter, setActiveChapter] = useState<string | null>(null);
  const [chapterGenerating, setChapterGenerating] = useState(false);
  const [chapterResult, setChapterResult] = useState<ChapterResult | null>(null);
  const [editingChapter, setEditingChapter] = useState<string | null>(null);
  const [editContent, setEditContent] = useState("");

  // 摘要
  const [abstractGenerating, setAbstractGenerating] = useState(false);
  const [abstract, setAbstract] = useState<AbstractResult | null>(null);

  // 答辩 PPT
  const [pptStyles, setPptStyles] = useState<PPTStyle[]>([]);
  const [pptStyleId, setPptStyleId] = useState("academic_blue");
  const [pptGenerating, setPptGenerating] = useState(false);
  const [pptResult, setPptResult] = useState<DefensePPTResponse | null>(null);
  const [defenseScript, setDefenseScript] = useState<DefenseScript | null>(null);
  const [scriptLoading, setScriptLoading] = useState(false);

  // 合规检查
  const [complianceResult, setComplianceResult] = useState<ComplianceResult | null>(null);
  const [complianceLoading, setComplianceLoading] = useState(false);
  const [complianceAiLoading, setComplianceAiLoading] = useState<Set<string>>(new Set());
  const [complianceExpanded, setComplianceExpanded] = useState<Set<string>>(new Set());

  // 通用
  const [error, setError] = useState<string | null>(null);
  const [downloadFormat, setDownloadFormat] = useState<"docx" | "pdf">("docx");

  // ---- 加载草稿列表 ----
  const loadDrafts = useCallback(async () => {
    try {
      const data = await api.listDrafts(projectId);
      setDrafts(data);
    } catch { /* 忽略 */ }
  }, [projectId]);

  useEffect(() => {
    loadDrafts();
  }, [loadDrafts]);

  // ---- 阶段 2: 论文写作 ----

  const handleCreateDraft = async () => {
    setDraftLoading(true);
    setDraftError(null);
    try {
      const draft = await api.createDraft({
        project_id: projectId,
        title: "毕业论文",
      });
      setActiveDraft(draft);
      setOutline(null);
      setChapterResult(null);
      await loadDrafts();
    } catch (e: unknown) {
      setDraftError(e instanceof Error ? e.message : "创建失败");
    } finally {
      setDraftLoading(false);
    }
  };

  const handleSelectDraft = async (draftId: string) => {
    setDraftLoading(true);
    setDraftError(null);
    try {
      const draft = await api.getDraft(draftId);
      setActiveDraft(draft);
      setOutline(draft.outline || null);
      setChapterResult(null);
    } catch (e: unknown) {
      setDraftError(e instanceof Error ? e.message : "加载失败");
    } finally {
      setDraftLoading(false);
    }
  };

  const handleGenerateOutline = async () => {
    if (!activeDraft) return;
    setOutlineGenerating(true);
    setDraftError(null);
    try {
      const result = await api.generateOutline(activeDraft.id);
      setOutline(result);
      // 刷新草稿以获取更新后的 outline
      const updated = await api.getDraft(activeDraft.id);
      setActiveDraft(updated);
    } catch (e: unknown) {
      setDraftError(e instanceof Error ? e.message : "大纲生成失败");
    } finally {
      setOutlineGenerating(false);
    }
  };

  const handleGenerateChapter = async (chapterKey: string) => {
    if (!activeDraft) return;
    setActiveChapter(chapterKey);
    setChapterGenerating(true);
    setChapterResult(null);
    setDraftError(null);
    try {
      const result = await api.generateChapter(activeDraft.id, chapterKey);
      setChapterResult(result);
      // 刷新草稿
      const updated = await api.getDraft(activeDraft.id);
      setActiveDraft(updated);
    } catch (e: unknown) {
      setDraftError(e instanceof Error ? e.message : "章节生成失败");
    } finally {
      setChapterGenerating(false);
      setActiveChapter(null);
    }
  };

  const handleGenerateAllChapters = async () => {
    if (!activeDraft) return;
    setDraftError(null);
    for (const key of CHAPTER_KEYS) {
      setActiveChapter(key);
      setChapterGenerating(true);
      try {
        const result = await api.generateChapter(activeDraft.id, key);
        setChapterResult(result);
        const updated = await api.getDraft(activeDraft.id);
        setActiveDraft(updated);
      } catch {
        setDraftError(`章节 ${CHAPTER_LABELS[key]} 生成失败，已跳过`);
      }
      setChapterGenerating(false);
      setActiveChapter(null);
    }
  };

  const handleEditChapter = (key: string, content: string) => {
    setEditingChapter(key);
    setEditContent(content);
  };

  const handleSaveEdit = async () => {
    if (!activeDraft || !editingChapter) return;
    try {
      const content = activeDraft.content || {};
      content[editingChapter] = {
        ...(content[editingChapter] || {}),
        content: editContent,
        status: "edited",
      };
      await api.updateDraft(activeDraft.id, { content });
      const updated = await api.getDraft(activeDraft.id);
      setActiveDraft(updated);
      setEditingChapter(null);
    } catch {
      setDraftError("保存失败");
    }
  };

  const handleGenerateAbstract = async () => {
    if (!activeDraft) return;
    setAbstractGenerating(true);
    try {
      const result = await api.generateAbstract(activeDraft.id);
      setAbstract(result);
    } catch {
      setDraftError("摘要生成失败");
    } finally {
      setAbstractGenerating(false);
    }
  };

  // ---- 阶段 3: 答辩 PPT ----

  useEffect(() => {
    if (step === 3) {
      api.listDefensePPTStyles().then(setPptStyles).catch(() => {});
    }
  }, [step]);

  const handleGenerateDefensePPT = async () => {
    if (!activeDraft) return;
    setPptGenerating(true);
    setError(null);
    try {
      const { task_id } = await api.generateDefensePPTAsync({
        draft_id: activeDraft.id,
        template: pptStyleId,
      });
      await new Promise<void>((resolve, reject) => {
        api.pollUntilDone(task_id, (status: TaskStatus) => {
          if (status.ready) {
            if (status.result) {
              setPptResult(status.result as unknown as DefensePPTResponse);
              resolve();
            } else {
              reject(new Error(status.error || "生成失败"));
            }
          }
        });
      });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "答辩 PPT 生成失败");
    } finally {
      setPptGenerating(false);
    }
  };

  const handleGenerateScript = async () => {
    if (!activeDraft) return;
    setScriptLoading(true);
    try {
      const result = await api.getDefenseScript(activeDraft.id);
      setDefenseScript(result);
    } catch {
      setError("演讲稿生成失败");
    } finally {
      setScriptLoading(false);
    }
  };

  // ---- 合规检查 ----

  const loadComplianceStatus = useCallback(async () => {
    if (!activeDraft) return;
    try {
      const status = await api.getComplianceStatus(activeDraft.id);
      if (status.checked) {
        setComplianceResult(status);
      }
    } catch { /* 忽略 */ }
  }, [activeDraft]);

  useEffect(() => {
    if (activeDraft) {
      loadComplianceStatus();
      setComplianceResult(null);
    }
  }, [activeDraft?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleCheckCompliance = async () => {
    if (!activeDraft) return;
    setComplianceLoading(true);
    try {
      const result = await api.checkCompliance(activeDraft.id, false);
      setComplianceResult(result);
    } catch (e: unknown) {
      setDraftError(e instanceof Error ? e.message : "合规检查失败");
    } finally {
      setComplianceLoading(false);
    }
  };

  const handleDownloadDraft = async () => {
    if (!activeDraft) return;
    try {
      await api.downloadWithAuth(
        api.getDraftDownloadUrl(activeDraft.id, downloadFormat),
        `${activeDraft.title || "draft"}.${downloadFormat}`,
      );
    } catch {
      setError("导出失败");
    }
  };

  const handleDownloadDefensePPT = async () => {
    if (!pptResult?.download_url) return;
    try {
      await api.downloadWithAuth(pptResult.download_url, pptResult.filename || "defense.pptx");
    } catch {
      setError("PPT 下载失败");
    }
  };

  const handleAiDeepCheck = async (chapterKey: string) => {
    if (!activeDraft) return;
    setComplianceAiLoading((prev) => new Set(prev).add(chapterKey));
    try {
      const result = await api.checkCompliance(activeDraft.id, true);
      setComplianceResult(result);
    } catch (e: unknown) {
      setDraftError(e instanceof Error ? e.message : "AI 深度检查失败");
    } finally {
      setComplianceAiLoading((prev) => {
        const next = new Set(prev);
        next.delete(chapterKey);
        return next;
      });
    }
  };

  const handleConfirmIssue = async (chapterKey: string, issueIndex: number, action: "accept" | "ignore" | "fixed") => {
    if (!activeDraft) return;
    try {
      await api.confirmComplianceIssue(activeDraft.id, chapterKey, issueIndex, action);
      // 更新本地状态
      if (complianceResult) {
        const updated = { ...complianceResult, chapters: { ...complianceResult.chapters } };
        const chapter = { ...updated.chapters[chapterKey] };
        const issues = [...chapter.issues];
        issues[issueIndex] = { ...issues[issueIndex], user_action: action, confirmed_at: new Date().toISOString() };
        chapter.issues = issues;
        chapter.confirmed = !issues.some(
          (i) => i.severity === "error" && i.user_action !== "accept"
        );
        updated.chapters = { ...updated.chapters, [chapterKey]: chapter };
        setComplianceResult(updated);
      }
    } catch (e: unknown) {
      setDraftError(e instanceof Error ? e.message : "确认失败");
    }
  };

  const toggleComplianceExpand = (chapterKey: string) => {
    setComplianceExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(chapterKey)) next.delete(chapterKey);
      else next.add(chapterKey);
      return next;
    });
  };

  // ---- 渲染 ----

  return (
    <div className="max-w-5xl mx-auto">
      {/* 顶部导航 */}
      <div className="flex items-center justify-between mb-6">
        {onBack && (
          <button onClick={onBack} className="text-sm text-gray-500 hover:text-gray-700">
            ← 返回项目
          </button>
        )}
        <h2 className="text-xl font-bold text-gray-800">论文工作流</h2>
        <div className="w-16" />
      </div>

      <WorkflowStepIndicator currentStep={step} onStepClick={setStep} />

      {/* ========== 阶段 1：成果管理 ========== */}
      {step === 1 && (
        <div>
          <div className="mb-4 flex items-center justify-between">
            <p className="text-gray-600 text-sm">上传和管理项目成果，为论文写作提供真实数据基础。</p>
            <button
              onClick={() => setStep(2)}
              className="px-5 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700"
            >
              进入论文写作 →
            </button>
          </div>
          <OutcomeManager projectId={projectId} onReadyChange={setOutcomesReady} />
        </div>
      )}

      {/* ========== 阶段 2：论文写作 ========== */}
      {step === 2 && (
        <div className="overflow-hidden rounded-2xl border border-[#ddd4c4] bg-[#ede8da] shadow-sm">
          {draftError && (
            <div className="border-b border-red-200 bg-red-50 px-5 py-3 text-sm text-red-700">
              {draftError}
              <button className="ml-3 underline" onClick={() => setDraftError(null)}>关闭</button>
            </div>
          )}

          <StageWrapper isLoading={draftLoading} error={null} loadingMessage="加载草稿...">
            <div className="flex min-h-[760px]">
              <aside className="flex w-[260px] shrink-0 flex-col border-r border-[#ddd4c4] bg-[#f7f4ec]">
                <div className="border-b border-[#ddd4c4] px-5 py-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="text-lg font-semibold text-[#1a1612]" style={{ fontFamily: "var(--font-cormorant), serif" }}>
                        论文写作
                      </h3>
                      <p className="mt-1 text-[11px] leading-5 text-[#9e9282]">
                        基于真实项目成果和文献依据生成论文草稿
                      </p>
                    </div>
                    <button
                      onClick={handleCreateDraft}
                      disabled={draftLoading}
                      className="rounded-lg border border-[#ddd4c4] bg-[#ede8da] px-2 py-1 text-[11px] text-[#5c5242] disabled:opacity-50"
                    >
                      新建
                    </button>
                  </div>

                  {activeDraft && (
                    <div className="mt-4">
                      <div className="mb-1.5 flex items-center justify-between text-[11px] text-[#5c5242]">
                        <span>完成进度</span>
                        <span>{Math.round((activeDraft.sections.filter((s) => s.status !== "draft").length / CHAPTER_KEYS.length) * 100)}%</span>
                      </div>
                      <div className="h-[3px] overflow-hidden rounded-full bg-[#ddd8c8]">
                        <div
                          className="h-full rounded-full bg-[#1b2d1b]"
                          style={{ width: `${(activeDraft.sections.filter((s) => s.status !== "draft").length / CHAPTER_KEYS.length) * 100}%` }}
                        />
                      </div>
                    </div>
                  )}
                </div>

                <div className="border-b border-[#ddd4c4] px-4 py-3">
                  <div className="mb-2 text-[10px] uppercase tracking-[0.08em] text-[#9e9282]">论文草稿</div>
                  {drafts.length === 0 ? (
                    <p className="rounded-lg border border-dashed border-[#ddd4c4] px-3 py-4 text-center text-xs text-[#9e9282]">
                      暂无草稿
                    </p>
                  ) : (
                    <div className="max-h-36 space-y-1 overflow-y-auto" style={{ scrollbarWidth: "none" }}>
                      {drafts.map((d) => (
                        <button
                          key={d.id}
                          onClick={() => handleSelectDraft(d.id)}
                          className="w-full rounded-lg px-3 py-2 text-left text-xs transition-colors"
                          style={{
                            background: activeDraft?.id === d.id ? "rgba(27,45,27,0.08)" : "transparent",
                            color: activeDraft?.id === d.id ? "#1b2d1b" : "#5c5242",
                          }}
                        >
                          <div className="truncate font-medium">{d.title}</div>
                          <div className="mt-0.5 text-[10.5px] text-[#9e9282]">v{d.version} · {d.sections.filter((s) => s.status !== "draft").length}/6 章</div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <div className="flex-1 overflow-y-auto py-3" style={{ scrollbarWidth: "none" }}>
                  <div className="mb-2 flex items-center justify-between px-4">
                    <span className="text-[10px] uppercase tracking-[0.08em] text-[#9e9282]">章节结构</span>
                    {activeDraft && (
                      <button
                        onClick={handleGenerateOutline}
                        disabled={outlineGenerating}
                        className="text-[11px] text-[#822828] disabled:opacity-50"
                      >
                        {outlineGenerating ? "生成中..." : outline ? "重生大纲" : "AI 大纲"}
                      </button>
                    )}
                  </div>

                  {activeDraft ? (
                    <div>
                      {CHAPTER_KEYS.map((key) => {
                        const section = activeDraft.sections.find((s) => s.key === key);
                        const selectedKey = editingChapter || chapterResult?.chapter_key || CHAPTER_KEYS[0];
                        const selected = selectedKey === key;
                        const dataBased = activeDraft.content?.[key]?.data_based;
                        return (
                          <button
                            key={key}
                            type="button"
                            onClick={() => {
                              setEditingChapter(null);
                              setChapterResult({
                                chapter_key: key,
                                title: CHAPTER_LABELS[key],
                                content: section?.content || "",
                                status: section?.status || "draft",
                                citations: [],
                                data_based: Boolean(dataBased),
                              });
                            }}
                            className="flex w-full items-center gap-2 px-4 py-2 text-left transition-colors"
                            style={{
                              background: selected ? "#ede8da" : "transparent",
                              borderLeft: `2px solid ${selected ? "#1b2d1b" : "transparent"}`,
                            }}
                          >
                            <span
                              className="h-1.5 w-1.5 shrink-0 rounded-full"
                              style={{ background: section?.status !== "draft" ? "#1b2d1b" : "#9e9282" }}
                            />
                            <span className="min-w-0 flex-1 truncate text-[12.5px]" style={{ color: selected ? "#1a1612" : "#5c5242" }}>
                              {CHAPTER_LABELS[key]}
                            </span>
                            {dataBased && <span className="text-[10px] text-[#2e6b5b]">据</span>}
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="px-4 py-5 text-center text-xs text-[#9e9282]">请先创建或选择草稿</p>
                  )}
                </div>
              </aside>

              <main className="flex min-w-0 flex-1 flex-col">
                {!activeDraft ? (
                  <div className="flex flex-1 items-center justify-center px-8 text-center text-[#9e9282]">
                    <div>
                      <div className="mb-4 text-5xl opacity-30" style={{ fontFamily: "var(--font-cormorant), serif" }}>§</div>
                      <p className="text-sm">请先创建或选择一篇论文草稿</p>
                    </div>
                  </div>
                ) : (() => {
                  const selectedKey = editingChapter || chapterResult?.chapter_key || CHAPTER_KEYS[0];
                  const selectedSection = activeDraft.sections.find((s) => s.key === selectedKey);
                  const selectedContent = editingChapter === selectedKey ? editContent : selectedSection?.content || "";
                  const selectedTitle = CHAPTER_LABELS[selectedKey] || chapterResult?.title || "章节";
                  const selectedCompliance = complianceResult?.chapters?.[selectedKey];
                  const selectedIssues = selectedCompliance?.issues || [];
                  const unconfirmedCount = selectedIssues.filter((i) => !i.user_action && i.severity !== "info").length;
                  const aiRunning = complianceAiLoading.has(selectedKey);

                  return (
                    <>
                      <div className="flex h-12 shrink-0 items-center justify-between border-b border-[#ddd4c4] bg-[#f7f4ec] px-5">
                        <div className="flex min-w-0 items-center gap-2 text-xs text-[#5c5242]">
                          <span className="truncate">{activeDraft.title}</span>
                          <span>›</span>
                          <span className="font-medium text-[#1a1612]">{selectedTitle}</span>
                          {selectedSection?.status && selectedSection.status !== "draft" && (
                            <span className="rounded bg-[rgba(27,45,27,0.08)] px-1.5 py-0.5 text-[10px] text-[#1b2d1b]">
                              {selectedSection.status === "generated" ? "AI 生成" : selectedSection.status === "edited" ? "已编辑" : "定稿"}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handleGenerateChapter(selectedKey)}
                            disabled={chapterGenerating && activeChapter === selectedKey}
                            className="rounded-lg bg-[#ddd8c8] px-3 py-1.5 text-xs text-[#1a1612] disabled:opacity-50"
                          >
                            {chapterGenerating && activeChapter === selectedKey ? "生成中..." : selectedSection?.content ? "改写" : "AI 生成"}
                          </button>
                          {selectedSection?.content && editingChapter !== selectedKey && (
                            <button
                              onClick={() => handleEditChapter(selectedKey, selectedSection.content)}
                              className="rounded-lg bg-[#1b2d1b] px-3 py-1.5 text-xs text-[#ede8da]"
                            >
                              编辑
                            </button>
                          )}
                          <button
                            onClick={handleGenerateAllChapters}
                            disabled={chapterGenerating}
                            className="rounded-lg bg-[#822828] px-3 py-1.5 text-xs text-[#f7f4ec] disabled:opacity-50"
                          >
                            续写全部
                          </button>
                        </div>
                      </div>

                      <div className="flex-1 overflow-y-auto px-14 py-10" style={{ scrollbarWidth: "none" }}>
                        <div className="mx-auto max-w-[720px]">
                          <div className="mb-6 flex items-center justify-between">
                            <h1 className="text-[22px] font-semibold text-[#1a1612]" style={{ fontFamily: "var(--font-cormorant), serif" }}>
                              {selectedTitle}
                            </h1>
                            <span className="text-[11px] text-[#9e9282]" style={{ fontFamily: "monospace" }}>
                              {selectedContent.replace(/\s+/g, "").length} 字
                            </span>
                          </div>
                          <div className="mb-6 h-px bg-[#ddd4c4]" />

                          {editingChapter === selectedKey ? (
                            <div>
                              <textarea
                                value={editContent}
                                onChange={(e) => setEditContent(e.target.value)}
                                className="min-h-[480px] w-full resize-none bg-transparent text-[15px] leading-9 text-[#1a1612] outline-none"
                              />
                              <div className="mt-4 flex gap-2">
                                <button
                                  onClick={handleSaveEdit}
                                  className="rounded-xl bg-[#1b2d1b] px-5 py-2.5 text-sm text-[#ede8da]"
                                >
                                  保存
                                </button>
                                <button
                                  onClick={() => setEditingChapter(null)}
                                  className="rounded-xl bg-[#ddd8c8] px-5 py-2.5 text-sm text-[#5c5242]"
                                >
                                  取消
                                </button>
                              </div>
                            </div>
                          ) : selectedContent ? (
                            <div className="whitespace-pre-wrap text-[15px] leading-9 text-[#1a1612]">
                              {selectedContent}
                            </div>
                          ) : (
                            <div className="rounded-2xl border border-dashed border-[#cfc5b4] px-8 py-16 text-center">
                              <p className="text-sm text-[#9e9282]">本章暂无内容</p>
                              <button
                                onClick={() => handleGenerateChapter(selectedKey)}
                                disabled={chapterGenerating && activeChapter === selectedKey}
                                className="mt-4 rounded-xl bg-[#1b2d1b] px-5 py-2.5 text-sm text-[#ede8da] disabled:opacity-50"
                              >
                                {chapterGenerating && activeChapter === selectedKey ? "生成中..." : "AI 生成本章"}
                              </button>
                            </div>
                          )}
                        </div>
                      </div>

                      <aside className="flex w-[228px] shrink-0 flex-col border-l border-[#ddd4c4] bg-[#f7f4ec]">
                        <div className="flex gap-1 border-b border-[#ddd4c4] p-3">
                          <button className="flex-1 rounded-lg border border-[#ddd4c4] bg-[#ede8da] py-1.5 text-center text-xs font-medium text-[#1a1612]">
                            建议
                          </button>
                          <button
                            onClick={handleDownloadDraft}
                            className="rounded-lg bg-[#ddd8c8] px-3 py-1.5 text-xs text-[#5c5242]"
                          >
                            导出
                          </button>
                        </div>

                        <div className="flex-1 overflow-y-auto px-3 py-3" style={{ scrollbarWidth: "none" }}>
                          <div className="mb-3 flex items-center gap-2">
                            <select
                              value={downloadFormat}
                              onChange={(e) => setDownloadFormat(e.target.value as "docx" | "pdf")}
                              className="h-8 flex-1 rounded-lg border border-[#ddd4c4] bg-[#ede8da] px-2 text-xs text-[#5c5242]"
                            >
                              <option value="docx">DOCX</option>
                              <option value="pdf">PDF</option>
                            </select>
                          </div>

                          <WritingSidePanel title="AI 写作建议">
                            <SuggestionCard text="补充与本章相关的真实项目成果和实验数据引用。" />
                            <SuggestionCard text="检查本章结论是否已经被文献或成果材料支撑。" />
                            <SuggestionCard text="避免生成未验证的统计值、实验结果或引用条目。" />
                          </WritingSidePanel>

                          <WritingSidePanel title="生成与检查">
                            <button
                              onClick={handleGenerateAbstract}
                              disabled={abstractGenerating}
                              className="mb-2 w-full rounded-lg bg-[#ddd8c8] px-3 py-2 text-left text-xs text-[#1a1612] disabled:opacity-50"
                            >
                              {abstractGenerating ? "摘要生成中..." : "生成摘要"}
                            </button>
                            <button
                              onClick={handleCheckCompliance}
                              disabled={complianceLoading}
                              className="w-full rounded-lg border border-[rgba(130,40,40,0.2)] bg-[rgba(130,40,40,0.08)] px-3 py-2 text-left text-xs text-[#822828] disabled:opacity-50"
                            >
                              {complianceLoading ? "合规检查中..." : "合规检查"}
                            </button>
                          </WritingSidePanel>

                          {abstract && (
                            <WritingSidePanel title="摘要">
                              <p className="text-[11.5px] leading-5 text-[#5c5242]">{abstract.abstract_cn}</p>
                              <p className="mt-2 text-[10.5px] text-[#9e9282]">关键词：{abstract.keywords_cn.join("；")}</p>
                            </WritingSidePanel>
                          )}

                          {complianceResult && (
                            <WritingSidePanel title="合规概览">
                              <div className="mb-2 text-[20px] font-semibold text-[#1a1612]" style={{ fontFamily: "monospace" }}>
                                {complianceResult.overall_score}
                              </div>
                              <p className="text-[11.5px] leading-5 text-[#5c5242]">
                                {complianceResult.passed ? "合规检查通过" : "存在合规问题，请逐条确认。"}
                              </p>
                            </WritingSidePanel>
                          )}

                          <WritingSidePanel title="当前章节问题">
                            {selectedCompliance ? (
                              <div>
                                <button
                                  onClick={() => toggleComplianceExpand(selectedKey)}
                                  className="mb-2 flex w-full items-center gap-2 text-left text-[11.5px] text-[#5c5242]"
                                >
                                  <span className={`h-2 w-2 rounded-full ${selectedCompliance.passed ? "bg-green-500" : unconfirmedCount > 0 ? "bg-red-500" : "bg-yellow-500"}`} />
                                  {selectedCompliance.passed ? "合规通过" : `${selectedIssues.length} 个问题`}
                                  <span className="ml-auto text-[#9e9282]">{complianceExpanded.has(selectedKey) ? "收起" : "展开"}</span>
                                </button>

                                {complianceExpanded.has(selectedKey) && (
                                  <div className="space-y-2">
                                    {selectedIssues.map((issue, idx) => (
                                      <ComplianceIssueCard
                                        key={`${issue.location}-${idx}`}
                                        issue={issue}
                                        onAccept={() => handleConfirmIssue(selectedKey, idx, "accept")}
                                        onIgnore={() => handleConfirmIssue(selectedKey, idx, "ignore")}
                                        onFix={() => {
                                          if (selectedSection?.content) handleEditChapter(selectedKey, selectedSection.content);
                                        }}
                                      />
                                    ))}
                                    {selectedIssues.length === 0 && <p className="text-xs text-[#9e9282]">未发现问题</p>}
                                  </div>
                                )}
                                <button
                                  onClick={() => handleAiDeepCheck(selectedKey)}
                                  disabled={aiRunning}
                                  className="mt-2 text-[11px] text-[#822828] disabled:opacity-50"
                                >
                                  {aiRunning ? "AI 深度检查中..." : "AI 深度检查"}
                                </button>
                              </div>
                            ) : (
                              <p className="text-[11.5px] leading-5 text-[#9e9282]">暂未对本章执行合规检查。</p>
                            )}
                          </WritingSidePanel>
                        </div>
                      </aside>
                    </>
                  );
                })()}
              </main>
            </div>
          </StageWrapper>
        </div>
      )}

      {/* ========== 阶段 3：答辩 PPT ========== */}
      {step === 3 && (
        <div className="space-y-6">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
              {error}
              <button className="ml-3 underline" onClick={() => setError(null)}>关闭</button>
            </div>
          )}

          {/* 前提检查 */}
          {!activeDraft ? (
            <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-6 text-center">
              <p className="text-yellow-800 mb-3">请先在"论文写作"阶段完成论文草稿。</p>
              <button onClick={() => setStep(2)} className="px-5 py-2 bg-yellow-600 text-white rounded-lg text-sm">
                返回论文写作
              </button>
            </div>
          ) : (
            <>
              {/* 风格选择 */}
              <div className="bg-white border border-gray-200 rounded-xl p-5">
                <h3 className="font-semibold text-gray-800 mb-4">选择 PPT 风格</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {(pptStyles.length > 0 ? pptStyles : [
                    { id: "academic_blue", name: "学术蓝", description: "稳重正式", scene: "默认推荐", is_default: true },
                    { id: "minimal_gray", name: "极简灰", description: "留白更多", scene: "论文型汇报", is_default: false },
                    { id: "tech_dark", name: "科技深色", description: "深底高对比", scene: "技术展示", is_default: false },
                    { id: "vibrant_orange_green", name: "活力橙绿", description: "配色鲜明", scene: "应用导向", is_default: false },
                  ] as PPTStyle[]).map((s) => (
                    <button
                      key={s.id}
                      onClick={() => setPptStyleId(s.id)}
                      className={`border-2 rounded-xl p-3 text-left transition-colors ${
                        pptStyleId === s.id ? "border-blue-500 bg-blue-50" : "border-gray-200 hover:border-gray-300"
                      }`}
                    >
                      <div className="font-medium text-sm text-gray-800">{s.name}</div>
                      <div className="text-xs text-gray-500 mt-1">{s.description}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* 生成 */}
              <div className="flex gap-3 flex-wrap">
                <button
                  onClick={handleGenerateDefensePPT}
                  disabled={pptGenerating}
                  className="px-6 py-3 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700 disabled:opacity-50"
                >
                  {pptGenerating ? "正在生成答辩 PPT..." : "生成答辩 PPT"}
                </button>
                <button
                  onClick={handleGenerateScript}
                  disabled={scriptLoading}
                  className="px-6 py-3 bg-gray-100 text-gray-700 rounded-xl font-medium hover:bg-gray-200 disabled:opacity-50"
                >
                  {scriptLoading ? "生成中..." : "生成演讲稿"}
                </button>
              </div>

              {/* PPT 结果 */}
              {pptResult && (
                <div className="bg-green-50 border border-green-200 rounded-xl p-5">
                  <h3 className="font-semibold text-green-900 mb-3">答辩 PPT 已生成</h3>
                  <div className="space-y-2 text-sm text-green-800">
                    <p>风格：{pptResult.style_name} · 共 {pptResult.slide_count} 页</p>
                    {!pptResult.has_real_data && (
                      <p className="text-yellow-700">提示：论文暂无真实实验数据，实验页将展示设计方案和预期结果。</p>
                    )}
                  </div>
                  {pptResult.download_url && (
                    <button
                      onClick={handleDownloadDefensePPT}
                      className="inline-block mt-3 px-5 py-2 bg-green-600 text-white rounded-lg text-sm hover:bg-green-700"
                    >
                      下载 PPTX
                    </button>
                  )}
                </div>
              )}

              {/* 演讲稿 */}
              {defenseScript && (
                <div className="bg-white border border-gray-200 rounded-xl p-5">
                  <h3 className="font-semibold text-gray-800 mb-3">
                    答辩演讲稿（约 {defenseScript.total_duration_minutes} 分钟）
                  </h3>
                  <div className="space-y-3 max-h-96 overflow-y-auto">
                    {defenseScript.slides.map((s) => (
                      <div key={s.page} className="border-b border-gray-100 pb-2">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs font-medium text-gray-500">
                            第 {s.page} 页 — {s.title}
                          </span>
                          <span className="text-xs text-gray-400">{s.duration_seconds}秒</span>
                        </div>
                        <p className="text-sm text-gray-700">{s.notes}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* 底部导航 */}
      <div className="flex justify-between mt-8 pt-6 border-t border-gray-200">
        <button
          onClick={() => setStep(Math.max(1, step - 1))}
          disabled={step === 1}
          className="px-5 py-2 bg-gray-100 text-gray-600 rounded-lg text-sm hover:bg-gray-200 disabled:opacity-50"
        >
          ← 上一步
        </button>
        <button
          onClick={() => setStep(Math.min(3, step + 1))}
          disabled={step === 3}
          className="px-5 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50"
        >
          下一步 →
        </button>
      </div>
    </div>
  );
}

function WritingSidePanel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-4">
      <div className="mb-2 text-[11.5px] font-medium text-[#1a1612]">{title}</div>
      <div className="rounded-xl border border-[#ddd4c4] bg-[#ede8da] p-3">
        {children}
      </div>
    </section>
  );
}

function SuggestionCard({ text }: { text: string }) {
  return (
    <div className="mb-2 rounded-lg border border-[#ddd4c4] bg-[#f7f4ec] px-3 py-2 last:mb-0">
      <p className="text-[11.5px] leading-5 text-[#3a3020]">{text}</p>
    </div>
  );
}

function ComplianceIssueCard({
  issue,
  onAccept,
  onIgnore,
  onFix,
}: {
  issue: ComplianceIssue;
  onAccept: () => void;
  onIgnore: () => void;
  onFix: () => void;
}) {
  const tone =
    issue.severity === "error"
      ? "border-red-200 bg-red-50 text-red-700"
      : issue.severity === "warning"
        ? "border-yellow-200 bg-yellow-50 text-yellow-700"
        : "border-blue-200 bg-blue-50 text-blue-700";

  return (
    <div className={`rounded-lg border px-2.5 py-2 text-[11px] ${tone}`}>
      <div className="mb-1 flex items-center gap-1.5">
        <span className="rounded bg-white/70 px-1 py-0.5 text-[10px]">
          {issue.severity === "error" ? "严重" : issue.severity === "warning" ? "注意" : "提示"}
        </span>
        <span className="truncate opacity-80">{issue.location}</span>
      </div>
      <p className="leading-5">{issue.description}</p>
      {issue.snippet && <p className="mt-1 truncate opacity-70">"{issue.snippet}"</p>}
      {issue.suggestion && <p className="mt-1 leading-5 opacity-80">建议：{issue.suggestion}</p>}
      {!issue.user_action ? (
        <div className="mt-2 flex flex-wrap gap-1.5">
          <button onClick={onAccept} className="rounded bg-white/70 px-2 py-0.5 text-[10px]">确认</button>
          <button onClick={onIgnore} className="rounded bg-white/70 px-2 py-0.5 text-[10px]">忽略</button>
          <button onClick={onFix} className="rounded bg-white/70 px-2 py-0.5 text-[10px]">修改</button>
        </div>
      ) : (
        <div className="mt-2 text-[10px] opacity-70">
          已处理：{issue.user_action === "accept" ? "确认通过" : issue.user_action === "ignore" ? "忽略" : "已修改"}
        </div>
      )}
    </div>
  );
}
