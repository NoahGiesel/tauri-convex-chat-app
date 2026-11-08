import { useState } from "react";

/** Lo stemma di una squadra; senza immagine (o se non si carica) le sue iniziali. */
export function Crest({ logo, abbreviation, size = 18 }: { logo: string | null; abbreviation: string; size?: number }) {
  const [broken, setBroken] = useState(false);
  if (logo && !broken) {
    return <img src={logo} alt="" width={size} height={size} onError={() => setBroken(true)} className="shrink-0 object-contain" style={{ width: size, height: size }} />;
  }
  return (
    <span
      aria-hidden
      className="flex shrink-0 items-center justify-center rounded-full bg-app-field font-black text-app-text-muted"
      style={{ width: size, height: size, fontSize: size * 0.36 }}
    >
      {abbreviation.slice(0, 3)}
    </span>
  );
}
