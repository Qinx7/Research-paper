import unittest

from app.skills import SkillExecutionContext, SkillExecutor, SkillRouter
from app.skills.registry import build_default_skill_registry


class PptHtmlSkillTests(unittest.TestCase):
    def test_default_registry_contains_web_html_deck_skill(self):
        registry = build_default_skill_registry()
        self.assertTrue(registry.has("ppt.web_html_deck"))
        self.assertTrue(registry.has("ppt.project_pptx"))

    def test_router_resolves_preview_html_deck_action(self):
        router = SkillRouter(build_default_skill_registry())
        self.assertEqual(
            router.resolve_id(domain="ppt", action="preview_html_deck"),
            "ppt.web_html_deck",
        )
        self.assertEqual(
            router.resolve_id(domain="ppt", action="generate_project_pptx"),
            "ppt.project_pptx",
        )

    def test_project_pptx_skill_returns_download_artifact_shape(self):
        registry = build_default_skill_registry()
        executor = SkillExecutor(registry)

        class FakePptAgent:
            def resolve_style(self, template):
                return {"id": template, "name": "学术蓝"}

            def generate(self, *, design, template):
                self.design = design
                self.template = template
                return "ppt/demo.pptx"

        fake_agent = FakePptAgent()
        result = executor.execute(
            "ppt.project_pptx",
            {
                "design": {"topic": "测试课题", "background": "研究背景"},
                "template": "academic_blue",
            },
            context=SkillExecutionContext(
                metadata={"download_base_url": "/api/ppt/download/"},
                state={"ppt_agent": fake_agent},
            ),
        )

        self.assertEqual(fake_agent.design["topic"], "测试课题")
        self.assertEqual(fake_agent.template, "academic_blue")
        self.assertEqual(result.output["object_key"], "ppt/demo.pptx")
        self.assertEqual(result.output["download_url"], "/api/ppt/download/ppt/demo.pptx")
        self.assertEqual(result.output["style_name"], "学术蓝")

    def test_web_html_deck_skill_returns_expected_artifact_shape(self):
        registry = build_default_skill_registry()
        executor = SkillExecutor(registry)

        class FakeRenderService:
            def render(self, *, deck_title, slides_outline, theme, object_prefix):
                return {
                    "artifact_type": "html_deck",
                    "title": deck_title,
                    "object_key": f"{object_prefix}/demo/index.html",
                    "filename": "index.html",
                    "theme": theme,
                    "slide_count": len(slides_outline),
                }

        result = executor.execute(
            "ppt.web_html_deck",
            {
                "deck_title": "汇报预演版",
                "slides_outline": [
                    {"title": "研究背景", "items": ["背景 1", "背景 2"]},
                    {"title": "实验设计", "items": ["设计 1"]},
                ],
                "theme": "swiss",
            },
            context=SkillExecutionContext(
                metadata={
                    "preview_base_url": "/preview/",
                    "download_base_url": "/download/",
                },
                state={"web_deck_render_service": FakeRenderService()},
            ),
        )

        self.assertEqual(result.output["artifact_type"], "html_deck")
        self.assertEqual(result.output["slide_count"], 2)
        self.assertEqual(result.output["preview_url"], "/preview/generated/decks/demo/index.html")
        self.assertEqual(result.output["download_url"], "/download/generated/decks/demo/index.html")
        self.assertEqual(result.payload["deck_title"], "汇报预演版")
        self.assertEqual(len(result.payload["slides_outline"]), 2)


if __name__ == "__main__":
    unittest.main()
