import unittest
from types import SimpleNamespace


class FakeBaseMetadata:
    def __init__(self):
        self.called_with = None

    def create_all(self, bind=None):
        self.called_with = bind


class FakeBase:
    def __init__(self):
        self.metadata = FakeBaseMetadata()


class MigrationServiceTests(unittest.TestCase):
    def test_should_run_runtime_schema_bootstrap_reads_flag(self):
        from app.services.migration_service import should_run_runtime_schema_bootstrap

        enabled = SimpleNamespace(RUNTIME_SCHEMA_BOOTSTRAP=True)
        disabled = SimpleNamespace(RUNTIME_SCHEMA_BOOTSTRAP=False)

        self.assertTrue(should_run_runtime_schema_bootstrap(enabled))
        self.assertFalse(should_run_runtime_schema_bootstrap(disabled))

    def test_apply_runtime_schema_bootstrap_runs_create_all_and_compat(self):
        from app.services.migration_service import apply_runtime_schema_bootstrap

        fake_base = FakeBase()
        fake_engine = object()
        fake_db = object()
        calls = []

        def fake_session_factory():
            return fake_db

        def fake_close_db(_db):
            calls.append("close")

        def fake_compat(_db):
            calls.append("compat")

        def fake_vectors(_db):
            calls.append("vectors")

        apply_runtime_schema_bootstrap(
            engine=fake_engine,
            base=fake_base,
            session_factory=fake_session_factory,
            close_db=fake_close_db,
            ensure_conversation_user_column=fake_compat,
            ensure_research_direction_content_column=fake_compat,
            ensure_project_design_content_column=fake_compat,
            ensure_document_vectors_table=fake_vectors,
        )

        self.assertIs(fake_base.metadata.called_with, fake_engine)
        self.assertEqual(calls.count("compat"), 3)
        self.assertIn("vectors", calls)
        self.assertEqual(calls[-1], "close")


if __name__ == "__main__":
    unittest.main()
