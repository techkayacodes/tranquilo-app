import { afterEach, describe, expect, it, vi } from "vitest";
import { getOrigin } from "../lib/request-origin.ts";

vi.stubEnv("DATABASE_URL", "");
const { default: slugHandler } = await import("../api/v/[slug].ts");

const evilReq = (extra: Record<string, unknown> = {}) =>
  ({
    headers: {
      host: "evil.example",
      "x-forwarded-host": 'evil.example"><script>alert(1)</script>',
      "x-forwarded-proto": "http",
    },
    ...extra,
  }) as never;

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("getOrigin", () => {
  it("prefers the configured canonical origin over any request header", () => {
    vi.stubEnv("CANONICAL_ORIGIN", "https://configured.example/some/path");
    expect(getOrigin(evilReq())).toBe("https://configured.example");
  });

  it("falls back to the fixed production origin, not the Host header, in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("CANONICAL_ORIGIN", "");
    expect(getOrigin(evilReq())).toBe("https://tranquilo.art");
  });

  it("ignores a malformed or non-http canonical origin", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("CANONICAL_ORIGIN", "javascript:alert(1)");
    expect(getOrigin(evilReq())).toBe("https://tranquilo.art");
    vi.stubEnv("CANONICAL_ORIGIN", "not a url");
    expect(getOrigin(evilReq())).toBe("https://tranquilo.art");
  });

  it("uses the request origin outside production", () => {
    vi.stubEnv("CANONICAL_ORIGIN", "");
    expect(
      getOrigin({
        headers: { host: "localhost:3000", "x-forwarded-proto": "http" },
      } as never),
    ).toBe("http://localhost:3000");
  });
});

describe("/v/{slug} with a malicious X-Forwarded-Host", () => {
  function fakeRes() {
    return {
      statusCode: 200,
      body: "",
      setHeader() {},
      end(body: string) {
        this.body = body;
      },
    };
  }

  it("never reflects the forwarded host into the page", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("CANONICAL_ORIGIN", "");
    const res = fakeRes();
    await slugHandler(evilReq({ query: { slug: "discover" } }), res as never);
    expect(res.body).not.toContain("evil.example");
    expect(res.body).not.toContain("<script>alert(1)");
    expect(res.body).toContain("https://tranquilo.art/discover");
  });

  it("escapes the slug in the canonical URL of the not-found page", async () => {
    vi.stubEnv("CANONICAL_ORIGIN", "https://configured.example");
    const res = fakeRes();
    await slugHandler(
      evilReq({ query: { slug: 'met-1"><script>alert(1)</script>' } }),
      res as never,
    );
    expect(res.statusCode).toBe(404);
    expect(res.body).not.toContain("<script>alert(1)");
    expect(res.body).not.toContain("evil.example");
  });
});
