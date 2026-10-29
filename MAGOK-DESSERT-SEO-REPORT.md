# 마곡 디저트·답례품 랜딩페이지 개선

작업일: 2026-10-30 · 기준: main `9f95e09` · 대상: `/magok-cookie/`

## 반영 내용

- Title: **마곡 디저트·답례품 | 회사 간식·수제쿠키 선물 - 낫띵메터스**
- H1: **마곡 디저트 선물, 쿠키 답례품을 골라보세요**
- description, OG/Twitter 설명, breadcrumb, Service 및 FAQ 생성 결과를 새 내용과 맞췄다. 기존 canonical·인증·분석 스크립트를 보존했다.
- 상단에 실제 작업실 주소, 예약 제작·픽업, 상담에 필요한 날짜·수량·예산·수령 주소를 정적 HTML로 안내한다.
- 기존 6종 상품과 실물 사진·상세 링크를 유지하고 상품을 동적 제작사진 아카이브보다 먼저 배치했다.
- 반복되던 회사 선물 안내 중 한 구역을 개별 포장 / 회의·팀 간식 / 문구 답례품 선택 안내로 바꿨다. 회사 선물 구역은 팀·직원, 세미나, 승진·퇴사, 외부 방문객 목적을 다룬다.
- 단체주문 구역에 예산·수령 주소 확인과 직접 카카오톡 상담 동선을 추가했다. 상담 URL에 고객 정보를 넣지 않는다.
- FAQ는 기존 8개를 상품·위치·회사 간식·퀵·포장·소량·제작 일정·보관 질문으로 재구성했다. 화면 문장과 JSON-LD를 브라우저에서도 대조했다.
- 공항동 예약 제작·예약 픽업, 예약 없는 현장 구매 불가, 차량 퀵의 가능 여부·비용 별도 확인을 명시한다.
- 모바일 메뉴·상품 링크·FAQ 링크를 44px 이상 터치 영역으로 정리하고, 고정 메뉴 아래에서 본문 앵커를 확인할 수 있도록 했다. 대표 이미지 태그의 중복 속성도 제거했다.

## 검색 의도와 페이지 역할

| 그룹 | 실제 본문에 반영한 주제 |
| --- | --- |
| 디저트·선물 | 마곡 디저트 선물, 마곡 쿠키 선물, 수제쿠키와 포장 선택 |
| 답례품 | 마곡 디저트 답례품, 회사 감사, 승진·퇴사, 개별 선물 |
| 회사·단체 | 마곡 회사 간식, 마곡 사무실 간식, 마곡 세미나 간식, 마곡 단체 간식, 마곡 기업행사 답례품 |
| 수령·상담 | 공항동 작업실 예약 픽업, 마곡 수령 주소·일정·수량에 따른 차량 퀵 상담 |

단일 `/magok-cookie/`를 지역 상품 선택·상담 허브로 유지했다. `/corporate-gift/`는 기업 답례품 견적, `/guides/corporate-event-cookie/`는 행사 준비, `/pickup/`은 실제 픽업 정책을 담당한다. 별도 지역 랜딩페이지나 동일한 설명의 복제 페이지를 만들지 않았다.

마곡 내 매장, 방문 즉시 구매, 당일·무료 배송, 임의의 단체 할인·주문 마감일·납품 사례를 추가하지 않았다. 상품 가격·카탈로그도 변경하지 않았다.

## 사실 확인과 측정의 범위

상품 구성과 위치는 저장소의 기존 상품·사업체 정보 및 [공식 마곡 페이지](https://nothingmatters.co.kr/magok-cookie/), [수제꾸덕쿠키 안내](https://nothingmatters.co.kr/products/handmade-cookie/), [예약 픽업 공지](https://nothingmatters.co.kr/notice/pickup-guide/)를 기준으로 사용했다.

공개 검색결과에서 ‘마곡 디저트·쿠키·답례품·단체주문’ 표현을 참고했다. 검색량·자동완성 순위·키워드별 경쟁도는 검증하지 않았다.

운영 `/api/dashboard/summary?range=90d`는 200으로 응답했다. 조회 범위는 2026-08-02~2026-10-30이며, 사이트 전체 요약 응답에서 `/magok-cookie/` 페이지 행이나 마곡 검색어 행은 확인되지 않았다. 이 API의 검색어는 사이트 전체 상위 일부 자료이므로 이를 마곡 전용 성과, 수요 없음, 미색인 또는 순위 하락의 근거로 사용하지 않았다. 이번 개선은 실제 제공 상품과 구매 의도의 적합성을 기준으로 진행했다.

## 내부 링크와 생성물

- 홈페이지의 기존 지역 링크를 ‘마곡 디저트·답례품 안내’로 정리했다.
- 기업선물 페이지의 차량 퀵 안내에 ‘마곡 디저트·단체 간식 안내’ 링크를 하나 추가했다.
- 마곡 회사 선물 카드에 남아 있던 `../index.html#cookies`를 현재 페이지의 유효한 `#cookies`로 수정했다.
- 마곡 페이지·홈페이지·기업선물 페이지의 실제 수정일을 2026-10-30으로 기록하고 사이트맵·JSON-LD에 반영했다.
- llms.txt는 기존 지역 소개와 페이지 요약을 동기화했다. 신규 블록이나 키워드 목록을 추가하지 않았다.

## 검증 결과

| 검사 | 결과 |
| --- | --- |
| npm run site:build | PASS, 재생성 후 메타·본문·FAQ·스키마 일치 |
| npm run magok:test | PASS, 검색 의도·상품·사진·위치·링크·수정일·FAQ |
| npm run magok:browser:test | PASS, 320/390/768/1280/1440px |
| npm run site:check | PASS, SEO·스키마·접근성·정적 성능·기존 랜딩·RSS 포함 |
| npm run public-seo:test | PASS, 사이트맵 45 URL·공개 HTML 49개 |
| npm run order:test | PASS, 기존 상품·크리스마스 주문 계산·오류·중복 처리, 모의 테스트 |
| git diff --check | PASS |

마곡 브라우저 검증에서는 실제 브랜드 폰트, 6개 상품 이미지와 상세 이동, 실제 제작 아카이브 3개, JS 비활성 상태, 키보드·터치, 8개 FAQ·JSON-LD 문장 일치, 고정 메뉴·하단 버튼 가림, 홈페이지·기업선물의 진입 링크, 카카오톡 새 탭 모의 이동 3건을 확인했다. 로컬 페이지 오류·누락 리소스·쓰기 요청은 0건이다. 실제 주문이나 상담 메시지는 생성하지 않았다.

추가 실행한 기존 종합 브라우저 검사에는 다음 실패가 남아 있다.

- `node scripts/test-public-browser.mjs`: `/wedding-favor/`의 360px 메뉴 스타일이 홈페이지와 같아야 한다는 검사에서 실패했다. HEAD와 작업본을 각각 렌더링한 결과, 둘 다 홈페이지는 10px/gap 10px, 웨딩 페이지는 12px/gap 14px로 동일하게 재현됐다.
- `node scripts/test-public-browser.mjs --occasion-conversion-only`: 헤더 링크 5개를 기대하지만 기존 BLOG 링크까지 6개가 있는 상태에서 실패했다. HEAD의 기업선물·웨딩·퇴사 페이지에도 BLOG를 포함한 6개 링크가 있다.

이 두 기존 공통 메뉴 검사 불일치는 마곡 전용 검사 통과와 구분한다. 이번 작업에서 공통 메뉴 CSS나 BLOG 링크를 변경하지 않았다. 근거는 `output/playwright/magok-upgrade/shared-browser-baseline.json`, `shared-browser-header-baseline.json`에 저장했다.

## 변경 파일

- magok-cookie/index.html
- assets/magok-cookie.css
- index.html
- corporate-gift/index.html
- data/site-pages.json
- scripts/generate-jsonld.mjs
- sitemap.xml
- llms.txt
- package.json
- scripts/test-magok-landing.mjs
- scripts/test-magok-browser.mjs
- scripts/test-public-seo.mjs
- scripts/test-public-browser.mjs
- MAGOK-DESSERT-SEO-REPORT.md

브라우저 결과와 화면: `output/playwright/magok-upgrade/` (Git 제외).

커밋·푸시·운영 배포는 하지 않았다. 실제 검색 노출·순위·AI 인용의 변화는 배포 후 별도 성과 자료로 확인해야 한다.
