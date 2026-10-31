# 크리스마스 쇼룸 · 실제 작업실 외관 적용

작업일: 2026-10-31. 기준: `main` / `6dda3ca`와 기존 미커밋 브랜드·대형 사진 작업. 커밋·푸시·운영 배포는 하지 않았다.

**실제 매장 사진 적용**

사용자가 첨부한 `codex-clipboard-083b0f44-0b1b-4ee7-a33f-a9de8387d872.png`에 직접 접근하여 노란 COOKIE 간판, NOTHING MATTERS 유리창 로고와 쿠키 캐릭터를 확인했다. 해당 원본을 그대로 인코딩한 사진을 ABOUT NOTHINGMATTERS에 적용했다. 임의의 매장 사진이나 생성 이미지는 사용하지 않았다.

| 항목 | 결과 |
| --- | --- |
| 원본 | PNG, 842×748px, 1,274,166바이트 |
| WebP | `images/christmas/nothingmatters-workshop-exterior.webp`, 129,434바이트 |
| JPG | `images/christmas/nothingmatters-workshop-exterior.jpg`, 151,800바이트 |
| 변환 | 크롭·회전·리사이즈·생성 편집 없이 형식과 압축만 변경 |
| 웹 표시 | `<picture>`의 WebP와 JPG 대체 이미지, 842×748 크기 속성, lazy loading |
| 프레이밍 | 원본 비율과 `object-fit: contain` 유지, 원본 해상도 이상으로 확대하지 않음 |

alt는 “노란 COOKIE 간판과 NOTHING MATTERS 유리창 로고, 쿠키 캐릭터가 보이는 낫띵메터스 실제 매장 외관”이다. 이미지 설정은 `data/christmas-media.json`의 `workshop`에서 관리한다. 기존 `representative` 설정과 OG 대표 JPG는 그대로다.

**최종 화면**

대형 크리스마스 HERO, 짧은 H1·브랜드 카피, PC 2열·모바일 1열의 상품 사진 카드와 사진 아래 가격·수량 선택 구조를 유지했다. 기존 폰트·곰돌이·크림·블랙·오렌지·옐로와 공식 채널 링크도 보존했다.

ABOUT에는 실제 외관 사진과 다음 문구를 반영했다.

> 이 쿠키는 여기서 만들어요.
>
> 낫띵메터스는 서울 강서구 공항동에서 귀여운 캐릭터 쿠키와 마음을 전하는 선물을 만드는 작은 쿠키 작업실이에요.
>
> 올해 크리스마스에도 곰돌이와 트리, 산타와 루돌프를 쿠키에 담았습니다.

서울특별시 강서구 송정로 25 1층, 사전 예약 제작·예약 픽업, 예약 없이 방문하면 즉시 구매할 쿠키가 없다는 안내, 카카오톡 최종 주문 확정을 유지했다. 홈페이지와 Instagram 링크는 추가로 중복시키지 않았다.

매장 사진의 브라우저 실측 너비는 320px 화면에서 248px, 390px에서 318px, 430px에서 358px, PC 1280px에서 616px, 1440px에서 약 629px다. 모든 화면에서 원본 842:748 비율과 전체 간판·유리창 영역을 확인했다.

**보존 확인**

작업 시작 상태와 비교해 SEO head 메타·canonical·OG/Twitter·전체 JSON-LD·FAQ가 동일하다. HERO, 상품 카드, 가격 요약, 긴 구매·SEO 가이드의 HTML도 동일하다. 모든 기존 DOM ID와 input/button/textarea/form 속성을 보존했다.

상품 4종의 SKU·순서·가격, 카탈로그, 주문 실행 JS, 대표 JPG, 마곡 참조 페이지, 기존 페이지 수정일·사이트맵 및 앞선 보고서는 변경하지 않았다. 현재 수정일과 사이트맵은 실제 작업일 `2026-10-31`과 일치한다. 온라인 신청 준비 중 상태와 카카오톡 상담 흐름을 유지한다.

**이번 변경 파일**

- `christmas/index.html`: 실제 외관 사진과 요청한 ABOUT 문구.
- `assets/christmas.css`: 실제 외관의 자연 비율, PC 사진 영역 비중.
- `data/christmas-media.json`: 실제 작업실 사진과 JPG 대체 이미지 정보.
- `scripts/build-christmas.mjs`: 재빌드 후에도 외관 사진·제목·소개를 유지하는 생성 경로.
- `scripts/test-christmas-landing.mjs`: 외관 파일·형식·크기·alt·문구·SEO 보존 검사.
- `scripts/test-christmas-browser.mjs`: 실제 이미지 로딩·비율·명도·JPG 대체·디코딩 후 캡처 검사와 기존 주문 회귀.
- 위 WebP/JPG 이미지 2개와 이 보고서.

**테스트 결과**

| 실행 | 결과 |
| --- | --- |
| `npm run site:build` | 통과 |
| `npm run christmas:check` | 통과 |
| `node scripts/test-christmas-landing.mjs` | 통과 |
| `npm run christmas:browser:test` | 통과 |
| `npm run order:test` | 통과, 로컬 모의 API만 사용 |
| `git diff --check` | 통과 |
| `npm run site:check` | 기존 `/wishing-tree/`의 페이지 등록 누락으로 실패 |

추가 성능 검사는 53페이지 통과했다. 전체 접근성 검사는 기존 `wishing-tree/index.html`의 공통 접근성 마커 누락으로 실패한다. 두 문제는 앞선 작업에서 수정 전 기준 커밋 사본에서도 확인한 기존 상태이며 해당 페이지는 수정하지 않았다. 빌드가 추가한 해당 페이지의 마크업은 이번 범위에서 제외했다. 전체 검사 중단 이후의 occasion·flight-attendant·anniversary·feed 검사도 개별 통과했다.

브라우저에서는 요청한 320·390·430·1280·1440px에 768·1024px를 더해 검사했다. 큰 HERO·상품 사진·실제 외관의 크기와 가로 넘침, 실제 수량 버튼 클릭, 단품·세트 계산, 3 STEP·뒤로 가기·리사이즈 시 입력 유지, 갤러리·키보드·터치 영역, 고정 바와 입력창, 오류·중복 제출·개인정보 보호를 검증했다.

새 WebP와 JPG는 로컬 서버에서 각각 HTTP 200과 `image/webp`, `image/jpeg`를 확인했다. 390·1280px에서는 WebP 소스를 테스트 안에서 비활성화하여 실제 JPG 대체 로딩과 동일한 표시 높이를 확인한 뒤 복원했다. 운영 DB에는 주문을 생성하지 않았다.

**브라우저 화면과 증거**

- 매장 사진 미리보기: <http://127.0.0.1:4188/christmas/#about-nothingmatters>
- 매장 사진 적용 전후 및 마곡/크리스마스 비교: <http://127.0.0.1:4188/output/playwright/christmas-storefront/comparison.html>
- `output/playwright/christmas-storefront/`: PC 1280·모바일 390px ABOUT 전후, 마곡 참조 화면, 최종 5개 화면 폭의 HERO·상품·ABOUT, 전체 페이지 캡처.
- `photo-source.json`: 원본 SHA-256·크기와 변환 결과.
- `regression-preservation.json`: SEO·주문·기존 작업 보존 결과.
- `storefront-evidence.json` 및 `output/playwright/christmas-3step/evidence.json`: 실물 사진 표시·대체 이미지·전체 주문 회귀와 로컬 성능 증거.

캡처는 실제 브랜드 폰트와 실제 사진을 사용한다. 모바일 사진이 디코딩되기 전에 캡처되는 경우를 확인하여, 이미지 디코딩과 페인트 완료 후 다시 저장하도록 검수를 보완했다. 로컬 검수 자료는 Git에서 제외되며, 로컬 성능 관찰은 운영 현장 성능이나 검색 색인 결과를 의미하지 않는다.
