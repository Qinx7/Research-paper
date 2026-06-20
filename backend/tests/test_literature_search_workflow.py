import unittest


class LiteratureSearchWorkflowTests(unittest.TestCase):
    def test_workflow_forwards_search_parameters_and_adds_summary(self):
        from app.agents.workflows.literature_search_workflow import run_literature_search_workflow

        observed = {}

        class FakeSearchAgent:
            def search_by_requirement(self, **kwargs):
                observed.update(kwargs)
                return {
                    "query": "large language models AND education",
                    "search_mode": "literature_review",
                    "library_scope": "all",
                    "selected_sources": ["openalex", "cnki"],
                    "total_found": 2,
                    "sources": {"openalex": 1, "cnki": 1},
                    "source_statuses": {
                        "openalex": {"status": "ok", "count": 1, "detail": ""},
                        "cnki": {"status": "ok", "count": 1, "detail": ""},
                    },
                    "papers": [
                        {
                            "title": "Large language models for education feedback",
                            "authors": ["Author A"],
                            "year": 2024,
                            "venue": "IEEE Transactions on Learning Technologies",
                            "abstract": "Large language models support classroom feedback analysis.",
                            "citation_count": 12,
                            "source": "openalex",
                            "language": "en",
                            "final_score": 0.86,
                            "why_selected": "与检索主题高度相关",
                        },
                        {
                            "title": "大语言模型赋能高校课堂反馈研究",
                            "authors": ["作者甲"],
                            "year": 2023,
                            "venue": "现代教育技术",
                            "abstract": "文章讨论大语言模型在高校课堂反馈分析中的应用，并提到 JCR 期刊评价。",
                            "citation_count": 6,
                            "source": "cnki",
                            "language": "cn",
                            "final_score": 0.82,
                            "why_selected": "与检索主题较相关",
                        },
                    ],
                }

        result = run_literature_search_workflow(
            keywords_cn=["大语言模型", "教育反馈"],
            keywords_en=["large language models", "education feedback"],
            year_from=2021,
            year_to=2025,
            limit=30,
            mode="literature_review",
            library_scope="all",
            sources=["openalex", "cnki"],
            min_citation_count=2,
            prefer_high_impact=True,
            open_access_only=False,
            quality_tags=["jcr"],
            search_agent=FakeSearchAgent(),
        )

        self.assertEqual(observed["keywords_cn"], ["大语言模型", "教育反馈"])
        self.assertEqual(observed["keywords_en"], ["large language models", "education feedback"])
        self.assertEqual(observed["year_from"], 2021)
        self.assertEqual(observed["year_to"], 2025)
        self.assertEqual(observed["mode"], "literature_review")
        self.assertEqual(observed["library_scope"], "all")
        self.assertEqual(observed["sources"], ["openalex", "cnki"])
        self.assertEqual(observed["min_citation_count"], 2)
        self.assertTrue(observed["prefer_high_impact"])
        self.assertFalse(observed["open_access_only"])
        self.assertEqual(observed["quality_tags"], ["jcr"])
        self.assertEqual(result["workflow_status"], "success")
        self.assertEqual(result["search_summary"]["status"], "ready")
        self.assertIn("本次检索", result["search_summary"]["overview"])
        self.assertEqual(result["search_summary"]["representative_papers"][0]["title"], "Large language models for education feedback")
        self.assertEqual(result["search_diagnostics"]["source_notes"]["openalex"], "已返回 1 条")
        self.assertEqual(result["search_summary"]["authority_summary"]["verified_counts"]["ieee"], 1)
        self.assertEqual(result["search_summary"]["authority_summary"]["pending_counts"]["jcr"], 1)

    def test_workflow_marks_summary_insufficient_when_no_papers(self):
        from app.agents.workflows.literature_search_workflow import run_literature_search_workflow

        class EmptySearchAgent:
            def search_by_requirement(self, **kwargs):
                return {
                    "query": "rare topic",
                    "search_mode": "quick_search",
                    "library_scope": "cn",
                    "selected_sources": ["cnki", "cqvip"],
                    "total_found": 0,
                    "sources": {"cnki": 0, "cqvip": 0},
                    "source_statuses": {
                        "cnki": {"status": "gateway_timeout", "count": 0, "detail": "504 Gateway Time-out"},
                        "cqvip": {"status": "no_results", "count": 0, "detail": ""},
                    },
                    "papers": [],
                }

        result = run_literature_search_workflow(
            keywords_cn=["罕见主题"],
            keywords_en=[],
            year_from=2020,
            year_to=2026,
            library_scope="cn",
            search_agent=EmptySearchAgent(),
        )

        self.assertEqual(result["total_found"], 0)
        self.assertEqual(result["search_summary"]["status"], "insufficient")
        self.assertIn("暂无相关文献", result["search_summary"]["overview"])
        self.assertIn("本次检索结果不足", result["search_summary"]["warnings"][0])
        self.assertEqual(result["search_diagnostics"]["source_notes"]["cnki"], "服务超时，建议稍后重试")


if __name__ == "__main__":
    unittest.main()
