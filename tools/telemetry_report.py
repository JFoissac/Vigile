#!/usr/bin/env python3
"""Rapport de télémétrie — lit telemetry/session-*.json et écrit un bilan markdown.

Usage :
    python tools/telemetry_report.py                 # toutes les sessions
    python tools/telemetry_report.py --write         # écrit docs/RAPPORT-JEU.md
    python tools/telemetry_report.py --last 3        # les 3 plus récentes

Aucune dépendance : bibliothèque standard seulement.
"""

from __future__ import annotations

import argparse
import glob
import json
import os
import statistics
import sys
from collections import Counter, defaultdict

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TEL_DIR = os.path.join(ROOT, "telemetry")


def load_sessions(limit: int | None = None) -> list[dict]:
    files = sorted(glob.glob(os.path.join(TEL_DIR, "session-*.json")), key=os.path.getmtime)
    if limit:
        files = files[-limit:]
    out = []
    for path in files:
        try:
            with open(path, encoding="utf-8") as fh:
                data = json.load(fh)
            data["_file"] = os.path.basename(path)
            out.append(data)
        except (OSError, ValueError) as exc:
            print("ignoré : %s (%s)" % (os.path.basename(path), exc), file=sys.stderr)
    return out


def pct(part: float, total: float) -> str:
    if not total:
        return "—"
    # un tir de fusil à pompe touche jusqu'à 8 fois (grains) : on plafonne à 100 %
    return "%.0f %%" % (100.0 * min(part, total) / total)


def session_line(s: dict) -> str:
    sm = s.get("summary") or {}
    waves = s.get("waves") or []
    reached = sm.get("wave") or (waves[-1]["n"] if waves else 0)
    return "| %s | %s | %s | %s | %s | %s | %s |" % (
        s.get("_file", "?").replace("session-", "").replace(".json", "")[:22],
        s.get("startedAt", "")[:16].replace("T", " "),
        "%.0f s" % (s.get("duration") or 0),
        reached,
        sm.get("kills", "?"),
        sm.get("accuracy", "?"),
        "victoire" if sm.get("victory") else "mort" if sm else "en cours",
    )


def weapon_table(sessions: list[dict]) -> str:
    agg: dict[str, dict] = defaultdict(lambda: {"shots": 0, "hits": 0, "heads": 0, "kills": 0})
    for s in sessions:
        for wid, b in ((s.get("counters") or {}).get("byWeapon") or {}).items():
            a = agg[wid]
            for k in ("shots", "hits", "headshots", "kills"):
                a["hits" if k == "headshots" else k] += b.get(k, 0) if k != "headshots" else 0
            a["heads"] += b.get("headshots", 0)
    lines = ["| arme | tirs | touches | précision | têtes | morts | cartouches/mort |",
             "|---|---:|---:|---:|---:|---:|---:|"]
    for wid, a in sorted(agg.items(), key=lambda kv: -kv[1]["shots"]):
        cpm = "%.1f" % (a["shots"] / a["kills"]) if a["kills"] else "—"
        lines.append("| %s | %d | %d | %s | %d | %d | %s |" % (
            wid, a["shots"], a["hits"], pct(a["hits"], a["shots"]), a["heads"], a["kills"], cpm))
    return "\n".join(lines)


def waves_table(s: dict) -> str:
    waves = s.get("waves") or []
    if not waves:
        return "_aucune vague terminée_"
    lines = ["| vague | plan | durée | tirs | touches | têtes | morts | dégâts | butin | PV fin |",
             "|---:|---|---:|---:|---:|---:|---:|---:|---:|---:|"]
    for w in waves:
        lines.append("| %s | %s | %s | %s | %s | %s | %s | %s | %s | %s/%s |" % (
            w.get("n"), w.get("plan", "?"), w.get("dur", "?"), w.get("shots", 0),
            w.get("hits", 0), w.get("headshots", 0), w.get("kills", 0),
            w.get("damageTaken", 0), w.get("loot", 0), w.get("hpEnd", "?"), w.get("hpMax", "?")))
    return "\n".join(lines)


def build_report(sessions: list[dict]) -> str:
    if not sessions:
        return "# Rapport de jeu\n\nAucune session de télémétrie dans `telemetry/`.\n"
    out = ["# Rapport de jeu — télémétrie Vigile v2", ""]
    out.append("Sessions : **%d** · généré par `tools/telemetry_report.py`" % len(sessions))
    out.append("")
    out.append("## 1. Sessions")
    out.append("")
    out.append("| session | début | durée | vague | morts | précision | issue |")
    out.append("|---|---|---:|---:|---:|---:|---|")
    for s in sessions:
        out.append(session_line(s))

    # agrégats
    waves = [w for s in sessions for w in (s.get("waves") or [])]
    kills = sum((s.get("summary") or {}).get("kills", 0) for s in sessions)
    dmg = sum((s.get("summary") or {}).get("damageTaken", 0) or 0 for s in sessions)
    won = sum(1 for s in sessions if (s.get("summary") or {}).get("victory"))
    out += ["", "## 2. Agrégats", ""]
    out.append("| indicateur | valeur |")
    out.append("|---|---|")
    out.append("| sessions | %d (dont %d victoires) |" % (len(sessions), won))
    out.append("| vagues terminées | %d |" % len(waves))
    if waves:
        durs = [w.get("dur", 0) for w in waves if w.get("dur")]
        out.append("| durée médiane d'une vague | %.1f s (min %.1f, max %.1f) |" % (
            statistics.median(durs), min(durs), max(durs)))
        per = Counter(w.get("plan") for w in waves)
        name, count = per.most_common(1)[0]
        out.append("| plan le plus joué | %s (%d vagues) |" % (name, count))
    out.append("| morts cumulés | %d |" % kills)
    out.append("| dégâts subis cumulés | %d |" % dmg)
    if kills:
        out.append("| dégâts subis par mort | %.1f |" % (dmg / kills))
    out += ["", "### Armes", "", weapon_table(sessions)]

    # butin et dégâts
    loot = Counter()
    dmg_src = Counter()
    for s in sessions:
        c = s.get("counters") or {}
        for k, v in (c.get("byLoot") or {}).items():
            loot[k] += v
        for k, v in (c.get("byDamage") or {}).items():
            dmg_src[k] += v
    if loot:
        out += ["", "### Butin ramassé (objets signalés)", "", "| objet | fois |", "|---|---:|"]
        for k, v in loot.most_common(20):
            out.append("| %s | %d |" % (k, v))
    if dmg_src:
        tot = sum(dmg_src.values()) or 1
        out += ["", "### Sources de dégâts", "", "| source | dégâts | part |", "|---|---:|---:|"]
        for k, v in dmg_src.most_common():
            out.append("| %s | %d | %s |" % (k, v, pct(v, tot)))

    # détail par session (3 dernières)
    out += ["", "## 3. Détail des dernières sessions", ""]
    for s in sessions[-3:]:
        sm = s.get("summary") or {}
        out.append("### %s — vague %s, %s morts, %s" % (
            s.get("_file", "?").replace("session-", "").replace(".json", ""),
            sm.get("wave", "?"), sm.get("kills", "?"),
            "victoire" if sm.get("victory") else "mort"))
        if sm.get("reason"):
            out.append("_%s_" % sm["reason"])
        out.append("")
        out.append(waves_table(s))
        samples = s.get("samples") or []
        if samples:
            hp = [x.get("hp", 0) for x in samples]
            below = sum(1 for v in hp if v < 30)
            out.append("")
            out.append("PV : min **%d**, médiane %.0f, %d échantillons sous 30 PV sur %d (%.0f %% du temps)." % (
                min(hp), statistics.median(hp), below, len(hp), 100.0 * below / len(hp)))
        caches = [e for e in (s.get("events") or []) if e.get("name") == "cache"]
        if caches:
            out.append("")
            out.append("Coffres : %d ouverts (%s)." % (
                len(caches), ", ".join(sorted({c.get("theme") or "?" for c in caches}))))
        out.append("")
    out.append("---")
    out.append("")
    out.append("_Rapport généré localement ; les données brutes restent dans `telemetry/` (non versionné)._")
    return "\n".join(out) + "\n"


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--write", action="store_true", help="écrit docs/RAPPORT-JEU.md")
    ap.add_argument("--last", type=int, default=None, help="ne garde que les N dernières sessions")
    args = ap.parse_args()
    sessions = load_sessions(args.last)
    report = build_report(sessions)
    if args.write:
        target = os.path.join(ROOT, "docs", "RAPPORT-JEU.md")
        with open(target, "w", encoding="utf-8") as fh:
            fh.write(report)
        print("écrit : %s (%d sessions)" % (target, len(sessions)))
    else:
        print(report)
    return 0


if __name__ == "__main__":
    sys.exit(main())
