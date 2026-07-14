import { describe, expect, it } from "vitest";
import { titleAccentIndex, titleAccentStyle, SHELF_ACCENT_COUNT } from "./title-accent";

describe("titleAccentIndex", () => {
  it("is stable for the same title", () => {
    expect(titleAccentIndex("Moby Dick")).toBe(titleAccentIndex("Moby Dick"));
  });

  it("returns an integer in [0, SHELF_ACCENT_COUNT)", () => {
    const samples = ["", "a", "中文标题", "The Great Gatsby", "x".repeat(200)];
    for (const s of samples) {
      const i = titleAccentIndex(s);
      expect(Number.isInteger(i)).toBe(true);
      expect(i).toBeGreaterThanOrEqual(0);
      expect(i).toBeLessThan(SHELF_ACCENT_COUNT);
    }
  });

  it("usually differs for different titles", () => {
    expect(titleAccentIndex("Alpha")).not.toBe(titleAccentIndex("Beta"));
  });
});

describe("titleAccentStyle", () => {
  it("returns a CSS custom property object with --shelf-accent", () => {
    const style = titleAccentStyle("Pride and Prejudice");
    expect(style).toHaveProperty("--shelf-accent");
    expect(typeof style["--shelf-accent"]).toBe("string");
    expect(style["--shelf-accent"].length).toBeGreaterThan(0);
  });
});
