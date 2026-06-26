import unittest

from app.skills import SkillExecutionContext, SkillExecutor
from app.skills.definitions import build_paper_skill_definitions
from app.skills.registry import build_default_skill_registry


class PaperSkillDefinitionTests(unittest.TestCase):
    def test_default_registry_contains_paper_skills(self):
        registry = build_default_skill_registry()

        self.assertTrue(registry.has("paper.chapter_draft"))
        self.assertTrue(registry.has("paper.chapter_grounding"))

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


if __name__ == "__main__":
    unittest.main()
