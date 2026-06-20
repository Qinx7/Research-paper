"""生成任务和文件的归属登记服务。"""
from uuid import UUID

from sqlalchemy.orm import Session

from ..models.generated_artifact import GeneratedArtifact


def register_task_artifact(
    db: Session,
    user_id: UUID,
    task_id: str,
    artifact_type: str,
) -> GeneratedArtifact:
    """登记一个异步任务属于当前用户。"""
    record = GeneratedArtifact(
        user_id=user_id,
        task_id=task_id,
        artifact_type=artifact_type,
    )
    db.add(record)
    db.commit()
    db.refresh(record)
    return record


def register_generated_file(
    db: Session,
    user_id: UUID,
    object_key: str,
    artifact_type: str,
    task_id: str | None = None,
) -> GeneratedArtifact:
    """登记一个生成文件属于当前用户。"""
    record = (
        db.query(GeneratedArtifact)
        .filter(GeneratedArtifact.object_key == object_key)
        .first()
    )
    if record:
        record.user_id = user_id
        record.artifact_type = artifact_type
        if task_id:
            record.task_id = task_id
    else:
        record = GeneratedArtifact(
            user_id=user_id,
            task_id=task_id,
            object_key=object_key,
            artifact_type=artifact_type,
        )
        db.add(record)
    db.commit()
    db.refresh(record)
    return record


def can_access_task(db: Session, user_id: UUID, task_id: str) -> bool:
    """判断当前用户是否拥有该异步任务。"""
    record = (
        db.query(GeneratedArtifact)
        .filter(GeneratedArtifact.task_id == task_id, GeneratedArtifact.user_id == user_id)
        .first()
    )
    return bool(record and record.user_id == user_id)


def can_access_object_key(db: Session, user_id: UUID, object_key: str) -> bool:
    """判断当前用户是否拥有该生成文件。"""
    record = (
        db.query(GeneratedArtifact)
        .filter(GeneratedArtifact.object_key == object_key, GeneratedArtifact.user_id == user_id)
        .first()
    )
    return bool(record and record.user_id == user_id)


def list_generated_files_by_type(db: Session, user_id: UUID, artifact_type: str) -> list[GeneratedArtifact]:
    """列出当前用户某种类型的生成文件。"""
    return (
        db.query(GeneratedArtifact)
        .filter(
            GeneratedArtifact.user_id == user_id,
            GeneratedArtifact.artifact_type == artifact_type,
            GeneratedArtifact.object_key.isnot(None),
        )
        .order_by(GeneratedArtifact.created_at.desc())
        .all()
    )
