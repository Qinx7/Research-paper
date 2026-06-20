"""Embedding 服务 —— OpenAI text-embedding API 封装 + pgvector 向量存储/检索"""
import logging

import httpx
from sqlalchemy import text as sa_text
from sqlalchemy.orm import Session

from ..core.config import settings

logger = logging.getLogger(__name__)

# text-embedding-3-large 输出维度（可通过 API 参数调整，1024 在精度和效率间取得平衡）
EMBEDDING_DIM = 1024


def _api_key() -> str:
    """获取 Embedding API Key。优先用 EMBEDDING_API_KEY，回退到 OPENAI_API_KEY"""
    key = settings.EMBEDDING_API_KEY or settings.OPENAI_API_KEY
    if not key:
        raise ValueError("EMBEDDING_API_KEY 或 OPENAI_API_KEY 未配置，请在 .env 中设置以启用向量检索")
    return key


def embed_texts(texts: list[str]) -> list[list[float]] | None:
    """调用 Embedding API，返回向量列表。通过 EMBEDDING_BASE_URL 可对接任意兼容服务。

    参数：
        texts: 待向量化的文本列表（单次最多约 100 条）
    返回：
        embedding 向量列表，与输入一一对应；失败返回 None
    """
    if not texts:
        return []

    try:
        key = _api_key()
    except ValueError as e:
        logger.warning(f"Embedding 跳过: {e}")
        return None

    url = f"{settings.EMBEDDING_BASE_URL.rstrip('/')}/v1/embeddings"
    # dimensions 参数仅 OpenAI 支持，其他兼容服务通常由模型固定维度
    is_openai = "openai.com" in settings.EMBEDDING_BASE_URL
    body: dict = {
        "model": settings.EMBEDDING_MODEL,
        "input": texts,
    }
    if is_openai:
        body["dimensions"] = EMBEDDING_DIM

    try:
        resp = httpx.post(
            url,
            headers={
                "Authorization": f"Bearer {key}",
                "Content-Type": "application/json",
            },
            json=body,
            timeout=60.0,
        )
        resp.raise_for_status()
        data = resp.json()
        return [item["embedding"] for item in data["data"]]
    except Exception as e:
        logger.warning(f"Embedding API 调用失败: {e}")
        return None


def embed_text(text: str) -> list[float] | None:
    """单条文本向量化的便捷方法"""
    result = embed_texts([text])
    if result:
        return result[0]
    return None


def _embedding_to_str(vec: list[float]) -> str:
    """将 embedding 列表转为 pgvector 接受的字符串格式 [0.1,0.2,...]"""
    return "[" + ",".join(str(v) for v in vec) + "]"


def store_paper_embedding(
    db: Session,
    title: str,
    authors: list[str],
    year: int | None,
    venue: str | None,
    doi: str | None,
    abstract: str | None,
    source: str,
) -> bool:
    """为一篇论文生成 embedding 并存入 pgvector。

    通过 doi 去重（已存在则更新）；无 doi 时通过 title + first_author 去重。
    返回 True 表示成功存入。
    """
    text_to_embed = f"标题: {title}\n摘要: {abstract or '无'}".strip()
    embedding = embed_text(text_to_embed)
    if embedding is None:
        return False

    embedding_str = _embedding_to_str(embedding)
    authors_str = ", ".join(authors) if authors else None

    try:
        # 通过 doi 或 title+author 做 upsert
        if doi:
            existing = db.execute(
                sa_text(
                    "SELECT id, doi FROM document_vectors WHERE doi = :doi LIMIT 1"
                ),
                {"doi": doi},
            ).fetchone()
        else:
            first_author = authors[0] if authors else ""
            existing = db.execute(
                sa_text(
                    "SELECT id, doi FROM document_vectors "
                    "WHERE title = :title AND authors LIKE :author_prefix LIMIT 1"
                ),
                {"title": title, "author_prefix": f"{first_author}%"},
            ).fetchone()

        if existing:
            # 更新已有记录
            db.execute(
                sa_text(
                    "UPDATE document_vectors SET "
                    "embedding = CAST(:embedding AS vector), "
                    "abstract = :abstract, "
                    "year = :year, "
                    "venue = :venue, "
                    "source = :source "
                    "WHERE id = :id"
                ),
                {
                    "embedding": embedding_str,
                    "abstract": abstract,
                    "year": year,
                    "venue": venue,
                    "source": source,
                    "id": existing.id,
                },
            )
        else:
            # 插入新记录
            db.execute(
                sa_text(
                    "INSERT INTO document_vectors "
                    "(title, authors, year, venue, doi, abstract, source, embedding) "
                    "VALUES (:title, :authors, :year, :venue, :doi, :abstract, :source, "
                    "CAST(:embedding AS vector))"
                ),
                {
                    "title": title,
                    "authors": authors_str,
                    "year": year,
                    "venue": venue,
                    "doi": doi,
                    "abstract": abstract,
                    "source": source,
                    "embedding": embedding_str,
                },
            )
        db.commit()
        return True
    except Exception as e:
        logger.warning(f"存储 embedding 失败 (title={title[:40]}): {e}")
        db.rollback()
        return False


def batch_store_papers(
    db: Session,
    papers: list[dict],
) -> int:
    """批量嵌入并存储论文（单次 API 调用）。

    参数：
        db: 数据库会话
        papers: 论文字典列表，每项需含 title/authors/year/venue/doi/abstract/source
    返回：
        成功存入的论文数量
    """
    if not papers:
        return 0

    # 构建待嵌入文本
    texts = []
    for p in papers:
        text = f"标题: {p.get('title', '')}\n摘要: {p.get('abstract', '无')}".strip()
        texts.append(text)

    # 批量调用 embedding API
    embeddings = embed_texts(texts)
    if embeddings is None:
        return 0

    stored = 0
    for i, p in enumerate(papers):
        embedding = embeddings[i]
        embedding_str = _embedding_to_str(embedding)
        authors_str = ", ".join(p.get("authors", [])) if p.get("authors") else None
        title = p.get("title", "")
        doi = p.get("doi")
        abstract = p.get("abstract")
        year = p.get("year")
        venue = p.get("venue")
        source = p.get("source", "unknown")

        try:
            # 通过 doi 或 title+author 做 upsert
            if doi:
                existing = db.execute(
                    sa_text("SELECT id, doi FROM document_vectors WHERE doi = :doi LIMIT 1"),
                    {"doi": doi},
                ).fetchone()
            else:
                first_author = (p.get("authors") or [""])[0]
                existing = db.execute(
                    sa_text(
                        "SELECT id, doi FROM document_vectors "
                        "WHERE title = :title AND authors LIKE :author_prefix LIMIT 1"
                    ),
                    {"title": title, "author_prefix": f"{first_author}%"},
                ).fetchone()

            if existing:
                db.execute(
                    sa_text(
                        "UPDATE document_vectors SET "
                        "embedding = CAST(:embedding AS vector), "
                        "abstract = :abstract, "
                        "year = :year, "
                        "venue = :venue, "
                        "source = :source "
                        "WHERE id = :id"
                    ),
                    {
                        "embedding": embedding_str,
                        "abstract": abstract,
                        "year": year,
                        "venue": venue,
                        "source": source,
                        "id": existing.id,
                    },
                )
            else:
                db.execute(
                    sa_text(
                        "INSERT INTO document_vectors "
                        "(title, authors, year, venue, doi, abstract, source, embedding) "
                        "VALUES (:title, :authors, :year, :venue, :doi, :abstract, :source, "
                        "CAST(:embedding AS vector))"
                    ),
                    {
                        "title": title,
                        "authors": authors_str,
                        "year": year,
                        "venue": venue,
                        "doi": doi,
                        "abstract": abstract,
                        "source": source,
                        "embedding": embedding_str,
                    },
                )
            stored += 1
        except Exception as e:
            logger.warning(f"存储 embedding 失败 (title={title[:40]}): {e}")
            db.rollback()
            continue

    if stored > 0:
        db.commit()
    return stored


def search_similar_papers(
    db: Session,
    query: str,
    top_k: int = 5,
    min_similarity: float = 0.7,
) -> list[dict]:
    """语义检索相关论文。

    参数：
        query: 用户查询文本
        top_k: 返回最相似的前 k 篇
        min_similarity: 最低相似度阈值（0~1，越大越相似）
    返回：
        相似论文列表，每项包含 title/authors/year/venue/abstract/source/similarity
    """
    embedding = embed_text(query)
    if embedding is None:
        return []

    embedding_str = _embedding_to_str(embedding)

    try:
        rows = db.execute(
            sa_text(
                "SELECT title, authors, year, venue, doi, abstract, source, "
                "1 - (embedding <=> CAST(:embedding AS vector)) AS similarity "
                "FROM document_vectors "
                "WHERE 1 - (embedding <=> CAST(:embedding AS vector)) >= :min_similarity "
                "ORDER BY embedding <=> CAST(:embedding AS vector) "
                "LIMIT :limit"
            ),
            {
                "embedding": embedding_str,
                "min_similarity": min_similarity,
                "limit": top_k,
            },
        ).fetchall()

        return [
            {
                "title": row.title,
                "authors": row.authors.split(", ") if row.authors else [],
                "year": row.year,
                "venue": row.venue,
                "doi": row.doi,
                "abstract": row.abstract,
                "source": row.source,
                "similarity": round(row.similarity, 4) if row.similarity is not None else 0,
            }
            for row in rows
        ]
    except Exception as e:
        logger.warning(f"向量检索失败: {e}")
        db.rollback()
        return []


def ensure_pgvector_extension(db: Session) -> bool:
    """确保 pgvector 扩展已启用，不存在则创建"""
    try:
        db.execute(sa_text("CREATE EXTENSION IF NOT EXISTS vector"))
        db.commit()
        return True
    except Exception as e:
        logger.warning(f"启用 pgvector 扩展失败: {e}")
        db.rollback()
        return False


def ensure_document_vectors_table(db: Session) -> bool:
    """确保 document_vectors 表存在，不存在则创建"""
    try:
        # 先启用扩展
        ensure_pgvector_extension(db)

        db.execute(sa_text(
            f"CREATE TABLE IF NOT EXISTS document_vectors ("
            "  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),"
            "  title VARCHAR(500) NOT NULL,"
            "  authors TEXT,"
            "  year INTEGER,"
            "  venue VARCHAR(255),"
            "  doi VARCHAR(255),"
            "  abstract TEXT,"
            "  source VARCHAR(50),"
            f"  embedding vector({EMBEDDING_DIM}),"
            "  created_at TIMESTAMP DEFAULT now()"
            ")"
        ))
        # 为向量列创建 IVFFlat 索引以加速检索
        db.execute(sa_text(
            "CREATE INDEX IF NOT EXISTS idx_document_vectors_embedding "
            "ON document_vectors USING ivfflat (embedding vector_cosine_ops)"
        ))
        db.commit()
        return True
    except Exception as e:
        logger.warning(f"创建 document_vectors 表失败: {e}")
        db.rollback()
        return False
