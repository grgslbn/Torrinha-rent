"use client";

import { useState, useMemo } from "react";

type Template =
  | "thank-you"
  | "reminder"
  | "owner-unpaid"
  | "owner-overdue"
  | "waitlist-confirmation";

const TEMPLATES: { value: Template; label: string }[] = [
  { value: "thank-you", label: "Thank-you (payment confirmed)" },
  { value: "reminder", label: "Payment reminder (day 8)" },
  { value: "owner-unpaid", label: "Owner alert — unpaid list (day 5)" },
  { value: "owner-overdue", label: "Owner escalation — overdue list (day 15)" },
  { value: "waitlist-confirmation", label: "Waitlist confirmation" },
];

function currentMonthStr(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function formatMonth(month: string, lang: string): string {
  const [y, m] = month.split("-");
  const ptMonths = [
    "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
    "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
  ];
  const enMonths = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ];
  const months = lang === "pt" ? ptMonths : enMonths;
  return `${months[parseInt(m, 10) - 1]} ${y}`;
}

function generatePreview(
  template: Template,
  lang: string
): { subject: string; body: string } {
  const isPt = lang === "pt";
  const month = currentMonthStr();
  const monthStr = formatMonth(month, lang);
  const name = "João Silva";
  const amount = 150;

  switch (template) {
    case "thank-you": {
      const subject = isPt
        ? `Torrinha — Pagamento recebido (${monthStr})`
        : `Torrinha — Payment received (${monthStr})`;
      const body = isPt
        ? `Olá ${name},\n\nConfirmamos a receção do seu pagamento de €${amount} referente a ${monthStr}.\n\nObrigado!\nTorrinha Parking`
        : `Hi ${name},\n\nWe confirm receipt of your payment of €${amount} for ${monthStr}.\n\nThank you!\nTorrinha Parking`;
      return { subject, body };
    }
    case "reminder": {
      const subject = isPt
        ? `Torrinha — Lembrete de pagamento (${monthStr})`
        : `Torrinha — Payment reminder (${monthStr})`;
      const body = isPt
        ? `Olá ${name},\n\nEste é um lembrete amigável de que a sua renda de €${amount} referente a ${monthStr} ainda não foi recebida.\n\nPor favor proceda ao pagamento assim que possível.\n\nObrigado!\nTorrinha Parking`
        : `Hi ${name},\n\nThis is a friendly reminder that your rent of €${amount} for ${monthStr} has not yet been received.\n\nPlease arrange payment at your earliest convenience.\n\nThank you!\nTorrinha Parking`;
      return { subject, body };
    }
    case "owner-unpaid": {
      const lines = [
        `  - João Silva (Spot 7) — €150`,
        `  - Maria Santos (Spot 3) — €200`,
      ];
      const subject = `Torrinha — 2 unpaid for ${monthStr}`;
      const body = `Hi,\n\nThe following tenants have not yet paid for ${monthStr}:\n\n${lines.join("\n")}\n\nTorrinha Parking`;
      return { subject, body };
    }
    case "owner-overdue": {
      const lines = [
        `  - João Silva (Spot 7) — €150`,
        `  - Maria Santos (Spot 3) — €200`,
      ];
      const subject = `Torrinha — 2 OVERDUE for ${monthStr}`;
      const body = `Hi,\n\nThe following tenants are now overdue for ${monthStr}:\n\n${lines.join("\n")}\n\nThese payments have been marked as overdue in the system.\n\nTorrinha Parking`;
      return { subject, body };
    }
    case "waitlist-confirmation": {
      const subject = isPt
        ? `Torrinha — Inscrição na lista de espera confirmada`
        : `Torrinha — Waitlist registration confirmed`;
      const body = isPt
        ? `Olá ${name},\n\nA sua inscrição na lista de espera do Torrinha Parking foi registada com sucesso.\n\nEntraremos em contacto assim que houver um lugar disponível.\n\nObrigado!\nTorrinha Parking`
        : `Hi ${name},\n\nYour registration on the Torrinha Parking waitlist has been confirmed.\n\nWe will contact you as soon as a spot becomes available.\n\nThank you!\nTorrinha Parking`;
      return { subject, body };
    }
  }
}

export default function EmailsPage() {
  const [template, setTemplate] = useState<Template>("thank-you");
  const [language, setLanguage] = useState<"pt" | "en">("pt");
  const [recipient, setRecipient] = useState("");
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState<{
    ok: boolean;
    message: string;
  } | null>(null);

  const preview = useMemo(
    () => generatePreview(template, language),
    [template, language]
  );

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (!recipient) return;
    setSending(true);
    setSendResult(null);

    const res = await fetch("/api/admin/send-test-email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ template, language, recipient }),
    });

    if (res.ok) {
      setSendResult({ ok: true, message: `Test email sent to ${recipient}` });
    } else {
      const data = await res.json().catch(() => ({}));
      setSendResult({
        ok: false,
        message: data.error || "Failed to send",
      });
    }
    setSending(false);
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Email Templates</h1>

      {/* Section 1 — Email Preview */}
      <div className="bg-white rounded-lg shadow p-5 mb-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">
          Email Preview
        </h2>

        <div className="flex flex-wrap gap-4 mb-6">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Template
            </label>
            <select
              value={template}
              onChange={(e) => setTemplate(e.target.value as Template)}
              className="px-3 py-1.5 border border-gray-300 rounded text-sm text-gray-900 min-w-[280px]"
            >
              {TEMPLATES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Language
            </label>
            <div className="flex rounded overflow-hidden border border-gray-300">
              <button
                type="button"
                onClick={() => setLanguage("pt")}
                className={`px-4 py-1.5 text-sm font-medium ${
                  language === "pt"
                    ? "bg-blue-600 text-white"
                    : "bg-white text-gray-700 hover:bg-gray-50"
                }`}
              >
                PT
              </button>
              <button
                type="button"
                onClick={() => setLanguage("en")}
                className={`px-4 py-1.5 text-sm font-medium border-l border-gray-300 ${
                  language === "en"
                    ? "bg-blue-600 text-white"
                    : "bg-white text-gray-700 hover:bg-gray-50"
                }`}
              >
                EN
              </button>
            </div>
          </div>
        </div>

        {/* Preview panel */}
        <div className="border border-gray-200 rounded-lg overflow-hidden">
          {/* Email header */}
          <div className="bg-gray-50 px-4 py-3 border-b border-gray-200">
            <div className="flex items-center gap-2 text-xs text-gray-500 mb-1">
              <span className="font-medium text-gray-700">From:</span>
              noreply@torrinha.com
            </div>
            <div className="flex items-center gap-2 text-xs text-gray-500 mb-2">
              <span className="font-medium text-gray-700">To:</span>
              joao.silva@example.com
            </div>
            <p className="text-sm font-semibold text-gray-900">
              {preview.subject}
            </p>
          </div>
          {/* Email body */}
          <div className="px-4 py-4 bg-white">
            <pre className="text-sm text-gray-700 whitespace-pre-wrap font-sans leading-relaxed">
              {preview.body}
            </pre>
          </div>
        </div>
      </div>

      {/* Section 2 — Send Test Email */}
      <div className="bg-white rounded-lg shadow p-5">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">
          Send Test Email
        </h2>
        <p className="text-sm text-gray-500 mb-4">
          Send the previewed template above to a real email address. This always
          sends to the specified recipient regardless of EMAIL_DRY_RUN.
        </p>

        <form onSubmit={handleSend} className="flex items-end gap-3">
          <div className="flex-1 max-w-md">
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Recipient
            </label>
            <input
              type="email"
              value={recipient}
              onChange={(e) => setRecipient(e.target.value)}
              required
              placeholder="you@example.com"
              className="w-full px-3 py-1.5 border border-gray-300 rounded text-sm text-gray-900"
            />
          </div>
          <button
            type="submit"
            disabled={sending || !recipient}
            className="px-4 py-1.5 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700 disabled:opacity-50"
          >
            {sending ? "Sending..." : "Send test email"}
          </button>
        </form>

        {sendResult && (
          <div
            className={`mt-3 p-3 rounded text-sm ${
              sendResult.ok
                ? "bg-green-50 text-green-700"
                : "bg-red-50 text-red-700"
            }`}
          >
            {sendResult.message}
          </div>
        )}
      </div>
    </div>
  );
}
