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
  gap: 10px !important;
  flex-wrap: wrap !important;
  width: 100% !important;
  padding-bottom: 8px !important;
  box-sizing: border-box !important;
}

.nm-nav a {
  display: inline-flex !important;
  align-items: center !important;
  justify-content: center !important;
  flex: 1 1 auto !important; 
  box-sizing: border-box !important;
  min-height: 52px !important;
  max-width: 100% !important;
  padding: 12px 14px !important;
  font-size: 16px !important;
  font-weight: 900 !important;
  letter-spacing: -0.04em !important;
  line-height: 1.05 !important;
  text-align: center !important;
  word-break: keep-all !important;
  white-space: nowrap !important;
  border: var(--line) !important;
  box-shadow: 4px 4px 0 #000 !important; /* Hardcoded standard shadow to ensure we know exact size */
  -webkit-mask: none !important;
  mask: none !important;
  overflow: visible !important;
  color: var(--ink) !important;
  margin: 0 !important;
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
    flex-wrap: nowrap !important;
    gap: 8px !important;
  }
  .nm-nav a {
    flex: 1 1 0 !important;
    min-width: 0 !important;
    min-height: 44px !important;
    padding: 0 !important; 
    font-size: 11px !important;
    letter-spacing: -0.05em !important;
    box-shadow: 2px 2px 0 #000 !important; /* Smaller shadow on mobile to prevent overlapping tight gaps */
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

print("Fixed overlaps 2!")
