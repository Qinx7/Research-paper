"""多 Agent workflow 执行记录测试。"""
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

    def offset(self, *args):
        return self

    def all(self):
        return list(self.items)

    def first(self):
        return self.items[0] if self.items else None


class FakeDb:
    def __init__(self):
        self.runs = []
        self.steps = []
        self.commits = 0
        self.run_id = uuid.uuid4()
        self.step_id = uuid.uuid4()

    def add(self, item):
        name = item.__class__.__name__
        if name == "AgentWorkflowRun":
            item.id = self.run_id
            self.runs.append(item)
        elif name == "AgentWorkflowStep":
            item.id = self.step_id
            self.steps.append(item)

    def commit(self):
        self.commits += 1

    def refresh(self, item):
        return item

    def rollback(self):
        pass

    def query(self, model):
        name = getattr(model, "__name__", "")
        if name == "AgentWorkflowRun":
            return FakeQuery(self.runs)
        if name == "AgentWorkflowStep":
            return FakeQuery(self.steps)
        return FakeQuery([])


class AgentWorkflowRecordTests(unittest.TestCase):
    def test_recorder_creates_run_and_step_records(self):
        from app.agents.orchestration import AgentNode, AgentNodeResult, AgentWorkflowRunner, AgentWorkflowState
        from app.services.agent_workflow_record_service import AgentWorkflowDbRecorder

        class PlanNode(AgentNode):
            name = "plan"

            def run(self, state):
                return AgentNodeResult.success(data_delta={"query": "agent workflow"})

        db = FakeDb()
        state = AgentWorkflowState(
            workflow_name="home_literature_search",
            user_id=str(uuid.uuid4()),
            project_id=str(uuid.uuid4()),
            search_task_id=str(uuid.uuid4()),
            input={"keywords_cn": ["多智能体"], "keywords_en": ["multi agent"]},
        )
        result = AgentWorkflowRunner([PlanNode()], recorder=AgentWorkflowDbRecorder(db)).run(state)

        self.assertEqual(result.state.status, "success")
        self.assertEqual(len(db.runs), 1)
        self.assertEqual(db.runs[0].workflow_name, "home_literature_search")
        self.assertEqual(db.runs[0].status, "success")
        self.assertEqual(db.runs[0].input_snapshot["keywords_cn"], ["多智能体"])
        self.assertIn("query", db.runs[0].output_snapshot)
        self.assertEqual(len(db.steps), 1)
        self.assertEqual(db.steps[0].node_name, "plan")
        self.assertEqual(db.steps[0].status, "success")
        self.assertGreaterEqual(db.steps[0].duration_ms, 0)

    def test_recorder_stores_failed_step_error(self):
        from app.agents.orchestration import AgentNode, AgentWorkflowRunner, AgentWorkflowState
        from app.services.agent_workflow_record_service import AgentWorkflowDbRecorder

        class FailingNode(AgentNode):
            name = "failing"

            def run(self, state):
                raise RuntimeError("source failed")

        db = FakeDb()
        result = AgentWorkflowRunner(
            [FailingNode()],
            recorder=AgentWorkflowDbRecorder(db),
        ).run(AgentWorkflowState(workflow_name="home_literature_search"))

        self.assertEqual(result.state.status, "failed")
        self.assertEqual(db.runs[0].status, "failed")
        self.assertIn("source failed", db.runs[0].error_message)
        self.assertEqual(db.steps[0].status, "failed")
        self.assertEqual(db.steps[0].error_message, "source failed")

    def test_list_runs_is_scoped_to_current_user(self):
        from app.models.agent_workflow import AgentWorkflowRun
        from app.services.agent_workflow_record_service import list_workflow_runs_for_user

        user_id = uuid.uuid4()
        other_user_id = uuid.uuid4()
        db = FakeDb()
        own_run = AgentWorkflowRun(workflow_name="home_literature_search", status="success", user_id=user_id)
        other_run = AgentWorkflowRun(workflow_name="home_literature_search", status="success", user_id=other_user_id)
        db.runs.extend([own_run, other_run])

        runs = list_workflow_runs_for_user(db, user_id=user_id)

        self.assertEqual(runs, [own_run])

    def test_literature_workflow_accepts_record_db_and_returns_run_id(self):
        from app.agents.workflows.literature_search_workflow import run_literature_search_workflow

        class EmptySearchAgent:
            def search_by_requirement(self, **kwargs):
                return {
                    "query": "multi agent",
                    "search_mode": "quick_search",
                    "library_scope": "all",
                    "selected_sources": ["openalex"],
                    "total_found": 0,
                    "sources": {"openalex": 0},
                    "source_statuses": {"openalex": {"status": "no_results", "count": 0}},
                    "papers": [],
                }

        db = FakeDb()
        result = run_literature_search_workflow(
            keywords_cn=[],
            keywords_en=["multi agent"],
            search_agent=EmptySearchAgent(),
            record_db=db,
        )

        self.assertEqual(result["workflow_run_id"], str(db.run_id))
        self.assertEqual(len(db.steps), 3)

    def test_recorder_summarizes_research_direction_workflow_output(self):
        from app.agents.orchestration import AgentNode, AgentNodeResult, AgentWorkflowRunner, AgentWorkflowState
        from app.services.agent_workflow_record_service import AgentWorkflowDbRecorder

        class DirectionNode(AgentNode):
            name = "direction_generate"

            def run(self, state):
                return AgentNodeResult.success(data_delta={
                    "directions": [
                        {"title": "方向A"},
                        {"title": "方向B"},
                    ],
                    "saved_ids": ["id-a", "id-b"],
                })

        db = FakeDb()
        AgentWorkflowRunner(
            [DirectionNode()],
            recorder=AgentWorkflowDbRecorder(db),
        ).run(AgentWorkflowState(workflow_name="research_direction_generation"))

        snapshot = db.runs[0].output_snapshot
        self.assertEqual(snapshot["directions_count"], 2)
        self.assertEqual(snapshot["direction_titles"], ["方向A", "方向B"])
        self.assertEqual(snapshot["saved_ids"], ["id-a", "id-b"])

    def test_recorder_includes_workflow_metadata_and_resolved_skills(self):
        from app.agents.orchestration import AgentNode, AgentNodeResult, AgentWorkflowRunner, AgentWorkflowState
        from app.services.agent_workflow_record_service import AgentWorkflowDbRecorder

        class SkillNode(AgentNode):
            name = "skill_node"

            def run(self, state):
                state.metadata["resolved_skills"] = {"preview_html_deck": "ppt.web_html_deck"}
                return AgentNodeResult.success(metadata={
                    "domain": "ppt",
                    "action": "preview_html_deck",
                    "resolved_skill_id": "ppt.web_html_deck",
                })

        db = FakeDb()
        AgentWorkflowRunner(
            [SkillNode()],
            recorder=AgentWorkflowDbRecorder(db),
        ).run(AgentWorkflowState(workflow_name="html_deck_preview"))

        self.assertEqual(db.runs[0].output_snapshot["resolved_skills"], {"preview_html_deck": "ppt.web_html_deck"})
        self.assertEqual(db.steps[0].output_summary["resolved_skill_id"], "ppt.web_html_deck")

    def test_recorder_stores_run_diagnostics_and_result_ref(self):
        from app.agents.orchestration import AgentNode, AgentNodeResult, AgentWorkflowRunner, AgentWorkflowState
        from app.services.agent_workflow_record_service import AgentWorkflowDbRecorder

        class ArtifactNode(AgentNode):
            name = "deck_render"
            node_type = "render"
            label = "生成 HTML Deck"

            def run(self, state):
                state.metadata["workflow_version"] = "2026.07"
                state.metadata["trigger_source"] = "ppt_page"
                state.metadata["visibility"] = "internal"
                return AgentNodeResult.success(
                    data_delta={"artifact_id": "artifact-1", "object_key": "generated/decks/demo.html"},
                    artifacts=[{"kind": "html_deck", "artifact_id": "artifact-1"}],
                    warnings=["Deck 使用默认主题"],
                )

        db = FakeDb()
        state = AgentWorkflowState(
            workflow_name="html_deck_preview",
            input={"deck_title": "测试 Deck", "slides_outline": [{"title": "第一页"}]},
        )
        AgentWorkflowRunner([ArtifactNode()], recorder=AgentWorkflowDbRecorder(db)).run(state)

        run = db.runs[0]
        self.assertEqual(run.workflow_version, "2026.07")
        self.assertEqual(run.trigger_source, "ppt_page")
        self.assertEqual(run.visibility, "internal")
        self.assertTrue(run.input_hash)
        self.assertEqual(run.result_ref["artifact_id"], "artifact-1")
        self.assertEqual(run.result_ref["object_key"], "generated/decks/demo.html")
        self.assertEqual(run.diagnostics["warnings"], ["Deck 使用默认主题"])
        self.assertEqual(run.diagnostics["artifacts"], [{"kind": "html_deck", "artifact_id": "artifact-1"}])
        self.assertEqual(run.diagnostics["node_count"], 1)

    def test_recorder_stores_step_contract_and_skill_diagnostics(self):
        from app.agents.orchestration import AgentNode, AgentNodeResult, AgentWorkflowRunner, AgentWorkflowState
        from app.services.agent_workflow_record_service import AgentWorkflowDbRecorder

        class SkillNode(AgentNode):
            name = "chapter_writer"
            node_type = "generate"
            label = "生成章节草稿"
            visible = True

            def run(self, state):
                return AgentNodeResult.success(
                    metadata={
                        "domain": "paper",
                        "action": "write_chapter",
                        "skill_id": "paper.chapter_draft",
                        "skill_version": "1",
                    },
                    warnings=["第一章需要补充中文文献"],
                    artifacts=[{"kind": "draft_chapter", "chapter_key": "chapter_1_introduction"}],
                )

        db = FakeDb()
        AgentWorkflowRunner(
            [SkillNode()],
            recorder=AgentWorkflowDbRecorder(db),
        ).run(AgentWorkflowState(workflow_name="paper_chapter_generation"))

        step = db.steps[0]
        self.assertEqual(step.node_type, "generate")
        self.assertEqual(step.node_label, "生成章节草稿")
        self.assertTrue(step.critical)
        self.assertTrue(step.visible)
        self.assertEqual(step.skill_id, "paper.chapter_draft")
        self.assertEqual(step.skill_version, "1")
        self.assertEqual(step.warnings, ["第一章需要补充中文文献"])
        self.assertEqual(step.artifacts, [{"kind": "draft_chapter", "chapter_key": "chapter_1_introduction"}])

    def test_result_ref_uses_main_workflow_recovery_keys(self):
        from app.agents.orchestration import AgentNode, AgentNodeResult, AgentWorkflowRunner, AgentWorkflowState
        from app.services.agent_workflow_record_service import AgentWorkflowDbRecorder

        class SearchNode(AgentNode):
            name = "external_literature_search"

            def run(self, state):
                return AgentNodeResult.success(data_delta={
                    "search_result": {
                        "query": "multi agent",
                        "papers": [{"title": "A"}, {"title": "B"}],
                        "total_found": 2,
                    }
                })

        db = FakeDb()
        AgentWorkflowRunner(
            [SearchNode()],
            recorder=AgentWorkflowDbRecorder(db),
        ).run(AgentWorkflowState(
            workflow_name="home_literature_search",
            search_task_id=str(uuid.uuid4()),
        ))

        self.assertEqual(db.runs[0].result_ref["query"], "multi agent")
        self.assertEqual(db.runs[0].result_ref["paper_count"], 2)

        class DesignNode(AgentNode):
            name = "project_design_save"

            def run(self, state):
                return AgentNodeResult.success(data_delta={"saved_id": "design-1"})

        db = FakeDb()
        AgentWorkflowRunner(
            [DesignNode()],
            recorder=AgentWorkflowDbRecorder(db),
        ).run(AgentWorkflowState(workflow_name="project_design_generation"))

        self.assertEqual(db.runs[0].result_ref["design_id"], "design-1")


if __name__ == "__main__":
    unittest.main()
