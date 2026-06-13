"use client";

// 流式回复等待状态，和聊天气泡视觉保持一致。
import { CHAT_THEME } from "./chatTheme";

export default function ThinkingIndicator({ text = "正在思考" }: { text?: string }) {
  return (
    <div className="flex items-center gap-3 py-2">
      <div className="flex items-center gap-1.5">
        <span
          className="h-2 w-2 animate-bounce rounded-full"
          style={{ background: CHAT_THEME.primary, animationDelay: "0ms" }}
        />
        <span
          className="h-2 w-2 animate-bounce rounded-full"
          style={{ background: CHAT_THEME.primary, animationDelay: "150ms" }}
        />
        <span
          className="h-2 w-2 animate-bounce rounded-full"
          style={{ background: CHAT_THEME.primary, animationDelay: "300ms" }}
        />
      </div>
      <span className="text-sm font-medium" style={{ color: CHAT_THEME.mid }}>{text}...</span>
    </div>
  );
}
