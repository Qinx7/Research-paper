/** 后端 API 请求/响应类型定义 */

// ========== 项目 ==========

export interface Project {
  id: string;
  name: string;
  research_field: string | null;
  user_requirement: string | null;
  selected_topic: string | null;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface ProjectWorkspaceLinkedOutcome {
  id: string;
  name: string;
  outcome_type: string | null;
  download_url: string | null;
  action_url: string;
  action_label: string;
}

export interface ProjectWorkspaceLinkedPaper {
  id: string;
  title: string;
  venue: string | null;
  year: number | null;
  citation_count: number;
  action_url: string;
  action_label: string;
}

export interface ProjectWorkspaceLinkedNote {
  id: string;
  title: string;
  note_type: string | null;
  confidence: number | null;
  evidence_text: string | null;
  action_url: string;
  action_label: string;
}

export interface ProjectWorkspaceLinkedChunk {
  id: string;
  title: string;
  source_filename: string | null;
  source_type: string | null;
  section_title?: string | null;
  section_level?: number | null;
  section_path?: string[];
  download_url: string;
  action_url: string;
  action_label: string;
}

export interface ProjectWorkspaceOutcome {
  id: string;
  name: string;
  outcome_type: string | null;
  description: string | null;
  knowledge_status: string;
  chunk_count: number;
  download_url: string | null;
  cited_by_chapters: string[];
}

export interface ProjectWorkspaceChapter {
  draft_id: string;
  chapter_key: string;
  title: string;
  status: string;
  word_count: number;
  citations_count: number;
  evidence_count: number;
  data_based: boolean;
  linked_outcomes: ProjectWorkspaceLinkedOutcome[];
  linked_papers: ProjectWorkspaceLinkedPaper[];
  linked_notes: ProjectWorkspaceLinkedNote[];
  linked_chunks: ProjectWorkspaceLinkedChunk[];
  action_url: string;
  action_label: string;
}

export interface ProjectWorkspaceDeliveryDraft {
  id: string;
  title: string;
  version: number;
  completed_chapters: number;
  total_chapters: number;
  completion_rate: number;
  download_docx_url: string;
  download_pdf_url: string;
  action_url: string;
  action_label: string;
}

export interface ProjectWorkspaceDeliveryProposal {
  id: string;
  title: string;
  download_docx_url: string;
  download_pdf_url: string;
  action_url: string;
  action_label: string;
}

export interface ProjectWorkspaceDeliveryDefense {
  ready: boolean;
  has_real_data: boolean;
  draft_id: string | null;
  action_url: string;
  action_label: string;
}

export interface ProjectWorkspaceSnapshot {
  stats: {
    outcomes_total: number;
    indexed_outcomes: number;
    drafts_total: number;
    evidence_cards_total: number;
    project_papers_total: number;
    project_chunks_total: number;
  };
  outcomes: ProjectWorkspaceOutcome[];
  chapters: ProjectWorkspaceChapter[];
  delivery: {
    latest_draft: ProjectWorkspaceDeliveryDraft | null;
    latest_proposal: ProjectWorkspaceDeliveryProposal | null;
    defense: ProjectWorkspaceDeliveryDefense;
  };
}

export interface ProjectDocumentSearchResult {
  chunk_id: string;
  outcome_id: string;
  title: string;
  source_filename: string | null;
  source_type: string | null;
  section_title?: string | null;
  section_level?: number | null;
  section_path?: string[];
  content_excerpt: string;
  download_url: string;
  score: number;
  score_reasons: string[];
  action_label: string;
  action_url: string;
}

// ========== 需求分析 ==========

export interface RequirementAnalysis {
  research_field: string;
  core_technologies: string[];
  application_scenarios: string[];
  possible_subjects: string[];
  possible_methods: string[];
  suitable_outputs: string[];
  keywords_cn: string[];
  keywords_en: string[];
  preliminary_suggestions: string;
}

export interface AnalyzeRequirementResponse {
  requirement: string;
  analysis: RequirementAnalysis;
}

// ========== 文献检索 ==========

export interface Paper {
  title: string;
  authors: string[];
  year: number;
  venue: string | null;
  doi: string | null;
  abstract: string | null;
  url: string | null;
  citation_count: number;
  source: "openalex" | "semantic_scholar" | "cnki" | "cqvip" | "crossref" | "arxiv" | "pubmed" | "pubscholar";
  language?: "cn" | "en";
  relevance_score?: number;
  freshness_score?: number;
  impact_score?: number;
  quality_score?: number;
  final_score?: number;
  is_open_access?: boolean | null;
  quality_flags?: string[];
  quality_inference?: string[];
  authority_tags?: string[];
  pending_authority_tags?: string[];
  authority_reasons?: string[];
  authority_level?: string;
  verified_level?: "verified" | "unverified" | string;
  why_selected?: string;
}

export interface LiteratureQualityFilters {
  sources?: string[];
  open_access_only?: boolean;
  quality_tags?: string[];
  min_citation_count?: number;
}

export interface SavedPaper {
  id: string;
  project_id: string | null;
  title: string;
  authors: string | null;
  year: number | null;
  venue: string | null;
  doi: string | null;
  abstract: string | null;
  url: string | null;
  citation_count: number;
  relevance_score: number;
  source: string | null;
  created_at: string;
}

export interface PaperAnalysisResult {
  research_question: string;
  method: string;
  sample_or_data: string;
  key_findings: string;
  limitations: string;
  relevance_to_project: string;
  evidence_level: string;
  warnings: string[];
}

export type PaperNoteType = "summary" | "quote" | "method" | "finding" | "limitation" | "idea";

export interface PaperNote {
  id: string;
  project_id?: string | null;
  paper_id: string;
  note_type: PaperNoteType;
  title: string;
  content: string;
  evidence_text?: string | null;
  evidence_level?: string | null;
  confidence?: number | null;
  tags?: string[];
  meta?: Record<string, unknown>;
  created_at?: string | null;
  updated_at?: string | null;
}

export interface LiteratureMatrixRow {
  title: string;
  author_year: string;
  source: string;
  venue: string;
  research_question: string;
  method: string;
  sample_or_data: string;
  key_findings: string;
  limitations: string;
  relevance_to_project: string;
  evidence_level: string;
  warnings: string[];
}

export interface LiteratureMatrixResult {
  total: number;
  rows: LiteratureMatrixRow[];
}

export interface SearchLiteratureResponse {
  task_id?: string | null;
  query: string;
  search_mode?: string;
  library_scope?: string;
  selected_sources?: string[];
  total_found: number;
  sources: {
    pubmed?: number;
    openalex: number;
    semantic_scholar: number;
    pubscholar?: number;
    cnki?: number;
    cqvip?: number;
    crossref?: number;
    arxiv?: number;
  };
  source_statuses?: Record<string, SourceStatusInfo>;
  search_summary?: SearchSummary;
  search_diagnostics?: SearchDiagnostics;
  workflow_status?: string;
  workflow_run_id?: string;
  papers: Paper[];
}

export interface SearchSummary {
  status: "ready" | "insufficient" | string;
  overview: string;
  authority_summary: {
    verified_counts: Record<string, number>;
    pending_counts: Record<string, number>;
    overview: string;
    has_verified: boolean;
    has_pending: boolean;
  };
  representative_papers: {
    title: string;
    year?: number | null;
    source?: string | null;
    reason?: string | null;
  }[];
  main_methods: string[];
  research_trends: string[];
  research_gaps: string[];
  suggested_queries: string[];
  warnings: string[];
}

export interface SearchDiagnostics {
  source_notes: Record<string, string>;
  failed_sources: string[];
  has_failures: boolean;
  overview?: string;
}

// ========== 文献分析 ==========

export interface PaperSummary {
  title: string;
  year: number;
  research_question: string;
  method: string;
  key_findings: string;
  innovation: string;
  limitations: string;
  relevance: string;
  quality_score: number;
}

export interface AnalyzeLiteratureResponse {
  total_papers: number;
  analyzed_papers: number;
  summaries: PaperSummary[];
  research_hotspots: string[];
  research_trends: string[];
  research_gaps: string[];
  recommended_entry_points: string[];
}

export interface LiteratureAnalysisInput {
  summaries: PaperSummary[];
  research_hotspots: string[];
  research_gaps: string[];
  recommended_entry_points: string[];
}

// ========== 研究方向 ==========

export interface ResearchDirection {
  title: string;
  background: string;
  research_questions: string[];
  objectives: string[];
  content: string[];
  methods: string[];
  data_sources: string[];
  expected_outputs: string[];
  innovation: string[];
  feasibility: string;
  risks: string[];
}

export interface DirectionScore {
  title: string;
  scores: {
    literature_foundation: number;
    innovation: number;
    feasibility: number;
    data_availability: number;
    thesis_value: number;
    overall: number;
  };
}

export interface GenerateDirectionsResponse {
  requirement: string;
  directions_count: number;
  directions: ResearchDirection[];
  scores: DirectionScore[];
  saved_ids: string[];
}

export interface TopicResearchSnapshot {
  requirementResult: AnalyzeRequirementResponse | null;
  literatureResult: AnalyzeLiteratureResponse | null;
  directionsResult: GenerateDirectionsResponse | null;
}

export interface SaveDirectionResponse {
  saved_id: string;
}

export interface PersistedResearchDirection {
  id: string;
  project_id: string | null;
  title: string;
  background: string | null;
  content: Record<string, unknown> | null;
  feasibility_score: number | null;
  recommendation_score: number | null;
  created_at: string | null;
}

// ========== 项目设计 ==========

export interface ContentPhase {
  phase: string;
  tasks: string[];
  output: string;
}

export interface TimelinePhase {
  phase: string;
  duration: string;
  tasks: string[];
}

export interface LiteratureReview {
  domestic: string;
  international: string;
  key_references: string[];
}

export interface ProjectDesign {
  topic: string;
  background: string;
  significance: string;
  literature_review: LiteratureReview;
  current_gaps: string[];
  objectives: string[];
  research_questions: string[];
  content: ContentPhase[];
  methods: string[];
  technical_route: string[];
  system_architecture: string;
  data_sources: string[];
  evaluation_metrics: string[];
  innovation_points: string[];
  feasibility: string;
  timeline: TimelinePhase[];
  expected_outputs: string[];
  references: string[];
}

export interface GenerateDesignResponse {
  requirement: string;
  design: ProjectDesign;
  saved_id: string | null;
}

export interface PersistedProjectDesign {
  id: string;
  project_id: string | null;
  direction_id: string | null;
  topic: string;
  content: Record<string, unknown> | null;
  created_at: string | null;
}

// ========== PPT 生成 ==========

export interface GeneratePPTResponse {
  success: boolean;
  filename: string;
  download_url: string;
  design_fields: number;
  style_id: string;
  style_name: string;
}

export interface PPTItem {
  filename: string;
  size: number;
  created_at: string;
  download_url: string;
}

export interface ListPPTsResponse {
  files: PPTItem[];
}

export interface PPTStyle {
  id: string;
  name: string;
  description: string;
  scene: string;
  is_default: boolean;
}

export interface HtmlDeckArtifact {
  artifact_type: string;
  title: string;
  object_key: string;
  filename: string;
  theme: string;
  slide_count: number;
  preview_url: string;
  download_url: string;
}

// ========== 开题报告 ==========

export interface ProposalSection {
  key: string;
  title: string;
  content: string;
}

export interface ProposalOut {
  id: string;
  project_id: string | null;
  design_id: string | null;
  title: string;
  sections: ProposalSection[];
  docx_path: string | null;
  created_at: string;
}

// ========== 聊天 ==========

export interface ChatMessage {
  id: string;
  conversation_id: string;
  role: "user" | "assistant";
  content: string;
  search_results?: SearchEvidenceBundle | SearchResultItem[] | null;
  created_at: string;
}

export interface SearchResultItem {
  title: string;
  authors: string[];
  year: number | null;
  venue: string | null;
  abstract: string | null;
  url: string | null;
  citation_count: number;
  source: string;
  is_open_access?: boolean | null;
  quality_flags?: string[];
  authority_tags?: string[];
  pending_authority_tags?: string[];
  authority_reasons?: string[];
  authority_level?: string;
  verified_level?: "verified" | "unverified" | string;
}

export interface ProjectContextItem {
  kind: string;
  title: string;
  content_excerpt: string;
  score: number;
  score_reasons?: string[];
  note_type?: string | null;
  evidence_text?: string | null;
  evidence_level?: string | null;
  confidence?: number | null;
  source_title?: string | null;
  citation_count?: number | null;
  source?: string | null;
  year?: number | null;
  venue?: string | null;
  authors?: string[];
  tags?: string[];
  action_url?: string | null;
  action_label?: string | null;
}

export interface OutcomeKnowledgeExtra {
  knowledge_status?: "pending" | "parsing" | "indexed" | "failed" | string;
  knowledge_chunk_count?: number;
  knowledge_error?: string | null;
  knowledge_indexed_at?: string | null;
  knowledge_parser?: string | null;
  knowledge_strategy_chain?: string[];
  knowledge_used_ocr?: boolean;
  knowledge_error_stage?: string | null;
  document_kind?: string | null;
  structured_fields?: string[];
  structured_content?: {
    title?: string;
    abstract?: string;
    references_text?: string;
    references_list?: string[];
  };
  structured_confidence?: {
    title?: string;
    abstract?: string;
    references?: string;
  };
}

export interface OutcomeKnowledgeStatus {
  outcome_id: string;
  status: string;
  chunk_count: number;
  message: string;
  error?: string | null;
  indexed_at?: string | null;
  parser?: string | null;
  strategy_chain?: string[];
  used_ocr?: boolean;
  error_stage?: string | null;
}

export interface SourceStatusInfo {
  status: string;
  count: number;
  detail?: string;
}

export interface SearchEvidenceBundle {
  task_id?: string | null;
  external_papers: SearchResultItem[];
  project_context_items: ProjectContextItem[];
  source_statuses?: Record<string, SourceStatusInfo>;
}

export interface LiteratureSearchTask {
  id: string;
  project_id?: string | null;
  query: string;
  mode: string;
  library_scope: string;
  selected_sources?: string[] | null;
  status: "pending" | "running" | "success" | "partial" | "failed" | string;
  total_results: number;
  source_statuses?: Record<string, SourceStatusInfo> | null;
  result_snapshot?: SearchResultItem[] | null;
  error_message?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
}

export interface Conversation {
  id: string;
  title: string;
  message_count?: number;
  created_at: string;
  updated_at: string;
}

export interface ConversationDetail {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
  messages: ChatMessage[];
}

// ========== 成果管理 ==========

export interface OutcomeTypeInfo {
  id: string;
  label: string;
  description: string;
  icon: string;
}

export interface Outcome {
  id: string;
  project_id: string;
  outcome_type: string;
  name: string;
  description: string | null;
  file_path: string | null;
  extra_data: (Record<string, unknown> & OutcomeKnowledgeExtra) | null;
  file_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface OutcomeSummary {
  total_count: number;
  type_counts: Record<string, number>;
  summary_text: string | null;
  ready_for_paper: boolean;
  missing_items: string[];
}

export interface ReadinessCheck {
  ready: boolean;
  score: number;
  available_types: string[];
  missing_types: string[];
  suggestion: string;
}

// ========== 论文草稿 ==========

export interface ChapterOutline {
  key: string;
  title: string;
  subsections: { title: string; description: string }[];
}

export interface DraftOutline {
  chapters: ChapterOutline[];
  suggested_title: string | null;
  notes: string | null;
}

export interface PaperSection {
  key: string;
  title: string;
  content: string;
  status: "draft" | "generated" | "edited" | "final";
}

export interface Draft {
  id: string;
  project_id: string;
  title: string;
  content: Record<string, { title: string; content: string; status: string; data_based?: boolean; citations?: string[] }> | null;
  references: Record<string, unknown>[] | null;
  outline: DraftOutline | null;
  version: number;
  sections: PaperSection[];
  created_at: string;
  updated_at: string;
}

export interface ChapterResult {
  chapter_key: string;
  title: string;
  content: string;
  status: string;
  citations: string[];
  data_based: boolean;
}

export interface AbstractResult {
  abstract_cn: string;
  abstract_en: string;
  keywords_cn: string[];
  keywords_en: string[];
}

// ========== 已停用：答辩 PPT（后端能力保留，当前前端主链路不使用） ==========

export interface DefenseSlideInfo {
  page: number;
  title: string;
  content_type: string;
  description: string;
}

export interface DefensePPTOutline {
  slides: DefenseSlideInfo[];
  total_slides: number;
  has_real_data: boolean;
}

export interface DefensePPTResponse {
  success: boolean;
  filename: string | null;
  download_url: string | null;
  style_id: string | null;
  style_name: string | null;
  slide_count: number;
  has_real_data: boolean;
}

export interface DefenseScript {
  slides: { page: number; title: string; notes: string; duration_seconds: number }[];
  total_duration_minutes: number;
}

// ========== 学术合规检查 ==========

export interface ComplianceIssue {
  issue_type: string;       // data_fabrication | fake_reference | missing_marker | suspicious_statistic | ai_flag
  severity: "error" | "warning" | "info";
  chapter_key: string;
  location: string;
  description: string;
  snippet: string | null;
  suggestion: string;
  user_action: string | null;  // accept | ignore | fixed
  confirmed_at: string | null;
}

export interface ChapterCompliance {
  chapter_key: string;
  passed: boolean;
  issues: ComplianceIssue[];
  confirmed: boolean;
  confirmed_at: string | null;
}

export interface ComplianceResult {
  draft_id: string;
  overall_score: number;
  passed: boolean;
  chapters: Record<string, ChapterCompliance>;
  checked_at: string | null;
}

// ========== 文献知识图谱 ==========

export interface GraphNode {
  id: string;
  name: string;
  type: "paper" | "keyword" | "author";
  year?: number;
  citations?: number;
  venue?: string;
  symbolSize: number;
}

export interface GraphEdge {
  source: string;
  target: string;
  relation: string;
}

export interface GraphCategory {
  name: string;
  itemStyle: { color: string };
}

export interface NetworkGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
  categories: GraphCategory[];
}

export interface TimelineSeries {
  year: number;
  count: number;
  papers: {
    id: string;
    name: string;
    citations: number;
    venue: string;
    value: number;
  }[];
}

export interface TimelineGraph {
  series: TimelineSeries[];
  year_range: [number, number];
}

export interface ClusterItem {
  name: string;
  value: number;
  papers: {
    id: string;
    name: string;
    citations: number;
  }[];
}

export interface ClusterGraph {
  clusters: ClusterItem[];
}

export interface ImpactGraph {
  top_papers: {
    id: string;
    name: string;
    citations: number;
    venue: string;
    year: number;
    authors: string;
  }[];
  venue_distribution: { name: string; value: number }[];
  citation_range: [number, number];
}

export interface KnowledgeGraphData {
  network: NetworkGraph;
  timeline: TimelineGraph;
  clusters: ClusterGraph;
  impact: ImpactGraph;
  stats: {
    total_papers: number;
    year_range: [number, number];
    total_citations: number;
    keywords_count: number;
  };
}

/** SSE 事件类型 */
// ========== 用户认证 ==========

export interface UserInfo {
  id: string;
  email: string;
  username: string;
  is_active: boolean;
  created_at: string;
}

export interface TokenResponse {
  access_token: string;
  token_type: string;
  user_id: string;
  username: string;
  email: string;
}

// ========== Agent Workflow 执行记录 ==========

export interface AgentWorkflowStep {
  id: string;
  run_id: string;
  node_name: string;
  status: string;
  input_summary: Record<string, unknown> | null;
  output_summary: Record<string, unknown> | null;
  error_message: string | null;
  duration_ms: number;
  started_at: string | null;
  finished_at: string | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface AgentWorkflowRun {
  id: string;
  workflow_name: string;
  status: string;
  user_id: string | null;
  project_id: string | null;
  search_task_id: string | null;
  input_snapshot: Record<string, unknown> | null;
  output_snapshot: Record<string, unknown> | null;
  error_message: string | null;
  started_at: string | null;
  finished_at: string | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface AgentWorkflowRunDetail extends AgentWorkflowRun {
  steps: AgentWorkflowStep[];
}

export type SSEEvent =
  | { type: "status"; status: string; message: string }
  | { type: "sources"; external_papers: SearchResultItem[]; project_context_items: ProjectContextItem[]; source_statuses?: Record<string, SourceStatusInfo>; task_id?: string | null }
  | { type: "token"; content: string }
  | { type: "done"; conversation_id: string; message_id: string | null }
  | { type: "error"; message: string };

export type ResearchMode = "quick_search" | "literature_review" | "deep_research";
export type LibraryScope = "all" | "cn" | "en";

// ========== Zotero 同步 ==========

export interface ZoteroCollection {
  key: string;
  name: string;
  parent_key: string | null;
  item_count: number;
}

export interface ZoteroSyncInfo {
  id: string;
  project_id: string;
  library_type: string;
  library_id: string;
  last_sync_version: number | null;
  sync_status: "idle" | "syncing" | "error";
  synced_collections: string[];
  last_sync_at: string | null;
  created_at: string | null;
}

export interface ZoteroImportResult {
  imported: number;
  updated: number;
  skipped: number;
  total: number;
  errors: string[];
}

export interface ZoteroConnectInfo {
  connected: boolean;
  user_id: string;
  username: string;
  display_name: string;
  library_type: string;
  library_id: string;
}
