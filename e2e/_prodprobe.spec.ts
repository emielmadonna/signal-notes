import { test } from "@playwright/test";
import { signIn, USERS } from "./helpers";

const utf8 = (s: string) => Buffer.from(s, "utf8");
const NUL = Buffer.from([0x00]);

const CASES: Array<[string, Buffer]> = [
  ["plain.txt", utf8("Just some plain notes.")],
  ["nul-byte.txt", Buffer.concat([utf8("before"), NUL, utf8("after")])],
  ["pipeline.csv", utf8("a,b\n1,2\n")],
  ["saved-page.html", utf8("<html><body><p>hello there</p></body></html>")],
  ["attachment", utf8("no extension here at all")],
  ["contract.doc", utf8("anything")],
];

test("prod probe", async ({ page }) => {
  test.setTimeout(300_000);
  await signIn(page, USERS.northwind.email);
  for (const [name, buf] of CASES) {
    const res = await page.request.post("/api/documents/upload", {
      multipart: {
        file: { name, mimeType: "application/octet-stream", buffer: buf },
        kind: "other",
        title: `PRODPROBE ${name}`,
      },
      timeout: 60_000,
    });
    const text = await res.text();
    const ct = res.headers()["content-type"] ?? "(none)";
    console.log(
      `PROBE ${res.status()} | ${name} | ct=${ct} | len=${text.length} | ${text.slice(0, 240).replace(/\n/g, " ")}`
    );
  }
});
