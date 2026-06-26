import unittest
import uuid
from types import SimpleNamespace


class ProjectWorkspaceApiTests(unittest.TestCase):
    def test_get_project_workspace_returns_snapshot(self):
        import app.api.projects as projects_api

        project_id = uuid.uuid4()
        current_user = SimpleNamespace(id=uuid.uuid4())
        db = object()
        snapshot = {"stats": {"outcomes_total": 2}}

        original_get_owned_project = getattr(projects_api, "get_owned_project")
        original_load_snapshot = getattr(projects_api, "load_project_workspace_snapshot_for_draft", None)
        projects_api.get_owned_project = lambda pid, user, db_session: SimpleNamespace(id=pid, user_id=user.id)
        projects_api.load_project_workspace_snapshot_for_draft = lambda db_session, pid, draft_id: snapshot

        try:
            result = projects_api.get_project_workspace(project_id, current_user=current_user, db=db)
        finally:
            projects_api.get_owned_project = original_get_owned_project
            if original_load_snapshot is not None:
                projects_api.load_project_workspace_snapshot_for_draft = original_load_snapshot

        self.assertEqual(result, snapshot)


if __name__ == "__main__":
    unittest.main()
