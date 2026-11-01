/** Le parole già tradotte: una funzione pura non conosce la lingua dell'app. */
export interface DayWords {
  today: string;
  yesterday: string;
  locale: string;
}

/** L'etichetta del separatore di giorno. Riceve l'ora attuale, così si può provare anche a mezzanotte. */
export function dayLabel(ts: number, now: number, { today, yesterday, locale }: DayWords): string {
  const day = new Date(ts).toDateString();
  const previous = new Date(now);
  previous.setDate(previous.getDate() - 1);
  if (day === new Date(now).toDateString()) return today;
  if (day === previous.toDateString()) return yesterday;
  return new Date(ts).toLocaleDateString(locale, { day: "numeric", month: "long" });
}
