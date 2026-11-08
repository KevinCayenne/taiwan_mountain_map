// Open data sources used for mountain photos and hiking routes.
// Both APIs allow cross-origin requests from the browser, so no proxy is needed.
//  - Photos: Wikipedia (zh) + Wikimedia Commons, CC licensed, credited in the UI.
//  - Routes: OpenStreetMap via the Overpass API, ODbL, credited in the UI.

const WIKIPEDIA_API = 'https://zh.wikipedia.org/w/api.php';
const COMMONS_API = 'https://commons.wikimedia.org/w/api.php';
const OVERPASS_APIS = [
    'https://overpass-api.de/api/interpreter',
    'https://overpass.kumi.systems/api/interpreter',
];

const PHOTO_WIDTH = 800;
const ARTICLE_RADIUS_M = 2000;
const NEARBY_PHOTO_RADIUS_M = 1000;
// Search boxes around the peak (1° latitude ≈ 111 km). Bounding boxes use Overpass's
// spatial index and are much faster than around: radius filters.
const ROUTE_RELATION_DEG = 0.027; // ~3 km
const NAMED_PATH_DEG = 0.018; // ~2 km
const ROUTE_CLIP_DEG = 0.08; // clip long-distance trails to ~9 km around the peak
const MAX_ROUTES = 10;
const OVERPASS_TIMEOUT_S = 15;
const OVERPASS_HEDGE_MS = 4000; // ask the backup server if the first is slow
const ROUTE_CACHE_KEY = 'routes-cache-v1';
const ROUTE_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const ROUTE_CACHE_MAX = 40;

const mediaWiki = async (api, params) => {
    const query = new URLSearchParams({ format: 'json', formatversion: '2', origin: '*', ...params });
    const resp = await fetch(`${api}?${query}`);
    if (!resp.ok) throw new Error(`MediaWiki API ${resp.status}`);
    return resp.json();
};

const stripHtml = (html) => {
    if (!html) return '';
    return (new DOMParser().parseFromString(html, 'text/html').body.textContent || '').trim();
};

// "象山 (臺北市)" -> "象山"; also compare without "山" so 奇萊山北峰 matches 奇萊北峰.
const normalizeName = (name) => (name || '').replace(/\s*[(（].*?[)）]\s*$/, '').replace(/\s/g, '');
const nameKeys = (name) => {
    const n = normalizeName(name);
    return n ? [n, n.replace(/山/g, '')] : [];
};

// 玉山主峰's article is titled 玉山, so also try the name without a trailing 主峰.
const candidateNames = (item) => {
    const names = [item.title, ...(item.nick_name || '').split(/[∕/、,，]/)]
        .map(s => (s || '').trim())
        .filter(Boolean);
    const withoutMainPeak = names.filter(n => /.+山主峰$/.test(n)).map(n => n.replace(/主峰$/, ''));
    return [...names, ...withoutMainPeak];
};

export const matchesMountain = (articleTitle, item) => {
    const articleKeys = nameKeys(articleTitle);
    return candidateNames(item).some(name => nameKeys(name).some(key => articleKeys.includes(key)));
};

const pickImageInfo = (page) => {
    const info = page && page.imageinfo && page.imageinfo[0];
    if (!info || !/^image\/(jpeg|png|webp)$/.test(info.mime || '')) return null;
    if ((info.width || 0) < 400) return null;
    const meta = info.extmetadata || {};
    return {
        url: info.thumburl || info.url,
        pageUrl: info.descriptionurl,
        author: stripHtml(meta.Artist && meta.Artist.value) || '未知作者',
        license: (meta.LicenseShortName && meta.LicenseShortName.value) || '',
    };
};

const imageInfoParams = {
    prop: 'imageinfo',
    iiprop: 'url|mime|size|extmetadata',
    iiurlwidth: String(PHOTO_WIDTH),
    iiextmetadatafilter: 'Artist|LicenseShortName',
};

// 1) A zh.wikipedia article about this mountain (matched by name) near its coordinates.
const findArticlePhoto = async (item) => {
    const data = await mediaWiki(WIKIPEDIA_API, {
        action: 'query',
        generator: 'geosearch',
        ggscoord: `${item.lat}|${item.lon}`,
        ggsradius: String(ARTICLE_RADIUS_M),
        ggslimit: '10',
        prop: 'pageimages',
        piprop: 'name',
    });
    const pages = ((data.query && data.query.pages) || [])
        .filter(p => p.pageimage && matchesMountain(p.title, item))
        .sort((a, b) => (a.index || 0) - (b.index || 0));
    if (!pages.length) return null;

    // Only use images hosted on Commons (freely licensed, with author metadata).
    const article = pages[0];
    const fileData = await mediaWiki(COMMONS_API, {
        action: 'query',
        titles: `File:${article.pageimage}`,
        ...imageInfoParams,
    });
    const filePage = fileData.query && fileData.query.pages && fileData.query.pages[0];
    const photo = filePage && !filePage.missing ? pickImageInfo(filePage) : null;
    if (!photo) return null;
    return {
        ...photo,
        nearby: false,
        articleTitle: article.title,
        articleUrl: `https://zh.wikipedia.org/wiki/${encodeURIComponent(article.title)}`,
    };
};

// 2) The closest suitable photo on Wikimedia Commons.
const findNearbyCommonsPhoto = async (item) => {
    const data = await mediaWiki(COMMONS_API, {
        action: 'query',
        generator: 'geosearch',
        ggsnamespace: '6',
        ggscoord: `${item.lat}|${item.lon}`,
        ggsradius: String(NEARBY_PHOTO_RADIUS_M),
        ggslimit: '10',
        ...imageInfoParams,
    });
    const pages = ((data.query && data.query.pages) || []).sort((a, b) => (a.index || 0) - (b.index || 0));
    for (const page of pages) {
        const photo = pickImageInfo(page);
        if (photo) return { ...photo, nearby: true };
    }
    return null;
};

export const fetchMountainPhoto = async (item) => {
    try {
        const photo = await findArticlePhoto(item);
        if (photo) return photo;
    } catch (err) {
        console.log(err);
    }
    return findNearbyCommonsPhoto(item);
};

const overpassRequest = async (api, query, signal) => {
    const resp = await fetch(api, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ data: query }),
        signal,
    });
    if (!resp.ok) throw new Error(`Overpass ${resp.status}`);
    return resp.json();
};

// Hedged request: start with the first server; if it fails, or has not answered
// within OVERPASS_HEDGE_MS, also ask the next one. The first success wins and the
// other requests are aborted. Every request gives up after OVERPASS_TIMEOUT_S.
const overpass = (query) => new Promise((resolve, reject) => {
    const controllers = [];
    const timers = [];
    let pending = 0;
    let started = 0;
    let settled = false;
    let lastError;

    const finish = (fn, value) => {
        if (settled) return;
        settled = true;
        timers.forEach(clearTimeout);
        controllers.forEach(c => c.abort());
        fn(value);
    };

    const startNext = () => {
        if (settled || started >= OVERPASS_APIS.length) return;
        const api = OVERPASS_APIS[started++];
        const controller = new AbortController();
        controllers.push(controller);
        timers.push(setTimeout(() => controller.abort(), (OVERPASS_TIMEOUT_S + 2) * 1000));
        timers.push(setTimeout(startNext, OVERPASS_HEDGE_MS));
        pending++;
        overpassRequest(api, query, controller.signal)
            .then(data => finish(resolve, data))
            .catch(err => {
                lastError = err.name === 'AbortError' ? new Error('Overpass timeout') : err;
                pending--;
                if (started < OVERPASS_APIS.length) startNext();
                else if (pending === 0) finish(reject, lastError);
            });
    };

    startNext();
});

// Small per-browser cache so a mountain's routes load instantly the next time.
const readRouteCache = () => {
    try {
        return JSON.parse(window.localStorage.getItem(ROUTE_CACHE_KEY)) || {};
    } catch (err) {
        return {};
    }
};

const getCachedRoutes = (id) => {
    const entry = readRouteCache()[id];
    return entry && Date.now() - entry.time < ROUTE_CACHE_TTL_MS ? entry.routes : null;
};

const setCachedRoutes = (id, routes) => {
    try {
        const cache = readRouteCache();
        cache[id] = { time: Date.now(), routes };
        const recent = Object.entries(cache)
            .sort((a, b) => b[1].time - a[1].time)
            .slice(0, ROUTE_CACHE_MAX);
        window.localStorage.setItem(ROUTE_CACHE_KEY, JSON.stringify(Object.fromEntries(recent)));
    } catch (err) {
        // Storage may be full or unavailable (private mode); the cache is optional.
    }
};

const inFlightRoutes = new Map();

const toLine = (geometry) => (geometry || [])
    .filter(p => p && typeof p.lat === 'number' && typeof p.lon === 'number')
    .map(p => [p.lat, p.lon]);

const routeName = (tags = {}) => tags['name:zh'] || tags.name || tags['name:en'] || '';

const boxAround = (lat, lon, deg) => [lat - deg, lon - deg, lat + deg, lon + deg].map(n => n.toFixed(5)).join(',');

// Hiking route relations near the peak, plus named footpaths that are not part of one.
const queryHikingRoutes = async (item) => {
    const lat = Number(item.lat);
    const lon = Number(item.lon);
    const query = `[out:json][timeout:${OVERPASS_TIMEOUT_S}];
relation[route~"^(hiking|foot)$"](${boxAround(lat, lon, ROUTE_RELATION_DEG)})->.r;
way[highway~"^(path|footway)$"][name](${boxAround(lat, lon, NAMED_PATH_DEG)})->.w;
.r out tags geom(${boxAround(lat, lon, ROUTE_CLIP_DEG)}) qt;
.w out tags geom qt;`;

    const data = await overpass(query);
    const elements = data.elements || [];

    const relations = elements
        .filter(el => el.type === 'relation')
        .map(el => ({
            id: `relation/${el.id}`,
            name: routeName(el.tags) || 'OpenStreetMap 登山路線',
            url: `https://www.openstreetmap.org/relation/${el.id}`,
            lines: (el.members || []).filter(m => m.type === 'way').map(m => toLine(m.geometry)).filter(l => l.length > 1),
        }))
        .filter(r => r.lines.length);

    const relationNames = new Set(relations.map(r => r.name));
    const pathsByName = new Map();
    elements
        .filter(el => el.type === 'way')
        .forEach(el => {
            const name = routeName(el.tags);
            if (!name || relationNames.has(name)) return;
            const line = toLine(el.geometry);
            if (line.length < 2) return;
            if (!pathsByName.has(name)) {
                pathsByName.set(name, { id: `way/${el.id}`, name, url: `https://www.openstreetmap.org/way/${el.id}`, lines: [] });
            }
            pathsByName.get(name).lines.push(line);
        });

    return [...relations, ...pathsByName.values()].slice(0, MAX_ROUTES);
};

// Cached and de-duplicated: calling this early (prefetch) and again on click
// shares one request.
export const fetchHikingRoutes = (item) => {
    const cached = getCachedRoutes(item.id);
    if (cached) return Promise.resolve(cached);
    if (inFlightRoutes.has(item.id)) return inFlightRoutes.get(item.id);

    const request = queryHikingRoutes(item)
        .then(routes => {
            setCachedRoutes(item.id, routes);
            return routes;
        })
        .finally(() => inFlightRoutes.delete(item.id));
    inFlightRoutes.set(item.id, request);
    return request;
};

export const prefetchHikingRoutes = (item) => {
    fetchHikingRoutes(item).catch(() => {});
};
