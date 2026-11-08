import React, { useState } from 'react';
import axios from 'axios';
import L from 'leaflet';
import {
    Box,
    Paper,
    Icon,
    IconButton,
    Button,
    Chip,
    Collapse,
    Divider,
    Skeleton,
    Stack,
    Tooltip,
    Typography,
} from '@mui/material';
import LoadingButton from '@mui/lab/LoadingButton';
import { corsUrl, mainRequestUrl, parseHtml, getCategory, formatCounty, ROUTE_COLORS } from './utils';

const GpxParser = require('gpxparser');

export const PANEL_WIDTH = 380;

const parseGpx = (gpxText) => {
    const gpx = new GpxParser();
    gpx.parse(gpxText);
    return gpx.toGeoJSON().features;
};

// Fetch the GPX tracks of a single trail page on 健行筆記.
const fetchTrail = async (link) => {
    const url = mainRequestUrl + link.replace(/^\//, '');
    const trailResp = await axios.get(corsUrl + url + '&type=route');
    const doc = parseHtml(trailResp.data);
    const gpxDataDiv = doc.querySelector('#interactive_map');
    const gpxDataMobileDiv = doc.querySelector('.flex.space-x-5 > a');

    if (gpxDataDiv) {
        const gpxUrl = gpxDataDiv.getAttribute('data-value');
        const gpxResp = await axios.get(corsUrl + gpxUrl);
        return { trial: parseGpx(gpxResp.data), url };
    }

    if (gpxDataMobileDiv) {
        const gpxId = (gpxDataMobileDiv.getAttribute('href') || '').split('id=')[1];
        const deviceUrl = mainRequestUrl + 'index.php?q=trail&act=gpx_detail&id=' + gpxId;
        const deviceResp = await axios.get(corsUrl + deviceUrl);
        const deviceDoc = parseHtml(deviceResp.data);
        const mapDiv = deviceDoc.querySelector('#interactive_map');
        if (!mapDiv) return null;
        const gpxResp = await axios.get(corsUrl + mapDiv.getAttribute('data-value'));
        return { trial: parseGpx(gpxResp.data), url: deviceUrl };
    }

    return null;
};

function InfoRow({ icon, label, value }) {
    return (
        <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'flex-start', py: 0.75 }}>
            <Box
                sx={{
                    width: 32,
                    height: 32,
                    borderRadius: 2,
                    flexShrink: 0,
                    display: 'grid',
                    placeItems: 'center',
                    bgcolor: 'rgba(47, 107, 79, 0.08)',
                    color: 'primary.main',
                }}
            >
                <Icon fontSize="small">{icon}</Icon>
            </Box>
            <Box sx={{ minWidth: 0 }}>
                <Typography variant="caption" color="text.secondary" component="div" lineHeight={1.4}>{label}</Typography>
                <Typography variant="body2" fontWeight={500} sx={{ wordBreak: 'break-word' }}>{value || '—'}</Typography>
            </Box>
        </Box>
    );
}

function ActionButton({ icon, label, href, onClick, color = 'primary' }) {
    return (
        <Button
            variant="outlined"
            color={color}
            onClick={onClick}
            href={href}
            target={href ? '_blank' : undefined}
            rel={href ? 'noreferrer' : undefined}
            sx={{
                flex: 1,
                minWidth: 0,
                flexDirection: 'column',
                gap: 0.25,
                py: 1,
                fontSize: 12,
                borderColor: 'divider',
                color: 'text.primary',
                '& .MuiIcon-root': { color: `${color}.main` },
            }}
        >
            <Icon fontSize="small">{icon}</Icon>
            {label}
        </Button>
    );
}

function MountainInfoBlock({ data, photoLoading, isDesktop, onClose, onFocus, onFitBounds, onTrialDataChange, notify }) {
    const [trialDataLoading, setTrialDataLoading] = useState(false);
    const [trialData, setTrialData] = useState([]);
    const [expanded, setExpanded] = useState(true);
    const [summaryOpen, setSummaryOpen] = useState(false);
    const [photoError, setPhotoError] = useState(false);

    const category = getCategory(data);
    const relatedTrials = data.related_trials || [];

    const updateTrialData = (next) => {
        setTrialData(next);
        onTrialDataChange(next);
    };

    const loadTrial = async () => {
        setTrialDataLoading(true);
        const results = await Promise.all(
            relatedTrials.map(t => fetchTrail(t.link)
                .then(r => r && { ...r, name: t.name || (r.trial[0] && r.trial[0].properties && r.trial[0].properties.name) })
                .catch(err => { console.log(err); return null; }))
        );
        const loaded = results
            .filter(r => r && r.trial && r.trial.length)
            .map((r, index) => ({
                ...r,
                visible: true,
                color: ROUTE_COLORS[index % ROUTE_COLORS.length],
                name: r.name || `路線 ${index + 1}`,
            }));

        updateTrialData(loaded);
        setTrialDataLoading(false);

        if (loaded.length) {
            const bounds = L.latLngBounds([]);
            loaded.forEach(r => r.trial.forEach(f => {
                if (f.geometry.type === 'LineString') {
                    f.geometry.coordinates.forEach(([lon, lat]) => bounds.extend([lat, lon]));
                }
            }));
            onFitBounds(bounds);
        } else {
            notify('目前無法載入路線資料，請稍後再試', 'warning');
        }
    };

    const togglePathVisible = (index) => {
        updateTrialData(trialData.map((item, i) => i === index ? { ...item, visible: !item.visible } : item));
    };

    const directionsUrl = `https://www.google.com/maps/dir/?api=1&destination=${data.lat},${data.lon}`;
    const weatherUrl = `https://www.google.com/search?q=${encodeURIComponent(data.title + ' 天氣')}`;
    const bijiUrl = `https://hiking.biji.co/index.php?q=mountain&act=detail&id=${data.id}`;

    const heroHeight = isDesktop ? 190 : 130;

    return (
        <Paper
            id="mountain-info-block"
            elevation={8}
            sx={isDesktop ? {
                position: 'absolute',
                top: 72,
                left: 12,
                width: PANEL_WIDTH,
                maxHeight: 'calc(100% - 96px)',
                zIndex: 1050,
                borderRadius: 4,
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden',
            } : {
                position: 'absolute',
                left: 0,
                right: 0,
                bottom: 0,
                maxHeight: '58%',
                zIndex: 1050,
                borderRadius: '20px 20px 0 0',
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden',
            }}
        >
            {!isDesktop ?
                <Box
                    role="button"
                    aria-label={expanded ? '收合' : '展開'}
                    onClick={() => setExpanded(!expanded)}
                    sx={{ py: 1, display: 'flex', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}
                >
                    <Box sx={{ width: 40, height: 5, borderRadius: 999, bgcolor: 'grey.300' }} />
                </Box>
            : null}

            {/* Header / hero */}
            <Box sx={{ position: 'relative', flexShrink: 0, mx: isDesktop ? 0 : 1.5, borderRadius: isDesktop ? 0 : 3, overflow: 'hidden' }}>
                <Collapse in={expanded} collapsedSize={0}>
                    <Box sx={{ height: heroHeight, position: 'relative', bgcolor: 'primary.dark' }}>
                        {photoLoading ?
                            <Skeleton variant="rectangular" animation="wave" sx={{ width: '100%', height: '100%', bgcolor: 'rgba(255,255,255,0.12)' }} />
                        : data.mainPhoto && !photoError ?
                            <Box component="img" src={data.mainPhoto} alt="" onError={() => setPhotoError(true)} sx={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                        :
                            <Box className="hero-fallback" sx={{ width: '100%', height: '100%' }} />
                        }
                        <Box sx={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(0,0,0,0) 35%, rgba(0,0,0,0.65) 100%)' }} />
                    </Box>
                </Collapse>

                <Box
                    sx={expanded ? {
                        position: 'absolute', left: 0, right: 0, bottom: 0, px: 2, pb: 1.5, color: '#fff',
                    } : {
                        px: isDesktop ? 2 : 0.5, py: 1, color: 'text.primary',
                    }}
                >
                    <Stack direction="row" alignItems="flex-end" spacing={1}>
                        <Typography variant="h5" fontWeight={700} lineHeight={1.2} sx={expanded ? { textShadow: '0 1px 4px rgba(0,0,0,0.5)' } : {}}>
                            {data.title}
                        </Typography>
                        <Typography variant="subtitle1" fontWeight={600} sx={{ opacity: 0.9, whiteSpace: 'nowrap' }}>
                            {data.height}
                        </Typography>
                    </Stack>
                    {data.nick_name && expanded ?
                        <Typography variant="caption" sx={{ opacity: 0.85 }}>別名：{data.nick_name}</Typography>
                    : null}
                </Box>

                <Stack direction="row" spacing={0.5} sx={{ position: 'absolute', top: expanded ? 8 : 4, right: 8 }}>
                    {isDesktop ?
                        <Tooltip title={expanded ? '收合' : '展開'}>
                            <IconButton size="small" onClick={() => setExpanded(!expanded)} className={expanded ? 'hero-btn' : ''}>
                                <Icon fontSize="small">{expanded ? 'expand_less' : 'expand_more'}</Icon>
                            </IconButton>
                        </Tooltip>
                    : null}
                    <Tooltip title="關閉">
                        <IconButton size="small" onClick={onClose} className={expanded ? 'hero-btn' : ''} aria-label="關閉">
                            <Icon fontSize="small">close</Icon>
                        </IconButton>
                    </Tooltip>
                </Stack>
            </Box>

            <Collapse in={expanded} sx={{ minHeight: 0, overflow: 'auto', '& .MuiCollapse-wrapper': { minHeight: 0 } }}>
                <Box sx={{ px: 2, pt: 1.5, pb: 2 }}>
                    {/* Tags */}
                    <Stack direction="row" spacing={0.75} sx={{ flexWrap: 'wrap', rowGap: 0.75, mb: 1.5 }}>
                        {category ? <Chip size="small" color="primary" icon={<Icon fontSize="small">landscape</Icon>} label={category} /> : null}
                        {data.title_tag ? <Chip size="small" variant="outlined" label={data.title_tag} /> : null}
                        {data.need_mountain_apply === '要' ? <Chip size="small" color="secondary" variant="outlined" label="需入山申請" /> : null}
                        {data.need_park_apply === '要' ? <Chip size="small" color="secondary" variant="outlined" label="需入園申請" /> : null}
                    </Stack>

                    {/* Actions */}
                    <Stack direction="row" spacing={1} sx={{ mb: 1.5 }}>
                        <ActionButton icon="center_focus_strong" label="定位" onClick={onFocus} />
                        <ActionButton icon="directions" label="導航" href={directionsUrl} color="info" />
                        <ActionButton icon="wb_sunny" label="天氣" href={weatherUrl} color="secondary" />
                        <ActionButton icon="launch" label="健行筆記" href={bijiUrl} color="success" />
                    </Stack>

                    <Divider />

                    {/* Details */}
                    <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', columnGap: 1.5, pt: 0.5 }}>
                        <InfoRow icon="terrain" label="海拔" value={data.height} />
                        <InfoRow icon="account_tree" label="山系" value={data.mountain_sys} />
                        <InfoRow icon="park" label="國家公園" value={data.park} />
                        <InfoRow icon="adjust" label="基點" value={data.base_point} />
                    </Box>
                    <InfoRow icon="place" label="行政區" value={formatCounty(data.county)} />

                    {data.summary ?
                        <Box sx={{ mt: 1 }}>
                            <Typography
                                variant="body2"
                                color="text.secondary"
                                sx={summaryOpen ? { lineHeight: 1.7 } : {
                                    lineHeight: 1.7,
                                    display: '-webkit-box',
                                    WebkitLineClamp: 3,
                                    WebkitBoxOrient: 'vertical',
                                    overflow: 'hidden',
                                }}
                            >
                                {data.summary}
                            </Typography>
                            <Button size="small" onClick={() => setSummaryOpen(!summaryOpen)} sx={{ px: 0.5, mt: 0.25 }}>
                                {summaryOpen ? '收合簡介' : '閱讀更多'}
                            </Button>
                        </Box>
                    : null}

                    <Divider sx={{ my: 1.5 }} />

                    {/* Routes */}
                    <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1 }}>
                        <Stack direction="row" alignItems="center" spacing={1}>
                            <Icon fontSize="small" color="primary">route</Icon>
                            <Typography variant="subtitle2" fontWeight={700}>登山路線</Typography>
                            <Chip size="small" label={trialData.length || relatedTrials.length} />
                        </Stack>
                        {trialData.length ?
                            <Button size="small" startIcon={<Icon>refresh</Icon>} onClick={loadTrial} disabled={trialDataLoading}>
                                重新載入
                            </Button>
                        : null}
                    </Stack>

                    {relatedTrials.length === 0 ?
                        <Typography variant="body2" color="text.secondary">此山岳目前沒有相關路線資料</Typography>
                    : !trialData.length ?
                        <LoadingButton
                            fullWidth
                            onClick={loadTrial}
                            loading={trialDataLoading}
                            loadingPosition="start"
                            startIcon={<Icon>directions_walk</Icon>}
                            variant="contained"
                        >
                            {trialDataLoading ? '路線載入中…' : `在地圖上顯示路線 (${relatedTrials.length})`}
                        </LoadingButton>
                    :
                        <Stack spacing={0.75}>
                            {trialData.map((item, index) =>
                                <Box
                                    key={index}
                                    sx={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: 1,
                                        pl: 1.25,
                                        pr: 0.5,
                                        py: 0.5,
                                        borderRadius: 2,
                                        border: 1,
                                        borderColor: 'divider',
                                        opacity: item.visible ? 1 : 0.55,
                                        transition: 'opacity .2s',
                                    }}
                                >
                                    <Box sx={{ width: 12, height: 12, borderRadius: '50%', bgcolor: item.color, flexShrink: 0, boxShadow: '0 0 0 2px #fff, 0 0 0 3px rgba(0,0,0,0.12)' }} />
                                    <Typography variant="body2" sx={{ flex: 1, minWidth: 0 }} noWrap title={item.name}>
                                        {item.name}
                                    </Typography>
                                    <Tooltip title={item.visible ? '隱藏路線' : '顯示路線'}>
                                        <IconButton size="small" onClick={() => togglePathVisible(index)}>
                                            <Icon fontSize="small">{item.visible ? 'visibility' : 'visibility_off'}</Icon>
                                        </IconButton>
                                    </Tooltip>
                                    <Tooltip title="在健行筆記開啟">
                                        <IconButton size="small" href={item.url} target="_blank" rel="noreferrer">
                                            <Icon fontSize="small">open_in_new</Icon>
                                        </IconButton>
                                    </Tooltip>
                                </Box>
                            )}
                        </Stack>
                    }
                </Box>
            </Collapse>
        </Paper>
    );
}

export default MountainInfoBlock;
