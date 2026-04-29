import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { guideDirectory, guideHubMeta } from "../templates/guide-directory.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
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

const html = `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${guideHubMeta.title}</title>
  <meta name="description" content="${guideHubMeta.description}">
  <meta name="robots" content="index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1">
  <link rel="canonical" href="https://nothingmatters.co.kr/guides/">
  <meta property="og:type" content="website">
  <meta property="og:title" content="${guideHubMeta.title}">
  <meta property="og:description" content="${guideHubMeta.description}">
  <meta property="og:url" content="https://nothingmatters.co.kr/guides/">
  <meta property="og:image" content="${guideHubMeta.ogImage}">
  <meta property="og:image:alt" content="nothingmatters 용도별 가이드 허브 대표 이미지">
  <link rel="icon" type="image/png" href="../images/heart-badge.png">
  <link rel="stylesheet" href="../assets/site.css">
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
              <figcaption class="nm-media-caption">제품명보다 상황이 먼저 떠오를 때, 여기서 빠르게 좁혀볼 수 있어요.</figcaption>
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
    </main>
  </div>

  <script src="../assets/site.js"></script>
  <script src="../assets/seo.js"></script>
</body>
</html>
`;

await fs.writeFile(outputPath, html, "utf8");
