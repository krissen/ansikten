#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import argparse
import glob
import json
import os
import re
import shutil
import sys
from collections import Counter, defaultdict
from datetime import datetime, timedelta
from pathlib import Path
from statistics import median, mean

CONFIG_DIR = Path(os.environ.get("XDG_DATA_HOME", Path.home() / ".local" / "share")) / "faceid"
CONFIG_FILE = CONFIG_DIR / "rakna_spelare.json"


def load_exclusion_config():
    if CONFIG_FILE.exists():
        try:
            with open(CONFIG_FILE, "r") as f:
                return json.load(f)
        except (json.JSONDecodeError, IOError):
            pass
    return {"tranare": [], "publik": []}


def get_exclusion_lists(args):
    config = load_exclusion_config()

    env_tranare = os.environ.get("RAKNA_TRANARE", "")
    env_publik = os.environ.get("RAKNA_PUBLIK", "")

    if env_tranare:
        config["tranare"] = [n.strip() for n in env_tranare.split(",") if n.strip()]
    if env_publik:
        config["publik"] = [n.strip() for n in env_publik.split(",") if n.strip()]

    if args.tranare:
        config["tranare"] = [n.strip() for n in args.tranare.split(",") if n.strip()]
    if args.add_tranare:
        config["tranare"].extend([n.strip() for n in args.add_tranare.split(",") if n.strip()])

    if args.publik:
        config["publik"] = [n.strip() for n in args.publik.split(",") if n.strip()]
    if args.add_publik:
        config["publik"].extend([n.strip() for n in args.add_publik.split(",") if n.strip()])

    return set(config["tranare"]), set(config["publik"])


class Colors:
    """ANSI color codes for terminal output."""

    RED = "\x1b[31m"
    YELLOW = "\x1b[33m"
    GREEN = "\x1b[32m"
    CYAN = "\x1b[36m"
    MAGENTA = "\x1b[35m"
    BOLD = "\x1b[1m"
    DIM = "\x1b[2m"
    RESET = "\x1b[0m"

    @classmethod
    def disable(cls):
        cls.RED = cls.YELLOW = cls.GREEN = cls.CYAN = ""
        cls.MAGENTA = cls.BOLD = cls.DIM = cls.RESET = ""


def parse_filename(fn):
    """
    Plockar ut timestamp och lista av namn från ett filnamn enligt format:
    YYMMDD_HHMMSS[-N]_Namn1[, _Namn2,...].jpg

    Returnerar två värden:
      1) datetime-objekt (baserat på YYMMDDHHMMSS, där "-N" suffix tas bort)
      2) lista av namn (utan några "-N" baktill)
    """
    base = os.path.basename(fn)
    name, ext = os.path.splitext(base)
    i1 = name.find("_")
    i2 = name.find("_", i1 + 1)
    if i1 == -1 or i2 == -1:
        return None, None

    dt_full = name[:i2]
    names_part = name[i2 + 1 :]

    dt_part = dt_full.split("-", 1)[0]
    dt_str = dt_part.replace("_", "")
    try:
        dt = datetime.strptime(dt_str, "%y%m%d%H%M%S")
    except ValueError:
        return None, None

    raw_names = [n.strip() for n in names_part.split(",_") if n.strip()]
    names = [re.sub(r"-\d+$", "", n) for n in raw_names]
    return dt, names


def compute_baseline(counts, method="median"):
    """Compute baseline (target) value from a list of counts."""
    if not counts:
        return 0
    return median(counts) if method == "median" else mean(counts)


def render_bar(value, baseline, width=20, ascii_mode=False):
    """Render a progress bar showing value relative to baseline."""
    if baseline <= 0:
        ratio = 1.0
    else:
        ratio = value / baseline

    fill_char = "#" if ascii_mode else "#"
    empty_char = "-" if ascii_mode else "-"

    filled = min(width, max(0, int(round(ratio * (width / 2)))))
    bar = fill_char * filled + empty_char * (width - filled)
    return f"[{bar}]"


def render_spark(timestamps, start_dt, end_dt, width=12, ascii_mode=False):
    """
    Render temporal spark showing when images appear in the time span.
    Bins are proportional to total time span.
    """
    if not timestamps or start_dt >= end_dt:
        return "." * width

    total_seconds = (end_dt - start_dt).total_seconds()
    if total_seconds <= 0:
        return "." * width

    bins = [0] * width
    for ts in timestamps:
        pos = (ts - start_dt).total_seconds() / total_seconds
        bin_idx = min(width - 1, max(0, int(pos * width)))
        bins[bin_idx] += 1

    if ascii_mode:
        chars = ".:*#"
        thresholds = [0, 1, 3, 5]
    else:
        chars = "·:*#"
        thresholds = [0, 1, 3, 5]

    spark = ""
    for count in bins:
        if count == 0:
            spark += chars[0]
        elif count < thresholds[2]:
            spark += chars[1]
        elif count < thresholds[3]:
            spark += chars[2]
        else:
            spark += chars[3]

    return spark


def get_deviation_label(delta_pct):
    abs_pct = abs(delta_pct)
    if abs_pct > 20:
        return "HIGH" if delta_pct > 0 else "LOW "
    elif abs_pct > 10:
        return "WARN" if delta_pct > 0 else "warn"
    return " OK "


def get_deviation_color(delta_pct):
    abs_pct = abs(delta_pct)
    if abs_pct > 20:
        return Colors.RED
    elif abs_pct > 10:
        return Colors.YELLOW
    return Colors.GREEN


def format_player_line(
    name,
    count,
    total_images,
    baseline,
    timestamps,
    start_dt,
    end_dt,
    use_color=True,
    ascii_mode=False,
    spark_width=12,
    bar_width=20,
    name_width=12,
):
    pct = 100 * count / total_images if total_images > 0 else 0
    delta_n = count - baseline
    delta_pct = 100 * delta_n / baseline if baseline > 0 else 0

    bar = render_bar(count, baseline, bar_width, ascii_mode)
    spark = render_spark(timestamps, start_dt, end_dt, spark_width, ascii_mode)

    sign = "+" if delta_n >= 0 else ""
    delta_n_str = f"({sign}{delta_n:.0f})".rjust(7)

    if use_color:
        color = get_deviation_color(delta_pct)
        delta_pct_str = f"{sign}{delta_pct:.0f}%".rjust(5)
        delta_str = f"{color}{delta_pct_str}{Colors.RESET}"
    else:
        label = get_deviation_label(delta_pct)
        delta_pct_str = f"{sign}{delta_pct:.0f}%".rjust(5)
        delta_str = f"{label} {delta_pct_str}"

    truncated_name = name[:name_width].ljust(name_width)

    return f"{truncated_name}  {count:4d}  {pct:5.1f}%  {delta_str}  {delta_n_str}  {bar}  {spark}"


def print_section(
    title,
    counter,
    timestamps_per_person,
    total_images,
    start_dt,
    end_dt,
    min_images,
    baseline_method,
    use_color,
    ascii_mode,
    spark_width,
    bar_width,
    tranare_set=None,
    publik_set=None,
):
    tranare_set = tranare_set or set()
    publik_set = publik_set or set()
    excluded = tranare_set | publik_set

    players = {n: c for n, c in counter.items() if n not in excluded and c >= min_images}
    below_threshold = {n: c for n, c in counter.items() if n not in excluded and c < min_images}
    tranare = {n: c for n, c in counter.items() if n in tranare_set}
    publik = {n: c for n, c in counter.items() if n in publik_set}

    baseline_counts = list(players.values())
    baseline = compute_baseline(baseline_counts, baseline_method) if baseline_counts else 0

    excluded_count = len(tranare) + len(publik) + len(below_threshold)
    total_in_list = len(counter)

    print(f"\n{Colors.BOLD}{title}{Colors.RESET}" if use_color else f"\n{title}")
    info_parts = [f"Bilder: {total_images}", f"Spelare: {len(players)}"]
    if excluded_count > 0:
        info_parts.append(f"(av {total_in_list}, exkl. {excluded_count})")
    info_parts.append(f"Baseline: {baseline_method}={baseline:.1f}")
    print("   ".join(info_parts))

    term_width = shutil.get_terminal_size(fallback=(100, 20)).columns
    name_width = min(15, max(8, term_width - 70))

    if use_color:
        header = f"{'NAMN':<{name_width}}  {'ANT':>4}      %     {'Δ%':>5}      {'ΔN':>5}  {'BAR':<{bar_width+2}}  SPARK"
    else:
        header = f"{'NAMN':<{name_width}}  {'ANT':>4}      %       {'Δ%':>5}    {'ΔN':>5}  {'BAR':<{bar_width+2}}  SPARK"
    print(f"{Colors.DIM}{header}{Colors.RESET}" if use_color else header)

    sorted_players = sorted(players.items(), key=lambda x: x[1] - baseline, reverse=True)

    for name, count in sorted_players:
        ts_list = timestamps_per_person.get(name, [])
        line = format_player_line(
            name,
            count,
            total_images,
            baseline,
            ts_list,
            start_dt,
            end_dt,
            use_color,
            ascii_mode,
            spark_width,
            bar_width,
            name_width,
        )
        print(line)

    if tranare:
        print()
        label = f"--- Tränare ({len(tranare)} st) ---"
        print(f"{Colors.CYAN}{label}{Colors.RESET}" if use_color else label)
        for name, count in sorted(tranare.items(), key=lambda x: x[1], reverse=True):
            pct = 100 * count / total_images if total_images > 0 else 0
            print(f"  {name}: {count} ({pct:.1f}%)")

    if publik:
        print()
        label = f"--- Publik ({len(publik)} st) ---"
        print(f"{Colors.MAGENTA}{label}{Colors.RESET}" if use_color else label)
        for name, count in sorted(publik.items(), key=lambda x: x[1], reverse=True):
            pct = 100 * count / total_images if total_images > 0 else 0
            print(f"  {name}: {count} ({pct:.1f}%)")

    if below_threshold:
        print()
        label = f"--- Under tröskeln (min-images={min_images}) ---"
        print(f"{Colors.DIM}{label}{Colors.RESET}" if use_color else label)
        for name, count in sorted(below_threshold.items(), key=lambda x: x[1], reverse=True):
            pct = 100 * count / total_images if total_images > 0 else 0
            print(f"  {name}: {count} ({pct:.1f}%)")


def main(args):
    if args.no_color or args.color == "never" or (args.color == "auto" and not sys.stdout.isatty()):
        Colors.disable()
        use_color = False
    else:
        use_color = True

    if os.environ.get("NO_COLOR"):
        Colors.disable()
        use_color = False

    tranare_set, publik_set = get_exclusion_lists(args)

    files = []
    for pat in args.glob_patterns:
        files.extend(glob.glob(os.path.expanduser(pat)))
    if not files:
        print("Ingen fil matchade angivet mönster.")
        sys.exit(1)

    entries = []
    for fn in files:
        dt, names = parse_filename(fn)
        if dt is None:
            continue
        entries.append((dt, names, fn))

    if not entries:
        print("Inga giltiga bilder hittades bland matchande filer.")
        sys.exit(1)

    entries.sort(key=lambda x: x[0])

    matcher = []
    current_match = [0]
    for i in range(1, len(entries)):
        prev_dt = entries[i - 1][0]
        this_dt = entries[i][0]
        if this_dt - prev_dt > timedelta(minutes=args.gap_minutes):
            matcher.append(current_match)
            current_match = [i]
        else:
            current_match.append(i)
    matcher.append(current_match)

    total_counter = Counter()
    total_timestamps = defaultdict(list)
    per_match_counters = []
    per_match_timestamps = []

    for idx_list in matcher:
        c = Counter()
        ts_map = defaultdict(list)
        for idx in idx_list:
            dt, names, _ = entries[idx]
            for n in names:
                c[n] += 1
                total_counter[n] += 1
                ts_map[n].append(dt)
                total_timestamps[n].append(dt)
        per_match_counters.append(c)
        per_match_timestamps.append(ts_map)

    total_images = len(entries)
    global_start = entries[0][0]
    global_end = entries[-1][0]

    duration = global_end - global_start
    duration_minutes = duration.total_seconds() / 60
    spark_width = max(8, min(20, int(duration_minutes / 3)))

    print_section(
        f"=== Totalt ({global_start.strftime('%H:%M')} → {global_end.strftime('%H:%M')}, {duration_minutes:.0f} min) ===",
        total_counter,
        total_timestamps,
        total_images,
        global_start,
        global_end,
        args.min_images,
        args.baseline,
        use_color,
        args.ascii,
        spark_width,
        args.bar_width,
        tranare_set,
        publik_set,
    )

    if args.per_match:
        print()
        for match_idx, (c, ts_map) in enumerate(zip(per_match_counters, per_match_timestamps), start=1):
            idx_list = matcher[match_idx - 1]
            start_dt = entries[idx_list[0]][0]
            end_dt = entries[idx_list[-1]][0]
            match_duration = (end_dt - start_dt).total_seconds() / 60
            match_spark_width = max(6, min(16, int(match_duration / 2)))

            match_images = len(idx_list)

            coverage_info = ""
            for name in c:
                matches_present = sum(1 for pc in per_match_counters if name in pc)
                coverage_info = f"  (täckning: {matches_present}/{len(matcher)} matcher)"
                break

            print_section(
                f"--- Match {match_idx} ({start_dt.strftime('%Y-%m-%d %H:%M')} → {end_dt.strftime('%H:%M')}, {match_duration:.0f} min) ---",
                c,
                ts_map,
                match_images,
                start_dt,
                end_dt,
                args.min_images,
                args.baseline,
                use_color,
                args.ascii,
                match_spark_width,
                args.bar_width,
                tranare_set,
                publik_set,
            )

            if len(matcher) > 1:
                print(f"\n  Match-täckning per spelare:")
                for name in sorted(c.keys()):
                    matches_present = sum(1 for pc in per_match_counters if name in pc)
                    missing = [
                        f"M{i+1}"
                        for i, pc in enumerate(per_match_counters)
                        if name not in pc
                    ]
                    missing_str = f" saknas: {','.join(missing)}" if missing else ""
                    print(f"    {name}: {matches_present}/{len(matcher)}{missing_str}")
            print()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description=(
            "Räknar antal bilder per person med statistik för att hitta över-/underrepresenterade spelare. "
            "Visar procent, deviation från baseline (median/mean), progress-bar och temporal spark."
        )
    )
    parser.add_argument(
        "glob_patterns",
        nargs="+",
        help="Ett eller flera glob-mönster, t.ex. 250601*.jpg eller ~/Pictures/*.jpg",
    )
    parser.add_argument(
        "-g",
        "--gap-minutes",
        type=int,
        default=30,
        help="Maximalt antal minuter mellan bilder för samma match (standard: 30)",
    )
    parser.add_argument(
        "-p",
        "--per-match",
        action="store_true",
        help="Visa även resultat per match med täckning",
    )
    parser.add_argument(
        "--baseline",
        choices=["median", "mean"],
        default="median",
        help="Baseline-metod för deviation (standard: median)",
    )
    parser.add_argument(
        "--min-images",
        type=int,
        default=3,
        help="Minsta antal bilder för att inkluderas i baseline (standard: 3)",
    )
    parser.add_argument(
        "--no-color",
        action="store_true",
        help="Stäng av färgutskrift",
    )
    parser.add_argument(
        "--color",
        choices=["auto", "always", "never"],
        default="auto",
        help="Färgläge (standard: auto)",
    )
    parser.add_argument(
        "--ascii",
        action="store_true",
        help="Använd endast ASCII-tecken (inga unicode)",
    )
    parser.add_argument(
        "--bar-width",
        type=int,
        default=20,
        help="Bredd på progress-bar (standard: 20)",
    )
    parser.add_argument(
        "--tranare",
        type=str,
        default=None,
        help="Kommaseparerad lista på tränare (ersätter config/env)",
    )
    parser.add_argument(
        "--add-tranare",
        type=str,
        default=None,
        help="Lägg till tränare till config/env-listan",
    )
    parser.add_argument(
        "--publik",
        type=str,
        default=None,
        help="Kommaseparerad lista på publik (ersätter config/env)",
    )
    parser.add_argument(
        "--add-publik",
        type=str,
        default=None,
        help="Lägg till publik till config/env-listan",
    )
    args = parser.parse_args()
    main(args)
