"""论文写作 Agent —— 基于真实项目成果与文献，逐章生成毕业论文"""
import json
import logging

import httpx

from ..core.config import settings
from ..schemas.draft import PAPER_CHAPTER_KEYS, PAPER_CHAPTER_LABELS

logger = logging.getLogger(__name__)

# 系统提示词：大纲生成
OUTLINE_SYSTEM_PROMPT = """你是一位资深研究生导师，擅长指导研究生撰写毕业论文大纲。

请根据以下信息生成一份完整的硕士/本科毕业论文大纲：

## 输入信息
- 项目背景（来自研究方向）
- 项目设计（研究目标、方法、技术路线）
- 项目成果摘要（已上传的真实成果）
- 文献上下文

## 论文结构（6 章标准结构）

第一章 绪论（研究背景与意义、国内外研究现状、研究内容与方法、技术路线）
第二章 相关理论与技术基础
第三章 系统需求分析与总体设计
第四章 系统实现
第五章 实验设计与结果分析
第六章 总结与展望

## 要求

- 每章包含 3-5 个小节，每节列出标题和一句话描述
- 章节名称要具体，结合项目实际内容，不要泛泛而谈
- 如果项目有真实实验数据，第五章应包含"实验结果"和"结果分析"子节
- 如果项目没有真实数据，第五章只能是"实验设计方案"和"预期结果"
- 大纲后面附上 notes，说明哪些章节需要真实数据支撑

返回纯 JSON：
{
  "suggested_title": "论文建议标题",
  "chapters": [
    {
      "key": "chapter_1_introduction",
      "title": "第一章 绪论",
      "subsections": [{"title": "1.1 研究背景", "description": "..."}, ...]
    },
    ...
  ],
  "notes": "大纲说明，特别标注哪些章节依赖真实数据"
}

只返回 JSON，不要其他任何文字。"""

# 系统提示词：章节生成 —— 必须遵守学术合规
CHAPTER_SYSTEM_PROMPT = """你是一位资深研究生导师和学术论文写作专家。请根据提供的材料，撰写毕业论文的一个章节。

## 写作约束（严格遵守）

1. **区分"已完成"与"拟开展"**：
   - 如果提供了真实成果（实验结果、数据、截图），使用"实验结果表明""数据显示""系统实现了"等已完成措辞
   - 如果未提供真实成果，只能使用"拟开展""拟实现""实验方案设计为""预期结果"等拟开展措辞
   - **绝对禁止在没有真实数据时编写虚假的实验结果或数据**

2. **引用真实成果**：
   - 如果提供了项目成果列表，在正文中引用具体成果名称
   - 实验章节必须标注数据来源：[基于上传的实验数据] 或 [实验设计方案]

3. **文献引用**：
   - 只能引用提供的文献列表中的文献
   - 不能编造文献标题、作者或年份
   - 使用 GB/T 7714 引用格式：[1] 作者. 标题[J]. 期刊, 年份

4. **内部证据卡片**：
   - 如果文献上下文中出现“内部证据卡片”，只能围绕其“证据摘录”和“来源文献”进行表述
   - 可以在 citations 中填写证据卡片标题，表示该段落依据项目内已沉淀证据
   - 证据卡片不能被扩写为不存在的实验数据、样本规模、百分比或统计结论

5. **写作风格**：
   - 学术化、规范的中文学术论文写作风格
   - 段落之间逻辑连贯，有过渡句
   - 适当使用图表描述（"如表X所示""图X展示了"）
   - 字数：正文 800-1500 字

返回纯 JSON：
{
  "chapter_key": "章节标识",
  "title": "章节标题",
  "content": "完整章节正文内容",
  "citations": ["引用的成果名称", ...],
  "data_based": true/false  // 是否基于真实数据
}

只返回 JSON，不要其他任何文字。"""

# 摘要生成提示词
ABSTRACT_SYSTEM_PROMPT = """你是一位学术论文写作专家。请根据提供的论文全文内容，生成中英文摘要和关键词。

返回 JSON：
{
  "abstract_cn": "中文摘要（300字左右）",
  "abstract_en": "English abstract",
  "keywords_cn": ["关键词1", "关键词2", ...],
  "keywords_en": ["keyword1", "keyword2", ...]
}

只返回 JSON。"""


class PaperWritingAgent:
    """论文写作 Agent —— 大纲、章节、摘要生成"""

    def __init__(self):
        self.api_key = settings.DEEPSEEK_API_KEY
        self.base_url = settings.DEEPSEEK_BASE_URL
        self.model = settings.DEEPSEEK_MODEL

    def _call_llm(self, system_prompt: str, user_message: str, max_tokens: int = 4000, timeout: float = 180.0) -> dict:
        """调用 LLM 并返回解析后的 JSON"""
        if not self.api_key:
            return self._mock_json(user_message)

        try:
            response = httpx.post(
                f"{self.base_url}/v1/chat/completions",
                headers={
                    "Authorization": f"Bearer {self.api_key}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": self.model,
                    "messages": [
                        {"role": "system", "content": system_prompt},
                        {"role": "user", "content": user_message},
                    ],
                    "temperature": 0.7,
                    "max_tokens": max_tokens,
                },
                timeout=timeout,
            )
            response.raise_for_status()
            content = response.json()["choices"][0]["message"]["content"]
            return self._parse_json(content)
        except Exception as e:
            logger.warning(f"论文 Agent LLM 调用失败: {e}")
            return self._mock_json(user_message)

    @staticmethod
    def _parse_json(content: str) -> dict:
        content = content.strip()
        if content.startswith("```"):
            lines = content.split("\n")
            content = "\n".join(lines[1:-1] if lines[-1].strip() == "```" else lines[1:])
        return json.loads(content)

    @staticmethod
    def _mock_json(_user_message: str) -> dict:
        return {"_mock": True, "_note": "DEEPSEEK_API_KEY 未配置，返回模拟结果"}

    # ---- 公开方法 ----

    def generate_outline(
        self,
        project_context: str,
        outcomes_summary: str,
        literature_context: str = "",
    ) -> dict:
        """生成论文大纲（6 章结构，含子节）"""
        user_message = f"""请根据以下信息生成论文大纲：

## 项目背景
{project_context}

## 项目成果摘要
{outcomes_summary or '暂无上传成果'}

## 文献上下文
{literature_context or '暂无文献分析数据'}"""

        result = self._call_llm(OUTLINE_SYSTEM_PROMPT, user_message, max_tokens=4000)
        if result.get("_mock"):
            return {
                "suggested_title": "毕业论文",
                "chapters": [
                    {
                        "key": key,
                        "title": PAPER_CHAPTER_LABELS.get(key, key),
                        "subsections": [{"title": f"{(i + 1)}.小节标题", "description": "小节描述"} for i in range(3)],
                    }
                    for key in PAPER_CHAPTER_KEYS
                ],
                "notes": "（需配置 DeepSeek API Key 后生成真实大纲）",
            }
        return result

    def generate_chapter(
        self,
        chapter_key: str,
        outline: dict,
        outcomes_summary: str,
        literature_context: str,
        existing_chapters: dict | None = None,
    ) -> dict:
        """生成单个章节内容"""
        chapter_title = PAPER_CHAPTER_LABELS.get(chapter_key, chapter_key)

        # 从大纲中找到当前章节的子节信息
        chapters = outline.get("chapters", []) if isinstance(outline, dict) else []
        chapter_outline = None
        for ch in chapters:
            if ch.get("key") == chapter_key:
                chapter_outline = ch
                break

        outline_text = json.dumps(chapter_outline, ensure_ascii=False, indent=2) if chapter_outline else "未提供大纲"

        # 构建已有章节的上下文
        existing_text = ""
        if existing_chapters:
            existing_parts = []
            for key, data in existing_chapters.items():
                if key != chapter_key and isinstance(data, dict) and data.get("content"):
                    ch_title = PAPER_CHAPTER_LABELS.get(key, key)
                    existing_parts.append(f"### {ch_title}\n{data['content'][:300]}...")
            if existing_parts:
                existing_text = "## 已完成章节（供参考，保持一致性）\n\n" + "\n\n".join(existing_parts)

        user_message = f"""请撰写以下章节：

## 当前章节
{outline_text}

## 项目成果
{outcomes_summary or '暂无上传成果 —— 本章只能写设计方案和预期结果'}

## 文献参考
{literature_context or '暂无文献数据'}
{existing_text}

请根据以上信息撰写【{chapter_title}】的完整内容。"""

        result = self._call_llm(CHAPTER_SYSTEM_PROMPT, user_message, max_tokens=4000, timeout=180.0)
        if result.get("_mock"):
            return {
                "chapter_key": chapter_key,
                "title": chapter_title,
                "content": f"（需配置 DeepSeek API Key 后生成 {chapter_title} 真实内容）",
                "citations": [],
                "data_based": False,
            }
        return result

    def generate_abstract(self, paper_content: dict) -> dict:
        """根据全文内容生成中英文摘要"""
        # 拼接所有章节内容
        parts = []
        for key in PAPER_CHAPTER_KEYS:
            ch = paper_content.get(key, {})
            if isinstance(ch, dict) and ch.get("content"):
                parts.append(f"## {PAPER_CHAPTER_LABELS.get(key, key)}\n{ch['content'][:500]}")

        full_text = "\n\n".join(parts) if parts else "（无内容）"

        result = self._call_llm(ABSTRACT_SYSTEM_PROMPT, f"以下是论文内容：\n\n{full_text}", max_tokens=1500)
        if result.get("_mock"):
            return {
                "abstract_cn": "（需配置 DeepSeek API Key 后生成摘要）",
                "abstract_en": "(Configure DeepSeek API Key to generate abstract)",
                "keywords_cn": [],
                "keywords_en": [],
            }
        return result

    def suggest_references(self, paper_content: dict, existing_literature: list[dict]) -> dict:
        """根据论文内容和已有文献，推荐补充引用"""
        # 拼接论文内容摘要
        parts = []
        for key in PAPER_CHAPTER_KEYS:
            ch = paper_content.get(key, {})
            if isinstance(ch, dict) and ch.get("content"):
                parts.append(ch["content"][:300])
        paper_text = "\n".join(parts)

        lit_text = json.dumps(existing_literature[:20], ensure_ascii=False, indent=2) if existing_literature else "无"

        system_prompt = """你是一位学术论文审稿人。请检查论文内容中引用的参考文献，并建议补充。

返回 JSON：
{
  "suggested_references": [{"title": "...", "reason": "引用原因", "section": "建议引用的章节"}, ...],
  "notes": "综合建议"
}
只返回 JSON。"""

        user_message = f"论文内容：\n{paper_text}\n\n已有文献：\n{lit_text}"
        result = self._call_llm(system_prompt, user_message, max_tokens=2000)
        if result.get("_mock"):
            return {"suggested_references": [], "notes": "（需配置 API Key）"}
        return result


paper_writing_agent = PaperWritingAgent()
