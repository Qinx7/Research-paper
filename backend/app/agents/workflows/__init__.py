"""业务 Agent workflow 入口。"""

from .deck_generation_workflow import run_deck_generation_workflow
from .literature_search_workflow import run_literature_search_workflow
from .paper_writing_workflow import run_generate_chapter_workflow
from .ppt_generation_workflow import run_ppt_generation_workflow
from .project_design_workflow import run_generate_project_design_workflow
from .research_direction_workflow import run_generate_research_directions_workflow

run_home_literature_search_workflow = run_literature_search_workflow
run_paper_chapter_generation_workflow = run_generate_chapter_workflow
run_project_design_workflow = run_generate_project_design_workflow
run_research_direction_workflow = run_generate_research_directions_workflow

__all__ = [
    "run_deck_generation_workflow",
    "run_ppt_generation_workflow",
    "run_home_literature_search_workflow",
    "run_literature_search_workflow",
    "run_generate_chapter_workflow",
    "run_generate_project_design_workflow",
    "run_generate_research_directions_workflow",
    "run_paper_chapter_generation_workflow",
    "run_project_design_workflow",
    "run_research_direction_workflow",
]
