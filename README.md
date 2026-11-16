# weather-safety · 의왕 어르신 보행 안전 지킴이

무브니어(Movneer)의 의왕 날씨·결빙 위험 안내와 무료 시범 신청 페이지입니다.
기상청 단기예보·초단기실황으로 현재 날씨, 시간별 예보, 동별 결빙 위험, 외출 옷차림을 보여 줍니다.

## 파일 구성
```
index.html        화면 (문구·구성)
css/style.css     디자인
js/config.js      설정 (구글 폼 링크, 인증키, 지도 키) ← 보통 이것만 고칩니다
js/app.js         동작 (기상청 예보·실황 → 날씨 카드, 결빙 위험, 옷차림, 지도)
api/kma.js        기상청 중계 서버 (인증키를 숨김, Vercel에 올릴 때 사용)
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

## 3. 인터넷에 올리기 (Vercel, 무료)
1. vercel.com 가입 → New Project → 이 폴더를 올리거나 GitHub 저장소 연결
2. Settings → Environment Variables → `KMA_KEY` = 공공데이터포털 인증키
3. `js/config.js`에서 `KMA_PROXY: "/api/kma"`, `KMA_KEY: ""`로 바꾸고 다시 배포
4. 브이월드 키를 쓸 경우, 발급받을 때 이 사이트 주소를 서비스 주소로 등록

정적 호스팅(GitHub Pages 등)에 올릴 때는 `api/` 폴더가 동작하지 않으니
KMA_KEY를 직접 넣는 방식으로만 쓸 수 있습니다(키가 공개됨).

## 4. 검증 지표
- 구글 폼 응답 수 = 사전 신청자 수
- (선택) GOATCOUNTER로 방문자 수 → 신청 전환율
