"use client"

import { useEffect, useState, useCallback } from "react"
import { useRouter } from "next/navigation"
import {
  Building2, Users, UserPlus, ShieldCheck, UserX, UserCheck,
  KeyRound, Loader2, ArrowLeft, Eye, EyeOff,
} from "lucide-react"

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000"

function authHeaders() {
  const token = typeof window !== "undefined" ? localStorage.getItem("ev-token") : ""
  return { "Content-Type": "application/json", Authorization: `Bearer ${token}` }
}

interface User {
  id: number
  email: string
  name: string
  role: string
  created_at: string
  is_active: boolean
}

export default function AdminPage() {
  const router = useRouter()
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState<number | null>(null)
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null)

  // Create user form
  const [form, setForm] = useState({ name: "", email: "", password: "", role: "analyst" })
  const [formLoading, setFormLoading] = useState(false)
  const [formError, setFormError] = useState("")
  const [showPassword, setShowPassword] = useState(false)

  // Reset password
  const [resetTarget, setResetTarget] = useState<number | null>(null)
  const [resetPw, setResetPw] = useState("")
  const [resetLoading, setResetLoading] = useState(false)

  const showToast = (msg: string, ok = true) => {
    setToast({ msg, ok })
    setTimeout(() => setToast(null), 3000)
  }

  const fetchUsers = useCallback(async () => {
    const res = await fetch(`${API}/auth/users`, { headers: authHeaders() })
    if (res.status === 401) { router.replace("/login"); return }
    if (res.status === 403) { router.replace("/"); return }
    setUsers(await res.json())
    setLoading(false)
  }, [router])

  useEffect(() => {
    const user = JSON.parse(localStorage.getItem("ev-user") || "null")
    if (!user) { router.replace("/login"); return }
    if (user.role !== "admin") { router.replace("/"); return }
    fetchUsers()
  }, [fetchUsers, router])

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setFormError("")
    setFormLoading(true)
    try {
      const res = await fetch(`${API}/auth/register`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify(form),
      })
      const data = await res.json()
      if (!res.ok) {
        const detail = data.detail
        const msg = Array.isArray(detail)
          ? detail.map((e: { msg?: string }) => e.msg ?? JSON.stringify(e)).join(", ")
          : typeof detail === "string" ? detail : "Failed to create user"
        setFormError(msg)
        return
      }
      setForm({ name: "", email: "", password: "", role: "analyst" })
      showToast("User created successfully")
      fetchUsers()
    } catch {
      setFormError("Could not reach backend")
    } finally {
      setFormLoading(false)
    }
  }

  async function handleDeactivate(id: number) {
    setActionLoading(id)
    await fetch(`${API}/auth/users/${id}`, { method: "DELETE", headers: authHeaders() })
    showToast("User deactivated")
    fetchUsers()
    setActionLoading(null)
  }

  async function handleReactivate(id: number) {
    setActionLoading(id)
    await fetch(`${API}/auth/users/${id}/reactivate`, { method: "PATCH", headers: authHeaders() })
    showToast("User reactivated")
    fetchUsers()
    setActionLoading(null)
  }

  async function handleResetPassword(id: number) {
    if (!resetPw || resetPw.length < 8) return
    setResetLoading(true)
    const res = await fetch(`${API}/auth/users/${id}/password`, {
      method: "PATCH",
      headers: authHeaders(),
      body: JSON.stringify({ new_password: resetPw }),
    })
    setResetLoading(false)
    if (res.ok) {
      showToast("Password updated")
      setResetTarget(null)
      setResetPw("")
    } else {
      showToast("Failed to update password", false)
    }
  }

  const activeUsers   = users.filter(u => u.is_active)
  const inactiveUsers = users.filter(u => !u.is_active)

  return (
    <div className="min-h-screen bg-[#F8FAFC]">
      {/* Header */}
      <header className="bg-white border-b border-gray-100 px-6 py-4 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-[#0F172A] flex items-center justify-center">
            <Building2 className="w-4 h-4 text-white" />
          </div>
          <span className="font-bold text-[#0F172A]">VantagePoint</span>
          <span className="text-[#94A3B8] mx-1">/</span>
          <span className="text-sm font-semibold text-[#334155] flex items-center gap-1.5">
            <ShieldCheck className="w-4 h-4" /> Admin Panel
          </span>
        </div>
        <button
          onClick={() => router.push("/")}
          className="flex items-center gap-1.5 text-sm text-[#64748B] hover:text-[#0F172A] transition-colors"
        >
          <ArrowLeft className="w-4 h-4" /> Back to Dashboard
        </button>
      </header>

      <div className="max-w-5xl mx-auto px-6 py-10 space-y-8">

        {/* Stats row */}
        <div className="grid grid-cols-3 gap-4">
          {[
            { label: "Total Users", value: users.length, icon: Users, color: "#1D4ED8", bg: "#EFF6FF" },
            { label: "Active", value: activeUsers.length, icon: UserCheck, color: "#166534", bg: "#f0fdf4" },
            { label: "Inactive", value: inactiveUsers.length, icon: UserX, color: "#991B1B", bg: "#fef2f2" },
          ].map(({ label, value, icon: Icon, color, bg }) => (
            <div key={label} className="rounded-xl border border-gray-100 bg-white p-5 flex items-center gap-4 shadow-sm">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: bg }}>
                <Icon className="w-5 h-5" style={{ color }} />
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-[#64748B]">{label}</p>
                <p className="text-2xl font-bold text-[#0F172A]">{value}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-8 items-start">

          {/* User list */}
          <section className="rounded-xl border border-gray-100 bg-white shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center gap-2">
              <Users className="w-4 h-4 text-[#334155]" />
              <h2 className="font-semibold text-[#0F172A]">Team Members</h2>
            </div>

            {loading ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="w-5 h-5 animate-spin text-[#94A3B8]" />
              </div>
            ) : users.length === 0 ? (
              <p className="text-sm text-[#94A3B8] text-center py-12">No users yet.</p>
            ) : (
              <div className="divide-y divide-gray-50">
                {users.map((u) => (
                  <div key={u.id} className={`px-6 py-4 flex items-center justify-between gap-4 ${!u.is_active ? "opacity-50" : ""}`}>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-[#0F172A] text-sm truncate">{u.name}</p>
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${
                          u.role === "admin" ? "bg-[#EFF6FF] text-[#1D4ED8]" : "bg-[#F1F5F9] text-[#475569]"
                        }`}>
                          {u.role}
                        </span>
                        {!u.is_active && (
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-red-50 text-red-500 font-semibold">
                            inactive
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-[#94A3B8] truncate">{u.email}</p>
                      <p className="text-[10px] text-[#CBD5E1] mt-0.5">
                        Created {new Date(u.created_at).toLocaleDateString()}
                      </p>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      {/* Reset password */}
                      {u.is_active && (
                        <button
                          onClick={() => { setResetTarget(resetTarget === u.id ? null : u.id); setResetPw("") }}
                          className="p-1.5 rounded-lg text-[#94A3B8] hover:text-[#334155] hover:bg-gray-100 transition-colors"
                          title="Reset password"
                        >
                          <KeyRound className="w-4 h-4" />
                        </button>
                      )}

                      {/* Deactivate / reactivate */}
                      {u.is_active ? (
                        <button
                          onClick={() => handleDeactivate(u.id)}
                          disabled={actionLoading === u.id}
                          className="p-1.5 rounded-lg text-[#94A3B8] hover:text-red-500 hover:bg-red-50 transition-colors disabled:opacity-40"
                          title="Deactivate"
                        >
                          {actionLoading === u.id
                            ? <Loader2 className="w-4 h-4 animate-spin" />
                            : <UserX className="w-4 h-4" />}
                        </button>
                      ) : (
                        <button
                          onClick={() => handleReactivate(u.id)}
                          disabled={actionLoading === u.id}
                          className="p-1.5 rounded-lg text-[#94A3B8] hover:text-green-600 hover:bg-green-50 transition-colors disabled:opacity-40"
                          title="Reactivate"
                        >
                          {actionLoading === u.id
                            ? <Loader2 className="w-4 h-4 animate-spin" />
                            : <UserCheck className="w-4 h-4" />}
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Inline password reset form */}
            {resetTarget !== null && (
              <div className="px-6 py-4 border-t border-dashed border-gray-200 bg-[#FAFCFF]">
                <p className="text-xs font-semibold text-[#334155] mb-2">
                  Set new password for {users.find(u => u.id === resetTarget)?.name}
                </p>
                <div className="flex gap-2">
                  <input
                    type="password"
                    value={resetPw}
                    onChange={(e) => setResetPw(e.target.value)}
                    placeholder="New password (min 8 chars)"
                    className="flex-1 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-[#0F172A]"
                  />
                  <button
                    onClick={() => handleResetPassword(resetTarget)}
                    disabled={resetLoading || resetPw.length < 6}
                    className="px-4 py-2 rounded-lg bg-[#0F172A] text-white text-sm font-semibold hover:bg-[#1E293B] disabled:opacity-50 transition-colors"
                  >
                    {resetLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save"}
                  </button>
                  <button
                    onClick={() => { setResetTarget(null); setResetPw("") }}
                    className="px-3 py-2 rounded-lg border border-gray-200 text-sm text-[#64748B] hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </section>

          {/* Create user form */}
          <section className="rounded-xl border border-gray-100 bg-white shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center gap-2">
              <UserPlus className="w-4 h-4 text-[#334155]" />
              <h2 className="font-semibold text-[#0F172A]">Create Account</h2>
            </div>
            <form onSubmit={handleCreate} className="p-6 space-y-4">
              {[
                { label: "Full Name", key: "name", type: "text", placeholder: "Jane Smith" },
                { label: "Email", key: "email", type: "email", placeholder: "jane@company.com" },
              ].map(({ label, key, type, placeholder }) => (
                <div key={key}>
                  <label className="block text-xs font-semibold uppercase tracking-wide text-[#64748B] mb-1.5">{label}</label>
                  <input
                    type={type}
                    value={form[key as keyof typeof form]}
                    onChange={(e) => setForm(f => ({ ...f, [key]: e.target.value }))}
                    placeholder={placeholder}
                    required
                    className="w-full rounded-lg border border-gray-200 bg-[#F8FAFC] px-3 py-2.5 text-sm text-[#0F172A] outline-none focus:border-[#0F172A] focus:ring-1 focus:ring-[#0F172A] transition-all"
                  />
                </div>
              ))}

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wide text-[#64748B] mb-1.5">Password</label>
                <div className="flex items-center rounded-lg border border-gray-200 bg-[#F8FAFC] overflow-hidden focus-within:border-[#0F172A] focus-within:ring-1 focus-within:ring-[#0F172A] transition-all">
                  <input
                    type={showPassword ? "text" : "password"}
                    value={form.password}
                    onChange={(e) => setForm(f => ({ ...f, password: e.target.value }))}
                    placeholder="Min 8 characters"
                    required
                    minLength={8}
                    className="flex-1 bg-transparent px-3 py-2.5 text-sm text-[#0F172A] outline-none"
                  />
                  <button type="button" onClick={() => setShowPassword(v => !v)}
                    className="px-3 text-[#94A3B8] hover:text-[#64748B]" tabIndex={-1}>
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wide text-[#64748B] mb-1.5">Role</label>
                <select
                  value={form.role}
                  onChange={(e) => setForm(f => ({ ...f, role: e.target.value }))}
                  className="w-full rounded-lg border border-gray-200 bg-[#F8FAFC] px-3 py-2.5 text-sm text-[#0F172A] outline-none focus:border-[#0F172A]"
                >
                  <option value="analyst">Analyst</option>
                  <option value="admin">Admin</option>
                </select>
              </div>

              {formError && (
                <div className="rounded-lg bg-red-50 border border-red-100 px-3 py-2.5 text-sm text-red-700">
                  {formError}
                </div>
              )}

              <button
                type="submit"
                disabled={formLoading}
                className="w-full flex items-center justify-center gap-2 rounded-lg bg-[#0F172A] text-white text-sm font-semibold py-2.5 hover:bg-[#1E293B] transition-colors disabled:opacity-60"
              >
                {formLoading
                  ? <><Loader2 className="w-4 h-4 animate-spin" /> Creatingâ€¦</>
                  : <><UserPlus className="w-4 h-4" /> Create Account</>}
              </button>
            </form>
          </section>
        </div>
      </div>

      {/* Toast */}
      {toast && (
        <div className={`fixed bottom-6 right-6 px-4 py-3 rounded-xl text-sm font-semibold shadow-lg text-white transition-all ${
          toast.ok ? "bg-[#166534]" : "bg-[#991B1B]"
        }`}>
          {toast.msg}
        </div>
      )}
    </div>
  )
}
