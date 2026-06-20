import unittest
from unittest.mock import patch

from app.services.pubscholar_search import PubScholarClient


class FakePubScholarPage:
    def __init__(self, result):
        self.result = result
        self.keyboard = self

    def goto(self, *args, **kwargs):
        return None

    def wait_for_timeout(self, *args, **kwargs):
        return None

    def locator(self, selector):
        return FakePubScholarLocator()

    def expect_response(self, predicate, timeout):
        return FakePubScholarResponseContext(self.result)

    def press(self, key):
        return None


class FakePubScholarLocator:
    def count(self):
        return 2

    def nth(self, index):
        return self

    def fill(self, value):
        return None


class FakePubScholarResponse:
    def __init__(self, result):
        self.result = result
        self.status = result["status"]
        self.headers = {}

    def text(self):
        return self.result["text"]


class FakePubScholarResponseContext:
    def __init__(self, result):
        self.value = FakePubScholarResponse(result)

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb):
        return False


class FakePubScholarContext:
    def __init__(self, result):
        self.result = result

    def new_page(self):
        return FakePubScholarPage(self.result)

    def close(self):
        return None


class FakePubScholarBrowser:
    def __init__(self, result):
        self.result = result

    def new_context(self, **kwargs):
        return FakePubScholarContext(self.result)


class PubScholarSearchTests(unittest.TestCase):
    def test_pubscholar_parses_article_results(self):
        client = PubScholarClient()
        payload = {
            "status": 200,
            "text": '{"data":{"records":[{"title":"大语言模型支持教育反馈研究","authors":"张三;李四","year":"2024","journal":"现代教育技术","doi":"10.1234/test","abstract":"摘要内容","url":"https://pubscholar.cn/article/1","citation_count":"12"}]}}',
        }

        with patch("app.services.pubscholar_search.get_shared_browser", return_value=FakePubScholarBrowser(payload)):
            results = client.search("大语言模型 教育", 2020, 2026, 10)

        self.assertEqual(len(results), 1)
        self.assertEqual(results[0].source, "pubscholar")
        self.assertEqual(results[0].title, "大语言模型支持教育反馈研究")
        self.assertEqual(results[0].authors, ["张三", "李四"])
        self.assertEqual(results[0].year, 2024)
        self.assertEqual(results[0].citation_count, 12)


if __name__ == "__main__":
    unittest.main()
