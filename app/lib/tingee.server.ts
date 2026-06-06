import crypto from 'node:crypto';

const BASE_URL = 'https://open-api.tingee.vn';

export interface Bank {
  bankBin: string;
  bankName: string;
  shortName: string;
  logo: string;
}

export interface VirtualAccount {
  bankBin: string;
  accountNumber: string;
  accountName: string;
  bankAccountId: string;
}

interface TingeeResponse<T> {
  code: string;
  message: string;
  data: T;
}

// Timestamp in yyyyMMddHHmmssSSS format, UTC+7
function getTimestamp(): string {
  const utc7 = new Date(Date.now() + 7 * 60 * 60 * 1000);
  const yyyy = utc7.getUTCFullYear();
  const MM = String(utc7.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(utc7.getUTCDate()).padStart(2, '0');
  const HH = String(utc7.getUTCHours()).padStart(2, '0');
  const mm = String(utc7.getUTCMinutes()).padStart(2, '0');
  const ss = String(utc7.getUTCSeconds()).padStart(2, '0');
  const SSS = String(utc7.getUTCMilliseconds()).padStart(3, '0');
  return `${yyyy}${MM}${dd}${HH}${mm}${ss}${SSS}`;
}

export function buildHeaders(
  clientId: string,
  secretKey: string,
  body: object
): Record<string, string> {
  const timestamp = getTimestamp();
  const signature = crypto
    .createHmac('sha512', secretKey)
    .update(`${timestamp}:${JSON.stringify(body)}`)
    .digest('hex');
  return {
    'Content-Type': 'application/json',
    'x-client-id': clientId,
    'x-request-timestamp': timestamp,
    'x-signature': signature,
  };
}

// Validates an incoming Tingee IPN request using timing-safe comparison.
export function verifyWebhookSignature(
  timestamp: string,
  rawBody: string,
  receivedSignature: string,
  secretKey: string
): boolean {
  const expected = crypto
    .createHmac('sha512', secretKey)
    .update(`${timestamp}:${rawBody}`)
    .digest('hex');
  if (expected.length !== receivedSignature.length) return false;
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(receivedSignature));
}

export async function getBanks(
  clientId: string,
  secretKey: string
): Promise<Bank[]> {
  const body = {};
  const headers = buildHeaders(clientId, secretKey, body);
  const res = await fetch(`${BASE_URL}/v1/get-banks`, { headers });
  if (!res.ok) {
    throw new Error(`getBanks failed: ${res.status} ${res.statusText}`);
  }
  const json = (await res.json()) as TingeeResponse<Bank[]>;
  return json.data;
}

export async function getVirtualAccounts(
  clientId: string,
  secretKey: string,
  opts: { page?: number; size?: number } = {}
): Promise<{ items: VirtualAccount[]; total: number }> {
  const body = { page: opts.page ?? 1, size: opts.size ?? 20 };
  const headers = buildHeaders(clientId, secretKey, body);
  const res = await fetch(`${BASE_URL}/v1/get-va-paging`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`getVirtualAccounts failed: ${res.status} ${res.statusText}`);
  }
  const json = (await res.json()) as TingeeResponse<{ items: VirtualAccount[]; total: number }>;
  return json.data;
}

export async function generateVietQR(
  clientId: string,
  secretKey: string,
  bankBin: string,
  accountNumber: string,
  amount: number,
  content: string
): Promise<string> {
  const body = { bankBin, accountNumber, amount, content };
  const headers = buildHeaders(clientId, secretKey, body);
  const res = await fetch(`${BASE_URL}/v1/generate-viet-qr`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`generateVietQR failed: ${res.status} ${res.statusText}`);
  }
  const json = (await res.json()) as TingeeResponse<{ qrCodeImage: string }>;
  return json.data.qrCodeImage;
}
