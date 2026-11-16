// 기상청 단기예보 중계 서버 (Vercel 서버리스 함수)
// - 인증키를 브라우저에 보이지 않게 서버에서만 사용합니다.
// - Vercel 프로젝트 설정 > Environment Variables 에 KMA_KEY 를 등록하세요.
// - 페이지의 js/config.js 에서 KMA_PROXY: "/api/kma" 로 두고 KMA_KEY 는 비웁니다.

export default async function handler(req, res) {
  const { nx, ny, base_date, base_time } = req.query || {};
  const OPS = ["getVilageFcst", "getUltraSrtNcst"]; // 단기예보, 초단기실황
  const op = OPS.includes((req.query || {}).op) ? req.query.op : "getVilageFcst";
  const ok = v => /^\d+$/.test(String(v || ""));
  if (![nx, ny, base_date, base_time].every(ok)) {
    res.status(400).json({ error: "nx, ny, base_date, base_time 숫자 값이 필요합니다" });
    return;
  }
  const key = process.env.KMA_KEY;
  if (!key) { res.status(500).json({ error: "서버에 KMA_KEY 환경변수가 없습니다" }); return; }

  const url = "https://apis.data.go.kr/1360000/VilageFcstInfoService_2.0/" + op +
    "?serviceKey=" + encodeURIComponent(key) +
    "&pageNo=1&numOfRows=1000&dataType=JSON" +
    "&base_date=" + base_date + "&base_time=" + base_time + "&nx=" + nx + "&ny=" + ny;

  try {
    const r = await fetch(url);
    const text = await r.text();
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Cache-Control", "s-maxage=600, stale-while-revalidate=1200"); // 10분 캐시로 호출 수 절약
    res.status(r.ok ? 200 : 502).send(text);
  } catch (e) {
    res.status(502).json({ error: "기상청 서버 연결 실패" });
  }
}
