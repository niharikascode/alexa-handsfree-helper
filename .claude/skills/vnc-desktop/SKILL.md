---
name: vnc-desktop
description: Start, stop, or check the isolated VNC desktop (display :37) that the computer-use skill drives. Use before any GUI work, or when asked to set up / watch / tear down the desktop.
allowed-tools: Bash
---

Manage the desktop with `${CLAUDE_SKILL_DIR}/scripts/vnc.sh`:

- `start`  bring up Xvfb + XFCE + x11vnc + noVNC; prints the watch URL. Give that URL to the user.
- `status` check whether it is running. Always check before starting.
- `stop`   tear it down.
- `shot [file]` screenshot (prefer `cua shot` from the computer-use skill).

The desktop is private (own HOME under `_run/`). A human watching the noVNC URL
can also click; that is the same display you are controlling.
Apps are launched onto it with `DISPLAY=:37 <cmd> &` (e.g. `google-chrome --no-sandbox --test-type <url>`;
give a fresh Chrome profile ~20s to appear).
