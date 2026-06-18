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
        self.paper = SimpleNamespace(
            id=uuid.uuid4(),
            project_id=self.project_id,
            title="生成式人工智能支持研究生论文写作研究",
        )
        self.notes = [
            SimpleNamespace(
                id=uuid.uuid4(),
                project_id=self.project_id,
                paper_id=self.paper.id,
                note_type="finding",
                title="写作信心提升",
                content="受访研究生认为 AI 反馈能降低初稿写作焦虑。",
                evidence_text="AI 反馈帮助学生更快形成初稿并提升写作信心。",
                evidence_level="摘要级证据",
                confidence=85,
                tags=["AI写作", "研究生"],
                paper=self.paper,
                updated_at=None,
            ),
            SimpleNamespace(
                id=uuid.uuid4(),
                project_id=self.project_id,
                paper_id=self.paper.id,
                note_type="summary",
                title="普通摘要",
                content="该文献讨论教育技术应用背景。",
                evidence_text="教育技术应用正在拓展。",
                evidence_level="摘要级证据",
                confidence=75,
                tags=["教育技术"],
                paper=self.paper,
                updated_at=None,
            ),
            SimpleNamespace(
                id=uuid.uuid4(),
                project_id=self.project_id,
                paper_id=self.paper.id,
                note_type="finding",
                title="低可信发现",
                content="低可信内容也提到了写作信心。",
                evidence_text="低可信证据。",
                evidence_level="用户猜想",
                confidence=45,
                tags=["AI写作"],
                paper=self.paper,
                updated_at=None,
            ),
        ]

    def query(self, model):
        name = getattr(model, "__name__", "")
        if name == "PaperNote":
            return FakeQuery(self.notes)
        if name == "Paper":
            return FakeQuery([self.paper])
        return FakeQuery([])


class EvidenceRetrievalServiceTests(unittest.TestCase):
    def test_title_match_scores_higher_than_generic_note(self):
        from app.services.evidence_retrieval_service import retrieve_project_evidence

        db = FakeDb()
        items = retrieve_project_evidence(db, db.project_id, "写作信心", limit=3, min_confidence=70)

        self.assertGreaterEqual(len(items), 2)
        self.assertEqual(items[0]["title"], "写作信心提升")
        self.assertGreater(items[0]["score"], items[1]["score"])
        self.assertIn("标题命中", items[0]["score_reasons"])

    def test_evidence_text_match_returns_score_reason(self):
        from app.services.evidence_retrieval_service import retrieve_project_evidence

        db = FakeDb()
        items = retrieve_project_evidence(db, db.project_id, "AI 反馈", limit=3, min_confidence=70)

        self.assertEqual(items[0]["title"], "写作信心提升")
        self.assertIn("证据摘录命中", items[0]["score_reasons"])
        self.assertEqual(items[0]["source_title"], "生成式人工智能支持研究生论文写作研究")

    def test_min_confidence_filters_low_quality_notes(self):
        from app.services.evidence_retrieval_service import retrieve_project_evidence

        db = FakeDb()
        items = retrieve_project_evidence(db, db.project_id, "低可信 写作信心", limit=5, min_confidence=70)

        titles = [item["title"] for item in items]
        self.assertNotIn("低可信发现", titles)

    def test_build_evidence_context_contains_source_and_reliability(self):
        from app.services.evidence_retrieval_service import build_evidence_context, retrieve_project_evidence

        db = FakeDb()
        items = retrieve_project_evidence(db, db.project_id, "写作信心", limit=1, min_confidence=70)
        context = build_evidence_context(items)

        self.assertIn("内部证据卡片", context)
        self.assertIn("来源文献：生成式人工智能支持研究生论文写作研究", context)
        self.assertIn("证据摘录：AI 反馈帮助学生", context)
        self.assertIn("可靠性：85/100", context)

    def test_evidence_text_match_ranks_above_content_only_match(self):
        from app.services.evidence_retrieval_service import retrieve_project_evidence

        db = FakeDb()
        db.notes = [
            SimpleNamespace(
                id=uuid.uuid4(),
                project_id=db.project_id,
                paper_id=db.paper.id,
                note_type="summary",
                title="内容命中卡片",
                content="研究生写作支持出现在普通笔记正文中。",
                evidence_text="无直接摘录。",
                evidence_level="摘要级证据",
                confidence=75,
                tags=[],
                paper=db.paper,
                updated_at=None,
            ),
            SimpleNamespace(
                id=uuid.uuid4(),
                project_id=db.project_id,
                paper_id=db.paper.id,
                note_type="summary",
                title="摘录命中卡片",
                content="普通内容。",
                evidence_text="研究生写作支持是摘要中的明确发现。",
                evidence_level="摘要级证据",
                confidence=75,
                tags=[],
                paper=db.paper,
                updated_at=None,
            ),
        ]

        items = retrieve_project_evidence(db, db.project_id, "研究生写作支持", limit=2, min_confidence=70)

        self.assertEqual(items[0]["title"], "摘录命中卡片")
        self.assertIn("证据摘录命中", items[0]["score_reasons"])

    def test_high_confidence_ranks_above_lower_confidence_when_relevance_is_equal(self):
        from app.services.evidence_retrieval_service import retrieve_project_evidence

        db = FakeDb()
        db.notes = [
            SimpleNamespace(
                id=uuid.uuid4(),
                project_id=db.project_id,
                paper_id=db.paper.id,
                note_type="summary",
                title="低可信同主题",
                content="AI反馈。",
                evidence_text="AI反馈。",
                evidence_level="摘要级证据",
                confidence=70,
                tags=[],
                paper=db.paper,
                updated_at=None,
            ),
            SimpleNamespace(
                id=uuid.uuid4(),
                project_id=db.project_id,
                paper_id=db.paper.id,
                note_type="summary",
                title="高可信同主题",
                content="AI反馈。",
                evidence_text="AI反馈。",
                evidence_level="摘要级证据",
                confidence=90,
                tags=[],
                paper=db.paper,
                updated_at=None,
            ),
        ]

        items = retrieve_project_evidence(db, db.project_id, "AI反馈", limit=2, min_confidence=70)

        self.assertEqual(items[0]["title"], "高可信同主题")
        self.assertIn("高可信度", items[0]["score_reasons"])

    def test_finding_method_and_limitation_rank_above_idea_for_evidence_use(self):
        from app.services.evidence_retrieval_service import retrieve_project_evidence

        db = FakeDb()
        db.notes = [
            SimpleNamespace(
                id=uuid.uuid4(),
                project_id=db.project_id,
                paper_id=db.paper.id,
                note_type="idea",
                title="AI反馈想法",
                content="AI反馈可作为后续灵感。",
                evidence_text="AI反馈。",
                evidence_level="灵感记录",
                confidence=85,
                tags=[],
                paper=db.paper,
                updated_at=None,
            ),
            SimpleNamespace(
                id=uuid.uuid4(),
                project_id=db.project_id,
                paper_id=db.paper.id,
                note_type="finding",
                title="AI反馈发现",
                content="AI反馈是文献中的明确发现。",
                evidence_text="AI反馈。",
                evidence_level="摘要级证据",
                confidence=85,
                tags=[],
                paper=db.paper,
                updated_at=None,
            ),
        ]

        items = retrieve_project_evidence(db, db.project_id, "AI反馈", limit=2, min_confidence=70)

        self.assertEqual(items[0]["title"], "AI反馈发现")
        self.assertIn("方法/发现类证据", items[0]["score_reasons"])
        self.assertNotIn("方法/发现类证据", items[1]["score_reasons"])

    def test_project_paper_title_match_can_be_returned_as_internal_evidence(self):
        from app.services.evidence_retrieval_service import retrieve_project_paper_evidence

        db = FakeDb()
        items = retrieve_project_paper_evidence(db, db.project_id, "研究生论文写作", limit=2)

        self.assertEqual(items[0]["kind"], "project_paper")
        self.assertEqual(items[0]["title"], "生成式人工智能支持研究生论文写作研究")
        self.assertIn("文献标题命中", items[0]["score_reasons"])
        self.assertEqual(items[0]["action_label"], "打开项目文献")


if __name__ == "__main__":
    unittest.main()
