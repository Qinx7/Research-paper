import unittest
from types import SimpleNamespace

from app.agents.literature_review_agent import LiteratureReviewAgent
from app.agents.research_direction_agent import ResearchDirectionAgent
from app.services.grounding_guard import (
    sanitize_design_references,
    validate_generated_chapter_grounding,
)


class GroundingGuardTests(unittest.TestCase):
    def test_literature_review_fallback_does_not_emit_fake_hotspots(self):
        agent = LiteratureReviewAgent()
        agent.api_key = ""

        result = agent.analyze_papers(
            papers=[{"title": "閻喎鐤勭拋鐑樻瀮A", "authors": ["娴ｆ粏鈧?], "year": 2024, "venue": "閺堢喎鍨?, "abstract": "閹芥顩?}],
            research_requirement="濞村鐦拠楣冾暯",
        )

        self.assertEqual(result["analyzed_papers"], 0)
        self.assertEqual(result["research_hotspots"], [])
        self.assertEqual(result["research_gaps"], [])

    def test_research_direction_fallback_returns_empty_instead_of_fake_topics(self):
        agent = ResearchDirectionAgent()
        agent.api_key = ""

        directions = agent.generate_directions(
            literature_analysis={"research_hotspots": [], "research_gaps": [], "recommended_entry_points": [], "summaries": []},
            requirement="濞村鐦拠楣冾暯",
        )
        scores = agent.score_directions([])

        self.assertEqual(directions, [])
        self.assertEqual(scores, [])

    def test_design_references_are_sanitized_to_allowed_titles(self):
        design = {
            "literature_review": {
                "key_references": ["娑撳秴鐡ㄩ崷銊ф畱閺傚洨灏?],
            },
            "references": ["鐎瑰苯鍙忛搹姘€弬鍥╁盀"],
        }
        literature_analysis = {
            "summaries": [
                {"title": "閻喎鐤勯弬鍥╁盀A", "year": 2024},
                {"title": "閻喎鐤勯弬鍥╁盀B", "year": 2023},
            ]
        }

        sanitized = sanitize_design_references(design, literature_analysis)

        self.assertEqual(sanitized["literature_review"]["key_references"], ["閻喎鐤勯弬鍥╁盀A", "閻喎鐤勯弬鍥╁盀B"])
        self.assertEqual(sanitized["references"], ["閻喎鐤勯弬鍥╁盀A", "閻喎鐤勯弬鍥╁盀B"])

    def test_generated_chapter_rejects_unknown_citations_and_unsupported_data_based(self):
        result = {
            "chapter_key": "chapter_5_experiment",
            "title": "缁楊兛绨茬粩?鐎圭偤鐛欑拋鎹愵吀娑撳海绮ㄩ弸婊冨瀻閺?,
            "content": "濮濓絾鏋?,
            "citations": ["閾忔碍鐎幋鎰亯"],
            "data_based": True,
        }
        outcomes = [SimpleNamespace(name="閻喎鐤勯幋鎰亯", outcome_type="prototype")]
        papers = [SimpleNamespace(title="閻喎鐤勭拋鐑樻瀮A")]

        with self.assertRaises(ValueError):
            validate_generated_chapter_grounding(
                chapter_key="chapter_5_experiment",
                result=result,
                outcomes=outcomes,
                papers=papers,
            )

    def test_generated_chapter_allows_internal_evidence_card_citation(self):
        result = {
            "chapter_key": "chapter_1_introduction",
            "title": "缁楊兛绔寸粩?缂侇亣顔?,
            "content": "瀹稿弶婀侀崘鍛村劥鐠囦焦宓侀崡锛勫閺勫墽銇氶敍瀛塈 閸欏秹顩敮顔煎И鐎涳妇鏁撻弴鏉戞彥瑜般垺鍨氶崚婵堫焾楠炶埖褰侀崡鍥у晸娴ｆ粈淇婅箛鍐︹偓?,
            "citations": ["閸愭瑤缍旀穱鈥崇妇閹绘劕宕?],
            "data_based": False,
        }
        evidence_items = [
            {
                "title": "閸愭瑤缍旀穱鈥崇妇閹绘劕宕?,
                "evidence_text": "AI 閸欏秹顩敮顔煎И鐎涳妇鏁撻弴鏉戞彥瑜般垺鍨氶崚婵堫焾楠炶埖褰侀崡鍥у晸娴ｆ粈淇婅箛鍐︹偓?,
                "source_title": "閻㈢喐鍨氬蹇庢眽瀹搞儲娅ら懗鑺ユ暜閹镐胶鐖虹粚鍓佹晸鐠佺儤鏋冮崘娆庣稊閻梻鈹?,
            }
        ]

        validated = validate_generated_chapter_grounding(
            chapter_key="chapter_1_introduction",
            result=result,
            outcomes=[],
            papers=[],
            evidence_items=evidence_items,
        )

        self.assertEqual(validated["citations"], ["閸愭瑤缍旀穱鈥崇妇閹绘劕宕?])

    def test_generated_chapter_allows_full_reference_string_when_title_matches(self):
        result = {
            "chapter_key": "chapter_1_introduction",
            "title": "缁楊兛绔寸粩?缂侇亣顔?,
            "content": "濮濓絾鏋?,
            "citations": [
                "S鑼卋astien Bubeck, Varun Chandrasekaran, Ronen Eldan. Sparks of Artificial General Intelligence: Early experiments with GPT-4. arXiv (Cornell University), 2023",
            ],
            "data_based": False,
        }
        papers = [
            SimpleNamespace(
                title="Sparks of Artificial General Intelligence: Early experiments with GPT-4",
                abstract="",
            )
        ]

        validated = validate_generated_chapter_grounding(
            chapter_key="chapter_1_introduction",
            result=result,
            outcomes=[],
            papers=papers,
            evidence_items=[],
        )

        self.assertEqual(
            validated["citations"],
            ["Sparks of Artificial General Intelligence: Early experiments with GPT-4"],
        )

    def test_generated_chapter_rejects_unsupported_specific_percentages(self):
        result = {
            "chapter_key": "chapter_5_experiment",
            "title": "缁楊兛绨茬粩?鐎圭偤鐛欑拋鎹愵吀娑撳海绮ㄩ弸婊冨瀻閺?,
            "content": "鐎圭偤鐛欑紒鎾寸亯閺勫墽銇氶敍宀€閮寸紒鐔跺▏鐠佺儤鏋冮崘娆庣稊閺佸牏宸奸幓鎰磳 92%閿涘奔绗栧鈩冨壈鎼达箒鎻崚?96%閵?,
            "citations": [],
            "data_based": False,
        }

        with self.assertRaises(ValueError):
            validate_generated_chapter_grounding(
                chapter_key="chapter_5_experiment",
                result=result,
                outcomes=[],
                papers=[],
                evidence_items=[],
            )

    def test_generated_chapter_does_not_treat_section_heading_as_person_count(self):
        result = {
            "chapter_key": "chapter_2_theory",
            "title": "缁楊兛绨╃粩?閻╃鍙ч悶鍡氼啈娑撳孩濡ч張顖氱唨绾偓",
            "content": "2.1 娴滃搫浼愰弲楦垮厴閸╄櫣顢匼n閺堫剝濡禒瀣矝娴滃搫浼愰弲楦垮厴閻ㄥ嫬鐣炬稊澶堚偓浣稿絺鐏炴洝鍓︾紒婊€绗岄弽绋跨妇濮掑倸搴烽妴?,
            "citations": [],
            "data_based": False,
        }

        validated = validate_generated_chapter_grounding(
            chapter_key="chapter_2_theory",
            result=result,
            outcomes=[],
            papers=[],
            evidence_items=[],
        )

        self.assertEqual(validated["content"], result["content"])

    def test_non_intro_chapter_supported_citations_are_preserved(self):
        result = {
            "chapter_key": "chapter_3_design",
            "title": "third chapter",
            "content": "chapter content",
            "citations": ["paper-a", "outcome-b"],
            "data_based": False,
        }

        outcomes = [SimpleNamespace(name="outcome-b", outcome_type="prototype")]
        papers = [SimpleNamespace(title="paper-a", abstract="" )]

        validated = validate_generated_chapter_grounding(
            chapter_key="chapter_3_design",
            result=result,
            outcomes=outcomes,
            papers=papers,
            evidence_items=[],
        )

        self.assertEqual(validated["citations"], [papers[0].title, outcomes[0].name])

if __name__ == "__main__":
    unittest.main()
