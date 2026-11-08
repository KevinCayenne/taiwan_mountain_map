import L from 'leaflet';
import markerMountainPng from '../../assets/png/mountain-png.png';

const markerMointainIcon = new L.Icon({
    iconUrl: markerMountainPng,
    iconSize: new L.Point(30, 25),
    iconAnchor: new L.Point(15, 22),
    tooltipAnchor: new L.Point(0, -18),
    className: 'mountain-marker',
});

// Highlighted icon for the currently selected mountain.
export const activeMountainIcon = L.divIcon({
    className: 'mountain-marker-active',
    html: `<span class="mountain-marker-active__pulse"></span><img src="${markerMountainPng}" alt="" />`,
    iconSize: new L.Point(44, 44),
    iconAnchor: new L.Point(22, 34),
    tooltipAnchor: new L.Point(0, -30),
});

// "You are here" blue dot.
export const selfPositionIcon = L.divIcon({
    className: 'self-position-marker',
    html: '<span class="self-position-marker__halo"></span><span class="self-position-marker__dot"></span>',
    iconSize: new L.Point(22, 22),
    iconAnchor: new L.Point(11, 11),
});

export default markerMointainIcon;
