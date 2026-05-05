"use client";

import { useCallback, useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";

type EmailLogEntry = {
  id: string;
  direction: "outbound" | "inbound";
  template: string | null;
  to_email: string;
  from_email: string;
  subject: string;
  body: string;
  sent_at: string;
  status?: string | null;
  metadata: Record<string, unknown> | null;
};

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function preview(body: string): string {
  return body.length > 180 ? body.slice(0, 180) + "…" : body;
}

export default function CommunicationsSection({ tenantId }: { tenantId: string }) {
  const [entries, setEntries] = useState<EmailLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const fetchEntries = useCallback(async () => {
    const res = await fetch(`/api/email-log?tenant_id=${tenantId}&limit=20`);
    if (res.ok) setEntries(await res.json());
    setLoading(false);
  }, [tenantId]);

  useEffect(() => { fetchEntries(); }, [fetchEntries]);

  function toggleExpand(id: string) {
    setExpandedIds((s) => {
      const next = new Set(s);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  if (loading) return <p className="text-sm text-t-text-muted">Loading…</p>;
  if (entries.length === 0) return <p className="text-sm text-t-text-muted">No communications logged yet.</p>;

  return (
    <div className="space-y-3">
      {entries.map((e) => {
        const expanded = expandedIds.has(e.id);
        const isPersonalised = e.metadata?.personalised === true;
        const isDryRun = e.status === "dry_run" || (!e.status && e.metadata?.dry_run === true);
        const isApproved = e.status === "approved";
        const templateLabel = e.template
          ? e.template.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
          : null;

        return (
          <div key={e.id} className="border border-t-border rounded-[var(--t-radius-md)] p-3 space-y-1.5">
            <div className="flex items-start justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-2 flex-wrap">
                <Badge variant={e.direction === "inbound" ? "info" : "neutral"}>
                  {e.direction === "inbound" ? "Inbound" : "Outbound"}
                </Badge>
                {templateLabel && (
                  <Badge variant="neutral">{templateLabel}</Badge>
                )}
                {isPersonalised && (
                  <Badge variant="accent">AI</Badge>
                )}
                {isApproved && (
                  <Badge variant="success">Approved &amp; sent</Badge>
                )}
                {isDryRun && !isApproved && (
                  <Badge variant="warning">Dry run (pending)</Badge>
                )}
              </div>
              <span className="text-xs text-t-text-muted shrink-0">{formatDate(e.sent_at)}</span>
            </div>

            <p className="text-xs font-medium text-t-text truncate">{e.subject}</p>

            <div className={`text-xs text-t-text-muted whitespace-pre-wrap ${expanded ? "" : ""}`}>
              {expanded ? e.body : preview(e.body)}
            </div>

            {e.body.length > 180 && (
              <button
                onClick={() => toggleExpand(e.id)}
                className="text-xs text-t-accent hover:text-t-accent-hover"
              >
                {expanded ? "Show less" : "Show full email"}
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
