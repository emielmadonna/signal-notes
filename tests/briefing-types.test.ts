// Unit tests for the server-side model allowlist (lib/briefing-types.ts).
// The client sends a model string; this gate is the only thing standing
// between that string and a paid API call.
import test from "node:test";
import assert from "node:assert/strict";
import { resolveModel, DEFAULT_MODEL, ALLOWED_MODELS } from "@/lib/briefing-types";

test("absent or blank resolves to the default", () => {
  for (const input of [undefined, null, ""]) {
    assert.equal(resolveModel(input), DEFAULT_MODEL);
  }
});

test("every allowlisted model is accepted verbatim", () => {
  for (const model of ALLOWED_MODELS) {
    assert.equal(resolveModel(model), model);
  }
});

test("anything off the list is rejected, not silently defaulted", () => {
  for (const input of [
    "claude-opus-4", "gpt-4o", "claude-sonnet-5-evil", " claude-sonnet-5",
    42, {}, [], true,
  ]) {
    assert.equal(resolveModel(input), null, `${JSON.stringify(input)} must be rejected`);
  }
});
