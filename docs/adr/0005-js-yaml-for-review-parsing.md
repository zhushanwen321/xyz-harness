# TS 侧引入 js-yaml 解析 review 文件，不调用 Python 也不自写解析

gate tool 在 dispatch review subagent 后需要解析 review 文件的 YAML frontmatter（verdict + must_fix）。原实现用正则逐行匹配，无法处理嵌套字段（`review.verdict`、`statistics.must_fix`），静默返回 `fail`。

三个方案：(1) 引入 js-yaml npm 包，用 `safeLoad` 解析——与 Python 侧的 `yaml.safe_load` 语义一致；(2) 每次调 Python 脚本解析——跨语言 IPC 开销，且 gate-check.py 不应该在 gate tool 执行中途被二次调用；(3) 自写 30 行 parser——YAML 规范有陷阱，即使是受限子集也值得用成熟库。

选 (1)。创建 `extensions/coding-workflow/package.json` 声明依赖。js-yaml 是零依赖、久经考验的库，且 TS 和 Python 两侧用同源的 YAML 解析器（都是 libyaml 语义），消除了"同一文件两种解析结果"的风险。
