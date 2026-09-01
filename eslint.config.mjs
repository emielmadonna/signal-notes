import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Vendored, not authored here: the design canvas's own runtime, shipped
    // alongside the .pen export in docs/design/canvas/. It is reference
    // material for the approved design, not application code, and linting
    // someone else's bundle to our rules produces noise we would only ever
    // silence. (Its 4 errors were the bulk of the repo's lint failures and
    // the reason `npm run lint` was quietly never run.)
    "docs/design/canvas/**",
  ]),
]);

export default eslintConfig;
