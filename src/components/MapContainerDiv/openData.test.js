import { matchesMountain, fetchHikingRoutes, fetchMountainPhoto, resetRouteCache } from './openData';

const yushan = { id: '1', title: '玉山主峰', nick_name: '新高山∕摩里遜山', lat: '23.47', lon: '120.957' };

describe('matchesMountain', () => {
    test('matches the exact title', () => {
        expect(matchesMountain('南湖大山', { title: '南湖大山' })).toBe(true);
    });

    test('ignores a disambiguation suffix', () => {
        expect(matchesMountain('象山 (臺北市)', { title: '象山' })).toBe(true);
    });

    test('matches when one name omits 山', () => {
        expect(matchesMountain('奇萊北峰', { title: '奇萊山北峰' })).toBe(true);
    });

    test('matches a nickname', () => {
        expect(matchesMountain('新高山', yushan)).toBe(true);
    });

    test('matches the article of a 主峰 without the suffix', () => {
        expect(matchesMountain('玉山', yushan)).toBe(true);
        expect(matchesMountain('玉山東峰', yushan)).toBe(false);
    });

    test('rejects nearby places that are not the mountain', () => {
        expect(matchesMountain('高雄市壽山動物園', { title: '壽山' })).toBe(false);
        expect(matchesMountain('鼓山區', { title: '壽山' })).toBe(false);
    });
});

const jsonResponse = (body) => Promise.resolve({ ok: true, json: () => Promise.resolve(body) });

const response = (body, { status = 200, type = 'application/json' } = {}) => Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name) => (name.toLowerCase() === 'content-type' ? type : null) },
    json: () => Promise.resolve(body),
});

describe('fetchHikingRoutes', () => {
    beforeEach(() => resetRouteCache());
    afterEach(() => { delete global.fetch; });

    const route = { id: 'relation/1', name: '玉山主峰線', url: 'https://www.openstreetmap.org/relation/1', lines: [[[23.47, 120.957], [23.46, 120.95]]] };

    test('loads the pre-built routes of a mountain listed in the index', async () => {
        global.fetch = jest.fn(url => (url.endsWith('/index.json')
            ? response({ generated: '2026-11-08', routes: { 1: 1 } })
            : response([route])));

        await expect(fetchHikingRoutes(yushan)).resolves.toEqual([route]);
        expect(global.fetch.mock.calls.map(c => c[0])).toEqual(['/data/routes/index.json', '/data/routes/1.json']);
    });

    test('skips the request for mountains without routes', async () => {
        global.fetch = jest.fn(() => response({ generated: '2026-11-08', routes: { 99: 2 } }));

        await expect(fetchHikingRoutes(yushan)).resolves.toEqual([]);
        expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    test('shares one request between prefetch and click, and loads the index once', async () => {
        global.fetch = jest.fn(url => (url.endsWith('/index.json')
            ? response({ routes: { 1: 1, 2: 1 } })
            : response([route])));

        await Promise.all([fetchHikingRoutes(yushan), fetchHikingRoutes(yushan), fetchHikingRoutes({ id: '2' })]);
        expect(global.fetch).toHaveBeenCalledTimes(3);
    });

    test('works without an index, treating a missing file as no routes', async () => {
        global.fetch = jest.fn(url => (url.endsWith('/index.json') ? response(null, { status: 404 }) : response(null, { status: 404 })));
        await expect(fetchHikingRoutes(yushan)).resolves.toEqual([]);
    });

    test('ignores the dev server answering with index.html', async () => {
        global.fetch = jest.fn(() => response('<html>', { type: 'text/html' }));
        await expect(fetchHikingRoutes(yushan)).resolves.toEqual([]);
    });

    test('rejects on a server error and retries on the next call', async () => {
        global.fetch = jest.fn(url => (url.endsWith('/index.json') ? response({ routes: { 1: 1 } }) : response(null, { status: 500 })));
        await expect(fetchHikingRoutes(yushan)).rejects.toThrow('routes 500');

        global.fetch = jest.fn(url => (url.endsWith('/index.json') ? response({ routes: { 1: 1 } }) : response([route])));
        await expect(fetchHikingRoutes(yushan)).resolves.toEqual([route]);
    });
});

describe('fetchMountainPhoto', () => {
    afterEach(() => { delete global.fetch; });

    const commonsFile = (overrides = {}) => ({
        title: 'File:Yushan.jpg',
        imageinfo: [{
            mime: 'image/jpeg', width: 4000,
            thumburl: 'https://upload.wikimedia.org/thumb.jpg',
            descriptionurl: 'https://commons.wikimedia.org/wiki/File:Yushan.jpg',
            extmetadata: { Artist: { value: '<a href="#">Someone</a>' }, LicenseShortName: { value: 'CC BY-SA 4.0' } },
            ...overrides,
        }],
    });

    test('uses the photo of a matching Wikipedia article', async () => {
        global.fetch = jest.fn()
            .mockImplementationOnce(() => jsonResponse({ query: { pages: [
                { title: '排雲山莊', index: 1, pageimage: 'Hut.jpg' },
                { title: '玉山', index: 2, pageimage: 'Yushan.jpg' },
            ] } }))
            .mockImplementationOnce(() => jsonResponse({ query: { pages: [commonsFile()] } }));

        const photo = await fetchMountainPhoto({ ...yushan, title: '玉山' });

        expect(photo).toMatchObject({
            url: 'https://upload.wikimedia.org/thumb.jpg',
            author: 'Someone',
            license: 'CC BY-SA 4.0',
            nearby: false,
            articleTitle: '玉山',
        });
        expect(global.fetch.mock.calls[1][0]).toContain('File%3AYushan.jpg');
    });

    test('falls back to the nearest Commons photo, skipping unsuitable files', async () => {
        global.fetch = jest.fn()
            .mockImplementationOnce(() => jsonResponse({ query: { pages: [{ title: '鼓山區', index: 1, pageimage: 'x.jpg' }] } }))
            .mockImplementationOnce(() => jsonResponse({ query: { pages: [
                commonsFile({ mime: 'image/svg+xml' }),
                { ...commonsFile({ thumburl: 'https://upload.wikimedia.org/near.jpg' }), index: 2 },
            ] } }));

        const photo = await fetchMountainPhoto({ title: '壽山', lat: '22.64', lon: '120.27' });

        expect(photo).toMatchObject({ url: 'https://upload.wikimedia.org/near.jpg', nearby: true });
    });

    test('returns null when nothing suitable is found', async () => {
        global.fetch = jest.fn(() => jsonResponse({ query: { pages: [] } }));
        await expect(fetchMountainPhoto({ title: '宇羅尾山', lat: '24', lon: '121' })).resolves.toBeNull();
    });
});
