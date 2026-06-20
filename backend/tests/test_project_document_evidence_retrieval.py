import unittest
import uuid
from types import SimpleNamespace


class FakeQuery:
    def __init__(self, items):
        self.items = list(items)

    def filter(self, *args):
        return self

    def order_by(self, *args):
        return self

    def limit(self, *args):
        return self

    def all(self):
        return list(self.items)

    def first(self):
        return self.items[0] if self.items else None


class FakeDb:
    def __init__(self):
        self.project_id = uuid.uuid4()
        self.outcome_id = uuid.uuid4()
        self.chunks = [
            SimpleNamespace(
                id=uuid.uuid4(),
                project_id=self.project_id,
                outcome_id=self.outcome_id,
                chunk_index=0,
                title="访谈记录.docx",
                content="访谈资料显示，研究生在使用 AI 反馈后更容易形成论文初稿。",
                content_excerpt="访谈资料显示，研究生在使用 AI 反馈后更容易形成论文初稿。",
                source_filename="访谈记录.docx",
                source_type=".docx",
                meta={"parser": "docx"},
                created_at=None,
                updated_at=None,
            ),
            SimpleNamespace(
                id=uuid.uuid4(),
                project_id=self.project_id,
                outcome_id=self.outcome_id,
                chunk_index=1,
                title="系统截图说明.md",
                content="系统界面包含登录和项目管理模块。",
                content_excerpt="系统界面包含登录和项目管理模块。",
                source_filename="系统截图说明.md",
                source_type=".md",
                meta={"parser": "text"},
                created_at=None,
                updated_at=None,
            ),
        ]

    def query(self, model):
        name = getattr(model, "__name__", "")
        if name == "ProjectDocumentChunk":
            return FakeQuery(self.chunks)
        return FakeQuery([])


class ProjectDocumentEvidenceRetrievalTests(unittest.TestCase):
    def test_project_document_chunk_can_be_retrieved_as_internal_evidence(self):
        from app.services.evidence_retrieval_service import retrieve_project_document_chunks

        db = FakeDb()
        items = retrieve_project_document_chunks(db, db.project_id, "AI反馈 论文初稿", limit=3)

        self.assertEqual(items[0]["kind"], "project_document_chunk")
        self.assertEqual(items[0]["source_title"], "访谈记录.docx")
        self.assertIn("资料正文命中", items[0]["score_reasons"])
        self.assertEqual(items[0]["action_label"], "下载来源文件")


if __name__ == "__main__":
    unittest.main()
