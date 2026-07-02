"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";

import * as api from "../lib/api";
import type {
  AbstractResult,
  ChapterResult,
  ComplianceIssue,
  ComplianceResult,
  Draft,
  DraftOutline,
} from "../lib/types";
import OutcomeManager from "./OutcomeManager";
import StageWrapper from "./StageWrapper";
import {
  buildEditedChapterPayload,
  getDraftChapterRecord,
  getDraftCompletionSummary,
} from "@/lib/draftKnowledge";
import { normalizeWritingPlan } from "@/lib/writingPlan.mjs";
import { normalizeWritingReview } from "@/lib/writingReview.mjs";
import { normalizeWritingRevision } from "@/lib/writingRevision.mjs";
import { buildRevisionStatus } from "@/lib/writingRevisionStatus.mjs";
import { buildRevisionCompare } from "@/lib/writingRevisionCompare.mjs";

const CHAPTER_KEYS = [
  "chapter_1_introduction",
  "chapter_2_theory",
  "chapter_3_design",
  "chapter_4_implementation",
  "chapter_5_experiment",
  "chapter_6_conclusion",
] as const;

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

type RevisionStatusView = {
  resolvedIssues: { severity: string; title: string; detail: string }[];
  remainingIssues: { severity: string; title: string; detail: string }[];
  resolvedCount: number;
  remainingCount: number;
  nextAction: string;
};

function WorkflowStepIndicator({
  currentStep,
  onStepClick,
}: {
  currentStep: number;
  onStepClick: (step: number) => void;
}) {
  return (
    <div className="mb-8 flex items-center justify-center gap-2">
      {[1, 2].map((step) => (
        <React.Fragment key={step}>
          <button
            onClick={() => onStepClick(step)}
            className={`flex h-8 w-8 items-center justify-center rounded-full border-2 text-sm font-medium transition-colors ${
              step === currentStep
                ? "border-blue-600 bg-blue-600 text-white"
                : step < currentStep
                  ? "border-green-500 bg-green-50 text-green-700"
                  : "border-gray-300 bg-white text-gray-400"
            }`}
          >
            {step < currentStep ? "✓" : step}
          </button>
          {step < 2 && <div className="h-0.5 w-12 bg-gray-200" />}
        </React.Fragment>
      ))}
      <span className="ml-3 text-sm text-gray-500">{currentStep === 1 ? "成果管理" : "论文写作"}</span>
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
      <div className="mb-2 text-[11.5px] font-medium text-[#1a1612]">{title}</div>
      <div className="rounded-xl border border-[#ddd4c4] bg-[#ede8da] p-3">{children}</div>
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

function ChapterBadge({ severity }: { severity: string }) {
  const tone =
    severity === "warning"
      ? "bg-[rgba(130,40,40,0.08)] text-[#822828]"
      : severity === "error"
        ? "bg-red-100 text-red-700"
        : "bg-[#ede8da] text-[#5c5242]";

  return <span className={`rounded px-1.5 py-0.5 text-[10px] ${tone}`}>{severity}</span>;
}

interface Props {
  projectId: string;
  onBack?: () => void;
}

export default function PaperWorkflow({ projectId, onBack }: Props) {
  const [step, setStep] = useState(1);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [activeDraft, setActiveDraft] = useState<Draft | null>(null);
  const [selectedChapterKey, setSelectedChapterKey] = useState<string>(CHAPTER_KEYS[0]);

  const [draftLoading, setDraftLoading] = useState(false);
  const [draftError, setDraftError] = useState<string | null>(null);

  const [outline, setOutline] = useState<DraftOutline | null>(null);
  const [writingPlan, setWritingPlan] = useState<WritingPlanView | null>(null);
  const [chapterReview, setChapterReview] = useState<WritingReviewView | null>(null);
  const [chapterRevision, setChapterRevision] = useState<WritingRevisionView | null>(null);
  const [revisionBaselineContent, setRevisionBaselineContent] = useState("");
  const [chapterResult, setChapterResult] = useState<ChapterResult | null>(null);
  const [abstract, setAbstract] = useState<AbstractResult | null>(null);
  const [complianceResult, setComplianceResult] = useState<ComplianceResult | null>(null);

  const [outlineGenerating, setOutlineGenerating] = useState(false);
  const [writingPlanGenerating, setWritingPlanGenerating] = useState(false);
  const [chapterGenerating, setChapterGenerating] = useState(false);
  const [reviewLoading, setReviewLoading] = useState(false);
  const [revisionLoading, setRevisionLoading] = useState(false);
  const [abstractGenerating, setAbstractGenerating] = useState(false);
  const [complianceLoading, setComplianceLoading] = useState(false);

  const [editingChapter, setEditingChapter] = useState<string | null>(null);
  const [editContent, setEditContent] = useState("");
  const [downloadFormat, setDownloadFormat] = useState<"docx" | "pdf">("docx");

  const loadDrafts = useCallback(async () => {
    try {
      const data = await api.listDrafts(projectId);
      setDrafts(data);
    } catch {
      // noop
    }
  }, [projectId]);

  useEffect(() => {
    void loadDrafts();
  }, [loadDrafts]);

  const hydrateDraftArtifacts = useCallback((draft: Draft) => {
    setActiveDraft(draft);
    setOutline(draft.outline || null);
    setWritingPlan(normalizeWritingPlan((draft.content || {})._writing_plan) as WritingPlanView | null);
    setChapterReview(null);
    setChapterRevision(null);
    setRevisionBaselineContent("");
    setChapterResult(null);
    setAbstract(null);
    setComplianceResult(null);
  }, []);

  const handleCreateDraft = async () => {
    setDraftLoading(true);
    setDraftError(null);
    try {
      const draft = await api.createDraft({ project_id: projectId, title: "毕业论文" });
      hydrateDraftArtifacts(draft);
      setSelectedChapterKey(CHAPTER_KEYS[0]);
      await loadDrafts();
    } catch (error: unknown) {
      setDraftError(error instanceof Error ? error.message : "创建草稿失败");
    } finally {
      setDraftLoading(false);
    }
  };

  const handleSelectDraft = async (draftId: string) => {
    setDraftLoading(true);
    setDraftError(null);
    try {
      const draft = await api.getDraft(draftId);
      hydrateDraftArtifacts(draft);
      setSelectedChapterKey(CHAPTER_KEYS[0]);
    } catch (error: unknown) {
      setDraftError(error instanceof Error ? error.message : "加载草稿失败");
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
      const updated = await api.getDraft(activeDraft.id);
      setActiveDraft(updated);
    } catch (error: unknown) {
      setDraftError(error instanceof Error ? error.message : "大纲生成失败");
    } finally {
      setOutlineGenerating(false);
    }
  };

  const handleGenerateWritingPlan = async () => {
    if (!activeDraft) return;
    setWritingPlanGenerating(true);
    setDraftError(null);
    try {
      const result = await api.generateWritingPlan(activeDraft.id);
      setWritingPlan(normalizeWritingPlan(result) as WritingPlanView | null);
      const updated = await api.getDraft(activeDraft.id);
      setActiveDraft(updated);
    } catch (error: unknown) {
      setDraftError(error instanceof Error ? error.message : "写作计划生成失败");
    } finally {
      setWritingPlanGenerating(false);
    }
  };

  const handleGenerateChapter = async (chapterKey: string) => {
    if (!activeDraft) return;
    setChapterGenerating(true);
    setDraftError(null);
    try {
      const result = await api.generateChapter(activeDraft.id, chapterKey);
      setChapterResult(result);
      setChapterReview(null);
      setChapterRevision(null);
      setRevisionBaselineContent("");
      const updated = await api.getDraft(activeDraft.id);
      setActiveDraft(updated);
      setSelectedChapterKey(chapterKey);
    } catch (error: unknown) {
      setDraftError(error instanceof Error ? error.message : "章节生成失败");
    } finally {
      setChapterGenerating(false);
    }
  };

  const handleGenerateAbstract = async () => {
    if (!activeDraft) return;
    setAbstractGenerating(true);
    setDraftError(null);
    try {
      const result = await api.generateAbstract(activeDraft.id);
      setAbstract(result);
    } catch (error: unknown) {
      setDraftError(error instanceof Error ? error.message : "摘要生成失败");
    } finally {
      setAbstractGenerating(false);
    }
  };

  const handleReviewChapter = async () => {
    if (!activeDraft) return;
    setReviewLoading(true);
    setDraftError(null);
    try {
      const result = await api.reviewChapter(activeDraft.id, selectedChapterKey);
      setChapterReview(normalizeWritingReview(result) as WritingReviewView | null);
      setChapterRevision(null);
      const updated = await api.getDraft(activeDraft.id);
      setActiveDraft(updated);
    } catch (error: unknown) {
      setDraftError(error instanceof Error ? error.message : "章节审查失败");
    } finally {
      setReviewLoading(false);
    }
  };

  const handleReviseChapter = async () => {
    if (!activeDraft) return;
    setRevisionLoading(true);
    setDraftError(null);
    try {
      setRevisionBaselineContent(selectedContent);
      const result = await api.reviseChapter(activeDraft.id, selectedChapterKey);
      setChapterRevision(normalizeWritingRevision(result) as WritingRevisionView | null);
      setChapterResult({
        chapter_key: result.chapter_key,
        title: result.title,
        content: result.content,
        status: "edited",
        citations: result.citations,
        data_based: result.data_based,
      });
      const updated = await api.getDraft(activeDraft.id);
      setActiveDraft(updated);
    } catch (error: unknown) {
      setDraftError(error instanceof Error ? error.message : "章节修订失败");
    } finally {
      setRevisionLoading(false);
    }
  };

  const handleSaveEdit = async () => {
    if (!activeDraft || !editingChapter) return;
    setDraftError(null);
    try {
      const content = { ...(activeDraft.content || {}) };
      const previous = getDraftChapterRecord(activeDraft, editingChapter) || undefined;
      content[editingChapter] = buildEditedChapterPayload(
        previous,
        previous?.title || CHAPTER_LABELS[editingChapter],
        editContent,
      );
      const updated = await api.updateDraft(activeDraft.id, { content });
      setActiveDraft(updated);
      setEditingChapter(null);
    } catch (error: unknown) {
      setDraftError(error instanceof Error ? error.message : "保存失败");
    }
  };

  const handleCheckCompliance = async () => {
    if (!activeDraft) return;
    setComplianceLoading(true);
    setDraftError(null);
    try {
      const result = await api.checkCompliance(activeDraft.id, false);
      setComplianceResult(result);
    } catch (error: unknown) {
      setDraftError(error instanceof Error ? error.message : "合规检查失败");
    } finally {
      setComplianceLoading(false);
    }
  };

  const handleComplianceAction = async (issueIndex: number, action: "accept" | "ignore" | "fixed") => {
    if (!activeDraft || !selectedCompliance) return;
    try {
      await api.confirmComplianceIssue(activeDraft.id, selectedChapterKey, issueIndex, action);
      const status = await api.getComplianceStatus(activeDraft.id);
      if (status.checked) setComplianceResult(status);
    } catch (error: unknown) {
      setDraftError(error instanceof Error ? error.message : "合规确认失败");
    }
  };

  const handleDownloadDraft = async () => {
    if (!activeDraft) return;
    try {
      await api.downloadWithAuth(
        api.getDraftDownloadUrl(activeDraft.id, downloadFormat),
        `${activeDraft.title || "draft"}.${downloadFormat}`,
      );
    } catch (error: unknown) {
      setDraftError(error instanceof Error ? error.message : "导出失败");
    }
  };

  const activeSummary = getDraftCompletionSummary(activeDraft, CHAPTER_KEYS);
  const selectedSection = activeDraft?.sections.find((item) => item.key === selectedChapterKey) ?? null;
  const selectedRecord = getDraftChapterRecord(activeDraft, selectedChapterKey);
  const selectedTitle = selectedRecord?.title || selectedSection?.title || CHAPTER_LABELS[selectedChapterKey];
  const selectedContent = editingChapter === selectedChapterKey ? editContent : selectedRecord?.content || selectedSection?.content || "";
  const selectedCitations = selectedRecord?.citations || [];
  const selectedCompliance = useMemo(() => {
    if (!complianceResult) return null;
    return complianceResult.chapters?.[selectedChapterKey] || null;
  }, [complianceResult, selectedChapterKey]);
  const revisionStatus = useMemo(
    () => buildRevisionStatus(chapterReview, chapterRevision) as RevisionStatusView | null,
    [chapterReview, chapterRevision],
  );
  const revisionCompare = useMemo(
    () => buildRevisionCompare(revisionBaselineContent, chapterRevision?.content || ""),
    [revisionBaselineContent, chapterRevision?.content],
  );

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-6 flex items-center justify-between">
        {onBack ? (
          <button onClick={onBack} className="text-sm text-gray-500 hover:text-gray-700">
            返回项目
          </button>
        ) : <div />}
        <h2 className="text-xl font-bold text-gray-800">论文工作流</h2>
        <div className="w-16" />
      </div>

      <WorkflowStepIndicator currentStep={step} onStepClick={setStep} />

      {step === 1 && (
        <div>
          <div className="mb-4 flex items-center justify-between">
            <p className="text-sm text-gray-600">先上传和整理项目成果，再进入论文写作。</p>
            <button onClick={() => setStep(2)} className="rounded-lg bg-blue-600 px-5 py-2 text-sm text-white hover:bg-blue-700">
              进入论文写作
            </button>
          </div>
          <OutcomeManager projectId={projectId} onReadyChange={() => {}} />
        </div>
      )}

      {step === 2 && (
        <div className="overflow-hidden rounded-2xl border border-[#ddd4c4] bg-[#ede8da] shadow-sm">
          {draftError && <div className="border-b border-red-200 bg-red-50 px-5 py-3 text-sm text-red-700">{draftError}</div>}

          <StageWrapper isLoading={draftLoading} error={null} loadingMessage="加载草稿...">
            <div className="flex min-h-[760px]">
              <aside className="flex w-[260px] shrink-0 flex-col border-r border-[#ddd4c4] bg-[#f7f4ec]">
                <div className="border-b border-[#ddd4c4] px-5 py-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="text-lg font-semibold text-[#1a1612]">论文写作</h3>
                      <p className="mt-1 text-[11px] leading-5 text-[#9e9282]">围绕真实成果与文献证据组织论文内容。</p>
                    </div>
                    <button onClick={handleCreateDraft} disabled={draftLoading} className="rounded-lg border border-[#ddd4c4] bg-[#ede8da] px-2 py-1 text-[11px] text-[#5c5242] disabled:opacity-50">
                      新建
                    </button>
                  </div>
                  {activeDraft && (
                    <div className="mt-4">
                      <div className="mb-1.5 flex items-center justify-between text-[11px] text-[#5c5242]">
                        <span>完成进度</span>
                        <span>{activeSummary.progress}%</span>
                      </div>
                      <div className="h-[3px] overflow-hidden rounded-full bg-[#ddd8c8]">
                        <div className="h-full rounded-full bg-[#1b2d1b]" style={{ width: `${activeSummary.progress}%` }} />
                      </div>
                    </div>
                  )}
                </div>

                <div className="border-b border-[#ddd4c4] px-4 py-3">
                  <div className="mb-2 text-[10px] uppercase tracking-[0.08em] text-[#9e9282]">论文草稿</div>
                  {drafts.length === 0 ? (
                    <p className="rounded-lg border border-dashed border-[#ddd4c4] px-3 py-4 text-center text-xs text-[#9e9282]">暂无草稿</p>
                  ) : (
                    <div className="max-h-36 space-y-1 overflow-y-auto" style={{ scrollbarWidth: "none" }}>
                      {drafts.map((draft) => (
                        <button
                          key={draft.id}
                          onClick={() => handleSelectDraft(draft.id)}
                          className="w-full rounded-lg px-3 py-2 text-left text-xs transition-colors"
                          style={{
                            background: activeDraft?.id === draft.id ? "rgba(27,45,27,0.08)" : "transparent",
                            color: activeDraft?.id === draft.id ? "#1b2d1b" : "#5c5242",
                          }}
                        >
                          <div className="truncate font-medium">{draft.title}</div>
                          <div className="mt-0.5 text-[10.5px] text-[#9e9282]">v{draft.version}</div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <div className="border-b border-[#ddd4c4] px-4 py-3">
                  <div className="mb-2 text-[10px] uppercase tracking-[0.08em] text-[#9e9282]">结构动作</div>
                  <div className="space-y-2">
                    <button onClick={handleGenerateWritingPlan} disabled={!activeDraft || writingPlanGenerating} className="w-full rounded-lg border border-[#ddd4c4] bg-[#ede8da] px-3 py-2 text-left text-xs text-[#5c5242] disabled:opacity-50">
                      {writingPlanGenerating ? "生成计划中..." : "生成写作计划"}
                    </button>
                    <button onClick={handleGenerateOutline} disabled={!activeDraft || outlineGenerating} className="w-full rounded-lg border border-[#ddd4c4] bg-[#ede8da] px-3 py-2 text-left text-xs text-[#5c5242] disabled:opacity-50">
                      {outlineGenerating ? "生成大纲中..." : "生成论文大纲"}
                    </button>
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto py-3" style={{ scrollbarWidth: "none" }}>
                  <div className="mb-2 px-4 text-[10px] uppercase tracking-[0.08em] text-[#9e9282]">章节列表</div>
                  {CHAPTER_KEYS.map((key) => {
                    const record = getDraftChapterRecord(activeDraft, key);
                    const section = activeDraft?.sections.find((item) => item.key === key);
                    const isSelected = key === selectedChapterKey;
                    const isDone = Boolean(section?.status && section.status !== "draft");
                    return (
                      <button
                        key={key}
                        onClick={() => setSelectedChapterKey(key)}
                        className="flex w-full items-center gap-2 px-4 py-2 text-left transition-colors"
                        style={{
                          background: isSelected ? "#ede8da" : "transparent",
                          borderLeft: `2px solid ${isSelected ? "#1b2d1b" : "transparent"}`,
                        }}
                      >
                        <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: isDone ? "#1b2d1b" : "#9e9282" }} />
                        <span className="min-w-0 flex-1 truncate text-[12.5px]" style={{ color: isSelected ? "#1a1612" : "#5c5242" }}>
                          {CHAPTER_LABELS[key]}
                        </span>
                        {record?.data_based ? <span className="text-[10px] text-[#2e6b5b]">数据</span> : null}
                      </button>
                    );
                  })}
                </div>
              </aside>

              <main className="flex min-w-0 flex-1 bg-[#fbfaf5]">
                {!activeDraft ? (
                  <div className="flex flex-1 items-center justify-center px-10">
                    <div className="max-w-md text-center">
                      <h3 className="text-xl font-semibold text-[#1a1612]">先创建一份论文草稿</h3>
                      <p className="mt-3 text-sm leading-7 text-[#6a5f50]">创建后即可生成写作计划、大纲、章节内容，并使用章节审查与修订闭环。</p>
                      <button onClick={handleCreateDraft} className="mt-6 rounded-xl bg-[#1b2d1b] px-5 py-2.5 text-sm text-[#ede8da]">
                        新建草稿
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="flex min-w-0 flex-1 flex-col">
                      <div className="flex h-12 shrink-0 items-center justify-between border-b border-[#ddd4c4] bg-[#f7f4ec] px-5">
                        <div className="min-w-0 text-xs text-[#5c5242]">
                          <span className="truncate">{activeDraft.title}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <button onClick={() => handleGenerateChapter(selectedChapterKey)} disabled={chapterGenerating} className="rounded-lg bg-[#ddd8c8] px-3 py-1.5 text-xs text-[#1a1612] disabled:opacity-50">
                            {chapterGenerating ? "生成中..." : selectedRecord?.content ? "重写本章" : "生成本章"}
                          </button>
                          {editingChapter === selectedChapterKey ? (
                            <>
                              <button onClick={handleSaveEdit} className="rounded-lg bg-[#1b2d1b] px-3 py-1.5 text-xs text-[#ede8da]">保存</button>
                              <button onClick={() => setEditingChapter(null)} className="rounded-lg bg-[#ddd8c8] px-3 py-1.5 text-xs text-[#5c5242]">取消</button>
                            </>
                          ) : (
                            <button
                              onClick={() => {
                                setEditingChapter(selectedChapterKey);
                                setEditContent(selectedRecord?.content || "");
                              }}
                              disabled={!selectedRecord?.content}
                              className="rounded-lg bg-[#1b2d1b] px-3 py-1.5 text-xs text-[#ede8da] disabled:opacity-50"
                            >
                              编辑
                            </button>
                          )}
                        </div>
                      </div>

                      <div className="flex-1 overflow-y-auto px-14 py-10" style={{ scrollbarWidth: "none" }}>
                        <div className="mx-auto max-w-[720px]">
                          <div className="mb-6 flex items-center justify-between">
                            <h1 className="text-[22px] font-semibold text-[#1a1612]">{selectedTitle}</h1>
                            <span className="text-[11px] text-[#9e9282]" style={{ fontFamily: "monospace" }}>
                              {selectedContent.replace(/\s+/g, "").length} 字
                            </span>
                          </div>
                          <div className="mb-6 h-px bg-[#ddd4c4]" />

                          {editingChapter === selectedChapterKey ? (
                            <textarea
                              value={editContent}
                              onChange={(event) => setEditContent(event.target.value)}
                              className="min-h-[480px] w-full resize-none bg-transparent text-[15px] leading-9 text-[#1a1612] outline-none"
                            />
                          ) : selectedContent ? (
                            <div className="whitespace-pre-wrap text-[15px] leading-9 text-[#1a1612]">{selectedContent}</div>
                          ) : (
                            <div className="rounded-2xl border border-dashed border-[#cfc5b4] px-8 py-16 text-center">
                              <p className="text-sm text-[#9e9282]">本章暂无内容</p>
                              <button onClick={() => handleGenerateChapter(selectedChapterKey)} disabled={chapterGenerating} className="mt-4 rounded-xl bg-[#1b2d1b] px-5 py-2.5 text-sm text-[#ede8da] disabled:opacity-50">
                                {chapterGenerating ? "生成中..." : "生成本章"}
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    <aside className="flex w-[280px] shrink-0 flex-col border-l border-[#ddd4c4] bg-[#f7f4ec]">
                      <div className="flex gap-1 border-b border-[#ddd4c4] p-3">
                        <button className="flex-1 rounded-lg border border-[#ddd4c4] bg-[#ede8da] py-1.5 text-center text-xs font-medium text-[#1a1612]">建议</button>
                        <button onClick={handleDownloadDraft} className="rounded-lg bg-[#ddd8c8] px-3 py-1.5 text-xs text-[#5c5242]">导出</button>
                      </div>

                      <div className="flex-1 overflow-y-auto px-3 py-3" style={{ scrollbarWidth: "none" }}>
                        <div className="mb-3 flex items-center gap-2">
                          <select value={downloadFormat} onChange={(event) => setDownloadFormat(event.target.value as "docx" | "pdf")} className="h-8 flex-1 rounded-lg border border-[#ddd4c4] bg-[#ede8da] px-2 text-xs text-[#5c5242]">
                            <option value="docx">DOCX</option>
                            <option value="pdf">PDF</option>
                          </select>
                        </div>

                        <WritingSidePanel title="AI 写作建议">
                          <SuggestionCard text="先保证章节结论有真实文献或项目成果支撑，再做语言润色。" />
                          <SuggestionCard text="优先修正审查结果里的 warning，再处理 info 级建议。" />
                          <SuggestionCard text="修订后重新执行章节审查，确认问题是否真正解决。" />
                        </WritingSidePanel>

                        {writingPlan && (
                          <WritingSidePanel title="写作计划">
                            <div className="space-y-3 text-[11.5px] leading-5 text-[#5c5242]">
                              <div>
                                <div className="mb-1 text-[10px] uppercase tracking-[0.08em] text-[#9e9282]">目标</div>
                                <p>{writingPlan.goal}</p>
                              </div>
                              {writingPlan.recommendedStructure.length > 0 && (
                                <div>
                                  <div className="mb-1 text-[10px] uppercase tracking-[0.08em] text-[#9e9282]">建议结构</div>
                                  <div className="space-y-1">
                                    {writingPlan.recommendedStructure.slice(0, 4).map((item) => (
                                      <p key={item}>• {item}</p>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>
                          </WritingSidePanel>
                        )}

                        <WritingSidePanel title="生成与检查">
                          <button onClick={handleGenerateAbstract} disabled={abstractGenerating} className="mb-2 w-full rounded-lg bg-[#ddd8c8] px-3 py-2 text-left text-xs text-[#1a1612] disabled:opacity-50">
                            {abstractGenerating ? "摘要生成中..." : "生成摘要"}
                          </button>
                          <button onClick={handleReviewChapter} disabled={reviewLoading || !selectedContent.trim()} className="mb-2 w-full rounded-lg border border-[#ddd4c4] bg-[#f7f4ec] px-3 py-2 text-left text-xs text-[#1a1612] disabled:opacity-50">
                            {reviewLoading ? "章节审查中..." : "章节审查"}
                          </button>
                          <button onClick={handleCheckCompliance} disabled={complianceLoading} className="w-full rounded-lg border border-[rgba(130,40,40,0.2)] bg-[rgba(130,40,40,0.08)] px-3 py-2 text-left text-xs text-[#822828] disabled:opacity-50">
                            {complianceLoading ? "合规检查中..." : "合规检查"}
                          </button>
                        </WritingSidePanel>

                        {chapterReview && chapterReview.chapterKey === selectedChapterKey && (
                          <WritingSidePanel title="章节审查结果">
                            <div className="space-y-3 text-[11.5px] leading-5 text-[#5c5242]">
                              <div className={`rounded-lg px-3 py-2 ${chapterReview.passed ? "bg-[rgba(27,45,27,0.08)] text-[#1b2d1b]" : "bg-[rgba(130,40,40,0.08)] text-[#822828]"}`}>
                                {chapterReview.summary}
                              </div>
                              {chapterReview.focusAreas.length > 0 && (
                                <div>
                                  <div className="mb-1 text-[10px] uppercase tracking-[0.08em] text-[#9e9282]">关注点</div>
                                  <div className="space-y-1">
                                    {chapterReview.focusAreas.map((item) => (
                                      <p key={item}>• {item}</p>
                                    ))}
                                  </div>
                                </div>
                              )}
                              {chapterReview.issues.length > 0 && (
                                <div className="space-y-2">
                                  {chapterReview.issues.map((issue, index) => (
                                    <div key={`${issue.title}-${index}`} className="rounded-lg border border-[#ddd4c4] bg-[#f7f4ec] px-3 py-2">
                                      <div className="mb-1 flex items-center gap-2">
                                        <ChapterBadge severity={issue.severity} />
                                        <span className="font-medium text-[#1a1612]">{issue.title}</span>
                                      </div>
                                      <p>{issue.detail}</p>
                                      <p className="mt-1 text-[#9e9282]">建议：{issue.suggestion}</p>
                                    </div>
                                  ))}
                                </div>
                              )}
                              <button onClick={handleReviseChapter} disabled={revisionLoading} className="w-full rounded-lg bg-[#1b2d1b] px-3 py-2 text-left text-xs text-[#ede8da] disabled:opacity-50">
                                {revisionLoading ? "章节修订中..." : "按建议修订本章"}
                              </button>
                            </div>
                          </WritingSidePanel>
                        )}

                        {chapterRevision && chapterRevision.chapterKey === selectedChapterKey && (
                          <WritingSidePanel title="修订结果">
                            <div className="space-y-3 text-[11.5px] leading-5 text-[#5c5242]">
                              {chapterRevision.changeSummary.length > 0 && (
                                <div>
                                  <div className="mb-1 text-[10px] uppercase tracking-[0.08em] text-[#9e9282]">变更摘要</div>
                                  <div className="space-y-1">
                                    {chapterRevision.changeSummary.map((item) => (
                                      <p key={item}>• {item}</p>
                                    ))}
                                  </div>
                                </div>
                              )}
                              {chapterRevision.resolvedIssues.length > 0 && (
                                <div>
                                  <div className="mb-1 text-[10px] uppercase tracking-[0.08em] text-[#9e9282]">已处理问题</div>
                                  <div className="space-y-1">
                                    {chapterRevision.resolvedIssues.map((item) => (
                                      <p key={item}>• {item}</p>
                                    ))}
                                  </div>
                                </div>
                              )}
                              {revisionCompare?.changed && (
                                <div className="space-y-2">
                                  <div className="mb-1 text-[10px] uppercase tracking-[0.08em] text-[#9e9282]">修订前后对照</div>
                                  <div className="rounded-lg border border-[#ddd4c4] bg-[#f7f4ec] px-3 py-2">
                                    <div className="mb-1 text-[10px] uppercase tracking-[0.08em] text-[#9e9282]">修订前</div>
                                    <div className="space-y-2">
                                      {revisionCompare.beforeExcerpt.map((item, index) => (
                                        <p key={`before-${index}`}>{item}</p>
                                      ))}
                                    </div>
                                  </div>
                                  <div className="rounded-lg border border-[#ddd4c4] bg-[#f7f4ec] px-3 py-2">
                                    <div className="mb-1 text-[10px] uppercase tracking-[0.08em] text-[#9e9282]">修订后</div>
                                    <div className="space-y-2">
                                      {revisionCompare.afterExcerpt.map((item, index) => (
                                        <p key={`after-${index}`}>{item}</p>
                                      ))}
                                    </div>
                                  </div>
                                </div>
                              )}
                            </div>
                          </WritingSidePanel>
                        )}

                        {revisionStatus && (
                          <WritingSidePanel title="修订状态">
                            <div className="space-y-3 text-[11.5px] leading-5 text-[#5c5242]">
                              <div className="grid grid-cols-2 gap-2">
                                <div className="rounded-lg bg-[rgba(27,45,27,0.08)] px-3 py-2 text-[#1b2d1b]">已解决 {revisionStatus.resolvedCount} 项</div>
                                <div className="rounded-lg bg-[rgba(130,40,40,0.08)] px-3 py-2 text-[#822828]">剩余 {revisionStatus.remainingCount} 项</div>
                              </div>
                              {revisionStatus.resolvedIssues.length > 0 && (
                                <div>
                                  <div className="mb-1 text-[10px] uppercase tracking-[0.08em] text-[#9e9282]">已解决问题</div>
                                  <div className="space-y-1">
                                    {revisionStatus.resolvedIssues.map((issue) => (
                                      <p key={issue.title}>• {issue.title}</p>
                                    ))}
                                  </div>
                                </div>
                              )}
                              {revisionStatus.remainingIssues.length > 0 && (
                                <div>
                                  <div className="mb-1 text-[10px] uppercase tracking-[0.08em] text-[#9e9282]">仍待处理</div>
                                  <div className="space-y-2">
                                    {revisionStatus.remainingIssues.map((issue) => (
                                      <div key={issue.title} className="rounded-lg border border-[#ddd4c4] bg-[#f7f4ec] px-3 py-2">
                                        <div className="mb-1 flex items-center gap-2">
                                          <ChapterBadge severity={issue.severity} />
                                          <span className="font-medium text-[#1a1612]">{issue.title}</span>
                                        </div>
                                        <p>{issue.detail}</p>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}
                              <div className="rounded-lg border border-[#ddd4c4] bg-[#f7f4ec] px-3 py-2 text-[#3a3020]">下一步：{revisionStatus.nextAction}</div>
                            </div>
                          </WritingSidePanel>
                        )}

                        {abstract && (
                          <WritingSidePanel title="摘要">
                            <p className="text-[11.5px] leading-5 text-[#5c5242]">{abstract.abstract_cn}</p>
                            <p className="mt-2 text-[10.5px] text-[#9e9282]">关键词：{abstract.keywords_cn.join("、")}</p>
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

                        <WritingSidePanel title="当前章节引用">
                          {selectedCitations.length > 0 ? (
                            <div className="space-y-1 text-[11.5px] leading-5 text-[#5c5242]">
                              {selectedCitations.map((item) => (
                                        <p key={item}>• {item}</p>
                              ))}
                            </div>
                          ) : (
                            <p className="text-[11.5px] leading-5 text-[#9e9282]">当前章节还没有显式引用条目。</p>
                          )}
                        </WritingSidePanel>

                        {selectedCompliance && (
                          <WritingSidePanel title="当前章节合规问题">
                            <div className="space-y-2">
                              {selectedCompliance.issues.map((issue: ComplianceIssue, index: number) => (
                                <div key={`${issue.location}-${index}`} className="rounded-lg border border-[#ddd4c4] bg-[#f7f4ec] px-3 py-2">
                                  <div className="mb-1 flex items-center gap-2">
                                    <ChapterBadge severity={issue.severity} />
                                    <span className="font-medium text-[#1a1612]">{issue.location}</span>
                                  </div>
                                  <p className="text-[11.5px] leading-5 text-[#5c5242]">{issue.description}</p>
                                  <div className="mt-2 flex gap-2">
                                    <button onClick={() => handleComplianceAction(index, "accept")} className="rounded bg-white px-2 py-1 text-[10px] text-[#5c5242]">确认</button>
                                    <button onClick={() => handleComplianceAction(index, "ignore")} className="rounded bg-white px-2 py-1 text-[10px] text-[#5c5242]">忽略</button>
                                    <button onClick={() => handleComplianceAction(index, "fixed")} className="rounded bg-white px-2 py-1 text-[10px] text-[#5c5242]">已修正</button>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </WritingSidePanel>
                        )}
                      </div>
                    </aside>
                  </>
                )}
              </main>
            </div>
          </StageWrapper>
        </div>
      )}
    </div>
  );
}
