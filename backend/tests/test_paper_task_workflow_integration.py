import unittest
import uuid
from types import SimpleNamespace
from unittest.mock import patch


class FakeQuery:
    def __init__(self, items):
        self.items = list(items)

    def filter(self, *args):
        return self

    def all(self):
        return list(self.items)

    def first(self):
        return self.items[0] if self.items else None


class FakeDb:
    def __init__(self, draft):
        self.draft = draft
        self.closed = False
        self.commits = 0

    def query(self, model):
        name = getattr(model, "__name__", "")
        if name == "Draft":
            return FakeQuery([self.draft])
        return FakeQuery([])

    def commit(self):
        self.commits += 1

    def close(self):
        self.closed = True


class PaperTaskWorkflowIntegrationTests(unittest.TestCase):
    def test_async_generate_chapter_task_uses_paper_writing_workflow(self):
        from app.tasks import paper_task

        draft = SimpleNamespace(
            id=uuid.uuid4(),
            project_id=uuid.uuid4(),
            content={},
        )
        db = FakeDb(draft)
        observed = {}

        def fake_workflow(**kwargs):
            observed.update(kwargs)
            draft.content = {
                "chapter_1_introduction": {
                    "title": "第一章 绪论",
                    "content": "基于 workflow 生成",
                    "status": "generated",
                    "data_based": False,
                }
            }
            return {
                "chapter_key": "chapter_1_introduction",
                "title": "第一章 绪论",
                "content": "基于 workflow 生成",
                "status": "generated",
                "data_based": False,
                "citations": ["真实论文A"],
                "workflow_run_id": "workflow-run-id",
            }

        with patch.object(paper_task, "SessionLocal", return_value=db), \
             patch.object(paper_task, "run_generate_chapter_workflow", side_effect=fake_workflow), \
             patch.object(paper_task.paper_writing_agent, "generate_chapter", side_effect=AssertionError("异步任务不应直接调用写作 Agent")), \
             patch.object(paper_task, "check_draft", return_value=SimpleNamespace(model_dump=lambda mode: {"passed": True})):
            result = paper_task.generate_chapter_task.run(
                draft_id=str(draft.id),
                chapter_key="chapter_1_introduction",
                outcome_ids=["outcome-1"],
                literature_context="外部传入文献上下文",
            )

        self.assertEqual(observed["db"], db)
        self.assertEqual(observed["draft"], draft)
        self.assertEqual(observed["chapter_key"], "chapter_1_introduction")
        self.assertEqual(observed["record_db"], db)
        self.assertEqual(observed["outcome_ids"], ["outcome-1"])
        self.assertEqual(observed["literature_context_override"], "外部传入文献上下文")
        self.assertEqual(result["workflow_run_id"], "workflow-run-id")
        self.assertEqual(result["content"], "基于 workflow 生成")
        self.assertTrue(db.closed)


if __name__ == "__main__":
    unittest.main()
