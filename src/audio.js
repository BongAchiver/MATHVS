// Original procedural soundtrack. No external audio files or third-party samples.
let context,
  master,
  interval,
  step = 0;
let enabled = false;
function init() {
  context ||= new (window.AudioContext || window.webkitAudioContext)();
  if (!master) {
    master = context.createGain();
    master.gain.value = 0.22;
    master.connect(context.destination);
  }
  if (context.state === "suspended") context.resume();
}
function tone(frequency, duration, type = "sine", volume = 0.2, delay = 0) {
  if (!enabled || !context || context.state !== "running") return;
  const osc = context.createOscillator(),
    gain = context.createGain(),
    at = context.currentTime + delay;
  osc.type = type;
  osc.frequency.setValueAtTime(frequency, at);
  gain.gain.setValueAtTime(0, at);
  gain.gain.linearRampToValueAtTime(volume, at + 0.008);
  gain.gain.exponentialRampToValueAtTime(0.001, at + duration);
  osc.connect(gain);
  gain.connect(master);
  osc.start(at);
  osc.stop(at + duration + 0.02);
  osc.onended = () => {
    osc.disconnect();
    gain.disconnect();
  };
}
export function effect(name) {
  if (name === "click") tone(640, 0.045, "triangle", 0.22);
  if (name === "answer") {
    tone(520, 0.1, "sine", 0.3);
    tone(780, 0.15, "sine", 0.2, 0.08);
  }
  if (name === "start")
    [330, 440, 660].forEach((f, i) => tone(f, 0.25, "triangle", 0.4, i * 0.12));
  if (name === "finish")
    [261.63, 329.63, 392, 523.25].forEach((f, i) =>
      tone(f, 0.6, "triangle", 0.25, i * 0.11),
    );
  if (name === "tick") tone(980, 0.05, "sine", 0.1);
}
function beat() {
  if (document.hidden) return;
  const bass = [130.81, 130.81, 155.56, 116.54][Math.floor(step / 16) % 4];
  if (step % 4 === 0) {
    tone(55, 0.15, "sine", 0.5);
    tone(bass, 0.28, "triangle", 0.2);
  }
  if (step % 4 === 2) tone(180, 0.05, "triangle", 0.13);
  if (step % 2 === 0) tone(4000, 0.02, "sine", 0.03);
  const melody = [
    523.25, 0, 622.25, 0, 783.99, 698.46, 0, 622.25, 523.25, 0, 466.16, 0, 392,
    466.16, 0, 0,
  ];
  if (melody[step % 16]) tone(melody[step % 16], 0.2, "sine", 0.09);
  step++;
}
export function setAudio(on) {
  enabled = on;
  clearInterval(interval);
  interval = undefined;
  if (on) {
    init();
    effect("click");
    interval = setInterval(beat, 60000 / 112 / 4);
  } else if (context) context.suspend();
}
