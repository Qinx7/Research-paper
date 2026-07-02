import unittest
import uuid
from types import SimpleNamespace
from unittest.mock import patch
import sys


class FakeDb:
    def __init__(self):
        self.added = []
        self.commits = 0
        self.refreshes = 0
        self.deleted = []
        self.rolled_back = False

    def add(self, item):
        self.added.append(item)

    def commit(self):
        self.commits += 1

    def refresh(self, item):
        self.refreshes += 1

    def rollback(self):
        self.rolled_back = True

    def query(self, _model):
        return self

    def filter(self, *_args, **_kwargs):
        return self

    def all(self):
        return []

    def delete(self, item):
        self.deleted.append(item)

    def execute(self, *_args, **_kwargs):
        return None


class ProjectKnowledgeServiceTests(unittest.TestCase):
    def _fake_upload_module(self):
        return SimpleNamespace(
            get_object_stream=lambda _path: (SimpleNamespace(read=lambda: b"pdf", close=lambda: None), 3, "application/pdf")
        )

    def test_index_outcome_document_persists_parse_meta(self):
        from app.services.project_knowledge_service import index_outcome_document
        from app.services.document_parse_service import ParsedDocument, ParsedChunk

        db = FakeDb()
        outcome = SimpleNamespace(
            id=uuid.uuid4(),
            project_id=uuid.uuid4(),
            file_path="outcomes/demo.pdf",
            name="测试文档.pdf",
            extra_data={},
        )

        with patch.dict(sys.modules, {"app.services.upload_service": self._fake_upload_module()}), \
             patch("app.services.project_knowledge_service.extract_text_from_bytes", return_value=ParsedDocument(
                 text="正文内容",
                 source_type=".pdf",
                 meta={
                     "parser": "pypdf+pdfplumber",
                     "strategy_chain": ["pypdf", "pdfplumber"],
                     "used_ocr": False,
                     "document_kind": "scholarly_pdf",
                     "structured_fields": ["title", "abstract", "references"],
                     "structured_content": {
                         "title": "A Retrieval Augmented Generation Method",
                         "abstract": "This paper proposes a retrieval augmented generation method.",
                         "references_text": "[1] Example",
                     },
                     "structured_confidence": {
                         "title": "medium",
                         "abstract": "high",
                         "references": "high",
                     },
                 },
             )), \
             patch("app.services.project_knowledge_service.chunk_text", return_value=[ParsedChunk(index=0, content="正文内容")]):
            status = index_outcome_document(db, outcome)

        self.assertEqual(status.status, "indexed")
        self.assertEqual(outcome.extra_data["knowledge_parser"], "pypdf+pdfplumber")
        self.assertEqual(outcome.extra_data["knowledge_strategy_chain"], ["pypdf", "pdfplumber"])
        self.assertEqual(outcome.extra_data["knowledge_used_ocr"], False)
        self.assertEqual(outcome.extra_data["document_kind"], "scholarly_pdf")
        self.assertEqual(outcome.extra_data["structured_content"]["title"], "A Retrieval Augmented Generation Method")
        self.assertEqual(outcome.extra_data["structured_confidence"]["abstract"], "high")
        self.assertEqual(status.parser, "pypdf+pdfplumber")
        self.assertEqual(status.strategy_chain, ["pypdf", "pdfplumber"])
        self.assertEqual(status.used_ocr, False)

    def test_index_outcome_document_persists_error_stage(self):
        from app.services.project_knowledge_service import index_outcome_document
        from app.services.document_parse_service import DocumentParseError

        db = FakeDb()
        outcome = SimpleNamespace(
            id=uuid.uuid4(),
            project_id=uuid.uuid4(),
            file_path="outcomes/demo.pdf",
            name="扫描件.pdf",
            extra_data={},
        )

        error = DocumentParseError("当前环境缺少 OCR 引擎 Tesseract。")
        setattr(error, "parse_stage", "ocr")

        with patch.dict(sys.modules, {"app.services.upload_service": self._fake_upload_module()}), \
             patch("app.services.project_knowledge_service.extract_text_from_bytes", side_effect=error):
            status = index_outcome_document(db, outcome)

        self.assertEqual(status.status, "failed")
        self.assertEqual(outcome.extra_data["knowledge_error_stage"], "ocr")
        self.assertIn("OCR", outcome.extra_data["knowledge_error"])

    def test_get_outcome_knowledge_status_exposes_structured_parse_summary(self):
        from app.services.project_knowledge_service import get_outcome_knowledge_status

        outcome = SimpleNamespace(
            id=uuid.uuid4(),
            extra_data={
                "knowledge_status": "indexed",
                "knowledge_chunk_count": 4,
                "knowledge_parser": "pypdf+ocr",
                "knowledge_strategy_chain": ["pypdf", "ocr"],
                "knowledge_used_ocr": True,
                "document_kind": "scholarly_pdf",
                "structured_fields": ["title", "abstract", "references"],
                "structured_confidence": {"title": "medium", "abstract": "high", "references": "low"},
                "knowledge_vector_status": "partial",
                "knowledge_vector_count": 2,
                "knowledge_indexed_at": "2026-06-28T12:00:00",
            },
        )

        status = get_outcome_knowledge_status(outcome)

        self.assertEqual(status.status, "indexed")
        self.assertEqual(status.parser, "pypdf+ocr")
        self.assertEqual(status.strategy_chain, ["pypdf", "ocr"])
        self.assertEqual(status.used_ocr, True)
        self.assertEqual(status.vector_status, "partial")
        self.assertEqual(status.vector_count, 2)

    def test_index_outcome_document_stores_chunk_embeddings_synchronously(self):
        from app.services.project_knowledge_service import index_outcome_document
        from app.services.document_parse_service import ParsedDocument, ParsedChunk

        db = FakeDb()
        outcome = SimpleNamespace(
            id=uuid.uuid4(),
            project_id=uuid.uuid4(),
            file_path="outcomes/demo.pdf",
            name="测试文档.pdf",
            extra_data={},
        )

        with patch.dict(sys.modules, {"app.services.upload_service": self._fake_upload_module()}), \
             patch("app.services.project_knowledge_service.extract_text_from_bytes", return_value=ParsedDocument(
                 text="正文内容",
                 source_type=".pdf",
                 meta={"parser": "pypdf"},
             )), \
             patch("app.services.project_knowledge_service.chunk_text", return_value=[ParsedChunk(index=0, content="正文内容")]), \
             patch("app.services.project_knowledge_service.upsert_project_document_vector", return_value=True) as mock_upsert:
            status = index_outcome_document(db, outcome)

        self.assertEqual(status.status, "indexed")
        self.assertEqual(status.vector_status, "indexed")
        self.assertEqual(status.vector_count, 1)
        self.assertIn("语义检索", status.vector_message)
        mock_upsert.assert_called_once()
        self.assertIsNotNone(mock_upsert.call_args.kwargs["chunk_id"])
        self.assertEqual(mock_upsert.call_args.kwargs["chunk_id"], db.added[0].id)

    def test_index_outcome_document_exposes_vector_fallback_when_embedding_unavailable(self):
        from app.services.project_knowledge_service import index_outcome_document
        from app.services.document_parse_service import ParsedDocument, ParsedChunk

        db = FakeDb()
        outcome = SimpleNamespace(
            id=uuid.uuid4(),
            project_id=uuid.uuid4(),
            file_path="outcomes/demo.pdf",
            name="测试文档.pdf",
            extra_data={},
        )

        with patch.dict(sys.modules, {"app.services.upload_service": self._fake_upload_module()}), \
             patch("app.services.project_knowledge_service.extract_text_from_bytes", return_value=ParsedDocument(
                 text="正文内容",
                 source_type=".pdf",
                 meta={"parser": "pypdf"},
             )), \
             patch("app.services.project_knowledge_service.chunk_text", return_value=[ParsedChunk(index=0, content="正文内容")]), \
             patch("app.services.project_knowledge_service.upsert_project_document_vector", return_value=False):
            status = index_outcome_document(db, outcome)

        self.assertEqual(status.status, "indexed")
        self.assertEqual(status.vector_status, "unavailable")
        self.assertEqual(status.vector_count, 0)
        self.assertIn("关键词检索", status.vector_message)
        self.assertEqual(outcome.extra_data["knowledge_vector_status"], "unavailable")


if __name__ == "__main__":
    unittest.main()
