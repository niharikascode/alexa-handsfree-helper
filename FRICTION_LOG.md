# Friction log: Hands-Free Helper (Amazon Developer Hackathon 2026, Alexa+ track)

Friction I actually hit while building this project, with the workaround I used and a suggestion for each.

| # | Task attempted | Severity |
|---|---|---|
| 1 | Connecting a self-hosted MCP server to Alexa+ | High |
| 2 | Understanding what the "simulated experience" path should include | Medium |
| 3 | Browser speech recognition for the simulated Alexa+ | High |
| 4 | Long-running tool calls over a streamed response | High |
| 5 | Text-to-speech stopping on long answers | Medium |
| 6 | Driving a full-screen browser for the agent's live view | Medium |

## 1. Connecting a self-hosted MCP server to Alexa+
- **Task:** Test my MCP server (Streamable HTTP, spec 2025-11-25) inside a real Alexa+ experience.
- **Steps:** Read the Alexa+ track resources and add-on docs, looked for a simulator or developer console that accepts an MCP server URL, then checked the hackathon FAQ.
- **Expected vs. actual:** Expected a way to point Alexa+ at my server. Actual: the Category SDK, MCP Toolkit, CLI and Web Simulator are partner-only; the individual setup-guide pages don't always say so, and only the FAQ made it clear.
- **Severity:** High
- **Workaround:** Built my own simulated Alexa+ web front end that acts as a real MCP client (`initialize`, `tools/list`, `tools/call`).
- **Suggestion:** Put a "partner-only" banner on every gated setup page, and offer a public test console that accepts an MCP URL.

## 2. Understanding what the "simulated experience" path should include
- **Task:** Choose the right Alexa+ submission path for a voice and computer-use project.
- **Steps:** Compared the Official Rules with the FAQ.
- **Expected vs. actual:** The rules say the simulated path needs "no specific framework, SDK, or MCP-shaped surface", while the FAQ describes the simulated path as a web page acting as an MCP client. I wasn't sure which one judges expect.
- **Severity:** Medium
- **Workaround:** Did both: a simulated Alexa+ page that is also a real MCP client of my own MCP server.
- **Suggestion:** Add one example repo per path and a short "what judges look for" note for the simulated path.

## 3. Browser speech recognition for the simulated Alexa+
- **Task:** Voice input in a web-based Alexa+ simulation.
- **Steps:** Used the Web Speech API (`webkitSpeechRecognition`) in Chrome on a port-forwarded localhost page.
- **Expected vs. actual:** Expected speech recognition to work. Actual: it returned a `network` error, because Chrome's recognizer sends audio to a cloud service that wasn't reachable.
- **Severity:** High
- **Workaround:** Recorded audio with MediaRecorder (auto-stop on silence) and transcribed it on the server with faster-whisper, about 1 s per command.
- **Suggestion:** Provide an Alexa speech endpoint (recognition and text-to-speech) for simulated-experience builders, or document the secure-context and network requirements.

## 4. Long-running tool calls over a streamed response
- **Task:** Show a 3–4 minute agent task live in the browser while it streams MCP progress notifications.
- **Steps:** Ran the page through VS Code port forwarding and called a long `tools/call` that streams Server-Sent Events.
- **Expected vs. actual:** Expected a steady stream of updates. Actual: updates sometimes stalled mid-task, so the page looked frozen while the agent kept working.
- **Severity:** High
- **Workaround:** Added keep-alive messages to the stream, plus an event log the page polls every second and can finish from.
- **Suggestion:** Recommend keep-alive and resumable-stream patterns for long tool calls in the Alexa+ MCP guidance, and support progress notifications natively.

## 5. Text-to-speech stopping on long answers
- **Task:** Read a multi-sentence answer aloud (three plans with prices).
- **Steps:** Spoke the whole answer as one `SpeechSynthesisUtterance`.
- **Expected vs. actual:** Expected the full answer to be read and the `end` event to fire. Actual: Chrome cut the speech off after about 15 seconds and never fired `end`, which left the interface stuck.
- **Severity:** Medium
- **Workaround:** Spoke sentence by sentence, with a timeout guard per sentence.
- **Suggestion:** An Alexa text-to-speech API for simulations would avoid browser-specific speech limits.

## 6. Driving a full-screen browser for the agent's live view
- **Task:** Show only the website (no browser chrome) while the agent navigates between real sites.
- **Steps:** Ran Chrome in kiosk/full-screen mode on a virtual display, with the agent using Ctrl+L to type addresses.
- **Expected vs. actual:** Expected the address bar shortcut to work. Actual: kiosk mode has no address bar, and a fresh Chrome profile on the server took about 20 seconds to paint its first page.
- **Severity:** Medium
- **Workaround:** Navigated through Chrome's local DevTools port, and made the server wait for the real page title instead of a fixed delay.
- **Suggestion:** For hosted browser sessions (such as AgentCore Browser), document a recommended pattern for embedding a view-only live screen in a front end.
