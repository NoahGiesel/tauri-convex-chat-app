import { describe, expect, it } from "vitest";
import {
  createDrawerMemory,
  drawerChip,
  drawerLayout,
  remainingPins,
  targetOf,
  toggleChip,
  type DrawerTarget,
} from "./match-drawer";
import type { TeamChip } from "./team-pins";

function chip(key: string, ...teamIds: string[]): TeamChip {
  return {
    key,
    match: { eventId: key } as TeamChip["match"],
    pins: teamIds.map((teamId) => ({ team: { teamId } })) as TeamChip["pins"],
  };
}

const target = (...teamIds: string[]): DrawerTarget => ({ teams: teamIds });

describe("drawer della partita: disposizione", () => {
  it("sta di fianco alla chat finché la colonna resta larga almeno 360px", () => {
    expect(drawerLayout(740, false)).toBe("beside");
    expect(drawerLayout(1200, false)).toBe("beside");
  });

  it("copre la chat quando la colonna scenderebbe sotto i 360px", () => {
    expect(drawerLayout(739, false)).toBe("cover");
    expect(drawerLayout(420, false)).toBe("cover");
  });

  it("copre sempre la chat nella finestra staccata", () => {
    expect(drawerLayout(1200, true)).toBe("cover");
  });
});

describe("drawer della partita: segue la squadra", () => {
  it("un chip tiene una squadra: il drawer la segue alla partita dopo", () => {
    const first = chip("event-1", "inter");
    const opened = targetOf(first);
    expect(drawerChip([first], opened)).toBe(first);

    const next = chip("event-2", "inter");
    expect(drawerChip([next], opened)).toBe(next);
  });

  it("dopo il derby il drawer segue la squadra pinnata per prima", () => {
    const derby = chip("derby", "milan", "juventus");
    const opened = targetOf(derby);

    const milan = chip("milan-next", "milan");
    const juventus = chip("juventus-next", "juventus");
    expect(drawerChip([milan, juventus], opened)).toBe(milan);
  });

  it("un chip con due squadre: il drawer segue la prima pinnata anche se i chip si invertono", () => {
    const opened = targetOf(chip("derby", "milan", "juventus"));
    const milan = chip("milan-next", "milan");
    const juventus = chip("juventus-next", "juventus");
    expect(drawerChip([juventus, milan], opened)).toBe(milan);
  });
});

describe("drawer della partita: pin rimossi", () => {
  it("si chiude quando non resta nessuna delle sue squadre pinnate", () => {
    const opened = target("inter", "napoli");
    expect(remainingPins(opened, ["arsenal"])).toBeNull();
    expect(drawerChip([chip("arsenal-next", "arsenal")], null)).toBeNull();
  });

  it("in un derby, togliere un pin lo lascia aperto sull'altra squadra", () => {
    const opened = target("milan", "juventus");
    const left = remainingPins(opened, ["juventus"]);
    expect(left).toEqual({ teams: ["juventus"] });
    expect(drawerChip([chip("juventus-next", "juventus")], left)?.key).toBe("juventus-next");
  });

  it("senza pin tolti non cambia nulla", () => {
    const opened = target("inter");
    expect(remainingPins(opened, ["inter", "napoli"])).toBe(opened);
  });
});

describe("drawer della partita: clic sui chip", () => {
  it("un secondo clic sul suo chip lo chiude", () => {
    const derby = chip("derby", "milan", "juventus");
    const opened = targetOf(derby);
    expect(toggleChip([derby], opened, derby)).toBeNull();
  });

  it("un clic su un altro chip lo sposta sulla partita di quel chip", () => {
    const derby = chip("derby", "milan", "juventus");
    const inter = chip("inter-next", "inter");
    const opened = targetOf(derby);
    expect(toggleChip([derby, inter], opened, inter)).toEqual({ teams: ["inter"] });
  });
});

describe("drawer della partita: memoria per chat", () => {
  it("ogni chat ricorda il proprio drawer mentre l'app gira", () => {
    const memory = createDrawerMemory();
    const opened = target("inter");
    memory.set("carol", opened);

    expect(memory.get("carol")).toBe(opened);
    expect(memory.get("dave")).toBeNull();
  });

  it("due memorie non si vedono tra loro, come due finestre", () => {
    const main = createDrawerMemory();
    const popout = createDrawerMemory();
    main.set("carol", target("inter"));

    expect(popout.get("carol")).toBeNull();
  });

  it("chiudere una chat non toglie il drawer alle altre", () => {
    const memory = createDrawerMemory();
    memory.set("carol", target("inter"));
    memory.set("dave", target("napoli"));
    memory.set("carol", null);

    expect(memory.get("carol")).toBeNull();
    expect(memory.get("dave")).toEqual({ teams: ["napoli"] });
  });
});
