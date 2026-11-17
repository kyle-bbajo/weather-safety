/* ===== 신청 버튼 · 방문자 수 ===== */
(function () {
  const map = [["btnResident", CONFIG.RESIDENT_FORM], ["btnOrg", CONFIG.ORG_FORM || CONFIG.RESIDENT_FORM]];
  for (const [id, url] of map) {
    const a = document.getElementById(id);
    if (!a) continue;
    if (url) { a.href = url; }
    else { a.textContent = "신청서 준비 중"; a.setAttribute("aria-disabled", "true"); a.removeAttribute("target"); }
  }
  if (CONFIG.CONTACT) document.getElementById("contact").textContent = CONFIG.CONTACT;
  if (CONFIG.GOATCOUNTER) {
    const s = document.createElement("script");
    s.async = true; s.src = "//gc.zgo.at/count.js";
    s.dataset.goatcounter = "https://" + CONFIG.GOATCOUNTER + ".goatcounter.com/count";
    document.body.appendChild(s);
  }
})();

/* ===== 기본 값 ===== */
// 의왕시 6개 행정동 대표 지점 (대략적 중심 좌표)
const DONGS = [
  { name: "고천동",  lat: 37.3448, lon: 126.9683 },
  { name: "부곡동",  lat: 37.3207, lon: 126.9480 },
  { name: "오전동",  lat: 37.3570, lon: 126.9640 },
  { name: "내손1동", lat: 37.3830, lon: 126.9780 },
  { name: "내손2동", lat: 37.3900, lon: 126.9840 },
  { name: "청계동",  lat: 37.3990, lon: 127.0150 }
];
const LV = ["낮음", "보통", "높음", "매우 높음"];
const LV_HEX = ["#5E8C6A", "#C99A2E", "#D9622E", "#9E1F17"];
const LV_COLOR = ["var(--r0)", "var(--r1)", "var(--r2)", "var(--r3)"];
const pad2 = n => String(n).padStart(2, "0");
const kstNow = () => new Date(Date.now() + 9 * 3600e3); // UTC 메서드로 읽으면 한국 시각
const kstKey = d => d.getUTCFullYear() + "-" + pad2(d.getUTCMonth() + 1) + "-" + pad2(d.getUTCDate()) + "T" + pad2(d.getUTCHours()) + ":00";
const hhmm = s => s ? s.slice(11, 13) + "시" : "";

/* ===== 시간 제한이 있는 요청 ===== */
async function getJSON(url, ms) {
  const ctl = new AbortController(); const timer = setTimeout(() => ctl.abort(), ms || 7000);
  try { const res = await fetch(url, { signal: ctl.signal }); if (!res.ok) throw new Error("HTTP " + res.status); return await res.json(); }
  finally { clearTimeout(timer); }
}

/* ===== 결빙 위험 계산 ===== */
// 0 낮음 · 1 보통 · 2 높음 · 3 매우 높음
// 기상청 예보에는 땅 표면 온도가 없어, 밤에는 표면이 기온보다 1℃ 낮다고 보고 계산
function hourRisk(h) {
  const t = h.surf ?? h.temp - (h.night ? 1 : 0);
  const wetRecent = h.rain6 >= 0.2;
  const snow = h.snow6 > 0;
  const frost = h.rh >= 90 && (h.temp - h.dew) <= 1.5;
  if (t <= 0 && (snow || wetRecent)) return { lv: 3, why: snow ? "눈" : "비 온 뒤 영하" };
  if (t <= 0 && frost) return { lv: 2, why: "서리" };
  if (t <= 0) return { lv: 1, why: "영하 (남은 물기 주의)" };
  if (t <= 2 && (wetRecent || snow || frost)) return { lv: 1, why: "영상 2도 이하 + 물기" };
  return { lv: 0, why: "" };
}
function addRolling(out) {
  for (let i = 0; i < out.length; i++) {
    let r = 0, s = 0;
    for (let k = Math.max(0, i - 5); k <= i; k++) { r += out[k].rain || 0; s += out[k].snow || 0; }
    out[i].rain6 = r; out[i].snow6 = s;
    const hr = +out[i].time.slice(11, 13);
    out[i].night = hr >= 18 || hr < 9;
    out[i].r = hourRisk(out[i]);
  }
  return out;
}
const dewPoint = (t, rh) => { const a = 17.62, b = 243.12, g = Math.log(Math.max(rh, 1) / 100) + a * t / (b + t); return b * g / (a - g); };
// 기상청 겨울철 체감온도 (기온 10℃ 이하, 풍속 1.3m/s 이상일 때)
const feelsLike = (t, ms) => { if (t > 10 || ms < 1.3) return t; const v = Math.pow(ms * 3.6, 0.16); return 13.12 + 0.6215 * t - 11.37 * v + 0.3965 * v * t; };
const windName = deg => ["북풍", "북동풍", "동풍", "남동풍", "남풍", "남서풍", "서풍", "북서풍"][Math.round(((deg % 360) + 360) % 360 / 45) % 8];

/* ===== 기상청 ===== */
function toGrid(lat, lon) { // 위경도 → 기상청 격자 (기상청 공개 변환식)
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
const ymdOf = t => t.getUTCFullYear() + pad2(t.getUTCMonth() + 1) + pad2(t.getUTCDate());
function latestVilageBase() { // 단기예보: 02·05·08·11·14·17·20·23시 발표, 약 15분 뒤 제공
  const t = new Date(kstNow().getTime() - 15 * 60e3);
  let h = [23, 20, 17, 14, 11, 8, 5, 2].find(x => t.getUTCHours() >= x);
  if (h === undefined) { t.setUTCDate(t.getUTCDate() - 1); h = 23; }
  return { date: ymdOf(t), time: pad2(h) + "00" };
}
function ncstBase(hoursAgo) { // 초단기실황: 매시 정각 관측, 약 40분 뒤 제공, 최근 24시간까지만
  const t = new Date(kstNow().getTime() - 45 * 60e3 - (hoursAgo || 0) * 3600e3);
  return { date: ymdOf(t), time: pad2(t.getUTCHours()) + "00" };
}
function kmaURL(op, b, g) {
  const q = "&base_date=" + b.date + "&base_time=" + b.time + "&nx=" + g.nx + "&ny=" + g.ny;
  if (CONFIG.KMA_PROXY) return CONFIG.KMA_PROXY + "?op=" + op + q;
  return "https://apis.data.go.kr/1360000/VilageFcstInfoService_2.0/" + op + "?serviceKey=" + encodeURIComponent(CONFIG.KMA_KEY) +
    "&pageNo=1&numOfRows=1000&dataType=JSON" + q;
}
async function kmaItems(op, b, g) {
  const js = await getJSON(kmaURL(op, b, g), 7000);
  if (js.response?.header?.resultCode !== "00") throw new Error("KMA " + (js.response?.header?.resultMsg || "error"));
  return js.response.body.items.item;
}
const num = v => { // "강수없음", "1mm 미만", "1.0mm", "적설없음", "1cm 미만"
  if (v == null) return 0;
  const s = String(v);
  if (s.includes("없음")) return 0;
  if (s.includes("미만")) return 0.5;
  const f = parseFloat(s); return isNaN(f) ? 0 : f;
};
async function kmaForecast(g) { return parseVilage(await kmaItems("getVilageFcst", latestVilageBase(), g)); }
function parseVilage(items) {
  const byTime = {};
  for (const it of items) {
    const k = it.fcstDate.slice(0, 4) + "-" + it.fcstDate.slice(4, 6) + "-" + it.fcstDate.slice(6, 8) + "T" + it.fcstTime.slice(0, 2) + ":00";
    (byTime[k] ||= {})[it.category] = it.fcstValue;
  }
  return addRolling(Object.keys(byTime).sort().filter(k => byTime[k].TMP != null).map(k => {
    const c = byTime[k], temp = +c.TMP, rh = +(c.REH ?? 70);
    return { time: k, temp, surf: null, rh, dew: dewPoint(temp, rh), rain: num(c.PCP), snow: num(c.SNO),
             sky: +(c.SKY ?? 1), pty: +(c.PTY ?? 0), pop: +(c.POP ?? 0), wsd: +(c.WSD ?? 0), vec: +(c.VEC ?? 0) };
  }));
}
async function kmaNow(g) {
  const now = await kmaItems("getUltraSrtNcst", ncstBase(0), g);
  let y = null;
  try { y = await kmaItems("getUltraSrtNcst", ncstBase(23), g); } catch (e) { /* 어제 값이 없으면 비교 생략 */ }
  return parseNow(now, y);
}
function parseNow(items, itemsY) {
  const pick = it => Object.fromEntries((it || []).map(i => [i.category, +i.obsrValue]));
  const now = pick(items), y = itemsY ? pick(itemsY) : {};
  if (now.T1H == null) return null;
  return { temp: now.T1H, rh: now.REH, wsd: now.WSD, vec: now.VEC, pty: now.PTY, yTemp: y.T1H ?? null };
}

/* ===== 저장소에 30분마다 저장되는 기상청 자료 (GitHub Actions, 인증키 숨김) ===== */
async function kmaFromJSON() {
  const js = await getJSON(CONFIG.KMA_JSON + "?t=" + Math.floor(Date.now() / 600000), 7000);
  const age = (Date.now() - Date.parse(js.updatedAt)) / 3600e3;
  if (!(age < 6)) throw new Error("자료가 오래됨 (" + age.toFixed(1) + "시간)");
  GRIDS = DONGS.map(d => toGrid(d.lat, d.lon));
  const fc = [], now = [];
  for (const g of GRIDS) {
    const k = js.grids[g.nx + "," + g.ny];
    if (!k || !k.vilage) throw new Error("격자 자료 없음 " + g.nx + "," + g.ny);
    fc.push(parseVilage(k.vilage)); now.push(parseNow(k.ncst, k.ncstY));
  }
  const u = new Date(Date.parse(js.updatedAt) + 9 * 3600e3);
  return { fc, now, at: u.getUTCHours() + "시 " + pad2(u.getUTCMinutes()) + "분" };
}

/* ===== 예비: Open-Meteo ===== */
function codeToSky(c) { // WMO 날씨 코드 → 기상청 하늘·강수 형태
  if ([71, 73, 75, 77, 85, 86].includes(c)) return { sky: 4, pty: 3 };
  if ([66, 67].includes(c)) return { sky: 4, pty: 2 };
  if ([80, 81, 82].includes(c)) return { sky: 4, pty: 4 };
  if (c >= 51 && c <= 65) return { sky: 4, pty: 1 };
  if (c === 3 || c === 45 || c === 48) return { sky: 4, pty: 0 };
  if (c === 2) return { sky: 3, pty: 0 };
  return { sky: 1, pty: 0 };
}
async function openMeteoAll() {
  const vars = "temperature_2m,relative_humidity_2m,dew_point_2m,precipitation,snowfall,soil_temperature_0cm,precipitation_probability,weather_code,wind_speed_10m,wind_direction_10m";
  const url = "https://api.open-meteo.com/v1/forecast?latitude=" + DONGS.map(d => d.lat).join(",") + "&longitude=" + DONGS.map(d => d.lon).join(",") +
    "&hourly=" + vars + "&current=temperature_2m,relative_humidity_2m,wind_speed_10m,wind_direction_10m,weather_code" +
    "&wind_speed_unit=ms&timezone=Asia%2FSeoul&past_days=1&forecast_days=3";
  let js = await getJSON(url, 7000); if (!Array.isArray(js)) js = [js];
  return js.map(d => {
    const H = d.hourly;
    const fc = addRolling(H.time.map((t, i) => ({
      time: t, temp: H.temperature_2m[i], surf: H.soil_temperature_0cm ? H.soil_temperature_0cm[i] : null,
      rh: H.relative_humidity_2m[i], dew: H.dew_point_2m[i], rain: H.precipitation[i] || 0, snow: H.snowfall[i] || 0,
      pop: H.precipitation_probability ? H.precipitation_probability[i] ?? 0 : 0, wsd: H.wind_speed_10m[i], vec: H.wind_direction_10m[i],
      ...codeToSky(H.weather_code[i])
    })));
    const C = d.current, nowKey = kstKey(kstNow());
    const y = fc.find(h => h.time === kstKey(new Date(kstNow().getTime() - 86400e3)));
    return { fc, now: { temp: C.temperature_2m, rh: C.relative_humidity_2m, wsd: C.wind_speed_10m, vec: C.wind_direction_10m,
                        pty: codeToSky(C.weather_code).pty, sky: codeToSky(C.weather_code).sky, yTemp: y ? y.temp : null, nowKey } };
  });
}

/* ===== 예보를 못 받을 때 보여 줄 예시 (인터넷이 끊겨도 화면이 비지 않도록) ===== */
function demoAll() {
  const start = kstNow(); start.setUTCMinutes(0, 0, 0); start.setUTCHours(start.getUTCHours() - 12);
  return DONGS.map((d, j) => {
    const fc = [];
    for (let i = 0; i < 72; i++) {
      const t = new Date(start.getTime() + i * 3600e3), hr = t.getUTCHours(), night = hr >= 18 || hr < 9;
      fc.push({ time: kstKey(t), temp: (night ? -1.5 : 4) + j * 0.4, surf: null, rh: 92, dew: -3, rain: (hr === 16 || hr === 17) ? 0.6 : 0, snow: 0,
                sky: hr === 16 || hr === 17 ? 4 : 3, pty: hr === 16 || hr === 17 ? 1 : 0, pop: hr === 16 || hr === 17 ? 70 : 20, wsd: 1.8, vec: 300 });
    }
    return { fc: addRolling(fc), now: { temp: 1.2 + j * 0.3, rh: 85, wsd: 1.8, vec: 300, pty: 0, sky: 3, yTemp: -0.8 } };
  });
}

/* ===== 날씨 그림 (직접 그린 단순 아이콘) ===== */
function icon(sky, pty, day) {
  const sun = '<circle cx="40" cy="34" r="16" fill="#FFC23D"/>';
  const moon = '<path d="M50 18a18 18 0 1 0 6 30A15 15 0 0 1 50 18z" fill="#86A9F5"/>';
  const cloud = (dx, fill) => '<path transform="translate(' + dx + ',0)" d="M30 78h40a16 16 0 0 0 0-32 22 22 0 0 0-42-2 15 15 0 0 0 2 34z" fill="' + fill + '"/>';
  let body;
  if (pty) {
    const drops = pty === 3
      ? '<circle cx="38" cy="88" r="3.5" fill="#9DB7F5"/><circle cx="52" cy="92" r="3.5" fill="#9DB7F5"/><circle cx="66" cy="88" r="3.5" fill="#9DB7F5"/>'
      : '<path d="M38 84l-4 10M52 84l-4 10M66 84l-4 10" stroke="#3D6FE0" stroke-width="4" stroke-linecap="round"/>' + (pty === 2 ? '<circle cx="74" cy="92" r="3.5" fill="#9DB7F5"/>' : "");
    body = cloud(4, "#B8BEC9") + drops;
  } else if (sky === 1) body = day ? sun.replace('cx="40" cy="34" r="16"', 'cx="50" cy="50" r="22"') + rays() : moon.replace("M50 18a18 18 0 1 0 6 30A15 15 0 0 1 50 18z", "M58 26a24 24 0 1 0 8 40A20 20 0 0 1 58 26z");
  else if (sky === 3) body = (day ? sun : moon) + cloud(6, "#D3D7DE");
  else body = cloud(-6, "#A9AFBA") + cloud(8, "#D3D7DE");
  return '<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">' + body + "</svg>";
  function rays() {
    let r = ""; for (let a = 0; a < 360; a += 45) { const x = Math.cos(a * Math.PI / 180), y = Math.sin(a * Math.PI / 180);
      r += '<line x1="' + (50 + x * 30) + '" y1="' + (50 + y * 30) + '" x2="' + (50 + x * 38) + '" y2="' + (50 + y * 38) + '" stroke="#FFC23D" stroke-width="4" stroke-linecap="round"/>'; }
    return r;
  }
}
const skyText = (sky, pty) => pty ? ["", "비", "비 또는 눈", "눈", "소나기"][pty] || "비" : ({ 1: "맑음", 3: "구름많음", 4: "흐림" })[sky] || "구름많음";

/* ===== 해 뜨는 시각 (NOAA 계산식) ===== */
function sunrise(lat, lon) {
  const n = kstNow(), start = Date.UTC(n.getUTCFullYear(), 0, 1), N = Math.floor((Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate()) - start) / 86400e3) + 1;
  const g = 2 * Math.PI / 365 * (N - 1);
  const eq = 229.18 * (0.000075 + 0.001868 * Math.cos(g) - 0.032077 * Math.sin(g) - 0.014615 * Math.cos(2 * g) - 0.040849 * Math.sin(2 * g));
  const dec = 0.006918 - 0.399912 * Math.cos(g) + 0.070257 * Math.sin(g) - 0.006758 * Math.cos(2 * g) + 0.000907 * Math.sin(2 * g) - 0.002697 * Math.cos(3 * g) + 0.00148 * Math.sin(3 * g);
  const la = lat * Math.PI / 180;
  const ha = Math.acos(Math.cos(90.833 * Math.PI / 180) / (Math.cos(la) * Math.cos(dec)) - Math.tan(la) * Math.tan(dec)) * 180 / Math.PI;
  const m = Math.round(720 - 4 * (lon + ha) - eq + 540);
  return pad2(Math.floor(m / 60)) + ":" + pad2(m % 60);
}

/* ===== 상태 ===== */
let DATA = null, NIGHT = 0, SEL = 0, WTAB = "temp";
// DATA = { source, surface, fetchedAt, fc: [동별 시간 배열], now: [동별 현재 값 또는 null], city: [시 전체 시간 배열] }

/* ===== 밤 구간과 요약 ===== */
function nightWindow(hours, nightIdx) {
  const base = kstNow();
  const day = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate() + nightIdx));
  if (base.getUTCHours() < 9) day.setUTCDate(day.getUTCDate() - 1); // 새벽이면 진행 중인 밤
  const ymd = dt => dt.getUTCFullYear() + "-" + pad2(dt.getUTCMonth() + 1) + "-" + pad2(dt.getUTCDate());
  const next = new Date(day.getTime() + 86400e3);
  const start = ymd(day) + "T18:00", end = ymd(next) + "T09:00";
  return { hours: hours.filter(h => h.time >= start && h.time <= end), label: (day.getUTCMonth() + 1) + "월 " + day.getUTCDate() + "일 밤" };
}
const tval = h => h.surf ?? h.temp;
function summarize(win) {
  let best = { lv: 0, why: "" }, minT = Infinity, minAt = "", worstAt = "";
  for (const h of win) {
    if (tval(h) < minT) { minT = tval(h); minAt = h.time; }
    if (h.r.lv > best.lv) { best = h.r; worstAt = h.time; }
  }
  return { lv: best.lv, why: best.why, minT, minAt, worstAt };
}
function reasonText(s) {
  if (s.lv === 3) return (s.why === "눈" ? "눈이 오고 길 표면이 영하입니다." : "비가 온 뒤 길 표면이 영하로 내려갑니다.") + " " + hhmm(s.worstAt) + "부터 길이 얼 수 있습니다. 외출은 해가 뜬 뒤로 미뤄 주세요.";
  if (s.lv === 2) return "길 표면이 영하이고 습도가 높아 서리가 낄 수 있습니다. 그늘진 길과 경사로를 조심하세요.";
  if (s.lv === 1) return "기온이 낮습니다. 물기가 남은 곳은 얼 수 있으니 발밑을 살펴 주세요.";
  return "길이 얼 가능성은 낮습니다.";
}

/* ===== 외출 옷차림 · 준비 ===== */
function clothesFor(t) {
  if (t <= -10) return ["두꺼운 패딩과 내복, 목도리·모자·장갑 모두 챙기기", "한파입니다. 꼭 필요한 외출만 하세요"];
  if (t <= -5)  return ["두꺼운 패딩, 내복이나 기모 바지", "목도리·털모자·장갑"];
  if (t <= 0)   return ["패딩이나 두꺼운 코트", "목도리와 장갑"];
  if (t <= 5)   return ["코트나 경량 패딩, 두꺼운 니트", "얇은 장갑"];
  if (t <= 9)   return ["가벼운 코트나 점퍼, 니트"];
  return ["얇은 겉옷 한 벌"];
}
function prepFor(lv) {
  if (lv >= 3) return [{ t: "밑창이 고무로 된 미끄럼 방지 신발, 가능하면 덧신·간이 아이젠", w: true },
                       { t: "주머니에 손 넣지 말고 장갑 끼기 (넘어질 때 손으로 짚도록)", w: true },
                       { t: "지팡이나 실버카 함께 쓰기, 보폭은 짧게" },
                       { t: "어두운 새벽에는 밝은 색 외투 입기" },
                       { t: "가능하면 해가 뜬 뒤 길이 녹은 다음 외출" }];
  if (lv === 2) return [{ t: "미끄럼 방지 신발 신기", w: true },
                        { t: "주머니에 손 넣지 말고 장갑 끼기", w: true },
                        { t: "그늘진 길·경사로·계단은 난간 잡고 천천히" }];
  if (lv === 1) return [{ t: "밑창이 닳지 않은 신발 신기" }, { t: "물기 있는 곳은 피해서 걷기" }];
  return [{ t: "평소처럼 다니셔도 됩니다. 젖은 바닥만 조심하세요" }];
}
function renderWear(s) {
  const list = document.getElementById("wearList"); if (!list) return;
  document.getElementById("wearTemp").textContent = "밤·새벽 최저 " + s.minT.toFixed(1) + "℃ · 결빙 위험 " + LV[s.lv] + " 기준";
  list.innerHTML = "";
  for (const it of clothesFor(s.minT).map(t => ({ t })).concat(prepFor(s.lv))) {
    const li = document.createElement("li"); li.textContent = it.t; if (it.w) li.className = "warn"; list.appendChild(li);
  }
}

/* ===== 날씨 카드 ===== */
function renderWeather() {
  const fc = DATA.fc[SEL], d = DONGS[SEL];
  const nowKey = kstKey(kstNow());
  const cur = fc.find(h => h.time === nowKey) || fc.find(h => h.time > nowKey) || fc[0];
  const now = DATA.now[SEL] || { temp: cur.temp, rh: cur.rh, wsd: cur.wsd, vec: cur.vec, pty: cur.pty, yTemp: null };
  const sky = now.sky ?? cur.sky, pty = now.pty || 0;
  const hr = kstNow().getUTCHours(), day = hr >= 7 && hr < 18;

  document.getElementById("wxIcon").innerHTML = icon(sky, pty, day);
  document.getElementById("wxTemp").textContent = now.temp.toFixed(1) + "°";
  const diff = document.getElementById("wxDiff");
  if (now.yTemp != null) {
    const dt = now.temp - now.yTemp;
    diff.innerHTML = Math.abs(dt) < 0.05 ? "어제와 같아요" : "어제보다 " + Math.abs(dt).toFixed(1) + "° " + (dt > 0 ? '<span class="up">↑</span>' : '<span class="down">↓</span>');
  } else diff.innerHTML = "&nbsp;";
  document.getElementById("wxSky").textContent = skyText(sky, pty);
  document.getElementById("wxMeta").innerHTML = "체감 <b>" + feelsLike(now.temp, now.wsd).toFixed(1) + "°</b> · 습도 <b>" + Math.round(now.rh) + "%</b> · " +
    windName(now.vec) + " <b>" + (+now.wsd).toFixed(1) + "m/s</b>";

  // 앞으로 12시간
  const next = fc.filter(h => h.time >= nowKey).slice(0, 12);
  const pop = Math.max(0, ...next.map(h => h.pop || 0));
  const tonight = summarize(nightWindow(fc, 0).hours);
  document.getElementById("wxChips").innerHTML =
    '<div class="chip" style="background:' + (tonight.lv >= 2 ? "#FDECE6" : "#EEF4FF") + '"><span>오늘 밤 결빙</span><b style="color:' + LV_HEX[tonight.lv] + '">' + LV[tonight.lv] + "</b></div>" +
    '<div class="chip"><span>강수확률</span><b>' + pop + "%</b></div>" +
    '<div class="chip"><span>최저 기온</span><b>' + (isFinite(tonight.minT) ? tonight.minT.toFixed(0) + "°" : "-") + "</b></div>" +
    '<div class="chip sun"><span>일출</span><b>' + sunrise(d.lat, d.lon) + "</b></div>";
  document.getElementById("wxSrc").textContent = DATA.source + " · " + DATA.fetchedAt + " 갱신 · " + d.name + " 기준";
  renderHourly(fc.filter(h => h.time >= nowKey).slice(0, 30));
}

function renderHourly(hours) {
  const box = document.getElementById("hourly"), W = 64, PH = 56;
  if (!hours.length) { box.innerHTML = ""; return; }
  const today = kstKey(kstNow()).slice(0, 10);
  let cols = "", vals = [];
  hours.forEach((h, i) => {
    const hrStr = h.time.slice(11, 13), isMid = hrStr === "00", day = +hrStr >= 7 && +hrStr < 18;
    let top = "", mid = '<div class="hplot"></div>', ico = '<div class="hico">' + icon(h.sky, h.pty, day) + "</div>";
    if (WTAB === "temp") { top = Math.round(h.temp) + "°"; vals.push(h.temp); }
    else if (WTAB === "rain") { top = (h.pop || 0) + "%"; mid = '<div class="hplot" style="display:flex"><div class="hbar" style="height:' + Math.max(3, (h.pop || 0) / 100 * PH) + 'px"></div></div>';
      ico = '<div class="hval" style="font-size:14px;color:var(--sub)">' + (h.rain ? h.rain.toFixed(1) + "mm" : "-") + "</div>"; }
    else if (WTAB === "wind") { top = (+h.wsd).toFixed(1) + "m/s"; mid = '<div class="hplot" style="display:flex;align-items:center;justify-content:center"><span class="harrow" style="transform:rotate(' + ((h.vec + 180) % 360) + 'deg)">↑</span></div>';
      ico = '<div class="hval" style="font-size:14px;color:var(--sub)">' + windName(h.vec) + "</div>"; }
    else if (WTAB === "hum") { top = Math.round(h.rh) + "%"; vals.push(h.rh); }
    else { top = LV[h.r.lv]; mid = '<div class="hplot" style="display:flex"><div class="hbar" style="background:' + LV_HEX[h.r.lv] + ';height:' + (14 + h.r.lv * 14) + 'px"></div></div>';
      ico = '<div class="hval" style="font-size:14px;color:var(--sub)">' + Math.round(tval(h)) + "°</div>"; }
    const lab = i === 0 ? "지금" : isMid ? (h.time.slice(0, 10) > today ? "내일" : "") : hrStr + "시";
    const cls = isMid ? "hlab day" : (h.time.slice(0, 10) > today ? "hlab next" : "hlab");
    cols += '<div class="hcol"><div class="hval"' + (WTAB === "ice" ? ' style="font-size:14px;color:' + LV_HEX[h.r.lv] + '"' : "") + ">" + top + "</div>" + mid + ico + '<div class="' + cls + '">' + (lab || "내일") + "</div></div>";
  });
  let svg = "";
  if (vals.length) { // 꺾은선
    const mn = Math.min(...vals), mx = Math.max(...vals), rng = mx - mn || 1;
    const pts = vals.map((v, i) => [i * W + W / 2, 30 + 8 + (1 - (v - mn) / rng) * (PH - 16)]);
    svg = '<svg class="line" width="' + hours.length * W + '" height="' + (30 + PH) + '"><polyline points="' + pts.map(p => p.join(",")).join(" ") +
      '" fill="none" stroke="#C9D2E6" stroke-width="3" stroke-linejoin="round"/>' +
      pts.map((p, i) => '<circle cx="' + p[0] + '" cy="' + p[1] + '" r="' + (i === 0 ? 5 : 3.5) + '" fill="' + (i === 0 ? "#6A4FD8" : "#DDE2EC") + '"/>').join("") + "</svg>";
  }
  box.innerHTML = '<div class="hourly-in" style="width:' + hours.length * W + 'px">' + svg + cols + "</div>";
}

/* ===== 지도 (브이월드 또는 OpenStreetMap) ===== */
let MAP = null, CIRCLES = [];
function initMap() {
  if (MAP || typeof L === "undefined") return;
  MAP = L.map("map", { scrollWheelZoom: false }).setView([37.362, 126.982], 12);
  const osm = () => L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "© OpenStreetMap 기여자" });
  if (CONFIG.VWORLD_KEY) {
    // 브이월드 지도가 안 뜨면(키 만료·주소 미등록 등) OpenStreetMap으로 자동 전환
    let loaded = 0, failed = 0;
    const vw = L.tileLayer("https://api.vworld.kr/req/wmts/1.0.0/" + CONFIG.VWORLD_KEY + "/Base/{z}/{y}/{x}.png",
      { maxZoom: 19, minZoom: 6, attribution: "© 브이월드(국토교통부)" });
    vw.on("tileload", () => { loaded++; });
    vw.on("tileerror", () => {
      if (++failed >= 4 && loaded === 0 && MAP.hasLayer(vw)) {
        MAP.removeLayer(vw); osm().addTo(MAP);
        document.getElementById("mapSrc").textContent = "OpenStreetMap 기여자";
        console.warn("브이월드 지도를 불러오지 못해 OpenStreetMap으로 바꿨습니다.");
      }
    });
    vw.addTo(MAP);
    document.getElementById("mapSrc").textContent = "브이월드(국토교통부)";
  } else {
    osm().addTo(MAP);
  }
}
function drawMap(levels) {
  initMap(); if (!MAP) return;
  CIRCLES.forEach(c => c.remove()); CIRCLES = [];
  DONGS.forEach((d, i) => {
    const lv = levels[i].lv;
    CIRCLES.push(L.circle([d.lat, d.lon], { radius: 900, color: LV_HEX[lv], weight: 2, fillColor: LV_HEX[lv], fillOpacity: 0.45 })
      .bindTooltip(d.name + " · " + LV[lv], { permanent: true, direction: "center" })
      .on("click", () => selectDong(i)).addTo(MAP));
  });
}

/* ===== 결빙 카드 · 동별 ===== */
function renderRisk() {
  const win = nightWindow(DATA.city, NIGHT);
  if (!win.hours.length) { document.getElementById("riskLevel").textContent = "자료 없음"; return; }
  const s = summarize(win.hours);
  document.getElementById("riskCard").className = "risk-card lv" + s.lv;
  document.getElementById("riskWhen").textContent = "의왕시 전체 · " + win.label;
  document.getElementById("riskLevel").textContent = "결빙 위험 " + LV[s.lv];
  document.getElementById("riskReason").textContent = reasonText(s);
  document.getElementById("riskMeta").textContent = (DATA.surface ? "가장 낮은 땅 표면 온도 " : "가장 낮은 기온 ") + s.minT.toFixed(1) + "℃ (" + hhmm(s.minAt) + ") · " + DATA.source;
  document.getElementById("srcNote").textContent = DATA.source;
  renderWear(s);
  const box = document.getElementById("dongs"); box.innerHTML = "";
  const levels = DATA.fc.map(hrs => summarize(nightWindow(hrs, NIGHT).hours));
  levels.forEach((ds, i) => {
    const el = document.createElement("button");
    el.type = "button"; el.className = "dong"; el.style.borderLeftColor = LV_COLOR[ds.lv]; el.style.textAlign = "left"; el.style.font = "inherit"; el.style.cursor = "pointer";
    el.innerHTML = "<b>" + DONGS[i].name + "</b><span>" + LV[ds.lv] + " · 최저 " + (isFinite(ds.minT) ? ds.minT.toFixed(1) + "℃" : "-") + "</span>";
    el.addEventListener("click", () => selectDong(i));
    box.appendChild(el);
  });
  drawMap(levels);
}
function selectDong(i) {
  SEL = i; document.getElementById("dongSel").value = String(i);
  renderWeather(); loadNow(i);
  document.getElementById("wx").scrollIntoView({ behavior: "smooth", block: "start" });
}

/* ===== 불러오기 ===== */
let GRIDS = null; // 동별 기상청 격자
async function loadNow(i) { // 기상청 실황(현재 기온·어제와 비교)은 고른 동만 불러옴
  if (!DATA || DATA.kind !== "kma" || DATA.now[i]) return;
  try { DATA.now[i] = await kmaNow(GRIDS[i]); if (SEL === i) renderWeather(); } catch (e) { console.warn("실황 실패:", e); }
}
async function load() {
  let fc = null, now = null, source = "", surface = false, kind = "", at = "";
  if (CONFIG.KMA_JSON) {
    try { const r = await kmaFromJSON(); fc = r.fc; now = r.now; at = r.at; source = "기상청 단기예보·실황"; kind = "kmajson"; }
    catch (e) { console.warn("저장된 기상청 자료 없음:", e.message); }
  }
  if (!fc && (CONFIG.KMA_PROXY || CONFIG.KMA_KEY)) {
    try {
      GRIDS = DONGS.map(d => toGrid(d.lat, d.lon));
      const uniq = [...new Set(GRIDS.map(g => g.nx + "," + g.ny))], got = {};
      await Promise.all(uniq.map(async k => { const [nx, ny] = k.split(",").map(Number); got[k] = await kmaForecast({ nx, ny }); }));
      fc = GRIDS.map(g => got[g.nx + "," + g.ny]); now = DONGS.map(() => null);
      source = "기상청 단기예보"; kind = "kma";
    } catch (e) { console.warn("기상청 예보 실패, 예비 자료 사용:", e); fc = null; }
  }
  if (!fc) {
    try { const all = await openMeteoAll(); if (!all.length || !all[0].fc.length) throw new Error("empty");
      fc = all.map(a => a.fc); now = all.map(a => a.now); source = "Open-Meteo 예보"; surface = true; kind = "om"; }
    catch (e) { console.warn("예비 예보도 실패, 예시 화면 표시:", e); const all = demoAll(); fc = all.map(a => a.fc); now = all.map(a => a.now); source = "예시 화면 (예보 연결 안 됨)"; kind = "demo"; }
  }
  const city = fc[0].map((h, i) => { // 시 전체: 시간마다 가장 추운 동
    let pick = h;
    for (const d of fc) { const c = d[i]; if (c && c.time === h.time && tval(c) < tval(pick)) pick = c; }
    return pick;
  });
  const n = kstNow();
  DATA = { fc, now, city, source, surface, kind, fetchedAt: at || (n.getUTCHours() + "시 " + pad2(n.getUTCMinutes()) + "분") };
  renderWeather(); renderRisk(); loadNow(SEL);
}

/* ===== 이벤트 ===== */
(function () {
  const sel = document.getElementById("dongSel");
  sel.innerHTML = DONGS.map((d, i) => '<option value="' + i + '">의왕시 ' + d.name + "</option>").join("");
  sel.addEventListener("change", () => { SEL = +sel.value; if (DATA) { renderWeather(); loadNow(SEL); } });
  document.querySelectorAll(".wtab").forEach(b => b.addEventListener("click", () => {
    WTAB = b.dataset.k;
    document.querySelectorAll(".wtab").forEach(x => x.setAttribute("aria-selected", x === b ? "true" : "false"));
    if (DATA) renderWeather();
  }));
  document.querySelectorAll(".tab").forEach(b => b.addEventListener("click", () => {
    NIGHT = +b.dataset.night;
    document.querySelectorAll(".tab").forEach(x => x.setAttribute("aria-selected", x === b ? "true" : "false"));
    if (DATA) renderRisk();
  }));
})();

load();
setInterval(() => { if (DATA && DATA.kind === "kma") DATA.now = DONGS.map(() => null); load(); }, 30 * 60 * 1000); // 30분마다 갱신
