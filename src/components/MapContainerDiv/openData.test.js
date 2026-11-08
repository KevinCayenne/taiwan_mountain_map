import { matchesMountain, fetchHikingRoutes, fetchMountainPhoto } from './openData';

beforeEach(() => window.localStorage.clear());

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

describe('fetchHikingRoutes', () => {
    afterEach(() => { delete global.fetch; });

    test('turns relations and named paths into routes', async () => {
        global.fetch = jest.fn(() => jsonResponse({
            elements: [
                {
                    type: 'relation', id: 11, tags: { route: 'hiking', name: '玉山主峰線' },
                    members: [
                        { type: 'way', geometry: [{ lat: 23.47, lon: 120.95 }, { lat: 23.46, lon: 120.94 }] },
                        { type: 'node', lat: 23.47, lon: 120.95 },
                    ],
                },
                { type: 'way', id: 21, tags: { highway: 'path', name: '玉山主峰線' }, geometry: [{ lat: 1, lon: 1 }, { lat: 2, lon: 2 }] },
                { type: 'way', id: 22, tags: { highway: 'path', name: '八通關古道' }, geometry: [{ lat: 23.4, lon: 120.9 }, { lat: 23.41, lon: 120.91 }] },
                { type: 'way', id: 23, tags: { highway: 'path', name: '八通關古道' }, geometry: [{ lat: 23.41, lon: 120.91 }, { lat: 23.42, lon: 120.92 }] },
            ],
        }));

        const routes = await fetchHikingRoutes(yushan);

        expect(routes).toEqual([
            { id: 'relation/11', name: '玉山主峰線', url: 'https://www.openstreetmap.org/relation/11', lines: [[[23.47, 120.95], [23.46, 120.94]]] },
            {
                id: 'way/22', name: '八通關古道', url: 'https://www.openstreetmap.org/way/22',
                lines: [[[23.4, 120.9], [23.41, 120.91]], [[23.41, 120.91], [23.42, 120.92]]],
            },
        ]);
        const body = global.fetch.mock.calls[0][1].body.get('data');
        expect(body).toContain('relation[route~"^(hiking|foot)$"](23.44300,120.93000,23.49700,120.98400)');
        expect(body).not.toContain('around:');
    });

    test('caches routes per mountain and shares in-flight requests', async () => {
        global.fetch = jest.fn(() => jsonResponse({ elements: [
            { type: 'way', id: 1, tags: { name: '步道' }, geometry: [{ lat: 1, lon: 1 }, { lat: 2, lon: 2 }] },
        ] }));

        const [a, b] = await Promise.all([fetchHikingRoutes(yushan), fetchHikingRoutes(yushan)]);
        const c = await fetchHikingRoutes(yushan);

        expect(global.fetch).toHaveBeenCalledTimes(1);
        expect(a).toEqual(b);
        expect(c).toEqual(a);
    });

    test('asks the backup server when the first is slow, and uses whichever answers first', async () => {
        jest.useFakeTimers();
        let firstSignal;
        global.fetch = jest.fn()
            .mockImplementationOnce((url, opts) => { firstSignal = opts.signal; return new Promise(() => {}); })
            .mockImplementationOnce(() => jsonResponse({ elements: [] }));

        const result = fetchHikingRoutes({ ...yushan, id: 'slow' });
        expect(global.fetch).toHaveBeenCalledTimes(1);
        jest.advanceTimersByTime(4000);
        expect(global.fetch).toHaveBeenCalledTimes(2);

        await expect(result).resolves.toEqual([]);
        expect(firstSignal.aborted).toBe(true);
        jest.useRealTimers();
    });

    test('falls back to the second Overpass server', async () => {
        global.fetch = jest.fn()
            .mockImplementationOnce(() => Promise.resolve({ ok: false, status: 504 }))
            .mockImplementationOnce(() => jsonResponse({ elements: [] }));

        await expect(fetchHikingRoutes(yushan)).resolves.toEqual([]);
        expect(global.fetch).toHaveBeenCalledTimes(2);
    });

    test('throws when every server fails', async () => {
        global.fetch = jest.fn(() => Promise.resolve({ ok: false, status: 429 }));
        await expect(fetchHikingRoutes(yushan)).rejects.toThrow('Overpass 429');
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
