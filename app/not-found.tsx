// Shared quiet not-found page. Cross-org URL probing lands here too (P3
// wires notFound() calls): no error dump, no blank — just a way back.
import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center bg-background px-4">
      <p className="text-sm text-foreground">This page doesn&apos;t exist.</p>
      <Link
        href="/documents"
        className="mt-2 text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground"
      >
        Back to documents
      </Link>
    </main>
  );
}
