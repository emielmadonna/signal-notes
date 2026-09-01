// =============================================================================
// lib/html/readable-text.ts — turn a fetched web page into quotable prose.
//
// Extracted from /api/documents/fetch-url so it can be unit tested against
// hostile input, which is the whole point: every byte this module sees came
// from a page the server was pointed at, so it must not be able to throw.
//
// The bug that motivated the extraction: decodeEntities used to call
// String.fromCodePoint(parseInt(...)) unguarded, so a page containing
// "&#xFFFFFFFF;" raised a RangeError from inside the handler — outside every
// try/catch — and Next answered with an empty-bodied 500. That is exactly the
// failure the constitution's R3 forbids ("a non-2xx is never an empty body").
// Out-of-range and surrogate code points now decode to the literal text that
// produced them, which is both safe and honest: we show what the page said.
// =============================================================================

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  mdash: "—",
  ndash: "–",
  hellip: "…",
  rsquo: "’",
  lsquo: "‘",
  rdquo: "”",
  ldquo: "“",
};

/**
 * A numeric character reference → its character, or null when the number is
 * not a code point JavaScript can build: NaN, negative, above U+10FFFF, or a
 * lone surrogate (U+D800–U+DFFF, which fromCodePoint also rejects).
 */
function codePointOrNull(value: number): string | null {
  if (!Number.isFinite(value)) return null;
  if (value < 0 || value > 0x10ffff) return null;
  if (value >= 0xd800 && value <= 0xdfff) return null;
  return String.fromCodePoint(value);
}

export function decodeEntities(text: string): string {
  return text
    .replace(/&#x([0-9a-fA-F]+);/g, (match, hex: string) => {
      // parseInt stops at 2^53 precision but returns Infinity for nothing;
      // an absurdly long hex run simply exceeds 0x10FFFF and stays literal.
      return codePointOrNull(parseInt(hex, 16)) ?? match;
    })
    .replace(/&#(\d+);/g, (match, dec: string) => {
      return codePointOrNull(parseInt(dec, 10)) ?? match;
    })
    .replace(/&([a-zA-Z]+);/g, (match, name: string) =>
      NAMED_ENTITIES[name.toLowerCase()] ?? match
    );
}

/**
 * Strip scripts/styles/tags, decode the common entities, collapse whitespace.
 * Small on purpose — enough to turn an article page into quotable text
 * without pulling in a DOM.
 */
export function extractReadableText(html: string): {
  text: string;
  pageTitle: string | null;
} {
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const pageTitle = titleMatch
    ? decodeEntities(titleMatch[1]).replace(/\s+/g, " ").trim() || null
    : null;

  const text = decodeEntities(
    html
      // Whole elements whose content is never prose:
      .replace(
        /<(script|style|noscript|template|svg|head|iframe|object)\b[\s\S]*?<\/\1\s*>/gi,
        " "
      )
      .replace(/<!--[\s\S]*?-->/g, " ")
      // Block-level boundaries become line breaks so paragraphs survive…
      .replace(
        /<\/?(p|div|section|article|li|ul|ol|table|tr|blockquote|h[1-6]|br|hr|figure|figcaption|header|footer|main|aside|nav|dd|dt|pre)\b[^>]*>/gi,
        "\n"
      )
      // …then every remaining tag disappears.
      .replace(/<[^>]+>/g, " ")
  )
    // Collapse: spaces within lines, then runs of blank lines.
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .join("\n")
    .replace(/\n{2,}/g, "\n\n")
    .trim();

  return { text, pageTitle };
}
