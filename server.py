#!/usr/bin/env python3
"""Serveur statique de Vigile v2 — port 8131, aucun cache.

Usage : python server.py [port]
Sert le dossier du fichier (index.html, src/, vendor/, shots/).
"""

from __future__ import annotations

import http.server
import json
import os
import re
import socketserver
import sys
import time

ROOT = os.path.dirname(os.path.abspath(__file__))
PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8131
TELEMETRY_DIR = os.path.join(ROOT, "telemetry")
MAX_BODY = 8 * 1024 * 1024


class Handler(http.server.SimpleHTTPRequestHandler):
    extensions_map = {
        **http.server.SimpleHTTPRequestHandler.extensions_map,
        ".js": "text/javascript; charset=utf-8",
        ".mjs": "text/javascript; charset=utf-8",
        ".css": "text/css; charset=utf-8",
        ".json": "application/json; charset=utf-8",
        ".png": "image/png",
        ".svg": "image/svg+xml",
    }

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    def end_headers(self):
        # Indispensable : les imports ES n'ont pas de query string, un cache
        # navigateur servirait l'ancien module apres chaque modification.
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()

    def log_message(self, fmt, *args):  # silence relative aux captures
        sys.stderr.write("%s - %s\n" % (self.address_string(), fmt % args))

    # ── télémétrie : le jeu POSTe UN rapport par veille, on l'écrit sur disque ──
    def do_POST(self):
        if self.path.split("?")[0].rstrip("/") != "/api/telemetry":
            self.send_error(404, "inconnu")
            return
        try:
            length = int(self.headers.get("Content-Length") or 0)
        except ValueError:
            length = 0
        if length <= 0 or length > MAX_BODY:
            self.send_error(413, "corps absent ou trop gros")
            return
        raw = self.rfile.read(length)
        try:
            payload = json.loads(raw.decode("utf-8"))
        except (ValueError, UnicodeDecodeError):
            self.send_error(400, "json invalide")
            return
        if not isinstance(payload, dict):
            self.send_error(400, "objet attendu")
            return
        os.makedirs(TELEMETRY_DIR, exist_ok=True)
        sid = str(payload.get("id") or "s%d" % int(time.time()))
        sid = re.sub(r"[^A-Za-z0-9_-]", "", sid)[:60] or "session"
        name = "session-%s.json" % sid
        with open(os.path.join(TELEMETRY_DIR, name), "w", encoding="utf-8") as fh:
            json.dump(payload, fh, ensure_ascii=False, indent=1)
        body = json.dumps({"ok": True, "file": name}).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


class Server(socketserver.ThreadingTCPServer):
    allow_reuse_address = True
    daemon_threads = True
    # Chrome ouvre une vingtaine de connexions d'un coup pour les modules ES :
    # la file d'écoute par défaut (5) les fait refuser (ERR_CONNECTION_REFUSED).
    request_queue_size = 128


if __name__ == "__main__":
    with Server(("127.0.0.1", PORT), Handler) as httpd:
        print(f"Vigile v2 — http://127.0.0.1:{PORT}/  (racine: {ROOT})", flush=True)
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nArret.")
