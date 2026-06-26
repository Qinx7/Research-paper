/** 选题研究三步面板：在首页检索结果态串联需求理解、文献分析和研究方向。 */
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { analyzeLiterature, analyzeRequirement, generateDirections } from "@/lib/api";
import type { ReactNode } from "react";
import { buildSourceStatusSections } from "@/lib/searchExplain.mjs";
import type {
  AnalyzeLiteratureResponse,
  AnalyzeRequirementResponse,
  DirectionScore,
  GenerateDirectionsResponse,
  LiteratureAnalysisInput,
  Paper,
  RequirementAnalysis,
  ResearchDirection,
  SearchDiagnostics,
  SearchSummary,
  SourceStatusInfo,
} from "@/lib/types";

type Props = {
  query: string;
  papers: Paper[];
  searchLoading: boolean;
  searchError: string | null;
  sourceSummary: string;
  sourceStatuses: Record<string, SourceStatusInfo>;
  searchSummary: SearchSummary | null;
  searchDiagnostics: SearchDiagnostics | null;
  referencesOpen: boolean;
  savingDirectionTitle: string | null;
  savedDirectionTitles: string[];
  directionSaveMessage: string | null;
  onOpenReferences: () => void;
  onSaveDirection: (direction: ResearchDirection, score?: DirectionScore | null) => Promise<void>;
  onOpenResearch: () => void;
};

type EvidenceProfile = {
  total: number;
  cnCount: number;
  enCount: number;
  unknownCount: number;
  sourceItems: { source: string; label: string; count: number }[];
  abnormalStatuses: { source: string; label: string; text: string; detail?: string }[];
  warnings: string[];
  statement: string;
  strengthLabel: string;
  strengthClass: string;
  topPapers: Paper[];
};

export default function TopicResearchPanel({
  query,
  papers,
  searchLoading,
  searchError,
  sourceSummary,
  sourceStatuses,
  searchSummary,
  searchDiagnostics,
  referencesOpen,
  savingDirectionTitle,
  savedDirectionTitles,
  directionSaveMessage,
  onOpenReferences,
  onSaveDirection,
  onOpenResearch,
}: Props) {
  const [requirementResult, setRequirementResult] = useState<AnalyzeRequirementResponse | null>(null);
  const [literatureResult, setLiteratureResult] = useState<AnalyzeLiteratureResponse | null>(null);
  const [directionsResult, setDirectionsResult] = useState<GenerateDirectionsResponse | null>(null);
  const [requirementLoading, setRequirementLoading] = useState(false);
  const [literatureAnalysisLoading, setLiteratureAnalysisLoading] = useState(false);
  const [directionsLoading, setDirectionsLoading] = useState(false);
  const [requirementError, setRequirementError] = useState<string | null>(null);
  const [literatureAnalysisError, setLiteratureAnalysisError] = useState<string | null>(null);
  const [directionsError, setDirectionsError] = useState<string | null>(null);
  const STORAGE_KEY = useMemo(() => `topic_research_snapshot::${query.trim()}`, [query]);
  const requirementRunKeyRef = useRef("");
  const literatureRunKeyRef = useRef("");
  const directionsRunKeyRef = useRef("");
  const evidenceProfile = useMemo(
    () => buildEvidenceProfile(papers, sourceStatuses),
    [papers, sourceStatuses],
  );

  const paperSignature = useMemo(
    () => papers.map((paper) => paper.title).join("|"),
    [papers],
  );

  const runRequirementAnalysis = useCallback((force = false) => {
    const trimmed = query.trim();
    if (!trimmed || (!force && requirementRunKeyRef.current === trimmed)) return;
    requirementRunKeyRef.current = trimmed;
    setRequirementLoading(true);
    setRequirementError(null);
    analyzeRequirement(trimmed)
      .then(setRequirementResult)
      .catch((err) => setRequirementError(err instanceof Error ? err.message : "需求理解失败"))
      .finally(() => setRequirementLoading(false));
  }, [query]);

  const runLiteratureAnalysis = useCallback((force = false) => {
    if (searchLoading || searchError || papers.length === 0) return;
    const runKey = `${query}::${paperSignature}`;
    if (!paperSignature || (!force && literatureRunKeyRef.current === runKey)) return;
    literatureRunKeyRef.current = runKey;
    directionsRunKeyRef.current = "";
    setLiteratureAnalysisLoading(true);
    setLiteratureAnalysisError(null);
    setDirectionsError(null);
    setLiteratureResult((current) => (force ? current : null));
    setDirectionsResult(null);
    analyzeLiterature({ papers, requirement: query })
      .then(setLiteratureResult)
      .catch((err) => setLiteratureAnalysisError(err instanceof Error ? err.message : "文献分析失败"))
      .finally(() => setLiteratureAnalysisLoading(false));
  }, [papers, paperSignature, query, searchError, searchLoading]);

  const runDirections = useCallback((force = false) => {
    if (!literatureResult || literatureResult.analyzed_papers === 0) return;
    const runKey = `${query}::${literatureResult.analyzed_papers}::${literatureResult.research_gaps.join("|")}`;
    if (!force && directionsRunKeyRef.current === runKey) return;
    directionsRunKeyRef.current = runKey;
    setDirectionsLoading(true);
    setDirectionsError(null);
    setDirectionsResult((current) => (force ? current : null));
    generateDirections({
      literatureAnalysis: toLiteratureAnalysisInput(literatureResult),
      requirement: query,
      projectId: null,
    })
      .then(setDirectionsResult)
      .catch((err) => setDirectionsError(err instanceof Error ? err.message : "研究方向生成失败"))
      .finally(() => setDirectionsLoading(false));
  }, [literatureResult, query]);

  useEffect(() => {
    setRequirementError(null);
    setLiteratureAnalysisError(null);
    setDirectionsError(null);
    requirementRunKeyRef.current = "";
    literatureRunKeyRef.current = "";
    directionsRunKeyRef.current = "";

    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        setRequirementResult(null);
        setLiteratureResult(null);
        setDirectionsResult(null);
        return;
      }
      const snapshot = JSON.parse(raw) as {
        requirementResult: AnalyzeRequirementResponse | null;
        literatureResult: AnalyzeLiteratureResponse | null;
        directionsResult: GenerateDirectionsResponse | null;
      };
      setRequirementResult(snapshot.requirementResult);
      setLiteratureResult(snapshot.literatureResult);
      setDirectionsResult(snapshot.directionsResult);
      requirementRunKeyRef.current = snapshot.requirementResult ? query.trim() : "";
      literatureRunKeyRef.current = snapshot.literatureResult ? `${query}::${paperSignature}` : "";
      directionsRunKeyRef.current = snapshot.directionsResult && snapshot.literatureResult
        ? `${query}::${snapshot.literatureResult.analyzed_papers}::${snapshot.literatureResult.research_gaps.join("|")}`
        : "";
    } catch {
      setRequirementResult(null);
      setLiteratureResult(null);
      setDirectionsResult(null);
    }
  }, [STORAGE_KEY, paperSignature, query]);

  useEffect(() => {
    runRequirementAnalysis();
  }, [runRequirementAnalysis]);

  useEffect(() => {
    runLiteratureAnalysis();
  }, [runLiteratureAnalysis]);

  useEffect(() => {
    runDirections();
  }, [runDirections]);

  useEffect(() => {
    if (!requirementResult && !literatureResult && !directionsResult) return;
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        requirementResult,
        literatureResult,
        directionsResult,
      }),
    );
  }, [STORAGE_KEY, directionsResult, literatureResult, requirementResult]);

  return (
    <div className="mx-auto max-w-5xl space-y-7">
      <QueryHeader
        query={query}
        papersCount={papers.length}
        sourceSummary={sourceSummary}
        evidenceProfile={evidenceProfile}
        sourceStatuses={sourceStatuses}
        searchDiagnostics={searchDiagnostics}
        referencesOpen={referencesOpen}
        onOpenReferences={onOpenReferences}
      />

      <StepCard
        index="01"
        eyebrow="Requirement Lens"
        title="需求理解"
        description="先把模糊研究想法拆成领域、技术、场景和可用研究方法。"
        loading={requirementLoading}
        error={requirementError}
        actionLabel="重新理解"
        onAction={() => runRequirementAnalysis(true)}
      >
        {requirementResult ? (
          <RequirementBlock analysis={requirementResult.analysis} />
        ) : (
          <EmptyHint text="正在等待需求理解结果。" />
        )}
      </StepCard>

      <StepCard
        index="02"
        eyebrow="Literature Reading"
        title="文献分析"
        description="基于当前检索到的文献，总结热点、趋势、研究空白和可切入点。"
        loading={searchLoading || literatureAnalysisLoading}
        error={searchError || literatureAnalysisError}
        actionLabel="重新分析"
        onAction={() => runLiteratureAnalysis(true)}
      >
        {searchSummary ? <SearchSummaryBlock summary={searchSummary} /> : null}
        {papers.length === 0 && !searchLoading ? (
          <EmptyHint text="暂无足够文献依据，暂不生成文献分析。" />
        ) : literatureResult ? (
          <LiteratureBlock result={literatureResult} evidenceProfile={evidenceProfile} />
        ) : (
          <EmptyHint text="文献返回后会自动生成分析。" />
        )}
      </StepCard>

      <StepCard
        index="03"
        eyebrow="Topic Candidates"
        title="研究方向"
        description="把文献分析转化为可开题、可实施、可写论文的候选方向。"
        loading={directionsLoading}
        error={directionsError}
        actionLabel="重新生成"
        onAction={() => runDirections(true)}
      >
        {directionsResult?.directions.length ? (
          <DirectionsBlock
            directions={directionsResult.directions}
            scores={directionsResult.scores}
            savingDirectionTitle={savingDirectionTitle}
            savedDirectionTitles={savedDirectionTitles}
            saveMessage={directionSaveMessage}
            evidencePapers={evidenceProfile.topPapers}
            onSaveDirection={onSaveDirection}
            onOpenResearch={onOpenResearch}
          />
        ) : literatureResult?.analyzed_papers === 0 ? (
          <EmptyHint text="文献依据不足，暂不生成研究方向。" />
        ) : (
          <EmptyHint text="文献分析完成后会自动生成候选方向。" />
        )}
      </StepCard>
    </div>
  );
}

function SearchSummaryBlock({ summary }: { summary: SearchSummary }) {
  const insufficient = summary.status === "insufficient";

  return (
    <div className={`mb-5 rounded-3xl border p-5 ${
      insufficient ? "border-[#f1d49b] bg-[#fff8ea]" : "border-[#cfe3f4] bg-[#edf7ff]"
    }`}>
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.2em] text-[#126fb0]">Search Synthesis</p>
          <h3 className="mt-2 text-xl font-black tracking-[-0.03em] text-[#101318]">本次检索总结</h3>
        </div>
        <span className={`rounded-full px-3 py-1.5 text-xs font-black ${
          insufficient ? "bg-white text-[#8a5a00]" : "bg-white text-[#126fb0]"
        }`}>
          {insufficient ? "依据不足" : "仅基于本次检索"}
        </span>
      </div>
      <p className="mt-4 text-sm leading-7 text-[#33404b]">{summary.overview}</p>

      {summary.representative_papers.length ? (
        <div className="mt-5">
          <p className="mb-3 text-xs font-black uppercase tracking-[0.18em] text-[#7a8591]">代表性文献</p>
          <div className="grid gap-3">
            {summary.representative_papers.slice(0, 3).map((paper, index) => (
              <div key={`${paper.title}-${index}`} className="rounded-2xl bg-white/80 px-4 py-3">
                <p className="line-clamp-2 text-sm font-black leading-6 text-[#202a34]">{paper.title}</p>
                <p className="mt-1 text-xs leading-5 text-[#66717d]">
                  {paper.year || "未知年份"} · {paper.source || "未知来源"} · {paper.reason || "本次检索排序靠前"}
                </p>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div className="mt-5 grid gap-3 md:grid-cols-3">
        <SummaryMiniList title="主要方法" items={summary.main_methods} />
        <SummaryMiniList title="近期趋势" items={summary.research_trends} />
        <SummaryMiniList title="潜在空白" items={summary.research_gaps} />
      </div>

      {summary.warnings.length ? (
        <div className="mt-4 rounded-2xl border border-[#f1d49b] bg-white/75 px-4 py-3 text-sm leading-6 text-[#775000]">
          {summary.warnings.join("；")}
        </div>
      ) : null}
    </div>
  );
}

function SummaryMiniList({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="rounded-2xl bg-white/70 px-4 py-3">
      <p className="text-xs font-black uppercase tracking-[0.16em] text-[#7a8591]">{title}</p>
      <ul className="mt-2 space-y-1.5 text-sm leading-6 text-[#3f4a55]">
        {(items.length ? items : ["暂无足够依据"]).slice(0, 3).map((item) => (
          <li key={item}>· {item}</li>
        ))}
      </ul>
    </div>
  );
}

function QueryHeader({
  query,
  papersCount,
  sourceSummary,
  evidenceProfile,
  sourceStatuses,
  searchDiagnostics,
  referencesOpen,
  onOpenReferences,
}: {
  query: string;
  papersCount: number;
  sourceSummary: string;
  evidenceProfile: EvidenceProfile;
  sourceStatuses: Record<string, SourceStatusInfo>;
  searchDiagnostics: SearchDiagnostics | null;
  referencesOpen: boolean;
  onOpenReferences: () => void;
}) {
  const sourceSections = buildSourceStatusSections(sourceStatuses);

  return (
    <header className="rounded-[32px] border border-[#dfe8ef] bg-white p-7 shadow-[0_20px_70px_rgba(16,19,24,0.07)]">
      <div className="flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.22em] text-[#168feb]">Topic Research</p>
          <h1 className="mt-3 max-w-3xl text-[34px] font-black leading-tight tracking-[-0.045em] text-[#101318]">
            {query}
          </h1>
          <p className="mt-4 max-w-2xl text-sm leading-7 text-[#5c6672]">
            本页只推进选题前半段：先理解需求，再读取文献，最后给出候选研究方向。
          </p>
        </div>
        {!referencesOpen ? (
          <button
            type="button"
            onClick={onOpenReferences}
            className="rounded-2xl border border-[#cfe3f4] bg-[#edf7ff] px-4 py-2.5 text-sm font-black text-[#101318] transition-colors hover:bg-white"
          >
            打开 References
          </button>
        ) : null}
      </div>
      <div className="mt-6 flex flex-wrap gap-3 text-xs font-bold text-[#53606c]">
        <span className="rounded-full bg-[#eefaf8] px-3 py-1.5 text-[#146d62]">文献 {papersCount} 篇</span>
        <span className="rounded-full bg-[#f4f6f8] px-3 py-1.5">{sourceSummary}</span>
        <span className={`rounded-full px-3 py-1.5 ${evidenceProfile.strengthClass}`}>{evidenceProfile.strengthLabel}</span>
      </div>
      {(sourceSections.items.length || searchDiagnostics?.overview) ? (
        <div className="mt-5 rounded-2xl border border-[#e7edf3] bg-[#fbfcfd] px-4 py-4">
          <p className="text-xs font-black uppercase tracking-[0.16em] text-[#7a8591]">来源状态</p>
          <p className="mt-2 text-sm leading-6 text-[#40505e]">
            {searchDiagnostics?.overview || sourceSections.summary}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {sourceSections.healthy.slice(0, 4).map((item) => (
              <span key={`healthy-${item.source}`} className="rounded-full border border-[#bfe5d1] bg-[#eefaf3] px-3 py-1.5 text-[11px] font-bold text-[#16613a]">
                {item.label} · {item.text}
              </span>
            ))}
            {sourceSections.empty.slice(0, 4).map((item) => (
              <span key={`empty-${item.source}`} className="rounded-full border border-[#dfe4e8] bg-[#f6f8fa] px-3 py-1.5 text-[11px] font-bold text-[#5e6874]">
                {item.label} · {item.text}
              </span>
            ))}
            {sourceSections.risky.slice(0, 4).map((item) => (
              <span key={`risky-${item.source}`} className="rounded-full border border-[#f1d49b] bg-[#fff7e8] px-3 py-1.5 text-[11px] font-bold text-[#8a5a00]">
                {item.label} · {item.text}
              </span>
            ))}
          </div>
        </div>
      ) : null}
      <EvidenceOverview evidenceProfile={evidenceProfile} />
    </header>
  );
}

function StepCard({
  index,
  eyebrow,
  title,
  description,
  loading,
  error,
  actionLabel,
  onAction,
  children,
}: {
  index: string;
  eyebrow: string;
  title: string;
  description: string;
  loading: boolean;
  error: string | null;
  actionLabel?: string;
  onAction?: () => void;
  children: ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-[30px] border border-[#e1e8ee] bg-white shadow-[0_18px_60px_rgba(16,19,24,0.055)]">
      <div className="border-b border-[#edf1f4] bg-[#fbfcfd] px-6 py-5">
        <div className="flex items-start gap-4">
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-[#10232d] text-sm font-black text-white">
            {index}
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-black uppercase tracking-[0.22em] text-[#168feb]">{eyebrow}</p>
            <h2 className="mt-1 text-2xl font-black tracking-[-0.04em] text-[#101318]">{title}</h2>
            <p className="mt-2 text-sm leading-6 text-[#66717d]">{description}</p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {loading ? (
              <span className="rounded-full bg-[#edf7ff] px-3 py-1.5 text-xs font-black text-[#126fb0]">生成中</span>
            ) : null}
            {actionLabel && onAction ? (
              <button
                type="button"
                onClick={onAction}
                disabled={loading}
                className="rounded-full border border-[#d8e2ea] bg-white px-3 py-1.5 text-xs font-black text-[#26313b] transition-colors hover:border-[#168feb] hover:text-[#126fb0] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {actionLabel}
              </button>
            ) : null}
          </div>
        </div>
      </div>
      <div className="p-6">
        {error ? (
          <div className="rounded-2xl border border-[#f1c7c3] bg-[#fff8f6] px-4 py-3 text-sm leading-6 text-[#963528]">
            {error}
          </div>
        ) : loading ? (
          <LoadingLines />
        ) : (
          children
        )}
      </div>
    </section>
  );
}

function RequirementBlock({ analysis }: { analysis: RequirementAnalysis }) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <InfoTile label="研究领域" value={analysis.research_field} />
      <InfoTile label="初步建议" value={analysis.preliminary_suggestions} />
      <ChipTile label="核心技术" items={analysis.core_technologies} />
      <ChipTile label="应用场景" items={analysis.application_scenarios} />
      <ChipTile label="研究对象" items={analysis.possible_subjects} />
      <ChipTile label="可能方法" items={analysis.possible_methods} />
    </div>
  );
}

function LiteratureBlock({ result, evidenceProfile }: { result: AnalyzeLiteratureResponse; evidenceProfile: EvidenceProfile }) {
  return (
    <div className="space-y-5">
      <EvidenceNotice evidenceProfile={evidenceProfile} />
      <div className="flex flex-wrap gap-3 text-xs font-bold text-[#53606c]">
        <span className="rounded-full bg-[#f4f6f8] px-3 py-1.5">已分析 {result.analyzed_papers}/{result.total_papers} 篇</span>
        <span className="rounded-full bg-[#eefaf8] px-3 py-1.5 text-[#146d62]">摘要级依据</span>
      </div>
      <ListSection title="研究热点" items={result.research_hotspots} />
      <ListSection title="发展趋势" items={result.research_trends} />
      <ListSection title="研究空白" items={result.research_gaps} tone="warn" />
      <ListSection title="可切入点" items={result.recommended_entry_points} />
    </div>
  );
}

function DirectionsBlock({
  directions,
  scores,
  savingDirectionTitle,
  savedDirectionTitles,
  saveMessage,
  evidencePapers,
  onSaveDirection,
  onOpenResearch,
}: {
  directions: ResearchDirection[];
  scores: DirectionScore[];
  savingDirectionTitle: string | null;
  savedDirectionTitles: string[];
  saveMessage: string | null;
  evidencePapers: Paper[];
  onSaveDirection: (direction: ResearchDirection, score?: DirectionScore | null) => Promise<void>;
  onOpenResearch: () => void;
}) {
  return (
    <div className="space-y-4">
      {saveMessage ? (
        <div className="flex flex-col gap-3 rounded-2xl border border-[#cbe7d7] bg-[#f0fbf5] px-4 py-3 text-sm text-[#17613a] md:flex-row md:items-center md:justify-between">
          <span>{saveMessage}</span>
          <button type="button" onClick={onOpenResearch} className="font-black text-[#0d5a34] underline underline-offset-4">
            进入研究方向页
          </button>
        </div>
      ) : null}
      {directions.map((direction, index) => {
        const score = scores.find((item) => item.title === direction.title);
        const saving = savingDirectionTitle === direction.title;
        const saved = savedDirectionTitles.includes(direction.title);
        return (
          <article key={`${direction.title}-${index}`} className="rounded-3xl border border-[#e0e7ed] bg-[#fbfcfd] p-5">
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.18em] text-[#7b8793]">Direction {index + 1}</p>
                <h3 className="mt-2 text-xl font-black leading-snug tracking-[-0.03em] text-[#101318]">{direction.title}</h3>
              </div>
              <div className="rounded-2xl bg-white px-4 py-3 text-right shadow-sm">
                <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[#7b8793]">推荐指数</p>
                <p className="text-2xl font-black text-[#168feb]">{formatScore(score?.scores.overall)}</p>
              </div>
            </div>
            <p className="mt-4 text-sm leading-7 text-[#4f5a66]">{direction.background}</p>
            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <MiniList title="研究问题" items={direction.research_questions} />
              <MiniList title="研究方法" items={direction.methods} />
              <MiniList title="创新点" items={direction.innovation} />
              <InfoTile label="可行性" value={direction.feasibility} compact />
            </div>
            <EvidenceSnippets papers={evidencePapers} />
            <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-[#e3e9ef] pt-4">
              <button
                type="button"
                onClick={() => onSaveDirection(direction, score)}
                disabled={saving || saved}
                className="rounded-2xl bg-[#101318] px-4 py-2.5 text-sm font-black text-white transition-colors hover:bg-[#26313b] disabled:cursor-not-allowed disabled:bg-[#aeb7c0]"
              >
                {saved ? "已保存到项目" : saving ? "保存中..." : "保存到项目"}
              </button>
              <button
                type="button"
                onClick={onOpenResearch}
                className="rounded-2xl border border-[#d8e2ea] bg-white px-4 py-2.5 text-sm font-black text-[#26313b] transition-colors hover:border-[#168feb] hover:text-[#126fb0]"
              >
                进入研究方向页
              </button>
              <span className="text-xs leading-5 text-[#7a8591]">保存后可在研究方向页继续查看和筛选。</span>
            </div>
          </article>
        );
      })}
    </div>
  );
}

function EvidenceOverview({ evidenceProfile }: { evidenceProfile: EvidenceProfile }) {
  const sourceText = evidenceProfile.sourceItems.length
    ? evidenceProfile.sourceItems.map((item) => `${item.label} ${item.count}`).join(" · ")
    : "暂无来源";

  return (
    <div className="mt-5 grid gap-3 md:grid-cols-4">
      <EvidenceMetric label="总依据" value={`${evidenceProfile.total} 篇`} tone="blue" />
      <EvidenceMetric label="中文文献" value={`${evidenceProfile.cnCount} 篇`} />
      <EvidenceMetric label="英文文献" value={`${evidenceProfile.enCount} 篇`} />
      <div className="rounded-2xl border border-[#e0e8ef] bg-[#fbfcfd] px-4 py-3">
        <p className="text-[11px] font-black uppercase tracking-[0.18em] text-[#7a8591]">来源覆盖</p>
        <p className="mt-2 line-clamp-2 text-sm font-black leading-6 text-[#26313b]">{sourceText}</p>
      </div>
    </div>
  );
}

function EvidenceMetric({ label, value, tone = "default" }: { label: string; value: string; tone?: "default" | "blue" }) {
  return (
    <div className={`rounded-2xl border px-4 py-3 ${tone === "blue" ? "border-[#cfe3f4] bg-[#edf7ff]" : "border-[#e0e8ef] bg-[#fbfcfd]"}`}>
      <p className="text-[11px] font-black uppercase tracking-[0.18em] text-[#7a8591]">{label}</p>
      <p className={`mt-2 text-lg font-black tracking-[-0.03em] ${tone === "blue" ? "text-[#126fb0]" : "text-[#26313b]"}`}>{value}</p>
    </div>
  );
}

function EvidenceNotice({ evidenceProfile }: { evidenceProfile: EvidenceProfile }) {
  const hasWarnings = evidenceProfile.warnings.length > 0;

  return (
    <div
      className={`rounded-3xl border px-5 py-4 ${
        hasWarnings
          ? "border-[#f1d49b] bg-[#fff8ea] text-[#775000]"
          : "border-[#cbe7d7] bg-[#f0fbf5] text-[#17613a]"
      }`}
    >
      <p className="text-sm font-bold leading-7">{evidenceProfile.statement}</p>
      {hasWarnings ? (
        <ul className="mt-3 grid gap-2 text-sm leading-6">
          {evidenceProfile.warnings.map((warning) => (
            <li key={warning} className="rounded-2xl bg-white/62 px-3 py-2">
              {warning}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-sm leading-6 opacity-85">当前依据覆盖较均衡，可继续作为选题初筛材料，但正式开题前仍建议核验原文。</p>
      )}
    </div>
  );
}

function EvidenceSnippets({ papers }: { papers: Paper[] }) {
  if (!papers.length) {
    return (
      <div className="mt-5 rounded-2xl border border-dashed border-[#d7e0e8] bg-white px-4 py-3 text-sm text-[#6a747f]">
        暂无可展示的方向依据来源，建议补充文献后再保存方向。
      </div>
    );
  }

  return (
    <div className="mt-5 rounded-3xl border border-[#dce6ee] bg-white p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="text-xs font-black uppercase tracking-[0.18em] text-[#7a8591]">Evidence Sources</p>
        <span className="rounded-full bg-[#edf7ff] px-3 py-1 text-[11px] font-black text-[#126fb0]">可核验依据</span>
      </div>
      <div className="grid gap-3">
        {papers.slice(0, 3).map((paper, index) => (
          <div key={`${paper.title}-${index}`} className="rounded-2xl bg-[#f7f9fb] px-4 py-3">
            <p className="line-clamp-2 text-sm font-black leading-6 text-[#202a34]">{paper.title}</p>
            <p className="mt-1 text-xs leading-5 text-[#6a747f]">
              {sourceLabel(paper.source)} · {paper.year || "未知年份"} · 引用 {paper.citation_count ?? 0}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

function InfoTile({ label, value, compact = false }: { label: string; value: string; compact?: boolean }) {
  return (
    <div className={`rounded-2xl border border-[#e5ebf0] bg-[#fbfcfd] ${compact ? "p-4" : "p-5"}`}>
      <p className="text-xs font-black uppercase tracking-[0.18em] text-[#7a8591]">{label}</p>
      <p className="mt-2 text-sm leading-7 text-[#303943]">{value || "暂无"}</p>
    </div>
  );
}

function ChipTile({ label, items }: { label: string; items: string[] }) {
  return (
    <div className="rounded-2xl border border-[#e5ebf0] bg-[#fbfcfd] p-5">
      <p className="text-xs font-black uppercase tracking-[0.18em] text-[#7a8591]">{label}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {items.length ? (
          items.map((item) => (
            <span key={item} className="rounded-full bg-white px-3 py-1.5 text-xs font-bold text-[#26313b] shadow-sm">
              {item}
            </span>
          ))
        ) : (
          <span className="text-sm text-[#7a8591]">暂无</span>
        )}
      </div>
    </div>
  );
}

function ListSection({ title, items, tone = "default" }: { title: string; items: string[]; tone?: "default" | "warn" }) {
  return (
    <div>
      <h3 className="mb-3 text-sm font-black tracking-[-0.01em] text-[#101318]">{title}</h3>
      {items.length ? (
        <ul className="grid gap-2">
          {items.map((item, index) => (
            <li
              key={`${title}-${index}`}
              className={`rounded-2xl px-4 py-3 text-sm leading-6 ${
                tone === "warn" ? "bg-[#fff7e8] text-[#7b4d00]" : "bg-[#f6f8fa] text-[#33404b]"
              }`}
            >
              {item}
            </li>
          ))}
        </ul>
      ) : (
        <EmptyHint text="暂无足够依据。" />
      )}
    </div>
  );
}

function MiniList({ title, items }: { title: string; items: string[] }) {
  return (
    <div>
      <p className="mb-2 text-xs font-black uppercase tracking-[0.18em] text-[#7a8591]">{title}</p>
      {items.length ? (
        <ul className="space-y-2 text-sm leading-6 text-[#3f4a55]">
          {items.slice(0, 3).map((item) => (
            <li key={item}>· {item}</li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-[#7a8591]">暂无</p>
      )}
    </div>
  );
}

function EmptyHint({ text }: { text: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-[#cfd9e2] bg-[#f8fafb] px-4 py-5 text-sm leading-6 text-[#65717d]">
      {text}
    </div>
  );
}

function LoadingLines() {
  return (
    <div className="space-y-3">
      <div className="h-4 w-9/12 animate-pulse rounded-full bg-[#edf1f4]" />
      <div className="h-4 w-11/12 animate-pulse rounded-full bg-[#edf1f4]" />
      <div className="h-4 w-7/12 animate-pulse rounded-full bg-[#edf1f4]" />
    </div>
  );
}

const SOURCE_LABEL: Record<string, string> = {
  pubmed: "PubMed",
  cnki: "知网",
  cqvip: "维普",
  openalex: "OpenAlex",
  semantic_scholar: "Semantic Scholar",
  crossref: "Crossref",
  arxiv: "arXiv",
};

const ABNORMAL_SOURCE_STATUSES = new Set(["rate_limited", "gateway_timeout", "blocked", "error", "http_error"]);

function buildEvidenceProfile(papers: Paper[], sourceStatuses: Record<string, SourceStatusInfo>): EvidenceProfile {
  const counts = papers.reduce(
    (acc, paper) => {
      const language = detectPaperLanguage(paper);
      acc[language] += 1;
      acc.sources[paper.source] = (acc.sources[paper.source] ?? 0) + 1;
      return acc;
    },
    { cn: 0, en: 0, unknown: 0, sources: {} as Record<string, number> },
  );

  const sourceItems = Object.entries(counts.sources)
    .sort((a, b) => b[1] - a[1])
    .map(([source, count]) => ({ source, label: sourceLabel(source), count }));

  const abnormalStatuses = Object.entries(sourceStatuses)
    .filter(([, info]) => ABNORMAL_SOURCE_STATUSES.has(info.status))
    .map(([source, info]) => ({
      source,
      label: sourceLabel(source),
      text: sourceStatusText(info),
      detail: info.detail,
    }));

  const warnings = buildEvidenceWarnings({
    total: papers.length,
    cnCount: counts.cn,
    enCount: counts.en,
    sourceCount: sourceItems.length,
    abnormalStatuses,
  });

  const sourceText = sourceItems.length
    ? sourceItems.slice(0, 4).map((item) => `${item.label} ${item.count}`).join("、")
    : "暂无来源";
  const abnormalText = abnormalStatuses.length
    ? `；${abnormalStatuses.map((item) => `${item.label}${item.text}`).join("，")}，相关依据可能不足`
    : "";
  const statement = papers.length
    ? `本次分析基于 ${papers.length} 篇文献，其中中文 ${counts.cn} 篇、英文 ${counts.en} 篇，主要来源：${sourceText}${abnormalText}。`
    : abnormalStatuses.length
      ? `当前没有可分析文献，且 ${abnormalStatuses.map((item) => `${item.label}${item.text}`).join("，")}。`
      : "当前没有可分析文献，暂不建议据此生成研究方向。";

  return {
    total: papers.length,
    cnCount: counts.cn,
    enCount: counts.en,
    unknownCount: counts.unknown,
    sourceItems,
    abnormalStatuses,
    warnings,
    statement,
    strengthLabel: getEvidenceStrengthLabel(papers.length, warnings.length),
    strengthClass: getEvidenceStrengthClass(papers.length, warnings.length),
    topPapers: rankEvidencePapers(papers),
  };
}

function buildEvidenceWarnings({
  total,
  cnCount,
  enCount,
  sourceCount,
  abnormalStatuses,
}: {
  total: number;
  cnCount: number;
  enCount: number;
  sourceCount: number;
  abnormalStatuses: EvidenceProfile["abnormalStatuses"];
}) {
  const warnings: string[] = [];
  if (total === 0) {
    warnings.push("暂无可用于分析的文献依据。");
    return warnings;
  }
  if (total < 3) warnings.push("文献少于 3 篇，不建议直接作为最终研究方向依据。");
  if (cnCount === 0) warnings.push("没有中文文献，中文研究现状依据不足。");
  if (enCount === 0) warnings.push("没有英文文献，国际研究现状依据不足。");
  if (sourceCount <= 1) warnings.push("来源过于单一，建议补充其他数据库进行交叉验证。");
  if (abnormalStatuses.length) {
    warnings.push(`存在来源异常：${abnormalStatuses.map((item) => `${item.label}${item.text}`).join("，")}。`);
  }
  return warnings;
}

function detectPaperLanguage(paper: Paper): "cn" | "en" | "unknown" {
  if (paper.language === "cn" || paper.language === "en") return paper.language;
  const text = `${paper.title ?? ""} ${paper.abstract ?? ""} ${paper.venue ?? ""}`;
  if (/[\u4e00-\u9fff]/.test(text)) return "cn";
  if (paper.source === "cnki" || paper.source === "cqvip") return "cn";
  if (/[A-Za-z]/.test(text)) return "en";
  return "unknown";
}

function rankEvidencePapers(papers: Paper[]) {
  return [...papers]
    .sort((a, b) => getPaperEvidenceScore(b) - getPaperEvidenceScore(a))
    .slice(0, 6);
}

function getPaperEvidenceScore(paper: Paper) {
  return (
    (paper.final_score ?? 0) * 100 +
    (paper.relevance_score ?? 0) * 60 +
    (paper.quality_score ?? 0) * 30 +
    Math.min(paper.citation_count ?? 0, 500) / 10 +
    (paper.abstract ? 5 : 0)
  );
}

function getEvidenceStrengthLabel(total: number, warningCount: number) {
  if (total === 0) return "暂无依据";
  if (total < 3 || warningCount >= 3) return "依据偏弱";
  if (warningCount > 0) return "依据需补强";
  return "依据较稳";
}

function getEvidenceStrengthClass(total: number, warningCount: number) {
  if (total === 0 || total < 3 || warningCount >= 3) return "bg-[#fff0f0] text-[#9a2f2f]";
  if (warningCount > 0) return "bg-[#fff7e8] text-[#8a5a00]";
  return "bg-[#eefaf8] text-[#146d62]";
}

function sourceLabel(source: string) {
  return SOURCE_LABEL[source] ?? source;
}

function sourceStatusText(info: SourceStatusInfo) {
  if (info.status === "ok") return `已返回 ${info.count} 条`;
  if (info.status === "rate_limited") return "当前限流";
  if (info.status === "gateway_timeout") return "服务超时";
  if (info.status === "blocked") return "访问受限";
  if (info.status === "no_results") return "暂无结果";
  if (info.status === "error" || info.status === "http_error") return "请求失败";
  return info.count > 0 ? `已返回 ${info.count} 条` : "状态未知";
}

function toLiteratureAnalysisInput(result: AnalyzeLiteratureResponse): LiteratureAnalysisInput {
  return {
    summaries: result.summaries,
    research_hotspots: result.research_hotspots,
    research_gaps: result.research_gaps,
    recommended_entry_points: result.recommended_entry_points,
  };
}

function formatScore(score?: number) {
  if (score === undefined || score === null) return "--";
  return score > 10 ? String(Math.round(score)) : score.toFixed(1);
}
