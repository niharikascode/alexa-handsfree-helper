# Hands-Free Helper: a simulated Alexa+ that uses the web for you

**Amazon Developer Hackathon 2026, Alexa+ track (simulated Alexa+ experience path)**

Many websites are hard to use for people who are blind, have low vision, have tremors or are elderly. Many tasks still have no API, voice skill or MCP server, only a web form.

Hands-Free Helper lets you **say what you need**. An AI agent then does the task in a real web browser, and you can watch it work. Alexa:
- **narrates** each milestone out loud
- **stops and asks for your spoken "yes"** before it submits, buys or sends anything
- **remembers the conversation**, so follow-ups like "when is it ready again?" work, even after a restart

```
 You: "Alexa, refill my blood pressure medication at Maple Street Pharmacy."
 Alexa: "I'm signed in and found your Lisinopril."
 Alexa: "Your refill is set for pickup tomorrow at 10 AM, $4 copay. Should I place the order?"
 You: "Yes."
 Alexa: "Done. Your order number is MSP-48522."
 You: "When is it ready again?"   → answered from memory, no screen work needed
```

## How it works

```
Browser page (localhost:8780)                     app/server.js (Node, no dependencies)
 ┌───────────────────────────────┐ POST /api/ask  ┌──────────────────────────────────────┐
 │ Alexa+ panel                  │ ─────────────▶ │ claude -p --agent vnc-agent          │
 │  • voice ring (mic → local    │ ◀── SSE ────── │   --output-format stream-json        │
 │    Whisper STT), TTS replies  │  say/activity/ │   --resume <session>  (memory)       │
 │  • live activity feed         │  result events │ starts the desktop + Chrome on demand│
 │  • yes/no confirmation cards  │                └──────────────┬───────────────────────┘
 │ noVNC view of the agent's     │                               │ Agent Skills
 │ desktop (:8767, view-only)    │ ◀── watch ── Xvfb/XFCE desktop ◀┤ vnc-desktop: start/stop/status
 └───────────────────────────────┘              (display :37)     └ computer-use: shot/click/type/key
```

- **The agent** ([.claude/agents/vnc-agent.md](.claude/agents/vnc-agent.md)) is a Claude Code subagent with only Bash and Read access. It loads two **Agent Skills**:
  - [vnc-desktop](.claude/skills/vnc-desktop/SKILL.md) starts and stops an isolated Xvfb + XFCE desktop, with x11vnc and noVNC so people can watch.
  - [computer-use](.claude/skills/computer-use/SKILL.md) is a small `xdotool`/`scrot` toolkit: screenshot, click, type, key, scroll, goto.

  It works by looking at the screen. It takes a screenshot, reads it, does one action, then takes another screenshot to check the result.
- **The voice layer** ([app/server.js](app/server.js)) adds the Alexa+ persona and rules: short spoken sentences, never confirm a final action on the user's behalf, and end with `ASK:`, `DONE:` or `BLOCKED:`. It streams the agent's events to the page and keeps the session ID on disk, so the conversation survives restarts.
- **The Alexa+ page** ([app/public/index.html](app/public/index.html)) is one HTML file, designed for low-vision users. It uses Atkinson Hyperlegible, a typeface made by the Braille Institute for low-vision readers. A light bar in the style of an Echo device shows Alexa's state (listening, working, needs your OK, done), and Alexa's current spoken line appears as a large live caption. The page also has:
  - speech in: the page records with MediaRecorder and stops automatically when you pause. The audio goes to `POST /api/stt`, where a local **faster-whisper** model ([app/stt_worker.py](app/stt_worker.py), CPU, about 1 s per command) transcribes it. No cloud speech service is involved, so it works where Chrome's built-in recognition can't reach Google.
  - speech out: the browser's built-in text-to-speech
  - a text box as fallback
  - live activity lines ("Clicking at (640, 410)")
  - confirmation cards with Yes/No buttons; after asking, it listens for your answer automatically
  - the agent's desktop, embedded live and view-only
- **The demo site** ([app/demo-site/](app/demo-site/)) is a made-up local pharmacy ("Maple Street Pharmacy"). The demo behaves the same every run and never places a real order.

## Run it

Requirements: Linux with `Xvfb`, `xfce4`, `dbus-x11`, `x11vnc`, `xdotool`, `scrot`, `websockify` and `novnc` (`/usr/share/novnc`), plus `ffmpeg`, Google Chrome, Python 3.9+, Node 18+ and [Claude Code](https://claude.com/claude-code), signed in.

```bash
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt   # local speech-to-text (one-time)
node app/server.js            # → http://localhost:8780
```

Open http://localhost:8780 in Chrome, tap the ring (or press Space) and speak. You can also type. The desktop and browser start automatically on the first request.

On a remote machine, forward both ports. The browser only allows the microphone on `localhost`.
```bash
ssh -L 8780:localhost:8780 -L 8767:localhost:8767 <host>
```

Settings (environment variables): `PORT` (default 8780), `VNC_DISPLAY` (:37), `VNC_WEB_PORT` (8767), `CLAUDE_MODEL`, `STT_MODEL` (`base.en`; use `small.en` for better accuracy).
To control the desktop by hand: `.claude/skills/vnc-desktop/scripts/vnc.sh start|stop|status`.

## Safety
- **Confirmation step:** the agent prepares everything and then has to get your explicit "yes" in the conversation before any submit, purchase or send. This rule is in both the agent definition and the voice rules.
- **Isolation:** the desktop has its own HOME and Chrome profile under `_run/`, kept out of git. The agent's tools are limited to Bash and Read.
- **Audit trail:** every GUI action is logged to `_run/agent/actions.log`, and every screenshot is kept under `_run/agent/shots/`.

## What was built during the hackathon
- **Sep 21, 2026:** the vnc-agent and its two Agent Skills (desktop and computer-use toolkit).
- **Oct 23, 2026:**
  - the Alexa+ voice front end, with local Whisper speech-to-text
  - the streaming agent bridge, with session memory and the confirmation flow
  - the demo pharmacy site
  - this repository

## License
MIT. See [LICENSE](LICENSE).
