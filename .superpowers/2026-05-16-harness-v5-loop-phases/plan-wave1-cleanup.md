# Wave 1: 清理 V4 产物

## Task 1.1: 删除旧模块

**文件：**
- 删除：`extensions/coding-workflow/loop-engine.ts`
- 删除：`extensions/coding-workflow/gates/gate_phase3.ts`
- 删除：`extensions/coding-workflow/e2e-evidence-template.json`（如存在）
- 删除：`extensions/coding-workflow/loop-prompts/` (目录)

- [ ] **步骤 1：删除文件**

```bash
rm extensions/coding-workflow/loop-engine.ts
rm extensions/coding-workflow/gates/gate_phase3.ts
rm -f extensions/coding-workflow/e2e-evidence-template.json 2>/dev/null
rm -rf extensions/coding-workflow/loop-prompts/
```

- [ ] **步骤 2：验证删除**

```bash
ls extensions/coding-workflow/loop-engine.ts 2>&1 | grep "No such file"
ls extensions/coding-workflow/gates/gate_phase3.ts 2>&1 | grep "No such file"
```
预期：每个命令输出 "No such file or directory"

- [ ] **步骤 3：提交**

```bash
git add -u extensions/coding-workflow/
git commit -m "chore: remove V4 loop-engine and phase3 gate"
```

---

## Task 1.2: 删除旧测试

**文件：**
- 删除：`extensions/coding-workflow/__tests__/` 下所有 .test.ts 文件
- 删除：`extensions/coding-workflow/__tests__/fixtures/` 下所有 .json 文件

- [ ] **步骤 1：保留目录结构，清空内容**

```bash
find extensions/coding-workflow/__tests__ -name "*.test.ts" -delete
find extensions/coding-workflow/__tests__/fixtures -name "*.json" -delete 2>/dev/null
```

- [ ] **步骤 2：验证清空**

```bash
ls extensions/coding-workflow/__tests__/*.test.ts 2>&1 | grep "No such file"
```
预期：No such file

- [ ] **步骤 3：提交**

```bash
git add -u extensions/coding-workflow/__tests__/
git commit -m "chore: remove V4 test files"
```

---

## Task 1.3: 删除 E2E tester agent

**文件：**
- 删除：`agents/harness-e2e-tester/agent.md`

- [ ] **步骤 1：删除**

```bash
rm -rf agents/harness-e2e-tester/
```

- [ ] **步骤 2：提交**

```bash
git add -u agents/
git commit -m "chore: remove V4 E2E tester agent"
```
