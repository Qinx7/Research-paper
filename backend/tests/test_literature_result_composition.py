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
    def test_chinese_query_without_translation_does_not_search_english_sources(self):
        class DummyEnglishClient:
            last_status = "ok"
            last_detail = ""

            def __init__(self):
                self.called = False

            def search(self, query, year_from, year_to, limit):
                self.called = True
                return [
                    PaperResult(
                        title="Irrelevant English result",
                        authors=["Author"],
                        year=2024,
                        venue="Venue",
                        abstract="No relation to the Chinese query.",
                        citation_count=100,
                        source="openalex",
                    )
                ]

        agent = LiteratureSearchAgent()
        agent.openalex = DummyEnglishClient()
        agent._ensure_en_keywords = lambda keywords_cn: []

        result = agent.search_by_requirement(
            keywords_cn=["生物信息在大语言模型中的应用"],
            keywords_en=["生物信息在大语言模型中的应用"],
            year_from=2020,
            year_to=2026,
            limit=5,
            library_scope="all",
            sources=["openalex"],
        )

        self.assertFalse(agent.openalex.called)
        self.assertEqual(result["papers"], [])

    def test_rank_results_filters_irrelevant_high_citation_papers(self):
        agent = LiteratureSearchAgent()
        ranked = agent._rank_results(
            [
                PaperResult(
                    title="The twin global crises of climate change and water",
                    authors=["Author"],
                    year=2023,
                    venue="Nature",
                    abstract="Climate change and water security require accelerated action.",
                    citation_count=10000,
                    source="crossref",
                ),
                PaperResult(
                    title="Large language models for bioinformatics",
                    authors=["Author"],
                    year=2024,
                    venue="Bioinformatics",
                    abstract="Large language models support bioinformatics applications and biological sequence analysis.",
                    citation_count=12,
                    source="openalex",
                ),
            ],
            keywords_cn=["生物信息", "大语言模型"],
            keywords_en=["large language models", "bioinformatics"],
            year_from=2020,
            year_to=2026,
            library_scope="all",
            min_citation_count=0,
            prefer_high_impact=True,
        )

        titles = [item["paper"].title for item in ranked]
        self.assertIn("Large language models for bioinformatics", titles)
        self.assertNotIn("The twin global crises of climate change and water", titles)

    def test_chinese_only_english_keywords_are_normalized_away(self):
        agent = LiteratureSearchAgent()

        normalized = agent._normalize_english_keywords(["生物信息在大语言模型中的应用"])

        self.assertEqual(normalized, [])

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

    def test_open_access_filter_keeps_only_open_access_papers(self):
        agent = LiteratureSearchAgent()
        papers = [
            PaperResult(
                title="OA paper",
                authors=["Author"],
                year=2024,
                venue="Venue",
                abstract="English abstract",
                citation_count=10,
                source="openalex",
                is_open_access=True,
            ),
            PaperResult(
                title="Closed paper",
                authors=["Author"],
                year=2024,
                venue="Venue",
                abstract="English abstract",
                citation_count=10,
                source="openalex",
                is_open_access=False,
            ),
        ]

        ranked = agent._rank_results(
            papers,
            keywords_cn=[],
            keywords_en=["paper"],
            year_from=2020,
            year_to=2026,
            library_scope="all",
            min_citation_count=0,
            prefer_high_impact=False,
            open_access_only=True,
            quality_tags=[],
        )

        titles = [item["paper"].title for item in ranked]
        self.assertEqual(titles, ["OA paper"])

    def test_quality_tag_filter_keeps_matching_inference_labels(self):
        agent = LiteratureSearchAgent()
        papers = [
            PaperResult(
                title="IEEE conference paper",
                authors=["Author"],
                year=2024,
                venue="Proceedings of IEEE Conference on AI",
                abstract="English abstract",
                citation_count=10,
                source="crossref",
            ),
            PaperResult(
                title="General journal paper",
                authors=["Author"],
                year=2024,
                venue="General Journal",
                abstract="English abstract",
                citation_count=10,
                source="openalex",
            ),
        ]

        ranked = agent._rank_results(
            papers,
            keywords_cn=[],
            keywords_en=["paper"],
            year_from=2020,
            year_to=2026,
            library_scope="all",
            min_citation_count=0,
            prefer_high_impact=False,
            open_access_only=False,
            quality_tags=["ieee"],
        )

        titles = [item["paper"].title for item in ranked]
        self.assertEqual(titles, ["IEEE conference paper"])

    def test_resolve_sources_accepts_pubmed(self):
        agent = LiteratureSearchAgent()

        sources = agent._resolve_sources("all", ["pubmed", "openalex"])

        self.assertEqual(sources, ["pubmed", "openalex"])


if __name__ == "__main__":
    unittest.main()
