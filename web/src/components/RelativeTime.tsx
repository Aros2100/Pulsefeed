"use client";

export default function RelativeTime({ iso }: { iso: string }) {
  const diff = Date.now() - new Date(iso).getTime();
  const m    = Math.floor(diff / 60000);
  if (m < 1)   return <>Just now</>;
  if (m < 60)  return <>{m}m ago</>;
  const h = Math.floor(m / 60);
  if (h < 24)  return <>{h}h ago</>;
  const d = Math.floor(h / 24);
  if (d < 30)  return <>{d}d ago</>;
  return <>{new Date(iso).toLocaleDateString("da-DK", { day: "2-digit", month: "short" })}</>;
}
