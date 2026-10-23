# Devpost submission drafts

Paste each section into the matching Devpost field. Edit freely; it should sound like you.

---

## Track and challenges
- **Primary track:** Alexa+ (simulated Alexa+ experience path)
- **Mini challenge:** Open Source. The repo is public under the MIT license. Fill in the contribution URL, repo URL and GitHub username on Devpost.

## Project name
Hands-Free Helper: a simulated Alexa+ that uses the web for you

## Tagline
Say what you need. Alexa does it on a real web page, tells you what it's doing, and asks before it presses Submit.

## Description

**The problem.** Voice assistants are good at things that have an API. Much of daily life doesn't: refilling a prescription, rescheduling an appointment or paying a utility bill usually means getting through a website. For someone who is blind, has low vision, has tremors, or is an older adult whose caretaker isn't around, that website is a wall.

**What it does.** Hands-Free Helper is a simulated Alexa+ experience. You speak a request, such as "Alexa, refill my blood pressure medication at Maple Street Pharmacy." An AI agent then carries it out on a real browser in a virtual desktop, and the desktop is shown live next to the conversation.
- **Narration:** Alexa reads out each milestone ("I'm signed in and found your Lisinopril").
- **Confirmation:** before anything that can't be undone, Alexa stops and asks: "Your refill is set for pickup tomorrow at 10 AM, $4 copay. Should I place the order?" Nothing is submitted until you say yes.
- **Memory:** the conversation persists. "When is it ready again?" is answered from memory. Asking for the same refill twice gets "I already ordered that, do you want another?", even after the server restarts.

**How it works.**
- **The agent:** a Claude Code subagent (`vnc-agent`) with two Agent Skills.
  - `vnc-desktop` runs an isolated Xvfb/XFCE desktop and streams it over noVNC.
  - `computer-use` is a small screenshot, click and type toolkit.

  The agent operates the GUI by looking at the screen: screenshot, decide, act, check.
- **The bridge:** a Node server with no dependencies. It runs the agent headlessly, streams its events (spoken lines, actions, results) to the browser over Server-Sent Events, and keeps the session so the conversation carries across turns.
- **Speech in:** the browser records your voice and stops automatically when you pause. A local faster-whisper model on the server transcribes it in about 1 second, with no cloud speech service. That matters for privacy, since health requests never leave the machine, and it works on networks where browser speech recognition is blocked.
- **The front end:** one HTML page. The browser's built-in text-to-speech handles speaking. It shows a live activity feed and Yes/No confirmation cards, and after Alexa asks a question it listens for the answer automatically.
- **The demo site:** a made-up pharmacy site, so the demo behaves the same every run and never places a real order.

**Why it matters.** Most of the web will never get a voice skill or an MCP server. An agent that can use the existing GUI safely, with spoken narration and an explicit "yes" before it acts, makes the whole web reachable by voice. It's the same pattern an Alexa+ integration would use. Taking this further means exposing the agent as an MCP server (Streamable HTTP), so Alexa+ itself could hand off "do this on the website" tasks.

**What was built during the hackathon.**
- **Sep 21, 2026:** the vnc-agent and its two Agent Skills.
- **Oct 23, 2026:** the Alexa+ voice front end, the streaming bridge with session memory and the confirmation flow, the demo site, and the documentation.

## Product feedback

**Alexa+ developer tools (MCP / Agent Skills path)**
- *What I used them for:* I read the Alexa+ track docs and the MCP getting-started guide to decide how to integrate.
- *What worked:* MCP as the integration surface makes sense. I could reuse the same Agent Skills format I already use with Claude Code.
- *What needs work:* without an Alexa+ device or Preview access, there's no way to see an MCP server or Agent Skill running inside Alexa+. A hosted Alexa+ simulator or test console that accepts an MCP URL would make this track much easier to build for and to demo.
- *Onboarding:* it took a while to work out which of the three paths (MCP, Agent Skill, simulated) fit a voice and computer-use project.
- *Would I build with it again:* yes, especially once MCP servers can be tested against Alexa+ without a device.

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

## Demo video script (under 3 minutes)
1. **0:00–0:15** The problem: "Most of the web has no voice interface. For someone who can't use a screen, a pharmacy refill form is a wall."
2. **0:15–1:30** Live demo. Say "Alexa, refill my blood pressure medication at Maple Street Pharmacy." Show the narration, the activity feed and the agent working on the desktop, ending at the confirmation question.
3. **1:30–1:55** Say "Yes." The order is placed and the order number is read back, with the confirmation card on screen.
4. **1:55–2:15** Ask "When is my refill ready again?" It's answered from memory. Then ask for the same refill again, and it warns that it's a duplicate.
5. **2:15–2:45** Architecture slide (from the README), the confirmation safety rule, and what's next (the agent as an MCP server for Alexa+).
