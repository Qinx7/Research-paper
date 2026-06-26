# 阶段1 01 后端资料搜索 API

## 目标

提供一个基于现有知识块的项目资料搜索接口。

## 建议接口

```text
GET /api/projects/{project_id}/document-search?q=...
```

## 返回字段建议

每条结果至少包含：

1. `chunk_id`
2. `outcome_id`
3. `title`
4. `source_filename`
5. `source_type`
6. `content_excerpt`
7. `download_url`
8. `score`
9. `score_reasons`

## 实现原则

1. 只搜索当前项目数据
2. 先按关键词匹配做最小闭环
3. 沿用当前知识块数据，不引入新表

## 验证点

1. 输入关键词后能返回命中 chunk
2. 结果中能拿到原文件下载地址
3. 空查询和无结果有稳定返回
