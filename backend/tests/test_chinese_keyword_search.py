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

    def test_local_english_fallback_covers_bioinformatics_llm_query(self):
        agent = LiteratureSearchAgent()

        keywords = agent._fallback_en_keywords(["生物信息在大语言模型中的应用"])

        self.assertIn("bioinformatics", keywords)
        self.assertIn("large language models", keywords)


if __name__ == "__main__":
    unittest.main()
