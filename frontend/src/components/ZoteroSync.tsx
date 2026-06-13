"use client";

import React, { useState, useEffect, useCallback } from "react";
import * as api from "../lib/api";
import type { ZoteroCollection, ZoteroSyncInfo, ZoteroImportResult, ZoteroConnectInfo } from "../lib/types";

interface Props {
  projectId: string;
  onImportComplete?: () => void;
}

type Phase = "connect" | "collections" | "syncing" | "result";

export default function ZoteroSync({ projectId, onImportComplete }: Props) {
  // 连接表单
  const [apiKey, setApiKey] = useState("");
  const [libraryType, setLibraryType] = useState("user");
  const [libraryId, setLibraryId] = useState("");

  // 状态
  const [phase, setPhase] = useState<Phase>("connect");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [connectInfo, setConnectInfo] = useState<ZoteroConnectInfo | null>(null);
  const [syncStatus, setSyncStatus] = useState<ZoteroSyncInfo | null>(null);

  // 集合
  const [collections, setCollections] = useState<ZoteroCollection[]>([]);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());

  // 导入结果
  const [importResult, setImportResult] = useState<ZoteroImportResult | null>(null);

  // 页面加载时检查是否已连接
  useEffect(() => {
    (async () => {
      try {
        const status = await api.getZoteroStatus(projectId);
        if (status && status.sync_status !== "error") {
          setSyncStatus(status);
          setConnectInfo({
            connected: true,
            user_id: status.library_id,
            username: "",
            display_name: "",
            library_type: status.library_type,
            library_id: status.library_id,
          });
          setPhase("collections");
          loadCollections();
        }
      } catch {
        // 未连接，保持 connect 状态
      }
    })();
  }, [projectId]);

  const loadCollections = async () => {
    setLoading(true);
    setError(null);
    try {
      const cols = await api.getZoteroCollections(projectId);
      setCollections(cols);
      // 已同步的集合默认选中
      if (syncStatus?.synced_collections) {
        setSelectedKeys(new Set(syncStatus.synced_collections));
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "获取集合列表失败");
    } finally {
      setLoading(false);
    }
  };

  const handleConnect = async () => {
    if (!apiKey.trim() || !libraryId.trim()) {
      setError("请填写 API Key 和用户/群组 ID");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const info = await api.connectZotero({
        project_id: projectId,
        api_key: apiKey.trim(),
        library_type: libraryType,
        library_id: libraryId.trim(),
      });
      setConnectInfo(info);
      setPhase("collections");
      await loadCollections();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "连接失败");
    } finally {
      setLoading(false);
    }
  };

  const toggleCollection = (key: string) => {
    const next = new Set(selectedKeys);
    if (next.has(key)) {
      next.delete(key);
    } else {
      next.add(key);
    }
    setSelectedKeys(next);
  };

  const selectAll = () => {
    if (selectedKeys.size === collections.length) {
      setSelectedKeys(new Set());
    } else {
      setSelectedKeys(new Set(collections.map((c) => c.key)));
    }
  };

  const handleSync = async () => {
    setPhase("syncing");
    setError(null);
    try {
      const result = await api.syncZotero({
        project_id: projectId,
        collection_keys: Array.from(selectedKeys),
      });
      setImportResult(result);
      setPhase("result");
      onImportComplete?.();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "同步失败");
      setPhase("collections");
    }
  };

  const handleDisconnect = async () => {
    try {
      await api.disconnectZotero(projectId);
      setPhase("connect");
      setConnectInfo(null);
      setSyncStatus(null);
      setCollections([]);
      setSelectedKeys(new Set());
      setImportResult(null);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "断开连接失败");
    }
  };

  // 构建集合树结构
  const rootCollections = collections.filter((c) => !c.parent_key);
  const getChildren = (parentKey: string) => collections.filter((c) => c.parent_key === parentKey);

  const renderCollectionTree = (items: ZoteroCollection[], depth: number = 0) => {
    return items.map((col) => {
      const children = getChildren(col.key);
      return (
        <div key={col.key}>
          <label
            className={`flex items-center gap-2 py-1.5 px-2 rounded hover:bg-gray-50 cursor-pointer ${
              depth > 0 ? "ml-5" : ""
            }`}
          >
            <input
              type="checkbox"
              checked={selectedKeys.has(col.key)}
              onChange={() => toggleCollection(col.key)}
              className="w-4 h-4 text-blue-600 border-gray-300 rounded"
            />
            <span className="text-sm text-gray-700">{col.name}</span>
            <span className="text-xs text-gray-400">({col.item_count})</span>
          </label>
          {children.length > 0 && renderCollectionTree(children, depth + 1)}
        </div>
      );
    });
  };

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-800">Zotero 文献同步</h3>
        {connectInfo && (
          <button
            onClick={handleDisconnect}
            className="text-xs text-red-500 hover:text-red-700"
          >
            断开连接
          </button>
        )}
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4 text-sm text-red-600">
          {error}
          <button onClick={() => setError(null)} className="ml-2 text-red-400 hover:text-red-600">&times;</button>
        </div>
      )}

      {/* 阶段 1：连接 Zotero */}
      {phase === "connect" && (
        <div className="space-y-4">
          <p className="text-sm text-gray-500">
            输入 Zotero API Key 连接文献库。在
            <a href="https://www.zotero.org/settings/keys" target="_blank" rel="noopener noreferrer"
               className="text-blue-600 hover:underline mx-1">zotero.org/settings/keys</a>
            创建 Key。
          </p>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">API Key</label>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="输入 Zotero API Key"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">库类型</label>
              <select
                value={libraryType}
                onChange={(e) => setLibraryType(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
              >
                <option value="user">用户库</option>
                <option value="group">群组库</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">用户/群组 ID</label>
              <input
                type="text"
                value={libraryId}
                onChange={(e) => setLibraryId(e.target.value)}
                placeholder="数字 ID"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
          </div>
          <button
            onClick={handleConnect}
            disabled={loading}
            className="w-full py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {loading ? "验证中..." : "连接并验证"}
          </button>
        </div>
      )}

      {/* 阶段 2：浏览集合 */}
      {phase === "collections" && (
        <div className="space-y-4">
          {connectInfo && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-sm text-green-700">
              已连接 Zotero {connectInfo.library_type === "user" ? "用户库" : "群组库"}
              {connectInfo.display_name ? ` (${connectInfo.display_name})` : ""}
              {syncStatus?.last_sync_at && (
                <span className="ml-2 text-green-500">
                  | 上次同步: {new Date(syncStatus.last_sync_at).toLocaleString("zh-CN")}
                </span>
              )}
            </div>
          )}

          {loading ? (
            <div className="text-center text-gray-400 py-4 animate-pulse">加载集合列表中...</div>
          ) : collections.length === 0 ? (
            <div className="text-center text-gray-400 py-4">
              未找到任何集合。可以直接导入全部文献（包括不属任何集合的条目）。
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-gray-500">
                  已选 {selectedKeys.size} / {collections.length} 个集合
                </span>
                <button onClick={selectAll} className="text-xs text-blue-600 hover:underline">
                  {selectedKeys.size === collections.length ? "取消全选" : "全选"}
                </button>
              </div>
              <div className="border border-gray-200 rounded-lg p-3 max-h-64 overflow-y-auto">
                {renderCollectionTree(rootCollections)}
              </div>
            </>
          )}

          <button
            onClick={handleSync}
            disabled={loading}
            className="w-full py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {selectedKeys.size > 0 ? "导入选中集合" : "导入全部文献"}
          </button>
        </div>
      )}

      {/* 阶段 3：同步中 */}
      {phase === "syncing" && (
        <div className="text-center py-8">
          <div className="animate-pulse text-gray-400 mb-2">正在从 Zotero 导入文献...</div>
          <div className="text-xs text-gray-300">这可能需要几分钟，取决于集合大小</div>
        </div>
      )}

      {/* 阶段 4：导入结果 */}
      {phase === "result" && importResult && (
        <div className="space-y-4">
          <div className="bg-green-50 border border-green-200 rounded-lg p-4">
            <div className="text-green-700 font-semibold mb-2">导入完成</div>
            <div className="grid grid-cols-3 gap-3 text-center">
              <div>
                <div className="text-2xl font-bold text-green-700">{importResult.imported}</div>
                <div className="text-xs text-green-500">新增</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-blue-700">{importResult.updated}</div>
                <div className="text-xs text-blue-500">更新</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-gray-500">{importResult.skipped}</div>
                <div className="text-xs text-gray-400">跳过</div>
              </div>
            </div>
          </div>

          {importResult.errors.length > 0 && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
              <div className="text-sm text-yellow-700 font-medium mb-1">
                跳过 {importResult.errors.length} 条
              </div>
              <div className="text-xs text-yellow-600 max-h-32 overflow-y-auto">
                {importResult.errors.map((e, i) => (
                  <div key={i}>  {e}</div>
                ))}
              </div>
            </div>
          )}

          <div className="flex gap-3">
            <button
              onClick={() => { setPhase("collections"); loadCollections(); }}
              className="flex-1 py-2 bg-gray-100 text-gray-600 rounded-lg text-sm font-medium hover:bg-gray-200 transition-colors"
            >
              继续导入
            </button>
            <button
              onClick={() => onImportComplete?.()}
              className="flex-1 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
            >
              完成
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
