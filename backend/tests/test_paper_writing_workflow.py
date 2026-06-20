import unittest
import uuid
from types import SimpleNamespace


class FakeQuery:
    def __init__(self, items):
        self.items = list(items)

    def filter(self, *args):
        return self

    def order_by(self, *args):
        return self

    def limit(self, *args):
        return self

    def all(self):
        return list(self.items)

    def first(self):
        return self.items[0] if self.items else None


class FakeDb:
    def __init__(self, draft, outcomes=None, papers=None):
        self.draft = draft
        self.outcomes = outcomes or []
        self.papers = papers or []
        self.commits = 0
        self.runs = []
        self.steps = []
        self.run_id = uuid.uuid4()
        self.step_id = uuid.uuid4()

    def query(self, model):
        name = getattr(model, "__name__", "")
        if name == "Draft":
            return FakeQuery([self.draft])
        if name == "Outcome":
            return FakeQuery(self.outcomes)
        if name == "Paper":
            return FakeQuery(self.papers)
        if name == "AgentWorkflowRun":
            return FakeQuery(self.runs)
        if name == "AgentWorkflowStep":
            return FakeQuery(self.steps)
        return FakeQuery([])

    def add(self, item):
        name = item.__class__.__name__
        if name == "AgentWorkflowRun":
            item.id = self.run_id
            self.runs.append(item)
        elif name == "AgentWorkflowStep":
            item.id = self.step_id
            self.steps.append(item)

    def commit(self):
        self.commits += 1

    def refresh(self, item):
        return item

    def rollback(self):
        pass


class PaperWritingWorkflowTests(unittest.TestCase):
    def test_chapter_workflow_generates_validates_and_saves_chapter(self):
        from app.agents.workflows.paper_writing_workflow import run_generate_chapter_workflow

        draft = SimpleNamespace(
            id=uuid.uuid4(),
            project_id=uuid.uuid4(),
            outline={"chapters": [{"key": "chapter_1_introduction", "title": "第一章 绪论"}]},
            content={},
            version=1,
        )
        outcomes = [SimpleNamespace(name="访谈材料", description="访谈记录", outcome_type="experiment_record")]
        papers = [SimpleNamespace(title="真实论文A", abstract="文献摘要")]
        db = FakeDb(draft, outcomes=outcomes, papers=papers)
        observed = {}

        class FakeWritingAgent:
            def generate_chapter(self, **kwargs):
                observed.update(kwargs)
                return {
                    "chapter_key": "chapter_1_introduction",
                    "title": "第一章 绪论",
                    "content": "正文引用真实论文A和访谈材料。",
                    "citations": ["真实论文A", "访谈材料"],
                    "data_based": False,
                }

        def fake_retrieve(_db, project_id, query, limit, min_confidence):
            return [{"title": "内部证据", "evidence_text": "访谈记录"}]

        result = run_generate_chapter_workflow(
            db=db,
            draft=draft,
            chapter_key="chapter_1_introduction",
            writing_agent=FakeWritingAgent(),
            retrieve_evidence=fake_retrieve,
            record_db=db,
        )

        self.assertEqual(result["chapter_key"], "chapter_1_introduction")
        self.assertEqual(result["status"], "generated")
        self.assertEqual(draft.content["chapter_1_introduction"]["content"], "正文引用真实论文A和访谈材料。")
        self.assertEqual(draft.content["chapter_1_introduction"]["citations"], ["真实论文A", "访谈材料"])
        self.assertEqual(draft.version, 2)
        self.assertIn("访谈材料", observed["outcomes_summary"])
        self.assertIn("已有文献", observed["literature_context"])
        self.assertEqual(len(db.steps), 5)
        self.assertEqual(db.runs[0].status, "success")
        self.assertEqual(db.runs[0].output_snapshot["chapter_key"], "chapter_1_introduction")
        self.assertEqual(db.runs[0].output_snapshot["evidence_counts"]["papers"], 1)

    def test_chapter_workflow_fails_before_save_when_grounding_rejects(self):
        from app.agents.workflows.paper_writing_workflow import run_generate_chapter_workflow

        draft = SimpleNamespace(
            id=uuid.uuid4(),
            project_id=uuid.uuid4(),
            outline={},
            content={},
            version=1,
        )
        db = FakeDb(draft)

        class FakeWritingAgent:
            def generate_chapter(self, **kwargs):
                return {
                    "chapter_key": "chapter_5_experiment",
                    "title": "第五章 实验设计与结果分析",
                    "content": "效率提升 99%。",
                    "citations": [],
                    "data_based": True,
                }

        with self.assertRaises(ValueError):
            run_generate_chapter_workflow(
                db=db,
                draft=draft,
                chapter_key="chapter_5_experiment",
                writing_agent=FakeWritingAgent(),
                retrieve_evidence=lambda *_args, **_kwargs: [],
                record_db=db,
            )

        self.assertEqual(draft.content, {})
        self.assertEqual(draft.version, 1)
        self.assertEqual(db.runs[0].status, "failed")
        failed_steps = [step for step in db.steps if step.status == "failed"]
        self.assertEqual(failed_steps[0].node_name, "grounding_guard")


if __name__ == "__main__":
    unittest.main()
