import sys
import unittest
import uuid
from contextlib import contextmanager
from types import ModuleType, SimpleNamespace
from unittest.mock import patch


@contextmanager
def stub_api_modules():
    fastapi = ModuleType("fastapi")
    auth_dependency = ModuleType("app.services.auth_dependency")
    upload_service = ModuleType("app.services.upload_service")

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

        def patch(self, *args, **kwargs):
            return lambda fn: fn

        def delete(self, *args, **kwargs):
            return lambda fn: fn

    def Depends(value):
        return value

    fastapi.APIRouter = APIRouter
    fastapi.Depends = Depends
    fastapi.HTTPException = HTTPException
    fastapi.UploadFile = object
    auth_dependency.get_current_user = lambda: None
    upload_service.delete_upload = lambda path: None

    with patch.dict(sys.modules, {
        "fastapi": fastapi,
        "app.services.auth_dependency": auth_dependency,
        "app.services.upload_service": upload_service,
    }):
        yield


class FakeQuery:
    def __init__(self, items):
        self.items = list(items)

    def filter(self, *args, **kwargs):
        return self

    def all(self):
        return list(self.items)

    def first(self):
        return self.items[0] if self.items else None


class FakeDb:
    def __init__(self, model_items):
        self.model_items = model_items
        self.deleted = []
        self.committed = False
        self.rolled_back = False
        self.flushed = False

    def query(self, model):
        return FakeQuery(self.model_items.get(getattr(model, "__name__", ""), []))

    def delete(self, item):
        self.deleted.append(item)

    def flush(self):
        self.flushed = True

    def commit(self):
        self.committed = True

    def rollback(self):
        self.rolled_back = True


class ProjectDeleteTests(unittest.TestCase):
    def test_delete_project_dependencies_removes_related_rows(self):
        with stub_api_modules():
            import app.api.projects as projects_api

            project_id = uuid.uuid4()
            items = {
                "PaperNote": [SimpleNamespace(id=uuid.uuid4(), project_id=project_id)],
                "ProjectDocumentChunk": [SimpleNamespace(id=uuid.uuid4(), project_id=project_id)],
                "Draft": [SimpleNamespace(id=uuid.uuid4(), project_id=project_id)],
                "ProjectDesign": [SimpleNamespace(id=uuid.uuid4(), project_id=project_id)],
                "ResearchDirection": [SimpleNamespace(id=uuid.uuid4(), project_id=project_id)],
                "ZoteroSync": [SimpleNamespace(id=uuid.uuid4(), project_id=project_id)],
                "AgentWorkflowRun": [SimpleNamespace(id=uuid.uuid4(), project_id=project_id)],
                "LiteratureSearchTask": [SimpleNamespace(id=uuid.uuid4(), project_id=project_id)],
                "Outcome": [SimpleNamespace(id=uuid.uuid4(), project_id=project_id, file_path=None)],
                "Paper": [SimpleNamespace(id=uuid.uuid4(), project_id=project_id)],
            }
            db = FakeDb(items)

            projects_api._delete_project_dependencies(db, project_id)

            self.assertEqual(len(db.deleted), 10)

    def test_delete_project_flushes_dependencies_before_project_delete(self):
        with stub_api_modules():
            import app.api.projects as projects_api

            project_id = uuid.uuid4()
            current_user = SimpleNamespace(id=uuid.uuid4())
            project = SimpleNamespace(id=project_id, user_id=current_user.id)
            db = FakeDb({"Project": [project]})

            original_cleanup = projects_api._delete_project_dependencies
            projects_api._delete_project_dependencies = lambda db_session, pid: db_session.delete(SimpleNamespace(id="child"))

            try:
                projects_api.delete_project(project_id, current_user=current_user, db=db)
            finally:
                projects_api._delete_project_dependencies = original_cleanup

            self.assertTrue(db.flushed)
            self.assertTrue(db.committed)


if __name__ == "__main__":
    unittest.main()
