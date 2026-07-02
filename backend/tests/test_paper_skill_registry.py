import unittest

from app.skills import SkillExecutionContext, SkillExecutor
from app.skills.registry import build_default_skill_registry


class PaperSkillDefinitionTests(unittest.TestCase):
    def test_default_registry_contains_paper_skills(self):
        registry = build_default_skill_registry()

        self.assertTrue(registry.has("paper.plan"))
        self.assertTrue(registry.has("paper.outline_generate"))
        self.assertTrue(registry.has("paper.review_pass"))
        self.assertTrue(registry.has("paper.revision_apply"))
        self.assertTrue(registry.has("paper.full_review_pass"))
        self.assertTrue(registry.has("paper.full_revision_apply"))
        self.assertTrue(registry.has("paper.chapter_draft"))
        self.assertTrue(registry.has("paper.chapter_grounding"))

    def test_paper_plan_skill_uses_injected_writing_agent(self):
        registry = build_default_skill_registry()
        executor = SkillExecutor(registry)

        class FakeWritingAgent:
            def build_writing_plan(self, **kwargs):
                return {
                    "goal": "完成论文写作",
                    "recommended_structure": ["绪论", "相关理论"],
                    "evidence_gaps": ["缺少实验结果"],
                    "risks": ["第五章暂缺真实数据"],
                    "notes": "先补证据再写实验章节",
                }

        result = executor.execute(
            "paper.plan",
            {
                "project_context": "研究方向：多模态知识图谱",
                "outcomes_summary": "当前仅有系统原型截图",
                "literature_context": "已有文献：A、B、C",
            },
            context=SkillExecutionContext(state={"writing_agent": FakeWritingAgent()}),
        )

        self.assertEqual(result.output["goal"], "完成论文写作")
        self.assertIn("缺少实验结果", result.output["evidence_gaps"])

    def test_paper_outline_generate_skill_uses_injected_writing_agent(self):
        registry = build_default_skill_registry()
        executor = SkillExecutor(registry)

        class FakeWritingAgent:
            def generate_outline(self, **kwargs):
                return {
                    "suggested_title": "多模态知识图谱研究",
                    "chapters": [
                        {
                            "key": "chapter_1_introduction",
                            "title": "第一章 绪论",
                            "subsections": [{"title": "1.1 研究背景", "description": "说明研究背景"}],
                        }
                    ],
                    "notes": "第五章依赖真实实验数据",
                }

        result = executor.execute(
            "paper.outline_generate",
            {
                "project_context": "研究方向：多模态知识图谱",
                "outcomes_summary": "当前仅有系统原型截图",
                "literature_context": "已有文献：A、B、C",
            },
            context=SkillExecutionContext(state={"writing_agent": FakeWritingAgent()}),
        )

        self.assertEqual(result.output["suggested_title"], "多模态知识图谱研究")
        self.assertEqual(result.output["chapters"][0]["key"], "chapter_1_introduction")

    def test_paper_plan_skill_returns_minimum_shape_with_real_agent(self):
        from app.agents.paper_writing_agent import PaperWritingAgent

        registry = build_default_skill_registry()
        executor = SkillExecutor(registry)

        result = executor.execute(
            "paper.plan",
            {
                "project_context": "研究方向：多模态知识图谱",
                "outcomes_summary": "暂无上传成果",
                "literature_context": "",
            },
            context=SkillExecutionContext(state={"writing_agent": PaperWritingAgent()}),
        )

        self.assertIn("goal", result.output)
        self.assertIsInstance(result.output["recommended_structure"], list)
        self.assertIsInstance(result.output["evidence_gaps"], list)
        self.assertIsInstance(result.output["risks"], list)
        self.assertIsInstance(result.output["notes"], str)

    def test_paper_review_pass_skill_uses_injected_writing_agent(self):
        registry = build_default_skill_registry()
        executor = SkillExecutor(registry)

        class FakeWritingAgent:
            def review_chapter(self, **kwargs):
                return {
                    "chapter_key": kwargs["chapter_key"],
                    "passed": False,
                    "summary": "当前章节存在依据不足与结构重复问题",
                    "issues": [
                        {
                            "severity": "warning",
                            "title": "依据不足",
                            "detail": "本章缺少与项目成果直接对应的说明",
                            "suggestion": "补充项目成果或文献支撑",
                        }
                    ],
                    "focus_areas": ["证据支撑", "结构完整性"],
                }

        result = executor.execute(
            "paper.review_pass",
            {
                "chapter_key": "chapter_3_design",
                "chapter_title": "第三章 系统需求分析与总体设计",
                "chapter_content": "这里是章节正文。",
                "citations": [],
                "evidence_context": "当前只有系统截图与说明文档",
            },
            context=SkillExecutionContext(state={"writing_agent": FakeWritingAgent()}),
        )

        self.assertEqual(result.output["chapter_key"], "chapter_3_design")
        self.assertEqual(result.output["passed"], False)
        self.assertEqual(result.output["issues"][0]["severity"], "warning")

    def test_paper_revision_apply_skill_uses_injected_writing_agent(self):
        registry = build_default_skill_registry()
        executor = SkillExecutor(registry)

        class FakeWritingAgent:
            def revise_chapter(self, **kwargs):
                return {
                    "chapter_key": kwargs["chapter_key"],
                    "title": kwargs["chapter_title"],
                    "content": "修订后的章节内容",
                    "change_summary": ["补充了需求分析", "弱化了无依据数据表述"],
                    "resolved_issues": ["章节结构可能缺项", "数据性表述存在风险"],
                    "citations": kwargs["citations"],
                    "data_based": False,
                }

        result = executor.execute(
            "paper.revision_apply",
            {
                "chapter_key": "chapter_3_design",
                "chapter_title": "第三章 系统需求分析与总体设计",
                "chapter_content": "原始章节内容",
                "issues": [
                    {"severity": "warning", "title": "章节结构可能缺项", "detail": "缺少需求分析", "suggestion": "补充需求分析"},
                    {"severity": "warning", "title": "数据性表述存在风险", "detail": "缺少真实数据依据", "suggestion": "删除无依据数据表述"},
                ],
                "focus_areas": ["章节结构", "数据依据"],
                "citations": [],
                "evidence_context": "已有成果：系统设计文档",
            },
            context=SkillExecutionContext(state={"writing_agent": FakeWritingAgent()}),
        )

        self.assertEqual(result.output["chapter_key"], "chapter_3_design")
        self.assertEqual(result.output["content"], "修订后的章节内容")
        self.assertEqual(result.output["change_summary"][0], "补充了需求分析")

    def test_revision_prefers_llm_output_when_available(self):
        from app.agents.paper_writing_agent import PaperWritingAgent

        class SpyAgent(PaperWritingAgent):
            def __init__(self):
                super().__init__()
                self.api_key = "test-key"
                self.called = False

            def _call_llm(self, system_prompt, user_message, max_tokens=4000, timeout=180.0):
                self.called = True
                return {
                    "chapter_key": "chapter_3_design",
                    "title": "第三章 系统需求分析与总体设计",
                    "content": "这是 LLM 修订后的章节内容。",
                    "change_summary": ["补充了需求分析小节"],
                    "resolved_issues": ["设计章节结构可能缺项"],
                    "citations": ["真实论文A"],
                    "data_based": False,
                }

        agent = SpyAgent()
        result = agent.revise_chapter(
            chapter_key="chapter_3_design",
            chapter_title="第三章 系统需求分析与总体设计",
            chapter_content="原始章节内容",
            issues=[{"severity": "warning", "title": "设计章节结构可能缺项", "detail": "缺少需求分析", "suggestion": "补充需求分析"}],
            focus_areas=["章节结构"],
            citations=["真实论文A"],
            evidence_context="已有成果：系统设计文档",
        )

        self.assertTrue(agent.called)
        self.assertEqual(result["content"], "这是 LLM 修订后的章节内容。")
        self.assertEqual(result["change_summary"], ["补充了需求分析小节"])

    def test_generate_full_draft_preserves_edited_sections_and_generates_missing(self):
        from app.agents.paper_writing_agent import PaperWritingAgent

        class SpyAgent(PaperWritingAgent):
            def __init__(self):
                super().__init__()
                self.generated_keys = []

            def generate_outline(self, project_context, outcomes_summary, literature_context=""):
                return {
                    "suggested_title": "完整论文初稿",
                    "chapters": [
                        {"key": "chapter_1_introduction", "title": "第一章 绪论", "subsections": []},
                        {"key": "chapter_2_theory", "title": "第二章 理论基础", "subsections": []},
                    ],
                    "notes": "说明",
                }

            def generate_chapter(self, chapter_key, outline, outcomes_summary, literature_context, existing_chapters=None):
                self.generated_keys.append(chapter_key)
                return {
                    "chapter_key": chapter_key,
                    "title": outline["chapters"][0]["title"] if chapter_key == "chapter_1_introduction" else "第二章 理论基础",
                    "content": f"{chapter_key} 生成内容",
                    "citations": ["真实论文A"] if chapter_key == "chapter_1_introduction" else [],
                    "data_based": False,
                }

        agent = SpyAgent()
        result = agent.generate_full_draft(
            project_context="项目背景",
            outcomes_summary="成果摘要",
            literature_context="文献上下文",
            existing_outline=None,
            existing_chapters={
                "chapter_2_theory": {
                    "title": "第二章 理论基础",
                    "content": "手工编辑内容",
                    "status": "edited",
                    "citations": [],
                    "data_based": False,
                }
            },
        )

        self.assertEqual(result["suggested_title"], "完整论文初稿")
        self.assertIn("chapter_1_introduction", result["content"])
        self.assertEqual(result["content"]["chapter_2_theory"]["content"], "手工编辑内容")
        self.assertEqual(
            agent.generated_keys,
            [
                "chapter_1_introduction",
                "chapter_3_design",
                "chapter_4_implementation",
                "chapter_5_experiment",
                "chapter_6_conclusion",
            ],
        )

    def test_paper_review_pass_flags_intro_without_enough_citations(self):
        from app.agents.paper_writing_agent import PaperWritingAgent

        registry = build_default_skill_registry()
        executor = SkillExecutor(registry)

        result = executor.execute(
            "paper.review_pass",
            {
                "chapter_key": "chapter_1_introduction",
                "chapter_title": "第一章 绪论",
                "chapter_content": "本章介绍研究背景、研究意义、研究现状和研究方法。" * 40,
                "citations": [],
                "evidence_context": "已有文献：仅 1 篇概览材料",
            },
            context=SkillExecutionContext(state={"writing_agent": PaperWritingAgent()}),
        )

        issue_titles = [item["title"] for item in result.output["issues"]]
        self.assertIn("绪论缺少文献引用", issue_titles)

    def test_paper_review_pass_flags_risky_numeric_claims_without_evidence(self):
        from app.agents.paper_writing_agent import PaperWritingAgent

        registry = build_default_skill_registry()
        executor = SkillExecutor(registry)

        result = executor.execute(
            "paper.review_pass",
            {
                "chapter_key": "chapter_5_experiment",
                "chapter_title": "第五章 实验设计与结果分析",
                "chapter_content": "实验结果表明系统准确率达到98.7%，响应时间降低42%，显著优于基线方法。",
                "citations": [],
                "evidence_context": "暂无上传成果",
            },
            context=SkillExecutionContext(state={"writing_agent": PaperWritingAgent()}),
        )

        issue_titles = [item["title"] for item in result.output["issues"]]
        self.assertIn("数据性表述存在风险", issue_titles)

    def test_paper_review_pass_flags_missing_structure_sections(self):
        from app.agents.paper_writing_agent import PaperWritingAgent

        registry = build_default_skill_registry()
        executor = SkillExecutor(registry)

        result = executor.execute(
            "paper.review_pass",
            {
                "chapter_key": "chapter_3_design",
                "chapter_title": "第三章 系统需求分析与总体设计",
                "chapter_content": "本章主要介绍系统设计方案。系统设计完成后即可进入实现阶段。",
                "citations": [],
                "evidence_context": "已有成果：系统设计文档",
            },
            context=SkillExecutionContext(state={"writing_agent": PaperWritingAgent()}),
        )

        issue_titles = [item["title"] for item in result.output["issues"]]
        self.assertIn("设计章节结构可能缺项", issue_titles)

    def test_paper_chapter_draft_skill_uses_injected_writing_agent(self):
        registry = build_default_skill_registry()
        executor = SkillExecutor(registry)

        class FakeWritingAgent:
            def generate_chapter(self, **kwargs):
                return {
                    "chapter_key": kwargs["chapter_key"],
                    "title": "第一章 绪论",
                    "content": "正文",
                    "citations": ["真实论文A"],
                    "data_based": False,
                }

        result = executor.execute(
            "paper.chapter_draft",
            {
                "chapter_key": "chapter_1_introduction",
                "outline": {},
                "outcomes_summary": "暂无成果",
                "literature_context": "已有文献：真实论文A",
                "existing_chapters": {},
            },
            context=SkillExecutionContext(state={"writing_agent": FakeWritingAgent()}),
        )

        self.assertEqual(result.output["chapter_key"], "chapter_1_introduction")
        self.assertEqual(result.output["citations"], ["真实论文A"])

    def test_paper_chapter_grounding_skill_uses_existing_guard_logic(self):
        registry = build_default_skill_registry()
        executor = SkillExecutor(registry)

        result = executor.execute(
            "paper.chapter_grounding",
            {
                "chapter_key": "chapter_3_design",
                "result": {
                    "chapter_key": "chapter_3_design",
                    "title": "第三章",
                    "content": "本章围绕系统设计展开。",
                    "citations": ["真实论文A"],
                    "data_based": False,
                },
                "outcomes": [],
                "papers": [],
                "evidence_items": [],
            },
            context=SkillExecutionContext(),
        )

        self.assertEqual(result.output["citations"], [])

    def test_paper_full_review_pass_skill_uses_injected_writing_agent(self):
        registry = build_default_skill_registry()
        executor = SkillExecutor(registry)

        class FakeWritingAgent:
            def review_full_draft(self, **kwargs):
                return {
                    "passed": False,
                    "summary": "整篇论文存在结构衔接和证据支撑问题。",
                    "issues": [
                        {
                            "severity": "warning",
                            "title": "章节衔接较弱",
                            "detail": "第二章到第三章缺少过渡说明。",
                            "suggestion": "补充从理论基础到系统设计的承接段。",
                        }
                    ],
                    "focus_areas": ["章节衔接", "证据支撑"],
                    "chapter_flags": {"chapter_3_design": ["章节衔接较弱"]},
                }

        result = executor.execute(
            "paper.full_review_pass",
            {
                "draft_title": "测试论文",
                "full_text": "第一章 绪论\n研究背景。\n\n第二章 理论基础\n相关理论。",
                "chapter_summaries": [{"key": "chapter_1_introduction", "title": "第一章 绪论", "length": 20}],
                "citations": [],
                "evidence_context": "",
            },
            context=SkillExecutionContext(state={"writing_agent": FakeWritingAgent()}),
        )

        self.assertFalse(result.output["passed"])
        self.assertEqual(result.output["focus_areas"][0], "章节衔接")
        self.assertIn("chapter_3_design", result.output["chapter_flags"])

    def test_paper_full_revision_apply_skill_uses_injected_writing_agent(self):
        registry = build_default_skill_registry()
        executor = SkillExecutor(registry)

        class FakeWritingAgent:
            def revise_full_draft(self, **kwargs):
                return {
                    "title": kwargs["draft_title"],
                    "full_text": "修订后的整篇正文",
                    "change_summary": ["补充章节承接", "弱化无依据数据表述"],
                    "resolved_issues": ["章节衔接较弱"],
                    "remaining_issues": ["仍需补充真实实验数据"],
                }

        result = executor.execute(
            "paper.full_revision_apply",
            {
                "draft_title": "测试论文",
                "full_text": "原始整篇正文",
                "issues": [{"severity": "warning", "title": "章节衔接较弱", "detail": "缺少过渡", "suggestion": "补充过渡"}],
                "focus_areas": ["章节衔接"],
                "citations": [],
                "evidence_context": "",
            },
            context=SkillExecutionContext(state={"writing_agent": FakeWritingAgent()}),
        )

        self.assertEqual(result.output["full_text"], "修订后的整篇正文")
        self.assertEqual(result.output["resolved_issues"], ["章节衔接较弱"])

    def test_full_review_with_real_agent_flags_weak_evidence_and_intro_citations(self):
        from app.agents.paper_writing_agent import PaperWritingAgent

        agent = PaperWritingAgent()
        result = agent.review_full_draft(
            draft_title="测试论文",
            full_text="## 第一章 绪论\n研究背景。" * 80,
            chapter_summaries=[
                {"key": "chapter_1_introduction", "title": "第一章 绪论", "length": 800},
                {"key": "chapter_2_theory", "title": "第二章 理论基础", "length": 0},
            ],
            citations=[],
            evidence_context="",
        )

        issue_titles = [item["title"] for item in result["issues"]]
        self.assertIn("第一章文献支撑不足", issue_titles)
        self.assertIn("整篇证据基础偏弱", issue_titles)
        self.assertIn("chapter_1_introduction", result["chapter_flags"])

    def test_full_revision_with_real_agent_weakens_unsupported_numeric_claims(self):
        from app.agents.paper_writing_agent import PaperWritingAgent

        agent = PaperWritingAgent()
        agent.api_key = ""
        result = agent.revise_full_draft(
            draft_title="测试论文",
            full_text="## 第五章 实验\n系统准确率达到 98.7%，显著优于基线方法。",
            issues=[
                {
                    "severity": "warning",
                    "title": "全文存在无依据数据表述风险",
                    "detail": "缺少实验数据。",
                    "suggestion": "弱化结论。",
                }
            ],
            focus_areas=["数据依据"],
            citations=[],
            evidence_context="暂无上传成果",
        )

        self.assertIn("真实实验数据进一步验证", result["full_text"])
        self.assertIn("全文存在无依据数据表述风险", result["resolved_issues"])


if __name__ == "__main__":
    unittest.main()
