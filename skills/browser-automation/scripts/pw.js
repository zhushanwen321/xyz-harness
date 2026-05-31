#!/usr/bin/env node
// pw.js — Playwright 自动化脚本（无状态：连接 → 执行 → 断开）
// 连接到已运行的 Chrome/Electron（--remote-debugging-port=9222）
//
// Usage: node pw.js <cdp-endpoint> <command> [args...]

const { chromium } = require("playwright");

const [, , endpoint, command, ...args] = process.argv;

// ─── 连接浏览器，返回第一个非空白页 ────────────────────────
async function connect(endpoint) {
  const browser = await chromium.connectOverCDP(endpoint);
  const contexts = browser.contexts();
  if (!contexts.length) throw new Error("No browser context found");
  const pages = contexts[0].pages();
  if (!pages.length) throw new Error("No page found");
  // 优先选非 chrome:// 和非 devtools:// 页面
  const page =
    pages.find(
      (p) =>
        !p.url().startsWith("chrome://") &&
        !p.url().startsWith("devtools://")
    ) || pages[0];
  return { browser, page };
}

// ─── 选择器解析：支持 CSS / text= / role= / testid= ───────
function locate(page, selector) {
  if (selector.startsWith("text=")) {
    return page.getByText(selector.slice(5), { exact: false });
  }
  if (selector.startsWith("role=")) {
    const m = selector.match(/^role=(\w+)(?:\[name="(.+?)"\])?$/);
    if (m) {
      const opts = m[2] ? { name: m[2] } : {};
      return page.getByRole(m[1], opts);
    }
  }
  if (selector.startsWith("testid=")) {
    return page.getByTestId(selector.slice(7));
  }
  if (selector.startsWith("label=")) {
    return page.getByLabel(selector.slice(6));
  }
  if (selector.startsWith("placeholder=")) {
    return page.getByPlaceholder(selector.slice(13));
  }
  if (selector.startsWith("title=")) {
    return page.getByTitle(selector.slice(6));
  }
  if (selector.startsWith("alt=")) {
    return page.getByAltText(selector.slice(4));
  }
  return page.locator(selector);
}

// ─── 命令实现 ──────────────────────────────────────────────

async function cmdListPages(browser) {
  const contexts = browser.contexts();
  const result = [];
  for (let ci = 0; ci < contexts.length; ci++) {
    const pages = contexts[ci].pages();
    for (let pi = 0; pi < pages.length; pi++) {
      result.push({
        contextIndex: ci,
        pageIndex: pi,
        url: pages[pi].url(),
        title: await pages[pi].title().catch(() => ""),
      });
    }
  }
  return result;
}

async function cmdScreenshot(page) {
  const cliArgs = parseFlags(args);
  const selector = cliArgs["-s"] || cliArgs["--selector"];
  const output = cliArgs["-o"] || cliArgs["--output"] || "screenshot.png";
  const fullPage = cliArgs["--full-page"] !== undefined;

  let buffer;
  if (selector) {
    const loc = locate(page, selector);
    buffer = await loc.screenshot({ timeout: 10000 });
  } else {
    buffer = await page.screenshot({ fullPage, timeout: 15000 });
  }
  require("fs").writeFileSync(output, buffer);
  return { saved: output, size: buffer.length };
}

async function cmdSnapshot(page) {
  const mode = args[0] || "interactive"; // interactive | full
  return await page.evaluate((mode) => {
    function walk(el, depth) {
      if (depth > 8) return null;
      const tag = (el.tagName || "").toLowerCase();
      if (
        !tag ||
        [
          "script", "style", "noscript", "svg", "path", "br", "hr",
          "wbr", "head", "meta", "link", "iframe",
        ].includes(tag)
      )
        return null;

      // 跳过不可见元素
      const rect = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      if (
        style.display === "none" ||
        style.visibility === "hidden" ||
        (rect.width === 0 && rect.height === 0)
      )
        return null;

      const node = { tag };
      if (el.id) node.id = el.id;
      if (el.className && typeof el.className === "string") {
        const cls = el.className
          .split(" ")
          .filter(Boolean)
          .filter((c) => !c.startsWith("agentation") && !c.startsWith("open-web-inspector"))
          .slice(0, 5);
        if (cls.length) node.cls = cls.join(".");
      }
      if (el.getAttribute("role")) node.role = el.getAttribute("role");
      if (el.getAttribute("type")) node.type = el.getAttribute("type");
      if (el.getAttribute("href"))
        node.href = el.getAttribute("href").slice(0, 120);
      if (el.getAttribute("placeholder"))
        node.placeholder = el.getAttribute("placeholder").slice(0, 80);
      if (el.getAttribute("aria-label"))
        node.ariaLabel = el.getAttribute("aria-label");

      // 判断是否为有趣元素
      const interactive =
        [
          "a", "button", "input", "select", "textarea", "summary",
          "details", "option", "dialog",
        ].includes(tag) ||
        el.getAttribute("role")?.match(
          /button|link|tab|menuitem|switch|checkbox|radio|slider|textbox|searchbox|combobox|option|treeitem/
        ) ||
        el.isContentEditable;
      const isHeading = /^h[1-6]$/.test(tag);
      const hasDirectText =
        !el.children.length &&
        el.childNodes.length === 1 &&
        el.childNodes[0].nodeType === 3 &&
        el.textContent.trim().length > 0;
      const isImgOrMedia = ["img", "video", "audio", "canvas"].includes(tag);

      // interactive 模式：只保留有意义的元素
      if (mode === "interactive") {
        if (!interactive && !isHeading && !hasDirectText && !isImgOrMedia) {
          const children = [];
          for (const child of el.children) {
            const c = walk(child, depth + 1);
            if (c) {
              if (Array.isArray(c)) children.push(...c);
              else children.push(c);
            }
          }
          if (children.length === 1) return children[0];
          if (children.length > 1) return children;
          return null;
        }
      }

      // 文本内容
      if (hasDirectText || (!el.children.length && el.textContent.trim())) {
        const text = el.textContent.trim().slice(0, 120);
        if (text) node.text = text;
      }

      // 图片 src
      if (tag === "img" && el.src) node.src = el.src.slice(0, 120);

      // 子元素
      const children = [];
      for (const child of el.children) {
        const c = walk(child, depth + 1);
        if (c) {
          if (Array.isArray(c)) children.push(...c);
          else children.push(c);
        }
      }
      if (children.length) node.children = children;

      return node;
    }
    return walk(document.body, 0);
  }, mode);
}

async function cmdClick(page) {
  // 支持最后一个参数为 --button right|middle
  let button = "left";
  let selectorIdx = 0;
  if (args.length >= 2 && args[args.length - 2] === "--button") {
    button = args[args.length - 1];
    selectorIdx = 0;
  } else if (args.length >= 2 && args[args.length - 1] === "--right") {
    button = "right";
    selectorIdx = 0;
  }
  const selector = args[selectorIdx];
  if (!selector) throw new Error("Usage: click <selector> [--button right|middle]");
  await locate(page, selector).click({ timeout: 10000, button });
  return { clicked: selector, button };
}

async function cmdDblClick(page) {
  const selector = args[0];
  if (!selector) throw new Error("Usage: dblclick <selector>");
  await locate(page, selector).dblclick({ timeout: 10000 });
  return { dblclicked: selector };
}

async function cmdFill(page) {
  const selector = args[0];
  const value = args[1];
  if (!selector || value === undefined)
    throw new Error("Usage: fill <selector> <value>");
  await locate(page, selector).fill(value, { timeout: 10000 });
  return { filled: selector, value };
}

async function cmdType(page) {
  const selector = args[0];
  const text = args[1];
  if (!selector || text === undefined)
    throw new Error("Usage: type <selector> <text>");
  await locate(page, selector).pressSequentially(text, { delay: 50 });
  return { typed: selector, text };
}

async function cmdNavigate(page) {
  const url = args[0];
  if (!url) throw new Error("Usage: navigate <url>");
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
  return { url: page.url(), title: await page.title() };
}

async function cmdEvaluate(page) {
  const expression = args[0];
  if (!expression) throw new Error("Usage: evaluate <expression>");
  const result = await page.evaluate(expression);
  return { value: result };
}

async function cmdHover(page) {
  const selector = args[0];
  if (!selector) throw new Error("Usage: hover <selector>");
  await locate(page, selector).hover({ timeout: 10000 });
  return { hovered: selector };
}

async function cmdPress(page) {
  const key = args[0];
  if (!key) throw new Error("Usage: press <key>");
  await page.keyboard.press(key);
  return { pressed: key };
}

async function cmdSelect(page) {
  const selector = args[0];
  const value = args[1];
  if (!selector || value === undefined)
    throw new Error("Usage: select <selector> <value>");
  await locate(page, selector).selectOption(value, { timeout: 10000 });
  return { selected: selector, value };
}

async function cmdWait(page) {
  const selector = args[0];
  const state = args[1] && ["visible", "hidden", "attached", "detached"].includes(args[1]) ? args[1] : "visible";
  const timeout = parseInt(args[1]) || 15000;
  if (!selector) throw new Error("Usage: wait <selector> [state|timeout_ms]");
  await locate(page, selector).waitFor({ state, timeout });
  return { waited: selector, state };
}

async function cmdText(page) {
  const selector = args[0];
  if (!selector) throw new Error("Usage: text <selector>");
  const text = await locate(page, selector).textContent({ timeout: 10000 });
  return { text: text?.trim() || "" };
}

async function cmdHtml(page) {
  const selector = args[0];
  if (!selector) throw new Error("Usage: html <selector>");
  const html = await locate(page, selector).innerHTML({ timeout: 10000 });
  return { html };
}

async function cmdStyles(page) {
  const selector = args[0];
  if (!selector) throw new Error("Usage: styles <selector>");
  return await page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) return { error: "Element not found: " + sel };
    const computed = getComputedStyle(el);
    const important = [
      "display", "position", "width", "height", "margin", "padding",
      "top", "left", "right", "bottom", "font-size", "font-weight",
      "color", "background-color", "border", "border-radius",
      "overflow", "z-index", "opacity", "transform", "flex-direction",
      "justify-content", "align-items", "gap", "grid-template-columns",
      "text-align", "line-height", "box-shadow",
    ];
    const result = {};
    for (const prop of important) result[prop] = computed.getPropertyValue(prop);
    // 计算 box
    const rect = el.getBoundingClientRect();
    result._box = {
      top: Math.round(rect.top),
      left: Math.round(rect.left),
      width: Math.round(rect.width),
      height: Math.round(rect.height),
    };
    return result;
  }, selector);
}

async function cmdScroll(page) {
  const direction = args[0] || "down";
  const amount = parseInt(args[1]) || 500;
  const delta = {
    up: { dx: 0, dy: -amount },
    down: { dx: 0, dy: amount },
    left: { dx: -amount, dy: 0 },
    right: { dx: amount, dy: 0 },
  }[direction] || { dx: 0, dy: amount };
  await page.mouse.wheel(delta.dx, delta.dy);
  return { scrolled: direction, amount };
}

async function cmdCheck(page) {
  const selector = args[0];
  if (!selector) throw new Error("Usage: check <selector>");
  await locate(page, selector).check({ timeout: 10000 });
  return { checked: selector };
}

async function cmdUncheck(page) {
  const selector = args[0];
  if (!selector) throw new Error("Usage: uncheck <selector>");
  await locate(page, selector).uncheck({ timeout: 10000 });
  return { unchecked: selector };
}

async function cmdGoBack(page) {
  await page.goBack({ waitUntil: "domcontentloaded", timeout: 15000 });
  return { url: page.url(), title: await page.title() };
}

async function cmdSelectPage(endpoint) {
  const index = parseInt(args[0]) || 0;
  const browser = await chromium.connectOverCDP(endpoint);
  const contexts = browser.contexts();
  const pages = contexts[0]?.pages() || [];
  if (index >= pages.length)
    throw new Error(`Page index ${index} out of range (0-${pages.length - 1})`);
  const page = pages[index];
  await page.bringToFront();
  const info = { index, url: page.url(), title: await page.title() };
  await browser.close();
  return info;
}

// ─── 简易 flag 解析 ────────────────────────────────────────
function parseFlags(arr) {
  const flags = {};
  for (let i = 0; i < arr.length; i++) {
    if (arr[i].startsWith("-")) {
      flags[arr[i]] = arr[i + 1]?.startsWith("-") ? true : arr[++i];
    }
  }
  return flags;
}

// ─── 主入口 ────────────────────────────────────────────────
async function main() {
  if (!endpoint || !command) {
    console.error(
      "Usage: node pw.js <cdp-endpoint> <command> [args...]\n" +
        "\nCommands: list-pages, screenshot, snapshot, click, dblclick,\n" +
        "          fill, type, navigate, evaluate, hover, press, select,\n" +
        "          wait, text, html, styles, scroll, select-page,\n" +
        "          check, uncheck, go-back"
    );
    process.exit(1);
  }

  let browser, page;
  try {
    // list-pages 和 select-page 需要独立处理
    if (command === "list-pages") {
      browser = await chromium.connectOverCDP(endpoint);
      const result = await cmdListPages(browser);
      console.log(JSON.stringify(result, null, 2));
      await browser.close();
      return;
    }
    if (command === "select-page") {
      const result = await cmdSelectPage(endpoint);
      console.log(JSON.stringify(result, null, 2));
      return;
    }

    // 其他命令连接并获取活动页面
    ({ browser, page } = await connect(endpoint));

    let result;
    switch (command) {
      case "screenshot":
        result = await cmdScreenshot(page);
        break;
      case "snapshot":
        result = await cmdSnapshot(page);
        break;
      case "click":
        result = await cmdClick(page);
        break;
      case "dblclick":
        result = await cmdDblClick(page);
        break;
      case "fill":
        result = await cmdFill(page);
        break;
      case "type":
        result = await cmdType(page);
        break;
      case "navigate":
        result = await cmdNavigate(page);
        break;
      case "evaluate":
        result = await cmdEvaluate(page);
        break;
      case "hover":
        result = await cmdHover(page);
        break;
      case "press":
        result = await cmdPress(page);
        break;
      case "select":
        result = await cmdSelect(page);
        break;
      case "wait":
        result = await cmdWait(page);
        break;
      case "text":
        result = await cmdText(page);
        break;
      case "html":
        result = await cmdHtml(page);
        break;
      case "styles":
        result = await cmdStyles(page);
        break;
      case "scroll":
        result = await cmdScroll(page);
        break;
      case "check":
        result = await cmdCheck(page);
        break;
      case "uncheck":
        result = await cmdUncheck(page);
        break;
      case "go-back":
        result = await cmdGoBack(page);
        break;
      default:
        throw new Error(`Unknown command: ${command}`);
    }

    console.log(JSON.stringify(result, null, 2));
  } catch (e) {
    console.error(JSON.stringify({ error: e.message }));
    process.exit(1);
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
}

main();
