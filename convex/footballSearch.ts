/**
 * Ricerca delle squadre per `/calcio`: confronto locale, senza accenti né maiuscole,
 * su nomi parziali e su alias. La ricerca di ESPN non conosce i nomi italiani ("Italia",
 * "Bayern Monaco"), quindi gli alias stanno qui, per id ESPN della squadra.
 */

/** Minuscolo, senza accenti e con un solo spazio fra le parole ("Atlético" → "atletico"). */
export function foldText(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/ß/g, "ss")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

/** Nomi italiani e soprannomi, per id ESPN. Il commento dice la squadra. */
export const TEAM_ALIASES: Record<string, string[]> = {
  // Club
  "110": ["inter", "inter milan"], // Internazionale
  "103": ["milan"], // AC Milan
  "111": ["juve"], // Juventus
  "104": ["roma"], // AS Roma
  "112": ["lazio"], // Lazio
  "114": ["napoli"], // Napoli
  "132": ["bayern monaco", "bayern munchen"], // Bayern Munich
  "131": ["leverkusen"], // Bayer Leverkusen
  "124": ["dortmund", "bvb"], // Borussia Dortmund
  "160": ["psg", "paris"], // Paris Saint-Germain
  "1068": ["atletico", "atletico de madrid"], // Atlético Madrid
  "83": ["barca", "barcellona"], // Barcelona
  "86": ["real"], // Real Madrid
  "243": ["siviglia"], // Sevilla
  "94": ["valencia"], // Valencia
  "360": ["man utd", "man united", "manchester utd"], // Manchester United
  "382": ["man city"], // Manchester City
  "367": ["tottenham", "spurs"], // Tottenham Hotspur
  "176": ["marsiglia", "olympique marseille"], // Marseille
  "167": ["lione", "olympique lyonnais"], // Lyon
  "174": ["monaco"], // AS Monaco
  "437": ["porto"], // FC Porto
  "1929": ["benfica"], // Benfica
  "2250": ["sporting lisbona", "sporting"], // Sporting CP
  "148": ["psv"], // PSV Eindhoven
  "2290": ["stella rossa", "crvena zvezda"], // Red Star Belgrade
  // Nazionali
  "162": ["italia"], // Italy
  "164": ["spagna"], // Spain
  "481": ["germania"], // Germany
  "478": ["francia"], // France
  "448": ["inghilterra"], // England
  "449": ["olanda", "paesi bassi"], // Netherlands
  "482": ["portogallo"], // Portugal
  "459": ["belgio"], // Belgium
  "475": ["svizzera"], // Switzerland
  "477": ["croazia"], // Croatia
  "205": ["brasile"], // Brazil
  "580": ["scozia"], // Scotland
  "578": ["galles"], // Wales
  "476": ["irlanda"], // Republic of Ireland
  "586": ["irlanda del nord"], // Northern Ireland
  "479": ["danimarca"], // Denmark
  "466": ["svezia"], // Sweden
  "464": ["norvegia"], // Norway
  "471": ["polonia"], // Poland
  "450": ["repubblica ceca", "cechia"], // Czechia
  "465": ["turchia", "turkey"], // Türkiye
  "455": ["grecia"], // Greece
  "457": ["ucraina"], // Ukraine
  "480": ["ungheria"], // Hungary
  "474": ["austria"], // Austria
  "6757": ["serbia"], // Serbia
  "473": ["romania"], // Romania
  "468": ["slovacchia"], // Slovakia
  "472": ["slovenia"], // Slovenia
  "585": ["albania"], // Albania
  "470": ["islanda"], // Iceland
  "458": ["finlandia"], // Finland
  "452": ["bosnia", "bosnia erzegovina"], // Bosnia-Herzegovina
  "454": ["russia"], // Russia
  "462": ["bulgaria"], // Bulgaria
  "445": ["cipro"], // Cyprus
  "582": ["lussemburgo"], // Luxembourg
  "463": ["macedonia del nord"], // North Macedonia
  "460": ["lituania"], // Lithuania
  "444": ["estonia"], // Estonia
  "583": ["bielorussia"], // Belarus
  "461": ["israele"], // Israel
  "627": ["giappone"], // Japan
  "660": ["stati uniti", "usa"], // United States
  "203": ["messico"], // Mexico
  "2869": ["marocco"], // Morocco
  "2620": ["egitto"], // Egypt
  "451": ["corea del sud"], // South Korea
  "656": ["camerun"], // Cameroon
  "4789": ["costa d avorio"], // Ivory Coast
  "624": ["algeria"], // Algeria
  "659": ["tunisia"], // Tunisia
  "655": ["arabia saudita"], // Saudi Arabia
  "628": ["australia"], // Australia
  "467": ["sudafrica"], // South Africa
  "658": ["cina"], // China
  "2666": ["nuova zelanda"], // New Zealand
  "2597": ["capo verde"], // Cape Verde
  "214": ["costa rica"], // Costa Rica
  "1038": ["giamaica"], // Jamaica
  "2917": ["giordania"], // Jordan
};

/** Le chiavi di ricerca di una squadra: nomi normalizzati più i suoi alias, senza doppioni. */
export function searchKeys(team: { teamId: string; name: string; shortName: string; abbreviation: string }): string[] {
  const keys = [team.name, team.shortName, team.abbreviation, ...(TEAM_ALIASES[team.teamId] ?? [])].map(foldText).filter(Boolean);
  return [...new Set(keys)];
}

/**
 * Quanto bene `query` (già normalizzata) corrisponde alle chiavi: 0 uguale, 1 inizio di una chiave,
 * 2 inizio di una parola, 3 parte di una parola; `null` se non corrisponde.
 */
export function matchRank(keys: string[], query: string): number | null {
  let best: number | null = null;
  for (const key of keys) {
    let rank: number | null = null;
    if (key === query) rank = 0;
    else if (key.startsWith(query)) rank = 1;
    else if (key.split(" ").some((_, i, words) => words.slice(i).join(" ").startsWith(query))) rank = 2;
    else if (key.includes(query)) rank = 3;
    if (rank !== null && (best === null || rank < best)) best = rank;
  }
  return best;
}
