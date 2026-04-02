"""Build script for clinical-contract UI using staticjinja.

Usage:
    uv run python build.py          # Build once
    uv run python build.py --serve  # Build + watch + live reload on :8000
"""

import shutil
import sys
from pathlib import Path

from staticjinja import Site

OUTPUT = Path("_output")
STATIC_SRC = Path("static")
STATIC_DST = OUTPUT / "static"


def copy_static():
    """Copy static/ to _output/static/, replacing existing."""
    if STATIC_DST.exists():
        shutil.rmtree(STATIC_DST)
    if STATIC_SRC.exists():
        shutil.copytree(STATIC_SRC, STATIC_DST)


def rebuild():
    """Full rebuild: render templates + copy static."""
    site = Site.make_site(
        searchpath="templates",
        outpath=str(OUTPUT),
    )
    site.render()
    copy_static()


def build():
    """Clean build."""
    if OUTPUT.exists():
        shutil.rmtree(OUTPUT)
    rebuild()
    print(f"Built to {OUTPUT}")


def serve(port=8000):
    """Build + live reload server watching templates/ and static/."""
    from livereload import Server

    build()

    server = Server()
    server.watch("templates/**/*", rebuild)
    server.watch("static/**/*", rebuild)
    print(f"Live reload on http://localhost:{port}")
    server.serve(root=str(OUTPUT), port=port)


if __name__ == "__main__":
    if "--serve" in sys.argv:
        port = 8000
        for i, arg in enumerate(sys.argv):
            if arg == "--port" and i + 1 < len(sys.argv):
                port = int(sys.argv[i + 1])
        serve(port)
    else:
        build()
