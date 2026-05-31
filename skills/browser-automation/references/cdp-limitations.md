# Playwright connectOverCDP 能力与限制

## 支持情况

| ✅ 正常支持 | ⚠️ 受限/不稳定 | ❌ 不支持 |
|------------|----------------|----------|
| goto / goBack / goForward | page.route()（挂起风险约 30%） | proxy 配置 |
| click / fill / type / press | setInputFiles（远程浏览器文件路径问题） | geolocation / permissions |
| check / uncheck / selectOption | browser.newContext()（无法创建隔离 context） | device emulation（viewport/UA） |
| screenshot / waitForSelector | 多标签对象失同步 | HAR 录制 |
| evaluate / locator 全套 API | page.pdf() | tracing / video 录制 |
| dragTo / hover / dblclick | 下载管理（路径被劫持） | context 级 storage 隔离 |

## 根因

CDP 是 Chrome 原生协议，覆盖面远窄于 Playwright 自有协议。连接已有浏览器无法创建隔离 context。

## 中频能力参考

### 文件上传

connectOverCDP 下可用 `locator.setInputFiles()`，但文件必须在 Playwright 运行端可访问。

```bash
# 需要在 evaluate 中实现，pw.js 未封装
# 或用 CDP: DOM.setFileInputFiles
```

### 拖拽

Playwright 支持 `locator.dragTo(target)`，pw.js 未封装。可通过 evaluate + mouse 事件模拟：

```bash
$PW $EP evaluate "(function(){var src=document.querySelector('.item'),tgt=document.querySelector('.drop-zone');var e=new DragEvent('drop',{dataTransfer:new DataTransfer()});tgt.dispatchEvent(e)})()"
```

### 网络拦截

`page.route()` 在 connectOverCDP 下不稳定（约 30% 概率挂起）。如需可靠网络监控，用 CDP 的 `Network.enable`。

### Force 模式

当元素被覆盖层遮挡时，click/fill/hover 可加 `{force: true}` 跳过 actionability 检查。pw.js 未封装此参数，需通过 evaluate 实现。

### 截图高级参数

screenshot 支持但 pw.js 未封装的有用参数：
- `clip: {x, y, width, height}` — 区域裁剪
- `animations: "disabled"` — 关闭动画（截图一致性）
- `type: "jpeg"` + `quality: 80` — 控制文件大小

需要这些参数时，直接修改 pw.js 的 cmdScreenshot 函数。
