// Original Reader glyphs, using the same SVG pixel construction as the personal-site logo.
const glyphs = [
  ["####.", "#...#", "#...#", "####.", "#.#..", "#..#.", "#...#"],
  [".....", ".....", ".###.", "#...#", "#####", "#....", ".####"],
  [".....", ".....", ".###.", "....#", ".####", "#...#", ".####"],
  ["....#", "....#", ".####", "#...#", "#...#", "#...#", ".####"],
  [".....", ".....", ".###.", "#...#", "#####", "#....", ".####"],
  [".....", ".....", "#.##.", "##..#", "#....", "#....", "#...."],
];

export function PixelWordmark() {
  return (
    <svg
      className="pixel-wordmark"
      viewBox="0 0 38 7"
      width="114"
      height="21"
      role="img"
      aria-label="Reader"
      shapeRendering="crispEdges"
    >
      {glyphs.flatMap((glyph, index) =>
        glyph.flatMap((line, y) =>
          [...line.matchAll(/#+/g)].map((match) => (
            <rect
              key={`${index}-${y}-${match.index}`}
              x={index * 6 + match.index}
              y={y}
              width={match[0].length}
              height="1"
            />
          )),
        ),
      )}
      <rect className="brand-dot" x="36" y="6" width="2" height="1" />
    </svg>
  );
}

// Pixelarticons v1.8.1, book-open (MIT). License: licenses/pixelarticons-MIT.txt.
// https://github.com/halfmage/pixelarticons/blob/v1.8.1/svg/book-open.svg
export function PixelBook({ size = 24 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      shapeRendering="crispEdges"
      aria-hidden="true"
    >
      <path d="M3 3h8v2H3v12h8V5h2v12h8V5h-8V3h10v16H13v2h-2v-2H1V3h2zm16 7h-4v2h4v-2zm-4-3h4v2h-4V7zm2 6h-2v2h2v-2z" />
    </svg>
  );
}
