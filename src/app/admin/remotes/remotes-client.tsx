"use client";

import { useCallback, useEffect, useState } from "react";

type RemoteTenant = {
  id: string;
  name: string;
  active: boolean;
  torrinha_spots: { number: number; label: string | null }[];
};

type Remote = {
  id: string;
  tenant_id: string;
  count: number;
  deposit_paid: boolean;
  deposit_eur: number | null;
  issued_date: string | null;
  returned_date: string | null;
  torrinha_tenants: RemoteTenant | null;
};

type ActiveTenant = { id: string; name: string; spot_numbers: string };

type EditingCell = { remoteId: string; field: string } | null;

function spotLabels(spots: { number: number; label?: string | null }[] | null | undefined): string {
  if (!spots || spots.length === 0) return "—";
  return spots
    .slice()
    .sort((a, b) => a.number - b.number)
    .map((s) => s.label || String(s.number))
    .join(", ");
}

export default function RemotesClient() {
  const [remotes, setRemotes] = useState<Remote[]>([]);
  const [activeTenants, setActiveTenants] = useState<ActiveTenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingCell, setEditingCell] = useState<EditingCell>(null);
  const [editValue, setEditValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const fetchData = useCallback(async () => {
    const [remotesRes, tenantsRes] = await Promise.all([
      fetch("/api/remotes"),
      fetch("/api/tenants"),
    ]);
    if (remotesRes.ok) setRemotes(await remotesRes.json());
    if (tenantsRes.ok) {
      const tenants = await tenantsRes.json();
      setActiveTenants(
        tenants
          .filter((t: { active: boolean }) => t.active)
          .map(
            (t: {
              id: string;
              name: string;
              torrinha_spots: { number: number; label: string | null }[];
            }) => ({
              id: t.id,
              name: t.name,
              spot_numbers: spotLabels(t.torrinha_spots),
            })
          )
      );
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Split into active (not returned) and returned
  const activeRemotes = remotes.filter((r) => !r.returned_date);
  const returnedRemotes = remotes.filter((r) => r.returned_date);

  const totalRemotesOut = activeRemotes.reduce((s, r) => s + r.count, 0);
  const totalDepositsHeld = activeRemotes
    .filter((r) => r.deposit_paid)
    .reduce((s, r) => s + Number(r.deposit_eur ?? 0), 0);

  // --- Inline edit ---
  function startEdit(remoteId: string, field: string, currentValue: string) {
    setEditingCell({ remoteId, field });
    setEditValue(currentValue);
  }

  async function saveEdit() {
    if (!editingCell) return;
    setSaving(true);

    let value: string | boolean | null = editValue;
    if (editingCell.field === "deposit_paid") {
      value = editValue === "true";
    }
    if (
      editingCell.field === "returned_date" ||
      editingCell.field === "issued_date"
    ) {
      value = editValue || null;
    }

    const res = await fetch("/api/remotes", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: editingCell.remoteId,
        [editingCell.field]: value,
      }),
    });
    if (res.ok) {
      await fetchData();
    } else {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Failed to save");
    }
    setEditingCell(null);
    setSaving(false);
  }

  function handleEditKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") saveEdit();
    if (e.key === "Escape") setEditingCell(null);
  }

  function renderEditable(
    remote: Remote,
    field: string,
    displayValue: string,
    inputType: string = "text"
  ) {
    const isEditing =
      editingCell?.remoteId === remote.id && editingCell?.field === field;

    if (isEditing) {
      if (field === "deposit_paid") {
        return (
          <select
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onBlur={saveEdit}
            autoFocus
            className="px-1 py-0.5 border border-t-accent rounded-[var(--t-radius-sm)] text-sm text-t-text"
          >
            <option value="true">Yes</option>
            <option value="false">No</option>
          </select>
        );
      }
      return (
        <input
          type={inputType}
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onBlur={saveEdit}
          onKeyDown={handleEditKeyDown}
          autoFocus
          className="w-full px-1 py-0.5 border border-t-accent rounded-[var(--t-radius-sm)] text-sm text-t-text"
        />
      );
    }

    return (
      <span
        onClick={() => startEdit(remote.id, field, String(displayValue === "—" ? "" : (field === "deposit_paid" ? remote.deposit_paid : (remote as Record<string, unknown>)[field]) ?? ""))}
        className="cursor-pointer hover:bg-t-accent-light px-1 py-0.5 rounded -mx-1 block"
        title="Click to edit"
      >
        {displayValue}
      </span>
    );
  }

  // --- Mark returned shortcut ---
  async function markReturned(remoteId: string) {
    setSaving(true);
    const res = await fetch("/api/remotes", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: remoteId,
        returned_date: new Date().toISOString().split("T")[0],
      }),
    });
    if (res.ok) {
      await fetchData();
    } else {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Failed to mark returned");
    }
    setSaving(false);
  }

  if (loading) {
    return (
      <div className="text-center py-12 text-t-text-muted">
        Loading remotes...
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-t-text">Remote Controls</h1>
        <button
          onClick={() => setShowAddForm(!showAddForm)}
          className="px-4 py-2 bg-t-accent text-white text-sm rounded-[var(--t-radius-sm)] hover:bg-t-accent-hover"
        >
          {showAddForm ? "Cancel" : "Issue Remote"}
        </button>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 text-red-700 rounded text-sm flex justify-between">
          {error}
          <button
            onClick={() => setError("")}
            className="text-red-500 hover:text-red-700"
          >
            dismiss
          </button>
        </div>
      )}

      {showAddForm && (
        <AddRemoteForm
          activeTenants={activeTenants}
          onSuccess={() => {
            setShowAddForm(false);
            fetchData();
          }}
          onError={setError}
        />
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        <div className="bg-t-surface border border-t-border rounded-[var(--t-radius-lg)] p-4">
          <p className="text-sm text-t-text-muted">Remotes In Circulation</p>
          <p className="text-2xl font-bold text-t-text">{totalRemotesOut}</p>
        </div>
        <div className="bg-t-surface border border-t-border rounded-[var(--t-radius-lg)] p-4">
          <p className="text-sm text-t-text-muted">Total Deposits Held</p>
          <p className="text-2xl font-bold text-t-text">
            &euro;{totalDepositsHeld.toFixed(2)}
          </p>
        </div>
      </div>

      {/* Active remotes table */}
      <div className="bg-t-surface border border-t-border rounded-[var(--t-radius-lg)] overflow-x-auto">
        <table className="min-w-full divide-y divide-t-border">
          <thead className="bg-t-bg">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-t-text-muted uppercase">
                Spots
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-t-text-muted uppercase">
                Tenant
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-t-text-muted uppercase">
                Count
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-t-text-muted uppercase">
                Deposit Paid
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-t-text-muted uppercase">
                Deposit &euro;
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-t-text-muted uppercase">
                Issued
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-t-text-muted uppercase">
                Returned
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-t-text-muted uppercase w-24"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-t-border">
            {activeRemotes.length > 0 ? (
              activeRemotes.map((r) => {
                const tenant = r.torrinha_tenants;
                const tenantInactive = tenant && !tenant.active;
                return (
                  <tr
                    key={r.id}
                    className={`hover:bg-t-bg ${tenantInactive ? "bg-amber-50" : ""}`}
                  >
                    <td className="px-4 py-3 text-sm text-t-text font-medium">
                      {spotLabels(tenant?.torrinha_spots)}
                    </td>
                    <td className="px-4 py-3 text-sm text-t-text">
                      {tenant?.name ?? "—"}
                      {tenantInactive && (
                        <span className="ml-1 text-xs text-amber-600 font-medium">
                          (deactivated)
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-t-text">
                      {renderEditable(r, "count", String(r.count), "number")}
                    </td>
                    <td className="px-4 py-3 text-sm text-t-text">
                      {renderEditable(
                        r,
                        "deposit_paid",
                        r.deposit_paid ? "Yes" : "No"
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-t-text">
                      {renderEditable(
                        r,
                        "deposit_eur",
                        r.deposit_eur != null ? `€${r.deposit_eur}` : "—",
                        "number"
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-t-text-muted">
                      {renderEditable(
                        r,
                        "issued_date",
                        r.issued_date ?? "—",
                        "date"
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-t-text-muted">
                      {renderEditable(
                        r,
                        "returned_date",
                        r.returned_date ?? "—",
                        "date"
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <button
                        onClick={() => markReturned(r.id)}
                        disabled={saving}
                        className="text-xs text-t-accent hover:text-t-accent-hover disabled:opacity-50"
                      >
                        Mark returned
                      </button>
                    </td>
                  </tr>
                );
              })
            ) : (
              <tr>
                <td
                  colSpan={8}
                  className="px-4 py-8 text-center text-sm text-t-text-muted"
                >
                  No remotes currently in circulation.
                </td>
              </tr>
            )}
            {/* Totals row */}
            {activeRemotes.length > 0 && (
              <tr className="bg-t-bg font-medium">
                <td className="px-4 py-3 text-sm text-t-text-secondary" colSpan={2}>
                  Total
                </td>
                <td className="px-4 py-3 text-sm text-t-text">
                  {totalRemotesOut}
                </td>
                <td className="px-4 py-3 text-sm text-t-text-muted" />
                <td className="px-4 py-3 text-sm text-t-text">
                  &euro;{totalDepositsHeld.toFixed(2)}
                </td>
                <td colSpan={3} />
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Returned remotes */}
      {returnedRemotes.length > 0 && (
        <div className="mt-8">
          <h2 className="text-lg font-semibold text-t-text-muted mb-3">
            Returned Remotes
          </h2>
          <div className="bg-t-surface border border-t-border rounded-[var(--t-radius-lg)] overflow-x-auto opacity-60">
            <table className="min-w-full divide-y divide-t-border">
              <tbody className="divide-y divide-t-border">
                {returnedRemotes.map((r) => {
                  const tenant = r.torrinha_tenants;
                  return (
                    <tr key={r.id}>
                      <td className="px-4 py-2 text-sm text-t-text-muted">
                        {spotLabels(tenant?.torrinha_spots)}
                      </td>
                      <td className="px-4 py-2 text-sm text-t-text-muted">
                        {tenant?.name ?? "—"}
                      </td>
                      <td className="px-4 py-2 text-sm text-t-text-muted">
                        {r.count}
                      </td>
                      <td className="px-4 py-2 text-sm text-t-text-muted">
                        {r.deposit_paid ? `€${r.deposit_eur}` : "—"}
                      </td>
                      <td className="px-4 py-2 text-sm text-t-text-muted">
                        Issued: {r.issued_date ?? "—"}
                      </td>
                      <td className="px-4 py-2 text-sm text-t-text-muted">
                        Returned: {r.returned_date}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// --- Add Remote Form ---
function AddRemoteForm({
  activeTenants,
  onSuccess,
  onError,
}: {
  activeTenants: ActiveTenant[];
  onSuccess: () => void;
  onError: (msg: string) => void;
}) {
  const [form, setForm] = useState({
    tenant_id: "",
    count: "1",
    deposit_paid: false,
    deposit_eur: "",
    issued_date: new Date().toISOString().split("T")[0],
  });
  const [saving, setSaving] = useState(false);

  function set(field: string, value: string | boolean) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const res = await fetch("/api/remotes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    if (res.ok) {
      onSuccess();
    } else {
      const data = await res.json().catch(() => ({}));
      onError(data.error || "Failed to issue remote");
    }
    setSaving(false);
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="bg-t-surface border border-t-border rounded-[var(--t-radius-lg)] p-5 mb-6"
    >
      <h2 className="text-lg font-semibold text-t-text mb-4">
        Issue Remote Control
      </h2>
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
        <div>
          <label className="block text-xs font-medium text-t-text-muted mb-1">
            Tenant *
          </label>
          <select
            value={form.tenant_id}
            onChange={(e) => set("tenant_id", e.target.value)}
            required
            className="w-full px-2 py-1.5 border border-t-border rounded-[var(--t-radius-sm)] text-sm text-t-text"
          >
            <option value="">Select tenant...</option>
            {activeTenants.map((t) => (
              <option key={t.id} value={t.id}>
                {t.spot_numbers !== "—" ? `#${t.spot_numbers} — ` : ""}
                {t.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-t-text-muted mb-1">
            Count
          </label>
          <input
            type="number"
            min="1"
            value={form.count}
            onChange={(e) => set("count", e.target.value)}
            className="w-full px-2 py-1.5 border border-t-border rounded-[var(--t-radius-sm)] text-sm text-t-text"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-t-text-muted mb-1">
            Deposit Paid
          </label>
          <select
            value={form.deposit_paid ? "true" : "false"}
            onChange={(e) => set("deposit_paid", e.target.value === "true")}
            className="w-full px-2 py-1.5 border border-t-border rounded-[var(--t-radius-sm)] text-sm text-t-text"
          >
            <option value="false">No</option>
            <option value="true">Yes</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-t-text-muted mb-1">
            Deposit &euro;
          </label>
          <input
            type="number"
            step="0.01"
            min="0"
            value={form.deposit_eur}
            onChange={(e) => set("deposit_eur", e.target.value)}
            className="w-full px-2 py-1.5 border border-t-border rounded-[var(--t-radius-sm)] text-sm text-t-text"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-t-text-muted mb-1">
            Issued Date
          </label>
          <input
            type="date"
            value={form.issued_date}
            onChange={(e) => set("issued_date", e.target.value)}
            className="w-full px-2 py-1.5 border border-t-border rounded-[var(--t-radius-sm)] text-sm text-t-text"
          />
        </div>
      </div>
      <div className="mt-4 flex justify-end">
        <button
          type="submit"
          disabled={saving}
          className="px-4 py-2 bg-t-accent text-white text-sm rounded-[var(--t-radius-sm)] hover:bg-t-accent-hover disabled:opacity-50"
        >
          {saving ? "Issuing..." : "Issue Remote"}
        </button>
      </div>
    </form>
  );
}
