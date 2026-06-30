"use client"

import { useState, useEffect } from "react"
import { Eye, EyeOff, Loader2, Lock, Mail, X } from "lucide-react"

interface LoginModalProps {
  show: boolean
  onClose: () => void
  onLoginSuccess: () => void
}

export function LoginModal({ show, onClose, onLoginSuccess }: LoginModalProps) {
  // mounted keeps the DOM node alive during the exit transition
  const [mounted, setMounted]   = useState(false)
  const [visible, setVisible]   = useState(false)

  const [email,    setEmail]    = useState("")
  const [password, setPassword] = useState("")
  const [showPw,   setShowPw]   = useState(false)
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState("")

  useEffect(() => {
    if (show) {
      setMounted(true)
      // double rAF guarantees element is painted before transition fires
      requestAnimationFrame(() => requestAnimationFrame(() => setVisible(true)))
    } else {
      setVisible(false)
      const t = setTimeout(() => {
        setMounted(false)
        setEmail("")
        setPassword("")
        setError("")
      }, 380)
      return () => clearTimeout(t)
    }
  }, [show])

  function dismiss() {
    setVisible(false)
    setTimeout(onClose, 380)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError("")
    setLoading(true)
    try {
      const base = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000"
      const res  = await fetch(`${base}/auth/login`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ email, password }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.detail ?? "Invalid email or password")
        return
      }
      localStorage.setItem("ev-token", data.access_token)
      localStorage.setItem("ev-user",  JSON.stringify(data.user))
      // fade out, then hand off to parent
      setVisible(false)
      setTimeout(onLoginSuccess, 380)
    } catch {
      setError("Could not reach the server. Please try again.")
    } finally {
      setLoading(false)
    }
  }

  if (!mounted) return null

  const T = "0.38s cubic-bezier(0.22, 1, 0.36, 1)"

  return (
    <>
      {/* ── Frosted-glass backdrop ───────────────────────────── */}
      <div
        onClick={dismiss}
        style={{
          position:          "fixed",
          inset:             0,
          zIndex:            100,
          backdropFilter:    visible ? "blur(18px) brightness(88%)" : "blur(0px) brightness(100%)",
          WebkitBackdropFilter: visible ? "blur(18px) brightness(88%)" : "blur(0px) brightness(100%)",
          background:        visible ? "rgba(6, 8, 18, 0.28)" : "rgba(6, 8, 18, 0)",
          transition:        `backdrop-filter ${T}, -webkit-backdrop-filter ${T}, background ${T}`,
        }}
      />

      {/* ── Modal positioner ─────────────────────────────────── */}
      <div
        style={{
          position:       "fixed",
          inset:          0,
          zIndex:         101,
          display:        "flex",
          alignItems:     "center",
          justifyContent: "center",
          padding:        "1rem",
          pointerEvents:  "none",
        }}
      >
        {/* ── Glass card ───────────────────────────────────────── */}
        <div
          style={{
            position:      "relative",
            width:         "100%",
            maxWidth:      "420px",
            background:    "rgba(255, 255, 255, 0.82)",
            border:        "1px solid rgba(255, 255, 255, 0.58)",
            borderRadius:  "1.4rem",
            boxShadow:     [
              "0 40px 80px rgba(0, 0, 0, 0.30)",
              "0 8px 20px  rgba(0, 0, 0, 0.10)",
              "inset 0 1px 0 rgba(255,255,255,0.95)",
            ].join(", "),
            padding:       "2.4rem 2.25rem 2rem",
            pointerEvents: "all",
            opacity:       visible ? 1 : 0,
            transform:     visible ? "scale(1) translateY(0)" : "scale(0.95) translateY(12px)",
            transition:    `opacity ${T}, transform ${T}`,
          }}
        >
          {/* Close */}
          <button
            onClick={dismiss}
            aria-label="Close"
            style={{
              position:       "absolute",
              top:            "1rem",
              right:          "1rem",
              width:          "2rem",
              height:         "2rem",
              borderRadius:   "50%",
              border:         "1px solid rgba(0,0,0,0.09)",
              background:     "rgba(0,0,0,0.04)",
              display:        "flex",
              alignItems:     "center",
              justifyContent: "center",
              cursor:         "pointer",
              color:          "#64748B",
              transition:     "background 0.15s",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(0,0,0,0.09)")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "rgba(0,0,0,0.04)")}
          >
            <X size={14} />
          </button>

          {/* Logo */}
          <div style={{ display: "flex", justifyContent: "center", marginBottom: "1.75rem" }}>
            <img src="/logo-vantagepoint.png" alt="VantagePoint"
              style={{ height: "2rem", width: "auto", objectFit: "contain" }} />
          </div>

          {/* Heading */}
          <h2 style={{ fontSize: "1.35rem", fontWeight: 700, color: "#0F172A",
            letterSpacing: "-0.025em", marginBottom: "0.3rem" }}>
            Welcome back
          </h2>
          <p style={{ fontSize: "0.875rem", color: "#64748B", marginBottom: "1.75rem" }}>
            Sign in to access your analytics dashboard
          </p>

          <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>

            {/* Email */}
            <div>
              <label style={{ display: "block", fontSize: "0.68rem", fontWeight: 600,
                textTransform: "uppercase", letterSpacing: "0.1em", color: "#64748B", marginBottom: "0.4rem" }}>
                Email
              </label>
              <div style={{ display: "flex", alignItems: "center", borderRadius: "0.65rem",
                border: "1px solid rgba(0,0,0,0.11)", background: "rgba(248,250,252,0.75)", overflow: "hidden" }}>
                <Mail size={14} style={{ color: "#94A3B8", marginLeft: "0.8rem", flexShrink: 0 }} />
                <input
                  type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com" required autoComplete="email"
                  style={{ flex: 1, background: "transparent", padding: "0.65rem 0.75rem",
                    fontSize: "0.875rem", color: "#0F172A", outline: "none", border: "none" }}
                />
              </div>
            </div>

            {/* Password */}
            <div>
              <label style={{ display: "block", fontSize: "0.68rem", fontWeight: 600,
                textTransform: "uppercase", letterSpacing: "0.1em", color: "#64748B", marginBottom: "0.4rem" }}>
                Password
              </label>
              <div style={{ display: "flex", alignItems: "center", borderRadius: "0.65rem",
                border: "1px solid rgba(0,0,0,0.11)", background: "rgba(248,250,252,0.75)", overflow: "hidden" }}>
                <Lock size={14} style={{ color: "#94A3B8", marginLeft: "0.8rem", flexShrink: 0 }} />
                <input
                  type={showPw ? "text" : "password"} value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••" required autoComplete="current-password"
                  style={{ flex: 1, background: "transparent", padding: "0.65rem 0.75rem",
                    fontSize: "0.875rem", color: "#0F172A", outline: "none", border: "none" }}
                />
                <button type="button" tabIndex={-1} onClick={() => setShowPw((v) => !v)}
                  style={{ padding: "0 0.75rem", background: "none", border: "none",
                    cursor: "pointer", color: "#94A3B8" }}>
                  {showPw ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
            </div>

            {/* Error */}
            {error && (
              <div style={{ borderRadius: "0.6rem", background: "rgba(254,226,226,0.85)",
                border: "1px solid rgba(252,165,165,0.45)", padding: "0.7rem 1rem",
                fontSize: "0.8rem", color: "#B91C1C" }}>
                {error}
              </div>
            )}

            {/* Submit */}
            <button
              type="submit" disabled={loading}
              style={{
                width: "100%", display: "flex", alignItems: "center", justifyContent: "center",
                gap: "0.5rem", borderRadius: "0.65rem", background: "#0F172A", color: "#fff",
                fontSize: "0.875rem", fontWeight: 600, padding: "0.78rem",
                border: "none", cursor: loading ? "not-allowed" : "pointer",
                opacity: loading ? 0.65 : 1, marginTop: "0.2rem",
                transition: "background 0.15s, opacity 0.15s",
              }}
              onMouseEnter={(e) => { if (!loading) e.currentTarget.style.background = "#1E293B" }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "#0F172A" }}
            >
              {loading
                ? <><Loader2 size={14} className="animate-spin" /> Signing in…</>
                : "Sign in"}
            </button>
          </form>

          <p style={{ textAlign: "center", fontSize: "0.7rem", color: "#94A3B8", marginTop: "1.4rem" }}>
            Contact your administrator to create an account.
          </p>
        </div>
      </div>
    </>
  )
}
