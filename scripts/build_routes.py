#!/usr/bin/env python3
"""Pre-compute hiking routes near each mountain from an OpenStreetMap extract.

Reads a Taiwan .osm.pbf extract (e.g. https://download.geofabrik.de/asia/taiwan-latest.osm.pbf)
and writes, for every mountain that has routes reaching its summit:

    <out_dir>/<mountain id>.json   list of {id, name, url, distance, lines: [[[lat, lon], ...], ...]}
    <out_dir>/index.json           {generated, source, routes: {mountain id: route count}}

A route belongs to a mountain only if it passes close to the summit (ROUTE_MAX_DIST_M).
The summit is the OpenStreetMap peak (natural=peak) with a matching name near the
mountain's coordinates when there is one, since some coordinates in the mountain
data are rounded to ~1 km.

The site loads these static files instead of querying the public Overpass API
from the browser, which was slow and often failed.

Usage:
    python scripts/build_routes.py taiwan-latest.osm.pbf src/assets/json/mountain_data_new.json public/data/routes

Route data: (c) OpenStreetMap contributors, ODbL.
"""

import argparse
import json
import math
import os
import re
import sys
from collections import defaultdict
from datetime import datetime, timezone

import osmium

# A route must pass this close to the summit to be listed for the mountain.
ROUTE_MAX_DIST_M = 500
# ... or this close when the summit position is uncertain (coordinates rounded to
# 2 decimals or fewer, ~1 km, and no matching OSM peak was found).
IMPRECISE_ROUTE_MAX_DIST_M = 1200
# Search boxes, in degrees (1 deg latitude ~ 111 km). Only used to pre-filter.
PEAK_MATCH_DEG = 0.03       # ~3 km: look for a same-name OSM peak
ROUTE_RELATION_DEG = 0.015  # ~1.6 km: route relations near the summit
NAMED_PATH_DEG = 0.045      # ~5 km around the given coordinates (covers a moved summit)
ROUTE_CLIP_DEG = 0.08       # ~9 km: long-distance trails are clipped to this box
MAX_ROUTES = 8
SIMPLIFY_TOLERANCE_DEG = 0.00004  # ~4 m
COORD_DECIMALS = 5
ROUTE_TYPES = {'hiking', 'foot'}
PATH_HIGHWAYS = {'path', 'footway'}
GRID_DEG = 0.05


def route_name(tags):
    return tags.get('name:zh') or tags.get('name') or tags.get('name:en') or ''


def unnamed_route_label(tags):
    ends = [tags.get('from'), tags.get('to')]
    return '－'.join(e for e in ends if e) or 'OpenStreetMap 登山路線'


# Same name matching as the photo lookup in src/components/MapContainerDiv/openData.js:
# ignore a "(...)" suffix and spaces, also compare without 山 and without a trailing 主峰.
def name_keys(name):
    n = re.sub(r'\s*[(（].*?[)）]\s*$', '', name or '')
    n = re.sub(r'\s', '', n)
    if not n:
        return set()
    keys = {n, n.replace('山', '')}
    if re.search(r'.+山主峰$', n):
        base = n[:-2]
        keys |= {base, base.replace('山', '')}
    return {k for k in keys if k}


def candidate_names(peak):
    return [peak['title']] + [s.strip() for s in re.split(r'[∕/、,，]', peak.get('nick_name') or '') if s.strip()]


def distance_m(a, b):
    kx = 111320 * math.cos(math.radians((a[0] + b[0]) / 2))
    return math.hypot((a[0] - b[0]) * 111320, (a[1] - b[1]) * kx)


def line_distance_m(point, line):
    """Shortest distance in metres from a point to a polyline (local flat approximation)."""
    kx = 111320 * math.cos(math.radians(point[0]))
    ky = 111320
    best = float('inf')
    prev = None
    for lat, lon in line:
        cur = ((lon - point[1]) * kx, (lat - point[0]) * ky)
        if prev is None:
            best = min(best, math.hypot(*cur))
        else:
            dx, dy = cur[0] - prev[0], cur[1] - prev[1]
            length = dx * dx + dy * dy
            t = 0.0 if length == 0 else max(0.0, min(1.0, -(prev[0] * dx + prev[1] * dy) / length))
            best = min(best, math.hypot(prev[0] + t * dx, prev[1] + t * dy))
        prev = cur
    return best


class PeakIndex:
    """Grid index to find peaks whose box (of a given size) contains a point."""

    def __init__(self, peaks, deg):
        self.deg = deg
        self.cells = defaultdict(list)
        for peak in peaks:
            for cx in self._range(peak['lat']):
                for cy in self._range(peak['lon']):
                    self.cells[(cx, cy)].append(peak)

    def _range(self, value):
        return range(math.floor((value - self.deg) / GRID_DEG), math.floor((value + self.deg) / GRID_DEG) + 1)

    def near(self, lat, lon):
        cell = (math.floor(lat / GRID_DEG), math.floor(lon / GRID_DEG))
        return [p for p in self.cells.get(cell, ())
                if abs(p['lat'] - lat) <= self.deg and abs(p['lon'] - lon) <= self.deg]


class RelationCollector(osmium.SimpleHandler):
    """Pass 1: hiking route relations (and their member way ids), and named OSM peaks."""

    FILTER_TAGS = [('natural', 'peak')] + [('route', t) for t in sorted(ROUTE_TYPES)]

    def __init__(self):
        super().__init__()
        self.relations = {}
        self.member_ways = set()
        self.osm_peaks = []

    def node(self, n):
        if n.tags.get('natural') != 'peak' or not n.location.valid():
            return
        names = {n.tags.get(k) for k in ('name', 'name:zh', 'name:zh-Hant', 'alt_name', 'old_name')} - {None}
        if names:
            self.osm_peaks.append({'lat': n.location.lat, 'lon': n.location.lon, 'names': names})

    def relation(self, r):
        if r.tags.get('route') not in ROUTE_TYPES:
            return
        ways = [m.ref for m in r.members if m.type == 'w']
        if not ways:
            return
        name = route_name(r.tags) or unnamed_route_label(r.tags)
        self.relations[r.id] = {'name': name, 'ways': ways}
        self.member_ways.update(ways)

    def collect(self, path):
        self.apply_file(path, filters=[osmium.filter.TagFilter(*self.FILTER_TAGS)])


class WayCollector(osmium.SimpleHandler):
    """Pass 2: geometries of relation members, and named footpaths near a peak."""

    def __init__(self, member_ways, path_index):
        super().__init__()
        self.member_ways = member_ways
        self.path_index = path_index
        self.member_geometry = {}
        self.named_paths = []

    def way(self, w):
        is_member = w.id in self.member_ways
        is_path = w.tags.get('highway') in PATH_HIGHWAYS and route_name(w.tags)
        if not is_member and not is_path:
            return
        line = [(n.location.lat, n.location.lon) for n in w.nodes if n.location.valid()]
        if len(line) < 2:
            return
        if is_member:
            self.member_geometry[w.id] = line
        if is_path and any(self.path_index.near(lat, lon) for lat, lon in line):
            self.named_paths.append({'id': w.id, 'name': route_name(w.tags), 'line': line})


def in_box(point, peak, deg):
    return abs(point[0] - peak['lat']) <= deg and abs(point[1] - peak['lon']) <= deg


def clip_line(line, peak, deg):
    """Keep the parts of a line inside the box, splitting where it leaves."""
    parts, current = [], []
    for point in line:
        if in_box(point, peak, deg):
            current.append(point)
        elif current:
            parts.append(current)
            current = []
    if current:
        parts.append(current)
    return [p for p in parts if len(p) > 1]


def simplify(line, tolerance=SIMPLIFY_TOLERANCE_DEG):
    """Ramer-Douglas-Peucker simplification (iterative)."""
    if len(line) < 3:
        return line
    keep = [False] * len(line)
    keep[0] = keep[-1] = True
    stack = [(0, len(line) - 1)]
    while stack:
        start, end = stack.pop()
        (y1, x1), (y2, x2) = line[start], line[end]
        dx, dy = x2 - x1, y2 - y1
        norm = math.hypot(dx, dy)
        best, index = 0.0, None
        for i in range(start + 1, end):
            y0, x0 = line[i]
            dist = abs(dy * x0 - dx * y0 + x2 * y1 - y2 * x1) / norm if norm else math.hypot(x0 - x1, y0 - y1)
            if dist > best:
                best, index = dist, i
        if index is not None and best > tolerance:
            keep[index] = True
            stack.extend([(start, index), (index, end)])
    return [p for p, k in zip(line, keep) if k]


def finish_line(line):
    return [[round(lat, COORD_DECIMALS), round(lon, COORD_DECIMALS)] for lat, lon in simplify(line)]


def find_summit(peak, osm_peaks):
    """The nearest OSM peak within PEAK_MATCH_DEG whose name matches the mountain, or None."""
    keys = set()
    for name in candidate_names(peak):
        keys |= name_keys(name)
    best = None
    for osm_peak in osm_peaks:
        if abs(osm_peak['lat'] - peak['lat']) > PEAK_MATCH_DEG or abs(osm_peak['lon'] - peak['lon']) > PEAK_MATCH_DEG:
            continue
        if not any(name_keys(n) & keys for n in osm_peak['names']):
            continue
        d = distance_m((peak['lat'], peak['lon']), (osm_peak['lat'], osm_peak['lon']))
        if best is None or d < best[0]:
            best = (d, osm_peak)
    return best[1] if best else None


def routes_for_peak(peak, relations, member_geometry, named_paths, summit=None):
    """Routes that pass within the allowed distance of the summit, closest first."""
    center = {'lat': summit['lat'], 'lon': summit['lon']} if summit else peak
    point = (center['lat'], center['lon'])
    max_dist = ROUTE_MAX_DIST_M if summit or peak.get('precise', True) else IMPRECISE_ROUTE_MAX_DIST_M

    candidates = []
    relation_names = set()
    for rel_id, rel in relations.items():
        geometries = [member_geometry[w] for w in rel['ways'] if w in member_geometry]
        if not any(in_box(pt, center, ROUTE_RELATION_DEG) for line in geometries for pt in line):
            continue
        dist = min(line_distance_m(point, line) for line in geometries)
        if dist > max_dist:
            continue
        lines = [finish_line(part) for line in geometries for part in clip_line(line, center, ROUTE_CLIP_DEG)]
        lines = [l for l in lines if len(l) > 1]
        if not lines:
            continue
        relation_names.add(rel['name'])
        candidates.append({'id': f'relation/{rel_id}', 'name': rel['name'],
                           'url': f'https://www.openstreetmap.org/relation/{rel_id}',
                           'distance': dist, 'lines': lines})

    # Named footpaths that are not part of a listed relation, grouped by name. A group
    # is kept when one of its segments reaches the summit area.
    by_name = {}
    for path in named_paths:
        if path['name'] in relation_names:
            continue
        if not any(in_box(pt, center, NAMED_PATH_DEG) for pt in path['line']):
            continue
        group = by_name.setdefault(path['name'], {
            'id': f"way/{path['id']}", 'name': path['name'],
            'url': f"https://www.openstreetmap.org/way/{path['id']}",
            'distance': float('inf'), 'lines': []})
        group['distance'] = min(group['distance'], line_distance_m(point, path['line']))
        group['lines'].append(path['line'])
    for group in by_name.values():
        if group['distance'] > max_dist:
            continue
        lines = [finish_line(part) for line in group['lines'] for part in clip_line(line, center, ROUTE_CLIP_DEG)]
        lines = [l for l in lines if len(l) > 1]
        if lines:
            candidates.append({**group, 'lines': lines})

    candidates.sort(key=lambda r: (r['distance'], r['name']))
    for route in candidates:
        route['distance'] = int(round(route['distance']))
    return candidates[:MAX_ROUTES]


def coordinate_decimals(value):
    text = str(value)
    return len(text.split('.', 1)[1]) if '.' in text else 0


def load_peaks(path):
    with open(path, encoding='utf-8') as f:
        data = json.load(f)
    peaks = []
    for item in data:
        try:
            peaks.append({
                'id': str(item['id']), 'title': item.get('title', ''), 'nick_name': item.get('nick_name', ''),
                'lat': float(item['lat']), 'lon': float(item['lon']),
                # 3+ decimals is ~100 m; fewer can be ~1 km off.
                'precise': min(coordinate_decimals(item['lat']), coordinate_decimals(item['lon'])) >= 3,
            })
        except (KeyError, TypeError, ValueError):
            continue
    return peaks


def build(pbf_path, mountains_path, out_dir, source=''):
    peaks = load_peaks(mountains_path)

    relations = RelationCollector()
    relations.collect(pbf_path)

    ways = WayCollector(relations.member_ways, PeakIndex(peaks, NAMED_PATH_DEG))
    ways.apply_file(pbf_path, locations=True, idx='flex_mem')

    os.makedirs(out_dir, exist_ok=True)
    for name in os.listdir(out_dir):
        if name.endswith('.json'):
            os.remove(os.path.join(out_dir, name))

    counts = {}
    matched_summits = 0
    for peak in peaks:
        summit = find_summit(peak, relations.osm_peaks)
        matched_summits += summit is not None
        routes = routes_for_peak(peak, relations.relations, ways.member_geometry, ways.named_paths, summit)
        if not routes:
            continue
        counts[peak['id']] = len(routes)
        with open(os.path.join(out_dir, f"{peak['id']}.json"), 'w', encoding='utf-8') as f:
            json.dump(routes, f, ensure_ascii=False, separators=(',', ':'))

    index = {
        'generated': datetime.now(timezone.utc).strftime('%Y-%m-%d'),
        'source': source,
        'routes': counts,
    }
    with open(os.path.join(out_dir, 'index.json'), 'w', encoding='utf-8') as f:
        json.dump(index, f, ensure_ascii=False, separators=(',', ':'))

    stats = {'relations': len(relations.relations), 'named_paths': len(ways.named_paths),
             'osm_peaks': len(relations.osm_peaks), 'matched_summits': matched_summits}
    return peaks, counts, stats


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('pbf', help='OpenStreetMap extract (.osm.pbf or .osm)')
    parser.add_argument('mountains', help='mountain_data_new.json')
    parser.add_argument('out_dir', help='output directory, e.g. public/data/routes')
    parser.add_argument('--source', default='OpenStreetMap', help='source label stored in index.json')
    args = parser.parse_args(argv)

    peaks, counts, stats = build(args.pbf, args.mountains, args.out_dir, args.source)

    # Summary for the CI log.
    with open(args.mountains, encoding='utf-8') as f:
        categories = {str(m['id']): (m['label_item'][0]['name'] if m.get('label_item') else '其他山岳') for m in json.load(f)}
    totals = defaultdict(lambda: [0, 0])
    for peak in peaks:
        cat = categories.get(peak['id'], '其他山岳')
        totals[cat][1] += 1
        if peak['id'] in counts:
            totals[cat][0] += 1
    size = sum(os.path.getsize(os.path.join(args.out_dir, n)) for n in os.listdir(args.out_dir))
    print(f"route relations: {stats['relations']}, named footpaths near peaks: {stats['named_paths']}")
    print(f"summits matched to a named OSM peak: {stats['matched_summits']}/{len(peaks)} "
          f"(OSM peaks with names: {stats['osm_peaks']})")
    print(f'routes must pass within {ROUTE_MAX_DIST_M} m of the summit '
          f'({IMPRECISE_ROUTE_MAX_DIST_M} m when the summit position is uncertain)')
    print(f'mountains with routes: {len(counts)}/{len(peaks)}, output size: {size / 1024:.0f} KiB')
    for cat, (with_routes, total) in sorted(totals.items(), key=lambda kv: -kv[1][1]):
        print(f'  {cat}: {with_routes}/{total}')
    return 0


if __name__ == '__main__':
    sys.exit(main())
