/** 后端 API 调用封装 —— 统一直连当前后端实例 */
export const API_BASE_URL = "http://127.0.0.1:8000";
const BASE_URL = API_BASE_URL;

/** 从 localStorage 获取 JWT Token */
export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("auth_token");
}

/** 保存 Token 到 localStorage */
export function setToken(token: string | null) {
  if (typeof window === "undefined") return;
  if (token) {
    localStorage.setItem("auth_token", token);
  } else {
    localStorage.removeItem("auth_token");
  }
}

/** 获取带认证信息的请求头 */
export function authHeaders(): Record<string, string> {
  const token = getToken();
  const headers: Record<string, string> = { "Content-Type": "application/json; charset=utf-8" };
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }
  return headers;
}

import type {
  Project,
  AnalyzeRequirementResponse,
  SearchLiteratureResponse,
  AnalyzeLiteratureResponse,
  GenerateDirectionsResponse,
  GenerateDesignResponse,
  GeneratePPTResponse,
  ListPPTsResponse,
  PPTStyle,
  ProposalOut,
  LiteratureAnalysisInput,
  Paper,
  ResearchDirection,
  ProjectDesign,
  PersistedProjectDesign,
  PersistedResearchDirection,
  Outcome,
  OutcomeSummary,
  ReadinessCheck,
  Draft,
  DraftOutline,
  ChapterResult,
  AbstractResult,
  DefensePPTResponse,
  DefensePPTOutline,
  DefenseScript,
  OutcomeTypeInfo,
} from "./types";

export interface TaskLaunchResponse {
  task_id: string;
  status: string;
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `请求失败 (${res.status})`);
  }

  return res.json();
}

async function patch<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    method: "PATCH",
    headers: authHeaders(),
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `请求失败 (${res.status})`);
  }

  return res.json();
}

/** 带认证的 GET 请求 */
async function authGet<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: authHeaders() });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `请求失败 (${res.status})`);
  }
  return res.json();
}

/** 带认证的 DELETE 请求 */
async function authDelete(url: string): Promise<void> {
  const res = await fetch(url, { method: "DELETE", headers: authHeaders() });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `请求失败 (${res.status})`);
  }
}

/** 获取所有项目（仅当前用户） */
export async function listProjects(): Promise<Project[]> {
  return authGet<Project[]>(`${API_BASE_URL}/api/projects/`);
}

/** 获取单个项目 */
export async function getProject(projectId: string): Promise<Project> {
  return authGet<Project>(`${API_BASE_URL}/api/projects/${projectId}`);
}

/** 创建研究项目 */
export function createProject(params: {
  name: string;
  research_field: string;
  user_requirement: string;
}) {
  return post<Project>("/api/projects/", params);
}

/** 删除研究项目 */
export function deleteProject(projectId: string): Promise<void> {
  return authDelete(`/api/projects/${projectId}`);
}

/** 阶段1：分析用户研究需求 */
export function analyzeRequirement(requirement: string) {
  return post<AnalyzeRequirementResponse>("/api/agents/analyze-requirement", {
    requirement,
  });
}

/** 阶段2：根据关键词检索文献 */
export function searchLiterature(params: {
  keywords_cn: string[];
  keywords_en: string[];
  year_from?: number;
  year_to?: number;
  mode?: string;
  library_scope?: string;
  min_citation_count?: number;
  prefer_high_impact?: boolean;
}) {
  return post<SearchLiteratureResponse>("/api/literature/search", {
    keywords_cn: params.keywords_cn,
    keywords_en: params.keywords_en,
    year_from: params.year_from ?? 2020,
    year_to: params.year_to ?? 2026,
    mode: params.mode ?? "quick_search",
    library_scope: params.library_scope ?? "all",
    min_citation_count: params.min_citation_count ?? 0,
    prefer_high_impact: params.prefer_high_impact ?? false,
  });
}

/** 阶段3：分析文献 */
export function analyzeLiterature(params: {
  papers: Paper[];
  requirement: string;
}) {
  return post<AnalyzeLiteratureResponse>("/api/literature/analyze", {
    papers: params.papers,
    requirement: params.requirement,
  });
}

/** 阶段4：生成研究方向 */
export function generateDirections(params: {
  literatureAnalysis: LiteratureAnalysisInput;
  requirement: string;
  projectId?: string | null;
}) {
  return post<GenerateDirectionsResponse>("/api/research/directions", {
    literature_analysis: params.literatureAnalysis,
    requirement: params.requirement,
    project_id: params.projectId ?? null,
  });
}

/** 阶段5：生成项目设计方案 */
export function generateDesign(params: {
  direction: ResearchDirection;
  literatureAnalysis?: LiteratureAnalysisInput;
  requirement: string;
  projectId?: string | null;
  directionId?: string | null;
}) {
  return post<GenerateDesignResponse>("/api/research/design", {
    direction: params.direction,
    literature_analysis: params.literatureAnalysis ?? {},
    requirement: params.requirement,
    project_id: params.projectId ?? null,
    direction_id: params.directionId ?? null,
  });
}

/** 获取已保存的研究方向 */
export async function listResearchDirections(projectId?: string) {
  const searchParams = new URLSearchParams();
  if (projectId) searchParams.set("project_id", projectId);
  const qs = searchParams.toString();
  return authGet<PersistedResearchDirection[]>(`${API_BASE_URL}/api/research/directions${qs ? `?${qs}` : ""}`);
}

/** 获取已保存的项目设计方案 */
export async function listProjectDesigns(projectId?: string) {
  const searchParams = new URLSearchParams();
  if (projectId) searchParams.set("project_id", projectId);
  const qs = searchParams.toString();
  return authGet<PersistedProjectDesign[]>(`${API_BASE_URL}/api/research/designs${qs ? `?${qs}` : ""}`);
}

/** 阶段6：生成开题 PPTX */
export function generatePPT(params: { design: ProjectDesign; template: string }) {
  return post<GeneratePPTResponse>("/api/ppt/proposal", {
    design: params.design,
    template: params.template,
  });
}

/** 列出所有已生成的 PPT 文件 */
export async function listPPTs() {
  const res = await fetch(`${BASE_URL}/api/ppt/list`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `请求失败 (${res.status})`);
  }
  return res.json() as Promise<ListPPTsResponse>;
}

/** 阶段7：生成开题报告 */
export function generateProposal(params: { project_id: string; design_id: string }) {
  return post<ProposalOut>("/api/proposal/generate", {
    project_id: params.project_id,
    design_id: params.design_id,
  });
}

/** 获取单个开题报告详情 */
export async function getProposal(proposalId: string) {
  const res = await fetch(`${BASE_URL}/api/proposal/${proposalId}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `请求失败 (${res.status})`);
  }
  return res.json() as Promise<ProposalOut>;
}

/** 获取可选 PPT 风格列表 */
export async function listPPTStyles() {
  const res = await fetch(`${BASE_URL}/api/ppt/styles`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `请求失败 (${res.status})`);
  }
  return res.json() as Promise<PPTStyle[]>;
}

// ========== 成果管理 ==========

/** 上传项目成果文件 */
export async function uploadOutcome(params: {
  file: File;
  project_id: string;
  outcome_type: string;
  name: string;
  description?: string;
}) {
  const formData = new FormData();
  formData.append("file", params.file);
  formData.append("project_id", params.project_id);
  formData.append("outcome_type", params.outcome_type);
  formData.append("name", params.name);
  if (params.description) formData.append("description", params.description);

  const res = await fetch(`${BASE_URL}/api/outcomes/upload`, {
    method: "POST",
    body: formData,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `上传失败 (${res.status})`);
  }
  return res.json() as Promise<Outcome>;
}

/** 列出项目成果 */
export async function listOutcomes(params?: { project_id?: string; outcome_type?: string }) {
  const searchParams = new URLSearchParams();
  if (params?.project_id) searchParams.set("project_id", params.project_id);
  if (params?.outcome_type) searchParams.set("outcome_type", params.outcome_type);
  const qs = searchParams.toString();
  const res = await fetch(`${BASE_URL}/api/outcomes/${qs ? "?" + qs : ""}`);
  if (!res.ok) throw new Error("获取成果列表失败");
  return res.json() as Promise<Outcome[]>;
}

/** 获取成果类型列表 */
export async function listOutcomeTypes() {
  const res = await fetch(`${BASE_URL}/api/outcomes/types`);
  if (!res.ok) throw new Error("获取成果类型失败");
  return res.json() as Promise<OutcomeTypeInfo[]>;
}

/** 删除成果 */
export async function deleteOutcome(outcomeId: string) {
  const res = await fetch(`${BASE_URL}/api/outcomes/${outcomeId}`, { method: "DELETE" });
  if (!res.ok) throw new Error("删除成果失败");
}

/** AI 汇总项目成果 */
export async function summarizeOutcomes(projectId: string) {
  const res = await fetch(`${BASE_URL}/api/outcomes/${projectId}/summarize`, { method: "POST" });
  if (!res.ok) throw new Error("汇总失败");
  return res.json() as Promise<OutcomeSummary>;
}

/** 检查论文就绪状态 */
export async function checkReadiness(projectId: string) {
  const res = await fetch(`${BASE_URL}/api/outcomes/${projectId}/check-readiness`, { method: "POST" });
  if (!res.ok) throw new Error("检查失败");
  return res.json() as Promise<ReadinessCheck>;
}

// ========== 论文草稿 ==========

/** 创建论文草稿 */
export function createDraft(params: { project_id: string; title: string }) {
  return post<Draft>("/api/drafts/", params);
}

/** 获取论文草稿列表 */
export async function listDrafts(projectId?: string) {
  const qs = projectId ? `?project_id=${projectId}` : "";
  const res = await fetch(`${BASE_URL}/api/drafts/${qs}`);
  if (!res.ok) throw new Error("获取草稿列表失败");
  return res.json() as Promise<Draft[]>;
}

/** 获取单个草稿 */
export async function getDraft(draftId: string) {
  const res = await fetch(`${BASE_URL}/api/drafts/${draftId}`);
  if (!res.ok) throw new Error("获取草稿失败");
  return res.json() as Promise<Draft>;
}

/** 更新草稿 */
export function updateDraft(draftId: string, params: Record<string, unknown>) {
  return patch<Draft>(`/api/drafts/${draftId}`, params);
}

/** 删除草稿 */
export async function deleteDraft(draftId: string) {
  const res = await fetch(`${BASE_URL}/api/drafts/${draftId}`, { method: "DELETE" });
  if (!res.ok) throw new Error("删除草稿失败");
}

/** 生成论文大纲 */
export function generateOutline(draftId: string) {
  return post<DraftOutline>(`/api/drafts/${draftId}/outline`, {});
}

/** 生成章节内容 */
export function generateChapter(draftId: string, chapterKey: string) {
  return post<ChapterResult>(`/api/drafts/${draftId}/chapters/${chapterKey}`, {
    chapter_key: chapterKey,
  });
}

/** 异步生成章节内容 */
export async function generateChapterAsync(draftId: string, chapterKey: string) {
  const res = await fetch(`${BASE_URL}/api/drafts/${draftId}/chapters/${chapterKey}?async=true`, {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify({ chapter_key: chapterKey }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `请求失败 (${res.status})`);
  }
  return res.json() as Promise<TaskLaunchResponse>;
}

/** 生成摘要 */
export function generateAbstract(draftId: string) {
  return post<AbstractResult>(`/api/drafts/${draftId}/abstract`, {});
}

/** 获取论文预览 */
export async function getDraftPreview(draftId: string) {
  const res = await fetch(`${BASE_URL}/api/drafts/${draftId}/preview`);
  if (!res.ok) throw new Error("获取预览失败");
  return res.json() as Promise<{ title: string; full_text: string; version: number }>;
}

/** 下载论文草稿（docx 或 pdf） */
export function getDraftDownloadUrl(draftId: string, format: "docx" | "pdf" = "docx") {
  return `${BASE_URL}/api/drafts/${draftId}/download?format=${format}`;
}

// ========== 学术合规检查 ==========

/** 运行合规检查（规则 + 可选 AI） */
export async function checkCompliance(draftId: string, enableAi = false) {
  const res = await fetch(`${BASE_URL}/api/drafts/${draftId}/check-compliance?enable_ai=${enableAi}`, {
    method: "POST",
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `合规检查失败 (${res.status})`);
  }
  return res.json();
}

/** 用户确认/忽略/修正某个合规 issue */
export async function confirmComplianceIssue(
  draftId: string,
  chapterKey: string,
  issueIndex: number,
  action: "accept" | "ignore" | "fixed",
) {
  const res = await fetch(`${BASE_URL}/api/drafts/${draftId}/confirm-compliance`, {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify({ chapter_key: chapterKey, issue_index: issueIndex, action }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `确认失败 (${res.status})`);
  }
  return res.json();
}

/** 获取合规检查状态 */
export async function getComplianceStatus(draftId: string) {
  const res = await fetch(`${BASE_URL}/api/drafts/${draftId}/compliance-status`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `获取合规状态失败 (${res.status})`);
  }
  return res.json();
}

// ========== 文献知识图谱 ==========

/** 获取项目的文献知识图谱数据 */
export async function getKnowledgeGraph(projectId: string) {
  const res = await fetch(`${BASE_URL}/api/literature/${projectId}/knowledge-graph`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `图谱加载失败 (${res.status})`);
  }
  return res.json();
}

// ========== 答辩 PPT ==========

/** 获取答辩 PPT 风格列表 */
export async function listDefensePPTStyles() {
  const res = await fetch(`${BASE_URL}/api/defense/ppt/styles`);
  if (!res.ok) throw new Error("获取风格失败");
  return res.json() as Promise<PPTStyle[]>;
}

/** 生成答辩 PPT */
export function generateDefensePPT(params: { draft_id: string; template: string }) {
  return post<DefensePPTResponse>("/api/defense/ppt", params);
}

/** 异步生成答辩 PPT */
export async function generateDefensePPTAsync(params: { draft_id: string; template: string }) {
  const res = await fetch(`${BASE_URL}/api/defense/ppt?async=true`, {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify(params),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `请求失败 (${res.status})`);
  }
  return res.json() as Promise<TaskLaunchResponse>;
}

/** 获取答辩 PPT 大纲 */
export async function getDefenseOutline(draftId: string) {
  const res = await fetch(`${BASE_URL}/api/defense/ppt/${draftId}/outline`);
  if (!res.ok) throw new Error("获取大纲失败");
  return res.json() as Promise<DefensePPTOutline>;
}

/** 获取答辩演讲稿 */
export async function getDefenseScript(draftId: string) {
  const res = await fetch(`${BASE_URL}/api/defense/ppt/${draftId}/script`);
  if (!res.ok) throw new Error("获取演讲稿失败");
  return res.json() as Promise<DefenseScript>;
}

/** 下载答辩 PPT URL */
export function getDefensePPTDownloadUrl(filename: string) {
  return `${BASE_URL}/api/defense/ppt/download/${filename}`;
}

// ========== 异步任务 ==========

export interface TaskStatus {
  task_id: string;
  status: "PENDING" | "STARTED" | "RETRY" | "SUCCESS" | "FAILURE";
  ready: boolean;
  result?: unknown;
  error?: string;
}

/** 异步生成 PPT（立即返回 task_id） */
export async function generatePPTAsync(params: { design: ProjectDesign; template: string }) {
  const res = await fetch(`${BASE_URL}/api/ppt/proposal?async=true`, {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify(params),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `请求失败 (${res.status})`);
  }
  return res.json() as Promise<TaskLaunchResponse>;
}

/** 异步生成开题报告（立即返回 task_id） */
export async function generateProposalAsync(params: { project_id: string; design_id: string }) {
  const res = await fetch(`${BASE_URL}/api/proposal/generate?async=true`, {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify(params),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `请求失败 (${res.status})`);
  }
  return res.json() as Promise<TaskLaunchResponse>;
}

/** 轮询任务状态 */
export async function pollTask(taskId: string): Promise<TaskStatus> {
  const res = await fetch(`${BASE_URL}/api/tasks/${taskId}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `请求失败 (${res.status})`);
  }
  return res.json();
}

/** 轮询直到任务完成，回调通知进度 */
export function pollUntilDone(
  taskId: string,
  onResult: (result: TaskStatus) => void,
  intervalMs = 2000,
): () => void {
  let cancelled = false;
  const poll = async () => {
    while (!cancelled) {
      try {
        const status = await pollTask(taskId);
        onResult(status);
        if (status.ready) return;
      } catch {
        // 轮询失败不中断
      }
      await new Promise((r) => setTimeout(r, intervalMs));
    }
  };
  poll();
  return () => { cancelled = true; };
}

// ========== Zotero 同步 ==========

/** 连接 Zotero 账户并验证 API Key */
export function connectZotero(params: {
  project_id: string;
  api_key: string;
  library_type: string;
  library_id: string;
}) {
  return post<import("./types").ZoteroConnectInfo>("/api/zotero/connect", params);
}

/** 获取 Zotero 集合列表 */
export async function getZoteroCollections(projectId: string) {
  const res = await fetch(`${BASE_URL}/api/zotero/${projectId}/collections`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "获取集合列表失败");
  }
  return res.json() as Promise<import("./types").ZoteroCollection[]>;
}

/** 同步 Zotero 文献到项目 */
export function syncZotero(params: {
  project_id: string;
  collection_keys: string[];
}) {
  return post<import("./types").ZoteroImportResult>("/api/zotero/sync", params);
}

/** 获取 Zotero 同步状态 */
export async function getZoteroStatus(projectId: string) {
  const res = await fetch(`${BASE_URL}/api/zotero/${projectId}/status`);
  if (!res.ok) return null;
  return res.json() as Promise<import("./types").ZoteroSyncInfo | null>;
}

/** 断开 Zotero 连接 */
export async function disconnectZotero(projectId: string) {
  const res = await fetch(`${BASE_URL}/api/zotero/${projectId}/disconnect`, { method: "DELETE" });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "断开连接失败");
  }
}

// ========== 用户认证 ==========

/** 注册新用户 */
export function register(params: { email: string; username: string; password: string }) {
  return post<import("./types").TokenResponse>("/api/auth/register", params);
}

/** 邮箱 + 密码登录 */
export function login(params: { email: string; password: string }) {
  return post<import("./types").TokenResponse>("/api/auth/login", params);
}

/** 获取当前登录用户信息 */
export async function getMe() {
  return authGet<import("./types").UserInfo>(`${BASE_URL}/api/auth/me`);
}
