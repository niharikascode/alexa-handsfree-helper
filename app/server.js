// Alexa+ Hands-Free Helper - simulated Alexa+ front end for the vnc-agent.
// POST /api/ask {text} streams the agent's progress back as Server-Sent Events.
// Node built-ins only: `node app/server.js`, then open http://localhost:8780
const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn, execFile } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const RUN = path.join(ROOT, '_run');
const PORT = +process.env.PORT || 8780;
const VNC_WEB_PORT = process.env.VNC_WEB_PORT || '8767';
const DISPLAY = process.env.VNC_DISPLAY || ':37';
const VNC_SH = path.join(ROOT, '.claude/skills/vnc-desktop/scripts/vnc.sh');
const SESSION_FILE = path.join(RUN, 'session.json');
const DEMO_URL = `http://localhost:${PORT}/demo-site/`;
fs.mkdirSync(RUN, { recursive: true });

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json' };

// The voice persona sits on top of the vnc-agent's own instructions.
const VOICE_RULES = `You are the agent behind Alexa+, helping a user who cannot easily see or use a screen.
They speak a request; you do it on the VNC desktop through the GUI. The desktop is already running with
Chrome open, and the user is already watching it, so never mention URLs, ports or the desktop itself.
Voice rules:
- Every text message you write is read aloud. Keep each to one short, friendly sentence.
- Narrate only milestones (about 3-5 per task), e.g. "I'm signed in, looking for your prescription."
  Never talk about your tools, skills, screenshots or reasoning - only about the user's task.
- Use this project's vnc-desktop and computer-use skills (scripts under .claude/skills/) for the GUI.
- Work quickly: act on what you see, re-screenshot only when needed to confirm.
- NEVER press a final Submit / Place order / Send / Pay button without the user's explicit yes in
  this conversation. Get everything ready, then stop and ask.
- End your final message with exactly one tag line:
    ASK: <the yes/no question to read aloud>     (waiting on the user)
    DONE: <one-sentence spoken summary>          (task finished, verified on screen)
    BLOCKED: <why, spoken>                       (cannot continue)
- For questions about earlier requests, answer from this conversation without touching the desktop.`;

let session = null;           // claude session id, persisted so Alexa remembers across restarts
try { session = JSON.parse(fs.readFileSync(SESSION_FILE, 'utf8')).session; } catch {}
let busy = null;              // running child process

const sh = (args) => new Promise((res) => execFile(VNC_SH, args, { cwd: ROOT }, (e, out) => res(String(out || ''))));

async function ensureDesktop(send) {
  if ((await sh(['status'])).includes('up') && (await sh(['status'])).includes('noVNC http')) return;
  send({ type: 'status', text: 'Starting the desktop…' });
  await sh(['stop']);
  const out = await sh(['start']);
  if (!out.includes('up:')) throw new Error('desktop failed to start: ' + out);
  spawn('google-chrome', ['--no-sandbox', '--test-type', '--no-first-run', '--no-default-browser-check',
    '--start-maximized', '--disable-features=Translate', `--user-data-dir=${path.join(RUN, 'chrome')}`, DEMO_URL],
    { env: { ...process.env, DISPLAY, HOME: path.join(RUN, 'home') }, detached: true, stdio: 'ignore' }).unref();
  send({ type: 'status', text: 'Opening the browser…' });
  await new Promise((r) => setTimeout(r, 8000));
}

// Turn a tool call into a short human-readable activity line.
function describe(tool) {
  const i = tool.input || {};
  if (tool.name === 'Read') return /\.png$/.test(i.file_path || '') ? '👀 Looking at the screen' : '📄 Reading a file';
  if (tool.name !== 'Bash') return `⚙️ ${tool.name}`;
  const m = (i.command || '').match(/cua\s+(\w+)\s*(.*)/);
  if (!m) return /vnc\.sh/.test(i.command) ? '🖥️ Checking the desktop' : `⚙️ ${i.description || 'Working'}`;
  const [, cmd, rest] = m;
  const arg = rest.replace(/^['"]|['"]$/g, '').trim();
  return ({ shot: '📸 Taking a screenshot', click: `🖱️ Clicking at (${arg.split(/\s+/).join(', ')})`,
    doubleclick: '🖱️ Double-clicking', type: `⌨️ Typing “${arg.slice(0, 40)}”`, key: `⌨️ Pressing ${arg}`,
    goto: `🌐 Opening ${arg}`, scroll: `↕️ Scrolling ${arg}`, clear: '⌫ Clearing the field', wait: '⏳ Waiting' })[cmd] || `⚙️ ${cmd}`;
}

async function ask(text, res) {
  const send = (ev) => res.write(`data: ${JSON.stringify(ev)}\n\n`);
  res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
  if (busy) { send({ type: 'error', text: "I'm still working on the last request." }); return res.end(); }
  try { await ensureDesktop(send); } catch (e) { send({ type: 'error', text: e.message }); return res.end(); }

  const args = ['-p', session ? text : `${VOICE_RULES}\n\nThe user says: "${text}"`,
    '--agent', 'vnc-agent', '--output-format', 'stream-json', '--verbose', '--allowedTools', 'Bash Read'];
  if (session) args.push('--resume', session);
  if (process.env.CLAUDE_MODEL) args.push('--model', process.env.CLAUDE_MODEL);
  const child = busy = spawn('claude', args, { cwd: ROOT, env: { ...process.env, VNC_DISPLAY: DISPLAY } });
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
      if (ev.type === 'result') send({ type: 'result', text: ev.result || last, cost: ev.total_cost_usd, ms: ev.duration_ms });
    }
  });
  child.stderr.on('data', (d) => console.error(String(d)));
  child.on('close', (code) => {
    busy = null;
    if (code) send({ type: 'error', text: `Agent exited with code ${code}` });
    send({ type: 'end' }); res.end();
  });
  res.on('close', () => {});  // keep the agent running even if the tab reloads
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  if (req.method === 'POST' && url.pathname === '/api/ask') {
    let body = ''; req.on('data', (d) => (body += d));
    return req.on('end', () => { let t = ''; try { t = JSON.parse(body).text; } catch {} ask(String(t || '').trim(), res); });
  }
  if (req.method === 'POST' && url.pathname === '/api/reset') {
    session = null; fs.rmSync(SESSION_FILE, { force: true });
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
  const base = url.pathname.startsWith('/demo-site') ? path.join(__dirname, 'demo-site') : path.join(__dirname, 'public');
  let rel = url.pathname.replace(/^\/demo-site/, '') || '/';
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
