# 대시보드 동작 개선 보고

확인일: 2026-11-01 (Asia/Seoul)

## 원인과 확인한 상태

- 기존 로컬 서버(4188)에는 Google 서비스 계정·GA4 속성·Search Console 속성이 설정되지 않아 두 API가 503을 반환했다.
- 운영 사이트의 기존 공개 `/api/dashboard/summary` 및 `/api/dashboard/christmas-search`는 200 응답과 실제 보고서를 반환했다. 운영 연결 자체가 모두 고장 난 상태는 아니었다.
- 요약 API는 GA4와 Search Console 중 하나의 설정만 없어도 전체를 차단했다. 보고서 오류가 발생하면 일부 값이 0으로 대체됐고, 클라이언트에는 새로고침·복구·연속 기간 전환 보호 기능이 부족했다.
- 시간대 키 `8`과 `08`이 중복돼 오늘 차트가 24개보다 많은 구간을 만들 수 있었다. 차트의 주문 신호 합계에는 상품 탐색 이벤트도 포함돼 핵심 지표와 의미가 달랐다.

## 구현

- GA4와 Search Console을 독립 조회한다. 한쪽 설정·권한이 없더라도 연결된 서비스는 표시한다.
- 연결됨 / 보고된 행 없음 / 설정 필요 / 권한 확인 / 조회 실패를 구분한다. 조회 실패는 `null`과 `—`로 표시하며 실제 0건과 구분한다.
- 오늘·7일·30일·90일, 새로고침, 취소·시간 제한·늦게 도착한 응답 보호, 네트워크·JSON·429 오류 후 재시도를 구현했다.
- 표 검색, 열별 정렬, 상세 페이지 새 탭 이동, CSV 다운로드를 추가했다. CSV의 수식 시작 문자를 이스케이프한다.
- 브랜드 헤더, 간결한 핵심 정보, 연결 상태 카드, 영역 이동, 클릭 상세 스크롤, 키보드 조작 가능한 표 및 차트 수치 표를 제공한다. 크리스마스 전용 분석은 하단에 유지했다.
- 차트 시간대를 두 자리로 정규화하고 날짜별 빈 구간을 확보한다. 차트와 핵심 지표 모두 주문·상담 이벤트만 전환 신호로 합산한다. 조회 한도는 시간·일수와 추적 이벤트 수에 맞춘다.
- 네이버 방문 합계는 상위 유입 경로 일부의 합산 대신 별도의 필터된 GA4 합계로 조회한다. 네이버 검색어 성과로 설명하지 않는다.
- GA4 랜딩 페이지는 쿼리 문자열 없는 `landingPage`로 조회한다. 페이지 URL의 쿼리·해시는 출력 전에 제거한다.
- Google 검색 요약은 미국 태평양 날짜 기준, 운영 기준으로 최근 3일을 제외한 최종 데이터 기간을 사용한다. 방문 기간과 별도로 표시한다. 기존 운영 API를 읽는 로컬 미리보기는 그 API의 실제 기존 기간을 표시하며 새 기간 정책을 적용한 것처럼 설명하지 않는다.
- 기존 공개 읽기 모드, 선택 가능한 비공개 모드, Quick 주문·관리자 인증 및 noindex/no-store를 유지했다.

## 로컬 미리보기

현재 실행 주소: http://127.0.0.1:4189/dashboard/

Google 비밀키를 로컬에 복사하지 않고, 이미 공개된 운영 성과 API만 읽는다.

```sh
DASHBOARD_PREVIEW_PUBLIC_DATA=1 HOST=127.0.0.1 PORT=4189 node server.js
```

- 명시적 환경변수, loopback 연결 및 localhost Host, 공개 읽기 모드, 로컬 Google 계정 미설정이 모두 필요하다.
- `NODE_ENV=production`에서는 사용할 수 없다.
- 목적지는 `https://nothingmatters.co.kr`의 두 읽기 API로 고정한다. 임의 URL·주문·관리자 API를 프록시하지 않으며 쿠키·Authorization을 전달하지 않는다.
- 실제 테스트 실행 서버는 `NODE_ENV=test`와 차단된 로컬 주문 API를 사용했다. 운영 DB에 주문을 생성하지 않았다.
- 운영의 직접 연결은 기존 `GOOGLE_SERVICE_ACCOUNT_JSON` 또는 Base64, `GA4_PROPERTY_ID`, `SEARCH_CONSOLE_SITE_URL` 설정을 사용한다. 자격증명 값은 화면·보고서·Git에 추가하지 않았다.

## 검증

| 검사 | 결과 |
| --- | --- |
| `npm run dashboard:test` | 통과: 서비스별 독립 조회, 실제 0과 미확보 구분, 권한·토큰 실패, PT 기간, 시간대 정규화·조회 한도, 네이버 합계, URL 개인정보, 제한된 미리보기 |
| `npm run dashboard:browser:test` | 통과: 320/390/768/1280/1440px, 4개 기간, 새로고침, 늦은 응답 보호, 표 검색·정렬, CSV 수식 방지, 차트 표, 링크·키보드, 오류·부분 연결 |
| `npm run christmas:search:browser:test` | 통과: 기존 28/90일 전용 분석, 인증·공개 읽기, 빈 자료·권한 오류·재조회·XSS |
| `npm run server:test` | 통과: HTTP·김포공항·성과 API·공개/비공개·Quick 인증 경계 및 신규 대시보드 API |
| `npm run order:test` | 통과: 기존 주문 저장·견적·실패 복구·중복 방지·크리스마스 SKU 재계산 (모의 테스트) |
| `npm run christmas:check` | 통과: 기존 4종 카탈로그·가격·생성 내용 |
| `npm run site:check` | 기존 `/wishing-tree/`가 `data/site-pages.json`에 분류되지 않은 오류에서 중단. 앞선 마곡·박물관·공지·크리스마스·상품·스키마 검사는 통과 |
| `git diff --check` | 통과 |

운영 API의 GET 읽기만 사용한 별도 브라우저 확인에서도 오늘/7일/30일/90일과 390/1440px을 확인했고 런타임 예외가 없었다. 실제 수치 원본과 CSV는 Git에 보관하지 않는다. API 로직의 오류·권한·부분 응답 검증은 합성 자료로 수행했다.

스크린샷과 검증 자료: `output/playwright/dashboard-upgrade/` (Git 제외)

- 변경 전: `before-390.png`, `before-1440.png`
- 실제 운영 공개 데이터를 표시한 변경 후: `live-390-top.png`, `live-390-overview.png`, `live-1440-top.png`, `live-1440-overview.png`
- 합성 자료의 화면·상태 검증: `synthetic-*.png`, `browser-evidence.json`
- 실제 데이터 읽기 확인 결과: `live-check.json` (수치 원본 미포함)

## 변경 파일

- `dashboard/index.html`
- `assets/dashboard.css`
- `assets/dashboard.js`
- `assets/christmas-search-dashboard.js`
- `server.js`
- `lib/dashboard-support.js`
- `.env.example`
- `package.json`
- `scripts/christmas-search-test-helper.mjs`
- `scripts/test-christmas-search-browser.mjs`
- `scripts/test-dashboard.mjs`
- `scripts/test-dashboard-browser.mjs`
- `DASHBOARD-UPGRADE-REPORT.md`

참조: [GA4 공식 API 스키마](https://developers.google.com/analytics/devguides/reporting/data/v1/api-schema), [Search Console 공식 조회 API](https://developers.google.com/webmaster-tools/v1/searchanalytics/query).

이 작업에서 커밋·푸시·운영 배포는 실행하지 않았다. 운영 사이트는 배포 전까지 기존 코드이며, 새 기능은 위 로컬 주소에서 검수할 수 있다. 네이버 검색어 내보내기와 실제 색인 상태는 별도 자료·콘솔 확인이 필요하다.
