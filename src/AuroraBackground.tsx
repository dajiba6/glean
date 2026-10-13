import { useEffect, useRef } from "react";
import { mount } from "ascii.rest";
import * as auroraFjord from "ascii.rest/pieces/aurora-fjord";

export default function AuroraBackground() {
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (canvas.current) return mount(canvas.current, auroraFjord);
  }, []);

  return <canvas ref={canvas} className="aurora-background" aria-hidden="true" />;
}
