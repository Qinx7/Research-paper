import unittest

from app.services.authority_filter_service import evaluate_paper_authority
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


if __name__ == "__main__":
    unittest.main()
