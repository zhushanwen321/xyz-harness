---
name: xyz-harness-frontend-dev
description: "前端编码规范和工作流。三阶段编码法（骨架→功能→美化）+ 设计系统预检 + 视觉闭环验证。当 task 涉及 UI 组件、页面、布局、样式时加载。"
---

# 前端编码规范

## 三阶段工作流

每项前端开发工作必须按顺序经历三个阶段，不可跳步：

### 阶段 1: 骨架

创建组件结构，所有 UI 元素在正确位置，功能未实现。

- 使用项目组件库的 UI 组件（Button、Input、Table 等），禁止原生 HTML 表单元素
- 布局容器用 Flexbox/Grid + 语义化 CSS 类名
- 所有文本、占位元素、交互控件放在正确位置
- 不实现事件处理（空函数占位）
- 确保编译通过

### 阶段 2: 功能

实现所有交互逻辑、状态管理、API 集成，样式保持基础状态。

- 实现事件处理器、状态管理（ref/composable/store 按项目规范）
- 实现 API 调用，遵循项目的 API client 模式
- 错误处理使用项目的 toast/notification 组件
- 并行请求使用 Promise.allSettled（非 Promise.all）
- 运行已有测试：必须全部 PASS

### 阶段 3: 美化

实现视觉效果对齐，完成视觉验证。

- 使用语义化 CSS token（无硬编码颜色、无 magic spacing）
- 亮/暗模式可用
- 如果项目有 design system 规范，严格对齐

## 设计系统预检

编码前必须检查项目是否存在前端编码规范（docs/standards.md 前端章节 或 docs/design-system.md，回退 CLAUDE.md）。如果规范不完整 → blocked，报告缺失项。

至少覆盖维度：
- 组件库约束：用哪个组件库、禁止哪些原生元素
- 样式系统：CSS 方案、token 使用规则
- 代码结构：行数上限、文件组织
- 错误处理：toast 调用方式

## 出现问题时的处理

- blocked：缺少设计系统基础设施、spec 不清晰
- needs_context：缺少必要的上下文（设计稿路径、已有组件代码）
