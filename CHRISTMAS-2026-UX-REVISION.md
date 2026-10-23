# Christmas 2026 · FINAL UX REVISION

2026-10-21 / 랜딩페이지 v2 / `/christmas/`

**PC와 모바일 공통 3 STEP 구현 및 전체 흐름 검증 완료. 실제 온라인 접수는 기존 Railway 미지원 상태를 유지한다. 배포하지 않았다.**

## 화면과 공통 로직

1. **STEP 1 · 상품 선택 및 상세 사진**: 컴팩트 상품 4종, 개별 수량, 상세 사진 버튼. 선택하지 않은 상품은 요약/합계에서 제외한다.
2. **STEP 2 · 수령 정보 및 주문자 입력**: 예약 픽업 기본, 차량 퀵 희망, 희망 날짜/시간, 이름, 휴대전화, 요청사항. 누락/형식 오류 시 해당 입력으로 포커스를 이동한다.
3. **STEP 3 · 주문 내역 확인 및 접수**: SKU별 수량/금액, 수령 및 주문자 정보, 상품/정보 수정, 온라인 접수 상태와 카카오톡 상담. 접수 후 최종 확정은 별도 상담으로 안내한다.

하나의 HTML 폼과 하나의 `state`가 단계, 상품 수량, 주문자 정보, 수령 방식, 동의, 접수 결과를 관리한다. PC/모바일 전용 폼이나 별도 가격 계산/검증/API 분기는 없다. 화면 차이는 CSS이며 두 CTA도 같은 `advance()`와 제출 처리기를 사용한다. 같은 `renderLines()`로 요약과 최종 검토 항목을 그린다.

확정 카탈로그는 그대로 유지했다: 곰돌이 8,500원 / 트리 9,000원 / 브루키 2종 세트 17,000원 / 산타꾸러미 4종 23,000원. 단품 둘은 17,500원, 별도 세트 하나는 17,000원이며 자동 전환하지 않는다.

- 단계 이동, 이전 버튼, 단계 탭, 브라우저 뒤로/앞으로 가기, 화면 크기 변경 시 현재 입력/수량을 유지한다.
- 도달 가능한 단계만 열고 입력 검증을 거쳐 STEP 3으로 이동한다. 현재 단계 탭을 다시 눌러도 브라우저 이력을 늘리지 않는다.
- 브라우저 history에는 단계와 갤러리 SKU만 기록한다. 개인정보는 URL·history·분석 이벤트·브라우저 저장소에 기록하지 않는다.
- 저장 중에는 변경과 반복 제출을 막는다. 저장 여부가 불명확하면 반복 제출 대신 상담 확인을 안내한다.
- SEO용 설명과 FAQ는 주문 흐름 아래에 두었다. 기존 canonical/인증/GA4/4종의 보이는 가격 및 FAQ/ItemList 스키마를 유지했다.

## PC / MOBILE

**PC (960px 이상)**: 세 단계 모두 왼쪽 작업 영역 + 오른쪽 sticky 주문 요약. 상품은 컴팩트한 2열 그리드이며 다른 단계의 본문은 숨겨 불필요한 페이지 길이를 줄였다. 단계 이동 시에도 동일한 외부 2열 레이아웃을 유지한다.

**MOBILE (960px 미만)**: 같은 폼의 단일 작업 영역, 하단 고정 합계 및 해당 단계의 다음/접수 CTA. 640px 미만은 사진·설명·수량을 묶은 1열 카드, 태블릿은 2열 카드다. 텍스트 입력 중 또는 가상 키보드/갤러리 활성 상태에서는 하단 바를 숨기고 safe-area를 반영한다. 수량/사진 컨트롤은 최소 44px이다.

## 실물 상세 갤러리

PC는 최대 1100px의 큰 모달, 모바일/태블릿은 전체화면이다. 모든 사진은 기존 ZIP의 실물 사진이며 원본 비율을 보존한 WebP다. 생성/스톡/임의 대체 사진을 사용하지 않았다.

- 상품별 2~3장, 이전/다음, 썸네일, 방향키, Escape, 닫기 지원.
- Tab/Shift+Tab 포커스 제한과 닫힌 뒤 원래 사진 버튼으로 포커스 복귀.
- 브라우저 뒤로 가기로도 갤러리를 닫고 원래 단계를 유지한다.
- 사진 로딩/실패 안내. 추가 사진은 갤러리를 열 때 불러온다.
- 함께 촬영된 단품 사진은 곰돌이/트리의 위치와 판매 수량을 캡션으로 구분했다.

추가 최적화한 원본:

| ZIP 원본 | 새 WebP | 사용처 |
|---|---|---|
| `images/brookie_1.jpg` | `images/christmas/brookie-detail-1.webp` | 곰돌이/트리 상세, 대상 위치 별도 설명 |
| `images/brookie_2.jpg` | `images/christmas/brookie-detail-2.webp` | 곰돌이/트리 개별 포장 상세 |
| `images/brookie_set_2.jpg` | `images/christmas/brookie-set-detail.webp` | 브루키 2종 세트 상세 |
| `images/santa_package_1.jpg` | `images/christmas/santa-bundle-detail-1.webp` | 산타꾸러미 4종 상세 |
| `images/santa_package_2.jpg` | `images/christmas/santa-bundle-detail-2.webp` | 산타꾸러미 포장 참고 |

## API와 완료 범위

기존 `/api/christmas-order-status`, `/api/landing-orders`와 서버 SKU 검증/계산을 그대로 사용한다. Railway 신규 상품 처리와 영속적 중복 방지가 없는 상태이므로 프런트와 서버의 온라인 접수 차단을 해제하지 않았다.

실제 환경에서는 STEP 3까지 정확한 주문 내역을 확인한 뒤 상품 구성 복사와 공식 카카오톡 상담으로 이어진다. 모의 저장 성공을 운영 연동 완료로 표시하지 않는다. 운영 DB에 테스트/고객 주문을 생성하지 않았다. 기존 DB·알림·관리자 시스템은 수정하지 않았다.

## 테스트 결과

| 검사 | 결과 |
|---|---|
| `npm run christmas:browser:test` | 통과: 아래 5개 화면에서 STEP 1→2→3 및 뒤로/앞으로/수정, 검증, 갤러리 |
| PC 1440px / 모바일 375px 모의 접수 | 통과: 전체 상품 선택→정보→검토→동의→정확한 저장 확인, 중복 제출 방지 |
| 모의 API 오류 | 통과: 400 재시도 시 같은 key, 500/통신 단절/항목·금액 불일치/성공 플래그·주문 ID 누락 시 완료 표시 없음 |
| 실제 비활성 상태 | 통과: STEP 3 검토 가능, 접수 POST 없음, 서버 차단 유지 |
| 입력 유지 | 통과: 이전 버튼/브라우저 back-forward/상품 수정/375→1440px 화면 변경 |
| 상세 사진 | 통과: PC/모바일 4종의 모든 사진 로딩/매칭, 방향키·Tab·Shift+Tab·Escape·닫기·포커스 복귀 |
| 개인정보 | 통과: URL/history/분석 이벤트/상품 구성 복사에 이름·전화·요청사항 없음 |
| `node scripts/test-christmas-landing.mjs` | 통과 |
| `npm run christmas:check`, `npm run schema:check` | 통과 |
| `npm run order:test`, `npm run order:browser:test` | 통과: 기존 9개 주문 페이지 포함 |
| `npm run public-seo:test` | 통과: sitemap 40개 URL |
| `npm run public-perf:test`, `npm run a11y:check` | 통과: 46개 HTML |
| 디자인 스킬 evidence checker, `git diff --check` | 통과 |
| `npm run site:check` | 기존 홈 상품 블록 생성 불일치에서 실패. 이번 변경과 무관한 기존 실패 유지 |

화면: **320×844, 375×812, 768×1024, 1024×900, 1440×1000**. 모든 단계에서 가로 넘침, 컨트롤 크기, PC 우측 sticky/모바일 하단 CTA, 사진과 처리되지 않은 JavaScript 예외/404를 확인했다. 큰 수량의 합계 줄바꿈도 검사했다. 운영 저장 성공은 검증하지 않았다.

기존 `site:check` 실패와 기업 페이지 테스트/피드의 불일치는 초기 구현 때 변경 전 Git HEAD로 재현한 기록을 보존했다. 이 개편에서 다른 랜딩페이지를 수정하지 않았다.

## 이번 UX 개편의 변경 파일

- `christmas/index.html`: 공통 3단계 폼, 우측 요약, 단계 이동, 갤러리, 하단 CTA.
- `assets/christmas.css`: PC 2열/모바일 컴팩트 카드 및 갤러리.
- `christmas/christmas-order.js`: 공통 상태·이동·history·갤러리·접수 처리.
- `data/christmas-products.json`: 기존 4종/가격 유지, 상세 사진 메타데이터 추가.
- `scripts/build-christmas.mjs`: 갤러리 버튼이 있는 컴팩트 카드 생성.
- `scripts/test-christmas-landing.mjs`: 3단계/사진/정적 SEO 검사.
- `scripts/test-christmas-browser.mjs`: PC/모바일 전체 흐름 검사.
- 위 표의 `images/christmas/` WebP 5개.
- `CHRISTMAS-2026-IMPLEMENTATION.md`: 최신 UX 보고서 안내 추가.
- `CHRISTMAS-2026-UX-REVISION.md`: 이 보고서.

초기 구현의 API/SEO 변경과 기존 브랜치 변경은 보존했다. **커밋·푸시·배포 없음.**

## 미리보기와 증거

로컬: http://127.0.0.1:4178/christmas/

`output/playwright/christmas-3step/`에 5개 크기별 `*-step-1.png`, `*-step-2.png`, `*-step-3.png`, `*-gallery.png`, PC/모바일 `*-mock-success.png`와 `evidence.json`을 저장했다. 이 디렉터리는 Git ignore 대상인 로컬 검토 자료다. `mock-success`는 모의 성공 화면이다.
