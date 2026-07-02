"""多 Agent workflow runner 契约测试。"""
import unittest


class AgentWorkflowRunnerTests(unittest.TestCase):
    def test_nodes_run_in_order_and_merge_state(self):
        from app.agents.orchestration import AgentNode, AgentNodeResult, AgentWorkflowRunner, AgentWorkflowState

        class PlanNode(AgentNode):
            name = "plan"

            def run(self, state):
                return AgentNodeResult.success(
                    data_delta={"keywords": ["agent", "workflow"]},
                    messages=["planned"],
                )

        class SearchNode(AgentNode):
            name = "search"

            def run(self, state):
                keywords = state.data["keywords"]
                return AgentNodeResult.success(
                    data_delta={"query": " ".join(keywords)},
                    evidence_delta=[{"title": "workflow paper"}],
                    messages=["searched"],
                )

        state = AgentWorkflowState(workflow_name="literature_search", input={"query": "multi agent"})
        result = AgentWorkflowRunner([PlanNode(), SearchNode()]).run(state)

        self.assertEqual(result.state.data["query"], "agent workflow")
        self.assertEqual(result.state.evidence[0]["title"], "workflow paper")
        self.assertEqual(result.state.messages, ["planned", "searched"])
        self.assertEqual([event.node_name for event in result.events if event.event_type == "node_finished"], ["plan", "search"])

    def test_should_run_false_marks_node_as_skipped(self):
        from app.agents.orchestration import AgentNode, AgentNodeResult, AgentWorkflowRunner, AgentWorkflowState

        class SkippedNode(AgentNode):
            name = "skipped"

            def should_run(self, state):
                return False

            def run(self, state):
                raise AssertionError("skipped node should not run")

        state = AgentWorkflowState(workflow_name="literature_search")
        result = AgentWorkflowRunner([SkippedNode()]).run(state)

        self.assertEqual(result.events[-1].status, "skipped")
        self.assertEqual(result.state.errors, [])

    def test_node_exception_is_captured_and_stops_following_nodes(self):
        from app.agents.orchestration import AgentNode, AgentWorkflowRunner, AgentWorkflowState

        class FailingNode(AgentNode):
            name = "failing"

            def run(self, state):
                raise RuntimeError("source timeout")

        class ShouldNotRunNode(AgentNode):
            name = "should_not_run"

            def run(self, state):
                state.data["unexpected"] = True
                return None

        state = AgentWorkflowState(workflow_name="literature_search")
        result = AgentWorkflowRunner([FailingNode(), ShouldNotRunNode()]).run(state)

        self.assertEqual(result.state.status, "failed")
        self.assertIn("source timeout", result.state.errors[0])
        self.assertNotIn("unexpected", result.state.data)
        self.assertEqual(result.events[-1].node_name, "failing")
        self.assertEqual(result.events[-1].status, "failed")

    def test_failed_result_records_error_without_exception(self):
        from app.agents.orchestration import AgentNode, AgentNodeResult, AgentWorkflowRunner, AgentWorkflowState

        class FailedResultNode(AgentNode):
            name = "failed_result"

            def run(self, state):
                return AgentNodeResult.failed("no papers found")

        result = AgentWorkflowRunner([FailedResultNode()]).run(AgentWorkflowState(workflow_name="literature_search"))

        self.assertEqual(result.state.status, "failed")
        self.assertEqual(result.state.errors, ["failed_result: no papers found"])
        self.assertEqual(result.events[-1].status, "failed")

    def test_node_has_default_contract_fields(self):
        from app.agents.orchestration import AgentNode

        node = AgentNode()

        self.assertEqual(node.node_type, "task")
        self.assertEqual(node.label, "")
        self.assertFalse(node.visible)

    def test_warnings_and_artifacts_merge_into_state_metadata(self):
        from app.agents.orchestration import AgentNode, AgentNodeResult, AgentWorkflowRunner, AgentWorkflowState

        class DiagnoseNode(AgentNode):
            name = "diagnose"
            node_type = "diagnose"

            def run(self, state):
                return AgentNodeResult.success(
                    warnings=["Semantic Scholar 当前限流"],
                    artifacts=[{"kind": "search_task", "id": "task-1"}],
                )

        result = AgentWorkflowRunner([DiagnoseNode()]).run(AgentWorkflowState(workflow_name="literature_search"))

        self.assertEqual(result.state.metadata["warnings"], ["Semantic Scholar 当前限流"])
        self.assertEqual(result.state.metadata["artifacts"], [{"kind": "search_task", "id": "task-1"}])
        self.assertEqual(result.events[-1].payload["warnings"], ["Semantic Scholar 当前限流"])
        self.assertEqual(result.events[-1].payload["artifacts"], [{"kind": "search_task", "id": "task-1"}])

    def test_recorder_failure_is_captured_without_blocking_workflow(self):
        from app.agents.orchestration import AgentNode, AgentNodeResult, AgentWorkflowRunner, AgentWorkflowState

        class BrokenRecorder:
            def workflow_started(self, state):
                raise RuntimeError("record db unavailable")

        class OkNode(AgentNode):
            name = "ok"

            def run(self, state):
                return AgentNodeResult.success(data_delta={"ok": True})

        state = AgentWorkflowState(workflow_name="literature_search")
        result = AgentWorkflowRunner([OkNode()], recorder=BrokenRecorder()).run(state)

        self.assertEqual(result.state.status, "success")
        self.assertEqual(result.state.data["ok"], True)
        self.assertIn("record db unavailable", result.state.metadata["recording_errors"][0])

    def test_partial_success_state_is_not_overwritten(self):
        from app.agents.orchestration import AgentNode, AgentNodeResult, AgentWorkflowRunner, AgentWorkflowState

        class PartialNode(AgentNode):
            name = "partial"

            def run(self, state):
                state.status = "partial_success"
                return AgentNodeResult.success(warnings=["CNKI 服务超时，已使用其他来源"])

        result = AgentWorkflowRunner([PartialNode()]).run(AgentWorkflowState(workflow_name="literature_search"))

        self.assertEqual(result.state.status, "partial_success")
        self.assertEqual(result.state.metadata["warnings"], ["CNKI 服务超时，已使用其他来源"])


if __name__ == "__main__":
    unittest.main()
