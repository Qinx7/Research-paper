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
  source: "openalex" | "semantic_scholar" | "cnki" | "cqvip" | "crossref" | "arxiv";
  language?: "cn" | "en";
  relevance_score?: number;
  freshness_score?: number;
  impact_score?: number;
  quality_score?: number;
  final_score?: number;
  is_open_access?: boolean | null;
  quality_flags?: string[];
  quality_inference?: string[];
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
    cnki?: number;
    cqvip?: number;
    crossref?: number;
    arxiv?: number;
  };
  source_statuses?: Record<string, SourceStatusInfo>;
  papers: Paper[];
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
  extra_data: Record<string, unknown> | null;
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
  content: Record<string, { title: string; content: string; status: string; data_based?: boolean }> | null;
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

// ========== 答辩 PPT ==========

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
