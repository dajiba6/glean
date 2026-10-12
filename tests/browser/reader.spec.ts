import { test, expect, type Locator, type Page } from "@playwright/test";
import { epubFixture, pdfFixture } from "../fixtures";

async function wordPoint(locator: Locator, word: string) {
  return locator.evaluate((element, word) => {
    const walker = element.ownerDocument.createTreeWalker(
      element,
      NodeFilter.SHOW_TEXT,
    );
    while (walker.nextNode()) {
      const text = walker.currentNode.textContent || "";
      const index = text.indexOf(word);
      if (index < 0) continue;
      const range = element.ownerDocument.createRange();
      range.setStart(walker.currentNode, index);
      range.setEnd(walker.currentNode, index + word.length);
      const box = range.getBoundingClientRect();
      const frame =
        element.ownerDocument.defaultView?.frameElement?.getBoundingClientRect();
      return {
        x: box.x + box.width / 2 + (frame?.x || 0),
        y: box.y + box.height / 2 + (frame?.y || 0),
      };
    }
    throw new Error("Word not found");
  }, word);
}
async function clickWord(page: Page, locator: Locator, word: string) {
  const point = await wordPoint(locator, word);
  await page.mouse.click(point.x, point.y);
}

test("base path, assets, deep refresh, relative redirect and API errors", async ({
  page,
  request,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/reader/");
  await expect(
    page.getByRole("heading", { name: "今天，读哪一本？" }),
  ).toBeVisible();
  await page.screenshot({ path: ".tmp/home.png", fullPage: true });
  await page.goto("/reader/reading");
  await page.reload();
  await expect(page.getByRole("button", { name: "选择一本书" })).toBeVisible();
  const redirect = await request.get("/reader?test=1", { maxRedirects: 0 });
  expect(redirect.status()).toBe(308);
  expect(redirect.headers().location).toBe("/reader/?test=1");
  const missing = await request.get("/reader/api/missing");
  expect(missing.status()).toBe(404);
  expect(missing.headers()["content-type"]).toContain("json");
  expect(errors).toEqual([]);
});

test("EPUB local reading, safe content, word/Chinese/cache, font size, directory and reset", async ({
  page,
  request,
}) => {
  const errors: string[] = [];
  const remote: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("request", (req) => {
    if (req.url().startsWith("https:")) remote.push(req.url());
  });
  await page.goto("/reader/");
  await page.getByLabel("选择电子书").setInputFiles(await epubFixture());
  const frame = page.frameLocator(".epub-content iframe").first();
  await expect(frame.locator("#sentence")).toBeVisible();
  await expect
    .poll(() =>
      frame
        .locator("#art")
        .evaluate(
          (image: HTMLImageElement) => image.complete && image.naturalWidth > 0,
        ),
    )
    .toBe(true);
  await expect(page.getByText("正在打开书籍…")).not.toBeVisible();
  expect(await frame.locator("script").count()).toBe(0);
  expect(
    await page.locator("body").getAttribute("data-compromised"),
  ).toBeNull();
  await clickWord(page, frame.locator("#sentence"), "gentle");
  await expect(page.getByRole("dialog")).toContainText(
    "Soft and calm; not rough or strong.",
  );
  await page.screenshot({ path: ".tmp/epub.png", fullPage: true });
  await page.getByRole("button", { name: "看不懂，看看中文" }).click();
  await expect(page.getByRole("dialog")).toContainText("轻柔的；温和的。");
  const before = (
    await (await request.get("http://127.0.0.1:43138/requests")).json()
  ).length;
  await page.getByRole("button", { name: "返回英文" }).click();
  await expect(page.getByRole("dialog")).toContainText(
    "Soft and calm; not rough or strong.",
  );
  const all = await (
    await request.get("http://127.0.0.1:43138/requests")
  ).json();
  expect(all.length).toBe(before);
  expect(all.at(-1).messages[1].content).toBe("gentle");
  await page.getByRole("button", { name: "关闭解释" }).click();
  await page.getByLabel("字号", { exact: true }).selectOption("24");
  await page.getByRole("button", { name: "目录", exact: true }).click();
  await page.getByRole("button", { name: "The Journey", exact: true }).click();
  await expect(frame.getByText("Another beautiful morning.")).toBeVisible();
  expect(remote).toEqual([]);
  expect(
    await page.evaluate(() => ({
      local: localStorage.length,
      session: sessionStorage.length,
    })),
  ).toEqual({ local: 0, session: 0 });
  expect(errors).toEqual([]);
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "今天，读哪一本？" }),
  ).toBeVisible();
});

test("PDF text layer, click, zoom, page navigation and scanned-page notice", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/reader/");
  await page.getByLabel("选择电子书").setInputFiles(await pdfFixture());
  const sentence = page
    .locator(".textLayer span")
    .filter({ hasText: "A gentle breeze" });
  await expect(sentence).toBeVisible();
  await clickWord(page, sentence, "gentle");
  await expect(page.getByRole("dialog")).toContainText(
    "Soft and calm; not rough or strong.",
  );
  await page.screenshot({ path: ".tmp/pdf.png", fullPage: true });
  await page.getByRole("button", { name: "关闭解释" }).click();
  await page.getByRole("button", { name: "放大", exact: true }).click();
  await expect(page.getByText("110%", { exact: true })).toBeVisible();
  await clickWord(page, sentence, "breeze");
  await expect(page.getByRole("dialog").locator(".selected-text")).toHaveText(
    "breeze",
  );
  await page.getByRole("button", { name: "关闭解释" }).click();
  await page.getByRole("button", { name: "下一页" }).click();
  await expect(page.getByLabel("页码")).toHaveValue("2");
  await expect(
    page.getByText("这一页没有可选择的文字", { exact: false }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});

test("sentence selection waits for explicit explain; network failure keeps selection and retry works", async ({
  page,
}) => {
  await page.goto("/reader/");
  await page.getByLabel("选择电子书").setInputFiles(await pdfFixture());
  const sentence = page
    .locator(".textLayer span")
    .filter({ hasText: "A gentle breeze" });
  await expect(sentence).toBeVisible();
  const box = (await sentence.boundingBox())!;
  await page.mouse.move(box.x + 1, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width - 1, box.y + box.height / 2, {
    steps: 15,
  });
  await page.mouse.up();
  await expect(
    page.getByRole("button", { name: "解释这段文字" }),
  ).toBeVisible();
  await page.route("**/reader/api/translate", (route) =>
    route.abort("connectionfailed"),
  );
  await page.getByRole("button", { name: "解释这段文字" }).click();
  await expect(page.getByRole("dialog").getByRole("alert")).toBeVisible();
  await expect(
    page.getByRole("dialog").locator(".selected-text"),
  ).toContainText("gentle breeze");
  await page.unroute("**/reader/api/translate");
  await page.getByRole("button", { name: "重试", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText(
    "Soft and calm; not rough or strong.",
  );
});
