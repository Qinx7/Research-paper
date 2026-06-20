import unittest
import uuid


class FakeQuery:
    def __init__(self, items):
        self.items = list(items)

    def filter(self, *args):
        return self

    def first(self):
        return self.items[0] if self.items else None

    def all(self):
        return list(self.items)


class FakeDb:
    def __init__(self):
        self.directions = []
        self.runs = []
        self.steps = []
        self.commits = 0
        self.direction_ids = [uuid.uuid4(), uuid.uuid4()]
        self.run_id = uuid.uuid4()
        self.step_id = uuid.uuid4()

    def query(self, model):
        name = getattr(model, "__name__", "")
        if name == "ResearchDirection":
            return FakeQuery(self.directions)
        if name == "AgentWorkflowRun":
            return FakeQuery(self.runs)
        if name == "AgentWorkflowStep":
            return FakeQuery(self.steps)
        return FakeQuery([])

    def add(self, item):
        name = item.__class__.__name__
        if name == "ResearchDirection":
            item.id = self.direction_ids[len(self.directions)]
            self.directions.append(item)
        elif name == "AgentWorkflowRun":
            item.id = self.run_id
            self.runs.append(item)
        elif name == "AgentWorkflowStep":
            item.id = self.step_id
            self.steps.append(item)

    def flush(self):
        return None

    def commit(self):
        self.commits += 1

    def refresh(self, item):
        return item

    def rollback(self):
        pass


class ResearchDirectionWorkflowTests(unittest.TestCase):
    def test_direction_workflow_generates_scores_saves_and_records_steps(self):
        from app.agents.workflows.research_direction_workflow import run_generate_research_directions_workflow

        db = FakeDb()
        project_id = uuid.uuid4()
        user_id = uuid.uuid4()
        observed = {}

        class FakeDirectionAgent:
            def generate_directions(self, **kwargs):
                observed["generate"] = kwargs
                return [
                    {
                        "title": "方向A",
                        "background": "背景A",
                        "research_questions": ["问题A"],
                        "methods": ["方法A"],
                        "expected_outputs": ["成果A"],
                        "innovation": ["创新A"],
                    },
                    {
                        "title": "方向B",
                        "background": "背景B",
                    },
                ]

            def score_directions(self, directions):
                observed["score"] = directions
                return [
                    {"title": "方向A", "scores": {"feasibility": 8, "overall": 9}},
                    {"title": "方向B", "scores": {"feasibility": 6, "overall": 7}},
                ]

        result = run_generate_research_directions_workflow(
            db=db,
            literature_analysis={"research_gaps": ["空白A"]},
            requirement="研究智能学习系统",
            project_id=str(project_id),
            user_id=str(user_id),
            direction_agent=FakeDirectionAgent(),
            record_db=db,
        )

        self.assertEqual(result["directions_count"], 2)
        self.assertEqual(result["saved_ids"], [str(item) for item in db.direction_ids])
        self.assertEqual(result["workflow_status"], "success")
        self.assertEqual(result["workflow_run_id"], str(db.run_id))
        self.assertEqual(db.directions[0].title, "方向A")
        self.assertEqual(db.directions[0].feasibility_score, 8.0)
        self.assertEqual(db.directions[0].recommendation_score, 9.0)
        self.assertEqual(str(db.directions[0].project_id), str(project_id))
        self.assertEqual(observed["generate"]["literature_analysis"], {"research_gaps": ["空白A"]})
        self.assertEqual(observed["generate"]["requirement"], "研究智能学习系统")
        self.assertEqual(observed["score"][0]["title"], "方向A")
        self.assertEqual(len(db.steps), 3)
        self.assertEqual(db.runs[0].status, "success")
        self.assertEqual(db.runs[0].user_id, user_id)

    def test_direction_workflow_does_not_save_when_generation_returns_empty(self):
        from app.agents.workflows.research_direction_workflow import run_generate_research_directions_workflow

        class EmptyDirectionAgent:
            def generate_directions(self, **kwargs):
                return []

            def score_directions(self, directions):
                raise AssertionError("没有方向时不应继续评分")

        db = FakeDb()
        with self.assertRaises(ValueError):
            run_generate_research_directions_workflow(
                db=db,
                literature_analysis={},
                requirement="",
                direction_agent=EmptyDirectionAgent(),
                record_db=db,
            )

        self.assertEqual(db.directions, [])
        self.assertEqual(db.runs[0].status, "failed")
        failed_steps = [step for step in db.steps if step.status == "failed"]
        self.assertEqual(failed_steps[0].node_name, "direction_generate")


if __name__ == "__main__":
    unittest.main()
