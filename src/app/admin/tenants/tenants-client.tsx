"use client";

import { useCallback, useEffect, useState } from "react";

type Spot = {
  id: string;
  number: number;
  label: string | null;
  occupied: boolean;
  tenant_id: string | null;
  tenant_name: string | null;
  incoming_tenant: { tenant_id: string; tenant_name: string; start_date: string } | null;
};

type Remote = {
  id: string;
  count: number;
  deposit_paid: boolean;
  returned_date: string | null;
};

type FutureAssignment = {
  tenant_id: string;
  spot_id: string;
  start_date: string;
  end_date: string | null;
  torrinha_spots: { id: string; number: number; label: string | null } | null;
};

type Tenant = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  language: string;
  rent_eur: number;
  payment_due_day: number;
  start_date: string;
  notes: string | null;
  active: boolean;
  status: "active" | "future" | "inactive";
  access_token: string | null;
  torrinha_spots: { id: string; number: number; label: string | null }[];
  torrinha_remotes: Remote[];
  future_assignments: FutureAssignment[];
};

type EditingCell = { tenantId: string; field: string } | null;

function spotLabel(s: { number: number; label?: string | null }): string {
  return s.label || `Spot ${s.number}`;
}

function spotLabels(t: Tenant): string {
  if (!t.torrinha_spots || t.torrinha_spots.length === 0) return "—";
  return t.torrinha_spots
    .slice()
    .sort((a, b) => a.number - b.number)
    .map((s) => s.label || String(s.number))
    .join(", ");
}

function futureSpotLabels(t: Tenant): string | null {
  if (!t.future_assignments || t.future_assignments.length === 0) return null;
  return t.future_assignments
    .map((a) => {
      const s = a.torrinha_spots;
      const label = s ? (s.label || String(s.number)) : "?";
      return `${label} from ${a.start_date}`;
    })
    .join(", ");
}

function StatusBadge({ status }: { status: Tenant["status"] }) {
  if (status === "active") {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">
        Active
      </span>
    );
  }
  if (status === "future") {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-700">
        Future
      </span>
    );
  }
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-500">
      Inactive
    </span>
  );
}

export default function TenantsClient() {
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [allSpots, setAllSpots] = useState<Spot[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingCell, setEditingCell] = useState<EditingCell>(null);
  const [editValue, setEditValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [deactivating, setDeactivating] = useState<Tenant | null>(null);
  const [error, setError] = useState("");

  const fetchData = useCallback(async () => {
    const [tenantsRes, spotsRes] = await Promise.all([
      fetch("/api/tenants"),
      fetch("/api/spots"),
    ]);
    if (tenantsRes.ok) setTenants(await tenantsRes.json());
    if (spotsRes.ok) setAllSpots(await spotsRes.json());
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const remoteCount = (t: Tenant) =>
    t.torrinha_remotes
      ?.filter((r) => !r.returned_date)
      .reduce((sum, r) => sum + r.count, 0) ?? 0;

  function startEdit(tenantId: string, field: string, currentValue: string) {
    setEditingCell({ tenantId, field });
    setEditValue(currentValue);
  }

  async function saveEdit() {
    if (!editingCell) return;
    setSaving(true);
    const res = await fetch("/api/tenants", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: editingCell.tenantId, [editingCell.field]: editValue }),
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

  function renderEditableCell(
    tenant: Tenant,
    field: keyof Tenant,
    displayValue: string,
    inputType: string = "text"
  ) {
    if (tenant.status === "inactive") {
      return <span className="text-gray-400">{displayValue}</span>;
    }
    const isEditing = editingCell?.tenantId === tenant.id && editingCell?.field === field;

    if (isEditing) {
      if (field === "language") {
        return (
          <select
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onBlur={saveEdit}
            autoFocus
            className="w-full px-1 py-0.5 border border-blue-300 rounded text-sm text-gray-900"
          >
            <option value="pt">PT</option>
            <option value="en">EN</option>
          </select>
        );
      }
      if (field === "notes") {
        return (
          <textarea
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onBlur={saveEdit}
            onKeyDown={(e) => { if (e.key === "Escape") setEditingCell(null); }}
            autoFocus
            rows={2}
            className="w-full px-1 py-0.5 border border-blue-300 rounded text-sm text-gray-900"
          />
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
          className="w-full px-1 py-0.5 border border-blue-300 rounded text-sm text-gray-900"
        />
      );
    }

    return (
      <span
        onClick={() => startEdit(tenant.id, field, String(tenant[field] ?? ""))}
        className="cursor-pointer hover:bg-blue-50 px-1 py-0.5 rounded -mx-1 block"
        title="Click to edit"
      >
        {displayValue || "—"}
      </span>
    );
  }

  async function handleDeactivate() {
    if (!deactivating) return;
    setSaving(true);
    const res = await fetch("/api/tenants/deactivate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tenant_id: deactivating.id, mark_remotes_returned: true }),
    });
    if (res.ok) {
      await fetchData();
      setDeactivating(null);
    } else {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Failed to deactivate");
    }
    setSaving(false);
  }

  if (loading) {
    return <div className="text-center py-12 text-gray-500">Loading tenants...</div>;
  }

  const activeTenants = tenants.filter((t) => t.status === "active");
  const futureTenants = tenants.filter((t) => t.status === "future");
  const inactiveTenants = tenants.filter((t) => t.status === "inactive");

  const tableHeaders = (
    <tr>
      <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
      <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">Spots</th>
      <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
      <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">Email</th>
      <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">Phone</th>
      <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">Rent</th>
      <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">Due Day</th>
      <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">Start</th>
      <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">Remotes</th>
      <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">Lang</th>
      <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">Notes</th>
      <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">Portal</th>
      <th className="px-3 py-3 w-20"></th>
    </tr>
  );

  function renderTenantRow(t: Tenant) {
    const futureLabel = futureSpotLabels(t);
    const isInactive = t.status === "inactive";

    return (
      <tr key={t.id} className={`hover:bg-gray-50 ${isInactive ? "opacity-50" : ""}`}>
        <td className="px-3 py-3 text-sm">
          <StatusBadge status={t.status} />
        </td>
        <td className="px-3 py-3 text-sm text-gray-900 font-medium">
          <div>{spotLabels(t)}</div>
          {futureLabel && (
            <div className="text-xs text-blue-600 mt-0.5" title="Upcoming assignment">
              → {futureLabel}
            </div>
          )}
        </td>
        <td className="px-3 py-3 text-sm text-gray-900">
          {renderEditableCell(t, "name", t.name)}
        </td>
        <td className="px-3 py-3 text-sm text-gray-500">
          {renderEditableCell(t, "email", t.email, "email")}
        </td>
        <td className="px-3 py-3 text-sm text-gray-500">
          {renderEditableCell(t, "phone", t.phone || "", "tel")}
        </td>
        <td className="px-3 py-3 text-sm text-gray-900">
          {renderEditableCell(t, "rent_eur", `€${t.rent_eur}`, "number")}
        </td>
        <td className="px-3 py-3 text-sm text-gray-500">
          {renderEditableCell(t, "payment_due_day", String(t.payment_due_day), "number")}
        </td>
        <td className="px-3 py-3 text-sm text-gray-500">
          {renderEditableCell(t, "start_date", t.start_date, "date")}
        </td>
        <td className="px-3 py-3 text-sm text-gray-900 text-center">
          {remoteCount(t)}
        </td>
        <td className="px-3 py-3 text-sm text-gray-500 uppercase">
          {renderEditableCell(t, "language", t.language.toUpperCase())}
        </td>
        <td className="px-3 py-3 text-sm text-gray-400 max-w-[120px] truncate">
          {renderEditableCell(t, "notes", t.notes || "")}
        </td>
        <td className="px-3 py-3 text-sm">
          <PortalLinkCell token={t.access_token} />
        </td>
        <td className="px-3 py-3 text-sm">
          {t.status !== "inactive" && (
            <button
              onClick={() => setDeactivating(t)}
              className="text-red-500 hover:text-red-700 text-xs"
            >
              Deactivate
            </button>
          )}
        </td>
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
            {futureTenants.length > 0 && ` · ${futureTenants.length} incoming`}
          </span>
        </h1>
        <button
          onClick={() => setShowAddForm(!showAddForm)}
          className="px-4 py-2 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700"
        >
          {showAddForm ? "Cancel" : "Add Tenant"}
        </button>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 text-red-700 rounded text-sm flex justify-between">
          {error}
          <button onClick={() => setError("")} className="text-red-500 hover:text-red-700">dismiss</button>
        </div>
      )}

      {showAddForm && (
        <AddTenantForm
          allSpots={allSpots}
          onSuccess={() => { setShowAddForm(false); fetchData(); }}
          onError={setError}
        />
      )}

      {/* Active + Future tenants */}
      <div className="bg-white rounded-lg shadow overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">{tableHeaders}</thead>
          <tbody className="divide-y divide-gray-200">
            {activeTenants.length === 0 && futureTenants.length === 0 ? (
              <tr>
                <td colSpan={13} className="px-4 py-8 text-center text-sm text-gray-500">
                  No tenants. Click &quot;Add Tenant&quot; to get started.
                </td>
              </tr>
            ) : (
              [...activeTenants, ...futureTenants].map(renderTenantRow)
            )}
          </tbody>
        </table>
      </div>

      {/* Inactive tenants */}
      {inactiveTenants.length > 0 && (
        <div className="mt-8">
          <h2 className="text-lg font-semibold text-gray-500 mb-3">Inactive Tenants</h2>
          <div className="bg-white rounded-lg shadow overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">{tableHeaders}</thead>
              <tbody className="divide-y divide-gray-200">
                {inactiveTenants.map(renderTenantRow)}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {deactivating && (
        <DeactivateModal
          tenant={deactivating}
          remoteCount={remoteCount(deactivating)}
          saving={saving}
          onConfirm={handleDeactivate}
          onCancel={() => setDeactivating(null)}
        />
      )}
    </div>
  );
}

// --- Add Tenant Form ---
function AddTenantForm({
  allSpots,
  onSuccess,
  onError,
}: {
  allSpots: Spot[];
  onSuccess: () => void;
  onError: (msg: string) => void;
}) {
  const today = new Date().toISOString().split("T")[0];
  const [form, setForm] = useState({
    spot_ids: [] as string[],
    name: "",
    email: "",
    phone: "",
    language: "pt",
    rent_eur: "",
    payment_due_day: "1",
    start_date: today,
    notes: "",
  });
  const [saving, setSaving] = useState(false);

  const isFuture = form.start_date > today;

  function set(field: string, value: string) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  function toggleSpot(spotId: string) {
    setForm((f) => ({
      ...f,
      spot_ids: f.spot_ids.includes(spotId)
        ? f.spot_ids.filter((id) => id !== spotId)
        : [...f.spot_ids, spotId],
    }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const res = await fetch("/api/tenants", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    if (res.ok) {
      onSuccess();
    } else {
      const data = await res.json().catch(() => ({}));
      onError(data.error || "Failed to add tenant");
    }
    setSaving(false);
  }

  const selectedSpots = allSpots.filter((s) => form.spot_ids.includes(s.id));
  const hasOccupiedSelected = selectedSpots.some((s) => s.occupied);

  return (
    <form onSubmit={handleSubmit} className="bg-white rounded-lg shadow p-5 mb-6">
      <div className="flex items-center gap-3 mb-4">
        <h2 className="text-lg font-semibold text-gray-900">Add New Tenant</h2>
        {isFuture && (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-700">
            Future tenant — starts {form.start_date}
          </span>
        )}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {/* Spot selector */}
        <div className="col-span-2 sm:col-span-4">
          <label className="block text-xs font-medium text-gray-600 mb-1">
            Spots <span className="text-gray-400 font-normal">(optional — can assign later)</span>
          </label>
          {allSpots.length === 0 ? (
            <p className="text-xs text-gray-400">Loading spots…</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {allSpots.map((s) => {
                const selected = form.spot_ids.includes(s.id);
                const occupied = s.occupied && !selected;
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => toggleSpot(s.id)}
                    title={s.occupied ? `Currently: ${s.tenant_name ?? "occupied"}${s.incoming_tenant ? ` · Next: ${s.incoming_tenant.tenant_name} from ${s.incoming_tenant.start_date}` : ""}` : ""}
                    className={`px-3 py-1.5 rounded text-sm font-medium border transition-colors relative ${
                      selected
                        ? "bg-blue-600 text-white border-blue-600"
                        : occupied
                        ? "bg-amber-50 text-amber-700 border-amber-300 hover:border-amber-500"
                        : "bg-white text-gray-700 border-gray-300 hover:border-blue-400"
                    }`}
                  >
                    {spotLabel(s)}
                    {occupied && <span className="ml-1 text-xs opacity-60">●</span>}
                  </button>
                );
              })}
            </div>
          )}
          {hasOccupiedSelected && (
            <p className="text-xs text-amber-600 mt-1">
              One or more selected spots are currently occupied. The assignment will start on the selected date — make sure the current tenant&apos;s end date is set to avoid conflicts.
            </p>
          )}
          {form.spot_ids.length > 0 && (
            <p className="text-xs text-gray-500 mt-1">
              {form.spot_ids.length} spot{form.spot_ids.length > 1 ? "s" : ""} selected
            </p>
          )}
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Name *</label>
          <input
            type="text"
            value={form.name}
            onChange={(e) => set("name", e.target.value)}
            required
            className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm text-gray-900"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Email *</label>
          <input
            type="email"
            value={form.email}
            onChange={(e) => set("email", e.target.value)}
            required
            className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm text-gray-900"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Phone</label>
          <input
            type="tel"
            value={form.phone}
            onChange={(e) => set("phone", e.target.value)}
            className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm text-gray-900"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Rent (EUR) *</label>
          <input
            type="number"
            step="0.01"
            min="0"
            value={form.rent_eur}
            onChange={(e) => set("rent_eur", e.target.value)}
            required
            className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm text-gray-900"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Due Day</label>
          <input
            type="number"
            min="1"
            max="28"
            value={form.payment_due_day}
            onChange={(e) => set("payment_due_day", e.target.value)}
            className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm text-gray-900"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">
            Start Date *
            {isFuture && <span className="ml-1 text-blue-600 font-normal">(future)</span>}
          </label>
          <input
            type="date"
            value={form.start_date}
            onChange={(e) => set("start_date", e.target.value)}
            required
            className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm text-gray-900"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Language</label>
          <select
            value={form.language}
            onChange={(e) => set("language", e.target.value)}
            className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm text-gray-900"
          >
            <option value="pt">Português</option>
            <option value="en">English</option>
          </select>
        </div>
        <div className="col-span-2 sm:col-span-4">
          <label className="block text-xs font-medium text-gray-600 mb-1">Notes</label>
          <input
            type="text"
            value={form.notes}
            onChange={(e) => set("notes", e.target.value)}
            className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm text-gray-900"
            placeholder="Optional notes..."
          />
        </div>
      </div>

      <div className="mt-4 flex justify-end">
        <button
          type="submit"
          disabled={saving}
          className="px-4 py-2 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700 disabled:opacity-50"
        >
          {saving ? "Adding..." : isFuture ? "Add Future Tenant" : "Add Tenant"}
        </button>
      </div>
    </form>
  );
}

// --- Deactivate Modal ---
function DeactivateModal({
  tenant,
  remoteCount,
  saving,
  onConfirm,
  onCancel,
}: {
  tenant: Tenant;
  remoteCount: number;
  saving: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const [remotesReturned, setRemotesReturned] = useState(false);
  const [depositRefunded, setDepositRefunded] = useState(false);

  const hasRemotes = remoteCount > 0;
  const hasDeposit = tenant.torrinha_remotes?.some((r) => r.deposit_paid && !r.returned_date);

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl p-6 max-w-md w-full mx-4">
        <h2 className="text-lg font-bold text-gray-900 mb-2">Deactivate Tenant</h2>
        <p className="text-sm text-gray-600 mb-4">
          Are you sure you want to deactivate <strong>{tenant.name}</strong>
          {tenant.torrinha_spots.length > 0 && (
            <> (Spot{tenant.torrinha_spots.length > 1 ? "s" : ""} {spotLabels(tenant)})</>
          )}?
          This will close their spot assignment(s) and free the spot{tenant.torrinha_spots.length > 1 ? "s" : ""} for new tenants.
        </p>

        <div className="space-y-3 mb-6">
          <h3 className="text-sm font-medium text-gray-700">Checklist before deactivation:</h3>

          {hasRemotes ? (
            <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
              <input type="checkbox" checked={remotesReturned} onChange={(e) => setRemotesReturned(e.target.checked)} />
              Remote control(s) returned ({remoteCount} out)
            </label>
          ) : (
            <p className="text-sm text-gray-400 flex items-center gap-2">
              <span className="text-green-500">&#10003;</span> No remotes issued
            </p>
          )}

          {hasDeposit ? (
            <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
              <input type="checkbox" checked={depositRefunded} onChange={(e) => setDepositRefunded(e.target.checked)} />
              Deposit refunded
            </label>
          ) : (
            <p className="text-sm text-gray-400 flex items-center gap-2">
              <span className="text-green-500">&#10003;</span> No deposit held
            </p>
          )}
        </div>

        <div className="flex justify-end gap-3">
          <button onClick={onCancel} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={saving || (hasRemotes && !remotesReturned) || (hasDeposit && !depositRefunded)}
            className="px-4 py-2 bg-red-600 text-white text-sm rounded-md hover:bg-red-700 disabled:opacity-50"
          >
            {saving ? "Deactivating..." : "Deactivate"}
          </button>
        </div>
      </div>
    </div>
  );
}

// --- Portal link copy-to-clipboard cell ---
function PortalLinkCell({ token }: { token: string | null }) {
  const [copied, setCopied] = useState(false);

  if (!token) return <span className="text-xs text-gray-300">—</span>;

  const url = typeof window !== "undefined"
    ? `${window.location.origin}/tenant/${token}`
    : `/tenant/${token}`;
  const shortToken = `${token.slice(0, 6)}…${token.slice(-4)}`;

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard not available on non-HTTPS
    }
  }

  return (
    <div className="flex items-center gap-1">
      <a
        href={`/tenant/${token}`}
        target="_blank"
        rel="noreferrer"
        className="text-xs text-blue-600 hover:underline font-mono"
        title={url}
      >
        {shortToken}
      </a>
      <button
        onClick={handleCopy}
        className="text-xs text-gray-400 hover:text-gray-700 px-1 rounded"
        title="Copy portal URL"
      >
        {copied ? "✓" : "📋"}
      </button>
    </div>
  );
}
