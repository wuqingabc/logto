> **[文档 8/9]** 上一篇：[企业 Agent 接入](./org-agent.md) → 下一篇：[审计日志 API](./audit-log.md)
> 前置依赖：已完成 personal-agent.md 或 org-agent.md 接入

# Kill Switch API 参考

Kill Switch 是 WinAMZ 的核心安全能力，允许管理员在发现风险时立即终止 AI Agent 的授权。

---

## 撤销个人 Agent 的委托授权

```bash
# 单条撤销（按 Grant ID）
curl -X POST http://your-host:4001/api/winamz/grants/{grantId}/revoke \
  -H "Authorization: Bearer $ADMIN_M2M_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{ "reason": "员工离职申请" }'
```

**生效范围：**
1. `winamz_agent_grants.revoked_at` 写入当前时间
2. Logto 中该用户对该 Client 的所有 Grant 被删除（Refresh Token 立即失效）
3. 下次 Access Token 到期后无法续期
4. 现有 Access Token 在到期前仍有效（默认 1 小时）

**响应：**
```json
{
  "id": "grant-id",
  "revokedAt": "2026-03-11T09:30:00Z",
  "reason": "员工离职申请"
}
```

---

## 立即挂起 Agent 账号（硬停）

当需要立即使所有令牌失效（包括未到期的 Access Token）时：

```bash
# 挂起 Agent（适用于 personal 和 org 两种类型）
curl -X POST http://your-host:4001/api/winamz/agents/{agentId}/suspend \
  -H "Authorization: Bearer $ADMIN_M2M_TOKEN"
```

**生效范围：**
- **个人 Agent**：Logto 用户账号设为 `isSuspended=true`，所有令牌立即失效
- **企业 Agent**：吊销 Logto M2M 应用 Secret，无法获取新令牌（现有令牌到期前仍有效）

> 如需对企业 Agent 也实现即时失效，需同时删除 Logto 中对应 M2M 应用的所有 Secret。

**响应：**
```json
{
  "id": "agent-id",
  "status": "suspended",
  "updatedAt": "2026-03-11T09:30:00Z"
}
```

---

## 恢复 Agent

```bash
curl -X POST http://your-host:4001/api/winamz/agents/{agentId}/restore \
  -H "Authorization: Bearer $ADMIN_M2M_TOKEN"
```

恢复后 Agent 状态变为 `approved`，但：
- 个人 Agent：员工需重新完成 OAuth 授权流程
- 企业 Agent：需要在 Logto 中重新生成 client_secret

---

## 批量操作

### 按用户批量撤销（员工离职场景）

```bash
# 撤销某员工名下所有 Agent 的委托授权
curl -X POST http://your-host:4001/api/winamz/grants/revoke-by-user \
  -H "Authorization: Bearer $ADMIN_M2M_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "zhangsan-user-id",
    "reason": "员工离职，人力资源部执行"
  }'
```

**响应：**
```json
{
  "revokedCount": 3,
  "grants": ["grant-id-1", "grant-id-2", "grant-id-3"]
}
```

### 按组织紧急撤销（安全事件应急）

```bash
# 撤销某组织下所有 Agent 的委托授权
curl -X POST http://your-host:4001/api/winamz/agents/emergency-revoke \
  -H "Authorization: Bearer $ADMIN_M2M_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "orgId": "company-org-id",
    "reason": "发现数据泄露事件，紧急处置"
  }'
```

---

## 完整硬停流程（个人 Agent，即时生效）

如需对个人 Agent 实现即时停止（Refresh Token + Access Token 全部失效）：

```bash
# ① 撤销委托（使 Refresh Token 失效）
curl -X POST http://your-host:4001/api/winamz/grants/{grantId}/revoke \
  -H "Authorization: Bearer $ADMIN_M2M_TOKEN" \
  -d '{ "reason": "安全事件" }'

# ② 挂起 Agent（使现有 Access Token 立即失效）
curl -X POST http://your-host:4001/api/winamz/agents/{agentId}/suspend \
  -H "Authorization: Bearer $ADMIN_M2M_TOKEN"
```

---

## 如何获取 ADMIN_M2M_TOKEN

管理 API 需要 Logto Management API 权限的 M2M Token：

```bash
# 1. 在 Logto Console 创建 M2M 应用，授予 Management API 权限
# 2. 获取 client_id 和 client_secret
# 3. 用 Client Credentials 获取 token

curl -X POST http://your-host:4001/oidc/token \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=client_credentials" \
  -d "client_id=$M2M_CLIENT_ID" \
  -d "client_secret=$M2M_CLIENT_SECRET" \
  -d "resource=https://your-host:4001/api" \
  -d "scope=all"
```

> 参考：[Logto Management API 认证文档](https://docs.logto.io/docs/recipes/interact-with-management-api/)

---

## 安全建议

| 建议 | 原因 |
|------|------|
| Access Token TTL ≤ 1 小时 | 缩短 Kill Switch 后的残留风险窗口 |
| 高敏感场景 TTL ≤ 15 分钟 | 例如财务操作、数据导出等 |
| 所有 Kill Switch 操作必须记录审计 | WinAMZ 自动写入 `winamz_audit_logs` |
| 敏感操作二次确认 | Admin Console 已内置确认弹窗 |
| M2M Admin Token 定期轮转 | 避免凭证长期有效带来的风险 |

> 参考：[Logto 令牌生命周期配置](https://docs.logto.io/docs/references/openid-connect/)
