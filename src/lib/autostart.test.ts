import { beforeEach, describe, expect, it, vi } from "vitest";

/** The OS login entry, as the plugin sees it. */
const os = vi.hoisted(() => ({ registered: false, refuses: false, unreadable: false }));

vi.mock("@tauri-apps/plugin-autostart", () => ({
  enable: async () => {
    if (os.refuses) throw new Error("access denied");
    os.registered = true;
  },
  disable: async () => {
    os.registered = false;
  },
  isEnabled: async () => {
    if (os.unreadable) throw new Error("not available");
    return os.registered;
  },
}));

import { readAutostart, setAutostart } from "./autostart";

beforeEach(() => {
  os.registered = false;
  os.refuses = false;
  os.unreadable = false;
});

describe("the autostart switch", () => {
  it("registers the app at login when turned on", async () => {
    expect(await setAutostart(true)).toBe(true);
    expect(os.registered).toBe(true);
  });

  it("removes the login entry when turned off", async () => {
    os.registered = true;
    expect(await setAutostart(false)).toBe(false);
    expect(os.registered).toBe(false);
  });

  it("stays on the real state when the OS refuses the change", async () => {
    os.refuses = true;
    expect(await setAutostart(true)).toBe(false);
  });

  it("shows an entry removed outside the app as off", async () => {
    await setAutostart(true);
    os.registered = false;
    expect(await readAutostart()).toBe(false);
  });

  it("has no state when the OS can't be read, as outside the desktop app", async () => {
    os.unreadable = true;
    expect(await readAutostart()).toBeNull();
  });
});
