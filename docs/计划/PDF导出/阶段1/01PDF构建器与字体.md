# 闃舵 1 路 PDF 鏋勫缓鍣ㄤ笌瀛椾綋绠＄悊

## 鐩爣

瀹夎 fpdf2锛屽垱寤洪€氱敤 PDF 鏋勫缓鏈嶅姟妯″潡锛岃В鍐充腑鏂囧瓧浣撻棶棰樸€?
## 姝ラ

### 1.1 瀹夎 fpdf2

```bash
pip install fpdf2
```

`requirements.txt` 杩藉姞涓€琛?`fpdf2`锛堢増鏈笉閿佸畾锛岃 pip 瑙ｆ瀽鍏煎鐗堟湰锛夈€?
### 1.2 鏂板缓 `backend/app/services/pdf_builder.py`

#### 璁捐鍘熷垯

- 绫?`PdfBuilder` 灏佽 fpdf2 鐨?FPDF 瀹炰緥
- 鎻愪緵璁烘枃/鎶ュ憡鍦烘櫙鐨勯璁惧竷灞€鏂规硶锛堝皝闈㈡爣棰樸€佷竴绾ф爣棰樸€佹鏂囨钀姐€侀〉鐮侊級
- 涓?`_build_docx()` 璋冪敤椋庢牸涓€鑷达紝鏇挎崲鎴愭湰浣?
#### 鏍稿績 API

```python
class PdfBuilder:
    """閫氱敤 PDF 鏋勫缓鍣ㄣ€傚皝瑁?fpdf2锛屾彁渚涘鏈鏂?鎶ュ憡鎺掔増鏂规硶銆?""

    def __init__(self, title: str):
        # A4 绾革紝鑷姩鍒嗛〉锛屾敞鍐屼腑鏂囧瓧浣?        ...

    def add_heading(self, text: str, level: int = 1) -> None:
        """涓€绾?浜岀骇鏍囬銆俵evel=1 榛戜綋 16pt锛宭evel=2 榛戜綋 13pt"""
        ...

    def add_body(self, text: str) -> None:
        """姝ｆ枃娈佃惤銆傚畫浣?12pt锛岄琛岀缉杩?2 瀛楃锛?.5 鍊嶈璺?""
        ...

    def add_page_number(self) -> None:
        """椤佃剼灞呬腑椤电爜"""
        ...

    def output(self) -> bytes:
        """杩斿洖 PDF 瀛楄妭"""
        ...
```

#### 瀛椾綋绠＄悊锛堟ā鍧楃骇杈呭姪鍑芥暟锛?
```python
# 浼樺厛绾т粠楂樺埌浣庣殑瀛椾綋鎼滅储璺緞
_FONT_SEARCH_PATHS_WIN = [
    "C:/Windows/Fonts/simsun.ttc",
    "C:/Windows/Fonts/simhei.ttf",
    "C:/Windows/Fonts/msyh.ttc",
]
_FONT_SEARCH_PATHS_LINUX = [
    "/usr/share/fonts/truetype/noto/NotoSansCJK-Regular.ttc",
    "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc",
    "/usr/share/fonts/noto-cjk/NotoSansCJK-Regular.ttc",
]

_FONT_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "storage", "fonts")

def _find_system_cjk_font() -> str | None:
    """鎸夊钩鍙版娴嬪彲鐢ㄧ殑 CJK 瀛椾綋锛岃繑鍥炵涓€涓瓨鍦ㄧ殑 ttf/ttc 璺緞銆?""
    ...

def _ensure_cjk_font() -> str:
    """
    纭繚鏈?CJK 瀛椾綋鍙敤锛?    1. 妫€鏌ョ郴缁熷瓧浣?鈫?鎵惧埌鍗宠繑鍥?    2. 妫€鏌?storage/fonts/ 鏄惁鏈夊凡涓嬭浇鐨勫瓧浣?鈫?鏈夊垯杩斿洖
    3. 鑷姩涓嬭浇 Noto Sans SC Regular 鍒?storage/fonts/ 鈫?杩斿洖璺緞
    """
    ...
```

#### 瀛椾綋鑷姩涓嬭浇

鑻ョ郴缁熸棤 CJK 瀛椾綋锛屼粠 Google Fonts 涓嬭浇 Noto Sans SC锛圫IL Open Font License锛屽彲鑷敱鍒嗗彂锛夛細

- URL锛歚https://github.com/google/fonts/raw/main/ofl/notosanssc/NotoSansSC%5Bwght%5D.ttf`
- 淇濆瓨鍒?`storage/fonts/NotoSansSC-Regular.ttf`
- 涓€娆℃€ф搷浣滐紝绾?10MB锛屽悗缁洿鎺ヨ鍙栨湰鍦版枃浠?- 浣跨敤 httpx 涓嬭浇锛屽鐢ㄩ」鐩幇鏈夌殑 httpx 渚濊禆

### 1.3 楠岃瘉

鍦?Python 浜や簰鐜涓祴璇曪細

```python
from app.services.pdf_builder import PdfBuilder

b = PdfBuilder("娴嬭瘯璁烘枃鏍囬")
b.add_heading("绗竴绔?缁", level=1)
b.add_body("杩欐槸涓€娈典腑鏂囨祴璇曟鏂囷紝鐢ㄤ簬楠岃瘉涓枃瀛椾綋娓叉煋鏄惁姝ｅ父銆?)
b.add_heading("1.1 鐮旂┒鑳屾櫙", level=2)
b.add_body("棣栬缂╄繘 2 瀛楃锛?.5 鍊嶈璺濄€傚寘鍚腑鏂囨爣鐐癸細锛屻€傦紱锛?"锛?)
pdf_bytes = b.output()
with open("test_output.pdf", "wb") as f:
    f.write(pdf_bytes)
```

妫€鏌ョ偣锛?- PDF 鏂囦欢鍙甯告墦寮€
- 涓枃鏃犱贡鐮侊紝鏃犺眴鑵愬潡
- 棣栬缂╄繘銆佽璺濈鍚堥鏈?- A4 绾稿昂瀵告纭?
