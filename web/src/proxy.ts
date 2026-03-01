import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Routes that don't require authentication
const PUBLIC_PATHS = [
  "/auth/",             // /auth/reset-password, /auth/callback, etc.
  "/api/auth/",         // POST /api/auth/register, forgot-password, update-password
  "/api/subscribers/",  // unsubscribe / resubscribe (token-authenticated)
  "/api/internal/",     // cron endpoints — secured by CRON_SECRET header
  "/verify-email",
  "/forgot-password",
  "/login",
  "/register",
  "/unsubscribe",
];

// Routes that authenticated but not-yet-onboarded users may access
const ONBOARDING_EXEMPT_PATHS = [
  "/onboarding",
  "/api/users/",
];

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some((p) =>
    p.endsWith("/") ? pathname.startsWith(p) : pathname === p
  );
}

function isOnboardingExempt(pathname: string): boolean {
  return ONBOARDING_EXEMPT_PATHS.some((p) =>
    p.endsWith("/") ? pathname.startsWith(p) : pathname === p
  );
}

export async function proxy(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // Important: getUser() refreshes session tokens and sets updated cookies.
  // Do NOT use getSession() here — it doesn't validate JWTs server-side.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  // Protected route + not logged in → redirect to /login
  if (!user && !isPublicPath(pathname)) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.searchParams.set("redirectTo", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Logged in but onboarding not completed → redirect to /onboarding
  if (user && !isPublicPath(pathname) && !isOnboardingExempt(pathname)) {
    if (user.user_metadata?.onboarding_completed !== true) {
      const onboardingUrl = request.nextUrl.clone();
      onboardingUrl.pathname = "/onboarding";
      onboardingUrl.search = "";
      return NextResponse.redirect(onboardingUrl);
    }
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    // Exclude Next.js internals and static assets
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
