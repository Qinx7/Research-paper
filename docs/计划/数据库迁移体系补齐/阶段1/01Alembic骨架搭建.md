# 阶段1 01 Alembic 骨架搭建

## 目标

给 `backend` 建立 Alembic 迁移骨架。

## 建议新增内容

1. `backend/alembic.ini`
2. `backend/alembic/env.py`
3. `backend/alembic/script.py.mako`
4. `backend/alembic/versions/`

## 关键要求

1. Alembic 能读取当前 `SQLAlchemy Base.metadata`
2. 数据库连接读取现有配置，而不是另起一套配置源
3. 迁移目录结构遵循标准约定，避免后续自定义负担

## 风险控制

1. 不直接改业务模型
2. 先保证迁移框架可运行
3. 暂不改启动建表逻辑
