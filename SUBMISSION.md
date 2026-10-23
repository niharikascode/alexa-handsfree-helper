# Devpost submission drafts

Paste each section into the matching Devpost field. Edit freely; it should sound like you.

---

## Track and challenges
- **Primary track:** Alexa+. A simulated Alexa+ experience whose front end is a real MCP client of a self-hosted MCP server (Streamable HTTP, spec 2025-11-25), built on runtime-loaded Agent Skills.
- **Mini challenge:** Open Source, with a *separate, additional* project:
  - **Contribution URL:** `https://github.com/<you>/vnc-computer-use-skills` (new MIT repo)
  - **Project repository URL:** `https://github.com/<you>/alexa-handsfree-helper`
  - **GitHub username:** `<you>`
  - **What I did:** extracted the computer-use layer into a standalone, reusable set of Agent Skills for Claude Code: a VNC desktop you can watch and take over (`vnc-desktop`), plus a screenshot, click and type toolkit (`computer-use`) that enforces "act once, then re-screenshot to confirm", with numbered screenshots and an action audit log.
  - **How it works:** Xvfb, XFCE, x11vnc and noVNC for the desktop; xdotool and scrot for input and capture; SKILL.md files that any Claude Code agent loads.
  - **Why it matters:** it gives any developer a safe, observable computer-use sandbox in minutes. The voice assistant uses it as-is.

## Project name
Hands-Free Helper: a simulated Alexa+ that uses the web for you

## Tagline
Say what you need. Alexa does it on a real web page, tells you what it's doing, and asks before it presses Submit.

## Description

**The problem.** Voice assistants are good at things that have an API. Much of daily life doesn't: refilling a prescription, rescheduling an appointment or paying a utility bill usually means getting through a website. For someone who is blind, has low vision, has tremors, or is an older adult whose caretaker isn't around, that website is a wall.

**What it does.** Hands-Free Helper is a simulated Alexa+ experience. You speak a request, such as "What side effects should I watch for with my Lisinopril?" or "Can I borrow a large-print copy of Lessons in Chemistry?" An AI agent then carries it out in Alexa's own browser in the cloud (nothing runs on the user's computer), shown live next to the conversation. This mirrors how Amazon describes Alexa+ browsing the web on its own to finish tasks.
- **Long, multi-step tasks from your own documents:** it reads the user's medication-list PDF and uses it to fill Medicare Plan Finder. About 30 steps, with questions back to the user ("Which pharmacy do you use?") and a yes/no before enrolling.
- **Real, trusted sites:** MedlinePlus (NIH) for medicines, the Seattle Public Library catalog for large-print books, Medicare.gov for drug plans, plus AirNow.gov and the National Weather Service. Alexa answers only from what's on the page and leaves that part of the page on screen.
- **Narration:** Alexa reads out each milestone ("I'm checking AirNow, the official air quality site, for Seattle").
- **Confirmation:** before anything that commits the user (placing a library hold, booking, buying, submitting), Alexa stops and asks, for example "It's available. Would you like me to place a hold?" Nothing happens until you say yes.
- **Context:** Alexa knows the user's city, ZIP, medicines and library card, and keeps one conversation across requests (it survives restarts). Questions about earlier results are re-checked on the page.

**How it works.**
- **The agent:** a Claude Code subagent (`vnc-agent`) with two Agent Skills.
  - `vnc-desktop` runs an isolated Xvfb/XFCE desktop and streams it over noVNC.
  - `computer-use` is a small screenshot, click and type toolkit.

  The agent operates the GUI by looking at the screen: screenshot, decide, act, check.
- **The MCP server:** a self-hosted MCP server (Streamable HTTP, protocol 2025-11-25) exposes the agent as three tools: `run_web_task`, `confirm_action` and `reset_conversation`. Long-running calls stream progress and log notifications (Alexa's narration and every GUI step) before returning structured results (`status`, `speech`, `narration`, `steps`). The Alexa+ page is an MCP client of this server: `initialize`, `tools/list`, then `tools/call`. A spoken "yes" becomes `confirm_action`. The server also works with MCP Inspector and Claude Code.
- **The bridge:** a Node server with no dependencies. It runs the agent headlessly and keeps the session, so the conversation carries across turns.
- **Speech in:** the browser records your voice and stops automatically when you pause. A local faster-whisper model on the server transcribes it in about 1 second, with no cloud speech service. That matters for privacy, since health requests never leave the machine, and it works on networks where browser speech recognition is blocked.
- **The front end:** one HTML page. The browser's built-in text-to-speech handles speaking. It shows a live activity feed and Yes/No confirmation cards, and after Alexa asks a question it listens for the answer automatically.
- **Offline fallback:** a made-up pharmacy site (`app/demo-site/`) for showing a full order-with-confirmation flow without touching a real store.

**Why it matters.** Most of the web will never get a voice skill or an MCP server. An agent that can use the existing GUI safely, with spoken narration and an explicit "yes" before it acts, makes the whole web reachable by voice. It's the same pattern an Alexa+ integration would use. Because the agent is already exposed as a standard MCP server, Alexa+ itself could hand off "do this on the website" tasks to it. Next steps: run the browser agent on Amazon Nova Act with Bedrock AgentCore Browser, and connect the MCP server to Alexa+ once add-on tooling opens up.

**What was built during the hackathon.**
- **Sep 21, 2026:** the vnc-agent and its two Agent Skills.
- **Oct 23, 2026:** the MCP server and the page's MCP client, the Alexa+ voice front end with local speech-to-text, session memory and the confirmation flow, the demo site, and the documentation.

## Product feedback

**Alexa+ developer tools (MCP / Agent Skills path)**
- *What I used them for:* I read the Alexa+ track docs and the MCP getting-started guide to decide how to integrate.
- *What worked:* MCP as the integration surface makes sense. I could reuse the same Agent Skills format I already use with Claude Code.
- *What needs work:* without an Alexa+ device or Preview access, there's no way to see an MCP server or Agent Skill running inside Alexa+. A hosted Alexa+ simulator or test console that accepts an MCP URL would make this track much easier to build for and to demo.
- *Onboarding:* it took a while to work out which of the three paths (MCP, Agent Skill, simulated) fit a voice and computer-use project.
- *Would I build with it again:* yes, especially once MCP servers can be tested against Alexa+ without a device.

**MCP (spec 2025-11-25, Streamable HTTP)**
- *Used for:* exposing the agent as tools, and making the Alexa+ page an MCP client.
- *Worked well:* the spec is clear. Streaming notifications on the tools/call response fit long GUI tasks nicely, and `structuredContent` with an `outputSchema` gave the voice front end a clean status (`needs_confirmation`) to act on. MCP Inspector's CLI made checking compliance quick.
- *Needs work:* in the Alexa+ docs, there's no public way to point a real Alexa+ (or a simulator) at a self-hosted MCP server; the FAQ confirms the tooling is partners-only. A public test console would let builders verify the real integration.

**Claude Code (headless mode, subagents, Agent Skills)**
- *Used for:* running the agent (`claude -p --agent vnc-agent --output-format stream-json --resume`).
- *Worked well:* stream-json gave clean events for spoken narration and the activity feed, and `--resume` provided cross-turn memory for free.
- *Needs work:* an agent sometimes picks up user-level skills with similar names (for example, a global "computer-use" skill), so the prompt has to name the project's skills explicitly.

**noVNC / websockify / speech**
- noVNC in a view-only iframe was the simplest way to let users watch the agent work.
- Chrome's built-in speech recognition sends audio to Google and failed on my network with a `network` error. I replaced it with local faster-whisper on the server, which was fast enough on CPU (about 1 s per command).
- Microphone access only works in a secure context (`localhost` or HTTPS), so remote demos need port forwarding.

## Friction log (optional; up to a 10% bonus)

| # | Task | Steps | Expected vs actual | Severity | Workaround | Suggestion |
|---|---|---|---|---|---|---|
| 1 | Test an Alexa+ integration without an Echo device | Read the track docs and looked for a simulator | Expected a web simulator or test console. Found nothing that accepts an MCP server URL | High | Built a simulated Alexa+ front end | Provide a hosted Alexa+ simulator that connects to a developer's MCP endpoint |
| 2 | Choose the right Alexa+ path for a computer-use agent | Compared the MCP, Agent Skill and simulated options in the rules | Expected guidance on which path fits which kind of project. The paths are described only briefly | Medium | Chose the simulated path | Add a decision table and one sample per path |
| 3 | Voice input for the simulated Alexa+ | Used the browser's Web Speech API through a port-forwarded localhost | Expected speech recognition to work. Chrome returned a `network` error because its recognizer calls Google's cloud | High | Recorded audio with MediaRecorder and transcribed locally with faster-whisper | Provide an Alexa+ speech or simulator endpoint that simulation-path builders can call for speech recognition and text-to-speech |
| 4 | Make the agent use the project's skills | Ran the headless agent with project skills | Expected project skills to take priority. The agent considered a similarly named global skill | Low | Named the project skills explicitly in the prompt | Document skill precedence or allow a skills allow-list per run |

## Pitch line (vs. Amazon Nova Act)
"Nova Act is how Alexa+ can work a website. Hands-Free Helper is about the person on the other end: someone who can't see the screen hears every step, sees it in large captions, and approves each final action by voice. It's exposed as a standard MCP server, so any assistant, including Alexa+, could hand it a task."

## Demo video script (under 3 minutes)
Recorded in one take on http://localhost:8780 (click **New conversation** first). Speed up only the silent clicking.
1. **0:00–0:15** Voiceover: "Most websites are hard to use if you can't see the screen. This is Hands-Free Helper, a simulated Alexa+ that uses real websites for you, out loud."
2. **0:15–0:50** "What side effects should I watch for with my Lisinopril?" → MedlinePlus (NIH) side-effects section on screen, read back in plain language.
3. **0:50–1:30** "Can I borrow a large-print copy of Lessons in Chemistry?" → Seattle Public Library catalog: Large Print, Available. Alexa asks "Would you like me to place a hold?" → "No, not now." → nothing reserved (the confirmation safeguard).
4. **1:30–2:20** The big one: "My daughter sent my medication list. Use it to find me the cheapest Medicare drug plan for next year." → opens the PDF and reads the 3 medicines aloud → Medicare Plan Finder: ZIP, Part D, adds all 3 medicines with the right doses (about 30 steps) → asks "Which pharmacy do you use?" → "The first one." → reads the 3 cheapest 2027 plans with yearly costs → asks about enrolling → "No, I'll check with my daughter first." → nothing signed up.
6. **2:20–2:55** Voiceover: "The page is an MCP client of a self-hosted MCP server (spec 2025-11-25), speech is transcribed on the machine, and it never books, buys or submits without your yes." Point at "connected to MCP server · 3 tools" and open "Every step Alexa took" to show the `tools/call` lines.
