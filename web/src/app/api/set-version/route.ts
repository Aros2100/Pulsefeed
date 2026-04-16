import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const { version } = await req.json();
  const res = NextResponse.json({ ok: true });
  if (version === "v2") {
    res.cookies.set("pf-version", "v2", { path: "/", httpOnly: false });
  } else {
    res.cookies.delete("pf-version");
  }
  return res;
}
