/** 研究页：以研究方案详情页承接候选方向、项目设计与开题材料。 */
"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import ChatSidebar from "@/components/chat/ChatSidebar";
import WorkbenchSettingsPanel from "@/components/chat/WorkbenchSettingsPanel";
import { CHAT_THEME } from "@/components/chat/chatTheme";
import { useAuth } from "@/lib/AuthContext";
import {
  generateDesign,
  generatePPT,
  generateProposal,
  getLatestProjectProposal,
  listPPTStyles,
  listProjectDesigns,
  listProjects,
  listResearchDirections,
  updateProject,
} from "@/lib/api";
import { buildResearchWorkspaceState, getDirectionStatus } from "@/lib/researchWorkflow.mjs";
import type {
  ChatMessage,
  PersistedProjectDesign,
  PersistedResearchDirection,
  PPTStyle,
  Project,
  ProposalOut,
  ResearchDirection,
} from "@/lib/types";

type DirectionContent = {
  research_questions?: string[];
  methods?: string[];
  expected_outputs?: string[];
  innovation?: string[];
  risks?: string[];
  objectives?: string[];
  data_sources?: string[];
  gaps?: string[];
  scores?: {
    feasibility?: number;
    overall?: number;
    innovation?: number;
    literature_foundation?: number;
    data_availability?: number;
    thesis_value?: number;
  };
};

const SCORE_LABELS: Record<string, string> = {
  literature_foundation: "文献基础",
  innovation: "创新性",
  feasibility: "可行性",
  data_availability: "数据可得性",
  thesis_value: "论文价值",
};

const SCORE_KEYS = [
  "literature_foundation",
  "innovation",
  "feasibility",
  "data_availability",
  "thesis_value",
] as const;

export default function ResearchPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [directions, setDirections] = useState<PersistedResearchDirection[]>([]);
  const [designs, setDesigns] = useState<PersistedProjectDesign[]>([]);
  const [previewDirectionId, setPreviewDirectionId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [loadingProjects, setLoadingProjects] = useState(false);
  const [loadingDirections, setLoadingDirections] = useState(false);
  const [designGenerating, setDesignGenerating] = useState(false);
  const [settingCurrentDirection, setSettingCurrentDirection] = useState(false);
  const [directionMessage, setDirectionMessage] = useState<string | null>(null);
  const [designMessage, setDesignMessage] = useState<string | null>(null);
  const [proposalGenerating, setProposalGenerating] = useState(false);
  const [pptGenerating, setPptGenerating] = useState(false);
  const [latestProposal, setLatestProposal] = useState<ProposalOut | null>(null);
  const [proposalResult, setProposalResult] = useState<ProposalOut | null>(null);
  const [proposalPptUrl, setProposalPptUrl] = useState<string | null>(null);
  const [proposalMessage, setProposalMessage] = useState<string | null>(null);
  const [pptStyles, setPptStyles] = useState<PPTStyle[]>([]);
  const [preselectedProjectId, setPreselectedProjectId] = useState<string | null>(null);
  const [preselectedDirectionId, setPreselectedDirectionId] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    setPreselectedProjectId(params.get("project_id"));
    setPreselectedDirectionId(params.get("direction_id"));
  }, []);

  useEffect(() => {
    listPPTStyles().then(setPptStyles).catch(() => setPptStyles([]));
  }, []);

  useEffect(() => {
    if (!user) return;
    setLoadingProjects(true);
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
      .finally(() => setLoadingProjects(false));
  }, [preselectedProjectId, user]);

  useEffect(() => {
    if (!selectedProjectId) {
      setDirections([]);
      setDesigns([]);
      setPreviewDirectionId(null);
      setLatestProposal(null);
      return;
    }

    setLoadingDirections(true);
    Promise.all([
      listResearchDirections(selectedProjectId),
      listProjectDesigns(selectedProjectId),
      getLatestProjectProposal(selectedProjectId).catch(() => null),
    ])
      .then(([directionItems, designItems, proposal]) => {
        setDirections(directionItems);
        setDesigns(designItems);
        setLatestProposal(proposal);
        setPreviewDirectionId((current) => {
          if (current && directionItems.some((item) => item.id === current)) return current;
          if (preselectedDirectionId && directionItems.some((item) => item.id === preselectedDirectionId)) return preselectedDirectionId;
          return directionItems[0]?.id ?? null;
        });
      })
      .catch(() => {
        setDirections([]);
        setDesigns([]);
        setPreviewDirectionId(null);
        setLatestProposal(null);
      })
      .finally(() => setLoadingDirections(false));
  }, [preselectedDirectionId, selectedProjectId]);

  const selectedProject = useMemo(
    () => projects.find((project) => project.id === selectedProjectId) ?? null,
    [projects, selectedProjectId],
  );

  const filteredDirections = useMemo(() => {
    if (!query.trim()) return directions;
    const keyword = query.trim().toLowerCase();
    return directions.filter((direction) => {
      const content = direction.content as DirectionContent | null;
      const haystack = [
        direction.title,
        direction.background ?? "",
        ...(content?.research_questions || []),
        ...(content?.methods || []),
        ...(content?.innovation || []),
      ].join(" ").toLowerCase();
      return haystack.includes(keyword);
    });
  }, [directions, query]);

  const workspace = useMemo(
    () => buildResearchWorkspaceState({
      project: selectedProject,
      directions,
      designs,
      previewDirectionId,
    }),
    [designs, directions, previewDirectionId, selectedProject],
  );

  const previewDirection = workspace.previewDirection as PersistedResearchDirection | null;
  const currentDirection = workspace.currentDirection as PersistedResearchDirection | null;
  const previewDesign = workspace.previewDesign as PersistedProjectDesign | null;
  const currentDesign = workspace.currentDesign as PersistedProjectDesign | null;
  const previewContent = (previewDirection?.content ?? null) as DirectionContent | null;
  const currentDirectionLocked = Boolean(currentDirection && previewDirection && currentDirection.id !== previewDirection.id);

  const buildDirectionPayload = (direction: PersistedResearchDirection): ResearchDirection => {
    const content = (direction.content || {}) as Record<string, unknown>;
    return {
      title: direction.title,
      background: direction.background || String(content.background || ""),
      research_questions: asStringArray(content.research_questions),
      objectives: asStringArray(content.objectives),
      content: asStringArray(content.content),
      methods: asStringArray(content.methods),
      data_sources: asStringArray(content.data_sources),
      expected_outputs: asStringArray(content.expected_outputs),
      innovation: asStringArray(content.innovation),
      feasibility: String(content.feasibility || ""),
      risks: asStringArray(content.risks),
    };
  };

  const handleSetCurrentDirection = async () => {
    if (!selectedProjectId || !previewDirection) return;
    setSettingCurrentDirection(true);
    setDirectionMessage(null);
    setDesignMessage(null);
    setProposalMessage(null);
    try {
      const updated = await updateProject(selectedProjectId, { selected_topic: previewDirection.title });
      setProjects((items) => items.map((item) => item.id === updated.id ? updated : item));
      setProposalResult(null);
      setProposalPptUrl(null);
      setDirectionMessage(`已将“${previewDirection.title}”设为当前研究方向，下面的项目设计和开题材料将基于该方向承接。`);
    } catch (err) {
      setDirectionMessage(err instanceof Error ? err.message : "设为当前研究方向失败");
    } finally {
      setSettingCurrentDirection(false);
    }
  };

  const handleGenerateDesign = async () => {
    if (!previewDirection || !selectedProjectId) return;
    setDesignGenerating(true);
    setDesignMessage(null);
    try {
      await generateDesign({
        direction: buildDirectionPayload(previewDirection),
        requirement: selectedProject?.user_requirement || previewDirection.title,
        projectId: selectedProjectId,
        directionId: previewDirection.id,
      });
      const updatedDesigns = await listProjectDesigns(selectedProjectId);
      setDesigns(updatedDesigns);
      setDesignMessage("项目设计已生成。");
    } catch (err) {
      setDesignMessage(err instanceof Error ? err.message : "项目设计生成失败");
    } finally {
      setDesignGenerating(false);
    }
  };

  const handleGenerateProposal = async () => {
    if (!currentDesign || !selectedProjectId) return;
    setProposalGenerating(true);
    setProposalMessage(null);
    try {
      const proposal = await generateProposal({
        project_id: selectedProjectId,
        design_id: currentDesign.id,
      });
      setProposalResult(proposal);
      setLatestProposal(proposal);
      setProposalMessage("开题报告已生成。");
    } catch (err) {
      setProposalMessage(err instanceof Error ? err.message : "开题报告生成失败");
    } finally {
      setProposalGenerating(false);
    }
  };

  const handleGenerateProposalPpt = async () => {
    if (!currentDesign?.content) return;
    setPptGenerating(true);
    setProposalMessage(null);
    try {
      const styleId = pptStyles[0]?.id || "academic_blue";
      const result = await generatePPT({
        design: currentDesign.content as unknown as import("@/lib/types").ProjectDesign,
        template: styleId,
      });
      setProposalPptUrl(result.download_url);
      setProposalMessage("开题 PPT 已生成。");
    } catch (err) {
      setProposalMessage(err instanceof Error ? err.message : "开题 PPT 生成失败");
    } finally {
      setPptGenerating(false);
    }
  };

  if (authLoading) {
    return <CenteredState title="正在加载研究方案..." description="正在读取你的项目、候选方向与承接状态。" />;
  }

  if (!user) {
    return (
      <CenteredState
        title="请先登录"
        description="研究页需要读取你的项目、研究方向和项目设计。"
        actionLabel="前往登录"
        onAction={() => router.push("/login")}
      />
    );
  }

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: CHAT_THEME.bg, color: CHAT_THEME.text }}>
      <ChatSidebar
        activeModule="research"
        currentId={null}
        onSelect={(_id: string, _messages: ChatMessage[]) => {}}
        onNewChat={() => router.push("/")}
        onOpenSettings={() => setSettingsOpen(true)}
        refreshKey={0}
        searchEntryMode="home"
      />

      <main className="grid min-w-0 flex-1 grid-cols-[320px_minmax(0,1fr)]">
        <aside className="flex min-h-0 flex-col border-r" style={{ background: CHAT_THEME.card, borderColor: CHAT_THEME.border }}>
          <div className="border-b px-5 py-5" style={{ borderColor: CHAT_THEME.border }}>
            <h1 className="text-[20px] font-semibold leading-tight" style={{ fontFamily: "var(--font-cormorant), serif" }}>
              研究方案
            </h1>
            <p className="mt-2 text-xs leading-5" style={{ color: CHAT_THEME.mid }}>
              先预览候选方向，再确认当前方案并继续承接项目设计与开题材料。
            </p>
          </div>

          <div className="border-b px-4 py-4" style={{ borderColor: CHAT_THEME.border }}>
            <select
              value={selectedProjectId ?? ""}
              onChange={(event) => {
                setSelectedProjectId(event.target.value || null);
                setPreviewDirectionId(null);
              }}
              className="mb-3 h-10 w-full rounded-lg px-3 text-xs outline-none"
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

            <div className="rounded-lg px-3" style={{ background: CHAT_THEME.bg, border: `1px solid ${CHAT_THEME.border}` }}>
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="搜索候选方向..."
                className="h-10 w-full bg-transparent text-[13px] outline-none"
                style={{ color: CHAT_THEME.text }}
              />
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3" style={{ scrollbarWidth: "none" }}>
            {loadingProjects || loadingDirections ? (
              <div className="px-4 py-8 text-center text-sm" style={{ color: CHAT_THEME.mid }}>
                正在加载方向...
              </div>
            ) : filteredDirections.length === 0 ? (
              <EmptyPanel text="当前项目还没有可展示的研究方向。" />
            ) : (
              filteredDirections.map((direction, index) => {
                const status = getDirectionStatus(direction.id, workspace);
                const hasDesign = designs.some((design) => design.direction_id === direction.id);
                return (
                  <DirectionListCard
                    key={direction.id}
                    direction={direction}
                    index={index}
                    active={status.isPreview}
                    isCurrent={status.isCurrent}
                    hasDesign={hasDesign}
                    projectField={selectedProject?.research_field || "研究方向"}
                    onClick={() => setPreviewDirectionId(direction.id)}
                  />
                );
              })
            )}
          </div>
        </aside>

        <section className="min-w-0 overflow-y-auto" style={{ scrollbarWidth: "none" }}>
          {projects.length === 0 ? (
            <PanelState
              text="当前还没有可承接研究方案的项目。"
              actionLabel="返回首页开始检索"
              onAction={() => router.push("/")}
            />
          ) : !previewDirection ? (
            <PanelState
              text="当前项目还没有可展示的研究方向。"
              actionLabel="返回首页开始检索"
              onAction={() => router.push("/")}
            />
          ) : (
            <>
              <header className="sticky top-0 z-20 border-b px-8 py-5" style={{ background: CHAT_THEME.card, borderColor: CHAT_THEME.border }}>
                <div className="mb-3 flex flex-wrap items-center gap-2">
                  <Tag>{selectedProject?.research_field || "研究方向"}</Tag>
                  {currentDirection?.id === previewDirection.id ? <Tag tone="strong">当前方案</Tag> : <Tag tone="muted">预览中</Tag>}
                  {previewDesign ? <Tag tone="soft">该方向已有项目设计</Tag> : <Tag tone="muted">尚未生成项目设计</Tag>}
                </div>
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <h2 className="text-[30px] font-semibold leading-tight" style={{ fontFamily: "var(--font-cormorant), serif" }}>
                      {previewDirection.title}
                    </h2>
                    <p className="mt-3 max-w-4xl text-sm leading-7" style={{ color: CHAT_THEME.mid }}>
                      {previewDirection.background || "暂无研究背景说明。"}
                    </p>
                  </div>
                  {currentDirection?.id !== previewDirection.id ? (
                    <button
                      type="button"
                      onClick={handleSetCurrentDirection}
                      disabled={settingCurrentDirection}
                      className="rounded-full px-5 py-2.5 text-sm"
                      style={{ background: CHAT_THEME.primary, color: CHAT_THEME.bg }}
                    >
                      {settingCurrentDirection ? "设置中..." : "设为当前研究方向"}
                    </button>
                  ) : null}
                </div>
              </header>

              <div className="px-8 py-6">
                <section className="mb-6 rounded-xl p-4" style={{ background: CHAT_THEME.card, border: `1px solid ${CHAT_THEME.border}` }}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="text-[11px] font-semibold uppercase tracking-[0.18em]" style={{ color: CHAT_THEME.low }}>
                        当前承接状态
                      </div>
                      <p className="mt-2 text-sm leading-7" style={{ color: CHAT_THEME.text }}>
                        {currentDirection
                          ? `当前项目正在承接“${currentDirection.title}”。`
                          : "当前项目还没有明确的研究方向承接。"}
                        {currentDirectionLocked
                          ? ` 你现在预览的是“${previewDirection.title}”，如需继续后续承接，请先设为当前研究方向。`
                          : currentDesign
                            ? " 当前方向已经有项目设计，可继续生成开题材料。"
                            : " 当前方向还没有项目设计，建议先生成项目设计。"}
                      </p>
                      {directionMessage ? (
                        <p className="mt-2 text-xs leading-6" style={{ color: directionMessage.includes("失败") ? CHAT_THEME.warn : CHAT_THEME.accent }}>
                          {directionMessage}
                        </p>
                      ) : null}
                    </div>

                    {!currentDirection ? (
                      <button
                        type="button"
                        onClick={handleSetCurrentDirection}
                        disabled={settingCurrentDirection}
                        className="rounded-full px-5 py-2.5 text-sm"
                        style={{ background: CHAT_THEME.primary, color: CHAT_THEME.bg }}
                      >
                        {settingCurrentDirection ? "设置中..." : "将该方向设为当前方案"}
                      </button>
                    ) : null}
                  </div>
                </section>

                <section className="mb-6 rounded-xl p-5" style={{ background: CHAT_THEME.card, border: `1px solid ${CHAT_THEME.border}` }}>
                  <div className="mb-4 flex items-center gap-2">
                    <span className="h-3.5 w-0.5 rounded-full" style={{ background: CHAT_THEME.primary }} />
                    <h3 className="text-[12.5px] font-semibold" style={{ color: CHAT_THEME.text }}>研究方向详情</h3>
                  </div>

                  <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.4fr_0.8fr]">
                    <div className="space-y-5">
                      <DetailBlock title="核心研究问题" items={extractList(previewDirection, "research_questions")} emptyText="暂无研究问题。" />
                      <DetailBlock title="代表方法" items={extractList(previewDirection, "methods")} emptyText="暂无代表方法。" />
                      <DetailBlock title="预期成果" items={extractList(previewDirection, "expected_outputs")} emptyText="暂无预期成果。" />
                      <DetailBlock title="创新点与研究机会" items={[...extractList(previewDirection, "innovation"), ...extractList(previewDirection, "gaps")]} emptyText="暂无创新点或研究空白。" />
                    </div>

                    <div className="space-y-4">
                      <CompactScorePanel direction={previewDirection} />
                      <GapPanel items={extractList(previewDirection, "risks")} />
                    </div>
                  </div>
                </section>

                <section className="mb-6 rounded-xl p-5" style={{ background: CHAT_THEME.card, border: `1px solid ${CHAT_THEME.border}` }}>
                  <div className="mb-4 flex items-center gap-2">
                    <span className="h-3.5 w-0.5 rounded-full" style={{ background: CHAT_THEME.primary }} />
                    <h3 className="text-[12.5px] font-semibold" style={{ color: CHAT_THEME.text }}>项目设计</h3>
                  </div>

                  {currentDirectionLocked ? (
                    <InlineNotice
                      title="当前仅在预览该方向"
                      description={`当前项目承接的研究方向仍是“${currentDirection?.title || "未设置"}”。如需为“${previewDirection.title}”生成项目设计，请先设为当前研究方向。`}
                      actionLabel="设为当前研究方向"
                      onAction={handleSetCurrentDirection}
                      disabled={settingCurrentDirection}
                    />
                  ) : currentDesign ? (
                    <DesignSummaryCard
                      design={currentDesign}
                      message={designMessage}
                      onGenerate={handleGenerateDesign}
                      generating={designGenerating}
                      onOpenWriting={() => router.push("/writing")}
                    />
                  ) : (
                    <InlineNotice
                      title="当前方向还没有项目设计"
                      description="确认当前方向后，可以先生成项目设计，再继续承接开题报告和开题 PPT。"
                      actionLabel={designGenerating ? "生成中..." : "生成项目设计"}
                      onAction={handleGenerateDesign}
                      disabled={designGenerating}
                    />
                  )}
                </section>

                <section className="rounded-xl p-5" style={{ background: CHAT_THEME.card, border: `1px solid ${CHAT_THEME.border}` }}>
                  <div className="mb-4 flex items-center gap-2">
                    <span className="h-3.5 w-0.5 rounded-full" style={{ background: CHAT_THEME.primary }} />
                    <h3 className="text-[12.5px] font-semibold" style={{ color: CHAT_THEME.text }}>开题材料</h3>
                  </div>

                  {!currentDesign ? (
                    <InlineNotice
                      title="开题材料承接已锁定到当前方案"
                      description="请先确认当前研究方向，并生成项目设计后，再继续生成开题报告和开题 PPT。"
                    />
                  ) : (
                    <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                      <MaterialCard
                        title="开题报告"
                        subtitle={latestProposal?.title || proposalResult?.title || "尚未生成开题报告"}
                        status={latestProposal || proposalResult ? "已生成" : proposalGenerating ? "生成中" : "待生成"}
                        description={proposalMessage || "用于沉淀当前方向对应的正式开题文档。"}
                        actionLabel={proposalGenerating ? "生成中..." : "生成开题报告"}
                        onAction={handleGenerateProposal}
                        disabled={proposalGenerating}
                        downloads={(proposalResult || latestProposal) ? [
                          { label: "下载 DOCX", href: `/api/proposal/${(proposalResult || latestProposal)?.id}/download?format=docx` },
                          { label: "下载 PDF", href: `/api/proposal/${(proposalResult || latestProposal)?.id}/download?format=pdf` },
                        ] : []}
                      />
                      <MaterialCard
                        title="开题 PPT"
                        subtitle={proposalPptUrl ? "已生成当前方向的开题 PPT" : "尚未生成开题 PPT"}
                        status={proposalPptUrl ? "已生成" : pptGenerating ? "生成中" : "待生成"}
                        description={proposalMessage || "用于后续开题汇报展示，基于当前方向的项目设计生成。"}
                        actionLabel={pptGenerating ? "生成中..." : "生成开题 PPT"}
                        onAction={handleGenerateProposalPpt}
                        disabled={pptGenerating}
                        downloads={proposalPptUrl ? [{ label: "下载 PPT", href: proposalPptUrl }] : []}
                      />
                    </div>
                  )}
                </section>
              </div>
            </>
          )}
        </section>
      </main>

      {settingsOpen && <WorkbenchSettingsPanel onClose={() => setSettingsOpen(false)} />}
    </div>
  );
}

function DirectionListCard({
  direction,
  index,
  active,
  isCurrent,
  hasDesign,
  projectField,
  onClick,
}: {
  direction: PersistedResearchDirection;
  index: number;
  active: boolean;
  isCurrent: boolean;
  hasDesign: boolean;
  projectField: string;
  onClick: () => void;
}) {
  const questionCount = extractList(direction, "research_questions").length;
  const overallScore = extractNumericScore(direction, "overall");
  const statusLabel = isCurrent ? "当前方案" : active ? "预览中" : "候选方向";
  const designLabel = hasDesign ? "已有项目设计" : "待生成项目设计";

  return (
    <button
      type="button"
      onClick={onClick}
      className="mb-2 w-full rounded-xl border p-4 text-left transition-all"
      style={{
        background: active ? CHAT_THEME.primary : "transparent",
        borderColor: active ? "transparent" : CHAT_THEME.border,
        boxShadow: active ? "0 18px 40px rgba(27,45,27,0.13)" : "none",
      }}
    >
      <div className="mb-2 flex items-start gap-2.5">
        <span
          className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-[10px]"
          style={{
            background: active ? "rgba(237,232,218,0.12)" : CHAT_THEME.muted,
            color: active ? "rgba(237,232,218,0.55)" : CHAT_THEME.low,
            fontFamily: "monospace",
          }}
        >
          {index + 1}
        </span>
        <div className="min-w-0 flex-1">
          <div
            className="line-clamp-2 text-[13.5px] font-medium leading-5"
            style={{ color: active ? CHAT_THEME.bg : CHAT_THEME.text, fontFamily: "var(--font-cormorant), serif" }}
          >
            {direction.title}
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            <MiniTag active={active}>{statusLabel}</MiniTag>
            <MiniTag active={active} tone={hasDesign ? "success" : "muted"}>
              {designLabel}
            </MiniTag>
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <span className="rounded px-1.5 py-0.5 text-[10px]" style={{ background: CHAT_THEME.accentSoft, color: CHAT_THEME.accentLight }}>
            {formatScore(overallScore)}
          </span>
          {(isCurrent || active) ? (
            <span
              className="rounded px-1.5 py-0.5 text-[10px]"
              style={{
                background: isCurrent ? CHAT_THEME.primary : CHAT_THEME.muted,
                color: isCurrent ? CHAT_THEME.bg : CHAT_THEME.mid,
              }}
            >
              {isCurrent ? "已承接" : "预览"}
            </span>
          ) : null}
        </div>
      </div>
      <div className="ml-7 flex items-center gap-2 text-[11px]" style={{ color: active ? "rgba(237,232,218,0.42)" : CHAT_THEME.low }}>
        <span>{projectField}</span>
        <span>·</span>
        <span style={{ fontFamily: "monospace" }}>{questionCount || "暂无"} 个问题</span>
        <span>·</span>
        <span>{hasDesign ? "可继续承接" : "待继续承接"}</span>
      </div>
    </button>
  );
}

function CompactScorePanel({ direction }: { direction: PersistedResearchDirection }) {
  return (
    <div className="rounded-xl p-4" style={{ background: CHAT_THEME.bg, border: `1px solid ${CHAT_THEME.border}` }}>
      <div className="mb-3 text-[11px] font-semibold" style={{ color: CHAT_THEME.text }}>关键评分</div>
      <div className="space-y-3">
        {SCORE_KEYS.map((key) => (
          <ScoreRow key={key} label={SCORE_LABELS[key]} value={extractNumericScore(direction, key)} />
        ))}
      </div>
    </div>
  );
}

function GapPanel({ items }: { items: string[] }) {
  return (
    <div className="rounded-xl p-4" style={{ background: CHAT_THEME.bg, border: `1px solid ${CHAT_THEME.border}` }}>
      <div className="mb-3 text-[11px] font-semibold" style={{ color: CHAT_THEME.text }}>风险与限制</div>
      {items.length > 0 ? (
        <div className="space-y-2">
          {items.slice(0, 4).map((item, index) => (
            <div key={`${item}-${index}`} className="rounded-lg px-3 py-2 text-[12px] leading-6" style={{ background: CHAT_THEME.card, color: CHAT_THEME.mid }}>
              {item}
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-lg border border-dashed px-3 py-4 text-center text-xs" style={{ borderColor: CHAT_THEME.border, color: CHAT_THEME.low }}>
          暂无额外风险说明。
        </div>
      )}
    </div>
  );
}

function DetailBlock({
  title,
  items,
  emptyText,
}: {
  title: string;
  items: string[];
  emptyText: string;
}) {
  return (
    <section className="rounded-xl p-4" style={{ background: CHAT_THEME.bg, border: `1px solid ${CHAT_THEME.border}` }}>
      <div className="mb-3 text-[11px] font-semibold" style={{ color: CHAT_THEME.text }}>{title}</div>
      {items.length > 0 ? (
        <ul className="space-y-2">
          {items.slice(0, 6).map((item, index) => (
            <li key={`${item}-${index}`} className="flex gap-2 text-[13px] leading-6" style={{ color: CHAT_THEME.mid }}>
              <span className="shrink-0 text-[10px]" style={{ color: CHAT_THEME.low, fontFamily: "monospace" }}>
                {String(index + 1).padStart(2, "0")}
              </span>
              <span>{item}</span>
            </li>
          ))}
        </ul>
      ) : (
        <div className="rounded-lg border border-dashed px-3 py-4 text-center text-xs" style={{ borderColor: CHAT_THEME.border, color: CHAT_THEME.low }}>
          {emptyText}
        </div>
      )}
    </section>
  );
}

function DesignSummaryCard({
  design,
  message,
  onGenerate,
  generating,
  onOpenWriting,
}: {
  design: PersistedProjectDesign;
  message: string | null;
  onGenerate: () => void;
  generating: boolean;
  onOpenWriting: () => void;
}) {
  const topic = design.topic || "已生成项目设计";
  const content = (design.content || {}) as Record<string, unknown>;
  const objectives = asStringArray(content.objectives).slice(0, 3);
  const methods = asStringArray(content.methods).slice(0, 3);

  return (
    <div className="rounded-xl p-4" style={{ background: CHAT_THEME.bg, border: `1px solid ${CHAT_THEME.border}` }}>
      <div className="mb-2 text-sm font-medium" style={{ color: CHAT_THEME.text }}>{topic}</div>
      <p className="text-xs leading-6" style={{ color: CHAT_THEME.mid }}>
        当前研究方向已进入项目设计承接，可继续重新生成设计，或直接进入论文写作。
      </p>

      <div className="mt-4 grid grid-cols-1 gap-3 xl:grid-cols-2">
        <MiniInfoBlock title="研究目标" items={objectives} emptyText="暂无研究目标摘要。" />
        <MiniInfoBlock title="主要方法" items={methods} emptyText="暂无方法摘要。" />
      </div>

      {message ? (
        <p className="mt-4 text-xs" style={{ color: CHAT_THEME.accent }}>
          {message}
        </p>
      ) : null}

      <div className="mt-4 flex flex-wrap gap-3">
        <button
          type="button"
          onClick={onGenerate}
          disabled={generating}
          className="rounded-full border px-5 py-2.5 text-sm"
          style={{ borderColor: CHAT_THEME.border, color: CHAT_THEME.text }}
        >
          {generating ? "生成中..." : "重新生成项目设计"}
        </button>
        <button
          type="button"
          onClick={onOpenWriting}
          className="rounded-full px-5 py-2.5 text-sm"
          style={{ background: CHAT_THEME.primary, color: CHAT_THEME.bg }}
        >
          进入论文写作
        </button>
      </div>
    </div>
  );
}

function MiniInfoBlock({
  title,
  items,
  emptyText,
}: {
  title: string;
  items: string[];
  emptyText: string;
}) {
  return (
    <div className="rounded-lg p-3" style={{ background: CHAT_THEME.card, border: `1px solid ${CHAT_THEME.border}` }}>
      <div className="mb-2 text-[11px] font-semibold" style={{ color: CHAT_THEME.text }}>{title}</div>
      {items.length > 0 ? (
        <ul className="space-y-1.5">
          {items.map((item, index) => (
            <li key={`${item}-${index}`} className="text-[12px] leading-5" style={{ color: CHAT_THEME.mid }}>
              {item}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-[12px] leading-5" style={{ color: CHAT_THEME.low }}>{emptyText}</p>
      )}
    </div>
  );
}

function MaterialCard({
  title,
  subtitle,
  status,
  description,
  actionLabel,
  onAction,
  disabled,
  downloads,
}: {
  title: string;
  subtitle: string;
  status: string;
  description: string;
  actionLabel: string;
  onAction: () => void;
  disabled?: boolean;
  downloads: { label: string; href: string }[];
}) {
  return (
    <div className="rounded-xl p-4" style={{ background: CHAT_THEME.bg, border: `1px solid ${CHAT_THEME.border}` }}>
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <div className="text-sm font-medium" style={{ color: CHAT_THEME.text }}>{title}</div>
        <MiniTag>{status}</MiniTag>
      </div>
      <div className="text-xs leading-6" style={{ color: CHAT_THEME.mid }}>{subtitle}</div>
      <p className="mt-3 text-xs leading-6" style={{ color: CHAT_THEME.low }}>{description}</p>

      <div className="mt-4 flex flex-wrap gap-3">
        <button
          type="button"
          onClick={onAction}
          disabled={disabled}
          className="rounded-full border px-5 py-2.5 text-sm disabled:opacity-40"
          style={{ borderColor: CHAT_THEME.border, color: CHAT_THEME.text }}
        >
          {actionLabel}
        </button>
        {downloads.map((item) => (
          <a
            key={item.label}
            href={item.href}
            target="_blank"
            rel="noreferrer"
            className="rounded-full px-5 py-2.5 text-sm"
            style={{ background: CHAT_THEME.card, color: CHAT_THEME.text, border: `1px solid ${CHAT_THEME.border}` }}
          >
            {item.label}
          </a>
        ))}
      </div>
    </div>
  );
}

function InlineNotice({
  title,
  description,
  actionLabel,
  onAction,
  disabled,
}: {
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
  disabled?: boolean;
}) {
  return (
    <div className="rounded-xl border border-dashed px-4 py-5" style={{ background: CHAT_THEME.bg, borderColor: CHAT_THEME.border }}>
      <div className="text-sm font-medium" style={{ color: CHAT_THEME.text }}>{title}</div>
      <p className="mt-2 text-xs leading-6" style={{ color: CHAT_THEME.mid }}>{description}</p>
      {actionLabel && onAction ? (
        <button
          type="button"
          onClick={onAction}
          disabled={disabled}
          className="mt-4 rounded-full px-5 py-2.5 text-sm disabled:opacity-40"
          style={{ background: CHAT_THEME.primary, color: CHAT_THEME.bg }}
        >
          {actionLabel}
        </button>
      ) : null}
    </div>
  );
}

function ScoreRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between gap-4 text-xs">
      <span style={{ color: CHAT_THEME.mid }}>{label}</span>
      <span style={{ color: CHAT_THEME.text, fontFamily: "monospace" }}>{formatScore(value)}</span>
    </div>
  );
}

function Tag({
  children,
  tone = "soft",
}: {
  children: React.ReactNode;
  tone?: "soft" | "strong" | "muted";
}) {
  const styleMap = {
    soft: { background: CHAT_THEME.accentSoft, color: CHAT_THEME.accent },
    strong: { background: CHAT_THEME.primary, color: CHAT_THEME.bg },
    muted: { background: CHAT_THEME.muted, color: CHAT_THEME.mid },
  }[tone];

  return (
    <span className="rounded px-2 py-0.5 text-[11px]" style={styleMap}>
      {children}
    </span>
  );
}

function MiniTag({
  children,
  active = false,
  tone = "soft",
}: {
  children: React.ReactNode;
  active?: boolean;
  tone?: "soft" | "muted" | "success";
}) {
  const palette = {
    soft: {
      background: active ? "rgba(237,232,218,0.12)" : CHAT_THEME.accentSoft,
      color: active ? "rgba(237,232,218,0.78)" : CHAT_THEME.accent,
    },
    muted: {
      background: active ? "rgba(237,232,218,0.08)" : CHAT_THEME.muted,
      color: active ? "rgba(237,232,218,0.62)" : CHAT_THEME.mid,
    },
    success: {
      background: active ? "rgba(237,232,218,0.12)" : CHAT_THEME.primarySoft,
      color: active ? "rgba(237,232,218,0.78)" : CHAT_THEME.primary,
    },
  }[tone];

  return (
    <span
      className="rounded px-1.5 py-0.5 text-[10px]"
      style={palette}
    >
      {children}
    </span>
  );
}

function EmptyPanel({ text }: { text: string }) {
  return (
    <div className="rounded-xl border border-dashed px-4 py-5 text-center text-xs" style={{ background: CHAT_THEME.bg, borderColor: CHAT_THEME.border, color: CHAT_THEME.low }}>
      {text}
    </div>
  );
}

function PanelState({
  text,
  actionLabel,
  onAction,
}: {
  text: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <div className="flex min-h-full flex-col items-center justify-center px-8 text-center">
      <p className="text-sm leading-8" style={{ color: CHAT_THEME.mid }}>{text}</p>
      {actionLabel && onAction ? (
        <button onClick={onAction} className="mt-5 rounded-full px-5 py-2.5 text-sm" style={{ background: CHAT_THEME.primary, color: CHAT_THEME.bg }}>
          {actionLabel}
        </button>
      ) : null}
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
        {actionLabel && onAction ? (
          <button
            type="button"
            onClick={onAction}
            className="mt-6 rounded-full px-5 py-2.5 text-sm font-medium"
            style={{ background: CHAT_THEME.primary, color: CHAT_THEME.bg }}
          >
            {actionLabel}
          </button>
        ) : null}
      </div>
    </div>
  );
}

function extractList(direction: PersistedResearchDirection, key: keyof Omit<DirectionContent, "scores">) {
  const content = (direction.content ?? null) as DirectionContent | null;
  const value = content?.[key];
  return Array.isArray(value) ? value.filter(Boolean).map(String) : [];
}

function extractScore(direction: PersistedResearchDirection, key: keyof NonNullable<DirectionContent["scores"]>) {
  const content = (direction.content ?? null) as DirectionContent | null;
  const value = content?.scores?.[key];
  if (value !== null && value !== undefined) return value;
  if (key === "feasibility") return direction.feasibility_score;
  if (key === "overall") return direction.recommendation_score;
  return null;
}

function extractNumericScore(direction: PersistedResearchDirection, key: keyof NonNullable<DirectionContent["scores"]>) {
  const score = extractScore(direction, key);
  if (score === null || score === undefined || Number.isNaN(Number(score))) return 0;
  return Number(score);
}

function formatScore(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return "暂无";
  const numeric = Number(value);
  return numeric <= 10 ? `${numeric}/10` : `${numeric}/100`;
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}
