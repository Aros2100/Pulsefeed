export type AppVersion = "v1" | "v2";

export function getActiveVersion(cookieValue?: string): AppVersion {
  if (cookieValue === "v2") return "v2";
  return "v1";
}
