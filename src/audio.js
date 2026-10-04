// Short, original foley taps. No music, melodic cues, oscillators or audio timers.
let context, master, buffers;
let enabled = true;
let lastTap = -Infinity;
function init() {
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  if (!AudioContext) return false;
  context ||= new AudioContext();
  if (!master) {
    master = context.createGain();
    master.gain.value = 0.35;
    master.connect(context.destination);
    buffers = Array.from({ length: 4 }, (_, variant) => {
      const buffer = context.createBuffer(
        1,
        Math.ceil(context.sampleRate * 0.075),
        context.sampleRate,
      );
      const samples = buffer.getChannelData(0);
      let warm = 0,
        previous = 0;
      for (let i = 0; i < samples.length; i++) {
        const t = i / context.sampleRate;
        warm += 0.18 * (Math.random() * 2 - 1 - warm);
        const texture = warm - previous * 0.55;
        previous = warm;
        const attack = Math.min(1, t / 0.0015);
        const impact =
          Math.sin(2 * Math.PI * (165 + variant * 12) * t) *
          Math.exp(-t / 0.009);
        samples[i] =
          attack * (texture * Math.exp(-t / 0.012) * 0.8 + impact * 0.16);
      }
      return buffer;
    });
  }
  return true;
}
export function clickSound() {
  if (!enabled || document.hidden) return;
  try {
    if (!init()) return;
    if (context.state === "suspended") context.resume().catch(() => {});
    if (context.currentTime - lastTap < 0.025) return;
    lastTap = context.currentTime;
    const source = context.createBufferSource();
    source.buffer = buffers[Math.floor(Math.random() * buffers.length)];
    source.connect(master);
    source.onended = () => source.disconnect();
    source.start();
  } catch {
    /* Audio is optional, including on devices without Web Audio support. */
  }
}
export function setAudio(on) {
  enabled = on;
  if (master) master.gain.value = on ? 0.35 : 0;
}
export function installButtonSounds() {
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
