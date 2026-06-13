"""开题报告 Agent —— 基于项目设计与文献分析，生成 12 章节完整开题报告"""
import json
import logging

import httpx

from ..core.config import settings
from ..services.grounding_guard import sanitize_proposal_sections

logger = logging.getLogger(__name__)

PROPOSAL_SYSTEM_PROMPT = """你是一位资深研究生导师和学术评审专家，拥有多年指导研究生开题的经验。请根据提供的项目设计、研究方向和文献分析，为研究生撰写一份完整、规范的开题报告。

报告必须包含以下 12 个章节，每个章节以 JSON 字段返回：

1. **选题背景与研究意义** — 阐述选题的时代背景、学科背景和现实需求，说明理论意义和实践意义（600-800字）
2. **国内外研究现状** — 综述国内和国外相关研究的主要进展、代表成果和流派，引用具体文献（800-1000字）
3. **现有研究不足** — 指出现有研究在理论、方法、应用场景等方面的不足和空白（300-500字）
4. **研究问题与研究目标** — 明确提出 2-3 个核心研究问题，对应 2-3 个具体研究目标（300-500字）
5. **研究内容** — 分阶段描述研究的具体内容，每个阶段包含主要任务和产出（500-800字）
6. **研究方法** — 说明将采用的研究方法及其适用性（如实验法、调查法、设计研究法等）（400-600字）
7. **技术路线** — 描述从研究启动到完成的完整技术路线，包含关键步骤和节点（400-600字）
8. **创新点** — 明确指出 2-3 个创新点，说明与现有工作的本质区别（300-500字）
9. **可行性分析** — 从理论基础、技术条件、数据获取、时间保障等角度分析可行性（300-500字）
10. **研究计划** — 按学期或季度列出研究进度安排（300-500字）
11. **预期成果** — 列出预期的学术论文、系统原型、数据集等成果形式（200-400字）
12. **参考文献** — 列出 10-15 篇核心参考文献，格式规范（GB/T 7714）

## 写作要求

- 用语必须是开题阶段措辞，使用"拟""计划""拟开展""拟采用"等，不能写成已完成的结果
- 文献引用必须来自提供的文献列表，不能编造
- 研究计划要符合研究生 1-2 年的实际培养周期
- 技术路线的步骤要具体、有逻辑关联，不能空泛
- 语言规范、学术化，符合中文学术写作习惯

返回格式：纯 JSON，格式如下：
{
  "title": "开题报告标题",
  "sections": {
    "background_significance": {"title": "一、选题背景与研究意义", "content": "..."},
    "literature_review": {"title": "二、国内外研究现状", "content": "..."},
    "research_gaps": {"title": "三、现有研究不足", "content": "..."},
    "questions_objectives": {"title": "四、研究问题与研究目标", "content": "..."},
    "research_content": {"title": "五、研究内容", "content": "..."},
    "research_methods": {"title": "六、研究方法", "content": "..."},
    "technical_route": {"title": "七、技术路线", "content": "..."},
    "innovation": {"title": "八、创新点", "content": "..."},
    "feasibility": {"title": "九、可行性分析", "content": "..."},
    "research_plan": {"title": "十、研究计划", "content": "..."},
    "expected_outcomes": {"title": "十一、预期成果", "content": "..."},
    "references": {"title": "十二、参考文献", "content": "..."}
  }
}

只返回 JSON，不要其他任何文字。"""


class ProposalAgent:
    """开题报告 Agent —— 生成 12 章节完整开题报告"""

    def __init__(self):
        self.api_key = settings.DEEPSEEK_API_KEY
        self.base_url = settings.DEEPSEEK_BASE_URL
        self.model = settings.DEEPSEEK_MODEL

    def generate(
        self,
        project_design: dict,
        research_direction: dict | None = None,
        literature_context: str = "",
        allowed_references: list[str] | None = None,
    ) -> dict:
        """生成完整开题报告。

        参数：
            project_design: 项目设计方案（来自 ProjectDesignAgent 的输出）
            research_direction: 选定的研究方向
            literature_context: 文献分析上下文字符串
        返回：
            {"title": str, "sections": {key: {"title": str, "content": str}, ...}}
        """
        if not self.api_key:
            return self._mock_proposal(project_design)

        design_text = json.dumps(project_design, ensure_ascii=False, indent=2)

        direction_text = "未提供"
        if research_direction:
            direction_text = json.dumps(research_direction, ensure_ascii=False, indent=2)

        if not literature_context:
            literature_context = "暂无文献分析数据"

        user_prompt = f"""请根据以下材料生成开题报告：

## 项目设计方案
{design_text}

## 研究方向
{direction_text}

## 文献分析
{literature_context}"""

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
                        {"role": "system", "content": PROPOSAL_SYSTEM_PROMPT},
                        {"role": "user", "content": user_prompt},
                    ],
                    "temperature": 0.7,
                    "max_tokens": 8000,
                },
                timeout=180.0,
            )
            response.raise_for_status()
            content = response.json()["choices"][0]["message"]["content"]
            result = self._parse_json(content)
            result["sections"] = sanitize_proposal_sections(
                result.get("sections", {}),
                allowed_references or [],
            )
            return result
        except Exception as e:
            logger.warning(f"开题报告 LLM 生成失败: {e}")
            return self._mock_proposal(project_design)

    def _parse_json(self, content: str) -> dict:
        """解析 LLM 返回的 JSON"""
        content = content.strip()
        if content.startswith("```"):
            lines = content.split("\n")
            content = "\n".join(lines[1:-1] if lines[-1].strip() == "```" else lines[1:])
        return json.loads(content)

    def _mock_proposal(self, project_design: dict) -> dict:
        """模拟开题报告（API Key 未配置时使用）"""
        topic = project_design.get("topic", "未指定课题")
        return {
            "title": f"{topic} —— 开题报告",
            "sections": {
                "background_significance": {"title": "一、选题背景与研究意义", "content": "（需配置 DeepSeek API Key 后生成真实内容）"},
                "literature_review": {"title": "二、国内外研究现状", "content": "（需配置 DeepSeek API Key 后生成真实内容）"},
                "research_gaps": {"title": "三、现有研究不足", "content": "（需配置 DeepSeek API Key 后生成真实内容）"},
                "questions_objectives": {"title": "四、研究问题与研究目标", "content": "（需配置 DeepSeek API Key 后生成真实内容）"},
                "research_content": {"title": "五、研究内容", "content": "（需配置 DeepSeek API Key 后生成真实内容）"},
                "research_methods": {"title": "六、研究方法", "content": "（需配置 DeepSeek API Key 后生成真实内容）"},
                "technical_route": {"title": "七、技术路线", "content": "（需配置 DeepSeek API Key 后生成真实内容）"},
                "innovation": {"title": "八、创新点", "content": "（需配置 DeepSeek API Key 后生成真实内容）"},
                "feasibility": {"title": "九、可行性分析", "content": "（需配置 DeepSeek API Key 后生成真实内容）"},
                "research_plan": {"title": "十、研究计划", "content": "（需配置 DeepSeek API Key 后生成真实内容）"},
                "expected_outcomes": {"title": "十一、预期成果", "content": "（需配置 DeepSeek API Key 后生成真实内容）"},
                "references": {"title": "十二、参考文献", "content": "（需配置 DeepSeek API Key 后生成真实内容）"},
            },
        }


# 单例
proposal_agent = ProposalAgent()
