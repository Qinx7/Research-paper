import importlib.util
import unittest


class RemovedProductBoundaryTests(unittest.TestCase):
    def test_defense_modules_are_removed_from_product_code(self):
        removed_modules = [
            "app.api.defense",
            "app.agents.defense_ppt_agent",
            "app.schemas.defense_ppt",
            "app.tasks.defense_ppt_task",
        ]

        for module_name in removed_modules:
            with self.subTest(module_name=module_name):
                self.assertIsNone(importlib.util.find_spec(module_name))

    def test_celery_includes_no_defense_task(self):
        from app.core.celery_app import celery_app

        includes = list(celery_app.conf.imports or [])
        self.assertNotIn("app.tasks.defense_ppt_task", includes)


if __name__ == "__main__":
    unittest.main()
