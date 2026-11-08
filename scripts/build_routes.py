#!/usr/bin/env python3
"""Pre-compute hiking routes near each mountain from an OpenStreetMap extract.

Reads a Taiwan .osm.pbf extract (e.g. https://download.geofabrik.de/asia/taiwan-latest.osm.pbf)
and writes, for every mountain that has routes nearby:

    <out_dir>/<mountain id>.json   list of {id, name, url, lines: [[[lat, lon], ...], ...]}
    <out_dir>/index.json           {generated, source, routes: {mountain id: route count}}

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
import sys
from collections import defaultdict
from datetime import datetime, timezone

import osmium

# Search boxes around each peak, in degrees (1 deg latitude ~ 111 km).
ROUTE_RELATION_DEG = 0.027  # ~3 km: route relations passing near the peak
NAMED_PATH_DEG = 0.018      # ~2 km: named footpaths near the peak
ROUTE_CLIP_DEG = 0.08       # ~9 km: long-distance trails are clipped to this box
MAX_ROUTES = 10
SIMPLIFY_TOLERANCE_DEG = 0.00004  # ~4 m
COORD_DECIMALS = 5
ROUTE_TYPES = {'hiking', 'foot'}
PATH_HIGHWAYS = {'path', 'footway'}
GRID_DEG = 0.05


def route_name(tags):
    return tags.get('name:zh') or tags.get('name') or tags.get('name:en') or ''


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
    """Pass 1: hiking route relations and the ids of their member ways."""

    def __init__(self):
        super().__init__()
        self.relations = {}
        self.member_ways = set()

    def relation(self, r):
        if r.tags.get('route') not in ROUTE_TYPES:
            return
        ways = [m.ref for m in r.members if m.type == 'w']
        if not ways:
            return
        self.relations[r.id] = {'name': route_name(r.tags), 'ways': ways}
        self.member_ways.update(ways)


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


def routes_for_peak(peak, relations, member_geometry, named_paths):
    routes = []
    relation_names = set()
    for rel_id, rel in relations.items():
        geometries = [member_geometry[w] for w in rel['ways'] if w in member_geometry]
        if not any(in_box(pt, peak, ROUTE_RELATION_DEG) for line in geometries for pt in line):
            continue
        lines = [finish_line(part) for line in geometries for part in clip_line(line, peak, ROUTE_CLIP_DEG)]
        lines = [l for l in lines if len(l) > 1]
        if not lines:
            continue
        name = rel['name'] or 'OpenStreetMap 登山路線'
        relation_names.add(name)
        routes.append({'id': f'relation/{rel_id}', 'name': name,
                       'url': f'https://www.openstreetmap.org/relation/{rel_id}', 'lines': lines})

    by_name = {}
    for path in named_paths:
        if path['name'] in relation_names:
            continue
        if not any(in_box(pt, peak, NAMED_PATH_DEG) for pt in path['line']):
            continue
        route = by_name.setdefault(path['name'], {
            'id': f"way/{path['id']}", 'name': path['name'],
            'url': f"https://www.openstreetmap.org/way/{path['id']}", 'lines': []})
        route['lines'].append(finish_line(path['line']))

    # Relations first (curated routes), then named paths with the most segments.
    paths = sorted(by_name.values(), key=lambda r: -len(r['lines']))
    return (routes + paths)[:MAX_ROUTES]


def load_peaks(path):
    with open(path, encoding='utf-8') as f:
        data = json.load(f)
    peaks = []
    for item in data:
        try:
            peaks.append({'id': str(item['id']), 'title': item.get('title', ''),
                          'lat': float(item['lat']), 'lon': float(item['lon'])})
        except (KeyError, TypeError, ValueError):
            continue
    return peaks


def build(pbf_path, mountains_path, out_dir, source=''):
    peaks = load_peaks(mountains_path)

    relations = RelationCollector()
    relations.apply_file(pbf_path)

    ways = WayCollector(relations.member_ways, PeakIndex(peaks, NAMED_PATH_DEG))
    ways.apply_file(pbf_path, locations=True, idx='flex_mem')

    os.makedirs(out_dir, exist_ok=True)
    for name in os.listdir(out_dir):
        if name.endswith('.json'):
            os.remove(os.path.join(out_dir, name))

    counts = {}
    for peak in peaks:
        routes = routes_for_peak(peak, relations.relations, ways.member_geometry, ways.named_paths)
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

    return peaks, relations.relations, ways.named_paths, counts


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('pbf', help='OpenStreetMap extract (.osm.pbf or .osm)')
    parser.add_argument('mountains', help='mountain_data_new.json')
    parser.add_argument('out_dir', help='output directory, e.g. public/data/routes')
    parser.add_argument('--source', default='OpenStreetMap', help='source label stored in index.json')
    args = parser.parse_args(argv)

    peaks, relations, named_paths, counts = build(args.pbf, args.mountains, args.out_dir, args.source)

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
    print(f'route relations: {len(relations)}, named footpaths near peaks: {len(named_paths)}')
    print(f'mountains with routes: {len(counts)}/{len(peaks)}, output size: {size / 1024:.0f} KiB')
    for cat, (with_routes, total) in sorted(totals.items(), key=lambda kv: -kv[1][1]):
        print(f'  {cat}: {with_routes}/{total}')
    return 0


if __name__ == '__main__':
    sys.exit(main())
