import { createClient } from "@/lib/supabase/server";

export default async function ConnectBankPage() {
  const supabase = await createClient();

  const { data: tokens } = await supabase
    .from("torrinha_gc_tokens")
    .select("*")
    .order("updated_at", { ascending: false })
    .limit(1);

  const token = tokens?.[0] ?? null;
  const isConnected = !!token?.account_id;
  const expiresAt = token?.expires_at ? new Date(token.expires_at) : null;
  const daysUntilExpiry = expiresAt
    ? Math.ceil((expiresAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24))
    : null;

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Bank Connection</h1>

      <div className="bg-white rounded-lg shadow p-6 max-w-lg">
        <div className="mb-6">
          <p className="text-sm text-gray-500 mb-1">Status</p>
          <div className="flex items-center gap-2">
            <span
              className={`w-2 h-2 rounded-full ${
                isConnected ? "bg-green-500" : "bg-gray-300"
              }`}
            />
            <span className="text-sm font-medium text-gray-900">
              {isConnected ? "Connected" : "Not connected"}
            </span>
          </div>
        </div>

        {isConnected && expiresAt && (
          <div className="mb-6">
            <p className="text-sm text-gray-500 mb-1">Consent Expires</p>
            <p className="text-sm text-gray-900">{expiresAt.toLocaleDateString()}</p>
            {daysUntilExpiry !== null && daysUntilExpiry < 14 && (
              <p className="text-sm text-amber-600 mt-1">
                Expires in {daysUntilExpiry} days — reconnect soon.
              </p>
            )}
          </div>
        )}

        <p className="text-sm text-gray-500 mb-4">
          Connect your Cr&eacute;dito Agr&iacute;cola account via GoCardless to
          automatically sync bank transactions.
        </p>

        <button className="px-4 py-2 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700">
          {isConnected ? "Reconnect Bank" : "Connect Bank"}
        </button>
      </div>
    </div>
  );
}
