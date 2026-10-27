# Christmas 2026 · 검색 대표 이미지 적용

2026-10-27 · main 기준 55bd7eb · 작업 시작 시 clean

## 결과

- 신규 파일: `/images/christmas/christmas-2026-gifts-1200x630.jpg`
- 형식·크기: JPEG, **1200×630px**, **112,852 bytes (약 110KiB)**
- 기존 `brookie-set.webp`, `santa-bundle.webp` 사진을 원본 비율 그대로 축소해 크림 배경에 나란히 배치했다. 사진을 자르거나 쿠키·포장 구성을 변경하지 않았고, 추가 문구나 생성 이미지도 사용하지 않았다. 산타꾸러미 원본에 포함된 포장·낱개 연출은 그대로 보존했다.
- 상단 실제 `<img>`에 같은 파일, 구체적인 alt, width/height, eager/high priority를 적용했다. PC는 소개 옆, 모바일은 제목 아래 짧은 소개 옆에 배치한다. CSS에서 가로 비율을 유지하고 이미지 공간을 미리 확보한다.
- `og:image`, `twitter:image`, 양쪽 alt, OG 1200/630 및 `image/jpeg`를 일치시켰다. 기존 title·description·canonical·GA4·네이버 인증은 유지했다.
- 기존 스키마 생성기가 CollectionPage의 primaryImageOfPage를 새 이미지로 동기화한다. 상품 ItemList의 개별 실물 사진·구성·가격은 그대로다.
- 페이지 변경일을 2026-10-27로 갱신하고 사이트맵·JSON-LD에 반영했다. 상품 카탈로그와 상품 수정일은 바꾸지 않았다.

## 생성·유지보수

이미지 경로·크기·alt와 원본 사진/배치는 `data/christmas-media.json`에서 관리한다. `build-christmas.mjs`가 OG/Twitter와 상단 이미지 HTML을 이 설정에서 생성한다.

이미지 재제작 명령:

```sh
node scripts/build-christmas-thumbnail.mjs
```

이 명령은 Sharp로 기존 사진을 contain 방식으로 배치하고 JPG를 저장한다. Sharp는 로컬 설치 또는 `SHARP_MODULE_PATH`, Codex 번들 경로에서 읽는다. 일반 `site:build`에는 Sharp가 필요하지 않으며 저장된 JPG를 그대로 사용한다. 새 프로젝트 의존성을 추가하지 않았다.

`site:build`를 다시 실행해 HTML·JPG 바이트·미디어 설정·카탈로그·사이트맵의 SHA-256이 유지됨을 확인했다.

## 접근·발견 가능 여부

- 로컬 직접 이미지 GET: 일반 브라우저, Googlebot-Image, Yeti, bingbot, facebookexternalhit, Twitterbot User-Agent 모두 **200 / Content-Type: image/jpeg**. 인증·쿠키·리퍼러 없이 접근하며 응답 바이트가 저장된 JPG와 일치한다.
- 로컬 HEAD: **200 / image/jpeg**. 이미지 색인 제한 X-Robots-Tag 없음.
- 정적 HTML에 OG/Twitter URL과 실제 img src가 포함되며 JavaScript를 꺼도 대표 이미지가 보인다.
- 저장소 및 [운영 robots.txt](https://nothingmatters.co.kr/robots.txt)는 `/christmas/`, `/images/christmas/`를 허용한다. robots 파일은 변경하지 않았다.
- 운영 사이트 읽기 점검: 크리스마스 페이지와 기존 브루키 사진은 Googlebot-Image·Yeti·bingbot·facebookexternalhit·Twitterbot User-Agent에서 200으로 응답했고 색인 제한 헤더가 없었다. 이는 User-Agent를 지정한 HTTP 점검이며 검색엔진이 실제로 재수집한 결과는 아니다.
- **신규 JPG의 운영 URL은 배포 전이므로 현재 404다.** 운영에서 신규 이미지의 200 응답·메타 반영 여부는 배포 후 확인해야 한다. 이번 작업에서 배포하지 않았다.
- 검색 썸네일 선택·캐시 갱신·검색 노출은 검색 서비스가 결정하며 이번 로컬 작업에서 확인하지 않았다.

운영 예정 URL: https://nothingmatters.co.kr/images/christmas/christmas-2026-gifts-1200x630.jpg
로컬 미리보기: http://127.0.0.1:4183/christmas/

## 검증

모두 PASS:

- `npm run site:build` 및 반복 빌드 보존 검사
- `npm run christmas:check`
- `node scripts/test-christmas-landing.mjs`
- `npm run christmas:browser:test`
- `npm run site:check`
- `npm run public-seo:test` (site:check에서 실행)
- `public-perf:test`, `a11y:check` (site:check에서 각각 52페이지)
- `git diff --check`

320 / 390 / 430 / 768 / 1024 / 1280 / 1440px에서 대표 이미지 1200×630 정상 로딩·비율·초기 화면 노출, 상품 선택 접근, 가로 넘침 없음, PC sticky 요약, 모바일 하단 CTA·입력 중 숨김을 검증했다. 모바일·PC 스크린샷도 확인했다.

기존 4 SKU와 가격, 세트 별도 계산, 실제 상품 갤러리, 수량 0·잘못된 수량, 앞/뒤 이동과 입력 유지, 개인정보 제외 검사를 통과했다. API 성공·중복·오류 상태는 로컬 모의 응답으로 검증했고 운영 주문을 생성하지 않았다. 온라인 주문 신청 준비 중 상태와 카카오톡 상담 흐름을 보존했다.

이미지 HTTP/화면 증거: `output/playwright/christmas-3step/evidence.json`, `output/playwright/christmas-thumbnail/production-ua-check.json` 및 화면 캡처 (Git 제외).

## 변경 파일

1. `images/christmas/christmas-2026-gifts-1200x630.jpg` — 실제 사진 기반 대표 이미지
2. `data/christmas-media.json` — 대표 이미지·원본 사진·배치 정보
3. `scripts/build-christmas-thumbnail.mjs` — 선택적 이미지 재제작 명령
4. `scripts/build-christmas.mjs` — 대표 이미지 메타·상단 HTML 생성
5. `christmas/index.html` — OG/Twitter·실제 img·primaryImageOfPage·수정일
6. `assets/christmas.css` — 상단 이미지 반응형 배치
7. `data/site-pages.json` — 크리스마스 페이지 수정일
8. `sitemap.xml` — 같은 수정일 반영
9. `scripts/test-christmas-landing.mjs` — 정적 이미지·메타·JPEG·robots 검증
10. `scripts/test-christmas-browser.mjs` — 이미지 HTTP/크롤러 UA·화면·JS 비의존성 검증
11. `CHRISTMAS-2026-THUMBNAIL-REPORT.md` — 이 보고서

커밋·푸시·운영 배포를 하지 않았다.
