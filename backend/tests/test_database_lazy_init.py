import unittest
from unittest.mock import patch


class DatabaseLazyInitTests(unittest.TestCase):
    def test_importing_database_module_does_not_create_engine_immediately(self):
        with patch("sqlalchemy.create_engine") as mock_create_engine:
            import importlib
            module = importlib.import_module("app.core.database")
            importlib.reload(module)

            self.assertEqual(mock_create_engine.call_count, 0)

            with patch("app.core.database._SESSION_FACTORY", None):
                try:
                    module.SessionLocal()
                except Exception:
                    pass

            self.assertGreaterEqual(mock_create_engine.call_count, 1)


if __name__ == "__main__":
    unittest.main()
