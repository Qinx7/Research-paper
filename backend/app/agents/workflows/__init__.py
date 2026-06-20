"""业务 Agent workflow 入口。"""

from .literature_search_workflow import run_literature_search_workflow
from .paper_writing_workflow import run_generate_chapter_workflow
from .project_design_workflow import run_generate_project_design_workflow
from .proposal_workflow import run_generate_proposal_workflow
from .research_direction_workflow import run_generate_research_directions_workflow

__all__ = [
    "run_literature_search_workflow",
    "run_generate_chapter_workflow",
    "run_generate_project_design_workflow",
    "run_generate_proposal_workflow",
    "run_generate_research_directions_workflow",
]
