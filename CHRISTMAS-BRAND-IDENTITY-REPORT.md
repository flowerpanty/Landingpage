# Christmas brand identity · 2026-10-31

기준: `main` / `6dda3ca`, 작업 시작 시 clean. 대상: `/christmas/`.
커밋·푸시·운영 배포는 하지 않았다.

공식 홈페이지의 SeoulNotice / PretendardDisplay, 크림·블랙·오렌지·옐로, 곰돌이 마크를 크리스마스 전용 CSS에 반영했다. 전역 CSS와 주문 실행 코드는 수정하지 않았다.

**실제 반영 내용**

- 홈페이지의 `assets/site.css` 서체 선언, `assets/showroom.css` 기본 색상, `assets/showroom-home.css` 버튼 색상·검정 테두리·그림자를 참조했다. 글로벌 스타일시트는 가져오지 않는다.
- HERO의 SEO H1을 유지하고 “작은 쿠키에 담은, 커다란 크리스마스.”와 요청한 작업실·시즌 소개를 추가했다. 생성기의 HERO 본문도 함께 수정했다.
- 기존 곰돌이 SVG를 헤더와 ABOUT에 재사용했다. 상품 사진과 대표 JPG는 그대로다. 신규 이미지·런타임 JS·애니메이션 의존성은 추가하지 않았다.
- 헤더에 공식 홈페이지·Instagram·기존 주문 상담을 배치했다. ABOUT과 푸터에도 공식 채널을 연결했다. Instagram은 정확한 계정 URL, 새 탭, `noopener noreferrer`를 사용한다.
- 3 STEP 주문 영역 다음에 정적 ABOUT을 추가했다. 실제 주소, 예약 제작·예약 픽업, 현장 즉시 구매 불가, 카카오톡 최종 주문 확정을 안내한다.
- 모바일에서는 헤더를 두 줄로 정리하고 상품 가격 요약을 압축했다. 320×667에서도 첫 상품 사진 버튼의 44px 영역이 하단 고정 바 위에 있다.
- 페이지 실제 수정일을 `2026-10-31`로 갱신했다. CollectionPage와 사이트맵에 반영했으며 상품 카탈로그 수정일은 변경하지 않았다.

**보존 검증**

기준 커밋과 비교해 Title·Description·canonical·OG/Twitter·네이버 인증·GA4 메타, 주문 영역 HTML 전체, FAQ HTML 13개가 동일하다. 카탈로그·사진 설정·주문 JS·대표 JPG의 SHA-256도 동일하다. 기존 Organization/Bakery의 Instagram `sameAs`는 각 엔터티에 한 번만 유지한다.

상품은 곰돌이 브루키 8,500원, 트리 브루키 9,000원, 브루키 2종 세트 17,000원, 산타꾸러미 4종 23,000원이다. 온라인 신청 준비 중 상태와 카카오톡 최종 상담을 유지한다.

**변경 파일**

| 파일 | 내용 |
| --- | --- |
| `christmas/index.html` | 헤더·HERO·정적 ABOUT·푸터·폰트 연결 사전 준비·페이지 수정일 |
| `assets/christmas.css` | 브랜드 서체·색상·버튼·카드·반응형 헤더·ABOUT |
| `scripts/build-christmas.mjs` | 재빌드 시 유지할 브랜드 HERO 본문 |
| `data/site-pages.json` | 크리스마스 페이지 수정일 |
| `sitemap.xml` | 크리스마스 lastmod 동기화 |
| `scripts/test-christmas-landing.mjs` | 브랜드 콘텐츠·공식 채널·서체 소스·schema 정합성 검사 |
| `scripts/test-christmas-browser.mjs` | 실제 폰트·명도 대비·헤더 터치/겹침·홈 이동·Instagram 새 탭·정적 ABOUT 검사 |
| `CHRISTMAS-BRAND-IDENTITY-REPORT.md` | 변경·검증·기존 실패 사항·화면 비교 보고 |

**테스트 결과**

| 실행 | 결과 |
| --- | --- |
| `npm run site:build` | 통과 |
| `npm run christmas:check` | 통과 |
| `node scripts/test-christmas-landing.mjs` | 통과 |
| `npm run christmas:browser:test` | 통과 |
| `npm run public-perf:test` | 53페이지 통과 |
| `npm run order:test` | 통과, 운영 주문 생성 없음 |
| `git diff --check` | 통과 |
| `npm run site:check` / `npm run public-seo:test` | 기존 `/wishing-tree/` 페이지 등록 누락으로 실패 |
| `npm run a11y:check` | 기존 `wishing-tree/index.html`에 공통 `data-nm-skip-link` 마커가 없어 실패 |

전체 검사 실패 두 건은 별도로 추출한 수정 전 `6dda3ca` 사본에서도 동일하게 재현했다. 빌드가 `wishing-tree/index.html`에 생성한 접근성 변경은 이번 범위에서 제외하여 원래 파일을 보존했다. 해당 페이지에는 자체 건너뛰기 링크가 있으나 공통 검사 계약과 일치하지 않는다. 크리스마스의 건너뛰기 링크·포커스·감소된 모션·모달 키보드 검사는 통과했다.

`site:check` 중단 이후 실행되지 않는 occasion·flight-attendant·anniversary·feed 검사도 개별 실행하여 통과했다. 중단 이전 magok·museum·notices·products·schema 검사는 통과했다.

브라우저는 320 / 390 / 430 / 768 / 1024 / 1280 / 1440px에서 3단계를 검사했다. 뒤로 가기, 세트 독립 계산, 입력 검증, 갤러리, 입력 중 하단 바 숨김, 중복 접수·오류·저장 금액 불일치, 개인정보 URL/분석 제외를 로컬 모의 API로 검증했다. 운영 DB에는 주문을 만들지 않았다.

서체 4개는 실제 CDN HTTP 200 바이트로 검증했다. 주요 버튼 글자 대비는 7.86:1 이상, 소개 본문 6.29:1, 입력 테두리 4.22:1이다. 로컬 Chromium의 CLS는 0.1 이하였으며, 실제 느린 네트워크나 운영 현장 성능을 의미하지 않는다. 외부 CDN 서체 의존성은 기존 홈페이지와 같다.

**화면 비교 및 로컬 확인**

- 실제 페이지: <http://127.0.0.1:4188/christmas/>
- PC 1280px·모바일 390px 변경 전후: <http://127.0.0.1:4188/output/playwright/christmas-brand/comparison.html>
- 비교 PNG·전체 페이지·ABOUT·서체·보존·기준 커밋 검사 증거: `output/playwright/christmas-brand/`
- 7개 폭의 각 단계·갤러리·JS 비활성 화면·로컬 모의 주문·JSON 증거: `output/playwright/christmas-3step/`

화면 비교에서 기존 빨강·초록 중심 텍스트/버튼과 시스템 서체를 브랜드의 굵은 서체, 크림·검정, 오렌지·옐로 버튼으로 교체한 것을 확인했다. PC 오른쪽 주문 요약과 모바일 하단 CTA를 유지했다. 캡처와 테스트 증거는 Git에서 제외된 로컬 출력이다.
