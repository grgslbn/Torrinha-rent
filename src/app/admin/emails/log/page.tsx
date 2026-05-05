"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";

type EmailLogRow = {
  id: string;
  tenant_id: string | null;
  direction: "outbound" | "inbound";
  template: string | null;
  to_email: string;
  from_email: string;
  subject: string;
  body: string;
  sent_at: string;
  status: string | null;
  approval_token: string | null;
  metadata: Record<string, unknown> | null;
  torrinha_tenants: { name: string } | null;
};

type Filters = {
  direction: string;
  template: string;
  status: string;
  from: string;
  to: string;
};

const PAGE_SIZE = 50;

function todayStr() {
  return new Date().toISOString().split("T")[0];
}

function daysAgoStr(n: number) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().split("T")[0];
}

function formatDatetime(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatTemplate(t: string | null): string {
  if (!t) return "—";
  return t.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function EmailLogPage() {
  const [filters, setFilters] = useState<Filters>({
    direction: "",
    template: "",
    status: "",
    from: daysAgoStr(30),
    to: todayStr(),
  });
  const [draft, setDraft] = useState<Filters>({ ...filters });
  const [offset, setOffset] = useState(0);
  const [rows, setRows] = useState<EmailLogRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [approvingIds, setApprovingIds] = useState<Set<string>>(new Set());
  const [approvedIds, setApprovedIds] = useState<Set<string>>(new Set());

  const fetchLog = useCallback(async (f: Filters, off: number) => {
    setLoading(true);
    setError("");
    const params = new URLSearchParams();
    if (f.direction) params.set("direction", f.direction);
    if (f.template) params.set("template", f.template);
    if (f.status) params.set("status", f.status);
    if (f.from) params.set("from", f.from);
    if (f.to) params.set("to", f.to);
    params.set("limit", String(PAGE_SIZE));
    params.set("offset", String(off));

    const res = await fetch(`/api/email-log?${params.toString()}`);
    if (res.ok) {
      const json = await res.json();
      setRows(json.data ?? []);
      setTotal(json.total ?? 0);
    } else {
      const json = await res.json().catch(() => ({}));
      setError(json.error || "Failed to load email log");
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchLog(filters, offset);
  }, [fetchLog, filters, offset]);

  function applyFilters(e: React.FormEvent) {
    e.preventDefault();
    setOffset(0);
    setFilters({ ...draft });
  }

  function toggleExpand(id: string) {
    setExpandedIds((s) => {
      const next = new Set(s);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  async function approveEmail(row: EmailLogRow) {
    if (!row.approval_token) return;
    setApprovingIds((s) => new Set(s).add(row.id));
    try {
      const res = await fetch(`/api/email-approve?token=${row.approval_token}`);
      if (res.ok) {
        setApprovedIds((s) => new Set(s).add(row.id));
        setRows((prev) =>
          prev.map((r) => (r.id === row.id ? { ...r, status: "approved" } : r))
        );
      } else {
        alert("Approval failed. Check the email log for details.");
      }
    } catch {
      alert("Network error during approval.");
    }
    setApprovingIds((s) => {
      const next = new Set(s);
      next.delete(row.id);
      return next;
    });
  }

  const totalPages = Math.ceil(total / PAGE_SIZE);
  const currentPage = Math.floor(offset / PAGE_SIZE) + 1;
  const showFrom = total === 0 ? 0 : offset + 1;
  const showTo = Math.min(offset + PAGE_SIZE, total);

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold text-t-text">Emails</h1>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 mb-6 border-b border-t-border">
        <Link
          href="/admin/emails"
          className="px-4 py-2 text-sm font-medium text-t-text-muted hover:text-t-text -mb-px"
        >
          Templates
        </Link>
        <span className="px-4 py-2 text-sm font-medium text-t-accent border-b-2 border-t-accent -mb-px">
          Log
        </span>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 text-red-700 rounded text-sm">{error}</div>
      )}

      {/* Filters */}
      <form
        onSubmit={applyFilters}
        className="bg-t-surface border border-t-border rounded-[var(--t-radius-lg)] p-4 mb-4 flex flex-wrap items-end gap-3"
      >
        <div>
          <label className="block text-xs font-medium text-t-text-muted mb-1">Direction</label>
          <select
            value={draft.direction}
            onChange={(e) => setDraft((d) => ({ ...d, direction: e.target.value }))}
            className="px-2 py-1.5 border border-t-border rounded-[var(--t-radius-sm)] text-sm text-t-text"
          >
            <option value="">All</option>
            <option value="outbound">Outbound</option>
            <option value="inbound">Inbound</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-t-text-muted mb-1">Template</label>
          <select
            value={draft.template}
            onChange={(e) => setDraft((d) => ({ ...d, template: e.target.value }))}
            className="px-2 py-1.5 border border-t-border rounded-[var(--t-radius-sm)] text-sm text-t-text"
          >
            <option value="">All</option>
            <option value="thank-you">Thank-you</option>
            <option value="reminder">Reminder</option>
            <option value="owner-unpaid">Owner alert</option>
            <option value="owner-overdue">Owner escalation</option>
            <option value="waitlist-confirmation">Waitlist</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-t-text-muted mb-1">Status</label>
          <select
            value={draft.status}
            onChange={(e) => setDraft((d) => ({ ...d, status: e.target.value }))}
            className="px-2 py-1.5 border border-t-border rounded-[var(--t-radius-sm)] text-sm text-t-text"
          >
            <option value="">All</option>
            <option value="sent">Sent</option>
            <option value="dry_run">Dry run</option>
            <option value="approved">Approved</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-t-text-muted mb-1">From</label>
          <input
            type="date"
            value={draft.from}
            onChange={(e) => setDraft((d) => ({ ...d, from: e.target.value }))}
            className="px-2 py-1.5 border border-t-border rounded-[var(--t-radius-sm)] text-sm text-t-text"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-t-text-muted mb-1">To</label>
          <input
            type="date"
            value={draft.to}
            onChange={(e) => setDraft((d) => ({ ...d, to: e.target.value }))}
            className="px-2 py-1.5 border border-t-border rounded-[var(--t-radius-sm)] text-sm text-t-text"
          />
        </div>
        <button
          type="submit"
          className="ml-auto px-4 py-1.5 text-sm bg-t-accent text-white rounded-[var(--t-radius-sm)] hover:bg-t-accent-hover"
        >
          Filter
        </button>
      </form>

      {/* Table */}
      <div className="bg-t-surface border border-t-border rounded-[var(--t-radius-lg)] overflow-x-auto mb-4">
        {loading ? (
          <div className="text-center py-12 text-t-text-muted">Loading…</div>
        ) : rows.length === 0 ? (
          <div className="text-center py-12 text-t-text-muted text-sm">No emails in this range.</div>
        ) : (
          <table className="min-w-full divide-y divide-t-border">
            <thead className="bg-t-bg">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-t-text-muted uppercase w-5" />
                <th className="px-4 py-3 text-left text-xs font-medium text-t-text-muted uppercase">Date</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-t-text-muted uppercase">Dir</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-t-text-muted uppercase">Template</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-t-text-muted uppercase">Tenant</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-t-text-muted uppercase">To</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-t-text-muted uppercase">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-t-border">
              {rows.map((row) => {
                const expanded = expandedIds.has(row.id);
                const effectiveStatus = approvedIds.has(row.id) ? "approved" : row.status;

                return [
                  <tr
                    key={row.id}
                    onClick={() => toggleExpand(row.id)}
                    className="hover:bg-t-bg cursor-pointer"
                  >
                    <td className="px-4 py-2 text-t-text-muted text-xs select-none">
                      {expanded ? "▼" : "▶"}
                    </td>
                    <td className="px-4 py-2 text-sm text-t-text-muted whitespace-nowrap">
                      {formatDatetime(row.sent_at)}
                    </td>
                    <td className="px-4 py-2">
                      <Badge variant={row.direction === "inbound" ? "info" : "neutral"}>
                        {row.direction === "inbound" ? "In" : "Out"}
                      </Badge>
                    </td>
                    <td className="px-4 py-2 text-sm text-t-text-secondary">
                      {formatTemplate(row.template)}
                    </td>
                    <td className="px-4 py-2 text-sm text-t-text-secondary">
                      {row.torrinha_tenants?.name ?? "—"}
                    </td>
                    <td
                      className="px-4 py-2 text-sm text-t-text-secondary max-w-[180px] truncate"
                      title={row.to_email}
                    >
                      {row.to_email}
                    </td>
                    <td className="px-4 py-2">
                      {effectiveStatus === "sent" && <Badge variant="success">Sent</Badge>}
                      {effectiveStatus === "dry_run" && <Badge variant="warning">Dry run</Badge>}
                      {effectiveStatus === "approved" && <Badge variant="success">Approved</Badge>}
                      {!effectiveStatus && <span className="text-t-text-muted text-xs">—</span>}
                    </td>
                  </tr>,
                  expanded && (
                    <tr key={`${row.id}-expand`} className="bg-t-bg">
                      <td />
                      <td colSpan={6} className="px-4 pb-4 pt-2">
                        <div className="border border-t-border rounded-[var(--t-radius-md)] p-4 text-sm">
                          <p className="font-medium text-t-text mb-3">{row.subject}</p>
                          <pre className="whitespace-pre-wrap font-sans text-t-text-secondary leading-relaxed">
                            {row.body}
                          </pre>
                          {effectiveStatus === "dry_run" && row.approval_token && (
                            <div className="mt-4 flex items-center gap-3">
                              <button
                                onClick={(e) => { e.stopPropagation(); approveEmail(row); }}
                                disabled={approvingIds.has(row.id)}
                                className="px-3 py-1.5 text-xs bg-t-accent text-white rounded-[var(--t-radius-sm)] hover:bg-t-accent-hover disabled:opacity-50"
                              >
                                {approvingIds.has(row.id) ? "Sending…" : "Approve & send ✓"}
                              </button>
                            </div>
                          )}
                          {effectiveStatus === "approved" && (
                            <p className="mt-3 text-xs text-t-text-muted">Approved &amp; sent.</p>
                          )}
                        </div>
                      </td>
                    </tr>
                  ),
                ];
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      {!loading && total > 0 && (
        <div className="flex items-center justify-between text-sm text-t-text-muted">
          <span>
            Showing {showFrom}–{showTo} of {total}
          </span>
          <div className="flex gap-2">
            <button
              onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
              disabled={offset === 0}
              className="px-3 py-1.5 border border-t-border rounded-[var(--t-radius-sm)] text-t-text disabled:opacity-40 hover:bg-t-bg"
            >
              ← Previous
            </button>
            <span className="px-3 py-1.5 text-t-text-muted">
              {currentPage} / {totalPages}
            </span>
            <button
              onClick={() => setOffset(offset + PAGE_SIZE)}
              disabled={offset + PAGE_SIZE >= total}
              className="px-3 py-1.5 border border-t-border rounded-[var(--t-radius-sm)] text-t-text disabled:opacity-40 hover:bg-t-bg"
            >
              Next →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
