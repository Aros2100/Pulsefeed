import type { BoxStatus } from "../_lib/types";

export const STATUS_ICON: Record<BoxStatus, string> = {
  ok:              "✅",
  expected_silent: "🟡",
  warn:            "⚠️",
  error:           "❌",
  missing:         "—",
};

export const STATUS_BG: Record<BoxStatus, string> = {
  ok:              "#f0fdf4",
  expected_silent: "#fffbeb",
  warn:            "#fef3c7",
  error:           "#fef2f2",
  missing:         "#f9fafb",
};

export const STATUS_BORDER: Record<BoxStatus, string> = {
  ok:              "#86efac",
  expected_silent: "#fcd34d",
  warn:            "#f59e0b",
  error:           "#f87171",
  missing:         "#d1d5db",
};

export const STATUS_TEXT: Record<BoxStatus, string> = {
  ok:              "#14532d",
  expected_silent: "#78350f",
  warn:            "#78350f",
  error:           "#7f1d1d",
  missing:         "#6b7280",
};
