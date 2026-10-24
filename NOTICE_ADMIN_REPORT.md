# 공식 공지 브랜드 UI · 예약 픽업 고정 · 관리자 구현 보고

2026-10-24 · 로컬 구현과 검증 완료. 커밋·푸시·운영 배포는 실행하지 않았습니다.

## 확인할 화면

- 새 로컬 미리보기: [공지 목록](http://127.0.0.1:4182/notice/)
- 관리자 경로: `/notice/admin/` — 현재 로컬 미리보기에는 운영 인증정보와 볼륨을 설정하지 않아 접근이 차단됩니다. 설정되지 않은 관리자 문서는 HTTP 503으로 안내하며, 편집 데이터는 제공하지 않습니다.
- 운영 반영 후 주소: `https://nothingmatters.co.kr/notice/admin/`
- 테스트 계정은 실행 때마다 임의 생성해 테스트 프로세스에서만 사용했습니다. 실제 관리자 계정이나 비밀키를 소스·문서에 만들지 않았습니다.

## 반영한 기능

공지 HTML 템플릿에서 홈페이지의 실제 로고·헤더·푸터를 재사용합니다. 내부 링크는 공지 상세에서도 정상 작동하도록 루트 기준으로 바꿉니다. `assets/site.css`, `showroom.css`, 홈 헤더용 `showroom-home.css`와 기존 `showroom-button`을 사용하며 독립적인 시스템 폰트 지정은 제거했습니다. SeoulNotice와 PretendardDisplay를 실제 로드해 확인했습니다.

`pickup-guide`는 고정, `christmas-2026`은 고정 해제로 변경했습니다. 공지 목록과 홈 최근 공지에서 예약 픽업이 첫 번째이며, RSS는 고정 여부와 관계없이 게시일순입니다. 공지·홈 픽업 안내·`/pickup/` 본문과 FAQ에 **“예약 없이 방문하시면 구매할 쿠키가 없습니다.”**를 반영했습니다. 상품·수량·픽업 날짜와 시간을 방문 전에 확정하도록 안내합니다.

관리자는 공지 목록, 새 글 작성, 기존 글 수정, 미리보기, 임시저장, 발행, 비공개 전환, 상단 고정을 지원합니다. 본문은 문단·소제목·목록·링크를 입력하며, 기존 크리스마스 상품표와 택배 상품 링크도 넣을 수 있습니다. 발행된 글의 임시저장은 별도의 초안으로 저장되어 공개 본문을 바꾸지 않습니다. 저장한 주소는 편집 화면에서 유지합니다. 최초 발행일과 수정일은 서버의 한국 날짜로 기록합니다.

정적 빌드와 운영 서버가 같은 공지 렌더러·스키마·사이트맵 생성 함수를 사용합니다. 발행·비공개·고정 변경은 공개 목록·상세 HTML·홈 소식·공지 RSS·사이트맵·llms 출처를 한 번에 생성하고, 영구 저장 성공 후 공개 응답 스냅샷을 교체합니다. 운영 발행은 재배포를 기다리지 않습니다. `/feed.xml` 가이드 RSS와 기존 제품·주문·블로그·GA4는 유지했습니다.

## 필요한 운영 설정과 접속 방법

현재 운영 설정을 변경하거나 Railway 볼륨을 생성하지 않았습니다. 실제 운영 활성화에는 다음 설정이 필요합니다.

| 항목 | 설정 |
| --- | --- |
| `NOTICE_ADMIN_USERNAME` | 관리자 아이디, 3~100자. 기본 계정 없음 |
| `NOTICE_ADMIN_PASSWORD` | 관리자 비밀번호, 16~256자. 서비스의 비밀 환경변수로만 등록 |
| `NOTICE_PUBLIC_ORIGIN` | `https://nothingmatters.co.kr` — 기본값도 동일. 경로나 인증정보를 넣지 않음 |
| 영구 볼륨 | 예: `/data`에 실제 볼륨 마운트. 웹 루트 밖에 위치해야 함 |
| `NOTICE_DATA_DIR` | 예: `/data/notices` |
| `NODE_ENV` | 운영은 `production` |
| `NOTICE_STORAGE_MODE` | 운영은 비워 둠. `test`를 운영 저장소로 사용할 수 없음 |
| `RAILWAY_VOLUME_MOUNT_PATH` | Railway가 자동 제공하는 실제 마운트 경로. 임의 문자열로 대신하지 않음 |

기존 Railway 서비스에 이미 볼륨이 있다면 그 볼륨의 외부 하위 디렉터리를 사용해야 합니다. 기존 갤러리 저장 설정은 변경하지 않았습니다. 볼륨 연결·경로 변경이 필요한 경우 기존 데이터와 백업을 먼저 확인합니다. [Railway 공식 볼륨 안내](https://docs.railway.com/volumes), [볼륨 동시 배포 제한](https://docs.railway.com/volumes/reference)을 기준으로 단일 서비스·단일 쓰기 프로세스를 사용합니다.

1. 서비스의 환경변수와 실제 영구 볼륨을 설정합니다. 초기 시드 공지의 게시일은 실제 최초 공개일에 맞춰 확인한 뒤 가져옵니다. 저장 파일을 Git이나 웹 공개 디렉터리에 넣지 않습니다.
2. Node 서버(`npm start` / `node server.js`)로 실행합니다. 관리자 인증·영구 원본 제공에는 `server.js`가 필요합니다. 정적 파일 서버만으로 관리자 기능을 운영하지 않습니다.
3. HTTPS의 `/notice/admin/`에서 설정한 아이디와 비밀번호로 로그인합니다. 로그인 정보는 URL·분석 이벤트·로컬 스토리지에 기록하지 않습니다.
4. 화면에서 **영구 저장소 연결** 안내를 확인한 뒤 작성·미리보기·임시저장·발행합니다. 발행 완료 메시지는 저장을 확인한 경우에만 표시합니다.

관리자 전용 API는 `/api/notice-admin/` 아래의 `login`, `session`, `preview`, `notices`, `logout`입니다. 로그인과 세션 조회를 제외한 작업은 인증 세션과 CSRF 검증이 필요합니다. 글 변경 API는 저장 버전과 중복 방지 요청 ID도 검증합니다.

Linux에서 실제 마운트와 파일 시스템(`ext4`, `xfs`, `btrfs`, `zfs`, `nfs`, `nfs4`), 웹 루트 외부 경로, 쓰기·동기화 가능 여부를 확인합니다. Railway 외 Linux 환경은 실제 마운트에 맞춰 `NOTICE_VOLUME_MOUNT_PATH`를 지정할 수 있습니다. 디렉터리 이름만 있거나 임시 파일 시스템인 경우 발행을 활성화하지 않습니다.

로컬 자동 검증은 임시 디렉터리와 `NODE_ENV=test`, `HOST=127.0.0.1`, `NOTICE_STORAGE_MODE=test`를 사용합니다. 테스트 모드는 운영 환경과 외부 인터페이스 바인딩에서 거부하며, 로컬 요청만 쓰기가 가능합니다. 로컬 테스트 저장소가 준비됐다는 표시와 운영 볼륨 준비 상태는 구분됩니다.

## 영구 데이터와 복구

처음 연결할 때만 `data/notices.json`을 볼륨의 `notices-state.json`으로 가져옵니다. 이후에는 볼륨 파일이 운영 원본이며 재배포의 시드 JSON이 운영 글이나 초안을 덮어쓰지 않습니다. 파일 권한은 0600, 저장은 임시 파일·fsync·원자적 이름 교체·디렉터리 fsync를 사용합니다. 공지와 초안을 합쳐 최대 100개 주소를 관리하며 요청 본문은 128KB로 제한합니다.

저장 실패 시 접수 성공을 표시하지 않고 편집 내용을 유지합니다. 저장소 오류가 확인되면 화면의 저장·발행도 중지합니다. 경로·권한·용량 등을 복구한 후 서버를 재시작하고 다시 로그인합니다. 저장소가 손상된 경우 과거 시드 글을 다시 공개하지 않으며, 공지 응답을 중단하고 홈페이지 상품 영역은 유지합니다. 저장소 백업 및 실제 운영 복원 검증은 운영 설정 시 별도로 진행해야 합니다.

쓰기 잠금으로 같은 저장소의 중복 쓰기를 막습니다. 동일 호스트에서 종료된 프로세스의 잠금은 재시작 시 회수합니다. 검증된 Railway 볼륨은 플랫폼의 단일 배포 제한을 전제로 이전 컨테이너의 잠금을 회수합니다. 일반 공유 마운트에서 다른 호스트의 잠금은 자동 해제하지 않습니다. 수동 복구가 필요하면 해당 저장소를 쓰는 프로세스가 모두 정지했는지 먼저 확인해야 합니다.

## 안전성

- 서버 환경변수 인증, 기본 계정 없음, HTTPS 운영 접속, HttpOnly·SameSite=Strict 세션 쿠키. 운영 쿠키는 Secure이며 8시간 만료, 서버 재시작과 로그아웃 시 세션 무효화.
- 모든 쓰기에서 동일 출처·CSRF 검증, 로그인 횟수 제한, 요청 크기·필드·주소·본문·링크 검증.
- 저장 버전 충돌은 409로 거부하고 동일 요청 ID의 재전송은 중복 저장하지 않음. 충돌 시 내용을 보관하고 최신 목록을 확인한 뒤 다시 작업.
- HTML 이스케이프 및 JSON-LD 안전 직렬화. 미리보기는 추적 스크립트를 제거하고 sandbox iframe에서 표시.
- 관리자 HTML/API는 no-store·noindex, 엄격한 CSP와 프레임 차단. `/notice/admin/`는 robots·공개 경로 검사·사이트맵·llms에서 제외.
- 초안·저장 파일은 웹 루트 밖에 저장. `/data/notices.json`, `.env`, `.git` 경로와 인코딩 별칭은 공개하지 않음.
- 인증정보·세션·본문·개인정보를 로그나 분석 이벤트에 기록하는 코드를 추가하지 않음. 새 관리자 화면에는 GA4 스크립트를 넣지 않음.

## 테스트 결과

| 실행 | 결과 |
| --- | --- |
| `npm run site:build` | PASS, 반복 생성 시 공지 변경 0건 |
| `npm run site:check` | PASS, SEO 44 사이트맵 URL / 공개 HTML 48개, 성능·접근성 51페이지, 기존 랜딩·가이드 RSS 검사 포함 |
| `npm run notices:test` | PASS, 픽업 고정·홈 순서·RSS 게시일순·동일 방문 안내·공유 브랜드 템플릿·가격·스키마·초안 제외 |
| `npm run notices:browser:test` | PASS, 공개 4경로 × 320/375/390/768/1024/1440px, 브랜드 폰트, 키보드·포커스·터치·JS 비활성·XML·기존 연결 |
| `npm run notices:admin:test` | PASS, 인증·출처·CSRF·비공개 경로·noindex/CSP·입력·중복 요청·수정 충돌·저장 실패·로그아웃·HTTPS·횟수 제한 |
| 관리자 저장·재시작 | PASS, 임시저장 → 강제 종료 → 재시작 복원, 세션 만료, 다른 체크아웃의 시드로도 저장 데이터 유지, 잘못된 마운트·운영 테스트 모드 거부 |
| `npm run notices:admin:browser:test` | PASS, 320/390/768/1440px, 로그인·목록·편집·미리보기·임시저장·발행·비공개·로그아웃, 실패 입력 유지, 저장소 미설정과 오류 시 쓰기 비활성화 |
| `npm run server:test` | PASS, 기존 HTTP·항공편 서비스 회귀 |
| `npm run order:test` | PASS, 기존 상품·확인·견적·크리스마스 가격/수량/중복·오류 회귀 |
| `npm run christmas:browser:test` | PASS, PC·모바일 3 STEP·입력 유지·갤러리·합계·검증·중복·실패·개인정보 경계 |
| `git diff --check` | PASS |

폰트 4개 파일은 기존 CDN에서 HTTP 200을 확인했고, 받은 실제 WOFF2 바이트를 브라우저에 로드해 SeoulNotice·PretendardDisplay 사용을 검사했습니다. 관리자와 공개 목록의 PC·모바일 렌더링을 직접 확인했습니다. 예외·로컬 리소스 실패·콘솔 오류는 없었습니다. 모의 저장 실패 응답은 의도적으로 발생시켜 입력 보존과 재시도를 확인했습니다.

검증 자료는 Git 제외 경로 `output/playwright/notices/`, `output/playwright/notices-admin/`의 스크린샷·API 결과·브라우저 결과·디자인 증거 기록에 있습니다. 테스트는 모두 로컬 저장소와 모의 주문 API를 사용했으며 실제 운영 공지나 주문 DB에 쓰지 않았습니다.

## 이번 작업에서 변경한 파일

- `.env.example`
- `assets/notices.css`
- `data/notices.json`
- `data/README.md`
- `data/site-pages.json`
- `index.html`
- `pickup/index.html`
- `llms.txt`
- `robots.txt`
- `sitemap.xml`
- `package.json`
- `server.js`
- `lib/notices.mjs`
- `lib/notice-admin.mjs`
- `lib/notice-store.mjs`
- `lib/site-sitemap.mjs`
- `scripts/build-notices.mjs`
- `scripts/build-products.mjs`
- `scripts/generate-jsonld.mjs`
- `scripts/test-public-seo.mjs`
- `scripts/test-notices.mjs`
- `scripts/test-notices-browser.mjs`
- `scripts/notice-test-server.mjs`
- `scripts/notice-browser-support.mjs`
- `scripts/test-notice-admin.mjs`
- `scripts/test-notice-admin-browser.mjs`
- `notice/index.html`
- `notice/christmas-2026/index.html`
- `notice/pickup-guide/index.html`
- `notice/shipping-guide/index.html`
- `notice/feed.xml`
- `notice/admin/index.html`
- `notice/admin/admin.css`
- `notice/admin/admin.js`
- `NOTICE_SYSTEM_REPORT.md` — 초기 보고서에 최신 보고서 안내 추가
- `NOTICE_ADMIN_REPORT.md`

이번 변경과 관계없는 기존 미커밋 파일 10개는 작업 시작 시점과 바이트 단위로 동일함을 확인했습니다. 기존 크리스마스 상품 UI와 주문 스크립트는 변경하지 않았습니다.

## 남은 운영 작업

관리자 기능 구현은 완료했습니다. 실제 관리자 인증정보 등록, 실제 볼륨 연결·백업 설정, 운영 배포와 운영 저장·재시작 확인은 실행하지 않았습니다. 이 설정 전에는 저장·발행을 활성화하지 않습니다. 검색엔진 수집이나 노출도 별도로 확인해야 합니다.
