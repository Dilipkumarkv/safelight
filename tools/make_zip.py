#!/usr/bin/env python3
"""Zip the app for hosting anywhere (no dependencies)."""
import os
import zipfile

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
OUT = os.path.join(ROOT, "safelight.zip")

SKIP_DIRS = {".git"}
SKIP_NAMES = {".gitignore", "safelight.zip"}


def main():
    count = 0
    with zipfile.ZipFile(OUT, "w", zipfile.ZIP_DEFLATED) as zf:
        for base, dirs, files in os.walk(ROOT):
            dirs[:] = [d for d in dirs if d not in SKIP_DIRS]
            for name in files:
                if name in SKIP_NAMES or name.startswith("."):
                    continue
                path = os.path.join(base, name)
                rel = os.path.relpath(path, ROOT)
                zf.write(path, rel)
                count += 1
    with open(os.path.join(ROOT, ".zipinfo.txt"), "w") as fh:
        fh.write(f"{count} files, {os.path.getsize(OUT)} bytes\n")


if __name__ == "__main__":
    main()
