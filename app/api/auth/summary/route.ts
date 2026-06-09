import { NextResponse } from "next/server";
import {
  SUMMARY_COOKIE_NAME,
  createSummaryToken,
  getExpectedSummaryToken,
  getSummaryPassword,
  isSummaryProtectionEnabled,
} from "@/lib/access";

export async function GET(request: Request) {
  if (!isSummaryProtectionEnabled()) {
    return NextResponse.json({ enabled: false, unlocked: true });
  }

  const cookieHeader = request.headers.get("cookie") ?? "";
  const cookieValue =
    cookieHeader
      .split(";")
      .map((entry) => entry.trim())
      .find((entry) => entry.startsWith(`${SUMMARY_COOKIE_NAME}=`))
      ?.split("=")[1] ?? "";

  const expectedToken = await getExpectedSummaryToken();
  return NextResponse.json({
    enabled: true,
    unlocked: Boolean(cookieValue && expectedToken && cookieValue === expectedToken),
  });
}

export async function POST(request: Request) {
  if (!isSummaryProtectionEnabled()) {
    return NextResponse.json({ success: true, bypassed: true });
  }

  const body = (await request.json().catch(() => null)) as { password?: string } | null;
  const password = body?.password?.trim() ?? "";
  const expectedPassword = getSummaryPassword();

  if (!password || password !== expectedPassword) {
    return NextResponse.json({ success: false, message: "รหัสผ่านสรุปยอดไม่ถูกต้อง" }, { status: 401 });
  }

  const token = await createSummaryToken(expectedPassword);
  const response = NextResponse.json({ success: true, unlocked: true });
  response.cookies.set({
    name: SUMMARY_COOKIE_NAME,
    value: token,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 12,
  });
  return response;
}
