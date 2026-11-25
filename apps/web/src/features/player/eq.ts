/**
 * 5-band equalizer on the Web Audio API. Elements are only routed through the graph once a non-flat
 * setting is used, so default playback never depends on it. Element volume/mute still apply upstream
 * of the graph, which keeps crossfade and the sleep-timer fade working.
 */
export const EQ_BANDS = [
  { freq: 60, label: '60 Hz', type: 'lowshelf' as const },
  { freq: 230, label: '230 Hz', type: 'peaking' as const },
  { freq: 910, label: '910 Hz', type: 'peaking' as const },
  { freq: 3600, label: '3.6 kHz', type: 'peaking' as const },
  { freq: 14000, label: '14 kHz', type: 'highshelf' as const },
];

export const EQ_PRESETS: Record<string, { label: string; gains: number[] }> = {
  flat: { label: 'Flat', gains: [0, 0, 0, 0, 0] },
  bass: { label: 'Bass Boost', gains: [7, 4, 0, 0, 0] },
  treble: { label: 'Treble Boost', gains: [0, 0, 0, 4, 7] },
  vocal: { label: 'Vocal', gains: [-2, 0, 4, 4, 1] },
  rock: { label: 'Rock', gains: [5, 2, -3, 2, 5] },
  electronic: { label: 'Electronic', gains: [6, 3, 0, 2, 5] },
  acoustic: { label: 'Acoustic', gains: [4, 3, 1, 2, 3] },
  night: { label: 'Late Night', gains: [3, 1, -1, -3, -4] },
};

export const isFlat = (gains: number[]) => gains.every((g) => g === 0);

let ctx: AudioContext | null = null;
let filters: BiquadFilterNode[] = [];
const routed = new WeakSet<HTMLMediaElement>();

function build(): boolean {
  if (ctx) return true;
  const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return false;
  try {
    ctx = new AC();
    filters = EQ_BANDS.map((b) => {
      const f = ctx!.createBiquadFilter();
      f.type = b.type; f.frequency.value = b.freq; f.Q.value = b.type === 'peaking' ? 1.1 : 0.7; f.gain.value = 0;
      return f;
    });
    filters.forEach((f, i) => { if (i) filters[i - 1].connect(f); });
    filters[filters.length - 1].connect(ctx.destination);
    return true;
  } catch { ctx = null; return false; }
}

/** Route the elements (once) and apply the gains. A flat curve before first use is a no-op. */
export function applyEq(elements: HTMLMediaElement[], gains: number[]) {
  if (!ctx && isFlat(gains)) return;
  if (!build() || !ctx) return;
  for (const el of elements) {
    if (routed.has(el)) continue;
    try { ctx.createMediaElementSource(el).connect(filters[0]); routed.add(el); } catch { /* already routed or unsupported */ }
  }
  filters.forEach((f, i) => f.gain.setTargetAtTime(gains[i] ?? 0, ctx!.currentTime, 0.03));
  void resumeEq();
}

/** Browsers keep a new AudioContext suspended until a user gesture; call from play paths. */
export function resumeEq(): Promise<void> {
  return ctx && ctx.state !== 'running' ? ctx.resume().catch(() => {}) : Promise.resolve();
}
