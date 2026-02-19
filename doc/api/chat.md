# 聊天 API（阶段 2）

## 1) 会话管理
- `POST /api/v1/chat/sessions`
- `GET /api/v1/chat/sessions?page=1&page_size=20&query=&archived=`
- `PATCH /api/v1/chat/sessions/{id}`
- `DELETE /api/v1/chat/sessions/{id}`（软删除）
- `POST /api/v1/chat/sessions/{id}/copy`
- `POST /api/v1/chat/sessions/{id}/branch`
- `GET /api/v1/chat/sessions/{id}/export?fmt=md&include_reasoning=true|false`
- `POST /api/v1/chat/sessions/bulk-export`
- `POST /api/v1/chat/sessions/bulk-delete`

新增会话参数：
- `role_id`
- `background_prompt`
- `reasoning_enabled`（`null/true/false`）
- `reasoning_budget`（整数）
- `show_reasoning`（是否回传 reasoning 流）

## 2) 消息管理
- `POST /api/v1/chat/sessions/{id}/messages`
- `GET /api/v1/chat/sessions/{id}/messages`

消息字段补充：
- `reasoning_content`（assistant 思维链，按会话策略可为空）

## 3) 附件上传
- `POST /api/v1/chat/sessions/{id}/attachments`（multipart）
- 可选表单字段：
  - `kb_mode`: `context` | `chat_default` | `kb`
  - `kb_id`: 当 `kb_mode=kb` 时必填
- 后端执行：
  1. 原始文件写入 `data/raw_vault/`
  2. 转文本并线性脱敏
  3. 脱敏文本写入 `data/sanitized_workspace/`
  4. 仅 `parse_status=done` 可用于 Agent
  5. 若 `kb_mode` 指定入库，将同步写入知识库

## 4) 脱敏规则
- `POST /api/v1/desensitization/rules`（登录用户）
- `GET /api/v1/desensitization/rules`

规则示例：
```json
{
  "member_scope": "global",
  "rule_type": "literal",
  "pattern": "13800138000",
  "replacement_token": "[PHONE]",
  "enabled": true
}
```

## 5) 强制门禁
- 若检测到高风险 PII（手机号/邮箱/证件号）且未命中脱敏替换，上传返回 `422` + `code=5002`。
- 未脱敏附件禁止注入 Agent 上下文。

## 6) 数据隔离
- 会话、消息、附件、脱敏规则与映射库均按用户隔离。
