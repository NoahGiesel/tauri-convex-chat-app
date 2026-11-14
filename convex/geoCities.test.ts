import { describe, expect, test } from "vitest";
import { pickPlaces, placeById, zonePlaceIds } from "./geoCities";
import { PLACES } from "./geoPlaces";
import { MAX_POINTS, PLACE_LANGUAGES, ZONE_BIT, distanceKm, placeName, pointsFor } from "./geoRules";

describe("distanza e punti", () => {
  test("haversine su coppie di città note", () => {
    const rome = { lat: 41.8919, lng: 12.5113 };
    const milan = { lat: 45.4643, lng: 9.1895 };
    const newYork = { lat: 40.7143, lng: -74.006 };
    const london = { lat: 51.5085, lng: -0.1257 };
    expect(distanceKm(rome, milan)).toBeCloseTo(477, -1);
    expect(distanceKm(london, newYork)).toBeCloseTo(5570, -1);
    expect(distanceKm(rome, rome)).toBe(0);
  });

  test("i punti partono da 5000 e calano con la scala della Zone", () => {
    expect(pointsFor(0, "italy")).toBe(MAX_POINTS);
    expect(pointsFor(150, "italy")).toBe(Math.round(MAX_POINTS / Math.E));
    expect(pointsFor(500, "europe")).toBe(pointsFor(150, "italy"));
    expect(pointsFor(2000, "world")).toBe(pointsFor(150, "italy"));
    expect(pointsFor(20_000, "world")).toBe(0);
  });

  test("il nome segue la lingua di chi guarda, con l'inglese di riserva", () => {
    const names = { it: "Monaco di Baviera", en: "Munich", de: "München", es: "Múnich", ro: "München" };
    expect(placeName(names, "it")).toBe("Monaco di Baviera");
    expect(placeName(names, "de")).toBe("München");
    expect(placeName(names, "fr")).toBe("Munich");
  });
});

describe("elenco dei posti", () => {
  test("nessun id ripetuto", () => {
    const ids = PLACES.map((row) => row[0]);
    expect(new Set(ids).size).toBe(ids.length);
  });

  test("ogni Zone ha abbastanza posti e la Zone Italia ha solo posti italiani", () => {
    for (const zone of ["italy", "europe", "world"] as const) expect(zonePlaceIds(zone).length).toBeGreaterThan(200);
    for (const row of PLACES.filter((r) => r[4] & ZONE_BIT.italy)) expect(row[3]).toBe("IT");
  });

  test("la Zone Europa si ferma agli Urali", () => {
    for (const row of PLACES.filter((r) => r[4] & ZONE_BIT.europe)) expect(row[2]).toBeLessThanOrEqual(60);
  });

  test("ogni posto ha un nome in ogni lingua, in alfabeto latino e senza aggiunte", () => {
    for (const row of PLACES) {
      for (let i = 0; i < PLACE_LANGUAGES.length; i++) {
        const name = row[5 + i] as string;
        expect(name.length).toBeGreaterThan(0);
        expect(name).toMatch(/^[\p{Script=Latin}\p{M}\s'’./-]+$/u);
      }
    }
  });

  test("i nomi italiani dei posti noti", () => {
    const byEnglish = (en: string) => PLACES.find((row) => row[6] === en);
    expect(byEnglish("Munich")?.[5]).toBe("Monaco di Baviera");
    expect(byEnglish("Warsaw")?.[5]).toBe("Varsavia");
    expect(byEnglish("Lisbon")?.[5]).toBe("Lisbona");
  });
});

describe("scelta dei posti", () => {
  test("posti diversi della Zone, senza quelli già usati", () => {
    const all = zonePlaceIds("italy");
    const used = new Set(all.slice(0, all.length - 5));
    const picked = pickPlaces("italy", 5, used);
    expect(new Set(picked).size).toBe(5);
    for (const id of picked) {
      expect(used.has(id)).toBe(false);
      expect(placeById(id).country).toBe("IT");
    }
  });

  test("se i posti nuovi non bastano pesca da tutta la Zone", () => {
    const all = zonePlaceIds("italy");
    const picked = pickPlaces("italy", 5, new Set(all.slice(0, all.length - 2)));
    expect(new Set(picked).size).toBe(5);
  });
});
