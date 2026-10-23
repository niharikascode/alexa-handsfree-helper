---
name: computer-use
description: Operate the VNC desktop GUI by screenshot, click, type, key and scroll. Use for any task that must be done by looking at and interacting with the screen.
allowed-tools: Bash, Read
---

Toolkit: `${CLAUDE_SKILL_DIR}/scripts/cua <command>` (screen is 1920x1080 on display :37;
the desktop must be running - see the vnc-desktop skill).

    cua shot                    screenshot; prints a path - Read it to see the screen
    cua click|rightclick|doubleclick X Y
    cua drag X1 Y1 X2 Y2
    cua type <text>             type into the focused field
    cua key <key>...            Return, Tab, ctrl+a, BackSpace, alt+Left ...
    cua clear                   select-all + delete
    cua scroll up|down [n]
    cua goto <url>              browser address bar of the current window
    cua wait <seconds>

Loop: `cua shot` -> Read the image -> one action -> `cua shot` again to confirm it
worked. Never act on coordinates from an old screenshot after the screen changed.
Do the task through the GUI, not by shelling out to bypass it. Every action is
logged to `_run/agent/actions.log`, screenshots to `_run/agent/shots/`.
