"use client";

import { useCallback, useEffect, useState } from "react";
import type { Tenant, Spot } from "./types";
import TenantDetailPanel from "./components/tenant-detail-panel";

const INPUT = "w-full px-2 py-1.5 border border-gray-200 rounded-md text-sm text-gray-900 focus:outline-none focus:ring-1 focus:ring-blue-500";

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

function StatusBadge({ status }: { status: Tenant["status"] }) {
  if (status === "active")
    return <span className="px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">Active</span>;
  if (status === "upcoming")
    return <span className="px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-700">Upcoming</span>;
  return <span className="px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-500">Inactive</span>;
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
    return <div className="text-center py-12 text-gray-500">Loading tenants…</div>;
  }

  const tableHead = (
    <tr>
      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Status</th>
      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Spot</th>
      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Name</th>
      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Rent</th>
      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Start</th>
      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Lang</th>
    </tr>
  );

  function renderRow(t: Tenant) {
    const isSelected = t.id === selectedTenantId;
    return (
      <tr
        key={t.id}
        onClick={() => { setSelectedTenantId(t.id); setShowAddPanel(false); }}
        className={`cursor-pointer transition-colors ${
          isSelected ? "bg-blue-50" : "hover:bg-gray-50"
        } ${t.status === "inactive" ? "opacity-50" : ""}`}
      >
        <td className="px-4 py-3 text-sm"><StatusBadge status={t.status} /></td>
        <td className="px-4 py-3 text-sm font-medium text-gray-900">{sLabels(t)}</td>
        <td className="px-4 py-3 text-sm text-gray-900">{t.name}</td>
        <td className="px-4 py-3 text-sm text-gray-500">€{t.rent_eur}</td>
        <td className="px-4 py-3 text-sm text-gray-500 tabular-nums">{t.start_date}</td>
        <td className="px-4 py-3 text-sm text-gray-400 uppercase">{t.language}</td>
      </tr>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">
          Tenants{" "}
          <span className="text-base font-normal text-gray-400">
            {activeTenants.length} active
            {upcomingTenants.length > 0 && ` · ${upcomingTenants.length} upcoming`}
          </span>
        </h1>
        <button
          onClick={() => { setShowAddPanel(true); setSelectedTenantId(null); }}
          className="px-4 py-2 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700"
        >
          Add Tenant
        </button>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 text-red-700 rounded text-sm flex justify-between">
          {error}
          <button onClick={() => setError("")} className="text-red-400 hover:text-red-600">✕</button>
        </div>
      )}

      {/* Active + Upcoming table */}
      <div className="bg-white rounded-lg shadow overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">{tableHead}</thead>
          <tbody className="divide-y divide-gray-200">
            {activeTenants.length === 0 && upcomingTenants.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-sm text-gray-500">
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
          <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-3">Inactive</h2>
          <div className="bg-white rounded-lg shadow overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">{tableHead}</thead>
              <tbody className="divide-y divide-gray-200">
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
        className={`fixed inset-y-0 right-0 w-full sm:max-w-lg bg-white shadow-2xl z-50 overflow-y-auto
          transition-transform duration-200 ${visible ? "translate-x-0" : "translate-x-full"}`}
      >
        {/* Top bar */}
        <div className="sticky top-0 bg-white border-b border-gray-200 px-5 py-3 flex items-center justify-between z-10">
          <button onClick={onClose} className="text-sm text-gray-500 hover:text-gray-800">← Back</button>
          <span className="text-sm font-medium text-gray-500">New Tenant</span>
        </div>

        <form onSubmit={handleSubmit} className="px-5 py-5 space-y-7">
          {/* Header */}
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-2xl font-bold text-gray-900">New Tenant</h2>
              {isUpcoming && (
                <span className="px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-700">Upcoming</span>
              )}
            </div>
            <p className="text-sm text-gray-400 mt-0.5">Starts {form.start_date}</p>
          </div>

          {/* Spot selector */}
          <div>
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3 pb-2 border-b border-gray-100">
              Spot <span className="font-normal text-gray-300 normal-case">(optional)</span>
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
                    className={`px-3 py-1.5 rounded text-sm font-medium border transition-colors ${
                      selected
                        ? "bg-blue-600 text-white border-blue-600"
                        : s.occupied
                        ? "bg-amber-50 text-amber-700 border-amber-300 hover:border-amber-500"
                        : "bg-white text-gray-700 border-gray-300 hover:border-blue-400"
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
              <div key={s.id} className="flex items-center gap-3 p-3 bg-amber-50 border border-amber-200 rounded mt-2">
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
                  className="px-2 py-1 border border-amber-300 rounded text-sm bg-white"
                />
              </div>
            ))}
          </div>

          {/* Details */}
          <div>
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3 pb-2 border-b border-gray-100">
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
                  <span className="text-gray-400 text-sm">€</span>
                  <input
                    type="number" step="0.01" min="0"
                    value={form.rent_eur}
                    onChange={(e) => setField("rent_eur", e.target.value)}
                    required
                    className="w-28 px-2 py-1.5 border border-gray-200 rounded-md text-sm text-gray-900 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
              </AddFieldRow>
              <AddFieldRow label="Due day">
                <select
                  value={form.payment_due_day}
                  onChange={(e) => setField("payment_due_day", e.target.value)}
                  className="w-24 px-2 py-1.5 border border-gray-200 rounded-md text-sm text-gray-900"
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
                  className="w-40 px-2 py-1.5 border border-gray-200 rounded-md text-sm text-gray-900"
                />
              </AddFieldRow>
              <AddFieldRow label="Language">
                <select
                  value={form.language}
                  onChange={(e) => setField("language", e.target.value)}
                  className="w-32 px-2 py-1.5 border border-gray-200 rounded-md text-sm text-gray-900"
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
            <button
              type="submit"
              disabled={saving}
              className="w-full px-4 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 disabled:opacity-50"
            >
              {saving ? "Creating…" : isUpcoming ? "Create Upcoming Tenant" : "Create Tenant"}
            </button>
          </div>
        </form>
      </div>
    </>
  );
}

function AddFieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3">
      <label className="w-24 shrink-0 text-sm text-gray-500 pt-1.5">{label}</label>
      <div className="flex-1 min-w-0">{children}</div>
    </div>
  );
}
