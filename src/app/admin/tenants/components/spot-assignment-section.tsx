"use client";

import { useCallback, useEffect, useState } from "react";
import type { Tenant, Spot } from "../types";

type Assignment = {
  id: string;
  tenant_id: string;
  spot_id: string;
  start_date: string;
  end_date: string | null;
  notes: string | null;
  torrinha_spots: { id: string; number: number; label: string | null } | null;
};

function sLabel(s: { number: number; label: string | null } | null): string {
  if (!s) return "?";
  return s.label || String(s.number);
}

export default function SpotAssignmentSection({
  tenant,
  allSpots,
  onRefresh,
  onError,
}: {
  tenant: Tenant;
  allSpots: Spot[];
  onRefresh: () => void;
  onError: (msg: string) => void;
}) {
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [endDates, setEndDates] = useState<Record<string, string>>({});
  const [endDateModes, setEndDateModes] = useState<Record<string, "running" | "set">>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);

  const today = new Date().toISOString().split("T")[0];

  const fetchAssignments = useCallback(async () => {
    const res = await fetch(`/api/spot-assignments?tenant_id=${tenant.id}`);
    if (res.ok) {
      const data: Assignment[] = await res.json();
      setAssignments(data);
      const dates: Record<string, string> = {};
      const modes: Record<string, "running" | "set"> = {};
      for (const a of data) {
        dates[a.id] = a.end_date ?? "";
        modes[a.id] = a.end_date ? "set" : "running";
      }
      setEndDates(dates);
      setEndDateModes(modes);
    }
    setLoading(false);
  }, [tenant.id]);

  useEffect(() => { fetchAssignments(); }, [fetchAssignments]);

  async function saveEndDate(a: Assignment) {
    const mode = endDateModes[a.id] ?? "running";
    const end_date = mode === "running" ? null : (endDates[a.id] || null);
    setSavingId(a.id);
    const res = await fetch("/api/spot-assignments", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: a.id, end_date }),
    });
    if (res.ok) {
      await fetchAssignments();
      onRefresh();
    } else {
      const data = await res.json().catch(() => ({}));
      onError(data.error || "Failed to update end date");
    }
    setSavingId(null);
  }

  async function deleteAssignment(id: string) {
    const res = await fetch(`/api/spot-assignments?id=${id}`, { method: "DELETE" });
    if (res.ok) { await fetchAssignments(); onRefresh(); }
    else {
      const data = await res.json().catch(() => ({}));
      onError(data.error || "Failed to delete assignment");
    }
  }

  if (loading) return <p className="text-sm text-t-text-muted">Loading…</p>;

  const current = assignments.filter(
    (a) => a.start_date <= today && (!a.end_date || a.end_date > today)
  );
  const upcoming = assignments.filter((a) => a.start_date > today);
  const past = assignments
    .filter((a) => a.end_date && a.end_date <= today)
    .sort((a, b) => (b.end_date ?? "").localeCompare(a.end_date ?? ""));

  return (
    <div className="space-y-3">
      {/* Current assignments */}
      {current.map((a) => {
        const spotData = allSpots.find((s) => s.id === a.spot_id);
        const incoming = spotData?.incoming_tenant;
        const mode = endDateModes[a.id] ?? (a.end_date ? "set" : "running");
        const effectiveDate = mode === "running" ? null : (endDates[a.id] || null);
        const hasPendingChange =
          mode === "running" ? a.end_date !== null : endDates[a.id] !== (a.end_date ?? "");

        return (
          <div key={a.id} className="border border-t-border rounded-[var(--t-radius-md)] p-3 space-y-2.5">
            <div className="flex items-center justify-between">
              <div>
                <span className="font-medium text-t-text">Spot {sLabel(a.torrinha_spots)}</span>
                <span className="text-sm text-t-text-muted ml-2">since {a.start_date}</span>
              </div>
              <span className="text-xs px-2 py-0.5 rounded bg-green-50 text-green-700 font-medium">
                Active
              </span>
            </div>

            <div className="flex items-center gap-4 flex-wrap">
              <span className="text-sm text-t-text-muted shrink-0">End date</span>

              <label className="flex items-center gap-1.5 text-sm text-t-text-secondary cursor-pointer">
                <input
                  type="radio"
                  name={`end-${a.id}`}
                  checked={mode === "running"}
                  onChange={() =>
                    setEndDateModes((m) => ({ ...m, [a.id]: "running" }))
                  }
                  className="accent-[var(--t-accent)]"
                />
                Running
              </label>

              <label className="flex items-center gap-1.5 text-sm text-t-text-secondary cursor-pointer">
                <input
                  type="radio"
                  name={`end-${a.id}`}
                  checked={mode === "set"}
                  onChange={() =>
                    setEndDateModes((m) => ({ ...m, [a.id]: "set" }))
                  }
                  className="accent-[var(--t-accent)]"
                />
                Set date
              </label>

              {mode === "set" && (
                <input
                  type="date"
                  value={endDates[a.id] ?? ""}
                  min={a.start_date}
                  onChange={(e) => setEndDates((d) => ({ ...d, [a.id]: e.target.value }))}
                  className="px-2 py-1 border border-t-border rounded-[var(--t-radius-sm)] text-sm text-t-text focus:outline-none focus:ring-1 focus:ring-t-accent"
                />
              )}

              {hasPendingChange && (
                <button
                  onClick={() => saveEndDate(a)}
                  disabled={savingId === a.id}
                  className="px-3 py-1 bg-t-accent text-white text-xs rounded-[var(--t-radius-sm)] hover:bg-t-accent-hover disabled:opacity-50 transition-colors"
                >
                  {savingId === a.id ? "Saving…" : "Save"}
                </button>
              )}

              {!hasPendingChange && effectiveDate && (
                <span className="text-xs text-amber-600">Leaving {effectiveDate}</span>
              )}
            </div>

            {incoming && (
              <div className="text-xs bg-t-accent-light text-t-accent-text rounded-[var(--t-radius-sm)] px-2 py-1.5">
                ⚠ {incoming.tenant_name} takes over from {incoming.start_date}
              </div>
            )}
          </div>
        );
      })}

      {/* Upcoming assignments */}
      {upcoming.map((a) => (
        <div key={a.id} className="border border-t-accent-light rounded-[var(--t-radius-md)] p-3 bg-t-accent-light">
          <div className="flex items-center justify-between">
            <div>
              <span className="font-medium text-t-accent-text">→ Spot {sLabel(a.torrinha_spots)}</span>
              <span className="text-sm text-t-accent ml-2">from {a.start_date}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs px-2 py-0.5 rounded bg-t-accent text-white font-medium">
                Upcoming
              </span>
              <button
                onClick={() => deleteAssignment(a.id)}
                className="text-xs text-red-400 hover:text-red-600"
                title="Remove upcoming assignment"
              >
                Remove
              </button>
            </div>
          </div>
        </div>
      ))}

      {/* Past assignments (collapsible) */}
      {past.length > 0 && (
        <details className="group">
          <summary className="text-xs text-t-text-muted cursor-pointer hover:text-t-text select-none">
            {past.length} past assignment{past.length > 1 ? "s" : ""}
          </summary>
          <div className="mt-2 pl-3 border-l-2 border-t-border space-y-1">
            {past.map((a) => (
              <p key={a.id} className="text-xs text-t-text-muted">
                Spot {sLabel(a.torrinha_spots)} · {a.start_date} → {a.end_date}
              </p>
            ))}
          </div>
        </details>
      )}

      {current.length === 0 && upcoming.length === 0 && past.length === 0 && (
        <p className="text-sm text-t-text-muted">No spot assignments.</p>
      )}

      {/* Add assignment */}
      {!showAddForm ? (
        <button
          onClick={() => setShowAddForm(true)}
          className="text-sm text-t-accent hover:text-t-accent-hover hover:underline"
        >
          + Add spot assignment
        </button>
      ) : (
        <AddAssignmentForm
          tenant={tenant}
          allSpots={allSpots}
          today={today}
          onSuccess={async () => { setShowAddForm(false); await fetchAssignments(); onRefresh(); }}
          onError={onError}
          onCancel={() => setShowAddForm(false)}
        />
      )}
    </div>
  );
}

function AddAssignmentForm({
  tenant,
  allSpots,
  today,
  onSuccess,
  onError,
  onCancel,
}: {
  tenant: Tenant;
  allSpots: Spot[];
  today: string;
  onSuccess: () => void;
  onError: (msg: string) => void;
  onCancel: () => void;
}) {
  const [spotId, setSpotId] = useState("");
  const [startDate, setStartDate] = useState(today);
  const [departingEndDate, setDepartingEndDate] = useState("");
  const [saving, setSaving] = useState(false);

  const selectedSpot = allSpots.find((s) => s.id === spotId) ?? null;
  const isOccupied = selectedSpot?.occupied ?? false;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!spotId) { onError("Select a spot"); return; }
    if (isOccupied && !departingEndDate) { onError("Enter the departing tenant's last day"); return; }
    if (isOccupied && departingEndDate >= startDate) {
      onError(`Departing tenant's last day must be before ${startDate}`);
      return;
    }
    setSaving(true);
    try {
      if (isOccupied && departingEndDate) {
        const r = await fetch("/api/spot-assignments", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ spot_id: spotId, end_date: departingEndDate }),
        });
        if (!r.ok) {
          const d = await r.json().catch(() => ({}));
          onError(d.error || "Failed to update departing tenant's end date");
          return;
        }
      }
      const res = await fetch("/api/spot-assignments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenant_id: tenant.id, spot_id: spotId, start_date: startDate }),
      });
      if (res.ok) onSuccess();
      else {
        const d = await res.json().catch(() => ({}));
        onError(d.error || "Failed to assign spot");
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="border border-dashed border-t-border rounded-[var(--t-radius-md)] p-3 space-y-3">
      <p className="text-sm font-medium text-t-text-secondary">New spot assignment</p>
      <form onSubmit={handleSubmit} className="space-y-3">
        <div>
          <label className="text-xs text-t-text-muted block mb-1">Spot *</label>
          <select
            value={spotId}
            onChange={(e) => { setSpotId(e.target.value); setDepartingEndDate(""); }}
            required
            className="w-full px-2 py-1.5 border border-t-border rounded-[var(--t-radius-sm)] text-sm text-t-text focus:outline-none focus:ring-1 focus:ring-t-accent"
          >
            <option value="">— select —</option>
            {allSpots.map((s) => (
              <option key={s.id} value={s.id}>
                {sLabel(s)}{s.occupied ? ` — ${s.tenant_name} (occupied)` : " — vacant"}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-xs text-t-text-muted block mb-1">Start date *</label>
          <input
            type="date" value={startDate}
            onChange={(e) => setStartDate(e.target.value)} required
            className="w-full px-2 py-1.5 border border-t-border rounded-[var(--t-radius-sm)] text-sm text-t-text focus:outline-none focus:ring-1 focus:ring-t-accent w-40"
          />
        </div>
        {isOccupied && (
          <div className="p-2.5 bg-amber-50 border border-amber-200 rounded space-y-1.5">
            <p className="text-sm text-amber-800">
              Spot {sLabel(selectedSpot!)} occupied by <strong>{selectedSpot!.tenant_name}</strong>. Last day?
            </p>
            <input
              type="date" value={departingEndDate}
              max={startDate ? new Date(new Date(startDate).getTime() - 86400000).toISOString().split("T")[0] : undefined}
              onChange={(e) => setDepartingEndDate(e.target.value)} required
              className="w-full px-2 py-1 border border-amber-300 rounded text-sm bg-white focus:outline-none focus:ring-1 focus:ring-amber-400"
            />
          </div>
        )}
        <div className="flex gap-2">
          <button type="submit" disabled={saving}
            className="px-3 py-1.5 bg-t-accent text-white text-sm rounded-[var(--t-radius-sm)] hover:bg-t-accent-hover disabled:opacity-50">
            {saving ? "Adding…" : "Add"}
          </button>
          <button type="button" onClick={onCancel}
            className="px-3 py-1.5 text-sm text-t-text-muted hover:text-t-text">
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
