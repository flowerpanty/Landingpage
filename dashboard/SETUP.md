# Dashboard Setup

`/dashboard/` 는 Google Analytics 4 Data API 와 Google Search Console API 를 함께 읽는 관리자용 페이지입니다.

## Required env

- `GOOGLE_SERVICE_ACCOUNT_JSON`
  또는
- `GOOGLE_SERVICE_ACCOUNT_JSON_BASE64`
- `GA4_PROPERTY_ID`
- `SEARCH_CONSOLE_SITE_URL`

선택:

- `DASHBOARD_USERNAME`
- `DASHBOARD_PASSWORD`

위 두 값을 넣으면 `/dashboard/` 와 `/api/dashboard/summary` 에 Basic Auth 가 걸립니다.

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
