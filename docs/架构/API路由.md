# API 路由

## 路由总览

| 前缀 | 标签 | 模块 | 功能 |
|------|------|------|------|
| `/api/auth` | auth | app.modules.auth | 认证：注册/登录 |
| `/api/knowledge-base` | knowledge-base | app.modules.knowledge | 知识库 + 文档管理 |
| `/api/chat` | chat | app.modules.chat | 对话 CRUD + RAG |
| `/api/evaluation` | evaluation | app.modules.evaluation | RAG 评估任务 |
| `/api/llm-configs` | llm-configs | app.modules.llm_config | LLM/嵌入配置 |

## 认证模块 `/api/auth`

| 方法 | 端点 | 功能 |
|------|------|------|
| POST | `/register` | 用户注册 |
| POST | `/token` | OAuth2 密码模式登录 |
| GET | `/test-token` | 验证 Token |

## 知识库模块 `/api/knowledge-base`

### 知识库 CRUD

| 方法 | 端点 | 功能 |
|------|------|------|
| POST | `/` | 创建知识库 |
| GET | `/` | 列表 |
| GET | `/{kb_id}` | 详情 |
| DELETE | `/{kb_id}` | 删除 |

### 文档管理

| 方法 | 端点 | 功能 |
|------|------|------|
| POST | `/{kb_id}/documents` | 上传文档 |
| GET | `/{kb_id}/documents` | 文档列表 |
| GET | `/{kb_id}/documents/{doc_id}` | 文档详情 |
| DELETE | `/{kb_id}/documents/{doc_id}` | 删除文档 |
| POST | `/{kb_id}/documents/{doc_id}/process` | 触发处理 |
| GET | `/{kb_id}/retrieval` | 检索测试 |

## 对话模块 `/api/chat`

### 对话 CRUD

| 方法 | 端点 | 功能 |
|------|------|------|
| POST | `/` | 创建对话 |
| GET | `/` | 列表 |
| GET | `/{chat_id}` | 详情 |
| DELETE | `/{chat_id}` | 删除 |

### 消息与 RAG

| 方法 | 端点 | 功能 |
|------|------|------|
| POST | `/{chat_id}/messages` | 发送消息（流式 RAG） |
| GET | `/{chat_id}/messages` | 消息历史 |

## 评估模块 `/api/evaluation`

| 方法 | 端点 | 功能 |
|------|------|------|
| POST | `/` | 创建评估任务 |
| GET | `/` | 任务列表 |
| GET | `/{task_id}` | 任务详情 |
| DELETE | `/{task_id}` | 删除任务 |
| POST | `/{task_id}/run` | 触发评估 |

## LLM 配置模块 `/api/llm-configs`

| 方法 | 端点 | 功能 |
|------|------|------|
| POST | `/` | 创建配置 |
| GET | `/` | 列表 |
| GET | `/{config_id}` | 详情 |
| DELETE | `/{config_id}` | 删除 |
| POST | `/{config_id}/activate` | 激活配置 |
