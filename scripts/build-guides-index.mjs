import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { guideDirectory, guideHubMeta } from "../templates/guide-directory.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const cssPath = path.join(rootDir, "assets", "site.css");
const outputPath = path.join(rootDir, "guides", "index.html");

const cardsMarkup = guideDirectory
  .map(
    (guide) => `            <article class="nm-card">
              <small>${guide.eyebrow}</small>
              <h3>${guide.title}</h3>
              <p>${guide.description}</p>
              <ul class="nm-list">
${guide.bullets.map((item) => `                <li>${item}</li>`).join("\n")}
              </ul>
              <a class="nm-btn nm-btn--secondary" href=".${guide.path.replace("/guides", "")}index.html">${guide.cta}</a>
            </article>`
  )
  .join("\n\n");

const html = async () => {
  const siteCss = await fs.readFile(cssPath, "utf8");

  return `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${guideHubMeta.title}</title>
  <meta name="description" content="${guideHubMeta.description}">
  <meta name="robots" content="index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1">
  <link rel="canonical" href="https://nothingmatters.kr/guides/">
  <meta property="og:type" content="website">
  <meta property="og:title" content="${guideHubMeta.title}">
  <meta property="og:description" content="${guideHubMeta.description}">
  <meta property="og:url" content="https://nothingmatters.kr/guides/">
  <meta property="og:image" content="${guideHubMeta.ogImage}">
  <meta property="og:image:alt" content="nothingmatters 용도별 가이드 허브 대표 이미지">
  <link rel="icon" type="image/png" href="../images/heart-badge.png">
  <link rel="stylesheet" href="../assets/site.css">
  <style id="nm-inline-site-css">
${siteCss}
  </style>
</head>
<body class="theme-contact">
  <div class="nm-site">
    <header class="nm-topbar">
      <div class="nm-wrap nm-topbar-inner">
        <div class="nm-logo">nothingmatters</div>
        <nav class="nm-nav" aria-label="용도별 가이드 탐색">
          <a href="../index.html">메인</a>
          <a href="#directory">가이드 전체</a>
          <a href="#keyword-map">상황별 분류</a>
          <a href="#quick-start">빠른 시작</a>
          <a href="../contact/index.html">무료견적</a>
          <a href="#faq">FAQ</a>
        </nav>
      </div>
    </header>

    <main>
      <section class="nm-section nm-section--hero">
        <div class="nm-wrap nm-detail-hero">
          <div class="nm-detail-copy">
            <div class="nm-breadcrumb">
              <a href="../index.html">메인</a>
              <strong>용도별 가이드 허브</strong>
            </div>
            <div class="nm-kicker">use case guide hub</div>
            <h1>결혼식부터 기업행사까지<br><span>검색 의도별로 바로 고르는</span> 가이드 허브</h1>
            <p>
              메인은 전체 브랜드와 제품을 한 번에 보는 허브로 두고,
              여기서는 결혼식 답례품 쿠키, 기업행사 쿠키, 선생님 간식, 퇴사답례품,
              디저트선물세트, 행운쿠키처럼 검색 목적이 분명한 흐름만 따로 빠르게 정리했어요.
            </p>
            <div class="nm-meta-row">
              <span class="nm-meta-pill">결혼식 답례품 쿠키</span>
              <span class="nm-meta-pill">기업행사 · 회사답례품쿠키</span>
              <span class="nm-meta-pill">유치원선생님간식</span>
              <span class="nm-meta-pill">퇴사답례품 · 행운쿠키</span>
            </div>
            <div class="nm-button-row">
              <a class="nm-btn nm-btn--primary" href="#directory">가이드 전체 보기</a>
              <a class="nm-btn nm-btn--secondary" href="https://thingmattersreserve-production.up.railway.app">무료견적내러가기</a>
            </div>
          </div>

          <div class="nm-detail-stack">
            <figure class="nm-media-frame nm-media-frame--wide">
              <img src="../images/home-collage-a.jpg" alt="nothingmatters 대표 라인업 콜라주">
              <figcaption class="nm-media-caption">검색 키워드별로 먼저 고르고, 최종 제품은 상세페이지에서 더 깊게 확인할 수 있게 구조를 정리했어요.</figcaption>
            </figure>
            <div class="nm-summary-box">아직 제품명을 몰라도 괜찮아요. 상황과 목적이 먼저 정해져 있으면 용도별 가이드에서 시작하는 쪽이 훨씬 빨라요.</div>
          </div>
        </div>
      </section>

      <section class="nm-section" id="directory">
        <div class="nm-wrap">
          <div class="nm-heading">
            <div class="nm-label">GUIDE DIRECTORY</div>
            <h2>검색으로 많이 들어오는 상황별 가이드를 한곳에 모았어요</h2>
            <p>검색 키워드가 제품명보다 먼저 떠오르는 경우가 많아서, 자주 찾는 상황부터 별도 허브로 바로 이어지게 구성했어요.</p>
          </div>

          <div class="nm-grid-2">
${cardsMarkup}
          </div>
        </div>
      </section>

      <section class="nm-section nm-wave-top" id="keyword-map">
        <div class="nm-wrap">
          <div class="nm-heading">
            <div class="nm-label">KEYWORD MAP</div>
            <h2>어떤 검색어로 들어왔는지에 따라 보는 가이드가 달라져요</h2>
            <p>가이드 허브는 키워드를 그대로 나열하기보다, 실제 문의 의도에 맞는 묶음으로 먼저 좁히는 데 초점을 맞췄어요.</p>
          </div>

          <div class="nm-picks-grid">
            <article class="nm-pick-card nm-pick-card--pink">
              <small>favor & event</small>
              <h3>정갈한 답례와 회사 행사 흐름</h3>
              <p>결혼식답례품쿠키, 웨딩답례품쿠키, 회사답례품쿠키, 기업행사 같은 검색 흐름은 정갈한 전달감과 수량 대응이 중요해요.</p>
              <ul class="nm-list">
                <li>결혼식 답례품 쿠키 가이드</li>
                <li>기업행사 쿠키 가이드</li>
                <li>브라우니쿠키 계열 상세와 자연스럽게 연결</li>
              </ul>
            </article>

            <article class="nm-pick-card nm-pick-card--yellow">
              <small>gift & thanks</small>
              <h3>감사 선물과 가벼운 간식 선물 흐름</h3>
              <p>유치원선생님간식, 어린이집간식선물, 감사선물, 가벼운선물 같은 검색은 너무 무겁지 않으면서도 기분 좋은 인상이 중요해요.</p>
              <ul class="nm-list">
                <li>선생님 간식 가이드</li>
                <li>행운쿠키 · 응원쿠키 가이드</li>
                <li>수제쿠키와 행운쿠키 상세로 연결</li>
              </ul>
            </article>

            <article class="nm-pick-card nm-pick-card--blue">
              <small>premium mood</small>
              <h3>선물감과 무드가 중요한 흐름</h3>
              <p>구움과자선물, 쿠키선물세트추천, 고급쿠키세트, 디저트선물세트 같은 검색은 패키지와 인상이 중요한 경우가 많아요.</p>
              <ul class="nm-list">
                <li>디저트선물세트 가이드</li>
                <li>퇴사 · 승진 답례 가이드</li>
                <li>곰돌이 스콘과 terminal 라인으로 연결</li>
              </ul>
            </article>
          </div>
        </div>
      </section>

      <section class="nm-section" id="quick-start">
        <div class="nm-wrap">
          <div class="nm-heading">
            <div class="nm-label">QUICK START</div>
            <h2>아직 가이드만 보고 있어도 바로 문의 시작할 수 있어요</h2>
            <p>상황은 정해졌는데 제품은 아직 못 골랐다면, 행사일과 수량만 보내주셔도 가장 맞는 가이드와 제품부터 빠르게 이어서 안내할 수 있어요.</p>
          </div>

          <div class="nm-guide-grid">
            <div class="nm-cta-card">
              <div class="nm-badge">fast start</div>
              <h3>행사일 + 수량 + 용도만 먼저 보내주세요</h3>
              <p>결혼식인지, 기업행사인지, 선생님 간식인지 정도만 정해져 있어도 충분해요. 제품은 상담 중에 함께 좁혀도 괜찮습니다.</p>
              <div class="nm-copy-row">
                <a class="nm-btn nm-btn--primary" href="https://thingmattersreserve-production.up.railway.app">무료견적내러가기</a>
                <a class="nm-btn nm-btn--secondary" href="../index.html#all-products">제품 라인업 보기</a>
              </div>
              <div class="nm-template-meta">
                <span>행사일 또는 수령 희망일</span>
                <span>대략적인 수량</span>
                <span>답례 · 선물 · 행사 간식 용도</span>
              </div>
            </div>

            <aside class="nm-side-note">
              <h3>가이드에서 제품으로 이어지는 흐름</h3>
              <p>가이드는 먼저 상황을 좁히고, 최종 비교는 제품 상세에서 확인하는 구조예요. 그래서 검색 유입과 실제 문의 전환이 자연스럽게 이어지도록 설계했어요.</p>
              <div class="nm-note-box">1. 검색 의도에 맞는 가이드로 진입

2. 해당 상황에서 잘 맞는 제품 2~3개 비교

3. 행사일과 수량을 기준으로 문의 페이지에서 최종 상담 시작</div>
            </aside>
          </div>
        </div>
      </section>

      <section class="nm-section" id="faq">
        <div class="nm-wrap">
          <div class="nm-heading">
            <div class="nm-label">FAQ</div>
            <h2>가이드 허브에서 많이 묻는 내용</h2>
            <p>검색으로 먼저 들어왔을 때 가장 많이 궁금해하는 질문부터 짧게 정리했어요.</p>
          </div>

          <div class="nm-faq">
            <details open>
              <summary>제품부터 봐야 하나요, 가이드부터 봐야 하나요?</summary>
              <div class="answer">검색 의도가 결혼식 답례품, 기업행사, 선생님 간식처럼 먼저 분명하다면 가이드부터 보는 쪽이 더 빨라요. 반대로 이미 제품이 정해져 있으면 상세페이지에서 바로 시작해도 괜찮아요.</div>
            </details>
            <details>
              <summary>가이드를 봐도 제품을 못 고르면 어떻게 하나요?</summary>
              <div class="answer">괜찮아요. 행사일, 수량, 용도만 먼저 알려주시면 가이드와 제품을 함께 이어서 추천해드릴 수 있어요.</div>
            </details>
            <details>
              <summary>기업행사나 대량 주문도 여기서 바로 연결되나요?</summary>
              <div class="answer">네. 기업행사 쿠키 가이드와 문의 페이지를 통해 회사 행사, 사내 이벤트, 회사 답례 흐름을 바로 상담할 수 있어요.</div>
            </details>
          </div>

          <footer class="nm-footer">
            <strong>nothingmatters</strong><br>
            서울특별시 성동구 상원12길 19 1층 · 매장 픽업 / 차량 퀵 상담 · <a href="tel:01028667976">010-2866-7976</a> · <a href="mailto:eddiefactory@naver.com">eddiefactory@naver.com</a>
            <div class="nm-footer-links">
              <a href="../index.html">메인 랜딩 보기</a>
              <a href="https://thingmattersreserve-production.up.railway.app">무료견적내러가기</a>
              <a href="../products/brownie-cookie/index.html">대표 답례 제품 보기</a>
            </div>
          </footer>
        </div>
      </section>
    </main>

    <div class="nm-float-cta">
      <div class="nm-float-copy">
        <strong>상황이 먼저 정해졌다면 가이드에서 바로 시작하세요</strong>
        <span>결혼식, 기업행사, 선생님 간식, 퇴사답례처럼 목적만 알려주셔도 맞는 제품 흐름부터 빠르게 정리해드릴게요.</span>
      </div>
      <a class="nm-btn nm-btn--primary" href="https://thingmattersreserve-production.up.railway.app">무료견적내러가기</a>
    </div>
  </div>

  <script src="../assets/site.js"></script>
  <script src="../assets/seo.js"></script>
</body>
</html>
`;
};

const run = async () => {
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, await html(), "utf8");
};

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
