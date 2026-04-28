"use client";

import { useState } from "react";
import RetroBackground from "./retro-background";

type Props = {
  tcTextPt: string;
  tcTextEn: string;
  contactEmail: string;
};

export default function WaitlistForm({
  tcTextPt,
  tcTextEn,
  contactEmail,
}: Props) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [language, setLanguage] = useState<"pt" | "en">("pt");
  const [tcAccepted, setTcAccepted] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const isPt = language === "pt";
  const tcText = isPt ? tcTextPt : tcTextEn;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!tcAccepted) return;
    setLoading(true);
    setError("");

    const res = await fetch("/api/waitlist", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email, phone, language }),
    });

    if (res.ok) {
      setSubmitted(true);
    } else {
      const data = await res.json().catch(() => ({}));
      setError(data.error || (isPt ? "Algo correu mal. Tente novamente." : "Something went wrong. Please try again."));
    }
    setLoading(false);
  }

  if (submitted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-t-bg px-4 relative">
        <RetroBackground />
        <div className="max-w-md text-center relative z-10">
          <div className="mb-4 text-4xl">&#10003;</div>
          <h1 className="text-2xl font-bold text-t-text mb-3">
            {isPt ? "Obrigado!" : "Thank you!"}
          </h1>
          <p className="text-t-text-secondary mb-6">
            {isPt
              ? "Recebemos o seu pedido. Entraremos em contacto quando houver disponibilidade."
              : "We've received your request. We'll be in touch when a spot becomes available."}
          </p>
          {contactEmail && (
            <p className="text-sm text-t-text-muted">
              {isPt ? "Questões? Contacte" : "Questions? Contact"}{" "}
              <a
                href={`mailto:${contactEmail}`}
                className="text-t-accent hover:underline"
              >
                {contactEmail}
              </a>
            </p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-t-bg flex items-center justify-center px-4 relative">
      <RetroBackground />
      <div className="w-full max-w-md relative z-10">
        {/* Language toggle — top right */}
        <div className="flex justify-end mb-4">
          <div className="flex rounded overflow-hidden border border-t-border text-xs">
            <button
              type="button"
              onClick={() => setLanguage("pt")}
              className={`px-3 py-1 font-medium ${
                isPt
                  ? "bg-t-accent text-white"
                  : "bg-t-surface text-t-text-muted hover:bg-t-bg"
              }`}
            >
              PT
            </button>
            <button
              type="button"
              onClick={() => setLanguage("en")}
              className={`px-3 py-1 font-medium border-l border-t-border ${
                !isPt
                  ? "bg-t-accent text-white"
                  : "bg-t-surface text-t-text-muted hover:bg-t-bg"
              }`}
            >
              EN
            </button>
          </div>
        </div>

        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-t-text">
            {isPt
              ? "Estacionamento Rua da Torrinha 149"
              : "Rua da Torrinha 149 Parking"}
          </h1>
          <p className="text-t-text-muted mt-1">Porto</p>
        </div>

        <form onSubmit={handleSubmit} className="bg-t-surface border border-t-border p-6 rounded-[var(--t-radius-lg)]">
          {error && (
            <div className="mb-4 p-3 bg-red-50 text-red-700 rounded text-sm">
              {error}
            </div>
          )}

          <div className="mb-4">
            <label className="block text-sm font-medium text-t-text-secondary mb-1">
              {isPt ? "Nome" : "Name"} *
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className="w-full px-3 py-2 border border-t-border rounded-[var(--t-radius-sm)] text-t-text"
            />
          </div>

          <div className="mb-4">
            <label className="block text-sm font-medium text-t-text-secondary mb-1">
              Email *
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full px-3 py-2 border border-t-border rounded-[var(--t-radius-sm)] text-t-text"
            />
          </div>

          <div className="mb-4">
            <label className="block text-sm font-medium text-t-text-secondary mb-1">
              {isPt ? "Telefone" : "Phone"}
            </label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="w-full px-3 py-2 border border-t-border rounded-[var(--t-radius-sm)] text-t-text"
            />
          </div>

          {/* T&Cs scrollable box */}
          <div className="mb-4">
            <label className="block text-xs font-medium text-t-text-muted mb-1 uppercase tracking-wide">
              {isPt ? "Termos e Condições" : "Terms & Conditions"}
            </label>
            <div className="h-28 overflow-y-auto border border-t-border rounded-[var(--t-radius-sm)] p-3 bg-t-bg text-xs text-t-text-secondary leading-relaxed">
              {tcText}
            </div>
          </div>

          <div className="mb-6">
            <label className="flex items-start gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={tcAccepted}
                onChange={(e) => setTcAccepted(e.target.checked)}
                className="mt-0.5 accent-[var(--t-accent)]"
                required
              />
              <span className="text-xs text-t-text-secondary">
                {isPt
                  ? "Li e aceito os termos e condições"
                  : "I have read and accept the terms and conditions"}
              </span>
            </label>
          </div>

          <button
            type="submit"
            disabled={loading || !tcAccepted}
            className="w-full py-2 px-4 bg-t-accent text-white rounded-[var(--t-radius-sm)] hover:bg-t-accent-hover disabled:opacity-50"
          >
            {loading
              ? isPt
                ? "A enviar..."
                : "Submitting..."
              : isPt
                ? "Entrar na lista de espera"
                : "Join waiting list"}
          </button>
        </form>

        {contactEmail && (
          <p className="text-center text-xs text-t-text-muted mt-4">
            {isPt ? "Contacto:" : "Contact:"}{" "}
            <a
              href={`mailto:${contactEmail}`}
              className="text-t-accent hover:underline"
            >
              {contactEmail}
            </a>
          </p>
        )}
      </div>
    </div>
  );
}
