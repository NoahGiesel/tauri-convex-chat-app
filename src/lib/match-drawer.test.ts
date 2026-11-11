import { describe, expect, it } from "vitest";
import type { Id } from "../../convex/_generated/dataModel";
import {
  createDrawerMemory,
  drawerChip,
  drawerLayout,
  isStale,
  resolveTarget,
  targetOf,
  targetStillPinned,
  teamIdsOf,
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

const chat = (id: string) => id as Id<"conversations">;
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

  it("le squadre di un chip sono quelle dei suoi pin, nell'ordine", () => {
    expect(teamIdsOf(chip("derby", "milan", "juventus"))).toEqual(["milan", "juventus"]);
  });
});

describe("drawer della partita: pin rimossi", () => {
  it("si chiude quando non resta nessuna delle sue squadre pinnate", () => {
    const opened = target("inter", "napoli");
    expect(targetStillPinned(opened, ["arsenal"])).toBeNull();
    expect(drawerChip([chip("arsenal-next", "arsenal")], null)).toBeNull();
  });

  it("in un derby, togliere un pin lo lascia aperto sull'altra squadra", () => {
    const opened = target("milan", "juventus");
    const left = targetStillPinned(opened, ["juventus"]);
    expect(left).toEqual({ teams: ["juventus"] });
    expect(drawerChip([chip("juventus-next", "juventus")], left)?.key).toBe("juventus-next");
  });

  it("senza pin tolti non cambia nulla", () => {
    const opened = target("inter");
    expect(targetStillPinned(opened, ["inter", "napoli"])).toBe(opened);
  });
});

describe("drawer della partita: chiusura automatica", () => {
  it("con i pin non ancora arrivati non tocca niente", () => {
    const opened = target("inter");
    expect(resolveTarget(opened, null)).toEqual({ target: opened, writeBack: false });
  });

  it("con tutte le squadre ancora pinnate non riscrive la memoria", () => {
    const opened = target("inter");
    expect(resolveTarget(opened, ["inter", "napoli"])).toEqual({ target: opened, writeBack: false });
  });

  it("stringe il bersaglio alla squadra rimasta e lo riscrive", () => {
    const opened = target("milan", "juventus");
    expect(resolveTarget(opened, ["juventus"])).toEqual({ target: { teams: ["juventus"] }, writeBack: true });
  });

  it("a zero squadre pinnate chiude il drawer e lo riscrive", () => {
    expect(resolveTarget(target("inter"), ["napoli"])).toEqual({ target: null, writeBack: true });
  });

  it("un drawer già chiuso resta chiuso senza riscritture", () => {
    expect(resolveTarget(null, ["napoli"])).toEqual({ target: null, writeBack: false });
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
    memory.set(chat("carol"), opened);

    expect(memory.get(chat("carol"))).toBe(opened);
    expect(memory.get(chat("dave"))).toBeNull();
  });

  it("due memorie non si vedono tra loro, come due finestre", () => {
    const main = createDrawerMemory();
    const popout = createDrawerMemory();
    main.set(chat("carol"), target("inter"));

    expect(popout.get(chat("carol"))).toBeNull();
  });

  it("chiudere una chat non toglie il drawer alle altre", () => {
    const memory = createDrawerMemory();
    memory.set(chat("carol"), target("inter"));
    memory.set(chat("dave"), target("napoli"));
    memory.set(chat("carol"), null);

    expect(memory.get(chat("carol"))).toBeNull();
    expect(memory.get(chat("dave"))).toEqual({ teams: ["napoli"] });
  });
});

describe("dati vecchi", () => {
  const fetchedAt = Date.parse("2026-11-08T17:50Z");
  const day = 24 * 60 * 60_000;

  it("un tab è vecchio solo dopo 24 ore, non a 24 ore esatte", () => {
    expect(isStale(fetchedAt, fetchedAt + day)).toBe(false);
    expect(isStale(fetchedAt, fetchedAt + day + 1)).toBe(true);
    expect(isStale(fetchedAt, fetchedAt + day - 1)).toBe(false);
  });
});
