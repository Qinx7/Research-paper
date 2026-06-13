"""文件上传服务 —— MinIO 对象存储 + 本地文件系统 fallback"""
import io
import os
import uuid

from fastapi import UploadFile
from minio import Minio
from minio.error import S3Error

from ..core.config import settings

# 本地存储根目录（MinIO 不可用时回退使用）
LOCAL_STORAGE_ROOT = os.path.abspath(
    os.path.join(os.path.dirname(__file__), "..", "..", "storage")
)

# MinIO 客户端（懒加载单例）
_minio_client: Minio | None = None


def _get_minio_client() -> Minio | None:
    """获取 MinIO 客户端实例，连接异常时返回 None（触发本地 fallback）"""
    global _minio_client
    if _minio_client is not None:
        return _minio_client
    try:
        # secure=False：内网 Docker 环境无需 TLS
        _minio_client = Minio(
            settings.MINIO_ENDPOINT,
            access_key=settings.MINIO_ACCESS_KEY,
            secret_key=settings.MINIO_SECRET_KEY,
            secure=False,
        )
        bucket = settings.MINIO_BUCKET
        if not _minio_client.bucket_exists(bucket):
            _minio_client.make_bucket(bucket)
        return _minio_client
    except Exception:
        _minio_client = None
        return None


# 允许的文件扩展名
ALLOWED_EXTENSIONS = {
    # 文档
    ".pdf", ".doc", ".docx", ".txt", ".md", ".tex",
    # 数据
    ".csv", ".json", ".xlsx", ".xls", ".xml",
    # 图片
    ".png", ".jpg", ".jpeg", ".gif", ".svg", ".bmp",
    # 代码
    ".py", ".js", ".ts", ".jsx", ".tsx", ".java", ".cpp", ".c", ".h", ".go", ".rs",
    ".ipynb",
    # 压缩包
    ".zip", ".tar", ".gz", ".rar",
}

MAX_UPLOAD_SIZE = 50 * 1024 * 1024  # 50MB


def validate_file_type(filename: str) -> bool:
    """检查文件扩展名是否在允许列表中"""
    ext = os.path.splitext(filename)[1].lower()
    return ext in ALLOWED_EXTENSIONS


def save_upload(file: UploadFile, subdirectory: str = "outcomes") -> str:
    """保存上传文件，返回对象 key（如 outcomes/abc123_data.csv）。

    优先写入 MinIO；MinIO 不可用时回退到本地 storage/ 目录。
    """
    safe_subdir = os.path.basename(subdirectory) or "outcomes"
    safe_filename = os.path.basename(file.filename or "untitled")
    unique_name = f"{uuid.uuid4().hex[:12]}_{safe_filename}"
    object_key = f"{safe_subdir}/{unique_name}"

    content = file.file.read()

    client = _get_minio_client()
    if client is not None:
        try:
            client.put_object(
                settings.MINIO_BUCKET,
                object_key,
                io.BytesIO(content),
                length=len(content),
                content_type=file.content_type or "application/octet-stream",
            )
            file.file.seek(0)
            return object_key
        except S3Error:
            pass  # 静默回退到本地存储

    # 本地存储 fallback
    target_dir = os.path.join(LOCAL_STORAGE_ROOT, safe_subdir)
    os.makedirs(target_dir, exist_ok=True)
    file_path = os.path.join(target_dir, unique_name)
    with open(file_path, "wb") as f:
        f.write(content)
    file.file.seek(0)
    return object_key


def get_object_stream(key: str):
    """获取文件内容流，用于下载响应。

    返回 (stream, size, content_type) 或 None（文件不存在）。
    """
    # MinIO 优先
    client = _get_minio_client()
    if client is not None:
        try:
            stat = client.stat_object(settings.MINIO_BUCKET, key)
            response = client.get_object(settings.MINIO_BUCKET, key)
            return response, stat.size, stat.content_type
        except S3Error:
            pass  # 回退到本地

    # 本地 fallback
    safe = os.path.abspath(os.path.join(LOCAL_STORAGE_ROOT, key))
    if not safe.startswith(LOCAL_STORAGE_ROOT):
        return None
    if os.path.exists(safe) and os.path.isfile(safe):
        size = os.path.getsize(safe)
        return open(safe, "rb"), size, "application/octet-stream"
    return None


def save_bytes(data: bytes, key: str, content_type: str = "application/octet-stream") -> str:
    """保存原始字节数据到 MinIO，返回对象 key。MinIO 不可用时回退本地。

    适用于 PPTX/DOCX/PDF 等生成式文件的持久化。
    """
    client = _get_minio_client()
    if client is not None:
        try:
            client.put_object(
                settings.MINIO_BUCKET,
                key,
                io.BytesIO(data),
                length=len(data),
                content_type=content_type,
            )
            return key
        except S3Error:
            pass

    # 本地存储 fallback
    safe_subdir = os.path.dirname(key) or "files"
    target_dir = os.path.join(LOCAL_STORAGE_ROOT, safe_subdir)
    os.makedirs(target_dir, exist_ok=True)
    filename = os.path.basename(key) or "file"
    file_path = os.path.join(target_dir, filename)
    with open(file_path, "wb") as f:
        f.write(data)
    return key


def delete_upload(key: str) -> bool:
    """删除文件。MinIO 优先，本地作为 fallback。"""
    client = _get_minio_client()
    if client is not None:
        try:
            client.remove_object(settings.MINIO_BUCKET, key)
            return True
        except S3Error:
            pass  # 回退到本地

    # 本地 fallback
    try:
        safe = os.path.abspath(os.path.join(LOCAL_STORAGE_ROOT, key))
        if not safe.startswith(LOCAL_STORAGE_ROOT):
            return False
        if os.path.exists(safe):
            os.remove(safe)
            return True
        return False
    except OSError:
        return False


def get_upload_url(key: str, download_base: str = "/api/outcomes") -> str:
    """根据对象 key 返回代理下载 URL"""
    safe = key.replace("\\", "/")
    return f"{download_base}/download/{safe}"
