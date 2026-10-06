// Soft interface effects and an opt-in, externally licensed recording.
const SOUND_URL = "/audio/ui-press-v3.wav";
let context, master, bufferPromise;
let enabled = true;
let lastTap = -Infinity;
function init() {
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  if (!AudioContext) return false;
  context ||= new AudioContext();
  if (!master) {
    master = context.createGain();
    master.gain.value = enabled ? 0.32 : 0;
    master.connect(context.destination);
  }
  if (!bufferPromise) {
    bufferPromise = fetch(SOUND_URL)
      .then((response) => {
        if (!response.ok) throw new Error("UI sound unavailable");
        return response.arrayBuffer();
      })
      .then((bytes) => context.decodeAudioData(bytes))
      .catch(() => {
        bufferPromise = undefined;
        return null;
      });
  }
  return true;
}
export function clickSound() {
  if (!enabled || document.hidden) return;
  try {
    if (!init()) return;
    // Resume synchronously in the gesture, including on mobile Safari.
    if (context.state === "suspended") context.resume().catch(() => {});
    const clickedAt = performance.now();
    if (clickedAt - lastTap < 25) return;
    lastTap = clickedAt;
    bufferPromise
      .then((buffer) => {
        // Never replay stale clicks after a slow download or muting.
        if (
          !buffer ||
          !enabled ||
          document.hidden ||
          performance.now() - clickedAt > 250
        )
          return;
        const source = context.createBufferSource();
        source.buffer = buffer;
        source.connect(master);
        source.onended = () => source.disconnect();
        source.start();
      })
      .catch(() => {});
  } catch {
    /* Audio is optional on unsupported devices. */
  }
}
export function setAudio(on) {
  enabled = on;
  if (master)
    master.gain.setTargetAtTime(on ? 0.32 : 0, context.currentTime, 0.015);
}
let music,
  musicEnabled = false,
  musicUnlocked = false,
  musicInGame = false;
let musicFade;
function updateMusic() {
  if (!musicEnabled || document.hidden) {
    cancelAnimationFrame(musicFade);
    music?.pause();
    return;
  }
  if (!musicUnlocked) return;
  if (!music) {
    music = new Audio("/audio/3-am-west-end.mp3");
    music.loop = true;
    music.preload = "none";
    music.volume = 0;
  }
  if (music.paused) {
    music.volume = 0;
    music.play().catch(() => {
      /* A later gesture can retry playback. */
    });
  }
  cancelAnimationFrame(musicFade);
  const start = performance.now(),
    initial = music.volume;
  const target = musicInGame ? 0.045 : 0.12;
  const fade = (now) => {
    if (!musicEnabled || document.hidden) return;
    const progress = Math.max(0, Math.min(1, (now - start) / 700));
    music.volume = initial + (target - initial) * progress;
    if (progress < 1) musicFade = requestAnimationFrame(fade);
  };
  musicFade = requestAnimationFrame(fade);
}
export function setMusic(on) {
  musicEnabled = on;
  updateMusic();
}
export function setMusicFocus(inGame) {
  musicInGame = inGame;
  updateMusic();
}
export function installButtonSounds() {
  // Decode ahead of the first click; remain silent until a gesture.
  try {
    init();
  } catch {
    /* Audio is optional. */
  }
  const onClick = (event) => {
    if (event.isTrusted) {
      musicUnlocked = true;
      if (musicEnabled && (!music || music.paused)) updateMusic();
    }
    const button =
      event.target instanceof Element ? event.target.closest("button") : null;
    if (
      button &&
      !button.disabled &&
      button.getAttribute("aria-disabled") !== "true"
    )
      clickSound();
  };
  document.addEventListener("click", onClick, true);
  document.addEventListener("visibilitychange", updateMusic);
  return () => {
    document.removeEventListener("click", onClick, true);
    document.removeEventListener("visibilitychange", updateMusic);
    cancelAnimationFrame(musicFade);
    music?.pause();
  };
}
