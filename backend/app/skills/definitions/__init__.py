"""技能定义集合。"""

from .paper import build_paper_skill_definitions
from .ppt import build_ppt_skill_definitions
from .research import build_research_skill_definitions

__all__ = [
    "build_paper_skill_definitions",
    "build_ppt_skill_definitions",
    "build_research_skill_definitions",
]
