let audioContext: AudioContext | null = null;

function getContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctx) return null;
  if (audioContext === null) {
    audioContext = new Ctx();
  }
  return audioContext;
}

export function playChime(): void {
  try {
    const ctx = getContext();
    if (!ctx) return;
    if (ctx.state === "suspended") {
      void ctx.resume();
    }

    const now = ctx.currentTime;
    const tones: { freq: number; start: number; duration: number }[] = [
      { freq: 880, start: 0, duration: 0.18 },
      { freq: 1320, start: 0.12, duration: 0.22 },
    ];

    for (const tone of tones) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = tone.freq;
      const startAt = now + tone.start;
      const endAt = startAt + tone.duration;
      gain.gain.setValueAtTime(0, startAt);
      gain.gain.linearRampToValueAtTime(0.18, startAt + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, endAt);
      osc.connect(gain).connect(ctx.destination);
      osc.start(startAt);
      osc.stop(endAt + 0.05);
    }
  } catch {
    // No-op on any error (no audio device, suspended without gesture, etc.)
  }
}
