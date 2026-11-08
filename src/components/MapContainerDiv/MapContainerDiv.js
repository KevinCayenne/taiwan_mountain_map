import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { MapContainer, TileLayer, Marker, Polyline, Tooltip, ScaleControl, LayersControl } from 'react-leaflet';
import axios from 'axios';
import 'leaflet-contextmenu';
import 'leaflet-contextmenu/dist/leaflet.contextmenu.css';
import {
    Box,
    Paper,
    Icon,
    IconButton,
    TextField,
    Autocomplete,
    Divider,
    Chip,
    InputAdornment,
    Tooltip as MuiTooltip,
    Backdrop,
    CircularProgress,
    Snackbar,
    Alert,
    Typography,
    useMediaQuery,
} from '@mui/material';
import { createFilterOptions } from '@mui/material/Autocomplete';
import { useTheme } from '@mui/material/styles';
import MarkerClusterGroup from 'react-leaflet-markercluster';
import markerMointainIcon, { activeMountainIcon, selfPositionIcon } from './MountainIcon.js';
import GitHubIcon from '../../assets/png/GitHub-Mark/PNG/GitHub-Mark-64px.png';
import MountainInfoBlock, { PANEL_WIDTH } from './MountainInfoBlock';
import AboutDialog, { COMPANY } from './AboutDialog';
import { corsUrl, mainRequestUrl, parseHtml, getCategory } from './utils';

require('react-leaflet-markercluster/dist/styles.min.css');

// prepare data
const taiwanPeaks = require('../../assets/json/mountain_data_new.json');
const peaksByLabel = (label) => taiwanPeaks.filter(item => getCategory(item) === label);
const hondredPeaks = peaksByLabel('台灣百岳');
const littleHondredPeaks = peaksByLabel('台灣小百岳');
const guGuanSevenPeaks = peaksByLabel('谷關七雄');
const tairokoSevenPeaks = peaksByLabel('太魯閣七雄');
const otherPeaks = taiwanPeaks.filter(item => item.label_item.length === 0);

const centerLatLng = [23.65, 120.9738819];
const defaultZoom = 8;
const focusZoom = 14;

const baseLayers = [
    {
        name: 'Open Street Map',
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors | 資料來源：健行筆記',
        url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'
    },
    {
        name: 'ArcGIS 衛星',
        attribution: 'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community | 資料來源：健行筆記',
        url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'
    },
    {
        name: '魯地圖 (清爽)',
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; 2016-2020 Rudy Chung | 資料來源：健行筆記',
        url: 'https://tile.happyman.idv.tw/map/moi_osm/{z}/{x}/{y}.png'
    },
];

const overlayLayers = [
    { id: 1, name: '台灣百岳', data: hondredPeaks, check: true },
    { id: 2, name: '台灣小百岳', data: littleHondredPeaks, check: false },
    { id: 3, name: '谷關七雄', data: guGuanSevenPeaks, check: false },
    { id: 4, name: '太魯閣七雄', data: tairokoSevenPeaks, check: false },
    { id: 5, name: '其他山岳', data: otherPeaks, check: false },
];

const searchFilter = createFilterOptions({
    stringify: (option) => `${option.title} ${option.nick_name || ''} ${option.mountain_sys || ''}`,
    limit: 60,
});

function MapMarker({ item, icon, onSelect, active }) {
    return (
        <Marker
            icon={icon}
            position={[item.lat, item.lon]}
            zIndexOffset={active ? 1000 : 0}
            eventHandlers={{
                click: () => onSelect && onSelect(item),
            }}
        >
            <Tooltip
                className={active ? 'mountain-label mountain-label--active' : 'mountain-label'}
                direction="top"
                opacity={1}
                permanent
            >
                {item.title}
            </Tooltip>
        </Marker>
    );
}

function MountainLayerControlGroup({ name, checked, data, onSelect, hiddenId }) {
    return (
        <LayersControl.Overlay checked={checked} name={name}>
            {/* Markers must be direct children of the cluster group: markers added later
                to a nested LayerGroup never reach the map (e.g. after closing the panel). */}
            <MarkerClusterGroup showCoverageOnHover={false} maxClusterRadius={50}>
                {data.filter(item => item.id !== hiddenId).map(item =>
                    <MapMarker key={item.id} icon={markerMointainIcon} item={item} onSelect={onSelect} />
                )}
            </MarkerClusterGroup>
        </LayersControl.Overlay>
    );
}

function SearchBar({ currentItem, onSelect, isDesktop }) {
    return (
        <Paper
            elevation={4}
            className="glass-panel"
            sx={{
                position: 'absolute',
                top: 12,
                left: 12,
                right: { xs: 64, md: 'auto' },
                width: { md: PANEL_WIDTH },
                zIndex: 1100,
                display: 'flex',
                alignItems: 'center',
                gap: 1,
                pl: 1,
                pr: 0.5,
                py: 0.5,
                borderRadius: 999,
            }}
        >
            <Box
                component="img"
                src={`${process.env.PUBLIC_URL}/m_logo.png`}
                alt="台灣山岳地圖"
                sx={{ width: 32, height: 32, borderRadius: '50%', flexShrink: 0 }}
            />
            <Autocomplete
                autoHighlight
                fullWidth
                size="small"
                options={taiwanPeaks}
                filterOptions={searchFilter}
                isOptionEqualToValue={(option, value) => option.id === value.id}
                value={currentItem || null}
                getOptionLabel={(option) => option.title || ''}
                noOptionsText="找不到符合的山岳"
                onChange={(e, value) => value && onSelect(value)}
                ListboxProps={{ style: { maxHeight: isDesktop ? 420 : 280 } }}
                renderOption={(props, option) => {
                    const category = getCategory(option);
                    return (
                        <Box component="li" {...props} key={option.id} sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                            <Icon fontSize="small" sx={{ color: 'primary.main' }}>landscape</Icon>
                            <Box sx={{ flex: 1, minWidth: 0 }}>
                                <Typography variant="body2" fontWeight={600} noWrap>{option.title}</Typography>
                                <Typography variant="caption" color="text.secondary" noWrap component="div">
                                    {option.height}{option.mountain_sys ? ` · ${option.mountain_sys}` : ''}
                                </Typography>
                            </Box>
                            {category ? <Chip label={category} size="small" color="primary" variant="outlined" /> : null}
                        </Box>
                    );
                }}
                renderInput={(params) => (
                    <TextField
                        {...params}
                        variant="standard"
                        placeholder="搜尋山岳名稱、別名或山系"
                        InputProps={{
                            ...params.InputProps,
                            disableUnderline: true,
                            startAdornment: (
                                <InputAdornment position="start">
                                    <Icon fontSize="small" sx={{ color: 'text.secondary' }}>search</Icon>
                                </InputAdornment>
                            ),
                        }}
                    />
                )}
            />
        </Paper>
    );
}

function ControlButton({ title, onClick, children, href }) {
    return (
        <MuiTooltip title={title} placement="left">
            <IconButton
                aria-label={title}
                onClick={onClick}
                href={href}
                target={href ? '_blank' : undefined}
                rel={href ? 'noreferrer' : undefined}
                sx={{ borderRadius: 2, width: 40, height: 40, color: 'text.primary' }}
            >
                {children}
            </IconButton>
        </MuiTooltip>
    );
}

function MapControls({ map, onHome, onLocate, locating, onAbout }) {
    return (
        <Box
            sx={{
                position: 'absolute',
                top: 64,
                right: 10,
                zIndex: 1000,
                display: 'flex',
                flexDirection: 'column',
                gap: 1,
            }}
        >
            <Paper elevation={4} className="glass-panel" sx={{ display: 'flex', flexDirection: 'column', p: 0.25 }}>
                <ControlButton title="放大" onClick={() => map && map.zoomIn()}>
                    <Icon>add</Icon>
                </ControlButton>
                <Divider flexItem sx={{ mx: 0.75 }} />
                <ControlButton title="縮小" onClick={() => map && map.zoomOut()}>
                    <Icon>remove</Icon>
                </ControlButton>
            </Paper>
            <Paper elevation={4} className="glass-panel" sx={{ display: 'flex', flexDirection: 'column', p: 0.25 }}>
                <ControlButton title="回到全台視角" onClick={onHome}>
                    <Icon>home</Icon>
                </ControlButton>
                <Divider flexItem sx={{ mx: 0.75 }} />
                <ControlButton title="我的位置" onClick={onLocate}>
                    {locating
                        ? <CircularProgress size={20} />
                        : <Icon sx={{ color: 'info.main' }}>my_location</Icon>}
                </ControlButton>
            </Paper>
            <Paper elevation={4} className="glass-panel" sx={{ display: 'flex', flexDirection: 'column', p: 0.25 }}>
                <ControlButton title="關於本站" onClick={onAbout}>
                    <Icon sx={{ color: 'primary.main' }}>info_outline</Icon>
                </ControlButton>
                <Divider flexItem sx={{ mx: 0.75 }} />
                <ControlButton title="GitHub 原始碼" href="https://github.com/KevinCayenne/taiwan_mountain_map">
                    <Box component="img" src={GitHubIcon} alt="GitHub" sx={{ width: 22, height: 22 }} />
                </ControlButton>
            </Paper>
        </Box>
    );
}

function MapContainerDiv() {
    const theme = useTheme();
    const isDesktop = useMediaQuery(theme.breakpoints.up('md'));

    const [map, setMap] = useState(null);
    const [currentItem, setCurrentItem] = useState(null);
    const [selfPosition, setSelfPosition] = useState(null);
    const [currentTrialData, setCurrentTrialData] = useState(null);
    const [markerImgLoading, setMarkerImgLoading] = useState(false);
    const [backDropOpen, setBackDropOpen] = useState(false);
    const [locating, setLocating] = useState(false);
    const [toast, setToast] = useState(null);
    const [aboutOpen, setAboutOpen] = useState(false);
    const latestRequestId = useRef(null);

    const notify = useCallback((message, severity = 'info') => {
        setToast({ message, severity, key: Date.now() });
    }, []);

    // Offset the map center so the focused point is not hidden behind the info panel.
    const panelOffset = useCallback(() => {
        if (isDesktop) {
            return [-(PANEL_WIDTH + 24) / 2, 0];
        }
        return [0, window.innerHeight * 0.22];
    }, [isDesktop]);

    const focusOn = useCallback((latlng, zoom = focusZoom) => {
        if (!map) return;
        const [dx, dy] = panelOffset();
        const point = map.project(latlng, zoom).add([dx, dy]);
        map.flyTo(map.unproject(point, zoom), zoom, { duration: 0.8 });
    }, [map, panelOffset]);

    const fitToBounds = useCallback((bounds) => {
        if (!map || !bounds || !bounds.isValid()) return;
        map.flyToBounds(bounds, isDesktop
            ? { paddingTopLeft: [PANEL_WIDTH + 48, 80], paddingBottomRight: [80, 40], duration: 0.8 }
            : { paddingTopLeft: [24, 80], paddingBottomRight: [24, window.innerHeight * 0.5], duration: 0.8 });
    }, [map, isDesktop]);

    const getUserPosition = useCallback(() => {
        return new Promise((resolve) => {
            if (!navigator.geolocation) {
                resolve(false);
                return;
            }
            navigator.geolocation.getCurrentPosition(
                position => {
                    const coords = [position.coords.latitude, position.coords.longitude];
                    setSelfPosition(coords);
                    resolve(coords);
                },
                () => resolve(false),
                { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
            );
        });
    }, []);

    const moveToHere = async () => {
        if (!map) return;
        if (selfPosition) {
            map.flyTo(selfPosition, focusZoom, { duration: 0.8 });
            return;
        }
        setLocating(true);
        const position = await getUserPosition();
        setLocating(false);
        if (position) {
            map.flyTo(position, focusZoom, { duration: 0.8 });
        } else {
            notify('無法取得目前位置，請確認瀏覽器定位權限', 'warning');
        }
    };

    const resetView = () => {
        if (map) map.flyTo(centerLatLng, defaultZoom, { duration: 0.8 });
    };

    const getMountainMainPhoto = async (item) => {
        const resp = await axios.get(corsUrl + mainRequestUrl + 'index.php?q=mountain&act=detail&id=' + item.id);
        const doc = parseHtml(resp.data);
        const imgData = doc.querySelector("meta[itemprop='image']");
        return imgData ? imgData.getAttribute('content') : null;
    };

    const selectMountain = useCallback(async (item) => {
        if (!item) return;
        if (currentItem && currentItem.id === item.id) {
            focusOn([item.lat, item.lon]);
            return;
        }
        latestRequestId.current = item.id;
        setCurrentItem(item);
        setCurrentTrialData(null);
        setMarkerImgLoading(true);
        focusOn([item.lat, item.lon]);
        try {
            const photo = await getMountainMainPhoto(item);
            if (latestRequestId.current === item.id) {
                setCurrentItem({ ...item, mainPhoto: photo });
            }
        } catch (err) {
            console.log(err);
        } finally {
            if (latestRequestId.current === item.id) {
                setMarkerImgLoading(false);
            }
        }
    }, [currentItem, focusOn]);

    const clearSelected = useCallback(() => {
        latestRequestId.current = null;
        setCurrentItem(null);
        setCurrentTrialData(null);
    }, []);

    const getThisLocation = async (e) => {
        setBackDropOpen(true);
        const yourLocation = await getUserPosition();
        const targetLocation = e.latlng.lat + ',' + e.latlng.lng;
        setBackDropOpen(false);

        if (yourLocation) {
            window.open('https://www.google.com.tw/maps/dir/' + yourLocation.join(',') + '/' + targetLocation + '/', '_blank');
        } else {
            window.open('https://www.google.com.tw/maps/@' + targetLocation + ',15z', '_blank');
        }
    };

    // Keep the context-menu callback pointing at the latest closure.
    const contextMenuHandler = useRef(getThisLocation);
    contextMenuHandler.current = getThisLocation;
    const contextmenuItems = useMemo(() => ([
        {
            text: '<span class="material-icons ctx-icon">directions</span>Google 導航到這裡',
            callback: e => contextMenuHandler.current(e),
        },
    ]), []);

    useEffect(() => {
        getUserPosition();
    }, [getUserPosition]);

    return (
        <div id="map-div">
            <Backdrop sx={{ color: '#fff', zIndex: (t) => t.zIndex.modal + 1 }} open={backDropOpen}>
                <CircularProgress color="inherit" />
            </Backdrop>

            <SearchBar currentItem={currentItem} onSelect={selectMountain} isDesktop={isDesktop} />

            {currentItem ?
                <MountainInfoBlock
                    key={currentItem.id}
                    data={currentItem}
                    photoLoading={markerImgLoading}
                    isDesktop={isDesktop}
                    onClose={clearSelected}
                    onFocus={() => focusOn([currentItem.lat, currentItem.lon])}
                    onFitBounds={fitToBounds}
                    onTrialDataChange={setCurrentTrialData}
                    notify={notify}
                />
            : null}

            <MapControls map={map} onHome={resetView} onLocate={moveToHere} locating={locating} onAbout={() => setAboutOpen(true)} />

            <AboutDialog open={aboutOpen} onClose={() => setAboutOpen(false)} />

            {!currentItem || isDesktop ?
                <Paper
                    elevation={3}
                    className="glass-panel"
                    component="a"
                    href={COMPANY.url}
                    target="_blank"
                    rel="noopener"
                    sx={{
                        position: 'absolute',
                        left: 10,
                        bottom: 30,
                        zIndex: 1000,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 0.75,
                        px: 1.25,
                        py: 0.5,
                        borderRadius: 999,
                        fontSize: 12,
                        color: 'text.secondary',
                        textDecoration: 'none',
                        '&:hover': { color: 'primary.main' },
                    }}
                >
                    <Icon sx={{ fontSize: 16, color: 'primary.main' }}>precision_manufacturing</Icon>
                    <span>網站提供：<strong>{COMPANY.shortName}</strong> · {COMPANY.displayUrl}</span>
                </Paper>
            : null}

            <MapContainer
                center={centerLatLng}
                zoom={defaultZoom}
                scrollWheelZoom={true}
                zoomControl={false}
                style={{ height: '100%', width: '100%' }}
                contextmenu={true}
                contextmenuWidth={170}
                contextmenuItems={contextmenuItems}
                whenCreated={setMap}
            >
                <ScaleControl position="bottomleft" imperial={false} />
                <LayersControl position="topright">
                    {baseLayers.map((layer, index) =>
                        <LayersControl.BaseLayer key={layer.name} checked={index === 0} name={layer.name}>
                            <TileLayer attribution={layer.attribution} url={layer.url} />
                        </LayersControl.BaseLayer>
                    )}
                    {overlayLayers.map(layer =>
                        <MountainLayerControlGroup
                            key={layer.id}
                            name={`${layer.name} <span class="layer-count">${layer.data.length}</span>`}
                            checked={layer.check}
                            data={layer.data}
                            onSelect={selectMountain}
                            hiddenId={currentItem ? currentItem.id : null}
                        />
                    )}
                </LayersControl>

                {currentTrialData ?
                    currentTrialData.map((feature, index) =>
                        feature.visible && feature.trial.length ?
                            feature.trial.map((trial, trialIndex) =>
                                trial.geometry.type === 'LineString' ?
                                    <React.Fragment key={index + '_' + trialIndex}>
                                        <Polyline
                                            pathOptions={{ color: '#ffffff', weight: 8, opacity: 0.85 }}
                                            positions={trial.geometry.coordinates.map(point => [point[1], point[0]])}
                                        />
                                        <Polyline
                                            pathOptions={{ color: feature.color, weight: 4, opacity: 0.95 }}
                                            positions={trial.geometry.coordinates.map(point => [point[1], point[0]])}
                                        />
                                    </React.Fragment>
                                : null
                            )
                        : null
                    )
                : null}

                {selfPosition ? <Marker position={selfPosition} icon={selfPositionIcon} zIndexOffset={500} /> : null}

                {currentItem ? <MapMarker icon={activeMountainIcon} item={currentItem} onSelect={selectMountain} active /> : null}
            </MapContainer>

            <Snackbar
                key={toast ? toast.key : undefined}
                open={Boolean(toast)}
                autoHideDuration={4000}
                onClose={() => setToast(null)}
                anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
                sx={{ top: { xs: 72, sm: 72 } }}
            >
                {toast ? <Alert severity={toast.severity} variant="filled" onClose={() => setToast(null)}>{toast.message}</Alert> : <span />}
            </Snackbar>
        </div>
    );
}

export default MapContainerDiv;
