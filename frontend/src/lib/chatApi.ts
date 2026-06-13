/** 聊天 API —— SSE 流式 + 对话 CRUD */
import type { Conversation, ConversationDetail, SSEEvent, ResearchMode, LibraryScope, Project } from "./types";
import { API_BASE_URL, authHeaders } from "./api";

/** 发送消息并以异步生成器逐条 yield SSE 事件 */
export async function* sendMessageStream(
  message: string,
  conversationId: string | null,
  searchEnabled: boolean,
  researchMode: ResearchMode,
  libraryScope: LibraryScope,
  projectId: string | null,
): AsyncGenerator<SSEEvent, void, undefined> {
  const res = await fetch(`${API_BASE_URL}/api/chat/send`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({
      message,
      conversation_id: conversationId,
      search_enabled: searchEnabled,
      research_mode: researchMode,
      library_scope: libraryScope,
      project_id: projectId,
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `请求失败 (${res.status})`);
  }

  const reader = res.body?.getReader();
  if (!reader) throw new Error("无法读取响应流");

  const decoder = new TextDecoder("utf-8");
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    // 最后一个可能不完整，保留在 buffer
    buffer = lines.pop() || "";

    for (const line of lines) {
      if (line.startsWith("data: ")) {
        const jsonStr = line.slice(6);
        try {
          const data = JSON.parse(jsonStr);
          if (data.type) {
            yield data as SSEEvent;
          }
        } catch {
          // 跳过无法解析的行
        }
      }
    }
  }
}

/** 获取可用项目列表，用于聊天中的项目上下文选择 */
export async function listProjectsForChat(): Promise<Project[]> {
  const res = await fetch(`${API_BASE_URL}/api/projects/`, { headers: authHeaders() });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `请求失败 (${res.status})`);
  }
  return res.json();
}

/** 获取对话列表 */
export async function listConversations(): Promise<Conversation[]> {
  const res = await fetch(`${API_BASE_URL}/api/chat/conversations`, { headers: authHeaders() });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `请求失败 (${res.status})`);
  }
  return res.json();
}

/** 获取对话详情 */
export async function getConversation(id: string): Promise<ConversationDetail> {
  const res = await fetch(`${API_BASE_URL}/api/chat/conversations/${id}`, { headers: authHeaders() });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `请求失败 (${res.status})`);
  }
  return res.json();
}

/** 删除对话 */
export async function deleteConversation(id: string): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/api/chat/conversations/${id}`, {
    method: "DELETE",
    headers: authHeaders(),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `请求失败 (${res.status})`);
  }
}
