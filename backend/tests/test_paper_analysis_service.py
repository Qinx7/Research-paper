import unittest

from app.services.paper_analysis_service import analyze_saved_paper


class PaperAnalysisServiceTests(unittest.TestCase):
    def test_analyze_saved_paper_extracts_summary_level_evidence(self):
        paper = {
            "title": "Generative AI support for postgraduate thesis writing",
            "abstract": (
                "This empirical study investigates how generative AI tools support postgraduate thesis writing. "
                "A survey and interview design was used to examine writing confidence, research productivity, "
                "and perceived research quality among postgraduate students. Findings suggest that AI assistance "
                "can improve writing confidence, while ethical risks and academic integrity remain key limitations."
            ),
            "venue": "Journal of Research",
            "year": 2025,
        }

        result = analyze_saved_paper(paper, project_requirement="研究生成式人工智能支持研究生论文写作")

        self.assertEqual(result["evidence_level"], "摘要级证据")
        self.assertIn("generative AI", result["research_question"])
        self.assertIn("survey", result["method"].lower())
        self.assertIn("writing confidence", result["key_findings"])
        self.assertEqual(result["warnings"], [])

    def test_analyze_saved_paper_does_not_fabricate_when_abstract_missing(self):
        paper = {
            "title": "A title without abstract",
            "abstract": None,
            "venue": "Unknown Journal",
            "year": 2024,
        }

        result = analyze_saved_paper(paper, project_requirement="测试课题")

        self.assertEqual(result["evidence_level"], "证据不足")
        self.assertEqual(result["research_question"], "暂无足够依据")
        self.assertEqual(result["method"], "暂无足够依据")
        self.assertEqual(result["sample_or_data"], "暂无足够依据")
        self.assertEqual(result["key_findings"], "暂无足够依据")
        self.assertEqual(result["limitations"], "暂无足够依据")
        self.assertTrue(result["warnings"])


if __name__ == "__main__":
    unittest.main()
