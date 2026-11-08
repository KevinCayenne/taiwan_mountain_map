import React, { useEffect, useState } from 'react';
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
    Link,
    Skeleton,
    Stack,
    Tooltip,
    Typography,
} from '@mui/material';
import LoadingButton from '@mui/lab/LoadingButton';
import { getCategory, formatCounty, bijiMountainUrl, bijiTrailUrl, ROUTE_COLORS } from './utils';
import { fetchHikingRoutes, fetchRouteIndex, prefetchHikingRoutes } from './openData';

export const PANEL_WIDTH = 380;

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
    // idle | loading | loaded | error
    const [routeStatus, setRouteStatus] = useState('idle');
    const [trialData, setTrialData] = useState([]);
    const [expanded, setExpanded] = useState(true);
    const [summaryOpen, setSummaryOpen] = useState(false);
    const [bijiOpen, setBijiOpen] = useState(false);
    const [photoError, setPhotoError] = useState(false);
    const [routeIndex, setRouteIndex] = useState(null);

    const category = getCategory(data);
    const relatedTrials = data.related_trials || [];
    const photo = data.photo;

    // Routes are pre-built static files: read the index (route counts) and prefetch
    // this mountain's routes as soon as the panel opens.
    useEffect(() => {
        let active = true;
        prefetchHikingRoutes(data);
        fetchRouteIndex().then(index => {
            if (!active || !index) return;
            setRouteIndex(index);
            if (!index.routes[data.id]) setRouteStatus('loaded');
        });
        return () => { active = false; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [data.id]);

    const routeCount = routeIndex ? (routeIndex.routes[data.id] || 0) : null;

    const updateTrialData = (next) => {
        setTrialData(next);
        onTrialDataChange(next);
    };

    const loadRoutes = async () => {
        setRouteStatus('loading');
        try {
            const routes = await fetchHikingRoutes(data);
            const loaded = routes.map((route, index) => ({
                ...route,
                visible: true,
                color: ROUTE_COLORS[index % ROUTE_COLORS.length],
            }));
            updateTrialData(loaded);
            setRouteStatus('loaded');

            if (loaded.length) {
                const bounds = L.latLngBounds([[data.lat, data.lon]]);
                loaded.forEach(route => route.lines.forEach(line => line.forEach(point => bounds.extend(point))));
                onFitBounds(bounds);
            }
        } catch (err) {
            console.log(err);
            setRouteStatus('error');
            notify('路線載入失敗，請稍後再試', 'warning');
        }
    };

    const togglePathVisible = (index) => {
        updateTrialData(trialData.map((item, i) => i === index ? { ...item, visible: !item.visible } : item));
    };

    const directionsUrl = `https://www.google.com/maps/dir/?api=1&destination=${data.lat},${data.lon}`;
    const weatherUrl = `https://www.google.com/search?q=${encodeURIComponent(data.title + ' 天氣')}`;
    const bijiUrl = bijiMountainUrl(data.id);
    const osmUrl = `https://www.openstreetmap.org/#map=15/${data.lat}/${data.lon}`;

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
                        : photo && !photoError ?
                            <Box component="img" src={photo.url} alt="" onError={() => setPhotoError(true)} sx={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                        :
                            <Box className="hero-fallback" sx={{ width: '100%', height: '100%' }} />
                        }
                        <Box sx={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(0,0,0,0.25) 0%, rgba(0,0,0,0) 30%, rgba(0,0,0,0) 40%, rgba(0,0,0,0.7) 100%)' }} />
                        {photo && !photoError && !photoLoading ?
                            <Stack direction="row" spacing={0.75} alignItems="center" sx={{ position: 'absolute', top: 10, left: 12, right: 88 }}>
                                {photo.nearby ?
                                    <Chip size="small" label="附近照片" sx={{ height: 20, fontSize: 11, color: '#fff', bgcolor: 'rgba(0,0,0,0.45)' }} />
                                : null}
                                <Link
                                    href={photo.pageUrl}
                                    target="_blank"
                                    rel="noreferrer"
                                    underline="hover"
                                    noWrap
                                    title={`照片：${photo.author}${photo.license ? ' / ' + photo.license : ''}（Wikimedia Commons）`}
                                    sx={{ color: 'rgba(255,255,255,0.9)', fontSize: 11, textShadow: '0 1px 2px rgba(0,0,0,0.6)', minWidth: 0 }}
                                >
                                    照片：{photo.author}{photo.license ? ` / ${photo.license}` : ''}
                                </Link>
                            </Stack>
                        : null}
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
                            {routeStatus === 'loaded' || routeCount !== null ?
                                <Chip size="small" label={routeStatus === 'loaded' ? trialData.length : routeCount} />
                            : null}
                        </Stack>
                    </Stack>

                    {routeStatus === 'idle' || routeStatus === 'loading' || routeStatus === 'error' ?
                        <LoadingButton
                            fullWidth
                            onClick={loadRoutes}
                            loading={routeStatus === 'loading'}
                            loadingPosition="start"
                            startIcon={<Icon>directions_walk</Icon>}
                            variant="contained"
                        >
                            {routeStatus === 'loading' ? '路線載入中…'
                                : routeStatus === 'error' ? '重新載入路線'
                                : routeCount ? `在地圖上顯示路線（${routeCount}）` : '在地圖上顯示附近路線'}
                        </LoadingButton>
                    : !trialData.length ?
                        <Box sx={{ p: 1.5, borderRadius: 2, bgcolor: 'grey.50', border: 1, borderColor: 'divider' }}>
                            <Typography variant="body2" color="text.secondary">
                                OpenStreetMap 上尚無這座山附近的登山路線資料。
                            </Typography>
                            <Stack direction="row" spacing={1.5} sx={{ mt: 0.75 }}>
                                <Link href={bijiUrl} target="_blank" rel="noreferrer" variant="body2">到健行筆記查看</Link>
                                <Link href={osmUrl} target="_blank" rel="noreferrer" variant="body2">在 OpenStreetMap 開啟</Link>
                            </Stack>
                        </Box>
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
                                    <Box sx={{ flex: 1, minWidth: 0 }}>
                                        <Typography variant="body2" noWrap title={item.name}>
                                            {item.name}
                                        </Typography>
                                        {typeof item.distance === 'number' ?
                                            <Typography variant="caption" color="text.secondary" component="div" lineHeight={1.3}>
                                                {item.distance <= 50 ? '經過山頂' : `距山頂約 ${item.distance} 公尺`}
                                            </Typography>
                                        : null}
                                    </Box>
                                    <Tooltip title={item.visible ? '隱藏路線' : '顯示路線'}>
                                        <IconButton size="small" onClick={() => togglePathVisible(index)}>
                                            <Icon fontSize="small">{item.visible ? 'visibility' : 'visibility_off'}</Icon>
                                        </IconButton>
                                    </Tooltip>
                                    <Tooltip title="在 OpenStreetMap 開啟">
                                        <IconButton size="small" href={item.url} target="_blank" rel="noreferrer">
                                            <Icon fontSize="small">open_in_new</Icon>
                                        </IconButton>
                                    </Tooltip>
                                </Box>
                            )}
                        </Stack>
                    }

                    <Typography variant="caption" color="text.secondary" component="div" sx={{ mt: 1 }}>
                        路線資料 ©{' '}
                        <Link href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</Link>
                        {' '}貢獻者（ODbL）{routeIndex && routeIndex.generated ? `，更新於 ${routeIndex.generated}` : ''}。僅供參考，出發前請確認最新路況。
                    </Typography>

                    {relatedTrials.length ?
                        <Box sx={{ mt: 1.5 }}>
                            <Button
                                size="small"
                                color="inherit"
                                onClick={() => setBijiOpen(!bijiOpen)}
                                endIcon={<Icon>{bijiOpen ? 'expand_less' : 'expand_more'}</Icon>}
                                sx={{ px: 0.5, color: 'text.secondary' }}
                            >
                                健行筆記上的路線（{relatedTrials.length}）
                            </Button>
                            <Collapse in={bijiOpen}>
                                <Stack spacing={0.25} sx={{ pl: 0.5, pt: 0.5 }}>
                                    {relatedTrials.map(trail =>
                                        <Link
                                            key={trail.link}
                                            href={bijiTrailUrl(trail.link)}
                                            target="_blank"
                                            rel="noreferrer"
                                            variant="body2"
                                            underline="hover"
                                            sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}
                                        >
                                            <Icon sx={{ fontSize: 16 }}>open_in_new</Icon>
                                            {trail.name}
                                        </Link>
                                    )}
                                </Stack>
                            </Collapse>
                        </Box>
                    : null}
                </Box>
            </Collapse>
        </Paper>
    );
}

export default MountainInfoBlock;
