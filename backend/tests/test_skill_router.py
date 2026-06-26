import unittest

from app.skills import SkillRouteNotFoundError, SkillRouter
from app.skills.registry import build_default_skill_registry


class SkillRouterTests(unittest.TestCase):
    def test_router_resolves_default_paper_and_ppt_actions(self):
        router = SkillRouter(build_default_skill_registry())

        self.assertEqual(
            router.resolve_id(domain="paper", action="write_chapter"),
            "paper.chapter_draft",
        )
        self.assertEqual(
            router.resolve_id(domain="paper", action="validate_chapter"),
            "paper.chapter_grounding",
        )
        self.assertEqual(
            router.resolve_id(domain="ppt", action="preview_html_deck"),
            "ppt.web_html_deck",
        )

    def test_router_can_override_route(self):
        router = SkillRouter(build_default_skill_registry())
        router.register_route(domain="paper", action="write_chapter", skill_id="paper.chapter_grounding")

        self.assertEqual(
            router.resolve_id(domain="paper", action="write_chapter"),
            "paper.chapter_grounding",
        )

    def test_router_raises_when_route_not_found(self):
        router = SkillRouter(build_default_skill_registry())

        with self.assertRaises(SkillRouteNotFoundError):
            router.resolve(domain="ppt", action="render_pptx")


if __name__ == "__main__":
    unittest.main()
