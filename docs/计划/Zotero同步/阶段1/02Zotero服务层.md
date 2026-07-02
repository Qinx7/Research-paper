# 闃舵1-02锛歓otero 鏈嶅姟灞?
## 2.1 鏂囦欢

鏂板缓 `backend/app/services/zotero_service.py`

## 2.2 璁捐鎬濊矾

鍦?`pyzotero` 鍩虹涓婂皝瑁呬笟鍔￠€昏緫锛屾彁渚涘悓姝ュ弸濂界殑鍑芥暟寮?API銆傛牳蹇冭亴璐ｏ細

1. 杩炴帴楠岃瘉 鈥?娴嬭瘯 API Key 鏄惁鏈夋晥
2. 闆嗗悎娴忚 鈥?鑾峰彇鐢ㄦ埛/缇ょ粍鐨勬墍鏈夐泦鍚?3. 鏉＄洰瀵煎叆 鈥?鎸夐泦鍚堟媺鍙栨潯鐩紝鏄犲皠涓?Paper 瀵硅薄
4. 澧為噺鍚屾 鈥?鍩轰簬鐗堟湰鍙峰彧鎷夊彉鏇存潯鐩?
## 2.3 鏍稿績鍑芥暟

### ZoteroClient 绫?
```python
class ZoteroClient:
    """灏佽 pyzotero 鐨勪笟鍔″鎴风"""

    def __init__(self, library_type: str, library_id: str, api_key: str):
        self._zot = zotero.Zotero(library_id, library_type, api_key)
        self.library_type = library_type
        self.library_id = library_id

    def verify_connection(self) -> dict:
        """楠岃瘉 API Key 鏉冮檺锛岃繑鍥炵敤鎴蜂俊鎭?""
        # GET /keys/current

    def get_collections(self) -> list[dict]:
        """鑾峰彇鎵€鏈夐泦鍚堬紙閫掑綊灞曞紑瀛愰泦鍚堬級"""

    def get_collection_items(self, collection_key: str, since_version: int | None = None) -> list[dict]:
        """鑾峰彇闆嗗悎鍐呮墍鏈夋潯鐩?""

    def get_all_items(self, since_version: int | None = None) -> list[dict]:
        """鑾峰彇椤跺眰鎵€鏈夋潯鐩?""
```

### 瀵煎叆鏄犲皠

```python
def map_zotero_item_to_paper(item: dict, project_id: str) -> dict:
    """灏?Zotero 鏉＄洰鏄犲皠涓?Paper 鍒涘缓鍙傛暟瀛楀吀銆?
    Zotero itemType 鈫?Paper 瀛楁鏄犲皠锛?    - title 鈫?title
    - creators 鈫?authors锛堝垎鍙锋嫾鎺ワ級
    - date 鈫?year锛堟彁鍙栧勾浠斤級
    - publicationTitle / conferenceName 鈫?venue
    - DOI 鈫?doi
    - abstractNote 鈫?abstract
    - url 鈫?url
    - extra 鈫?灏濊瘯鎻愬彇寮曠敤鏁?    - key 鈫?zotero_key
    """
```

### 鍚屾缂栨帓

```python
def import_from_zotero(
    zotero_config: dict,
    collection_keys: list[str],
    project_id: str,
    db_session,
) -> dict:
    """涓诲鍏ユ祦绋嬶細
    1. 鍒涘缓 ZoteroClient
    2. 鎸夐泦鍚堟媺鍙栨潯鐩?    3. 鎸?zotero_key 鍘婚噸锛堝凡鏈夊垯鏇存柊锛屾棤鍒欐柊寤猴級
    4. 鎵归噺鍐欏叆 DB
    5. 鏇存柊 ZoteroSync 璁板綍
    杩斿洖 {imported: N, updated: N, total: N}
    """
```

## 2.4 閿欒澶勭悊

- Zotero API 403 鈫?API Key 鏃犳晥鎴栨棤鏉冮檺
- Zotero API 429 鈫?绛夊緟 Retry-After 绉掑悗閲嶈瘯锛堟渶澶?3 娆★級
- 缃戠粶閿欒 鈫?鎶涘嚭鏄庣‘閿欒淇℃伅
- 鏉＄洰鏄犲皠澶辫触 鈫?璺宠繃璇ユ潯鐩紝缁х画澶勭悊

## 2.5 楠岃瘉

```python
from backend.app.services.zotero_service import ZoteroClient, map_zotero_item_to_paper
# 鍙互瀹炰緥鍖栧苟璋冪敤鏂规硶
```

