import unittest
import uuid
from types import SimpleNamespace
from unittest.mock import patch


class ResearchApiWorkflowIntegrationTests(unittest.TestCase):
    def test_generate_directions_api_uses_workflow_and_returns_compatible_payload(self):
        import app.api.research as research_api
        from app.schemas.research_direction import GenerateDirectionsRequest

        project_id = uuid.uuid4()
        user_id = uuid.uuid4()
        current_user = SimpleNamespace(id=user_id)
        db = object()
        observed = {}

        def fake_workflow(**kwargs):
            observed.update(kwargs)
            return {
                "requirement": "研究智能学习系统",
                "directions_count": 1,
                "directions": [{"title": "方向A"}],
                "scores": [{"title": "方向A", "scores": {"overall": 9}}],
                "saved_ids": ["direction-id"],
                "workflow_status": "success",
                "workflow_run_id": "workflow-run-id",
            }

        with patch.object(
            research_api,
            "get_owned_project",
            return_value=SimpleNamespace(id=project_id),
        ), patch.object(
            research_api,
            "run_generate_research_directions_workflow",
            side_effect=fake_workflow,
        ), patch.object(
            research_api.research_direction_agent,
            "generate_directions",
            side_effect=AssertionError("研究方向接口不应绕过 workflow 直接调用 Agent"),
        ):
            result = research_api.generate_directions(
                GenerateDirectionsRequest(
                    literature_analysis={"research_gaps": ["空白A"]},
                    requirement="研究智能学习系统",
                    project_id=project_id,
                ),
                current_user=current_user,
                db=db,
            )

        self.assertEqual(observed["db"], db)
        self.assertEqual(observed["literature_analysis"], {"research_gaps": ["空白A"]})
        self.assertEqual(observed["requirement"], "研究智能学习系统")
        self.assertEqual(observed["project_id"], str(project_id))
        self.assertEqual(observed["user_id"], str(user_id))
        self.assertEqual(observed["record_db"], db)
        self.assertEqual(result["directions_count"], 1)
        self.assertEqual(result["saved_ids"], ["direction-id"])
        self.assertEqual(result["workflow_run_id"], "workflow-run-id")

    def test_generate_design_api_uses_workflow_and_returns_compatible_payload(self):
        import app.api.research as research_api
        from app.schemas.research_direction import GenerateDesignRequest

        project_id = uuid.uuid4()
        direction_id = uuid.uuid4()
        user_id = uuid.uuid4()
        current_user = SimpleNamespace(id=user_id)
        db = object()
        observed = {}

        def fake_workflow(**kwargs):
            observed.update(kwargs)
            return {
                "requirement": "研究智能学习系统",
                "design": {"topic": "智能学习系统研究"},
                "saved_id": "design-id",
                "workflow_status": "success",
                "workflow_run_id": "workflow-run-id",
            }

        with patch.object(
            research_api,
            "get_owned_project",
            return_value=SimpleNamespace(id=project_id),
        ), patch.object(
            research_api,
            "run_generate_project_design_workflow",
            side_effect=fake_workflow,
        ), patch.object(
            research_api.project_design_agent,
            "generate_design",
            side_effect=AssertionError("项目设计接口不应绕过 workflow 直接调用 Agent"),
        ):
            result = research_api.generate_design(
                GenerateDesignRequest(
                    direction={"title": "方向A"},
                    literature_analysis={"summaries": [{"title": "真实文献A"}]},
                    requirement="研究智能学习系统",
                    project_id=project_id,
                    direction_id=direction_id,
                ),
                current_user=current_user,
                db=db,
            )

        self.assertEqual(observed["db"], db)
        self.assertEqual(observed["direction"], {"title": "方向A"})
        self.assertEqual(observed["literature_analysis"], {"summaries": [{"title": "真实文献A"}]})
        self.assertEqual(observed["requirement"], "研究智能学习系统")
        self.assertEqual(observed["project_id"], str(project_id))
        self.assertEqual(observed["direction_id"], str(direction_id))
        self.assertEqual(observed["user_id"], str(user_id))
        self.assertEqual(observed["record_db"], db)
        self.assertEqual(result["design"]["topic"], "智能学习系统研究")
        self.assertEqual(result["saved_id"], "design-id")
        self.assertEqual(result["workflow_run_id"], "workflow-run-id")


if __name__ == "__main__":
    unittest.main()
