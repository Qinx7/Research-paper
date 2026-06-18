import json
import unittest
import uuid
from types import SimpleNamespace

from app.services.knowledge_graph_service import build_knowledge_graph, build_timeline


def make_paper(**overrides):
    data = {
        "id": uuid.uuid4(),
        "title": "生成式人工智能支持研究生论文写作",
        "abstract": "本文讨论生成式人工智能在研究生论文写作中的支持作用。",
        "authors": "张三;李四",
        "year": 2024,
        "venue": "教育技术研究",
        "citation_count": 8,
        "keywords": None,
    }
    data.update(overrides)
    return SimpleNamespace(**data)


class KnowledgeGraphServiceTests(unittest.TestCase):
    def test_build_knowledge_graph_empty_result_keeps_public_shape(self):
        result = build_knowledge_graph([])

        self.assertEqual(result["timeline"], {"series": [], "year_range": []})
        self.assertEqual(
            result["impact"],
            {"top_papers": [], "venue_distribution": [], "citation_range": [0, 0]},
        )
        self.assertEqual(result["stats"]["keywords_count"], 0)

    def test_build_knowledge_graph_reuses_existing_keywords_without_llm_config(self):
        paper = make_paper(
            title="标题中没有目标关键词",
            keywords=json.dumps(["人工智能写作", "研究生教育"], ensure_ascii=False),
        )

        result = build_knowledge_graph([paper])

        keyword_names = {
            node["name"]
            for node in result["network"]["nodes"]
            if node.get("type") == "keyword"
        }
        self.assertIn("人工智能写作", keyword_names)
        self.assertIn("研究生教育", keyword_names)
        self.assertNotIn("标题中没有目标关键词", keyword_names)

    def test_build_timeline_skips_missing_years(self):
        papers = [
            make_paper(title="缺少年份论文", year=None),
            make_paper(title="有效年份论文", year=2025),
        ]

        result = build_timeline(papers)

        self.assertEqual([item["year"] for item in result["series"]], [2025])
        self.assertEqual(result["year_range"], [2025, 2025])

    def test_build_timeline_returns_empty_shape_for_no_dated_papers(self):
        result = build_timeline([make_paper(year=None)])

        self.assertEqual(result, {"series": [], "year_range": []})


if __name__ == "__main__":
    unittest.main()
