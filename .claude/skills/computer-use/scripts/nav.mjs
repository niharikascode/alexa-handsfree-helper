// Navigate the visible Chrome tab through the DevTools protocol (works in kiosk/full-screen
// mode, where there is no address bar to type into). Usage: node nav.mjs <url> [port]
const [url, port = process.env.CUA_CDP_PORT || '9444'] = process.argv.slice(2);
const tabs = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
const tab = tabs.find((t) => t.type === 'page' && !t.url.startsWith('devtools://'));
if (!tab) { console.error('no page tab'); process.exit(1); }
const ws = new WebSocket(tab.webSocketDebuggerUrl);
await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
ws.send(JSON.stringify({ id: 1, method: 'Page.navigate', params: { url } }));
ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id === 1) { console.log(d.error ? 'error: ' + d.error.message : 'navigated'); process.exit(d.error ? 1 : 0); } };
setTimeout(() => process.exit(1), 10000);
