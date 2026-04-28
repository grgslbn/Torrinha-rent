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
        <p className="text-sm text-gray-400">No additional contacts.</p>
      )}

      {contacts.map((c) => (
        <div key={c.id} className="flex items-start gap-3 p-3 border border-gray-100 rounded-lg">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-medium text-gray-900">{c.name}</span>
              {c.label && (
                <span className="text-xs text-gray-500 bg-gray-100 rounded px-1.5 py-0.5">{c.label}</span>
              )}
            </div>
            {c.email && <p className="text-sm text-gray-500 truncate mt-0.5">{c.email}</p>}
            {c.phone && <p className="text-sm text-gray-500">{c.phone}</p>}
            {c.notes && <p className="text-xs text-gray-400 mt-0.5">{c.notes}</p>}
          </div>
          <div className="flex items-center gap-2 shrink-0 pt-0.5">
            <label className="flex items-center gap-1 text-xs text-gray-500 cursor-pointer" title="CC on tenant emails">
              <input
                type="checkbox"
                checked={c.receives_emails}
                onChange={() => handleToggleEmails(c)}
                className="accent-blue-600"
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
          className="border border-dashed border-gray-300 rounded-lg p-3 space-y-2"
        >
          <p className="text-xs font-medium text-gray-600">New contact</p>
          <div className="grid grid-cols-2 gap-2">
            <input
              placeholder="Label (e.g. spouse)"
              value={addForm.label}
              onChange={(e) => setAdd("label", e.target.value)}
              className="px-2 py-1.5 border border-gray-200 rounded text-sm text-gray-900 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            <input
              placeholder="Name *"
              value={addForm.name}
              onChange={(e) => setAdd("name", e.target.value)}
              required
              className="px-2 py-1.5 border border-gray-200 rounded text-sm text-gray-900 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            <input
              type="email"
              placeholder="Email"
              value={addForm.email}
              onChange={(e) => setAdd("email", e.target.value)}
              className="px-2 py-1.5 border border-gray-200 rounded text-sm text-gray-900 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            <input
              type="tel"
              placeholder="Phone"
              value={addForm.phone}
              onChange={(e) => setAdd("phone", e.target.value)}
              className="px-2 py-1.5 border border-gray-200 rounded text-sm text-gray-900 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
          <input
            placeholder="Notes"
            value={addForm.notes}
            onChange={(e) => setAdd("notes", e.target.value)}
            className="w-full px-2 py-1.5 border border-gray-200 rounded text-sm text-gray-900 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
            <input
              type="checkbox"
              checked={addForm.receives_emails}
              onChange={(e) => setAdd("receives_emails", e.target.checked)}
              className="accent-blue-600"
            />
            CC on tenant emails
          </label>
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={saving}
              className="px-3 py-1.5 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 disabled:opacity-50"
            >
              {saving ? "Adding…" : "Add contact"}
            </button>
            <button
              type="button"
              onClick={() => setShowAdd(false)}
              className="px-3 py-1.5 text-sm text-gray-500 hover:text-gray-700"
            >
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <button
          onClick={() => setShowAdd(true)}
          className="text-sm text-blue-600 hover:text-blue-800 hover:underline"
        >
          + Add contact
        </button>
      )}
    </div>
  );
}
