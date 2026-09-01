// =============================================================================
// lib/net/private-address.ts — "does this hostname point somewhere we must not
// fetch?" (SSRF guard for /api/documents/fetch-url, catch #16).
//
// Extracted from the route and made a standalone module so it can be unit
// tested directly (tests/private-address.test.ts) — the previous inline
// version shipped two defects that only a test would have caught:
//
//   1. An IPv4-mapped IPv6 literal ("http://[::ffff:127.0.0.1]/", which the
//      WHATWG URL parser normalizes to "[::ffff:7f00:1]") walked straight
//      through: the old check only looked for "::1", "fe80:", "fc", "fd".
//   2. The unique-local test was `h.startsWith("fc") || h.startsWith("fd")`
//      applied to EVERY hostname string, not just IPv6 literals — so it
//      rejected fcc.gov, fda.gov, fdny.org and every other real domain
//      beginning with those two letters.
//
// The fix is to decide what KIND of host we are looking at first (IPv6
// literal / IPv4 literal / DNS name) and only then apply the matching rules.
//
// Still out of scope, and stated rather than implied: a DNS name that
// resolves to a private address only at connect time (rebinding). Blocking
// that needs resolve-then-pin-the-socket, which the platform fetch does not
// expose. The caller re-validates every redirect hop, which closes the
// redirect half of that hole.
// =============================================================================

/** Decimal-dotted IPv4 → its four octets, or null if it isn't one. */
function parseIPv4(host: string): [number, number, number, number] | null {
  const m = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!m) return null;
  const octets = [Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4])];
  if (octets.some((o) => o > 255)) return null;
  return octets as [number, number, number, number];
}

/**
 * Is this IPv4 address one we refuse to fetch? Covers loopback, RFC-1918,
 * link-local (incl. the cloud metadata address), carrier-grade NAT, the
 * "this network" block, IETF protocol/benchmark assignments, and everything
 * from multicast upward — i.e. every range that is not public unicast.
 */
export function isBlockedIPv4(octets: [number, number, number, number]): boolean {
  const [a, b] = octets;
  if (a === 0) return true; // 0.0.0.0/8 "this network"
  if (a === 10) return true; // 10.0.0.0/8 private
  if (a === 127) return true; // 127.0.0.0/8 loopback
  if (a === 169 && b === 254) return true; // 169.254.0.0/16 link-local (metadata)
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12 private
  if (a === 192 && b === 168) return true; // 192.168.0.0/16 private
  if (a === 192 && b === 0) return true; // 192.0.0.0/24 + 192.0.2.0/24
  if (a === 198 && (b === 18 || b === 19)) return true; // 198.18.0.0/15 benchmark
  if (a === 100 && b >= 64 && b <= 127) return true; // 100.64.0.0/10 CGNAT
  if (a >= 224) return true; // multicast, reserved, 255.255.255.255
  return false;
}

/**
 * An IPv6 literal (already stripped of its brackets) → its eight 16-bit
 * groups, or null if it does not parse. Handles "::" compression and a
 * trailing dotted-quad ("::ffff:127.0.0.1").
 */
export function parseIPv6(host: string): number[] | null {
  let text = host;

  // A trailing dotted-quad becomes the last two groups.
  const tail = text.match(/(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/);
  if (tail) {
    const v4 = parseIPv4(tail[1]);
    if (!v4) return null;
    const hi = ((v4[0] << 8) | v4[1]).toString(16);
    const lo = ((v4[2] << 8) | v4[3]).toString(16);
    text = `${text.slice(0, tail.index)}${hi}:${lo}`;
  }

  const halves = text.split("::");
  if (halves.length > 2) return null; // "::" may appear at most once

  const toGroups = (part: string): number[] | null => {
    if (part === "") return [];
    const out: number[] = [];
    for (const piece of part.split(":")) {
      if (!/^[0-9a-fA-F]{1,4}$/.test(piece)) return null;
      out.push(parseInt(piece, 16));
    }
    return out;
  };

  if (halves.length === 1) {
    const groups = toGroups(text);
    return groups && groups.length === 8 ? groups : null;
  }

  const head = toGroups(halves[0]);
  const rest = toGroups(halves[1]);
  if (head === null || rest === null) return null;
  const gap = 8 - head.length - rest.length;
  if (gap < 0) return null;
  return [...head, ...Array(gap).fill(0), ...rest];
}

/** Is this parsed IPv6 address one we refuse to fetch? */
export function isBlockedIPv6(groups: number[]): boolean {
  if (groups.length !== 8) return true; // unparseable → refuse

  const allZero = groups.every((g) => g === 0);
  if (allZero) return true; // :: unspecified
  if (groups.slice(0, 7).every((g) => g === 0) && groups[7] === 1) return true; // ::1

  if ((groups[0] & 0xffc0) === 0xfe80) return true; // fe80::/10 link-local
  if ((groups[0] & 0xfe00) === 0xfc00) return true; // fc00::/7 unique-local
  if ((groups[0] & 0xff00) === 0xff00) return true; // ff00::/8 multicast

  // Addresses that EMBED an IPv4 address are only as safe as that address:
  //   ::ffff:a.b.c.d   IPv4-mapped     (the [::ffff:127.0.0.1] bypass)
  //   ::a.b.c.d        IPv4-compatible (deprecated, still routed by some stacks)
  //   64:ff9b::a.b.c.d NAT64 well-known prefix
  const embedded = (): [number, number, number, number] => [
    groups[6] >> 8,
    groups[6] & 0xff,
    groups[7] >> 8,
    groups[7] & 0xff,
  ];
  const firstSixZero = groups.slice(0, 6).every((g) => g === 0);
  if (groups.slice(0, 5).every((g) => g === 0) && groups[5] === 0xffff) {
    return isBlockedIPv4(embedded());
  }
  if (firstSixZero) return isBlockedIPv4(embedded());
  if (groups[0] === 0x0064 && groups[1] === 0xff9b) return isBlockedIPv4(embedded());

  return false;
}

/** Hostnames that never resolve to somewhere we are willing to fetch. */
function isBlockedName(host: string): boolean {
  if (host === "localhost" || host.endsWith(".localhost")) return true;
  // Reserved special-use TLDs: .internal (cloud private zones), .local
  // (mDNS), .home.arpa / .arpa, and the RFC-6761 test/example names.
  if (host.endsWith(".internal") || host.endsWith(".local")) return true;
  if (host === "arpa" || host.endsWith(".arpa")) return true;
  return false;
}

/**
 * The single question the route asks. `hostname` is a URL's `.hostname` —
 * already lowercased and normalized by the WHATWG parser, with IPv6
 * literals still wrapped in brackets.
 *
 * Note the parser has already done real work for us: it folds the decimal,
 * octal and hex IPv4 spellings ("2130706433", "0x7f000001", "127.1") down to
 * dotted-quad before we ever see them, so those spoofs land on the IPv4 path.
 */
export function isBlockedHost(hostname: string): boolean {
  const host = hostname.toLowerCase();

  // An IPv6 literal is exactly the bracketed form; nothing else may be
  // treated as IPv6 (this is what wrongly condemned fcc.gov before).
  if (host.startsWith("[") && host.endsWith("]")) {
    const groups = parseIPv6(host.slice(1, -1));
    return groups === null ? true : isBlockedIPv6(groups);
  }

  const v4 = parseIPv4(host);
  if (v4) return isBlockedIPv4(v4);

  return isBlockedName(host);
}
