import type { AttentionVerdict } from "@/src/entities/pomodoro-session";

export type LeisureBucket = { exe: string; sec: number };

export type AttentionDetection = {
  verdict: AttentionVerdict;
  leisureSec: number;
  activeSec: number;
  ratio: number;
  leisureBuckets: LeisureBucket[];
  reason: string | null;
};

export type ComputeAttentionInput = {
  processBuckets: Record<string, number>;
  idleSec: number;
  totalSec: number;
  leisureProcesses: string[];
};

const LEISURE_THRESHOLD = 0.5;
const MIXED_THRESHOLD = 0.15;

function formatDuration(sec: number): string {
  const total = Math.max(0, Math.floor(sec));
  const m = Math.floor(total / 60);
  const s = total % 60;
  if (m === 0) return `${s}s`;
  if (s === 0) return `${m}m`;
  return `${m}m ${s}s`;
}

export function computeAttentionVerdict(input: ComputeAttentionInput): AttentionDetection {
  const { processBuckets, idleSec, totalSec, leisureProcesses } = input;

  const activeSec = Math.max(0, totalSec - idleSec);
  const leisureSet = new Set(leisureProcesses.map((p) => p.toLowerCase()));

  const leisureBuckets: LeisureBucket[] = Object.entries(processBuckets)
    .filter(([exe]) => leisureSet.has(exe.toLowerCase()))
    .map(([exe, sec]) => ({ exe, sec }))
    .sort((a, b) => b.sec - a.sec);

  const leisureSec = leisureBuckets.reduce((sum, b) => sum + b.sec, 0);
  const ratio = activeSec > 0 ? leisureSec / activeSec : 0;

  let verdict: AttentionVerdict;
  if (ratio > LEISURE_THRESHOLD) verdict = "leisure";
  else if (ratio > MIXED_THRESHOLD) verdict = "mixed";
  else verdict = "focus";

  const pct = Math.round(ratio * 100);
  let reason: string | null = null;
  if (verdict === "leisure" && leisureBuckets.length > 0) {
    const top = leisureBuckets[0];
    reason = `Detected leisure: ${formatDuration(top.sec)} in ${top.exe} (${pct}% of active time)`;
  } else if (verdict === "mixed") {
    reason = `Mixed focus: ${formatDuration(leisureSec)} leisure (${pct}% of active time)`;
  }

  return { verdict, leisureSec, activeSec, ratio, leisureBuckets, reason };
}

export function isLeisureProcess(exeName: string, leisureProcesses: string[]): boolean {
  const lower = exeName.toLowerCase();
  return leisureProcesses.some((p) => p.toLowerCase() === lower);
}
