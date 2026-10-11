// Where a key may be used from. A member narrows their key to the addresses of
// their servers (IPv4, alone or as a range) or to the sites that call the API
// from a browser (domain of the Origin or Referer header). A key without
// either works from anywhere; with both, one of them is enough.
//
// An address is what the network says and cannot be forged. A domain is what
// the caller announces: a browser tells the truth, a script can lie. It keeps a
// key copied from a web page from being used on another site, nothing more.

export type Restrictions = Readonly<{ addresses: readonly string[]; domains: readonly string[] }>

export const NO_RESTRICTION: Restrictions = { addresses: [], domains: [] }
export const MAXIMUM_ENTRIES = 20

const ADDRESS = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})(?:\/(\d{1,2}))?$/
const DOMAIN = /^(\*\.)?([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/
const MAPPED_ADDRESS = /^::ffff:/i
const BITS = 32

/**
 * The number an IPv4 address stands for, undefined when it is not one.
 */
function numberOf(address: string): number | undefined {
  const parts = ADDRESS.exec(address)
  const bytes = parts === null ? [] : parts.slice(1, 5).map(Number)

  return parts === null || parts[5] !== undefined || bytes.some((byte) => byte > 255)
    ? undefined
    : bytes.reduce((sum, byte) => sum * 256 + byte, 0)
}

/**
 * An address or a range as it is stored: "203.0.113.7" or "203.0.113.0/24".
 * Undefined when it is neither.
 */
export function addressEntryOf(value: string): string | undefined {
  const parts = ADDRESS.exec(value.trim())

  if (parts === null || numberOf(parts.slice(1, 5).join(".")) === undefined) {
    return undefined
  }

  const length = parts[5] === undefined ? BITS : Number(parts[5])

  return length > BITS || length < 8
    ? undefined
    : parts.slice(1, 5).map(Number).join(".") + (length === BITS ? "" : `/${length}`)
}

/**
 * A domain as it is stored, in lower case: "example.org", or "*.example.org"
 * for its subdomains. A whole address of a page is reduced to its host.
 */
export function domainEntryOf(value: string): string | undefined {
  const typed = value.trim().toLowerCase()
  const host = /^[a-z][a-z0-9+.-]*:\/\//.test(typed) ? hostOf(typed) : typed.replace(/\/.*$/, "")

  return host !== undefined && DOMAIN.test(host) ? host : undefined
}

/**
 * Reads what a member typed: entries separated by spaces, commas or lines.
 * @returns the entries to store, and the ones that could not be understood
 */
export function restrictionsIn(addresses: string, domains: string) {
  const entriesOf = (typed: string, entryOf: (value: string) => string | undefined) => {
    const values = typed.split(/[\s,;]+/).filter((value) => value !== "")
    const read = values.map((value) => ({ value, entry: entryOf(value) }))

    return {
      entries: [...new Set(read.flatMap(({ entry }) => (entry === undefined ? [] : [entry])))],
      refused: read.filter(({ entry }) => entry === undefined).map(({ value }) => value),
    }
  }
  const readAddresses = entriesOf(addresses, addressEntryOf)
  const readDomains = entriesOf(domains, domainEntryOf)

  return {
    restrictions: { addresses: readAddresses.entries, domains: readDomains.entries },
    refused: [...readAddresses.refused, ...readDomains.refused],
    tooMany:
      readAddresses.entries.length > MAXIMUM_ENTRIES ||
      readDomains.entries.length > MAXIMUM_ENTRIES,
  }
}

export function addressMatches(address: string, entry: string): boolean {
  const [base, length] = entry.split("/")
  const caller = numberOf(address.replace(MAPPED_ADDRESS, ""))
  const expected = numberOf(base)

  if (caller === undefined || expected === undefined) {
    return false
  }

  const size = 2 ** (BITS - (length === undefined ? BITS : Number(length)))

  return Math.floor(caller / size) === Math.floor(expected / size)
}

/**
 * The host of the page a request says it comes from, undefined when it says nothing usable.
 */
export function hostOf(origin: string | null | undefined): string | undefined {
  try {
    return origin ? new URL(origin).hostname.toLowerCase() || undefined : undefined
  } catch {
    return undefined
  }
}

export function domainMatches(host: string, entry: string): boolean {
  return entry.startsWith("*.") ? host.endsWith(entry.slice(1)) : host === entry
}

export function isRestricted(restrictions: Restrictions): boolean {
  return restrictions.addresses.length > 0 || restrictions.domains.length > 0
}

/**
 * Whether a key narrowed to these addresses and domains may be used by this caller.
 * @param origin the Origin header of the request, its Referer otherwise
 */
export function allowsCaller(
  restrictions: Restrictions,
  address: string,
  origin: string | null | undefined,
): boolean {
  const host = hostOf(origin)

  return (
    !isRestricted(restrictions) ||
    restrictions.addresses.some((entry) => addressMatches(address, entry)) ||
    (host !== undefined && restrictions.domains.some((entry) => domainMatches(host, entry)))
  )
}
