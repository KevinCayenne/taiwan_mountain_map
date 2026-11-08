import json
import os
import tempfile
import unittest

import build_routes

# 1: precise coordinates. 2: far from every route.
# 3: rounded coordinates ~900 m from its OSM peak (測試山). 4: rounded, no OSM peak.
PEAKS = [
    {'id': '1', 'title': '玉山主峰', 'lat': '23.470', 'lon': '120.957', 'label_item': [{'name': '台灣百岳'}]},
    {'id': '2', 'title': '遠方山', 'lat': '24.5', 'lon': '121.5', 'label_item': []},
    {'id': '3', 'title': '測試山', 'lat': '23.60', 'lon': '121.10', 'label_item': []},
    {'id': '4', 'title': '無峰山', 'lat': '23.80', 'lon': '121.30', 'label_item': []},
]


def node(nid, lat, lon, tags=None):
    tg = ''.join(f'<tag k="{k}" v="{v}"/>' for k, v in (tags or {}).items())
    return f'<node id="{nid}" version="1" lat="{lat}" lon="{lon}">{tg}</node>'


def relation(rid, ways, tags):
    members = ''.join(f'<member type="way" ref="{w}" role=""/>' for w in ways)
    tg = ''.join(f'<tag k="{k}" v="{v}"/>' for k, v in {'type': 'route', **tags}.items())
    return f'<relation id="{rid}" version="1">{members}{tg}</relation>'


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
  {node(10, 23.481, 120.950)}
  {node(11, 23.481, 120.965)}
  {node(20, 23.606, 121.106, {'natural': 'peak', 'name': '測試山'})}
  {node(21, 23.600, 121.096)}
  {node(22, 23.612, 121.110)}
  {node(23, 23.596, 121.100)}
  {node(24, 23.604, 121.100)}
  {node(30, 23.809, 121.296)}
  {node(31, 23.809, 121.304)}
  {way(100, [1, 2, 3], {'highway': 'path'})}
  {way(101, [3, 4], {'highway': 'path'})}
  {way(200, [5, 6], {'highway': 'path', 'name': '東峰步道'})}
  {way(201, [6, 7], {'highway': 'footway', 'name': '東峰步道'})}
  {way(202, [1, 5], {'highway': 'path', 'name': '主峰線'})}
  {way(300, [8, 9], {'highway': 'path', 'name': '遠方步道'})}
  {way(301, [1, 2], {'highway': 'track', 'name': '林道'})}
  {way(400, [10, 11], {'highway': 'path'})}
  {way(410, [21, 20, 22], {'highway': 'path'})}
  {way(411, [23, 24], {'highway': 'path'})}
  {way(420, [30, 31], {'highway': 'path'})}
  <relation id="900" version="1">
    <member type="way" ref="100" role=""/>
    <member type="way" ref="101" role=""/>
    <tag k="type" v="route"/><tag k="route" v="hiking"/><tag k="name" v="主峰線"/>
  </relation>
  <relation id="901" version="1">
    <member type="way" ref="300" role=""/>
    <tag k="type" v="route"/><tag k="route" v="hiking"/><tag k="name" v="遠方路線"/>
  </relation>
  {relation(905, [400], {'route': 'hiking', 'name': '鄰峰路線'})}
  {relation(902, [410], {'route': 'hiking', 'from': '登山口', 'to': '測試山'})}
  {relation(903, [411], {'route': 'foot', 'name': '山腳步道'})}
  {relation(904, [420], {'route': 'hiking', 'name': '無峰山路線'})}
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
        self.assertEqual(index['routes'], {'1': 2, '3': 1, '4': 1})
        self.assertEqual(index['source'], 'test')
        self.assertFalse(os.path.exists(os.path.join(self.out, '2.json')))

        # 鄰峰路線 passes ~1.2 km from the summit, so it is not listed.
        routes = self.read('1.json')
        self.assertEqual([r['name'] for r in routes], ['主峰線', '東峰步道'])
        self.assertEqual([r['distance'] for r in routes], [0, 151])
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

    def test_measures_from_the_matching_osm_peak(self):
        build_routes.build(self.osm, self.mountains, self.out)
        # The summit is the OSM peak 測試山 (~900 m from the rounded coordinates): the route
        # over it is kept and labelled from its from/to tags, while 山腳步道, which passes the
        # rounded coordinates but ~900 m from the real summit, is not.
        routes = self.read('3.json')
        self.assertEqual([(r['name'], r['distance']) for r in routes], [('登山口－測試山', 0)])

    def test_allows_more_distance_when_the_summit_position_is_uncertain(self):
        build_routes.build(self.osm, self.mountains, self.out)
        # Rounded coordinates and no OSM peak: a route ~1 km away is still listed.
        routes = self.read('4.json')
        self.assertEqual([r['name'] for r in routes], ['無峰山路線'])
        self.assertGreater(routes[0]['distance'], build_routes.ROUTE_MAX_DIST_M)

    def test_name_keys_match_like_the_site(self):
        self.assertTrue(build_routes.name_keys('玉山主峰') & build_routes.name_keys('玉山'))
        self.assertTrue(build_routes.name_keys('奇萊山北峰') & build_routes.name_keys('奇萊北峰'))
        self.assertFalse(build_routes.name_keys('玉山主峰') & build_routes.name_keys('玉山東峰'))

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
