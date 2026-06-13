import unittest

from app.agents.chat_agent import extract_keywords
from app.agents.literature_search_agent import LiteratureSearchAgent


class ChineseKeywordSearchTests(unittest.TestCase):
    def test_extract_keywords_keeps_core_chinese_terms(self):
        query = "请介绍大模型在教育领域的应用研究现状"
        cn_keywords, en_keywords = extract_keywords(query)

        self.assertIn("大模型", cn_keywords)
        self.assertIn("教育", cn_keywords)
        self.assertFalse(en_keywords)

    def test_build_cn_query_prefers_specific_terms(self):
        agent = LiteratureSearchAgent()
        query_cn = agent._build_cn_query(["大模型", "教育", "应用", "研究现状"])

        self.assertIn("大模型", query_cn)
        self.assertIn("教育", query_cn)
        self.assertIn("研究现状", query_cn)


if __name__ == "__main__":
    unittest.main()
