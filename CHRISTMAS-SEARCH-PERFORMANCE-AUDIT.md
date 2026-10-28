# 크리스마스 검색 성과 감사

작업일: 2026-10-29 · 기준: main `8b98027` · 대상: `https://nothingmatters.co.kr/christmas/`

## A. 실제 성과 분석

**실제 검색 성과는 확보되지 않았다.** 로컬 환경변수와 로컬 설정 파일의 존재 여부만 검사했으며 인증 값은 출력하지 않았다. 작업공간에서 검색 성과 내보내기 파일과 관련 문서를 점검했지만 실제 성과 원본을 찾지 못했다.

| 출처 | 기간·대상 | 확보 결과 | 검색어·클릭·노출·CTR·평균순위 |
| --- | --- | --- | --- |
| Google Search Console | `/christmas/` canonical, 28일 | 로컬 서비스 계정 및 속성 설정 없음. 실제 조회·권한 검증 미실행 | 미확보 |
| Google Search Console | `/christmas/` canonical, 90일 | 동일. 운영 환경의 Google 설정 상태는 확인하지 못함 | 미확보 |
| Google Search Console | 기기별 비교 | 실제 조회 미실행 | 미확보 |
| 네이버 서치어드바이저 | 실제 내보내기 자료의 기간 | **네이버 검색어 데이터 미확보**. 기간도 미확인 | 미확보 |
| 네이버 수집·색인 상태 | 별도 진단 | 관리 화면 접근 자료 없음 | 미확인 |

성과가 확인된 실제 검색어와 수치는 없다. 낮은 CTR·낮은 순위·주제별 수요·페이지 간 검색 의도 충돌을 입증할 수 없으므로 **우선 보완 검색어 선정과 공개 콘텐츠 수정은 보류**했다. GA4 네이버 유입 세션을 네이버 검색어 통계로 사용하지 않았다. 테스트에 등장하는 `SYNTHETIC` 행은 기능 검증용이며 실제 성과가 아니다.

운영 `/dashboard/`에 인증 없는 HEAD 요청을 한 번 보냈을 때 200 응답을 확인했다. HTML 본문, 성과 API 본문, 운영 인증정보는 조회하지 않았다. 이 사실만으로 성과 API의 자료 노출 여부를 확정할 수는 없다. 코드에서는 인증정보 미설정 시 접근을 허용하던 분기를 확인해 로컬에서 차단하도록 수정했다. **운영에는 아직 반영하지 않았다.**

### 현재 코드에 이미 있는 주제

아래는 정적 HTML과 기존 생성기를 확인한 콘텐츠 커버리지이며 검색 성과 평가가 아니다. 실제 데이터 없이 새로운 중복 문단이나 FAQ를 만들지 않았다.

| 검색 주제 | 기존 본문·기능 근거 | 이번 판단 |
| --- | --- | --- |
| A. 크리스마스 쿠키·쿠키 세트 | 상단 선택 요약, 상품 4종, `#gift-comparison`, FAQ | 상품명·구성·가격 이미 설명. 유지 |
| B. 선물·추천 | `#gift-choice`의 개인·연인·친구·파티·기관별 안내 | 독립 본문 이미 존재. 유지 |
| C. 가격·포장 | `#gift-comparison`의 네 상품 가격·구성·실물 포장 설명, 갤러리, 포장 FAQ | 단품·세트와 사진 예시 구분. 유지 |
| D. 주문·픽업·택배 | `#ordering-guide`, 3 STEP, 마감일·택배·현장구매·온라인 준비 중 FAQ | 확인되지 않은 조건을 약속하지 않음. 유지 |
| E. 서울 쿠키선물 | `#seoul-pickup`의 공항동 작업실·주소·김포공항·송정역·예약 픽업 | 실제 지역 정보 이미 존재. 유지 |
| F. 기업행사·단체 간식 | `#group-orders`, 수량·일정·예산·포장·수령 상담, 마곡 퀵 조건 | 상담 기준 이미 존재. 유지 |
| G. 어린이집·유치원 | `#group-orders`, 기관별 선물·간식 FAQ, 연령·알레르기·반입 기준 확인 안내 | 구매 판단 정보 이미 존재. 유지 |
| H. 산타·트리·곰돌이 | 4종 상품 카드·상세 사진·세트 비교·FAQ | 실제 카탈로그와 일치. 유지 |

기존 내부 링크도 보존했다. `/christmas/`는 시즌 상품 선택·상담, `/pickup/`은 예약 픽업 정책, `/magok-cookie/`는 마곡 행사 상담, `/corporate-gift/`·`/bulk/`는 일반 기업·단체 목적, 관련 가이드는 준비 기준을 설명한다. 현재 연결만으로 검색 의도 충돌을 판단하지 않았다. 홈페이지·기업선물·기업행사 가이드·소액선물·단체답례품·가이드 목록의 기존 시즌 유입 링크를 중복 추가하지 않았다.

## B. 코드 기반 보완

- 관리자 대시보드에 독립적인 크리스마스 28일·90일 성과 영역을 추가했다. 기존 사이트 전체 상위 20개 Google 검색어와 명확하게 구분한다.
- 기존 OAuth 및 Search Console 함수를 재사용하는 `/api/dashboard/christmas-search`를 추가했다. 모든 요청에 정확한 canonical의 `page equals` 필터를 강제한다. GA4 설정이 없어도 GSC만 조회할 수 있다.
- Google 공식 API의 미국 태평양 시간 기준, 반영 지연을 고려해 최근 3일을 제외한 28일·90일로 고정한다. 기간은 양 끝 날짜를 포함하며 화면에 실제 조회 범위를 표시한다. `web` / `final` / `byPage`를 사용한다.
- 페이지 합계·검색어·기기를 따로 조회한다. 검색어는 25,000행씩 최대 50,000행을 조회하며 화면에는 최대 100행을 표시한다. 익명화·내부 한도·행 제한을 안내한다. 상세 검색어 합계를 페이지 전체 합계로 간주하지 않는다.
- A–H 중복 분류, 클릭/노출 기반 CTR, 노출 가중평균 순위를 계산한다. 작은 표본 및 편집 검토 기준을 명시한다. 미관측을 수요 없음으로 판단하지 않는다.
- 기존 관리자 인증을 필수화했다. 사용자명·비밀번호 중 하나라도 미설정이면 대시보드와 성과 API는 503, 인증 누락·실패는 401이다. 인코딩된 경로도 인증을 거치며 HTML/API는 `no-store`와 `noindex, nofollow`로 응답한다. 기존 공개 Quick 조회는 유지한다.
- 외부 오류 본문과 인증정보를 응답에 포함하지 않는다. Google 인증·GSC 요청에는 15초 제한을 적용한다. 검색어는 `textContent`로 출력한다. 실제 성과 원본을 파일·DB에 저장하거나 URL·분석 이벤트로 전송하지 않는다.
- 네이버는 미확보 상태를 별도로 표시한다. 네이버 자동 조회·업로드 기능은 추가하지 않았다. 추후 제공되는 내보내기 자료는 공개 웹 루트 밖에서 기간·대상 URL을 확인해 분석해야 한다.

**공개 콘텐츠·메타·내부 링크 변경: 없음.** 상품 카탈로그, 상품 수정일, 페이지 수정일, 사이트맵, 대표 이미지, FAQ 13개, 공통 JSON-LD, 주문 스크립트를 수정하지 않았다. 데이터 미확보를 이유로 마감일·택배·재고·할인·후기를 생성하지 않았다.

### 변경 파일

| 파일 | 변경 내용 |
| --- | --- |
| `server.js` | 필수 인증 경계, 전용 API, Google 조회 재사용·오류 처리 |
| `lib/christmas-search-audit.js` | 기간·필터·페이지네이션·집계·주제·미확보 상태 |
| `dashboard/index.html` | 크리스마스 전용 분석 및 출처 구분 |
| `assets/christmas-search-dashboard.js` | 28/90일 전환·표·안전한 검색어 출력·실패/재조회 |
| `assets/dashboard.css` | 기존 스타일 재사용, 반응형 표·포커스·버튼 대비 |
| `.env.example` | 인증 필수 및 서버 전용 Google 환경변수 이름 |
| `dashboard/SETUP.md` | 접속·권한 설정·기간 및 표본 해석·자료 보안 안내 |
| `package.json` | 신규 검증 명령, `server:test`에 분석 테스트 포함 |
| `scripts/christmas-search-test-helper.mjs` | 외부 요청을 차단한 합성 Google 응답·임시 서버 |
| `scripts/test-christmas-search-audit.mjs` | 인증·필터·기간·집계·페이지네이션·실패 통합 검증 |
| `scripts/test-christmas-search-browser.mjs` | 관리자 UI·반응형·키보드·XSS·재조회 검증 |
| `CHRISTMAS-SEARCH-PERFORMANCE-AUDIT.md` | 성과 미확보와 코드 보완을 구분한 이번 보고서 |

### 검증 결과

모두 통과:

- `npm run site:build` — 재생성 후 기존 공개 페이지·상품 데이터 변경 없음
- `npm run christmas:check`
- `node scripts/test-christmas-landing.mjs`
- `npm run christmas:browser:test` — PC/모바일 전체 3 STEP, 상태 유지·뒤로 가기·갤러리·합계·입력·개인정보·모의 API 오류/중복 검증
- `npm run site:check` — SEO·스키마·사이트맵·기존 상품·공지·성능·접근성·RSS 포함
- `npm run server:test` — 기존 HTTP/항공편 및 신규 인증·페이지 필터·미확보 상황 검증
- `npm run order:test` — 기존 상품·크리스마스 계산 및 모의 주문 회귀
- `npm run christmas:search:browser:test` — 320/390/768/1280/1440px, 기간 전환, 안전한 검색어 출력, 키보드 포커스, 연결 미설정·빈 결과·권한 거부·재조회 실패/복구
- `npm run kakao-quick:admin:test` — 인증을 공유하는 기존 차량 퀵의 공개/관리자 동작 등 225개 검증
- `git diff --check`

신규 API 테스트는 Google 응답을 모의한 통합 테스트다. 실제 Google 서비스 계정 권한이나 실제 검색 성과 확보 성공을 의미하지 않는다. 운영 DB에 테스트 주문을 생성하지 않았다.

### 필요한 설정과 남은 항목

1. 실행 환경에 `DASHBOARD_USERNAME`, `DASHBOARD_PASSWORD`를 모두 설정한다. Google 자격증명은 `GOOGLE_SERVICE_ACCOUNT_JSON` 또는 `GOOGLE_SERVICE_ACCOUNT_JSON_BASE64` 중 하나, 속성은 `SEARCH_CONSOLE_SITE_URL`로 설정한다. 전체 GA4 대시보드는 별도로 `GA4_PROPERTY_ID`가 필요하다. 실제 값은 보고서·Git에 넣지 않는다.
2. 서비스 계정에 해당 Search Console 속성 읽기 권한을 부여하고 인증 후 `/dashboard/`에서 두 기간의 실제 조회 성공을 확인해야 한다. 현재 로컬에는 설정이 없어 이 단계는 수행하지 못했다.
3. 네이버 내보내기 자료의 실제 기간·검색어·클릭·노출을 확보해야 한다. 수집·색인 상태는 성과와 별도로 확인해야 한다.
4. 실제 행을 확보한 뒤 CTR·순위·표본·현재 본문을 함께 검토해 필요한 주제만 편집한다. 현재 메타·FAQ 추가·기업/지역 콘텐츠 보강 및 검색 의도 충돌 조정은 보류했다.
5. 운영 대시보드 인증 경계는 검수 후 수정 반영이 필요하다. 이번에는 **커밋·푸시·배포하지 않았다.**

API 기준: [Google Search Analytics query](https://developers.google.com/webmaster-tools/v1/searchanalytics/query), [Search Console 전체 데이터와 제한](https://developers.google.com/webmaster-tools/v1/how-tos/all-your-data).
