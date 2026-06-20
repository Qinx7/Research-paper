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
        self.designs = []
        self.runs = []
        self.steps = []
        self.commits = 0
        self.design_id = uuid.uuid4()
        self.run_id = uuid.uuid4()
        self.step_id = uuid.uuid4()

    def query(self, model):
        name = getattr(model, "__name__", "")
        if name == "ProjectDesign":
            return FakeQuery(self.designs)
        if name == "AgentWorkflowRun":
            return FakeQuery(self.runs)
        if name == "AgentWorkflowStep":
            return FakeQuery(self.steps)
        return FakeQuery([])

    def add(self, item):
        name = item.__class__.__name__
        if name == "ProjectDesign":
            item.id = self.design_id
            self.designs.append(item)
        elif name == "AgentWorkflowRun":
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


class ProjectDesignWorkflowTests(unittest.TestCase):
    def test_project_design_workflow_generates_saves_and_records_steps(self):
        from app.agents.workflows.project_design_workflow import run_generate_project_design_workflow

        db = FakeDb()
        project_id = uuid.uuid4()
        direction_id = uuid.uuid4()
        user_id = uuid.uuid4()
        observed = {}

        class FakeProjectDesignAgent:
            def generate_design(self, **kwargs):
                observed.update(kwargs)
                return {
                    "topic": "智能学习系统研究",
                    "background": "研究背景",
                    "references": ["真实文献A"],
                }

        result = run_generate_project_design_workflow(
            db=db,
            direction={"title": "方向A"},
            literature_analysis={"summaries": [{"title": "真实文献A"}]},
            requirement="研究智能学习系统",
            project_id=str(project_id),
            direction_id=str(direction_id),
            user_id=str(user_id),
            project_design_agent=FakeProjectDesignAgent(),
            record_db=db,
        )

        self.assertEqual(result["saved_id"], str(db.design_id))
        self.assertEqual(result["design"]["topic"], "智能学习系统研究")
        self.assertEqual(result["workflow_status"], "success")
        self.assertEqual(result["workflow_run_id"], str(db.run_id))
        self.assertEqual(db.designs[0].topic, "智能学习系统研究")
        self.assertEqual(str(db.designs[0].project_id), str(project_id))
        self.assertEqual(str(db.designs[0].direction_id), str(direction_id))
        self.assertEqual(observed["direction"], {"title": "方向A"})
        self.assertEqual(observed["requirement"], "研究智能学习系统")
        self.assertEqual(len(db.steps), 2)
        self.assertEqual(db.runs[0].status, "success")
        self.assertEqual(db.runs[0].user_id, user_id)

    def test_project_design_workflow_does_not_save_empty_design(self):
        from app.agents.workflows.project_design_workflow import run_generate_project_design_workflow

        class EmptyProjectDesignAgent:
            def generate_design(self, **kwargs):
                return {}

        db = FakeDb()
        with self.assertRaises(ValueError):
            run_generate_project_design_workflow(
                db=db,
                direction={"title": "方向A"},
                project_design_agent=EmptyProjectDesignAgent(),
                record_db=db,
            )

        self.assertEqual(db.designs, [])
        self.assertEqual(db.runs[0].status, "failed")
        failed_steps = [step for step in db.steps if step.status == "failed"]
        self.assertEqual(failed_steps[0].node_name, "project_design_generate")


if __name__ == "__main__":
    unittest.main()
