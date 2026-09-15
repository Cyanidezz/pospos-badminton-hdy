"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const { error: signInError } = await createSupabaseBrowserClient().auth.signInWithPassword({ email, password });
    if (signInError) {
      setError("อีเมลหรือรหัสผ่านไม่ถูกต้อง");
      setBusy(false);
      return;
    }
    router.replace("/");
    router.refresh();
  }

  return <main className="login-page"><form className="login-card" onSubmit={submit}>
    <img className="login-logo" src="/wingpro-logo.jpeg" alt="Wingpro"/>
    <div><div className="eyebrow">WINGPRO STORE</div><h1>เข้าสู่ระบบ POS</h1><p>ใช้บัญชีที่เจ้าของร้านเพิ่มให้</p></div>
    <label className="field"><span>อีเมล</span><input type="email" autoComplete="username" required value={email} onChange={event=>setEmail(event.target.value)}/></label>
    <label className="field"><span>รหัสผ่าน</span><input type="password" autoComplete="current-password" required value={password} onChange={event=>setPassword(event.target.value)}/></label>
    {error&&<div className="notice">{error}</div>}
    <button disabled={busy}>{busy?"กำลังเข้าสู่ระบบ…":"เข้าสู่ระบบ"}</button>
  </form></main>;
}
