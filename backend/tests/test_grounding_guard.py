import unittest
from types import SimpleNamespace

from app.agents.literature_review_agent import LiteratureReviewAgent
from app.agents.research_direction_agent import ResearchDirectionAgent
from app.services.grounding_guard import (
    sanitize_design_references,
    sanitize_proposal_sections,
    validate_generated_chapter_grounding,
)


class GroundingGuardTests(unittest.TestCase):
    def test_literature_review_fallback_does_not_emit_fake_hotspots(self):
        agent = LiteratureReviewAgent()
        agent.api_key = ""

        result = agent.analyze_papers(
            papers=[{"title": "真实论文A", "authors": ["作者"], "year": 2024, "venue": "期刊", "abstract": "摘要"}],
            research_requirement="测试课题",
        )

        self.assertEqual(result["analyzed_papers"], 0)
        self.assertEqual(result["research_hotspots"], [])
        self.assertEqual(result["research_gaps"], [])

    def test_research_direction_fallback_returns_empty_instead_of_fake_topics(self):
        agent = ResearchDirectionAgent()
        agent.api_key = ""

        directions = agent.generate_directions(
            literature_analysis={"research_hotspots": [], "research_gaps": [], "recommended_entry_points": [], "summaries": []},
            requirement="测试课题",
        )
        scores = agent.score_directions([])

        self.assertEqual(directions, [])
        self.assertEqual(scores, [])

    def test_design_references_are_sanitized_to_allowed_titles(self):
        design = {
            "literature_review": {
                "key_references": ["不存在的文献"],
            },
            "references": ["完全虚构文献"],
        }
        literature_analysis = {
            "summaries": [
                {"title": "真实文献A", "year": 2024},
                {"title": "真实文献B", "year": 2023},
            ]
        }

        sanitized = sanitize_design_references(design, literature_analysis)

        self.assertEqual(sanitized["literature_review"]["key_references"], ["真实文献A", "真实文献B"])
        self.assertEqual(sanitized["references"], ["真实文献A", "真实文献B"])

    def test_proposal_reference_section_is_rebuilt_from_allowed_references(self):
        sections = {
            "references": {
                "title": "十二、参考文献",
                "content": "1. 完全虚构文献",
            }
        }

        sanitized = sanitize_proposal_sections(sections, ["真实文献A", "真实文献B"])

        content = sanitized["references"]["content"]
        self.assertIn("真实文献A", content)
        self.assertIn("真实文献B", content)
        self.assertNotIn("完全虚构文献", content)

    def test_generated_chapter_rejects_unknown_citations_and_unsupported_data_based(self):
        result = {
            "chapter_key": "chapter_5_experiment",
            "title": "第五章 实验设计与结果分析",
            "content": "正文",
            "citations": ["虚构成果"],
            "data_based": True,
        }
        outcomes = [SimpleNamespace(name="真实成果", outcome_type="prototype")]
        papers = [SimpleNamespace(title="真实论文A")]

        with self.assertRaises(ValueError):
            validate_generated_chapter_grounding(
                chapter_key="chapter_5_experiment",
                result=result,
                outcomes=outcomes,
                papers=papers,
            )


if __name__ == "__main__":
    unittest.main()
