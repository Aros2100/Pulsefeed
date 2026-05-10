export function fmtDuration(sec: number | null | undefined): string {
  if (sec === null || sec === undefined) return "—";
  if (sec < 60)    return `${sec}s`;
  if (sec < 3600)  return `${Math.floor(sec / 60)}m`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}h ${Math.floor((sec % 3600) / 60)}m`;
  return `${Math.floor(sec / 86400)}d ${Math.floor((sec % 86400) / 3600)}h`;
}

export function fmtTime(iso: string): string {
  return iso.slice(11, 16) + " UTC";
}

export function fmtDate(iso: string): string {
  const d = new Date(iso + "T00:00:00Z");
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
}

type LatencyDetails = {
  submit_to_end_sec: number;
  ingest_lag_sec: number;
  total_sec: number;
  flag: string | null;
};

export function latencyLine(latency: LatencyDetails | null | undefined): string {
  if (!latency) return "";
  const total = fmtDuration(latency.total_sec);
  if (!latency.flag) return `total ${total}`;
  const sub  = fmtDuration(latency.submit_to_end_sec);
  const ing  = fmtDuration(latency.ingest_lag_sec);
  const note = latency.flag === "slow_total"       ? "slow"
             : latency.flag === "very_slow_total"  ? "very slow"
             : latency.flag === "critical_total"   ? "critical"
             : latency.flag;
  return `submit→end ${sub} · ingest ${ing} · total ${total} (${note})`;
}

export function nullStr(v: unknown): string {
  return v === null || v === undefined ? "—" : String(v);
}
