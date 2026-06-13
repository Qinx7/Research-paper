import unittest

from app.agents.literature_review_agent import LiteratureReviewAgent


class LiteratureReviewAgentTests(unittest.TestCase):
    def test_analyze_papers_tolerates_null_optional_fields(self):
        agent = LiteratureReviewAgent()
        agent.api_key = "fake-key"
        papers = [
            {
                "title": "Null optional fields",
                "authors": None,
                "year": 2024,
                "venue": None,
                "abstract": None,
            }
        ]

        result = agent.analyze_papers(papers, "test requirement")

        self.assertEqual(result["total_papers"], 1)
        self.assertEqual(result["analyzed_papers"], 0)
        self.assertEqual(result["summaries"], [])


if __name__ == "__main__":
    unittest.main()
