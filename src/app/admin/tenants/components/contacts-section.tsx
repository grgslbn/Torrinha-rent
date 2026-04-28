"use client";

import { useState } from "react";
import type { Tenant, TenantContact } from "../types";

export default function ContactsSection({
  tenant,
  onChanged,
  onError,
}: {
  tenant: Tenant;
  onChanged: () => void;
  onError: (msg: string) => void;
}) {
  const contacts = tenant.torrinha_tenant_contacts ?? [];
  const [showAdd, setShowAdd] = useState(false);
  const [addForm, setAddForm] = useState({
    label: "", name: "", email: "", phone: "", receives_emails: false, notes: "",
  });
  const [saving, setSaving] = useState(false);

  function setAdd(field: string, value: string | boolean) {
    setAddForm((f) => ({ ...f, [field]: value }));
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const res = await fetch("/api/tenant-contacts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tenant_id: tenant.id, ...addForm }),
    });
    if (res.ok) {
      setShowAdd(false);
      setAddForm({ label: "", name: "", email: "", phone: "", receives_emails: false, notes: "" });
      onChanged();
    } else {
      const data = await res.json().catch(() => ({}));
      onError(data.error || "Failed to add contact");
    }
    setSaving(false);
  }

  async function handleToggleEmails(c: TenantContact) {
    await fetch("/api/tenant-contacts", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: c.id, receives_emails: !c.receives_emails }),
    });
    onChanged();
  }

  async function handleDelete(id: string) {
    const res = await fetch(`/api/tenant-contacts?id=${id}`, { method: "DELETE" });
    if (res.ok) onChanged();
    else {
      const data = await res.json().catch(() => ({}));
      onError(data.error || "Failed to delete contact");
    }
  }

  return (
    <div className="space-y-2">
      {contacts.length === 0 && !showAdd && (
        <p className="text-sm text-t-text-muted">No additional contacts.</p>
      )}

      {contacts.map((c) => (
        <div key={c.id} className="flex items-start gap-3 p-3 border border-t-border rounded-[var(--t-radius-md)]">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-medium text-t-text">{c.name}</span>
              {c.label && (
                <span className="text-xs text-t-text-muted bg-t-bg rounded px-1.5 py-0.5">{c.label}</span>
              )}
            </div>
            {c.email && <p className="text-sm text-t-text-muted truncate mt-0.5">{c.email}</p>}
            {c.phone && <p className="text-sm text-t-text-muted">{c.phone}</p>}
            {c.notes && <p className="text-xs text-t-text-muted mt-0.5">{c.notes}</p>}
          </div>
          <div className="flex items-center gap-2 shrink-0 pt-0.5">
            <label className="flex items-center gap-1 text-xs text-t-text-muted cursor-pointer" title="CC on tenant emails">
              <input
                type="checkbox"
                checked={c.receives_emails}
                onChange={() => handleToggleEmails(c)}
                className="accent-[var(--t-accent)]"
              />
              CC
            </label>
            <button
              onClick={() => handleDelete(c.id)}
              className="text-red-400 hover:text-red-600 text-xs leading-none"
              title="Remove contact"
            >
              ✕
            </button>
          </div>
        </div>
      ))}

      {showAdd ? (
        <form
          onSubmit={handleAdd}
          className="border border-dashed border-t-border rounded-[var(--t-radius-md)] p-3 space-y-2"
        >
          <p className="text-xs font-medium text-t-text-muted">New contact</p>
          <div className="grid grid-cols-2 gap-2">
            <input
              placeholder="Label (e.g. spouse)"
              value={addForm.label}
              onChange={(e) => setAdd("label", e.target.value)}
              className="px-2 py-1.5 border border-t-border rounded-[var(--t-radius-sm)] text-sm text-t-text focus:outline-none focus:ring-1 focus:ring-t-accent"
            />
            <input
              placeholder="Name *"
              value={addForm.name}
              onChange={(e) => setAdd("name", e.target.value)}
              required
              className="px-2 py-1.5 border border-t-border rounded-[var(--t-radius-sm)] text-sm text-t-text focus:outline-none focus:ring-1 focus:ring-t-accent"
            />
            <input
              type="email"
              placeholder="Email"
              value={addForm.email}
              onChange={(e) => setAdd("email", e.target.value)}
              className="px-2 py-1.5 border border-t-border rounded-[var(--t-radius-sm)] text-sm text-t-text focus:outline-none focus:ring-1 focus:ring-t-accent"
            />
            <input
              type="tel"
              placeholder="Phone"
              value={addForm.phone}
              onChange={(e) => setAdd("phone", e.target.value)}
              className="px-2 py-1.5 border border-t-border rounded-[var(--t-radius-sm)] text-sm text-t-text focus:outline-none focus:ring-1 focus:ring-t-accent"
            />
          </div>
          <input
            placeholder="Notes"
            value={addForm.notes}
            onChange={(e) => setAdd("notes", e.target.value)}
            className="w-full px-2 py-1.5 border border-t-border rounded-[var(--t-radius-sm)] text-sm text-t-text focus:outline-none focus:ring-1 focus:ring-t-accent"
          />
          <label className="flex items-center gap-2 text-sm text-t-text-secondary cursor-pointer">
            <input
              type="checkbox"
              checked={addForm.receives_emails}
              onChange={(e) => setAdd("receives_emails", e.target.checked)}
              className="accent-[var(--t-accent)]"
            />
            CC on tenant emails
          </label>
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={saving}
              className="px-3 py-1.5 bg-t-accent text-white text-sm rounded-[var(--t-radius-sm)] hover:bg-t-accent-hover disabled:opacity-50 transition-colors"
            >
              {saving ? "Adding…" : "Add contact"}
            </button>
            <button
              type="button"
              onClick={() => setShowAdd(false)}
              className="px-3 py-1.5 text-sm text-t-text-muted hover:text-t-text"
            >
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <button
          onClick={() => setShowAdd(true)}
          className="text-sm text-t-accent hover:text-t-accent-hover hover:underline"
        >
          + Add contact
        </button>
      )}
    </div>
  );
}
