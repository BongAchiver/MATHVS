// Original rendered stereo UI sound: no noise synthesis or soundtrack.
const SOUND_URL = "/audio/ui-press-v2.wav";
let context, master, bufferPromise;
let enabled = true;
let lastTap = -Infinity;
function init() {
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  if (!AudioContext) return false;
  context ||= new AudioContext();
  if (!master) {
    master = context.createGain();
    master.gain.value = enabled ? 0.55 : 0;
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
  if (master) master.gain.value = on ? 0.55 : 0;
}
export function installButtonSounds() {
  // Decode ahead of the first click; remain silent until a gesture.
  try {
    init();
  } catch {
    /* Audio is optional. */
  }
  const onClick = (event) => {
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
  return () => document.removeEventListener("click", onClick, true);
}
