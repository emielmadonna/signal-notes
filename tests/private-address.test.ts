// Unit tests for the SSRF host guard (lib/net/private-address.ts).
//
// These exist because the two defects they pin were both invisible to every
// check this repo ran: the constitution greps source text, the typechecker
// sees a boolean either way, and no test ever called the function.
import test from "node:test";
import assert from "node:assert/strict";
import { isBlockedHost } from "@/lib/net/private-address";

/** Mirrors the route: parse first, then ask about the parsed hostname. */
function blocked(input: string): boolean {
  return isBlockedHost(new URL(`http://${input}/`).hostname);
}

test("blocks the obvious loopback and private literals", () => {
  for (const host of [
    "127.0.0.1", "10.0.0.1", "192.168.1.1", "172.16.0.1", "172.31.255.255",
    "169.254.169.254", "100.64.0.1", "0.0.0.0",
  ]) {
    assert.equal(blocked(host), true, `${host} should be blocked`);
  }
});

test("blocks the alternate IPv4 spellings the URL parser normalizes", () => {
  // Decimal, hex and shorthand all fold to 127.0.0.1 before we see them.
  for (const host of ["2130706433", "0x7f000001", "127.1", "017700000001"]) {
    assert.equal(blocked(host), true, `${host} should be blocked`);
  }
  assert.equal(blocked("2852039166"), true, "decimal metadata IP");
});

test("REGRESSION: blocks IPv4-mapped IPv6 literals", () => {
  // The original guard only looked for "::1"/"fe80:"/"fc"/"fd", so
  // http://[::ffff:127.0.0.1]/ reached loopback, and the ::ffff: form of
  // 169.254.169.254 reached cloud instance metadata.
  assert.equal(blocked("[::ffff:127.0.0.1]"), true, "mapped loopback");
  assert.equal(blocked("[0:0:0:0:0:ffff:7f00:1]"), true, "expanded mapped loopback");
  assert.equal(blocked("[::ffff:169.254.169.254]"), true, "mapped metadata IP");
  assert.equal(blocked("[::ffff:a9fe:a9fe]"), true, "hex mapped metadata IP");
  assert.equal(blocked("[::ffff:10.0.0.1]"), true, "mapped RFC-1918");
  assert.equal(blocked("[::127.0.0.1]"), true, "IPv4-compatible loopback");
  assert.equal(blocked("[64:ff9b::127.0.0.1]"), true, "NAT64-prefixed loopback");
});

test("blocks native IPv6 loopback, link-local and unique-local", () => {
  for (const host of ["[::1]", "[::]", "[fe80::1]", "[fc00::1]", "[fd12:3456::1]", "[ff02::1]"]) {
    assert.equal(blocked(host), true, `${host} should be blocked`);
  }
});

test("REGRESSION: does NOT block real domains starting fc/fd", () => {
  // The unique-local check used to run on every hostname string, not just
  // IPv6 literals, so the document ingester refused the FDA.
  for (const host of ["fcc.gov", "fda.gov", "fdny.org", "fcbarcelona.com", "fdic.gov"]) {
    assert.equal(blocked(host), false, `${host} must be allowed`);
  }
});

test("allows ordinary public hosts", () => {
  for (const host of ["example.com", "en.wikipedia.org", "8.8.8.8", "[2606:4700::1111]"]) {
    assert.equal(blocked(host), false, `${host} must be allowed`);
  }
});

test("blocks reserved special-use names", () => {
  for (const host of ["localhost", "foo.localhost", "db.internal", "printer.local"]) {
    assert.equal(blocked(host), true, `${host} should be blocked`);
  }
});

test("an unparseable IPv6 literal fails closed", () => {
  assert.equal(isBlockedHost("[not:an:address:::]"), true);
});
