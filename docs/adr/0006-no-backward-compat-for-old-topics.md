---
status: accepted
date: 2026-05-22
---

# ADR-0006: 不兼容历史 Topic 格式

## Context

Harness V5 的 gate-check.py 和 skill 文档需要多处格式升级（frontmatter 扁平化、gate 深度统一、test_execution schema 扩展）。这些升级与历史 topic 的文件格式不兼容。

## Decision

所有改动只对新 topic 生效。历史 `.xyz-harness/` 目录下的旧文件不迁移、不兼容、不处理。

## Reason

历史 topic 已全部完成（gate PASS + PR merged），没有重新跑 gate 的场景。兼容旧格式会增加 gate-check.py 的复杂度（每个检查点都需要 fallback 路径），而收益为零。
