# D09 — Dark-default theme via cookie + localStorage

**DECISION.** The app matches the approved canvas: DARK default with a light
toggle. Theme is persisted in BOTH a cookie and localStorage — the cookie lets
the server render the correct theme on the first paint (no flash), and
localStorage keeps the client in sync. Components carry the canvas's exact inline
values through CSS variables rather than a re-interpretation, so fidelity is
checkable value by value.

**ALTERNATIVES REJECTED, AND WHY.**
- *Cookie-only theme.* Rejected — a cookie/localStorage conflict produces a
  visible flash of the wrong theme on load; storing both lets server and client
  agree from the first frame.
- *Translate the canvas into utility classes.* Rejected — a re-interpretation
  drifts from the approved design and can't be checked value-by-value; the exact
  inline values through CSS variables keep "1:1" verifiable.

**EVIDENCE.**
- Card: CHANGE-CARD-005 (THE DECISION: "Theme = cookie + localStorage so the
  server renders the right theme with no flash"; canvas values via CSS variables).
- Proof: live E2E — theme persists across reload; the P5 theme sweep flips
  dark/light on the real toggle and confirms it stays put after reload on both
  the workspace and the reading view (`shiplog/evidence/p5-theme/`). Side-by-side
  canvas-vs-built shots (dark AND light) in `shiplog/evidence/p2-visual/`.
- Nearby rigor: catch #13 (the serif's optical-size axis was silently dropped by
  the font loader, caught by inspecting the shipped font file) — the parity pass
  now includes a headline close-up so optical-size regressions show in evidence.

**THE LIKELY PUSHBACK / ANSWER.**
"Why persist the theme in two places?" — The cookie lets the server render the
right theme with no flash on first paint; localStorage keeps the client in sync.
E2E proves it survives reload on every surface (p5-theme).
