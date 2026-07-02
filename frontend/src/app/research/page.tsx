/** 研究页：以分析仪表盘方式承接研究方向、项目设计与通用 PPT 生成。 */
"use client";

import { useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/AuthContext";
import {
  generateDesign,
  generatePPT,
  listPPTStyles,
  listProjectDesigns,
  listProjects,
  listResearchDirections,
  updateProject,
} from "@/lib/api";
import type {
  PersistedProjectDesign,
  PersistedResearchDirection,
  PPTStyle,
  Project,
  ProjectDesign,
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
  content?: string[];
  scores?: {
    feasibility?: number;
    overall?: number;
    innovation?: number;
    literature_foundation?: number;
    data_availability?: number;
    thesis_value?: number;
  };
};

type KeywordChip = {
  text: string;
  tone: "dark" | "blue" | "soft" | "neutral";
  size: "sm" | "md" | "lg";
};

const WORKBENCH_THEME = {
  pageBg: "linear-gradient(180deg,#fcfdff 0%,#f5f9ff 56%,#eef5ff 100%)",
  panel: "#ffffff",
  panelSoft: "#edf5ff",
  panelHigh: "#dce9ff",
  sidebarBg: "#f7fbff",
  border: "#d8e5f7",
  borderStrong: "#c7d9f1",
  text: "#152540",
  muted: "#6e84a4",
  faint: "#8fa4c0",
  primary: "#307cf6",
  blue: "#307cf6",
  blueDark: "#126fb0",
  blueSoft: "#edf7ff",
  green: "#1f9d68",
  warning: "#9a6700",
  danger: "#b42318",
  shadow: "0 22px 62px rgba(43,95,173,0.16)",
  softShadow: "0 8px 24px rgba(47,126,247,0.07)",
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

const ANALYSIS_NAV = [
  { href: "#trend", label: "方向总览", icon: "↗" },
  { href: "#questions", label: "研究问题", icon: "❞" },
  { href: "#methods", label: "方法路径", icon: "⌁" },
  { href: "#risks", label: "创新风险", icon: "!" },
  { href: "#handoff", label: "项目承接", icon: "→" },
];

export default function ResearchPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();

  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [directions, setDirections] = useState<PersistedResearchDirection[]>([]);
  const [designs, setDesigns] = useState<PersistedProjectDesign[]>([]);
  const [previewDirectionId, setPreviewDirectionId] = useState<string | null>(null);
  const [pptStyles, setPptStyles] = useState<PPTStyle[]>([]);
  const [query, setQuery] = useState("");
  const [loadingProjects, setLoadingProjects] = useState(false);
  const [loadingDirections, setLoadingDirections] = useState(false);
  const [settingCurrentDirection, setSettingCurrentDirection] = useState(false);
  const [designGenerating, setDesignGenerating] = useState(false);
  const [pptGenerating, setPptGenerating] = useState(false);
  const [directionMessage, setDirectionMessage] = useState<string | null>(null);
  const [designMessage, setDesignMessage] = useState<string | null>(null);
  const [pptMessage, setPptMessage] = useState<string | null>(null);
  const [pptUrl, setPptUrl] = useState<string | null>(null);
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
          if (current && items.some((item) => item.id === current)) return current;
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
      return;
    }

    setLoadingDirections(true);
    Promise.all([
      listResearchDirections(selectedProjectId),
      listProjectDesigns(selectedProjectId),
    ])
      .then(([directionItems, designItems]) => {
        setDirections(directionItems);
        setDesigns(designItems);
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
        ...(content?.risks || []),
        ...(content?.gaps || []),
      ].join(" ").toLowerCase();
      return haystack.includes(keyword);
    });
  }, [directions, query]);

  const previewDirection = useMemo(
    () => directions.find((direction) => direction.id === previewDirectionId) ?? null,
    [directions, previewDirectionId],
  );

  const currentDirection = useMemo(
    () => directions.find((direction) => direction.title === selectedProject?.selected_topic) ?? null,
    [directions, selectedProject?.selected_topic],
  );

  const previewDesign = useMemo(
    () => designs.find((design) => design.direction_id === previewDirection?.id) ?? null,
    [designs, previewDirection?.id],
  );

  const currentDesign = useMemo(
    () => designs.find((design) => design.direction_id === currentDirection?.id) ?? null,
    [designs, currentDirection?.id],
  );

  const currentDirectionNeedsConfirm = Boolean(previewDirection && currentDirection?.id !== previewDirection.id);
  const researchQuestions = previewDirection ? extractList(previewDirection, "research_questions") : [];
  const methods = previewDirection ? extractList(previewDirection, "methods") : [];
  const outputs = previewDirection ? extractList(previewDirection, "expected_outputs") : [];
  const innovation = previewDirection ? extractList(previewDirection, "innovation") : [];
  const risks = previewDirection ? extractList(previewDirection, "risks") : [];
  const gaps = previewDirection ? extractList(previewDirection, "gaps") : [];
  const dataSources = previewDirection ? extractList(previewDirection, "data_sources") : [];
  const keywordCloud = useMemo(
    () => buildKeywordCloud([...researchQuestions, ...methods, ...outputs, ...innovation, ...gaps]),
    [gaps, innovation, methods, outputs, researchQuestions],
  );
  const scoreSummary = previewDirection ? normalizeScore(extractNumericScore(previewDirection, "overall")) : normalizeScore(0);

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

  const refreshDesigns = async (projectId: string) => {
    const updatedDesigns = await listProjectDesigns(projectId);
    setDesigns(updatedDesigns);
  };

  const handleSelectProject = (projectId: string | null) => {
    setSelectedProjectId(projectId);
    setPptUrl(null);
    setDirectionMessage(null);
    setDesignMessage(null);
    setPptMessage(null);
  };

  const handleSetCurrentDirection = async () => {
    if (!selectedProjectId || !previewDirection) return;
    setSettingCurrentDirection(true);
    setDirectionMessage(null);
    setDesignMessage(null);
    setPptMessage(null);
    try {
      const updated = await updateProject(selectedProjectId, { selected_topic: previewDirection.title });
      setProjects((items) => items.map((item) => (item.id === updated.id ? updated : item)));
      setPptUrl(null);
      setDirectionMessage(`已将“${previewDirection.title}”设为当前研究方向，后续项目设计与通用 PPT 会基于该方向继续承接。`);
    } catch (err) {
      setDirectionMessage(err instanceof Error ? err.message : "设置为当前研究方向失败");
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
      await refreshDesigns(selectedProjectId);
      setDesignMessage("项目设计已生成。");
    } catch (err) {
      setDesignMessage(err instanceof Error ? err.message : "项目设计生成失败");
    } finally {
      setDesignGenerating(false);
    }
  };

  const handleGenerateProjectPpt = async () => {
    if (!currentDesign?.content) return;
    setPptGenerating(true);
    setPptMessage(null);
    try {
      const styleId = pptStyles[0]?.id || "academic_blue";
      const result = await generatePPT({
        design: currentDesign.content as unknown as ProjectDesign,
        template: styleId,
      });
      setPptUrl(result.download_url);
      setPptMessage("通用 PPT 已生成。");
    } catch (err) {
      setPptMessage(err instanceof Error ? err.message : "PPT 生成失败");
    } finally {
      setPptGenerating(false);
    }
  };

  if (authLoading) {
    return (
      <CenteredState
        title="正在加载研究方案"
        description="正在读取你的项目、候选方向与当前承接状态。"
      />
    );
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

  const userInitial = (user.username || user.email || "U").slice(0, 1).toUpperCase();

  return (
    <div className="flex h-screen flex-col overflow-hidden" style={{ background: WORKBENCH_THEME.pageBg, color: WORKBENCH_THEME.text }}>
      <header className="z-40 flex h-20 shrink-0 items-center justify-between border-b bg-white px-8 shadow-sm" style={{ borderColor: WORKBENCH_THEME.border }}>
        <div className="flex min-w-0 items-center gap-10">
          <button type="button" onClick={() => router.push("/")} className="text-2xl font-black tracking-tight" style={{ color: WORKBENCH_THEME.primary }}>
            ResearchCanvas
          </button>
          <nav className="hidden h-20 items-center gap-8 lg:flex">
            <HeaderNavButton label="首页" onClick={() => router.push("/")} />
            <HeaderNavButton label="论文写作" onClick={() => router.push(selectedProjectId ? `/writing?project_id=${selectedProjectId}` : "/writing")} />
          </nav>
        </div>

        <div className="mx-8 hidden max-w-2xl flex-1 xl:block">
          <div className="relative">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm" style={{ color: WORKBENCH_THEME.faint }}>⌕</span>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="搜索研究方向、方法、创新点..."
              className="h-12 w-full rounded-xl border bg-[#edf7ff] pl-11 pr-4 text-sm outline-none transition focus:border-[#307cf6] focus:ring-4 focus:ring-[#dce9ff]"
              style={{ borderColor: WORKBENCH_THEME.border }}
            />
          </div>
        </div>

        <div className="flex items-center gap-3">
          <StatusPill>{directions.length} 个候选方向</StatusPill>
          <button type="button" className="hidden rounded-full p-2.5 text-sm transition hover:bg-[#f0f3ff] sm:block" aria-label="研究页通知">
            ●
          </button>
          <div className="grid h-10 w-10 place-items-center rounded-xl border bg-[#f9fbff] text-sm font-black shadow-sm" style={{ borderColor: WORKBENCH_THEME.border }}>
            {userInitial}
          </div>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 overflow-hidden">
        <aside className="hidden w-[280px] shrink-0 flex-col gap-6 border-r bg-white p-6 xl:flex" style={{ borderColor: WORKBENCH_THEME.border }}>
          <div className="rounded-2xl border bg-[#f0f3ff] p-3" style={{ borderColor: WORKBENCH_THEME.border }}>
            <div className="flex items-center gap-4">
              <div className="grid h-12 w-12 place-items-center rounded-xl text-white shadow-lg" style={{ background: WORKBENCH_THEME.primary }}>
                研
              </div>
              <div className="min-w-0">
                <h2 className="truncate text-sm font-black">{selectedProject?.name || "暂无项目"}</h2>
                <p className="mt-0.5 truncate text-xs" style={{ color: WORKBENCH_THEME.muted }}>
                  {selectedProject?.research_field || "Research Analysis"}
                </p>
              </div>
            </div>

            <select
              value={selectedProjectId ?? ""}
              onChange={(event) => {
                handleSelectProject(event.target.value || null);
              }}
              className="mt-4 h-10 w-full rounded-xl border bg-white px-3 text-sm font-semibold outline-none"
              style={{ borderColor: WORKBENCH_THEME.border }}
            >
              {projects.length === 0 ? <option value="">暂无项目</option> : projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <p className="mb-2 px-3 text-[11px] font-black uppercase tracking-[0.18em]" style={{ color: WORKBENCH_THEME.faint }}>Research Analysis</p>
            {ANALYSIS_NAV.map((item, index) => (
              <a
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-semibold transition ${
                  index === 0 ? "bg-[#edf7ff] text-[#126fb0] shadow-sm" : "text-[#6e84a4] hover:bg-[#edf7ff] hover:text-[#126fb0]"
                }`}
              >
                <span className="grid h-5 w-5 place-items-center text-xs">{item.icon}</span>
                {item.label}
              </a>
            ))}
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto pr-1" style={{ scrollbarWidth: "thin" }}>
            <p className="mb-3 px-3 text-[11px] font-black uppercase tracking-[0.18em]" style={{ color: WORKBENCH_THEME.faint }}>候选方向</p>
            <div className="space-y-2">
              {loadingProjects || loadingDirections ? (
                <EmptyCard text="正在加载研究方向..." />
              ) : filteredDirections.length === 0 ? (
                <EmptyCard text="当前项目还没有可展示的研究方向。" />
              ) : filteredDirections.map((direction) => {
                const active = direction.id === previewDirectionId;
                const isCurrent = currentDirection?.id === direction.id;
                const hasDesign = designs.some((design) => design.direction_id === direction.id);
                return (
                  <button
                    key={direction.id}
                    type="button"
                    onClick={() => setPreviewDirectionId(direction.id)}
                    className="w-full rounded-2xl border p-3 text-left transition hover:-translate-y-0.5"
                    style={{
                      background: active ? WORKBENCH_THEME.blueSoft : WORKBENCH_THEME.panel,
                      borderColor: active ? "#bfd4ff" : WORKBENCH_THEME.border,
                      boxShadow: active ? "0 10px 22px rgba(15,35,55,0.06)" : "none",
                    }}
                  >
                    <div className="line-clamp-2 text-sm font-black">{direction.title}</div>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      <Badge tone={isCurrent ? "dark" : "muted"}>{isCurrent ? "当前" : "候选"}</Badge>
                      <Badge tone={hasDesign ? "green" : "muted"}>{hasDesign ? "设计" : "待设计"}</Badge>
                      <Badge>{formatScore(extractNumericScore(direction, "overall"))}</Badge>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="border-t pt-5" style={{ borderColor: WORKBENCH_THEME.border }}>
            <ActionButton
              label={pptGenerating ? "报告生成中..." : pptUrl ? "重新生成报告" : "导出分析报告"}
              onClick={handleGenerateProjectPpt}
              disabled={pptGenerating || !currentDesign}
              variant="primary"
              block
              size="lg"
            />
            {pptUrl ? (
              <a href={pptUrl} target="_blank" rel="noreferrer" className="mt-3 flex h-10 items-center justify-center rounded-xl border text-sm font-bold" style={{ borderColor: WORKBENCH_THEME.border }}>
                下载 PPT
              </a>
            ) : null}
          </div>
        </aside>

        <main className="min-h-0 flex-1 overflow-y-auto px-5 py-8 lg:px-10 lg:py-10" style={{ scrollbarWidth: "thin" }}>
          <div className="mb-6 grid gap-3 rounded-2xl border bg-white p-4 shadow-sm xl:hidden" style={{ borderColor: WORKBENCH_THEME.border }}>
            <select
              value={selectedProjectId ?? ""}
              onChange={(event) => handleSelectProject(event.target.value || null)}
              className="h-11 w-full rounded-xl border bg-white px-3 text-sm font-semibold outline-none"
              style={{ borderColor: WORKBENCH_THEME.border }}
            >
              {projects.length === 0 ? <option value="">暂无项目</option> : projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </select>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="搜索研究方向、方法、创新点..."
              className="h-11 w-full rounded-xl border bg-[#f0f3ff] px-3 text-sm outline-none"
              style={{ borderColor: WORKBENCH_THEME.border }}
            />
            {filteredDirections.length > 0 ? (
              <select
                value={previewDirectionId ?? ""}
                onChange={(event) => setPreviewDirectionId(event.target.value || null)}
                className="h-11 w-full rounded-xl border bg-white px-3 text-sm font-semibold outline-none"
                style={{ borderColor: WORKBENCH_THEME.border }}
              >
                {filteredDirections.map((direction) => (
                  <option key={direction.id} value={direction.id}>
                    {direction.title}
                  </option>
                ))}
              </select>
            ) : null}
          </div>

          {!selectedProject ? (
            <PanelState text="当前还没有可承接研究方案的项目。" actionLabel="返回首页开始检索" onAction={() => router.push("/")} />
          ) : !previewDirection ? (
            <PanelState text="当前项目还没有可展示的研究方向。" actionLabel="返回首页开始检索" onAction={() => router.push("/")} />
          ) : (
            <div className="mx-auto max-w-6xl">
              <section className="mb-10 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.18em]" style={{ color: WORKBENCH_THEME.muted }}>
                    <span>↗</span>
                    <span>Research Direction Analysis</span>
                  </div>
                  <h1 className="max-w-4xl text-4xl font-black leading-tight tracking-tight lg:text-5xl">
                    {previewDirection.title}
                  </h1>
                  <p className="max-w-3xl text-base leading-7" style={{ color: WORKBENCH_THEME.muted }}>
                    当前项目：<span className="font-semibold text-[#152540]">{selectedProject.name}</span>
                    {selectedProject.user_requirement ? ` · 原始需求：${selectedProject.user_requirement}` : ""}
                  </p>
                </div>
                <div className="flex flex-wrap gap-3">
                  <StatusPill>{selectedProject.research_field || "选题研究"}</StatusPill>
                  <StatusPill>{currentDirection?.id === previewDirection.id ? "当前方向" : "预览方向"}</StatusPill>
                  <StatusPill>{previewDesign ? "已生成项目设计" : "待生成项目设计"}</StatusPill>
                </div>
              </section>

              <DirectionTrendChart
                directions={filteredDirections.length > 0 ? filteredDirections : directions}
                previewDirectionId={previewDirection.id}
                currentDirectionId={currentDirection?.id ?? null}
                onSelect={setPreviewDirectionId}
              />

              <section className="mb-12 grid gap-6 lg:grid-cols-3">
                <ScoreDonutCard direction={previewDirection} />
                <KeywordCloudCard keywords={keywordCloud} />
                <HandoffStatusCard
                  currentDirectionConfirmed={currentDirection?.id === previewDirection.id}
                  previewDesign={previewDesign}
                  currentDesign={currentDesign}
                  pptUrl={pptUrl}
                  onWrite={() => router.push(selectedProjectId ? `/writing?project_id=${selectedProjectId}` : "/writing")}
                />
              </section>

              <section id="questions" className="mb-12 grid gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)]">
                <AnalysisCard title="研究问题与方法路径" eyebrow="Citations / Methodology">
                  <div className="grid gap-4 md:grid-cols-2">
                    <InfoBlock title="核心问题" items={researchQuestions} emptyText="暂无研究问题。" />
                    <InfoBlock title="研究方法" items={methods} emptyText="暂无研究方法。" />
                    <InfoBlock title="预期产出" items={outputs} emptyText="暂无预期产出。" />
                    <InfoBlock title="数据来源" items={dataSources} emptyText="暂无数据来源。" />
                  </div>
                </AnalysisCard>

                <AnalysisCard title="创新与风险" eyebrow="Authors 替代为真实方向洞察" id="risks">
                  <div className="space-y-4">
                    <InsightList title="创新要点" items={innovation} emptyText="暂无创新要点。" tone="blue" />
                    <InsightList title="潜在风险" items={risks.length ? risks : gaps} emptyText="暂无风险或研究空白。" tone="warning" />
                  </div>
                </AnalysisCard>
              </section>

              <section id="handoff" className="mb-12 rounded-2xl border bg-white p-6 shadow-sm" style={{ borderColor: WORKBENCH_THEME.border }}>
                <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <div className="text-xs font-black uppercase tracking-[0.16em]" style={{ color: WORKBENCH_THEME.faint }}>Project Handoff</div>
                    <h2 className="mt-2 text-2xl font-black">项目设计与成果承接</h2>
                    <p className="mt-2 max-w-2xl text-sm leading-6" style={{ color: WORKBENCH_THEME.muted }}>
                      这里保留现有流程：先确认研究方向，再生成项目设计，最后生成通用 PPT 或进入论文写作。
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-3">
                    {currentDirectionNeedsConfirm ? (
                      <ActionButton
                        label={settingCurrentDirection ? "设置中..." : "设为当前方向"}
                        onClick={handleSetCurrentDirection}
                        disabled={settingCurrentDirection}
                        variant="primary"
                      />
                    ) : null}
                    <ActionButton
                      label={designGenerating ? "生成中..." : previewDesign ? "重新生成项目设计" : "生成项目设计"}
                      onClick={handleGenerateDesign}
                      disabled={designGenerating}
                      variant={previewDesign ? "soft" : "primary"}
                    />
                    <ActionButton
                      label={pptGenerating ? "生成中..." : "生成 PPT"}
                      onClick={handleGenerateProjectPpt}
                      disabled={pptGenerating || !currentDesign}
                      variant="soft"
                    />
                    <ActionButton
                      label="进入论文写作"
                      onClick={() => router.push(selectedProjectId ? `/writing?project_id=${selectedProjectId}` : "/writing")}
                      variant="default"
                    />
                  </div>
                </div>
                <div className="mt-5 grid gap-4 md:grid-cols-2">
                  <StatusCard
                    title="项目设计"
                    status={previewDesign ? "已生成" : designGenerating ? "生成中" : "待生成"}
                    description={previewDesign ? previewDesign.topic : "基于当前研究方向生成结构化项目设计。"}
                  />
                  <StatusCard
                    title="通用 PPT"
                    status={pptUrl ? "已生成" : pptGenerating ? "生成中" : "待生成"}
                    description={currentDesign ? "基于当前项目设计生成展示用 PPT。" : "请先确认当前方向并生成项目设计。"}
                    downloads={pptUrl ? [{ label: "下载 PPT", href: pptUrl }] : []}
                  />
                </div>
                {directionMessage ? <InlineMessage text={directionMessage} isError={directionMessage.includes("失败")} /> : null}
                {designMessage ? <InlineMessage text={designMessage} isError={designMessage.includes("失败")} /> : null}
                {pptMessage ? <InlineMessage text={pptMessage} isError={pptMessage.includes("失败")} /> : null}
              </section>

              <section className="mb-12">
                <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                  <div>
                    <div className="text-xs font-black uppercase tracking-[0.16em]" style={{ color: WORKBENCH_THEME.faint }}>Direction Cards</div>
                    <h2 className="mt-2 text-2xl font-black">候选研究方向</h2>
                  </div>
                  <span className="text-sm font-semibold" style={{ color: WORKBENCH_THEME.muted }}>
                    共 {filteredDirections.length} 个匹配结果
                  </span>
                </div>
                <div className="space-y-5">
                  {filteredDirections.map((direction) => (
                    <DirectionCard
                      key={direction.id}
                      direction={direction}
                      active={direction.id === previewDirection.id}
                      isCurrent={currentDirection?.id === direction.id}
                      hasDesign={designs.some((design) => design.direction_id === direction.id)}
                      onPreview={() => setPreviewDirectionId(direction.id)}
                    />
                  ))}
                </div>
              </section>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

function HeaderNavButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex h-full items-center border-b-2 border-transparent text-sm font-bold transition hover:border-[#307cf6] hover:text-[#126fb0]"
      style={{ color: WORKBENCH_THEME.muted }}
    >
      {label}
    </button>
  );
}

function DirectionTrendChart({
  directions,
  previewDirectionId,
  currentDirectionId,
  onSelect,
}: {
  directions: PersistedResearchDirection[];
  previewDirectionId: string;
  currentDirectionId: string | null;
  onSelect: (id: string) => void;
}) {
  const visibleDirections = directions.slice(0, 8);
  return (
    <section id="trend" className="mb-10 rounded-2xl border bg-white p-6 shadow-sm" style={{ borderColor: WORKBENCH_THEME.border, boxShadow: WORKBENCH_THEME.softShadow }}>
      <div className="mb-8 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-black">候选方向评分趋势</h2>
          <p className="mt-1 text-sm" style={{ color: WORKBENCH_THEME.muted }}>用现有方向评分替代 Stitch 中的虚构年度论文趋势。</p>
        </div>
        <div className="flex flex-wrap gap-5 text-xs font-bold" style={{ color: WORKBENCH_THEME.muted }}>
          <span className="flex items-center gap-2"><span className="h-3 w-3 rounded-full bg-[#307cf6]" />综合评分</span>
          <span className="flex items-center gap-2"><span className="h-3 w-3 rounded-full bg-[#d3e4fe]" />当前预览</span>
        </div>
      </div>

      {visibleDirections.length === 0 ? (
        <EmptyCard text="暂无候选研究方向，先从首页检索并生成研究方向。" />
      ) : (
        <div className="flex h-[320px] items-end gap-4 border-b pb-6" style={{ borderColor: "rgba(198, 198, 205, 0.55)" }}>
          {visibleDirections.map((direction) => {
            const score = normalizeScore(extractNumericScore(direction, "overall"));
            const active = direction.id === previewDirectionId;
            const current = direction.id === currentDirectionId;
            return (
              <button
                key={direction.id}
                type="button"
                onClick={() => onSelect(direction.id)}
                className="group flex h-full min-w-0 flex-1 flex-col justify-end gap-3"
                title={direction.title}
              >
                <div
                  className={`relative w-full rounded-t-xl transition duration-300 group-hover:brightness-110 ${
                    active ? "border-2 border-[#cfe0ff] bg-white" : "bg-[linear-gradient(180deg,#4e91ff_0%,#2f76eb_100%)]"
                  }`}
                  style={{
                    height: `${Math.max(score.ratio, 8)}%`,
                    boxShadow: active ? "0 18px 34px rgba(17, 24, 39, 0.16)" : "0 10px 18px rgba(15, 23, 42, 0.12)",
                  }}
                >
                  {current ? (
                    <span className="absolute -top-9 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-lg bg-[#126fb0] px-2 py-1 text-[10px] font-black text-white shadow-lg">
                      当前
                    </span>
                  ) : null}
                </div>
                <span className={`line-clamp-2 text-center text-[11px] font-black ${active ? "text-[#126fb0]" : "text-[#8fa4c0]"}`}>
                  {direction.title}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}

function ScoreDonutCard({ direction }: { direction: PersistedResearchDirection }) {
  const overall = normalizeScore(extractNumericScore(direction, "overall"));
  const dash = 251;
  const offset = dash - (dash * overall.ratio) / 100;
  return (
    <section className="rounded-2xl border bg-white p-6 shadow-sm" style={{ borderColor: WORKBENCH_THEME.border, boxShadow: WORKBENCH_THEME.softShadow }}>
      <h3 className="mb-5 text-xl font-black">方向评分分布</h3>
      <div className="flex items-center justify-center py-5">
        <div className="relative h-40 w-40 rounded-full border-[12px]" style={{ borderColor: WORKBENCH_THEME.panelHigh }}>
          <svg className="absolute inset-[-12px] h-[calc(100%+24px)] w-[calc(100%+24px)] -rotate-90">
            <circle
              cx="50%"
              cy="50%"
              fill="transparent"
              r="40"
              stroke="#307cf6"
              strokeDasharray={dash}
              strokeDashoffset={offset}
              strokeLinecap="round"
              strokeWidth="12"
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-3xl font-black">{overall.label}</span>
            <span className="mt-1 text-xs font-black" style={{ color: WORKBENCH_THEME.faint }}>综合推荐</span>
          </div>
        </div>
      </div>
      <ScoreOverview direction={direction} />
    </section>
  );
}

function KeywordCloudCard({ keywords }: { keywords: KeywordChip[] }) {
  return (
    <section className="rounded-2xl border bg-white p-6 shadow-sm" style={{ borderColor: WORKBENCH_THEME.border, boxShadow: WORKBENCH_THEME.softShadow }}>
      <h3 className="mb-5 text-xl font-black">核心要点云</h3>
      {keywords.length > 0 ? (
        <div className="flex min-h-[190px] flex-wrap content-center gap-3">
          {keywords.map((keyword) => (
            <span
              key={keyword.text}
              className={`rounded-xl px-3 py-1.5 font-bold shadow-sm ${keyword.size === "lg" ? "text-lg" : keyword.size === "md" ? "text-sm" : "text-xs"}`}
              style={keywordPalette(keyword.tone)}
            >
              {keyword.text}
            </span>
          ))}
        </div>
      ) : (
        <EmptyCard text="暂无关键词，可先生成或刷新研究方向。" />
      )}
      <div className="mt-5 rounded-xl border bg-[#f9fbff] p-4 text-sm" style={{ borderColor: WORKBENCH_THEME.border, color: WORKBENCH_THEME.muted }}>
        热点来自研究问题、方法、创新点与预期产出，不使用外部假数据。
      </div>
    </section>
  );
}

function HandoffStatusCard({
  currentDirectionConfirmed,
  previewDesign,
  currentDesign,
  pptUrl,
  onWrite,
}: {
  currentDirectionConfirmed: boolean;
  previewDesign: PersistedProjectDesign | null;
  currentDesign: PersistedProjectDesign | null;
  pptUrl: string | null;
  onWrite: () => void;
}) {
  return (
    <section className="rounded-2xl border bg-white p-6 shadow-sm" style={{ borderColor: WORKBENCH_THEME.border, boxShadow: WORKBENCH_THEME.softShadow }}>
      <h3 className="mb-5 text-xl font-black">承接状态</h3>
      <div className="space-y-3">
        <StatusRow label="研究方向" value={currentDirectionConfirmed ? "已确认" : "预览中"} />
        <StatusRow label="项目设计" value={previewDesign ? "已生成" : "待生成"} />
        <StatusRow label="当前设计承接" value={currentDesign ? "已承接" : "待承接"} />
        <StatusRow label="通用 PPT" value={pptUrl ? "已生成" : "待生成"} />
      </div>
      <button
        type="button"
        onClick={onWrite}
        className="mt-5 h-11 w-full rounded-xl border text-sm font-black transition hover:bg-[#f0f3ff]"
        style={{ borderColor: WORKBENCH_THEME.border }}
      >
        进入论文写作
      </button>
    </section>
  );
}

function AnalysisCard({
  title,
  eyebrow,
  id,
  children,
}: {
  title: string;
  eyebrow: string;
  id?: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="rounded-2xl border bg-white p-6 shadow-sm" style={{ borderColor: WORKBENCH_THEME.border, boxShadow: WORKBENCH_THEME.softShadow }}>
      <div className="mb-5">
        <div className="text-xs font-black uppercase tracking-[0.16em]" style={{ color: WORKBENCH_THEME.faint }}>{eyebrow}</div>
        <h2 className="mt-2 text-2xl font-black">{title}</h2>
      </div>
      {children}
    </section>
  );
}

function InfoBlock({ title, items, emptyText }: { title: string; items: string[]; emptyText: string }) {
  return (
    <section id={title === "研究方法" ? "methods" : undefined} className="rounded-2xl border p-4" style={{ background: WORKBENCH_THEME.panelSoft, borderColor: WORKBENCH_THEME.border }}>
      <div className="text-sm font-black">{title}</div>
      <div className="mt-3 space-y-2">
        {items.length > 0 ? items.slice(0, 5).map((item, index) => (
          <div key={`${title}-${index}`} className="grid grid-cols-[28px_minmax(0,1fr)] gap-3">
            <div className="grid h-7 w-7 place-items-center rounded-lg bg-white text-xs font-black" style={{ color: WORKBENCH_THEME.blueDark }}>
              {String(index + 1).padStart(2, "0")}
            </div>
            <div className="text-sm leading-6" style={{ color: WORKBENCH_THEME.muted }}>{item}</div>
          </div>
        )) : <div className="text-sm" style={{ color: WORKBENCH_THEME.faint }}>{emptyText}</div>}
      </div>
    </section>
  );
}

function InsightList({
  title,
  items,
  emptyText,
  tone,
}: {
  title: string;
  items: string[];
  emptyText: string;
  tone: "blue" | "warning";
}) {
  const color = tone === "blue" ? WORKBENCH_THEME.blueDark : WORKBENCH_THEME.warning;
  const background = tone === "blue" ? WORKBENCH_THEME.blueSoft : "#fff7e6";
  return (
    <div>
      <div className="text-sm font-black">{title}</div>
      <div className="mt-3 space-y-2">
        {items.length > 0 ? items.slice(0, 5).map((item, index) => (
          <div key={`${title}-${index}`} className="rounded-xl border px-3 py-2 text-sm leading-6" style={{ background, borderColor: WORKBENCH_THEME.border, color }}>
            {item}
          </div>
        )) : <div className="text-sm" style={{ color: WORKBENCH_THEME.faint }}>{emptyText}</div>}
      </div>
    </div>
  );
}

function StatusCard({
  title,
  status,
  description,
  downloads = [],
}: {
  title: string;
  status: string;
  description: string;
  downloads?: { label: string; href: string }[];
}) {
  return (
    <div className="rounded-2xl border p-4" style={{ background: WORKBENCH_THEME.panelSoft, borderColor: WORKBENCH_THEME.border }}>
      <div className="flex items-center justify-between gap-3">
        <div className="text-sm font-black">{title}</div>
        <Badge tone={status.includes("已") ? "green" : status.includes("中") ? "blue" : "muted"}>{status}</Badge>
      </div>
      <p className="mt-3 text-sm leading-6" style={{ color: WORKBENCH_THEME.muted }}>{description}</p>
      {downloads.length > 0 ? (
        <div className="mt-4 flex flex-wrap gap-2">
          {downloads.map((item) => (
            <a
              key={item.label}
              href={item.href}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-9 items-center rounded-xl border bg-white px-3 text-sm font-bold"
              style={{ borderColor: WORKBENCH_THEME.border, color: WORKBENCH_THEME.text }}
            >
              {item.label}
            </a>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function DirectionCard({
  direction,
  active,
  isCurrent,
  hasDesign,
  onPreview,
}: {
  direction: PersistedResearchDirection;
  active: boolean;
  isCurrent: boolean;
  hasDesign: boolean;
  onPreview: () => void;
}) {
  const questions = extractList(direction, "research_questions");
  const score = normalizeScore(extractNumericScore(direction, "overall"));
  return (
    <article
      className="flex flex-col gap-5 rounded-2xl border bg-white p-6 shadow-sm transition hover:-translate-y-0.5 hover:shadow-xl md:flex-row"
      style={{ borderColor: active ? "#cfe0ff" : WORKBENCH_THEME.border }}
    >
      <div className="flex shrink-0 flex-row items-center gap-3 md:flex-col">
        <Badge tone={isCurrent ? "dark" : "muted"}>{isCurrent ? "当前" : "候选"}</Badge>
        <div className="hidden h-16 w-px bg-[#e5e7eb] md:block" />
        <span className="text-sm font-black">{score.label}</span>
      </div>
      <div className="min-w-0 flex-1">
        <h3 className="text-2xl font-black leading-tight transition hover:text-[#126fb0]">{direction.title}</h3>
        <p className="mt-3 line-clamp-2 text-sm leading-6" style={{ color: WORKBENCH_THEME.muted }}>
          {direction.background || "当前方向暂未补充背景说明。"}
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Badge tone={hasDesign ? "green" : "muted"}>{hasDesign ? "已有设计" : "待生成设计"}</Badge>
          {questions.slice(0, 2).map((item) => (
            <Badge key={item}>{item}</Badge>
          ))}
        </div>
      </div>
      <div className="flex shrink-0 items-center">
        <button
          type="button"
          onClick={onPreview}
          className="h-12 rounded-xl border px-4 text-sm font-black transition hover:bg-[#307cf6] hover:text-white"
          style={{ borderColor: WORKBENCH_THEME.border }}
        >
          预览
        </button>
      </div>
    </article>
  );
}

function StatusRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between rounded-xl border px-3 py-2 text-sm" style={{ borderColor: WORKBENCH_THEME.border, background: WORKBENCH_THEME.panelSoft }}>
      <span style={{ color: WORKBENCH_THEME.muted }}>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function InlineMessage({ text, isError = false }: { text: string; isError?: boolean }) {
  return (
    <div className="mt-3 text-sm leading-6" style={{ color: isError ? WORKBENCH_THEME.danger : WORKBENCH_THEME.blueDark }}>
      {text}
    </div>
  );
}

function ScoreOverview({ direction }: { direction: PersistedResearchDirection }) {
  return (
    <div className="space-y-3">
      {SCORE_KEYS.map((key) => {
        const score = normalizeScore(extractNumericScore(direction, key));
        return (
          <div key={key} className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1">
            <span className="text-sm" style={{ color: WORKBENCH_THEME.muted }}>{SCORE_LABELS[key]}</span>
            <span className="text-sm font-black">{score.label}</span>
            <div className="col-span-2 h-[7px] overflow-hidden rounded-full bg-[#e8eef5]">
              <div className="h-full rounded-full bg-[#307cf6]" style={{ width: `${score.ratio}%` }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ActionButton({
  label,
  onClick,
  disabled,
  variant = "default",
  block = false,
  size = "md",
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  variant?: "primary" | "soft" | "default";
  block?: boolean;
  size?: "md" | "lg";
}) {
  const palette = {
    primary: {
      background: WORKBENCH_THEME.primary,
      borderColor: WORKBENCH_THEME.primary,
      color: "#ffffff",
    },
    soft: {
      background: WORKBENCH_THEME.blueSoft,
      borderColor: "#b7dcfb",
      color: WORKBENCH_THEME.blueDark,
    },
    default: {
      background: WORKBENCH_THEME.panel,
      borderColor: WORKBENCH_THEME.border,
      color: WORKBENCH_THEME.text,
    },
  }[variant];

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`${block ? "w-full" : ""} ${size === "lg" ? "h-12" : "h-10"} rounded-xl border px-4 text-sm font-black transition disabled:cursor-not-allowed disabled:opacity-50`}
      style={palette}
    >
      {label}
    </button>
  );
}

function Badge({ children, tone = "default" }: { children: React.ReactNode; tone?: "default" | "muted" | "blue" | "green" | "dark" }) {
  const palette = {
    default: {
      background: "#ffffff",
      borderColor: WORKBENCH_THEME.border,
      color: WORKBENCH_THEME.muted,
    },
    muted: {
      background: "#ffffff",
      borderColor: WORKBENCH_THEME.border,
      color: WORKBENCH_THEME.faint,
    },
    blue: {
      background: WORKBENCH_THEME.blueSoft,
      borderColor: "#cfe4f8",
      color: WORKBENCH_THEME.blueDark,
    },
    green: {
      background: "#ecfdf5",
      borderColor: "#ccebdd",
      color: WORKBENCH_THEME.green,
    },
    dark: {
      background: WORKBENCH_THEME.primary,
      borderColor: WORKBENCH_THEME.primary,
      color: "#ffffff",
    },
  }[tone];

  return (
    <span className="inline-flex min-h-6 items-center rounded-lg border px-2.5 py-0.5 text-[11px] font-black" style={palette}>
      {children}
    </span>
  );
}

function StatusPill({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex h-9 items-center rounded-full border bg-white px-4 text-xs font-black shadow-sm" style={{ borderColor: WORKBENCH_THEME.border }}>
      {children}
    </span>
  );
}

function EmptyCard({ text }: { text: string }) {
  return (
    <div className="rounded-2xl border border-dashed p-4 text-sm" style={{ borderColor: WORKBENCH_THEME.borderStrong, background: WORKBENCH_THEME.panel, color: WORKBENCH_THEME.faint }}>
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
    <div className="flex min-h-[60vh] items-center justify-center">
      <div className="max-w-xl rounded-3xl border bg-white p-8 text-center" style={{ borderColor: WORKBENCH_THEME.border, boxShadow: WORKBENCH_THEME.shadow }}>
        <p className="text-sm leading-7" style={{ color: WORKBENCH_THEME.muted }}>{text}</p>
        {actionLabel && onAction ? <div className="mt-5"><ActionButton label={actionLabel} onClick={onAction} variant="primary" /></div> : null}
      </div>
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
    <div className="flex min-h-screen items-center justify-center px-6" style={{ background: WORKBENCH_THEME.pageBg }}>
      <div className="max-w-md rounded-3xl border bg-white p-8 text-center" style={{ borderColor: WORKBENCH_THEME.border, boxShadow: WORKBENCH_THEME.shadow }}>
        <h1 className="text-2xl font-black">{title}</h1>
        <p className="mt-4 text-sm leading-7" style={{ color: WORKBENCH_THEME.muted }}>{description}</p>
        {actionLabel && onAction ? <div className="mt-6"><ActionButton label={actionLabel} onClick={onAction} variant="primary" /></div> : null}
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

function normalizeScore(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return { raw: 0, ratio: 0, label: "暂无" };
  }
  const numeric = Number(value);
  const ratio = Math.max(0, Math.min(numeric <= 10 ? numeric * 10 : numeric, 100));
  return {
    raw: numeric,
    ratio,
    label: numeric <= 10 ? `${numeric}/10` : `${numeric}/100`,
  };
}

function formatScore(value: number | null | undefined) {
  return normalizeScore(value).label;
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function buildKeywordCloud(items: string[]): KeywordChip[] {
  const seen = new Set<string>();
  const normalized = items
    .flatMap((item) => item.split(/[，,、；;：:\s]/))
    .map((item) => item.trim())
    .filter((item) => item.length >= 2 && item.length <= 18)
    .filter((item) => {
      const key = item.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 10);

  return normalized.map((text, index) => ({
    text,
    tone: index === 0 ? "dark" : index % 3 === 0 ? "blue" : index % 3 === 1 ? "soft" : "neutral",
    size: index === 0 ? "lg" : index < 4 ? "md" : "sm",
  }));
}

function keywordPalette(tone: KeywordChip["tone"]): CSSProperties {
  if (tone === "dark") {
    return { background: WORKBENCH_THEME.primary, color: "#ffffff" };
  }
  if (tone === "blue") {
    return { background: "#d3e4fe", color: "#0b1c30" };
  }
  if (tone === "soft") {
    return { background: WORKBENCH_THEME.panelHigh, color: WORKBENCH_THEME.text };
  }
  return { background: "#f3f6fb", color: WORKBENCH_THEME.muted };
}
