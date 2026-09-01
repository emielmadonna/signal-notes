// =============================================================================
// lib/html/readable-text.ts — turn a fetched or uploaded web page into
// quotable prose.
//
// Every byte this module sees came from a stranger: a page the server was
// pointed at, or an .html file somebody uploaded. So it has two hard
// obligations, and both of them were learned from real defects:
//
//   1. IT MUST NOT THROW. decodeEntities used to call
//      String.fromCodePoint(parseInt(...)) unguarded, so a page containing
//      "&#xFFFFFFFF;" raised a RangeError from inside the route handler —
//      outside every try/catch — and Next answered with an empty-bodied 500.
//      That is exactly the failure the constitution's R3 forbids.
//
//   2. IT MUST NOT HANG. The tag stripping used to be regex-based:
//
//        /<(script|style|…)\b[\s\S]*?<\/\1\s*>/gi
//        /<!--[\s\S]*?-->/g
//        /<title[^>]*>([\s\S]*?)<\/title>/i
//
//      Each of those is lazy with an unbounded body, so for every opening
//      token that never closes the engine scans to end-of-input and gives up
//      — then does it again at the next one. Cost is O(openers x length).
//      Measured on the old code: a benign 5 MB page took 134 ms, while 60k
//      unclosed "<script>" plus a 2 MB tail took 19.6 s, and a payload inside
//      fetch-url's own 5 MB cap did not finish in 600 s. Upload accepts 20 MB
//      of .html, neither ingestion route declared a maxDuration, and a
//      self-hosted deployment runs one Node process for all users — so a
//      single request could stall the whole server.
//
//      The scanner below walks the input ONCE. Its position only ever moves
//      forward, and when a closing token is absent it records that fact
//      (`exhausted`) instead of re-searching for it at the next opener, which
//      is what makes the whole pass linear rather than quadratic.
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
    .replace(/&#x([0-9a-fA-F]+);/g, (match, hex: string) =>
      codePointOrNull(parseInt(hex, 16)) ?? match
    )
    .replace(/&#(\d+);/g, (match, dec: string) =>
      codePointOrNull(parseInt(dec, 10)) ?? match
    )
    .replace(/&([a-zA-Z]+);/g, (match, name: string) =>
      NAMED_ENTITIES[name.toLowerCase()] ?? match
    );
}

/** Elements whose CONTENT is never prose — dropped wholesale, not unwrapped. */
const RAW_TEXT_ELEMENTS = [
  "script",
  "style",
  "noscript",
  "template",
  "svg",
  "head",
  "iframe",
  "object",
] as const;

/** Tags that end a line of prose, so paragraphs survive the strip. */
const BLOCK_TAG =
  /^<\/?(?:p|div|section|article|li|ul|ol|table|tr|blockquote|h[1-6]|br|hr|figure|figcaption|header|footer|main|aside|nav|dd|dt|pre)\b/;

/**
 * The name of a raw-text element opening at `at`, or null. Requires a real
 * tag-name boundary after the name so <scriptish> is not mistaken for
 * <script>.
 */
function rawTextElementAt(lower: string, at: number): string | null {
  for (const name of RAW_TEXT_ELEMENTS) {
    if (!lower.startsWith(`<${name}`, at)) continue;
    const next = lower.charCodeAt(at + 1 + name.length);
    // '>' | '/' | whitespace | end-of-input all terminate the name.
    if (Number.isNaN(next) || next === 62 || next === 47 || next <= 32) {
      return name;
    }
  }
  return null;
}

/**
 * Strip markup in a single forward pass. Raw-text elements are removed with
 * their contents, comments are removed, block tags become newlines and every
 * other tag becomes a space.
 */
function stripMarkup(html: string): string {
  const lower = html.toLowerCase();
  const length = html.length;
  const out: string[] = [];
  // Remembers which closing tokens are already known to be absent from the
  // rest of the input. Without this, N unclosed openers cost N full scans.
  const exhausted = new Set<string>();
  let i = 0;

  while (i < length) {
    const lt = html.indexOf("<", i);
    if (lt < 0) {
      out.push(html.slice(i));
      break;
    }
    out.push(html.slice(i, lt));

    // <!-- comment -->
    if (lower.startsWith("<!--", lt)) {
      if (exhausted.has("--")) break; // no terminator remains anywhere
      const end = html.indexOf("-->", lt + 4);
      if (end < 0) {
        exhausted.add("--");
        break; // unterminated comment swallows the remainder, as a parser would
      }
      out.push(" ");
      i = end + 3;
      continue;
    }

    // <script>…</script> and friends
    const name = rawTextElementAt(lower, lt);
    if (name !== null && !exhausted.has(name)) {
      const close = lower.indexOf(`</${name}`, lt);
      if (close >= 0) {
        const gt = html.indexOf(">", close);
        out.push(" ");
        i = gt < 0 ? length : gt + 1;
        continue;
      }
      // No closer left in the document. Record it so the next unclosed
      // <script> costs nothing, and fall through to plain-tag handling —
      // which keeps the following text, exactly as the old regex did by
      // simply failing to match.
      exhausted.add(name);
    }

    // Any other tag.
    const gt = html.indexOf(">", lt);
    if (gt < 0) {
      out.push(" ");
      break; // a final unterminated tag: nothing quotable after it
    }
    out.push(BLOCK_TAG.test(lower.slice(lt, gt + 1)) ? "\n" : " ");
    i = gt + 1;
  }

  return out.join("");
}

/** The document's <title>, found without a backtracking regex. */
function titleOf(html: string, lower: string): string | null {
  const open = lower.indexOf("<title");
  if (open < 0) return null;
  const openEnd = html.indexOf(">", open);
  if (openEnd < 0) return null;
  const close = lower.indexOf("</title", openEnd);
  if (close < 0) return null;
  const raw = html.slice(openEnd + 1, close);
  return decodeEntities(raw).replace(/\s+/g, " ").trim() || null;
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
  const pageTitle = titleOf(html, html.toLowerCase());

  const text = decodeEntities(stripMarkup(html))
    // Collapse: spaces within lines, then runs of blank lines.
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .join("\n")
    .replace(/\n{2,}/g, "\n\n")
    .trim();

  return { text, pageTitle };
}
