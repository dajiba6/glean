import createDOMPurify from "dompurify";
import JSZip from "jszip";

const unsafeUrl = (value: string) =>
  /^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(
    value.trim().replace(/[\u0000-\u0020]/g, ""),
  ) && !/^data:image\/(?:png|jpeg|gif|webp);base64,/i.test(value.trim());

export function sanitizeChapter(source: string, svg = false) {
  // Parse full XHTML before sanitizing: DOMPurify wraps string input in a body,
  // which puts XML declarations and doctypes in an invalid position.
  let input: string | Element = source;
  if (!svg) {
    const document = new DOMParser().parseFromString(source, "application/xhtml+xml");
    if (document.querySelector("parsererror"))
      throw new Error("书籍章节无法解析，请检查 EPUB 文件。");
    input = document.documentElement;
  }
  const purifier = createDOMPurify(window);
  purifier.addHook("uponSanitizeAttribute", (_node, data) => {
    if (
      ["href", "src", "xlink:href", "poster", "action"].includes(
        data.attrName,
      ) &&
      unsafeUrl(data.attrValue)
    )
      data.keepAttr = false;
  });
  return purifier.sanitize(input, {
    WHOLE_DOCUMENT: !svg,
    FORCE_BODY: false,
    FORBID_TAGS: [
      "script",
      "iframe",
      "object",
      "embed",
      "form",
      "input",
      "button",
      "textarea",
      "select",
      "base",
      "meta",
      "foreignObject",
      "audio",
      "video",
    ],
    FORBID_ATTR: ["srcset", "formaction", "target", "ping"],
    ADD_TAGS: ["link"],
    ADD_ATTR: ["xmlns", "epub:type"],
    PARSER_MEDIA_TYPE: svg ? "text/html" : "application/xhtml+xml",
  });
}

/** Produce a sanitized in-memory EPUB before the renderer creates any blob URLs. */
export async function prepareEpub(file: File) {
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  if (!zip.file("META-INF/container.xml"))
    throw new Error("不是有效的 EPUB 文件。");
  await Promise.all(
    Object.values(zip.files)
      .filter((entry) => !entry.dir)
      .map(async (entry) => {
        if (/\.(?:xhtml|html|htm|svg)$/i.test(entry.name)) {
          const clean = sanitizeChapter(
            await entry.async("string"),
            /\.svg$/i.test(entry.name),
          );
          if (!clean) throw new Error("书籍章节无法解析，请检查 EPUB 文件。");
          zip.file(entry.name, clean);
        } else if (/\.css$/i.test(entry.name)) {
          const css = await entry.async("string");
          zip.file(
            entry.name,
            css
              .replace(/@import\s[^;]+;/gi, "")
              .replace(
                /url\(\s*(['"]?)(.*?)\1\s*\)/gi,
                (match, _quote, value) =>
                  unsafeUrl(value) ? 'url("")' : match,
              ),
          );
        }
      }),
  );
  return zip.generateAsync({ type: "arraybuffer" });
}
