from __future__ import annotations

import json
from datetime import date, timezone, datetime
from pathlib import Path
import xml.etree.ElementTree as ET

BASE_URL = "https://natsufox.github.io"
ROOT = Path(__file__).resolve().parent.parent
DATA_FILE = ROOT / "data" / "projects.json"
SITEMAP_FILE = ROOT / "sitemap.xml"


def load_projects() -> list[dict[str, object]]:
    return json.loads(DATA_FILE.read_text(encoding="utf-8"))


def lastmod_for(path: Path) -> str:
    modified = datetime.fromtimestamp(path.stat().st_mtime, tz=timezone.utc)
    return modified.date().isoformat()


def build_sitemap() -> None:
    ET.register_namespace("", "http://www.sitemaps.org/schemas/sitemap/0.9")
    urlset = ET.Element("{http://www.sitemaps.org/schemas/sitemap/0.9}urlset")

    pages = [(f"{BASE_URL}/", ROOT / "index.html", "weekly", "1.0")]

    for project in load_projects():
        slug = project.get("slug")
        page_url = project.get("page_url")
        if not slug or not page_url:
            continue
        source = ROOT / "projects" / str(slug) / "index.html"
        pages.append((str(page_url), source, "weekly", "0.9"))

    for loc, source, changefreq, priority in pages:
        url = ET.SubElement(urlset, "{http://www.sitemaps.org/schemas/sitemap/0.9}url")
        ET.SubElement(url, "{http://www.sitemaps.org/schemas/sitemap/0.9}loc").text = loc
        ET.SubElement(url, "{http://www.sitemaps.org/schemas/sitemap/0.9}lastmod").text = lastmod_for(source)
        ET.SubElement(url, "{http://www.sitemaps.org/schemas/sitemap/0.9}changefreq").text = changefreq
        ET.SubElement(url, "{http://www.sitemaps.org/schemas/sitemap/0.9}priority").text = priority

    tree = ET.ElementTree(urlset)
    ET.indent(tree, space="  ")
    tree.write(SITEMAP_FILE, encoding="utf-8", xml_declaration=True)


if __name__ == "__main__":
    build_sitemap()
    print(f"Wrote {SITEMAP_FILE.relative_to(ROOT)} on {date.today().isoformat()}")
