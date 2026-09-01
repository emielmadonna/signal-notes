// lib/ingest/pdf-engine.ts — how the upload route gets a working PDF parser,
// on every platform we deploy to.
//
// THE PRODUCTION BUG THIS FIXES (catch: every upload 500'd on Vercel with an
// empty body): pdf.worker.mjs executes `new DOMMatrix()` during MODULE
// EVALUATION. pdfjs polyfills DOMMatrix from @napi-rs/canvas — a native
// package that resolves on a dev machine but is invisible to the serverless
// bundle, so on Vercel the polyfill silently failed ("Cannot polyfill
// `DOMMatrix`, rendering may be broken") and the worker's evaluation threw
// `ReferenceError: DOMMatrix is not defined`. Because the route imported the
// worker STATICALLY, that one reference crashed the whole function at load —
// a .txt upload died on a PDF library it would never touch.
//
// Two defenses, both deliberate:
//   1. A pure-JS DOMMatrix (2D affine, the only geometry text extraction
//      needs) is installed on globalThis BEFORE any pdfjs module evaluates.
//      pdfjs checks `if (!globalThis.DOMMatrix)` first, so ours wins on every
//      platform — dev and prod now run the same code path.
//   2. The whole engine (worker + pdf-parse) loads LAZILY, on the first PDF.
//      If loading still fails, only PDF uploads fail — honestly, as
//      PdfEngineError — and every other format keeps working.

type PdfParseModule = typeof import("pdf-parse");

/** The engine could not be loaded — a server problem, never the user's file. */
export class PdfEngineError extends Error {
  constructor(cause: unknown) {
    super("the PDF engine failed to load");
    this.name = "PdfEngineError";
    this.cause = cause;
  }
}

// ---------------------------------------------------------------------------
// A 2D-affine DOMMatrix: [a b; c d] with translation (e, f), column-vector
// convention, matching the DOM spec for the operations pdfjs actually uses
// (construct from nothing or a 6/16-element array, multiply / translate /
// scale — plain and -Self —, invert, transformPoint, destructure a…f).
// ---------------------------------------------------------------------------

class DOMMatrixPolyfill {
  a = 1;
  b = 0;
  c = 0;
  d = 1;
  e = 0;
  f = 0;

  constructor(init?: number[] | Float32Array | Float64Array | DOMMatrixPolyfill) {
    if (init === undefined || init === null) return;
    if (init instanceof DOMMatrixPolyfill) {
      this.setValues(init.a, init.b, init.c, init.d, init.e, init.f);
      return;
    }
    const v = Array.from(init as ArrayLike<number>);
    if (v.length === 6) {
      this.setValues(v[0], v[1], v[2], v[3], v[4], v[5]);
    } else if (v.length === 16) {
      // Column-major 4x4 → the 2D cells.
      this.setValues(v[0], v[1], v[4], v[5], v[12], v[13]);
    } else {
      throw new TypeError(
        `DOMMatrix init expects 6 or 16 numbers, got ${v.length}`
      );
    }
  }

  private setValues(a: number, b: number, c: number, d: number, e: number, f: number): this {
    this.a = a;
    this.b = b;
    this.c = c;
    this.d = d;
    this.e = e;
    this.f = f;
    return this;
  }

  // 4x4 aliases (2D embedding), read by code written against the full spec.
  get m11() { return this.a; }
  get m12() { return this.b; }
  get m21() { return this.c; }
  get m22() { return this.d; }
  get m41() { return this.e; }
  get m42() { return this.f; }
  get m13() { return 0; }
  get m14() { return 0; }
  get m23() { return 0; }
  get m24() { return 0; }
  get m31() { return 0; }
  get m32() { return 0; }
  get m33() { return 1; }
  get m34() { return 0; }
  get m43() { return 0; }
  get m44() { return 1; }
  get is2D() { return true; }
  get isIdentity() {
    return (
      this.a === 1 && this.b === 0 && this.c === 0 &&
      this.d === 1 && this.e === 0 && this.f === 0
    );
  }

  /** this = this · other (post-multiply, per the spec's multiplySelf). */
  multiplySelf(other: DOMMatrixPolyfill): this {
    const { a, b, c, d, e, f } = this;
    return this.setValues(
      a * other.a + c * other.b,
      b * other.a + d * other.b,
      a * other.c + c * other.d,
      b * other.c + d * other.d,
      a * other.e + c * other.f + e,
      b * other.e + d * other.f + f
    );
  }

  /** this = other · this. */
  preMultiplySelf(other: DOMMatrixPolyfill): this {
    const m = new DOMMatrixPolyfill(other as unknown as number[] | DOMMatrixPolyfill);
    m.multiplySelf(this);
    return this.setValues(m.a, m.b, m.c, m.d, m.e, m.f);
  }

  translateSelf(tx = 0, ty = 0): this {
    return this.multiplySelf(
      Object.assign(new DOMMatrixPolyfill(), { e: tx, f: ty })
    );
  }

  // The third spec parameter is scaleZ; a 2D matrix has no Z to scale, so it
  // is accepted (callers may pass it) and ignored.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  scaleSelf(scaleX = 1, scaleY?: number, _scaleZ = 1, originX = 0, originY = 0): this {
    const sy = scaleY ?? scaleX;
    this.translateSelf(originX, originY);
    this.multiplySelf(
      Object.assign(new DOMMatrixPolyfill(), { a: scaleX, d: sy })
    );
    return this.translateSelf(-originX, -originY);
  }

  rotateSelf(angleDeg = 0): this {
    const r = (angleDeg * Math.PI) / 180;
    const cos = Math.cos(r);
    const sin = Math.sin(r);
    return this.multiplySelf(
      Object.assign(new DOMMatrixPolyfill(), { a: cos, b: sin, c: -sin, d: cos })
    );
  }

  invertSelf(): this {
    const { a, b, c, d, e, f } = this;
    const det = a * d - b * c;
    if (det === 0 || !Number.isFinite(det)) {
      // Per spec: a non-invertible matrix becomes NaN and is2D stays as-is.
      return this.setValues(NaN, NaN, NaN, NaN, NaN, NaN);
    }
    return this.setValues(
      d / det,
      -b / det,
      -c / det,
      a / det,
      (c * f - d * e) / det,
      (b * e - a * f) / det
    );
  }

  multiply(other: DOMMatrixPolyfill): DOMMatrixPolyfill {
    return new DOMMatrixPolyfill(this).multiplySelf(other);
  }

  translate(tx = 0, ty = 0): DOMMatrixPolyfill {
    return new DOMMatrixPolyfill(this).translateSelf(tx, ty);
  }

  scale(scaleX = 1, scaleY?: number, scaleZ = 1, originX = 0, originY = 0): DOMMatrixPolyfill {
    return new DOMMatrixPolyfill(this).scaleSelf(scaleX, scaleY, scaleZ, originX, originY);
  }

  inverse(): DOMMatrixPolyfill {
    return new DOMMatrixPolyfill(this).invertSelf();
  }

  transformPoint(point: { x?: number; y?: number } = {}): { x: number; y: number; z: number; w: number } {
    const x = point.x ?? 0;
    const y = point.y ?? 0;
    return {
      x: this.a * x + this.c * y + this.e,
      y: this.b * x + this.d * y + this.f,
      z: 0,
      w: 1,
    };
  }

  toFloat32Array(): Float32Array {
    const { a, b, c, d, e, f } = this;
    return new Float32Array([a, b, 0, 0, c, d, 0, 0, 0, 0, 1, 0, e, f, 0, 1]);
  }

  toFloat64Array(): Float64Array {
    return Float64Array.from(this.toFloat32Array());
  }
}

/** Install the polyfill if the runtime has no DOMMatrix. Idempotent. */
export function installPdfPolyfills(): void {
  const g = globalThis as { DOMMatrix?: unknown };
  if (typeof g.DOMMatrix === "undefined") {
    g.DOMMatrix = DOMMatrixPolyfill;
  }
}

// ---------------------------------------------------------------------------
// The lazy engine. One in-flight/settled promise per process; a FAILED load is
// forgotten so the next PDF retries instead of caching the rejection forever.
// ---------------------------------------------------------------------------

let enginePromise: Promise<PdfParseModule> | null = null;

export function loadPdfEngine(): Promise<PdfParseModule> {
  if (enginePromise === null) {
    enginePromise = (async () => {
      installPdfPolyfills();
      // pdf.js resolves its worker with a runtime dynamic import that a
      // bundled server route cannot satisfy ("Cannot find module
      // …/pdf.worker.mjs"). The documented escape hatch is the main-thread
      // global: when globalThis.pdfjsWorker is set, pdf.js uses it and never
      // dynamic-imports (see PDFWorker._setupFakeWorkerGlobal in pdfjs-dist).
      // Importing it here — AFTER the polyfill, and only when a PDF actually
      // arrives — lets the bundler carry it without letting its module
      // evaluation crash the route. Same pinned version as pdf-parse's own
      // pdfjs, so the api/worker version check always matches.
      // @ts-expect-error -- pdf.worker.mjs ships no type declarations
      const worker = await import("pdfjs-dist/legacy/build/pdf.worker.mjs");
      (globalThis as { pdfjsWorker?: unknown }).pdfjsWorker = worker;
      return await import("pdf-parse");
    })().catch((cause) => {
      enginePromise = null;
      throw new PdfEngineError(cause);
    });
  }
  return enginePromise;
}
