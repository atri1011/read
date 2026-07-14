import { describe, expect, it } from "vitest";
import {
  isActiveParseStatus,
  normalizeJobProgress,
  progressBadgeText,
  progressLabel,
  shelfDetailLabel,
  shelfStatusLabel,
} from "./job-progress";

describe("normalizeJobProgress", () => {
  it("parses stage/page/total from jsonb", () => {
    expect(
      normalizeJobProgress({ stage: "vision", page: 3, total: "12" }),
    ).toEqual({ stage: "vision", page: 3, total: 12 });
  });

  it("returns null for invalid values", () => {
    expect(normalizeJobProgress(null)).toBeNull();
    expect(normalizeJobProgress([])).toBeNull();
    expect(normalizeJobProgress("x")).toBeNull();
  });
});

describe("progressLabel", () => {
  it("describes vision and translate stages", () => {
    expect(
      progressLabel({ stage: "vision", page: 2, total: 10 }),
    ).toBe("视觉识别：2/10 页");
    expect(
      progressLabel({ stage: "translate", page: 4, total: 20 }),
    ).toBe("正在补译：4/20 句");
    expect(progressLabel(null)).toBe("准备中…");
  });
});

describe("shelfStatusLabel", () => {
  it("distinguishes queued vs running while document is processing", () => {
    expect(
      shelfStatusLabel("processing", { status: "queued", progress: null }),
    ).toBe("排队中");
    expect(
      shelfStatusLabel("processing", {
        status: "running",
        progress: { stage: "vision", page: 1, total: 1 },
      }),
    ).toBe("处理中");
    expect(shelfStatusLabel("review", null)).toBe("待审阅");
  });
});

describe("shelfDetailLabel / progressBadgeText", () => {
  it("explains queue wait vs live progress", () => {
    expect(
      shelfDetailLabel("processing", { status: "queued", progress: null }),
    ).toMatch(/等待 worker/);
    expect(
      shelfDetailLabel("processing", {
        status: "running",
        progress: { stage: "translate", page: 5, total: 40 },
      }),
    ).toBe("正在补译：5/40 句");
    expect(
      progressBadgeText("processing", { status: "queued", progress: null }),
    ).toBe("等待 worker");
    expect(
      progressBadgeText("processing", {
        status: "running",
        progress: { stage: "vision", page: 1, total: 2 },
      }),
    ).toBe("1/2 页");
  });
});

describe("isActiveParseStatus", () => {
  it("matches processing and uploaded", () => {
    expect(isActiveParseStatus("processing")).toBe(true);
    expect(isActiveParseStatus("uploaded")).toBe(true);
    expect(isActiveParseStatus("review")).toBe(false);
  });
});
