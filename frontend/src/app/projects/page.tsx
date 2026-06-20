/** 项目列表页：集中展示当前用户已有研究项目，并承接进入项目详情。 */
"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { deleteProject, listProjects } from "@/lib/api";
import { useAuth } from "@/lib/AuthContext";
import type { Project } from "@/lib/types";

export default function ProjectsPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [deletingProjectId, setDeletingProjectId] = useState<string | null>(null);
  const [confirmProjectId, setConfirmProjectId] = useState<string | null>(null);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    listProjects()
      .then(setProjects)
      .catch((err) => {
        setProjects([]);
        setError(err instanceof Error ? err.message : "项目列表加载失败");
      })
      .finally(() => setLoading(false));
  }, [authLoading, user]);

  const filteredProjects = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    if (!keyword) return projects;
    return projects.filter((project) =>
      [project.name, project.research_field, project.user_requirement, project.selected_topic]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(keyword),
    );
  }, [projects, query]);

  const handleDeleteProject = async (projectId: string) => {
    setDeletingProjectId(projectId);
    setError(null);
    try {
      await deleteProject(projectId);
      setProjects((items) => items.filter((item) => item.id !== projectId));
      setConfirmProjectId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "删除项目失败");
    } finally {
      setDeletingProjectId(null);
    }
  };

  if (authLoading || loading) {
    return <CenteredState title="正在加载项目..." description="正在读取你的研究项目列表。" />;
  }

  if (!user) {
    return (
      <CenteredState
        title="请先登录"
        description="项目列表需要读取你的研究项目与文献沉淀。"
        actionLabel="前往登录"
        onAction={() => router.push("/login")}
      />
    );
  }

  return (
    <main className="min-h-screen bg-[#fbfbfa] text-[#101318]">
      <header className="border-b border-[#e1e3e6] bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-5">
          <button
            type="button"
            onClick={() => router.push("/")}
            className="inline-flex items-center gap-2 rounded-2xl border border-[#dbe2e8] bg-white px-4 py-2.5 text-sm font-black text-[#26313b] transition-colors hover:bg-[#f7fafc]"
          >
            <IconArrowLeft />
            返回首页
          </button>
          <button
            type="button"
            onClick={() => router.push("/")}
            className="rounded-2xl bg-[#1592e6] px-4 py-2.5 text-sm font-black text-white shadow-[0_12px_26px_rgba(21,146,230,0.2)] transition-colors hover:bg-[#087bc8]"
          >
            新建文献搜索
          </button>
        </div>
      </header>

      <section className="mx-auto max-w-6xl px-6 py-10">
        <div className="mb-8 flex flex-col justify-between gap-5 md:flex-row md:items-end">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.18em] text-[#8a949e]">Projects</p>
            <h1 className="mt-2 text-4xl font-black tracking-[-0.04em] text-[#101318]">项目管理</h1>
            <p className="mt-3 max-w-2xl text-sm leading-7 text-[#66717d]">
              查看已保存的研究项目，继续进入文献库、论文工作流、知识图谱与 Zotero 导入。
            </p>
          </div>
          <div className="w-full rounded-2xl border border-[#dbe2e8] bg-white px-4 md:w-80">
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className="h-12 w-full bg-transparent text-sm outline-none placeholder:text-[#9da6af]"
              placeholder="搜索项目..."
            />
          </div>
        </div>

        {error ? (
          <div className="mb-6 rounded-2xl border border-[#f0b9b9] bg-[#fff0f0] px-5 py-4 text-sm font-bold text-[#9a2f2f]">
            {error}
          </div>
        ) : null}

        {filteredProjects.length ? (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {filteredProjects.map((project) => (
              <ProjectCard
                key={project.id}
                project={project}
                deleting={deletingProjectId === project.id}
                confirmDelete={confirmProjectId === project.id}
                onAskDelete={() => setConfirmProjectId((current) => current === project.id ? null : project.id)}
                onDelete={() => handleDeleteProject(project.id)}
                onOpen={() => router.push(`/projects/${project.id}`)}
              />
            ))}
          </div>
        ) : (
          <EmptyProjects hasQuery={Boolean(query.trim())} onHome={() => router.push("/")} />
        )}
      </section>
    </main>
  );
}

function ProjectCard({
  project,
  deleting,
  confirmDelete,
  onAskDelete,
  onDelete,
  onOpen,
}: {
  project: Project;
  deleting: boolean;
  confirmDelete: boolean;
  onAskDelete: () => void;
  onDelete: () => void;
  onOpen: () => void;
}) {
  return (
    <article className="flex min-h-[230px] flex-col rounded-[24px] border border-[#dfe5eb] bg-white p-5 shadow-[0_14px_34px_rgba(16,19,24,0.06)]">
      <div className="mb-4 flex items-start justify-between gap-3">
        <span className="rounded-full border border-[#cfe3f4] bg-[#edf7ff] px-3 py-1 text-xs font-black text-[#126fb0]">
          {project.research_field || "未设置领域"}
        </span>
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-[#9aa4ae]">{formatDate(project.updated_at || project.created_at)}</span>
          <button
            type="button"
            onClick={onAskDelete}
            className={`rounded-full border px-2 py-1 text-[10px] font-black transition-colors ${
              confirmDelete
                ? "border-[#f0b9b9] bg-[#fff0f0] text-[#9a2f2f]"
                : "border-[#dfe5eb] bg-white text-[#8a949e] hover:border-[#f0b9b9] hover:text-[#9a2f2f]"
            }`}
          >
            {confirmDelete ? "确认删除?" : "删除"}
          </button>
        </div>
      </div>
      <h2 className="line-clamp-2 text-xl font-black tracking-[-0.03em] text-[#17212b]">{project.name}</h2>
      <p className="mt-3 line-clamp-3 text-sm leading-7 text-[#66717d]">
        {project.selected_topic || project.user_requirement || "暂无项目描述。"}
      </p>
      <div className="mt-auto flex items-center justify-between pt-6">
        <span className="rounded-full bg-[#f4f6f8] px-3 py-1 text-xs font-bold text-[#7a8490]">{project.status || "active"}</span>
        <div className="flex items-center gap-2">
          {confirmDelete ? (
            <button
              type="button"
              onClick={onDelete}
              disabled={deleting}
              className="inline-flex items-center gap-2 rounded-2xl bg-[#9a2f2f] px-4 py-2 text-sm font-black text-white transition-colors hover:bg-[#7f2424] disabled:opacity-50"
            >
              {deleting ? "删除中..." : "确认删除"}
            </button>
          ) : null}
          <button
            type="button"
            onClick={onOpen}
            className="inline-flex items-center gap-2 rounded-2xl bg-[#101318] px-4 py-2 text-sm font-black text-white transition-colors hover:bg-[#26313b]"
          >
            进入项目
            <IconArrowRight />
          </button>
        </div>
      </div>
    </article>
  );
}

function EmptyProjects({ hasQuery, onHome }: { hasQuery: boolean; onHome: () => void }) {
  return (
    <div className="rounded-[28px] border border-dashed border-[#cfd7df] bg-white px-6 py-14 text-center">
      <h2 className="text-2xl font-black tracking-[-0.03em] text-[#17212b]">
        {hasQuery ? "没有匹配的项目" : "暂无研究项目"}
      </h2>
      <p className="mx-auto mt-3 max-w-md text-sm leading-7 text-[#66717d]">
        {hasQuery ? "换一个关键词再试试。" : "从首页发起文献搜索并保存文献或研究方向后，项目会出现在这里。"}
      </p>
      {!hasQuery ? (
        <button
          type="button"
          onClick={onHome}
          className="mt-6 rounded-2xl bg-[#1592e6] px-5 py-3 text-sm font-black text-white transition-colors hover:bg-[#087bc8]"
        >
          返回首页开始搜索
        </button>
      ) : null}
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
    <div className="flex min-h-screen items-center justify-center bg-[#fbfbfa] px-6 text-[#101318]">
      <div className="max-w-md rounded-[28px] border border-[#dfe5eb] bg-white p-8 text-center shadow-[0_14px_34px_rgba(16,19,24,0.06)]">
        <h1 className="text-2xl font-black tracking-[-0.03em]">{title}</h1>
        <p className="mt-3 text-sm leading-7 text-[#66717d]">{description}</p>
        {actionLabel && onAction ? (
          <button
            type="button"
            onClick={onAction}
            className="mt-6 rounded-2xl bg-[#101318] px-5 py-3 text-sm font-black text-white"
          >
            {actionLabel}
          </button>
        ) : null}
      </div>
    </div>
  );
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "最近更新";
  return date.toLocaleDateString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

function IconArrowLeft() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M19 12H5" />
      <path d="m12 19-7-7 7-7" />
    </svg>
  );
}

function IconArrowRight() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 12h14" />
      <path d="m12 5 7 7-7 7" />
    </svg>
  );
}
