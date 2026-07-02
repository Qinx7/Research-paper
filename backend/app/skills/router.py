"""技能路由器。"""
from __future__ import annotations

from .models import SkillDefinition, SkillRouteNotFoundError
from .registry import SkillRegistry


DEFAULT_SKILL_ACTIONS: dict[tuple[str, str], str] = {
    ("paper", "plan"): "paper.plan",
    ("paper", "generate_outline"): "paper.outline_generate",
    ("paper", "review_chapter"): "paper.review_pass",
    ("paper", "apply_revision"): "paper.revision_apply",
    ("paper", "review_full"): "paper.full_review_pass",
    ("paper", "revise_full"): "paper.full_revision_apply",
    ("paper", "write_chapter"): "paper.chapter_draft",
    ("paper", "validate_chapter"): "paper.chapter_grounding",
    ("research", "generate_directions"): "research.direction_generate",
    ("research", "score_directions"): "research.direction_score",
    ("research", "generate_design"): "research.project_design_generate",
    ("ppt", "generate_project_pptx"): "ppt.project_pptx",
    ("ppt", "preview_html_deck"): "ppt.web_html_deck",
}

# 兼容旧名称 / 内部 workflow 语义
DEFAULT_SKILL_ACTIONS.update({
    ("paper", "outline_generate"): "paper.outline_generate",
    ("paper", "review_pass"): "paper.review_pass",
    ("paper", "revision_apply"): "paper.revision_apply",
    ("paper", "full_review_pass"): "paper.full_review_pass",
    ("paper", "full_revision_apply"): "paper.full_revision_apply",
    ("paper", "chapter_draft"): "paper.chapter_draft",
    ("paper", "chapter_grounding"): "paper.chapter_grounding",
    ("research", "direction_generate"): "research.direction_generate",
    ("research", "direction_score"): "research.direction_score",
    ("research", "project_design_generate"): "research.project_design_generate",
    ("ppt", "project_pptx"): "ppt.project_pptx",
})


class SkillRouter:
    """按场景把业务动作映射到 skill_id。"""

    def __init__(
        self,
        registry: SkillRegistry,
        action_map: dict[tuple[str, str], str] | None = None,
    ):
        self.registry = registry
        self.action_map = dict(DEFAULT_SKILL_ACTIONS)
        if action_map:
            self.action_map.update(action_map)

    def resolve(self, *, domain: str, action: str) -> SkillDefinition:
        """根据领域和动作解析技能定义。"""
        key = (domain, action)
        skill_id = self.action_map.get(key)
        if not skill_id:
            raise SkillRouteNotFoundError(f"未找到技能路由：{domain}.{action}")
        return self.registry.get(skill_id)

    def resolve_id(self, *, domain: str, action: str) -> str:
        """解析得到 skill_id。"""
        return self.resolve(domain=domain, action=action).id

    def register_route(self, *, domain: str, action: str, skill_id: str) -> None:
        """注册或覆盖动作路由。"""
        self.action_map[(domain, action)] = skill_id

    def list_routes(self, *, domain: str | None = None) -> list[dict[str, str]]:
        """列出当前动作路由。"""
        items = []
        for (route_domain, action), skill_id in sorted(self.action_map.items()):
            if domain and route_domain != domain:
                continue
            items.append({
                "domain": route_domain,
                "action": action,
                "skill_id": skill_id,
            })
        return items
