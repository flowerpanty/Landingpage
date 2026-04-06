import os
import glob
import re

html_files = glob.glob("**/*.html", recursive=True)

nav_html_pattern = re.compile(r'<nav class="nm-nav"[^>]*>.*?</nav>', re.DOTALL)

for file in html_files:
    depth = file.count('/')
    prefix = '../' * depth if depth > 0 else ''
    
    if depth == 0:
        new_nav = """<nav class="nm-nav" aria-label="빠른 이동">
          <a href="#mainpage-home">쿠키 메인</a>
          <a href="#use-case-guide">쿠키 가이드</a>
          <a href="#all-products">쿠키 라인업</a>
          <a href="#featured-products">패키지 보기</a>
        </nav>"""
    else:
        new_nav = f"""<nav class="nm-nav" aria-label="빠른 이동">
          <a href="{prefix}index.html#mainpage-home">쿠키 메인</a>
          <a href="{prefix}index.html#use-case-guide">쿠키 가이드</a>
          <a href="{prefix}index.html#all-products">쿠키 라인업</a>
          <a href="{prefix}index.html#featured-products">패키지 보기</a>
        </nav>"""
        
    with open(file, 'r', encoding='utf-8') as f:
        content = f.read()

    # Apply HTML
    content = nav_html_pattern.sub(new_nav, content)

    with open(file, 'w', encoding='utf-8') as f:
        f.write(content)

print(f"Updated HTML nav in {len(html_files)} files.")
