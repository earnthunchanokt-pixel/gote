"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

export function LoginScreen(props: { nextPath: string }) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError("");

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { message?: string } | null;
        setError(body?.message ?? "เข้าสู่ระบบไม่สำเร็จ");
        setSubmitting(false);
        return;
      }

      router.replace(props.nextPath || "/");
      router.refresh();
    } catch {
      setError("เชื่อมต่อไม่สำเร็จ ลองใหม่อีกครั้ง");
      setSubmitting(false);
    }
  }

  return (
    <main className="relative min-h-screen overflow-hidden px-4 py-10">
      <div className="mx-auto flex min-h-[calc(100vh-5rem)] w-full max-w-5xl items-center">
        <section className="glass-panel relative grid w-full overflow-hidden rounded-[28px] lg:grid-cols-[1.1fr_0.9fr]">
          <div className="relative p-6 sm:p-8 lg:p-10">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.82),transparent_34%),radial-gradient(circle_at_bottom_right,rgba(240,215,255,0.56),transparent_36%)]" />
            <div className="relative">
              <p className="text-[12px] font-semibold uppercase tracking-[0.24em] text-[var(--muted)]">Protected Storefront</p>
              <h1 className="mt-3 max-w-xl text-[32px] font-extrabold leading-tight text-[var(--text)] sm:text-[42px]">
                ใส่รหัสผ่านก่อนเข้าใช้งานระบบขายหน้าร้าน
              </h1>
              <p className="mt-4 max-w-lg text-[15px] leading-7 text-[var(--text-body)]">
                หน้านี้ช่วยล็อกการเข้าถึงระบบขายและสรุปยอด ให้เปิดใช้งานได้ทั้งในเครื่องและบน Vercel ด้วยรหัสผ่านชุดเดียว
              </p>

              <div className="mt-8 grid gap-3 sm:grid-cols-3">
                <div className="rounded-2xl border border-[var(--line)] bg-white/65 p-4">
                  <p className="text-[12px] font-semibold text-[var(--muted)]">เหมาะกับ</p>
                  <p className="mt-2 text-[14px] font-bold text-[var(--text)]">ล็อกเว็บก่อนใช้งาน</p>
                </div>
                <div className="rounded-2xl border border-[var(--line)] bg-white/65 p-4">
                  <p className="text-[12px] font-semibold text-[var(--muted)]">ใช้งานง่าย</p>
                  <p className="mt-2 text-[14px] font-bold text-[var(--text)]">ใส่รหัสครั้งเดียว</p>
                </div>
                <div className="rounded-2xl border border-[var(--line)] bg-white/65 p-4">
                  <p className="text-[12px] font-semibold text-[var(--muted)]">รองรับ</p>
                  <p className="mt-2 text-[14px] font-bold text-[var(--text)]">มือถือและเดสก์ท็อป</p>
                </div>
              </div>
            </div>
          </div>

          <div className="border-t border-[var(--line)] bg-white/58 p-6 sm:p-8 lg:border-t-0 lg:border-l lg:p-10">
            <div className="mx-auto max-w-md">
              <p className="text-[12px] font-semibold text-[var(--muted)]">เข้าสู่ระบบ</p>
              <h2 className="mt-2 text-[28px] font-extrabold text-[var(--text)]">ใส่รหัสผ่าน</h2>
              <p className="mt-2 text-[14px] leading-6 text-[var(--muted)]">หลังจากใส่รหัสผ่านถูกต้อง ระบบจะพาไปหน้าใช้งานหลักทันที</p>

              <form onSubmit={handleSubmit} className="mt-6 space-y-4">
                <label className="block">
                  <span className="mb-2 block text-[13px] font-semibold text-[var(--text-body)]">รหัสผ่าน</span>
                  <input
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    type="password"
                    autoComplete="current-password"
                    placeholder="กรอกรหัสผ่าน"
                    className="w-full rounded-2xl border border-[var(--line)] bg-white px-4 py-4 text-[15px] text-[var(--text)] outline-none transition focus:border-fuchsia-300 focus:ring-4 focus:ring-fuchsia-100"
                  />
                </label>

                {error ? (
                  <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-[13px] font-semibold text-rose-700">
                    {error}
                  </div>
                ) : null}

                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full rounded-2xl bg-[linear-gradient(135deg,#f472b6,#a78bfa,#60a5fa)] px-4 py-4 text-[15px] font-bold text-white shadow-[0_18px_45px_rgba(167,139,250,0.35)] transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {submitting ? "กำลังตรวจสอบ..." : "เข้าสู่ระบบ"}
                </button>
              </form>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
