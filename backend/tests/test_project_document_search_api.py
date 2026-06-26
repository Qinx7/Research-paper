import unittest
import uuid
from types import SimpleNamespace


class ProjectDocumentSearchApiTests(unittest.TestCase):
    def test_project_document_search_returns_service_results(self):
        import app.api.projects as projects_api

        project_id = uuid.uuid4()
        current_user = SimpleNamespace(id=uuid.uuid4())
        db = object()
        expected = [{"chunk_id": "c1", "title": "访谈记录"}]

        original_get_owned_project = projects_api.get_owned_project
        original_search = getattr(projects_api, "search_project_documents")
        projects_api.get_owned_project = lambda pid, user, db_session: SimpleNamespace(id=pid, user_id=user.id)
        projects_api.search_project_documents = lambda db_session, pid, query, limit=20: expected

        try:
            result = projects_api.search_project_document_api(project_id, q="RAG", current_user=current_user, db=db)
        finally:
            projects_api.get_owned_project = original_get_owned_project
            projects_api.search_project_documents = original_search

        self.assertEqual(result, expected)


if __name__ == "__main__":
    unittest.main()
