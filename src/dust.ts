// Dissolves an element into drifting dust before it is removed: the element is
// wiped away from one side while small particles in its own colours peel off
// and blow away. Canvas only, transform/opacity on the element, so it stays
// smooth on phones. With reduced motion it simply fades.

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  color: string;
  /** Seconds after the start when this particle leaves the element. */
  delay: number;
  life: number;
}

const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Colours to dust with: the element's background, border, text and accents. */
function palette(element: HTMLElement): string[] {
  const colours = new Set<string>();
  const visible = (value: string) =>
    value && !/rgba?\([^)]*,\s*0\)$/.test(value) && value !== "transparent";
  for (const node of [element, ...element.querySelectorAll<HTMLElement>("*")].slice(0, 40)) {
    const style = getComputedStyle(node);
    for (const value of [style.backgroundColor, style.color, style.borderTopColor])
      if (visible(value)) colours.add(value);
  }
  return colours.size ? [...colours] : ["rgb(128,128,128)"];
}

/**
 * Plays the dust effect on `element` and resolves when it is finished. The
 * caller removes the element afterwards (or hides it), e.g. in AnimatePresence
 * with no exit animation of its own.
 */
export function disintegrate(
  element: HTMLElement,
  { duration = 1.1 }: { duration?: number } = {},
): Promise<void> {
  const rect = element.getBoundingClientRect();
  if (reduced() || !rect.width || !rect.height) {
    return element
      .animate([{ opacity: 1 }, { opacity: 0 }], { duration: 200, fill: "forwards" })
      .finished.then(() => undefined);
  }
  const ratio = Math.min(devicePixelRatio || 1, 2);
  const margin = 120; // Room for the dust to blow away into.
  const canvas = document.createElement("canvas");
  canvas.width = (rect.width + margin * 2) * ratio;
  canvas.height = (rect.height + margin * 2) * ratio;
  Object.assign(canvas.style, {
    position: "fixed",
    left: `${rect.left - margin}px`,
    top: `${rect.top - margin}px`,
    width: `${rect.width + margin * 2}px`,
    height: `${rect.height + margin * 2}px`,
    pointerEvents: "none",
    zIndex: "2147483000",
  });
  document.body.append(canvas);
  const context = canvas.getContext("2d")!;
  context.scale(ratio, ratio);

  const colours = palette(element);
  // Denser for small elements, capped so large panels stay cheap.
  const count = Math.min(900, Math.max(180, Math.round((rect.width * rect.height) / 70)));
  const sweep = duration * 0.55; // How long the wipe takes to cross the element.
  const particles: Particle[] = Array.from({ length: count }, () => {
    const px = Math.random() * rect.width;
    const py = Math.random() * rect.height;
    return {
      x: px + margin,
      y: py + margin,
      vx: 30 + Math.random() * 90,
      vy: -20 - Math.random() * 70,
      size: 1 + Math.random() * 2.2,
      color: colours[Math.floor(Math.random() * colours.length)],
      // Left to right, with some scatter, so it reads as blowing away.
      delay: (px / rect.width) * sweep + Math.random() * 0.12,
      life: 0.5 + Math.random() * 0.5,
    };
  });

  // The element itself is erased from left to right in step with the dust.
  const mask = (edge: number) =>
    `linear-gradient(90deg, transparent ${edge - 8}%, #000 ${edge + 8}%)`;
  const steps = Array.from({ length: 12 }, (_, index) => {
    const edge = -8 + (index / 11) * 116;
    return { maskImage: mask(edge), WebkitMaskImage: mask(edge) } as Keyframe;
  });
  const wipe = element.animate(steps, {
    duration: sweep * 1000 + 120,
    easing: "ease-in",
    fill: "forwards",
  });

  return new Promise((resolve) => {
    const start = performance.now();
    const frame = (now: number) => {
      const t = (now - start) / 1000;
      context.clearRect(0, 0, canvas.width, canvas.height);
      let alive = false;
      for (const particle of particles) {
        const age = t - particle.delay;
        if (age < 0) {
          alive = true;
          continue;
        }
        const progress = age / particle.life;
        if (progress >= 1) continue;
        alive = true;
        // Drifts up and right, slowing slightly, with a gentle wobble.
        const x = particle.x + particle.vx * age + Math.sin(age * 9 + particle.y) * 3;
        const y = particle.y + particle.vy * age - 18 * age * age;
        context.globalAlpha = (1 - progress) * (1 - progress);
        context.fillStyle = particle.color;
        context.fillRect(x, y, particle.size, particle.size);
      }
      if (alive && t < duration + 1) requestAnimationFrame(frame);
      else {
        canvas.remove();
        wipe.cancel();
        element.style.opacity = "0";
        resolve();
      }
    };
    requestAnimationFrame(frame);
  });
}
