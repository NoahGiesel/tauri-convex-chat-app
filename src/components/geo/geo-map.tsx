// MapLibre GL su OpenFreeMap, senza nessuno strato di testo: la mappa non scrive mai il nome della risposta.
// La finestra della Run carica questo modulo a parte (React.lazy), così MapLibre non entra nel resto dell'app.
import { useEffect, useRef } from "react";
import maplibregl, { type StyleSpecification } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { ZONE_VIEW } from "@/lib/geo";
import type { GeoZone, LatLng } from "../../../convex/geoRules";

const STYLE_URL = { light: "https://tiles.openfreemap.org/styles/positron", dark: "https://tiles.openfreemap.org/styles/dark" } as const;
const styles = new Map<string, Promise<StyleSpecification>>();

/** Lo stile di OpenFreeMap senza strati `symbol`: niente nomi di città, paesi, strade o acque. */
function labelFreeStyle(url: string): Promise<StyleSpecification> {
  let style = styles.get(url);
  if (!style) {
    style = fetch(url)
      .then((r) => r.json() as Promise<StyleSpecification>)
      .then((s) => ({ ...s, layers: s.layers.filter((l) => l.type !== "symbol") }));
    style.catch(() => styles.delete(url));
    styles.set(url, style);
  }
  return style;
}

export interface Pin extends LatLng {
  color: string;
}

export interface GeoMapProps {
  zone: GeoZone;
  dark: boolean;
  /** Un clic sulla mappa sposta il segnaposto; assente quando il Round non si gioca. */
  onPick?: (p: LatLng) => void;
  pins: Pin[];
  /** Linee tratteggiate tra un segnaposto e il posto vero. */
  lines?: [LatLng, LatLng][];
  /** Se c'è, la camera inquadra questi punti (il risultato); altrimenti mostra la Zone. */
  fit?: LatLng[];
  className?: string;
}

export default function GeoMap({ zone, dark, onPick, pins, lines = [], fit, className }: GeoMapProps) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const markers = useRef<maplibregl.Marker[]>([]);
  const pick = useRef(onPick);
  pick.current = onPick;
  const latest = useRef({ pins, lines, fit });
  latest.current = { pins, lines, fit };

  /** Disegna segnaposto, linee e camera dalle ultime props; senza mappa pronta non fa nulla. */
  const draw = useRef(() => {});
  draw.current = () => {
    const m = map.current;
    if (!m?.getSource("lines")) return;
    const { pins: p, lines: l, fit: f } = latest.current;
    markers.current.forEach((mk) => mk.remove());
    markers.current = p.map((pin) => {
      const dot = document.createElement("div");
      dot.style.cssText = `width:18px;height:18px;border-radius:50%;background:${pin.color};border:3px solid white;box-shadow:0 1px 4px rgba(0,0,0,.5)`;
      return new maplibregl.Marker({ element: dot }).setLngLat([pin.lng, pin.lat]).addTo(m);
    });
    (m.getSource("lines") as maplibregl.GeoJSONSource).setData({
      type: "FeatureCollection",
      features: l.map(([a, b]) => ({ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: [[a.lng, a.lat], [b.lng, b.lat]] } })),
    });
    if (f && f.length > 0) {
      const bounds = new maplibregl.LngLatBounds();
      f.forEach((pt) => bounds.extend([pt.lng, pt.lat]));
      m.fitBounds(bounds, { padding: 90, maxZoom: 8, duration: 900 });
    }
  };

  useEffect(() => {
    let cancelled = false;
    void labelFreeStyle(dark ? STYLE_URL.dark : STYLE_URL.light).then((style) => {
      if (cancelled || !el.current) return;
      const m = new maplibregl.Map({
        container: el.current,
        style,
        center: ZONE_VIEW[zone].center,
        zoom: ZONE_VIEW[zone].zoom,
        attributionControl: { compact: true },
        dragRotate: false,
        pitchWithRotate: false,
      });
      m.touchZoomRotate.disableRotation();
      m.keyboard.disableRotation();
      m.on("click", (e) => pick.current?.({ lat: e.lngLat.lat, lng: e.lngLat.lng }));
      m.on("load", () => {
        m.addSource("lines", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
        m.addLayer({ id: "lines", type: "line", source: "lines", paint: { "line-color": dark ? "#f8fafc" : "#111827", "line-width": 2, "line-dasharray": [2, 2] } });
        map.current = m;
        draw.current();
      });
    });
    return () => {
      cancelled = true;
      map.current?.remove();
      map.current = null;
    };
  }, [zone, dark]);

  const key = JSON.stringify([pins, lines, fit]);
  useEffect(() => draw.current(), [key]);

  useEffect(() => {
    if (map.current) map.current.getCanvas().style.cursor = onPick ? "crosshair" : "";
  });

  // Una finestra ridimensionata va ridisegnata.
  useEffect(() => {
    if (!el.current) return;
    const ro = new ResizeObserver(() => map.current?.resize());
    ro.observe(el.current);
    return () => ro.disconnect();
  }, []);

  // Il CSS di MapLibre impone `position: relative` al suo contenitore: la posizione di chi chiama va su un involucro.
  return (
    <div className={className} data-testid="geo-map">
      <div ref={el} className="h-full w-full" />
    </div>
  );
}
