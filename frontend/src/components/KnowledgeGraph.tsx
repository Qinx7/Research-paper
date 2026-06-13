"use client";

import React, { useState, useEffect, useCallback } from "react";
import ReactECharts from "echarts-for-react";
import * as api from "../lib/api";
import type { KnowledgeGraphData } from "../lib/types";

const VIEWS = [
  { key: "network", label: "关系网络" },
  { key: "timeline", label: "时间演进" },
  { key: "clusters", label: "主题聚类" },
  { key: "impact", label: "引用影响" },
] as const;

interface Props {
  projectId: string;
}

export default function KnowledgeGraph({ projectId }: Props) {
  const [data, setData] = useState<KnowledgeGraphData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeView, setActiveView] = useState<string>("network");

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await api.getKnowledgeGraph(projectId);
      setData(result);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "图谱数据加载失败");
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  if (loading) {
    return (
      <div className="bg-white border border-gray-200 rounded-xl p-8 text-center text-gray-400">
        <div className="animate-pulse">加载知识图谱中...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-center">
        <p className="text-red-600 text-sm mb-2">{error}</p>
        <button onClick={loadData} className="text-sm text-blue-600 hover:underline">
          重试
        </button>
      </div>
    );
  }

  if (!data || data.stats.total_papers === 0) {
    return (
      <div className="bg-white border border-gray-200 rounded-xl p-8 text-center text-gray-400">
        暂无文献数据，请先检索文献。
      </div>
    );
  }

  const { stats } = data;

  return (
    <div className="space-y-4">
      {/* 统计摘要 */}
      <div className="grid grid-cols-4 gap-3">
        <div className="bg-blue-50 rounded-lg px-4 py-3 text-center">
          <div className="text-2xl font-bold text-blue-700">{stats.total_papers}</div>
          <div className="text-xs text-blue-500">收录论文</div>
        </div>
        <div className="bg-green-50 rounded-lg px-4 py-3 text-center">
          <div className="text-2xl font-bold text-green-700">{stats.total_citations}</div>
          <div className="text-xs text-green-500">总引用次数</div>
        </div>
        <div className="bg-orange-50 rounded-lg px-4 py-3 text-center">
          <div className="text-2xl font-bold text-orange-700">{stats.keywords_count}</div>
          <div className="text-xs text-orange-500">提取关键词</div>
        </div>
        <div className="bg-purple-50 rounded-lg px-4 py-3 text-center">
          <div className="text-2xl font-bold text-purple-700">
            {stats.year_range[0]} - {stats.year_range[1]}
          </div>
          <div className="text-xs text-purple-500">年份跨度</div>
        </div>
      </div>

      {/* 视图切换 */}
      <div className="flex gap-1 bg-gray-100 rounded-lg p-1 w-fit">
        {VIEWS.map((v) => (
          <button
            key={v.key}
            onClick={() => setActiveView(v.key)}
            className={`px-4 py-1.5 text-sm rounded-md transition-colors ${
              activeView === v.key
                ? "bg-white text-blue-700 shadow-sm font-medium"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            {v.label}
          </button>
        ))}
      </div>

      {/* 图表区域 */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden" style={{ minHeight: 480 }}>
        {activeView === "network" && <NetworkChart data={data.network} />}
        {activeView === "timeline" && <TimelineChart data={data.timeline} />}
        {activeView === "clusters" && <ClusterChart data={data.clusters} />}
        {activeView === "impact" && <ImpactChart data={data.impact} />}
      </div>
    </div>
  );
}

// ========== 关系网络 ==========

function NetworkChart({ data }: { data: KnowledgeGraphData["network"] }) {
  if (!data.nodes.length) {
    return <EmptyPlaceholder text="暂无图谱数据" />;
  }

  const option = {
    tooltip: {
      formatter: (params: { dataType?: string; data?: { name?: string; type?: string; citations?: number; venue?: string; year?: number } }) => {
        if (params.dataType === "edge") return params.data?.name || "";
        const d = params.data;
        if (!d) return "";
        const parts = [`<b>${d.name}</b>`, `类型: ${d.type === "paper" ? "论文" : d.type === "keyword" ? "关键词" : "作者"}`];
        if (d.type === "paper" && d.citations !== undefined) parts.push(`引用: ${d.citations} 次`);
        if (d.venue) parts.push(`期刊: ${d.venue}`);
        if (d.year) parts.push(`年份: ${d.year}`);
        return parts.join("<br/>");
      },
    },
    legend: {
      data: data.categories.map((c) => c.name),
      top: 10,
      textStyle: { fontSize: 12 },
    },
    series: [
      {
        type: "graph",
        layout: "force",
        roam: true,
        draggable: true,
        categories: data.categories,
        nodes: data.nodes,
        edges: data.edges.map((e) => ({ ...e, lineStyle: { opacity: 0.3, curveness: 0.2 } })),
        force: {
          repulsion: 300,
          edgeLength: [100, 250],
          gravity: 0.1,
        },
        label: {
          show: true,
          fontSize: 10,
          formatter: (p: { data: { name: string } }) =>
            p.data.name.length > 8 ? p.data.name.slice(0, 8) + "..." : p.data.name,
        },
        lineStyle: { opacity: 0.4, width: 1 },
        emphasis: {
          focus: "adjacency",
          lineStyle: { width: 2, opacity: 0.8 },
        },
      },
    ],
  };

  return <ReactECharts option={option} style={{ height: 500 }} notMerge />;
}

// ========== 时间演进 ==========

function TimelineChart({ data }: { data: KnowledgeGraphData["timeline"] }) {
  if (!data.series.length) {
    return <EmptyPlaceholder text="暂无时间线数据" />;
  }

  const option = {
    tooltip: {
      formatter: (params: { data?: { papers?: { name: string; citations: number; venue: string }[] } }) => {
        const d = params.data;
        if (!d?.papers) return "";
        return d.papers
          .map((p) => `<div style="margin:2px 0">• ${p.name.slice(0, 30)} <span style="color:#999">(${p.citations}次引用)</span></div>`)
          .join("");
      },
    },
    grid: { left: 60, right: 30, top: 30, bottom: 50 },
    xAxis: {
      type: "value",
      name: "年份",
      min: data.year_range[0] - 1,
      max: data.year_range[1] + 1,
      nameTextStyle: { fontSize: 12 },
    },
    yAxis: {
      type: "value",
      name: "论文数量",
      nameTextStyle: { fontSize: 12 },
    },
    series: [
      {
        type: "scatter",
        symbolSize: (val: number[]) => {
          // val is [year, count, ...]
          const year = val[0];
          const item = data.series.find((s) => s.year === year);
          if (!item || !item.papers.length) return 12;
          const maxCitations = Math.max(...item.papers.map((p) => p.citations || 0));
          return Math.max(8, Math.sqrt(maxCitations + 1) * 10);
        },
        data: data.series.map((s) => [s.year, s.count, ...s.papers.map((p) => p.value)]),
        itemStyle: { color: "#5470c6", opacity: 0.7 },
        emphasis: { itemStyle: { opacity: 1, borderColor: "#333", borderWidth: 1 } },
      },
    ],
  };

  return <ReactECharts option={option} style={{ height: 500 }} notMerge />;
}

// ========== 主题聚类（词云风格 —— 用 treemap） ==========

function ClusterChart({ data }: { data: KnowledgeGraphData["clusters"] }) {
  if (!data.clusters.length) {
    return <EmptyPlaceholder text="暂无聚类数据" />;
  }

  const option = {
    tooltip: {
      formatter: (params: { data?: { name?: string; value?: number; papers?: { name: string; citations: number }[] } }) => {
        const d = params.data;
        if (!d) return "";
        const parts = [`<b>${d.name}</b>`, `包含 ${d.value} 篇论文`];
        if (d.papers) {
          parts.push("", "相关论文：");
          d.papers.forEach((p) => parts.push(`• ${p.name.slice(0, 40)} (${p.citations}次引用)`));
        }
        return parts.join("<br/>");
      },
    },
    series: [
      {
        type: "treemap",
        roam: false,
        nodeClick: false,
        breadcrumb: { show: false },
        label: { show: true, fontSize: 13, formatter: "{b}" },
        data: data.clusters.map((c) => ({
          name: c.name,
          value: c.value,
          papers: c.papers,
        })),
        levels: [
          {
            itemStyle: {
              borderColor: "#fff",
              borderWidth: 2,
              gapWidth: 2,
            },
          },
        ],
      },
    ],
  };

  return <ReactECharts option={option} style={{ height: 500 }} notMerge />;
}

// ========== 引用影响 ==========

function ImpactChart({ data }: { data: KnowledgeGraphData["impact"] }) {
  if (!data.top_papers.length) {
    return <EmptyPlaceholder text="暂无引用数据" />;
  }

  // 期刊分布（饼图）
  const venuePie = {
    tooltip: { trigger: "item" as const, formatter: "{b}: {c} 篇 ({d}%)" },
    series: [
      {
        type: "pie",
        radius: ["40%", "65%"],
        center: ["22%", "50%"],
        label: { fontSize: 10, formatter: "{b}\n{d}%" },
        data: data.venue_distribution,
        emphasis: { label: { fontSize: 14, fontWeight: "bold" } },
      },
    ],
  };

  // 高引论文（横向柱状图）
  const barChart = {
    tooltip: {
      formatter: (params: { data?: { name?: string; citations?: number; authors?: string; year?: number } }) => {
        const d = params.data;
        if (!d) return "";
        return `<b>${d.name}</b><br/>引用: ${d.citations} 次<br/>作者: ${d.authors || "-"}<br/>年份: ${d.year || "-"}`;
      },
    },
    grid: { left: 10, right: 60, top: 10, bottom: 10, containLabel: true },
    xAxis: { type: "value" as const, name: "引用次数" },
    yAxis: {
      type: "category" as const,
      axisLabel: {
        fontSize: 10,
        width: 200,
        overflow: "truncate",
        formatter: (v: string) => (v.length > 25 ? v.slice(0, 25) + "..." : v),
      },
    },
    series: [
      {
        type: "bar",
        data: [...data.top_papers]
          .reverse()
          .map((p) => ({ name: p.name, value: p.citations, itemStyle: {}, authors: p.authors, year: p.year })),
        itemStyle: { color: "#5470c6", borderRadius: [0, 3, 3, 0] },
      },
    ],
  };

  return (
    <div style={{ display: "flex", height: 500 }}>
      <div style={{ width: "35%", minWidth: 280 }}>
        <ReactECharts option={venuePie} style={{ height: "100%" }} notMerge />
      </div>
      <div style={{ width: "65%" }}>
        <ReactECharts option={barChart} style={{ height: "100%" }} notMerge />
      </div>
    </div>
  );
}

// ========== 空占位 ==========

function EmptyPlaceholder({ text }: { text: string }) {
  return (
    <div className="flex items-center justify-center h-64 text-gray-400 text-sm">
      {text}
    </div>
  );
}
