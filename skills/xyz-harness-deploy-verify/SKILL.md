---
name: xyz-harness-deploy-verify
description: >
  部署验证 skill。在 Stage 14 由执行 subagent 加载，执行部署命令并验证部署成功。
  通用化设计，不绑定特定 CI/CD 工具，从 CLAUDE.md 或项目配置读取部署方式。
---

## Dev-flow 上下文

| 项目 | 值 |
|------|---|
| 所在阶段 | Stage 14 推送+CI+部署（部署验证环节） |
| 触发方式 | 由 dev-flow 派遣执行 subagent 加载 |
| 上游 | 确认点4（用户确认部署目标）→ Stage 14 CI 验证通过 |
| 下游（完成后进入） | 部署成功 → Stage 15 自动复盘 |
| 回退目标 | 代码问题 → rollback_target=9（回退到 Stage 9 编码实现）；配置问题 → 就地修复后重试 |

# 部署验证

## 角色

你是部署验证专家。执行部署并验证服务可用。

## 入口条件

执行前检查，不满足则返回 fail：

1. Stage 14 CI 验证门禁通过
2. 用户已在确认点4 确认部署目标和方式
3. 部署命令/脚本存在（或 CLAUDE.md 中有部署章节）

## 部署验证 SOP

### 1. 读取部署配置

按优先级查找部署方式：

1. **CLAUDE.md"部署"章节** — 优先级最高，读取其中的部署命令、目标环境、健康检查端点
2. **项目部署脚本** — 检查 `deploy.sh` / `Makefile`（含 deploy target）/ `docker-compose*.yml` / `Dockerfile`
3. **都没有** → 返回 `{status: "done", summary: "项目无部署流程，跳过部署验证"}`，告知 dev-flow 主 agent skip

### 2. 确认部署目标

dev-flow 确认点4 已确认部署目标和方式。按确认的配置执行：

- 目标环境（staging / production / 其他）
- 部署方式（脚本 / CI 触发 / 容器部署 / 其他）
- 健康检查端点（从 CLAUDE.md 或用户确认中获取）

### 3. 执行部署命令

```
1. 运行部署脚本或命令
   - 完整记录命令输出（stdout + stderr）
   - 设置合理的超时（默认 10 分钟，CLAUDE.md 可覆盖）

2. 等待部署完成
   - 检查部署进程退出码
   - 退出码 != 0 → 部署失败，进入失败处理

3. 记录部署输出
   - 将完整输出写入 changes/evidence/deploy_result.md
```

### 4. 验证部署成功

验证顺序，每步失败即终止：

1. **健康检查**：访问健康检查端点，确认返回 HTTP 200
   - 重试策略：最多 3 次，每次间隔 10 秒
   - 3 次均失败 → 健康检查失败

2. **关键接口可达性**：调用 1-2 个核心接口确认服务正常
   - 接口选择：优先选择 CLAUDE.md 中指定的验证接口，其次选择 spec.md 中的核心接口
   - 返回非 2xx → 接口不可达

3. **日志检查**（可选）：确认无 ERROR 级别日志
   - 仅在 CLAUDE.md 中明确要求时执行
   - 有 ERROR 但不影响功能 → 记录警告，不阻断

### 5. 记录结果

无论成功或失败，均写入 `changes/evidence/deploy_result.md`：

```markdown
# 部署验证报告

- 部署时间：{日期}
- 目标环境：{环境名}
- 部署方式：{方式}
- 部署状态：{成功/失败}
- 健康检查：{通过/失败}
- 关键接口：{列出测试结果}

## 部署输出
{部署命令的完整输出}

## 验证详情
{健康检查和接口测试的详细结果}
```

## 失败处理

### 部署命令执行失败

分析失败原因：

| 原因类型 | 处理 | rollback_target |
|---------|------|-----------------|
| 代码问题（编译错误、运行时崩溃） | 回退到编码实现 | `3` |
| 配置问题（环境变量、连接字符串） | 就地修复后重试 | `null` |
| 基础设施问题（网络、权限） | 就地修复后重试 | `null` |
| 超时 | 重试一次，仍失败则报告 | `null` |

返回值：

```json
{
  "status": "fail",
  "deliverables": ["changes/evidence/deploy_result.md"],
  "summary": "部署失败：{一句话原因}",
  "reason": "详细失败原因和错误输出",
  "rollback_target": 3
}
```

### 健康检查失败

部署命令执行成功但健康检查不通过：

```json
{
  "status": "fail",
  "deliverables": ["changes/evidence/deploy_result.md"],
  "summary": "部署完成但健康检查失败：{一句话原因}",
  "reason": "健康检查端点 {url} 返回 {status_code}",
  "rollback_target": null
}
```

### 关键接口不可达

健康检查通过但核心接口异常：

```json
{
  "status": "fail",
  "deliverables": ["changes/evidence/deploy_result.md"],
  "summary": "部署完成但关键接口不可达：{一句话原因}",
  "reason": "接口 {url} 返回 {status_code}",
  "rollback_target": null
}
```

## 成功返回值

```json
{
  "status": "done",
  "deliverables": ["changes/evidence/deploy_result.md"],
  "summary": "部署到 {环境名} 成功，健康检查通过",
  "reason": "",
  "rollback_target": null
}
```

## 跳过返回值

项目无部署流程时：

```json
{
  "status": "done",
  "deliverables": [],
  "summary": "项目无部署流程，跳过部署验证",
  "reason": "",
  "rollback_target": null
}
```
