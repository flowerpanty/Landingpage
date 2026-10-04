# nothingmatters.co.kr 검색·AI 답변 기준선

점검일: 2026-10-04 (KST). 공개 HTTP 응답과 이 저장소의 정적 HTML을 확인했다. 검색 노출·클릭·AI 인용 수치는 계정 및 서버 로그 접근 없이 추정하지 않는다.

| 영역 | 변경 전 상태 | 확인한 근거 |
| --- | --- | --- |
| SEO | 양호 | 홈·가이드·김포공항 페이지가 200과 HTML 본문을 반환. canonical·index 메타가 있고, 사이트맵 32개 URL. 없는 URL은 404와 noindex를 반환. |
| AEO | 보강 필요 | 제품별 최소 수량은 공개돼 있지만 브루키·수제꾸덕쿠키·행운쿠키의 답이 여러 페이지에 흩어져 있었음. |
| GEO | 측정 필요 | robots.txt가 공개 페이지 접근을 허용하고 llms.txt가 있음. 실제 AI 검색 출처 노출과 봇 접근 로그는 확인하지 못함. |
| LLMO | 측정 필요 | Organization/Bakery의 이름·공식 채널은 구조화 데이터에 있음. 검색 없는 모델의 브랜드 인지도는 측정하지 못함. |
| NEO | 측정 필요 | 네이버 소유확인 메타·사이트맵·Yeti 접근 정책이 있음. 서치어드바이저 노출·클릭은 계정 접근이 없어 확인하지 못함. |
| 콘텐츠 운영 | 보강 필요 | 공개 가이드 9개와 RSS가 있었음. /blog/는 외부 블로그로 이동하며, 가이드별 검색어·성과 기준선은 저장소에 없었음. |

이번 변경은 공개 제품 정보만 사용해 `/guides/cookie-minimum-order/`에 질문의 답·제품별 표·원 제품 링크를 HTML로 제공한다. 가이드 허브와 단체 주문 페이지에서 연결하고, 사이트맵·RSS·구조화 데이터의 날짜와 목록을 동기화한다. 가이드 허브의 고객 화면에서 검색 작업을 설명하는 문구도 정리한다.

메인 랜딩의 추가 점검에서 `www.nothingmatters.co.kr`이 정본 도메인으로 301 이동하는 점과 기존 제목·제품·FAQ·구조화 데이터를 확인했다. 반면 최근 제작 사례 5개는 자바스크립트가 실행된 뒤에만 나타났다. 이번 보강으로 같은 제작 사례를 원본 HTML에 사진·설명·상세 링크로 제공하고, 전체 작업 보기 링크는 자바스크립트 없이도 `/works/`로 이동한다. 메인 FAQ에서도 최소 주문 수량 및 보관 방법 가이드로 직접 연결한다. 검색 순위나 AI 답변 인용 증가 여부는 배포 후 측정이 필요하다.

## 배포 직후 확인

- `/guides/cookie-minimum-order/`가 200이며, 자바스크립트를 실행하지 않은 HTML에 H1·첫 문단·3개 제품 행이 있는지 확인한다.
- `/guides/`와 `/bulk/`에서 새 가이드로 가는 일반 HTML 링크가 있는지 확인한다.
- 사이트맵에 새 URL이 정확히 한 번 포함되고, RSS에 10개 가이드가 나오는지 확인한다.
- `/`의 초기 HTML에 제작 사례 사진·설명·상세 링크 5개와 최소 주문·보관 가이드 링크가 있는지 확인한다. 자바스크립트 사용 시에는 갤러리와 전체 작업 보기 오버레이가 정상 동작하는지 확인한다.
- Google Search Console, Bing Webmaster Tools, 네이버 서치어드바이저에서 새 URL의 색인/수집 상태를 확인한다. 등록 및 URL 검사에는 각 서비스의 소유 계정이 필요하다.

## 배포 14일 후 재측정

배포일이 2026-10-04라면 2026-10-18에, 그 이후라면 실제 배포일 14일 후에 확인한다. 검색 통계의 집계 지연을 고려해 최근 2~3일은 비교 범위에서 뺀다.

| 질문 | 대상 URL | 배포 전 28일 노출/클릭 | 배포 후 28일 노출/클릭 | AI 답변 출처 |
| --- | --- | --- | --- | --- |
| 답례품 쿠키 몇 개부터 주문할 수 있나요? | /guides/cookie-minimum-order/ | 미확인 | 재측정 | ChatGPT 검색·Perplexity·네이버 AI 브리핑에서 수동 확인 |
| 브루키 최소 주문 수량은? | /guides/cookie-minimum-order/ | 미확인 | 재측정 | 같은 방식 |
| 수제꾸덕쿠키 소량 주문 가능한가요? | /guides/cookie-minimum-order/ | 미확인 | 재측정 | 같은 방식 |
| 행운쿠키는 몇 세트부터 주문하나요? | /guides/cookie-minimum-order/ | 미확인 | 재측정 | 같은 방식 |
| 쿠키 선물은 어떻게 보관하나요? | /guides/cookie-storage/ | 미확인 | 재측정 | 같은 방식 |
| 낫띵메터스 제작 사례·답례품 | / 및 /works/ | 미확인 | 재측정 | 같은 방식 |

Google은 AI 검색 노출을 위한 별도 구조화 데이터나 llms.txt를 요구하지 않는다. 따라서 성과 판단은 파일 존재가 아니라 실제 색인·노출·클릭·인용으로 한다. FAQ 구조화 데이터도 이 상업 사이트의 FAQ 리치 결과 노출을 보장하지 않는다.

참고: [Google AI 검색 가이드](https://developers.google.com/search/docs/fundamentals/ai-optimization-guide), [Google FAQ 리치 결과 정책](https://developers.google.com/search/blog/2023/08/howto-faq-changes), [네이버 RSS·사이트맵 안내](https://searchadvisor.naver.com/guide/request-feed), [OpenAI 발행자 안내](https://help.openai.com/en/articles/12627856-publishers-and-developers-faq).
