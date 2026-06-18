"use client";

// 学术工作台侧边栏：模块导航、近期会话和个人设置入口。
import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { listConversations, deleteConversation, getConversation } from "@/lib/chatApi";
import type { Conversation, ChatMessage } from "@/lib/types";
import { CHAT_THEME } from "./chatTheme";

interface ChatSidebarProps {
  activeModule?: "search" | "research" | "writing";
  currentId: string | null;
  onSelect: (id: string, messages: ChatMessage[]) => void;
  onNewChat: () => void;
  onOpenSettings: () => void;
  refreshKey: number;
  searchEntryMode?: "search" | "home";
}
type ModuleItem = {
  key: "search" | "research" | "writing";
  label: string;
  desc: string;
  href: string;
  title: string;
  icon: React.ReactNode;
};

function buildModuleItems(searchEntryMode: "search" | "home"): ModuleItem[] {
  return [
    searchEntryMode === "home"
      ? {
          key: "search",
          label: "返回首页",
          desc: "回到搜索首页",
          href: "/",
          title: "返回首页",
          icon: (
            <>
              <path d="m3 10.5 9-7 9 7" />
              <path d="M5 10v10h14V10" />
              <path d="M9 20v-6h6v6" />
            </>
          ),
        }
      : {
          key: "search",
          label: "文献搜索",
          desc: "对话式检索",
          href: "/chat",
          title: "新建文献搜索对话",
          icon: (
            <>
              <circle cx="11" cy="11" r="5" />
              <path d="m16 16 4 4" />
            </>
          ),
        },
    {
      key: "research",
      label: "研究方向",
      desc: "方向分析",
      href: "/research",
      title: "进入研究方向模块",
      icon: (
        <>
          <path d="M10 2v6l-4.5 8A4 4 0 0 0 9 22h6a4 4 0 0 0 3.5-6L14 8V2" />
          <path d="M8 2h8" />
        </>
      ),
    },
    {
      key: "writing",
      label: "论文写作",
      desc: "辅助撰写",
      href: "/writing",
      title: "进入论文写作模块",
      icon: (
        <>
          <path d="M12 20h9" />
          <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
        </>
      ),
    },
  ];
}

export default function ChatSidebar({
  activeModule = "search",
  currentId,
  onSelect,
  onNewChat,
  onOpenSettings,
  refreshKey,
  searchEntryMode = "search",
}: ChatSidebarProps) {
  const router = useRouter();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [collapsed, setCollapsed] = useState(false);
  const moduleItems = buildModuleItems(searchEntryMode);

  const loadList = useCallback(async () => {
    try {
      const list = await listConversations();
      setConversations(list);
    } catch {
      // 历史列表失败时不阻塞当前对话。
    }
  }, []);

  useEffect(() => {
    loadList();
  }, [loadList, refreshKey]);

  const handleSelect = async (conv: Conversation) => {
    try {
      const detail = await getConversation(conv.id);
      onSelect(conv.id, detail.messages);
    } catch {
      // 加载失败时保持当前对话。
    }
  };

  const handleDelete = async (event: React.MouseEvent, id: string) => {
    event.stopPropagation();
    if (!window.confirm("确定删除该对话？")) return;
    try {
      await deleteConversation(id);
      setConversations((prev) => prev.filter((item) => item.id !== id));
      if (id === currentId) onNewChat();
    } catch (err) {
      console.error("删除对话失败:", err);
      alert("删除失败，请重试");
    }
  };

  const handleModuleClick = (item: ModuleItem) => {
    if (item.key === "search" && searchEntryMode === "search") {
      onNewChat();
      if (window.location.pathname !== "/chat") router.push(item.href);
      return;
    }
    router.push(item.href);
  };

  if (collapsed) {
    return (
      <aside
        className="flex w-16 shrink-0 flex-col items-center py-4"
        style={{ background: CHAT_THEME.primary, borderRight: `1px solid rgba(237,232,218,0.08)` }}
      >
        <IconButton label="展开侧栏" onClick={() => setCollapsed(false)}>
          <path d="M4 6h16M4 12h16M4 18h16" />
        </IconButton>
        <div className="mt-3">
          <IconButton label="新对话" onClick={onNewChat} accent>
            <path d="M12 5v14M5 12h14" />
          </IconButton>
        </div>
        <div className="mt-auto">
          <IconButton label="个人设置" onClick={onOpenSettings}>
            <path d="M12 15.5A3.5 3.5 0 1 0 12 8a3.5 3.5 0 0 0 0 7.5Z" />
            <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06A1.7 1.7 0 0 0 15 19.4a1.7 1.7 0 0 0-1 .6 1.7 1.7 0 0 0-.4 1.1V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-.4-1.1 1.7 1.7 0 0 0-1-.6 1.7 1.7 0 0 0-1.88.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-.6-1 1.7 1.7 0 0 0-1.1-.4H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.1-.4 1.7 1.7 0 0 0 .6-1 1.7 1.7 0 0 0-.34-1.88l-.06-.06A2 2 0 1 1 7.23 3.4l.06.06A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-.6 1.7 1.7 0 0 0 .4-1.1V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 .4 1.1 1.7 1.7 0 0 0 1 .6 1.7 1.7 0 0 0 1.88-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.7 1.7 0 0 0 19.4 9c.4.2.7.55.9 1h.7a2 2 0 1 1 0 4h-.7a1.7 1.7 0 0 0-.9 1Z" />
          </IconButton>
        </div>
      </aside>
    );
  }

  const visibleConversations = conversations.filter((conv) => (conv.message_count ?? 1) > 0);

  return (
    <aside
      className="flex w-64 shrink-0 flex-col"
      style={{ background: CHAT_THEME.primary, borderRight: `1px solid rgba(237,232,218,0.08)` }}
    >
      <div className="px-5 py-[18px]" style={{ borderBottom: `1px solid rgba(237,232,218,0.08)` }}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div
              className="flex h-[34px] w-[34px] items-center justify-center rounded"
              style={{ background: CHAT_THEME.primaryDeep, border: "1px solid rgba(237,232,218,0.12)" }}
            >
              <span className="text-sm font-semibold" style={{ color: CHAT_THEME.accentLight }}>研</span>
            </div>
            <div>
              <div
                className="text-[17px] font-semibold leading-tight"
                style={{ fontFamily: "var(--font-cormorant), serif", color: CHAT_THEME.bg }}
              >
                Scholar
              </div>
              <div className="text-[10px] uppercase tracking-[0.09em]" style={{ color: "rgba(237,232,218,0.28)" }}>
                Academic Intelligence
              </div>
            </div>
          </div>
          <IconButton label="收起侧栏" onClick={() => setCollapsed(true)}>
            <path d="M4 6h16M4 12h16M4 18h16" />
          </IconButton>
        </div>
      </div>

      <nav className="px-3 pb-2 pt-4">
        <div className="mb-2 px-2 text-[10px] uppercase tracking-[0.1em]" style={{ color: "rgba(237,232,218,0.28)" }}>
          功能模块
        </div>
        {moduleItems.map((item) => (
          <ModuleButton
            key={item.key}
            item={item}
            active={item.key === activeModule}
            onClick={() => handleModuleClick(item)}
          />
        ))}
      </nav>

      <div style={{ height: 1, background: "rgba(237,232,218,0.08)", margin: "4px 16px 12px" }} />

      <div className="px-3 pb-2">
        <div className="mb-2 px-2 text-[10px] uppercase tracking-[0.1em]" style={{ color: "rgba(237,232,218,0.28)" }}>
          近期会话
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-3 pb-3" style={{ scrollbarWidth: "none" }}>
        {visibleConversations.length === 0 ? (
          <div
            className="mt-6 rounded border px-4 py-8 text-center"
            style={{ borderColor: "rgba(237,232,218,0.08)", background: "rgba(237,232,218,0.03)" }}
          >
            <p className="text-sm font-medium" style={{ color: "rgba(237,232,218,0.72)" }}>暂无历史对话</p>
            <p className="mt-2 text-xs leading-5" style={{ color: "rgba(237,232,218,0.26)" }}>
              新的研究问题会出现在这里。
            </p>
          </div>
        ) : (
          <div className="space-y-1">
            {visibleConversations.map((conv) => (
              <div
                key={conv.id}
                role="button"
                tabIndex={0}
                onClick={() => handleSelect(conv)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") handleSelect(conv);
                }}
                className="group w-full rounded px-3 py-3 text-left transition-all"
                style={{
                  background: conv.id === currentId ? "rgba(130,40,40,0.18)" : "transparent",
                  borderLeft: `2px solid ${conv.id === currentId ? CHAT_THEME.accent : "transparent"}`,
                }}
              >
                <div className="flex items-start gap-3">
                  <span
                    className="mt-1 h-2 w-2 shrink-0 rounded-full"
                    style={{ background: conv.id === currentId ? CHAT_THEME.accentLight : "rgba(237,232,218,0.2)" }}
                  />
                  <div className="min-w-0 flex-1">
                    <p
                      className="truncate text-sm font-medium"
                      style={{ color: conv.id === currentId ? CHAT_THEME.bg : "rgba(237,232,218,0.58)" }}
                    >
                      {conv.title}
                    </p>
                    <p className="mt-1 text-[11px]" style={{ color: "rgba(237,232,218,0.24)" }}>
                      {formatDate(conv.updated_at || conv.created_at)}
                      {typeof conv.message_count === "number" ? ` · ${conv.message_count} 条` : ""}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={(event) => handleDelete(event, conv.id)}
                    className="grid h-7 w-7 shrink-0 place-items-center opacity-0 transition-all group-hover:opacity-100"
                    style={{ color: "rgba(237,232,218,0.32)" }}
                    title="删除对话"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                      <path d="M18 6 6 18M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={{ borderTop: "1px solid rgba(237,232,218,0.08)" }}>
        <button
          type="button"
          onClick={onOpenSettings}
          className="flex w-full items-center gap-3 px-4 py-4 text-left transition-all hover:bg-white/5"
          title="打开个人设置"
        >
          <div
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[13px] font-semibold"
            style={{ background: "rgba(130,40,40,0.28)", color: CHAT_THEME.accentLight }}
          >
            研
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-[12.5px] font-medium" style={{ color: "rgba(237,232,218,0.75)" }}>
              研究员用户
            </div>
            <div className="text-[11px]" style={{ color: "rgba(237,232,218,0.26)" }}>
              免费版 · 点击设置
            </div>
          </div>
          <svg
            width="13"
            height="13"
            viewBox="0 0 24 24"
            fill="none"
            stroke="rgba(237,232,218,0.26)"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M12 15.5A3.5 3.5 0 1 0 12 8a3.5 3.5 0 0 0 0 7.5Z" />
            <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06A1.7 1.7 0 0 0 15 19.4a1.7 1.7 0 0 0-1 .6 1.7 1.7 0 0 0-.4 1.1V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-.4-1.1 1.7 1.7 0 0 0-1-.6 1.7 1.7 0 0 0-1.88.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-.6-1 1.7 1.7 0 0 0-1.1-.4H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.1-.4 1.7 1.7 0 0 0 .6-1 1.7 1.7 0 0 0-.34-1.88l-.06-.06A2 2 0 1 1 7.23 3.4l.06.06A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-.6 1.7 1.7 0 0 0 .4-1.1V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 .4 1.1 1.7 1.7 0 0 0 1 .6 1.7 1.7 0 0 0 1.88-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.7 1.7 0 0 0 19.4 9c.4.2.7.55.9 1h.7a2 2 0 1 1 0 4h-.7a1.7 1.7 0 0 0-.9 1Z" />
          </svg>
        </button>
      </div>
    </aside>
  );
}

function ModuleButton({
  item,
  active,
  onClick,
}: {
  item: ModuleItem;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="mb-1 flex w-full items-center gap-3 rounded px-3 py-2.5 text-left transition-all"
      style={{
        background: active ? "rgba(130,40,40,0.18)" : "transparent",
        color: active ? CHAT_THEME.bg : "rgba(237,232,218,0.52)",
        borderLeft: `2px solid ${active ? CHAT_THEME.accentLight : "transparent"}`,
        cursor: "pointer",
      }}
      title={item.title}
    >
      <svg
        width="15"
        height="15"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{ color: active ? CHAT_THEME.accentLight : "rgba(237,232,218,0.24)" }}
      >
        {item.icon}
      </svg>
      <span className="min-w-0 flex-1">
        <span className="block text-[13.5px] font-medium">{item.label}</span>
        <span className="mt-0.5 block text-[11px]" style={{ color: "rgba(237,232,218,0.28)" }}>
          {item.desc}
        </span>
      </span>
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={active ? CHAT_THEME.accentLight : "rgba(237,232,218,0.24)"} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="m9 18 6-6-6-6" />
      </svg>
    </button>
  );
}

function IconButton({
  label,
  onClick,
  accent,
  children,
}: {
  label: string;
  onClick: () => void;
  accent?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className="grid h-9 w-9 place-items-center rounded border transition-colors"
      style={
        accent
          ? {
              borderColor: CHAT_THEME.accentBorder,
              background: CHAT_THEME.accentSoft,
              color: CHAT_THEME.bg,
            }
          : {
              borderColor: "rgba(237,232,218,0.08)",
              color: "rgba(237,232,218,0.36)",
              background: "transparent",
            }
      }
      title={label}
    >
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
        {children}
      </svg>
    </button>
  );
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "最近更新";
  return date.toLocaleDateString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
  });
}
