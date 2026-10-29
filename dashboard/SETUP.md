# Dashboard Setup

`/dashboard/` 는 Google Analytics 4 Data API 와 Google Search Console API 를 함께 읽는 성과 대시보드입니다. 기본값은 로그인 없이 조회하는 공개 모드입니다.

## Required env

- `GOOGLE_SERVICE_ACCOUNT_JSON`
  또는
- `GOOGLE_SERVICE_ACCOUNT_JSON_BASE64`
- `GA4_PROPERTY_ID`
- `SEARCH_CONSOLE_SITE_URL`

## 공개 모드와 관리자 인증

2026-10-30 변경: `/dashboard/`와 읽기 전용 `/api/dashboard/summary`, `/api/dashboard/christmas-search`는 아이디·비밀번호 없이 이용합니다. 환경변수를 추가하지 않아도 공개 모드이며, 명시하려면 `DASHBOARD_ACCESS_MODE=public`을 사용합니다. 사이트 전체 유입·검색어 및 크리스마스 검색 성과도 누구나 조회할 수 있습니다.

공개 응답에도 `no-store`, `noindex, nofollow`를 유지합니다. 성과 API는 GET·HEAD만 허용하며 고객 주문 DB를 조회하지 않습니다. 동일 보고서는 서버 메모리에서 60초간 공유하고 동시 요청을 합칩니다. 새로운 보고서 로드는 서버 전체 분당 8회까지이며 초과하면 429와 `Retry-After: 60`을 반환합니다. 캐시된 보고서는 계속 조회할 수 있습니다. 브라우저에는 기존 조회 시각을 표시합니다.

관리자 로그인으로 되돌리려면 `DASHBOARD_ACCESS_MODE=private`와 아래 두 값을 모두 설정합니다.

- `DASHBOARD_USERNAME`
- `DASHBOARD_PASSWORD`

비공개 모드에서 두 값 중 하나라도 비어 있으면 503으로 닫히며, 설정 후 인증 누락·실패는 401입니다. 브라우저의 Basic Auth 창으로 로그인합니다. 잘못된 `DASHBOARD_ACCESS_MODE` 값도 비공개로 처리합니다.

차량 퀵 주문 생성·주문 상태 조회·`/dashboard/quick/admin/`에는 공개 모드를 적용하지 않습니다. 이 기능은 위 관리자 ID·비밀번호가 항상 필요합니다. 기존 `/dashboard/quick/`의 공개 요금·시간 조회와 공지 관리자 인증은 유지합니다. Google 자격증명과 관리자 비밀번호는 서버 환경변수에만 둡니다.

## Google setup

1. Google Cloud 에서 서비스 계정을 만듭니다.
2. 서비스 계정 JSON 키를 발급합니다.
3. 서비스 계정 이메일을 GA4 속성에 `Viewer` 이상으로 추가합니다.
4. 서비스 계정 이메일을 Search Console 속성에 사용자로 추가합니다.

## Value examples

### GA4 property id

`GA4_PROPERTY_ID=123456789`

### Search Console site url

URL prefix 속성이면:

`SEARCH_CONSOLE_SITE_URL=https://nothingmatters.co.kr/`

도메인 속성이면:

`SEARCH_CONSOLE_SITE_URL=sc-domain:nothingmatters.co.kr`

## Railway tip

Railway 에서는 서비스 계정 JSON 전체를 `GOOGLE_SERVICE_ACCOUNT_JSON` 에 그대로 넣거나,
Base64 로 인코딩해서 `GOOGLE_SERVICE_ACCOUNT_JSON_BASE64` 에 넣어도 됩니다.

## 크리스마스 전용 분석

`/dashboard/` 상단의 크리스마스 검색 성과는 `/api/dashboard/christmas-search`를 사용합니다. 기존 Google 토큰·Search Console 조회 함수를 재사용하며, `GA4_PROPERTY_ID`가 없어도 독립적으로 동작합니다. 서비스 계정의 실제 Search Console 권한은 설정 후 조회가 성공해야 확인됩니다. 설정 유무만으로 권한이 확인되었다고 판단하지 마세요.

- 서버에서 `https://nothingmatters.co.kr/christmas/`에 `page equals` 필터를 강제합니다. 임의 페이지·기간 쿼리 매개변수는 받지 않습니다.
- Google Search Console의 미국 태평양 시간 날짜 기준으로 최근 3일을 제외한 28일·90일을 조회합니다. 실제 시작일·종료일과 출처를 화면에 표시합니다. `web`, `final`, `byPage`를 사용하며 최신 3일을 포함한 실시간 통계가 아닙니다.
- 페이지 합계, 검색어, 기기를 각각 조회합니다. 검색어는 25,000행씩 최대 50,000행, 화면 표는 최대 100행입니다. API 제한·익명화로 모든 검색어가 제공되는 것은 아닙니다.
- A–H 주제는 규칙에 따라 중복 분류합니다. CTR은 클릭/노출, 주제 평균순위는 노출 가중평균입니다. 주제 수치를 다시 합산하지 마세요.
- 페이지 총 노출 100회 미만은 작은 표본입니다. 노출 30회 이상인 관련 검색어 중 CTR 2% 미만 또는 평균순위 10 초과를 검토 후보로 표시합니다. 이 기준은 편집 검토용이며 문제의 원인이나 수요·개선 효과를 입증하지 않습니다.
- 연결 미설정, 권한 거부, 조회 실패, 기간 내 행 없음, 주제 미관측을 구분합니다. 미확보 수치를 0으로 채우지 않습니다.
- 성과 원본은 파일이나 데이터베이스에 저장하지 않습니다. Git에 인증 JSON이나 비공개 검색어 내보내기 자료를 추가하지 마세요. 로컬 실행 시에도 환경변수를 실행 환경에서 주입해야 하며 `server.js`가 `.env`를 자동 로드하지는 않습니다.

네이버 검색어 통계는 연동되어 있지 않습니다. 이번 감사에서는 로컬 내보내기 자료도 확보되지 않았으므로 별도 미확보 상태로 표시합니다. 추후 자료는 웹 루트 밖의 비공개 위치에서 검색엔진·기간·대상 URL·검색어·클릭·노출을 확인하여 분석해야 합니다. GA4 네이버 유입은 검색어 통계로 대체할 수 없고 수집·색인 상태도 별도 점검 대상입니다.

검증: `npm run christmas:search:test`, `npm run christmas:search:browser:test`, `npm run server:test`. 모의 성과 자료만 사용하며 운영 Google 조회나 운영 주문을 생성하지 않습니다.

공식 API 기준: [Search Analytics query](https://developers.google.com/webmaster-tools/v1/searchanalytics/query), [전체 데이터 조회와 한계](https://developers.google.com/webmaster-tools/v1/how-tos/all-your-data).
