import unittest
from unittest.mock import patch

import httpx

from app.agents.literature_search_agent import LiteratureSearchAgent
from app.services.cnki_search import CNKIClient
from app.services import literature_search as literature_search_module
from app.services.literature_search import SemanticScholarClient, PaperResult


class SearchResilienceTests(unittest.TestCase):
    def setUp(self):
        literature_search_module._cache.clear()
        literature_search_module._source_last_request_at.clear()
        literature_search_module._source_cooldown_until.clear()

    def test_semantic_scholar_falls_back_to_relaxed_query_when_strict_query_returns_empty(self):
        client = SemanticScholarClient(api_key="")
        calls: list[str] = []

        def fake_search_once(query: str, year_from: int, year_to: int, limit: int):
            calls.append(query)
            if " AND " in query:
                return []
            return [
                PaperResult(
                    title="Fallback Result",
                    authors=["Author"],
                    year=2024,
                    venue="Venue",
                    abstract="Abstract",
                    citation_count=10,
                    source="semantic_scholar",
                )
            ]

        with patch.object(client, "_search_once", side_effect=fake_search_once):
            results = client.search('"large language model" AND education', 2020, 2026, 5)

        self.assertEqual(len(results), 1)
        self.assertGreaterEqual(len(calls), 2)
        self.assertIn('"large language model" AND education', calls[0])
        self.assertNotIn(" AND ", calls[-1])

    def test_semantic_scholar_uses_multiple_query_fallbacks(self):
        client = SemanticScholarClient(api_key="")
        calls: list[str] = []

        def fake_search_once(query: str, year_from: int, year_to: int, limit: int):
            calls.append(query)
            if len(calls) < 3:
                return []
            return [
                PaperResult(
                    title="Core Term Result",
                    authors=["Author"],
                    year=2024,
                    venue="Venue",
                    abstract="Abstract",
                    citation_count=10,
                    source="semantic_scholar",
                )
            ]

        with patch.object(client, "_search_once", side_effect=fake_search_once):
            results = client.search('"large language model" AND education AND tutoring', 2020, 2026, 5)

        self.assertEqual(len(results), 1)
        self.assertEqual(len(calls), 3)
        self.assertEqual(calls[-1], "large language model")

    def test_cnki_gate_api_retries_retryable_errors(self):
        client = CNKIClient(headless=True, timeout=5)
        calls = {"count": 0}

        def fake_fetch(page, query, page_index):
            calls["count"] += 1
            if calls["count"] == 1:
                return {"status": "retryable_error", "detail": "http=504"}
            return {"status": "ok", "data": {"contentList": []}, "detail": "http=200"}

        with patch.object(client, "_fetch_gate_api", side_effect=fake_fetch):
            result = client._fetch_gate_api_with_retry(page=None, keyword="测试", page_index=1)

        self.assertEqual(result["status"], "ok")
        self.assertEqual(calls["count"], 2)

    def test_cn_source_shortens_query_when_long_query_returns_empty(self):
        agent = LiteratureSearchAgent()
        calls: list[str] = []

        def fake_search(query: str, year_from: int, year_to: int, limit: int):
            calls.append(query)
            if len(calls) == 1:
                return []
            return [
                PaperResult(
                    title="中文结果",
                    authors=["作者"],
                    year=2024,
                    venue="期刊",
                    abstract="摘要",
                    citation_count=3,
                    source="cnki",
                )
            ]

        with patch.object(agent.cnki, "search", side_effect=fake_search):
            results = agent._search_cn_source_with_fallbacks(
                agent.cnki,
                query_cn="大模型 教育领域 教育 应用研究现状",
                year_from=2020,
                year_to=2026,
                source_limit=5,
            )

        self.assertEqual(len(results), 1)
        self.assertEqual(calls[0], "大模型 教育领域 教育 应用研究现状")
        self.assertEqual(calls[1], "大模型 教育领域")

    def test_source_request_window_waits_between_same_source_calls(self):
        with patch("app.services.literature_search.time.time", side_effect=[100.0, 100.2]), \
             patch("app.services.literature_search.time.sleep") as mocked_sleep:
            literature_search_module._enter_source_request_window("semantic_scholar")
            literature_search_module._enter_source_request_window("semantic_scholar")

        mocked_sleep.assert_called_once()
        wait_seconds = mocked_sleep.call_args.args[0]
        self.assertGreater(wait_seconds, 0.0)

    def test_semantic_scholar_short_circuits_during_rate_limit_cooldown(self):
        client = SemanticScholarClient(api_key="")
        rate_limited_response = httpx.Response(
            429,
            headers={"Retry-After": "30"},
            request=httpx.Request("GET", "https://api.semanticscholar.org/graph/v1/paper/search"),
        )

        with patch("app.services.literature_search._http_get_with_retry", return_value=rate_limited_response) as mocked_get:
            first = client._search_once("first query", 2020, 2026, 5)
            second = client._search_once("second query", 2020, 2026, 5)

        self.assertEqual(first, [])
        self.assertEqual(second, [])
        self.assertEqual(mocked_get.call_count, 1)
        self.assertEqual(client.last_status, "rate_limited")
        self.assertIn("cooldown", client.last_detail)


if __name__ == "__main__":
    unittest.main()
