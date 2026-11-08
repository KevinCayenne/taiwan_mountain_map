export const corsUrl = 'https://cors-proxy-kevincay.herokuapp.com/';
export const mainRequestUrl = 'https://hiking.biji.co/';

// Parse fetched HTML without executing scripts or loading images.
export const parseHtml = (html) => new DOMParser().parseFromString(html, 'text/html');

export const getCategory = (item) =>
    item && item.label_item && item.label_item.length ? item.label_item[0].name : null;

// "南投縣信義鄉,嘉義縣阿里山鄉," -> "南投縣信義鄉、嘉義縣阿里山鄉"
export const formatCounty = (county) =>
    (county || '').split(',').map(s => s.trim()).filter(Boolean).join('、');

export const ROUTE_COLORS = ['#e53935', '#1e88e5', '#8e24aa', '#f4511e', '#00897b', '#3949ab', '#c0ca33', '#6d4c41'];
