import unittest


class FakeCompatDb:
    def __init__(self):
        self.executed = []
        self.committed = False
        self.rolled_back = False

    def execute(self, statement):
        self.executed.append(str(statement))
        return None

    def commit(self):
        self.committed = True

    def rollback(self):
        self.rolled_back = True


class SchemaCompatTests(unittest.TestCase):
    def test_ensure_research_direction_content_column_adds_column(self):
        from app.services.schema_compat import ensure_research_direction_content_column

        db = FakeCompatDb()
        ensure_research_direction_content_column(db)

        self.assertTrue(db.committed)
        self.assertTrue(any("ALTER TABLE research_directions ADD COLUMN IF NOT EXISTS content JSONB" in item for item in db.executed))

    def test_ensure_project_design_content_column_adds_column(self):
        from app.services.schema_compat import ensure_project_design_content_column

        db = FakeCompatDb()
        ensure_project_design_content_column(db)

        self.assertTrue(db.committed)
        self.assertTrue(any("ALTER TABLE project_designs ADD COLUMN IF NOT EXISTS content JSONB" in item for item in db.executed))


if __name__ == "__main__":
    unittest.main()
