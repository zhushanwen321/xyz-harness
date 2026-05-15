# 工作记忆

## 当前状态
<!-- 由 todolist 自动更新 -->

## 任务完成记录
| 类型 | 摘要 | 时间 |
|------|------|------|

## 关键决策记录
<!-- 由主 agent 通过 update_memory 追加 -->

## 陷阱提醒
<!-- 由主 agent 通过 update_memory 追加 -->

## 手动笔记
<!-- 由主 agent 通过 update_memory 追加 -->
| ✓ Task #1 | 开始系统性修复 gate-script.sh。先重写 die() 和所有 gate 函数。 | 2026-05-15 14:46:47 |
| ✓ Task #2 | gate_10 已自动检测分支名，对齐 gate_14。整个 gate-script.sh 已重写。 | 2026-05-15 14:49:41 |
| ✓ Task #3 | gate_11 git diff 范围自适应提交数（commit_count < 5 时用 HEAD~N 代替 HEAD~5） | 2026-05-15 14:49:41 |
| ✓ Task #4 | 所有 die() 调用均添加中文修复指引，告诉 AI 具体该做什么（派遣哪个 subagent、产物路径、修什么） | 2026-05-15 14:49:41 |
| ✓ Task #5 | gate_09 新增 check_claude_md_gates() 函数，CLAUDE.md 缺质量门禁章节时给出具体添加示例，不再是静默通过 | 2026-05-15 14:49:41 |
| ✓ Task #6 | 修复 index.ts 重试 gate 的逻辑：gate 失败后不再阻塞 retry，而是清除 fail 状态让 gate 重新运行 | 2026-05-15 14:50:12 |
| ✓ Task #7 | 将 skill 目录下所有脚本（harness-state.sh、spec-completeness.sh、spec-ref-scan.sh、tdd-skip-patterns-template.txt、hooks/）全部改为 symlink 指向 coding-workflow/scripts/，实现单一源文件 | 2026-05-15 14:53:29 |
