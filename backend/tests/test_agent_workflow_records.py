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


if __name__ == "__main__":
    unittest.main()
