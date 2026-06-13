import unittest

from app.services import cnki_search as module
from app.services.cnki_search import CNKIClient
from app.services.literature_search import PaperResult


class CnkiScraplingFallbackTests(unittest.TestCase):
    def test_fallback_disabled_by_default(self):
        original_enabled = module.settings.SCRAPLING_CNKI_ENABLED
        try:
            module.settings.SCRAPLING_CNKI_ENABLED = False
            client = CNKIClient(headless=True, timeout=5)

            should_run = client._should_try_scrapling_fallback(
                current_results=[],
                initial_results=[],
                gate_error_status="error",
                limit=5,
            )

            self.assertFalse(should_run)
        finally:
            module.settings.SCRAPLING_CNKI_ENABLED = original_enabled

    def test_fallback_runs_when_enabled_and_primary_empty(self):
        original_enabled = module.settings.SCRAPLING_CNKI_ENABLED
        try:
            module.settings.SCRAPLING_CNKI_ENABLED = True
            client = CNKIClient(headless=True, timeout=5)
            should_run = client._should_try_scrapling_fallback(
                current_results=[],
                initial_results=[],
                gate_error_status="error",
                limit=5,
            )
            self.assertTrue(should_run)
        finally:
            module.settings.SCRAPLING_CNKI_ENABLED = original_enabled

    def test_fallback_runs_when_gate_failed_before_limit(self):
        original_enabled = module.settings.SCRAPLING_CNKI_ENABLED
        try:
            module.settings.SCRAPLING_CNKI_ENABLED = True
            client = CNKIClient(headless=True, timeout=5)
            should_run = client._should_try_scrapling_fallback(
                current_results=[PaperResult(title="A", source="cnki")],
                initial_results=[],
                gate_error_status="blocked",
                limit=5,
            )
            self.assertTrue(should_run)
        finally:
            module.settings.SCRAPLING_CNKI_ENABLED = original_enabled


if __name__ == "__main__":
    unittest.main()
