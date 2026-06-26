import unittest

from app.skills import (
    SkillDefinition,
    SkillDisabledError,
    SkillExecutionContext,
    SkillExecutor,
    SkillRegistry,
    SkillValidationError,
)


class SkillSystemTests(unittest.TestCase):
    def test_registry_register_get_and_list(self):
        registry = SkillRegistry()
        registry.register(SkillDefinition(
            id="paper.chapter_draft",
            name="章节草稿",
            description="生成章节草稿",
            domain="paper",
            handler=lambda payload, context: {"content": payload["title"]},
        ))
        registry.register(SkillDefinition(
            id="ppt.defense_render",
            name="答辩渲染",
            description="生成答辩 PPT",
            domain="ppt",
            handler=lambda payload, context: {"filename": "demo.pptx"},
            enabled=False,
        ))

        self.assertTrue(registry.has("paper.chapter_draft"))
        self.assertEqual(registry.get("paper.chapter_draft").domain, "paper")
        self.assertEqual([item.id for item in registry.list(domain="paper")], ["paper.chapter_draft"])
        self.assertEqual([item.id for item in registry.list(enabled_only=False)], ["paper.chapter_draft", "ppt.defense_render"])

    def test_registry_rejects_duplicate_skill_id(self):
        registry = SkillRegistry()
        definition = SkillDefinition(
            id="paper.chapter_draft",
            name="章节草稿",
            description="生成章节草稿",
            domain="paper",
            handler=lambda payload, context: {},
        )
        registry.register(definition)

        with self.assertRaises(ValueError):
            registry.register(definition)

    def test_executor_merges_defaults_and_validates_required_fields(self):
        registry = SkillRegistry()
        registry.register(SkillDefinition(
            id="paper.chapter_draft",
            name="章节草稿",
            description="生成章节草稿",
            domain="paper",
            defaults={"style": "academic"},
            input_schema={"required": ["chapter_key", "style"]},
            output_schema={"required": ["content"]},
            handler=lambda payload, context: {"content": f"{payload['chapter_key']}::{payload['style']}"},
        ))
        executor = SkillExecutor(registry)

        result = executor.execute(
            "paper.chapter_draft",
            {"chapter_key": "chapter_1_introduction"},
            context=SkillExecutionContext(project_id="p1"),
        )

        self.assertEqual(result.payload["style"], "academic")
        self.assertEqual(result.output["content"], "chapter_1_introduction::academic")

    def test_executor_rejects_disabled_skill(self):
        registry = SkillRegistry()
        registry.register(SkillDefinition(
            id="ppt.defense_render",
            name="答辩渲染",
            description="生成答辩 PPT",
            domain="ppt",
            handler=lambda payload, context: {"filename": "demo.pptx"},
            enabled=False,
        ))
        executor = SkillExecutor(registry)

        with self.assertRaises(SkillDisabledError):
            executor.execute("ppt.defense_render", {})

    def test_executor_runs_guards_and_raises_validation_error(self):
        def forbid_fake_result(definition, payload, context, output):
            if output.get("has_fake_result"):
                raise SkillValidationError("检测到虚假结果")

        registry = SkillRegistry()
        registry.register(SkillDefinition(
            id="paper.chapter_grounding",
            name="章节依据校验",
            description="校验章节依据",
            domain="paper",
            input_schema={"required": ["content"]},
            output_schema={"required": ["passed"]},
            guards=[forbid_fake_result],
            handler=lambda payload, context: {"passed": True, "has_fake_result": "实验结果表明" in payload["content"]},
        ))
        executor = SkillExecutor(registry)

        with self.assertRaises(SkillValidationError):
            executor.execute("paper.chapter_grounding", {"content": "实验结果表明系统准确率 99%"})


if __name__ == "__main__":
    unittest.main()
