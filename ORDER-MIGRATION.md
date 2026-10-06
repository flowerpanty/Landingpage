# 주문 URL 통합 작업 보고

작업일: 2026-10-06 (한국 시간). **로컬 코드 구현·검증 완료. 운영 배포와 기존 URL의 301 활성화는 아직 하지 않았습니다.**

## 변경한 파일

| 파일 | 변경 내용 |
| --- | --- |
| `.env.example` | 선택적 `ORDER_API_ORIGIN` 예시 추가. 비밀 값 없음. |
| `assets/site.js` | 모바일 주문 CTA를 `/order`로 변경하고 내부 주문 클릭의 기존 분석 이벤트 유지. |
| `brookie/index.html` | Railway 주문 링크를 `/order` 또는 `/order/상품명` 상대경로로 변경. 필요한 정적 구조화 데이터 재생성. |
| `bulk/index.html` | Railway 주문 링크를 `/order` 또는 `/order/상품명` 상대경로로 변경. 필요한 정적 구조화 데이터 재생성. |
| `cookie-crew/index.html` | Railway 주문 링크를 `/order` 또는 `/order/상품명` 상대경로로 변경. 필요한 정적 구조화 데이터 재생성. |
| `data/README.md` | 주문 라우트·원본 UI 유지 방식 설명. |
| `data/site-pages.json` | `/order` 색인·사이트맵 등록, 주문 상품 경로 목록, 이전 URL 별칭 301, 상품별 orderUrl 변경. |
| `guides/corporate-event-cookie/index.html` | Railway 주문 링크를 `/order` 또는 `/order/상품명` 상대경로로 변경. 필요한 정적 구조화 데이터 재생성. |
| `guides/dessert-gift-set/index.html` | Railway 주문 링크를 `/order` 또는 `/order/상품명` 상대경로로 변경. 필요한 정적 구조화 데이터 재생성. |
| `guides/farewell-favor-cookie/index.html` | Railway 주문 링크를 `/order` 또는 `/order/상품명` 상대경로로 변경. 필요한 정적 구조화 데이터 재생성. |
| `guides/index.html` | Railway 주문 링크를 `/order` 또는 `/order/상품명` 상대경로로 변경. 필요한 정적 구조화 데이터 재생성. |
| `guides/lucky-cheering-cookie/index.html` | Railway 주문 링크를 `/order` 또는 `/order/상품명` 상대경로로 변경. 필요한 정적 구조화 데이터 재생성. |
| `guides/teacher-snack-gift/index.html` | Railway 주문 링크를 `/order` 또는 `/order/상품명` 상대경로로 변경. 필요한 정적 구조화 데이터 재생성. |
| `guides/wedding-favor-cookie/index.html` | Railway 주문 링크를 `/order` 또는 `/order/상품명` 상대경로로 변경. 필요한 정적 구조화 데이터 재생성. |
| `index.html` | Railway 주문 링크를 `/order` 또는 `/order/상품명` 상대경로로 변경. 필요한 정적 구조화 데이터 재생성. |
| `magok-cookie/index.html` | Railway 주문 링크를 `/order` 또는 `/order/상품명` 상대경로로 변경. 필요한 정적 구조화 데이터 재생성. |
| `out/fortune/index.html` | Railway 주문 링크를 `/order` 또는 `/order/상품명` 상대경로로 변경. 필요한 정적 구조화 데이터 재생성. |
| `out/index.html` | Railway 주문 링크를 `/order` 또는 `/order/상품명` 상대경로로 변경. 필요한 정적 구조화 데이터 재생성. |
| `out/scone/index.html` | Railway 주문 링크를 `/order` 또는 `/order/상품명` 상대경로로 변경. 필요한 정적 구조화 데이터 재생성. |
| `package.json` | 주문 HTTP/확인/브라우저 검사와 읽기 전용 배포 검사 명령 추가. |
| `pickup/index.html` | Railway 주문 링크를 `/order` 또는 `/order/상품명` 상대경로로 변경. 필요한 정적 구조화 데이터 재생성. |
| `products/airplane-cookie/index.html` | Railway 주문 링크를 `/order` 또는 `/order/상품명` 상대경로로 변경. 필요한 정적 구조화 데이터 재생성. |
| `products/brownie-cookie/index.html` | Railway 주문 링크를 `/order` 또는 `/order/상품명` 상대경로로 변경. 필요한 정적 구조화 데이터 재생성. |
| `products/cookie-flight/index.html` | Railway 주문 링크를 `/order` 또는 `/order/상품명` 상대경로로 변경. 필요한 정적 구조화 데이터 재생성. |
| `products/custom-brownie-cookie/index.html` | Railway 주문 링크를 `/order` 또는 `/order/상품명` 상대경로로 변경. 필요한 정적 구조화 데이터 재생성. |
| `products/handmade-cookie/index.html` | Railway 주문 링크를 `/order` 또는 `/order/상품명` 상대경로로 변경. 필요한 정적 구조화 데이터 재생성. |
| `products/lucky-cookie/index.html` | Railway 주문 링크를 `/order` 또는 `/order/상품명` 상대경로로 변경. 필요한 정적 구조화 데이터 재생성. |
| `products/scone/index.html` | Railway 주문 링크를 `/order` 또는 `/order/상품명` 상대경로로 변경. 필요한 정적 구조화 데이터 재생성. |
| `scripts/build-guides-index.mjs` | 가이드 재생성 시 주문 링크가 `/order`로 유지되도록 변경. |
| `scripts/generate-jsonld.mjs` | `/order` CollectionPage와 7개 주문 상품 ItemList를 기존 스키마 생성기에 연결. |
| `scripts/test-public-browser.mjs` | 기존 화면 검사를 유지하고 주문 링크 기대값만 내부 상대경로에 맞게 변경. |
| `scripts/test-public-seo.mjs` | 정확한 `/order` canonical과 확장자 없는 주문 HTML 경로 검사 지원. |
| `server.js` | 공개 `/api/landing-orders` 어댑터 연결. 기존 사이트 라우팅 유지. |
| `sitemap.xml` | 기존 생성 방식에 따라 `https://nothingmatters.co.kr/order` 추가. |
| `small-gift/index.html` | Railway 주문 링크를 `/order` 또는 `/order/상품명` 상대경로로 변경. 필요한 정적 구조화 데이터 재생성. |
| `works/index.html` | Railway 주문 링크를 `/order` 또는 `/order/상품명` 상대경로로 변경. 필요한 정적 구조화 데이터 재생성. |
| `order/index.html` | 실제 Railway `client/public/order.html`을 이전. 기존 제목·설명·7개 카드·폰트·색상·레이아웃 유지. 로컬 이미지·주문 경로 연결, 네이버 인증, 기존 접근성·정적 스키마 생성 적용. |
| `order/{brookie,cookies,lucky,cookie-flight,airplane-butter-cookie,cookie-crew,terminal-cookie}.html` | 기존 7개 상품 주문 화면 이전. 옵션·수량·가격·날짜·시간·고객 입력·validation·견적·상담 확인 로직 유지. |
| `order/assets/{order.css,order-core.js,order-confirmation.css,order-confirmation.js,landing-quote.js,new-product-order.css,new-product-order.js}` | 원본 공통 파일 이전. 이미지 경로만 새 자산 위치에 맞게 변경. |
| `order/assets/public/**` | 원본 WebP·SVG 221개 복사. 서버 코드·환경변수·관리자 앱·서비스워커는 복사하지 않음. |
| `order/source-manifest.json` | 원본 저장소·commit·8개 HTML과 7개 UI 파일의 원본 SHA-256 기록. |
| `lib/order-api.js` | 기존 공개 주문 저장 API만 같은 출처로 전달. 요청 크기·JSON·Origin 검사, 오류·timeout 처리, 응답 캐시 금지. 자동 재전송 없음. |
| `scripts/test-order-migration.mjs` | 로컬 모의 서버로 8개 라우트·자산·SEO·API·오류·개인정보 경계 검사. |
| `scripts/test-order-confirmation.mjs` | 원본 꾸덕·럭키 주문 테스트를 이전 파일에 연결. 가격·PNG·실패·재시도·중복 방지 검사. |
| `scripts/test-order-browser.mjs` | 실제 Chrome에서 모바일·데스크톱 표시와 모의 저장·오류·validation·가격·중복 방지 검사. |
| `scripts/verify-order-deployment.mjs` | 주문을 생성하지 않는 운영 GET 검사. `--require-redirect`로 기존 URL의 301도 검사. |
| `/Users/nahmsoochan/주문/server/vite.ts` | 기존 Railway `/order` 공개 화면 전용 301을 환경변수로 제어. 기본 비활성. |
| `ORDER-MIGRATION.md` | 이 보고서와 배포 순서. |

## 최종 구조

메인 사이트는 Next.js가 아니라 정적 HTML + `server.js` Node HTTP 서버입니다. App Router / Pages Router는 해당하지 않습니다. 주문 프로젝트는 Express + Vite/React이며, 이번에 옮긴 주문 화면은 React 컴포넌트가 아닌 원본 정적 HTML과 JavaScript입니다.

```text
https://nothingmatters.co.kr/order               → 메인 서버가 주문 선택 HTML 직접 제공 (200)
https://nothingmatters.co.kr/order/상품명         → 메인 서버가 기존 상품 주문 UI 직접 제공
https://nothingmatters.co.kr/order/assets/...     → 메인 서버의 원본 이미지·CSS·JS
POST https://nothingmatters.co.kr/api/landing-orders
    → 메인 서버
    → POST https://thingmattersreserve-production.up.railway.app/api/landing-orders
    → 기존 주문 DB·알림·관리자 주문 확인
```

상품 경로는 `brookie`, `cookies`, `lucky`, `cookie-flight`, `airplane-butter-cookie`, `cookie-crew`, `terminal-cookie`입니다. 기존 `/brookie/`, `/cookie-crew/`, `/products/.../` 상품 소개 화면과 충돌하지 않습니다. 상품 선택과 주문 입력 중 Railway로 이동하지 않습니다. 접수 후 카카오톡 상담으로 연결되는 동작은 기존 주문 확정 흐름 그대로입니다.

`/order`에는 iframe·meta refresh·Railway로 보내는 redirect가 없습니다. `/order/`, `/order.html`, `/order/index.html`과 주문 화면 별칭은 메인 도메인 안의 대표 경로로 301 정리합니다.

## Railway 의존성

상품 화면에서 실제 사용하는 서버 요청은 공통 `NMOrderCore.postLandingOrder()`의 `POST /api/landing-orders`입니다. 서버는 원본 상품별 builder로 가격을 다시 계산하고 `storage.createOrder()`로 저장하며, 기존 이메일·푸시·카카오 알림·Google Sheets 연결을 사용합니다. 기존 관리자 앱은 Railway에서 그대로 운영합니다.

`server/db.ts`와 `server/storage.ts`는 Supabase SDK 대신 `DATABASE_URL`로 PostgreSQL에 연결하는 Drizzle 코드를 사용합니다. 운영 DB 제공업체가 Supabase인지 여부는 배포환경의 DB 주소를 확인하지 않아 확정하지 않았습니다. DB 스키마와 데이터는 변경하지 않았고, 실주문 생성 테스트도 하지 않았습니다.

브라우저는 메인 사이트의 같은 출처 API만 호출하므로 추가 CORS 설정이 필요하지 않습니다. 공개 저장 경로에는 관리자 인증이 필요하지 않습니다. 이 어댑터는 요청 Cookie·Authorization을 Railway에 전달하지 않고, Railway의 관리자 session cookie도 메인 사이트에 설정하지 않습니다. `/api/admin/*`, `/api/orders/*`, 관리자 개인정보 경로는 전달하지 않습니다.

## 환경변수

메인 프로젝트에 추가 가능한 변수는 다음 하나입니다. 코드에 동일 기본값이 있으므로 설정하지 않아도 됩니다.

```dotenv
ORDER_API_ORIGIN=https://thingmattersreserve-production.up.railway.app
```

기존 Railway 주문 프로젝트에 **새 페이지 배포·검증 후에만** 설정할 변수:

```dotenv
ORDER_PAGE_REDIRECT_ENABLED=1
```

그 전에는 이 변수를 설정하지 않거나 `0`으로 둡니다. `.env`의 기존 사용자 변경을 건드리지 않았습니다.

아래는 실제 주문 서버 코드에서 참조하는 변수 이름과 위치입니다. 이 값들은 기존 Railway에 유지하며 메인 프로젝트로 복사할 필요가 없습니다.

| 이름 | 실제 사용 위치 |
| --- | --- |
| `DATABASE_URL` | `server/db.ts`, `server/index.ts`: PostgreSQL 연결 및 기존 초기화 |
| `ADMIN_PASSWORD` | `server/routes.ts`: 관리자 로그인 |
| `SESSION_SECRET` | `server/index.ts`: 관리자 세션 |
| `MAILGUN_API_KEY`, `MAILGUN_DOMAIN` | `server/services/email-service.ts`: 메일 발송 |
| `GOOGLE_PRIVATE_KEY`, `GOOGLE_SERVICE_ACCOUNT_EMAIL`, `GOOGLE_SHEETS_SPREADSHEET_ID` | `server/services/google-sheets-service.ts`: 기존 Sheets 연결 |
| `GOOGLE_SHEETS_SHEET_NAME`, `GOOGLE_SHEETS_TAB_NAME` | 같은 파일: 대상 탭 이름 |
| `KAKAO_REST_API_KEY`, `KAKAO_SENDER_KEY`, `KAKAO_ADMIN_PHONE`, `KAKAO_TEMPLATE_ADMIN`, `KAKAO_TEMPLATE_CUSTOMER` | `server/services/kakao-alimtalk-service.ts`: 기존 알림톡 |
| `GMAIL_USER`, `GMAIL_APP_PASSWORD` | `server/routes.ts`: 기존 견적 경로의 설정 유무 로그 참조 |
| `NODE_ENV`, `PORT` | 기존 서버 실행 설정 |

`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`는 확인한 실제 코드에서 사용하지 않습니다. 비밀 값은 보고서·코드·클라이언트 파일에 추가하지 않았습니다.

## SEO

- `/order` canonical과 og:url: 정확히 `https://nothingmatters.co.kr/order`.
- 원본 title: `마곡 답례품·김포공항 디저트 선물 | 낫띵메터스`. 원본 description도 보존했습니다.
- `robots`: `index,follow`. 기존 `robots.txt`는 `/order`를 차단하지 않으며 `/api/`, `/dashboard/`, `/gallery-admin/` 차단을 유지합니다.
- `data/site-pages.json`과 기존 sitemap 생성기를 사용해 `/order`를 포함했습니다. 별도의 sitemap은 만들지 않았습니다.
- 기존 정적 스키마 생성기로 Organization·Bakery·WebSite·CollectionPage·7개 상품 ItemList·화면의 FAQ·BreadcrumbList를 연결했습니다.
- 주문 입력 화면은 기존 상품 소개 화면에 canonical을 연결하여 상품 소개와의 중복 색인을 줄입니다. 원본에서 실제 메인 라우트와 맞지 않던 4개 상품 canonical도 유효한 소개 경로로 연결했습니다. 입력 화면 자체를 sitemap에 중복 등록하지 않았습니다.
- 메인 홈페이지·상품·가이드·모바일 CTA의 공개 Railway 주문 링크는 `/order` 또는 `/order/상품명`으로 변경했습니다. 기존 주문 클릭 분석 이벤트도 유지합니다.

## 기존 Railway URL

조사 시점의 Railway `/order`는 200이며 canonical은 이미 메인 `/order`를 가리키고 있었습니다. 메인 운영 `/order`는 아직 404였으므로 요청 원칙에 따라 기존 화면은 유지했습니다.

301 코드는 추가하고 로컬에서 검증했지만 **운영 301은 활성화하지 않았습니다**. 새 메인 페이지를 먼저 배포·검증하고 주문 서비스에서 `ORDER_PAGE_REDIRECT_ENABLED=1`을 적용하면 기존 `/order`만 301로 바뀝니다. `/order.html`과 후행 슬래시 별칭도 같은 처리이며 query string을 보존합니다. 다른 상품 화면과 모든 `/api/*`는 그대로입니다.

따라서 두 공개 주문 허브가 동시에 200을 반환하는 상태를 최종 해소하는 마지막 단계는 이 변수 활성화입니다.

## 빌드 및 검증

- 메인 `npm run site:build`, `npm run site:check`: 통과. 33개 sitemap URL, 정적 SEO·자산·접근성·RSS 검사.
- `npm run order:test`: 통과. 8개 HTTP 라우트, 실제 원본 자산, JSON API 전달, 오류 응답·요청 제한·관리자 session 분리, 꾸덕·럭키 가격/PNG/저장/중복 방지.
- `npm run server:test`: 기존 HTTP·김포공항 서버 검사 통과.
- `npm run order:browser:test`: 320·390·1280px에서 8개 화면, 모든 렌더링 이미지, 가로 넘침 없음. 실제 JS의 수량·가격·쿠키크루 최소 12개·필수 입력·날짜/시간·견적·모의 저장 실패/재시도/중복 방지 검사.
- 주문 프로젝트의 TypeScript 검사 통과. 수정된 서버가 포함된 임시 복사본에서 `npm run build`와 `tsc --incremental false` 통과. 기존 Vite의 큰 번들·Browserslist 경고는 있으나 빌드는 성공.
- 원본 주문 서버의 저장소·알림을 모의 객체로 바꾸는 테스트에서 정상 9건/유효성 오류 10건 통과. 실제 DB·Sheets·메일·카카오·푸시에 쓰지 않음.
- Railway 301 함수 검사: 기본 200 유지, 활성화 시 `/order`만 301, query 보존, 다른 UI/API 유지 통과.
- 운영 Railway API의 읽기 전용 OPTIONS 응답 204 확인. 실제 운영 주문 저장 및 운영 DB 기록은 요청에 따라 검증하지 않음.
- 메인 프로젝트는 TypeScript·별도 lint 스크립트가 없습니다. 변경 JS는 Node 문법 검사와 실제 브라우저 실행으로 확인. 옮긴 화면은 정적 HTML이므로 React hydration 대상이 아닙니다.

## 배포 후 내가 해야 할 일

1. 현재 메인 프로젝트의 변경을 `flowerpanty/Landingpage`에 반영하고, **`nothingmatters.co.kr`을 서비스하는 기존 Railway 서비스**를 먼저 배포합니다. 시작 명령은 기존 `npm start` 그대로입니다. 정적 파일만 배포하면 주문 저장 어댑터가 작동하지 않으므로 기존 Node 서버를 실행해야 합니다.
2. 메인 Railway 서비스 → **Variables → New Variable**에서 선택적으로 `ORDER_API_ORIGIN`과 위 값을 추가합니다. 변수 변경은 staged changes에서 **Details → Deploy**를 적용해야 활성화됩니다. [Railway 변수 안내](https://docs.railway.com/variables), [변경 배포 안내](https://docs.railway.com/deployments/staged-changes).
3. 메인 배포 후 프로젝트 폴더에서 `npm run order:verify-live`를 실행합니다. 이는 GET만 사용하며 `/order`의 200·정확한 canonical·7개 UI·이미지·sitemap·robots·API 어댑터 존재를 검사합니다. 모바일 입력 확인은 주문 접수 버튼을 누르기 전까지 할 수 있습니다. 실제 주문 테스트는 수행하지 않았습니다.
4. 수정한 `/Users/nahmsoochan/주문/server/vite.ts`를 `flowerpanty/ThingMattersReserve`에 반영해 주문 서비스를 배포합니다. 변수 미설정 시 기존 `/order`는 계속 유지됩니다.
5. 3단계가 성공한 후 **기존 주문 Railway 서비스 → Variables → New Variable**에서 `ORDER_PAGE_REDIRECT_ENABLED` 값을 `1`로 추가하고 **Deploy**합니다.
6. `npm run order:verify-live -- --require-redirect`를 실행하여 기존 Railway `/order`가 정확한 새 URL로 301인지 확인합니다. 이 검사는 주문을 만들지 않습니다.

DNS·Vercel·Supabase 메뉴에서 별도로 바꿀 값은 이번 구조에 없습니다. 기존 메인 도메인과 기존 주문 백엔드를 그대로 사용합니다.

## Search Console 등록 후 작업

메인 배포와 위 검사가 성공하면 색인 요청을 할 수 있는 코드 상태입니다. 현재는 미배포 상태이므로 운영 URL 검증 완료로 보아서는 안 됩니다.

Google Search Console에서 `nothingmatters.co.kr` 속성을 선택 → 상단 URL 검사에 `https://nothingmatters.co.kr/order` 입력 → **실제 URL 테스트** → 200·색인 허용·사용자 선언 canonical 확인 → **색인 생성 요청**. **Sitemaps** 메뉴에 기존 `https://nothingmatters.co.kr/sitemap.xml`을 제출 또는 확인합니다. [Google URL 검사 안내](https://support.google.com/webmasters/answer/9012289), [사이트맵 안내](https://support.google.com/webmasters/answer/10351509).

## 네이버 Search Advisor 등록 후 작업

네이버 서치어드바이저 → **웹마스터 도구** → 등록된 `https://nothingmatters.co.kr` 사이트 → **검증 → 웹페이지 최적화**로 `/order` 접근·색인 설정을 확인한 뒤 **요청 → 웹페이지 수집**에서 `/order`를 요청합니다. **요청 → 사이트맵 제출**에는 기존 `https://nothingmatters.co.kr/sitemap.xml`을 사용합니다. 원본 사이트와 같은 인증 meta를 주문 허브에도 넣었습니다. [네이버 수집 안내](https://searchadvisor.naver.com/guide/request-crawl), [사이트맵 안내](https://searchadvisor.naver.com/guide/request-feed).
