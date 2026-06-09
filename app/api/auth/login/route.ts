import { NextResponse } from "next/server";
import { ACCESS_COOKIE_NAME, createAccessToken, getAccessPassword, isAccessProtectionEnabled } from "@/lib/access";

export async function POST(request: Request) {
  if (!isAccessProtectionEnabled()) {
    return NextResponse.json({ success: true, bypassed: true });
  }

  const body = (await request.json().catch(() => null)) as { password?: string } | null;
  const password = body?.password?.trim() ?? "";
  const expectedPassword = getAccessPassword();

  if (!password || password !== expectedPassword) {
    return NextResponse.json({ success: false, message: "รหัสผ่านไม่ถูกต้อง" }, { status: 401 });
  }

  const token = await createAccessToken(expectedPassword);
  const response = NextResponse.json({ success: true });
  response.cookies.set({
    name: ACCESS_COOKIE_NAME,
    value: token,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 14,
  });
  return response;
}
