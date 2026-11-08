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
const ROUTE_RELATION_RADIUS_M = 3000;
const NAMED_PATH_RADIUS_M = 2000;
const ROUTE_CLIP_DEG = 0.08; // clip long-distance trails to ~9 km around the peak
const MAX_ROUTES = 10;

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

const overpass = async (query) => {
    let lastError;
    for (const api of OVERPASS_APIS) {
        try {
            const resp = await fetch(api, {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: new URLSearchParams({ data: query }),
            });
            if (!resp.ok) throw new Error(`Overpass ${resp.status}`);
            return await resp.json();
        } catch (err) {
            lastError = err;
        }
    }
    throw lastError;
};

const toLine = (geometry) => (geometry || [])
    .filter(p => p && typeof p.lat === 'number' && typeof p.lon === 'number')
    .map(p => [p.lat, p.lon]);

const routeName = (tags = {}) => tags['name:zh'] || tags.name || tags['name:en'] || '';

// Hiking route relations near the peak, plus named footpaths that are not part of one.
export const fetchHikingRoutes = async (item) => {
    const lat = Number(item.lat);
    const lon = Number(item.lon);
    const bbox = [lat - ROUTE_CLIP_DEG, lon - ROUTE_CLIP_DEG, lat + ROUTE_CLIP_DEG, lon + ROUTE_CLIP_DEG].join(',');
    const query = `[out:json][timeout:25];
relation(around:${ROUTE_RELATION_RADIUS_M},${lat},${lon})[route~"^(hiking|foot)$"]->.r;
way(around:${NAMED_PATH_RADIUS_M},${lat},${lon})[highway~"^(path|footway)$"][name]->.w;
.r out tags geom(${bbox});
.w out tags geom;`;

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
