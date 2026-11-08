# ESPN's undocumented JSON feeds Team pins

Team pins and the Match bar get their data from ESPN's public JSON (`site.api.espn.com`). This API has no docs and no stability promise, and Disney's terms allow only personal, noncommercial use and forbid automated access. We accept that on purpose, because this app is a private, noncommercial chat for a few friends.

The alternatives were weaker. The only free API whose terms allow this use is Highlightly's free plan. It has 100 requests a day, which allows 1-2 minute updates for only one kick-off window a day, and its team search matches exact full names only. ESPN has no quota, covers every target competition and returns events, lineups and stats in one call. It also answers from Convex's egress IPs just as it does from a home IP.

## Consequences

- No second provider ships at first. The data layer sits behind a provider interface. If ESPN blocks us or changes its format, the Match bar shows its "data unavailable" state until a second provider (Highlightly free is the documented option) is plugged in.
- Team pins store ESPN team ids. Moving to another provider means mapping every stored pin to that provider's ids.
- `/calcio` matches against our own team index. The index is built from ESPN's team lists for the target competitions, plus Italian aliases, because ESPN's search misses Italian names ("Italia", "Spagna", "Bayern Monaco").
