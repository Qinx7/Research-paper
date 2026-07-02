import unittest
import uuid
from types import SimpleNamespace


class ProjectDocumentSearchServiceTests(unittest.TestCase):
    def test_search_project_document_chunks_returns_scored_matches(self):
        from app.services.project_document_search_service import search_project_document_chunks

        project_id = uuid.uuid4()
        outcome_id = uuid.uuid4()
        chunks = [
            SimpleNamespace(
                id=uuid.uuid4(),
                project_id=project_id,
                outcome_id=outcome_id,
                title="访谈记录",
                content="访谈资料显示，学生使用 RAG 课程问答后更容易形成论文初稿。",
                content_excerpt="访谈资料显示，学生使用 RAG 课程问答后更容易形成论文初稿。",
                source_filename="访谈记录.docx",
                source_type=".docx",
                meta={"section_title": "第一章 绪论", "section_level": 1, "section_path": ["第一章 绪论"]},
            ),
            SimpleNamespace(
                id=uuid.uuid4(),
                project_id=project_id,
                outcome_id=outcome_id,
                title="无关资料",
                content="这是另外一份项目说明。",
                content_excerpt="这是另外一份项目说明。",
                source_filename="readme.txt",
                source_type=".txt",
            ),
        ]

        results = search_project_document_chunks(chunks, project_id, "RAG 课程问答", limit=5)

        self.assertEqual(len(results), 1)
        self.assertEqual(results[0]["source_filename"], "访谈记录.docx")
        self.assertEqual(results[0]["download_url"], f"/api/outcomes/{outcome_id}/download")
        self.assertIn("资料正文命中", results[0]["score_reasons"])
        self.assertEqual(results[0]["section_title"], "第一章 绪论")

    def test_search_project_document_chunks_merges_keyword_and_semantic_hits(self):
        from app.services.project_document_search_service import merge_project_document_search_results

        keyword_hits = [
            {
                "chunk_id": "chunk-a",
                "title": "访谈记录",
                "score": 5,
                "score_reasons": ["资料正文命中"],
            }
        ]
        semantic_hits = [
            {
                "chunk_id": "chunk-a",
                "title": "访谈记录",
                "score": 0.83,
                "score_reasons": ["语义相似 0.83"],
            },
            {
                "chunk_id": "chunk-b",
                "title": "系统设计说明",
                "score": 0.79,
                "score_reasons": ["语义相似 0.79"],
            },
        ]

        merged = merge_project_document_search_results(keyword_hits, semantic_hits, limit=5)

        self.assertEqual(len(merged), 2)
        self.assertEqual(merged[0]["chunk_id"], "chunk-a")
        self.assertIn("资料正文命中", merged[0]["score_reasons"])
        self.assertIn("语义相似 0.83", merged[0]["score_reasons"])
        self.assertEqual(merged[1]["chunk_id"], "chunk-b")


if __name__ == "__main__":
    unittest.main()
