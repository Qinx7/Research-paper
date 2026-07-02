import sys
import unittest
from contextlib import contextmanager
from types import ModuleType, SimpleNamespace
from unittest.mock import patch


@contextmanager
def stub_api_modules():
    fastapi = ModuleType("fastapi")
    responses = ModuleType("fastapi.responses")
    auth_dependency = ModuleType("app.services.auth_dependency")
    ppt_agent_module = ModuleType("app.agents.ppt_agent")
    ppt_task_module = ModuleType("app.tasks.ppt_task")
    upload_service_module = ModuleType("app.services.upload_service")

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

    def Query(default=None, **kwargs):
        return default

    fastapi.APIRouter = APIRouter
    fastapi.Depends = Depends
    fastapi.HTTPException = HTTPException
    fastapi.Query = Query
    fastapi.UploadFile = object
    responses.HTMLResponse = object
    responses.StreamingResponse = object
    auth_dependency.get_current_user = lambda: None
    ppt_agent_module.ppt_agent = SimpleNamespace(
        list_styles=lambda: [],
        resolve_style=lambda template: {"id": template, "name": template},
        generate=lambda **kwargs: "generated/demo.pptx",
    )
    ppt_task_module.generate_ppt_task = SimpleNamespace(delay=lambda **kwargs: None)
    upload_service_module.get_object_stream = lambda object_key: None

    with patch.dict(sys.modules, {
        "fastapi": fastapi,
        "fastapi.responses": responses,
        "app.services.auth_dependency": auth_dependency,
        "app.agents.ppt_agent": ppt_agent_module,
        "app.tasks.ppt_task": ppt_task_module,
        "app.services.upload_service": upload_service_module,
    }):
        yield


class PptApiSkillRuntimeTests(unittest.TestCase):
    def test_generate_ppt_delegates_to_workflow_facade(self):
        with stub_api_modules():
            import app.api.ppt as ppt_api
            from app.schemas.ppt import GeneratePPTRequest

            observed = {}

            def fake_workflow(**kwargs):
                observed.update(kwargs)
                return {
                    "success": True,
                    "filename": "demo.pptx",
                    "download_url": "/api/ppt/download/ppt/demo.pptx",
                    "object_key": "ppt/demo.pptx",
                    "design_fields": len(kwargs["design"]),
                    "style_id": kwargs["template"],
                    "style_name": "测试风格",
                    "workflow_status": "success",
                    "workflow_run_id": "run-1",
                }

            db = object()
            with patch.object(
                ppt_api,
                "run_ppt_generation_workflow",
                side_effect=fake_workflow,
            ), patch.object(
                ppt_api,
                "register_generated_file",
            ) as mock_register:
                result = ppt_api.generate_ppt(
                    GeneratePPTRequest(
                        design={"topic": "测试课题", "background": "背景"},
                        template="academic_blue",
                    ),
                    current_user=SimpleNamespace(id="user-1"),
                    db=db,
                )

            self.assertEqual(observed["design"], {"topic": "测试课题", "background": "背景"})
            self.assertEqual(observed["template"], "academic_blue")
            self.assertEqual(observed["user_id"], "user-1")
            self.assertEqual(result["download_url"], "/api/ppt/download/ppt/demo.pptx")
            mock_register.assert_called_once_with(db, "user-1", "ppt/demo.pptx", "project_ppt")

    def test_generate_html_deck_delegates_to_workflow_facade(self):
        with stub_api_modules():
            import app.api.ppt as ppt_api
            from app.schemas.ppt import GenerateHtmlDeckRequest

            observed = {}

            def fake_workflow(**kwargs):
                observed.update(kwargs)
                return {
                    "artifact_type": "html_deck",
                    "title": kwargs["deck_title"],
                    "object_key": "generated/decks/demo/index.html",
                    "filename": "index.html",
                    "theme": kwargs["theme"],
                    "slide_count": len(kwargs["slides_outline"]),
                    "preview_url": "/api/ppt/html-deck/preview/generated/decks/demo/index.html",
                    "download_url": "/api/ppt/html-deck/download/generated/decks/demo/index.html",
                    "workflow_status": "success",
                    "workflow_run_id": "run-1",
                }

            with patch.object(
                ppt_api,
                "run_deck_generation_workflow",
                side_effect=fake_workflow,
            ), patch.object(
                ppt_api,
                "register_generated_file",
            ):
                result = ppt_api.generate_html_deck(
                    GenerateHtmlDeckRequest(
                        deck_title="测试 Deck",
                        slides_outline=[{"title": "第一页"}],
                        theme="paper",
                    ),
                    current_user=SimpleNamespace(id="user-1"),
                    db=object(),
                )

            self.assertEqual(observed["deck_title"], "测试 Deck")
            self.assertEqual(observed["slides_outline"], [{"title": "第一页"}])
            self.assertEqual(observed["theme"], "paper")
            self.assertEqual(observed["user_id"], "user-1")
            self.assertEqual(result.title, "测试 Deck")


if __name__ == "__main__":
    unittest.main()
