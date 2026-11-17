// 기상청 단기예보·초단기실황을 받아 data/kma.json 으로 저장합니다.
// GitHub Actions 에서 30분마다 실행되며, 인증키는 저장소 Secret(KMA_KEY)에서만 읽습니다.
// 페이지(js/app.js)는 이 파일을 읽기 때문에 인증키가 브라우저에 드러나지 않습니다.
import { writeFile, mkdir } from "node:fs/promises";

const KEY = process.env.KMA_KEY;
if (!KEY) { console.log("KMA_KEY 가 없어 기상청 자료를 건너뜁니다 (페이지는 예비 예보를 씁니다)."); process.exit(0); }

// js/app.js 와 같은 동 좌표
const DONGS = [
  [37.3448, 126.9683], [37.3207, 126.9480], [37.3570, 126.9640],
  [37.3830, 126.9780], [37.3900, 126.9840], [37.3990, 127.0150]
];
function toGrid(lat, lon) { // 기상청 공개 변환식
  const RE = 6371.00877, GRID = 5.0, SLAT1 = 30.0, SLAT2 = 60.0, OLON = 126.0, OLAT = 38.0, XO = 43, YO = 136;
  const D = Math.PI / 180, re = RE / GRID, s1 = SLAT1 * D, s2 = SLAT2 * D, olon = OLON * D, olat = OLAT * D;
  let sn = Math.tan(Math.PI * 0.25 + s2 * 0.5) / Math.tan(Math.PI * 0.25 + s1 * 0.5);
  sn = Math.log(Math.cos(s1) / Math.cos(s2)) / Math.log(sn);
  let sf = Math.tan(Math.PI * 0.25 + s1 * 0.5); sf = Math.pow(sf, sn) * Math.cos(s1) / sn;
  let ro = Math.tan(Math.PI * 0.25 + olat * 0.5); ro = re * sf / Math.pow(ro, sn);
  let ra = Math.tan(Math.PI * 0.25 + lat * D * 0.5); ra = re * sf / Math.pow(ra, sn);
  let th = lon * D - olon; if (th > Math.PI) th -= 2 * Math.PI; if (th < -Math.PI) th += 2 * Math.PI; th *= sn;
  return { nx: Math.floor(ra * Math.sin(th) + XO + 0.5), ny: Math.floor(ro - ra * Math.cos(th) + YO + 0.5) };
}

const pad2 = n => String(n).padStart(2, "0");
const kst = () => new Date(Date.now() + 9 * 3600e3);
const ymd = t => t.getUTCFullYear() + pad2(t.getUTCMonth() + 1) + pad2(t.getUTCDate());
function vilageBase() {
  const t = new Date(kst().getTime() - 15 * 60e3);
  let h = [23, 20, 17, 14, 11, 8, 5, 2].find(x => t.getUTCHours() >= x);
  if (h === undefined) { t.setUTCDate(t.getUTCDate() - 1); h = 23; }
  return { date: ymd(t), time: pad2(h) + "00" };
}
function ncstBase(daysAgo) {
  const t = new Date(kst().getTime() - 45 * 60e3 - daysAgo * 86400e3);
  return { date: ymd(t), time: pad2(t.getUTCHours()) + "00" };
}

async function call(op, b, g) {
  const url = "https://apis.data.go.kr/1360000/VilageFcstInfoService_2.0/" + op +
    "?serviceKey=" + encodeURIComponent(KEY) + "&pageNo=1&numOfRows=1000&dataType=JSON" +
    "&base_date=" + b.date + "&base_time=" + b.time + "&nx=" + g.nx + "&ny=" + g.ny;
  for (let i = 0; i < 3; i++) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(20000) });
      const js = await r.json();
      if (js.response?.header?.resultCode === "00") return js.response.body.items.item;
      throw new Error(js.response?.header?.resultMsg || "응답 오류");
    } catch (e) {
      console.log(op, g, "시도", i + 1, "실패:", e.message);
      await new Promise(res => setTimeout(res, 3000));
    }
  }
  return null;
}

const grids = [...new Set(DONGS.map(([la, lo]) => { const g = toGrid(la, lo); return g.nx + "," + g.ny; }))];
const out = { updatedAt: new Date().toISOString(), vilageBase: vilageBase(), grids: {} };
let ok = 0;
for (const k of grids) {
  const [nx, ny] = k.split(",").map(Number), g = { nx, ny };
  const vilage = await call("getVilageFcst", out.vilageBase, g);
  const ncst = await call("getUltraSrtNcst", ncstBase(0), g);
  const ncstY = await call("getUltraSrtNcst", ncstBase(1), g);
  if (vilage) ok++;
  out.grids[k] = { vilage, ncst, ncstY };
}
if (!ok) { console.log("기상청 자료를 하나도 받지 못해 이전 파일을 그대로 둡니다."); process.exit(0); }
await mkdir("data", { recursive: true });
await writeFile("data/kma.json", JSON.stringify(out));
console.log("저장 완료:", grids.join(" "), out.updatedAt);
