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
        self.proposals = []
        self.runs = []
        self.steps = []
        self.commits = 0
        self.proposal_id = uuid.uuid4()
        self.run_id = uuid.uuid4()
        self.step_id = uuid.uuid4()

    def query(self, model):
        name = getattr(model, "__name__", "")
        if name == "Proposal":
            return FakeQuery(self.proposals)
        if name == "AgentWorkflowRun":
            return FakeQuery(self.runs)
        if name == "AgentWorkflowStep":
            return FakeQuery(self.steps)
        return FakeQuery([])

    def add(self, item):
        name = item.__class__.__name__
        if name == "Proposal":
            item.id = self.proposal_id
            self.proposals.append(item)
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


class ProposalWorkflowTests(unittest.TestCase):
    def test_proposal_workflow_generates_and_saves_report_with_allowed_refs(self):
        from app.agents.workflows.proposal_workflow import run_generate_proposal_workflow

        db = FakeDb()
        project_id = uuid.uuid4()
        design_id = uuid.uuid4()
        observed = {}

        class FakeProposalAgent:
            def generate(self, **kwargs):
                observed.update(kwargs)
                return {
                    "title": "测试开题报告",
                    "sections": {
                        "references": {
                            "title": "十二、参考文献",
                            "content": "真实文献A",
                        }
                    },
                }

        result = run_generate_proposal_workflow(
            db=db,
            project_id=str(project_id),
            design_id=str(design_id),
            project_design={
                "topic": "测试课题",
                "references": ["真实文献A"],
                "literature_review": {"key_references": ["真实文献A"]},
            },
            research_direction={"title": "测试方向"},
            literature_context="关键文献：真实文献A",
            proposal_agent=FakeProposalAgent(),
            record_db=db,
        )

        self.assertEqual(result["id"], str(db.proposal_id))
        self.assertEqual(result["title"], "测试开题报告")
        self.assertEqual(str(db.proposals[0].project_id), str(project_id))
        self.assertEqual(str(db.proposals[0].design_id), str(design_id))
        self.assertEqual(observed["allowed_references"], ["真实文献A"])
        self.assertEqual(len(db.steps), 3)
        self.assertEqual(db.runs[0].status, "success")
        self.assertEqual(db.runs[0].output_snapshot["proposal_title"], "测试开题报告")

    def test_proposal_workflow_does_not_save_when_agent_fails(self):
        from app.agents.workflows.proposal_workflow import run_generate_proposal_workflow

        class FailingProposalAgent:
            def generate(self, **kwargs):
                raise RuntimeError("proposal failed")

        db = FakeDb()
        with self.assertRaises(ValueError):
            run_generate_proposal_workflow(
                db=db,
                project_id=str(uuid.uuid4()),
                design_id=str(uuid.uuid4()),
                project_design={"topic": "测试课题"},
                proposal_agent=FailingProposalAgent(),
                record_db=db,
            )

        self.assertEqual(db.proposals, [])
        self.assertEqual(db.runs[0].status, "failed")
        failed_steps = [step for step in db.steps if step.status == "failed"]
        self.assertEqual(failed_steps[0].node_name, "proposal_generate")


if __name__ == "__main__":
    unittest.main()
