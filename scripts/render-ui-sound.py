"""Original stereo UI press. Standard library only; no noise or external recordings."""
import math
from pathlib import Path
import struct
import wave

RATE = 48000
DURATION = 0.19


def voice(t):
    if t <= 0:
        return 0.0
    attack = 1 - math.exp(-((t / 0.010) ** 2))
    phase = 2 * math.pi * (380 * t + 18 * 0.020 * (1 - math.exp(-t / 0.020)))
    body = math.sin(phase)
    warmth = 0.22 * math.sin(phase * 0.5) * math.exp(-t / 0.050)
    return attack * (body * math.exp(-t / 0.038) + warmth)


frames = []
for i in range(round(RATE * DURATION)):
    t = i / RATE
    fade = min(1.0, (DURATION - t) / 0.025)
    left = (voice(t) + 0.14 * voice(t - 0.013) + 0.06 * voice(t - 0.031)) * fade
    right = (voice(t) + 0.14 * voice(t - 0.019) + 0.06 * voice(t - 0.037)) * fade
    frames.append((left, right))

peak = max(abs(sample) for frame in frames for sample in frame)
pcm = b"".join(struct.pack("<hh", *(round(sample / peak * 0.28 * 32767) for sample in frame)) for frame in frames)
target = Path(__file__).resolve().parent.parent / "public/audio/ui-press-v3.wav"
target.parent.mkdir(parents=True, exist_ok=True)
with wave.open(str(target), "wb") as wav:
    wav.setnchannels(2)
    wav.setsampwidth(2)
    wav.setframerate(RATE)
    wav.writeframes(pcm)
print(f"Rendered {target.name}: {DURATION * 1000:.0f} ms, stereo PCM, {len(pcm)} bytes")
