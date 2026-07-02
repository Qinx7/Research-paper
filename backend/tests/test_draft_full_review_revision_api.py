import unittest
from pathlib import Path


class DraftFullReviewRevisionApiTests(unittest.TestCase):
    def test_full_review_and_revision_routes_are_registered(self):
        source = Path("app/api/drafts.py").read_text(encoding="utf-8")

        self.assertIn('@router.post("/{draft_id}/review-full"', source)
        self.assertIn('@router.post("/{draft_id}/revise-full"', source)


if __name__ == "__main__":
    unittest.main()
