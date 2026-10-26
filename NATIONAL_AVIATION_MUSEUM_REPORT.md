# 국립항공박물관 SEO · GEO · AEO 개선 보고

작업·공식 자료 확인일: 2026-10-26 (한국 시간). 기준 커밋: `efc091f`, 작업 시작 시 `main` clean.

- 구현 경로·canonical: https://nothingmatters.co.kr/national-aviation-museum/
- 로컬 미리보기: http://127.0.0.1:4183/national-aviation-museum/
- 기존 페이지를 개선했으며 새 랜딩 URL을 만들지 않았다. 운영 배포 전 상태다.

## 변경 파일

| 파일 | 변경 |
| --- | --- |
| `national-aviation-museum/index.html` | title·description·OG/Twitter 설명·H1 정리, 즉답 5개, 상세 방문 정보, 검증된 특별전, 체크리스트, FAQ 9개, 클릭 측정 연결 |
| `assets/national-aviation-museum.css` | 기존 브랜드를 유지하는 간결한 즉답 카드·전시·체크리스트 반응형 스타일 |
| `assets/national-aviation-museum-analytics.js` | 신규 경량 GA4 구매 채널 클릭 측정 |
| `data/site-pages.json` | 외부 박물관 주제와 4종 ItemList 데이터, 실제 수정한 홈페이지·출발 가이드 수정일 |
| `scripts/generate-jsonld.mjs` | 레지스트리의 선택적 ItemList를 공통 생성기에서 지원; 기존 페이지 유형·FAQ 추출 방식 유지 |
| `index.html` | 공항동 픽업 관련 탐색 링크 영역에 박물관 가이드 링크 1개 |
| `guides/gimpo-airport-departure-checklist/index.html` | 박물관을 함께 방문하는 경우의 안내 링크 1개와 생성된 수정일 |
| `llms.txt` | 페이지 역할, 공식 정보 확인일, 특별전·예약 경계와 구매 채널 설명 |
| `sitemap.xml` | 실제 수정한 페이지의 lastmod 동기화 |
| `feed.xml` | 기존 생성 규칙에 따라 수정된 출발 가이드의 날짜·정렬 갱신; 기존 9개 항목·URL·제목·설명 유지 |
| `scripts/test-national-aviation-museum.mjs` | 새로운 H1·즉답·질문 의도·출처·스키마·상품·측정 계약 검증 |
| `scripts/test-national-aviation-museum-browser.mjs` | 5개 화면 폭, 실제 이동·명도·GA4 정확성/중복/차단·오류·개인정보 경계 검증 |
| `scripts/test-public-seo.mjs` | 실제 수정된 출발 가이드의 수정일 기대값 갱신 |
| `NATIONAL_AVIATION_MUSEUM_REPORT.md` | 현재 구현·근거·검증·한계 보고 |

## 검색 의도별 반영

| 의도 | 실제 콘텐츠 |
| --- | --- |
| 입장료 | 일반 전시관람 무료와 무료·유료 체험·교육 구분; 상단 즉답·상세·FAQ |
| 관람시간 | 화~일 10:00~18:00, 입장 마감 17:30, 휴관일과 공휴일 월요일 예외 |
| 주차 | 지상·지하 위치, 08:00~20:00, 소형차 요금, 카드 정산, 할인 증빙·만차 공식 확인 경로 |
| 예약·체험 | 일반 전시 안내와 개별 체험 예약 구분, 어린이공항체험과 블랙이글스의 서로 다른 예약 방식 |
| 아이랑 | 만 48개월~미취학 아동 대상, 보호자 대기, 유모차 보관·대여 확인, 음식물 제한 |
| 특별전·전시 | 공식 현재전시에 등록된 HS-748 특별전의 검증된 기간·장소와 원문 링크 |
| 방문 후기 | 직접 방문한 척하지 않고 운영 공지·체험·교통·어린이·선물 예약 체크리스트 제공 |
| 기념품·근처 선물·디저트·비행기 쿠키 | 실제 상품 4종과 기존 구매 채널; 박물관 공식 기념품이나 내부 판매점이 아니라는 안내 |
| 전망대 | 현재 이용 조건을 공식 자료에서 확인하지 못해 H2·FAQ·운영 주장을 추가하지 않음 |

후보 키워드를 네이버 실제 연관검색어나 검증된 검색량 결과로 표시하지 않았다. 검색 노출·AI 인용·예약 또는 구매 완료를 보장하는 표현도 쓰지 않았다.

## 공식 자료와 검증 범위

모두 2026-10-26에 재확인했다.

| 공식 출처 | 확인 내용 |
| --- | --- |
| [관람안내](https://www.aviation.or.kr/contents.do?menuno=65) | 전시관람 무료, 체험교육 무료·유료 구분, 관람시간·입장 마감·휴관 원칙, 하늘길 177, 김포공항역 이동 안내, 유모차 대여·음식물 제한 |
| [박물관 홈페이지](https://www.aviation.or.kr/index.do) | 기본 운영·주차장 운영시간, 휴관일 이용 불가, 카드 정산, 만차 시 인근 주차장 안내. 표시된 실시간 주차 수치는 복제하지 않음 |
| [주차공간](https://www.aviation.or.kr/contents.do?menuno=168) | 소형차 최초 30분 이하 무료, 30분 초과 시 1,000원 및 이후 15분 초과마다 500원, 차종별 요금·할인·증빙 원문 |
| [어린이공항체험](https://www.aviation.or.kr/contents.do?menuno=311&tabno=4) | 만 48개월~미취학 아동, 온라인 사전예약/현장예약, 어린이 1명당 보호자 1명 대기, 유모차 보관 |
| [블랙이글스 탑승체험](https://www.aviation.or.kr/contents.do?menuno=311) | 현장예약과 별도 안전 제한; 모든 어린이에게 체험 가능하다고 확대하지 않음 |
| [체험예약](https://www.aviation.or.kr/reservation.do?gcode=gcode1&menuno=189) | 박물관 공식 체험 확인 경로. 잔여석·예약 성공 미확정 |
| [현재전시](https://www.aviation.or.kr/board.do?boardno=51&menuno=75) 및 [HS-748 상세](https://www.aviation.or.kr/view.do?boardno=51&menuno=75&seq=2062) | 2026년 특별전 ‘마지막 비행, 새로운 시작 : 대통령 전용기 HS-748’, 2026.08.11~2027.07.31, 3층 기획전시실 |
| [층별안내](https://www.aviation.or.kr/contents.do?menuno=66)·[부대시설](https://www.aviation.or.kr/facilities.do?menuno=321) | 전망대의 정확한 명칭·접근·현재 이용 가능 조건을 확인하지 못함 |
| [박물관 FAQ](https://www.aviation.or.kr/board.do?boardno=42&menuno=69) | 일부 연령·예약 설명이 개별 체험 페이지와 달라 해당 프로그램의 개별 안내를 우선함 |

박물관 사진·로고·포스터를 판매용 이미지로 가져오지 않았다. 기존 COOKIE FLIGHT 및 4종 실물 상품 사진을 사용한다.

## SEO · AEO · GEO

- Title: `국립항공박물관 입장료·주차·예약·체험 안내 | 낫띵메터스`
- H1은 `국립항공박물관 방문 가이드` 하나다. canonical, index/follow, 기존 네이버 인증과 GA4 측정 ID를 유지했다.
- HERO 다음에 입장료·시간·주차·예약·위치 즉답 5개를 제공한다. 각 카드에 상세 앵커와 공식 출처가 있다. 모든 방문·상품·FAQ 콘텐츠는 정적 HTML이며 JavaScript 없이 읽힌다.
- WebPage, BreadcrumbList, FAQPage, Organization, 기존 Bakery를 유지하고 실제 4개 상품 상세 URL의 ItemList를 추가했다. FAQ 9개는 기존 공통 생성기가 실제 HTML에서 추출한다.
- WebPage.about의 Museum은 공식 외부 URL `https://www.aviation.or.kr/`와 하늘길 177 주소로 표현한다. 낫띵메터스 Bakery의 송정로 25 주소와 별개이며, 소유·공식 파트너 관계를 추가하지 않았다.
- 허위 Product/Offer/Review/AggregateRating/Event나 실시간 예약·주차 데이터를 추가하지 않았다. 그래프 ID 중복과 화면·스키마 불일치를 테스트한다.
- 홈페이지와 출발 가이드에는 링크 1개씩만 추가했다. 기존 `/gimpo/` 인바운드 링크, `/pickup/`, 상품 내부 링크를 유지한다.
- 박물관 페이지는 이미 같은 날짜인 2026-10-26이므로 날짜를 인위적으로 올리지 않았다. 실제 내용이 바뀐 홈페이지·출발 가이드만 수정일을 같은 실제 작업일로 갱신했다.

## 구매 채널과 측정

상품 순서·이미지·제목/사진의 내부 상세 링크, 네이버 그린 #03C75A, 동일한 버튼 높이·간격, 안전 영역과 모바일 COOKIE FLIGHT 전용 플로팅을 유지한다.

| 상품 | 네이버 픽업예약 | 택배 |
| --- | --- | --- |
| COOKIE FLIGHT | https://naver.me/Ge7SnJnC | https://mkt.shopping.naver.com/link/6ad84808a30a4751f926bfde |
| COOKIE CREW | https://naver.me/FjmgqAUo | 카카오톡 택배 가능 여부 문의 |
| TERMINAL 샌드쿠키 | https://naver.me/GArtG2FK | https://mkt.shopping.naver.com/link/6ad84808bb270c6ca6310878 |
| 수제 꾸덕쿠키 | https://naver.me/FQuvqNt0 | 카카오톡 택배 가능 여부 문의 |

카카오톡 URL: https://pf.kakao.com/_QdCaK/chat. 사용자 제공 외부 구매 URL은 변경하지 않았다.

필수 고지: “낫띵메터스는 예약 제작·예약 픽업 전용 작업실입니다. 예약 없이 방문하셔도 바로 구매할 쿠키가 없습니다.” 픽업 주소와 박물관 비제휴·내부 매장 아님 안내도 유지한다.

| 클릭 이벤트 | 구분 |
| --- | --- |
| `museum_pickup_click` | 상품 카드 네이버 픽업예약 |
| `museum_shipping_click` | COOKIE FLIGHT·TERMINAL 택배주문 |
| `museum_shipping_inquiry_click` | COOKIE CREW·꾸덕쿠키 택배 문의 |
| `museum_floating_pickup_click` | 모바일 COOKIE FLIGHT 픽업예약 |
| `museum_floating_shipping_click` | 모바일 COOKIE FLIGHT 택배주문 |

매개변수는 `product_id`, `placement`, `destination_type`, `page_path` 4개뿐이다. 상품 ID·위치·채널은 허용 목록, 페이지 경로는 고정값을 사용한다. 클릭 텍스트·목적지 URL·이름·전화·이메일·쿼리·해시를 수집하지 않는다. GA4 config의 page_location/page_path도 canonical 고정값으로 지정한다.

기존 범용 `data-analytics-event`와 별도 속성을 사용하고, 스크립트 중복 로딩을 막는다. 분석 함수가 없거나 오류를 내거나 스크립트가 차단돼도 실제 anchor 이동은 그대로 작동한다. `preventDefault`나 주문/예약 API를 호출하지 않는다. 클릭 이벤트는 구매·예약 완료가 아니다.

## 검증

- `npm run site:build` PASS.
- `npm run museum:test` PASS: 새 메타/H1, 즉답 5개와 출처·앵커, 검증된 질문 9개, 특별전·체크리스트, FAQ/ItemList/about, 인바운드 링크, 기존 상품/구매 URL.
- `npm run museum:browser:test` PASS: 320/390/768/1280/1440px, 실제 SeoulNotice/PretendardDisplay, 사진 로딩·원본 비율, 버튼 한 줄·높이·명도, 하단 CTA 가림, 키보드/터치/스킵 링크/FAQ, no-JS, 이미지 실패 상태.
- 구매 새 탭 16회 로컬 모의 응답으로 검증: 기존 상품별/플로팅 이동, 중복 초기화 후 키보드 클릭, gtag 없음·예외, analytics 스크립트 차단. opener가 null이고 referrer가 비어 있음을 확인했다.
- 정상 클릭 5개 이벤트 유형과 4개 매개변수가 정확히 한 번씩 기록된다. 방문 정보 이동은 구매 이벤트를 만들지 않으며, 쿼리/해시를 넣어도 이벤트와 GA config에 유입되지 않는다.
- `npm run site:check` PASS. 포함된 `public-seo:test`(사이트맵 45 URL/공개 HTML 49개), `public-perf:test`·`a11y:check`(52페이지), 기존 공지·크리스마스·상품·가이드 RSS 9개 검사 PASS.
- `npm run order:test`, `npm run server:test` PASS. 로컬 모의 주문 검증이며 운영 DB 쓰기 없음.
- `npm run christmas:browser:test`, `npm run notices:browser:test` PASS. 크리스마스 PC/모바일 전체 3 STEP 흐름과 공지 4개 경로·6개 화면 폭·홈 고정 공지·XML·폰트·키보드 동작을 확인했다.
- `git diff --check` PASS.

화면 캡처와 브라우저 결과·GA 매개변수·디자인 검증 근거는 Git 제외 경로 `output/playwright/national-aviation-museum/`에 보관한다. 외부 구매 서비스는 이동 URL과 새 탭 동작만 검증하며 실제 결제·예약·주문을 생성하지 않았다.

## 미확인 정보·배포 전 확인

- 일반 전시를 방문일·단체 조건과 관계없이 항상 예약 없이 관람할 수 있다는 근거는 확보하지 못했다. FAQ에서 무료 요금과 체험 예약을 구분하고 공식 관람안내·공지 확인으로 안내한다.
- 전망대의 존재 자체를 부정하지 않는다. 정확한 명칭·접근 방식·현재 이용 가능 조건을 확인하지 못했으므로 전망대 H2·FAQ·운영 주장을 제외했다.
- 확인된 HS-748 외의 특별전 일정·전시실 임시 휴관 상세·현장 상황, 실시간 체험 잔여석·주차 여유·유모차 대여 수량은 임의로 보충하지 않았다.
- 배포 직전 전시 일정·운영 공지·주차요금·개별 체험 조건을 공식 페이지에서 다시 확인해야 한다. 전시 종료 후에는 본문·FAQ의 일정을 함께 갱신해야 한다.
- GA4 수집 서버에서의 실수신·보고서 표시와 실제 네이버 예약/스마트스토어 구매 완료는 테스트하지 않았다. 코드와 브라우저 dataLayer 단계의 클릭 정확성만 확인했다.
- 검색엔진 수집·순위·AI 인용을 보장하지 않는다.
- 구현·로컬 검증 상태이며 커밋·푸시·운영 배포는 실행하지 않았다.
