/**
 * RFC 8058 One-Click Unsubscribe Runner
 *
 * For senders that advertise `List-Unsubscribe-Post: List-Unsubscribe=One-Click`,
 * the protocol is the simplest unsubscribe in the world: HTTP POST the URL
 * with the literal body `List-Unsubscribe=One-Click`. No browser, no AI, no
 * navigation — just one network call.
 */

export interface OneClickResult {
  success: boolean;
  status: number;
  finalUrl: string;
  error?: string;
}

const TIMEOUT_MS = 10_000;

export async function sendOneClickUnsubscribe(
  url: string,
): Promise<OneClickResult> {
  if (!/^https?:\/\//i.test(url)) {
    return {
      success: false,
      status: 0,
      finalUrl: url,
      error: `Invalid one-click URL: ${url}`,
    };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": "Vienna-Unsubscribe-Agent/1.0 (+https://48co.ai)",
      },
      body: "List-Unsubscribe=One-Click",
      redirect: "follow",
      signal: controller.signal,
    });
    return {
      success: response.ok,
      status: response.status,
      finalUrl: response.url,
      ...(response.ok ? {} : { error: `HTTP ${response.status}` }),
    };
  } catch (err) {
    return {
      success: false,
      status: 0,
      finalUrl: url,
      error: (err as Error).message,
    };
  } finally {
    clearTimeout(timer);
  }
}
