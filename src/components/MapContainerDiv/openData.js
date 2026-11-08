// Open data sources used for mountain photos and hiking routes.
// Both APIs allow cross-origin requests from the browser, so no proxy is needed.
//  - Photos: Wikipedia (zh) + Wikimedia Commons, CC licensed, credited in the UI.
//  - Routes: OpenStreetMap, ODbL, credited in the UI. Pre-computed at deploy time by
//    scripts/build_routes.py and served as static files from data/routes/.

const WIKIPEDIA_API = 'https://zh.wikipedia.org/w/api.php';
const COMMONS_API = 'https://commons.wikimedia.org/w/api.php';

const PHOTO_WIDTH = 800;
const ARTICLE_RADIUS_M = 2000;
const NEARBY_PHOTO_RADIUS_M = 1000;
const ROUTES_BASE = `${process.env.PUBLIC_URL || ''}/data/routes`;

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

let routeIndexRequest = null;

// {generated, source, routes: {mountain id: route count}}, or null if unavailable
// (e.g. local development without generated data).
export const fetchRouteIndex = () => {
    if (!routeIndexRequest) {
        routeIndexRequest = fetch(`${ROUTES_BASE}/index.json`)
            .then(resp => (resp.ok && /json/.test(resp.headers.get('content-type') || '') ? resp.json() : null))
            .catch(() => null);
    }
    return routeIndexRequest;
};

const routeRequests = new Map();

const requestRoutes = async (item) => {
    const index = await fetchRouteIndex();
    if (index && !index.routes[item.id]) return [];
    const resp = await fetch(`${ROUTES_BASE}/${encodeURIComponent(item.id)}.json`);
    if (resp.status === 404) return [];
    if (!resp.ok) throw new Error(`routes ${resp.status}`);
    // The dev server answers unknown paths with index.html.
    if (!/json/.test(resp.headers.get('content-type') || '')) return [];
    return resp.json();
};

// Shared per mountain, so the prefetch and the button click use one request.
export const fetchHikingRoutes = (item) => {
    if (!routeRequests.has(item.id)) {
        const request = requestRoutes(item);
        routeRequests.set(item.id, request);
        request.catch(() => routeRequests.delete(item.id));
    }
    return routeRequests.get(item.id);
};

export const prefetchHikingRoutes = (item) => {
    fetchHikingRoutes(item).catch(() => {});
};

// Test helper.
export const resetRouteCache = () => {
    routeIndexRequest = null;
    routeRequests.clear();
};
