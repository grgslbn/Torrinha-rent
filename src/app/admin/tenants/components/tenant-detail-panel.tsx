"use client";

import { useEffect, useState } from "react";
import type { Tenant, Spot } from "../types";
import SpotAssignmentSection from "./spot-assignment-section";
import ContactsSection from "./contacts-section";
import PaymentHistorySection from "./payment-history-section";

const INPUT = "w-full px-2 py-1.5 border border-gray-200 rounded-md text-sm text-gray-900 focus:outline-none focus:ring-1 focus:ring-blue-500";

function sLabels(t: Tenant): string {
  if (t.torrinha_spots?.length > 0) {
    return t.torrinha_spots
      .slice()
      .sort((a, b) => a.number - b.number)
      .map((s) => s.label || String(s.number))
      .join(", ");
  }
  if (t.future_assignments?.length > 0) {
    const first = t.future_assignments[0];
    const s = first.torrinha_spots;
    return `→ ${s ? (s.label || String(s.number)) : "?"} from ${first.start_date}`;
  }
  return "No spot";
}

function tenure(startDate: string): string {
  const start = new Date(startDate);
  const now = new Date();
  const months = (now.getFullYear() - start.getFullYear()) * 12 + (now.getMonth() - start.getMonth());
  if (months < 1) return "just started";
  if (months < 12) return `${months}mo`;
  return `${Math.floor(months / 12)}y ${months % 12}mo`;
}

type DraftFields = {
  name?: string;
  email?: string;
  phone?: string;
  language?: string;
  rent_eur?: string;
  payment_due_day?: string;
  start_date?: string;
  notes?: string;
};

export default function TenantDetailPanel({
  tenant,
  allSpots,
  onClose,
  onRefresh,
}: {
  tenant: Tenant;
  allSpots: Spot[];
  onClose: () => void;
  onRefresh: () => void;
}) {
  const [visible, setVisible] = useState(false);
  const [draft, setDraft] = useState<DraftFields>({});
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState("");
  const [error, setError] = useState("");
  const [showDeactivate, setShowDeactivate] = useState(false);
  const [deactivating, setDeactivating] = useState(false);
  const [remotesReturned, setRemotesReturned] = useState(false);
  const [depositRefunded, setDepositRefunded] = useState(false);

  useEffect(() => {
    const id = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(id);
  }, []);

  useEffect(() => {
    setDraft({});
    setShowDeactivate(false);
    setRemotesReturned(false);
    setDepositRefunded(false);
    setSavedMsg("");
    setError("");
  }, [tenant.id]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  function setField(field: keyof DraftFields, value: string) {
    setDraft((d) => ({ ...d, [field]: value }));
  }

  function val(field: keyof DraftFields): string {
    if (field in draft) return draft[field] as string;
    if (field === "rent_eur") return String(tenant.rent_eur);
    if (field === "payment_due_day") return String(tenant.payment_due_day);
    return (tenant[field as keyof Tenant] as string | null) ?? "";
  }

  const isDirty = Object.keys(draft).length > 0;

  async function handleSave() {
    if (!isDirty) return;
    setSaving(true);
    setError("");
    const patch: Record<string, unknown> = { id: tenant.id };
    for (const [k, v] of Object.entries(draft)) {
      if (k === "rent_eur" || k === "payment_due_day") patch[k] = Number(v);
      else patch[k] = v || null;
    }
    const res = await fetch("/api/tenants", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    if (res.ok) {
      setDraft({});
      setSavedMsg("Saved!");
      setTimeout(() => setSavedMsg(""), 3000);
      onRefresh();
    } else {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Failed to save");
    }
    setSaving(false);
  }

  async function handleDeactivate() {
    setDeactivating(true);
    const res = await fetch("/api/tenants/deactivate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tenant_id: tenant.id, mark_remotes_returned: true }),
    });
    if (res.ok) { onRefresh(); onClose(); }
    else {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Failed to deactivate");
      setDeactivating(false);
    }
  }

  const activeRemotes = tenant.torrinha_remotes?.filter((r) => !r.returned_date) ?? [];
  const activeRemoteCount = activeRemotes.reduce((sum, r) => sum + r.count, 0);
  const hasDeposit = activeRemotes.some((r) => r.deposit_paid);
  const canDeactivate =
    (!activeRemoteCount || remotesReturned) && (!hasDeposit || depositRefunded);

  const portalUrl =
    tenant.access_token && typeof window !== "undefined"
      ? `${window.location.origin}/tenant/${tenant.access_token}`
      : tenant.access_token
      ? `/tenant/${tenant.access_token}`
      : null;

  return (
    <>
      {/* Overlay */}
      <div className="fixed inset-0 bg-black/30 z-40" onClick={onClose} />

      {/* Slide-over panel */}
      <div
        className={`fixed inset-y-0 right-0 w-full sm:max-w-lg bg-white shadow-2xl z-50 overflow-y-auto
          transition-transform duration-200 ${visible ? "translate-x-0" : "translate-x-full"}`}
      >
        {/* Sticky top bar */}
        <div className="sticky top-0 bg-white border-b border-gray-200 px-5 py-3 flex items-center justify-between z-10">
          <button
            onClick={onClose}
            className="text-sm text-gray-500 hover:text-gray-800 flex items-center gap-1"
          >
            ← Back
          </button>
          {tenant.status !== "inactive" && !showDeactivate && (
            <button
              onClick={() => setShowDeactivate(true)}
              className="text-sm text-red-500 hover:text-red-700"
            >
              Deactivate
            </button>
          )}
        </div>

        <div className="px-5 py-5 space-y-7">
          {/* Tenant identity */}
          <div>
            <div className="flex items-start justify-between gap-2">
              <h2 className="text-2xl font-bold text-gray-900 leading-tight break-words">
                {draft.name ?? tenant.name}
              </h2>
              <StatusBadge status={tenant.status} />
            </div>
            <p className="text-sm text-gray-400 mt-1">
              {sLabels(tenant)}
              {tenant.start_date && (
                <span> · {tenure(tenant.start_date)} since {tenant.start_date}</span>
              )}
            </p>
          </div>

          {error && (
            <div className="p-3 bg-red-50 text-red-700 text-sm rounded flex items-start justify-between gap-2">
              <span>{error}</span>
              <button onClick={() => setError("")} className="text-red-400 hover:text-red-600 shrink-0">✕</button>
            </div>
          )}

          {/* ─── Details ─── */}
          <PanelSection title="Details">
            <div className="space-y-3">
              <FieldRow label="Name">
                <input type="text" value={val("name")} onChange={(e) => setField("name", e.target.value)} className={INPUT} />
              </FieldRow>
              <FieldRow label="Email">
                <input type="email" value={val("email")} onChange={(e) => setField("email", e.target.value)} className={INPUT} />
              </FieldRow>
              <FieldRow label="Phone">
                <input type="tel" value={val("phone")} onChange={(e) => setField("phone", e.target.value)} placeholder="—" className={INPUT} />
              </FieldRow>
              <FieldRow label="Rent">
                <div className="flex items-center gap-1">
                  <span className="text-gray-400 text-sm">€</span>
                  <input
                    type="number" step="0.01" min="0"
                    value={val("rent_eur")}
                    onChange={(e) => setField("rent_eur", e.target.value)}
                    className="w-28 px-2 py-1.5 border border-gray-200 rounded-md text-sm text-gray-900 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
              </FieldRow>
              <FieldRow label="Due day">
                <select
                  value={val("payment_due_day")}
                  onChange={(e) => setField("payment_due_day", e.target.value)}
                  className="w-24 px-2 py-1.5 border border-gray-200 rounded-md text-sm text-gray-900 focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                  {Array.from({ length: 28 }, (_, i) => i + 1).map((d) => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </select>
              </FieldRow>
              <FieldRow label="Start date">
                <input
                  type="date" value={val("start_date")}
                  onChange={(e) => setField("start_date", e.target.value)}
                  className="w-40 px-2 py-1.5 border border-gray-200 rounded-md text-sm text-gray-900 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </FieldRow>
              <FieldRow label="Language">
                <select
                  value={val("language")}
                  onChange={(e) => setField("language", e.target.value)}
                  className="w-32 px-2 py-1.5 border border-gray-200 rounded-md text-sm text-gray-900 focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                  <option value="pt">Português</option>
                  <option value="en">English</option>
                </select>
              </FieldRow>
              <FieldRow label="Notes">
                <textarea
                  value={val("notes")}
                  onChange={(e) => setField("notes", e.target.value)}
                  rows={2} placeholder="—"
                  className={`${INPUT} resize-none`}
                />
              </FieldRow>
            </div>
            <div className="mt-4 flex items-center gap-3">
              <button
                onClick={handleSave}
                disabled={saving || !isDirty}
                className="px-4 py-2 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700 disabled:opacity-40"
              >
                {saving ? "Saving…" : "Save changes"}
              </button>
              {savedMsg && <span className="text-sm text-green-600">{savedMsg}</span>}
            </div>
          </PanelSection>

          {/* ─── Spot Assignment ─── */}
          <PanelSection title="Spot Assignment">
            <SpotAssignmentSection
              tenant={tenant}
              allSpots={allSpots}
              onRefresh={onRefresh}
              onError={setError}
            />
          </PanelSection>

          {/* ─── Contacts ─── */}
          <PanelSection title="Contacts">
            <ContactsSection
              tenant={tenant}
              onChanged={onRefresh}
              onError={setError}
            />
          </PanelSection>

          {/* ─── Remotes ─── */}
          <PanelSection title="Remotes">
            {activeRemoteCount > 0 ? (
              <p className="text-sm text-gray-700">
                <span className="font-medium">{activeRemoteCount}</span> remote{activeRemoteCount > 1 ? "s" : ""} out
                {hasDeposit && <span className="text-gray-400 ml-2">· deposit paid</span>}
              </p>
            ) : (
              <p className="text-sm text-gray-400">No active remotes.</p>
            )}
            <a href="/admin/remotes" className="mt-1 block text-xs text-blue-600 hover:underline">
              Manage remotes →
            </a>
          </PanelSection>

          {/* ─── Portal ─── */}
          <PanelSection title="Tenant Portal">
            {portalUrl ? (
              <PortalRow url={portalUrl} token={tenant.access_token!} />
            ) : (
              <p className="text-sm text-gray-400">No portal link.</p>
            )}
          </PanelSection>

          {/* ─── Payment History ─── */}
          <PanelSection title="Payment History">
            <PaymentHistorySection tenantId={tenant.id} />
          </PanelSection>

          {/* ─── Deactivate confirmation ─── */}
          {showDeactivate && (
            <div className="border border-red-200 rounded-lg p-4 bg-red-50 space-y-3">
              <h3 className="text-sm font-semibold text-red-800">
                Deactivate {tenant.name}?
              </h3>
              <p className="text-xs text-red-700">
                This closes all open spot assignments and marks the tenant inactive.
              </p>
              <div className="space-y-2">
                {activeRemoteCount > 0 ? (
                  <label className="flex items-center gap-2 text-sm text-red-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={remotesReturned}
                      onChange={(e) => setRemotesReturned(e.target.checked)}
                    />
                    Remote(s) returned ({activeRemoteCount} out)
                  </label>
                ) : (
                  <p className="text-sm text-red-300">✓ No remotes issued</p>
                )}
                {hasDeposit ? (
                  <label className="flex items-center gap-2 text-sm text-red-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={depositRefunded}
                      onChange={(e) => setDepositRefunded(e.target.checked)}
                    />
                    Deposit refunded
                  </label>
                ) : (
                  <p className="text-sm text-red-300">✓ No deposit held</p>
                )}
              </div>
              <div className="flex gap-3">
                <button
                  onClick={handleDeactivate}
                  disabled={deactivating || !canDeactivate}
                  className="px-4 py-2 bg-red-600 text-white text-sm rounded-md hover:bg-red-700 disabled:opacity-40"
                >
                  {deactivating ? "Deactivating…" : "Confirm"}
                </button>
                <button
                  onClick={() => setShowDeactivate(false)}
                  className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Bottom padding */}
          <div className="h-8" />
        </div>
      </div>
    </>
  );
}

// ─── Sub-components ───

function StatusBadge({ status }: { status: Tenant["status"] }) {
  if (status === "active")
    return <span className="shrink-0 px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">Active</span>;
  if (status === "upcoming")
    return <span className="shrink-0 px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-700">Upcoming</span>;
  return <span className="shrink-0 px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-500">Inactive</span>;
}

function PanelSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3 pb-2 border-b border-gray-100">
        {title}
      </h3>
      {children}
    </div>
  );
}

function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3">
      <label className="w-24 shrink-0 text-sm text-gray-500 pt-1.5">{label}</label>
      <div className="flex-1 min-w-0">{children}</div>
    </div>
  );
}

function PortalRow({ url, token }: { url: string; token: string }) {
  const [copied, setCopied] = useState(false);
  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* non-HTTPS fallback */ }
  }
  const short = `${token.slice(0, 6)}…${token.slice(-4)}`;
  return (
    <div className="flex items-center gap-3">
      <a
        href={url}
        target="_blank"
        rel="noreferrer"
        className="text-sm text-blue-600 hover:underline font-mono"
        title={url}
      >
        {short}
      </a>
      <button
        onClick={handleCopy}
        className="px-2 py-1 text-xs text-gray-500 border border-gray-200 rounded hover:bg-gray-50"
      >
        {copied ? "Copied!" : "Copy link"}
      </button>
    </div>
  );
}
