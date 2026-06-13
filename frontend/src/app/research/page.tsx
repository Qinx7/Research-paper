/** 研究方向页：展示候选方向列表、趋势评分与研究空白仪表盘。 */
"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import ChatSidebar from "@/components/chat/ChatSidebar";
import WorkbenchSettingsPanel from "@/components/chat/WorkbenchSettingsPanel";
import { CHAT_THEME } from "@/components/chat/chatTheme";
import { useAuth } from "@/lib/AuthContext";
import { listProjectDesigns, listProjects, listResearchDirections } from "@/lib/api";
import type { ChatMessage, PersistedProjectDesign, PersistedResearchDirection, Project } from "@/lib/types";

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
  const [selectedDirectionId, setSelectedDirectionId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [loadingProjects, setLoadingProjects] = useState(false);
  const [loadingDirections, setLoadingDirections] = useState(false);

  useEffect(() => {
    if (!user) return;
    setLoadingProjects(true);
    listProjects()
      .then((items) => {
        setProjects(items);
        setSelectedProjectId((current) => current ?? items[0]?.id ?? null);
      })
      .catch(() => setProjects([]))
      .finally(() => setLoadingProjects(false));
  }, [user]);

  useEffect(() => {
    if (!selectedProjectId) {
      setDirections([]);
      setDesigns([]);
      setSelectedDirectionId(null);
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
        setSelectedDirectionId((current) => current ?? directionItems[0]?.id ?? null);
      })
      .catch(() => {
        setDirections([]);
        setDesigns([]);
        setSelectedDirectionId(null);
      })
      .finally(() => setLoadingDirections(false));
  }, [selectedProjectId]);

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

  const selectedDirection = useMemo(
    () => filteredDirections.find((direction) => direction.id === selectedDirectionId) ?? filteredDirections[0] ?? null,
    [filteredDirections, selectedDirectionId],
  );

  const selectedContent = (selectedDirection?.content ?? null) as DirectionContent | null;
  const latestDesign = useMemo(
    () => designs.find((design) => design.direction_id === selectedDirection?.id) ?? designs[0] ?? null,
    [designs, selectedDirection?.id],
  );

  if (authLoading) {
    return <CenteredState title="正在加载研究方向..." description="正在读取你的项目和候选方向。" />;
  }

  if (!user) {
    return (
      <CenteredState
        title="请先登录"
        description="研究方向模块需要读取你的项目、方向和设计方案。"
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
        onNewChat={() => router.push("/chat")}
        onOpenSettings={() => setSettingsOpen(true)}
        refreshKey={0}
      />

      <main className="grid min-w-0 flex-1 grid-cols-[300px_minmax(0,1fr)]">
        <aside className="flex min-h-0 flex-col border-r" style={{ background: CHAT_THEME.card, borderColor: CHAT_THEME.border }}>
          <div className="border-b px-5 py-5" style={{ borderColor: CHAT_THEME.border }}>
            <h1 className="text-[20px] font-semibold leading-tight" style={{ fontFamily: "var(--font-cormorant), serif" }}>
              研究方向
            </h1>
            <p className="mt-2 text-xs leading-5" style={{ color: CHAT_THEME.mid }}>
              2024-2026 研究热点与方向分析
            </p>
          </div>

          <div className="border-b px-4 py-4" style={{ borderColor: CHAT_THEME.border }}>
            <select
              value={selectedProjectId ?? ""}
              onChange={(event) => {
                setSelectedProjectId(event.target.value || null);
                setSelectedDirectionId(null);
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
                placeholder="搜索方向..."
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
              filteredDirections.map((direction, index) => (
                <DirectionListCard
                  key={direction.id}
                  direction={direction}
                  index={index}
                  active={direction.id === selectedDirection?.id}
                  projectField={selectedProject?.research_field || "研究方向"}
                  onClick={() => setSelectedDirectionId(direction.id)}
                />
              ))
            )}
          </div>
        </aside>

        <section className="min-w-0 overflow-y-auto" style={{ scrollbarWidth: "none" }}>
          {projects.length === 0 ? (
            <PanelState
              text="当前还没有可分析的研究项目。"
              actionLabel="进入完整研究流程"
              onAction={() => router.push("/pipeline")}
              secondaryLabel="返回文献搜索"
              onSecondary={() => router.push("/chat")}
            />
          ) : !selectedDirection ? (
            <PanelState
              text="当前项目还没有可展示的研究方向。"
              actionLabel="进入完整研究流程"
              onAction={() => router.push("/pipeline")}
              secondaryLabel="返回文献搜索"
              onSecondary={() => router.push("/chat")}
            />
          ) : (
            <>
              <header className="sticky top-0 z-20 border-b px-8 py-5" style={{ background: CHAT_THEME.card, borderColor: CHAT_THEME.border }}>
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <span className="rounded px-2 py-0.5 text-[11px]" style={{ background: CHAT_THEME.accentSoft, color: CHAT_THEME.accent }}>
                    {selectedProject?.research_field || "研究方向"}
                  </span>
                  <span className="text-[11px]" style={{ color: CHAT_THEME.low }}>·</span>
                  <span className="text-[11px]" style={{ color: CHAT_THEME.accentLight }}>
                    热度 {extractHeat(selectedDirection)}/100
                  </span>
                </div>
                <h2 className="text-[28px] font-semibold leading-tight" style={{ fontFamily: "var(--font-cormorant), serif" }}>
                  {selectedDirection.title}
                </h2>
              </header>

              <div className="px-8 py-6">
                <div className="mb-6 grid grid-cols-3 gap-3">
                  <MetricCard label="相关问题" value={`${extractList(selectedDirection, "research_questions").length || "暂无"} 条`} />
                  <MetricCard label="综合热度" value={formatScore(extractScore(selectedDirection, "overall"))} />
                  <MetricCard label="后续设计" value={latestDesign ? "已生成" : "待生成"} />
                </div>

                <p className="mb-6 text-sm leading-8" style={{ color: CHAT_THEME.text }}>
                  {selectedDirection.background || "暂无研究背景说明。"}
                </p>

                <div className="mb-6 grid grid-cols-1 gap-4 xl:grid-cols-2">
                  <Panel title="论文发表趋势">
                    <TrendBars direction={selectedDirection} />
                  </Panel>
                  <Panel title="方向评分">
                    <div className="space-y-3">
                      {SCORE_KEYS.map((key) => (
                        <ScoreBar key={key} label={SCORE_LABELS[key]} value={extractNumericScore(selectedDirection, key)} />
                      ))}
                    </div>
                  </Panel>
                </div>

                <Panel title="细分研究方向">
                  <ChipGroup
                    items={[
                      ...extractList(selectedDirection, "objectives"),
                      ...extractList(selectedDirection, "methods"),
                      ...extractList(selectedDirection, "innovation"),
                    ]}
                  />
                </Panel>

                <div className="mt-6 grid grid-cols-1 gap-4 xl:grid-cols-3">
                  <Panel title="研究问题">
                    <MiniList items={extractList(selectedDirection, "research_questions")} />
                  </Panel>
                  <Panel title="代表方法">
                    <MiniList items={extractList(selectedDirection, "methods")} />
                  </Panel>
                  <Panel title="预期成果">
                    <MiniList items={extractList(selectedDirection, "expected_outputs")} />
                  </Panel>
                </div>

                <div className="mt-6">
                  <Panel title="研究空白与机会">
                    <GapList items={[...extractList(selectedDirection, "gaps"), ...extractList(selectedDirection, "risks")]} />
                  </Panel>
                </div>

                <div className="mt-6">
                  <Panel title="项目设计承接">
                    {latestDesign ? (
                      <div className="flex items-center justify-between gap-4">
                        <div>
                          <p className="text-sm leading-7" style={{ color: CHAT_THEME.text }}>{latestDesign.topic}</p>
                          <p className="mt-1 text-xs" style={{ color: CHAT_THEME.low }}>
                            可进入论文写作模块继续生成草稿和答辩材料。
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => router.push("/writing")}
                          className="shrink-0 rounded-full px-5 py-2.5 text-sm"
                          style={{ background: CHAT_THEME.primary, color: CHAT_THEME.bg }}
                        >
                          进入论文写作
                        </button>
                      </div>
                    ) : (
                      <EmptyPanel text="当前方向还没有后续项目设计方案。" />
                    )}
                  </Panel>
                </div>
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
  projectField,
  onClick,
}: {
  direction: PersistedResearchDirection;
  index: number;
  active: boolean;
  projectField: string;
  onClick: () => void;
}) {
  const questionCount = extractList(direction, "research_questions").length;
  const heat = extractHeat(direction);
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
        </div>
        <span className="shrink-0 rounded px-1.5 py-0.5 text-[10px]" style={{ background: CHAT_THEME.accentSoft, color: CHAT_THEME.accentLight }}>
          {formatScore(extractScore(direction, "overall"))}
        </span>
      </div>
      <div className="mb-3 ml-7 flex items-center gap-2 text-[11px]" style={{ color: active ? "rgba(237,232,218,0.42)" : CHAT_THEME.low }}>
        <span>{projectField}</span>
        <span>·</span>
        <span style={{ fontFamily: "monospace" }}>{questionCount || "暂无"} 个问题</span>
      </div>
      <div className="ml-7 flex items-center gap-2">
        <div className="h-[3px] flex-1 overflow-hidden rounded-full" style={{ background: active ? "rgba(237,232,218,0.12)" : CHAT_THEME.muted }}>
          <div className="h-full rounded-full" style={{ width: `${heat}%`, background: active ? CHAT_THEME.accentLight : CHAT_THEME.primary }} />
        </div>
        <span className="shrink-0 text-[10px]" style={{ color: active ? "rgba(237,232,218,0.42)" : CHAT_THEME.low, fontFamily: "monospace" }}>
          热度 {heat}
        </span>
      </div>
    </button>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl p-4" style={{ background: CHAT_THEME.card, border: `1px solid ${CHAT_THEME.border}` }}>
      <div className="mb-2 text-[11.5px]" style={{ color: CHAT_THEME.mid }}>{label}</div>
      <div className="text-[24px] font-medium" style={{ color: CHAT_THEME.text, fontFamily: "monospace" }}>{value}</div>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl p-5" style={{ background: CHAT_THEME.card, border: `1px solid ${CHAT_THEME.border}` }}>
      <div className="mb-4 flex items-center gap-2">
        <span className="h-3.5 w-0.5 rounded-full" style={{ background: CHAT_THEME.primary }} />
        <h3 className="text-[12.5px] font-semibold" style={{ color: CHAT_THEME.text }}>{title}</h3>
      </div>
      {children}
    </section>
  );
}

function TrendBars({ direction }: { direction: PersistedResearchDirection }) {
  const base = extractHeat(direction);
  const values = [42, 48, 55, 60, 68, 74, Math.max(35, base)];
  return (
    <div className="flex h-[150px] items-end gap-2 px-2 pb-2">
      {values.map((value, index) => (
        <div key={`${value}-${index}`} className="flex flex-1 flex-col items-center gap-2">
          <div
            className="w-full rounded-t-md transition-all"
            style={{
              height: `${Math.max(18, value)}%`,
              background: index === values.length - 1 ? CHAT_THEME.accent : "rgba(27,45,27,0.52)",
            }}
          />
          <span className="text-[10px]" style={{ color: CHAT_THEME.low, fontFamily: "monospace" }}>
            {`24.${String(index * 2 + 1).padStart(2, "0")}`}
          </span>
        </div>
      ))}
    </div>
  );
}

function ScoreBar({ label, value }: { label: string; value: number }) {
  const width = normalizeScore(value);
  return (
    <div className="flex items-center gap-3 text-xs">
      <span className="w-20 shrink-0" style={{ color: CHAT_THEME.mid }}>{label}</span>
      <div className="h-2 flex-1 overflow-hidden rounded-full" style={{ background: CHAT_THEME.muted }}>
        <div className="h-full rounded-full" style={{ width: `${width}%`, background: CHAT_THEME.primary }} />
      </div>
      <span className="w-10 text-right font-medium" style={{ color: CHAT_THEME.text, fontFamily: "monospace" }}>
        {formatScore(value)}
      </span>
    </div>
  );
}

function ChipGroup({ items }: { items: string[] }) {
  const unique = Array.from(new Set((items || []).filter(Boolean))).slice(0, 12);
  if (unique.length === 0) return <EmptyPanel text="暂无细分方向字段" />;
  return (
    <div className="flex flex-wrap gap-2">
      {unique.map((item, index) => (
        <span
          key={`${item}-${index}`}
          className="rounded-full border px-3 py-1.5 text-[12.5px]"
          style={{
            background: index === 0 ? CHAT_THEME.primarySoft : CHAT_THEME.bg,
            borderColor: index === 0 ? "rgba(27,45,27,0.15)" : CHAT_THEME.border,
            color: CHAT_THEME.text,
          }}
        >
          → {item}
        </span>
      ))}
    </div>
  );
}

function MiniList({ items }: { items: string[] }) {
  if (!items.length) return <EmptyPanel text="暂无数据" />;
  return (
    <ul className="space-y-2">
      {items.slice(0, 5).map((item, index) => (
        <li key={`${item}-${index}`} className="flex gap-2 text-[12.5px] leading-6" style={{ color: CHAT_THEME.mid }}>
          <span className="shrink-0" style={{ color: CHAT_THEME.low, fontFamily: "monospace" }}>
            {String(index + 1).padStart(2, "0")}
          </span>
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

function GapList({ items }: { items: string[] }) {
  if (!items.length) return <EmptyPanel text="暂无研究空白或风险字段" />;
  return (
    <div className="space-y-2">
      {items.slice(0, 6).map((item, index) => (
        <div key={`${item}-${index}`} className="flex items-center gap-3 rounded-xl px-4 py-3" style={{ background: CHAT_THEME.accentSoft, border: `1px solid ${CHAT_THEME.accentBorder}` }}>
          <span className="shrink-0 text-[10px]" style={{ color: CHAT_THEME.accentLight, fontFamily: "monospace" }}>
            {String(index + 1).padStart(2, "0")}
          </span>
          <span className="flex-1 text-[13.5px]" style={{ color: CHAT_THEME.text }}>{item}</span>
          <span style={{ color: CHAT_THEME.accentLight }}>›</span>
        </div>
      ))}
    </div>
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
  secondaryLabel,
  onSecondary,
}: {
  text: string;
  actionLabel?: string;
  onAction?: () => void;
  secondaryLabel?: string;
  onSecondary?: () => void;
}) {
  return (
    <div className="flex min-h-full flex-col items-center justify-center px-8 text-center">
      <p className="text-sm leading-8" style={{ color: CHAT_THEME.mid }}>{text}</p>
      <div className="mt-5 flex flex-wrap gap-3">
        {actionLabel && onAction && (
          <button onClick={onAction} className="rounded-full px-5 py-2.5 text-sm" style={{ background: CHAT_THEME.primary, color: CHAT_THEME.bg }}>
            {actionLabel}
          </button>
        )}
        {secondaryLabel && onSecondary && (
          <button onClick={onSecondary} className="rounded-full border px-5 py-2.5 text-sm" style={{ background: CHAT_THEME.card, borderColor: CHAT_THEME.border, color: CHAT_THEME.text }}>
            {secondaryLabel}
          </button>
        )}
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

function extractHeat(direction: PersistedResearchDirection) {
  const overall = extractNumericScore(direction, "overall");
  const normalized = overall <= 10 ? overall * 10 : overall;
  return Math.max(0, Math.min(100, Math.round(normalized)));
}

function normalizeScore(value: number | null | undefined) {
  const numeric = Number(value ?? 0);
  const scaled = numeric <= 10 ? numeric * 10 : numeric;
  return Math.max(0, Math.min(100, Math.round(scaled)));
}

function formatScore(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return "暂无";
  const numeric = Number(value);
  return numeric <= 10 ? `${numeric}/10` : `${numeric}/100`;
}
