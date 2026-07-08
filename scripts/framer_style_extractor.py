"""
Extracts the EXACT live computed styles from framer.com — real hex values,
real font stacks, straight from the rendered DOM. No guessing, no third-party
analysis, no AI reconstruction. This is the ground truth.

SETUP (run once):
    pip install playwright --break-system-packages
    playwright install chromium

RUN:
    python framer_style_extractor.py

OUTPUT:
    Prints a clean JSON block with real computed values for background,
    text, accent, and font-family on key elements. Paste that JSON back
    to Claude and it'll turn it into a ready-to-use CSS/Tailwind token file.
"""

from playwright.sync_api import sync_playwright
import json

TARGET_URL = "https://www.framer.com/"

# CSS selectors for the elements we actually care about.
# Adjust these if Framer's markup has changed — right-click an element on
# the live site, Inspect, and copy a stable selector (e.g. a class name
# that isn't a random hash) if any of these don't match.
SELECTORS = {
    "link_hover": "a:hover",
    "highlighted_text": "[class*='highlight'], [class*='accent'], strong, em",
}

# Container-level (box) properties come from the matched element itself.
CONTAINER_PROPERTIES = [
    "background-color",
    "border-radius",
    "border-color",
]

# Text-level properties are read off the deepest element that actually
# carries the text — Framer nests real text in something like
# <p class="framer-text"> several levels inside <a>/<div> wrappers that
# themselves have no author styles (so reading these off the wrapper just
# gives you the browser's default UA-stylesheet values, e.g. link-blue).
TEXT_PROPERTIES = [
    "color",
    "font-family",
    "font-weight",
    "font-size",
    "letter-spacing",
]

# Finds the deepest descendant (including el itself) that directly owns
# non-whitespace text, so we read font/color off the real text node's
# element rather than a purely structural wrapper.
FIND_TEXT_EL_JS = """
(el) => {
    const hasDirectText = (node) =>
        Array.from(node.childNodes).some(
            (n) => n.nodeType === 3 && n.textContent.trim().length > 0
        );
    let best = el;
    let bestDepth = hasDirectText(el) ? 0 : -1;
    for (const candidate of el.querySelectorAll("*")) {
        if (!hasDirectText(candidate)) continue;
        let depth = 0;
        let p = candidate;
        while (p && p !== el) {
            depth++;
            p = p.parentElement;
        }
        if (depth > bestDepth) {
            bestDepth = depth;
            best = candidate;
        }
    }
    return best;
}
"""

READ_PROPS_JS = """
(el, props) => {
    const style = getComputedStyle(el);
    const out = {};
    for (const p of props) out[p] = style.getPropertyValue(p);
    return out;
}
"""

def extract_styles():
    results = {}
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page(viewport={"width": 1440, "height": 900})
        page.goto(TARGET_URL, wait_until="networkidle", timeout=30000)

        for label, selector in SELECTORS.items():
            # querySelector can't match a live ":hover" state on its own —
            # nothing is actually being hovered by a real cursor, so a bare
            # "a:hover" selector matches zero elements. Strip the pseudo-class,
            # find the base element, then use Playwright's real mouse to
            # hover it before reading styles.
            wants_hover = ":hover" in selector
            base_selector = selector.replace(":hover", "").strip() or "*"

            el = page.query_selector(base_selector)
            if not el:
                results[label] = {"error": f"selector '{base_selector}' not found"}
                continue

            if wants_hover:
                el.hover()
                page.wait_for_timeout(150)  # let hover transitions/animations settle

            text_el = el.evaluate_handle(FIND_TEXT_EL_JS).as_element()
            results[label] = {
                **el.evaluate(READ_PROPS_JS, CONTAINER_PROPERTIES),
                **(text_el.evaluate(READ_PROPS_JS, TEXT_PROPERTIES) if text_el else {}),
            }

        browser.close()
    return results

if __name__ == "__main__":
    data = extract_styles()
    print(json.dumps(data, indent=2))
