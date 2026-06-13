"use client";

import { useState, useEffect } from "react";
import StepIndicator from "./StepIndicator";
import StageWrapper from "./StageWrapper";
import * as api from "@/lib/api";
import type {
  RequirementAnalysis,
  Paper,
  AnalyzeLiteratureResponse,
  ResearchDirection,
  DirectionScore,
  ProjectDesign,
  LiteratureAnalysisInput,
  PPTItem,
  PPTStyle,
  ProposalOut,
  ResearchMode,
  LibraryScope,
} from "@/lib/types";
import type { TaskStatus } from "@/lib/api";

// ========== 状态类型 ==========

interface WizardState {
  currentStep: number;
  requirement: string;
  projectId: string | null;
  literatureSearchMode: ResearchMode;
  literatureLibraryScope: LibraryScope;
  literatureMinCitationCount: number;
  literaturePreferHighImpact: boolean;
  requirementAnalysis: RequirementAnalysis | null;
  papers: Paper[];
  literatureAnalysis: AnalyzeLiteratureResponse | null;
  directions: ResearchDirection[];
  scores: DirectionScore[];
  savedDirectionIds: string[];
  selectedDirectionIndex: number | null;
  design: ProjectDesign | null;
  selectedPPTStyleId: string;
  selectedPPTStyleName: string | null;
  pptDownloadUrl: string | null;
  pptFilename: string | null;
  proposal: ProposalOut | null;
  designId: string | null;
  pptGenerating: boolean;
  proposalGenerating: boolean;
}

const INITIAL_STATE: WizardState = {
  currentStep: 1,
  requirement: "",
  projectId: null,
  literatureSearchMode: "literature_review",
  literatureLibraryScope: "all",
  literatureMinCitationCount: 0,
  literaturePreferHighImpact: true,
  requirementAnalysis: null,
  papers: [],
  literatureAnalysis: null,
  directions: [],
  scores: [],
  savedDirectionIds: [],
  selectedDirectionIndex: null,
  design: null,
  selectedPPTStyleId: "academic_blue",
  selectedPPTStyleName: null,
  pptDownloadUrl: null,
  pptFilename: null,
  proposal: null,
  designId: null,
  pptGenerating: false,
  proposalGenerating: false,
};

// ========== 步骤名称 ==========

const STEP_NAMES: Record<number, string> = {
  1: "需求分析",
  2: "文献检索",
  3: "文献分析",
  4: "研究方向",
  5: "项目设计",
  6: "生成成果",
};

const MODE_META: Record<
  ResearchMode,
  { label: string; eyebrow: string; description: string; accent: string; detail: string }
> = {
  quick_search: {
    label: "快速摸底",
    eyebrow: "Consensus",
    description: "先判断有没有研究基础和代表性论文，适合定题前快速探路。",
    accent: "#7B2D26",
    detail: "强调答案速度、代表性论文和基础证据。",
  },
  literature_review: {
    label: "综述梳理",
    eyebrow: "OpenAlex",
    description: "围绕关键词与研究实体做系统检索，更适合形成文献综述框架。",
    accent: "#1B2D1B",
    detail: "强调关键词覆盖、来源平衡与研究脉络。",
  },
  deep_research: {
    label: "深度研究",
    eyebrow: "PaSa",
    description: "按代理式研究路径深挖证据，优先寻找高质量、可延展的研究入口。",
    accent: "#1F3E63",
    detail: "强调多步筛选、文献质量与下一步研究方向。",
  },
};

const SCOPE_META: Record<LibraryScope, { label: string; description: string }> = {
  all: { label: "所有文献", description: "中英文共同检索，平衡覆盖面与交叉视角。" },
  cn: { label: "中文文献", description: "优先国内研究现状、中文数据库与本土研究场景。" },
  en: { label: "英文文献", description: "优先国际论文、英文数据库与前沿研究趋势。" },
};

const SOURCE_META = {
  openalex: { label: "OpenAlex", color: "#1F3E63" },
  semantic_scholar: { label: "Semantic Scholar", color: "#6B3FA0" },
  cnki: { label: "CNKI", color: "#8A2E2E" },
  cqvip: { label: "维普", color: "#8C6A2A" },
} as const;

const EVIDENCE_ROUTE = [
  { step: "01", title: "理解问题", description: "识别研究对象、方法和关键词。" },
  { step: "02", title: "设计检索", description: "组合模式、语种范围与证据偏好。" },
  { step: "03", title: "跨库抓取", description: "联动 OpenAlex、Semantic Scholar、CNKI、维普。" },
  { step: "04", title: "评估证据", description: "按来源、引用量与相关性进行筛选。" },
  { step: "05", title: "生成方向", description: "把可用文献转成研究切入点与后续设计。" },
] as const;

// ========== 主组件 ==========

export default function PipelineWizard() {
  const [state, setState] = useState<WizardState>(INITIAL_STATE);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [historyPPTs, setHistoryPPTs] = useState<PPTItem[]>([]);
  const [pptStyles, setPptStyles] = useState<PPTStyle[]>([]);
  const [downloadFormat, setDownloadFormat] = useState<"docx" | "pdf">("docx");

  // 进入阶段6后加载历史 PPT 列表
  useEffect(() => {
    if (state.currentStep === 6) {
      api.listPPTs().then((res) => setHistoryPPTs(res.files)).catch(() => {});
    }
  }, [state.currentStep]);

  // 初始化加载 PPT 风格
  useEffect(() => {
    api.listPPTStyles()
      .then((styles) => {
        setPptStyles(styles);
        const defaultStyle = styles.find((style) => style.is_default) || styles[0];
        if (defaultStyle) {
          updateState({
            selectedPPTStyleId: defaultStyle.id,
            selectedPPTStyleName: defaultStyle.name,
          });
        }
      })
      .catch(() => {});
  }, []);

  // ===== 辅助方法 =====

  const updateState = (patch: Partial<WizardState>) => {
    setState((prev) => ({ ...prev, ...patch }));
  };

  const runStage = async (handler: () => Promise<void>) => {
    setLoading(true);
    setError(null);
    try {
      await handler();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "未知错误";
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const goToStep = (step: number) => {
    // 允许回退到任意已完成步骤，或前进到下一步（最多到步骤6）
    if (step >= 1 && step <= 6) {
      updateState({ currentStep: step });
    }
  };

  const reset = () => {
    setState(INITIAL_STATE);
    setError(null);
  };

  // ===== 阶段处理函数 =====

  const handleStage1 = () => {
    runStage(async () => {
      const res = await api.analyzeRequirement(state.requirement);
      // 自动创建项目
      let projectId: string | null = null;
      try {
        const proj = await api.createProject({
          name: state.requirement.slice(0, 50),
          research_field: res.analysis.research_field,
          user_requirement: state.requirement,
        });
        projectId = proj.id;
      } catch {
        // 项目创建失败不影响流程
      }
      updateState({
        requirementAnalysis: res.analysis,
        projectId,
        currentStep: 2,
      });
    });
  };

  const handleStage2 = () => {
    runStage(async () => {
      const kw = state.requirementAnalysis!;
      const res = await api.searchLiterature({
        keywords_cn: kw.keywords_cn.slice(0, 4),
        keywords_en: kw.keywords_en.slice(0, 4),
        year_from: 2020,
        year_to: 2026,
        mode: state.literatureSearchMode,
        library_scope: state.literatureLibraryScope,
        min_citation_count: state.literatureMinCitationCount,
        prefer_high_impact: state.literaturePreferHighImpact,
      });
      const papers = res.papers || [];
      updateState({ papers, currentStep: 3 });
    });
  };

  const handleStage3 = () => {
    runStage(async () => {
      const res = await api.analyzeLiterature({
        papers: state.papers,
        requirement: state.requirement,
      });
      updateState({ literatureAnalysis: res, currentStep: 4 });
    });
  };

  const handleStage4Generate = () => {
    runStage(async () => {
      const la = state.literatureAnalysis!;
      const litInput: LiteratureAnalysisInput = {
        summaries: la.summaries || [],
        research_hotspots: la.research_hotspots || [],
        research_gaps: la.research_gaps || [],
        recommended_entry_points: la.recommended_entry_points || [],
      };
      const res = await api.generateDirections({
        literatureAnalysis: litInput,
        requirement: state.requirement,
        projectId: state.projectId,
      });
      updateState({
        directions: res.directions,
        scores: res.scores,
        savedDirectionIds: res.saved_ids || [],
      });
    });
  };

  const handleStage4Select = (index: number) => {
    updateState({ selectedDirectionIndex: index });
  };

  const handleStage4Confirm = () => {
    const idx = state.selectedDirectionIndex;
    if (idx === null) return;
    runStage(async () => {
      const la = state.literatureAnalysis!;
      const litInput: LiteratureAnalysisInput = {
        summaries: la.summaries || [],
        research_hotspots: la.research_hotspots || [],
        research_gaps: la.research_gaps || [],
        recommended_entry_points: la.recommended_entry_points || [],
      };
      const directionId = state.savedDirectionIds[idx] || null;
      const res = await api.generateDesign({
        direction: state.directions[idx],
        literatureAnalysis: litInput,
        requirement: state.requirement,
        projectId: state.projectId,
        directionId,
      });
      updateState({ design: res.design, designId: res.saved_id, currentStep: 5 });
    });
  };

  const handleGeneratePPT = () => {
    runStage(async () => {
      updateState({ pptGenerating: true });
      // 发起异步任务
      const { task_id } = await api.generatePPTAsync({
        design: state.design!,
        template: state.selectedPPTStyleId,
      });
      // 轮询等待完成
      await new Promise<void>((resolve, reject) => {
        const cancel = api.pollUntilDone(task_id, (status: TaskStatus) => {
          if (status.ready) {
            if (status.result) {
              const r = status.result as {
                filename: string;
                download_url: string;
                style_id: string;
                style_name: string;
              };
              updateState({
                pptDownloadUrl: r.download_url,
                pptFilename: r.filename,
                selectedPPTStyleName: r.style_name,
                pptGenerating: false,
              });
              resolve();
            } else {
              updateState({ pptGenerating: false });
              reject(new Error(status.error || "PPT 生成失败"));
            }
          }
        });
      });
    });
  };

  const handleGenerateProposal = () => {
    if (!state.projectId || !state.designId) {
      setError("缺少项目或设计信息，请返回前面的步骤重新生成。");
      return;
    }
    runStage(async () => {
      updateState({ proposalGenerating: true });
      // 发起异步任务
      const { task_id } = await api.generateProposalAsync({
        project_id: state.projectId!,
        design_id: state.designId!,
      });
      // 轮询等待完成
      await new Promise<void>((resolve, reject) => {
        const cancel = api.pollUntilDone(task_id, (status: TaskStatus) => {
          if (status.ready) {
            if (status.result) {
              const r = status.result as {
                id: string;
                title: string;
                sections_count: number;
                download_url: string;
              };
              api.getProposal(r.id)
                .then((proposal) => {
                  updateState({
                    proposal,
                    proposalGenerating: false,
                  });
                  resolve();
                })
                .catch((err: unknown) => {
                  reject(err instanceof Error ? err : new Error("获取开题报告详情失败"));
                });
            } else {
              updateState({ proposalGenerating: false });
              reject(new Error(status.error || "开题报告生成失败"));
            }
          }
        });
      });
    });
  };

  // ===== 各个阶段的渲染函数 =====

  const renderStage1 = () => (
    <div className="space-y-8">
      <section className="compass-hero overflow-hidden rounded-[28px] border border-[rgba(26,22,18,0.1)] bg-[#f7f4ec]">
        <div className="relative px-6 py-7 md:px-8 md:py-8">
          <div className="compass-grid absolute inset-0 opacity-60" />
          <div className="relative z-10 grid gap-6 lg:grid-cols-[minmax(0,1.45fr)_340px]">
            <div className="space-y-6">
              <div className="space-y-3">
                <div className="inline-flex items-center gap-2 rounded-full border border-[rgba(26,22,18,0.12)] bg-white/70 px-3 py-1 text-[11px] uppercase tracking-[0.18em] text-[#5c5242]">
                  <span className="h-1.5 w-1.5 rounded-full bg-[#1b2d1b]" />
                  Evidence Compass
                </div>
                <div>
                  <h2
                    className="max-w-3xl text-[34px] font-semibold leading-[1.06] text-[#1a1612] md:text-[42px]"
                    style={{ fontFamily: "var(--font-cormorant), serif" }}
                  >
                    让研究问题先进入证据罗盘，再决定检索路径
                  </h2>
                  <p className="mt-3 max-w-2xl text-sm leading-7 text-[#5c5242] md:text-[15px]">
                    这里不是单纯搜关键词，而是像 PaSa 一样编排检索任务，像 OpenAlex 一样组织证据空间，再像 Consensus 一样优先回答“这个方向值不值得做”。
                  </p>
                </div>
              </div>

              <div className="rounded-[24px] border border-[rgba(26,22,18,0.12)] bg-[rgba(255,255,255,0.7)] p-4 shadow-[0_16px_60px_rgba(26,22,18,0.06)] backdrop-blur-sm md:p-5">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-[12px] uppercase tracking-[0.16em] text-[#9e9282]">Research Prompt</p>
                    <p className="mt-1 text-sm text-[#5c5242]">描述研究对象、场景、方法或想验证的学术判断。</p>
                  </div>
                  <div className="rounded-full border border-[rgba(26,22,18,0.08)] bg-white/80 px-3 py-1 text-[12px] text-[#5c5242]">
                    {state.requirement.length} 字
                  </div>
                </div>
                <textarea
                  className="min-h-[170px] w-full rounded-[20px] border border-[rgba(26,22,18,0.12)] bg-[#fffdf8] px-5 py-4 text-[15px] leading-7 text-[#1a1612] outline-none transition-all placeholder:text-[#a79b88] focus:border-[#1b2d1b] focus:ring-2 focus:ring-[rgba(27,45,27,0.12)]"
                  placeholder="例如：我想研究大语言模型在高校课堂反馈中的应用，重点关注学习投入、教师反馈效率与可解释评价机制，想先判断国内外是否已有成熟研究路径。"
                  value={state.requirement}
                  onChange={(e) => updateState({ requirement: e.target.value })}
                  disabled={loading}
                />

                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  <div className="rounded-[18px] border border-[rgba(26,22,18,0.08)] bg-[#ede8da] px-4 py-3">
                    <p className="text-[11px] uppercase tracking-[0.16em] text-[#9e9282]">当前模式</p>
                    <p className="mt-1 text-base font-medium text-[#1a1612]">{MODE_META[state.literatureSearchMode].label}</p>
                    <p className="mt-1 text-[12px] leading-6 text-[#5c5242]">{MODE_META[state.literatureSearchMode].detail}</p>
                  </div>
                  <div className="rounded-[18px] border border-[rgba(26,22,18,0.08)] bg-[#ede8da] px-4 py-3">
                    <p className="text-[11px] uppercase tracking-[0.16em] text-[#9e9282]">证据范围</p>
                    <p className="mt-1 text-base font-medium text-[#1a1612]">{SCOPE_META[state.literatureLibraryScope].label}</p>
                    <p className="mt-1 text-[12px] leading-6 text-[#5c5242]">{SCOPE_META[state.literatureLibraryScope].description}</p>
                  </div>
                </div>

                <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex flex-wrap gap-2 text-[12px] text-[#5c5242]">
                    <span className="rounded-full border border-[rgba(26,22,18,0.08)] bg-white px-3 py-1.5">
                      最低引用量 {state.literatureMinCitationCount}
                    </span>
                    <span className="rounded-full border border-[rgba(26,22,18,0.08)] bg-white px-3 py-1.5">
                      {state.literaturePreferHighImpact ? "优先高影响力文献" : "兼顾广覆盖文献"}
                    </span>
                  </div>
                  <button
                    className="inline-flex items-center gap-2 rounded-full bg-[#1b2d1b] px-6 py-3 text-sm font-medium text-[#ede8da] transition-colors hover:bg-[#263b26] disabled:cursor-not-allowed disabled:opacity-50"
                    disabled={loading || state.requirement.trim().length < 10}
                    onClick={handleStage1}
                  >
                    启动证据检索
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M5 12h14m0 0-5-5m5 5-5 5" />
                    </svg>
                  </button>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <div className="rounded-[24px] border border-[rgba(26,22,18,0.12)] bg-[#132213] p-5 text-[#ede8da] shadow-[0_24px_80px_rgba(19,34,19,0.24)]">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[11px] uppercase tracking-[0.16em] text-[rgba(237,232,218,0.5)]">检索路径</p>
                    <h3 className="mt-2 text-[22px] font-semibold" style={{ fontFamily: "var(--font-cormorant), serif" }}>
                      Agent 会如何处理你的问题
                    </h3>
                  </div>
                  <div className="rounded-full border border-[rgba(237,232,218,0.18)] px-3 py-1 text-[11px] uppercase tracking-[0.14em] text-[rgba(237,232,218,0.6)]">
                    5 steps
                  </div>
                </div>
                <div className="mt-5 space-y-3">
                  {EVIDENCE_ROUTE.map((item) => (
                    <EvidenceRouteCard key={item.step} item={item} />
                  ))}
                </div>
              </div>

              <div className="rounded-[24px] border border-[rgba(26,22,18,0.12)] bg-[#fffdf8] p-5">
                <div className="mb-3">
                  <p className="text-[11px] uppercase tracking-[0.16em] text-[#9e9282]">检索方式</p>
                  <h3 className="mt-2 text-xl font-semibold text-[#1a1612]" style={{ fontFamily: "var(--font-cormorant), serif" }}>
                    选择你的证据工作流
                  </h3>
                </div>
                <div className="space-y-3">
                  {(Object.keys(MODE_META) as ResearchMode[]).map((mode) => (
                    <SearchModeCard
                      key={mode}
                      mode={mode}
                      active={state.literatureSearchMode === mode}
                      onClick={() => updateState({ literatureSearchMode: mode })}
                    />
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1.25fr)_320px]">
        <div className="rounded-[26px] border border-[rgba(26,22,18,0.1)] bg-white p-6 shadow-[0_18px_60px_rgba(26,22,18,0.05)]">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-[11px] uppercase tracking-[0.16em] text-[#9e9282]">Scope & Filters</p>
              <h3 className="mt-2 text-2xl font-semibold text-[#1a1612]" style={{ fontFamily: "var(--font-cormorant), serif" }}>
                设定你的证据边界
              </h3>
            </div>
            <div className="rounded-full border border-[rgba(26,22,18,0.08)] bg-[#f7f4ec] px-3 py-1.5 text-[12px] text-[#5c5242]">
              用首页先决定检索策略，再进入文献筛选
            </div>
          </div>

          <div className="mt-5 space-y-5">
            <div>
              <p className="mb-3 text-[12px] uppercase tracking-[0.16em] text-[#9e9282]">文献范围</p>
              <div className="flex flex-wrap gap-3">
                {(Object.keys(SCOPE_META) as LibraryScope[]).map((scope) => (
                  <ScopePill
                    key={scope}
                    active={state.literatureLibraryScope === scope}
                    label={SCOPE_META[scope].label}
                    description={SCOPE_META[scope].description}
                    onClick={() => updateState({ literatureLibraryScope: scope })}
                  />
                ))}
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_220px]">
              <label className="rounded-[20px] border border-[rgba(26,22,18,0.08)] bg-[#f7f4ec] p-4">
                <span className="mb-2 block text-[12px] uppercase tracking-[0.16em] text-[#9e9282]">最低引用量</span>
                <input
                  type="number"
                  min={0}
                  value={state.literatureMinCitationCount}
                  onChange={(e) => updateState({ literatureMinCitationCount: Number(e.target.value) || 0 })}
                  className="w-full border-0 bg-transparent p-0 text-[26px] font-medium text-[#1a1612] outline-none"
                />
                <span className="mt-2 block text-xs leading-6 text-[#5c5242]">用于剔除过弱的证据样本，提升文献基础可信度。</span>
              </label>

              <button
                type="button"
                onClick={() => updateState({ literaturePreferHighImpact: !state.literaturePreferHighImpact })}
                className="flex h-full flex-col justify-between rounded-[20px] border p-4 text-left transition-all"
                style={{
                  borderColor: state.literaturePreferHighImpact ? "rgba(27,45,27,0.22)" : "rgba(26,22,18,0.08)",
                  background: state.literaturePreferHighImpact ? "rgba(27,45,27,0.08)" : "#fffdf8",
                }}
              >
                <div>
                  <p className="text-[12px] uppercase tracking-[0.16em] text-[#9e9282]">证据偏好</p>
                  <p className="mt-2 text-xl font-semibold text-[#1a1612]" style={{ fontFamily: "var(--font-cormorant), serif" }}>
                    {state.literaturePreferHighImpact ? "高影响优先" : "广覆盖优先"}
                  </p>
                </div>
                <p className="text-xs leading-6 text-[#5c5242]">
                  {state.literaturePreferHighImpact
                    ? "优先保留被引更高、期刊影响力更强的文献。"
                    : "允许更多新文献和边缘样本进入候选集。"}
                </p>
              </button>
            </div>
          </div>
        </div>

        <div className="rounded-[26px] border border-[rgba(26,22,18,0.1)] bg-[#ede8da] p-6">
          <p className="text-[11px] uppercase tracking-[0.16em] text-[#9e9282]">本次将使用</p>
          <h3 className="mt-2 text-2xl font-semibold text-[#1a1612]" style={{ fontFamily: "var(--font-cormorant), serif" }}>
            四个证据来源
          </h3>
          <div className="mt-5 space-y-3">
            {(Object.keys(SOURCE_META) as Array<keyof typeof SOURCE_META>).map((source) => (
              <SourceChip key={source} source={source} />
            ))}
          </div>
          <div className="mt-5 rounded-[18px] border border-[rgba(26,22,18,0.08)] bg-white/70 p-4">
            <p className="text-[12px] uppercase tracking-[0.16em] text-[#9e9282]">策略摘要</p>
            <p className="mt-2 text-sm leading-7 text-[#5c5242]">
              当前会以 <b className="text-[#1a1612]">{MODE_META[state.literatureSearchMode].label}</b> 模式，在
              <b className="text-[#1a1612]"> {SCOPE_META[state.literatureLibraryScope].label}</b> 范围内检索，
              {state.literaturePreferHighImpact ? "优先保留高影响力样本" : "兼顾广覆盖样本"}。
            </p>
          </div>
        </div>
      </section>

      {state.requirementAnalysis && (
        <section className="rounded-[26px] border border-[rgba(26,22,18,0.1)] bg-white p-6 shadow-[0_18px_60px_rgba(26,22,18,0.05)]">
          <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-[11px] uppercase tracking-[0.16em] text-[#9e9282]">Strategy Preview</p>
              <h3 className="mt-2 text-2xl font-semibold text-[#1a1612]" style={{ fontFamily: "var(--font-cormorant), serif" }}>
                Agent 已生成检索策略草案
              </h3>
            </div>
            <div className="rounded-full border border-[rgba(26,22,18,0.08)] bg-[#f7f4ec] px-3 py-1.5 text-[12px] text-[#5c5242]">
              进入下一步后可直接执行跨库检索
            </div>
          </div>
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_0.85fr]">
            <div className="space-y-4">
              <InfoPanel title="研究领域" value={state.requirementAnalysis.research_field} />
              <InfoPanel title="初步建议" value={state.requirementAnalysis.preliminary_suggestions} />
              <div className="grid gap-4 md:grid-cols-2">
                <TagPanel title="中文关键词" items={state.requirementAnalysis.keywords_cn} />
                <TagPanel title="英文关键词" items={state.requirementAnalysis.keywords_en} />
              </div>
            </div>
            <div className="space-y-4">
              <TagPanel title="核心技术" items={state.requirementAnalysis.core_technologies} />
              <TagPanel title="可行方法" items={state.requirementAnalysis.possible_methods} />
            </div>
          </div>
        </section>
      )}
    </div>
  );

  const renderStage2 = () => {
    const sourceCounts = state.papers.reduce<Record<string, number>>((acc, paper) => {
      acc[paper.source] = (acc[paper.source] || 0) + 1;
      return acc;
    }, {});

    return (
      <div className="space-y-6">
        <section className="rounded-[26px] border border-[rgba(26,22,18,0.1)] bg-[#f7f4ec] p-6">
          <div className="grid gap-5 xl:grid-cols-[minmax(0,1.2fr)_360px]">
            <div className="space-y-4">
              <div>
                <p className="text-[11px] uppercase tracking-[0.16em] text-[#9e9282]">Literature Search</p>
                <h2 className="mt-2 text-3xl font-semibold text-[#1a1612]" style={{ fontFamily: "var(--font-cormorant), serif" }}>
                  现在开始执行跨库证据检索
                </h2>
                <p className="mt-3 max-w-2xl text-sm leading-7 text-[#5c5242]">
                  当前会围绕需求分析得到的关键词，对 OpenAlex、Semantic Scholar、CNKI 与维普进行联合检索，再把结果送入后续 AI 文献分析。
                </p>
              </div>

              {state.requirementAnalysis && (
                <div className="rounded-[20px] border border-[rgba(26,22,18,0.08)] bg-white/75 p-4">
                  <p className="text-[11px] uppercase tracking-[0.16em] text-[#9e9282]">本次关键词</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {state.requirementAnalysis.keywords_cn.slice(0, 6).map((w) => (
                      <span key={w} className="rounded-full border border-[rgba(27,45,27,0.12)] bg-[rgba(27,45,27,0.08)] px-3 py-1.5 text-[12px] text-[#1b2d1b]">
                        {w}
                      </span>
                    ))}
                    {state.requirementAnalysis.keywords_en.slice(0, 4).map((w) => (
                      <span key={w} className="rounded-full border border-[rgba(31,62,99,0.12)] bg-[rgba(31,62,99,0.08)] px-3 py-1.5 text-[12px] text-[#1F3E63]">
                        {w}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              <div className="grid gap-4 md:grid-cols-3">
                <CompactStat
                  label="检索模式"
                  value={MODE_META[state.literatureSearchMode].label}
                  hint={MODE_META[state.literatureSearchMode].eyebrow}
                />
                <CompactStat
                  label="文献范围"
                  value={SCOPE_META[state.literatureLibraryScope].label}
                  hint={state.literaturePreferHighImpact ? "高影响优先" : "广覆盖优先"}
                />
                <CompactStat
                  label="最低引用量"
                  value={String(state.literatureMinCitationCount)}
                  hint="用于样本筛选"
                />
              </div>
            </div>

            <div className="rounded-[24px] border border-[rgba(26,22,18,0.1)] bg-white p-5">
              <p className="text-[11px] uppercase tracking-[0.16em] text-[#9e9282]">Search Controls</p>
              <div className="mt-4 space-y-4">
                <label className="block text-sm text-[#5c5242]">
                  <span className="mb-1.5 block text-[12px] uppercase tracking-[0.16em] text-[#9e9282]">搜索模式</span>
                  <select
                    value={state.literatureSearchMode}
                    onChange={(e) => updateState({ literatureSearchMode: e.target.value as ResearchMode })}
                    className="w-full rounded-xl border border-[rgba(26,22,18,0.12)] bg-[#fffdf8] px-3 py-2.5 text-sm text-[#1a1612] outline-none focus:border-[#1b2d1b]"
                  >
                    <option value="quick_search">快速检索</option>
                    <option value="literature_review">学术综述</option>
                    <option value="deep_research">深度研究</option>
                  </select>
                </label>
                <label className="block text-sm text-[#5c5242]">
                  <span className="mb-1.5 block text-[12px] uppercase tracking-[0.16em] text-[#9e9282]">文献范围</span>
                  <select
                    value={state.literatureLibraryScope}
                    onChange={(e) => updateState({ literatureLibraryScope: e.target.value as LibraryScope })}
                    className="w-full rounded-xl border border-[rgba(26,22,18,0.12)] bg-[#fffdf8] px-3 py-2.5 text-sm text-[#1a1612] outline-none focus:border-[#1b2d1b]"
                  >
                    <option value="all">所有文献</option>
                    <option value="cn">中文库</option>
                    <option value="en">英文库</option>
                  </select>
                </label>
                <label className="block text-sm text-[#5c5242]">
                  <span className="mb-1.5 block text-[12px] uppercase tracking-[0.16em] text-[#9e9282]">最低引用量</span>
                  <input
                    type="number"
                    min={0}
                    value={state.literatureMinCitationCount}
                    onChange={(e) => updateState({ literatureMinCitationCount: Number(e.target.value) || 0 })}
                    className="w-full rounded-xl border border-[rgba(26,22,18,0.12)] bg-[#fffdf8] px-3 py-2.5 text-sm text-[#1a1612] outline-none focus:border-[#1b2d1b]"
                  />
                </label>
                <label className="flex items-center gap-3 rounded-xl border border-[rgba(26,22,18,0.08)] bg-[#f7f4ec] px-4 py-3 text-sm text-[#5c5242]">
                  <input
                    type="checkbox"
                    checked={state.literaturePreferHighImpact}
                    onChange={(e) => updateState({ literaturePreferHighImpact: e.target.checked })}
                  />
                  优先高影响力文献
                </label>
                <button
                  className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-[#1b2d1b] px-6 py-3 text-sm font-medium text-[#ede8da] transition-colors hover:bg-[#263b26] disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={loading}
                  onClick={handleStage2}
                >
                  开始检索文献
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M5 12h14m0 0-5-5m5 5-5 5" />
                  </svg>
                </button>
              </div>
            </div>
          </div>
        </section>

        {state.papers.length > 0 && (
          <>
            <section className="grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_360px]">
              <div className="rounded-[26px] border border-[rgba(26,22,18,0.1)] bg-white p-6 shadow-[0_18px_60px_rgba(26,22,18,0.05)]">
                <div className="flex flex-wrap items-end justify-between gap-4">
                  <div>
                    <p className="text-[11px] uppercase tracking-[0.16em] text-[#9e9282]">Result Snapshot</p>
                    <h3 className="mt-2 text-2xl font-semibold text-[#1a1612]" style={{ fontFamily: "var(--font-cormorant), serif" }}>
                      已找到 {state.papers.length} 篇候选文献
                    </h3>
                  </div>
                  <div className="rounded-full border border-[rgba(26,22,18,0.08)] bg-[#f7f4ec] px-3 py-1.5 text-[12px] text-[#5c5242]">
                    下一步可直接进入 AI 文献分析
                  </div>
                </div>
                <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                  {(Object.keys(SOURCE_META) as Array<keyof typeof SOURCE_META>).map((source) => (
                    <SourceSummaryCard
                      key={source}
                      label={SOURCE_META[source].label}
                      count={sourceCounts[source] || 0}
                      color={SOURCE_META[source].color}
                    />
                  ))}
                </div>
              </div>

              <div className="rounded-[26px] border border-[rgba(26,22,18,0.1)] bg-[#ede8da] p-6">
                <p className="text-[11px] uppercase tracking-[0.16em] text-[#9e9282]">证据说明</p>
                <h3 className="mt-2 text-2xl font-semibold text-[#1a1612]" style={{ fontFamily: "var(--font-cormorant), serif" }}>
                  这批文献会如何被利用
                </h3>
                <div className="mt-4 space-y-3 text-sm leading-7 text-[#5c5242]">
                  <p>系统会优先保留与你的研究问题相关度更高、引用基础更稳、来源更可信的样本。</p>
                  <p>下一步 AI 会从这些文献中提炼研究热点、研究空白和可切入方向，而不是直接生成没有依据的研究建议。</p>
                </div>
              </div>
            </section>

            <section className="rounded-[26px] border border-[rgba(26,22,18,0.1)] bg-white p-6 shadow-[0_18px_60px_rgba(26,22,18,0.05)]">
              <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
                <div>
                  <p className="text-[11px] uppercase tracking-[0.16em] text-[#9e9282]">Evidence Cards</p>
                  <h3 className="mt-2 text-2xl font-semibold text-[#1a1612]" style={{ fontFamily: "var(--font-cormorant), serif" }}>
                    候选文献卡片
                  </h3>
                </div>
                <button
                  className="inline-flex items-center gap-2 rounded-full bg-[#1b2d1b] px-5 py-2.5 text-sm font-medium text-[#ede8da] transition-colors hover:bg-[#263b26] disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={loading}
                  onClick={handleStage3}
                >
                  开始分析文献
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M5 12h14m0 0-5-5m5 5-5 5" />
                  </svg>
                </button>
              </div>
              <div className="max-h-[780px] space-y-3 overflow-y-auto pr-1">
                {state.papers.map((paper, i) => (
                  <PaperCard key={i} paper={paper} />
                ))}
              </div>
            </section>
          </>
        )}
      </div>
    );
  };

  const renderStage3 = () => {
    const analyzedCount = state.literatureAnalysis?.analyzed_papers ?? 0;
    const hotspotCount = state.literatureAnalysis?.research_hotspots?.length ?? 0;
    const gapCount = state.literatureAnalysis?.research_gaps?.length ?? 0;
    const entryCount = state.literatureAnalysis?.recommended_entry_points?.length ?? 0;

    return (
      <div className="space-y-6">
        <section className="rounded-[26px] border border-[rgba(26,22,18,0.1)] bg-[#f7f4ec] p-6">
          <div className="grid gap-5 xl:grid-cols-[minmax(0,1.18fr)_360px]">
            <div className="space-y-4">
              <div>
                <p className="text-[11px] uppercase tracking-[0.16em] text-[#9e9282]">Evidence Analysis</p>
                <h2 className="mt-2 text-3xl font-semibold text-[#1a1612]" style={{ fontFamily: "var(--font-cormorant), serif" }}>
                  把候选文献转成可用研究判断
                </h2>
                <p className="mt-3 max-w-2xl text-sm leading-7 text-[#5c5242]">
                  这一步会对当前候选文献做结构化提炼，输出研究热点、研究空白与推荐切入点，为下一步研究方向生成提供真实依据。
                </p>
              </div>

              <div className="grid gap-4 md:grid-cols-4">
                <CompactStat label="候选文献" value={String(state.papers.length)} hint="进入分析的样本数" />
                <CompactStat label="热点主题" value={String(hotspotCount)} hint="识别出的高频方向" />
                <CompactStat label="研究空白" value={String(gapCount)} hint="可切入问题数量" />
                <CompactStat label="切入点" value={String(entryCount)} hint="AI 推荐的研究入口" />
              </div>
            </div>

            <div className="rounded-[24px] border border-[rgba(26,22,18,0.1)] bg-white p-5">
              <p className="text-[11px] uppercase tracking-[0.16em] text-[#9e9282]">Analysis Trigger</p>
              <h3 className="mt-2 text-2xl font-semibold text-[#1a1612]" style={{ fontFamily: "var(--font-cormorant), serif" }}>
                生成证据分析摘要
              </h3>
              <p className="mt-3 text-sm leading-7 text-[#5c5242]">
                系统会优先摘要研究问题、方法、关键发现与创新，再汇总成后续研究方向生成所需的基础输入。
              </p>
              <button
                className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-full bg-[#1b2d1b] px-6 py-3 text-sm font-medium text-[#ede8da] transition-colors hover:bg-[#263b26] disabled:cursor-not-allowed disabled:opacity-50"
                disabled={loading}
                onClick={handleStage3}
              >
                开始分析文献
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 12h14m0 0-5-5m5 5-5 5" />
                </svg>
              </button>
            </div>
          </div>
        </section>

        {state.literatureAnalysis && (
          <>
            <section className="grid gap-4 xl:grid-cols-[minmax(0,1.25fr)_320px]">
              <div className="rounded-[26px] border border-[rgba(26,22,18,0.1)] bg-white p-6 shadow-[0_18px_60px_rgba(26,22,18,0.05)]">
                <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
                  <div>
                    <p className="text-[11px] uppercase tracking-[0.16em] text-[#9e9282]">Summary Deck</p>
                    <h3 className="mt-2 text-2xl font-semibold text-[#1a1612]" style={{ fontFamily: "var(--font-cormorant), serif" }}>
                      已分析 {analyzedCount} 篇核心文献
                    </h3>
                  </div>
                  <div className="rounded-full border border-[rgba(26,22,18,0.08)] bg-[#f7f4ec] px-3 py-1.5 text-[12px] text-[#5c5242]">
                    下一步将直接生成研究方向候选
                  </div>
                </div>
                <div className="space-y-3">
                  {state.literatureAnalysis.summaries.map((s, i) => (
                    <details key={i} className="rounded-[20px] border border-[rgba(26,22,18,0.08)] bg-[#f7f4ec] p-4">
                      <summary className="cursor-pointer list-none">
                        <div className="flex items-start justify-between gap-4">
                          <div>
                            <p className="text-[11px] uppercase tracking-[0.14em] text-[#9e9282]">{s.year}</p>
                            <h4 className="mt-1 text-lg font-semibold leading-7 text-[#1a1612]" style={{ fontFamily: "var(--font-cormorant), serif" }}>
                              {s.title}
                            </h4>
                          </div>
                          <span className="rounded-full border border-[rgba(26,22,18,0.08)] bg-white px-3 py-1 text-[12px] text-[#5c5242]">
                            质量 {s.quality_score}/5
                          </span>
                        </div>
                      </summary>
                      <div className="mt-4 grid gap-3 md:grid-cols-2">
                        <AnalysisMiniCard title="研究问题" value={s.research_question} />
                        <AnalysisMiniCard title="研究方法" value={s.method} />
                        <AnalysisMiniCard title="关键发现" value={s.key_findings} />
                        <AnalysisMiniCard title="创新点" value={s.innovation} />
                      </div>
                      <div className="mt-3 rounded-[16px] border border-[rgba(26,22,18,0.08)] bg-white px-4 py-3 text-[13px] leading-6 text-[#5c5242]">
                        <span className="mr-2 text-[#1a1612] font-medium">局限：</span>
                        {s.limitations}
                      </div>
                    </details>
                  ))}
                </div>
              </div>

              <div className="space-y-4">
                <InsightPanel title="研究热点" count={hotspotCount} tone="warm">
                  <div className="flex flex-wrap gap-2">
                    {state.literatureAnalysis.research_hotspots.map((h, i) => (
                      <span key={i} className="rounded-full border border-[rgba(140,106,42,0.18)] bg-[rgba(140,106,42,0.08)] px-3 py-1.5 text-[12px] text-[#8c6a2a]">
                        {h}
                      </span>
                    ))}
                  </div>
                </InsightPanel>

                <InsightPanel title="研究空白" count={gapCount} tone="danger">
                  <ul className="space-y-2">
                    {state.literatureAnalysis.research_gaps.map((g, i) => (
                      <li key={i} className="flex items-start gap-2 text-[13px] leading-6 text-[#5c5242]">
                        <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-[#7B2D26]" />
                        {g}
                      </li>
                    ))}
                  </ul>
                </InsightPanel>
              </div>
            </section>

            <section className="rounded-[26px] border border-[rgba(26,22,18,0.1)] bg-[#ede8da] p-6">
              <div className="flex flex-wrap items-end justify-between gap-4">
                <div>
                  <p className="text-[11px] uppercase tracking-[0.16em] text-[#9e9282]">Entry Points</p>
                  <h3 className="mt-2 text-2xl font-semibold text-[#1a1612]" style={{ fontFamily: "var(--font-cormorant), serif" }}>
                    推荐研究切入点
                  </h3>
                </div>
                <div className="rounded-full border border-[rgba(26,22,18,0.08)] bg-white/80 px-3 py-1.5 text-[12px] text-[#5c5242]">
                  可直接作为下一步研究方向生成依据
                </div>
              </div>
              <div className="mt-5 grid gap-3 md:grid-cols-3">
                {state.literatureAnalysis.recommended_entry_points.map((entry, i) => (
                  <div key={i} className="rounded-[20px] border border-[rgba(26,22,18,0.08)] bg-white/85 p-4">
                    <div className="text-[11px] uppercase tracking-[0.16em] text-[#9e9282]" style={{ fontFamily: "monospace" }}>
                      Entry {String(i + 1).padStart(2, "0")}
                    </div>
                    <p className="mt-3 text-sm leading-7 text-[#1a1612]">{entry}</p>
                  </div>
                ))}
              </div>
            </section>
          </>
        )}
      </div>
    );
  };

  const renderStage4 = () => {
    const selectedIndex = state.selectedDirectionIndex ?? 0;
    const selectedDirection = state.directions[selectedIndex] || state.directions[0];
    const selectedScore = selectedDirection
      ? state.scores.find((s) => s.title === selectedDirection.title)
      : null;
    const evidenceCount = state.literatureAnalysis?.summaries?.length || state.papers.length;

    if (state.directions.length === 0) {
      return (
        <div className="space-y-6">
          <section className="rounded-[26px] border border-[rgba(26,22,18,0.1)] bg-[#f7f4ec] p-6">
            <div className="grid gap-5 xl:grid-cols-[minmax(0,1.18fr)_360px]">
              <div className="space-y-4">
                <div>
                  <p className="text-[11px] uppercase tracking-[0.16em] text-[#9e9282]">Research Direction</p>
                  <h2 className="mt-2 text-3xl font-semibold text-[#1a1612]" style={{ fontFamily: "var(--font-cormorant), serif" }}>
                    把证据分析转成可执行的研究方向
                  </h2>
                  <p className="mt-3 max-w-2xl text-sm leading-7 text-[#5c5242]">
                    这里会基于已经得到的研究热点、研究空白和推荐切入点，生成多个候选研究方向，并进行可行性、创新性和文献基础评分。
                  </p>
                </div>

                <div className="grid gap-4 md:grid-cols-3">
                  <CompactStat label="文献依据" value={`${evidenceCount}`} hint="已完成的文献摘要条数" />
                  <CompactStat
                    label="研究空白"
                    value={`${state.literatureAnalysis?.research_gaps?.length ?? 0}`}
                    hint="将转化为候选问题"
                  />
                  <CompactStat
                    label="切入点"
                    value={`${state.literatureAnalysis?.recommended_entry_points?.length ?? 0}`}
                    hint="将组合生成方向"
                  />
                </div>
              </div>

              <div className="rounded-[24px] border border-[rgba(26,22,18,0.1)] bg-white p-5">
                <p className="text-[11px] uppercase tracking-[0.16em] text-[#9e9282]">Direction Trigger</p>
                <h3 className="mt-2 text-2xl font-semibold text-[#1a1612]" style={{ fontFamily: "var(--font-cormorant), serif" }}>
                  生成候选研究方向
                </h3>
                <p className="mt-3 text-sm leading-7 text-[#5c5242]">
                  生成后会进入方向列表与详情联动视图，你可以比较多个方向，再确认一个进入项目设计。
                </p>
                <button
                  className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-full bg-[#1b2d1b] px-6 py-3 text-sm font-medium text-[#ede8da] transition-colors hover:bg-[#263b26] disabled:opacity-50"
                  disabled={loading}
                  onClick={handleStage4Generate}
                >
                  生成研究方向
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M5 12h14m0 0-5-5m5 5-5 5" />
                  </svg>
                </button>
              </div>
            </div>
          </section>

          <section className="rounded-[26px] border border-[rgba(26,22,18,0.1)] bg-white p-6 shadow-[0_18px_60px_rgba(26,22,18,0.05)]">
            <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
              <div>
                <p className="text-[11px] uppercase tracking-[0.16em] text-[#9e9282]">Source Hand-off</p>
                <h3 className="mt-2 text-2xl font-semibold text-[#1a1612]" style={{ fontFamily: "var(--font-cormorant), serif" }}>
                  当前将用于生成方向的证据输入
                </h3>
              </div>
              <div className="rounded-full border border-[rgba(26,22,18,0.08)] bg-[#f7f4ec] px-3 py-1.5 text-[12px] text-[#5c5242]">
                延续前一步的真实文献分析结果
              </div>
            </div>

            <div className="grid gap-4 xl:grid-cols-3">
              <InsightPanel title="研究热点" count={state.literatureAnalysis?.research_hotspots?.length ?? 0} tone="warm">
                <div className="flex flex-wrap gap-2">
                  {(state.literatureAnalysis?.research_hotspots || []).slice(0, 8).map((item, i) => (
                    <span key={i} className="rounded-full border border-[rgba(140,106,42,0.18)] bg-[rgba(140,106,42,0.08)] px-3 py-1.5 text-[12px] text-[#8c6a2a]">
                      {item}
                    </span>
                  ))}
                </div>
              </InsightPanel>

              <InsightPanel title="研究空白" count={state.literatureAnalysis?.research_gaps?.length ?? 0} tone="danger">
                <ul className="space-y-2">
                  {(state.literatureAnalysis?.research_gaps || []).slice(0, 4).map((item, i) => (
                    <li key={i} className="flex items-start gap-2 text-[13px] leading-6 text-[#5c5242]">
                      <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-[#7B2D26]" />
                      {item}
                    </li>
                  ))}
                </ul>
              </InsightPanel>

              <InsightPanel title="推荐切入点" count={state.literatureAnalysis?.recommended_entry_points?.length ?? 0} tone="warm">
                <ul className="space-y-2">
                  {(state.literatureAnalysis?.recommended_entry_points || []).slice(0, 4).map((item, i) => (
                    <li key={i} className="flex items-start gap-2 text-[13px] leading-6 text-[#5c5242]">
                      <span className="shrink-0 text-[#1b2d1b]" style={{ fontFamily: "monospace" }}>
                        {String(i + 1).padStart(2, "0")}
                      </span>
                      {item}
                    </li>
                  ))}
                </ul>
              </InsightPanel>
            </div>
          </section>
        </div>
      );
    }

    return (
      <div className="overflow-hidden rounded-2xl border border-[#ddd4c4] bg-[#ede8da]">
        <div className="flex min-h-[720px]">
          <aside className="flex w-[320px] shrink-0 flex-col border-r border-[#ddd4c4] bg-[#f7f4ec]">
            <div className="border-b border-[#ddd4c4] px-5 py-4">
              <h2 className="text-xl font-semibold text-[#1a1612]" style={{ fontFamily: "var(--font-cormorant), serif" }}>
                研究方向
              </h2>
              <p className="mt-1 text-xs text-[#9e9282]">基于当前文献分析生成</p>
            </div>

            <div className="flex-1 overflow-y-auto px-3 py-3" style={{ scrollbarWidth: "none" }}>
              {state.directions.map((dir, i) => {
                const score = state.scores.find((s) => s.title === dir.title);
                const active = selectedIndex === i;
                const heat = normalizeScore(score?.scores.overall);
                return (
                  <button
                    key={dir.title || i}
                    type="button"
                    onClick={() => handleStage4Select(i)}
                    className="mb-2 w-full rounded-xl border p-4 text-left transition-all"
                    style={{
                      background: active ? "#1B2D1B" : "transparent",
                      borderColor: active ? "transparent" : "rgba(26,22,18,0.11)",
                      boxShadow: active ? "0 18px 40px rgba(27,45,27,0.13)" : "none",
                    }}
                  >
                    <div className="mb-2 flex items-start gap-2.5">
                      <span
                        className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-[10px]"
                        style={{
                          background: active ? "rgba(237,232,218,0.12)" : "#DDD8C8",
                          color: active ? "rgba(237,232,218,0.55)" : "#9E9282",
                          fontFamily: "monospace",
                        }}
                      >
                        {i + 1}
                      </span>
                      <span
                        className="flex-1 text-[13.5px] font-medium leading-5"
                        style={{ color: active ? "#EDE8DA" : "#1A1612", fontFamily: "var(--font-cormorant), serif" }}
                      >
                        {dir.title}
                      </span>
                      <span
                        className="rounded px-1.5 py-0.5 text-[10px]"
                        style={{ background: active ? "rgba(190,80,80,0.2)" : "rgba(130,40,40,0.08)", color: active ? "#E08080" : "#BE5050" }}
                      >
                        {displayScore(score?.scores.overall)}
                      </span>
                    </div>

                    <div className="ml-7 mb-3 text-[11px]" style={{ color: active ? "rgba(237,232,218,0.42)" : "#9E9282" }}>
                      {dir.methods?.[0] || "方法待细化"} · {evidenceCount} 条文献依据
                    </div>

                    <div className="ml-7 flex items-center gap-2">
                      <div className="h-[3px] flex-1 overflow-hidden rounded-full" style={{ background: active ? "rgba(237,232,218,0.12)" : "#DDD8C8" }}>
                        <div className="h-full rounded-full" style={{ width: `${heat}%`, background: active ? "#BE5050" : "#1B2D1B" }} />
                      </div>
                      <span className="shrink-0 text-[10px]" style={{ color: active ? "rgba(237,232,218,0.42)" : "#9E9282", fontFamily: "monospace" }}>
                        评分 {heat}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </aside>

          {selectedDirection && (
            <section className="min-w-0 flex-1 overflow-y-auto" style={{ scrollbarWidth: "none" }}>
              <div className="sticky top-0 z-10 border-b border-[#ddd4c4] bg-[#f7f4ec] px-8 py-5">
                <div className="mb-1 flex items-center gap-2">
                  <span className="rounded border border-[rgba(130,40,40,0.2)] bg-[rgba(130,40,40,0.08)] px-2 py-0.5 text-[11px] text-[#822828]">
                    AI 生成方向
                  </span>
                  <span className="text-[11px] text-[#9e9282]">·</span>
                  <span className="text-[11px] text-[#be5050]">综合评分 {displayScore(selectedScore?.scores.overall)}</span>
                </div>
                <h3 className="text-2xl font-semibold leading-tight text-[#1a1612]" style={{ fontFamily: "var(--font-cormorant), serif" }}>
                  {selectedDirection.title}
                </h3>
              </div>

              <div className="space-y-6 px-8 py-6">
                <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                  <DirectionStatCard label="文献依据" value={`${evidenceCount} 条`} />
                  <DirectionStatCard label="综合评分" value={displayScore(selectedScore?.scores.overall)} />
                  <DirectionStatCard label="候选排名" value={`Top ${selectedIndex + 1}`} />
                </div>

                <p className="text-sm leading-8 text-[#3a3020]">{selectedDirection.background || "暂无研究背景说明。"}</p>

                <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                  <DirectionPanel title="多维评分">
                    {selectedScore ? (
                      <div className="space-y-3">
                        {DIRECTION_SCORE_DIMS.map((dim) => (
                          <ScoreBar
                            key={dim}
                            label={DIM_LABELS[dim]}
                            value={selectedScore.scores[dim]}
                          />
                        ))}
                      </div>
                    ) : (
                      <EmptyResearchState text="暂无评分数据" />
                    )}
                  </DirectionPanel>

                  <DirectionPanel title="发表场所与趋势">
                    <EmptyResearchState text="当前生成结果未返回趋势、顶会或期刊字段，暂不展示推测数据。" />
                  </DirectionPanel>
                </div>

                <DirectionPanel title="细分研究方向">
                  <ResearchChipGroup
                    items={[
                      ...(selectedDirection.objectives || []),
                      ...(selectedDirection.methods || []),
                      ...(selectedDirection.innovation || []),
                    ]}
                  />
                </DirectionPanel>

                <DirectionPanel title="研究问题与方法">
                  <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
                    <MiniList title="研究问题" items={selectedDirection.research_questions} />
                    <MiniList title="研究方法" items={selectedDirection.methods} />
                    <MiniList title="数据来源" items={selectedDirection.data_sources} />
                    <MiniList title="预期成果" items={selectedDirection.expected_outputs} />
                  </div>
                </DirectionPanel>

                <DirectionPanel title="研究空白与风险">
                  {(selectedDirection.risks || []).length > 0 ? (
                    <div className="space-y-2">
                      {selectedDirection.risks.map((risk, i) => (
                        <div
                          key={`${risk}-${i}`}
                          className="flex items-center gap-3 rounded-xl border border-[rgba(130,40,40,0.2)] bg-[rgba(130,40,40,0.08)] px-4 py-3"
                        >
                          <span className="shrink-0 text-[10px] text-[#be5050]" style={{ fontFamily: "monospace" }}>
                            {String(i + 1).padStart(2, "0")}
                          </span>
                          <span className="flex-1 text-[13.5px] text-[#1a1612]">{risk}</span>
                          <span className="text-[#be5050]">›</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <EmptyResearchState text="暂无风险或研究空白字段" />
                  )}
                </DirectionPanel>

                <button
                  className="w-full rounded-xl bg-[#1b2d1b] py-3 text-base font-semibold text-[#ede8da] transition-colors hover:bg-[#263b26] disabled:opacity-50"
                  disabled={loading || state.selectedDirectionIndex === null}
                  onClick={handleStage4Confirm}
                >
                  {state.selectedDirectionIndex === null
                    ? "请先选择一个研究方向"
                    : `确认选择「${selectedDirection.title}」并生成设计方案`}
                </button>
              </div>
            </section>
          )}
        </div>
      </div>
    );
  };

  const renderStage5 = () => (
    <div className="space-y-6">
      <section className="rounded-[26px] border border-[rgba(26,22,18,0.1)] bg-[#f7f4ec] p-6">
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1.18fr)_360px]">
          <div className="space-y-4">
            <div>
              <p className="text-[11px] uppercase tracking-[0.16em] text-[#9e9282]">Project Design</p>
              <h2 className="mt-2 text-3xl font-semibold text-[#1a1612]" style={{ fontFamily: "var(--font-cormorant), serif" }}>
                把研究方向整理成完整项目设计方案
              </h2>
              <p className="mt-3 max-w-2xl text-sm leading-7 text-[#5c5242]">
                这一阶段会把前面选定的研究方向扩展成可执行的项目设计，覆盖研究背景、问题、方法、技术路线、计划与预期成果。
              </p>
            </div>
            {state.design && (
              <div className="grid gap-4 md:grid-cols-4">
                <CompactStat label="研究目标" value={String(state.design.objectives?.length || 0)} hint="已抽取目标数量" />
                <CompactStat label="研究问题" value={String(state.design.research_questions?.length || 0)} hint="待回答问题数" />
                <CompactStat label="时间阶段" value={String(state.design.timeline?.length || 0)} hint="计划阶段划分" />
                <CompactStat label="参考文献" value={String(state.design.references?.length || 0)} hint="方案引用基础" />
              </div>
            )}
          </div>

          <div className="rounded-[24px] border border-[rgba(26,22,18,0.1)] bg-white p-5">
            <p className="text-[11px] uppercase tracking-[0.16em] text-[#9e9282]">Design Output</p>
            <h3 className="mt-2 text-2xl font-semibold text-[#1a1612]" style={{ fontFamily: "var(--font-cormorant), serif" }}>
              当前阶段产出
            </h3>
            <p className="mt-3 text-sm leading-7 text-[#5c5242]">
              系统已经把研究方向组织成后续可直接生成开题 PPT 与开题报告的结构化设计稿。
            </p>
            {state.design ? (
              <button
                className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-full bg-[#1b2d1b] px-6 py-3 text-sm font-medium text-[#ede8da] transition-colors hover:bg-[#263b26] disabled:opacity-50"
                disabled={loading}
                onClick={() => updateState({ currentStep: 6 })}
              >
                确认设计方案，选择生成成果
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 12h14m0 0-5-5m5 5-5 5" />
                </svg>
              </button>
            ) : (
              <div className="mt-5 rounded-[18px] border border-dashed border-[rgba(26,22,18,0.16)] bg-[#f7f4ec] px-4 py-5 text-center text-sm text-[#9e9282]">
                设计方案将在选择研究方向后自动生成。
              </div>
            )}
          </div>
        </div>
      </section>

      {state.design && (
        <div className="space-y-6">
          <section className="rounded-[26px] border border-[rgba(26,22,18,0.1)] bg-white p-6 shadow-[0_18px_60px_rgba(26,22,18,0.05)]">
            <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
              <div>
                <p className="text-[11px] uppercase tracking-[0.16em] text-[#9e9282]">Design Overview</p>
                <h3 className="mt-2 text-2xl font-semibold text-[#1a1612]" style={{ fontFamily: "var(--font-cormorant), serif" }}>
                  {state.design.topic}
                </h3>
              </div>
              <div className="rounded-full border border-[rgba(26,22,18,0.08)] bg-[#f7f4ec] px-3 py-1.5 text-[12px] text-[#5c5242]">
                已整理为可落地设计稿
              </div>
            </div>

            <div className="grid gap-4 xl:grid-cols-2">
              <InfoPanel title="研究背景" value={state.design.background} />
              <InfoPanel title="研究意义" value={state.design.significance} />
            </div>
          </section>

          <section className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_360px]">
            <div className="rounded-[26px] border border-[rgba(26,22,18,0.1)] bg-white p-6 shadow-[0_18px_60px_rgba(26,22,18,0.05)]">
              <div className="space-y-5">
                <DesignSection title="国内外研究现状">
                  <div className="space-y-3 text-sm text-gray-700">
                    <p><b className="text-dark">国内：</b>{state.design.literature_review?.domestic}</p>
                    <p><b className="text-dark">国际：</b>{state.design.literature_review?.international}</p>
                    {state.design.literature_review?.key_references?.length > 0 && (
                      <div>
                        <b className="text-dark">关键文献：</b>
                        <ul className="mt-2 list-disc pl-5">
                          {state.design.literature_review.key_references.map((r, i) => (
                            <li key={i}>{r}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                </DesignSection>

                <DesignSection title="当前研究不足">
                  <BulletList items={state.design.current_gaps} />
                </DesignSection>
                <DesignSection title="研究目标">
                  <BulletList items={state.design.objectives} ordered />
                </DesignSection>
                <DesignSection title="研究问题">
                  <BulletList items={state.design.research_questions} ordered />
                </DesignSection>
                <DesignSection title="研究内容">
                  {state.design.content?.map((phase, i) => (
                    <div key={i} className="mb-3 rounded-[18px] border border-[rgba(26,22,18,0.08)] bg-[#f7f4ec] p-4">
                      <p className="text-sm font-bold text-dark">{phase.phase}</p>
                      <ul className="mt-2 list-disc pl-5 text-xs text-gray-600 space-y-0.5">
                        {phase.tasks.map((t, j) => <li key={j}>{t}</li>)}
                      </ul>
                      <p className="mt-2 text-xs text-gray-400">产出：{phase.output}</p>
                    </div>
                  ))}
                </DesignSection>
                <DesignSection title="技术路线">
                  <BulletList items={state.design.technical_route} ordered />
                </DesignSection>
              </div>
            </div>

            <div className="space-y-4">
              <DirectionPanel title="研究方法">
                <BulletList items={state.design.methods} />
              </DirectionPanel>
              <DirectionPanel title="实验/系统设计">
                <p className="text-sm leading-7 text-[#5c5242]">{state.design.system_architecture}</p>
              </DirectionPanel>
              <DirectionPanel title="数据来源">
                <BulletList items={state.design.data_sources} />
              </DirectionPanel>
              <DirectionPanel title="评估指标">
                <BulletList items={state.design.evaluation_metrics} />
              </DirectionPanel>
              <DirectionPanel title="创新点">
                <BulletList items={state.design.innovation_points} />
              </DirectionPanel>
              <DirectionPanel title="可行性分析">
                <p className="text-sm leading-7 text-[#5c5242]">{state.design.feasibility}</p>
              </DirectionPanel>
            </div>
          </section>

          <section className="grid gap-4 xl:grid-cols-2">
            <div className="rounded-[26px] border border-[rgba(26,22,18,0.1)] bg-[#ede8da] p-6">
              <div className="mb-5">
                <p className="text-[11px] uppercase tracking-[0.16em] text-[#9e9282]">Timeline</p>
                <h3 className="mt-2 text-2xl font-semibold text-[#1a1612]" style={{ fontFamily: "var(--font-cormorant), serif" }}>
                  研究计划
                </h3>
              </div>
              <div className="space-y-3">
                {state.design.timeline?.map((t, i) => (
                  <div key={i} className="flex items-start gap-3 rounded-[18px] border border-[rgba(26,22,18,0.08)] bg-white/85 px-4 py-3 text-sm">
                    <span className="rounded-full border border-[rgba(27,45,27,0.12)] bg-[rgba(27,45,27,0.08)] px-3 py-1 text-xs font-medium whitespace-nowrap text-[#1b2d1b]">
                      {t.duration}
                    </span>
                    <div>
                      <span className="font-bold text-dark">{t.phase}</span>
                      <span className="ml-2 text-gray-500">{t.tasks.join("、")}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-[26px] border border-[rgba(26,22,18,0.1)] bg-white p-6 shadow-[0_18px_60px_rgba(26,22,18,0.05)]">
              <div className="mb-5">
                <p className="text-[11px] uppercase tracking-[0.16em] text-[#9e9282]">Expected Output</p>
                <h3 className="mt-2 text-2xl font-semibold text-[#1a1612]" style={{ fontFamily: "var(--font-cormorant), serif" }}>
                  预期成果与参考文献
                </h3>
              </div>
              <div className="space-y-5">
                <DesignSection title="预期成果">
                  <BulletList items={state.design.expected_outputs} />
                </DesignSection>
                <DesignSection title="参考文献">
                  <ul className="list-decimal pl-5 text-xs text-gray-500 space-y-0.5">
                    {state.design.references?.map((r, i) => <li key={i}>{r}</li>)}
                  </ul>
                </DesignSection>
              </div>
            </div>
          </section>
        </div>
      )}
    </div>
  );

  const renderStage6 = () => {
    const pptDownloadUrl = state.pptDownloadUrl
      ? `http://127.0.0.1:8000${state.pptDownloadUrl}`
      : null;
    const proposalDownloadUrl = state.proposal?.id
      ? `http://127.0.0.1:8000/api/proposal/${state.proposal.id}/download?format=${downloadFormat}`
      : null;

    return (
      <div className="space-y-6">
        <section className="rounded-[26px] border border-[rgba(26,22,18,0.1)] bg-[#f7f4ec] p-6">
          <div className="grid gap-5 xl:grid-cols-[minmax(0,1.18fr)_360px]">
            <div className="space-y-4">
              <div>
                <p className="text-[11px] uppercase tracking-[0.16em] text-[#9e9282]">Deliverables</p>
                <h2 className="mt-2 text-3xl font-semibold text-[#1a1612]" style={{ fontFamily: "var(--font-cormorant), serif" }}>
                  把研究方案输出成正式成果
                </h2>
                <p className="mt-3 max-w-2xl text-sm leading-7 text-[#5c5242]">
                  这里可以把已经确认的研究设计稿继续转成对外展示或汇报材料，包括开题 PPT 与完整开题报告，两项可以分别生成。
                </p>
              </div>

              <div className="grid gap-4 md:grid-cols-4">
                <CompactStat label="PPT 风格" value={String(pptStyles.length)} hint="当前可选模板数" />
                <CompactStat label="历史 PPT" value={String(historyPPTs.length)} hint="已生成的文件数" />
                <CompactStat label="报告章节" value={state.proposal ? String(state.proposal.sections.length) : "12"} hint="开题报告章节规模" />
                <CompactStat label="当前格式" value={downloadFormat.toUpperCase()} hint="报告下载格式" />
              </div>
            </div>

            <div className="rounded-[24px] border border-[rgba(26,22,18,0.1)] bg-white p-5">
              <p className="text-[11px] uppercase tracking-[0.16em] text-[#9e9282]">Output Summary</p>
              <h3 className="mt-2 text-2xl font-semibold text-[#1a1612]" style={{ fontFamily: "var(--font-cormorant), serif" }}>
                当前可直接生成
              </h3>
              <div className="mt-4 space-y-3 text-sm leading-7 text-[#5c5242]">
                <p>开题 PPT：适合答辩展示、汇报结构化表达。</p>
                <p>开题报告：适合形成完整文字版研究说明与参考文献输出。</p>
              </div>
            </div>
          </div>
        </section>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <div className="rounded-[26px] border border-[rgba(31,62,99,0.16)] bg-white p-5 shadow-[0_18px_60px_rgba(26,22,18,0.05)] space-y-4">
            <div className="flex items-center gap-2">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-[rgba(31,62,99,0.1)] text-[12px] font-bold text-[#1F3E63]">
                PPT
              </span>
              <div>
                <h3 className="font-bold text-dark">开题 PPT</h3>
                <p className="text-xs text-gray-400">.pptx 格式，多套视觉风格可选</p>
              </div>
            </div>

            <div>
              <p className="mb-2 text-xs text-gray-500">选择视觉风格</p>
              <div className="space-y-2">
                {pptStyles.map((style) => {
                  const selected = state.selectedPPTStyleId === style.id;
                  return (
                    <button
                      key={style.id}
                      type="button"
                      className={`w-full text-left rounded-[18px] border-2 p-3 transition-all ${
                        selected
                          ? "border-[#1F3E63] bg-[rgba(31,62,99,0.06)]"
                          : "border-gray-200 hover:border-[#1F3E63]/40"
                      }`}
                      onClick={() =>
                        updateState({
                          selectedPPTStyleId: style.id,
                          selectedPPTStyleName: style.name,
                        })
                      }
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-dark text-sm">{style.name}</span>
                        <span className="text-xs text-gray-400">{style.scene}</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            <button
              className="w-full rounded-full bg-[#1F3E63] py-3 text-sm font-medium text-white transition-colors hover:bg-[#294d7d] disabled:cursor-not-allowed disabled:opacity-50"
              disabled={state.pptGenerating}
              onClick={handleGeneratePPT}
            >
              {state.pptGenerating ? "后台生成中..." : "生成开题 PPT"}
            </button>

            {state.pptDownloadUrl && (
              <div className="space-y-2 rounded-[18px] border border-[rgba(27,45,27,0.12)] bg-[rgba(27,45,27,0.06)] p-4">
                <div className="flex items-center gap-2 text-sm">
                  <svg className="h-4 w-4 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  <span className="font-medium text-green-700">生成完成</span>
                </div>
                <p className="text-xs text-gray-600">{state.pptFilename}</p>
                {state.selectedPPTStyleName && (
                  <p className="text-xs text-gray-400">风格：{state.selectedPPTStyleName}</p>
                )}
                <a
                  href={pptDownloadUrl!}
                  download={state.pptFilename}
                  className="inline-block text-sm font-medium text-[#1F3E63] hover:text-[#294d7d]"
                >
                  下载 PPTX →
                </a>
              </div>
            )}
          </div>

          <div className="rounded-[26px] border border-[rgba(27,45,27,0.16)] bg-white p-5 shadow-[0_18px_60px_rgba(26,22,18,0.05)] space-y-4">
            <div className="flex items-center gap-2">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-[rgba(27,45,27,0.1)] text-[12px] font-bold text-[#1b2d1b]">
                DOC
              </span>
              <div>
                <h3 className="font-bold text-dark">开题报告</h3>
                <p className="text-xs text-gray-400">12 章节完整报告，.docx 格式</p>
              </div>
            </div>

            <div className="space-y-0.5 text-xs text-gray-500">
              <p>一、选题背景与研究意义</p>
              <p>二、国内外研究现状</p>
              <p>三、现有研究不足</p>
              <p>四、研究问题与研究目标</p>
              <p>五、研究内容 · 六、研究方法</p>
              <p>七、技术路线 · 八、创新点</p>
              <p>九、可行性分析 · 十、研究计划</p>
              <p>十一、预期成果 · 十二、参考文献</p>
            </div>

            <button
              className="w-full rounded-full bg-[#1b2d1b] py-3 text-sm font-medium text-white transition-colors hover:bg-[#263b26] disabled:cursor-not-allowed disabled:opacity-50"
              disabled={state.proposalGenerating}
              onClick={handleGenerateProposal}
            >
              {state.proposalGenerating ? "后台生成中..." : "生成开题报告"}
            </button>

            {state.proposal && (
              <div className="space-y-2 rounded-[18px] border border-[rgba(27,45,27,0.12)] bg-[rgba(27,45,27,0.06)] p-4">
                <div className="flex items-center gap-2 text-sm">
                  <svg className="h-4 w-4 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  <span className="font-medium text-green-700">生成完成 · {state.proposal.sections.length} 章节</span>
                </div>
                <p className="text-xs text-gray-600 font-medium">{state.proposal.title}</p>
                <div className="flex items-center gap-2">
                  <select
                    value={downloadFormat}
                    onChange={(e) => setDownloadFormat(e.target.value as "docx" | "pdf")}
                    className="rounded border border-gray-200 bg-white px-2 py-1 text-xs text-gray-600"
                  >
                    <option value="docx">DOCX</option>
                    <option value="pdf">PDF</option>
                  </select>
                  <a
                    href={proposalDownloadUrl!}
                    className="inline-block text-sm font-medium text-[#1b2d1b] hover:text-[#263b26]"
                  >
                    下载 {downloadFormat.toUpperCase()} →
                  </a>
                </div>
                <details className="mt-2">
                  <summary className="text-xs text-gray-400 cursor-pointer hover:text-gray-600">展开预览</summary>
                  <div className="mt-2 max-h-[400px] overflow-y-auto space-y-3">
                    {state.proposal.sections.map((sec) => (
                      <div key={sec.key}>
                        <h4 className="font-bold text-dark text-xs">{sec.title}</h4>
                        <p className="text-xs text-gray-600 whitespace-pre-wrap leading-relaxed">{sec.content}</p>
                      </div>
                    ))}
                  </div>
                </details>
              </div>
            )}
          </div>
        </div>

        {historyPPTs.length > 0 && (
          <section className="rounded-[26px] border border-[rgba(26,22,18,0.1)] bg-white p-6 shadow-[0_18px_60px_rgba(26,22,18,0.05)]">
            <h3 className="mb-3 text-center text-base font-bold text-dark">历史生成的 PPT</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 text-gray-400 text-xs">
                    <th className="text-left py-2 font-medium">文件名</th>
                    <th className="text-right py-2 font-medium">大小</th>
                    <th className="text-right py-2 font-medium">生成时间</th>
                    <th className="text-right py-2 font-medium">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {historyPPTs.map((ppt) => (
                    <tr key={ppt.filename} className="hover:bg-gray-50">
                      <td className="py-2 text-gray-700 max-w-[200px] truncate" title={ppt.filename}>
                        {ppt.filename}
                      </td>
                      <td className="py-2 text-right text-gray-500">
                        {ppt.size > 1024 ? `${(ppt.size / 1024).toFixed(1)} KB` : `${ppt.size} B`}
                      </td>
                      <td className="py-2 text-right text-gray-500">{ppt.created_at}</td>
                      <td className="py-2 text-right">
                        <a
                          href={`http://127.0.0.1:8000${ppt.download_url}`}
                          download={ppt.filename}
                          className="text-primary-500 hover:text-primary-700 text-xs font-medium"
                        >
                          下载
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {(state.pptDownloadUrl || state.proposal) && (
          <section className="rounded-[26px] border border-[rgba(26,22,18,0.1)] bg-[#ede8da] px-6 py-6 text-center">
            <button
              className="rounded-full border border-[rgba(27,45,27,0.16)] bg-white px-8 py-3 font-bold text-[#1b2d1b] transition-colors hover:bg-[rgba(27,45,27,0.06)]"
              onClick={reset}
            >
              开始新的研究
            </button>
            {state.projectId && (
              <div className="mt-4">
                <a
                  href={`/projects/${state.projectId}`}
                  className="inline-block rounded-full bg-[#1b2d1b] px-8 py-3 text-sm font-bold text-white transition-colors hover:bg-[#263b26]"
                >
                  进入论文阶段（上传成果 / 论文写作 / 答辩 PPT） →
                </a>
              </div>
            )}
          </section>
        )}
      </div>
    );
  };

  // ===== 主渲染 =====

  const stageContent = (() => {
    switch (state.currentStep) {
      case 1:
        return renderStage1();
      case 2:
        return renderStage2();
      case 3:
        return renderStage3();
      case 4:
        return renderStage4();
      case 5:
        return renderStage5();
      case 6:
        return renderStage6();
      default:
        return null;
    }
  })();

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 md:px-6">
      <div className="mb-6 overflow-hidden rounded-[30px] border border-[rgba(26,22,18,0.1)] bg-[#f7f4ec]">
        <div className="relative px-6 py-6 md:px-8 md:py-7">
          <div className="compass-grid absolute inset-0 opacity-40" />
          <div className="relative z-10 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl">
              <div className="inline-flex items-center gap-2 rounded-full border border-[rgba(26,22,18,0.1)] bg-white/80 px-3 py-1 text-[11px] uppercase tracking-[0.18em] text-[#5c5242]">
                <span className="h-1.5 w-1.5 rounded-full bg-[#7B2D26]" />
                Literature-driven Research Agent
              </div>
              <h1
                className="mt-4 text-[34px] font-semibold leading-[1.05] text-[#1a1612] md:text-[44px]"
                style={{ fontFamily: "var(--font-cormorant), serif" }}
              >
                从研究问题出发，先建立证据，再生成方向
              </h1>
              <p className="mt-3 max-w-2xl text-sm leading-7 text-[#5c5242] md:text-[15px]">
                首页现在采用问题驱动、证据优先的学术检索方式，把需求分析、文献检索和文献分析连成一条完整研究链，而不是分散的表单步骤。
              </p>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row lg:flex-col">
              <div className="rounded-[20px] border border-[rgba(26,22,18,0.08)] bg-white/80 px-4 py-3">
                <div className="text-[11px] uppercase tracking-[0.16em] text-[#9e9282]">Current Stage</div>
                <div className="mt-2 text-lg font-semibold text-[#1a1612]" style={{ fontFamily: "var(--font-cormorant), serif" }}>
                  第 {state.currentStep} 步：{STEP_NAMES[state.currentStep]}
                </div>
              </div>
              <a
                href="/chat"
                className="inline-flex items-center justify-center gap-2 rounded-full bg-[#1b2d1b] px-5 py-3 text-sm font-medium text-[#ede8da] transition-colors hover:bg-[#263b26]"
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                </svg>
                AI 学术对话
              </a>
            </div>
          </div>
        </div>
      </div>

      <StepIndicator currentStep={state.currentStep} onStepClick={goToStep} />

      <div className="mt-5 rounded-[30px] border border-[rgba(26,22,18,0.1)] bg-white p-5 shadow-[0_24px_80px_rgba(26,22,18,0.06)] md:p-6">
        <StageWrapper
          isLoading={loading}
          error={error}
          loadingMessage={`正在${STEP_NAMES[state.currentStep]}...`}
          onRetry={() => setError(null)}
        >
          {stageContent}
        </StageWrapper>
      </div>

      {state.currentStep > 1 && state.currentStep < 6 && (
        <div className="mt-5 flex justify-between">
          <button
            className="rounded-full border border-[rgba(26,22,18,0.08)] bg-[#f7f4ec] px-5 py-2.5 text-sm text-[#5c5242] transition-colors hover:text-[#1a1612]"
            onClick={() => goToStep(state.currentStep - 1)}
          >
            ← 返回上一步
          </button>
          <button
            className="rounded-full border border-[rgba(27,45,27,0.14)] bg-[rgba(27,45,27,0.08)] px-5 py-2.5 text-sm text-[#1b2d1b] transition-colors hover:bg-[rgba(27,45,27,0.12)]"
            onClick={() => goToStep(state.currentStep + 1)}
          >
            跳过此步 →
          </button>
        </div>
      )}

      {state.currentStep > 1 && (
        <div className="mt-6 text-center">
          <button
            className="text-xs text-[#9e9282] transition-colors hover:text-[#7B2D26]"
            onClick={reset}
          >
            重新开始
          </button>
        </div>
      )}
    </div>
  );
}

// ========== 小型 UI 组件 ==========

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="text-sm">
      <span className="text-gray-400">{label}：</span>
      <span className="text-gray-700">{value}</span>
    </div>
  );
}

function SearchModeCard({
  mode,
  active,
  onClick,
}: {
  mode: ResearchMode;
  active: boolean;
  onClick: () => void;
}) {
  const meta = MODE_META[mode];
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full rounded-[20px] border px-4 py-4 text-left transition-all"
      style={{
        borderColor: active ? meta.accent : "rgba(26,22,18,0.08)",
        background: active ? `${meta.accent}14` : "#f7f4ec",
        boxShadow: active ? `0 12px 30px ${meta.accent}18` : "none",
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] uppercase tracking-[0.16em]" style={{ color: active ? meta.accent : "#9e9282" }}>
            {meta.eyebrow}
          </p>
          <h4 className="mt-2 text-lg font-semibold text-[#1a1612]" style={{ fontFamily: "var(--font-cormorant), serif" }}>
            {meta.label}
          </h4>
          <p className="mt-2 text-[12.5px] leading-6 text-[#5c5242]">{meta.description}</p>
        </div>
        <span
          className="mt-1 h-3 w-3 shrink-0 rounded-full border"
          style={{
            borderColor: active ? meta.accent : "rgba(26,22,18,0.12)",
            background: active ? meta.accent : "transparent",
          }}
        />
      </div>
    </button>
  );
}

function ScopePill({
  active,
  label,
  description,
  onClick,
}: {
  active: boolean;
  label: string;
  description: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="min-w-[180px] flex-1 rounded-[18px] border px-4 py-3 text-left transition-all"
      style={{
        borderColor: active ? "rgba(27,45,27,0.22)" : "rgba(26,22,18,0.08)",
        background: active ? "rgba(27,45,27,0.08)" : "#fffdf8",
      }}
    >
      <div className="text-sm font-medium text-[#1a1612]">{label}</div>
      <div className="mt-1 text-[12px] leading-6 text-[#5c5242]">{description}</div>
    </button>
  );
}

function EvidenceRouteCard({
  item,
}: {
  item: { step: string; title: string; description: string };
}) {
  return (
    <div className="rounded-[18px] border border-[rgba(237,232,218,0.12)] bg-[rgba(237,232,218,0.04)] px-4 py-3">
      <div className="flex items-start gap-3">
        <span
          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[rgba(237,232,218,0.16)] text-[11px] text-[rgba(237,232,218,0.72)]"
          style={{ fontFamily: "monospace" }}
        >
          {item.step}
        </span>
        <div>
          <div className="text-sm font-medium text-[#ede8da]">{item.title}</div>
          <div className="mt-1 text-[12px] leading-6 text-[rgba(237,232,218,0.58)]">{item.description}</div>
        </div>
      </div>
    </div>
  );
}

function SourceChip({
  source,
}: {
  source: keyof typeof SOURCE_META;
}) {
  return (
    <div className="flex items-center justify-between rounded-[18px] border border-[rgba(26,22,18,0.08)] bg-white/80 px-4 py-3">
      <div className="flex items-center gap-3">
        <span className="h-2.5 w-2.5 rounded-full" style={{ background: SOURCE_META[source].color }} />
        <span className="text-sm font-medium text-[#1a1612]">{SOURCE_META[source].label}</span>
      </div>
      <span className="text-[11px] uppercase tracking-[0.16em] text-[#9e9282]">source</span>
    </div>
  );
}

function CompactStat({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <div className="rounded-[18px] border border-[rgba(26,22,18,0.08)] bg-white/80 px-4 py-4">
      <div className="text-[11px] uppercase tracking-[0.16em] text-[#9e9282]">{label}</div>
      <div className="mt-2 text-lg font-semibold text-[#1a1612]" style={{ fontFamily: "var(--font-cormorant), serif" }}>
        {value}
      </div>
      <div className="mt-1 text-[12px] text-[#5c5242]">{hint}</div>
    </div>
  );
}

function SourceSummaryCard({
  label,
  count,
  color,
}: {
  label: string;
  count: number;
  color: string;
}) {
  return (
    <div className="rounded-[20px] border border-[rgba(26,22,18,0.08)] bg-[#f7f4ec] px-4 py-4">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-medium text-[#1a1612]">{label}</span>
        <span className="h-2.5 w-2.5 rounded-full" style={{ background: color }} />
      </div>
      <div className="mt-4 text-[28px] font-medium text-[#1a1612]" style={{ fontFamily: "monospace" }}>
        {count}
      </div>
      <div className="mt-1 text-[12px] text-[#5c5242]">篇候选文献</div>
    </div>
  );
}

function InfoPanel({ title, value }: { title: string; value: string }) {
  return (
    <div className="rounded-[18px] border border-[rgba(26,22,18,0.08)] bg-[#f7f4ec] p-4">
      <div className="text-[11px] uppercase tracking-[0.16em] text-[#9e9282]">{title}</div>
      <div className="mt-2 text-sm leading-7 text-[#1a1612]">{value}</div>
    </div>
  );
}

function TagPanel({ title, items }: { title: string; items: string[] }) {
  if (!items?.length) return null;
  return (
    <div className="rounded-[18px] border border-[rgba(26,22,18,0.08)] bg-[#f7f4ec] p-4">
      <div className="text-[11px] uppercase tracking-[0.16em] text-[#9e9282]">{title}</div>
      <div className="mt-3 flex flex-wrap gap-2">
        {items.map((item, i) => (
          <span
            key={`${title}-${item}-${i}`}
            className="rounded-full border border-[rgba(26,22,18,0.08)] bg-white px-3 py-1.5 text-[12px] text-[#5c5242]"
          >
            {item}
          </span>
        ))}
      </div>
    </div>
  );
}

function AnalysisMiniCard({ title, value }: { title: string; value: string }) {
  return (
    <div className="rounded-[16px] border border-[rgba(26,22,18,0.08)] bg-white px-4 py-3">
      <div className="text-[11px] uppercase tracking-[0.16em] text-[#9e9282]">{title}</div>
      <div className="mt-2 text-[13px] leading-6 text-[#5c5242]">{value}</div>
    </div>
  );
}

function InsightPanel({
  title,
  count,
  tone,
  children,
}: {
  title: string;
  count: number;
  tone: "warm" | "danger";
  children: React.ReactNode;
}) {
  const accent = tone === "warm" ? "#8c6a2a" : "#7B2D26";
  const background = tone === "warm" ? "rgba(140,106,42,0.08)" : "rgba(123,45,38,0.08)";

  return (
    <div className="rounded-[24px] border border-[rgba(26,22,18,0.1)] bg-white p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <div className="text-[11px] uppercase tracking-[0.16em] text-[#9e9282]">{title}</div>
          <div className="mt-2 text-xl font-semibold text-[#1a1612]" style={{ fontFamily: "var(--font-cormorant), serif" }}>
            {title}
          </div>
        </div>
        <span
          className="rounded-full border px-3 py-1 text-[12px]"
          style={{ borderColor: `${accent}26`, color: accent, background }}
        >
          {count}
        </span>
      </div>
      {children}
    </div>
  );
}

function TagRow({ label, items }: { label: string; items: string[] }) {
  if (!items?.length) return null;
  return (
    <div className="flex items-start gap-2 text-sm">
      <span className="text-gray-400 shrink-0 mt-1">{label}：</span>
      <div className="flex flex-wrap gap-1.5">
        {items.map((item, i) => (
          <span key={i} className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded-md text-xs">
            {item}
          </span>
        ))}
      </div>
    </div>
  );
}

function Section({
  title,
  count,
  children,
}: {
  title: string;
  count?: number;
  children: React.ReactNode;
}) {
  return (
    <div>
      <h3 className="font-bold text-dark text-base mb-2">
        {title}
        {count !== undefined && (
          <span className="ml-2 text-xs text-gray-400 font-normal">({count} 篇)</span>
        )}
      </h3>
      {children}
    </div>
  );
}

function DesignSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border-b border-gray-100 pb-4 last:border-b-0">
      <h3 className="font-bold text-dark text-sm mb-2 flex items-center gap-2">
        <span className="w-1 h-4 bg-primary-500 rounded-full" />
        {title}
      </h3>
      <div className="text-sm text-gray-700">{children}</div>
    </div>
  );
}

function BulletList({ items, ordered }: { items: string[]; ordered?: boolean }) {
  if (!items?.length) return <span className="text-gray-400 text-xs">暂无数据</span>;
  if (ordered) {
    return (
      <ol className="list-decimal pl-5 space-y-1 text-sm text-gray-700">
        {items.map((item, i) => (
          <li key={i}>{item}</li>
        ))}
      </ol>
    );
  }
  return (
    <ul className="list-disc pl-5 space-y-1 text-sm text-gray-700">
      {items.map((item, i) => (
        <li key={i}>{item}</li>
      ))}
    </ul>
  );
}

function PaperCard({ paper }: { paper: Paper }) {
  const [expanded, setExpanded] = useState(false);
  const authors =
    paper.authors?.length > 3
      ? paper.authors.slice(0, 3).join(", ") + " 等"
      : paper.authors?.join(", ") || "未知";

  const sourceLabel: Record<string, string> = {
    openalex: "OpenAlex",
    semantic_scholar: "Semantic Scholar",
    cnki: "CNKI 知网",
    cqvip: "维普",
  };
  const sourceColor: Record<string, string> = {
    openalex: "bg-blue-50 text-blue-600",
    semantic_scholar: "bg-purple-50 text-purple-600",
    cnki: "bg-red-50 text-red-600",
    cqvip: "bg-indigo-50 text-indigo-600",
  };

  const score = paper.final_score ?? paper.relevance_score ?? paper.quality_score ?? null;
  const hasAbstract = Boolean(paper.abstract?.trim());
  const abstractText = paper.abstract?.trim() || "当前记录未返回摘要，可结合标题、期刊与入选理由判断是否值得进一步阅读。";

  return (
    <article className="rounded-[22px] border border-[rgba(26,22,18,0.08)] bg-[#f7f4ec] p-4 text-sm shadow-[0_8px_30px_rgba(26,22,18,0.03)] transition-colors hover:border-[rgba(27,45,27,0.16)]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <span
              className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-medium ${
                sourceColor[paper.source] || "bg-gray-100 text-gray-500"
              }`}
            >
              {sourceLabel[paper.source] || paper.source}
            </span>
            {paper.language && (
              <span className="rounded-full border border-[rgba(26,22,18,0.08)] bg-white px-2.5 py-1 text-[11px] text-[#5c5242]">
                {paper.language === "cn" ? "中文文献" : "英文文献"}
              </span>
            )}
            {score !== null && (
              <span className="rounded-full border border-[rgba(27,45,27,0.12)] bg-[rgba(27,45,27,0.08)] px-2.5 py-1 text-[11px] text-[#1b2d1b]">
                评分 {String(score)}
              </span>
            )}
          </div>
          <h4 className="pr-3 text-[20px] font-semibold leading-7 text-[#1a1612]" style={{ fontFamily: "var(--font-cormorant), serif" }}>
            {paper.title}
          </h4>
        </div>
        <div className="rounded-[18px] border border-[rgba(26,22,18,0.08)] bg-white px-4 py-3 text-right">
          <div className="text-[11px] uppercase tracking-[0.14em] text-[#9e9282]">Citations</div>
          <div className="mt-1 text-[22px] font-medium text-[#1a1612]" style={{ fontFamily: "monospace" }}>
            {paper.citation_count}
          </div>
        </div>
      </div>

      <p className="mt-3 text-[12px] leading-6 text-[#5c5242]">
        {authors} · {paper.venue || "未知期刊"} · {paper.year}
      </p>

      {(paper.quality_flags?.length || paper.why_selected) && (
        <div className="mt-4 space-y-2">
          {paper.quality_flags?.length ? (
            <div className="flex flex-wrap gap-1.5">
              {paper.quality_flags.map((flag) => (
                <span key={flag} className="rounded-full border border-[rgba(26,22,18,0.08)] bg-white px-2.5 py-1 text-[10px] text-[#5c5242]">
                  {flag}
                </span>
              ))}
            </div>
          ) : null}
          {paper.why_selected && (
            <div className="rounded-[16px] border border-[rgba(123,45,38,0.12)] bg-[rgba(123,45,38,0.06)] px-4 py-3 text-[12px] leading-6 text-[#5c5242]">
              <span className="mr-2 font-medium text-[#1a1612]">入选理由：</span>
              {paper.why_selected}
            </div>
          )}
        </div>
      )}

      <div className="mt-4 rounded-[18px] border border-[rgba(26,22,18,0.08)] bg-white px-4 py-4">
        <div className="mb-2 text-[11px] uppercase tracking-[0.16em] text-[#9e9282]">Abstract / Summary</div>
        <p className="text-[13px] leading-7 text-[#5c5242]">
          {expanded ? abstractText : abstractText.slice(0, 320) + (abstractText.length > 320 ? "..." : "")}
        </p>
        {hasAbstract && abstractText.length > 320 && (
          <button
            className="mt-2 text-[12px] font-medium text-[#1b2d1b] hover:underline"
            onClick={() => setExpanded(!expanded)}
          >
            {expanded ? "收起摘要" : "展开摘要"}
          </button>
        )}
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <div className="text-[12px] text-[#9e9282]">
          {paper.doi ? `DOI: ${paper.doi}` : "当前记录未返回 DOI"}
        </div>
        {paper.url && (
          <a
            href={paper.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-full border border-[rgba(27,45,27,0.12)] bg-[rgba(27,45,27,0.08)] px-4 py-2 text-[12px] font-medium text-[#1b2d1b] transition-colors hover:bg-[rgba(27,45,27,0.12)]"
          >
            查看原文
            <span>↗</span>
          </a>
        )}
      </div>
    </article>
  );
}

function DirectionStatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-[rgba(26,22,18,0.11)] bg-[#f7f4ec] p-4">
      <div className="mb-2 text-[11.5px] text-[#5c5242]">{label}</div>
      <div className="text-[22px] font-medium text-[#1a1612]" style={{ fontFamily: "monospace" }}>
        {value}
      </div>
    </div>
  );
}

function DirectionPanel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-[rgba(26,22,18,0.11)] bg-[#f7f4ec] p-5">
      <div className="mb-4 flex items-center gap-2">
        <span className="h-3.5 w-0.5 rounded-full bg-[#1b2d1b]" />
        <h4 className="text-[12.5px] font-semibold text-[#1a1612]">{title}</h4>
      </div>
      {children}
    </section>
  );
}

function ScoreBar({ label, value }: { label: string; value: number }) {
  const width = normalizeScore(value);
  return (
    <div className="flex items-center gap-3 text-xs">
      <span className="w-20 shrink-0 text-[#5c5242]">{label}</span>
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-[#ddd8c8]">
        <div className="h-full rounded-full bg-[#1b2d1b]" style={{ width: `${width}%` }} />
      </div>
      <span className="w-10 text-right font-medium text-[#1a1612]" style={{ fontFamily: "monospace" }}>
        {displayScore(value)}
      </span>
    </div>
  );
}

function ResearchChipGroup({ items }: { items: string[] }) {
  const unique = Array.from(new Set((items || []).filter(Boolean))).slice(0, 12);
  if (unique.length === 0) return <EmptyResearchState text="暂无细分方向字段" />;
  return (
    <div className="flex flex-wrap gap-2">
      {unique.map((item, index) => (
        <span
          key={`${item}-${index}`}
          className="rounded-full border px-3 py-1.5 text-[12.5px]"
          style={{
            background: index === 0 ? "rgba(27,45,27,0.08)" : "#ede8da",
            borderColor: index === 0 ? "rgba(27,45,27,0.15)" : "rgba(26,22,18,0.11)",
            color: "#1a1612",
          }}
        >
          → {item}
        </span>
      ))}
    </div>
  );
}

function MiniList({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="rounded-xl border border-[rgba(26,22,18,0.08)] bg-[#ede8da] p-4">
      <div className="mb-2 text-[12px] font-medium text-[#1a1612]">{title}</div>
      {items?.length ? (
        <ul className="space-y-2">
          {items.slice(0, 5).map((item, index) => (
            <li key={`${item}-${index}`} className="flex gap-2 text-[12.5px] leading-6 text-[#5c5242]">
              <span className="shrink-0 text-[#9e9282]" style={{ fontFamily: "monospace" }}>
                {String(index + 1).padStart(2, "0")}
              </span>
              <span>{item}</span>
            </li>
          ))}
        </ul>
      ) : (
        <span className="text-xs text-[#9e9282]">暂无数据</span>
      )}
    </div>
  );
}

function EmptyResearchState({ text }: { text: string }) {
  return (
    <div className="rounded-xl border border-dashed border-[rgba(26,22,18,0.16)] bg-[#ede8da] px-4 py-5 text-center text-xs text-[#9e9282]">
      {text}
    </div>
  );
}

function normalizeScore(value: number | null | undefined) {
  const numeric = Number(value ?? 0);
  const scaled = numeric <= 10 ? numeric * 10 : numeric;
  return Math.max(0, Math.min(100, Math.round(scaled)));
}

function displayScore(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return "暂无";
  const numeric = Number(value);
  return numeric <= 10 ? `${numeric}/10` : `${numeric}/100`;
}

const DIRECTION_SCORE_DIMS = [
  "literature_foundation",
  "innovation",
  "feasibility",
  "data_availability",
  "thesis_value",
] as const;

// 评分维度中文标签
const DIM_LABELS: Record<(typeof DIRECTION_SCORE_DIMS)[number], string> = {
  literature_foundation: "文献基础",
  innovation: "创新性",
  feasibility: "可行性",
  data_availability: "数据可得性",
  thesis_value: "论文价值",
};
