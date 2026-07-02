import unittest
import uuid


class FakeQuery:
    def __init__(self, items):
        self.items = list(items)

    def filter(self, *args):
        return self

    def order_by(self, *args):
        return self

    def first(self):
        return self.items[0] if self.items else None


class FakeDb:
    def __init__(self):
        self.user_id = uuid.uuid4()
        self.other_user_id = uuid.uuid4()
        self.records = []
        self.commits = 0

    def query(self, model):
        if getattr(model, "__name__", "") == "GeneratedArtifact":
            return FakeQuery(self.records)
        return FakeQuery([])

    def add(self, item):
        self.records.append(item)

    def commit(self):
        self.commits += 1

    def refresh(self, item):
        return item

    def rollback(self):
        pass


class GeneratedArtifactAccessTests(unittest.TestCase):
    def setUp(self):
        self.db = FakeDb()

    def test_register_task_records_owner(self):
        from app.services.generated_artifact_service import register_task_artifact

        record = register_task_artifact(
            db=self.db,
            user_id=self.db.user_id,
            task_id="task-1",
            artifact_type="project_ppt",
        )

        self.assertEqual(record.user_id, self.db.user_id)
        self.assertEqual(record.task_id, "task-1")
        self.assertEqual(record.artifact_type, "project_ppt")
        self.assertEqual(self.db.commits, 1)

    def test_user_can_access_own_object_key_but_not_other_users_key(self):
        from app.services.generated_artifact_service import (
            can_access_object_key,
            register_generated_file,
        )

        register_generated_file(
            db=self.db,
            user_id=self.db.user_id,
            object_key="generated/own.pptx",
            artifact_type="project_ppt",
        )

        self.assertTrue(can_access_object_key(self.db, self.db.user_id, "generated/own.pptx"))
        self.assertFalse(can_access_object_key(self.db, self.db.other_user_id, "generated/own.pptx"))

    def test_user_can_access_own_task_but_not_other_users_task(self):
        from app.services.generated_artifact_service import can_access_task, register_task_artifact

        register_task_artifact(
            db=self.db,
            user_id=self.db.user_id,
            task_id="task-2",
            artifact_type="project_ppt",
        )

        self.assertTrue(can_access_task(self.db, self.db.user_id, "task-2"))
        self.assertFalse(can_access_task(self.db, self.db.other_user_id, "task-2"))


if __name__ == "__main__":
    unittest.main()
