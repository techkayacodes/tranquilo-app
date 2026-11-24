import { expect, test } from "@playwright/test";
import { gotoArtwork, gotoFeed, ITEMS } from "./harness.mts";

test("the whole Mission, Connect and Support cards activate their controls", async ({
  page,
}) => {
  await gotoFeed(page);
  const cards = page.locator("#feed .slide.intro .action-card");
  await expect(cards).toHaveCount(3);

  await cards.nth(0).locator(".action-card-body p").click({ force: true });
  await expect(page).toHaveURL(/\/pages\/get-involved\.html$/);

  await gotoFeed(page);
  const refreshedCards = page.locator("#feed .slide.intro .action-card");
  await refreshedCards
    .nth(1)
    .locator(".action-card-body p")
    .click({ force: true });
  await expect(page.locator("#newsletterDialog")).toHaveClass(/open/);

  await page.keyboard.press("Escape");
  await gotoFeed(page);
  await page
    .locator("#feed .slide.intro .action-card")
    .nth(2)
    .locator(".action-card-body p")
    .click({ force: true });
  await expect(page).toHaveURL(/\/pages\/support\.html$/);
});

test("detail artwork opens the lightbox and Back returns to the detail panel", async ({
  page,
}) => {
  const item = ITEMS.find(
    (candidate: {
      img?: string;
      title?: string;
      source?: string;
      id: string | number;
    }) => candidate.img && candidate.title,
  );
  if (!item) throw new Error("fixture needs a titled artwork with an image");

  await gotoArtwork(page, item.source || "met", item.id);
  const slide = page
    .locator(`#feed .slide[data-slug$="-${String(item.id)}"]`)
    .first();
  await slide.locator(".art-title-btn").click();
  const detail = page.locator("#detailModal");
  await expect(detail).toHaveClass(/open/);
  await detail.locator(".d-frame img").click();
  await expect(page.locator("#lightbox")).toHaveClass(/open/);
  await page.goBack();
  await expect(page.locator("#lightbox")).not.toHaveClass(/open/);
  await expect(detail).toHaveClass(/open/);
});
