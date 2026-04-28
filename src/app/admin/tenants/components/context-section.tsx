"use client";

import { useCallback, useEffect, useState } from "react";
import type { Tenant } from "../types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

type ContextType = "relationship" | "communication" | "agreement" | "note" | "other";

type ContextEntry = {
  id: string;
  tenant_id: string;
  type: ContextType;
  title: string;
  content: string;
  added_by: string;
  created_at: string;
  updated_at: string;
};

const TYPE_LABELS: Record<ContextType, string> = {
  relationship: "Relationship",
  communication: "Communication",
  agreement: "Agreement",
  note: "Note",
  other: "Other",
};

const TYPE_VARIANTS: Record<ContextType, "accent" | "info" | "warning" | "neutral" | "success"> = {
  relationship: "accent",
  communication: "info",
  agreement: "warning",
  note: "neutral",
  other: "neutral",
};

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

export default function ContextSection({
  tenant,
  onError,
}: {
  tenant: Tenant;
  onError: (msg: string) => void;
}) {
  const [entries, setEntries] = useState<ContextEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [editingId, setEditingId] = useState<string | null>(null);

  const fetchEntries = useCallback(async () => {
    const res = await fetch(`/api/tenant-context?tenant_id=${tenant.id}`);
    if (res.ok) setEntries(await res.json());
    setLoading(false);
  }, [tenant.id]);

  useEffect(() => { fetchEntries(); }, [fetchEntries]);

  function toggleExpand(id: string) {
    setExpandedIds((s) => {
      const next = new Set(s);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  async function handleDelete(id: string) {
    const res = await fetch(`/api/tenant-context?id=${id}`, { method: "DELETE" });
    if (res.ok) fetchEntries();
    else {
      const d = await res.json().catch(() => ({}));
      onError(d.error || "Failed to delete context entry");
    }
  }

  if (loading) return <p className="text-sm text-t-text-muted">Loading…</p>;

  return (
    <div className="space-y-3">
      {entries.length === 0 && !showAdd && (
        <p className="text-sm text-t-text-muted">No context added yet.</p>
      )}

      {entries.map((entry) => {
        const expanded = expandedIds.has(entry.id);
        const isEditing = editingId === entry.id;

        if (isEditing) {
          return (
            <EditEntryForm
              key={entry.id}
              entry={entry}
              onSaved={() => { setEditingId(null); fetchEntries(); }}
              onCancel={() => setEditingId(null)}
              onError={onError}
            />
          );
        }

        return (
          <div key={entry.id} className="border border-t-border rounded-[var(--t-radius-md)] p-3 space-y-1.5">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2 flex-wrap">
                <Badge variant={TYPE_VARIANTS[entry.type as ContextType] ?? "neutral"}>
                  {TYPE_LABELS[entry.type as ContextType] ?? entry.type}
                </Badge>
                <span className="text-sm font-medium text-t-text">{entry.title}</span>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-xs text-t-text-muted">{formatDate(entry.created_at)}</span>
                <button
                  onClick={() => setEditingId(entry.id)}
                  className="text-xs text-t-text-muted hover:text-t-text transition-colors"
                >
                  Edit
                </button>
                <button
                  onClick={() => handleDelete(entry.id)}
                  className="text-xs text-red-400 hover:text-red-600 transition-colors"
                >
                  Delete
                </button>
              </div>
            </div>

            <div
              className={`text-sm text-t-text-muted whitespace-pre-wrap ${expanded ? "" : "line-clamp-3"}`}
            >
              {entry.content}
            </div>

            {entry.content.length > 200 && (
              <button
                onClick={() => toggleExpand(entry.id)}
                className="text-xs text-t-accent hover:text-t-accent-hover"
              >
                {expanded ? "Show less" : "Show more"}
              </button>
            )}
          </div>
        );
      })}

      {showAdd ? (
        <AddEntryForm
          tenantId={tenant.id}
          onSaved={() => { setShowAdd(false); fetchEntries(); }}
          onCancel={() => setShowAdd(false)}
          onError={onError}
        />
      ) : (
        <button
          onClick={() => setShowAdd(true)}
          className="text-sm text-t-accent hover:text-t-accent-hover hover:underline"
        >
          + Add context
        </button>
      )}
    </div>
  );
}

// ─── Add entry form ───

function AddEntryForm({
  tenantId,
  onSaved,
  onCancel,
  onError,
}: {
  tenantId: string;
  onSaved: () => void;
  onCancel: () => void;
  onError: (msg: string) => void;
}) {
  const [type, setType] = useState<ContextType>("note");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !content.trim()) return;
    setSaving(true);
    const res = await fetch("/api/tenant-context", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tenant_id: tenantId, type, title, content }),
    });
    if (res.ok) onSaved();
    else {
      const d = await res.json().catch(() => ({}));
      onError(d.error || "Failed to add context");
    }
    setSaving(false);
  }

  return (
    <ContextForm
      type={type} title={title} content={content}
      onTypeChange={setType} onTitleChange={setTitle} onContentChange={setContent}
      onSubmit={handleSubmit} onCancel={onCancel}
      saving={saving} submitLabel="Save"
    />
  );
}

// ─── Edit entry form ───

function EditEntryForm({
  entry,
  onSaved,
  onCancel,
  onError,
}: {
  entry: ContextEntry;
  onSaved: () => void;
  onCancel: () => void;
  onError: (msg: string) => void;
}) {
  const [type, setType] = useState<ContextType>(entry.type as ContextType);
  const [title, setTitle] = useState(entry.title);
  const [content, setContent] = useState(entry.content);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const res = await fetch("/api/tenant-context", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: entry.id, type, title, content }),
    });
    if (res.ok) onSaved();
    else {
      const d = await res.json().catch(() => ({}));
      onError(d.error || "Failed to update context");
    }
    setSaving(false);
  }

  return (
    <ContextForm
      type={type} title={title} content={content}
      onTypeChange={setType} onTitleChange={setTitle} onContentChange={setContent}
      onSubmit={handleSubmit} onCancel={onCancel}
      saving={saving} submitLabel="Update"
    />
  );
}

// ─── Shared form layout ───

function ContextForm({
  type, title, content,
  onTypeChange, onTitleChange, onContentChange,
  onSubmit, onCancel, saving, submitLabel,
}: {
  type: ContextType;
  title: string;
  content: string;
  onTypeChange: (v: ContextType) => void;
  onTitleChange: (v: string) => void;
  onContentChange: (v: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  onCancel: () => void;
  saving: boolean;
  submitLabel: string;
}) {
  const INPUT = "w-full px-2 py-1.5 border border-t-border rounded-[var(--t-radius-md)] text-sm text-t-text bg-t-surface focus:outline-none focus:ring-1 focus:ring-t-accent";

  return (
    <form
      onSubmit={onSubmit}
      className="border border-dashed border-t-border rounded-[var(--t-radius-lg)] p-3 space-y-2.5"
    >
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-xs text-t-text-muted block mb-1">Type</label>
          <select
            value={type}
            onChange={(e) => onTypeChange(e.target.value as ContextType)}
            className={INPUT}
          >
            {Object.entries(TYPE_LABELS).map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-xs text-t-text-muted block mb-1">Title *</label>
          <input
            type="text"
            value={title}
            onChange={(e) => onTitleChange(e.target.value)}
            placeholder="e.g. Previous email thread Oct 2024"
            required
            className={INPUT}
          />
        </div>
      </div>
      <div>
        <label className="text-xs text-t-text-muted block mb-1">Content *</label>
        <textarea
          value={content}
          onChange={(e) => onContentChange(e.target.value)}
          placeholder="Paste emails, notes, agreements…"
          required
          rows={10}
          className={`${INPUT} resize-y`}
        />
      </div>
      <div className="flex gap-2">
        <Button type="submit" disabled={saving} size="sm">
          {saving ? "Saving…" : submitLabel}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
