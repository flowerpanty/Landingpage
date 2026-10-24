# NOTHINGMATTERS 공식 공지사항 구현 보고

> 초기 정적 공지 버전의 기록입니다. 브랜드 UI 통일·예약 픽업 고정·관리자 및 영구 저장소의 최신 상태는 `NOTICE_ADMIN_REPORT.md`를 확인하세요.

작성일: 2026-10-24. 로컬 구현·검증 완료. 커밋·푸시·운영 배포는 실행하지 않았습니다.

## 생성 URL

| 경로 | 내용 |
| --- | --- |
| `/notice/` | 분류·날짜·요약이 있는 전체 공지 목록 |
| `/notice/christmas-2026/` | 2026 크리스마스 쿠키 4종 상품 안내 |
| `/notice/pickup-guide/` | 김포공항 인근 예약 픽업 안내 |
| `/notice/shipping-guide/` | 쿠키 택배 주문 안내 |
| `/notice/feed.xml` | 공지 전용 RSS |

운영 기준 주소는 `https://nothingmatters.co.kr`이며 canonical·OG·사이트맵·RSS는 이 도메인을 사용합니다. 배포 전 미리보기: [공지 목록](http://127.0.0.1:4178/notice/).

## 구현 및 콘텐츠

- `data/notices.json`에서 제목·슬러그·본문 블록·분류·게시일·수정일·공개 상태·상단 고정을 관리합니다. 초기 3건의 작성·게시 기준일은 2026-10-24입니다. 나중에 최초 공개한다면 실제 공개 일정에 맞춰 날짜를 확인해야 합니다.
- 정적 HTML 생성으로 자바스크립트 없이 목록과 본문을 읽고 이동할 수 있습니다. 목록은 주요 공지 우선 후 최신 게시일 순, 홈페이지 최근 3건과 RSS는 게시일 순입니다. 동일 날짜는 데이터 순서를 유지합니다.
- 공개 글 추가·수정·비공개 전환 시 목록, 상세 페이지, 홈페이지 최근 3건, 공지 RSS, 레지스트리, llms 출처를 함께 갱신합니다. 기존 사이트 빌드가 레지스트리를 사용해 사이트맵·구조화 데이터까지 생성합니다. 비공개로 내린 생성 상세 HTML은 제거합니다.
- 크림색·그린·절제된 레드로 기존 브랜드와 연결했습니다. 모바일 목록·홈 소식은 1열, PC 홈 소식은 3열입니다. 새 UI용 JS·외부 폰트·이미지·애니메이션을 추가하지 않았습니다.
- 크리스마스 상품은 기존 카탈로그에서 이름·구성·가격을 읽습니다. 곰돌이 브루키 8,500원, 트리 브루키 9,000원, 브루키 2종 세트 17,000원, 산타꾸러미 4종 23,000원을 표시합니다. 온라인 주문 신청은 준비 중이며 `/christmas/`와 카카오톡 상담으로 연결합니다.
- 픽업은 서울특별시 강서구 송정로 25 1층, 사전 상담으로 날짜·시간 확정, 차량 퀵은 가능 여부 별도 확인으로 안내합니다.
- 택배는 COOKIE FLIGHT·TERMINAL 카라멜 샌드쿠키·행운쿠키 3종만 안내합니다. 기존 상품 HTML의 정확한 스마트스토어 링크를 가져오며, 링크가 모호하거나 검증 대상이 아닌 상품이면 생성을 실패시킵니다. 배송료·도착일을 확정하지 않습니다.
- 목록의 CollectionPage·ItemList, 상세 글의 Article·WebPage, BreadcrumbList, 게시·수정일, title·description·canonical·OG를 동기화했습니다. 공지 전용 RSS를 추가하고 기존 `/feed.xml` 가이드 9건은 유지했습니다.
- 홈페이지 상품·주문 CTA 아래에 소식을 배치하고, 홈페이지 푸터와 크리스마스·픽업·택배 대상 상품 페이지에 공지 링크를 넣었습니다. GA4·네이버 인증·기존 블로그·주문 흐름을 보존했습니다.

## 검증 결과

| 실행 | 결과 |
| --- | --- |
| `npm run site:build` | PASS, 반복 빌드 시 공지 생성물 변경 0건 |
| `npm run site:check` | PASS, 아래 SEO·성능·접근성·기존 랜딩 검사 포함 |
| `npm run public-seo:test` | PASS, 사이트맵 44 URL·발견된 공개 HTML 48개 |
| `npm run a11y:check` | PASS, 검사 대상 50페이지 |
| `npm run public-perf:test` | PASS, 검사 대상 50페이지 |
| `npm run notices:test` | PASS, 가격·콘텐츠·메타데이터·스키마·RSS·사이트맵 일치, 신규 글·정렬·상단 고정·비공개·삭제·빈 목록·날짜 오류·HTML 이스케이프 |
| `npm run notices:browser:test` | PASS, 4경로 × 320/375/768/1024/1440px, 홈 1/3열, 키보드·건너뛰기·포커스·터치·상세/목록 이동, 관련 페이지 링크, JS 비활성 본문, XML 파싱·HTTP |
| `npm run order:test` | PASS, 기존 상품·확인·견적·크리스마스 주문 로컬 모의 검사 |
| `npm run christmas:browser:test` | PASS, PC/모바일 3 STEP, 수량·합계·입력·뒤로 가기·갤러리·중복·실패·개인정보 검사 |
| `npm run order:browser:test` | PASS, 9페이지 × 320/390/1280px 및 기존 주문 저장·오류·재시도·중복 방지 |
| `npm run journal:test` | PASS, WordPress 블로그 연동 회귀 검사 |
| `npm run server:test` | PASS, 기존 서버 HTTP·항공편 서비스 검사 |
| `git diff --check` | PASS |

브라우저 증거는 `output/playwright/notices/`에 13개 화면과 `browser-results.json`으로 보관했습니다. 공지 페이지의 가로 넘침·로컬 리소스 실패·JS 예외·로컬 콘솔 오류가 없었습니다. 실제 렌더링한 모바일·PC 목록과 본문, 홈페이지 소식 화면을 직접 확인했습니다. 이 경로는 기존 정책에 따라 Git에서 제외됩니다.

주문 검사는 loopback 서버·로컬 mock을 사용했습니다. 운영 주문 DB에 주문을 생성하지 않았고 운영 접수 성공을 검증했다고 표시하지 않았습니다.

기존 전체 빌드가 요구하는 생성물 동기화도 반영했습니다. 홈페이지 기념일 카드 설명과 가이드 RSS 제목을 기존 원본 데이터에 맞췄고, 기존 접근성 빌드가 생성한 4개 페이지의 블로그 메뉴를 유지했습니다. 기존 기업 답례품 페이지에 이미 있던 `business-checklist`와 FAQ 7건에 맞춰 오래된 테스트의 기대값을 수정했습니다. 상품 가격·주문 계산·백엔드는 변경하지 않았습니다.

## 변경 파일 전체

신규 시스템·생성물:

- `data/notices.json`
- `lib/notices.mjs`
- `scripts/build-notices.mjs`
- `assets/notices.css`
- `notice/index.html`
- `notice/christmas-2026/index.html`
- `notice/pickup-guide/index.html`
- `notice/shipping-guide/index.html`
- `notice/feed.xml`
- `scripts/test-notices.mjs`
- `scripts/test-notices-browser.mjs`

기존 빌드·SEO·연결·문서:

- `package.json`
- `scripts/generate-jsonld.mjs`
- `scripts/test-public-seo.mjs`
- `scripts/test-occasion-landings.mjs`
- `data/site-pages.json`
- `data/README.md`
- `index.html`
- `christmas/index.html`
- `pickup/index.html`
- `products/cookie-flight/index.html`
- `products/terminal-sand-cookie/index.html`
- `out/fortune/index.html`
- `llms.txt`
- `sitemap.xml`
- `feed.xml`
- `bulk/index.html`
- `corporate-gift/index.html`
- `farewell-favor/index.html`
- `wedding-favor/index.html`
- `NOTICE_SYSTEM_REPORT.md`

## 운영 반영 전 상태

요청한 공지 기능에서 남은 구현 항목은 없습니다. 공지 추가는 JSON 편집 후 `npm run site:build`, `npm run site:check`로 처리합니다. 별도 관리자나 신규 DB는 만들지 않았습니다.

운영 배포, 검색 도구의 수집 요청, 실제 검색엔진 수집·노출 여부는 검증하지 않았습니다. 수집 가능한 정적 구조를 구현했으며 노출이나 검색 결과 카드 생성은 보장하지 않습니다. 스마트스토어 실제 결제·배송, 카카오톡 상담 전송은 실행하지 않았습니다. 크리스마스 운영 주문 API 활성화는 이번 공지 기능의 범위에 포함하지 않았으며 기존 준비 중 상태를 유지합니다.
