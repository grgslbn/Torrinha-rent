import { createHmac, timingSafeEqual } from "crypto";

// --- Types ---

export type PontoTransaction = {
  id: string;
  attributes: {
    amount: number;
    currency: string;
    valueDate: string;
    executionDate: string | null;
    description: string;
    remittanceInformation: string | null;
    remittanceInformationType: string | null;
    counterpartName: string | null;
    counterpartReference: string | null;
    bankTransactionCode: string | null;
    endToEndId: string | null;
    internalReference: string | null;
  };
};

type TokenResponse = {
  access_token: string;
  token_type: string;
  expires_in: number;
};

type TransactionsResponse = {
  data: PontoTransaction[];
  meta?: {
    synchronizedAt?: string;
    latestSynchronization?: {
      attributes?: {
        updatedAt?: string;
        status?: string;
      };
    };
  };
};

// --- Webhook signature verification ---

export function verifyWebhookSignature(
  rawBody: string,
  signatureHeader: string | null,
  secret: string
): boolean {
  if (!signatureHeader) return false;

  const expectedSig = createHmac("sha256", secret)
    .update(rawBody)
    .digest("hex");

  try {
    return timingSafeEqual(
      Buffer.from(signatureHeader),
      Buffer.from(expectedSig)
    );
  } catch {
    return false;
  }
}

// --- OAuth2 client credentials ---

let cachedToken: { token: string; expiresAt: number } | null = null;

export async function getAccessToken(): Promise<string> {
  // Return cached token if still valid (with 60s buffer)
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) {
    return cachedToken.token;
  }

  const clientId = process.env.PONTO_CLIENT_ID!;
  const clientSecret = process.env.PONTO_CLIENT_SECRET!;

  const res = await fetch(
    "https://api.ibanity.com/ponto-connect/oauth2/token",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
      },
      body: "grant_type=client_credentials",
    }
  );

  if (!res.ok) {
    throw new Error(`Ponto token error: ${res.status} ${await res.text()}`);
  }

  const data: TokenResponse = await res.json();
  cachedToken = {
    token: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  };

  return data.access_token;
}

// --- Fetch transactions ---

export async function fetchTransactions(
  accountId?: string
): Promise<{ transactions: PontoTransaction[]; synchronizedAt: string | null }> {
  const acctId = accountId || process.env.PONTO_ACCOUNT_ID!;
  const token = await getAccessToken();

  const res = await fetch(
    `https://api.ibanity.com/ponto-connect/accounts/${acctId}/transactions?limit=50`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
      },
    }
  );

  if (!res.ok) {
    throw new Error(`Ponto transactions error: ${res.status} ${await res.text()}`);
  }

  const body: TransactionsResponse = await res.json();

  return {
    transactions: body.data ?? [],
    synchronizedAt: body.meta?.synchronizedAt ?? null,
  };
}

// --- Fetch account info (for sync status) ---

export async function fetchAccountInfo(accountId?: string) {
  const acctId = accountId || process.env.PONTO_ACCOUNT_ID!;
  const token = await getAccessToken();

  const res = await fetch(
    `https://api.ibanity.com/ponto-connect/accounts/${acctId}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
      },
    }
  );

  if (!res.ok) {
    throw new Error(`Ponto account error: ${res.status} ${await res.text()}`);
  }

  const body = await res.json();
  return body.data?.attributes ?? null;
}
