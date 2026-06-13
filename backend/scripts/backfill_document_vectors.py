"""历史文献向量回填脚本。

用途：
1. 从 papers 表读取已有文献；
2. 调用 embedding 服务生成向量；
3. 批量写入 document_vectors 表。

说明：
- 默认按 created_at 倒序回填全部文献；
- 若 embedding 网络不可用，会输出 0 条写入；
- 可通过 --limit 控制单次回填数量，便于分批执行。
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

from sqlalchemy import text

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from app.core.database import SessionLocal
from app.models.paper import Paper
from app.services.embedding_service import ensure_document_vectors_table, batch_store_papers


def main() -> None:
    parser = argparse.ArgumentParser(description="回填 papers 表中的文献到 document_vectors 向量表")
    parser.add_argument("--limit", type=int, default=200, help="本次最多回填多少篇文献")
    args = parser.parse_args()

    db = SessionLocal()
    try:
        ensure_document_vectors_table(db)

        papers = (
            db.query(Paper)
            .order_by(Paper.created_at.desc())
            .limit(args.limit)
            .all()
        )
        print(f"papers_found={len(papers)}")
        if not papers:
            return

        payload = []
        for paper in papers:
            payload.append({
                "title": paper.title,
                "authors": _split_authors(paper.authors),
                "year": paper.year,
                "venue": paper.venue,
                "doi": paper.doi,
                "abstract": paper.abstract,
                "source": paper.source or "unknown",
            })

        stored = batch_store_papers(db, payload)
        total_vectors = db.execute(text("SELECT COUNT(*) FROM document_vectors")).scalar()

        print(f"stored_count={stored}")
        print(f"document_vectors_count={total_vectors}")
    finally:
        db.close()


def _split_authors(value: str | None) -> list[str]:
    if not value:
        return []
    if ";" in value:
        return [part.strip() for part in value.split(";") if part.strip()]
    if "," in value:
        return [part.strip() for part in value.split(",") if part.strip()]
    return [value.strip()] if value.strip() else []


if __name__ == "__main__":
    main()
