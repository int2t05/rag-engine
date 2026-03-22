# API 路由

以下为 **`/api` 前缀**（`settings.API_V1_STR`，通常为 `/api`）下的业务路由，与 `app/api/api_v1/api.py` 及各模块 `routes*.py` 一致。另有 **`GET /`**、**`GET /api/health`** 定义在 `app/main.py`。

## 路由总览

| 前缀 | 标签 | 模块 | 功能 |
|------|------|------|------|
| `/api/auth` | auth | `app.modules.auth` | 注册、登录、校验 Token |
| `/api/knowledge-base` | knowledge-base | `app.modules.knowledge` | 知识库 CRUD、文档上传/处理/检索辅助 |
| `/api/chat` | chat | `app.modules.chat` | 对话 CRUD、流式 RAG（SSE） |
| `/api/evaluation` | evaluation | `app.modules.evaluation` | 评估任务、用例导入、结果查询 |
| `/api/llm-configs` | llm-configs | `app.modules.llm_config` | LLM/嵌入配置列表、增删改、激活 |

## 应用级

| 方法 | 端点 | 功能 |
|------|------|------|
| GET | `/` | 浏览器访问重定向至 `/docs`；非 HTML 客户端返回 JSON |
| GET | `/api/health` | 健康检查（`status`、`version`） |

## 错误响应

业务层抛出的 **`AppServiceError`**（`app.core.exceptions`）由 `app/main.py` 中的全局异常处理器捕获，映射为与 **`HTTPException` 相同形状**的 JSON：`{"detail": ...}`；401 等场景下可带 `WWW-Authenticate` 等响应头（见 `app/api/errors.py` 中 `http_exception_from_service`）。

## 认证模块 `/api/auth`

| 方法 | 端点 | 功能 |
|------|------|------|
| POST | `/register` | 用户注册 |
| POST | `/token` | OAuth2 密码模式登录 |
| POST | `/test-token` | 校验当前 Bearer Token，返回用户信息 |

## 知识库模块 `/api/knowledge-base`

### 知识库 CRUD（`routes_knowledge_base`）

| 方法 | 端点 | 功能 |
|------|------|------|
| POST | `/` | 创建知识库 |
| GET | `/` | 列表（`skip`/`limit`） |
| GET | `/{kb_id}` | 详情 |
| PUT | `/{kb_id}` | 更新元数据 |
| DELETE | `/{kb_id}` | 删除知识库及关联数据 |

### 文档与检索（`routes_documents`，同前缀）

| 方法 | 端点 | 功能 |
|------|------|------|
| POST | `/{kb_id}/documents/upload` | 多文件上传至 MinIO 临时区 |
| POST | `/{kb_id}/documents/preview` | 预览分块 |
| POST | `/{kb_id}/documents/process` | 提交解析/向量化任务 |
| POST | `/cleanup` | 清理临时上传（全局）：删非保护中的 `DocumentUpload`、孤立 `ProcessingTask`；**无**创建时间门槛；**保留**「`DocumentUpload.status=pending` 且关联任务仍为 pending/processing」的上传（见 `repository.list_uploads_eligible_for_cleanup`） |
| GET | `/{kb_id}/documents/tasks` | 按 `task_ids` 查询处理任务状态 |
| POST | `/{kb_id}/documents/{doc_id}/replace` | 同名重新上传，覆盖 MinIO 并增量更新向量；Query：`chunk_size`（默认 1000）、`chunk_overlap`（默认 200），须 `chunk_overlap < chunk_size` |
| GET | `/{kb_id}/documents/{doc_id}` | 文档详情 |
| DELETE | `/{kb_id}/documents/{doc_id}` | 删除单篇文档 |
| POST | `/{kb_id}/documents/batch-delete` | 批量删除文档 |
| POST | `/test-retrieval` | 控制台检索测试（body 含 `kb_id`、`query` 等） |

## 对话模块 `/api/chat`

| 方法 | 端点 | 功能 |
|------|------|------|
| POST | `/` | 创建对话 |
| GET | `/` | 对话列表（`skip`/`limit`） |
| POST | `/batch-delete` | 批量删除对话 |
| GET | `/{chat_id}` | 对话详情 |
| DELETE | `/{chat_id}` | 删除对话 |
| POST | `/{chat_id}/messages` | 发送消息，**SSE** 流式 RAG 回答 |

（消息历史由前端在创建对话/发消息后通过既有数据结构维护；当前无独立「仅拉取消息列表」的 GET 路由。）

## 评估模块 `/api/evaluation`

| 方法 | 端点 | 功能 |
|------|------|------|
| GET | `/types` | 可用评估类型/指标说明 |
| POST | `/` | 创建评估任务 |
| GET | `/` | 任务列表 |
| GET | `/resolve/{task_id}` | 解析任务 ID（如前端路由用） |
| GET | `/{task_id}` | 任务详情 |
| DELETE | `/{task_id}` | 删除任务 |
| POST | `/{task_id}/test-cases/import` | 批量导入测试用例 |
| POST | `/{task_id}/run` | 触发评估执行 |
| GET | `/{task_id}/results` | 评估结果列表 |

## LLM 配置模块 `/api/llm-configs`

| 方法 | 端点 | 功能 |
|------|------|------|
| GET | `/` | 列出全部配置及当前激活项 ID |
| POST | `/` | 新增配置 |
| PUT | `/{config_id}` | 更新配置 |
| POST | `/{config_id}/activate` | 激活指定配置 |
| DELETE | `/{config_id}` | 删除配置（204） |

（无单独的 `GET /{config_id}`：详情在列表响应中一并返回。）

## OpenAPI

交互式文档：**`/docs`**（Swagger UI）、**`/redoc`**；OpenAPI JSON：`/api/openapi.json`（与 `settings.API_V1_STR` 一致）。
