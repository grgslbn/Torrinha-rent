"use client";

import { useCallback, useEffect, useState } from "react";
import type { Tenant, Spot } from "./types";
import TenantDetailPanel from "./components/tenant-detail-panel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { tenantStatusVariant } from "@/lib/status-colors";

const INPUT =
  "w-full px-2 py-1.5 border border-t-border rounded-[var(--t-radius-md)] text-sm text-t-text bg-t-surface focus:outline-none focus:ring-1 focus:ring-t-accent";

function sLabel(s: { number: number; label: string | null }): string {
  return s.label || String(s.number);
}

function sLabels(t: Tenant): string {
  if (t.torrinha_spots?.length > 0) {
    return t.torrinha_spots
      .slice()
      .sort((a, b) => a.number - b.number)
      .map(sLabel)
      .join(", ");
  }
  if (t.future_assignments?.length > 0) {
    const first = t.future_assignments[0];
    const s = first.torrinha_spots;
    return `→ ${s ? sLabel(s) : "?"} from ${first.start_date}`;
  }
  return "—";
}

export default function TenantsClient() {
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [allSpots, setAllSpots] = useState<Spot[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTenantId, setSelectedTenantId] = useState<string | null>(null);
  const [showAddPanel, setShowAddPanel] = useState(false);
  const [error, setError] = useState("");

  const fetchData = useCallback(async () => {
    const [tr, sr] = await Promise.all([fetch("/api/tenants"), fetch("/api/spots")]);
    if (tr.ok) setTenants(await tr.json());
    if (sr.ok) setAllSpots(await sr.json());
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const selectedTenant = tenants.find((t) => t.id === selectedTenantId) ?? null;
  const activeTenants = tenants.filter((t) => t.status === "active");
  const upcomingTenants = tenants.filter((t) => t.status === "upcoming");
  const inactiveTenants = tenants.filter((t) => t.status === "inactive");

  if (loading) {
    return <div className="text-center py-12 text-t-text-muted">Loading tenants…</div>;
  }

  const tableHead = (
    <tr>
      <th className="px-4 py-3 text-left text-[10px] font-semibold text-t-text-muted uppercase tracking-widest">Status</th>
      <th className="px-4 py-3 text-left text-[10px] font-semibold text-t-text-muted uppercase tracking-widest">Spot</th>
      <th className="px-4 py-3 text-left text-[10px] font-semibold text-t-text-muted uppercase tracking-widest">Name</th>
      <th className="px-4 py-3 text-left text-[10px] font-semibold text-t-text-muted uppercase tracking-widest">Rent</th>
      <th className="px-4 py-3 text-left text-[10px] font-semibold text-t-text-muted uppercase tracking-widest">Start</th>
      <th className="px-4 py-3 text-left text-[10px] font-semibold text-t-text-muted uppercase tracking-widest">Lang</th>
    </tr>
  );

  function renderRow(t: Tenant) {
    const isSelected = t.id === selectedTenantId;
    return (
      <tr
        key={t.id}
        onClick={() => { setSelectedTenantId(t.id); setShowAddPanel(false); }}
        className={`cursor-pointer transition-colors ${
          isSelected ? "bg-t-accent-light" : "hover:bg-t-bg"
        } ${t.status === "inactive" ? "opacity-50" : ""}`}
      >
        <td className="px-4 py-3 text-sm">
          <Badge variant={tenantStatusVariant(t.status)}>
            {t.status.charAt(0).toUpperCase() + t.status.slice(1)}
          </Badge>
        </td>
        <td className="px-4 py-3 text-sm font-medium text-t-text">{sLabels(t)}</td>
        <td className="px-4 py-3 text-sm text-t-text">{t.name}</td>
        <td className="px-4 py-3 text-sm text-t-text-muted">€{t.rent_eur}</td>
        <td className="px-4 py-3 text-sm text-t-text-muted tabular-nums">{t.start_date}</td>
        <td className="px-4 py-3 text-sm text-t-text-muted uppercase">{t.language}</td>
      </tr>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-t-text">
          Tenants{" "}
          <span className="text-base font-normal text-t-text-muted">
            {activeTenants.length} active
            {upcomingTenants.length > 0 && ` · ${upcomingTenants.length} upcoming`}
          </span>
        </h1>
        <Button onClick={() => { setShowAddPanel(true); setSelectedTenantId(null); }}>
          Add Tenant
        </Button>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 text-red-700 rounded-[var(--t-radius-md)] text-sm flex justify-between">
          {error}
          <button onClick={() => setError("")} className="text-red-400 hover:text-red-600">✕</button>
        </div>
      )}

      {/* Active + Upcoming table */}
      <div className="bg-t-surface border border-t-border rounded-[var(--t-radius-lg)] overflow-x-auto">
        <table className="min-w-full divide-y divide-t-border">
          <thead className="bg-t-bg">{tableHead}</thead>
          <tbody className="divide-y divide-t-border">
            {activeTenants.length === 0 && upcomingTenants.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-sm text-t-text-muted">
                  No tenants. Click &quot;Add Tenant&quot; to get started.
                </td>
              </tr>
            ) : (
              [...activeTenants, ...upcomingTenants].map(renderRow)
            )}
          </tbody>
        </table>
      </div>

      {/* Inactive */}
      {inactiveTenants.length > 0 && (
        <div className="mt-8">
          <h2 className="text-[10px] font-semibold text-t-text-muted uppercase tracking-widest mb-3">Inactive</h2>
          <div className="bg-t-surface border border-t-border rounded-[var(--t-radius-lg)] overflow-x-auto">
            <table className="min-w-full divide-y divide-t-border">
              <thead className="bg-t-bg">{tableHead}</thead>
              <tbody className="divide-y divide-t-border">
                {inactiveTenants.map(renderRow)}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Detail panel */}
      {selectedTenant && (
        <TenantDetailPanel
          tenant={selectedTenant}
          allSpots={allSpots}
          onClose={() => setSelectedTenantId(null)}
          onRefresh={fetchData}
        />
      )}

      {/* Add tenant panel */}
      {showAddPanel && (
        <AddTenantPanel
          allSpots={allSpots}
          onSuccess={() => { setShowAddPanel(false); fetchData(); }}
          onError={setError}
          onClose={() => setShowAddPanel(false)}
        />
      )}
    </div>
  );
}

// ─── Add Tenant Panel ───

function AddTenantPanel({
  allSpots,
  onSuccess,
  onError,
  onClose,
}: {
  allSpots: Spot[];
  onSuccess: () => void;
  onError: (msg: string) => void;
  onClose: () => void;
}) {
  const today = new Date().toISOString().split("T")[0];
  const [visible, setVisible] = useState(false);
  const [form, setForm] = useState({
    spot_ids: [] as string[],
    name: "", email: "", phone: "",
    language: "pt", rent_eur: "",
    payment_due_day: "1", start_date: today, notes: "",
  });
  const [departingEndDates, setDepartingEndDates] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const id = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(id);
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const isUpcoming = form.start_date > today;

  function setField(field: string, value: string) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  function toggleSpot(spotId: string) {
    setForm((f) => {
      const already = f.spot_ids.includes(spotId);
      if (already) setDepartingEndDates((d) => { const n = { ...d }; delete n[spotId]; return n; });
      return {
        ...f,
        spot_ids: already ? f.spot_ids.filter((id) => id !== spotId) : [...f.spot_ids, spotId],
      };
    });
  }

  const selectedOccupiedSpots = allSpots.filter(
    (s) => form.spot_ids.includes(s.id) && s.occupied
  );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    for (const [spotId, endDate] of Object.entries(departingEndDates)) {
      if (endDate && endDate >= form.start_date) {
        const spot = allSpots.find((s) => s.id === spotId);
        onError(`${spot?.tenant_name ?? "Departing tenant"}'s last day must be before ${form.start_date}`);
        return;
      }
    }
    setSaving(true);
    const res = await fetch("/api/tenants", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, departing_end_dates: departingEndDates }),
    });
    if (res.ok) onSuccess();
    else {
      const data = await res.json().catch(() => ({}));
      onError(data.error || "Failed to add tenant");
    }
    setSaving(false);
  }

  return (
    <>
      <div className="fixed inset-0 bg-black/30 z-40" onClick={onClose} />
      <div
        className={`fixed inset-y-0 right-0 w-full sm:max-w-lg bg-t-surface border-l border-t-border z-50 overflow-y-auto
          transition-transform duration-200 ${visible ? "translate-x-0" : "translate-x-full"}`}
      >
        {/* Top bar */}
        <div className="sticky top-0 bg-t-surface border-b border-t-border px-5 py-3 flex items-center justify-between z-10">
          <button onClick={onClose} className="text-sm text-t-text-muted hover:text-t-text transition-colors">← Back</button>
          <span className="text-sm font-medium text-t-text-muted">New Tenant</span>
        </div>

        <form onSubmit={handleSubmit} className="px-5 py-5 space-y-7">
          {/* Header */}
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-2xl font-bold tracking-tight text-t-text">New Tenant</h2>
              {isUpcoming && (
                <Badge variant="info">Upcoming</Badge>
              )}
            </div>
            <p className="text-sm text-t-text-muted mt-0.5">Starts {form.start_date}</p>
          </div>

          {/* Spot selector */}
          <div>
            <h3 className="text-[10px] font-semibold text-t-text-muted uppercase tracking-widest mb-3 pb-2 border-b border-t-border">
              Spot <span className="font-normal normal-case opacity-60">(optional)</span>
            </h3>
            <div className="flex flex-wrap gap-2">
              {allSpots.map((s) => {
                const selected = form.spot_ids.includes(s.id);
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => toggleSpot(s.id)}
                    title={s.occupied ? `Currently: ${s.tenant_name ?? "occupied"}` : "Vacant"}
                    className={`px-3 py-1.5 rounded-[var(--t-radius-sm)] text-sm font-medium border transition-colors ${
                      selected
                        ? "bg-t-accent text-white border-t-accent"
                        : s.occupied
                        ? "bg-amber-50 text-amber-700 border-amber-300 hover:border-amber-500"
                        : "bg-t-surface text-t-text border-t-border hover:border-t-border-strong"
                    }`}
                  >
                    {sLabel(s)}
                    {s.occupied && !selected && (
                      <span className="ml-1 text-xs opacity-70">({s.tenant_name})</span>
                    )}
                  </button>
                );
              })}
            </div>

            {selectedOccupiedSpots.map((s) => (
              <div key={s.id} className="flex items-center gap-3 p-3 bg-amber-50 border border-amber-200 rounded-[var(--t-radius-md)] mt-2">
                <div className="flex-1 text-sm text-amber-800">
                  <span className="font-medium">Spot {sLabel(s)}</span> occupied by{" "}
                  <span className="font-medium">{s.tenant_name}</span>. Last day?
                </div>
                <input
                  type="date"
                  value={departingEndDates[s.id] ?? ""}
                  max={
                    form.start_date
                      ? new Date(new Date(form.start_date).getTime() - 86400000).toISOString().split("T")[0]
                      : undefined
                  }
                  onChange={(e) => setDepartingEndDates((d) => ({ ...d, [s.id]: e.target.value }))}
                  required
                  className="px-2 py-1 border border-amber-300 rounded-[var(--t-radius-sm)] text-sm bg-white"
                />
              </div>
            ))}
          </div>

          {/* Details */}
          <div>
            <h3 className="text-[10px] font-semibold text-t-text-muted uppercase tracking-widest mb-3 pb-2 border-b border-t-border">
              Details
            </h3>
            <div className="space-y-3">
              <AddFieldRow label="Name *">
                <input type="text" value={form.name} onChange={(e) => setField("name", e.target.value)} required className={INPUT} />
              </AddFieldRow>
              <AddFieldRow label="Email *">
                <input type="email" value={form.email} onChange={(e) => setField("email", e.target.value)} required className={INPUT} />
              </AddFieldRow>
              <AddFieldRow label="Phone">
                <input type="tel" value={form.phone} onChange={(e) => setField("phone", e.target.value)} className={INPUT} />
              </AddFieldRow>
              <AddFieldRow label="Rent *">
                <div className="flex items-center gap-1">
                  <span className="text-t-text-muted text-sm">€</span>
                  <input
                    type="number" step="0.01" min="0"
                    value={form.rent_eur}
                    onChange={(e) => setField("rent_eur", e.target.value)}
                    required
                    className="w-28 px-2 py-1.5 border border-t-border rounded-[var(--t-radius-md)] text-sm text-t-text bg-t-surface focus:outline-none focus:ring-1 focus:ring-t-accent"
                  />
                </div>
              </AddFieldRow>
              <AddFieldRow label="Due day">
                <select
                  value={form.payment_due_day}
                  onChange={(e) => setField("payment_due_day", e.target.value)}
                  className="w-24 px-2 py-1.5 border border-t-border rounded-[var(--t-radius-md)] text-sm text-t-text bg-t-surface"
                >
                  {Array.from({ length: 28 }, (_, i) => i + 1).map((d) => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </select>
              </AddFieldRow>
              <AddFieldRow label={isUpcoming ? "Start * (future)" : "Start *"}>
                <input
                  type="date"
                  value={form.start_date}
                  onChange={(e) => setField("start_date", e.target.value)}
                  required
                  className="w-40 px-2 py-1.5 border border-t-border rounded-[var(--t-radius-md)] text-sm text-t-text bg-t-surface"
                />
              </AddFieldRow>
              <AddFieldRow label="Language">
                <select
                  value={form.language}
                  onChange={(e) => setField("language", e.target.value)}
                  className="w-32 px-2 py-1.5 border border-t-border rounded-[var(--t-radius-md)] text-sm text-t-text bg-t-surface"
                >
                  <option value="pt">Português</option>
                  <option value="en">English</option>
                </select>
              </AddFieldRow>
              <AddFieldRow label="Notes">
                <textarea
                  value={form.notes}
                  onChange={(e) => setField("notes", e.target.value)}
                  rows={2} placeholder="—"
                  className={`${INPUT} resize-none`}
                />
              </AddFieldRow>
            </div>
          </div>

          <div className="pb-4">
            <Button type="submit" disabled={saving} size="lg" className="w-full">
              {saving ? "Creating…" : isUpcoming ? "Create Upcoming Tenant" : "Create Tenant"}
            </Button>
          </div>
        </form>
      </div>
    </>
  );
}

function AddFieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3">
      <label className="w-24 shrink-0 text-sm text-t-text-muted pt-1.5">{label}</label>
      <div className="flex-1 min-w-0">{children}</div>
    </div>
  );
}
