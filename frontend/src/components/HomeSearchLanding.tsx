/** 首页学术检索入口：统一承接检索、学术对话、会话历史和 References 面板。 */
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createProject, listProjects, saveProjectPaper, saveResearchDirection, searchLiterature } from "@/lib/api";
import { useAuth } from "@/lib/AuthContext";
import TopicResearchPanel from "@/components/TopicResearchPanel";
import ChatMessages from "@/components/chat/ChatMessages";
import ChatInput from "@/components/chat/ChatInput";
import { deleteConversation, getConversation, listConversations, sendMessageStream } from "@/lib/chatApi";
import { buildAuthorityBadgeItems } from "@/lib/authorityBadges.mjs";
import {
  buildPaperExplanation,
  buildPaperCompactReasons,
  buildSearchHistoryStatusHint,
  buildSourceStatusSections,
  sourceLabel,
  sourceStatusClass,
  sourceStatusText,
} from "@/lib/searchExplain.mjs";
import type {
  ChatMessage,
  Conversation,
  DirectionScore,
  LibraryScope,
  LiteratureQualityFilters,
  Paper,
  Project,
  ResearchDirection,
  SearchDiagnostics,
  ResearchMode,
  SearchEvidenceBundle,
  SearchSummary,
  SourceStatusInfo,
  TopicResearchSnapshot,
} from "@/lib/types";

const SUGGESTIONS = [
  "生成式人工智能支持研究生论文写作的实证研究",
  "大语言模型用于高校课堂反馈分析的中文文献",
  "智能体在教育评价与学习分析中的最新进展",
];

const MODE_OPTIONS: { value: ResearchMode; label: string; hint: string }[] = [
  { value: "quick_search", label: "Quick", hint: "快速检索" },
  { value: "literature_review", label: "Review", hint: "综述优先" },
  { value: "deep_research", label: "Deep", hint: "深度研究" },
];

const SCOPE_OPTIONS: { value: LibraryScope; label: string }[] = [
  { value: "all", label: "Corpus" },
  { value: "cn", label: "中文" },
  { value: "en", label: "英文" },
];

const QUALITY_SOURCE_OPTIONS = [
  { value: "pubmed", label: "PubMed", kind: "真实来源" },
  { value: "pubscholar", label: "PubScholar", kind: "真实来源" },
  { value: "cnki", label: "知网", kind: "真实来源" },
  { value: "cqvip", label: "维普", kind: "真实来源" },
  { value: "openalex", label: "OpenAlex", kind: "真实来源" },
  { value: "semantic_scholar", label: "Semantic Scholar", kind: "真实来源" },
  { value: "crossref", label: "Crossref", kind: "真实来源" },
  { value: "arxiv", label: "arXiv", kind: "真实来源" },
] as const;

const QUALITY_TAG_OPTIONS = [
  { value: "ieee", label: "IEEE", verification: "可核验" },
  { value: "acm", label: "ACM", verification: "可核验" },
  { value: "pku_core", label: "北大核心", verification: "白名单" },
  { value: "ei", label: "EI", verification: "需授权目录" },
  { value: "jcr", label: "JCR", verification: "需授权目录" },
  { value: "cas", label: "中科院分区", verification: "需授权目录" },
] as const;

type SearchHistoryItem = {
  id: string;
  query: string;
  mode: ResearchMode;
  scope: LibraryScope;
  filters?: LiteratureQualityFilters;
    snapshot?: {
      papers: Paper[];
      sourceStatuses: Record<string, SourceStatusInfo>;
      searchSummary: SearchSummary | null;
      searchDiagnostics: SearchDiagnostics | null;
      currentTaskId: string | null;
      topicResearch?: TopicResearchSnapshot | null;
    };
  created_at: string;
};

const SEARCH_HISTORY_STORAGE_KEY = "learning_agent_home_search_history";
const DEFAULT_FILTERS: LiteratureQualityFilters = {
  sources: [],
  open_access_only: false,
  quality_tags: [],
  min_citation_count: 0,
};

export default function HomeSearchLanding() {
  const router = useRouter();
  const { user, loading: authLoading, logout } = useAuth();
  const [query, setQuery] = useState("");
  const [activeQuery, setActiveQuery] = useState("");
  const [mode, setMode] = useState<ResearchMode>("literature_review");
  const [scope, setScope] = useState<LibraryScope>("all");
  const [papers, setPapers] = useState<Paper[]>([]);
  const [sourceStatuses, setSourceStatuses] = useState<Record<string, SourceStatusInfo>>({});
  const [searchSummary, setSearchSummary] = useState<SearchSummary | null>(null);
  const [searchDiagnostics, setSearchDiagnostics] = useState<SearchDiagnostics | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [filters, setFilters] = useState<LiteratureQualityFilters>({ ...DEFAULT_FILTERS });
  const [currentTaskId, setCurrentTaskId] = useState<string | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string>("");
  const [savingPaperKey, setSavingPaperKey] = useState<string | null>(null);
  const [savedPaperKeys, setSavedPaperKeys] = useState<string[]>([]);
  const [savingDirectionTitle, setSavingDirectionTitle] = useState<string | null>(null);
  const [savedDirectionTitles, setSavedDirectionTitles] = useState<string[]>([]);
  const [directionSaveMessage, setDirectionSaveMessage] = useState<string | null>(null);
  const [lastSavedDirectionMeta, setLastSavedDirectionMeta] = useState<{ projectId: string; directionId: string } | null>(null);
  const [topicResearchSnapshot, setTopicResearchSnapshot] = useState<TopicResearchSnapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [referencesOpen, setReferencesOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [entryMenuOpen, setEntryMenuOpen] = useState(false);
  const [workspaceView, setWorkspaceView] = useState<"topic" | "chat">("topic");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [searchHistories, setSearchHistories] = useState<SearchHistoryItem[]>([]);
  const [confirmDeleteSearchHistoryId, setConfirmDeleteSearchHistoryId] = useState<string | null>(null);
  const [streamingContent, setStreamingContent] = useState("");
  const [streamingEvidence, setStreamingEvidence] = useState<SearchEvidenceBundle | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [statusText, setStatusText] = useState("正在思考");
  const [errorText, setErrorText] = useState<string | null>(null);
  const contentRef = useRef("");
  const evidenceRef = useRef<SearchEvidenceBundle | null>(null);
  const sendingRef = useRef(false);
  const autoSubmitKeyRef = useRef<string | null>(null);

  const hasSearched = Boolean(activeQuery);
  const sourceSummary = useMemo(() => summarizeSources(papers), [papers]);
  const shellColumns = hasSearched && referencesOpen
    ? sidebarCollapsed
      ? "lg:grid-cols-[72px_minmax(0,1fr)_420px]"
      : "lg:grid-cols-[280px_minmax(0,1fr)_420px]"
    : sidebarCollapsed
      ? "lg:grid-cols-[72px_minmax(0,1fr)]"
      : "lg:grid-cols-[280px_minmax(0,1fr)]";

  const refreshConversations = useCallback(async () => {
    try {
      const list = await listConversations();
      setConversations(list);
    } catch {
      setConversations([]);
    }
  }, []);

  useEffect(() => {
    refreshConversations();
  }, [refreshConversations]);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(SEARCH_HISTORY_STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      if (Array.isArray(parsed)) {
        const normalized = parsed.slice(0, 20).map(normalizeSearchHistoryItem);
        setSearchHistories(normalized);
        window.localStorage.setItem(SEARCH_HISTORY_STORAGE_KEY, JSON.stringify(normalized));
      }
    } catch {
      setSearchHistories([]);
    }
  }, []);

  const rememberSearchHistory = useCallback((
    nextQuery: string,
    nextMode: ResearchMode,
    nextScope: LibraryScope,
    nextFilters: LiteratureQualityFilters,
    snapshot?: SearchHistoryItem["snapshot"],
  ) => {
    setSearchHistories((current) => {
      const nextItem: SearchHistoryItem = {
        id: `${Date.now()}-${nextQuery}`,
        query: nextQuery,
        mode: nextMode,
        scope: nextScope,
        filters: {
          sources: [...(nextFilters.sources || [])],
          open_access_only: nextFilters.open_access_only ?? false,
          quality_tags: [...(nextFilters.quality_tags || [])],
          min_citation_count: nextFilters.min_citation_count ?? 0,
        },
        snapshot,
        created_at: new Date().toISOString(),
      };
      const deduped = current.filter((item) => item.query !== nextQuery || item.mode !== nextMode || item.scope !== nextScope);
      const nextItems = [nextItem, ...deduped].slice(0, 20);
      window.localStorage.setItem(SEARCH_HISTORY_STORAGE_KEY, JSON.stringify(nextItems));
      return nextItems;
    });
  }, []);

  useEffect(() => {
    if (!user) {
      setProjects([]);
      setSelectedProjectId("");
      return;
    }
    listProjects()
      .then((items) => {
        setProjects(items);
        setSelectedProjectId((current) => current || items[0]?.id || "");
      })
      .catch(() => {
        setProjects([]);
        setSelectedProjectId("");
      });
  }, [user]);

  const handleSendChat = useCallback(
    async (
      message: string,
      searchEnabled: boolean,
      researchMode: ResearchMode,
      libraryScope: LibraryScope,
      chatProjectId: string | null,
    ) => {
      const trimmed = message.trim();
      if (!trimmed || sendingRef.current) return;
      sendingRef.current = true;
      setWorkspaceView("chat");

      const userMsg: ChatMessage = {
        id: `temp-${Date.now()}`,
        conversation_id: conversationId || "",
        role: "user",
        content: trimmed,
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
        if (chatProjectId) setSelectedProjectId(chatProjectId);
        const stream = sendMessageStream(trimmed, conversationId, searchEnabled, researchMode, libraryScope, chatProjectId);
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
                task_id: event.task_id ?? null,
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
                  id: event.message_id || `done-${Date.now()}`,
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
              sendingRef.current = false;
              await refreshConversations();
              break;
            }
            case "error":
              setErrorText(event.message || "学术对话处理失败");
              setIsStreaming(false);
              setStreamingEvidence(null);
              evidenceRef.current = null;
              sendingRef.current = false;
              break;
          }
        }
      } catch (err) {
        setErrorText(err instanceof Error ? err.message : "发送消息失败");
        setIsStreaming(false);
        setStreamingContent("");
        setStreamingEvidence(null);
        evidenceRef.current = null;
        contentRef.current = "";
        sendingRef.current = false;
      }
    },
    [conversationId, refreshConversations],
  );

  const handleSelectConversation = async (id: string) => {
    try {
      const detail = await getConversation(id);
      setConversationId(id);
      setMessages(detail.messages);
      setWorkspaceView("chat");
      setStreamingContent("");
      setStreamingEvidence(null);
      evidenceRef.current = null;
      contentRef.current = "";
      setErrorText(null);
      setIsStreaming(false);
      sendingRef.current = false;
    } catch {
      setErrorText("会话加载失败，请稍后重试");
    }
  };

  const handleDeleteConversation = async (id: string) => {
    try {
      await deleteConversation(id);
      setConversations((items) => items.filter((item) => item.id !== id));
      if (conversationId === id) {
        setConversationId(null);
        setMessages([]);
        setWorkspaceView(activeQuery ? "topic" : "chat");
      }
    } catch {
      setErrorText("删除会话失败，请稍后重试");
    }
  };

  const startNewChat = () => {
    setConversationId(null);
    setMessages([]);
    setStreamingContent("");
    setStreamingEvidence(null);
    evidenceRef.current = null;
    contentRef.current = "";
    setErrorText(null);
    setIsStreaming(false);
    sendingRef.current = false;
    setWorkspaceView("chat");
  };

  const openChatWithCurrentSearch = () => {
    const chatQuery = (activeQuery || query).trim();
    if (!chatQuery) {
      startNewChat();
      return;
    }
    handleSendChat(chatQuery, true, mode, scope, selectedProjectId || null);
  };

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const chatQuery = params.get("query")?.trim();
    const nextMode = params.get("mode");
    const nextScope = params.get("scope");
    const nextProjectId = params.get("project_id")?.trim() || null;
    const workspace = params.get("workspace");

    if (!chatQuery && workspace !== "chat") return;

    const normalizedMode: ResearchMode =
      nextMode === "quick_search" || nextMode === "deep_research" || nextMode === "literature_review"
        ? nextMode
        : mode;
    const normalizedScope: LibraryScope =
      nextScope === "cn" || nextScope === "en" || nextScope === "all" ? nextScope : scope;

    if (chatQuery) {
      const autoSubmitKey = `${chatQuery}|${normalizedMode}|${normalizedScope}|${nextProjectId || ""}`;
      if (autoSubmitKeyRef.current !== autoSubmitKey && !isStreaming && messages.length === 0) {
        autoSubmitKeyRef.current = autoSubmitKey;
        setQuery(chatQuery);
        setMode(normalizedMode);
        setScope(normalizedScope);
        if (nextProjectId) setSelectedProjectId(nextProjectId);
        handleSendChat(chatQuery, true, normalizedMode, normalizedScope, nextProjectId);
      }
    } else {
      setWorkspaceView("chat");
    }

    const url = new URL(window.location.href);
    url.searchParams.delete("query");
    url.searchParams.delete("mode");
    url.searchParams.delete("scope");
    url.searchParams.delete("project_id");
    url.searchParams.delete("workspace");
    window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
  }, [handleSendChat, isStreaming, messages.length, mode, scope]);

  const submitSearch = async (nextQuery = query, nextMode = mode, nextScope = scope) => {
    const trimmed = nextQuery.trim();
    if (!trimmed || loading) return;

    setWorkspaceView("topic");
    setQuery(trimmed);
    setMode(nextMode);
    setScope(nextScope);
    setActiveQuery(trimmed);
    setLoading(true);
    setError(null);
    setSavedDirectionTitles([]);
    setDirectionSaveMessage(null);
    setReferencesOpen(true);

    try {
      const keywordPayload = buildKeywordPayload(trimmed, nextScope);
      const result = await searchLiterature({
        ...keywordPayload,
        project_id: selectedProjectId || null,
        mode: nextMode,
        library_scope: nextScope,
        min_citation_count: Math.max(nextMode === "quick_search" ? 0 : 1, filters.min_citation_count ?? 0),
        prefer_high_impact: nextMode !== "quick_search",
        sources: filters.sources?.length ? filters.sources : undefined,
        open_access_only: filters.open_access_only ?? false,
        quality_tags: filters.quality_tags ?? [],
      });
      setPapers(result.papers ?? []);
      setSourceStatuses(result.source_statuses ?? {});
      setSearchSummary(result.search_summary ?? null);
      setSearchDiagnostics(result.search_diagnostics ?? null);
      setCurrentTaskId(result.task_id ?? null);
      setTopicResearchSnapshot(null);
      rememberSearchHistory(trimmed, nextMode, nextScope, filters, {
        papers: result.papers ?? [],
        sourceStatuses: result.source_statuses ?? {},
        searchSummary: result.search_summary ?? null,
        searchDiagnostics: result.search_diagnostics ?? null,
        currentTaskId: result.task_id ?? null,
        topicResearch: null,
      });
    } catch (err) {
      setPapers([]);
      setSourceStatuses({});
      setSearchSummary(null);
      setSearchDiagnostics(null);
      setCurrentTaskId(null);
      setTopicResearchSnapshot(null);
      setError(err instanceof Error ? err.message : "检索失败，请稍后重试");
      rememberSearchHistory(trimmed, nextMode, nextScope, filters);
    } finally {
      setLoading(false);
    }
  };

  const startNewSearch = () => {
    setWorkspaceView("topic");
    setQuery("");
    setActiveQuery("");
    setPapers([]);
    setSourceStatuses({});
    setSearchSummary(null);
    setSearchDiagnostics(null);
    setCurrentTaskId(null);
    setTopicResearchSnapshot(null);
    setError(null);
    setFilters({ ...DEFAULT_FILTERS });
    setSavedDirectionTitles([]);
    setDirectionSaveMessage(null);
    setReferencesOpen(false);
    setEntryMenuOpen(false);
  };

  const handleSelectSearchHistory = (item: SearchHistoryItem) => {
    if (item.snapshot) {
      setWorkspaceView("topic");
      setQuery(item.query);
      setMode(item.mode);
      setScope(item.scope);
      setFiltersOpen(false);
      setFilters({
        sources: [...(item.filters?.sources || [])],
        open_access_only: item.filters?.open_access_only ?? false,
        quality_tags: [...(item.filters?.quality_tags || [])],
        min_citation_count: item.filters?.min_citation_count ?? 0,
      });
      setActiveQuery(item.query);
      setLoading(false);
      setError(null);
      setPapers(item.snapshot.papers);
      setSourceStatuses(item.snapshot.sourceStatuses);
      setSearchSummary(item.snapshot.searchSummary);
      setSearchDiagnostics(item.snapshot.searchDiagnostics ?? null);
      setCurrentTaskId(item.snapshot.currentTaskId);
      setTopicResearchSnapshot(item.snapshot.topicResearch ?? null);
      setSavedDirectionTitles([]);
      setDirectionSaveMessage(null);
      setReferencesOpen(true);
      setEntryMenuOpen(false);
      return;
    }
    submitSearch(item.query, item.mode, item.scope);
  };

  const handleDeleteSearchHistory = useCallback((id: string) => {
    setSearchHistories((current) => {
      const nextItems = current.filter((item) => item.id !== id);
      window.localStorage.setItem(SEARCH_HISTORY_STORAGE_KEY, JSON.stringify(nextItems));
      return nextItems;
    });
    setConfirmDeleteSearchHistoryId(null);
  }, []);

  useEffect(() => {
    if (!confirmDeleteSearchHistoryId) return;
    const timer = window.setTimeout(() => {
      setConfirmDeleteSearchHistoryId(null);
    }, 3000);
    return () => window.clearTimeout(timer);
  }, [confirmDeleteSearchHistoryId]);

  useEffect(() => {
    if (!activeQuery || !papers.length) return;
    setSearchHistories((current) => {
      const nextItems: SearchHistoryItem[] = current.map((item) => {
        if (
          item.snapshot ||
          item.query !== activeQuery ||
          item.mode !== mode ||
          item.scope !== scope
        ) {
          return item;
        }
        const previousSnapshot = item.snapshot as SearchHistoryItem["snapshot"] | undefined;
        return {
          ...item,
          filters: normalizeFilters(item.filters),
          snapshot: {
            papers,
            sourceStatuses,
            searchSummary,
            searchDiagnostics,
            currentTaskId,
            topicResearch: previousSnapshot?.topicResearch ?? topicResearchSnapshot ?? null,
          },
        };
      });
      window.localStorage.setItem(SEARCH_HISTORY_STORAGE_KEY, JSON.stringify(nextItems));
      return nextItems;
    });
  }, [activeQuery, currentTaskId, mode, papers, scope, searchDiagnostics, searchSummary, sourceStatuses, topicResearchSnapshot]);

  const handleSavePaper = async (paper: Paper) => {
    if (!user) {
      router.push("/login");
      return;
    }
    const key = getPaperKey(paper);
    setSavingPaperKey(key);
    try {
      let projectId = selectedProjectId;
      if (!projectId) {
        const project = await createProject({
          name: (activeQuery || paper.title).slice(0, 50),
          research_field: "学术文献库",
          user_requirement: activeQuery || paper.title,
        });
        projectId = project.id;
        setProjects((items) => [project, ...items]);
        setSelectedProjectId(project.id);
      }
      await saveProjectPaper(projectId, paper);
      setSavedPaperKeys((items) => (items.includes(key) ? items : [...items, key]));
    } finally {
      setSavingPaperKey(null);
    }
  };

  const ensureProjectForTopic = async (fallbackTitle: string) => {
    let projectId = selectedProjectId;
    if (projectId) return projectId;
    const project = await createProject({
      name: (activeQuery || fallbackTitle).slice(0, 50),
      research_field: "选题研究",
      user_requirement: activeQuery || fallbackTitle,
    });
    projectId = project.id;
    setProjects((items) => [project, ...items]);
    setSelectedProjectId(project.id);
    return projectId;
  };

  const handleSaveDirection = async (direction: ResearchDirection, score?: DirectionScore | null) => {
    if (!user) {
      router.push("/login");
      return;
    }
    setSavingDirectionTitle(direction.title);
    setDirectionSaveMessage(null);
    try {
      const projectId = await ensureProjectForTopic(direction.title);
      const saved = await saveResearchDirection({ direction, score, projectId });
      setSavedDirectionTitles((items) => (items.includes(direction.title) ? items : [...items, direction.title]));
      setLastSavedDirectionMeta({ projectId, directionId: saved.saved_id });
      setDirectionSaveMessage("已保存到项目，可在研究方向页继续查看。");
    } catch (err) {
      setDirectionSaveMessage(err instanceof Error ? err.message : "研究方向保存失败");
    } finally {
      setSavingDirectionTitle(null);
    }
  };

  return (
    <div className="min-h-screen bg-[#fbfbfa] text-[#101318]">
      <div className={`grid min-h-screen grid-cols-1 ${shellColumns}`}>
        <SlimSidebar
          user={user}
          authLoading={authLoading}
          searchHistories={searchHistories}
          collapsed={sidebarCollapsed}
          onHome={startNewSearch}
          onToggle={() => setSidebarCollapsed((current) => !current)}
          onSelectSearchHistory={handleSelectSearchHistory}
          confirmDeleteSearchHistoryId={confirmDeleteSearchHistoryId}
          onConfirmDeleteSearchHistory={setConfirmDeleteSearchHistoryId}
          onDeleteSearchHistory={handleDeleteSearchHistory}
          onLogin={() => router.push("/login")}
          onLogout={() => {
            logout();
            window.location.reload();
          }}
        />

        <main className="relative h-screen overflow-hidden bg-[#fbfbfa]">
          {!hasSearched ? (
            <HomeHero
              query={query}
              mode={mode}
              scope={scope}
              filters={filters}
              filtersOpen={filtersOpen}
              loading={loading}
              onQueryChange={setQuery}
              onModeChange={setMode}
              onScopeChange={setScope}
              onFiltersChange={setFilters}
              onToggleFilters={() => setFiltersOpen((current) => !current)}
              onSubmit={submitSearch}
              onPickSuggestion={submitSearch}
              entryMenuOpen={entryMenuOpen}
              onToggleEntries={() => setEntryMenuOpen((current) => !current)}
              onGoResearch={() => router.push("/research")}
              onGoWriting={() => router.push("/writing")}
              onGoProjects={() => router.push("/projects")}
              onLogin={() => router.push("/login")}
              user={user}
            />
          ) : (
            <ResultWorkspace
              query={query}
              activeQuery={activeQuery}
              mode={mode}
              scope={scope}
              filters={filters}
              filtersOpen={filtersOpen}
              papers={papers}
              loading={loading}
              error={error}
              sourceSummary={sourceSummary}
              sourceStatuses={sourceStatuses}
              searchSummary={searchSummary}
              searchDiagnostics={searchDiagnostics}
              workspaceView={workspaceView}
              messages={messages}
              streamingContent={streamingContent}
              streamingEvidence={streamingEvidence}
              isStreaming={isStreaming}
              chatStatusText={errorText || statusText}
              projects={projects}
              selectedProjectId={selectedProjectId}
              referencesOpen={referencesOpen}
              savingDirectionTitle={savingDirectionTitle}
              savedDirectionTitles={savedDirectionTitles}
              directionSaveMessage={directionSaveMessage}
              onQueryChange={setQuery}
              onModeChange={setMode}
              onScopeChange={setScope}
              onFiltersChange={setFilters}
              onToggleFilters={() => setFiltersOpen((current) => !current)}
              onSubmit={submitSearch}
              onNewSearch={startNewSearch}
              onOpenReferences={() => setReferencesOpen(true)}
              onSaveDirection={handleSaveDirection}
              onOpenResearch={() => {
                if (lastSavedDirectionMeta) {
                  router.push(`/research?project_id=${lastSavedDirectionMeta.projectId}&direction_id=${lastSavedDirectionMeta.directionId}`);
                  return;
                }
                router.push("/research");
              }}
              onToggleSidebar={() => setSidebarCollapsed((current) => !current)}
              entryMenuOpen={entryMenuOpen}
              onToggleEntries={() => setEntryMenuOpen((current) => !current)}
              onGoResearch={() => router.push("/research")}
              onGoWriting={() => router.push("/writing")}
              onGoProjects={() => router.push("/projects")}
              onSendChat={handleSendChat}
            />
          )}
        </main>

        {hasSearched && referencesOpen ? (
          <ReferencesPanel
            query={activeQuery}
            papers={papers}
            sourceStatuses={sourceStatuses}
            searchDiagnostics={searchDiagnostics}
            taskId={currentTaskId}
            projects={projects}
            selectedProjectId={selectedProjectId}
            savingPaperTitle={savingPaperKey}
            savedPaperTitles={savedPaperKeys}
            loading={loading}
            error={error}
            userLoggedIn={Boolean(user)}
            onProjectChange={setSelectedProjectId}
            onSavePaper={handleSavePaper}
            onClose={() => setReferencesOpen(false)}
          />
        ) : null}
      </div>
    </div>
  );
}

function SlimSidebar({
  user,
  authLoading,
  searchHistories,
  collapsed,
  onHome,
  onToggle,
  onSelectSearchHistory,
  confirmDeleteSearchHistoryId,
  onConfirmDeleteSearchHistory,
  onDeleteSearchHistory,
  onLogin,
  onLogout,
}: {
  user: { username: string } | null;
  authLoading: boolean;
  searchHistories: SearchHistoryItem[];
  collapsed: boolean;
  onHome: () => void;
  onToggle: () => void;
  onSelectSearchHistory: (item: SearchHistoryItem) => void;
  confirmDeleteSearchHistoryId: string | null;
  onConfirmDeleteSearchHistory: (id: string | null) => void;
  onDeleteSearchHistory: (id: string) => void;
  onLogin: () => void;
  onLogout: () => void;
}) {
  return (
    <aside className={`hidden h-screen border-r border-[#e1e3e6] bg-[#f7f7f5] transition-[width] duration-200 lg:flex lg:flex-col ${collapsed ? "w-[72px]" : "w-[280px]"}`}>
      <div className={`border-b border-[#e1e3e6] ${collapsed ? "px-3 py-4" : "px-5 py-5"}`}>
        <div className={`flex items-center ${collapsed ? "flex-col gap-3" : "justify-between gap-3"}`}>
          <button type="button" onClick={onHome} className={`flex min-w-0 items-center text-left ${collapsed ? "justify-center" : "gap-3"}`} title="回到首页检索">
            <ConsensusMark />
            <span className={`min-w-0 ${collapsed ? "sr-only" : ""}`}>
              <span className="block text-lg font-black tracking-[-0.04em] text-[#101318]">Scholar</span>
              <span className="block text-[10px] font-black uppercase tracking-[0.2em] text-[#8d98a3]">Academic Research</span>
            </span>
          </button>
          <button
            type="button"
            onClick={onToggle}
            className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl border border-[#d8e2ea] bg-white text-[#5f6974] transition-colors hover:border-[#168feb] hover:text-[#126fb0]"
            title={collapsed ? "展开侧栏" : "收起侧栏"}
          >
            <IconPanel />
          </button>
        </div>
      </div>

      <div className={`${collapsed ? "px-3 py-4" : "px-4 py-5"}`}>
        <div>
          <button
            type="button"
            onClick={onHome}
            className={`flex w-full items-center rounded-2xl border border-[#cfe3f4] bg-[#edf7ff] font-black text-[#126fb0] transition-colors hover:bg-white ${
              collapsed ? "h-11 justify-center" : "gap-3 px-4 py-3 text-sm"
            }`}
            title="新建文献搜索"
          >
            <IconPlus />
            <span className={collapsed ? "sr-only" : ""}>新建文献搜索</span>
          </button>
        </div>
      </div>

      <div className={`min-h-0 flex-1 overflow-y-auto ${collapsed ? "px-3 py-2" : "px-4 pb-5"}`} style={{ scrollbarWidth: "none" }}>
        <div className={collapsed ? "space-y-2" : "mb-5"}>
          <p className={collapsed ? "sr-only" : "mb-3 px-2 text-[11px] font-black uppercase tracking-[0.18em] text-[#9aa4ae]"}>搜索记录</p>
          {searchHistories.length ? (
            <div className={collapsed ? "space-y-2" : "space-y-2"}>
              {searchHistories.slice(0, collapsed ? 8 : 6).map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onSelectSearchHistory(item)}
                  title={item.query}
                  className={`group flex w-full items-start rounded-2xl border border-transparent text-left transition-all hover:border-[#e1e8ee] hover:bg-white ${
                    collapsed ? "h-11 justify-center px-0 py-0" : "gap-3 px-3 py-3"
                  }`}
                >
                  <span className={`shrink-0 text-[#126fb0] ${collapsed ? "mt-0" : "mt-0.5"}`}>
                    <IconSearchSmall />
                  </span>
                  <span className={collapsed ? "sr-only" : "min-w-0 flex-1"}>
                    <span className="flex items-center gap-2">
                      <span className="block min-w-0 flex-1 truncate text-sm font-black text-[#26313b]">{item.query}</span>
                      {item.snapshot ? (
                        <span className="shrink-0 rounded-full border border-[#cfe3f4] bg-[#edf7ff] px-2 py-0.5 text-[10px] font-black text-[#126fb0]">
                          已缓存
                        </span>
                      ) : null}
                      <span
                        role="button"
                        tabIndex={0}
                        onClick={(event) => {
                          event.stopPropagation();
                          if (confirmDeleteSearchHistoryId === item.id) {
                            onDeleteSearchHistory(item.id);
                            return;
                          }
                          onConfirmDeleteSearchHistory(item.id);
                        }}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            event.stopPropagation();
                            if (confirmDeleteSearchHistoryId === item.id) {
                              onDeleteSearchHistory(item.id);
                              return;
                            }
                            onConfirmDeleteSearchHistory(item.id);
                          }
                        }}
                        className={`grid h-6 min-w-6 shrink-0 place-items-center rounded-full border bg-transparent text-[#9aa4ae] opacity-0 transition-all group-hover:opacity-100 ${
                          confirmDeleteSearchHistoryId === item.id
                            ? "border-[#f0d4d4] bg-[#fff5f5] px-2 text-[10px] font-black text-[#a53d3d] opacity-100"
                            : "w-6 border-transparent hover:border-[#f0d4d4] hover:bg-[#fff5f5] hover:text-[#a53d3d]"
                        }`}
                      >
                        {confirmDeleteSearchHistoryId === item.id ? "确认" : <IconClose />}
                      </span>
                    </span>
                    <span className="mt-1 block text-[11px] font-semibold text-[#8a949e]">
                      {formatConversationDate(item.created_at)} · {scopeLabel(item.scope)} · {modeLabel(item.mode)}
                    </span>
                    {item.snapshot ? (
                      <span className="mt-1 block text-[11px] text-[#7b8390]">
                        {buildSearchHistoryStatusHint(item.snapshot.sourceStatuses)}
                      </span>
                    ) : null}
                  </span>
                </button>
              ))}
            </div>
          ) : (
            <div className={`rounded-3xl border border-dashed border-[#d6dee6] bg-white/60 text-center ${collapsed ? "px-2 py-4" : "px-4 py-6"}`}>
              {collapsed ? <span className="mx-auto block h-2.5 w-2.5 rounded-full bg-[#c5ced8]" /> : null}
              <p className={collapsed ? "sr-only" : "text-sm font-black text-[#26313b]"}>暂无搜索记录</p>
              <p className={collapsed ? "sr-only" : "mt-2 text-xs leading-5 text-[#7b8793]"}>首页检索后会自动保存到这里。</p>
            </div>
          )}
        </div>
      </div>

      <div className={`border-t border-[#e1e3e6] ${collapsed ? "p-3" : "p-4"}`}>
        {authLoading ? (
          <div className="h-14 rounded-2xl bg-[#ecefed]" />
        ) : user ? (
          <div className={`flex items-center rounded-3xl border border-[#dfe5eb] bg-white ${collapsed ? "justify-center px-0 py-2" : "gap-3 px-3 py-3"}`}>
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-[#101318] text-xs font-black text-white" title={user.username}>
              {user.username.slice(0, 1).toUpperCase()}
            </span>
            <span className={collapsed ? "sr-only" : "min-w-0 flex-1"}>
              <span className="block truncate text-sm font-black text-[#26313b]">{user.username}</span>
              <span className="block text-[11px] font-semibold text-[#8a949e]">免费版 · 点击退出</span>
            </span>
            <button type="button" onClick={onLogout} className={`${collapsed ? "hidden" : "grid"} h-8 w-8 place-items-center rounded-full text-[#8a949e] transition-colors hover:bg-[#f3f5f6] hover:text-[#26313b]`} title="退出登录">
              <IconSettings />
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={onLogin}
            className={`flex w-full items-center justify-between rounded-3xl border border-[#cfe3f4] bg-[#edf7ff] text-sm font-black text-[#126fb0] transition-colors hover:bg-white ${
              collapsed ? "h-11 justify-center px-0 py-0" : "px-4 py-3"
            }`}
            title="登录以保存会话"
          >
            <span className={collapsed ? "sr-only" : ""}>登录以保存会话</span>
            <span>in</span>
          </button>
        )}
      </div>
    </aside>
  );
}

function HomeHero({
  query,
  mode,
  scope,
  filters,
  filtersOpen,
  loading,
  user,
  onQueryChange,
  onModeChange,
  onScopeChange,
  onFiltersChange,
  onToggleFilters,
  onSubmit,
  onPickSuggestion,
  entryMenuOpen,
  onToggleEntries,
  onGoResearch,
  onGoWriting,
  onGoProjects,
  onLogin,
}: {
  query: string;
  mode: ResearchMode;
  scope: LibraryScope;
  filters: LiteratureQualityFilters;
  filtersOpen: boolean;
  loading: boolean;
  user: unknown;
  onQueryChange: (query: string) => void;
  onModeChange: (mode: ResearchMode) => void;
  onScopeChange: (scope: LibraryScope) => void;
  onFiltersChange: (filters: LiteratureQualityFilters) => void;
  onToggleFilters: () => void;
  onSubmit: () => void;
  onPickSuggestion: (query: string) => void;
  entryMenuOpen: boolean;
  onToggleEntries: () => void;
  onGoResearch: () => void;
  onGoWriting: () => void;
  onGoProjects: () => void;
  onLogin: () => void;
}) {
  return (
    <div className="relative flex h-screen flex-col overflow-y-auto px-5 py-4 md:px-10">
      <header className="mx-auto flex h-14 w-full max-w-5xl items-center justify-end">
        <div className="relative flex items-center gap-3">
          <button
            type="button"
            onClick={onToggleEntries}
            className="inline-flex items-center gap-2 rounded-2xl border border-[#dbe2e8] bg-white px-4 py-2.5 text-sm font-black text-[#1d232b] transition-colors hover:bg-[#f7fafc]"
            title="其他页面入口"
          >
            <IconGrid />
            <span>其他入口</span>
          </button>
          {!user ? (
            <button
              type="button"
              onClick={onLogin}
              className="rounded-2xl bg-[#1592e6] px-5 py-3 text-sm font-bold text-white shadow-[0_14px_30px_rgba(21,146,230,0.22)] transition-colors hover:bg-[#087bc8]"
            >
              Sign up
            </button>
          ) : null}
        </div>
        </header>

      <div className="relative mx-auto w-full max-w-5xl">
        <div className={`absolute right-0 top-0 z-[160] w-56 rounded-3xl border border-[#dbe2e8] bg-white p-2 shadow-[0_18px_48px_rgba(16,19,24,0.12)] transition-all ${entryMenuOpen ? "pointer-events-auto translate-y-0 opacity-100" : "pointer-events-none -translate-y-2 opacity-0"}`}>
          <EntryMenuPanel onGoResearch={onGoResearch} onGoWriting={onGoWriting} onGoProjects={onGoProjects} />
        </div>
      </div>

      <section className="mx-auto flex w-full max-w-5xl flex-1 flex-col items-center justify-center pb-20 text-center">
        <div className="mb-4 flex items-center gap-3 text-[30px] font-black tracking-[-0.04em]">
          <ConsensusMark />
          <span>Scholar Research</span>
        </div>
        <h1 className="mb-10 text-[34px] font-black tracking-[-0.04em] text-[#080b10] md:text-[40px]">
          Research starts here
        </h1>

        <div className="w-full max-w-[960px]">
          <SearchComposer
            query={query}
            mode={mode}
            scope={scope}
            filters={filters}
            filtersOpen={filtersOpen}
            loading={loading}
            variant="hero"
            onQueryChange={onQueryChange}
            onModeChange={onModeChange}
            onScopeChange={onScopeChange}
            onFiltersChange={onFiltersChange}
            onToggleFilters={onToggleFilters}
            onSubmit={onSubmit}
          />
        </div>

        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <PromptChip icon={<IconTable />} label="Build a comparison table" onClick={() => onPickSuggestion("请围绕该主题构建文献对比表")} />
          <PromptChip icon={<IconPuzzle />} label="Find studies by method" onClick={() => onPickSuggestion("查找使用实证研究方法的相关文献")} />
          <PromptChip icon={<IconFlask />} label="Run a Deep review" onClick={() => onPickSuggestion("生成式人工智能支持研究生论文写作的系统综述")} />
        </div>
      </section>

      <footer className="mx-auto mb-6 flex w-full max-w-[960px] items-center gap-8 text-center">
        <div className="h-px flex-1 bg-[#e2e5e9]" />
        <p className="text-lg font-black tracking-[-0.02em] text-[#111318]">The new standard for academic research</p>
        <div className="h-px flex-1 bg-[#e2e5e9]" />
      </footer>
    </div>
  );
}

function EntryMenuPanel({
  className = "",
  onGoResearch,
  onGoWriting,
  onGoProjects,
}: {
  className?: string;
  onGoResearch: () => void;
  onGoWriting: () => void;
  onGoProjects: () => void;
}) {
  return (
    <div className={className}>
      <EntryMenuItem title="项目管理" desc="查看项目列表" onClick={onGoProjects}>
        <IconFolder />
      </EntryMenuItem>
      <EntryMenuItem title="研究方向" desc="查看方向分析" onClick={onGoResearch}>
        <IconFlask />
      </EntryMenuItem>
      <EntryMenuItem title="论文写作" desc="进入写作台" onClick={onGoWriting}>
        <IconEdit />
      </EntryMenuItem>
    </div>
  );
}

function EntryMenuItem({
  title,
  desc,
  onClick,
  children,
}: {
  title: string;
  desc: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left transition-colors hover:bg-[#f3f7fb]"
    >
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-2xl bg-[#edf7ff] text-[#126fb0]">{children}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-black text-[#26313b]">{title}</span>
        <span className="mt-0.5 block text-xs text-[#8a949e]">{desc}</span>
      </span>
      <IconExternal />
    </button>
  );
}

function ResultWorkspace({
  query,
  activeQuery,
  mode,
  scope,
  filters,
  filtersOpen,
  papers,
  loading,
  error,
  sourceSummary,
  sourceStatuses,
  searchSummary,
  searchDiagnostics,
  workspaceView,
  messages,
  streamingContent,
  streamingEvidence,
  isStreaming,
  chatStatusText,
  projects,
  selectedProjectId,
  referencesOpen,
  savingDirectionTitle,
  savedDirectionTitles,
  directionSaveMessage,
  onQueryChange,
  onModeChange,
  onScopeChange,
  onFiltersChange,
  onToggleFilters,
  onSubmit,
  onNewSearch,
  onOpenReferences,
  onSaveDirection,
  onOpenResearch,
  onSendChat,
  onToggleSidebar,
  entryMenuOpen,
  onToggleEntries,
  onGoResearch,
  onGoWriting,
  onGoProjects,
}: {
  query: string;
  activeQuery: string;
  mode: ResearchMode;
  scope: LibraryScope;
  filters: LiteratureQualityFilters;
  filtersOpen: boolean;
  papers: Paper[];
  loading: boolean;
  error: string | null;
  sourceSummary: string;
  sourceStatuses: Record<string, SourceStatusInfo>;
  searchSummary: SearchSummary | null;
  searchDiagnostics: SearchDiagnostics | null;
  workspaceView: "topic" | "chat";
  messages: ChatMessage[];
  streamingContent: string;
  streamingEvidence: SearchEvidenceBundle | null;
  isStreaming: boolean;
  chatStatusText: string;
  projects: Project[];
  selectedProjectId: string;
  referencesOpen: boolean;
  savingDirectionTitle: string | null;
  savedDirectionTitles: string[];
  directionSaveMessage: string | null;
  onQueryChange: (query: string) => void;
  onModeChange: (mode: ResearchMode) => void;
  onScopeChange: (scope: LibraryScope) => void;
  onFiltersChange: (filters: LiteratureQualityFilters) => void;
  onToggleFilters: () => void;
  onSubmit: () => void;
  onNewSearch: () => void;
  onOpenReferences: () => void;
  onSaveDirection: (direction: ResearchDirection, score?: DirectionScore | null) => Promise<void>;
  onOpenResearch: () => void;
  onToggleSidebar: () => void;
  entryMenuOpen: boolean;
  onToggleEntries: () => void;
  onGoResearch: () => void;
  onGoWriting: () => void;
  onGoProjects: () => void;
  onSendChat: (
    message: string,
    searchEnabled: boolean,
    researchMode: ResearchMode,
    libraryScope: LibraryScope,
    projectId: string | null,
  ) => void;
}) {
  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <header className="relative z-[130] flex h-[88px] shrink-0 items-center justify-between overflow-visible border-b border-[#e1e3e6] bg-white/92 px-5 backdrop-blur md:px-8">
        <div className="flex min-w-0 items-center gap-5">
          <button type="button" onClick={onToggleSidebar} className="rounded-lg p-2 text-[#1d232b] transition-colors hover:bg-[#f0f2f4]" title="展开或收起侧栏">
            <IconPanel />
          </button>
          <div className="min-w-0">
            <h2 className="truncate text-xl font-semibold tracking-[-0.02em] text-[#101318]">
              {activeQuery}
              <span className="ml-2 text-[#1d75bd]">1</span>
            </h2>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative">
            <button
              type="button"
              onClick={onToggleEntries}
              className="inline-flex items-center gap-2 rounded-2xl border border-[#dbe2e8] bg-white px-4 py-2.5 text-sm font-black text-[#1d232b] transition-colors hover:bg-[#f7fafc]"
              title="其他页面入口"
            >
              <IconGrid />
              <span>其他入口</span>
            </button>
            <div className={`absolute right-0 top-[54px] z-[160] w-56 rounded-3xl border border-[#dbe2e8] bg-white p-2 shadow-[0_24px_60px_rgba(16,19,24,0.18)] transition-all ${entryMenuOpen ? "pointer-events-auto translate-y-0 opacity-100" : "pointer-events-none -translate-y-2 opacity-0"}`}>
              <EntryMenuPanel onGoResearch={onGoResearch} onGoWriting={onGoWriting} onGoProjects={onGoProjects} />
            </div>
          </div>
          <button
            type="button"
            onClick={onOpenReferences}
            disabled={referencesOpen}
            className="rounded-2xl border border-[#d7e3ed] bg-[#edf7ff] px-4 py-2.5 text-sm font-bold text-[#101318] transition-colors hover:bg-white disabled:cursor-default disabled:opacity-50"
          >
            References
          </button>
          <button type="button" onClick={onNewSearch} className="rounded-full border border-[#e0e4e8] px-4 py-2.5 text-sm font-bold transition-colors hover:bg-[#f0f2f4]">
            新检索
          </button>
        </div>
      </header>

      <section className={`relative min-h-0 flex-1 ${workspaceView === "chat" ? "overflow-hidden" : "overflow-y-auto px-5 pb-8 pt-10 md:px-9"}`}>
        {workspaceView === "chat" ? (
          <ChatMessages
            messages={messages}
            streamingContent={streamingContent}
            streamingEvidence={streamingEvidence}
            isStreaming={isStreaming}
            statusText={chatStatusText}
          />
        ) : (
          <TopicResearchPanel
            query={activeQuery}
            papers={papers}
            searchLoading={loading}
            searchError={error}
              sourceSummary={sourceSummary}
              sourceStatuses={sourceStatuses}
              searchSummary={searchSummary}
              searchDiagnostics={searchDiagnostics}
              referencesOpen={referencesOpen}
            onOpenReferences={onOpenReferences}
            savingDirectionTitle={savingDirectionTitle}
            savedDirectionTitles={savedDirectionTitles}
            directionSaveMessage={directionSaveMessage}
            onSaveDirection={onSaveDirection}
            onOpenResearch={onOpenResearch}
          />
        )}
      </section>

      <div className="shrink-0 border-t border-[#e1e4e8] bg-white px-5 py-4 shadow-[0_-14px_34px_rgba(16,19,24,0.06)] md:px-9">
        <div className="mx-auto max-w-5xl">
          {workspaceView === "chat" ? (
            <ChatInput
              onSend={onSendChat}
              projectId={selectedProjectId || null}
              projectOptions={projects.map((project) => ({ id: project.id, name: project.name }))}
              disabled={isStreaming}
            />
          ) : (
            <SearchComposer
              query={query}
              mode={mode}
              scope={scope}
              filters={filters}
              filtersOpen={filtersOpen}
              loading={loading}
              variant="dock"
              onQueryChange={onQueryChange}
              onModeChange={onModeChange}
              onScopeChange={onScopeChange}
              onFiltersChange={onFiltersChange}
              onToggleFilters={onToggleFilters}
              onSubmit={onSubmit}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function ResearchAnswer({
  query,
  papers,
  loading,
  error,
  sourceSummary,
  sourceStatuses,
  searchSummary,
  searchDiagnostics,
  referencesOpen,
  onOpenReferences,
}: {
  query: string;
  papers: Paper[];
  loading: boolean;
  error: string | null;
  sourceSummary: string;
  sourceStatuses: Record<string, SourceStatusInfo>;
  searchSummary: SearchSummary | null;
  searchDiagnostics: SearchDiagnostics | null;
  referencesOpen: boolean;
  onOpenReferences: () => void;
}) {
  const topPapers = papers.slice(0, 3);

  if (loading) {
    return (
      <div className="mx-auto max-w-5xl space-y-8">
        <QueryBubble query={query} />
        <div className="ml-0 max-w-4xl rounded-[28px] border border-[#e2e7eb] bg-white p-7">
          <div className="mb-6 h-5 w-52 animate-pulse rounded-full bg-[#e5e9ed]" />
          <div className="space-y-3">
            <div className="h-4 animate-pulse rounded-full bg-[#eef1f4]" />
            <div className="h-4 w-11/12 animate-pulse rounded-full bg-[#eef1f4]" />
            <div className="h-4 w-8/12 animate-pulse rounded-full bg-[#eef1f4]" />
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="mx-auto max-w-5xl space-y-8">
        <QueryBubble query={query} />
        <div className="max-w-4xl rounded-[28px] border border-[#f0c8c2] bg-[#fff8f6] p-7 text-[#8b3529]">
          <p className="text-sm font-bold uppercase tracking-[0.18em]">Search failed</p>
          <h3 className="mt-3 text-2xl font-black tracking-[-0.03em]">检索暂时失败</h3>
          <p className="mt-3 leading-7">{error}</p>
        </div>
      </div>
    );
  }

  if (!papers.length) {
    return (
      <div className="mx-auto max-w-5xl space-y-8">
        <QueryBubble query={query} />
        <div className="max-w-4xl rounded-[28px] border border-[#e2e7eb] bg-white p-7">
          <p className="text-sm font-bold uppercase tracking-[0.18em] text-[#7a818b]">No evidence</p>
          <h3 className="mt-3 text-2xl font-black tracking-[-0.03em] text-[#101318]">暂无相关文献</h3>
          <p className="mt-3 leading-7 text-[#4e5864]">
            当前检索没有返回可用来源。你可以换一个更具体的关键词，或切换中文/英文文献范围后再试。
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <QueryBubble query={query} />

      <div className="max-w-4xl">
        <div className="mb-8 flex items-start gap-4">
          <div className="mt-1 hidden border-l border-[#d9dee3] pl-5 md:block">
            <div className="space-y-3 text-sm">
              <ResearchTrail text={query} count="检索中" />
              <ResearchTrail text={topPapers[0]?.title || "读取文献来源"} count={`${papers.length}`} />
              <button type="button" onClick={onOpenReferences} className="flex items-center gap-2 font-bold text-[#101318]">
                <IconEye />
                Read
                <span className="font-normal">Papers</span>
                <span>{papers.length}</span>
              </button>
            </div>
          </div>
          {!referencesOpen ? (
            <button
              type="button"
              onClick={onOpenReferences}
              className="ml-auto rounded-2xl border border-[#dbe3ea] bg-white px-4 py-2 text-sm font-bold text-[#101318] shadow-sm transition-colors hover:bg-[#f4f8fb]"
            >
              打开 References
            </button>
          ) : null}
        </div>

        <article className="prose prose-slate max-w-none">
          <h1 className="mb-5 text-[30px] font-black leading-tight tracking-[-0.04em] text-[#101318]">
            {buildAnswerTitle(query)}
          </h1>
          <p className="text-[17px] leading-8 text-[#1d2630]">
            本次检索返回 {papers.length} 篇相关文献，来源概况为 {sourceSummary}。以下内容只基于已返回文献的题名、摘要、年份和来源信息整理，不额外编造统计结论。
          </p>
          {sourceStatuses && Object.keys(sourceStatuses).length > 0 ? (
            <p className="mt-3 text-sm leading-7 text-[#5d6671]">
              来源诊断：{Object.entries(sourceStatuses)
                .map(([source, info]) => `${sourceLabel(source)} ${sourceStatusText(info)}`)
                .join("；")}
            </p>
          ) : null}
          {searchSummary?.authority_summary ? (
            <div className="mt-6 rounded-[22px] border border-[#dbe7d9] bg-[#f5faf4] p-5">
              <p className="text-xs font-black uppercase tracking-[0.16em] text-[#587055]">Authority Filter</p>
              <p className="mt-2 text-[15px] leading-7 text-[#1f3420]">{searchSummary.authority_summary.overview}</p>
              {searchSummary.authority_summary.has_pending ? (
                <p className="mt-2 text-sm leading-6 text-[#5f6e5e]">
                  `EI`、`JCR`、`中科院分区` 当前仅展示待核验提示，未被系统当作已认证证据。
                </p>
              ) : null}
            </div>
          ) : null}

          <h2 className="mt-8 text-2xl font-black tracking-[-0.03em] text-[#101318]">直接相关的研究证据</h2>
          <ul className="mt-4 space-y-4 pl-5 text-[16px] leading-8 text-[#1d2630]">
            {topPapers.map((paper, index) => (
              <li key={`${paper.title}-${index}`}>
                <strong>{paper.title}</strong>
                {paper.year ? `（${paper.year}）` : ""}：
                {paper.why_selected || paper.abstract || "该文献暂无摘要，建议打开来源链接进一步核验。"}
              </li>
            ))}
          </ul>

          <h2 className="mt-8 text-2xl font-black tracking-[-0.03em] text-[#101318]">下一步建议</h2>
          <p className="text-[16px] leading-8 text-[#1d2630]">
            你可以在底部继续追问更具体的问题，或打开右侧 References 查看每篇文献的摘要、作者、期刊与链接后，再进入学术对话做深度分析。
          </p>
        </article>
      </div>
    </div>
  );
}

function QueryBubble({ query }: { query: string }) {
  return (
    <div className="flex justify-center md:justify-end">
      <div className="max-w-[86%] rounded-[22px] bg-[#d9ecff] px-6 py-3 text-lg font-medium leading-7 text-[#102a3a]">
        {query}
      </div>
    </div>
  );
}

function ResearchTrail({ text, count }: { text: string; count: string }) {
  return (
    <div className="flex max-w-3xl items-center gap-3 text-[#101318]">
      <IconSearchSmall />
      <span className="truncate underline decoration-[#c8d8e8] underline-offset-4">{text}</span>
      <span className="ml-auto shrink-0 font-black">{count}</span>
      <IconExternal />
    </div>
  );
}

function ReferencesPanel({
  query,
  papers,
  sourceStatuses,
  searchDiagnostics,
  taskId,
  projects,
  selectedProjectId,
  savingPaperTitle,
  savedPaperTitles,
  loading,
  error,
  userLoggedIn,
  onProjectChange,
  onSavePaper,
  onClose,
}: {
  query: string;
  papers: Paper[];
  sourceStatuses: Record<string, SourceStatusInfo>;
  searchDiagnostics: SearchDiagnostics | null;
  taskId: string | null;
  projects: Project[];
  selectedProjectId: string;
  savingPaperTitle: string | null;
  savedPaperTitles: string[];
  loading: boolean;
  error: string | null;
  userLoggedIn: boolean;
  onProjectChange: (projectId: string) => void;
  onSavePaper: (paper: Paper) => Promise<void>;
  onClose: () => void;
}) {
  const [expandedIndex, setExpandedIndex] = useState<number | null>(0);
  const sourceSections = buildSourceStatusSections(sourceStatuses);

  return (
    <aside className="hidden h-screen min-h-0 border-l border-[#dfe3e7] bg-white lg:flex lg:flex-col">
      <header className="shrink-0 border-b border-[#e1e4e8] px-6 py-6">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-black tracking-[-0.04em] text-[#101318]">References</h2>
              <span className="text-[#7b8390]">/</span>
              <p className="truncate text-base text-[#69737f]">{query}</p>
            </div>
            <div className="mt-8 flex items-center gap-3">
              <span className="font-black text-[#101318]">Results</span>
              <span className="font-semibold text-[#7b8390]">{loading ? "..." : papers.length}</span>
            </div>
            {taskId ? (
              <p className="mt-2 truncate text-[11px] font-semibold uppercase tracking-[0.16em] text-[#8a939e]" title={taskId}>
                Task · {taskId.slice(0, 8)}
              </p>
            ) : null}
            <div className="mt-4">
              {userLoggedIn && projects.length > 0 ? (
                <select
                  value={selectedProjectId}
                  onChange={(event) => onProjectChange(event.target.value)}
                  className="h-10 w-full rounded-xl border border-[#dfe4e8] bg-white px-3 text-sm font-semibold text-[#20242a] outline-none"
                >
                  {projects.map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.name}
                    </option>
                  ))}
                </select>
              ) : (
                <p className="rounded-xl bg-[#f6f8fa] px-3 py-2 text-xs leading-5 text-[#6a727d]">
                  {userLoggedIn ? "还没有项目，保存文献时会自动创建项目。" : "登录后可以把文献加入项目文献库。"}
                </p>
              )}
            </div>
            <SourceStatusStrip statuses={sourceStatuses} />
            {(sourceSections.items.length || searchDiagnostics?.overview) ? (
              <div className="mt-4 rounded-2xl border border-[#e5eaef] bg-[#fafbfd] px-4 py-3">
                <p className="text-[11px] font-black uppercase tracking-[0.16em] text-[#7b8390]">Source Health</p>
                <p className="mt-2 text-xs leading-6 text-[#5e6874]">
                  {searchDiagnostics?.overview || sourceSections.summary}
                </p>
              </div>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="grid h-11 w-11 shrink-0 place-items-center rounded-full border border-[#dfe4e8] text-[#101318] transition-colors hover:bg-[#f3f5f6]"
            title="关闭 References"
          >
            <IconClose />
          </button>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
        {loading ? (
          <div className="space-y-5">
            {[1, 2, 3].map((item) => (
              <div key={item} className="border-b border-[#e1e4e8] pb-5">
                <div className="mb-4 h-5 w-4/5 animate-pulse rounded-full bg-[#e8edf1]" />
                <div className="space-y-2">
                  <div className="h-3 animate-pulse rounded-full bg-[#f0f3f5]" />
                  <div className="h-3 w-10/12 animate-pulse rounded-full bg-[#f0f3f5]" />
                </div>
              </div>
            ))}
          </div>
        ) : error ? (
          <EmptyReferences title="检索失败" description="请稍后重试，或切换文献范围后再检索。" />
        ) : papers.length ? (
          <div className="space-y-0">
            {papers.map((paper, index) => (
              <ReferenceCard
                key={`${paper.title}-${index}`}
                paper={paper}
                index={index}
                expanded={expandedIndex === index}
                saving={savingPaperTitle === getPaperKey(paper)}
                saved={savedPaperTitles.includes(getPaperKey(paper))}
                userLoggedIn={userLoggedIn}
                hasProject={projects.length > 0}
                onSave={() => onSavePaper(paper)}
                onToggle={() => setExpandedIndex(expandedIndex === index ? null : index)}
              />
            ))}
          </div>
        ) : (
          <EmptyReferences title="暂无相关文献" description="当前问题没有返回可展示的来源。" />
        )}
      </div>
    </aside>
  );
}

function SourceStatusStrip({ statuses }: { statuses: Record<string, SourceStatusInfo> }) {
  const items = Object.entries(statuses);
  if (!items.length) return null;

  return (
    <div className="mt-4 flex flex-wrap gap-2">
      {items.map(([source, info]) => (
        <span
          key={source}
          className={`rounded-full border px-3 py-1.5 text-[11px] font-bold ${sourceStatusClass(info.status)}`}
          title={info.detail || undefined}
        >
          {sourceLabel(source)} · {sourceStatusText(info)}
        </span>
      ))}
    </div>
  );
}

function ReferenceCard({
  paper,
  index,
  expanded,
  saving,
  saved,
  userLoggedIn,
  hasProject,
  onSave,
  onToggle,
}: {
  paper: Paper;
  index: number;
  expanded: boolean;
  saving: boolean;
  saved: boolean;
  userLoggedIn: boolean;
  hasProject: boolean;
  onSave: () => void;
  onToggle: () => void;
}) {
  const explanation = buildPaperExplanation(paper);
  const compactReasons = buildPaperCompactReasons(paper);

  return (
    <article className="border-b border-[#e1e4e8] py-6">
      <button type="button" onClick={onToggle} className="flex w-full gap-4 text-left">
        <span className="mt-1 grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-[#e6e8eb] text-sm font-black text-[#1d232b]">
          {index + 1}
        </span>
        <div className="min-w-0">
          <h3 className="text-[17px] font-black leading-7 tracking-[-0.01em] text-[#20242a]">{paper.title}</h3>
          <p className={`mt-4 text-sm leading-6 text-[#343c45] ${expanded ? "" : "line-clamp-3"}`}>
            <span className="mr-2 text-xs font-black uppercase tracking-[0.16em] text-[#7b8390]">命中原因</span>
            {explanation.hitExplanation}
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-[#6a727d]">
            <span className="font-black text-[#20242a]">{paper.year || "未知年份"}</span>
            <span>·</span>
            <span>{paper.citation_count ?? 0} citations</span>
            <span>·</span>
            <span>{formatAuthors(paper.authors)}</span>
          </div>
          <p className="mt-1 text-sm italic text-[#7b8390]">{paper.venue || sourceLabel(paper.source)}</p>
          <AuthorityBadges paper={paper} />
          <div className="mt-3 flex flex-wrap gap-2">
            {compactReasons.map((reason) => (
              <span
                key={reason}
                className="rounded-full border border-[#dfe5ea] bg-[#f7f8f9] px-2.5 py-1 text-[11px] font-semibold text-[#4d5966]"
              >
                {reason}
              </span>
            ))}
          </div>
        </div>
      </button>

      {expanded ? (
        <div className="ml-12 mt-4 rounded-2xl bg-[#f7f8f9] p-4 text-sm leading-7 text-[#3b444e]">
          <div className="rounded-2xl border border-[#dfe5ea] bg-white px-4 py-3">
            <p className="text-[11px] font-black uppercase tracking-[0.16em] text-[#7b8390]">命中原因</p>
            <p className="mt-2 text-sm leading-7 text-[#2d3640]">{explanation.hitExplanation}</p>
          </div>
          <div className="mt-3 rounded-2xl border border-[#dfe5ea] bg-white px-4 py-3">
            <p className="text-[11px] font-black uppercase tracking-[0.16em] text-[#7b8390]">参考原因</p>
            <ul className="mt-2 space-y-1.5 text-sm leading-6 text-[#3b444e]">
              {explanation.recommendationHints.map((item, index) => (
                <li key={`${item}-${index}`}>• {item}</li>
              ))}
            </ul>
          </div>
          <div className="mt-3 rounded-2xl border border-[#dfe5ea] bg-white px-4 py-3">
            <p className="text-[11px] font-black uppercase tracking-[0.16em] text-[#7b8390]">核验说明</p>
            <ul className="mt-2 space-y-1.5 text-sm leading-6 text-[#3b444e]">
              {explanation.verificationNotes.map((item, index) => (
                <li key={`${item}-${index}`}>• {item}</li>
              ))}
            </ul>
          </div>
          <p>
            <span className="font-bold text-[#20242a]">来源：</span>
            {sourceLabel(paper.source)}
          </p>
          <p>
            <span className="font-bold text-[#20242a]">DOI：</span>
            {paper.doi || "暂无"}
          </p>
          <p>
            <span className="font-bold text-[#20242a]">语言：</span>
            {paper.language === "cn" ? "中文" : paper.language === "en" ? "英文" : "未知"}
          </p>
          {paper.url ? (
            <a
              href={paper.url}
              target="_blank"
              rel="noreferrer"
              className="mt-3 inline-flex rounded-full border border-[#d5dde5] bg-white px-4 py-1.5 text-xs font-black text-[#126fb0] transition-colors hover:border-[#126fb0]"
            >
              打开文献来源
            </a>
          ) : null}
          <button
            type="button"
            onClick={onSave}
            disabled={saving || saved}
            className="ml-2 mt-3 inline-flex rounded-full border border-[#d5dde5] bg-white px-4 py-1.5 text-xs font-black text-[#20242a] transition-colors hover:border-[#126fb0] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saved ? "已加入项目" : saving ? "保存中..." : userLoggedIn && !hasProject ? "创建项目并加入" : "加入项目"}
          </button>
        </div>
      ) : null}
    </article>
  );
}

function AuthorityBadges({ paper }: { paper: Paper }) {
  const items = buildAuthorityBadgeItems(paper);
  if (!items.length) return null;

  return (
    <div className="mt-3 flex flex-wrap gap-2">
      {items.map((item) => (
        <span
          key={item.key}
          className={`rounded-full px-2.5 py-1 text-[11px] font-black ${
            item.tone === "verified"
              ? "border border-[#bfe5d1] bg-[#eefaf3] text-[#16613a]"
              : "border border-[#f1d49b] bg-[#fff7e8] text-[#8a5a00]"
          }`}
        >
          {item.label}
        </span>
      ))}
    </div>
  );
}

function EmptyReferences({ title, description }: { title: string; description: string }) {
  return (
    <div className="rounded-[26px] border border-dashed border-[#cfd7df] bg-[#f8fafb] p-6 text-center">
      <div className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-2xl bg-white text-[#5b6570] shadow-sm">
        <IconSearch />
      </div>
      <h3 className="font-bold text-[#17212b]">{title}</h3>
      <p className="mt-2 text-sm leading-6 text-[#6a737e]">{description}</p>
    </div>
  );
}

function SearchComposer({
  query,
  mode,
  scope,
  filters,
  filtersOpen,
  loading,
  variant,
  onQueryChange,
  onModeChange,
  onScopeChange,
  onFiltersChange,
  onToggleFilters,
  onSubmit,
}: {
  query: string;
  mode: ResearchMode;
  scope: LibraryScope;
  filters: LiteratureQualityFilters;
  filtersOpen: boolean;
  loading: boolean;
  variant: "hero" | "dock";
  onQueryChange: (query: string) => void;
  onModeChange: (mode: ResearchMode) => void;
  onScopeChange: (scope: LibraryScope) => void;
  onFiltersChange: (filters: LiteratureQualityFilters) => void;
  onToggleFilters: () => void;
  onSubmit: () => void;
}) {
  const isHero = variant === "hero";

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
      className={`rounded-[24px] border border-[#d7dce2] bg-white shadow-[0_16px_36px_rgba(16,19,24,0.12)] ${
        isHero ? "p-3" : "p-3"
      }`}
    >
      <textarea
        value={query}
        onChange={(event) => onQueryChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            onSubmit();
          }
        }}
        rows={1}
        placeholder={isHero ? "Ask the research..." : "继续输入研究问题，按 Enter 检索"}
        className={`max-h-32 min-h-14 w-full resize-none bg-transparent px-3 py-3 leading-7 text-[#101318] outline-none placeholder:text-[#9da3ad] ${
          isHero ? "text-xl" : "text-lg"
        }`}
      />

      <div className="flex flex-wrap items-center justify-between gap-3 px-1 pb-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="grid h-11 w-11 place-items-center rounded-2xl border border-[#d9dfe5] text-[#1d232b]">
            <IconPlus />
          </span>
          <select
            value={scope}
            onChange={(event) => onScopeChange(event.target.value as LibraryScope)}
            className="h-11 rounded-2xl border border-[#d9dfe5] bg-white px-4 text-sm font-black text-[#101318] outline-none transition-colors hover:border-[#1592e6]"
          >
            {SCOPE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <div className="flex rounded-2xl border border-dashed border-[#cfd6de] bg-[#fbfbfa] p-1">
            {MODE_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => onModeChange(option.value)}
                title={option.hint}
                className={`rounded-xl px-3 py-2 text-sm font-black transition-all ${
                  mode === option.value
                    ? "bg-white text-[#126fb0] shadow-sm"
                    : "text-[#6b737e] hover:text-[#126fb0]"
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-4">
          <button type="button" onClick={onToggleFilters} className="hidden items-center gap-2 text-sm font-black text-[#101318] underline decoration-[#101318] underline-offset-8 md:inline-flex">
            <IconFilter />
            Filter
          </button>
          <button
            type="submit"
            disabled={!query.trim() || loading}
            className="grid h-12 w-12 place-items-center rounded-2xl bg-[#63b8f2] text-white shadow-[0_12px_28px_rgba(99,184,242,0.28)] transition-all hover:-translate-y-0.5 hover:bg-[#1592e6] disabled:cursor-not-allowed disabled:bg-[#c9d2db] disabled:shadow-none"
            title="开始检索"
          >
            {loading ? <IconLoader /> : <IconArrow />}
          </button>
        </div>
      </div>

      {filtersOpen ? (
        <div className="mt-3 rounded-[20px] border border-[#e1e5ea] bg-[#fbfbfa] p-4">
          <div className="grid gap-4 lg:grid-cols-[1.2fr_1fr_1fr]">
            <div>
              <p className="mb-2 text-xs font-black uppercase tracking-[0.16em] text-[#6b737e]">来源库</p>
              <div className="flex flex-wrap gap-2">
                {QUALITY_SOURCE_OPTIONS.map((option) => {
                  const active = filters.sources?.includes(option.value) ?? false;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() =>
                        onFiltersChange({
                          ...filters,
                          sources: active
                            ? (filters.sources || []).filter((item) => item !== option.value)
                            : [...(filters.sources || []), option.value],
                        })
                      }
                      className={`rounded-full border px-3 py-1.5 text-xs font-bold transition-colors ${
                        active ? "border-[#1592e6] bg-[#edf7ff] text-[#126fb0]" : "border-[#d6dde4] bg-white text-[#4d5662]"
                      }`}
                    >
                      {option.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <p className="mb-2 text-xs font-black uppercase tracking-[0.16em] text-[#6b737e]">质量标签</p>
              <div className="flex flex-wrap gap-2">
                {QUALITY_TAG_OPTIONS.map((option) => {
                  const active = filters.quality_tags?.includes(option.value) ?? false;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() =>
                        onFiltersChange({
                          ...filters,
                          quality_tags: active
                            ? (filters.quality_tags || []).filter((item) => item !== option.value)
                            : [...(filters.quality_tags || []), option.value],
                        })
                      }
                      className={`rounded-full border px-3 py-1.5 text-xs font-bold transition-colors ${
                        active ? "border-[#1592e6] bg-[#edf7ff] text-[#126fb0]" : "border-[#d6dde4] bg-white text-[#4d5662]"
                      }`}
                    >
                      {option.label} · {option.verification}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="space-y-3">
              <label className="flex items-center justify-between gap-3 rounded-2xl border border-[#d6dde4] bg-white px-4 py-3">
                <span className="text-sm font-bold text-[#20242a]">仅开放获取</span>
                <input
                  type="checkbox"
                  checked={filters.open_access_only ?? false}
                  onChange={(event) => onFiltersChange({ ...filters, open_access_only: event.target.checked })}
                />
              </label>
              <label className="block rounded-2xl border border-[#d6dde4] bg-white px-4 py-3">
                <span className="mb-2 block text-sm font-bold text-[#20242a]">最低引用量</span>
                <input
                  type="number"
                  min={0}
                  value={filters.min_citation_count ?? 0}
                  onChange={(event) =>
                    onFiltersChange({
                      ...filters,
                      min_citation_count: Math.max(0, Number(event.target.value || 0)),
                    })
                  }
                  className="h-10 w-full rounded-xl border border-[#d6dde4] px-3 text-sm outline-none"
                />
              </label>
            </div>
          </div>
        </div>
      ) : null}
    </form>
  );
}

function PromptChip({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-2 rounded-2xl bg-[#f3f4f6] px-5 py-3 text-sm font-black text-[#6d7480] transition-colors hover:bg-[#e9f5ff] hover:text-[#126fb0]"
    >
      {icon}
      {label}
    </button>
  );
}

function buildKeywordPayload(query: string, scope: LibraryScope) {
  const hasChinese = /[\u4e00-\u9fff]/.test(query);
  if (scope === "cn") return { keywords_cn: [query], keywords_en: [] };
  if (scope === "en") {
    return hasChinese ? { keywords_cn: [query], keywords_en: [] } : { keywords_cn: [], keywords_en: [query] };
  }
  return hasChinese ? { keywords_cn: [query], keywords_en: [] } : { keywords_cn: [], keywords_en: [query] };
}

function summarizeSources(papers: Paper[]) {
  const counts = papers.reduce<Record<string, number>>((acc, paper) => {
    acc[paper.source] = (acc[paper.source] ?? 0) + 1;
    return acc;
  }, {});
  const summary = Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([source, count]) => `${sourceLabel(source)} ${count}`)
    .join(" · ");
  return summary || "暂无来源统计";
}

function formatAuthors(authors: string[] | null | undefined) {
  if (!authors?.length) return "未知作者";
  const visible = authors.slice(0, 3).join("、");
  return authors.length > 3 ? `${visible} 等` : visible;
}

function formatConversationDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "最近更新";
  return date.toLocaleDateString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
  });
}

function scopeLabel(scope: LibraryScope) {
  if (scope === "cn") return "中文";
  if (scope === "en") return "英文";
  return "全部";
}

function getPaperKey(paper: Paper) {
  return paper.doi || `${paper.source}::${paper.title}`;
}

function normalizeFilters(filters?: LiteratureQualityFilters): LiteratureQualityFilters {
  return {
    sources: [...(filters?.sources || [])],
    open_access_only: filters?.open_access_only ?? false,
    quality_tags: [...(filters?.quality_tags || [])],
    min_citation_count: filters?.min_citation_count ?? 0,
  };
}

function normalizeSearchHistoryItem(item: SearchHistoryItem): SearchHistoryItem {
  return {
    ...item,
    filters: normalizeFilters(item.filters),
  };
}

function modeLabel(mode: ResearchMode) {
  if (mode === "quick_search") return "快速";
  if (mode === "deep_research") return "深度";
  return "综述";
}

function buildAnswerTitle(query: string) {
  const normalized = query.replace(/[？?。.!！]$/u, "");
  return `${normalized}：Empirical Findings`;
}

function ConsensusMark() {
  return (
    <span className="relative inline-grid h-10 w-10 place-items-center">
      <span className="absolute h-8 w-8 rounded-full border-[7px] border-[#168feb] border-r-transparent" />
      <span className="absolute h-8 w-8 rotate-180 rounded-full border-[7px] border-[#3bd6c0] border-r-transparent opacity-95" />
    </span>
  );
}

function IconArrow() {
  return (
    <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 12h14" />
      <path d="m13 6 6 6-6 6" />
    </svg>
  );
}

function IconPlus() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round">
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </svg>
  );
}

function IconHome() {
  return (
    <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round">
      <path d="m3 10.5 9-7 9 7" />
      <path d="M5 10v10h14V10" />
      <path d="M9 20v-6h6v6" />
    </svg>
  );
}

function IconMessage() {
  return (
    <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z" />
    </svg>
  );
}

function IconEdit() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  );
}

function IconSettings() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06A1.7 1.7 0 0 0 15 19.4a1.7 1.7 0 0 0-1 .6 1.7 1.7 0 0 0-.4 1.1V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-.4-1.1 1.7 1.7 0 0 0-1-.6 1.7 1.7 0 0 0-1.88.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-.6-1 1.7 1.7 0 0 0-1.1-.4H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.1-.4 1.7 1.7 0 0 0 .6-1 1.7 1.7 0 0 0-.34-1.88l-.06-.06A2 2 0 1 1 7.23 3.4l.06.06A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-.6 1.7 1.7 0 0 0 .4-1.1V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 .4 1.1 1.7 1.7 0 0 0 1 .6 1.7 1.7 0 0 0 1.88-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.7 1.7 0 0 0 19.4 9c.4.2.7.55.9 1h.7a2 2 0 1 1 0 4h-.7a1.7 1.7 0 0 0-.9 1Z" />
    </svg>
  );
}

function IconPanel() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M9 4v16" />
    </svg>
  );
}

function IconGrid() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round">
      <rect x="4" y="4" width="6" height="6" rx="1.5" />
      <rect x="14" y="4" width="6" height="6" rx="1.5" />
      <rect x="4" y="14" width="6" height="6" rx="1.5" />
      <rect x="14" y="14" width="6" height="6" rx="1.5" />
    </svg>
  );
}

function IconTimeline() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 6h7" />
      <path d="M4 12h11" />
      <path d="M4 18h15" />
      <circle cx="17" cy="6" r="2" />
      <circle cx="19" cy="12" r="2" />
      <circle cx="12" cy="18" r="2" />
    </svg>
  );
}

function IconFolder() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" />
    </svg>
  );
}

function IconBookmark() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round">
      <path d="M19 21 12 17 5 21V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
    </svg>
  );
}

function IconFilter() {
  return (
    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 7h16" />
      <path d="M7 12h10" />
      <path d="M10 17h4" />
    </svg>
  );
}

function IconSearch() {
  return (
    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  );
}

function IconSearchSmall() {
  return (
    <svg className="shrink-0 text-[#126fb0]" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="10" cy="10" r="6" />
      <path d="m15 15 5 5" />
    </svg>
  );
}

function IconExternal() {
  return (
    <svg className="shrink-0 text-[#67717d]" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round">
      <path d="M7 17 17 7" />
      <path d="M8 7h9v9" />
    </svg>
  );
}

function IconEye() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function IconClose() {
  return (
    <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round">
      <path d="M6 6l12 12" />
      <path d="M18 6 6 18" />
    </svg>
  );
}

function IconLoader() {
  return (
    <svg className="animate-spin" width="21" height="21" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.28" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

function IconTable() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round">
      <rect x="4" y="4" width="16" height="16" rx="2" />
      <path d="M4 10h16" />
      <path d="M10 4v16" />
    </svg>
  );
}

function IconPuzzle() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 3a3 3 0 0 1 6 0v2h2a3 3 0 0 1 0 6h-2v2h2a3 3 0 0 1 0 6h-2v2H9v-2H7a3 3 0 0 1 0-6h2v-2H7a3 3 0 0 1 0-6h2z" />
    </svg>
  );
}

function IconFlask() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 3h6" />
      <path d="M10 3v6l-5 9a2 2 0 0 0 1.7 3h10.6A2 2 0 0 0 19 18l-5-9V3" />
      <path d="M7 16h10" />
    </svg>
  );
}
