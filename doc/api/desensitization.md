# 脱敏 API（当前已实现部分）

## 规则管理
- `POST /api/v1/desensitization/rules`
- `GET /api/v1/desensitization/rules`
- `PATCH /api/v1/desensitization/rules/{rule_id}`
- `DELETE /api/v1/desensitization/rules/{rule_id}`
- `GET /api/v1/desensitization/presets`
备注: 规则支持 `tag` 字段用于分组/标签化。

## 线性脱敏流程（已落地）
1. 从规则库加载 `global + member_scope` 规则。
2. 按规则顺序执行替换（literal/regex）。
3. 原始命中写入本地加密映射库 `pii_mapping_vault`。
4. 仅脱敏文本进入 `data/sanitized_workspace`。

## 安全门禁（已落地）
- 检测到高风险 PII 且无规则替换时，阻断附件入库（`422`, `code=5002`）。
- Agent 只能读取脱敏域附件文本。
