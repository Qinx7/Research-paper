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
    def __init__(self):
        self.project_id = uuid.uuid4()
        self.paper_id = uuid.uuid4()
        self.project = SimpleNamespace(
            id=self.project_id,
            name="研究生论文写作支持项目",
            research_field="教育技术",
            user_requirement="研究生成式人工智能如何支持论文写作",
            selected_topic="AI 写作支持",
            status="created",
        )
        self.paper = SimpleNamespace(
            id=self.paper_id,
            project_id=self.project_id,
            title="生成式人工智能支持研究生论文写作研究",
            authors="张三;李四",
            venue="现代教育技术",
            year=2024,
        )
        self.note = SimpleNamespace(
            id=uuid.uuid4(),
            project_id=self.project_id,
            paper_id=self.paper_id,
            note_type="finding",
            title="写作信心提升",
            content="受访研究生认为 AI 反馈能降低初稿写作焦虑。",
            evidence_text="AI 反馈帮助学生更快形成初稿并提升写作信心。",
            evidence_level="摘要级证据",
            confidence=85,
            tags=["AI写作", "研究生"],
            paper=self.paper,
            created_at=None,
            updated_at=None,
        )

    def query(self, model):
        name = getattr(model, "__name__", "")
        if name == "Project":
            return FakeQuery([self.project])
        if name == "Paper":
            return FakeQuery([self.paper])
        if name == "PaperNote":
            return FakeQuery([self.note])
        return FakeQuery([])


class PaperNoteEvidenceReuseTests(unittest.TestCase):
    def test_chat_project_context_returns_paper_note_evidence_cards(self):
        from app.api.chat import _build_project_private_context

        db = FakeDb()
        context, items = _build_project_private_context(
            db,
            str(db.project_id),
            "AI 写作如何提升研究生写作信心",
        )

        self.assertIn("内部证据卡片", context)
        self.assertTrue(any(item["kind"] == "paper_note" for item in items))
        note_item = next(item for item in items if item["kind"] == "paper_note")
        self.assertEqual(note_item["note_type"], "finding")
        self.assertIn("AI 反馈", note_item["evidence_text"])
        self.assertEqual(note_item["source_title"], "生成式人工智能支持研究生论文写作研究")
        self.assertTrue(any(item["kind"] == "project_paper" for item in items))

    def test_chat_search_evidence_bundle_keeps_internal_evidence_metadata(self):
        from app.schemas.chat import SearchEvidenceBundle

        bundle = SearchEvidenceBundle.model_validate({
            "task_id": "task-123",
            "external_papers": [],
            "source_statuses": {
                "cnki": {"status": "ok", "count": 2, "detail": "正常返回"},
            },
            "project_context_items": [
                {
                    "kind": "paper_note",
                    "title": "写作信心提升",
                    "content_excerpt": "受访研究生认为 AI 反馈能降低初稿写作焦虑。",
                    "score": 9,
                    "score_reasons": ["标题命中"],
                    "note_type": "finding",
                    "evidence_text": "AI 反馈帮助学生更快形成初稿并提升写作信心。",
                    "evidence_level": "摘要级证据",
                    "confidence": 85,
                    "source_title": "生成式人工智能支持研究生论文写作研究",
                    "action_url": "/projects/demo/literature/demo",
                    "action_label": "打开证据卡片",
                }
            ],
        })

        self.assertEqual(bundle.task_id, "task-123")
        self.assertEqual(bundle.source_statuses["cnki"].detail, "正常返回")
        self.assertEqual(bundle.project_context_items[0].source_title, "生成式人工智能支持研究生论文写作研究")
        self.assertEqual(bundle.project_context_items[0].confidence, 85)

    def test_draft_literature_context_includes_high_confidence_paper_notes_without_papers(self):
        from app.api.drafts import _build_literature_context

        db = FakeDb()

        class NotesOnlyDb(FakeDb):
            def query(self, model):
                name = getattr(model, "__name__", "")
                if name == "Paper":
                    return FakeQuery([])
                if name == "PaperNote":
                    return FakeQuery([db.note])
                return super().query(model)

        context = _build_literature_context(NotesOnlyDb(), db.project_id)

        self.assertIn("内部证据卡片", context)
        self.assertIn("写作信心提升", context)
        self.assertIn("AI 反馈帮助学生", context)


if __name__ == "__main__":
    unittest.main()
