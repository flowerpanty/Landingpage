import re
import glob

# The styles to append at the end of the main stylesheet block
global_nav_styles = """
/* BEGIN GLOBAL NAV STYLES OVERRIDE */
.nm-nav a {
  display: inline-flex !important;
  align-items: center !important;
  justify-content: center !important;
  min-height: 58px !important;
  min-width: 138px !important;
  padding: 14px 18px !important;
  font-size: 17px !important;
  font-weight: 900 !important;
  letter-spacing: -0.04em !important;
  line-height: 1.05 !important;
  text-align: center !important;
  word-break: keep-all !important;
  transition: transform 0.18s ease, background-color 0.18s ease !important;
  border: var(--line) !important;
  box-shadow: var(--shadow) !important;
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
    gap: 6px !important;
    max-width: 100% !important;
  }
  .nm-nav a {
    min-height: 44px !important;
    min-width: 0 !important;
    padding: 8px 1px !important;
    font-size: 13px !important;
  }
}
/* END GLOBAL NAV STYLES OVERRIDE */
"""

html_files = glob.glob("**/*.html", recursive=True)
html_files.append("assets/site.css")

for file in html_files:
    try:
        with open(file, 'r', encoding='utf-8') as f:
            content = f.read()

        # Update default layout (4 columns)
        content = re.sub(
            r'(\.nm-nav\s*\{\s*)(display:\s*(?:flex|none|grid);)(\s*(?:align-items:[^;]+;|justify-content:[^;]+;|gap:[^;]+;|flex-wrap:[^;]+;|width:[^;]+;|padding-bottom:[^;]+;|grid-template-columns:[^;]+;|max-width:[^;]+;)*)',
            lambda m: m.group(1) + "display: grid;\n  grid-template-columns: repeat(4, minmax(0, 1fr));\n  gap: 14px;\n  width: 100%;\n  padding-bottom: 4px;" if 'display: none' not in m.group(0) else m.group(0),
            content,
            count=1 # Target the desktop base class
        )

        # Force the detail pages that have display: none to grid
        content = re.sub(
            r'\.nm-nav\s*\{\s*display:\s*none;\s*\}',
            r'.nm-nav {\n    display: grid;\n    grid-template-columns: repeat(4, minmax(0, 1fr));\n    gap: 8px;\n    max-width: 100%;\n  }',
            content
        )

        # Append universal overrides just before </style> or at end of CSS file
        if "/* BEGIN GLOBAL NAV STYLES OVERRIDE */" not in content:
            if file.endswith('.css'):
                content += "\n" + global_nav_styles
            else:
                content = content.replace("</style>", global_nav_styles + "\n  </style>")
        
        with open(file, 'w', encoding='utf-8') as f:
            f.write(content)
            
    except Exception as e:
        print(f"Error processing {file}: {e}")

print("Nav styling applied universally classes updated.")
