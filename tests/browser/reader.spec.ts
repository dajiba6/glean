import { test, expect, type Locator, type Page } from "@playwright/test";
import { epubFixture, pdfFixture } from "../fixtures";
import JSZip from "jszip";

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
  await page.mouse.dblclick(point.x, point.y);
}

test("base path, assets, deep refresh, relative redirect and API errors", async ({
  page,
  request,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1189, height: 655 });
  await page.goto("/glean/");
  await expect(
    page.getByRole("heading", { name: /跨过语言壁垒，\s*看见更广阔的世界/ }),
  ).toBeVisible();
  await page.screenshot({ path: ".tmp/home.png", fullPage: true });
  await page.goto("/glean/reading");
  await page.reload();
  await expect(page.getByRole("button", { name: "开始阅读" })).toBeVisible();
  const redirect = await request.get("/glean?test=1", { maxRedirects: 0 });
  expect(redirect.status()).toBe(308);
  expect(redirect.headers().location).toBe("/glean/?test=1");
  const missing = await request.get("/glean/api/missing");
  expect(missing.status()).toBe(404);
  expect(missing.headers()["content-type"]).toContain("json");
  expect(errors).toEqual([]);
});

test("EPUB cover is not clipped and short chapters fill the reading viewport", async ({ page }) => {
  const fixture = await epubFixture();
  const zip = await JSZip.loadAsync(fixture.buffer);
  zip.file("OEBPS/one.xhtml", '<html xmlns="http://www.w3.org/1999/xhtml"><head><title>Cover</title></head><body><svg xmlns="http://www.w3.org/2000/svg" width="600" height="800" viewBox="0 0 600 800"><text x="50" y="760">Cover translator</text></svg><p id="cover-end">End of cover</p></body></html>');
  await page.setViewportSize({ width: 1189, height: 655 });
  await page.goto("/glean/");
  await page.getByLabel("选择电子书").setInputFiles({ ...fixture, buffer: await zip.generateAsync({ type: "nodebuffer" }) });
  const cover = page.frameLocator(".epub-content iframe").first();
  await expect(cover.locator("#cover-end")).toBeVisible();
  await expect.poll(() => cover.locator("body").evaluate((body) => Math.ceil(body.getBoundingClientRect().bottom) <= innerHeight)).toBe(true);
  await page.getByRole("button", { name: "目录", exact: true }).click();
  await page.getByRole("button", { name: "The Journey", exact: true }).click();
  const chapter = page.frameLocator(".epub-content iframe").last();
  await expect(chapter.getByText("Another beautiful morning.")).toBeVisible();
  const stageHeight = (await page.locator(".epub-stage").boundingBox())!.height;
  await expect.poll(() => chapter.locator("body").evaluate(() => innerHeight)).toBeGreaterThanOrEqual(stageHeight - 48);
});

test("EPUB scrolls within a fixed window and supports zoom", async ({ page }) => {
  await page.setViewportSize({ width: 1189, height: 655 });
  await page.goto("/glean/");
  await page.getByLabel("选择电子书").setInputFiles(await epubFixture());
  const frame = page.frameLocator(".epub-content iframe").first();
  await expect(frame.locator("#sentence")).toBeVisible();
  const scroller = page.locator(".epub-container");
  const stageBounds = (await page.locator(".epub-stage").boundingBox())!;
  const scrollBounds = (await scroller.boundingBox())!;
  expect(Math.abs(scrollBounds.x - stageBounds.x)).toBeLessThan(2);
  expect(Math.abs(scrollBounds.width - stageBounds.width)).toBeLessThan(2);
  expect(Math.abs(scrollBounds.y + scrollBounds.height - stageBounds.y - stageBounds.height)).toBeLessThan(2);
  await expect.poll(() => frame.locator("body").evaluate((el) => el.scrollWidth <= innerWidth)).toBe(true);
  await expect.poll(() => scroller.evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(true);
  await frame.locator("#sentence").hover();
  await page.mouse.wheel(0, 350);
  await expect.poll(() => scroller.evaluate((el) => el.scrollTop)).toBeGreaterThan(100);
  await page.getByRole("button", { name: "放大", exact: true }).click();
  await expect(page.getByText("110%", { exact: true })).toBeVisible();
  await expect.poll(() => frame.locator("body").evaluate((el) => getComputedStyle(el).fontSize)).toBe("22px");
  await expect(page.getByRole("button", { name: "适合宽度", exact: true })).toHaveCount(0);
  await page.screenshot({ path: ".tmp/epub-scroll.png" });
});

test("EPUB XML declarations and doctypes preserve chapters and navigation", async ({ page }) => {
  await page.goto("/glean/");
  await page.getByLabel("选择电子书").setInputFiles(await epubFixture(true));
  const frame = page.frameLocator(".epub-content iframe").first();
  await expect(frame.locator("body")).not.toContainText("XML declaration allowed only");
  await expect(frame.locator("#sentence")).toBeVisible();
  await expect(frame.locator("script")).toHaveCount(0);
  await page.getByRole("button", { name: "目录", exact: true }).click();
  await page.getByRole("button", { name: "The Journey", exact: true }).click();
  await expect(page.frameLocator(".epub-content iframe").last().getByText("Another beautiful morning.")).toBeVisible();
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
  await page.goto("/glean/");
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
  await page.getByRole("button", { name: "返回原文语言解释" }).click();
  await expect(page.getByRole("dialog")).toContainText(
    "Soft and calm; not rough or strong.",
  );
  const all = await (
    await request.get("http://127.0.0.1:43138/requests")
  ).json();
  expect(all.length).toBe(before);
  expect(all.at(-1).messages[1].content).toBe("gentle");
  await page.getByRole("button", { name: "关闭解释" }).click();
  await page.getByRole("button", { name: "放大", exact: true }).click();
  await expect(page.getByText("110%", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "目录", exact: true }).click();
  await page.getByRole("button", { name: "The Journey", exact: true }).click();
  await expect(page.frameLocator(".epub-content iframe").last().getByText("Another beautiful morning.")).toBeVisible();
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
    page.getByRole("heading", { name: /跨过语言壁垒，\s*看见更广阔的世界/ }),
  ).toBeVisible();
});

test("PDF text layer, click, zoom, page navigation and scanned-page notice", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/glean/");
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

test("sentence selection explains immediately; network failure keeps selection and retry works", async ({
  page,
}) => {
  await page.goto("/glean/");
  await page.route("**/glean/api/translate", (route) =>
    route.abort("connectionfailed"),
  );
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
  await expect(page.getByRole("dialog").getByRole("alert")).toBeVisible();
  await expect(
    page.getByRole("dialog").locator(".selected-text"),
  ).toContainText("gentle breeze");
  await page.unroute("**/glean/api/translate");
  await page.getByRole("button", { name: "重试", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText(
    "Soft and calm; not rough or strong.",
  );
});
