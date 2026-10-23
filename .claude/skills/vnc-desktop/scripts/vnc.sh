#!/bin/bash
# vnc.sh start|stop|status|shot [file]  - isolated XFCE desktop viewable over noVNC.
# Overrides via env: VNC_DISPLAY VNC_GEOM VNC_PORT VNC_WEB_PORT VNC_OPT
set -u
HERE="$(cd "$(dirname "$(readlink -f "$0")")" && pwd)"
ROOT="$(cd "$HERE/../../../.." && pwd)"          # the vnc-eval folder
: "${VNC_DISPLAY:=:37}" "${VNC_GEOM:=1920x1080x24}" "${VNC_PORT:=5937}" "${VNC_WEB_PORT:=8767}"
: "${VNC_OPT:=$ROOT/../envos-kit/.kit}"           # optional: noVNC + websockify venv
RUN="$ROOT/_run"; mkdir -p "$RUN/home" "$RUN/xdg"; chmod 700 "$RUN/xdg"
D="${VNC_DISPLAY#:}"
NOVNC="$VNC_OPT/novnc"; [ -d "$NOVNC" ] || NOVNC=/usr/share/novnc
PYW="$VNC_OPT/venv/bin/python"; [ -x "$PYW" ] || PYW=python3
up(){ (exec 3<>/dev/tcp/127.0.0.1/"$1") 2>/dev/null; }
die(){ echo "ERROR: $*" >&2; exit 1; }

case "${1:-}" in
start)
  [ -e "/tmp/.X11-unix/X$D" ] && die "$VNC_DISPLAY already running (vnc.sh stop first)"
  setsid nohup Xvfb "$VNC_DISPLAY" -screen 0 "$VNC_GEOM" -nolisten tcp >"$RUN/xvfb.log" 2>&1 &
  for _ in $(seq 40); do [ -e "/tmp/.X11-unix/X$D" ] && break; sleep .25; done
  [ -e "/tmp/.X11-unix/X$D" ] || die "Xvfb failed, see $RUN/xvfb.log"
  env DISPLAY="$VNC_DISPLAY" HOME="$RUN/home" XDG_RUNTIME_DIR="$RUN/xdg" XDG_CURRENT_DESKTOP=XFCE \
    setsid nohup dbus-run-session -- xfce4-session >"$RUN/xfce.log" 2>&1 &
  for _ in $(seq 60); do DISPLAY="$VNC_DISPLAY" xwininfo -root -children 2>/dev/null | grep -qi xfce4-panel && break; sleep .5; done
  LD_LIBRARY_PATH="$VNC_OPT/vnc/usr/lib/x86_64-linux-gnu" setsid nohup "$(command -v x11vnc || echo "$VNC_OPT/vnc/usr/bin/x11vnc")" \
    -display "$VNC_DISPLAY" -rfbport "$VNC_PORT" -localhost -forever -shared -nopw -noxdamage >"$RUN/x11vnc.log" 2>&1 &
  for _ in $(seq 40); do up "$VNC_PORT" && break; sleep .25; done; up "$VNC_PORT" || die "x11vnc failed"
  setsid nohup "$PYW" -m websockify --web "$NOVNC" 127.0.0.1:"$VNC_WEB_PORT" 127.0.0.1:"$VNC_PORT" >"$RUN/ws.log" 2>&1 &
  for _ in $(seq 40); do up "$VNC_WEB_PORT" && break; sleep .25; done; up "$VNC_WEB_PORT" || die "websockify failed"
  echo "up: DISPLAY=$VNC_DISPLAY"
  echo "watch: http://localhost:$VNC_WEB_PORT/vnc.html?autoconnect=1&resize=scale  (remote: ssh -L $VNC_WEB_PORT:localhost:$VNC_WEB_PORT <host>)" ;;
stop)
  pkill -f "websockify --web $NOVNC 127.0.0.1:$VNC_WEB_PORT"; pkill -f "x11vnc -display $VNC_DISPLAY"
  pkill -f "$RUN/home"; pkill -f "Xvfb $VNC_DISPLAY"; sleep 1
  rm -f "/tmp/.X11-unix/X$D" "/tmp/.X$D-lock"; echo stopped ;;
status)
  [ -e "/tmp/.X11-unix/X$D" ] && echo "display $VNC_DISPLAY up" || echo "display $VNC_DISPLAY down"
  up "$VNC_WEB_PORT" && echo "noVNC http://localhost:$VNC_WEB_PORT/vnc.html up" || echo "noVNC down" ;;
shot) DISPLAY="$VNC_DISPLAY" scrot -o "${2:-$RUN/shot.png}" && echo "${2:-$RUN/shot.png}" ;;
*) echo "usage: vnc.sh start|stop|status|shot [file]" ;;
esac
