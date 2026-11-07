#!/usr/bin/env python3
"""Tiny dev server for Safelight: static files, but never cached.

Chrome's heuristic HTTP cache happily re-serves a plain `python -m http.server`
response, which makes a service-worker app impossible to iterate on.
"""
import functools
import http.server
import os
import sys


class Handler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()

    def log_message(self, fmt, *args):  # keep the harness log readable
        sys.stderr.write("%s - %s\n" % (self.address_string(), fmt % args))


def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8082
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    handler = functools.partial(Handler, directory=root)
    with http.server.ThreadingHTTPServer(("127.0.0.1", port), handler) as httpd:
        sys.stderr.write(f"Serving {root} at http://127.0.0.1:{port}/\n")
        httpd.serve_forever()


if __name__ == "__main__":
    main()
