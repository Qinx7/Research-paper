import unittest

from app.agents.literature_search_agent import LiteratureSearchAgent
from app.services.literature_search import PaperResult


def _paper(title: str, source: str, score: float) -> dict:
    return {
        "paper": PaperResult(
            title=title,
            authors=["作者"],
            year=2024,
            venue="期刊",
            abstract="中文摘要" if source in {"cnki", "cqvip"} else "English abstract",
            citation_count=10,
            source=source,
        ),
        "language": "cn" if source in {"cnki", "cqvip"} else "en",
        "final_score": score,
        "relevance_score": score,
        "impact_score": score,
        "freshness_score": score,
        "quality_score": score,
        "quality_flags": [],
        "why_selected": "测试",
    }


class LiteratureResultCompositionTests(unittest.TestCase):
    def test_all_scope_keeps_both_languages_with_minimum_three(self):
        agent = LiteratureSearchAgent()
        ranked = [
            _paper("English 1", "openalex", 0.99),
            _paper("English 2", "semantic_scholar", 0.98),
            _paper("English 3", "openalex", 0.97),
            _paper("中文 1", "cnki", 0.60),
            _paper("中文 2", "cqvip", 0.59),
            _paper("中文 3", "cnki", 0.58),
            _paper("中文 4", "cnki", 0.57),
            _paper("中文 5", "cqvip", 0.56),
            _paper("中文 6", "cnki", 0.55),
            _paper("English 4", "openalex", 0.54),
        ]

        composed = agent._compose_results_by_scope(ranked, library_scope="all", limit=8)

        self.assertEqual(len(composed), 8)
        cn_count = sum(item["language"] == "cn" for item in composed)
        en_count = sum(item["language"] == "en" for item in composed)
        self.assertGreaterEqual(cn_count, 3, "中文文献应至少 3 篇")
        self.assertGreaterEqual(en_count, 3, "英文文献应至少 3 篇")

    def test_cn_and_en_scopes_are_language_pure(self):
        agent = LiteratureSearchAgent()
        ranked = [
            _paper("English 1", "openalex", 0.99),
            _paper("中文 1", "cnki", 0.98),
            _paper("English 2", "semantic_scholar", 0.97),
            _paper("中文 2", "cqvip", 0.96),
        ]

        cn_only = agent._compose_results_by_scope(ranked, library_scope="cn", limit=10)
        en_only = agent._compose_results_by_scope(ranked, library_scope="en", limit=10)

        self.assertTrue(cn_only)
        self.assertTrue(en_only)
        self.assertTrue(all(item["language"] == "cn" for item in cn_only))
        self.assertTrue(all(item["language"] == "en" for item in en_only))

    def test_all_scope_preserves_source_diversity_when_sources_have_results(self):
        agent = LiteratureSearchAgent()
        ranked = [
            _paper("OpenAlex 1", "openalex", 0.99),
            _paper("OpenAlex 2", "openalex", 0.98),
            _paper("OpenAlex 3", "openalex", 0.97),
            _paper("CNKI 1", "cnki", 0.70),
            _paper("CNKI 2", "cnki", 0.69),
            _paper("CQVIP 1", "cqvip", 0.68),
            _paper("Semantic 1", "semantic_scholar", 0.40),
        ]

        composed = agent._compose_results_by_scope(ranked, library_scope="all", limit=6)
        sources = {item["paper"].source for item in composed}

        self.assertIn("openalex", sources)
        self.assertIn("semantic_scholar", sources)
        self.assertIn("cnki", sources)
        self.assertIn("cqvip", sources)

    def test_all_scope_supplements_raw_source_when_strict_filter_keeps_one_source(self):
        agent = LiteratureSearchAgent()
        composed = [
            _paper("CNKI 1", "cnki", 0.90),
            _paper("CNKI 2", "cnki", 0.89),
        ]
        raw_results = [
            composed[0]["paper"],
            composed[1]["paper"],
            PaperResult(
                title="CQVIP supplemental",
                authors=["Author"],
                year=2024,
                venue="Venue",
                abstract="Chinese abstract",
                citation_count=0,
                source="cqvip",
            ),
        ]

        supplemented = agent._supplement_all_scope_source_diversity(
            composed=composed,
            raw_results=raw_results,
            keywords_cn=["Chinese"],
            keywords_en=[],
            year_from=2020,
            year_to=2026,
            limit=5,
            prefer_high_impact=True,
        )

        sources = {item["paper"].source for item in supplemented}
        self.assertIn("cnki", sources)
        self.assertIn("cqvip", sources)

    def test_all_scope_replaces_duplicate_source_when_limit_is_full(self):
        agent = LiteratureSearchAgent()
        composed = [
            _paper(f"CNKI {index}", "cnki", 0.90 - index * 0.01)
            for index in range(1, 9)
        ]
        raw_results = [item["paper"] for item in composed]
        raw_results.append(
            PaperResult(
                title="CQVIP supplemental",
                authors=["Author"],
                year=2024,
                venue="Venue",
                abstract="Chinese abstract",
                citation_count=0,
                source="cqvip",
            )
        )

        supplemented = agent._supplement_all_scope_source_diversity(
            composed=composed,
            raw_results=raw_results,
            keywords_cn=["Chinese"],
            keywords_en=[],
            year_from=2020,
            year_to=2026,
            limit=8,
            prefer_high_impact=True,
        )

        sources = {item["paper"].source for item in supplemented}
        self.assertEqual(len(supplemented), 8)
        self.assertIn("cnki", sources)
        self.assertIn("cqvip", sources)


if __name__ == "__main__":
    unittest.main()
