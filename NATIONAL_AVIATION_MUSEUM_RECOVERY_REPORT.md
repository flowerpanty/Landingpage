# 국립항공박물관 검색·방문 UX 점검 결과

작업일·공식 정보 확인일: 2026-10-29 (KST)

기준: main `5274186`, 작업 시작 시 clean

대상: `/national-aviation-museum/`

상태: 로컬 구현·검증 완료. 커밋·푸시·운영 배포하지 않음.

## 1. 기술 점검: 운영본 관찰과 로컬 수정 구분

운영 URL에 읽기 요청만 보내 확인했다. 아래 결과는 Google·네이버의 실제 수집 이력이나 색인 결과가 아니다.

| 항목 | 운영본 관찰 | 이번 로컬 변경 |
| --- | --- | --- |
| 정규 URL | HTTP 200, HTML 본문 제공 | 유지 |
| 모바일·데스크톱·Googlebot·Yeti UA 요청 | 모두 200, 정적 H1·주차 본문 확인 | 동일 4개 UA의 로컬 본문 확인 |
| robots.txt | 전체 허용, 관리자·API 경로만 제외 | 변경 없음 |
| robots 메타 / X-Robots-Tag | index,follow / 차단 헤더 없음 | 유지 |
| canonical | 자기 참조 HTTPS·apex·후행 슬래시 URL | 유지 |
| HTTP 및 www URL | 정규 URL로 301 | 변경 없음 |
| 슬래시 없는 URL, index.html | 둘 다 같은 내용으로 200 응답 | 기존 redirect 레지스트리로 정규 URL에 301 추가 |
| 사이트맵·JSON-LD 수정일 | 2026-10-26으로 일치 | 실제 본문 변경일 2026-10-29로 일치 |

관찰한 범위에서는 명시적인 수집 차단을 발견하지 못했다. UA 문자열을 사용한 요청은 검색엔진 IP에서의 실제 수집 성공을 증명하지 않는다. 두 중복 주소의 301 정리는 로컬 GET·HEAD와 쿼리 포함 요청으로 검증했으며, 미배포 상태이므로 운영본에는 아직 적용되지 않았다. 중복 URL이 검색 노출 부진을 일으켰다는 인과관계도 확인하지 못했다.

## 2. 방문 정보 구조와 상품 동선 비교

- Title과 H1을 유지하고 description·OG/Twitter description을 무료 전시, 체험, 주차 계산, 아이 대상 조건, 공항역 이동 안내 중심으로 동기화했다.
- 첫 화면은 입장료·관람시간·주차·예약 4개 요약과 공식 홈페이지 링크로 구성했다. 위치·주소는 상세 이동 안내에 유지했다.
- 기존 큰 COOKIE FLIGHT 실물 사진은 하단 컬렉션의 작은 사진으로 이동하고 원본 비율을 유지했다. 새 사진이나 가상 박물관 사진은 만들지 않았다.
- 주차 계산은 공식 기본요금과 추가 과금 횟수를 적용한 0원 / 1,000원 / 1,500원 / 2,000원 예시다. 공식 문구에서 시간 경계를 추가 해석하지 않도록 임의의 ‘1시간·2시간 총액’을 제시하지 않았다. 차종·할인·실제 정산 금액은 구분한다.
- 어린이공항체험과 블랙이글스의 대상·예약 방식·요금을 비교하고, 연령·신장 / 회차·잔여석 / 보호자 대기 조건의 체크리스트를 추가했다. 전체 안전 제한은 공식 원문으로 연결한다.
- 김포공항역 → 국내선 1층 → 표지·제2주차장 방면 이동과 Gate4 셔틀 노선별 하차 지점을 구분했다. 약 400m를 역 전체 이동 거리나 소요시간으로 확대하지 않았다.
- HS-748 특별전의 기간·장소를 재확인하고 전시 등록, 임시 휴실, 별도 관람 조건, 체험 회차 중복을 확인하도록 안내했다.
- FAQ 9개를 유지하고 표시된 답변과 생성 JSON-LD의 일치를 검증했다. Museum을 페이지 주제로, 자사 Organization/Bakery를 발행·작업실 엔터티로 구분하고 상품 ItemList는 mentions로 연결했다.

브랜드 폰트를 로딩한 900px 높이 브라우저에서 방문 요약 시작 위치:

| 화면 너비 | 변경 전 | 변경 후 |
| --- | ---: | ---: |
| 390px | 약 1,086px | 약 426px |
| 1280px | 약 739px | 146px |

모든 검수 너비에서 4개 요약이 첫 화면에 표시된다. 320·390 × 844px 터치 환경에서도 요약 마지막 카드가 하단 구매 메뉴에 가려지지 않는다. 더 낮은 화면이나 확대 환경에서는 일반 스크롤로 이용한다.

구매 영역의 4종 카드 HTML, 모바일 플로팅 HTML, 전용 클릭 분석 JS는 작업 전과 바이트 단위로 동일함을 확인했다. 상품 사진·제목의 상세 이동, 상품별 픽업예약 4개, COOKIE FLIGHT·TERMINAL 택배주문 2개, 나머지 상품의 카카오톡 택배 문의를 모두 유지했다. 상단 ‘쿠키 선물 보기’로 컬렉션에 바로 이동하며 모바일 플로팅은 기존 COOKIE FLIGHT 기준을 유지한다. 외부 구매 버튼 클릭을 예약·구매 완료로 기록하지 않는다.

## 3. 공식 출처

확인일은 모두 2026-10-29다. 변경 가능한 조건은 방문일에 원문을 다시 확인하도록 페이지에 표시했다.

- [관람·요금·휴관·주소·이동·관람 유의사항](https://www.aviation.or.kr/contents.do?menuno=65)
- [한국어 주차 운영시간·요금·할인](https://www.aviation.or.kr/contents.do?menuno=168)
- [어린이공항체험 연령·시간·요금·보호자 조건](https://www.aviation.or.kr/contents.do?menuno=311&tabno=4)
- [블랙이글스 요금·예약·안전 제한](https://www.aviation.or.kr/contents.do?menuno=311)
- [박물관 공식 체험예약](https://www.aviation.or.kr/reservation.do?gcode=gcode1&menuno=189)
- [현재전시 목록](https://www.aviation.or.kr/board.do?boardno=51&menuno=75), [HS-748 특별전 상세](https://www.aviation.or.kr/view.do?boardno=51&menuno=75&seq=2062)
- [공식 홈페이지](https://www.aviation.or.kr/index.do), [운영 공지사항](https://www.aviation.or.kr/board.do?boardno=24&menuno=68)

주차 운영시간은 한국어 공식 안내의 08:00~20:00을 사용했다. 영문 안내와 시간이 달라 영문 값을 혼합하지 않았다. 실시간 잔여석·주차 가능 대수·셔틀 배차·전체 이동 소요시간·일반 관람의 방문일별 예외 조건은 확정하지 않는다.

## 4. 내부 링크·수정일

홈과 김포공항 허브·출발 체크리스트의 기존 링크 문맥을 방문 의도에 맞게 정리하고, 픽업 안내에 박물관과 작업실의 주소가 다르다는 설명과 이동 안내 링크를 하나 추가했다. 각 페이지에서 박물관 링크는 하나씩 유지한다. 별도 가이드 URL은 만들지 않았다.

박물관·김포공항 허브·픽업·출발 체크리스트의 실제 변경일을 레지스트리·사이트맵·JSON-LD에 반영했다. 홈페이지 날짜는 기존에도 같은 날짜였다. 기존 생성 규칙에 따라 출발 체크리스트의 RSS 날짜도 갱신됐다. llms.txt는 기존 공식 확인일 한 곳만 맞췄다.

## 5. 검증 결과

요청의 축약 명령 대신 저장소에 실제 등록된 스크립트를 실행했다.

| 검사 | 결과 |
| --- | --- |
| npm run site:build | PASS, 재빌드 후 본문·메타·FAQ·스키마 일치 |
| npm run museum:test | PASS, 방문 정보·계산 예시·4종·정확한 URL·FAQ·엔터티·수정일 |
| npm run museum:browser:test | PASS, 320/390/768/1280/1440px 및 모바일 844px 높이 |
| npm run site:check | PASS, 전체 사이트 생성물·링크·스키마·기존 랜딩 회귀 |
| npm run public-seo:test | PASS, 사이트맵 45 URL·공개 HTML 49개 |
| npm run public-perf:test | PASS, 52페이지 정적 성능 규칙 검사 |
| npm run a11y:check | PASS, 52페이지 정적 접근성 검사 |
| npm run server:test | PASS, 별칭 GET/HEAD 301·기존 항공편·관리자 인증 검색 성과 API 회귀 |
| npm run order:test | PASS, 기존 주문 검증·오류·중복·가격 재계산, 로컬 모의 테스트 |
| git diff --check | PASS |

브라우저에서는 실제 브랜드 폰트, 가로 넘침 없음, 44px 이상 링크/48px 구매 버튼, 키보드·포커스·FAQ, 색상 대비 4.5:1 이상, 스티키 가림, 정적 콘텐츠와 JS 비활성 상태를 확인했다. 상품 상세 8개 이동, 구매 채널 모의 팝업 16건과 공식 홈페이지 모의 팝업, 새 탭 opener/referrer 제거, 분석 중복·비공개 URL 값 제외, 분석 차단·이미지 실패 시 구매 링크 유지도 검증했다. 로컬 JS 오류·누락 리소스·쓰기 요청은 0건이었다.

성능 스크립트 결과는 정적 규칙 검사이며 실사용자 Core Web Vitals나 검색 순위 측정 결과가 아니다. 구매 채널은 로컬 모의 응답으로 이동을 확인했으며 실제 주문·예약·결제를 생성하지 않았다. 크리스마스 HTML·카탈로그와 server.js는 HEAD와 동일하다.

상세 증거는 Git에서 제외되는 output/playwright/museum-recovery/의 운영 전·로컬 후 HTTP JSON과 output/playwright/national-aviation-museum/의 브라우저 결과·너비별 화면에 저장했다.

## 6. 실제 색인 확인 필요

- Google Search Console의 URL 검사에서 현재 색인 여부, Google 선택 canonical, 최근 크롤링과 제외 사유를 확인해야 한다.
- 네이버 서치어드바이저에서 해당 URL의 수집·색인 상태와 수집 오류를 확인해야 한다.
- 이번 작업에서는 두 콘솔의 실제 URL 검사 결과를 확보하지 않았다. 색인 완료·순위 회복·노출 개선을 주장하지 않는다.
- 로컬 301 및 콘텐츠 변경은 검수 후 별도 배포가 필요하며, 배포 이후 운영 응답을 다시 확인해야 한다.

## 7. 변경 파일

- national-aviation-museum/index.html
- assets/national-aviation-museum.css
- index.html
- gimpo/index.html
- pickup/index.html
- guides/gimpo-airport-departure-checklist/index.html
- data/site-pages.json
- scripts/generate-jsonld.mjs
- sitemap.xml
- feed.xml
- llms.txt
- scripts/test-national-aviation-museum.mjs
- scripts/test-national-aviation-museum-browser.mjs
- scripts/test-public-seo.mjs
- scripts/test-server-http.mjs
- NATIONAL_AVIATION_MUSEUM_RECOVERY_REPORT.md
