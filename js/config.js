// 무브니어 의왕 랜딩페이지 설정. 이 파일만 고치면 됩니다.
const CONFIG = {
  KMA_JSON: "data/kma.json", // GitHub Actions가 30분마다 저장하는 기상청 자료 (권장, 인증키 숨김)
  KMA_PROXY: "",              // 중계 서버 주소 (예: "/api/kma"). 넣으면 키를 숨긴 채 기상청 예보 사용 (권장)
  KMA_KEY: "", // 중계 서버가 없을 때만 사용. 공개 시에는 비우고 KMA_PROXY 사용
  VWORLD_KEY: "C8C2FB09-1EB6-46BD-AE69-9D9D5ACEC4FA",      // 브이월드(국토교통부) 인증키. 비워 두면 OpenStreetMap 지도 사용
  RESIDENT_FORM: "",   // 예: "https://forms.gle/xxxx"
  ORG_FORM: "",        // 예: "https://forms.gle/yyyy"
  CONTACT: "",         // 예: "문의: movneer@example.com"
  GOATCOUNTER: ""      // 예: "movneer"  → https://movneer.goatcounter.com
};
