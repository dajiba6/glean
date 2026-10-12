import JSZip from "jszip";
import { PDFDocument, StandardFonts } from "pdf-lib";

export async function epubFixture() {
  const zip = new JSZip();
  zip.file("mimetype", "application/epub+zip");
  zip.file(
    "META-INF/container.xml",
    '<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>',
  );
  zip.file(
    "OEBPS/content.opf",
    '<?xml version="1.0"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="id"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="id">reader-test</dc:identifier><dc:title>A Quiet Garden</dc:title><dc:language>en</dc:language><meta property="dcterms:modified">2026-01-01T00:00:00Z</meta></metadata><manifest><item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/><item id="one" href="one.xhtml" media-type="application/xhtml+xml"/><item id="two" href="two.xhtml" media-type="application/xhtml+xml"/><item id="art" href="art.svg" media-type="image/svg+xml"/></manifest><spine><itemref idref="one"/><itemref idref="two"/></spine></package>',
  );
  zip.file(
    "OEBPS/nav.xhtml",
    '<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"><head><title>Contents</title></head><body><nav epub:type="toc"><ol><li><a href="one.xhtml">The Garden</a></li><li><a href="two.xhtml">The Journey</a></li></ol></nav></body></html>',
  );
  zip.file(
    "OEBPS/one.xhtml",
    '<html xmlns="http://www.w3.org/1999/xhtml"><head><title>The Garden</title></head><body><h1>The Garden</h1><p id="sentence">A gentle breeze moved through the garden.</p><img id="art" src="art.svg" width="64" height="16" alt="Garden artwork"/><script>parent.document.body.dataset.compromised="yes";</script><img src="https://should-not-load.invalid/tracker" onerror="parent.document.body.dataset.compromised=\'yes\'"/><a href="javascript:alert(1)">Unsafe link</a>' +
      "<p>Reading is a quiet adventure. Every page offers a new idea, a different voice, and a little more understanding.</p>".repeat(
        16,
      ) +
      "</body></html>",
  );
  zip.file(
    "OEBPS/two.xhtml",
    '<html xmlns="http://www.w3.org/1999/xhtml"><head><title>The Journey</title></head><body><h1>The Journey</h1><p>Another beautiful morning.</p></body></html>',
  );
  zip.file(
    "OEBPS/art.svg",
    '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="16"><rect width="64" height="16" fill="#9bab82"/><script>alert(1)</script></svg>',
  );
  return {
    name: "A Quiet Garden.epub",
    mimeType: "application/epub+zip",
    buffer: await zip.generateAsync({ type: "nodebuffer" }),
  };
}

export async function pdfFixture() {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.TimesRoman);
  const page = pdf.addPage([600, 800]);
  page.drawText("The Garden", { x: 65, y: 720, size: 28, font });
  page.drawText("A gentle breeze moved through the garden.", {
    x: 65,
    y: 660,
    size: 18,
    font,
  });
  page.drawText("Reading is a quiet adventure.", {
    x: 65,
    y: 615,
    size: 18,
    font,
  });
  pdf.addPage([600, 800]);
  return {
    name: "Garden.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from(await pdf.save()),
  };
}
