# 국립항공박물관 방문 가이드 구현 보고

작업일·공식 정보 확인일: 2026-10-26 (한국 시간).

## 페이지와 구현 내용

- 로컬 미리보기: http://127.0.0.1:4183/national-aviation-museum/
- 정식 경로·canonical: https://nothingmatters.co.kr/national-aviation-museum/
- 운영 배포 전 상태이며 위 정식 URL의 운영 게시를 의미하지 않는다.
- 기존 홈페이지의 SeoulNotice/PretendardDisplay, NOTHINGMATTERS 로고, 헤더·푸터·버튼 스타일을 재사용했다. 흰 배경과 검정 본문, 제한적인 브랜드 강조색으로 구성했다.
- 방문 정보와 쿠키 보기의 두 진입점, 관람시간·예약·주차·위치·어린이 안내, 상품 4종, 예약 픽업, FAQ 5개, 공식 출처를 정적 HTML로 제공한다. 추가 프런트엔드 JavaScript나 외부 UI 프레임워크를 도입하지 않았다.
- 상품 순서는 COOKIE FLIGHT, COOKIE CREW, TERMINAL 샌드쿠키, 수제 꾸덕쿠키다. 기존 실제 로컬 사진과 상세 URL을 사용하고 새 가격·재고·제작 일정은 만들지 않았다.
- 대표 사진은 기존 85KB WebP를 우선 로딩한다. 상품 사진은 lazy loading, 모든 사진에 실제 width/height, alt, async decoding을 적용하고 contain으로 원본을 자르지 않는다.
- 예약 없이 방문하면 바로 구매할 쿠키가 없다는 필수 문구, 작업실 주소, 박물관 내부 매장·공식 기념품 판매점이 아니라는 설명을 표시한다.
- 픽업 안내·공지, 카카오톡 상담, 기존 상품 상세 주문 동선으로 연결한다. 이 페이지가 주문이나 박물관 예약을 접수한 것처럼 표시하지 않는다.
- 카드 사진과 제목은 기존 상세 페이지로 연결하며, 카드 전체를 링크로 감싸지 않는다. 각 카드에 사용자 제공 상품별 네이버 픽업예약과 택배주문 또는 택배 문의 버튼을 분리했다.
- 컬렉션 중 택배가 확인된 COOKIE FLIGHT와 TERMINAL만 기존 상품별 스마트스토어 링크로 안내한다. COOKIE CREW와 수제 꾸덕쿠키는 택배 가능 여부를 카카오톡으로 문의한다.
- 수제 꾸덕쿠키 사진은 기존 `/images/handmade-hero.jpg`(1024×867)이며, 7가지 맛과 1구·2구·4구 포장 설명을 기존 상세 페이지에서 확인했다.
- 네이버 픽업예약 버튼은 #03C75A 배경과 진한 글자, 택배주문·문의는 흰 배경과 녹색 테두리로 구성한다. 모바일 플로팅 메뉴는 COOKIE FLIGHT 전용 픽업예약·택배주문이며, 연녹색 배경과 안전 영역·하단 여백을 적용했다. PC에서는 플로팅 메뉴를 숨긴다.
- `/gimpo/`의 기존 가이드 목록에 탐색 링크 1개를 추가했다. 신규 페이지에서 `/gimpo/`, `/pickup/`, `/notice/pickup-guide/`로 연결한다. 홈페이지 전환 영역은 수정하지 않았다.

## 확인한 공식 출처

| 출처 | 확인·반영 범위 |
| --- | --- |
| [공식 관람안내](https://www.aviation.or.kr/contents.do?menuno=65) | 10:00~18:00, 입장 마감 17:30, 휴관일·공휴일 월요일 예외, 전시관람 무료, 하늘길 177 주소, 전시관 음식물 금지, 유모차 대여 안내 |
| [공식 홈페이지](https://www.aviation.or.kr/index.do) | 주차장 운영 08:00~20:00, 휴관일·운영시간 외 이용 불가, 카드 정산, 주차 부족 안내 |
| [공식 주차공간](https://www.aviation.or.kr/contents.do?menuno=168) | 소형차 최초 30분 이하 무료, 초과 시 1,000원 및 이후 15분 초과마다 500원 추가, 차종별 조건은 원문 확인 안내 |
| [공식 체험예약](https://www.aviation.or.kr/reservation.do?gcode=gcode1&menuno=189) | 실제 박물관 예약 화면으로 연결; 예약 잔여석이나 예약 성공을 보장하지 않음 |
| [블랙이글스 개별 안내](https://www.aviation.or.kr/contents.do?menuno=311) | 현장예약 안내 |
| [어린이공항체험 개별 안내](https://www.aviation.or.kr/contents.do?menuno=311&tabno=4) | 만 48개월~미취학 아동, 온라인 사전예약/현장예약, 보호자 대기 안내 |
| [박물관 공지사항](https://www.aviation.or.kr/board.do?boardno=24&menuno=68) | 방문일 운영 변경을 재확인하는 경로 |
| [2026년 휴관 및 체험예약 공지](https://www.aviation.or.kr/view.do?boardno=24&menuno=68&seq=1925) | 첨부된 공식 이미지 2개를 브라우저로 확인. 휴관일 원칙과 별도 체험예약 오픈 일정 확인; 연간 예약 달력은 복제하지 않음 |

공식 FAQ의 어린이 연령·예약 설명과 개별 체험 페이지에 차이가 있어, 해당 프로그램의 개별 안내를 우선해 정리했다. 개별 예약 화면에서 방문일의 조건을 다시 확인하도록 안내한다. 박물관 이미지·로고를 가져다 판매용 이미지로 사용하지 않았다.

## SEO와 유지보수

- 고유 title/description/H1, canonical, OG/Twitter 메타데이터를 적용했다. 기존 네이버 인증 토큰과 GA4 측정 ID를 유지했다.
- `data/site-pages.json`에 신규 공개 경로를 등록하고 기존 빌드로 사이트맵을 생성했다. 링크가 추가된 `/gimpo/`의 lastmod도 실제 작업일로 갱신했다.
- 기존 공통 생성기가 본문에서 WebPage, BreadcrumbList, FAQPage를 생성한다. FAQ 5개의 화면 문구와 구조화 데이터가 정확하게 일치한다.
- 박물관 공식 제휴나 인증, 공식 기념품 권한을 나타내는 구조화 데이터, 새 상품 가격·재고 Offer를 추가하지 않았다.
- `llms.txt`에 공식 출처를 확인하는 방문 가이드와 예약 작업실의 구분을 추가했다.
- `/gimpo/`의 긴 선물·디저트 문단을 복제하지 않았으며 전용 테스트에서 중복 여부를 확인한다.

## 검증 결과

| 검증 | 결과 |
| --- | --- |
| `npm run site:build` | PASS. 기존 공통 생성기 사용 |
| `npm run site:check` | PASS. 공지·크리스마스·상품·기존 랜딩·RSS 회귀 포함 |
| `npm run museum:test` | PASS. 최종 4종·픽업 URL 4개·배송/문의 매핑·출처·FAQ/스키마·사이트맵·상호 링크 |
| `npm run public-seo:test` | PASS. 사이트맵 45 URL, 공개 HTML 49개 |
| `npm run public-perf:test` | PASS. 52페이지 |
| `npm run a11y:check` | PASS. 52페이지 |
| `npm run museum:browser:test` | PASS. 320/390/768/1280px, 실제 브랜드 폰트, 4종 사진, 상품 이동, 키보드·포커스·스킵 링크·FAQ·터치, no-JS, 구매 버튼의 녹색·명도 대비·동일 높이·한 줄 표시, 하단 CTA 가림, 이미지 실패 상태, 외부 구매 링크 새 탭 클릭 12회 |
| `npm run order:test` | PASS. 기존 주문·확인·견적·크리스마스 계산과 실패/중복 처리, 로컬 모의 테스트 |
| `npm run server:test` | PASS. 기존 항공편 서비스와 HTTP 전달 |
| `npm run christmas:browser:test` | PASS. PC/모바일 3 STEP, 5개 화면 폭, 상태 유지·뒤로/앞으로·갤러리·합계·검증·모의 API 성공/실패/중복 |
| `git diff --check` | PASS |

브라우저 테스트는 실제 CDN에서 HTTP 200으로 받은 폰트 바이트를 재사용해 로딩을 확인한다. 상품별 픽업예약·택배/문의와 모바일 버튼은 지정 URL로 실제 새 탭이 열리는지 검사하고, 대상 서비스 응답만 로컬에서 모의 처리한다. noopener/noreferrer 속성, null opener와 빈 referrer를 확인한다. 외부 서비스에서의 실제 주문·예약 완료는 테스트하지 않는다. GA 전송과 운영 API 쓰기는 차단하며, 운영 DB에 주문이나 공지를 생성하지 않았다. 공식 외부 링크는 출처 조사 시 확인했으며 지속적인 가용성이나 외부 예약 완료를 보장하는 테스트는 아니다.

화면 캡처, 폰트·명도 대비·콘솔·리소스 검사 결과와 디자인 검증 기록은 Git 제외 경로 `output/playwright/national-aviation-museum/`에 보관한다. 4개 화면 폭의 전체 화면·첫 화면을 확인했고, PC 상품 사진의 디코딩 완료 후 캡처도 확인했다.

## 생성·수정 파일

신규:

- `national-aviation-museum/index.html`
- `assets/national-aviation-museum.css`
- `scripts/test-national-aviation-museum.mjs`
- `scripts/test-national-aviation-museum-browser.mjs`
- `NATIONAL_AVIATION_MUSEUM_REPORT.md`

수정:

- `data/site-pages.json` — 공개 경로 등록과 김포 허브 수정일
- `gimpo/index.html` — 탐색 링크와 생성된 수정일
- `sitemap.xml` — 공통 생성기 결과
- `llms.txt` — 신규 가이드 출처
- `package.json` — 전용 테스트 명령과 site:check 연결
- `scripts/test-public-seo.mjs` — 김포 허브의 갱신된 실제 수정일 검증

기존 김포공항 도착정보 페이지·항공편 API 코드, 주문 코드와 크리스마스 화면은 수정하지 않았다.

## 미확인 정보와 작업 상태

- 일반 전시의 방문일별 별도 예약 조건, 실시간 체험 잔여석·주차 여유, 현장 유모차 대여 가능 수량은 확인·보장하지 않는다. 일반 전시는 무조건 예약 없이 입장할 수 있다고 쓰지 않았다.
- 개별 전시실 임시 휴관의 상세 일정, 실시간 현장 운영은 별도 공지 재확인이 필요하다. 현재 페이지는 공식 관람안내에 근거한 기본 정보와 원문 링크를 제공한다.
- 박물관에서 작업실까지의 도보·차량 시간, 쿠키 재고·당일 제작 가능 여부, 배송료·도착일은 추측하지 않았다.
- 구현과 로컬 검증 완료. 커밋·푸시·운영 배포는 실행하지 않았다. 배포 전 박물관의 변동 가능한 안내를 재확인해야 한다.

## 상품별 구매 채널

| 상품 | 네이버 픽업예약 | 택배 |
| --- | --- | --- |
| COOKIE FLIGHT | https://naver.me/Ge7SnJnC | https://mkt.shopping.naver.com/link/6ad84808a30a4751f926bfde |
| COOKIE CREW | https://naver.me/FjmgqAUo | 카카오톡으로 가능 여부 문의 |
| TERMINAL 샌드쿠키 | https://naver.me/GArtG2FK | https://mkt.shopping.naver.com/link/6ad84808bb270c6ca6310878 |
| 수제 꾸덕쿠키 | https://naver.me/FQuvqNt0 | 카카오톡으로 가능 여부 문의 |

카카오톡: https://pf.kakao.com/_QdCaK/chat. 픽업 URL 4개는 사용자가 제공한 상품별 주소를 그대로 사용한다. 박물관 공식 예약 링크는 기존 본문에서 유지한다.
