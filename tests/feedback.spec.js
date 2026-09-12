const { test, expect } = require("@playwright/test");

test("ハンバーガーメニューから改善・お問い合わせへ1タップで移動し戻れる", async ({ page }) => {
  await page.goto("/");

  const menu = page.locator("#app-menu");
  await expect(menu).toBeHidden();
  await page.locator("#menu-btn").click();
  await expect(menu).toBeVisible();
  await expect(page.locator("#menu-btn")).toHaveAttribute("aria-expanded", "true");

  const feedbackLink = page.getByRole("link", { name: "改善・お問い合わせ" });
  await expect(feedbackLink).toBeVisible();
  await feedbackLink.click();

  await expect(page).toHaveURL(/feedback\.html$/);
  await expect(page.getByRole("heading", { name: "改善・お問い合わせ" })).toBeVisible();
  await page.locator("#feedback-back").click();
  await expect(page).toHaveURL(/\/$/);
});

test("改善・お問い合わせは3区分を選択できる", async ({ page }) => {
  await page.goto("/feedback.html");
  const options = page.locator("#feedback-category option");
  await expect(options).toHaveCount(3);
  await expect(options).toHaveText(["改善要望", "不具合報告", "その他"]);
});

test("入力内容は端末下書きとして再読み込み後も復元される", async ({ page }) => {
  await page.goto("/feedback.html");
  await page.locator("#feedback-category").selectOption("不具合報告");
  await page.locator("#feedback-message").fill("80号の表示確認テスト");

  await page.reload();

  await expect(page.locator("#feedback-category")).toHaveValue("不具合報告");
  await expect(page.locator("#feedback-message")).toHaveValue("80号の表示確認テスト");
});

test("送信先はGitHub Issuesで本文以外の位置情報を自動添付しない", async ({ page }) => {
  await page.goto("/feedback.html");
  await page.locator("#feedback-category").selectOption("その他");
  await page.locator("#feedback-message").fill("表示について相談したいです");

  const href = await page.locator("#feedback-send").getAttribute("href");
  expect(href).toBeTruthy();
  const url = new URL(href);
  expect(url.hostname).toBe("github.com");
  expect(url.pathname).toBe("/oosaka0123-sudo/osaka-nextbus/issues/new");
  expect(url.searchParams.get("title")).toBe("[その他] 次バス大阪");
  expect(url.searchParams.get("body")).toContain("表示について相談したいです");
  expect(url.searchParams.has("lat")).toBe(false);
  expect(url.searchParams.has("lon")).toBe(false);
  expect(url.searchParams.has("stop")).toBe(false);
  expect(url.searchParams.has("route")).toBe(false);
});
