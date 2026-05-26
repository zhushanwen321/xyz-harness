---
verdict: pass
---

# Non-functional Design

## 稳定性

本次改动全是 skill Markdown 文件和 Python 脚本的新建/修改，无运行时服务。稳定性风险集中在 gate-check.py 的改动——如果 Phase 2/3 检查逻辑引入 bug，会导致所有新 topic 的 gate 失败。缓解措施：Task 10 包含对旧 topic 的回归测试（Phase 1 gate 不受影响），以及 Phase 2 gate 的预期 FAIL 测试。

## 数据一致性

Retrospect 文件的 YAML frontmatter 是唯一的数据存储。collect.py 的 `--absorb` 操作直接修改文件，无并发控制。如果同一文件被两个进程同时 absorb，可能出现 YAML 格式损坏。缓解措施：collect.py 在写入前先读取验证 frontmatter 格式，写入后验证输出。

## 性能

collect.py 递归扫描 `.xyz-harness/` 目录，文件数量通常 < 100（每个 topic 1 个 retrospect，典型项目 < 20 个 topic）。无需索引或缓存，glob + 逐文件解析即可。gate-check.py 新增的 validate_plan_bl_review 和 validate_standards_linter 各增加 1 次 YAML 解析，对性能无影响。

## 业务安全

Skill 文件（SKILL.md）是 AI 行为指令。如果 reviewer skill 的方法论描述不准确，可能导致 AI 审查时产生误判（假阳性或假阴性）。缓解措施：每个 reviewer skill 有明确的产出格式定义（YAML: verdict, must_fix），gate-check.py 只验证格式不验证内容准确性。

## 数据安全

collect.py 读取 retrospect 文件中的 harness_issues，这些是改进建议文本，不包含敏感信息。`--absorb` 操作修改文件但只更新 YAML frontmatter，不删除正文内容（保留改进历史）。
