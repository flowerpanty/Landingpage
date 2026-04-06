import re
import glob

html_files = glob.glob("**/*.html", recursive=True)
html_files.append("assets/site.css")

new_override = """/* BEGIN GLOBAL NAV STYLES OVERRIDE */
.nm-nav {
  display: flex !important;
  flex-direction: row !important;
  align-items: center !important;
  justify-content: center !important;
  gap: 12px !important;
  flex-wrap: wrap !important;
  width: 100% !important;
  padding-bottom: 8px !important;
  box-sizing: border-box !important;
}

/* 방해되는 기존 손그림 테두리(가상요소) 강제 제거 */
.nm-nav a::after,
.nm-nav a::before {
  display: none !important;
}

.nm-nav a {
  display: inline-flex !important;
  align-items: center !important;
  justify-content: center !important;
  flex: 0 1 auto !important; 
  box-sizing: border-box !important;
  
  min-height: 48px !important;
  min-width: 0 !important;
  padding: 10px 14px !important;
  margin: 0 !important;
  
  font-size: 15px !important;
  font-weight: 900 !important;
  letter-spacing: -0.04em !important;
  line-height: 1.05 !important;
  text-align: center !important;
  word-break: keep-all !important;
  white-space: nowrap !important;
  
  border: 3px solid var(--ink) !important;
  box-shadow: 3px 3px 0 0 var(--ink) !important;
  -webkit-mask: none !important;
  mask: none !important;
  overflow: visible !important;
  color: var(--ink) !important;
}

.nm-nav a:hover,
.nm-nav a:focus-visible {
  transform: translateY(-2px) !important;
  background: #fff !important;
}

.nm-nav a:nth-child(1),
.nm-nav a:nth-child(4) {
  background: var(--yellow) !important;
}

.nm-nav a:nth-child(2) {
  background: var(--blue) !important;
}

.nm-nav a:nth-child(3) {
  background: var(--orange) !important;
}

@media (max-width: 640px) {
  .nm-nav {
    gap: 5px !important;
    padding: 0 4px !important;
    flex-wrap: nowrap !important;
  }
  .nm-nav a {
    flex: 1 1 0 !important;
    min-height: 42px !important;
    padding: 0 !important; 
    font-size: 12px !important;
    letter-spacing: -0.06em !important;
    border: 2px solid var(--ink) !important;
    box-shadow: 2px 2px 0 var(--ink) !important;
  }
}
/* END GLOBAL NAV STYLES OVERRIDE */"""

pattern = re.compile(r'/\* BEGIN GLOBAL NAV STYLES OVERRIDE \*/.*?/\* END GLOBAL NAV STYLES OVERRIDE \*/', re.DOTALL)

for file in html_files:
    try:
        with open(file, 'r', encoding='utf-8') as f:
            content = f.read()
            
        if "/* BEGIN GLOBAL NAV STYLES OVERRIDE */" in content:
            content = pattern.sub(new_override, content)
        else:
            if file.endswith('.css'):
                content += "\n" + new_override
            else:
                content = content.replace("</style>", new_override + "\n  </style>")
        
        with open(file, 'w', encoding='utf-8') as f:
            f.write(content)
            
    except Exception as e:
        print(f"Error {file}: {e}")

print("Fixed overlaps 3!")
