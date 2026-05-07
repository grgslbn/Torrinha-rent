"use client";

import { useEffect, useState } from "react";

type Settings = {
  owner_cc_enabled: boolean;
  owner_cc_email: string;
  owner_cc_mode: "cc" | "bcc";
  owner_cc2_enabled: boolean;
  owner_cc2_email: string;
  owner_cc2_mode: "cc" | "bcc";
};

export default function SettingsPage() {
  const [settings, setSettings] = useState<Settings>({
    owner_cc_enabled: false,
    owner_cc_email: "",
    owner_cc_mode: "bcc",
    owner_cc2_enabled: false,
    owner_cc2_email: "",
    owner_cc2_mode: "bcc",
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/admin/settings")
      .then((r) => r.json())
      .then((data) => {
        setSettings({
          owner_cc_enabled: data.owner_cc_enabled === true,
          owner_cc_email: typeof data.owner_cc_email === "string" ? data.owner_cc_email : "",
          owner_cc_mode: data.owner_cc_mode === "cc" ? "cc" : "bcc",
          owner_cc2_enabled: data.owner_cc2_enabled === true,
          owner_cc2_email: typeof data.owner_cc2_email === "string" ? data.owner_cc2_email : "",
          owner_cc2_mode: data.owner_cc2_mode === "cc" ? "cc" : "bcc",
        });
        setLoading(false);
      })
      .catch(() => {
        setError("Failed to load settings");
        setLoading(false);
      });
  }, []);

  async function handleSave() {
    setSaving(true);
    setSaved(false);
    setError(null);
    const res = await fetch("/api/admin/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        owner_cc_enabled: settings.owner_cc_enabled,
        owner_cc_email: settings.owner_cc_email,
        owner_cc_mode: settings.owner_cc_mode,
        owner_cc2_enabled: settings.owner_cc2_enabled,
        owner_cc2_email: settings.owner_cc2_email,
        owner_cc2_mode: settings.owner_cc2_mode,
      }),
    });
    setSaving(false);
    if (res.ok) {
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } else {
      const data = await res.json();
      setError(data.error || "Failed to save");
    }
  }

  if (loading) return <div className="p-6 text-sm text-t-text-muted">Loading…</div>;

  return (
    <div className="p-6 max-w-lg">
      <h1 className="text-xl font-semibold mb-6">Settings</h1>

      <section className="bg-t-surface border border-t-border rounded-[var(--t-radius-lg)] p-5 space-y-4">
        <h2 className="font-medium text-t-text">Owner CC on outbound emails</h2>
        <p className="text-sm text-t-text-muted">
          Adds the owner address as CC or BCC on every tenant-facing email. Skipped on
          owner-to-owner alerts.
        </p>

        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={settings.owner_cc_enabled}
            onChange={(e) =>
              setSettings((s) => ({ ...s, owner_cc_enabled: e.target.checked }))
            }
            className="w-4 h-4 accent-[var(--t-accent)]"
          />
          <span className="text-sm font-medium text-t-text-secondary">Enable CC</span>
        </label>

        <div>
          <label className="block text-sm font-medium text-t-text-secondary mb-1">
            Owner email
          </label>
          <input
            type="email"
            value={settings.owner_cc_email}
            onChange={(e) =>
              setSettings((s) => ({ ...s, owner_cc_email: e.target.value }))
            }
            placeholder="owner@example.com"
            disabled={!settings.owner_cc_enabled}
            className="w-full border border-t-border rounded-[var(--t-radius-sm)] px-3 py-1.5 text-sm disabled:bg-t-bg disabled:text-t-text-muted"
          />
        </div>

        <div>
          <p className="text-sm font-medium text-t-text-secondary mb-2">Mode</p>
          <div className="flex gap-6">
            {(["cc", "bcc"] as const).map((mode) => (
              <label key={mode} className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="cc_mode"
                  value={mode}
                  checked={settings.owner_cc_mode === mode}
                  onChange={() =>
                    setSettings((s) => ({ ...s, owner_cc_mode: mode }))
                  }
                  disabled={!settings.owner_cc_enabled}
                  className="accent-[var(--t-accent)]"
                />
                <span className="text-sm text-t-text-secondary uppercase">{mode}</span>
              </label>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-t-surface border border-t-border rounded-[var(--t-radius-lg)] p-5 space-y-4 mt-5">
        <h2 className="font-medium text-t-text">Additional CC on outbound emails</h2>
        <p className="text-sm text-t-text-muted">
          Adds a second address as CC or BCC on every tenant-facing email. Independent from the
          first CC. Both can be active simultaneously.
        </p>

        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={settings.owner_cc2_enabled}
            onChange={(e) =>
              setSettings((s) => ({ ...s, owner_cc2_enabled: e.target.checked }))
            }
            className="w-4 h-4 accent-[var(--t-accent)]"
          />
          <span className="text-sm font-medium text-t-text-secondary">Enable CC</span>
        </label>

        <div>
          <label className="block text-sm font-medium text-t-text-secondary mb-1">
            Email address
          </label>
          <input
            type="email"
            value={settings.owner_cc2_email}
            onChange={(e) =>
              setSettings((s) => ({ ...s, owner_cc2_email: e.target.value }))
            }
            placeholder="additional@example.com"
            disabled={!settings.owner_cc2_enabled}
            className="w-full border border-t-border rounded-[var(--t-radius-sm)] px-3 py-1.5 text-sm disabled:bg-t-bg disabled:text-t-text-muted"
          />
        </div>

        <div>
          <p className="text-sm font-medium text-t-text-secondary mb-2">Mode</p>
          <div className="flex gap-6">
            {(["cc", "bcc"] as const).map((mode) => (
              <label key={mode} className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="cc2_mode"
                  value={mode}
                  checked={settings.owner_cc2_mode === mode}
                  onChange={() =>
                    setSettings((s) => ({ ...s, owner_cc2_mode: mode }))
                  }
                  disabled={!settings.owner_cc2_enabled}
                  className="accent-[var(--t-accent)]"
                />
                <span className="text-sm text-t-text-secondary uppercase">{mode}</span>
              </label>
            ))}
          </div>
        </div>
      </section>

      <div className="mt-5 flex items-center gap-3">
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-4 py-2 bg-t-accent text-white text-sm rounded-[var(--t-radius-sm)] hover:bg-t-accent-hover disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save settings"}
        </button>
        {saved && <span className="text-sm text-green-600">Saved!</span>}
        {error && <span className="text-sm text-red-600">{error}</span>}
      </div>
    </div>
  );
}
