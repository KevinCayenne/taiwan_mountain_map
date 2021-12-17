import L from 'leaflet';
import markerMountainPng from '../../assets/png/mountain-png.png';

const markerMointainIcon = new L.Icon({
    iconUrl: markerMountainPng,
    iconSize: new L.Point(65, 40),
});

export default markerMointainIcon;