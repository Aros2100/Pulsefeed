"use client";

import { useState, useEffect } from "react";

function getNextRun03UTC(): string {
  const now = new Date();
  const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 3, 0, 0, 0));
  if (next <= now) next.setUTCDate(next.getUTCDate() + 1);
  return next.toLocaleString("da-DK", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit", timeZone: "UTC",
  }) + " UTC";
}

export function NextCronRun() {
  const [nextRun, setNextRun] = useState<string>("");
  useEffect(() => { setNextRun(getNextRun03UTC()); }, []);
  if (!nextRun) return null;
  return (
    <span style={{ fontWeight: 600, color: "#5a6a85" }}>{nextRun}</span>
  );
}
