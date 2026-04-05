"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Building2, Eye, EyeOff, Loader2, Lock, Mail } from "lucide-react"

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  useEffect(() => {
    // Already logged in — go straight to dashboard
    if (typeof window !== "undefined" && localStorage.getItem("ev-token")) {
      router.replace("/")
    }
  }, [router])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError("")
    setLoading(true)
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000"}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.detail ?? "Invalid email or password")
        return
      }
      localStorage.setItem("ev-token", data.access_token)
      localStorage.setItem("ev-user", JSON.stringify(data.user))
      router.replace("/")
    } catch {
      setError("Could not reach the backend. Make sure it is running.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#F8FAFC] flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="flex items-center justify-center gap-3 mb-8">
          <div className="w-10 h-10 rounded-xl bg-[#0F172A] flex items-center justify-center">
            <Building2 className="w-5 h-5 text-white" />
          </div>
          <span className="text-xl font-bold text-[#0F172A] tracking-tight">Estate Vantage</span>
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-[0_4px_24px_rgba(15,23,42,0.08)] p-8">
          <h1 className="text-2xl font-bold text-[#0F172A] mb-1">Welcome back</h1>
          <p className="text-sm text-[#64748B] mb-7">Sign in to access your analytics dashboard</p>

          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Email */}
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wide text-[#64748B] mb-1.5">
                Email
              </label>
              <div className="flex items-center rounded-lg border border-gray-200 bg-[#F8FAFC] overflow-hidden focus-within:border-[#0F172A] focus-within:ring-1 focus-within:ring-[#0F172A] transition-all">
                <Mail className="w-4 h-4 text-[#94A3B8] ml-3 shrink-0" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  required
                  autoComplete="email"
                  className="flex-1 bg-transparent px-3 py-2.5 text-sm text-[#0F172A] outline-none"
                />
              </div>
            </div>

            {/* Password */}
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wide text-[#64748B] mb-1.5">
                Password
              </label>
              <div className="flex items-center rounded-lg border border-gray-200 bg-[#F8FAFC] overflow-hidden focus-within:border-[#0F172A] focus-within:ring-1 focus-within:ring-[#0F172A] transition-all">
                <Lock className="w-4 h-4 text-[#94A3B8] ml-3 shrink-0" />
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  autoComplete="current-password"
                  className="flex-1 bg-transparent px-3 py-2.5 text-sm text-[#0F172A] outline-none"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="px-3 text-[#94A3B8] hover:text-[#64748B] transition-colors"
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Error */}
            {error && (
              <div className="rounded-lg bg-red-50 border border-red-100 px-4 py-3 text-sm text-red-700">
                {error}
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 rounded-lg bg-[#0F172A] text-white text-sm font-semibold py-2.5 hover:bg-[#1E293B] transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {loading ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Signing in…</>
              ) : (
                "Sign in"
              )}
            </button>
          </form>
        </div>

        <p className="text-center text-xs text-[#94A3B8] mt-6">
          Contact your administrator to create an account.
        </p>
      </div>
    </div>
  )
}
