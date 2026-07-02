import unittest
import uuid
from datetime import datetime, timedelta
from types import SimpleNamespace


class ProjectWorkspaceServiceTests(unittest.TestCase):
    def test_build_snapshot_links_outcomes_and_chapters(self):
        from app.services.project_workspace_service import build_project_workspace_snapshot

        project_id = uuid.uuid4()
        draft_id = uuid.uuid4()
        outcome_id = uuid.uuid4()
        paper_id = uuid.uuid4()

        draft = SimpleNamespace(
            id=draft_id,
            project_id=project_id,
            title="论文草稿",
            version=3,
            updated_at=datetime.utcnow(),
            sections=[
                SimpleNamespace(key="chapter_1_introduction", title="第一章 绪论", content="这里引用了系统原型。", status="generated"),
                SimpleNamespace(key="chapter_4_implementation", title="第四章 系统实现", content="系统原型部署说明。", status="edited"),
            ],
            content={
                "chapter_1_introduction": {
                    "title": "第一章 绪论",
                    "content": "这里引用了系统原型，并且讨论了多模态知识图谱。",
                    "status": "generated",
                    "citations": ["系统原型", "多模态知识图谱研究"],
                    "data_based": False,
                },
                "chapter_4_implementation": {
                    "title": "第四章 系统实现",
                    "content": "系统原型部署说明与实验截图。",
                    "status": "edited",
                    "citations": ["系统原型"],
                    "data_based": True,
                },
            },
        )
        outcome = SimpleNamespace(
            id=outcome_id,
            project_id=project_id,
            outcome_type="prototype",
            name="系统原型",
            description="可交互系统截图与部署说明",
            file_path="outcomes/prototype.pdf",
            extra_data={
                "knowledge_status": "indexed",
                "knowledge_chunk_count": 4,
            },
        )
        paper = SimpleNamespace(
            id=paper_id,
            project_id=project_id,
            title="多模态知识图谱研究",
            doi="10.1000/demo",
            abstract="围绕多模态知识图谱展开。",
            venue="中文信息学报",
            year=2025,
            citation_count=12,
        )
        note = SimpleNamespace(
            id=uuid.uuid4(),
            project_id=project_id,
            paper_id=paper_id,
            title="多模态知识图谱研究笔记",
            note_type="finding",
            evidence_text="论文指出多模态对齐是部署瓶颈。",
            content="记录关键发现。",
            confidence=85,
        )
        chunk = SimpleNamespace(
            id=uuid.uuid4(),
            project_id=project_id,
            outcome_id=outcome_id,
            title="系统原型",
            source_filename="prototype.pdf",
            source_type="pdf",
            content_excerpt="系统原型部署说明",
            content="系统原型部署说明与实验截图",
            meta={"section_title": "第一章 绪论", "section_level": 1, "section_path": ["第一章 绪论"]},
        )

        snapshot = build_project_workspace_snapshot(
            project_id=project_id,
            outcomes=[outcome],
            drafts=[draft],
            papers=[paper],
            paper_notes=[note],
            chunks=[chunk],
        )

        self.assertEqual(snapshot["stats"]["outcomes_total"], 1)
        self.assertEqual(snapshot["stats"]["indexed_outcomes"], 1)
        self.assertEqual(snapshot["stats"]["evidence_cards_total"], 1)
        self.assertEqual(len(snapshot["chapters"]), 2)
        self.assertEqual(snapshot["outcomes"][0]["cited_by_chapters"], ["第一章 绪论", "第四章 系统实现"])
        self.assertEqual(snapshot["chapters"][0]["linked_outcomes"][0]["name"], "系统原型")
        self.assertEqual(snapshot["chapters"][0]["linked_papers"][0]["title"], "多模态知识图谱研究")
        self.assertEqual(snapshot["chapters"][0]["linked_notes"][0]["title"], "多模态知识图谱研究笔记")
        self.assertEqual(snapshot["chapters"][0]["linked_chunks"][0]["source_filename"], "prototype.pdf")
        self.assertEqual(snapshot["chapters"][0]["linked_chunks"][0]["section_title"], "第一章 绪论")

    def test_build_snapshot_includes_delivery_summary(self):
        from app.services.project_workspace_service import build_project_workspace_snapshot

        project_id = uuid.uuid4()
        older_time = datetime.utcnow() - timedelta(days=2)
        newer_time = datetime.utcnow()
        latest_draft_id = uuid.uuid4()

        older_draft = SimpleNamespace(
            id=uuid.uuid4(),
            project_id=project_id,
            title="旧草稿",
            version=1,
            updated_at=older_time,
            sections=[SimpleNamespace(key="chapter_1_introduction", title="第一章 绪论", content="", status="draft")],
            content={},
        )
        latest_draft = SimpleNamespace(
            id=latest_draft_id,
            project_id=project_id,
            title="最新草稿",
            version=4,
            updated_at=newer_time,
            sections=[
                SimpleNamespace(key="chapter_1_introduction", title="第一章 绪论", content="有内容", status="generated"),
                SimpleNamespace(key="chapter_2_theory", title="第二章 相关工作", content="有内容", status="edited"),
                SimpleNamespace(key="chapter_3_design", title="第三章 方法设计", content="", status="draft"),
            ],
            content={
                "chapter_1_introduction": {"title": "第一章 绪论", "content": "有内容", "status": "generated", "data_based": False, "citations": []},
                "chapter_2_theory": {"title": "第二章 相关工作", "content": "有内容", "status": "edited", "data_based": True, "citations": []},
            },
        )

        snapshot = build_project_workspace_snapshot(
            project_id=project_id,
            outcomes=[],
            drafts=[older_draft, latest_draft],
            papers=[],
            paper_notes=[],
            chunks=[],
        )

        delivery = snapshot["delivery"]
        self.assertEqual(delivery["latest_draft"]["id"], str(latest_draft_id))
        self.assertEqual(delivery["latest_draft"]["completed_chapters"], 2)
        self.assertEqual(delivery["latest_draft"]["completion_rate"], 67)
        self.assertTrue(delivery["presentation"]["has_real_data"])
        self.assertTrue(delivery["presentation"]["ready"])
        self.assertTrue(delivery["latest_draft"]["download_docx_url"].endswith("/download?format=docx"))

    def test_build_snapshot_can_target_specific_draft(self):
        from app.services.project_workspace_service import build_project_workspace_snapshot

        project_id = uuid.uuid4()
        older_draft = SimpleNamespace(
            id=uuid.uuid4(),
            project_id=project_id,
            title="旧草稿",
            version=1,
            updated_at=datetime.utcnow() - timedelta(days=1),
            sections=[SimpleNamespace(key="chapter_1_introduction", title="第一章 绪论", content="旧内容", status="generated")],
            content={
                "chapter_1_introduction": {
                    "title": "第一章 绪论",
                    "content": "旧内容中引用了实验截图。",
                    "status": "generated",
                    "citations": ["实验截图"],
                    "data_based": False,
                }
            },
        )
        newer_draft = SimpleNamespace(
            id=uuid.uuid4(),
            project_id=project_id,
            title="新草稿",
            version=2,
            updated_at=datetime.utcnow(),
            sections=[SimpleNamespace(key="chapter_5_experiment", title="第五章 实验", content="新内容", status="edited")],
            content={
                "chapter_5_experiment": {
                    "title": "第五章 实验",
                    "content": "新内容中引用了实验数据表。",
                    "status": "edited",
                    "citations": ["实验数据表"],
                    "data_based": True,
                }
            },
        )
        old_outcome = SimpleNamespace(
            id=uuid.uuid4(),
            project_id=project_id,
            outcome_type="screenshot",
            name="实验截图",
            description="旧版系统截图",
            file_path="outcomes/shot.png",
            extra_data={},
        )
        new_outcome = SimpleNamespace(
            id=uuid.uuid4(),
            project_id=project_id,
            outcome_type="experiment_data",
            name="实验数据表",
            description="实验统计表",
            file_path="outcomes/data.xlsx",
            extra_data={},
        )

        snapshot = build_project_workspace_snapshot(
            project_id=project_id,
            outcomes=[old_outcome, new_outcome],
            drafts=[older_draft, newer_draft],
            papers=[],
            paper_notes=[],
            chunks=[],
            active_draft_id=str(older_draft.id),
        )

        self.assertEqual(snapshot["delivery"]["latest_draft"]["id"], str(older_draft.id))
        self.assertEqual(snapshot["chapters"][0]["chapter_key"], "chapter_1_introduction")
        self.assertEqual(snapshot["outcomes"][0]["cited_by_chapters"], ["第一章 绪论"])


if __name__ == "__main__":
    unittest.main()
