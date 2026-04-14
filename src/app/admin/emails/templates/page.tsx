"use client";

import { useCallback, useEffect, useState } from "react";

type Template = {
  id: string;
  key: string;
  label: string;
  subject: string;
  body: string;
  language: string;
  updated_at: string;
};

const PLACEHOLDER_HINTS: Record<string, string> = {
  payment_thankyou_pt: "{{tenant_name}}, {{amount}}, {{month}}",
  payment_thankyou_en: "{{tenant_name}}, {{amount}}, {{month}}",
  payment_reminder_pt: "{{tenant_name}}, {{amount}}, {{month}}",
  payment_reminder_en: "{{tenant_name}}, {{amount}}, {{month}}",
  owner_alert_unpaid: "{{month}}, {{count}}, {{tenant_list}}",
  owner_alert_overdue: "{{month}}, {{count}}, {{tenant_list}}",
  waitlist_confirmation_pt: "{{tenant_name}}",
  waitlist_confirmation_en: "{{tenant_name}}",
};

export default function TemplatesPage() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Template | null>(null);
  const [editSubject, setEditSubject] = useState("");
  const [editBody, setEditBody] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  const fetchTemplates = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/admin/email-templates");
    if (res.ok) setTemplates(await res.json());
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchTemplates();
  }, [fetchTemplates]);

  function selectTemplate(t: Template) {
    setSelected(t);
    setEditSubject(t.subject);
    setEditBody(t.body);
    setSaved(false);
    setError("");
  }

  async function handleSave() {
    if (!selected) return;
    setSaving(true);
    setSaved(false);
    setError("");

    const res = await fetch("/api/admin/email-templates", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: selected.id,
        subject: editSubject,
        body: editBody,
      }),
    });

    if (res.ok) {
      setSaved(true);
      await fetchTemplates();
      // Update selected with new values
      setSelected((prev) =>
        prev ? { ...prev, subject: editSubject, body: editBody } : null
      );
    } else {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Failed to save");
    }
    setSaving(false);
  }

  const hasChanges =
    selected &&
    (editSubject !== selected.subject || editBody !== selected.body);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Email Templates</h1>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 text-red-700 rounded text-sm">
          {error}
          <button onClick={() => setError("")} className="ml-2 text-red-500">
            dismiss
          </button>
        </div>
      )}

      <div className="flex gap-4" style={{ minHeight: "70vh" }}>
        {/* Left: template list */}
        <div className="w-1/3 shrink-0">
          {loading ? (
            <div className="text-center py-12 text-gray-500">Loading...</div>
          ) : (
            <div className="bg-white rounded-lg shadow divide-y divide-gray-200">
              {templates.map((t) => (
                <button
                  key={t.id}
                  onClick={() => selectTemplate(t)}
                  className={`w-full text-left px-4 py-3 hover:bg-gray-50 transition-colors ${
                    selected?.id === t.id ? "bg-blue-50" : ""
                  }`}
                >
                  <p className="text-sm font-medium text-gray-900">
                    {t.label}
                  </p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {t.key}
                    <span className="ml-2 px-1.5 py-0.5 rounded bg-gray-100 text-gray-500 text-xs">
                      {t.language.toUpperCase()}
                    </span>
                  </p>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Right: editor */}
        {selected ? (
          <div className="flex-1 bg-white rounded-lg shadow p-5 flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">
                  {selected.label}
                </h2>
                <p className="text-xs text-gray-400">{selected.key}</p>
              </div>
              <span className="px-2 py-0.5 rounded bg-gray-100 text-gray-600 text-xs font-medium">
                {selected.language.toUpperCase()}
              </span>
            </div>

            <div className="mb-4">
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Subject
              </label>
              <input
                type="text"
                value={editSubject}
                onChange={(e) => {
                  setEditSubject(e.target.value);
                  setSaved(false);
                }}
                className="w-full px-3 py-1.5 border border-gray-300 rounded text-sm text-gray-900"
              />
            </div>

            <div className="mb-3 flex-1 flex flex-col">
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Body
              </label>
              <textarea
                value={editBody}
                onChange={(e) => {
                  setEditBody(e.target.value);
                  setSaved(false);
                }}
                className="flex-1 w-full px-3 py-2 border border-gray-300 rounded text-sm text-gray-900 font-mono"
                style={{ minHeight: "250px" }}
              />
            </div>

            <p className="text-xs text-gray-400 mb-4">
              Available placeholders:{" "}
              <code className="bg-gray-100 px-1 rounded">
                {PLACEHOLDER_HINTS[selected.key] || "{{tenant_name}}, {{amount}}, {{month}}"}
              </code>
            </p>

            <div className="flex items-center gap-3">
              <button
                onClick={handleSave}
                disabled={saving || !hasChanges}
                className="px-4 py-2 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700 disabled:opacity-50"
              >
                {saving ? "Saving..." : "Save"}
              </button>
              {saved && (
                <span className="text-sm text-green-600">Saved</span>
              )}
              {hasChanges && !saved && (
                <span className="text-xs text-amber-600">Unsaved changes</span>
              )}
            </div>
          </div>
        ) : (
          <div className="flex-1 bg-white rounded-lg shadow flex items-center justify-center text-gray-400 text-sm">
            Select a template to edit
          </div>
        )}
      </div>
    </div>
  );
}
