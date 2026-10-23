// Alexa+ Hands-Free Helper - simulated Alexa+ front end for the vnc-agent.
// The page talks to the agent through an MCP server at /mcp (Streamable HTTP, spec 2025-11-25);
// POST /api/ask {text} is a plain Server-Sent Events equivalent for scripts.
// Node built-ins only: `node app/server.js`, then open http://localhost:8780
const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn, execFile } = require('child_process');
const { createMcpHandler } = require('./mcp');

const ROOT = path.resolve(__dirname, '..');
const RUN = path.join(ROOT, '_run');
const PORT = +process.env.PORT || 8780;
const VNC_WEB_PORT = process.env.VNC_WEB_PORT || '8767';
const DISPLAY = process.env.VNC_DISPLAY || ':37';
const VNC_SH = path.join(ROOT, '.claude/skills/vnc-desktop/scripts/vnc.sh');
const SESSION_FILE = path.join(RUN, 'session.json');
const DEMO_URL = `http://127.0.0.1:${PORT}/demo-site/home.html`;   // blank start page; tasks use real sites
const NOVNC_DIR = process.env.NOVNC_DIR || '/usr/share/novnc';   // noVNC's RFB client, embedded in our page
const TZ = process.env.TZ || 'America/Los_Angeles';   // desktop clock + agent's sense of "today"
fs.mkdirSync(RUN, { recursive: true });

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json' };

// The voice persona sits on top of the vnc-agent's own instructions.
const VOICE_RULES = `You are the agent behind Alexa+, helping Jordan Lee, 72, who has low vision and can't easily read a screen.
Jordan speaks a request; you do it on real websites in Chrome on the VNC desktop. Chrome is already open full screen
(kiosk: no address bar). Open a site with \`cua goto <url>\`, then work by looking and clicking. Jordan is already
watching the screen, so never mention URLs, ports, the browser or the desktop.
What you know about Jordan: lives in downtown Seattle, WA, ZIP 98101; takes Lisinopril 10 mg for blood pressure;
walks every afternoon; has a Seattle Public Library card. Use these details without asking.
Use official sources and go straight to them:
- medicines: https://medlineplus.gov/druginfo/meds/a692051.html is Lisinopril (otherwise search medlineplus.gov)
- library books (Jordan reads large print): Seattle Public Library catalog,
  https://seattle.bibliocommons.com/v2/search?query=<title words, + "large print">&searchType=smart
  Say whether a large-print copy is available. Placing a hold opens the library sign-in: ask first.
- air quality: https://www.airnow.gov/?city=Seattle&state=WA&country=USA
- weather: https://forecast.weather.gov/MapClick.php?textField1=47.6062&textField2=-122.3321
Voice rules:
- Every text message you write is read aloud. Keep each to one short, friendly sentence.
- Narrate only milestones (2-4 per task), e.g. "I'm on the National Weather Service forecast for Seattle."
  Never talk about your tools, skills, screenshots or reasoning - only about Jordan's task.
- Answer from what you actually see on the page, in plain language, at most 3 short sentences. Never guess from memory.
- Jordan is watching: when you give the answer, leave the page scrolled to the part that shows it.
- Work quickly: use the fewest actions, act on what you see, re-screenshot only when needed to confirm.
- NEVER book, schedule, sign up, submit, buy or send anything, and never open a third-party booking or sign-in page,
  without Jordan's explicit yes in this conversation. Get everything ready, then stop and ask.
- Use this project's vnc-desktop and computer-use skills (scripts under .claude/skills/) for the GUI.
- End your final message with exactly one tag line:
    ASK: <the yes/no question to read aloud>     (waiting on Jordan)
    DONE: <the answer or summary, spoken>        (task finished, verified on screen)
    BLOCKED: <why, spoken>                       (cannot continue)
- If Jordan asks about something from earlier, open that page again and confirm it on screen before answering.`;

let session = null;           // claude session id, persisted so Alexa remembers across restarts
try { session = JSON.parse(fs.readFileSync(SESSION_FILE, 'utf8')).session; } catch {}
let busy = null;              // running child process

const sh = (args) => new Promise((res) => execFile(VNC_SH, args, { cwd: ROOT, env: { ...process.env, TZ } }, (e, out) => res(String(out || ''))));

// Local speech-to-text: one long-lived faster-whisper worker, requests answered in order.
const STT_PY = process.env.STT_PYTHON || path.join(ROOT, '.venv/bin/python');
const STT_DIR = path.join(RUN, 'stt'); fs.mkdirSync(STT_DIR, { recursive: true });
let stt = null, sttQueue = [], sttN = 0;
function startStt() {
  stt = spawn(STT_PY, [path.join(__dirname, 'stt_worker.py')], { cwd: ROOT });
  let buf = '';
  stt.stdout.on('data', (d) => {
    buf += d; let nl;
    while ((nl = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, nl); buf = buf.slice(nl + 1);
      let msg; try { msg = JSON.parse(line); } catch { continue; }
      if (msg.ready) { console.log('speech-to-text ready'); continue; }
      const job = sttQueue.shift(); if (job) job(msg);
    }
  });
  stt.stderr.on('data', () => {});   // onnxruntime chatter
  stt.on('close', () => { stt = null; sttQueue.splice(0).forEach((j) => j({ error: 'speech worker stopped' })); });
}
function transcribe(audio) {
  if (!stt) startStt();
  const file = path.join(STT_DIR, `rec${++sttN % 20}.webm`);
  fs.writeFileSync(file, audio);
  return new Promise((res) => { sttQueue.push(res); stt.stdin.write(file + '\n'); });
}
if (fs.existsSync(STT_PY)) startStt(); else console.warn(`no ${STT_PY}: voice input disabled (see README)`);

async function ensureDesktop(send) {
  if ((await sh(['status'])).includes('up') && (await sh(['status'])).includes('noVNC http')) return;
  send({ type: 'status', text: 'Starting the desktop…' });
  await sh(['stop']);
  const out = await sh(['start']);
  if (!out.includes('up:')) throw new Error('desktop failed to start: ' + out);
  // no "Save password?" bubble over the demo: disable the password manager in the fresh profile
  const prefs = path.join(RUN, 'chrome', 'Default', 'Preferences');
  if (!fs.existsSync(prefs)) {
    fs.mkdirSync(path.dirname(prefs), { recursive: true });
    fs.writeFileSync(prefs, JSON.stringify({ credentials_enable_service: false, profile: { password_manager_enabled: false } }));
  }
  spawn('google-chrome', ['--no-sandbox', '--test-type', '--no-first-run', '--no-default-browser-check',
    '--kiosk', '--remote-debugging-port=9444', '--no-proxy-server', '--disable-features=Translate', '--noerrdialogs', '--disable-session-crashed-bubble', `--user-data-dir=${path.join(RUN, 'chrome')}`, DEMO_URL],
    { env: { ...process.env, DISPLAY, TZ, HOME: path.join(RUN, 'home') }, detached: true, stdio: 'ignore' }).unref();
  send({ type: 'status', text: 'Opening the browser…' });
  // a fresh Chrome can take ~20 s before its first page paints; wait for the real page title
  for (let i = 0; i < 40; i++) {
    await new Promise((r) => setTimeout(r, 1000));
    const title = await new Promise((r) => execFile('xdotool', ['search', '--onlyvisible', '--name', "Alexa's browser"],
      { env: { ...process.env, DISPLAY } }, (e, out) => r(String(out || '').trim())));
    if (title) break;
  }
}

// Turn a tool call into a short human-readable activity line.
function describe(tool) {
  const i = tool.input || {};
  if (tool.name === 'Read') return /\.png$/.test(i.file_path || '') ? '👀 Looking at the screen' : '📄 Reading a file';
  if (tool.name !== 'Bash') return `⚙️ ${tool.name}`;
  // the agent's own description ("Click Refill for Lisinopril") reads best; parse the command otherwise
  if (/skill/i.test(i.description || '') || /SKILL\.md|vnc\.sh|ls .*skills/.test(i.command || '')) return '🛠️ Getting ready';
  if (i.description) return `• ${i.description}`;
  const m = (i.command || '').match(/cua\s+(\w+)\s*(.*)/);
  if (!m) return /vnc\.sh/.test(i.command) ? '🖥️ Checking the desktop' : `⚙️ ${i.description || 'Working'}`;
  const [, cmd, rest] = m;
  const arg = rest.split(/;|&&|\n/)[0].replace(/^['"]|['"]$/g, '').trim();   // first command of a chain
  return ({ shot: '📸 Taking a screenshot', click: `🖱️ Clicking at (${arg.split(/\s+/).join(', ')})`,
    doubleclick: '🖱️ Double-clicking', type: `⌨️ Typing “${arg.slice(0, 40)}”`, key: `⌨️ Pressing ${arg}`,
    goto: `🌐 Opening ${arg}`, scroll: `↕️ Scrolling ${arg}`, clear: '⌫ Clearing the field', wait: '⏳ Waiting' })[cmd] || `⚙️ ${cmd}`;
}

// Run one agent turn. `send` receives {type: status|say|activity|result|error, text}; resolves with
// the agent's final message. Shared by the plain SSE endpoint and the MCP server.
async function runAgent(text, send) {
  if (busy) { send({ type: 'error', text: "I'm still working on the last request." }); return { busy: true, last: '' }; }
  await ensureDesktop(send);
  const args = ['-p', session ? text : `${VOICE_RULES}\n\nThe user says: "${text}"`,
    '--agent', 'vnc-agent', '--output-format', 'stream-json', '--verbose', '--allowedTools', 'Bash Read'];
  if (session) args.push('--resume', session);
  if (process.env.CLAUDE_MODEL) args.push('--model', process.env.CLAUDE_MODEL);
  const child = busy = spawn('claude', args, { cwd: ROOT, env: { ...process.env, TZ, VNC_DISPLAY: DISPLAY }, stdio: ['ignore', 'pipe', 'pipe'] });
  send({ type: 'status', text: 'Working on it…' });

  let buf = '', last = '';
  child.stdout.on('data', (d) => {
    buf += d;
    let nl;
    while ((nl = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, nl); buf = buf.slice(nl + 1);
      let ev; try { ev = JSON.parse(line); } catch { continue; }
      if (ev.session_id && ev.session_id !== session) {
        session = ev.session_id; fs.writeFileSync(SESSION_FILE, JSON.stringify({ session }));
      }
      if (ev.type === 'assistant' && !ev.parent_tool_use_id) {
        for (const b of ev.message.content || []) {
          if (b.type === 'text' && b.text.trim()) { last = b.text.trim(); send({ type: 'say', text: last }); }
          if (b.type === 'tool_use') send({ type: 'activity', text: describe(b) });
        }
      }
      if (ev.type === 'result') { last = ev.result || last; send({ type: 'result', text: last, cost: ev.total_cost_usd, ms: ev.duration_ms }); }
    }
  });
  child.stderr.on('data', (d) => console.error(String(d)));
  return new Promise((resolve) => child.on('close', (code) => {
    busy = null;
    // e.g. a usage limit: the agent's own last words explain it better than an exit code
    if (code) send({ type: 'error', text: /limit|resets/i.test(last) ? `The assistant is unavailable right now: ${last}` : `Agent exited with code ${code}` });
    resolve({ code, last });
  }));
}

function resetConversation() { session = null; fs.rmSync(SESSION_FILE, { force: true }); }

// Plain SSE endpoint (kept for scripts); the page itself talks MCP at /mcp.
async function ask(text, res) {
  const send = (ev) => res.write(`data: ${JSON.stringify(ev)}\n\n`);
  res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
  try { await runAgent(text, send); } catch (e) { send({ type: 'error', text: e.message }); }
  send({ type: 'end' }); res.end();
}

const mcp = createMcpHandler({ runAgent, resetConversation });

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  if (req.method === 'POST' && url.pathname === '/api/ask') {
    let body = ''; req.on('data', (d) => (body += d));
    return req.on('end', () => { let t = ''; try { t = JSON.parse(body).text; } catch {} ask(String(t || '').trim(), res); });
  }
  if (req.method === 'POST' && url.pathname === '/api/stt') {
    const chunks = []; req.on('data', (d) => chunks.push(d));
    return req.on('end', async () => {
      res.setHeader('Content-Type', 'application/json');
      if (!fs.existsSync(STT_PY)) return res.end('{"error":"speech-to-text not installed"}');
      res.end(JSON.stringify(await transcribe(Buffer.concat(chunks))));
    });
  }
  if (url.pathname === '/mcp') return mcp(req, res);
  if (req.method === 'POST' && url.pathname === '/api/reset') {
    resetConversation();
    return res.end('{"ok":true}');
  }
  if (req.method === 'POST' && url.pathname === '/api/stop') {
    if (busy) busy.kill('SIGINT');
    return res.end('{"ok":true}');
  }
  if (url.pathname === '/api/config') {
    res.setHeader('Content-Type', 'application/json');
    return sh(['status']).then((s) => res.end(JSON.stringify(
      { vncWebPort: VNC_WEB_PORT, hasSession: !!session, desktopUp: s.includes('noVNC http') })));
  }
  const [base, prefix] = url.pathname.startsWith('/demo-site') ? [path.join(__dirname, 'demo-site'), /^\/demo-site/]
    : url.pathname.startsWith('/novnc/') ? [NOVNC_DIR, /^\/novnc/] : [path.join(__dirname, 'public'), /^$/];
  let rel = url.pathname.replace(prefix, '') || '/';
  if (rel.endsWith('/')) rel += 'index.html';
  const file = path.join(base, path.normalize(rel));
  if (!file.startsWith(base)) { res.statusCode = 403; return res.end(); }
  fs.readFile(file, (err, data) => {
    if (err) { res.statusCode = 404; return res.end('not found'); }
    res.setHeader('Content-Type', MIME[path.extname(file)] || 'application/octet-stream');
    res.end(data);
  });
});
server.listen(PORT, '127.0.0.1', () => console.log(`Alexa+ Hands-Free Helper: http://localhost:${PORT}`));
