import unittest
import uuid
from types import SimpleNamespace
from unittest.mock import mock_open, patch


class FakeDb:
    def __init__(self):
        self.closed = False
        self.commits = 0

    def commit(self):
        self.commits += 1

    def close(self):
        self.closed = True


class ProposalTaskWorkflowIntegrationTests(unittest.TestCase):
    def test_async_generate_proposal_task_uses_workflow_and_records_user(self):
        from app.tasks import proposal_task

        db = FakeDb()
        project_id = str(uuid.uuid4())
        design_id = str(uuid.uuid4())
        user_id = str(uuid.uuid4())
        proposal = SimpleNamespace(
            id=uuid.uuid4(),
            title="测试开题报告",
            content={"background": {"content": "研究背景"}},
            docx_path=None,
        )
        observed = {}

        def fake_workflow(**kwargs):
            observed.update(kwargs)
            return {
                "proposal": proposal,
                "sections_count": 1,
                "workflow_run_id": "workflow-run-id",
            }

        with patch.object(proposal_task, "SessionLocal", return_value=db), \
             patch.object(proposal_task, "run_generate_proposal_workflow", side_effect=fake_workflow), \
             patch.object(proposal_task, "_ensure_storage_dir"), \
             patch.object(proposal_task, "_build_docx", return_value=SimpleNamespace(read=lambda: b"docx")), \
             patch("builtins.open", mock_open()):
            result = proposal_task.generate_proposal_task.run(
                project_id=project_id,
                design_id=design_id,
                project_design={"topic": "测试课题"},
                research_direction={"title": "测试方向"},
                literature_context="真实文献上下文",
                user_id=user_id,
            )

        self.assertEqual(observed["db"], db)
        self.assertEqual(observed["project_id"], project_id)
        self.assertEqual(observed["design_id"], design_id)
        self.assertEqual(observed["record_db"], db)
        self.assertEqual(observed["user_id"], user_id)
        self.assertEqual(result["workflow_run_id"], "workflow-run-id")
        self.assertEqual(result["title"], "测试开题报告")
        self.assertTrue(db.closed)


if __name__ == "__main__":
    unittest.main()
