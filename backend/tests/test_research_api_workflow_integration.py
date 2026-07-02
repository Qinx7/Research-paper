import sys
import unittest
import uuid
from contextlib import contextmanager
from types import ModuleType, SimpleNamespace
from unittest.mock import patch


@contextmanager
def stub_api_modules():
    fastapi = ModuleType("fastapi")
    responses = ModuleType("fastapi.responses")
    auth_dependency = ModuleType("app.services.auth_dependency")

    class HTTPException(Exception):
        def __init__(self, status_code, detail):
            self.status_code = status_code
            self.detail = detail

    class APIRouter:
        def __init__(self, *args, **kwargs):
            pass

        def get(self, *args, **kwargs):
            return lambda fn: fn

        def post(self, *args, **kwargs):
            return lambda fn: fn

    def Depends(value):
        return value

    fastapi.APIRouter = APIRouter
    fastapi.Depends = Depends
    fastapi.HTTPException = HTTPException
    responses.FileResponse = object
    responses.StreamingResponse = object
    responses.HTMLResponse = object
    auth_dependency.get_current_user = lambda: None

    with patch.dict(sys.modules, {
        "fastapi": fastapi,
        "fastapi.responses": responses,
        "app.services.auth_dependency": auth_dependency,
    }):
        yield


class ResearchApiWorkflowIntegrationTests(unittest.TestCase):
    def test_generate_directions_api_uses_workflow_and_runtime(self):
        with stub_api_modules():
            import app.api.research as research_api
            from app.schemas.research_direction import GenerateDirectionsRequest

            project_id = uuid.uuid4()
            user_id = uuid.uuid4()
            current_user = SimpleNamespace(id=user_id)
            db = object()
            observed = {}
            resolved = []

            class FakeRouter:
                def resolve(self, *, domain, action):
                    resolved.append((domain, action))
                    return SimpleNamespace(id="research.direction_generate")

            fake_runtime = SimpleNamespace(
                router=FakeRouter(),
                executor=object(),
            )

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
                research_api,
                "get_default_skill_runtime",
                return_value=fake_runtime,
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
            self.assertIs(observed["skill_router"], fake_runtime.router)
            self.assertIs(observed["skill_executor"], fake_runtime.executor)
            self.assertEqual(result["directions_count"], 1)
            self.assertEqual(result["saved_ids"], ["direction-id"])
            self.assertEqual(result["workflow_run_id"], "workflow-run-id")
            self.assertEqual(resolved, [("research", "generate_directions")])

    def test_generate_design_api_uses_workflow_and_runtime(self):
        with stub_api_modules():
            import app.api.research as research_api
            from app.schemas.research_direction import GenerateDesignRequest

            project_id = uuid.uuid4()
            direction_id = uuid.uuid4()
            user_id = uuid.uuid4()
            current_user = SimpleNamespace(id=user_id)
            db = object()
            observed = {}
            resolved = []

            class FakeRouter:
                def resolve(self, *, domain, action):
                    resolved.append((domain, action))
                    return SimpleNamespace(id="research.project_design_generate")

            fake_runtime = SimpleNamespace(
                router=FakeRouter(),
                executor=object(),
            )

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
                research_api,
                "get_default_skill_runtime",
                return_value=fake_runtime,
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
            self.assertIs(observed["skill_router"], fake_runtime.router)
            self.assertIs(observed["skill_executor"], fake_runtime.executor)
            self.assertEqual(result["design"]["topic"], "智能学习系统研究")
            self.assertEqual(result["saved_id"], "design-id")
            self.assertEqual(result["workflow_run_id"], "workflow-run-id")
            self.assertEqual(resolved, [("research", "generate_design")])


if __name__ == "__main__":
    unittest.main()
