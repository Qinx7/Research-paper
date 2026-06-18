import unittest
import uuid
from types import SimpleNamespace
from unittest.mock import patch


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
        self.task_id = uuid.uuid4()
        self.tasks = []
        self.commits = 0
        self.deleted = []

    def query(self, model):
        name = getattr(model, "__name__", "")
        if name == "LiteratureSearchTask":
            return FakeQuery(self.tasks)
        return FakeQuery([])

    def add(self, item):
        item.id = self.task_id
        self.tasks.append(item)

    def commit(self):
        self.commits += 1

    def refresh(self, item):
        return item

    def delete(self, item):
        self.deleted.append(item)
        self.tasks.remove(item)

    def rollback(self):
        pass


class LiteratureSearchTaskTests(unittest.TestCase):
    def setUp(self):
        from app.schemas.paper import LiteratureSearchRequest

        self.db = FakeDb()
        self.payload = LiteratureSearchRequest(
            keywords_cn=["大语言模型"],
            keywords_en=["large language models"],
            mode="quick_search",
            library_scope="all",
            sources=["cnki", "semantic_scholar"],
        )

    def test_create_task_starts_as_pending(self):
        from app.services.literature_search_task_service import create_search_task

        task = create_search_task(self.db, self.payload)

        self.assertEqual(task.id, self.db.task_id)
        self.assertEqual(task.status, "pending")
        self.assertEqual(task.mode, "quick_search")
        self.assertEqual(task.library_scope, "all")
        self.assertEqual(task.selected_sources, ["cnki", "semantic_scholar"])
        self.assertIn("大语言模型", task.query)
        self.assertEqual(self.db.commits, 1)

    def test_infer_task_status_distinguishes_failed_partial_and_success(self):
        from app.services.literature_search_task_service import infer_task_status

        failed = infer_task_status(
            {
                "cnki": {"status": "gateway_timeout", "count": 0},
                "semantic_scholar": {"status": "rate_limited", "count": 0},
            },
            total_results=0,
        )
        partial = infer_task_status(
            {
                "cnki": {"status": "gateway_timeout", "count": 0},
                "crossref": {"status": "ok", "count": 3},
            },
            total_results=3,
        )
        empty_success = infer_task_status(
            {"crossref": {"status": "no_results", "count": 0}},
            total_results=0,
        )

        self.assertEqual(failed, "failed")
        self.assertEqual(partial, "partial")
        self.assertEqual(empty_success, "success")

    def test_mark_success_stores_source_diagnostics_and_snapshot(self):
        from app.services.literature_search_task_service import create_search_task, mark_task_success

        task = create_search_task(self.db, self.payload)
        result = {
            "total_found": 1,
            "selected_sources": ["cnki"],
            "source_statuses": {"cnki": {"status": "ok", "count": 1}},
            "papers": [
                {
                    "title": "测试文献",
                    "authors": ["作者"],
                    "year": 2024,
                    "source": "cnki",
                    "abstract": "这是较长摘要，需要被精简保存。",
                    "url": "https://example.com",
                    "citation_count": 3,
                }
            ],
        }

        updated = mark_task_success(self.db, task.id, result)

        self.assertEqual(updated.status, "success")
        self.assertEqual(updated.total_results, 1)
        self.assertEqual(updated.source_statuses["cnki"]["status"], "ok")
        self.assertEqual(updated.result_snapshot[0]["title"], "测试文献")
        self.assertEqual(self.db.commits, 2)

    def test_literature_search_response_includes_task_id_when_task_is_created(self):
        from app.api import literature

        task = SimpleNamespace(id=self.db.task_id)
        search_result = {
            "query": "large language models",
            "search_mode": "quick_search",
            "library_scope": "all",
            "selected_sources": ["cnki"],
            "total_found": 0,
            "sources": {"cnki": 0},
            "source_statuses": {"cnki": {"status": "no_results", "count": 0}},
            "papers": [],
        }

        with patch.object(literature, "create_literature_search_task", return_value=task), \
             patch.object(literature, "mark_literature_search_task_running") as mark_running, \
             patch.object(literature, "complete_literature_search_task") as complete_task, \
             patch.object(literature.literature_search_agent, "search_by_requirement", return_value=search_result), \
             patch.object(literature, "_save_papers_to_db", return_value=0):
            result = literature.search_literature(self.payload)

        self.assertEqual(result["task_id"], str(self.db.task_id))
        mark_running.assert_called_once_with(self.db.task_id)
        complete_task.assert_called_once()


if __name__ == "__main__":
    unittest.main()
