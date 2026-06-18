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

    def all(self):
        return list(self.items)

    def first(self):
        return self.items[0] if self.items else None


class FakeDb:
    def __init__(self):
        self.project_id = uuid.uuid4()
        self.paper_id = uuid.uuid4()
        self.note_id = uuid.uuid4()
        self.user_id = uuid.uuid4()
        self.notes = []
        self.commits = 0
        self.deleted = []

    def query(self, model):
        name = getattr(model, "__name__", "")
        if name == "Project":
            return FakeQuery([SimpleNamespace(id=self.project_id, user_id=self.user_id)])
        if name == "Paper":
            return FakeQuery([SimpleNamespace(id=self.paper_id, project_id=self.project_id)])
        if name == "PaperNote":
            return FakeQuery(self.notes)
        return FakeQuery([])

    def add(self, item):
        item.id = self.note_id
        self.notes.append(item)

    def commit(self):
        self.commits += 1

    def refresh(self, item):
        return item

    def delete(self, item):
        self.deleted.append(item)
        self.notes.remove(item)

    def rollback(self):
        pass


class PaperNotesApiTests(unittest.TestCase):
    def setUp(self):
        from app.api import paper_notes

        self.api = paper_notes
        self.db = FakeDb()
        self.user = SimpleNamespace(id=self.db.user_id)

    def test_create_note_saves_project_paper_note(self):
        payload = self.api.PaperNoteCreate(
            project_id=str(self.db.project_id),
            paper_id=str(self.db.paper_id),
            note_type="finding",
            title="核心发现",
            content="AI 支持研究生论文写作信心提升。",
            evidence_text="Findings suggest improved writing confidence.",
            evidence_level="摘要级证据",
            confidence=80,
            tags=["AI", "论文写作"],
        )

        note = self.api.create_paper_note(payload, self.user, self.db)

        self.assertEqual(note.id, self.db.note_id)
        self.assertEqual(note.note_type, "finding")
        self.assertEqual(note.title, "核心发现")
        self.assertEqual(note.tags, ["AI", "论文写作"])
        self.assertEqual(self.db.commits, 1)

    def test_list_notes_filters_by_project_and_paper(self):
        existing = SimpleNamespace(
            id=self.db.note_id,
            project_id=self.db.project_id,
            paper_id=self.db.paper_id,
            note_type="summary",
            title="摘要",
            content="已有笔记",
            evidence_text=None,
            evidence_level=None,
            confidence=None,
            tags=[],
            note_metadata={},
            created_at=None,
            updated_at=None,
        )
        self.db.notes.append(existing)

        notes = self.api.list_paper_notes(
            project_id=str(self.db.project_id),
            paper_id=str(self.db.paper_id),
            current_user=self.user,
            db=self.db,
        )

        self.assertEqual(notes, [existing])

    def test_update_note_changes_only_provided_fields(self):
        existing = SimpleNamespace(
            id=self.db.note_id,
            project_id=self.db.project_id,
            paper_id=self.db.paper_id,
            note_type="summary",
            title="旧标题",
            content="旧内容",
            evidence_text=None,
            evidence_level=None,
            confidence=None,
            tags=[],
            note_metadata={},
            created_at=None,
            updated_at=None,
        )
        self.db.notes.append(existing)
        payload = self.api.PaperNoteUpdate(title="新标题", content="新内容")

        note = self.api.update_paper_note(self.db.note_id, payload, self.user, self.db)

        self.assertEqual(note.title, "新标题")
        self.assertEqual(note.content, "新内容")
        self.assertEqual(note.note_type, "summary")
        self.assertEqual(self.db.commits, 1)

    def test_delete_note_removes_existing_note(self):
        existing = SimpleNamespace(
            id=self.db.note_id,
            project_id=self.db.project_id,
            paper_id=self.db.paper_id,
            note_type="summary",
            title="摘要",
            content="已有笔记",
            evidence_text=None,
            evidence_level=None,
            confidence=None,
            tags=[],
            note_metadata={},
            created_at=None,
            updated_at=None,
        )
        self.db.notes.append(existing)

        result = self.api.delete_paper_note(self.db.note_id, self.user, self.db)

        self.assertIsNone(result)
        self.assertEqual(self.db.notes, [])
        self.assertEqual(self.db.deleted, [existing])
        self.assertEqual(self.db.commits, 1)


if __name__ == "__main__":
    unittest.main()
