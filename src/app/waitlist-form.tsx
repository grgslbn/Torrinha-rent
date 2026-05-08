"use client";

import { useState } from "react";
import RetroBackground from "./retro-background";

type Props = {
  tcTextPt: string;
  tcTextEn: string;
  contactEmail: string;
};

const INFO_CARDS_PT = [
  {
    icon: "🔒",
    title: "Acesso seguro 24/7",
    body: "Portão automático com código pessoal. Entrada e saída a qualquer hora.",
  },
  {
    icon: "☂️",
    title: "Coberto e protegido",
    body: "Parque coberto, longe da chuva e do sol. O seu carro fica sempre em segurança.",
  },
  {
    icon: "📍",
    title: "Centro do Porto",
    body: "A 5 minutos a pé do Mercado do Bolhão e do Metro da Trindade.",
  },
];

const INFO_CARDS_EN = [
  {
    icon: "🔒",
    title: "Secure access 24/7",
    body: "Automatic gate with personal code. Enter and exit at any time.",
  },
  {
    icon: "☂️",
    title: "Covered & protected",
    body: "Indoor parking, sheltered from rain and sun. Your car stays safe.",
  },
  {
    icon: "📍",
    title: "Central Porto",
    body: "5 minutes on foot from Mercado do Bolhão and Metro Trindade.",
  },
];

export default function WaitlistForm({
  tcTextPt,
  tcTextEn,
  contactEmail,
}: Props) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [language, setLanguage] = useState<"pt" | "en">("pt");
  const [tcAccepted, setTcAccepted] = useState(false);
  const [showTcModal, setShowTcModal] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const isPt = language === "pt";
  const tcText = isPt ? tcTextPt : tcTextEn;
  const infoCards = isPt ? INFO_CARDS_PT : INFO_CARDS_EN;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!tcAccepted) return;
    setLoading(true);
    setError("");

    const res = await fetch("/api/waitlist", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email, language }),
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
    <div className="min-h-screen bg-t-bg px-4 py-10 relative">
      <RetroBackground />

      {/* T&C modal */}
      {showTcModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4"
          onClick={() => setShowTcModal(false)}
        >
          <div
            className="bg-t-surface border border-t-border rounded-[var(--t-radius-lg)] max-w-lg w-full max-h-[80vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-6 py-4 border-b border-t-border">
              <h2 className="text-sm font-semibold text-t-text">
                {isPt ? "Termos e Condições" : "Terms & Conditions"}
              </h2>
              <button
                type="button"
                onClick={() => setShowTcModal(false)}
                className="text-t-text-muted hover:text-t-text text-lg leading-none"
              >
                ×
              </button>
            </div>
            <div className="overflow-y-auto px-6 py-4 text-xs text-t-text-secondary leading-relaxed whitespace-pre-wrap">
              {tcText}
            </div>
            <div className="px-6 py-4 border-t border-t-border">
              <button
                type="button"
                onClick={() => setShowTcModal(false)}
                className="w-full py-2 px-4 bg-t-accent text-white rounded-[var(--t-radius-sm)] text-sm"
              >
                {isPt ? "Fechar" : "Close"}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="w-full max-w-lg mx-auto relative z-10">
        {/* Language toggle */}
        <div className="flex justify-end mb-6">
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

        {/* Hero header */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-t-text leading-tight">
            {isPt
              ? "Estacionamento privado no centro do Porto"
              : "Private parking in central Porto"}
          </h1>
          <p className="text-t-text-muted mt-2 text-sm">
            Rua da Torrinha 149 · Cedofeita
          </p>
        </div>

        {/* Info cards */}
        <div className="grid grid-cols-3 gap-3 mb-8">
          {infoCards.map((card) => (
            <div
              key={card.title}
              className="bg-t-surface border border-t-border rounded-[var(--t-radius-lg)] p-4 text-center"
            >
              <div className="text-2xl mb-2">{card.icon}</div>
              <p className="text-xs font-semibold text-t-text mb-1">{card.title}</p>
              <p className="text-xs text-t-text-muted leading-snug">{card.body}</p>
            </div>
          ))}
        </div>

        {/* Divider + context */}
        <div className="relative flex items-center mb-4">
          <div className="flex-grow border-t border-t-border" />
          <span className="mx-3 text-xs font-semibold text-t-text-muted uppercase tracking-widest">
            {isPt ? "Lista de espera" : "Waitlist"}
          </span>
          <div className="flex-grow border-t border-t-border" />
        </div>

        <p className="text-sm text-t-text-secondary text-center mb-6 leading-relaxed">
          {isPt
            ? "Neste momento não temos lugares disponíveis. Deixe os seus dados e avisamo-lo assim que surgir uma vaga."
            : "There are currently no available spots. Leave your details and we'll reach out as soon as one opens up."}
        </p>

        {/* Form */}
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
              className="w-full px-3 py-2 border border-t-border rounded-[var(--t-radius-sm)] text-t-text bg-t-bg"
            />
          </div>

          <div className="mb-5">
            <label className="block text-sm font-medium text-t-text-secondary mb-1">
              Email *
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full px-3 py-2 border border-t-border rounded-[var(--t-radius-sm)] text-t-text bg-t-bg"
            />
          </div>

          {/* T&C inline checkbox */}
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
                {isPt ? (
                  <>
                    Li e aceito os{" "}
                    <button
                      type="button"
                      onClick={() => setShowTcModal(true)}
                      className="text-t-accent hover:underline"
                    >
                      termos e condições
                    </button>
                  </>
                ) : (
                  <>
                    I have read and accept the{" "}
                    <button
                      type="button"
                      onClick={() => setShowTcModal(true)}
                      className="text-t-accent hover:underline"
                    >
                      terms and conditions
                    </button>
                  </>
                )}
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

        {/* Footer */}
        {contactEmail && (
          <p className="text-center text-xs text-t-text-muted mt-5">
            {isPt ? "Tem alguma questão?" : "Have a question?"}{" "}
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
