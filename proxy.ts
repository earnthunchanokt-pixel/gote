import { NextResponse, type NextRequest } from "next/server";
import { ACCESS_COOKIE_NAME, getExpectedAccessToken, isAccessProtectionEnabled } from "@/lib/access";

function isPublicPath(pathname: string) {
  return pathname === "/login" || pathname.startsWith("/_next") || pathname.startsWith("/api/auth") || pathname === "/favicon.ico";
}

export async function proxy(request: NextRequest) {
  if (!isAccessProtectionEnabled()) {
    return NextResponse.next();
  }

  const { pathname, search } = request.nextUrl;
  if (isPublicPath(pathname)) {
    return NextResponse.next();
  }

  const cookieToken = request.cookies.get(ACCESS_COOKIE_NAME)?.value ?? "";
  const expectedToken = await getExpectedAccessToken();

  if (cookieToken && expectedToken && cookieToken === expectedToken) {
    return NextResponse.next();
  }

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
  }

  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set("next", `${pathname}${search}`);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/((?!.*\\.).*)"],
};
