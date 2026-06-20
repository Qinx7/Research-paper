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


if __name__ == "__main__":
    unittest.main()
