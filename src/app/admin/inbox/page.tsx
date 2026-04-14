"use client";

import { useCallback, useEffect, useState } from "react";

type InboxItem = {
  id: string;
  received_at: string;
  from_email: string;
  from_name: string | null;
  subject: string | null;
  body_text: string;
  thread_id: string | null;
  tenant_id: string | null;
  classification: string | null;
  urgency: string;
  draft_subject: string | null;
  draft_body: string | null;
  draft_language: string | null;
  confidence: string | null;
  claude_reasoning: string | null;
  status: string;
  sent_at: string | null;
  created_at: string;
};

type Filter = "all" | "pending" | "sent" | "dismissed";

const CLASSIFICATION_COLORS: Record<string, string> = {
  payment_query: "bg-blue-50 text-blue-700",
  payment_promise: "bg-green-50 text-green-700",
  complaint: "bg-red-50 text-red-700",
  remote_issue: "bg-amber-50 text-amber-700",
  waitlist_enquiry: "bg-purple-50 text-purple-700",
  other: "bg-gray-100 text-gray-600",
};

const URGENCY_COLORS: Record<string, string> = {
  normal: "bg-gray-300",
  needs_attention: "bg-amber-400",
  urgent: "bg-red-500",
};

const CONFIDENCE_COLORS: Record<string, string> = {
  high: "bg-green-50 text-green-700",
  medium: "bg-amber-50 text-amber-700",
  low: "bg-red-50 text-red-700",
};

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export default function InboxPage() {
  const [items, setItems] = useState<InboxItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>("pending");
  const [selected, setSelected] = useState<InboxItem | null>(null);
  const [editSubject, setEditSubject] = useState("");
  const [editBody, setEditBody] = useState("");
  const [editing, setEditing] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  const fetchItems = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/admin/inbox?status=${filter}`);
    if (res.ok) setItems(await res.json());
    setLoading(false);
  }, [filter]);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  function selectItem(item: InboxItem) {
    setSelected(item);
    setEditSubject(item.draft_subject || `Re: ${item.subject || ""}`);
    setEditBody(item.draft_body || "");
    setEditing(false);
  }

  async function handleSend() {
    if (!selected) return;
    setSending(true);
    setError("");

    const res = await fetch("/api/admin/inbox/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        inbox_id: selected.id,
        subject: editSubject,
        body: editBody,
      }),
    });

    if (res.ok) {
      setSelected(null);
      await fetchItems();
    } else {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Failed to send");
    }
    setSending(false);
  }

  async function handleDismiss() {
    if (!selected) return;
    const res = await fetch("/api/admin/inbox", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: selected.id, status: "dismissed" }),
    });
    if (res.ok) {
      setSelected(null);
      await fetchItems();
    }
  }

  const pendingCount = items.filter((i) => i.status === "pending").length;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">
          Inbox
          {filter === "all" && pendingCount > 0 && (
            <span className="ml-2 px-2 py-0.5 bg-amber-100 text-amber-700 rounded-full text-sm font-medium">
              {pendingCount} pending
            </span>
          )}
        </h1>
        {/* Filter tabs */}
        <div className="flex gap-1">
          {(["all", "pending", "sent", "dismissed"] as Filter[]).map((f) => (
            <button
              key={f}
              onClick={() => { setFilter(f); setSelected(null); }}
              className={`px-3 py-1 rounded text-xs font-medium ${
                filter === f
                  ? "bg-blue-50 text-blue-700"
                  : "text-gray-500 hover:bg-gray-100"
              }`}
            >
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 text-red-700 rounded text-sm flex justify-between">
          {error}
          <button onClick={() => setError("")} className="text-red-500">dismiss</button>
        </div>
      )}

      <div className="flex gap-4" style={{ minHeight: "70vh" }}>
        {/* Left: list */}
        <div className={`${selected ? "w-1/2" : "w-full"} transition-all`}>
          {loading ? (
            <div className="text-center py-12 text-gray-500">Loading...</div>
          ) : items.length === 0 ? (
            <div className="bg-white rounded-lg shadow p-8 text-center text-gray-400">
              No {filter === "all" ? "" : filter} emails.
            </div>
          ) : (
            <div className="bg-white rounded-lg shadow divide-y divide-gray-200">
              {items.map((item) => (
                <button
                  key={item.id}
                  onClick={() => selectItem(item)}
                  className={`w-full text-left px-4 py-3 hover:bg-gray-50 transition-colors ${
                    selected?.id === item.id ? "bg-blue-50" : ""
                  }`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    {/* Urgency dot */}
                    <span className={`w-2 h-2 rounded-full shrink-0 ${URGENCY_COLORS[item.urgency] ?? "bg-gray-300"}`} />
                    {/* Sender */}
                    <span className="text-sm font-medium text-gray-900 truncate">
                      {item.from_name || item.from_email || "(unknown sender)"}
                    </span>
                    {/* Classification badge */}
                    {item.classification && (
                      <span className={`px-1.5 py-0.5 rounded text-xs font-medium shrink-0 ${CLASSIFICATION_COLORS[item.classification] ?? "bg-gray-100 text-gray-600"}`}>
                        {item.classification.replace("_", " ")}
                      </span>
                    )}
                    {/* Confidence */}
                    {item.confidence && (
                      <span className={`px-1.5 py-0.5 rounded text-xs shrink-0 ${CONFIDENCE_COLORS[item.confidence] ?? ""}`}>
                        {item.confidence}
                      </span>
                    )}
                    {/* Time */}
                    <span className="text-xs text-gray-400 ml-auto shrink-0">
                      {timeAgo(item.received_at)}
                    </span>
                  </div>
                  <p className="text-sm text-gray-600 truncate">{item.subject || "(no subject)"}</p>
                  <p className="text-xs text-gray-400 truncate mt-0.5">{item.body_text.slice(0, 80)}</p>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Right: detail panel */}
        {selected && (
          <div className="w-1/2 bg-white rounded-lg shadow flex flex-col overflow-hidden">
            {/* Urgent banner */}
            {selected.urgency === "urgent" && (
              <div className="bg-red-600 text-white text-sm font-medium px-4 py-2">
                Urgent — requires immediate attention
              </div>
            )}
            {/* Low confidence warning */}
            {selected.confidence === "low" && (
              <div className="bg-amber-50 border-b border-amber-200 text-amber-700 text-sm px-4 py-2">
                Low confidence — Claude is unsure, please review carefully
              </div>
            )}

            <div className="flex-1 overflow-y-auto">
              {/* Original email */}
              <div className="p-4 border-b border-gray-200">
                <h3 className="text-xs font-medium text-gray-500 uppercase mb-2">Original Email</h3>
                <div className="text-sm mb-1">
                  <span className="font-medium text-gray-700">From:</span>{" "}
                  <span className="text-gray-900">{selected.from_name || "(no name)"} &lt;{selected.from_email || "(no email)"}&gt;</span>
                </div>
                <div className="text-sm mb-2">
                  <span className="font-medium text-gray-700">Subject:</span>{" "}
                  <span className="text-gray-900">{selected.subject || "(no subject)"}</span>
                </div>
                <pre className="text-sm text-gray-700 whitespace-pre-wrap font-sans bg-gray-50 rounded p-3 max-h-48 overflow-y-auto">
                  {selected.body_text || "(empty body)"}
                </pre>
                <p className="text-xs text-gray-300 mt-1">ID: {selected.id}</p>
              </div>

              {/* Draft reply */}
              <div className="p-4 border-b border-gray-200">
                <h3 className="text-xs font-medium text-gray-500 uppercase mb-2">Draft Reply</h3>
                {editing ? (
                  <>
                    <input
                      type="text"
                      value={editSubject}
                      onChange={(e) => setEditSubject(e.target.value)}
                      className="w-full px-3 py-1.5 border border-gray-300 rounded text-sm text-gray-900 mb-2"
                    />
                    <textarea
                      value={editBody}
                      onChange={(e) => setEditBody(e.target.value)}
                      rows={8}
                      className="w-full px-3 py-2 border border-gray-300 rounded text-sm text-gray-900"
                    />
                  </>
                ) : (
                  <>
                    <p className="text-sm font-medium text-gray-900 mb-1">{editSubject}</p>
                    <pre className="text-sm text-gray-700 whitespace-pre-wrap font-sans bg-blue-50 rounded p-3 max-h-48 overflow-y-auto">
                      {editBody || "(no draft generated)"}
                    </pre>
                  </>
                )}
              </div>

              {/* Claude reasoning */}
              {selected.claude_reasoning && (
                <div className="p-4 border-b border-gray-200">
                  <h3 className="text-xs font-medium text-gray-500 uppercase mb-1">Claude&apos;s Reasoning</h3>
                  <p className="text-xs text-gray-500 italic">{selected.claude_reasoning}</p>
                </div>
              )}
            </div>

            {/* Action buttons */}
            {selected.status === "pending" && (
              <div className="p-4 border-t border-gray-200 flex gap-2 bg-gray-50">
                <button
                  onClick={handleSend}
                  disabled={sending || !editBody}
                  className="px-4 py-2 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700 disabled:opacity-50"
                >
                  {sending ? "Sending..." : "Send"}
                </button>
                <button
                  onClick={() => setEditing(!editing)}
                  className="px-4 py-2 text-sm text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
                >
                  {editing ? "Preview" : "Edit"}
                </button>
                <button
                  onClick={handleDismiss}
                  className="px-4 py-2 text-sm text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-md ml-auto"
                >
                  Dismiss
                </button>
              </div>
            )}
            {selected.status === "sent" && (
              <div className="p-4 border-t border-gray-200 bg-green-50 text-sm text-green-700">
                Sent {selected.sent_at ? timeAgo(selected.sent_at) : ""}
              </div>
            )}
            {selected.status === "dismissed" && (
              <div className="p-4 border-t border-gray-200 bg-gray-50 text-sm text-gray-500">
                Dismissed
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
