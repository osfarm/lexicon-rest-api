/**
 * The address of the caller, as seen by the reverse proxies we trust.
 *
 * `X-Forwarded-For` is written by whoever sends the request: only the entries
 * appended by our own proxies can be believed. With one trusted proxy, that is
 * the last entry; anything before it was supplied by the caller and could be
 * forged to escape the rate limit.
 */
export function callerAddress(
  forwardedFor: string | null,
  socketAddress: string | undefined,
  trustedProxies: number,
): string {
  const entries = (forwardedFor ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry !== "")

  const fromProxy =
    trustedProxies > 0 ? entries[entries.length - trustedProxies] : undefined

  return fromProxy ?? socketAddress ?? "unknown"
}
