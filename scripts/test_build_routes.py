import json
import os
import tempfile
import unittest

import build_routes

# Peak A at (23.47, 120.957); peak B far away at (24.5, 121.5).
PEAKS = [
    {'id': '1', 'title': '玉山主峰', 'lat': '23.47', 'lon': '120.957', 'label_item': [{'name': '台灣百岳'}]},
    {'id': '2', 'title': '遠方山', 'lat': '24.5', 'lon': '121.5', 'label_item': []},
]


def node(nid, lat, lon):
    return f'<node id="{nid}" version="1" lat="{lat}" lon="{lon}"/>'


def way(wid, nodes, tags):
    nds = ''.join(f'<nd ref="{n}"/>' for n in nodes)
    tg = ''.join(f'<tag k="{k}" v="{v}"/>' for k, v in tags.items())
    return f'<way id="{wid}" version="1">{nds}{tg}</way>'


OSM = f"""<?xml version="1.0" encoding="UTF-8"?>
<osm version="0.6" generator="test">
  {node(1, 23.470, 120.957)}
  {node(2, 23.460, 120.950)}
  {node(3, 23.450, 120.940)}
  {node(4, 23.300, 120.800)}
  {node(5, 23.471, 120.958)}
  {node(6, 23.475, 120.965)}
  {node(7, 23.476, 120.966)}
  {node(8, 24.000, 121.000)}
  {node(9, 24.001, 121.001)}
  {way(100, [1, 2, 3], {'highway': 'path'})}
  {way(101, [3, 4], {'highway': 'path'})}
  {way(200, [5, 6], {'highway': 'path', 'name': '東峰步道'})}
  {way(201, [6, 7], {'highway': 'footway', 'name': '東峰步道'})}
  {way(202, [1, 5], {'highway': 'path', 'name': '主峰線'})}
  {way(300, [8, 9], {'highway': 'path', 'name': '遠方步道'})}
  {way(301, [1, 2], {'highway': 'track', 'name': '林道'})}
  <relation id="900" version="1">
    <member type="way" ref="100" role=""/>
    <member type="way" ref="101" role=""/>
    <tag k="type" v="route"/><tag k="route" v="hiking"/><tag k="name" v="主峰線"/>
  </relation>
  <relation id="901" version="1">
    <member type="way" ref="300" role=""/>
    <tag k="type" v="route"/><tag k="route" v="hiking"/><tag k="name" v="遠方路線"/>
  </relation>
</osm>
"""


class BuildRoutesTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.osm = os.path.join(self.tmp.name, 'test.osm')
        self.mountains = os.path.join(self.tmp.name, 'mountains.json')
        self.out = os.path.join(self.tmp.name, 'routes')
        with open(self.osm, 'w', encoding='utf-8') as f:
            f.write(OSM)
        with open(self.mountains, 'w', encoding='utf-8') as f:
            json.dump(PEAKS, f, ensure_ascii=False)

    def tearDown(self):
        self.tmp.cleanup()

    def read(self, name):
        with open(os.path.join(self.out, name), encoding='utf-8') as f:
            return json.load(f)

    def test_builds_routes_for_peaks_with_trails(self):
        build_routes.build(self.osm, self.mountains, self.out, source='test')

        index = self.read('index.json')
        self.assertEqual(index['routes'], {'1': 2})
        self.assertEqual(index['source'], 'test')
        self.assertFalse(os.path.exists(os.path.join(self.out, '2.json')))

        routes = self.read('1.json')
        self.assertEqual([r['name'] for r in routes], ['主峰線', '東峰步道'])
        relation, path = routes

        self.assertEqual(relation['id'], 'relation/900')
        self.assertEqual(relation['url'], 'https://www.openstreetmap.org/relation/900')
        # Way 101 runs to (23.3, 120.8), outside the ~9 km clip box: only its in-box start remains,
        # which is a single point, so it is dropped.
        self.assertEqual(relation['lines'], [[[23.47, 120.957], [23.46, 120.95], [23.45, 120.94]]])

        # Footpaths are grouped by name; the 主峰線 path is skipped since the relation has that name,
        # and the 林道 track is not a footpath.
        self.assertEqual(path['id'], 'way/200')
        self.assertEqual(len(path['lines']), 2)

    def test_replaces_stale_files(self):
        os.makedirs(self.out)
        with open(os.path.join(self.out, '999.json'), 'w') as f:
            f.write('[]')
        build_routes.build(self.osm, self.mountains, self.out)
        self.assertFalse(os.path.exists(os.path.join(self.out, '999.json')))

    def test_clip_line_splits_where_the_line_leaves_the_box(self):
        peak = {'lat': 0.0, 'lon': 0.0}
        line = [(0, 0), (0.01, 0), (1, 1), (0.02, 0), (0.03, 0)]
        self.assertEqual(build_routes.clip_line(line, peak, 0.05),
                         [[(0, 0), (0.01, 0)], [(0.02, 0), (0.03, 0)]])

    def test_simplify_drops_collinear_points(self):
        line = [(0, 0), (0, 0.001), (0, 0.002), (0.01, 0.003)]
        self.assertEqual(build_routes.simplify(line), [(0, 0), (0, 0.002), (0.01, 0.003)])


if __name__ == '__main__':
    unittest.main()
