import unittest
from unittest.mock import patch

from app.api import chat, literature
from app.schemas.paper import LiteratureSearchRequest


class SearchModeForwardingTests(unittest.TestCase):
    def test_literature_api_forwards_search_mode_parameters(self):
        payload = LiteratureSearchRequest(
            keywords_cn=["大模型", "教育"],
            keywords_en=["large language model", "education"],
            year_from=2021,
            year_to=2025,
            mode="deep_research",
            library_scope="cn",
            min_citation_count=12,
            prefer_high_impact=True,
        )

        observed = {}

        def fake_search(**kwargs):
            observed.update(kwargs)
            return {
                "query": "test",
                "search_mode": "deep_research",
                "library_scope": "cn",
                "selected_sources": ["cnki", "cqvip"],
                "total_found": 0,
                "sources": {"cnki": 0, "cqvip": 0},
                "papers": [],
            }

        with patch.object(literature, "run_literature_search_workflow", side_effect=fake_search):
            with patch.object(literature, "_save_papers_to_db", return_value=0), \
                 patch.object(literature, "create_literature_search_task", return_value=None):
                result = literature.search_literature(payload)

        self.assertEqual(result["search_mode"], "deep_research")
        self.assertEqual(observed["keywords_cn"], ["大模型", "教育"])
        self.assertEqual(observed["keywords_en"], ["large language model", "education"])
        self.assertEqual(observed["year_from"], 2021)
        self.assertEqual(observed["year_to"], 2025)
        self.assertEqual(observed["mode"], "deep_research")
        self.assertEqual(observed["library_scope"], "cn")
        self.assertEqual(observed["min_citation_count"], 12)
        self.assertTrue(observed["prefer_high_impact"])

    def test_literature_api_forwards_quality_filters(self):
        payload = LiteratureSearchRequest(
            keywords_cn=["医学教育"],
            keywords_en=["medical education"],
            mode="literature_review",
            library_scope="all",
            sources=["pubmed", "openalex"],
            open_access_only=True,
            quality_tags=["ieee", "jcr"],
        )

        observed = {}

        def fake_search(**kwargs):
            observed.update(kwargs)
            return {
                "query": "test",
                "search_mode": "literature_review",
                "library_scope": "all",
                "selected_sources": ["pubmed", "openalex"],
                "total_found": 0,
                "sources": {"pubmed": 0, "openalex": 0},
                "papers": [],
            }

        with patch.object(literature, "run_literature_search_workflow", side_effect=fake_search):
            with patch.object(literature, "_save_papers_to_db", return_value=0), \
                 patch.object(literature, "create_literature_search_task", return_value=None):
                result = literature.search_literature(payload)

        self.assertEqual(result["selected_sources"], ["pubmed", "openalex"])
        self.assertTrue(observed["open_access_only"])
        self.assertEqual(observed["quality_tags"], ["ieee", "jcr"])

    def test_chat_status_and_keyword_search_follow_library_scope(self):
        status = chat._build_scope_search_status(
            cn_keywords=[],
            en_keywords=["RAG"],
            library_scope="cn",
        )
        should_run = chat._should_run_keyword_search(
            cn_keywords=[],
            en_keywords=["RAG"],
            library_scope="cn",
        )

        self.assertEqual(status["status"], "thinking")
        self.assertIn("中文", status["message"])
        self.assertFalse(should_run)

        status_all = chat._build_scope_search_status(
            cn_keywords=["大模型"],
            en_keywords=["education"],
            library_scope="all",
        )
        should_run_all = chat._should_run_keyword_search(
            cn_keywords=["大模型"],
            en_keywords=["education"],
            library_scope="all",
        )

        self.assertEqual(status_all["status"], "searching_all")
        self.assertTrue(should_run_all)


if __name__ == "__main__":
    unittest.main()
