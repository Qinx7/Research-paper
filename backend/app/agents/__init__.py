"""Agent 层"""
from .requirement_agent import requirement_agent
from .literature_search_agent import literature_search_agent
from .literature_review_agent import literature_review_agent
from .research_direction_agent import research_direction_agent
from .project_design_agent import project_design_agent
from .ppt_agent import ppt_agent
from .proposal_agent import proposal_agent
from .chat_agent import chat_stream, extract_keywords, ACADEMIC_SYSTEM_PROMPT
from .outcome_agent import outcome_agent
from .paper_writing_agent import paper_writing_agent
from .defense_ppt_agent import defense_ppt_agent

__all__ = [
    "requirement_agent",
    "literature_search_agent",
    "literature_review_agent",
    "research_direction_agent",
    "project_design_agent",
    "ppt_agent",
    "proposal_agent",
    "chat_stream",
    "extract_keywords",
    "ACADEMIC_SYSTEM_PROMPT",
    "outcome_agent",
    "paper_writing_agent",
    "defense_ppt_agent",
]
