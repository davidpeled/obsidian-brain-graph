import { describe, expect, it } from "vitest";
import { parseCssColor } from "./css-color";

describe("parseCssColor", () => {
  it("reads the forms getComputedStyle returns", () => {
    expect(parseCssColor("rgb(218, 218, 218)")).toEqual([218, 218, 218, 1]);
    expect(parseCssColor("rgba(30, 30, 30, 0.5)")).toEqual([30, 30, 30, 0.5]);
    expect(parseCssColor("rgb(10 20 30 / 25%)")).toEqual([10, 20, 30, 0.25]);
    // color-mix() results come back in the color() syntax.
    expect(parseCssColor("color(srgb 0.5 0.25 1)")).toEqual([128, 64, 255, 1]);
    expect(parseCssColor("color(srgb 1 1 1 / 0.4)")).toEqual([255, 255, 255, 0.4]);
  });

  it("rejects what it can't read", () => {
    expect(parseCssColor("")).toBeNull();
    expect(parseCssColor("#ffffff")).toBeNull();
    expect(parseCssColor("color(display-p3 1 0 0)")).toBeNull();
    expect(parseCssColor("rgb(a, b, c)")).toBeNull();
  });
});
