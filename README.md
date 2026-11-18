# weather-safety · 의왕 어르신 보행 안전 지킴이

무브니어(Movneer)의 의왕 날씨·결빙 위험 안내와 무료 시범 신청 페이지입니다.
기상청 단기예보·초단기실황으로 현재 날씨, 시간별 예보, 동별 결빙 위험, 외출 옷차림을 보여 줍니다.

## 파일 구성
```
index.html        화면 (문구·구성)
css/style.css     디자인
js/config.js      설정 (구글 폼 링크, 인증키, 지도 키) ← 보통 이것만 고칩니다
js/app.js         동작 (기상청 예보·실황 → 날씨 카드, 결빙 위험, 옷차림, 지도)
scripts/build-roads.mjs      의왕 골목·보도·계단 구간과 경사 계산 → data/roads.json (OpenStreetMap, Open-Meteo 지형)
scripts/fetch-kma.mjs        기상청 예보·실황을 받아 data/kma.json 저장 (GitHub Actions에서 실행)
.github/workflows/pages.yml  30분마다 예보 갱신 + GitHub Pages 배포
api/kma.js        기상청 중계 서버 (Vercel에 올릴 때만 사용)
package.json      Vercel 서버 함수 설정
```

## 1. 내 컴퓨터에서 바로 보기
폴더째 압축을 풀고 `index.html`을 크롬으로 엽니다.
- 기상청 호출이 브라우저에서 막히면 자동으로 예비 예보(Open-Meteo)로 바뀌고,
  그것도 안 되면 "예시 화면"이 뜹니다. 카드 아래 출처 표시로 확인하세요.

## 2. 설정 (js/config.js)
| 항목 | 내용 |
|---|---|
| RESIDENT_FORM | 어르신·보호자용 구글 폼 링크 |
| ORG_FORM | 기관용 구글 폼 링크 (비우면 위 폼 사용) |
| KMA_PROXY | 중계 서버 주소. Vercel에 올렸다면 `"/api/kma"` |
| KMA_KEY | 공공데이터포털 인증키. **공개할 때는 비우고 KMA_PROXY 사용** |
| VWORLD_KEY | 브이월드 인증키. 비우면 OpenStreetMap 지도 |
| CONTACT | 하단 문의처 문구 |
| GOATCOUNTER | 방문자 수 세기(선택) |

## 3. 인터넷에 올리기 (GitHub Pages, 무료 · 권장)
1. 저장소 Settings → Secrets and variables → Actions → New repository secret
   - Name: `KMA_KEY`, Secret: 공공데이터포털 인증키 (기상청_단기예보 활용신청 필요)
2. Settings → Pages → Build and deployment → Source: **GitHub Actions**
3. Actions 탭 → "기상청 예보 갱신 및 배포" → Run workflow
4. 주소: `https://kyle-bbajo.github.io/weather-safety/`

인증키는 Secret에만 있고 공개 코드·페이지에는 드러나지 않습니다.
30분마다 기상청 자료를 새로 받아 `data/kma.json`으로 함께 배포합니다.
기상청 자료가 없거나 6시간 넘게 오래되면 예비 예보(Open-Meteo), 그것도 안 되면 예시 화면을 보여 줍니다.

### (선택) Vercel로 올리기
Vercel에서 이 저장소를 Import하고 Environment Variables에 `KMA_KEY`를 넣은 뒤,
`js/config.js`에서 `KMA_PROXY: "/api/kma"`로 바꾸면 실시간 중계 방식으로 동작합니다.

## 4. 검증 지표
- 구글 폼 응답 수 = 사전 신청자 수
- (선택) GOATCOUNTER로 방문자 수 → 신청 전환율
