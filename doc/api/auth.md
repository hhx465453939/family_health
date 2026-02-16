# 认证与用户 API 文档

## 端点概览

| 方法 | 路径 | 功能 | 认证 |
|---|---|---|---|
| POST | `/api/v1/auth/bootstrap-owner` | 首次初始化 Owner 账户 | 否（仅首次可用） |
| POST | `/api/v1/auth/register` | 新用户注册（member） | 否 |
| POST | `/api/v1/auth/login` | 用户登录 | 否 |
| POST | `/api/v1/auth/refresh` | 刷新 access token | 否（携带 refresh token） |
| POST | `/api/v1/auth/logout` | 用户退出登录 | Bearer Token |
| POST | `/api/v1/auth/users` | 管理员创建用户 | Owner/Admin |
| PATCH | `/api/v1/auth/users/{id}/role` | 更新用户角色 | Owner/Admin |
| PATCH | `/api/v1/auth/users/{id}/status` | 更新用户状态 | Owner/Admin |

统一响应包络:

```json
{
  "code": 0,
  "data": {},
  "message": "ok",
  "trace_id": "uuid"
}
```

## 注册接口

- 路径: `POST /api/v1/auth/register`
- 描述: 创建 `member` 用户，成功后可直接登录。

请求体:

```json
{
  "username": "member01",
  "password": "member-pass-123",
  "display_name": "Member 01"
}
```

## 错误码

| 错误码 | 含义 |
|---|---|
| 2001 | 资源冲突（如 Owner 已初始化） |
| 2002 | 用户名已存在 |
| 2003 | 用户名或密码错误 |
| 2004 | refresh token 无效 |
| 4003 | 用户被禁用 |
| 4004 | 用户临时锁定 |
