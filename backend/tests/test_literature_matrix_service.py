import unittest

from app.services.literature_matrix_service import build_literature_matrix


class LiteratureMatrixServiceTests(unittest.TestCase):
    def test_build_literature_matrix_uses_paper_metadata_and_analysis(self):
        papers = [
            {
                "title": "Generative AI support for thesis writing",
                "authors": "Alice;Bob",
                "year": 2025,
                "source": "openalex",
                "abstract": (
                    "This empirical study investigates generative AI support for thesis writing. "
                    "A survey design was used with postgraduate students. Findings suggest improved writing confidence."
                ),
            }
        ]

        result = build_literature_matrix(papers, project_requirement="研究 AI 支持论文写作")

        self.assertEqual(result["total"], 1)
        self.assertEqual(result["rows"][0]["author_year"], "Alice 等（2025）")
        self.assertEqual(result["rows"][0]["source"], "openalex")
        self.assertIn("survey", result["rows"][0]["method"].lower())
        self.assertEqual(result["rows"][0]["evidence_level"], "摘要级证据")

    def test_build_literature_matrix_marks_missing_abstract_as_insufficient(self):
        papers = [
            {
                "title": "Title only paper",
                "authors": None,
                "year": None,
                "source": "cnki",
                "abstract": None,
            }
        ]

        result = build_literature_matrix(papers, project_requirement="测试课题")

        self.assertEqual(result["total"], 1)
        row = result["rows"][0]
        self.assertEqual(row["method"], "暂无足够依据")
        self.assertEqual(row["key_findings"], "暂无足够依据")
        self.assertEqual(row["evidence_level"], "证据不足")
        self.assertTrue(row["warnings"])


if __name__ == "__main__":
    unittest.main()
