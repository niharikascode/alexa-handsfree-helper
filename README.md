# Hands-Free Helper: a simulated Alexa+ that uses the web for you

**Amazon Developer Hackathon 2026, Alexa+ track (simulated Alexa+ experience path)**

Many websites are hard to use for people who are blind, have low vision, have tremors or are elderly. Many tasks still have no API, voice skill or MCP server, only a web form.

Hands-Free Helper lets you **say what you need**. An AI agent then does the task in **Alexa's own browser in the cloud**, and you can watch it work. Nothing runs on your computer. Alexa:
- **narrates** each milestone out loud
- **stops and asks for your spoken "yes"** before it submits, buys or sends anything
- **remembers the conversation**, so follow-ups like "when is it ready again?" work, even after a restart

```
 You: "What side effects should I watch for with my Lisinopril?"   → MedlinePlus (NIH), read in plain language
 You: "Can I borrow a large-print copy of Lessons in Chemistry?"   → library: available; "Place a hold?" → "No, not now."
 You: "Is the air OK for my walk this afternoon?"                  → AirNow.gov (EPA)
 You: "Will it rain tomorrow?"                                     → National Weather Service
```

The original offline demo, with a made-up pharmacy, still works:
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
Browser page (localhost:8780)    POST /mcp        app/server.js + app/mcp.js (Node, no deps)
 ┌───────────────────────────────┐ tools/call     ┌──────────────────────────────────────┐
 │ Alexa+ panel (MCP client)     │ ─────────────▶ │ claude -p --agent vnc-agent          │
 │  • voice ring (mic → local    │ ◀── SSE ────── │   --output-format stream-json        │
 │    Whisper STT), TTS replies  │  say/activity/ │   --resume <session>  (memory)       │
 │  • live activity feed         │  result events │ starts the desktop + Chrome on demand│
 │  • yes/no confirmation cards  │                └──────────────┬───────────────────────┘
 │ live view of Alexa's cloud    │                               │ Agent Skills
 │ browser (view-only)           │ ◀── watch ── kiosk Chrome, Xvfb◀┤ vnc-desktop: start/stop/status
 └───────────────────────────────┘              (display :37)     └ computer-use: shot/click/type/key
```

- **The agent** ([.claude/agents/vnc-agent.md](.claude/agents/vnc-agent.md)) is a Claude Code subagent with only Bash and Read access. It loads two **Agent Skills**:
  - [vnc-desktop](.claude/skills/vnc-desktop/SKILL.md) starts and stops an isolated Xvfb + XFCE desktop, with x11vnc and noVNC so people can watch.
  - [computer-use](.claude/skills/computer-use/SKILL.md) is a small `xdotool`/`scrot` toolkit: screenshot, click, type, key, scroll, goto.

  It works by looking at the screen. It takes a screenshot, reads it, does one action, then takes another screenshot to check the result.
- **The MCP server** ([app/mcp.js](app/mcp.js)) exposes the agent as MCP tools (see below). The page reaches the agent only through it.
- **The voice layer** ([app/server.js](app/server.js)) adds the Alexa+ persona and rules: short spoken sentences, never confirm a final action on the user's behalf, and end with `ASK:`, `DONE:` or `BLOCKED:`. It streams the agent's events to the page and keeps the session ID on disk, so the conversation survives restarts.
- **The Alexa+ page** ([app/public/index.html](app/public/index.html)) is one HTML file, designed for low-vision users. It uses Atkinson Hyperlegible, a typeface made by the Braille Institute for low-vision readers. A light bar in the style of an Echo device shows Alexa's state (listening, working, needs your OK, done), and Alexa's current spoken line appears as a large live caption. The page also has:
  - speech in: the page records with MediaRecorder and stops automatically when you pause. The audio goes to `POST /api/stt`, where a local **faster-whisper** model ([app/stt_worker.py](app/stt_worker.py), CPU, about 1 s per command) transcribes it. No cloud speech service is involved, so it works where Chrome's built-in recognition can't reach Google.
  - speech out: the browser's built-in text-to-speech
  - a text box as fallback
  - live activity lines ("Clicking at (640, 410)")
  - confirmation cards with Yes/No buttons; after asking, it listens for your answer automatically
  - Alexa's cloud browser, shown live in a device-style frame. noVNC's RFB client draws straight into the page (view-only, no noVNC interface), and Chrome runs in kiosk mode, so viewers see only the website.
- **Real sites:** the agent opens trusted public sites with `cua goto`: MedlinePlus, the Seattle Public Library catalog, AirNow.gov and weather.gov. Kiosk Chrome has no address bar, so it navigates through Chrome's local DevTools port ([nav.mjs](.claude/skills/computer-use/scripts/nav.mjs)). The voice rules hold the user's profile (Seattle 98101, Lisinopril, library card) and say: answer only from what's on screen, and ask before anything that commits the user.
- **The demo site** ([app/demo-site/](app/demo-site/)) is a made-up local pharmacy ("Maple Street Pharmacy") for an offline order-with-confirmation demo, plus the blank start page.

## MCP server (Alexa+ integration surface)
The Alexa+ page is an **MCP client**. It talks to the helper's **self-hosted MCP server** at `http://localhost:8780/mcp` ([app/mcp.js](app/mcp.js)): **Streamable HTTP, protocol version 2025-11-25**, using the `initialize`, `tools/list` and `tools/call` requests. Long-running tool calls stream `notifications/progress` and `notifications/message` (Alexa's narration and each GUI step) before returning the result.

| Tool | What it does |
|---|---|
| `run_web_task {request}` | Carries out a spoken request in Alexa's cloud browser. Returns `structuredContent` `{status, speech, narration, steps}`; `status` is `needs_confirmation` when everything is ready and the agent is waiting for the user's answer |
| `confirm_action {approve, note?}` | The user's yes or no. Only `approve: true` lets the agent press the final button. Annotated `destructiveHint: true` |
| `reset_conversation` | Starts a new conversation |

Security: the server checks the `Origin` header, which protects against DNS rebinding as the transport spec requires. It listens on 127.0.0.1 only and issues an `Mcp-Session-Id` per client.

Any MCP client works, not just the page:
```bash
npx @modelcontextprotocol/inspector --cli http://localhost:8780/mcp --transport http --method tools/list
claude mcp add --transport http hands-free-helper http://localhost:8780/mcp   # then ask Claude to use it
```

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

**For judges:** the agent runs on Claude Code, so running the project yourself needs the `claude` CLI signed in, or `ANTHROPIC_API_KEY` set. The demo video shows the complete flow. The fictional pharmacy site is included, and no real accounts are used.

## How it compares to real Alexa+
Amazon has said Alexa+ can browse websites on its own to finish tasks (Amazon Nova Act). This prototype simulates that: the agent works in a separate browser, the user watches it live, and it asks for a spoken yes before anything is submitted. Here the "cloud browser" is a virtual display (Xvfb) on the server. In production it would be a hosted browser session.

**Compared with Amazon Nova Act:** Nova Act (generally available on AWS since Dec 2025) is the production service for building and running fleets of browser agents, with human-in-the-loop approval and takeover for operators. Hands-Free Helper is about the person on the other end. Someone who can't see the screen hears every step, sees it in large captions, and approves each final action by voice. The voice and approval layer works with any browser agent: this prototype drives a Claude-based agent, and moving it to Nova Act on Bedrock AgentCore is the natural next step.

## Safety
- **Confirmation step:** the agent prepares everything and then has to get your explicit "yes" in the conversation before any submit, purchase or send. This rule is in both the agent definition and the voice rules.
- **Isolation:** the desktop has its own HOME and Chrome profile under `_run/`, kept out of git. The agent's tools are limited to Bash and Read.
- **Audit trail:** every GUI action is logged to `_run/agent/actions.log`, and every screenshot is kept under `_run/agent/shots/`.

## What was built during the hackathon
- **Sep 21, 2026:** the vnc-agent and its two Agent Skills (desktop and computer-use toolkit).
- **Oct 23, 2026:**
  - the MCP server (Streamable HTTP, 2025-11-25) and the page's MCP client
  - the Alexa+ voice front end, with local Whisper speech-to-text
  - the streaming agent bridge, with session memory and the confirmation flow
  - the demo pharmacy site
  - this repository

## Related
The two computer-use Agent Skills are also published on their own as a reusable open-source project: **vnc-computer-use-skills**.

## License
MIT. See [LICENSE](LICENSE).
