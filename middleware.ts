// Session-refreshing middleware (@supabase/ssr docs pattern).
// Refreshes the auth token on every matched request and keeps the request
// and response cookies in sync so Server Components see a fresh session.
// Uses ONLY the public URL + anon key — never the service-role key.
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  });

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
          supabaseResponse = NextResponse.next({
            request,
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // IMPORTANT (per @supabase/ssr docs): do not run code between creating the
  // client and calling auth.getUser(). This call refreshes an expired session.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  // Paths reachable without a session. Everything else redirects to /signin.
  // (/_next, /favicon.ico and static assets are already excluded by the
  // matcher below and never reach this code.)
  // (No /api/auth route exists yet; pre-authorize it here only when it does.)
  const isPublicPath = pathname === "/signin";

  if (!user && !isPublicPath) {
    // Unauthenticated: send to sign-in, remembering where they were headed.
    const url = request.nextUrl.clone();
    url.pathname = "/signin";
    url.search = "";
    url.searchParams.set(
      "next",
      request.nextUrl.pathname + request.nextUrl.search
    );
    return withSupabaseCookies(NextResponse.redirect(url), supabaseResponse);
  }

  if (user && pathname === "/signin") {
    // Already signed in: the sign-in page is not for them. The workspace
    // now lives at "/" (P2 shell; /documents itself redirects there too).
    const url = request.nextUrl.clone();
    url.pathname = "/";
    url.search = "";
    return withSupabaseCookies(NextResponse.redirect(url), supabaseResponse);
  }

  // IMPORTANT (per @supabase/ssr docs): always return the supabaseResponse
  // object as-is so the refreshed cookies reach the browser.
  return supabaseResponse;
}

// When redirecting we must still carry the refreshed session cookies from
// supabaseResponse, or the browser and server fall out of sync.
function withSupabaseCookies(
  redirectResponse: NextResponse,
  supabaseResponse: NextResponse
) {
  supabaseResponse.cookies.getAll().forEach((cookie) => {
    redirectResponse.cookies.set(cookie);
  });
  return redirectResponse;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - common image/asset extensions
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
