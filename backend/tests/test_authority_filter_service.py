import unittest

from app.services.authority_filter_service import evaluate_paper_authority, summarize_authority_hits
from app.services.literature_search import PaperResult


class AuthorityFilterServiceTests(unittest.TestCase):
    def test_ieee_keyword_in_abstract_only_is_not_verified(self):
        result = evaluate_paper_authority(
            PaperResult(
                title="A survey of educational technology",
                authors=["Author"],
                year=2024,
                venue="General Journal of Education",
                abstract="This related work compares datasets released by IEEE competitions.",
                citation_count=8,
                source="openalex",
            )
        )

        self.assertNotIn("ieee", result.tags)
        self.assertEqual(result.verified_level, "unverified")

    def test_ieee_and_acm_are_verified_from_venue_or_url(self):
        ieee = evaluate_paper_authority(
            PaperResult(
                title="Large Language Models in Education",
                authors=["Author"],
                year=2024,
                venue="IEEE Transactions on Learning Technologies",
                url="https://ieeexplore.ieee.org/document/123",
                citation_count=20,
                source="crossref",
            )
        )
        acm = evaluate_paper_authority(
            PaperResult(
                title="Agentic Learning Analytics",
                authors=["Author"],
                year=2024,
                venue="Proceedings of the ACM on Human-Computer Interaction",
                url="https://dl.acm.org/doi/10.1145/123",
                citation_count=12,
                source="semantic_scholar",
            )
        )

        self.assertIn("ieee", ieee.tags)
        self.assertIn("acm", acm.tags)
        self.assertEqual(ieee.verified_level, "verified")
        self.assertEqual(acm.verified_level, "verified")
        self.assertTrue(any("IEEE" in reason for reason in ieee.reasons))
        self.assertTrue(any("ACM" in reason for reason in acm.reasons))

    def test_ieee_and_acm_can_be_verified_from_doi_prefix(self):
        ieee = evaluate_paper_authority(
            PaperResult(
                title="Federated Recommendation in Education",
                authors=["Author"],
                year=2025,
                venue="Learning Systems Journal",
                doi="10.1109/TLT.2025.1234567",
                citation_count=10,
                source="crossref",
            )
        )
        acm = evaluate_paper_authority(
            PaperResult(
                title="Collaborative Agents for Coursework",
                authors=["Author"],
                year=2025,
                venue="Interactive Learning Review",
                doi="10.1145/3699999.3700000",
                citation_count=8,
                source="crossref",
            )
        )

        self.assertIn("ieee", ieee.tags)
        self.assertIn("acm", acm.tags)
        self.assertEqual(ieee.verified_level, "verified")
        self.assertEqual(acm.verified_level, "verified")

    def test_pku_core_is_verified_from_conservative_chinese_journal_list(self):
        result = evaluate_paper_authority(
            PaperResult(
                title="大语言模型赋能教育评价研究",
                authors=["作者"],
                year=2024,
                venue="电化教育研究",
                abstract="中文摘要",
                citation_count=5,
                source="cnki",
            )
        )

        self.assertIn("pku_core", result.tags)
        self.assertEqual(result.verified_level, "verified")
        self.assertTrue(any("北大核心" in reason for reason in result.reasons))

    def test_pku_core_accepts_wrapped_titles_and_common_suffixes(self):
        wrapped = evaluate_paper_authority(
            PaperResult(
                title="教育技术研究",
                authors=["作者"],
                year=2024,
                venue="《电化教育研究》",
                abstract="中文摘要",
                citation_count=3,
                source="cnki",
            )
        )
        suffixed = evaluate_paper_authority(
            PaperResult(
                title="软件工程研究",
                authors=["作者"],
                year=2024,
                venue="软件学报（中文版）",
                abstract="中文摘要",
                citation_count=6,
                source="cnki",
            )
        )

        self.assertIn("pku_core", wrapped.tags)
        self.assertIn("pku_core", suffixed.tags)

    def test_jcr_ei_and_cas_are_not_claimed_without_authoritative_data(self):
        result = evaluate_paper_authority(
            PaperResult(
                title="JCR and EI indexed intelligent education study",
                authors=["Author"],
                year=2024,
                venue="International Journal of Artificial Intelligence in Education",
                abstract="This paper mentions JCR, EI indexing, and CAS partition in text.",
                citation_count=30,
                source="openalex",
            )
        )

        self.assertNotIn("jcr", result.tags)
        self.assertNotIn("ei", result.tags)
        self.assertNotIn("cas", result.tags)
        self.assertIn("jcr", result.pending_tags)
        self.assertIn("ei", result.pending_tags)
        self.assertIn("cas", result.pending_tags)
        self.assertEqual(result.verified_level, "unverified")

    def test_authority_summary_keeps_verified_and_pending_counts_separate(self):
        summary = summarize_authority_hits([
            {
                "title": "Paper A",
                "authority_tags": ["ieee", "pku_core"],
                "pending_authority_tags": ["ei"],
            },
            {
                "title": "Paper B",
                "authority_tags": [],
                "pending_authority_tags": ["jcr", "cas"],
            },
        ])

        self.assertEqual(summary["verified_counts"]["ieee"], 1)
        self.assertEqual(summary["verified_counts"]["pku_core"], 1)
        self.assertEqual(summary["pending_counts"]["ei"], 1)
        self.assertEqual(summary["pending_counts"]["jcr"], 1)
        self.assertEqual(summary["pending_counts"]["cas"], 1)
        self.assertTrue(summary["has_verified"])
        self.assertTrue(summary["has_pending"])


if __name__ == "__main__":
    unittest.main()
