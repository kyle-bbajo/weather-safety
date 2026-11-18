// 의왕시 보행 골목·길 구간과 경사도를 만들어 data/roads.json 으로 저장합니다.
// - 길 모양: OpenStreetMap(Overpass API)
// - 높이(경사 계산): Open-Meteo Elevation API (Copernicus 90m 지형 자료)
// GitHub Actions 에서 실행되며, 결과는 캐시해서 자주 다시 받지 않습니다.
import { writeFile, mkdir } from "node:fs/promises";

const OVERPASS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter"
];
const QUERY = `[out:json][timeout:120];
area["name"="의왕시"]["admin_level"="6"]->.a;
way(area.a)["highway"~"^(residential|living_street|footway|pedestrian|path|steps|unclassified|tertiary|secondary|service)$"]["area"!="yes"];
out geom;`;

const DONGS = [ // js/app.js 와 같은 동 좌표
  ["고천동", 37.3448, 126.9683], ["부곡동", 37.3207, 126.9480], ["오전동", 37.3570, 126.9640],
  ["내손1동", 37.3830, 126.9780], ["내손2동", 37.3900, 126.9840], ["청계동", 37.3990, 127.0150]
];
const R = 6371000, rad = d => d * Math.PI / 180;
const dist = (a, b) => { // 미터
  const x = rad(b[1] - a[1]) * Math.cos(rad((a[0] + b[0]) / 2)), y = rad(b[0] - a[0]);
  return Math.sqrt(x * x + y * y) * R;
};
const nearestDong = p => {
  let best = 0, bd = Infinity;
  DONGS.forEach((d, i) => { const k = dist(p, [d[1], d[2]]); if (k < bd) { bd = k; best = i; } });
  return best;
};

async function overpass() {
  for (const url of OVERPASS) {
    try {
      const r = await fetch(url, { method: "POST", body: "data=" + encodeURIComponent(QUERY),
        headers: { "Content-Type": "application/x-www-form-urlencoded" }, signal: AbortSignal.timeout(150000) });
      if (!r.ok) throw new Error("HTTP " + r.status);
      return (await r.json()).elements || [];
    } catch (e) { console.log("Overpass 실패:", url, e.message); }
  }
  return null;
}

// 긴 길은 약 120m 단위 구간으로 나눔
function split(coords, max = 120) {
  const out = []; let cur = [coords[0]], len = 0;
  for (let i = 1; i < coords.length; i++) {
    const d = dist(coords[i - 1], coords[i]); cur.push(coords[i]); len += d;
    if (len >= max && i < coords.length - 1) { out.push({ c: cur, len }); cur = [coords[i]]; len = 0; }
  }
  if (cur.length > 1) out.push({ c: cur, len });
  return out;
}

async function elevations(points) { // points: [[lat,lon],...] → 높이(m) 배열
  const res = new Array(points.length).fill(null);
  for (let i = 0; i < points.length; i += 100) {
    const chunk = points.slice(i, i + 100);
    const url = "https://api.open-meteo.com/v1/elevation?latitude=" + chunk.map(p => p[0].toFixed(5)).join(",") +
      "&longitude=" + chunk.map(p => p[1].toFixed(5)).join(",");
    for (let t = 0; t < 3; t++) {
      try {
        const r = await fetch(url, { signal: AbortSignal.timeout(30000) });
        const js = await r.json();
        if (!Array.isArray(js.elevation)) throw new Error(js.reason || "응답 오류");
        js.elevation.forEach((e, k) => { res[i + k] = e; });
        break;
      } catch (e) { console.log("높이 자료 실패", i, e.message); await new Promise(s => setTimeout(s, 2000)); }
    }
  }
  return res;
}

const els = await overpass();
if (!els || !els.length) { console.log("길 자료를 받지 못해 건너뜁니다 (지도는 동 단위로만 표시)."); process.exit(0); }

const KIND = { residential: "골목", living_street: "골목", service: "골목", footway: "보도", pedestrian: "보행로",
  path: "산책로", steps: "계단", unclassified: "이면도로", tertiary: "도로 보도", secondary: "큰길 보도" };
const segs = [];
for (const w of els) {
  if (w.type !== "way" || !w.geometry || w.geometry.length < 2) continue;
  const hw = w.tags.highway;
  if (hw === "service" && w.tags.service && w.tags.service !== "alley") continue; // 주차장 통로 등 제외, 뒷골목만
  const coords = w.geometry.map(g => [+g.lat.toFixed(5), +g.lon.toFixed(5)]);
  for (const s of split(coords)) {
    if (s.len < 15) continue;
    segs.push({ n: w.tags.name || "", t: hw, k: KIND[hw] || "길", c: s.c, len: Math.round(s.len) });
  }
}
console.log("구간 수:", segs.length);

// 구간 양 끝 높이로 경사 계산
const pts = [], idx = new Map();
const key = p => p[0] + "," + p[1];
for (const s of segs) for (const p of [s.c[0], s.c[s.c.length - 1]]) if (!idx.has(key(p))) { idx.set(key(p), pts.length); pts.push(p); }
const el = await elevations(pts);
for (const s of segs) {
  const a = el[idx.get(key(s.c[0]))], b = el[idx.get(key(s.c[s.c.length - 1]))];
  s.g = (a != null && b != null && s.len > 0) ? +(Math.abs(b - a) / s.len * 100).toFixed(1) : null; // 경사 %
  const mid = s.c[Math.floor(s.c.length / 2)];
  s.d = nearestDong(mid);
}

await mkdir("data", { recursive: true });
await writeFile("data/roads.json", JSON.stringify({ updatedAt: new Date().toISOString(), source: "OpenStreetMap, Open-Meteo Elevation", segs }));
console.log("저장 완료: data/roads.json", segs.length, "구간");
