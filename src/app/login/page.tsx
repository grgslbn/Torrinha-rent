"use client";

import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { useState } from "react";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setError(error.message);
      setLoading(false);
    } else {
      router.push("/admin");
      router.refresh();
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-t-bg">
      <div className="w-full max-w-sm">
        <h1 className="text-2xl font-bold tracking-tight text-center mb-8 text-t-text">
          Torrinha Parking
        </h1>
        <form
          onSubmit={handleLogin}
          className="bg-t-surface p-8 rounded-[var(--t-radius-lg)] border border-t-border"
        >
          {error && (
            <div className="mb-4 p-3 bg-red-50 text-red-700 rounded-[var(--t-radius-sm)] text-sm">
              {error}
            </div>
          )}
          <div className="mb-4">
            <label
              htmlFor="email"
              className="block text-sm font-medium text-t-text mb-1"
            >
              Email
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full px-3 py-2 border border-t-border rounded-[var(--t-radius-md)] text-t-text text-sm focus:outline-none focus:ring-1 focus:ring-t-accent"
            />
          </div>
          <div className="mb-6">
            <label
              htmlFor="password"
              className="block text-sm font-medium text-t-text mb-1"
            >
              Password
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full px-3 py-2 border border-t-border rounded-[var(--t-radius-md)] text-t-text text-sm focus:outline-none focus:ring-1 focus:ring-t-accent"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full py-2 px-4 bg-t-accent text-white rounded-[var(--t-radius-md)] hover:bg-t-accent-hover disabled:opacity-50 text-sm font-medium transition-colors"
          >
            {loading ? "Signing in…" : "Sign in"}
          </button>
        </form>
      </div>
    </div>
  );
}
