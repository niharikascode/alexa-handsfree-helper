"""Local speech-to-text worker for the Hands-Free Helper (faster-whisper, CPU).

Reads one audio file path per line on stdin, writes one JSON line per request on
stdout: {"text": ...} or {"error": ...}. The model stays loaded between requests.
Model size via STT_MODEL (default base.en; small.en is more accurate but slower).
"""
import json
import os
import subprocess
import sys

import numpy as np
from faster_whisper import WhisperModel


def load_audio(path):
    """Decode any browser recording (webm/ogg/mp4) to 16 kHz mono float32 with ffmpeg."""
    pcm = subprocess.run(["ffmpeg", "-nostdin", "-loglevel", "error", "-i", path,
                          "-f", "f32le", "-ac", "1", "-ar", "16000", "-"],
                         capture_output=True, check=True).stdout
    return np.frombuffer(pcm, np.float32)

model = WhisperModel(os.environ.get("STT_MODEL", "base.en"), device="cpu", compute_type="int8")
# Bias decoding toward the words this demo hears most.
PROMPT = ("Alexa, what side effects should I watch for with my Lisinopril? Can I borrow a large-print copy of Lessons in Chemistry from the library? "
          "My daughter sent my medication list. Use it to find me the cheapest Medicare drug plan for next year. The first one. Yes, go ahead. No.")
print(json.dumps({"ready": True}), flush=True)

for line in sys.stdin:
    path = line.strip()
    if not path:
        continue
    try:
        segments, _ = model.transcribe(load_audio(path), language="en", beam_size=1, vad_filter=True,
                                       initial_prompt=PROMPT, condition_on_previous_text=False)
        text = " ".join(s.text.strip() for s in segments).strip()
        print(json.dumps({"text": text}), flush=True)
    except Exception as e:  # keep the worker alive for the next request
        print(json.dumps({"error": str(e)}), flush=True)
