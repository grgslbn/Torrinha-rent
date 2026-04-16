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
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4 relative">
        <RetroBackground />
        <div className="max-w-md text-center relative z-10">
          <div className="mb-4 text-4xl">&#10003;</div>
          <h1 className="text-2xl font-bold text-gray-900 mb-3">
            {isPt ? "Obrigado!" : "Thank you!"}
          </h1>
          <p className="text-gray-600 mb-6">
            {isPt
              ? "Recebemos o seu pedido. Entraremos em contacto quando houver disponibilidade."
              : "We've received your request. We'll be in touch when a spot becomes available."}
          </p>
          {contactEmail && (
            <p className="text-sm text-gray-400">
              {isPt ? "Questões? Contacte" : "Questions? Contact"}{" "}
              <a
                href={`mailto:${contactEmail}`}
                className="text-blue-600 hover:underline"
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
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4 relative">
      <RetroBackground />
      <div className="w-full max-w-md relative z-10">
        {/* Language toggle — top right */}
        <div className="flex justify-end mb-4">
          <div className="flex rounded overflow-hidden border border-gray-300 text-xs">
            <button
              type="button"
              onClick={() => setLanguage("pt")}
              className={`px-3 py-1 font-medium ${
                isPt
                  ? "bg-blue-600 text-white"
                  : "bg-white text-gray-600 hover:bg-gray-50"
              }`}
            >
              PT
            </button>
            <button
              type="button"
              onClick={() => setLanguage("en")}
              className={`px-3 py-1 font-medium border-l border-gray-300 ${
                !isPt
                  ? "bg-blue-600 text-white"
                  : "bg-white text-gray-600 hover:bg-gray-50"
              }`}
            >
              EN
            </button>
          </div>
        </div>

        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-gray-900">
            {isPt
              ? "Estacionamento Rua da Torrinha 149"
              : "Rua da Torrinha 149 Parking"}
          </h1>
          <p className="text-gray-500 mt-1">Porto</p>
        </div>

        <form onSubmit={handleSubmit} className="bg-white p-6 rounded-lg shadow">
          {error && (
            <div className="mb-4 p-3 bg-red-50 text-red-700 rounded text-sm">
              {error}
            </div>
          )}

          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {isPt ? "Nome" : "Name"} *
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
              {isPt ? "Telefone" : "Phone"}
            </label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-gray-900"
            />
          </div>

          {/* T&Cs scrollable box */}
          <div className="mb-4">
            <label className="block text-xs font-medium text-gray-500 mb-1 uppercase tracking-wide">
              {isPt ? "Termos e Condições" : "Terms & Conditions"}
            </label>
            <div className="h-28 overflow-y-auto border border-gray-200 rounded-md p-3 bg-gray-50 text-xs text-gray-600 leading-relaxed">
              {tcText}
            </div>
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
              <span className="text-xs text-gray-600">
                {isPt
                  ? "Li e aceito os termos e condições"
                  : "I have read and accept the terms and conditions"}
              </span>
            </label>
          </div>

          <button
            type="submit"
            disabled={loading || !tcAccepted}
            className="w-full py-2 px-4 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
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
          <p className="text-center text-xs text-gray-400 mt-4">
            {isPt ? "Contacto:" : "Contact:"}{" "}
            <a
              href={`mailto:${contactEmail}`}
              className="text-blue-500 hover:underline"
            >
              {contactEmail}
            </a>
          </p>
        )}
      </div>
    </div>
  );
}
