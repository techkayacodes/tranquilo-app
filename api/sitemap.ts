// /sitemap.xml (rewritten here from vercel.json).
//
// Lists the site's own pages: home, static pages, /discover, category landing
// pages, shelves and storylines. Individual artworks (/v/{slug}) are
// deliberately absent -- the catalogue is not enumerated for crawlers.
//
// Generated rather than checked in, because shelves and storylines live in
// Postgres and change without a deploy.
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { CATEGORY_PAGES } from "../lib/category-pages.ts";
import { getSql } from "../lib/db.ts";
import { getOrigin } from "../lib/request-origin.ts";
import { reportError } from "../lib/sentry.ts";
import {
  getShelfPreview,
  getShelves,
  isShareableShelf,
} from "../lib/shelves.ts";
import {
  escapeXml,
  renderStaticPageHreflangLinks,
} from "../lib/sitemap-hreflang.ts";
import { getStorylineIndex } from "../lib/storylines.ts";
import { staticPageAlternates } from "../src/i18n/pages.ts";

const STATIC_PAGES = [
  { path: "/pages/about.html", priority: "0.8" },
  { path: "/pages/submit.html", priority: "0.6" },
  { path: "/pages/get-involved.html", priority: "0.6" },
  { path: "/pages/curator.html", priority: "0.5" },
  { path: "/pages/privacy.html", priority: "0.3" },
  { path: "/pages/terms.html", priority: "0.3" },
];

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") {
    res.statusCode = 405;
    res.setHeader("Allow", "GET");
    res.end("Method not allowed");
    return;
  }

  const client = getSql();
  if (!client) {
    console.error("sitemap: missing DATABASE_URL env var");
    res.statusCode = 500;
    res.end("Sitemap isn't configured yet");
    return;
  }

  try {
    const [allShelves, storylines] = await Promise.all([
      getShelves(client),
      getStorylineIndex(client),
    ]);
    const shareable = allShelves.filter(isShareableShelf);
    const counts = await Promise.all(
      shareable.map(
        async (shelf) => (await getShelfPreview(client, shelf)).count,
      ),
    );
    const shelves = shareable.filter((_, i) => counts[i] > 0);
    const origin = getOrigin(req);

    const entry = (path: string, changefreq: string, priority: string) =>
      `  <url>
    <loc>${escapeXml(origin + path)}</loc>
    <changefreq>${changefreq}</changefreq>
    <priority>${priority}</priority>
  </url>
`;
    const staticEntries = STATIC_PAGES.flatMap((page) => {
      const file = page.path.split("/").at(-1) ?? page.path;
      const alternates = staticPageAlternates(file);
      const paths =
        alternates.length > 0
          ? [...new Set(alternates.map((alternate) => alternate.path))]
          : [page.path];
      return paths.map(
        (path) => `  <url>
    <loc>${escapeXml(origin + path)}</loc>
${renderStaticPageHreflangLinks(path, origin)}
    <changefreq>yearly</changefreq>
    <priority>${page.priority}</priority>
  </url>
`,
      );
    });
    const entries = [
      entry("/", "daily", "1.0"),
      entry("/discover", "weekly", "0.8"),
      ...staticEntries,
      ...CATEGORY_PAGES.map((page) =>
        entry(`/category/${page.slug}`, "weekly", "0.7"),
      ),
      ...shelves.map((shelf) =>
        entry(`/shelf/${encodeURIComponent(shelf.slug)}`, "weekly", "0.6"),
      ),
      ...storylines.map((storyline) =>
        entry(`/s/${encodeURIComponent(storyline.id)}`, "monthly", "0.6"),
      ),
    ];

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
${entries.join("")}</urlset>`;

    res.statusCode = 200;
    res.setHeader("Content-Type", "application/xml; charset=utf-8");
    res.setHeader("Cache-Control", "public, max-age=600, s-maxage=3600");
    res.end(xml);
  } catch (err) {
    console.error("sitemap: query failed", err);
    await reportError(err);
    res.statusCode = 500;
    res.end("Failed to build sitemap");
  }
}
