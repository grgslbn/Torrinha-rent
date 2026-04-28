"use client";

import { useState, useRef } from "react";
import * as XLSX from "xlsx";

type AiMatch = {
  transaction_id: string;
  payment_id: string;
  confidence: string;
  reason: string;
};

type ParsedRow = {
  id: string;
  date: string;
  amount: number;
  description: string;
  sender: string;
  iban: string;
};

type ColumnMapping = {
  date: string;
  amount: string;
  description: string;
  sender: string;
  iban: string;
};

// Crédito Agrícola defaults
const DEFAULT_MAPPING: ColumnMapping = {
  date: "Data Movimento",
  amount: "Valor",
  description: "Descrição",
  sender: "Nome do Ordenante",
  iban: "NIB/IBAN/Conta do Ordenante",
};

const FIELD_LABELS: Record<keyof ColumnMapping, string> = {
  date: "Date",
  amount: "Amount",
  description: "Description",
  sender: "Sender Name",
  iban: "IBAN",
};

type Props = {
  onClose: () => void;
  onMatchesReady: (matches: AiMatch[], transactions: ParsedRow[]) => void;
};

function currentMonthStr() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

export default function CsvImportModal({ onClose, onMatchesReady }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);

  // Step 1: file upload
  const [rawRows, setRawRows] = useState<Record<string, string>[]>([]);
  const [columns, setColumns] = useState<string[]>([]);

  // Step 2: column mapping
  const [mapping, setMapping] = useState<ColumnMapping>({ ...DEFAULT_MAPPING });

  // Step 3: date range filter
  const [rangeFrom, setRangeFrom] = useState("2026-01");
  const [rangeTo, setRangeTo] = useState(currentMonthStr());

  // Flow state
  const [step, setStep] = useState<"upload" | "map" | "matching">("upload");
  const [matching, setMatching] = useState(false);
  const [error, setError] = useState("");

  // --- File upload ---
  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError("");

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const data = evt.target?.result;
        const workbook = XLSX.read(data, { type: "array" });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const json = XLSX.utils.sheet_to_json<Record<string, string>>(sheet, {
          raw: false,
          defval: "",
        });

        if (json.length === 0) {
          setError("File is empty or could not be parsed.");
          return;
        }

        const cols = Object.keys(json[0]);
        setRawRows(json);
        setColumns(cols);

        // Auto-detect mapping from Crédito Agrícola columns
        const autoMapping = { ...DEFAULT_MAPPING };
        for (const key of Object.keys(autoMapping) as (keyof ColumnMapping)[]) {
          if (!cols.includes(autoMapping[key])) {
            autoMapping[key] = "";
          }
        }
        setMapping(autoMapping);
        setStep("map");
      } catch {
        setError("Failed to parse file. Please upload a valid CSV or XLSX file.");
      }
    };
    reader.readAsArrayBuffer(file);
  }

  // --- Parse and filter rows ---
  function getParsedRows(): ParsedRow[] {
    return rawRows
      .map((row, i) => {
        const amountStr = row[mapping.amount] ?? "";
        const amount = parseFloat(amountStr.replace(/[^\d.,-]/g, "").replace(",", "."));
        const dateStr = row[mapping.date] ?? "";

        let monthStr = "";
        const isoMatch = dateStr.match(/(\d{4})-(\d{2})/);
        const euMatch = dateStr.match(/(\d{2})[/.-](\d{2})[/.-](\d{4})/);
        if (isoMatch) {
          monthStr = `${isoMatch[1]}-${isoMatch[2]}`;
        } else if (euMatch) {
          monthStr = `${euMatch[3]}-${euMatch[2]}`;
        }

        return {
          id: `csv-${i}`,
          date: dateStr,
          monthStr,
          amount,
          description: row[mapping.description] ?? "",
          sender: row[mapping.sender] ?? "",
          iban: row[mapping.iban] ?? "",
        };
      })
      .filter((r) => {
        if (isNaN(r.amount) || r.amount <= 0) return false;
        if (r.monthStr && (r.monthStr < rangeFrom || r.monthStr > rangeTo)) return false;
        return true;
      })
      .map(({ monthStr: _, ...rest }) => rest);
  }

  // --- Send to Claude ---
  async function handleMatch() {
    const parsed = getParsedRows();
    if (parsed.length === 0) {
      setError("No credit transactions found in the selected date range.");
      return;
    }

    setMatching(true);
    setError("");

    const res = await fetch("/api/match-payments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        transactions: parsed.map((r) => ({
          id: r.id,
          amount: r.amount,
          counterparty: r.sender || null,
          description: r.description || null,
          date: r.date || null,
          iban: r.iban || null,
        })),
      }),
    });

    if (res.ok) {
      const data = await res.json();
      onMatchesReady(data.matches ?? [], parsed);
    } else {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "AI matching failed");
    }
    setMatching(false);
  }

  const previewRows = rawRows.slice(0, 3);
  const parsedCount = step === "map" ? getParsedRows().length : 0;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-t-surface border border-t-border rounded-[var(--t-radius-lg)] shadow-lg max-w-4xl w-full mx-4 max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="p-5 border-b border-t-border flex items-center justify-between">
          <h2 className="text-lg font-bold text-t-text">Import Bank Statement</h2>
          <button onClick={onClose} className="text-t-text-muted hover:text-t-text text-xl">&times;</button>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {error && (
            <div className="mb-4 p-3 bg-red-50 text-red-700 rounded text-sm">
              {error}
              <button onClick={() => setError("")} className="ml-2 text-red-500 hover:text-red-700">dismiss</button>
            </div>
          )}

          {/* Step 1: Upload */}
          {step === "upload" && (
            <div className="text-center py-8">
              <p className="text-sm text-t-text-secondary mb-4">
                Upload a CSV or XLSX bank statement from Cr&eacute;dito Agr&iacute;cola
              </p>
              <input
                ref={fileRef}
                type="file"
                accept=".csv,.xlsx,.xls"
                onChange={handleFile}
                className="hidden"
              />
              <button
                onClick={() => fileRef.current?.click()}
                className="px-6 py-3 bg-t-accent text-white rounded-[var(--t-radius-lg)] hover:bg-t-accent-hover text-sm font-medium"
              >
                Choose File
              </button>
              <p className="text-xs text-t-text-muted mt-3">Supports .csv, .xlsx, .xls</p>
            </div>
          )}

          {/* Step 2: Column mapping + preview */}
          {step === "map" && (
            <>
              {/* Date range filter */}
              <div className="mb-5">
                <label className="block text-xs font-medium text-t-text-muted mb-1">
                  Import date range
                </label>
                <div className="flex items-center gap-2 text-sm">
                  <input
                    type="month"
                    value={rangeFrom}
                    onChange={(e) => setRangeFrom(e.target.value)}
                    className="px-2 py-1.5 border border-t-border rounded-[var(--t-radius-sm)] text-sm text-t-text"
                  />
                  <span className="text-t-text-muted">to</span>
                  <input
                    type="month"
                    value={rangeTo}
                    onChange={(e) => setRangeTo(e.target.value)}
                    className="px-2 py-1.5 border border-t-border rounded-[var(--t-radius-sm)] text-sm text-t-text"
                  />
                </div>
              </div>

              {/* Column mapping */}
              <div className="mb-5">
                <h3 className="text-sm font-semibold text-t-text mb-2">Column Mapping</h3>
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                  {(Object.keys(FIELD_LABELS) as (keyof ColumnMapping)[]).map((field) => (
                    <div key={field}>
                      <label className="block text-xs text-t-text-muted mb-1">{FIELD_LABELS[field]}</label>
                      <select
                        value={mapping[field]}
                        onChange={(e) => setMapping((m) => ({ ...m, [field]: e.target.value }))}
                        className="w-full px-2 py-1.5 border border-t-border rounded-[var(--t-radius-sm)] text-xs text-t-text"
                      >
                        <option value="">— select —</option>
                        {columns.map((col) => (
                          <option key={col} value={col}>{col}</option>
                        ))}
                      </select>
                    </div>
                  ))}
                </div>
              </div>

              {/* Preview */}
              <div className="mb-5">
                <h3 className="text-sm font-semibold text-t-text mb-2">
                  Preview (first 3 rows)
                </h3>
                <div className="overflow-x-auto border border-t-border rounded-[var(--t-radius-md)]">
                  <table className="min-w-full text-xs">
                    <thead className="bg-t-bg">
                      <tr>
                        {columns.map((col) => (
                          <th key={col} className="px-3 py-2 text-left font-medium text-t-text-muted whitespace-nowrap">
                            {col}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {previewRows.map((row, i) => (
                        <tr key={i} className="border-t border-t-border">
                          {columns.map((col) => (
                            <td key={col} className="px-3 py-1.5 text-t-text-secondary whitespace-nowrap max-w-[200px] truncate">
                              {row[col]}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="text-xs text-t-text-muted mt-2">
                  {rawRows.length} total rows &middot; {parsedCount} credit transactions in selected range
                </p>
              </div>

              {/* Actions */}
              <div className="flex items-center justify-between">
                <button
                  onClick={() => { setStep("upload"); setRawRows([]); setColumns([]); }}
                  className="text-sm text-t-text-muted hover:text-t-text"
                >
                  &larr; Choose different file
                </button>
                <button
                  onClick={handleMatch}
                  disabled={matching || parsedCount === 0 || !mapping.amount}
                  className="px-4 py-2 bg-purple-600 text-white text-sm rounded-[var(--t-radius-sm)] hover:bg-purple-700 disabled:opacity-50"
                >
                  {matching ? "Matching..." : `Parse & Match (${parsedCount} transactions)`}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
