# Public site registry

`site-pages.json` is the canonical registry for public routes, redirects, indexing, sitemap inclusion, product primary URLs, product order URLs, and product schema metadata. Build and SEO checks consume it directly; do not add a second product metadata map in scripts.

- `cardStatus: "new"` adds a `NEW` badge inside `OUR COOKIES`; every registry product is added to the product grid. The `NM_NEW_ARRIVAL` build marker remains as an intentionally empty contract block.
- `detailPageMode: "generated"` creates `/products/{slug}/index.html` from the shared template.
- `detailPageMode: "existing"` keeps the current hand-written product page.
- Update `updatedAt` when a generated product changes.
- A page's optional `about` object describes its subject in the generated WebPage schema. It does not change the brand publisher or business entity.
- `/order` intentionally has no trailing slash. Its original product builder UIs live at `/order/{slug}`, and `orderProducts` records those slugs and their existing product canonical URLs. Only the order hub is added to the sitemap; the builders retain product-detail canonicals.
- `order/assets` is a self-contained snapshot of the original Railway UI, not a generated product-detail page. Keep quantity, pricing, validation, quote and confirmation behavior aligned with the order backend when updating it.

After editing the catalog, run:

```bash
npm run site:build
npm run site:check
```
# 공식 공지사항

`notices.json`이 공지의 단일 소스입니다. `slug`, `title`, `summary`, `category`, `publishedAt`, `modifiedAt`, `status`(`published` / `draft` / `archived`), `pinned`, `content`를 관리합니다. 날짜는 실제 작성·수정일을 한국 기준 `YYYY-MM-DD`로 기록하고, 공지를 변경하면 `updatedAt`도 함께 갱신합니다. 초기 3건의 작성일은 2026-10-24이며 배포일을 뜻하지 않습니다. 관리자 발행에서는 서버의 한국 날짜를 사용합니다.

본문 블록은 `paragraph`, `heading`, `list`, `links`를 사용합니다. `christmasProducts`는 기존 크리스마스 카탈로그의 구성·가격을 읽고, `shippingProducts`는 검증된 3개 기존 상품 페이지에서 정확한 스마트스토어 링크를 읽습니다. 링크를 찾지 못하거나 데이터가 잘못되면 빌드를 실패시킵니다.

`npm run site:build`로 목록·상세 HTML, 홈페이지 최근 3건, `/notice/feed.xml`, 공개 URL 레지스트리·사이트맵, 구조화 데이터, llms 출처가 함께 갱신됩니다. `npm run site:check`와 `npm run notices:browser:test`로 검증합니다. 생성된 `/notice/` HTML을 직접 편집하지 않습니다. 목록은 주요 공지 우선 후 게시일 내림차순이며, 홈페이지도 고정 공지를 우선하며, RSS는 고정 여부와 관계없이 최신 게시일 순입니다. 같은 날짜는 데이터 순서를 따릅니다.

`draft`와 `archived`는 목록·RSS·사이트맵·llms에서 제외되며, 이전에 생성한 상세 HTML도 제거됩니다. 이미 배포된 글의 공개를 내리려면 변경 후 재배포가 필요합니다. `/feed.xml`은 기존 쿠키 가이드 RSS로 유지됩니다. 관리자 로그인이나 공지 DB는 사용하지 않습니다.

## 관리자와 영구 원본

운영 관리자 설정과 접속·복구 방법은 `NOTICE_ADMIN_REPORT.md`를 확인합니다. `/notice/admin/`는 별도 환경변수 인증과 서버 세션을 사용하며 검색에서 제외됩니다. 글 편집·미리보기·임시저장·발행·비공개·상단 고정을 지원합니다.

영구 저장소를 연결하기 전 `notices.json`은 공개 공지의 원본입니다. 첫 연결 시 이 데이터를 외부 볼륨의 `notices-state.json`으로 가져오며, 이후에는 볼륨 데이터가 운영 원본입니다. 소스 JSON이나 재배포가 기존 운영 글을 덮어쓰지 않습니다. `npm run site:build`는 계속 정적 배포용 시드를 생성하고, 운영 서버는 동일한 렌더러·스키마·사이트맵 생성 함수를 사용해 저장된 공개 글을 서버에서 제공합니다. 공개된 글의 임시저장은 별도의 비공개 초안으로 관리합니다.

외부 볼륨이 검증되지 않으면 저장·발행을 비활성화합니다. 저장소가 손상되면 과거 시드 공지를 다시 공개하지 않고 공지 응답을 중단하며, 홈페이지 상품 영역은 유지합니다. 관리자 검증은 `npm run notices:admin:test`, `npm run notices:admin:browser:test`를 사용합니다. 테스트 모드는 `NODE_ENV=test`에서만 허용되며 운영 영구 저장소로 간주하지 않습니다.
