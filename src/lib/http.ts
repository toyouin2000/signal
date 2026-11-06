export async function safeJson(response: Response) {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = data?.error?.message || data?.message || `Provider request failed (${response.status})`;
    throw new Error(String(message));
  }
  return data;
}
export function appUrl(path: string) {
  return `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}${path}`;
}
