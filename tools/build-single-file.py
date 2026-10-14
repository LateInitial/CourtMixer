# -*- coding: utf-8 -*-
"""
Build a single self-contained HTML file from the split sources.

    py tools/build-single-file.py                 -> CourtMixer-v<APP_VERSION>.html
    py tools/build-single-file.py out.html        -> that path

The split app (index.html + css/ + js/) is what gets deployed. This script exists so the
GitHub release can still attach one file that runs by itself, and so the app can be opened
straight from disk without a local server. Output is byte-for-byte reproducible.
"""
import io, os, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
INDEX = os.path.join(ROOT, "index.html")

LINK_RE = re.compile(r'^\s*<link rel="stylesheet" href="([^"]+)"\s*/?>\s*$')
SCRIPT_RE = re.compile(r'^\s*<script src="([^"]+)"></script>\s*$')


def read(rel):
    path = os.path.join(ROOT, rel.replace("/", os.sep))
    if not os.path.exists(path):
        sys.exit("STOP: missing %s (referenced by index.html)" % rel)
    return io.open(path, encoding="utf-8").read().rstrip("\n")


def main():
    html = io.open(INDEX, encoding="utf-8").read().split("\n")
    out, inlined = [], []
    for line in html:
        m = LINK_RE.match(line)
        if m:
            out.append("<style>")
            out.append(read(m.group(1)))
            out.append("</style>")
            inlined.append(m.group(1))
            continue
        m = SCRIPT_RE.match(line)
        if m:
            body = read(m.group(1))
            # An inline <script> would be terminated early by this sequence; the sources must
            # never contain it. Checked rather than escaped, so a future edit fails loudly.
            if "</script" in body.lower():
                sys.exit("STOP: %s contains '</script' and cannot be inlined." % m.group(1))
            out.append("<script>")
            out.append(body)
            out.append("</script>")
            inlined.append(m.group(1))
            continue
        out.append(line)

    text = "\n".join(out).rstrip("\n") + "\n"

    version = "unknown"
    mv = re.search(r'const APP_VERSION = "([^"]+)"', text)
    if mv:
        version = mv.group(1)

    dest = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, "CourtMixer-v%s.html" % version)
    io.open(dest, "w", encoding="utf-8", newline="").write(text)
    print("inlined %d files (version %s)" % (len(inlined), version))
    print("wrote %s  (%d bytes)" % (dest, len(text.encode("utf-8"))))


if __name__ == "__main__":
    main()
