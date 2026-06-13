# 阶段2-01：前端 ZoteroSync 组件

## 4.1 类型定义

修改 `frontend/src/lib/types.ts`，新增：

```typescript
export interface ZoteroCollection {
  key: string;
  name: string;
  parent_key: string | null;
  item_count: number;
}

export interface ZoteroSyncInfo {
  id: string;
  project_id: string;
  library_type: string;
  library_id: string;
  last_sync_version: number | null;
  sync_status: "idle" | "syncing" | "error";
  synced_collections: string[];
  last_sync_at: string | null;
  created_at: string;
}

export interface ZoteroImportResult {
  imported: number;
  updated: number;
  skipped: number;
  total: number;
  errors: string[];
}
```

## 4.2 API 函数

修改 `frontend/src/lib/api.ts`，新增：

```typescript
/** 连接 Zotero 账户 */
export function connectZotero(params: {
  project_id: string;
  api_key: string;
  library_type: string;
  library_id: string;
}) {
  return post("/api/zotero/connect", params);
}

/** 获取 Zotero 集合列表 */
export async function getZoteroCollections(projectId: string) {
  const res = await fetch(`${BASE_URL}/api/zotero/${projectId}/collections`);
  if (!res.ok) throw new Error("获取集合列表失败");
  return res.json() as Promise<ZoteroCollection[]>;
}

/** 同步 Zotero 文献 */
export function syncZotero(params: {
  project_id: string;
  collection_keys: string[];
}) {
  return post<ZoteroImportResult>("/api/zotero/sync", params);
}

/** 获取同步状态 */
export async function getZoteroStatus(projectId: string) {
  const res = await fetch(`${BASE_URL}/api/zotero/${projectId}/status`);
  if (!res.ok) return null;
  return res.json() as Promise<ZoteroSyncInfo>;
}

/** 断开 Zotero 连接 */
export async function disconnectZotero(projectId: string) {
  const res = await fetch(`${BASE_URL}/api/zotero/${projectId}/disconnect`, { method: "DELETE" });
  if (!res.ok) throw new Error("断开连接失败");
}
```

## 4.3 ZoteroSync 组件

新建 `frontend/src/components/ZoteroSync.tsx`。

### 状态机

```
未连接 → 输入 API Key → 验证 → 已连接
                                ↓
                          浏览集合 → 选择集合 → 导入
                                ↓
                          查看导入结果
```

### UI 结构

```
┌─────────────────────────────────────┐
│  Zotero 文献同步                     │
│                                     │
│  [未连接状态]                        │
│  ┌─ Zotero 连接设置 ───────────────┐ │
│  │ API Key:   [________________]   │ │
│  │ 库类型:    [用户库 ▾]            │ │
│  │ 用户/群组ID: [________________]  │ │
│  │ [连接并验证]                     │ │
│  └────────────────────────────────┘ │
│                                     │
│  [已连接状态]                        │
│  ┌─ 连接信息 ──────────────────────┐ │
│  │ ✓ 已连接 Zotero 用户库          │ │
│  │ 上次同步: 2026-05-30 14:00      │ │
│  │ [断开连接]                       │ │
│  └────────────────────────────────┘ │
│                                     │
│  ┌─ 选择集合 ──────────────────────┐ │
│  │ ☑ 机器学习 (42)                 │ │
│  │   ☑ NLP (18)                   │ │
│  │   ☐ 计算机视觉 (15)             │ │
│  │ ☐ 统计方法 (8)                 │ │
│  │                                 │ │
│  │ [开始导入]                       │ │
│  └────────────────────────────────┘ │
│                                     │
│  [导入结果]                          │
│  ✓ 导入完成：新增 23 篇，更新 3 篇   │
└─────────────────────────────────────┘
```

### 实现要点

- 使用 React state 管理连接状态、集合列表、选中集合
- API Key 输入框使用 `type="password"` 保护隐私
- 连接验证成功后自动拉取集合列表
- 集合树递归渲染（支持父子层级）
- 导入时显示进度指示器
- 导入完成后显示结果摘要

## 4.4 集成入口

修改 `frontend/src/app/projects/[id]/page.tsx`：
- 在「文献检索」环节旁边添加「Zotero 导入」入口按钮
- 或在知识图谱页面添加数据源切换

更自然的做法：在文献检索结果区域上方添加一个「从 Zotero 导入」标签/按钮，与手动检索形成互补的数据来源。

## 4.5 验证

- 连接 Zotero：输入有效 API Key → 显示连接成功 + 集合列表
- 导入文献：选择集合 → 点击导入 → 显示结果摘要
- 错误处理：无效 API Key → 显示错误提示
- 导入的文献出现在文献列表中，知识图谱可正常展示
