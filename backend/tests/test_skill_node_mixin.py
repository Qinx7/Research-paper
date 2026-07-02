"""workflow skill 节点辅助层测试。"""
import unittest
from types import SimpleNamespace


class SkillNodeMixinTests(unittest.TestCase):
    def test_run_skill_action_records_resolved_skill_and_metadata(self):
        from app.agents.orchestration import AgentWorkflowState
        from app.agents.workflows.skill_node_mixin import SkillNodeMixin

        class FakeRouter:
            def resolve(self, *, domain, action):
                return SimpleNamespace(
                    id="paper.chapter_draft",
                    version="3",
                    input_schema={"required": ["chapter_key"]},
                )

        class FakeExecutor:
            def execute(self, skill_id, payload, context=None):
                self.skill_id = skill_id
                self.payload = payload
                self.context = context
                return SimpleNamespace(
                    skill_id=skill_id,
                    output={"chapter_key": payload["chapter_key"], "content": "正文"},
                )

        executor = FakeExecutor()
        state = AgentWorkflowState(
            workflow_name="paper_chapter_generation",
            user_id="user-1",
            project_id="project-1",
            input={"draft_id": "draft-1"},
        )

        outcome = SkillNodeMixin().run_skill_action(
            state,
            skill_executor=executor,
            skill_router=FakeRouter(),
            domain="paper",
            action="write_chapter",
            payload={"chapter_key": "chapter_1_introduction"},
            context_state={"writing_agent": object()},
        )

        self.assertTrue(outcome.ok)
        self.assertEqual(outcome.output["content"], "正文")
        self.assertEqual(state.metadata["resolved_skills"], {"write_chapter": "paper.chapter_draft"})
        self.assertEqual(executor.skill_id, "paper.chapter_draft")
        self.assertEqual(executor.context.user_id, "user-1")
        self.assertEqual(executor.context.project_id, "project-1")
        self.assertEqual(executor.context.draft_id, "draft-1")
        self.assertEqual(outcome.metadata["domain"], "paper")
        self.assertEqual(outcome.metadata["action"], "write_chapter")
        self.assertEqual(outcome.metadata["skill_id"], "paper.chapter_draft")
        self.assertEqual(outcome.metadata["resolved_skill_id"], "paper.chapter_draft")
        self.assertEqual(outcome.metadata["skill_version"], "3")
        self.assertEqual(outcome.metadata["input_required"], ["chapter_key"])
        self.assertEqual(outcome.metadata["output_keys"], ["chapter_key", "content"])
        self.assertGreaterEqual(outcome.metadata["duration_ms"], 0)

    def test_run_skill_action_converts_skill_error_to_failed_result(self):
        from app.agents.orchestration import AgentWorkflowState
        from app.agents.workflows.skill_node_mixin import SkillNodeMixin

        class BrokenRouter:
            def resolve(self, *, domain, action):
                raise RuntimeError("route missing")

        outcome = SkillNodeMixin().run_skill_action(
            AgentWorkflowState(workflow_name="paper_chapter_generation"),
            skill_executor=object(),
            skill_router=BrokenRouter(),
            domain="paper",
            action="write_chapter",
            payload={},
        )

        self.assertFalse(outcome.ok)
        self.assertEqual(outcome.failed_result.status, "failed")
        self.assertIn("paper.write_chapter", outcome.failed_result.error)
        self.assertIn("route missing", outcome.failed_result.error)


if __name__ == "__main__":
    unittest.main()
