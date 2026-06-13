"use client";

// AI 学术对话页：连接聊天流、历史会话和学术检索证据展示。
import { useState, useCallback, useRef, useEffect } from "react";
import ChatSidebar from "@/components/chat/ChatSidebar";
import ChatMessages from "@/components/chat/ChatMessages";
import ChatInput from "@/components/chat/ChatInput";
import WorkbenchSettingsPanel from "@/components/chat/WorkbenchSettingsPanel";
import { sendMessageStream, listProjectsForChat, getConversation } from "@/lib/chatApi";
import type { ChatMessage, ResearchMode, LibraryScope, Project, SearchEvidenceBundle } from "@/lib/types";
import { CHAT_THEME } from "@/components/chat/chatTheme";

export default function ChatPage() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [streamingContent, setStreamingContent] = useState("");
  const [streamingEvidence, setStreamingEvidence] = useState<SearchEvidenceBundle | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [statusText, setStatusText] = useState("正在思考");
  const [errorText, setErrorText] = useState<string | null>(null);
  const [sidebarKey, setSidebarKey] = useState(0);
  const [settingsOpen, setSettingsOpen] = useState(false);

  // 用 ref 累积流式内容和证据，避免异步事件读到过期状态。
  const contentRef = useRef("");
  const evidenceRef = useRef<SearchEvidenceBundle | null>(null);

  useEffect(() => {
    listProjectsForChat().then(setProjects).catch(() => {});
  }, []);

  const handleSend = useCallback(
    async (
      message: string,
      searchEnabled: boolean,
      researchMode: ResearchMode,
      libraryScope: LibraryScope,
      selectedProjectId: string | null,
    ) => {
      const userMsg: ChatMessage = {
        id: "temp-" + Date.now(),
        conversation_id: conversationId || "",
        role: "user",
        content: message,
        created_at: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, userMsg]);
      setIsStreaming(true);
      setStreamingContent("");
      setStreamingEvidence(null);
      setErrorText(null);
      setStatusText(searchEnabled ? "正在检索文献" : "正在思考");
      contentRef.current = "";
      evidenceRef.current = null;

      try {
        setProjectId(selectedProjectId);
        const stream = sendMessageStream(
          message,
          conversationId,
          searchEnabled,
          researchMode,
          libraryScope,
          selectedProjectId,
        );
        for await (const event of stream) {
          switch (event.type) {
            case "status":
              setStatusText(event.message || event.status);
              break;
            case "token":
              contentRef.current += event.content;
              setStreamingContent(contentRef.current);
              break;
            case "sources":
              evidenceRef.current = {
                external_papers: event.external_papers || [],
                project_context_items: event.project_context_items || [],
                source_statuses: event.source_statuses || {},
              };
              setStreamingEvidence(evidenceRef.current);
              break;
            case "done": {
              const finalContent = contentRef.current;
              const finalEvidence = evidenceRef.current;
              const fallbackMessages = (prev: ChatMessage[]) => [
                ...prev,
                {
                  id: event.message_id || "done-" + Date.now(),
                  conversation_id: event.conversation_id,
                  role: "assistant" as const,
                  content: finalContent,
                  search_results: finalEvidence,
                  created_at: new Date().toISOString(),
                },
              ];

              try {
                const detail = await getConversation(event.conversation_id);
                setMessages(detail.messages);
              } catch {
                setMessages(fallbackMessages);
              }
              setConversationId(event.conversation_id);
              setStreamingContent("");
              setStreamingEvidence(null);
              contentRef.current = "";
              evidenceRef.current = null;
              setIsStreaming(false);
              setSidebarKey((key) => key + 1);
              break;
            }
            case "error":
              console.error("SSE 错误:", event.message);
              setErrorText(event.message || "学术对话处理失败");
              setIsStreaming(false);
              setStreamingEvidence(null);
              evidenceRef.current = null;
              break;
          }
        }
      } catch (err) {
        console.error("发送消息失败", err);
        setErrorText(err instanceof Error ? err.message : "发送消息失败");
        setIsStreaming(false);
        setStreamingContent("");
        setStreamingEvidence(null);
        evidenceRef.current = null;
        contentRef.current = "";
      }
    },
    [conversationId]
  );

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const query = params.get("query")?.trim();
    const mode = params.get("mode");
    const scope = params.get("scope");
    if (!query) return;

    const normalizedMode: ResearchMode =
      mode === "quick_search" || mode === "deep_research" || mode === "literature_review"
        ? mode
        : "literature_review";
    const normalizedScope: LibraryScope =
      scope === "cn" || scope === "en" || scope === "all" ? scope : "all";

    if (messages.length > 0 || isStreaming) return;

    handleSend(query, true, normalizedMode, normalizedScope, null);
  }, [messages.length, isStreaming, handleSend]);

  const handleSelectConversation = useCallback((id: string, msgs: ChatMessage[]) => {
    setConversationId(id);
    setMessages(msgs);
    setStreamingContent("");
    setStreamingEvidence(null);
    evidenceRef.current = null;
    setErrorText(null);
    contentRef.current = "";
    setIsStreaming(false);
  }, []);

  const handleNewChat = useCallback(() => {
    setConversationId(null);
    setMessages([]);
    setStreamingContent("");
    setStreamingEvidence(null);
    evidenceRef.current = null;
    setErrorText(null);
    contentRef.current = "";
    setIsStreaming(false);
  }, []);

  return (
    <div className="flex h-screen" style={{ background: CHAT_THEME.bg, color: CHAT_THEME.text }}>
      <ChatSidebar
        currentId={conversationId}
        onSelect={handleSelectConversation}
        onNewChat={handleNewChat}
        onOpenSettings={() => setSettingsOpen(true)}
        refreshKey={sidebarKey}
      />
      <main className="flex min-w-0 flex-1 flex-col">
        <header
          className="flex h-16 shrink-0 items-center justify-between px-7"
          style={{ background: CHAT_THEME.card, borderBottom: `1px solid ${CHAT_THEME.border}` }}
        >
          <div className="min-w-0">
            <h1 className="truncate text-[20px] font-semibold leading-tight" style={{ color: CHAT_THEME.text, fontFamily: "var(--font-cormorant), serif" }}>
              文献搜索
            </h1>
            <p className="mt-0.5 text-xs" style={{ color: CHAT_THEME.mid }}>
              输入研究问题，返回可核验的学术文献结果
            </p>
          </div>
          <div className="hidden items-center gap-2 md:flex">
            <HeaderToolButton label="筛选" muted>
              <path d="M4 6h16l-6.5 7.2V18l-3 1.5v-6.3Z" />
            </HeaderToolButton>
            <HeaderToolButton label="精准模式">
              <path d="m12 3 1.6 4.6L18 9.2l-4.4 1.6L12 15.5l-1.6-4.7L6 9.2l4.4-1.6Z" />
              <path d="M19 15v4M17 17h4" />
            </HeaderToolButton>
          </div>
        </header>

        <section className="flex min-h-0 flex-1">
          <div className="flex min-w-0 flex-1 flex-col">
            <ChatMessages
              messages={messages}
              streamingContent={streamingContent}
              streamingEvidence={streamingEvidence}
              isStreaming={isStreaming}
              statusText={errorText || statusText}
            />

            <ChatInput
              onSend={handleSend}
              projectId={projectId}
              projectOptions={projects.map((project) => ({ id: project.id, name: project.name }))}
              disabled={isStreaming}
            />
          </div>
        </section>
      </main>

      {settingsOpen && <WorkbenchSettingsPanel onClose={() => setSettingsOpen(false)} />}
    </div>
  );
}

function HeaderToolButton({
  label,
  muted,
  children,
}: {
  label: string;
  muted?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-all"
      style={{
        background: muted ? CHAT_THEME.muted : CHAT_THEME.primary,
        color: muted ? CHAT_THEME.mid : CHAT_THEME.bg,
        border: `1px solid ${muted ? CHAT_THEME.border : "transparent"}`,
      }}
    >
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        {children}
      </svg>
      {label}
    </button>
  );
}
