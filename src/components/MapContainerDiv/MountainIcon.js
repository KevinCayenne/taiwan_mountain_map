import L from 'leaflet';
import markerMountainPng from '../../assets/png/mountain-png.png';

const markerMointainIcon = new L.Icon({
    iconUrl: markerMountainPng,
    iconSize: new L.Point(30, 25),
});

export default markerMointainIcon;