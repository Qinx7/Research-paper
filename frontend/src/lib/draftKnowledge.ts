/** 草稿知识与写作状态共享逻辑：供 writing 与 PaperWorkflow 复用。 */
import type { Draft, PaperSection } from "@/lib/types";

export type DraftChapterRecord = {
  title: string;
  content: string;
  status: string;
  data_based?: boolean;
  citations?: string[];
};

export const DEFAULT_DRAFT_CHAPTER_KEYS = [
  "chapter_1_introduction",
  "chapter_2_theory",
  "chapter_3_design",
  "chapter_4_implementation",
  "chapter_5_experiment",
  "chapter_6_conclusion",
] as const;

export function getDraftChapterRecord(draft: Draft | null, key: string): DraftChapterRecord | null {
  if (!draft?.content) return null;
  const value = draft.content[key];
  if (!value || typeof value !== "object") return null;
  if (typeof (value as DraftChapterRecord).title !== "string") return null;
  if (typeof (value as DraftChapterRecord).content !== "string") return null;
  if (typeof (value as DraftChapterRecord).status !== "string") return null;
  return value as DraftChapterRecord;
}

export function getDraftReferences(draft: Draft | null): string[] {
  if (!draft) return [];

  const structuredReferences = (draft.references || [])
    .map(formatDraftReference)
    .filter(Boolean) as string[];

  const chapterCitationReferences = Object.values(draft.content || {})
    .flatMap((chapter) => {
      if (!chapter || typeof chapter !== "object" || !Array.isArray((chapter as DraftChapterRecord).citations)) {
        return [];
      }
      return ((chapter as DraftChapterRecord).citations || [])
        .map((citation) => citation?.trim())
        .filter(Boolean) as string[];
    });

  return Array.from(new Set([...structuredReferences, ...chapterCitationReferences]));
}

export function isDraftChapterCompleted(
  section?: Pick<PaperSection, "status" | "content"> | null,
  record?: DraftChapterRecord | null,
): boolean {
  if (record?.status && record.status !== "draft") return true;
  if (section?.status && section.status !== "draft") return true;
  if (record?.content?.trim()) return true;
  if (section?.content?.trim()) return true;
  return false;
}

export function getDraftCompletionSummary(
  draft: Draft | null,
  chapterKeys: readonly string[] = DEFAULT_DRAFT_CHAPTER_KEYS,
) {
  if (!draft) {
    return {
      completedCount: 0,
      totalCount: chapterKeys.length,
      progress: 0,
    };
  }

  const completedCount = chapterKeys.filter((key) => {
    const section = draft.sections.find((item) => item.key === key) ?? null;
    const record = getDraftChapterRecord(draft, key);
    return isDraftChapterCompleted(section, record);
  }).length;
  const totalCount = Math.max(chapterKeys.length, 1);

  return {
    completedCount,
    totalCount,
    progress: Math.round((completedCount / totalCount) * 100),
  };
}

export function buildEditedChapterPayload(
  previous: DraftChapterRecord | undefined,
  nextTitle: string,
  nextContent: string,
): DraftChapterRecord {
  const trimmed = nextContent.trim();
  return {
    title: nextTitle,
    content: nextContent,
    status: trimmed ? "edited" : "draft",
    citations: trimmed ? [...(previous?.citations || [])] : [],
    // 手工编辑后保守降级，避免旧的真实结果标记被错误沿用到新文本。
    data_based: false,
  };
}

function formatDraftReference(reference: Record<string, unknown>) {
  const title = typeof reference.title === "string" ? reference.title : "";
  const year = typeof reference.year === "number" || typeof reference.year === "string" ? ` (${reference.year})` : "";
  const source = typeof reference.source === "string" ? ` · ${reference.source}` : "";
  const doi = typeof reference.doi === "string" ? ` · DOI: ${reference.doi}` : "";
  const url = typeof reference.url === "string" ? ` · ${reference.url}` : "";
  return title ? `${title}${year}${source}${doi || url}` : "";
}
