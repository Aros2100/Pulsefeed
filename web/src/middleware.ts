import { NextResponse, type NextRequest } from "next/server";

export function middleware(request: NextRequest) {
  // Allow cron routes through without auth
  if (request.nextUrl.pathname.startsWith("/api/cron/")) {
    return NextResponse.next();
  }
}

export const config = {
  matcher: ["/api/cron/:path*"],
};
