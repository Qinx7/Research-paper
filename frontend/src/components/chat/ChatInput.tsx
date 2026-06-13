"use client";

// 聊天输入区：保留学术检索参数，同时贴近参考设计的底部输入栏。
import { useState, useRef, useEffect, KeyboardEvent } from "react";
import type { ResearchMode, LibraryScope } from "@/lib/types";
import { CHAT_THEME } from "./chatTheme";

interface ChatInputProps {
  onSend: (
    message: string,
    searchEnabled: boolean,
    researchMode: ResearchMode,
    libraryScope: LibraryScope,
    projectId: string | null,
  ) => void;
  projectId: string | null;
  projectOptions: { id: string; name: string }[];
  disabled?: boolean;
}

const researchModes: { value: ResearchMode; label: string }[] = [
  { value: "quick_search", label: "快速" },
  { value: "literature_review", label: "综述" },
  { value: "deep_research", label: "深度" },
];

const libraryScopes: { value: LibraryScope; label: string }[] = [
  { value: "all", label: "全部" },
  { value: "cn", label: "中文" },
  { value: "en", label: "英文" },
];

export default function ChatInput({ onSend, projectId, projectOptions, disabled }: ChatInputProps) {
  const [input, setInput] = useState("");
  const [searchEnabled, setSearchEnabled] = useState(true);
  const [researchMode, setResearchMode] = useState<ResearchMode>("literature_review");
  const [libraryScope, setLibraryScope] = useState<LibraryScope>("all");
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(projectId);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const element = textareaRef.current;
    if (element) {
      element.style.height = "auto";
      element.style.height = `${Math.min(element.scrollHeight, 180)}px`;
    }
  }, [input]);

  useEffect(() => {
    setSelectedProjectId(projectId);
  }, [projectId]);

  const handleSend = () => {
    const trimmed = input.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed, searchEnabled, researchMode, libraryScope, selectedProjectId);
    setInput("");
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      handleSend();
    }
  };

  return (
    <footer
      className="px-7 py-4"
      style={{ background: CHAT_THEME.card, borderTop: `1px solid ${CHAT_THEME.border}` }}
    >
      <div className="mx-auto max-w-[820px]">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setSearchEnabled((value) => !value)}
            className="flex h-9 items-center gap-2 rounded-lg px-3 text-xs font-medium transition-colors"
            style={{
              background: searchEnabled ? CHAT_THEME.primarySoft : CHAT_THEME.bg,
              border: `1px solid ${searchEnabled ? CHAT_THEME.accentBorder : CHAT_THEME.border}`,
              color: searchEnabled ? CHAT_THEME.accent : CHAT_THEME.mid,
            }}
          >
            <span
              className="grid h-3.5 w-3.5 place-items-center rounded-sm border"
              style={{
                borderColor: searchEnabled ? CHAT_THEME.accent : CHAT_THEME.low,
                background: searchEnabled ? CHAT_THEME.accent : "transparent",
                color: CHAT_THEME.card,
              }}
            >
              {searchEnabled ? "✓" : ""}
            </span>
            文献检索
          </button>

          <SegmentedControl
            label="模式"
            options={researchModes}
            value={researchMode}
            onChange={(value) => setResearchMode(value as ResearchMode)}
            disabled={!searchEnabled}
          />

          <SegmentedControl
            label="范围"
            options={libraryScopes}
            value={libraryScope}
            onChange={(value) => setLibraryScope(value as LibraryScope)}
            disabled={!searchEnabled}
          />

          {projectOptions.length > 0 && (
            <select
              value={selectedProjectId ?? ""}
              onChange={(event) => setSelectedProjectId(event.target.value || null)}
              disabled={!searchEnabled}
              className="h-9 min-w-[180px] rounded-lg px-3 text-xs outline-none transition-colors disabled:opacity-40"
              style={{
                background: CHAT_THEME.bg,
                border: `1px solid ${CHAT_THEME.border}`,
                color: CHAT_THEME.mid,
              }}
              title="可选：附带项目内部依据"
            >
              <option value="">仅检索外部文献</option>
              {projectOptions.map((project) => (
                <option key={project.id} value={project.id}>{project.name}</option>
              ))}
            </select>
          )}
        </div>

        <div
          className="flex items-end gap-3 rounded-xl px-4 py-3 transition-all"
          style={{ background: CHAT_THEME.bg, border: `1.5px solid rgba(24,35,43,0.16)` }}
        >
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="输入研究问题，例如：检索增强生成在多跳推理任务中的最新进展？"
            disabled={disabled}
            rows={1}
            className="max-h-[180px] min-h-[40px] flex-1 resize-none bg-transparent py-2 text-sm leading-6 outline-none disabled:opacity-50"
            style={{ color: CHAT_THEME.text }}
          />
          <button
            onClick={handleSend}
            disabled={disabled || !input.trim()}
            className="grid h-10 w-10 shrink-0 place-items-center rounded-lg transition-colors disabled:cursor-not-allowed"
            style={{
              background: input.trim() && !disabled ? CHAT_THEME.primary : "transparent",
              color: input.trim() && !disabled ? CHAT_THEME.card : CHAT_THEME.low,
            }}
            title="发送"
          >
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 19V5M5 12l7-7 7 7" />
            </svg>
          </button>
        </div>
        <div className="mt-2 flex items-center justify-between px-1 text-[11px]" style={{ color: CHAT_THEME.low }}>
          <span>Enter 发送 · Shift+Enter 换行</span>
          <span>CNKI · Semantic Scholar · OpenAlex · CQVIP</span>
        </div>
      </div>
    </footer>
  );
}

function SegmentedControl({
  label,
  options,
  value,
  onChange,
  disabled,
}: {
  label: string;
  options: { value: string; label: string }[];
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  return (
    <div
      className={`flex h-9 items-center rounded-lg ${disabled ? "opacity-40" : ""}`}
      style={{ background: CHAT_THEME.bg, border: `1px solid ${CHAT_THEME.border}` }}
    >
      <span className="px-3 text-[11px] font-semibold" style={{ color: CHAT_THEME.low }}>{label}</span>
      <div className="flex h-full overflow-hidden rounded-r-lg" style={{ borderLeft: `1px solid ${CHAT_THEME.border}` }}>
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            disabled={disabled}
            onClick={() => onChange(option.value)}
            className="min-w-12 px-3 text-xs font-medium transition-colors"
            style={{
              background: value === option.value ? CHAT_THEME.primary : CHAT_THEME.card,
              color: value === option.value ? CHAT_THEME.card : CHAT_THEME.mid,
            }}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}
