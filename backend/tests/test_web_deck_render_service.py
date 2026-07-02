import unittest

from app.services.web_deck_render_service import (
    WebDeckRenderService,
    build_slides_outline_from_draft,
)


class WebDeckRenderServiceTests(unittest.TestCase):
    def test_render_to_html_contains_title_and_slide_content(self):
        service = WebDeckRenderService()

        html = service.render_to_html(
            deck_title="汇报预演稿",
            slides_outline=[
                {"type": "cover", "title": "汇报预演稿", "description": "封面说明"},
                {"title": "研究背景", "items": ["背景 1", "背景 2"]},
                {"title": "实验设计", "description": "说明实验设计方案。"},
                {"type": "cards", "title": "创新点", "items": ["创新点 1", "创新点 2"]},
            ],
            theme="swiss",
        )

        self.assertIn("汇报预演稿", html)
        self.assertIn("研究背景", html)
        self.assertIn("背景 1", html)
        self.assertIn("实验设计", html)
        self.assertIn("说明实验设计方案。", html)
        self.assertIn("theme-swiss", html)
        self.assertIn("cover-slide", html)
        self.assertIn("slide-cards", html)
        self.assertIn("创新点 1", html)
        self.assertIn("Deck Summary", html)

    def test_build_slides_outline_from_draft_uses_chapter_titles_and_content(self):
        slides = build_slides_outline_from_draft(
            title="毕业论文",
            draft_content={
                "chapter_1_introduction": {"title": "第一章 绪论", "content": "研究背景\n研究意义"},
                "chapter_3_design": {"title": "第三章 系统设计", "content": "系统架构\n模块划分"},
            },
        )

        self.assertEqual(slides[0]["title"], "毕业论文")
        self.assertEqual(slides[1]["title"], "第一章 绪论")
        self.assertIn("研究背景", slides[1]["items"])
        self.assertEqual(slides[3]["title"], "第三章 系统设计")


if __name__ == "__main__":
    unittest.main()
