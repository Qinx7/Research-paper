import threading
import unittest
from unittest.mock import patch

from app.api import chat


class ChatSearchThreadingTests(unittest.IsolatedAsyncioTestCase):
    async def test_literature_search_runs_in_worker_thread(self):
        caller_thread_id = threading.get_ident()
        observed = {}

        def fake_search(**kwargs):
            observed["thread_id"] = threading.get_ident()
            observed["kwargs"] = kwargs
            return {"papers": []}

        with patch.object(chat.literature_search_agent, "search_by_requirement", side_effect=fake_search):
            result = await chat._run_literature_search_in_worker(
                keywords_cn=["大模型", "教育"],
                keywords_en=[],
                year_from=2020,
                year_to=2026,
                limit=8,
                mode="quick_search",
                library_scope="cn",
                min_citation_count=0,
                prefer_high_impact=False,
            )

        self.assertEqual(result, {"papers": []})
        self.assertEqual(observed["kwargs"]["keywords_cn"], ["大模型", "教育"])
        self.assertNotEqual(observed["thread_id"], caller_thread_id)

    async def test_literature_search_worker_forwards_quality_filters(self):
        observed = {}

        def fake_search(**kwargs):
            observed["kwargs"] = kwargs
            return {"papers": []}

        with patch.object(chat.literature_search_agent, "search_by_requirement", side_effect=fake_search):
            await chat._run_literature_search_in_worker(
                keywords_cn=["医学教育"],
                keywords_en=["medical education"],
                year_from=2020,
                year_to=2026,
                limit=8,
                mode="literature_review",
                library_scope="en",
                min_citation_count=0,
                prefer_high_impact=True,
                open_access_only=True,
                quality_tags=["pubmed"],
            )

        self.assertTrue(observed["kwargs"]["open_access_only"])
        self.assertEqual(observed["kwargs"]["quality_tags"], ["pubmed"])


if __name__ == "__main__":
    unittest.main()
