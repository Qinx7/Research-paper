import unittest

from app.skills import SkillExecutionContext, SkillExecutor
from app.skills.registry import build_default_skill_registry


class ResearchSkillDefinitionTests(unittest.TestCase):
    def test_default_registry_contains_research_skills(self):
        registry = build_default_skill_registry()

        self.assertTrue(registry.has("research.direction_generate"))
        self.assertTrue(registry.has("research.direction_score"))
        self.assertTrue(registry.has("research.project_design_generate"))

    def test_research_direction_skills_use_injected_agent(self):
        registry = build_default_skill_registry()
        executor = SkillExecutor(registry)

        class FakeDirectionAgent:
            def generate_directions(self, **kwargs):
                return [{"title": kwargs["requirement"]}]

            def score_directions(self, directions):
                return [{"title": directions[0]["title"], "scores": {"overall": 8}}]

        context = SkillExecutionContext(state={"direction_agent": FakeDirectionAgent()})

        generate_result = executor.execute(
            "research.direction_generate",
            {
                "literature_analysis": {"gaps": ["gap-a"]},
                "requirement": "方向A",
            },
            context=context,
        )
        score_result = executor.execute(
            "research.direction_score",
            {
                "directions": generate_result.output["directions"],
            },
            context=context,
        )

        self.assertEqual(generate_result.output["directions"][0]["title"], "方向A")
        self.assertEqual(score_result.output["scores"][0]["scores"]["overall"], 8)

    def test_project_design_skill_uses_injected_agent(self):
        registry = build_default_skill_registry()
        executor = SkillExecutor(registry)

        class FakeProjectDesignAgent:
            def generate_design(self, **kwargs):
                return {"topic": kwargs["direction"]["title"]}

        result = executor.execute(
            "research.project_design_generate",
            {
                "direction": {"title": "项目A"},
                "literature_analysis": {},
                "requirement": "项目A",
            },
            context=SkillExecutionContext(state={"project_design_agent": FakeProjectDesignAgent()}),
        )

        self.assertEqual(result.output["design"]["topic"], "项目A")


if __name__ == "__main__":
    unittest.main()
