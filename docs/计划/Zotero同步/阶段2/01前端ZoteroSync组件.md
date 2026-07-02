# 闃舵2-01锛氬墠绔?ZoteroSync 缁勪欢

## 4.1 绫诲瀷瀹氫箟

淇敼 `frontend/src/lib/types.ts`锛屾柊澧烇細

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

## 4.2 API 鍑芥暟

淇敼 `frontend/src/lib/api.ts`锛屾柊澧烇細

```typescript
/** 杩炴帴 Zotero 璐︽埛 */
export function connectZotero(params: {
  project_id: string;
  api_key: string;
  library_type: string;
  library_id: string;
}) {
  return post("/api/zotero/connect", params);
}

/** 鑾峰彇 Zotero 闆嗗悎鍒楄〃 */
export async function getZoteroCollections(projectId: string) {
  const res = await fetch(`${BASE_URL}/api/zotero/${projectId}/collections`);
  if (!res.ok) throw new Error("鑾峰彇闆嗗悎鍒楄〃澶辫触");
  return res.json() as Promise<ZoteroCollection[]>;
}

/** 鍚屾 Zotero 鏂囩尞 */
export function syncZotero(params: {
  project_id: string;
  collection_keys: string[];
}) {
  return post<ZoteroImportResult>("/api/zotero/sync", params);
}

/** 鑾峰彇鍚屾鐘舵€?*/
export async function getZoteroStatus(projectId: string) {
  const res = await fetch(`${BASE_URL}/api/zotero/${projectId}/status`);
  if (!res.ok) return null;
  return res.json() as Promise<ZoteroSyncInfo>;
}

/** 鏂紑 Zotero 杩炴帴 */
export async function disconnectZotero(projectId: string) {
  const res = await fetch(`${BASE_URL}/api/zotero/${projectId}/disconnect`, { method: "DELETE" });
  if (!res.ok) throw new Error("鏂紑杩炴帴澶辫触");
}
```

## 4.3 ZoteroSync 缁勪欢

鏂板缓 `frontend/src/components/ZoteroSync.tsx`銆?
### 鐘舵€佹満

```
鏈繛鎺?鈫?杈撳叆 API Key 鈫?楠岃瘉 鈫?宸茶繛鎺?                                鈫?                          娴忚闆嗗悎 鈫?閫夋嫨闆嗗悎 鈫?瀵煎叆
                                鈫?                          鏌ョ湅瀵煎叆缁撴灉
```

### UI 缁撴瀯

```
鈹屸攢鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹?鈹? Zotero 鏂囩尞鍚屾                     鈹?鈹?                                    鈹?鈹? [鏈繛鎺ョ姸鎬乚                        鈹?鈹? 鈹屸攢 Zotero 杩炴帴璁剧疆 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹?鈹?鈹? 鈹?API Key:   [________________]   鈹?鈹?鈹? 鈹?搴撶被鍨?    [鐢ㄦ埛搴?鈻綸            鈹?鈹?鈹? 鈹?鐢ㄦ埛/缇ょ粍ID: [________________]  鈹?鈹?鈹? 鈹?[杩炴帴骞堕獙璇乚                     鈹?鈹?鈹? 鈹斺攢鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹?鈹?鈹?                                    鈹?鈹? [宸茶繛鎺ョ姸鎬乚                        鈹?鈹? 鈹屸攢 杩炴帴淇℃伅 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹?鈹?鈹? 鈹?鉁?宸茶繛鎺?Zotero 鐢ㄦ埛搴?         鈹?鈹?鈹? 鈹?涓婃鍚屾: 2026-05-30 14:00      鈹?鈹?鈹? 鈹?[鏂紑杩炴帴]                       鈹?鈹?鈹? 鈹斺攢鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹?鈹?鈹?                                    鈹?鈹? 鈹屸攢 閫夋嫨闆嗗悎 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹?鈹?鈹? 鈹?鈽?鏈哄櫒瀛︿範 (42)                 鈹?鈹?鈹? 鈹?  鈽?NLP (18)                   鈹?鈹?鈹? 鈹?  鈽?璁＄畻鏈鸿瑙?(15)             鈹?鈹?鈹? 鈹?鈽?缁熻鏂规硶 (8)                 鈹?鈹?鈹? 鈹?                                鈹?鈹?鈹? 鈹?[寮€濮嬪鍏                       鈹?鈹?鈹? 鈹斺攢鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹?鈹?鈹?                                    鈹?鈹? [瀵煎叆缁撴灉]                          鈹?鈹? 鉁?瀵煎叆瀹屾垚锛氭柊澧?23 绡囷紝鏇存柊 3 绡?  鈹?鈹斺攢鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹?```

### 瀹炵幇瑕佺偣

- 浣跨敤 React state 绠＄悊杩炴帴鐘舵€併€侀泦鍚堝垪琛ㄣ€侀€変腑闆嗗悎
- API Key 杈撳叆妗嗕娇鐢?`type="password"` 淇濇姢闅愮
- 杩炴帴楠岃瘉鎴愬姛鍚庤嚜鍔ㄦ媺鍙栭泦鍚堝垪琛?- 闆嗗悎鏍戦€掑綊娓叉煋锛堟敮鎸佺埗瀛愬眰绾э級
- 瀵煎叆鏃舵樉绀鸿繘搴︽寚绀哄櫒
- 瀵煎叆瀹屾垚鍚庢樉绀虹粨鏋滄憳瑕?
## 4.4 闆嗘垚鍏ュ彛

淇敼 `frontend/src/app/projects/[id]/page.tsx`锛?- 鍦ㄣ€屾枃鐚绱€嶇幆鑺傛梺杈规坊鍔犮€孼otero 瀵煎叆銆嶅叆鍙ｆ寜閽?- 鎴栧湪鐭ヨ瘑鍥捐氨椤甸潰娣诲姞鏁版嵁婧愬垏鎹?
鏇磋嚜鐒剁殑鍋氭硶锛氬湪鏂囩尞妫€绱㈢粨鏋滃尯鍩熶笂鏂规坊鍔犱竴涓€屼粠 Zotero 瀵煎叆銆嶆爣绛?鎸夐挳锛屼笌鎵嬪姩妫€绱㈠舰鎴愪簰琛ョ殑鏁版嵁鏉ユ簮銆?
## 4.5 楠岃瘉

- 杩炴帴 Zotero锛氳緭鍏ユ湁鏁?API Key 鈫?鏄剧ず杩炴帴鎴愬姛 + 闆嗗悎鍒楄〃
- 瀵煎叆鏂囩尞锛氶€夋嫨闆嗗悎 鈫?鐐瑰嚮瀵煎叆 鈫?鏄剧ず缁撴灉鎽樿
- 閿欒澶勭悊锛氭棤鏁?API Key 鈫?鏄剧ず閿欒鎻愮ず
- 瀵煎叆鐨勬枃鐚嚭鐜板湪鏂囩尞鍒楄〃涓紝鐭ヨ瘑鍥捐氨鍙甯稿睍绀?
