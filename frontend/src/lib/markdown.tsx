/** 轻量 Markdown → JSX 渲染器，无需外部依赖 */
import React from "react";

/** 解析内联格式：粗体、斜体、行内代码 */
function parseInline(text: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  // 匹配: **粗体**, *斜体*, `代码`
  const re = /(\*\*(.+?)\*\*|\*(.+?)\*|`(.+?)`)/g;
  let last = 0;
  let match: RegExpExecArray | null;

  while ((match = re.exec(text)) !== null) {
    if (match.index > last) {
      nodes.push(text.slice(last, match.index));
    }
    if (match[2]) {
      nodes.push(<strong key={match.index}>{match[2]}</strong>);
    } else if (match[3]) {
      nodes.push(<em key={match.index}>{match[3]}</em>);
    } else if (match[4]) {
      nodes.push(
        <code key={match.index} className="bg-gray-100 px-1 py-0.5 rounded text-sm">
          {match[4]}
        </code>
      );
    }
    last = match.index + match[0].length;
  }
  if (last < text.length) {
    nodes.push(text.slice(last));
  }
  return nodes.map((node, idx) => <React.Fragment key={`inline-${idx}`}>{node}</React.Fragment>);
}

/** 将 Markdown 文本渲染为 JSX。
 * @param scope 可选的作用域前缀，用于保证多个 renderMarkdown 实例之间的 key 唯一性。
 *              传入稳定值（如消息 ID）可避免不必要的 DOM 重建。 */
export function renderMarkdown(md: string, scope?: string): React.ReactNode[] {
  const prefix = scope ? `${scope}-` : "";
  const lines = md.split("\n");
  const elements: React.ReactNode[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // 空行跳过
    if (!line.trim()) {
      i++;
      continue;
    }

    // 代码块 ```
    if (line.trim().startsWith("```")) {
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith("```")) {
        codeLines.push(lines[i]);
        i++;
      }
      i++; // 跳过结束 ```
      elements.push(
        <pre key={`${prefix}${i}`} className="bg-gray-900 text-gray-100 rounded-lg p-4 my-2 overflow-x-auto text-sm">
          <code>{codeLines.join("\n")}</code>
        </pre>
      );
      continue;
    }

    // 标题
    const h1 = line.match(/^#\s+(.+)/);
    const h2 = line.match(/^##\s+(.+)/);
    const h3 = line.match(/^###\s+(.+)/);
    if (h1) {
      elements.push(
        <h2 key={`${prefix}${i}`} className="text-xl font-bold mt-4 mb-2">{parseInline(h1[1])}</h2>
      );
      i++;
      continue;
    }
    if (h2) {
      elements.push(
        <h3 key={`${prefix}${i}`} className="text-lg font-semibold mt-3 mb-1">{parseInline(h2[1])}</h3>
      );
      i++;
      continue;
    }
    if (h3) {
      elements.push(
        <h4 key={`${prefix}${i}`} className="text-base font-semibold mt-2 mb-1">{parseInline(h3[1])}</h4>
      );
      i++;
      continue;
    }

    // 无序列表
    const ulMatch = line.match(/^[-*]\s+(.+)/);
    if (ulMatch) {
      const items: React.ReactNode[] = [];
      while (i < lines.length) {
        const m = lines[i].match(/^[-*]\s+(.+)/);
        if (!m) break;
        items.push(<li key={`${prefix}${i}`}>{parseInline(m[1])}</li>);
        i++;
      }
      elements.push(<ul key={`${prefix}${i}`} className="list-disc list-inside my-2 space-y-1">{items}</ul>);
      continue;
    }

    // 有序列表
    const olMatch = line.match(/^\d+\.\s+(.+)/);
    if (olMatch) {
      const items: React.ReactNode[] = [];
      while (i < lines.length) {
        const m = lines[i].match(/^\d+\.\s+(.+)/);
        if (!m) break;
        items.push(<li key={`${prefix}${i}`}>{parseInline(m[1])}</li>);
        i++;
      }
      elements.push(<ol key={`${prefix}${i}`} className="list-decimal list-inside my-2 space-y-1">{items}</ol>);
      continue;
    }

    // 引用
    const quote = line.match(/^>\s?(.+)/);
    if (quote) {
      const quoteLines: string[] = [];
      while (i < lines.length) {
        const m = lines[i].match(/^>\s?(.*)/);
        if (!m) break;
        quoteLines.push(m[1]);
        i++;
      }
      elements.push(
        <blockquote key={`${prefix}${i}`} className="border-l-4 border-primary-400 pl-4 my-2 text-gray-600 italic">
          {quoteLines.map((ql, qi) => (
            <p key={qi}>{parseInline(ql)}</p>
          ))}
        </blockquote>
      );
      continue;
    }

    // 分隔线
    if (/^[-*_]{3,}\s*$/.test(line.trim())) {
      elements.push(<hr key={`${prefix}${i}`} className="my-4 border-gray-200" />);
      i++;
      continue;
    }

    // 普通段落
    elements.push(
      <p key={`${prefix}${i}`} className="my-1 leading-relaxed">{parseInline(line)}</p>
    );
    i++;
  }

  return elements;
}
