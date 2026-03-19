# 后端 Model 与 Schema 设计总结

本文档总结 RAG Engine 后端的数据模型（SQLAlchemy ORM）和 API 模式（Pydantic Schema）设计。

---

## 一、概述

| 类型 | 目录 | 说明 |
|------|------|------|
| **Model** | `backend/app/models/` | 数据库表结构，基于 SQLAlchemy ORM |
| **Schema** | `backend/app/schemas/` | API 请求/响应数据校验，基于 Pydantic |

---

## 二、Model 设计

### 2.1 基类与混入

| 文件 | 说明 |
|------|------|
| `base.py` | `Base`（声明式基类）、`TimestampMixin`（created_at, updated_at） |

所有业务模型继承 `Base` 和 `TimestampMixin`，自动获得 `created_at`、`updated_at` 字段。

---

### 2.2 用户模块 (`user.py`)

**表名：** `users`

| 字段 | 类型 | 说明 |
|------|------|------|
| id | Integer | 主键 |
| email | String(255) | 邮箱，唯一，用于注册 |
| username | String(255) | 用户名，唯一，用于登录和 JWT |
| hashed_password | String(255) | bcrypt 哈希，不存明文 |
| is_active | Boolean | 是否激活，默认 True |
| is_superuser | Boolean | 是否超级管理员，默认 False |

**关系：**
- `knowledge_bases` → 用户创建的知识库
- `chats` → 用户的对话
- `api_keys` → 用户的 API 密钥（级联删除）

---

### 2.3 API 密钥模块 (`api_key.py`)

**表名：** `api_keys`

| 字段 | 类型 | 说明 |
|------|------|------|
| id | Integer | 主键 |
| key | VARCHAR(128) | 密钥值，格式 `sk-` + 64 位十六进制，唯一 |
| name | String(255) | 用户自定义名称 |
| user_id | Integer | 外键 → users.id |
| is_active | Boolean | 是否启用，默认 True |
| last_used_at | DateTime | 最后使用时间，用于审计 |

**关系：**
- `user` → 所属用户

---

### 2.4 知识库模块 (`knowledge.py`)

#### 2.4.1 知识库 (KnowledgeBase)

**表名：** `knowledge_bases`

| 字段 | 类型 | 说明 |
|------|------|------|
| id | Integer | 主键 |
| name | String(255) | 知识库名称 |
| description | LONGTEXT | 描述 |
| user_id | Integer | 外键 → users.id |

**关系：**
- `documents` → 文档列表（级联删除）
- `chunks` → 文档分块（级联删除）
- `document_uploads` → 上传记录（级联删除）
- `processing_tasks` → 处理任务

---

#### 2.4.2 文档 (Document)

**表名：** `documents`

| 字段 | 类型 | 说明 |
|------|------|------|
| id | Integer | 主键 |
| file_path | String(255) | MinIO 对象路径，如 `kb_1/document.pdf` |
| file_name | String(255) | 原始文件名 |
| file_size | BigInteger | 文件大小（字节） |
| content_type | String(100) | MIME 类型 |
| file_hash | String(64) | SHA-256 哈希，用于去重 |
| knowledge_base_id | Integer | 外键 → knowledge_bases.id |

**约束：** `(knowledge_base_id, file_name)` 唯一，同一知识库内不允许重复文件名。

---

#### 2.4.3 文档上传记录 (DocumentUpload)

**表名：** `document_uploads`

| 字段 | 类型 | 说明 |
|------|------|------|
| id | Integer | 主键 |
| knowledge_base_id | Integer | 外键（CASCADE 删除） |
| file_name | String | 文件名 |
| file_hash | String | 文件哈希 |
| file_size | BigInteger | 文件大小 |
| content_type | String | MIME 类型 |
| temp_path | String | MinIO 临时路径 |
| status | String | pending / completed |
| error_message | Text | 处理失败时的错误信息 |

用于记录上传后、处理完成前的临时文件。

---

#### 2.4.4 处理任务 (ProcessingTask)

**表名：** `processing_tasks`

| 字段 | 类型 | 说明 |
|------|------|------|
| id | Integer | 主键 |
| knowledge_base_id | Integer | 外键 |
| document_id | Integer | 外键（已存在文档，可选） |
| document_upload_id | Integer | 外键（新上传文档，可选） |
| status | String(50) | pending / processing / completed / failed |
| error_message | Text | 失败时的错误信息 |

状态流转：`pending` → `processing` → `completed` / `failed`。

---

#### 2.4.5 文档分块 (DocumentChunk)

**表名：** `document_chunks`

| 字段 | 类型 | 说明 |
|------|------|------|
| id | String(64) | 主键，content 哈希，便于增量更新 |
| kb_id | Integer | 外键 → knowledge_bases.id |
| document_id | Integer | 外键 → documents.id |
| file_name | String(255) | 文件名 |
| chunk_metadata | JSON | 块元数据（如 page_content） |
| hash | String(64) | 哈希，索引 |

**索引：** `(kb_id, file_name)`

---

### 2.5 对话模块 (`chat.py`)

#### 2.5.1 中间表 (chat_knowledge_bases)

**表名：** `chat_knowledge_bases`

| 字段 | 类型 | 说明 |
|------|------|------|
| chat_id | Integer | 外键 → chats.id（联合主键） |
| knowledge_base_id | Integer | 外键 → knowledge_bases.id（联合主键） |

实现 Chat 与 KnowledgeBase 的多对多关系。

---

#### 2.5.2 对话 (Chat)

**表名：** `chats`

| 字段 | 类型 | 说明 |
|------|------|------|
| id | Integer | 主键 |
| title | String(255) | 对话标题 |
| user_id | Integer | 外键 → users.id |

**关系：**
- `messages` → 消息列表（级联删除）
- `knowledge_bases` → 关联知识库（多对多）

---

#### 2.5.3 消息 (Message)

**表名：** `messages`

| 字段 | 类型 | 说明 |
|------|------|------|
| id | Integer | 主键 |
| content | LONGTEXT | 消息内容 |
| role | String(50) | `user` / `assistant` |
| chat_id | Integer | 外键 → chats.id |

`content` 说明：AI 回答格式为 `Base64(引用上下文) + "__LLM_RESPONSE__" + LLM 生成内容`。

---

## 三、Schema 设计

### 3.1 用户 Schema (`user.py`)

| Schema | 用途 |
|--------|------|
| UserBase | 基础字段（email, username, is_active, is_superuser） |
| UserCreate | 注册请求：UserBase + password |
| UserUpdate | 更新请求：UserBase + password(可选) |
| UserResponse | 响应：UserBase + id, created_at, updated_at（不含密码） |

---

### 3.2 Token Schema (`token.py`)

| Schema | 用途 |
|--------|------|
| Token | 登录响应：access_token, token_type |
| TokenPayload | JWT payload：sub（通常为用户标识） |

---

### 3.3 API 密钥 Schema (`api_key.py`)

| Schema | 用途 |
|--------|------|
| APIKeyBase | 基础字段：name, is_active |
| APIKeyCreate | 创建请求（key 由服务端生成） |
| APIKeyUpdate | 更新请求：name, is_active（均可选） |
| APIKey | 响应：包含完整 key，创建时显示一次 |
| APIKeyInDB | 内部使用的完整模型 |

---

### 3.4 知识库 Schema (`knowledge.py`)

| Schema | 用途 |
|--------|------|
| KnowledgeBaseBase | 基础字段：name, description |
| KnowledgeBaseCreate | 创建知识库 |
| KnowledgeBaseUpdate | 更新知识库 |
| KnowledgeBaseResponse | 响应：含 documents 列表 |
| DocumentBase | 文档基础：file_name, file_path, file_hash, file_size, content_type |
| DocumentCreate | 创建文档：DocumentBase + knowledge_base_id |
| DocumentResponse | 文档响应：含 processing_tasks |
| DocumentUploadBase | 上传记录基础字段 |
| DocumentUploadCreate | 创建上传记录 |
| DocumentUploadResponse | 上传记录响应 |
| ProcessingTaskBase | 任务基础：status, error_message |
| ProcessingTaskCreate | 创建任务：document_id, knowledge_base_id |
| ProcessingTask | 任务响应 |
| PreviewRequest | 分块预览：document_ids, chunk_size, chunk_overlap |

---

### 3.5 对话 Schema (`chat.py`)

| Schema | 用途 |
|--------|------|
| MessageBase | 消息基础：content, role |
| MessageCreate | 创建消息：MessageBase + chat_id |
| MessageResponse | 消息响应：含 id, chat_id, created_at, updated_at |
| ChatBase | 对话基础：title |
| ChatCreate | 创建对话：ChatBase + knowledge_base_ids |
| ChatUpdate | 更新对话：title, knowledge_base_ids（均可选） |
| ChatResponse | 对话响应：含 messages, knowledge_base_ids |

---

## 四、实体关系概览

```
User
 ├── KnowledgeBase (1:N)
 │    ├── Document (1:N)
 │    │    └── DocumentChunk (1:N)
 │    ├── DocumentUpload (1:N)
 │    └── ProcessingTask (1:N)
 ├── Chat (1:N)
 │    └── Message (1:N)
 └── APIKey (1:N)

Chat ←→ KnowledgeBase (N:M, 通过 chat_knowledge_bases)
```

---

## 五、RAG 文档处理流程

1. 用户上传文件 → 创建 **DocumentUpload**，文件存入 MinIO 临时目录
2. 后台处理开始 → 创建 **ProcessingTask**，status=pending
3. 解析、分块、向量化 → 创建 **Document**、**DocumentChunk**
4. 处理完成 → 更新 **ProcessingTask** status=completed，**DocumentUpload** status=completed

---

## 六、Schema 导出

当前 `schemas/__init__.py` 导出：

- `api_key`: APIKey, APIKeyCreate, APIKeyUpdate, APIKeyInDB
- `user`: UserBase, UserCreate, UserUpdate, UserResponse
- `token`: Token, TokenPayload
- `knowledge`: KnowledgeBaseBase, KnowledgeBaseCreate, KnowledgeBaseUpdate, KnowledgeBaseResponse

Chat 相关 Schema 未在 `__init__.py` 中导出，使用时需单独导入 `from app.schemas.chat import ...`。
