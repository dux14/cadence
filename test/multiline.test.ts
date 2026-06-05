import { describe, expect, it } from "vitest";
import { firstLines } from "@/lib/multiline";

describe("firstLines", () => {
  it("returns the whole text when within the line budget", () => {
    expect(firstLines("a\nb", 2)).toBe("a\nb");
  });

  it("clamps to n lines and appends an ellipsis", () => {
    expect(firstLines("a\nb\nc\nd", 2)).toBe("a\nb…");
  });

  it("treats single-line text untouched", () => {
    expect(firstLines("just one line", 2)).toBe("just one line");
  });

  it("trims trailing empty lines before clamping", () => {
    expect(firstLines("a\n\n\n", 2)).toBe("a");
  });

  it("handles an empty string", () => {
    expect(firstLines("", 2)).toBe("");
  });
});
