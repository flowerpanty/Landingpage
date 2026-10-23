# 크리스마스 2026 판매 페이지 구현 보고

작성일: 2026-10-21 (Asia/Seoul)

> 이 문서는 초기 구현 기록입니다. 현재 PC·모바일 공통 3단계 UX와 최신 검증 결과는 [FINAL UX REVISION](CHRISTMAS-2026-UX-REVISION.md)을 확인해 주세요.

**상태: 상품 선택·합계·주문 정보 검토·카카오톡 상담 동선 구현. Railway의 크리스마스 저장 처리가 없어 온라인 주문 신청은 비활성화. 배포하지 않음.**

## 구현한 기능

- 짧은 히어로 → 실물 상품 4종 → 수량과 상품 합계 → 수령/주문자 정보 → 검토 → 단체주문 → FAQ 순으로 개편.
- 320px에서는 사진과 정보를 나란히 배치한 1열, 375px에서는 2열, 큰 화면에서는 최대 4열. 수량 입력 및 +/− 버튼은 44px 이상.
- 곰돌이 8,500원, 트리 9,000원, 브루키 2종 세트 17,000원, 산타꾸러미 4종 23,000원.
- 단품 하나씩은 17,500원, 세트 SKU 하나는 17,000원. 500원 차이는 카탈로그에서 계산. 세트를 단품으로 펼치거나 단품을 세트로 자동 전환하지 않음.
- 수량 0, 음수, 소수, 빈 값과 계산 가능한 정수 범위를 넘는 수량을 처리. 유효한 큰 합계도 화면이 넘치지 않도록 처리.
- 예약 픽업 기본 선택. 희망 날짜·시간, 이름, 휴대전화, 요청사항 입력 및 누락/형식 검증. 차량 퀵은 가능 여부와 비용을 상담해야 한다고 안내.
- 검토 이후 상품/주문 정보가 바뀌면 이전 검토를 무효화. 사용자 입력은 `textContent`로 출력.
- 하단 합계/CTA, safe-area 반영, 입력 중 하단 바 숨김, 키보드 포커스 이동, skip link와 reduced-motion 지원.
- 상품 구성 복사 및 기존 공식 카카오톡 상담 링크 제공. 복사에는 개인정보를 포함하지 않으며, 클립보드 접근이 실패하면 선택 가능한 텍스트로 제공.
- 구형 HTML 백업과 사용하지 않는 눈/스크롤/커서 장식 파일 제거. Git HEAD에서 복구 가능.

## 상품 데이터와 사진

단일 원본은 `data/christmas-products.json`이다. `scripts/build-christmas.mjs`가 보이는 상품 카드, 가격, 세트 가격 차이, 런타임 카탈로그, 메타 설명, 상품 목록 FAQ, llms 안내를 생성한다. 서버 계산과 JSON-LD도 같은 원본을 읽는다. `npm run christmas:check`가 생성 결과의 불일치를 검사한다.

ZIP은 직접 접근 가능했고 실행 스크립트나 예전 판매 정책은 실행/적용하지 않았다. 사진은 직접 확인한 뒤 다음처럼 적용했다.

| 판매 상품 | ZIP 원본 | 적용 WebP |
|---|---|---|
| 곰돌이 브루키 | images/brookie_bear_main.jpg | images/christmas/bear-brookie.webp |
| 트리 브루키 | images/brookie_tree_main.jpg | images/christmas/tree-brookie.webp |
| 브루키 2종 세트 | images/brookie_set_1.jpg | images/christmas/brookie-set.webp |
| 산타꾸러미 4종 | images/santa_package_main.jpg | images/christmas/santa-bundle.webp |

원본 비율을 유지하고 잘라내지 않았다. 사진 4장 합계 약 523KiB. 모두 원본 크기 기반 width/height, 구체적인 alt와 async decoding을 사용하며 첫 사진만 eager/high priority, 나머지는 lazy loading이다. 곰돌이 사진은 오른쪽 상품이 대상이고, 트리 사진은 2개를 함께 촬영한 사진임을 캡션으로 설명한다. 생성/스톡 이미지는 사용하지 않았다.

## 주문 API: 구현과 남은 의존성

기존 공식 카카오톡 상담 링크 `https://pf.kakao.com/_QdCaK/chat`는 2026-10-21 읽기 전용 HEAD 요청에서 HTTP 200을 확인했다. 메시지는 보내지 않았다.

확인한 기존 경로:

`POST /api/landing-orders` → `lib/order-api.js` → Railway `/api/landing-orders` → 기존 주문 DB·알림·관리자.

현재 랜딩 저장소에는 Railway의 상품 builder/저장 코드가 없다. 별도 `/Users/nahmsoochan/주문/server/routes.ts`도 읽기 전용으로 확인했으며 크리스마스 source/builder가 없었다. 해당 별도 저장소와 그 기존 변경 사항은 수정하지 않았다.

이번 구현:

- `GET /api/christmas-order-status`는 `enabled:false`와 카탈로그 버전을 반환하며 no-store이다.
- 프런트는 상태 응답이 없거나 실패해도 신청을 활성화하지 않는다.
- 서버 어댑터도 `source:christmas`를 별도로 처리한다. 입력을 검증하고 SKU/수량으로 금액을 다시 계산한다. 클라이언트가 넣은 price/totalPrice는 계산에 사용하지 않는다.
- 현재 유효한 크리스마스 요청도 503 `CHRISTMAS_ORDERS_UNAVAILABLE`로 종료한다. Railway에 전달하지 않으며, 프런트 버튼을 강제로 조작해도 저장되지 않는다.
- 기존 상품/이메일 견적 요청의 전달 방식은 유지한다.
- 준비한 클라이언트 접수 경로는 실제로 저장됐다는 `success:true`, 주문 ID, 정확한 SKU별 수량/단가, 전체 합계가 모두 일치해야 접수 상태를 표시한다. 이 경로는 현재 운영 상태에서 활성화되지 않는다.
- 제출 중 입력/수량 변경 및 재제출을 차단한다. 명백한 입력 거절은 같은 idempotency key로 재시도할 수 있지만 5xx/통신 단절/응답 불일치는 결과 불명확으로 잠그고 카카오톡에서 접수 여부 확인을 안내한다.

**미완료:** 실제 크리스마스 주문 저장, DB 기준의 영속적 중복 방지, 저장된 금액 확인 및 기존 알림/관리자에서 4종 처리의 운영 검증.

활성화 전에 Railway에 이 카탈로그의 네 독립 SKU를 사용하는 builder, 입력 검증, 서버 가격 계산, 기존 `storage.createOrder` 및 알림 연결, DB 기반의 원자적 idempotency 처리가 필요하다. 저장된 항목/금액을 반환하고 어댑터가 이를 검증하는 경로를 완성한 뒤 상태 API와 서버 차단을 함께 변경해야 한다. 프런트 상태값만 바꾸는 것으로 활성화하면 안 된다.

수령 가능 일정·재고·최소 주문량·퀵 비용·마감일은 임의로 설정하지 않았다. 희망 날짜와 시간은 예약 가능 슬롯이 아니다. 화면 금액은 상품 금액이며 접수는 결제 완료나 제작 확정이 아니다.

## SEO 및 개인정보

- `/christmas/` URL, canonical, Naver 인증, 기존 GA4 ID 유지. H1 하나.
- 상품명/가격을 JavaScript 실행 전 HTML에서 제공. ItemList 내 4개 Product/Offer는 확정된 가격과 통화만 사용하고 재고/배송/결제 조건은 만들지 않음.
- CollectionPage, Service, Breadcrumb, 실제 7개 FAQ와 JSON-LD 동기화.
- 사이트 레지스트리와 sitemap의 크리스마스 lastmod만 2026-10-21로 변경. llms 안내를 새 4종과 현재 접수 상태로 교체.
- 폼은 POST이며 JS가 제출을 처리한다. 이름·연락처·날짜·요청사항을 URL, 브라우저 저장소, 분석 이벤트에 넣지 않는다. GA4의 page_location에서 쿼리 문자열을 제외하고 referrer는 origin으로 제한한다.
- 카카오톡 URL은 고정 경로이며 개인정보나 상품 구성을 쿼리로 자동 전송하지 않는다.

## 검증 결과

| 검사 | 결과 |
|---|---|
| `node scripts/test-christmas-landing.mjs` | 통과 |
| `npm run christmas:check` | 통과 |
| `node scripts/test-christmas-order.mjs` | 통과: SKU 재계산, 단품/세트 분리, 입력 거절, 중복 요청도 upstream 전달 없음 |
| `npm run christmas:browser:test` | 통과: 320/375/768/1024/1440px, 사진, 터치 크기, 키보드/포커스, 합계/검토/개인정보, 로컬 모의 응답 |
| `npm run order:test` | 통과: 기존 주문 검증 + 크리스마스 검증 |
| `npm run order:browser:test` | 통과: 기존 9개 주문 페이지, 320/390/1280px, A/B 타입, 저장/중복/오류 |
| `npm run schema:check`, `npm run public-seo:test` | 통과: 40개 sitemap URL |
| flight-attendant / anniversary 개별 검사 | 통과 |
| `npm run public-perf:test`, `npm run a11y:check` | 통과: 46개 HTML |
| `git diff --check` | 통과 |
| 디자인 스킬 evidence checker | 통과, 실제 렌더 별도 확인 |
| `npm run site:check` | 실패: 기존 `index.html product blocks are out of date`에서 중단 |

전체 검사와 별도 실행에서 확인된 기존 불일치는 모두 **수정 전 Git HEAD를 임시 디렉터리에 추출해서 재현**했다.

1. `products:check`: 홈의 기념일 상품 설명이 기존 생성기 결과와 다름.
2. `test-occasion-landings.mjs`: 기존 기업 페이지의 `business-checklist` 섹션이 기대 순서에 빠져 있음.
3. `feed:check`: 기존 가이드 메타데이터와 feed.xml이 동기화되지 않음.

다른 랜딩페이지 변경을 피하기 위해 이 세 항목은 수정하지 않았다. 생성기를 확인하며 발생한 무관한 홈 설명 및 sitemap 순서 변경도 되돌려 크리스마스 변경만 남겼다.

모든 저장 성공 테스트는 로컬 모의 응답이다. 크리스마스 브라우저 테스트에서는 외부 요청을 차단했고, 실제 운영 주문이나 테스트 주문을 운영 DB에 생성하지 않았다. 모의 성공을 Railway 연동 완료로 간주하지 않는다.

## 변경 파일 전체

- `christmas/index.html`: 새 구매/상담 화면 및 SEO.
- `christmas/christmas-order.js`: 수량·합계·입력·검토·상담 복사·접수 상태 처리.
- `assets/christmas.css`: 반응형 디자인과 접근성/하단 바.
- `data/christmas-products.json`: 4종 단일 상품 원본 및 사진 매핑.
- `images/christmas/bear-brookie.webp`
- `images/christmas/tree-brookie.webp`
- `images/christmas/brookie-set.webp`
- `images/christmas/santa-bundle.webp`
- `lib/christmas-order.js`: 서버 검증·SKU별 재계산·비활성 상태.
- `lib/order-api.js`: 상태 API 및 크리스마스 요청 차단.
- `server.js`: 상태 API 라우팅.
- `data/site-pages.json`: 크리스마스 카탈로그 참조 및 갱신일.
- `sitemap.xml`: 크리스마스 갱신일.
- `llms.txt`: 확정 상품·가격·상담 및 접수 상태.
- `scripts/build-christmas.mjs`: HTML/메타/런타임/FAQ/llms 생성 및 drift 검사.
- `scripts/generate-jsonld.mjs`: 같은 카탈로그로 4개 상품 스키마 생성.
- `scripts/test-christmas-landing.mjs`: 새 4종과 SEO/사진/링크 검증.
- `scripts/test-christmas-order.mjs`: 서버 입력·가격·비활성 API 검증.
- `scripts/test-christmas-browser.mjs`: 새 화면/주문 상태의 브라우저 검사.
- `package.json`: 크리스마스 빌드/체크/브라우저 명령 및 기존 파이프라인 연결.
- `CHRISTMAS-2026-IMPLEMENTATION.md`: 이 보고서.
- 삭제: `christmas/index.html.backup`, `christmas/christmas-cute.css`, `christmas/christmas-cute.js`.

## 검토 자료와 실행

- 로컬 미리보기: http://127.0.0.1:4178/christmas/ (개발 서버가 실행 중일 때).
- 화면과 검사 증거: `output/playwright/christmas/` (Git ignore 대상 로컬 산출물).
- `320/375/768/1024/1440-viewport.png`: 첫 화면.
- `320x900.png` 등: 전체 페이지.
- `mock-success.png`: **로컬 모의 저장** 성공 후의 상태.
- `evidence.json`: 반응형·상태·접근성 관찰.
- `baseline-checks.json`: 수정 전 HEAD에서도 발생하는 기존 실패 재현 로그.

상품 변경 후에는 `npm run christmas:build`와 `npm run schema:build`를 실행하고 관련 검사를 수행한다. 전체 `site:build`는 기존 다른 생성기도 함께 실행하므로 별도 페이지의 오래된 생성 결과까지 갱신할 수 있다.

**배포/커밋/푸시 없음. 운영 주문 DB 쓰기 없음.** 현재 완료 범위는 고객이 실물 사진/가격을 확인하고 4종 수량과 정확한 합계를 검토한 뒤 카카오톡 주문 상담으로 이어가는 흐름까지다.
