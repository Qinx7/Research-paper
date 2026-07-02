"""HTML Deck workflow facade 测试。"""
import unittest

from tests.test_agent_workflow_records import FakeDb


class DeckGenerationWorkflowTests(unittest.TestCase):
    def test_deck_workflow_runs_skill_and_records_artifact_ref(self):
        from app.agents.workflows.deck_generation_workflow import run_deck_generation_workflow

        class FakeRouter:
            def resolve(self, *, domain, action):
                self.route = (domain, action)
                return type("Skill", (), {"id": "ppt.web_html_deck"})()

        class FakeExecutor:
            def execute(self, skill_id, payload, context=None):
                self.skill_id = skill_id
                self.payload = payload
                self.context = context
                return type("Result", (), {
                    "skill_id": skill_id,
                    "output": {
                        "artifact_type": "html_deck",
                        "title": payload["deck_title"],
                        "object_key": "generated/decks/demo/index.html",
                        "filename": "index.html",
                        "theme": payload["theme"],
                        "slide_count": len(payload["slides_outline"]),
                        "preview_url": "/api/ppt/html-deck/preview/generated/decks/demo/index.html",
                        "download_url": "/api/ppt/html-deck/download/generated/decks/demo/index.html",
                    },
                })()

        fake_router = FakeRouter()
        fake_executor = FakeExecutor()
        fake_runtime = type("Runtime", (), {
            "router": fake_router,
            "executor": fake_executor,
        })()
        db = FakeDb()

        result = run_deck_generation_workflow(
            deck_title="测试 Deck",
            slides_outline=[{"title": "第一页"}],
            theme="paper",
            user_id="user-1",
            project_id="project-1",
            skill_runtime=fake_runtime,
            record_db=db,
        )

        self.assertEqual(fake_router.route, ("ppt", "preview_html_deck"))
        self.assertEqual(fake_executor.skill_id, "ppt.web_html_deck")
        self.assertEqual(result["object_key"], "generated/decks/demo/index.html")
        self.assertEqual(result["workflow_status"], "success")
        self.assertEqual(db.runs[0].result_ref["artifact_id"], "generated/decks/demo/index.html")
        self.assertEqual(db.runs[0].result_ref["object_key"], "generated/decks/demo/index.html")
        self.assertEqual(db.runs[0].trigger_source, "ppt_page")


if __name__ == "__main__":
    unittest.main()
