#!/usr/bin/env node
// CDP (Chrome DevTools Protocol) WebSocket client
// Node.js v21+ required (built-in WebSocket, event-based API)
//
// Usage:
//   node cdp.js <wsUrl> <CDP_Method> [paramsJson]   — raw CDP command
//   node cdp.js <wsUrl> navigate <url>               — navigate and wait for load

const [,, wsUrl, command, ...args] = process.argv;
let msgId = 0;

// Node.js v21+ WebSocket uses addEventListener/removeEventListener, not .on/.off
function onMsg(ws, handler) {
  ws.addEventListener('message', handler);
}
function offMsg(ws, handler) {
  ws.removeEventListener('message', handler);
}
function onOpen(ws, handler) {
  ws.addEventListener('open', handler);
}
function onError(ws, handler) {
  ws.addEventListener('error', handler);
}

function cdp(ws, method, params = {}) {
  const id = ++msgId;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('CDP timeout (15s)')), 15000);
    const handler = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.id === id) {
        clearTimeout(timer);
        offMsg(ws, handler);
        resolve(msg);
      }
    };
    onMsg(ws, handler);
    ws.send(JSON.stringify({ id, method, params }));
  });
}

async function main() {
  if (!wsUrl || !command) {
    console.error('Usage: node cdp.js <wsUrl> <method|navigate> [paramsJson|url]');
    process.exit(1);
  }

  const ws = new WebSocket(wsUrl);
  await new Promise((res, rej) => {
    onOpen(ws, res);
    onError(ws, rej);
  });

  let result;

  if (command === 'navigate') {
    await cdp(ws, 'Page.enable');
    result = await cdp(ws, 'Page.navigate', { url: args[0] });
    await new Promise((res) => {
      const timer = setTimeout(res, 10000);
      const handler = () => {
        clearTimeout(timer);
        offMsg(ws, handler);
        res();
      };
      onMsg(ws, (event) => {
        try {
          if (JSON.parse(event.data).method === 'Page.loadEventFired') handler();
        } catch {}
      });
    });
  } else {
    const params = args[0] ? JSON.parse(args[0]) : {};
    result = await cdp(ws, command, params);
  }

  console.log(JSON.stringify(result, null, 2));
  ws.close();
}

main().catch((e) => {
  console.error(JSON.stringify({ error: e.message }));
  process.exit(1);
});
