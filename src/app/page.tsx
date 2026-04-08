"use client";

import { useState } from "react";

export default function WaitlistPublicPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [language, setLanguage] = useState<"pt" | "en">("pt");
  const [tcAccepted, setTcAccepted] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const tcText =
    language === "pt"
      ? "Ao submeter este formulário, aceita ser contactado sobre a disponibilidade de lugares de estacionamento na Rua da Torrinha, Porto."
      : "By submitting this form, you agree to be contacted about parking spot availability at Rua da Torrinha, Porto.";

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
      setError(data.error || "Something went wrong. Please try again.");
    }
    setLoading(false);
  }

  if (submitted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="max-w-md text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">
            {language === "pt" ? "Obrigado!" : "Thank you!"}
          </h1>
          <p className="text-gray-600">
            {language === "pt"
              ? "Recebemos o seu pedido. Entraremos em contacto quando houver disponibilidade."
              : "We've received your request. We'll be in touch when a spot becomes available."}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-gray-900">
            Estacionamento Rua da Torrinha
          </h1>
          <p className="text-gray-500 mt-1">Porto</p>
        </div>

        <form onSubmit={handleSubmit} className="bg-white p-6 rounded-lg shadow">
          <div className="mb-4 flex gap-2">
            <button
              type="button"
              onClick={() => setLanguage("pt")}
              className={`flex-1 py-1.5 text-sm rounded ${
                language === "pt"
                  ? "bg-blue-50 text-blue-700 font-medium"
                  : "bg-gray-100 text-gray-500"
              }`}
            >
              Português
            </button>
            <button
              type="button"
              onClick={() => setLanguage("en")}
              className={`flex-1 py-1.5 text-sm rounded ${
                language === "en"
                  ? "bg-blue-50 text-blue-700 font-medium"
                  : "bg-gray-100 text-gray-500"
              }`}
            >
              English
            </button>
          </div>

          {error && (
            <div className="mb-4 p-3 bg-red-50 text-red-700 rounded text-sm">{error}</div>
          )}

          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {language === "pt" ? "Nome" : "Name"} *
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-gray-900"
            />
          </div>

          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Email *
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-gray-900"
            />
          </div>

          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {language === "pt" ? "Telefone" : "Phone"}
            </label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-gray-900"
            />
          </div>

          <div className="mb-6">
            <label className="flex items-start gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={tcAccepted}
                onChange={(e) => setTcAccepted(e.target.checked)}
                className="mt-0.5"
                required
              />
              <span className="text-xs text-gray-600">{tcText}</span>
            </label>
          </div>

          <button
            type="submit"
            disabled={loading || !tcAccepted}
            className="w-full py-2 px-4 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
          >
            {loading
              ? language === "pt"
                ? "A enviar..."
                : "Submitting..."
              : language === "pt"
              ? "Entrar na lista de espera"
              : "Join waiting list"}
          </button>
        </form>

        <p className="text-center text-xs text-gray-400 mt-4">
          {language === "pt" ? "Contacto:" : "Contact:"} torrinha@example.com
        </p>
      </div>
    </div>
  );
}
