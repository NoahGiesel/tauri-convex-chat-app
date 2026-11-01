import { describe, expect, it } from "vitest";
import { dayLabel } from "./day-label";

const words = { today: "Today", yesterday: "Yesterday", locale: "en" };
const at = (year: number, month: number, day: number, hour = 12, minute = 0, second = 0) =>
  new Date(year, month - 1, day, hour, minute, second).getTime();

describe("dayLabel", () => {
  const now = at(2026, 3, 15);

  it("calls a message from the same day today", () => {
    expect(dayLabel(at(2026, 3, 15, 8), now, words)).toBe("Today");
  });

  it("calls a message from the previous day yesterday", () => {
    expect(dayLabel(at(2026, 3, 14, 8), now, words)).toBe("Yesterday");
  });

  it("gives older messages their date", () => {
    expect(dayLabel(at(2026, 3, 13), now, words)).toBe("March 13");
    expect(dayLabel(at(2025, 12, 1), now, words)).toBe("December 1");
  });

  it("writes the date in the reader's language", () => {
    expect(dayLabel(at(2026, 3, 13), now, { ...words, locale: "it" })).toBe("13 marzo");
  });

  describe("around midnight", () => {
    const midnight = at(2026, 3, 15, 0);

    it("puts the last second of a day in yesterday", () => {
      expect(dayLabel(at(2026, 3, 14, 23, 59, 59), midnight, words)).toBe("Yesterday");
    });

    it("puts the first second of a day in today", () => {
      expect(dayLabel(midnight, midnight, words)).toBe("Today");
    });

    it("keeps a day whole at its last second", () => {
      expect(dayLabel(at(2026, 3, 15, 0), at(2026, 3, 15, 23, 59, 59), words)).toBe("Today");
    });

    it("moves a message to yesterday once the day turns", () => {
      const sent = at(2026, 3, 14, 23, 59);
      expect(dayLabel(sent, at(2026, 3, 14, 23, 59, 59), words)).toBe("Today");
      expect(dayLabel(sent, at(2026, 3, 15, 0, 0, 0), words)).toBe("Yesterday");
    });
  });

  it("finds yesterday across a month and a year", () => {
    expect(dayLabel(at(2026, 2, 28), at(2026, 3, 1), words)).toBe("Yesterday");
    expect(dayLabel(at(2025, 12, 31), at(2026, 1, 1), words)).toBe("Yesterday");
  });
});
