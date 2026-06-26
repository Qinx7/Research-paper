"""Agent 层惰性导出。"""
from __future__ import annotations

from importlib import import_module

_LAZY_EXPORTS = {
    "requirement_agent": (".requirement_agent", "requirement_agent"),
    "literature_search_agent": (".literature_search_agent", "literature_search_agent"),
    "literature_review_agent": (".literature_review_agent", "literature_review_agent"),
    "research_direction_agent": (".research_direction_agent", "research_direction_agent"),
    "project_design_agent": (".project_design_agent", "project_design_agent"),
    "ppt_agent": (".ppt_agent", "ppt_agent"),
    "proposal_agent": (".proposal_agent", "proposal_agent"),
    "chat_stream": (".chat_agent", "chat_stream"),
    "extract_keywords": (".chat_agent", "extract_keywords"),
    "ACADEMIC_SYSTEM_PROMPT": (".chat_agent", "ACADEMIC_SYSTEM_PROMPT"),
    "outcome_agent": (".outcome_agent", "outcome_agent"),
    "paper_writing_agent": (".paper_writing_agent", "paper_writing_agent"),
    "defense_ppt_agent": (".defense_ppt_agent", "defense_ppt_agent"),
}

__all__ = sorted(_LAZY_EXPORTS.keys())


def __getattr__(name: str):
    if name not in _LAZY_EXPORTS:
        raise AttributeError(name)
    module_name, attr_name = _LAZY_EXPORTS[name]
    module = import_module(module_name, __name__)
    value = getattr(module, attr_name)
    globals()[name] = value
    return value
