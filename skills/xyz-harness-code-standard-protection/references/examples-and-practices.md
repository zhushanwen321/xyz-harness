# 反例代码与最佳实践

本文件包含核心规则的 before/after 对比示例，以及按主题聚合的最佳实践。

## 目录

1. [Before/After 反例代码](#beforeafter-反例代码)
   - [通用规则（TypeScript）](#通用规则typescript)
   - [Vue 规则](#vue-规则)
   - [Python 规则](#python-规则)
2. [最佳实践](#最佳实践)
   - [增量检查](#增量检查)
   - [白名单管理](#白名单管理)
   - [AI Agent 防护](#ai-agent-防护)
   - [错误消息设计](#错误消息设计)

---

## Before/After 反例代码

核心规则的错误写法与正确写法对比。每对控制在 5-8 行。

### 通用规则（TypeScript）

**no-silent-catch** — catch 块必须有实质处理：

```typescript
// ❌ 错误：静默吞掉错误，调试时完全无信息
try {
  await fetchUserData(userId);
} catch (e) {
  // 忽略
}

// ✅ 正确：至少记录错误，最好有恢复逻辑
try {
  await fetchUserData(userId);
} catch (e) {
  logger.error('Failed to fetch user data', { userId, error: e });
  userData.value = getDefaultUser();
}
```

**prefer-allsettled** — 独立数据源必须用 Promise.allSettled：

```typescript
// ❌ 错误：一个失败全部失败，其他请求结果丢失
const [users, orders, stats] = await Promise.all([
  fetchUsers(), fetchOrders(), fetchStats(),
]);

// ✅ 正确：每个请求独立完成，失败不影响其他
const [usersResult, ordersResult, statsResult] = await Promise.allSettled([
  fetchUsers(), fetchOrders(), fetchStats(),
]);
```

**no-unsafe-object-entries** — Object.entries 必须过滤或断言类型：

```typescript
// ❌ 错误：value 类型丢失，变成 unknown
for (const [key, value] of Object.entries(config)) {
  applyConfig(key, value); // value 是 unknown，不安全
}

// ✅ 正确：白名单过滤 + 类型断言
const VALID_KEYS = ['theme', 'lang', 'fontSize'] as const;
for (const [key, value] of Object.entries(config)) {
  if ((VALID_KEYS as readonly string[]).includes(key)) {
    applyConfig(key as keyof typeof config, value);
  }
}
```

### Vue 规则

**no-native-html-elements** — 禁止原生表单/交互元素：

```vue
<!-- ❌ 错误：原生 button，无设计系统一致性 -->
<button class="submit-btn" @click="submit">提交</button>

<!-- ✅ 正确：使用 UI 组件库 -->
<Button variant="primary" @click="submit">提交</Button>
```

**no-hardcoded-colors** — 禁止硬编码颜色值：

```vue
<!-- ❌ 错误：硬编码颜色，主题切换失效 -->
<span style="color: #e74c3c">错误</span>
<span class="text-[#3498db]">信息</span>

<!-- ✅ 正确：使用 CSS 变量或 Tailwind 语义类 -->
<span class="text-destructive">错误</span>
<span class="text-primary">信息</span>
```

**no-emoji-in-template** — 禁止 emoji，用图标库：

```vue
<!-- ❌ 错误：emoji 跨平台显示不一致 -->
<span>✅ 成功</span>
<span>❌ 失败</span>

<!-- ✅ 正确：使用 lucide 图标 -->
<span><CheckCircle class="text-success" /> 成功</span>
<span><XCircle class="text-destructive" /> 失败</span>
```

### Python 规则

**空 except → 用 logger**：

```python
# ❌ 错误：裸 except 吞掉所有异常，含 KeyboardInterrupt
try:
    result = process_data(data)
except:
    pass

# ✅ 正确：捕获特定异常 + 记录日志
try:
    result = process_data(data)
except ValueError as e:
    logger.warning("Invalid data, using fallback", extra={"error": str(e)})
    result = get_fallback_data()
```

**裸 datetime.now() → 带时区**：

```python
# ❌ 错误：naive datetime，服务器时区依赖
created_at = datetime.now()

# ✅ 正确：显式 UTC，无歧义
from datetime import timezone
created_at = datetime.now(timezone.utc)
```

**裸 Decimal() → 用 to_decimal()**：

```python
# ❌ 错误：Decimal() 接受 float 时精度已丢失
price = Decimal(0.1)  # 实际是 0.1000000000000000055511151...

# ✅ 正确：从字符串构造，或用项目工具函数
price = Decimal("0.1")
# 或用项目封装的工具
price = to_decimal(0.1)  # 内部做 str 转换
```

---

## 最佳实践

按主题聚合的防护层最佳实践。每个主题 3-5 条要点。

### 增量检查

只检查变更的文件，不跑全量扫描——这是 pre-commit 和 AI hooks 的核心设计原则。

1. **只检查 staged 文件**：用 `git diff --cached --name-only --diff-filter=ACM` 获取变更列表，过滤后传入 linter。不要跑 `ruff check .` 或 `eslint .`
2. **条件触发**：按文件扩展名决定跑哪些检查。`.py` 变更只触发 Python 检查，`.ts/.vue` 变更只触发前端检查。无相关变更则跳过整个检查
3. **先 fix 再 check**：先跑 `ruff check --fix` / `eslint --fix` 自动修复，再跑纯检查。自动修复能解决的不要留给人工
4. **自动 git add 修复后的文件**：fix 后的文件内容已变，必须 `git add` 重新暂存，否则 commit 的是修复前的版本

### 白名单管理

白名单是渐进迁移的工具，不是永久豁免。

1. **每条白名单必须带 TODO 和清理时间**：如 `'src/legacy/module.ts'  // TODO: 2026-Q3 重构后移除`。没有时间标注的白名单在 review 时拒绝合并
2. **白名单条目不超过总数的 10%**：超过说明规则设计有问题，要么规则太严需要调整，要么项目需要专门的重构迭代
3. **定期审计**：CI 中可以用脚本统计白名单数量，超过阈值发出 warning。如 `grep -c 'TODO.*移除' whitelist.txt` 对比文件总数
4. **渐进迁移：先 warn 后 error**：新规则上线先设为 warning，跑一周看误报率，再升级为 error 阻塞提交

### AI Agent 防护

AI 编码助手（Claude Code、Pi）需要额外约束，防止绕过检查。

1. **AI 不能跳过检查**：`git-skip` 规则拦截 `--no-verify`、`SKIP_*` 环境变量、`--force` 等绕过标志。AI 的 commit 必须经过完整检查链
2. **AI 不能用 watch 模式**：`block-bash` 拦截 `--watch`、`nodemon`、`webpack serve` 等长运行命令。AI 会话中不存在持续监听的场景，watch 只会占用进程
3. **AI 不能管道截断长运行命令**：拦截 `timeout`、`head -n`、`kill %1` 等模式。AI 应该等命令自然完成，不是强制截断
4. **PostToolUse 后立即检查 AI 写入的代码**：AI 调用 Write/Edit 后，`afterToolCall` 立即对写入文件跑检查。不等 pre-commit，问题越早发现修复成本越低

### 错误消息设计

好的错误消息让开发者不需要搜索就知道怎么修。

1. **报错必须包含三要素**：规则名 + 错误位置（文件:行:列）+ 修复建议。缺少任何一个都会增加开发者修复时间
2. **给出正确写法的示例**：不仅说"错误"，应该说"错误，应该用 `<Button>` 替代 `<button>`"。最好直接给代码片段
3. **区分 error 和 warning**：error 阻塞提交（退出码 2），warning 只报告不拦截（退出码 0 + stderr 输出）。让团队知道哪些是红线、哪些是建议
4. **错误消息模板**：`[规则名] <file>:<line> — <问题描述>。建议: <修复方式>`。如 `[no-silent-catch] src/api.ts:42 — 空 catch 块。建议: 添加 logger.error() 或 re-throw`
