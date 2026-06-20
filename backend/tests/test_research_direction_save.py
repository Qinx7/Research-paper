import unittest
import uuid


class FakeDb:
    def __init__(self):
        self.added = []
        self.committed = False
        self.closed = False
        self.executed = []

    def add(self, item):
        self.added.append(item)
        item.id = uuid.uuid4()

    def flush(self):
        return None

    def commit(self):
        self.committed = True

    def rollback(self):
        return None

    def execute(self, statement):
        self.executed.append(str(statement))
        return None

    def close(self):
        self.closed = True


class ResearchDirectionSaveTests(unittest.TestCase):
    def test_save_single_direction_preserves_direction_and_score(self):
        import app.api.research as research_api

        fake_db = FakeDb()
        original_session_local = research_api.SessionLocal
        research_api.SessionLocal = lambda: fake_db
        project_id = uuid.uuid4()
        direction = {
            "title": "基于RAG的课程问答系统研究",
            "background": "现有课程问答需要提升可追溯性。",
            "research_questions": ["如何提升回答可信度？"],
            "methods": ["系统设计法", "实验对比法"],
            "expected_outputs": ["系统原型", "实验报告"],
            "innovation": ["课程知识库增强"],
        }
        score = {
            "title": direction["title"],
            "scores": {
                "feasibility": 8,
                "overall": 9,
            },
        }

        try:
            saved_id = research_api._save_single_direction_to_db(direction, score, project_id)
        finally:
            research_api.SessionLocal = original_session_local

        self.assertIsNotNone(saved_id)
        self.assertTrue(fake_db.committed)
        self.assertTrue(fake_db.closed)
        self.assertEqual(len(fake_db.added), 1)
        saved = fake_db.added[0]
        self.assertEqual(saved.project_id, project_id)
        self.assertEqual(saved.title, direction["title"])
        self.assertEqual(saved.feasibility_score, 8.0)
        self.assertEqual(saved.recommendation_score, 9.0)
        self.assertEqual(saved.content["scores"], score["scores"])

    def test_save_single_direction_falls_back_when_content_column_is_missing(self):
        import app.api.research as research_api

        fake_db = FakeDb()
        original_session_local = research_api.SessionLocal
        original_has_column = research_api._table_has_column
        research_api.SessionLocal = lambda: fake_db
        research_api._table_has_column = lambda *_args, **_kwargs: False
        project_id = uuid.uuid4()
        direction = {
            "title": "具身智能系统研究",
            "background": "测试兼容旧表结构。",
            "research_questions": ["如何保证保存成功？"],
            "methods": ["系统设计法"],
            "expected_outputs": ["原型"],
            "innovation": ["兼容旧库"],
        }
        score = {
            "title": direction["title"],
            "scores": {
                "feasibility": 7,
                "overall": 7,
            },
        }

        try:
            saved_id = research_api._save_single_direction_to_db(direction, score, project_id)
        finally:
            research_api.SessionLocal = original_session_local
            research_api._table_has_column = original_has_column

        self.assertIsNotNone(saved_id)
        self.assertTrue(fake_db.committed)
        self.assertTrue(fake_db.closed)
        saved = fake_db.added[0]
        self.assertFalse(hasattr(saved, "content") and saved.content is None is False)


if __name__ == "__main__":
    unittest.main()
