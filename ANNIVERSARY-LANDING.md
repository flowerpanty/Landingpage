# 기념일 브루키 랜딩페이지 적용 결과

작업일: 2026-10-13 (한국 시간). 프로젝트에 적용하고 검증을 완료했습니다. 주문 서버와 랜딩페이지 변경을 함께 커밋·푸시하며, 운영 반영은 두 프로젝트 배포 후 확인할 수 있습니다.

검토 주소: [http://127.0.0.1:4319/anniversary-cookie/](http://127.0.0.1:4319/anniversary-cookie/)

## 적용 내용

- 첨부 패키지의 HTML·CSS·JavaScript를 `/anniversary-cookie/`에 통합했습니다. `CODEX_PROMPT.md`의 가격·구성·이미지·상담 조건을 반영했습니다.
- 메인 카피는 “축하할 일이 있다면, 쿠키로 말해요.”입니다. 블루 `#4169E1`, 오렌지 `#FF6A00`와 기존 서울알림체를 사용합니다. 제목은 Heavy 900, 본문은 Medium 500입니다.
- 20,000원에 브루키 2개, 기본 문구 커스텀, 상자 하단 문구 변경, 토퍼가 포함됩니다. 디자인별 글자 수와 동시 적용 조합은 예약 상담에서 확인하도록 안내합니다.
- `#set` 다음에 커스텀 안내 3장을 배치했습니다. 원본 WebP 파일을 그대로 사용하며 PC는 3장을 한 줄에 표시하고, 모바일은 첫 줄 2장·둘째 줄 큰 사진 1장으로 배치합니다. 사진 아래 제목·설명은 화면에서 숨깁니다. 각 이미지는 원본 크기로 열 수 있습니다.
- 기존 메인 상품 카드와 같은 구성으로 새 상품 카드 1개를 추가했습니다. 기존 상품·링크·주문 버튼은 유지했습니다.
- canonical, 검색 설명, Open Graph, Twitter 메타와 사이트맵을 반영했습니다. 기존 생성기를 사용해 ProductPage·Product·Offer(KRW 20,000)·BreadcrumbList·FAQPage 및 브랜드 정보를 생성합니다. FAQ와 화면의 답변이 일치합니다.
- 이미지 크기·지연 로딩, 본문 건너뛰기, 키보드 접근, 모션 감소 설정과 모바일 고정 예약 버튼을 반영했습니다.

## 모바일 개선 및 추가 사진

2026-10-13 추가 요청을 반영했습니다. 모바일 첫 화면을 제목 → 실제 제품 사진 → 가격·포함 구성 → 짧은 설명 → 예약 버튼 순서로 바꿨습니다. 320×667px와 375×667px에서도 사진 전체와 가격이 첫 화면 안에 보이는지 검사했습니다.

긴 설명과 영문 장식을 줄이고, 본문·FAQ 글자와 버튼을 키웠으며 섹션 여백을 조정했습니다. 하단 예약 버튼은 처음에는 숨기고, 첫 예약 버튼을 지나 스크롤했을 때 표시합니다. 추가 요청에 따라 커스텀 안내는 모바일 첫 줄 2장·둘째 줄 큰 사진 1장으로 표시합니다. 사진이 중심이 되도록 사진 아래 제목·설명과 중복된 섹션 설명을 숨겼습니다. 이미지를 누르면 원본 크기로 열립니다.

추가로 받은 사진 6장은 원본 그대로 `images/anniversary/photo-1.jpg` ~ `photo-6.jpg`에 복사했습니다. 2번 사진은 대표 이미지·메인 상품 카드·공유 이미지, 1번 사진은 2구 세트 설명에 사용했고 제작 사례에서 6장 모두 확인할 수 있습니다. 모든 사진은 500KB 이하이며 비율을 유지합니다. 원래 사진 라이브러리 파일은 수정하지 않았습니다.

## 주문 시스템 연결

예약 버튼은 사용자 지정 네이버 지도 예약 링크와 `https://nothingmatters.co.kr/order/anniversary-cookie`로 연결합니다. 첫 화면·최종 주문 영역·모바일 하단에서 네이버예약과 온라인주문을 선택할 수 있습니다. 링크별 분석 이벤트와 320~1440px 표시 검사를 통과했고 온라인주문 주소의 공개 GET 응답은 200으로 확인했습니다. 이 버튼 변경은 운영 사이트에 배포하지 않았습니다.

2026-10-13 축하쿠키 전용 주문을 `/order/anniversary-cookie`에 추가했습니다. 랜딩페이지의 주문 버튼과 주문 상품 목록에서 연결됩니다.

- 첫 번째 첨부 사진은 A형: 말풍선 이름 + 하단 문구.
- 두 번째 첨부 사진은 B형: 하트 안 문구 + 하단 문구. 하트 하나당 한글 최대 2글자 또는 영문 최대 4글자이며, 서로 다른 두 문구는 한 칸에서 `/`로 구분합니다.
- 타입과 필수 문구 입력 후 세트 수량을 선택합니다. 1세트는 브루키 2개이며 20,000원입니다.
- 주문자·수령 정보 → 견적서 → 주문 저장 → 선택 이메일 발송 → 이미지 공유/다운로드 → 카카오톡 확정 순서로 기존 주문 기능을 사용합니다.
- 타입과 문구를 관리자 대시보드, 관리자 이메일, 고객 견적서 이메일·Excel, Google Sheets 주문 상세에 표시합니다.
- 새로고침/뒤로가기로 돌아왔을 때 입력 내용과 단계를 세션에서 복원합니다.

주문 서버 프로젝트 `/Users/nahmsoochan/주문`의 API·알림·견적 기능에도 `anniversary` 상품을 추가했습니다. 운영 반영 시 **주문 서버와 랜딩페이지를 함께 배포**해야 합니다. 모의 검증을 완료했으며, 운영 배포 여부는 별도로 확인해야 합니다.

## 검증

| 검사 | 결과 |
| --- | --- |
| `npm run site:build` | 통과 |
| `npm run site:check` | 통과: 39개 사이트맵 URL, 메타·JSON-LD·FAQ·이미지·접근성·기존 랜딩 페이지 |
| `npm run order:test` | 통과: 기존 가격·최소 수량·견적·오류·재시도·중복 방지 |
| `npm run server:test` | 통과: 기존 서버 HTTP·항공편 서비스 |
| `npm run order:browser:test` | 통과: 주문 화면 8개, 320/390/1280px, 모의 주문 저장·오류·필수 입력 |
| 새 페이지 실제 Chrome 검사 | 통과: 320/375/390/430/768/1024/1280/1440px, 500/900 폰트 로딩, 이미지 비율·모바일 2+1 배치·예약 버튼·FAQ·분석 이벤트 |
| `npm run anniversary:browser:test` | 통과: 8개 화면 폭, 짧은 모바일 첫 화면 안의 사진·가격 표시, 사진 6장 및 안내 3장 비율, 안내 2+1 배치·사진 설명 숨김·스크롤에 따른 예약 버튼 표시, 폰트·FAQ·메인 상품 카드 이동 |
| `node scripts/test-public-browser.mjs` 전체 회귀 검사 | 두 차례 실행했으나 기존 김포공항 화면 검사 중 Chrome 무응답으로 미완료. 그 이전의 공개 경로 HTTP·모바일 화면·기존 행사 랜딩 검사와 새 페이지 검사는 통과 |
| 코드 구문·`git diff --check`·원본 이미지 및 기존 주문 소스 대조 | 통과 |

주문 테스트는 모의 저장을 사용했습니다. 실제 고객 주문을 생성하지 않았습니다.

## 변경 파일

새 페이지: `anniversary-cookie/index.html`, `assets/anniversary-cookie.css`, `assets/anniversary-cookie.js`, `images/anniversary/custom-1.webp` ~ `custom-3.webp`, `images/anniversary/photo-1.jpg` ~ `photo-6.jpg`.

통합: `data/site-pages.json`, `index.html`, `sitemap.xml`, `package.json`.

검증: `scripts/test-anniversary-landing.mjs`, `scripts/test-public-browser.mjs`.

`order/`에는 축하쿠키 주문 화면과 사진을 추가하고 공통 주문 스크립트를 연결했습니다. `server.js`와 `lib/`의 기존 API 프록시를 사용합니다.

## 화면

PC 첫 화면:

![PC 첫 화면](</Users/nahmsoochan/Desktop/랜딩페이지 v2/output/playwright/anniversary-cookie/1280-hero.png>)

PC 커스텀 안내:

![PC 커스텀 안내](</Users/nahmsoochan/Desktop/랜딩페이지 v2/output/playwright/anniversary-cookie/1280-customization.png>)

모바일 첫 화면:

![모바일 첫 화면](</Users/nahmsoochan/Desktop/랜딩페이지 v2/output/playwright/anniversary-cookie/390-hero.png>)

모바일 제작 사례:

![모바일 제작 사례](</Users/nahmsoochan/Desktop/랜딩페이지 v2/output/playwright/anniversary-cookie/390-gallery.png>)

## 축하쿠키 주문 검증 추가

`npm run check`, 프런트엔드·서버 빌드, `scripts/test-anniversary-orders.ts`, `scripts/test-landing-email.ts`, 기존 상품 API 회귀 검사 및 `npm run order:test`를 통과했습니다.

실제 Chrome에서 주문 화면 9개를 320/390/1280px로 검사했고, A형·B형 입력 분기와 글자 수 제한, 견적 가격/문구, 모의 저장, 견적서 재사용, 새로고침 복원을 검증했습니다. 테스트는 로컬 모의 저장·메일 발송을 사용했습니다.
