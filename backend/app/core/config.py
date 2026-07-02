"""应用配置，从环境变量读取。"""
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    APP_NAME: str = "LiteratureDrivenResearchAgent"
    APP_ENV: str = "development"
    APP_HOST: str = "0.0.0.0"
    APP_PORT: int = 8000

    DATABASE_URL: str = "postgresql://postgres:postgres@localhost:5432/research_agent"
    REDIS_URL: str = "redis://localhost:6379/0"

    # MinIO 配置（生产环境必须通过环境变量设置）
    MINIO_ENDPOINT: str = "localhost:9000"
    MINIO_ACCESS_KEY: str = ""
    MINIO_SECRET_KEY: str = ""
    MINIO_BUCKET: str = "research-agent"

    LLM_PROVIDER: str = "deepseek"
    OPENAI_API_KEY: str = ""
    DEEPSEEK_API_KEY: str = ""
    DEEPSEEK_BASE_URL: str = "https://api.deepseek.com"
    DEEPSEEK_MODEL: str = "deepseek-chat"

    EMBEDDING_PROVIDER: str = "openai"
    EMBEDDING_BASE_URL: str = "https://api.openai.com"
    EMBEDDING_API_KEY: str = ""
    EMBEDDING_MODEL: str = "text-embedding-3-large"

    OPENALEX_API_KEY: str = ""
    SEMANTIC_SCHOLAR_API_KEY: str = ""
    CROSSREF_MAILTO: str = ""
    PUBSCHOLAR_USER_ID: str = ""
    AUTHORITY_CATALOG_PATH: str = ""

    # CNKI 搜索配置
    CNKI_HEADLESS: bool = False
    CNKI_TIMEOUT: int = 30
    CNKI_ENABLED: bool = False
    SCRAPLING_CNKI_ENABLED: bool = False
    SCRAPLING_CNKI_TIMEOUT: int = 40
    SCRAPLING_CNKI_FALLBACK_ON_EMPTY: bool = True

    # 维普搜索配置
    CQVIP_HEADLESS: bool = True
    CQVIP_TIMEOUT: int = 30
    CQVIP_ENABLED: bool = False
    SCRAPLING_CQVIP_ENABLED: bool = False
    SCRAPLING_CQVIP_TIMEOUT: int = 40
    SCRAPLING_CQVIP_FALLBACK_ON_EMPTY: bool = True

    MAX_UPLOAD_SIZE: int = 50 * 1024 * 1024
    TESSERACT_CMD: str = ""

    # JWT 配置（生产环境必须通过环境变量设置强随机密钥）
    JWT_SECRET_KEY: str = ""
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 1440
    RUNTIME_SCHEMA_BOOTSTRAP: bool = True

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


settings = Settings()
