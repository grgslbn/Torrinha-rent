import { fetchAccountInfo } from "@/lib/ponto";

export default async function ConnectBankPage() {
  let accountInfo: {
    synchronizedAt?: string;
    currentBalance?: number;
    currency?: string;
    holderName?: string;
    reference?: string;
  } | null = null;
  let pontoError: string | null = null;

  // Try to fetch Ponto account info
  if (process.env.PONTO_CLIENT_ID && process.env.PONTO_ACCOUNT_ID) {
    try {
      accountInfo = await fetchAccountInfo();
    } catch (err) {
      pontoError = err instanceof Error ? err.message : "Failed to connect";
    }
  }

  const isConnected = !!accountInfo;
  const lastSync = accountInfo?.synchronizedAt
    ? new Date(accountInfo.synchronizedAt)
    : null;
  const hoursSinceSync = lastSync
    ? (Date.now() - lastSync.getTime()) / (1000 * 60 * 60)
    : null;
  const syncStatus =
    hoursSinceSync !== null
      ? hoursSinceSync < 24
        ? "recent"
        : "stale"
      : "unknown";

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Bank Connection</h1>

      <div className="bg-white rounded-lg shadow p-6 max-w-lg">
        <div className="mb-6">
          <p className="text-sm text-gray-500 mb-1">Provider</p>
          <p className="text-sm font-medium text-gray-900">Ponto by Isabel Group</p>
        </div>

        <div className="mb-6">
          <p className="text-sm text-gray-500 mb-1">Status</p>
          <div className="flex items-center gap-2">
            <span
              className={`w-2 h-2 rounded-full ${
                isConnected
                  ? syncStatus === "recent"
                    ? "bg-green-500"
                    : "bg-amber-400"
                  : "bg-gray-300"
              }`}
            />
            <span className="text-sm font-medium text-gray-900">
              {isConnected
                ? syncStatus === "recent"
                  ? "Connected"
                  : "Connected (sync stale)"
                : "Not connected"}
            </span>
          </div>
        </div>

        {isConnected && lastSync && (
          <div className="mb-6">
            <p className="text-sm text-gray-500 mb-1">Last Sync</p>
            <p className="text-sm text-gray-900">
              {lastSync.toLocaleString("en-GB", {
                dateStyle: "medium",
                timeStyle: "short",
              })}
            </p>
            {syncStatus === "stale" && (
              <p className="text-sm text-amber-600 mt-1">
                Last sync was more than 24 hours ago. Ponto normally syncs 4x daily.
              </p>
            )}
          </div>
        )}

        {accountInfo?.holderName && (
          <div className="mb-6">
            <p className="text-sm text-gray-500 mb-1">Account</p>
            <p className="text-sm text-gray-900">{accountInfo.holderName}</p>
            {accountInfo.reference && (
              <p className="text-xs text-gray-400">{accountInfo.reference}</p>
            )}
          </div>
        )}

        {pontoError && (
          <div className="mb-4 p-3 bg-red-50 text-red-700 rounded text-sm">
            {pontoError}
          </div>
        )}

        {!process.env.PONTO_CLIENT_ID && (
          <p className="text-sm text-gray-400 mb-4">
            Set PONTO_CLIENT_ID, PONTO_CLIENT_SECRET, and PONTO_ACCOUNT_ID
            environment variables to connect.
          </p>
        )}

        <p className="text-sm text-gray-500">
          Ponto automatically syncs your bank account 4 times daily. Incoming
          payments are matched against pending rents via webhook.
        </p>
      </div>
    </div>
  );
}
