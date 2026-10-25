import { describe, it, expect } from "vitest";
import {
  parseColorInput,
  parseColorBatch,
  formatColor,
  exactColorKey,
  getContrast,
  cssVariables,
} from "../lib/color-core";
import { normalizeUrl } from "../lib/validation";
function value(s: string, scale?: "unit" | "byte") {
  const p = parseColorInput(s, scale);
  if (p.state !== "valid") throw new Error(p.issues.join());
  return p.value;
}
describe("P0 color engine", () => {
  it.each([
    "#F00",
    "ff0000",
    "red",
    "rgb(255, 0, 0)",
    "rgb(255 0 0)",
    "rgb(100% 0% 0%)",
    "hsl(0,100%,50%)",
    "hsl(0 100% 50%)",
    "hsv(0,100%,100%)",
    "hsb(0,100%,100%)",
    "255,0,0",
  ])("normalizes %s to red without losing original input", (input) => {
    const c = value(input);
    expect(formatColor(c, "hex")).toBe("#FF0000");
    expect(c.originalInput).toBe(input);
    expect(c.xyzD65).toHaveLength(3);
  });
  it("preserves alpha and flags byte quantization", () => {
    const c = value("rgba(255,0,0,0.5)");
    expect(c.alpha).toBe(0.5);
    expect(formatColor(c)).toBe("rgb(255 0 0 / 0.5)");
    expect(formatColor(c, "hex")).toBe("#FF000080");
    expect(c.alpha).toBe(0.5);
    expect(value("#FF000080").alpha).toBe(128 / 255);
  });
  it("handles modern alpha percentages and short HEX8", () => {
    expect(value("rgb(255 0 0 / 50%)").alpha).toBe(0.5);
    expect(value("#F008").alpha).toBe(136 / 255);
  });
  it("does not lose high precision", () => {
    const c = value("rgb(12.34567 50.789 200.0123 / .1234567)");
    expect(formatColor(c, "rgb")).toBe(
      "rgb(12.34567 50.789 200.0123 / 0.1234567)",
    );
    expect(value(formatColor(c, "rgb")).alpha).toBe(c.alpha);
  });
  it.each(["#12", "", "rgb(2,"])("reports incomplete input %s", (s) =>
    expect(parseColorInput(s).state).toBe("incomplete"),
  );
  it.each([
    "#GG0000",
    "red; background:url(x)",
    "var(--brand)",
    "currentColor",
    "color-mix(in srgb,red,blue)",
    "hsv(0,101%,100%)",
    "256,0,0",
    "rgb(NaN 0 0)",
    "red garbage",
  ])("rejects unsafe or invalid %s", (s) =>
    expect(parseColorInput(s).state).toBe("invalid"),
  );
  it("warns on bare hex and explicit byte scale", () => {
    const p = parseColorInput("bad");
    expect(p.state).toBe("valid");
    if (p.state === "valid") expect(p.warnings[0]).toContain("#BBAADD");
    expect(formatColor(value("1,0,0"), "hex")).toBe("#010000");
  });
  it("requires scale for ambiguous fractional triples", () => {
    expect(parseColorInput("0.2,0.4,0.6").state).toBe("ambiguous");
    expect(formatColor(value("0.2,0.4,0.6", "unit"), "hex")).toBe("#336699");
    expect(formatColor(value("0.2,0.4,0.6", "byte"), "hex")).toBe("#000001");
  });
  it("tokenizes parentheses and preserves invalid candidates", () => {
    const batch = parseColorBatch(
      "rgb(255,0,0); #00FF00\nhsl(240,100%,50%); not-a-color",
    );
    expect(batch).toHaveLength(4);
    expect(batch.slice(0, 3).every((x) => x.result.state === "valid")).toBe(
      true,
    );
    expect(batch[3].result.state).toBe("invalid");
  });
  it("bounds batch size", () =>
    expect(
      parseColorBatch(Array(201).fill("#fff").join(";"))[0].result.state,
    ).toBe("invalid"));
  it("finds equivalent color values, keeping alpha distinct", () => {
    expect(exactColorKey(value("red"))).toBe(
      exactColorKey(value("hsl(0 100% 50%)")),
    );
    expect(exactColorKey(value("red"))).not.toBe(exactColorKey(value("#f008")));
  });
  it("computes black-white 21:1 and composites alpha", () => {
    expect(getContrast(value("#000"), value("#fff"), value("#fff"))).toBe(21);
    expect(
      getContrast(value("rgb(0 0 0 / .5)"), value("#fff"), value("#fff")),
    ).toBeCloseTo(3.97665, 4);
    expect(() =>
      getContrast(value("#000"), value("#fff"), value("transparent")),
    ).toThrow();
  });
  it("exports safe unique CSS identifiers", () => {
    const css = cssVariables([
      { value: value("red"), role: "primary" },
      { value: value("blue"), role: "primary" },
      { value: value("green"), role: "bad; } body {" },
    ]);
    expect(css).toContain("--color-primary-2:");
    expect(css).not.toContain("} body");
  });
  it("preserves out-of-gamut sources and marks preview", () => {
    const c = value("color(display-p3 1 0 0)");
    expect(c.preview.approximate).toBe(true);
    expect(formatColor(c)).toBe(c.originalInput);
  });
  it("round trips representative RGB bytes", () => {
    for (const r of [0, 1, 45, 128, 254, 255])
      for (const g of [0, 56, 128, 255])
        for (const b of [0, 96, 255]) {
          const c = value(`rgb(${r} ${g} ${b})`);
          expect(formatColor(value(formatColor(c, "hsl")), "hex")).toBe(
            formatColor(c, "hex"),
          );
        }
  });
});
describe("bookmark URL contract", () => {
  it("keeps content parameters and anchor while stripping tracking", () =>
    expect(
      normalizeUrl("https://Example.com/Path?utm_source=x&id=2#section"),
    ).toBe("https://example.com/Path?id=2#section"));
  it.each([
    "javascript:alert(1)",
    "data:text/html,x",
    "https://a:b@example.com/",
    "https://example.com/\n",
  ])("rejects %s", (url) => expect(() => normalizeUrl(url)).toThrow());
});

describe("precision and scale regression", () => {
  it("retains the explicit RGB unit scale", () => {
    const c = value("0.2,0.4,0.6", "unit");
    expect(c.inputScale).toBe("unit");
    expect(formatColor(value(c.originalInput, c.inputScale), "hex")).toBe(
      "#336699",
    );
  });
  it("normalizes out-of-range CSS channels without allowing invalid custom HSV", () => {
    expect(formatColor(value("rgb(300 -30 0)"), "hex")).toBe("#FF0000");
    expect(parseColorInput("hsv(10,200%,10%)").state).toBe("invalid");
  });
});

it("auto preserves opaque fractional-channel CSS and tiny nonzero alpha", () => {
  const raw = "rgb(12.3456789012 50 200)";
  expect(formatColor(value(raw))).toBe(raw);
  const tiny = value("rgb(255 0 0 / 0.0000000001)");
  expect(value(formatColor(tiny)).alpha).toBe(1e-10);
});
