import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";

function hash(value: string) {
  return createHash("sha256").update(value).digest();
}

export function proxy(request: NextRequest) {
  if (process.env.NODE_ENV !== "production") return NextResponse.next();

  const password = process.env.APP_ACCESS_PASSWORD?.trim() || process.env.APP_SUMMARY_PASSWORD?.trim();
  if (!password) {
    return new NextResponse("ยังไม่ได้ตั้งรหัสผ่านเข้า Gote POS", { status: 503 });
  }

  const credentials = /^Basic ([A-Za-z0-9+/]+=*)$/i.exec(request.headers.get("authorization") ?? "");
  if (credentials) {
    const decoded = Buffer.from(credentials[1], "base64").toString("utf8");
    const separator = decoded.indexOf(":");
    if (separator >= 0 && timingSafeEqual(hash(decoded.slice(separator + 1)), hash(password))) {
      return NextResponse.next();
    }
  }

  return new NextResponse("กรุณาใส่รหัสผ่านเข้า Gote POS", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="Gote POS", charset="UTF-8"', "Cache-Control": "no-store" },
  });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
