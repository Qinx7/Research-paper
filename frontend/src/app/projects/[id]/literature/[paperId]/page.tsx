/** 单篇文献详情页：展示项目文献库中已沉淀文献的完整元数据与摘要。 */
"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  analyzeProjectPaper,
  createPaperNote,
  deletePaperNote,
  getProject,
  getProjectPaper,
  listPaperNotes,
  updatePaperNote,
} from "@/lib/api";
import type { PaperAnalysisResult, PaperNote, PaperNoteType, Project, SavedPaper } from "@/lib/types";

const SOURCE_LABEL: Record<string, string> = {
  pubmed: "PubMed",
  cnki: "知网",
  cqvip: "维普",
  openalex: "OpenAlex",
  semantic_scholar: "Semantic Scholar",
  crossref: "Crossref",
  arxiv: "arXiv",
};

const NOTE_TYPE_OPTIONS: { value: PaperNoteType; label: string }[] = [
  { value: "summary", label: "摘要笔记" },
  { value: "finding", label: "核心发现" },
  { value: "method", label: "研究方法" },
  { value: "limitation", label: "局限风险" },
  { value: "quote", label: "原文摘录" },
  { value: "idea", label: "启发想法" },
];

type NoteFormState = {
  note_type: PaperNoteType;
  title: string;
  content: string;
  evidence_text: string;
  evidence_level: string;
  confidence: string;
  tagsText: string;
};

const EMPTY_NOTE_FORM: NoteFormState = {
  note_type: "summary",
  title: "",
  content: "",
  evidence_text: "",
  evidence_level: "",
  confidence: "",
  tagsText: "",
};

export default function LiteratureDetailPage() {
  const params = useParams();
  const router = useRouter();
  const projectId = params.id as string;
  const paperId = params.paperId as string;
  const [project, setProject] = useState<Project | null>(null);
  const [paper, setPaper] = useState<SavedPaper | null>(null);
  const [analysis, setAnalysis] = useState<PaperAnalysisResult | null>(null);
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [notes, setNotes] = useState<PaperNote[]>([]);
  const [notesLoading, setNotesLoading] = useState(false);
  const [notesError, setNotesError] = useState<string | null>(null);
  const [noteSaving, setNoteSaving] = useState(false);
  const [analysisNoteSaving, setAnalysisNoteSaving] = useState<string | null>(null);
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [noteForm, setNoteForm] = useState<NoteFormState>(EMPTY_NOTE_FORM);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    Promise.all([getProject(projectId), getProjectPaper(projectId, paperId)])
      .then(([projectResult, paperResult]) => {
        if (cancelled) return;
        setProject(projectResult);
        setPaper(paperResult);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "文献详情加载失败");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [paperId, projectId]);

  useEffect(() => {
    let cancelled = false;
    setNotesLoading(true);
    setNotesError(null);
    listPaperNotes(projectId, paperId)
      .then((items) => {
        if (!cancelled) setNotes(items);
      })
      .catch((err) => {
        if (!cancelled) setNotesError(err instanceof Error ? err.message : "阅读笔记加载失败");
      })
      .finally(() => {
        if (!cancelled) setNotesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [paperId, projectId]);

  const authors = useMemo(() => formatAuthors(paper?.authors), [paper?.authors]);
  const evidenceWarnings = useMemo(() => buildEvidenceWarnings(paper), [paper]);

  const handleAnalyze = async () => {
    setAnalysisLoading(true);
    setAnalysisError(null);
    try {
      const result = await analyzeProjectPaper(projectId, paperId);
      setAnalysis(result);
    } catch (err) {
      setAnalysisError(err instanceof Error ? err.message : "文献结构化分析失败");
    } finally {
      setAnalysisLoading(false);
    }
  };

  const refreshNotes = async () => {
    const items = await listPaperNotes(projectId, paperId);
    setNotes(items);
  };

  const resetNoteForm = () => {
    setEditingNoteId(null);
    setNoteForm(EMPTY_NOTE_FORM);
  };

  const handleSaveNote = async () => {
    const title = noteForm.title.trim();
    const content = noteForm.content.trim();
    if (!title || !content) {
      setNotesError("请先填写笔记标题和内容");
      return;
    }
    setNoteSaving(true);
    setNotesError(null);
    const payload = {
      note_type: noteForm.note_type,
      title,
      content,
      evidence_text: noteForm.evidence_text.trim() || null,
      evidence_level: noteForm.evidence_level.trim() || null,
      confidence: noteForm.confidence ? Number(noteForm.confidence) : null,
      tags: splitTags(noteForm.tagsText),
    };
    try {
      if (editingNoteId) {
        await updatePaperNote(editingNoteId, payload);
      } else {
        await createPaperNote({
          project_id: projectId,
          paper_id: paperId,
          ...payload,
        });
      }
      resetNoteForm();
      await refreshNotes();
    } catch (err) {
      setNotesError(err instanceof Error ? err.message : "阅读笔记保存失败");
    } finally {
      setNoteSaving(false);
    }
  };

  const handleEditNote = (note: PaperNote) => {
    setEditingNoteId(note.id);
    setNoteForm({
      note_type: note.note_type,
      title: note.title,
      content: note.content,
      evidence_text: note.evidence_text || "",
      evidence_level: note.evidence_level || "",
      confidence: note.confidence === null || note.confidence === undefined ? "" : String(note.confidence),
      tagsText: (note.tags || []).join("，"),
    });
  };

  const handleDeleteNote = async (noteId: string) => {
    if (!window.confirm("确定删除这条阅读笔记吗？")) return;
    setNotesError(null);
    try {
      await deletePaperNote(noteId);
      if (editingNoteId === noteId) resetNoteForm();
      await refreshNotes();
    } catch (err) {
      setNotesError(err instanceof Error ? err.message : "阅读笔记删除失败");
    }
  };

  const handleSaveAnalysisNote = async (
    noteType: PaperNoteType,
    title: string,
    content: string,
  ) => {
    const normalized = content.trim();
    if (!analysis || !normalized || normalized === "暂无足够依据") {
      setNotesError("当前字段暂无足够依据，暂不保存为证据卡片");
      return;
    }
    const savingKey = `${noteType}-${title}`;
    setAnalysisNoteSaving(savingKey);
    setNotesError(null);
    try {
      await createPaperNote({
        project_id: projectId,
        paper_id: paperId,
        note_type: noteType,
        title,
        content: normalized,
        evidence_text: paper?.abstract ? paper.abstract.slice(0, 600) : null,
        evidence_level: analysis.evidence_level,
        confidence: analysis.evidence_level === "证据不足" ? 30 : 70,
        tags: ["结构化分析", sourceLabel(paper?.source || null)],
      });
      await refreshNotes();
    } catch (err) {
      setNotesError(err instanceof Error ? err.message : "证据卡片保存失败");
    } finally {
      setAnalysisNoteSaving(null);
    }
  };

  if (loading) {
    return <CenteredState title="正在加载文献详情..." description="正在读取项目文献库中的单篇文献记录。" />;
  }

  if (error || !paper) {
    return (
      <CenteredState
        title="文献详情加载失败"
        description={error || "没有找到这篇文献。"}
        actionLabel="返回项目"
        onAction={() => router.push(`/projects/${projectId}`)}
      />
    );
  }

  return (
    <main className="min-h-screen bg-[#faf7f2] paper-texture">
      <header className="border-b border-[#3d3830] bg-[#1a1815]">
        <div className="mx-auto max-w-6xl px-6 py-6">
          <button
            type="button"
            onClick={() => router.push(`/projects/${projectId}`)}
            className="group mb-3 inline-flex items-center gap-2 text-xs tracking-wide text-[#6b6358] transition-colors hover:text-[#b8a898]"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="transition-transform group-hover:-translate-x-1">
              <path d="M19 12H5m0 0l7 7m-7-7l7-7" />
            </svg>
            返回项目文献库
          </button>
          <p className="text-[11px] uppercase tracking-[0.22em] text-[#8b7355]">
            Literature Detail · {project?.name || "项目文献"}
          </p>
          <h1 className="mt-3 max-w-4xl text-3xl font-semibold leading-tight text-[#e8e0d0]" style={{ fontFamily: "var(--font-cormorant), serif" }}>
            {paper.title}
          </h1>
        </div>
      </header>

      <section className="mx-auto grid max-w-6xl gap-6 px-6 py-10 lg:grid-cols-[340px_minmax(0,1fr)]">
        <aside className="space-y-5">
          <div className="rounded-sm border border-[#e8e1d5] bg-white p-6 shadow-sm">
            <p className="text-[11px] uppercase tracking-[0.2em] text-[#b8a898]">Metadata</p>
            <dl className="mt-5 space-y-4 text-sm">
              <MetaRow label="作者" value={authors} />
              <MetaRow label="年份" value={paper.year ? String(paper.year) : "未知年份"} />
              <MetaRow label="来源" value={sourceLabel(paper.source)} />
              <MetaRow label="期刊/会议" value={paper.venue || "未知期刊/会议"} />
              <MetaRow label="引用量" value={`${paper.citation_count ?? 0} citations`} />
              <MetaRow label="DOI" value={paper.doi || "暂无 DOI"} />
            </dl>
            {paper.url ? (
              <a
                href={paper.url}
                target="_blank"
                rel="noreferrer"
                className="mt-6 inline-flex w-full justify-center rounded-full bg-[#2d2a26] px-5 py-3 text-xs font-medium text-white transition-colors hover:bg-[#1a1815]"
              >
                打开文献来源
              </a>
            ) : null}
          </div>

          <div className="rounded-sm border border-[#e8e1d5] bg-white p-6 shadow-sm">
            <p className="text-[11px] uppercase tracking-[0.2em] text-[#b8a898]">Evidence Status</p>
            <div className="mt-4 space-y-2">
              {evidenceWarnings.map((warning) => (
                <div key={warning} className="rounded-sm border border-[#eadfcd] bg-[#fbf7ef] px-3 py-2 text-xs leading-5 text-[#8b7355]">
                  {warning}
                </div>
              ))}
            </div>
          </div>
        </aside>

        <article className="rounded-sm border border-[#e8e1d5] bg-white p-7 shadow-sm md:p-9">
          <div className="decorative-rule">
            <p className="text-[11px] uppercase tracking-[0.2em] text-[#8b7355]" style={{ fontFamily: "var(--font-cormorant), serif" }}>
              Abstract
            </p>
            <h2 className="mt-1 text-2xl font-semibold text-[#2d2a26]" style={{ fontFamily: "var(--font-cormorant), serif" }}>
              摘要与可核验内容
            </h2>
          </div>

          <div className="mt-7 rounded-sm border border-[#f0e8dc] bg-[#fcfaf6] p-6">
            {paper.abstract ? (
              <p className="whitespace-pre-wrap text-[15px] leading-8 text-[#4f4438]">{paper.abstract}</p>
            ) : (
              <div className="text-sm leading-7 text-[#8b7b6b]">
                当前文献暂无摘要，建议打开来源链接进一步核验。后续 AI 结构化分析会在证据不足时明确提示，不会凭空生成研究方法、样本或结论。
              </div>
            )}
          </div>

          <div className="mt-8 grid gap-4 md:grid-cols-3">
            <InsightCard label="来源类型" value={sourceLabel(paper.source)} />
            <InsightCard label="可分析程度" value={paper.abstract ? "可做摘要级分析" : "证据不足"} />
            <InsightCard label="下一步" value="结构化分析" />
          </div>

          <AnalysisPanel
            analysis={analysis}
            loading={analysisLoading}
            error={analysisError}
            savingNoteKey={analysisNoteSaving}
            onAnalyze={handleAnalyze}
            onSaveNote={handleSaveAnalysisNote}
          />

          <ReadingNotesPanel
            notes={notes}
            loading={notesLoading}
            error={notesError}
            form={noteForm}
            editingNoteId={editingNoteId}
            saving={noteSaving}
            onFormChange={setNoteForm}
            onSave={handleSaveNote}
            onCancel={resetNoteForm}
            onEdit={handleEditNote}
            onDelete={handleDeleteNote}
          />
        </article>
      </section>
    </main>
  );
}

function ReadingNotesPanel({
  notes,
  loading,
  error,
  form,
  editingNoteId,
  saving,
  onFormChange,
  onSave,
  onCancel,
  onEdit,
  onDelete,
}: {
  notes: PaperNote[];
  loading: boolean;
  error: string | null;
  form: NoteFormState;
  editingNoteId: string | null;
  saving: boolean;
  onFormChange: (next: NoteFormState) => void;
  onSave: () => void;
  onCancel: () => void;
  onEdit: (note: PaperNote) => void;
  onDelete: (noteId: string) => void;
}) {
  return (
    <section className="mt-8 rounded-sm border border-[#e8e1d5] bg-[#fffdf8] p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-[11px] uppercase tracking-[0.2em] text-[#8b7355]" style={{ fontFamily: "var(--font-cormorant), serif" }}>
            Reading Notes
          </p>
          <h3 className="mt-1 text-xl font-semibold text-[#2d2a26]" style={{ fontFamily: "var(--font-cormorant), serif" }}>
            阅读笔记与证据卡片
          </h3>
          <p className="mt-2 max-w-2xl text-sm leading-7 text-[#8b7b6b]">
            把精读时确认过的观点、方法、局限和摘录沉淀下来，后续可作为学术对话和论文写作的内部依据。
          </p>
        </div>
        {editingNoteId ? (
          <button
            type="button"
            onClick={onCancel}
            className="rounded-full border border-[#d8cdbc] px-5 py-2.5 text-sm text-[#5a5046] transition-colors hover:bg-[#fbf7ef]"
          >
            取消编辑
          </button>
        ) : null}
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-2">
        <label className="block text-sm text-[#5a5046]">
          <span className="text-xs font-medium text-[#8b7355]">类型</span>
          <select
            value={form.note_type}
            onChange={(event) => onFormChange({ ...form, note_type: event.target.value as PaperNoteType })}
            className="mt-2 w-full rounded-sm border border-[#e1d7c8] bg-white px-3 py-2.5 text-sm outline-none focus:border-[#8b7355]"
          >
            {NOTE_TYPE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <label className="block text-sm text-[#5a5046]">
          <span className="text-xs font-medium text-[#8b7355]">标题</span>
          <input
            value={form.title}
            onChange={(event) => onFormChange({ ...form, title: event.target.value })}
            placeholder="例如：生成式 AI 对写作信心的影响"
            className="mt-2 w-full rounded-sm border border-[#e1d7c8] bg-white px-3 py-2.5 text-sm outline-none focus:border-[#8b7355]"
          />
        </label>

        <label className="block text-sm text-[#5a5046] md:col-span-2">
          <span className="text-xs font-medium text-[#8b7355]">笔记内容</span>
          <textarea
            value={form.content}
            onChange={(event) => onFormChange({ ...form, content: event.target.value })}
            placeholder="记录你已经核验过的观点、方法、局限或启发。"
            rows={4}
            className="mt-2 w-full rounded-sm border border-[#e1d7c8] bg-white px-3 py-2.5 text-sm leading-7 outline-none focus:border-[#8b7355]"
          />
        </label>

        <label className="block text-sm text-[#5a5046] md:col-span-2">
          <span className="text-xs font-medium text-[#8b7355]">证据摘录</span>
          <textarea
            value={form.evidence_text}
            onChange={(event) => onFormChange({ ...form, evidence_text: event.target.value })}
            placeholder="可选：粘贴摘要中的原文依据或你确认过的关键片段。"
            rows={3}
            className="mt-2 w-full rounded-sm border border-[#e1d7c8] bg-white px-3 py-2.5 text-sm leading-7 outline-none focus:border-[#8b7355]"
          />
        </label>

        <label className="block text-sm text-[#5a5046]">
          <span className="text-xs font-medium text-[#8b7355]">证据等级</span>
          <input
            value={form.evidence_level}
            onChange={(event) => onFormChange({ ...form, evidence_level: event.target.value })}
            placeholder="例如：摘要级证据"
            className="mt-2 w-full rounded-sm border border-[#e1d7c8] bg-white px-3 py-2.5 text-sm outline-none focus:border-[#8b7355]"
          />
        </label>

        <label className="block text-sm text-[#5a5046]">
          <span className="text-xs font-medium text-[#8b7355]">可信度</span>
          <input
            type="number"
            min={0}
            max={100}
            value={form.confidence}
            onChange={(event) => onFormChange({ ...form, confidence: event.target.value })}
            placeholder="0-100"
            className="mt-2 w-full rounded-sm border border-[#e1d7c8] bg-white px-3 py-2.5 text-sm outline-none focus:border-[#8b7355]"
          />
        </label>

        <label className="block text-sm text-[#5a5046] md:col-span-2">
          <span className="text-xs font-medium text-[#8b7355]">标签</span>
          <input
            value={form.tagsText}
            onChange={(event) => onFormChange({ ...form, tagsText: event.target.value })}
            placeholder="用逗号分隔，例如：AI，论文写作，学术诚信"
            className="mt-2 w-full rounded-sm border border-[#e1d7c8] bg-white px-3 py-2.5 text-sm outline-none focus:border-[#8b7355]"
          />
        </label>
      </div>

      {error ? (
        <div className="mt-4 rounded-sm border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      <div className="mt-5 flex flex-wrap gap-3">
        <button
          type="button"
          onClick={onSave}
          disabled={saving}
          className="rounded-full bg-[#2d2a26] px-5 py-2.5 text-sm text-white transition-colors hover:bg-[#1a1815] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {saving ? "保存中..." : editingNoteId ? "保存修改" : "保存阅读笔记"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-full border border-[#d8cdbc] px-5 py-2.5 text-sm text-[#5a5046] transition-colors hover:bg-[#fbf7ef]"
        >
          清空表单
        </button>
      </div>

      <div className="mt-7 space-y-4">
        {loading ? (
          <div className="rounded-sm border border-dashed border-[#d9d0c0] bg-[#fbf7ef] p-5 text-sm text-[#8b7b6b]">
            正在加载阅读笔记...
          </div>
        ) : notes.length === 0 ? (
          <div className="rounded-sm border border-dashed border-[#d9d0c0] bg-[#fbf7ef] p-5 text-sm leading-7 text-[#8b7b6b]">
            暂无阅读笔记。可以先保存一条摘要笔记，后续学术对话和论文写作就有内部依据可用。
          </div>
        ) : (
          notes.map((note) => (
            <NoteCard key={note.id} note={note} onEdit={onEdit} onDelete={onDelete} />
          ))
        )}
      </div>
    </section>
  );
}

function NoteCard({
  note,
  onEdit,
  onDelete,
}: {
  note: PaperNote;
  onEdit: (note: PaperNote) => void;
  onDelete: (noteId: string) => void;
}) {
  const typeLabel = NOTE_TYPE_OPTIONS.find((item) => item.value === note.note_type)?.label || note.note_type;
  return (
    <div className="rounded-sm border border-[#e8e1d5] bg-white p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-[#f3efe6] px-3 py-1 text-xs font-medium text-[#8b7355]">{typeLabel}</span>
            {note.evidence_level ? (
              <span className="rounded-full bg-[#edf7ee] px-3 py-1 text-xs font-medium text-[#3d6b42]">{note.evidence_level}</span>
            ) : null}
            {note.confidence !== null && note.confidence !== undefined ? (
              <span className="rounded-full bg-[#eef3f7] px-3 py-1 text-xs font-medium text-[#3d5b6b]">可信度 {note.confidence}</span>
            ) : null}
          </div>
          <h4 className="mt-3 text-lg font-semibold text-[#2d2a26]" style={{ fontFamily: "var(--font-cormorant), serif" }}>
            {note.title}
          </h4>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={() => onEdit(note)} className="text-xs font-medium text-[#8b7355] hover:text-[#2d2a26]">
            编辑
          </button>
          <button type="button" onClick={() => onDelete(note.id)} className="text-xs font-medium text-red-600 hover:text-red-800">
            删除
          </button>
        </div>
      </div>
      <p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-[#4f4438]">{note.content}</p>
      {note.evidence_text ? (
        <blockquote className="mt-4 border-l-2 border-[#c9b99f] bg-[#fcfaf6] px-4 py-3 text-sm leading-7 text-[#6f604f]">
          {note.evidence_text}
        </blockquote>
      ) : null}
      {note.tags && note.tags.length > 0 ? (
        <div className="mt-4 flex flex-wrap gap-2">
          {note.tags.map((tag) => (
            <span key={tag} className="rounded-full border border-[#e8e1d5] px-2.5 py-1 text-xs text-[#8b7b6b]">
              #{tag}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[11px] uppercase tracking-[0.18em] text-[#b8a898]">{label}</dt>
      <dd className="mt-1 break-words text-[#3d352d]">{value}</dd>
    </div>
  );
}

function InsightCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-sm border border-[#e8e1d5] bg-[#faf7f2] p-4">
      <p className="text-[10px] uppercase tracking-[0.18em] text-[#b8a898]">{label}</p>
      <p className="mt-2 text-sm font-medium text-[#2d2a26]">{value}</p>
    </div>
  );
}

function AnalysisPanel({
  analysis,
  loading,
  error,
  savingNoteKey,
  onAnalyze,
  onSaveNote,
}: {
  analysis: PaperAnalysisResult | null;
  loading: boolean;
  error: string | null;
  savingNoteKey: string | null;
  onAnalyze: () => void;
  onSaveNote: (noteType: PaperNoteType, title: string, content: string) => void;
}) {
  return (
    <section className="mt-8 rounded-sm border border-[#e8e1d5] bg-[#fffdf8] p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-[11px] uppercase tracking-[0.2em] text-[#8b7355]" style={{ fontFamily: "var(--font-cormorant), serif" }}>
            Structured Analysis
          </p>
          <h3 className="mt-1 text-xl font-semibold text-[#2d2a26]" style={{ fontFamily: "var(--font-cormorant), serif" }}>
            单篇文献结构化分析
          </h3>
          <p className="mt-2 max-w-2xl text-sm leading-7 text-[#8b7b6b]">
            分析只基于当前文献已保存的题名、摘要和元数据。证据不足时会明确提示，不会补写样本量、实验数据或结论。
          </p>
        </div>
        <button
          type="button"
          onClick={onAnalyze}
          disabled={loading}
          className="rounded-full bg-[#2d2a26] px-5 py-2.5 text-sm text-white transition-colors hover:bg-[#1a1815] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loading ? "分析中..." : analysis ? "重新分析" : "分析这篇文献"}
        </button>
      </div>

      {error ? (
        <div className="mt-5 rounded-sm border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      {analysis ? (
        <div className="mt-6 space-y-5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-[#f3efe6] px-3 py-1 text-xs font-medium text-[#8b7355]">
              {analysis.evidence_level}
            </span>
            {analysis.warnings.length === 0 ? (
              <span className="rounded-full bg-[#edf7ee] px-3 py-1 text-xs font-medium text-[#3d6b42]">
                暂无风险提示
              </span>
            ) : null}
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <AnalysisItem label="研究问题" value={analysis.research_question} />
            <AnalysisItem label="研究方法" value={analysis.method} />
            <AnalysisItem label="样本/数据" value={analysis.sample_or_data} />
            <AnalysisItem label="主要发现" value={analysis.key_findings} />
            <AnalysisItem label="局限与风险" value={analysis.limitations} />
            <AnalysisItem label="与项目相关性" value={analysis.relevance_to_project} />
          </div>

          <div className="rounded-sm border border-[#eadfcd] bg-[#fbf7ef] p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#8b7355]">Save as Evidence</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <AnalysisSaveButton
                label="保存主要发现"
                saving={savingNoteKey === "finding-主要发现"}
                onClick={() => onSaveNote("finding", "主要发现", analysis.key_findings)}
              />
              <AnalysisSaveButton
                label="保存研究方法"
                saving={savingNoteKey === "method-研究方法"}
                onClick={() => onSaveNote("method", "研究方法", analysis.method)}
              />
              <AnalysisSaveButton
                label="保存局限风险"
                saving={savingNoteKey === "limitation-局限与风险"}
                onClick={() => onSaveNote("limitation", "局限与风险", analysis.limitations)}
              />
            </div>
          </div>

          {analysis.warnings.length > 0 ? (
            <div className="rounded-sm border border-[#eadfcd] bg-[#fbf7ef] p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#8b7355]">Warnings</p>
              <ul className="mt-3 space-y-2 text-sm leading-6 text-[#7a5f3c]">
                {analysis.warnings.map((warning) => (
                  <li key={warning}>· {warning}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : (
        <div className="mt-6 rounded-sm border border-dashed border-[#d9d0c0] bg-[#fbf7ef] p-5 text-sm leading-7 text-[#8b7b6b]">
          点击“分析这篇文献”后，会生成研究问题、方法、样本/数据、主要发现、局限和项目相关性六个字段。
        </div>
      )}
    </section>
  );
}

function AnalysisSaveButton({
  label,
  saving,
  onClick,
}: {
  label: string;
  saving: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={saving}
      className="rounded-full border border-[#d8cdbc] bg-white px-4 py-2 text-xs font-medium text-[#5a5046] transition-colors hover:bg-[#f3efe6] disabled:cursor-not-allowed disabled:opacity-60"
    >
      {saving ? "保存中..." : label}
    </button>
  );
}

function AnalysisItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-sm border border-[#f0e8dc] bg-[#fcfaf6] p-4">
      <p className="text-[10px] uppercase tracking-[0.18em] text-[#b8a898]">{label}</p>
      <p className="mt-2 text-sm leading-7 text-[#4f4438]">{value}</p>
    </div>
  );
}

function CenteredState({
  title,
  description,
  actionLabel,
  onAction,
}: {
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#faf7f2] px-6">
      <div className="max-w-md rounded-sm border border-[#e8e1d5] bg-white p-8 text-center shadow-sm">
        <h1 className="text-2xl font-semibold text-[#2d2a26]" style={{ fontFamily: "var(--font-cormorant), serif" }}>
          {title}
        </h1>
        <p className="mt-4 text-sm leading-7 text-[#8b7b6b]">{description}</p>
        {actionLabel && onAction ? (
          <button
            type="button"
            onClick={onAction}
            className="mt-6 rounded-full bg-[#2d2a26] px-5 py-2.5 text-sm text-white transition-colors hover:bg-[#1a1815]"
          >
            {actionLabel}
          </button>
        ) : null}
      </div>
    </div>
  );
}

function sourceLabel(source: string | null) {
  return source ? SOURCE_LABEL[source] || source : "未知来源";
}

function formatAuthors(authors: string | null | undefined) {
  if (!authors) return "未知作者";
  return authors.split(";").filter(Boolean).join("、") || "未知作者";
}

function buildEvidenceWarnings(paper: SavedPaper | null) {
  if (!paper) return ["暂无文献记录。"];
  const warnings = [];
  if (!paper.abstract) warnings.push("摘要缺失：暂不适合做强结论式 AI 分析。");
  if (!paper.doi) warnings.push("DOI 缺失：引用前建议打开来源链接核验。");
  if (!paper.url) warnings.push("来源链接缺失：需要人工补充来源后再做精读。");
  if (warnings.length === 0) warnings.push("基础元数据较完整，可以进入下一步结构化分析。");
  return warnings;
}

function splitTags(value: string) {
  return value
    .split(/[，,]/)
    .map((item) => item.trim())
    .filter(Boolean);
}
