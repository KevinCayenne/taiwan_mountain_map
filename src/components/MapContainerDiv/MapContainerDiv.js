import React, { useState, useEffect, useCallback, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, Tooltip, ScaleControl, LayersControl, LayerGroup, useMap, useMapEvents } from 'react-leaflet';
import axios from 'axios';
import 'leaflet-contextmenu';
import 'leaflet-contextmenu/dist/leaflet.contextmenu.css';
import { Box, Icon, IconButton, Link, TextField, Autocomplete } from '@mui/material';
import Button from '@mui/material/Button';
import Backdrop from '@mui/material/Backdrop';
import CircularProgress from '@mui/material/CircularProgress';
import markerMointainIcon from './MountainIcon.js';
import GitHubIcon from '../../assets/png/GitHub-Mark/PNG/GitHub-Mark-64px.png';
import MarkerClusterGroup from 'react-leaflet-markercluster';

import MountainInfoBlock from './MountainInfoBlock';


// require('leaflet/dist/leaflet.css'); // inside .js file
require('react-leaflet-markercluster/dist/styles.min.css'); // inside .js file

const corsUrl = 'https://cors-proxy-kevincay.herokuapp.com/';
const mainRequestUrl = 'https://hiking.biji.co/';

// prepare data
const taiwanPeaks = require('../../assets/json/mountain_data_new.json');
const hondredPeaks = taiwanPeaks.filter(item => item.label_item.length ? item.label_item[0].name === '台灣百岳' : '');
const littleHondredPeaks = taiwanPeaks.filter(item => item.label_item.length ? item.label_item[0].name === '台灣小百岳' : '');
const guGuanSevenPeaks = taiwanPeaks.filter(item => item.label_item.length ? item.label_item[0].name === '谷關七雄' : '');
const tairokoSevenPeaks = taiwanPeaks.filter(item => item.label_item.length ? item.label_item[0].name === '太魯閣七雄' : '');
const otherPeaks = taiwanPeaks.filter(item => item.label_item.length === 0);

function MapMarker(props) {
    return (
        <Marker 
            key={props.item.id} 
            icon={props.icon} 
            position={[props.item.lat, props.item.lon]}
            eventHandlers={{ 
                click: async () => {
                    props.handleMarkerClick(props.item);
                },
            }}
        >
            <Popup style={{ width: '70px' }} permanent>
                <div className="fw-bold text-center text-light" style={{ fontSize: '25px', textShadow: 'black 0.05em 0.05em 0.1em' }}>{props.item.title}</div>
                <div className="fw-bold text-light text-center" style={{ fontSize: '20px', textShadow: 'black 0.05em 0.05em 0.1em' }}>{props.item.height}</div>
                <div className="text-center" style={{ fontSize: '20px' }}>
                    <span className="badge bg-success">
                        { props.item.label_item.length ? props.item.label_item[0].name : null }
                    </span>
                </div>
            </Popup>
            <Tooltip direction="top" offset={[0, 0]} opacity={1} permanent>
                { props.item.title }
            </Tooltip>
        </Marker>
    )
}

function MountainLayerControlGroup(props){

    const handleMarkerClick = async (item) => {
        try{
            if(props.currentItem === null || (props.currentItem.id && item.id !== props.currentItem.id)){
                props.setMarkerImgLoadingHandler(true);
                props.setCurrentItemHandler(item);
                props.map.setView([item.lat, item.lon], 14);
                const photo = await props.getMountainMainPhoto(item);
                props.setCurrentItemHandler({...item, mainPhoto: photo});
                props.setMarkerImgLoadingHandler(false);
            }
        }
        catch(err){
            props.setMarkerImgLoadingHandler(false);
            console.log(err);
        }
    }

    return(
        <LayersControl.Overlay checked={props.checked} name={props.name}>
            <MarkerClusterGroup>
                <LayerGroup>
                    {
                        props.data.length ?
                            props.data.map((item, index) => 
                                <MapMarker key={item.id} icon={props.icon} item={item} handleMarkerClick={handleMarkerClick} currentItem={props.currentItem} />
                            )
                        : ""
                    }
                </LayerGroup>
            </MarkerClusterGroup>;
        </LayersControl.Overlay>
    )
}

function ResetPositionBtn(props){
    const [position, setPosition] = useState(props.map.getCenter())
  
    const onClick = useCallback(() => {
        props.map.setView(props.center, props.zoom)
    }, [props.map])
  
    const onMove = useCallback(() => {
        setPosition(props.map.getCenter())
    }, [props.map])
  
    useEffect(() => {
        props.map.on('move', onMove)
        return () => {
            props.map.off('move', onMove)
        }
    }, [props.map, onMove])
  
    return (
        <button id="map-reset-btn" className="btn" onClick={ onClick }>
            <Icon className="align-middle text-secondary">
                home
            </Icon>
        </button>
    )
}

function SearchMountainInput(props){

    const [searchId, setSearchId] = useState('');

    const searchMountain = async () => {
        try{
            const item = taiwanPeaks.find(item => item.id === String(searchId));

            props.setMarkerImgLoadingHandler(true);
            props.setCurrentItemHandler(item);
            props.map.setView([item.lat, item.lon], 14);
            const photo = await props.getMountainMainPhoto(item);
            props.setCurrentItemHandler({...item, mainPhoto: photo});
            props.setMarkerImgLoadingHandler(false);
        }
        catch(err){
            props.setMarkerImgLoadingHandler(false);
            console.log(err);
        }
    };

    const onInputChange = (e) => {
        setSearchId(e.target.value);
    }

    useEffect(() => {
        // console.log(props.data);
        
        return () => {
            setSearchId(null);
        };
    }, []);
    
    if(props.isShow){
        return(
            <div 
                id="top-search-bar" 
                className="bg-light rounded px-1 py-1 shadow-sm d-flex align-items-center" 
                style={{ position: 'absolute', top: '10px', left: '55px', zIndex: '100000' }}
            >
                 <Autocomplete
                    disablePortal
                    autoHighlight
                    id="combo-box-demo"
                    options={props.data}
                    isOptionEqualToValue={(option, value) => option.id === value.id}
                    value={ props.currentItem ? props.currentItem : null }
                    getOptionLabel={(option) => option.title + ' (' + option.height + ') ' + option.id }
                    renderOption={(props, option) => (
                        <Box key={option.id} component="li" sx={{ '& > img': { mr: 2, flexShrink: 0 } }} {...props} value={option.id}>
                            {option.title}
                        </Box>
                    )}
                    sx={{ width: 300 }}
                    onChange={e => onInputChange(e)}
                    renderInput={(params) => <TextField {...params} label="搜尋山岳名稱" />}
                />
                <IconButton onClick={searchMountain}>
                    <Icon>search</Icon>
                </IconButton>
            </div>
        )
    }else{
        return null;
    }
}

function MapContainerDiv(porps){

    const [map, setMap] = useState(null);
    const [currentItem, setCurrentItem] = useState(null);
    const [selfPosition, setSelfPosition] = useState(null);
    const [currentTrialData, setCurrentTrialData] = useState(null);
    const [markerImgLoading, setMarkerImgLoading] = useState(false);
    const [searchBarShow, setSearchBarShow] = useState(true);
    const [backDropOpen, setBackDropOpen] = useState(false);
    const [layerControlList, setLayerControlList] = useState([
        {
            name: 'Open Street Map',
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors 資料來源:健行筆記',
            url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'
        },
        {
            name: 'ArcGIS衛星',
            attribution: '&copy; <a href="https://www.maptiler.com/copyright">Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community</a> contributors 資料來源:健行筆記',
            url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'
        },
        {
            name: '魯地圖 (清爽)',
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> Copyright (c) 2016-2020 Rudy Chung contributors 資料來源:健行筆記',
            url: 'https://tile.happyman.idv.tw/map/moi_osm/{z}/{x}/{y}.png'
        },
    ]);

    const [layerConfig, setLayerConfig] = useState([
        {
            id: 1,
            name: '台灣百岳',
            data: hondredPeaks,
            check: true
        },
        {
            id: 2,
            name: '台灣小百岳',
            data: littleHondredPeaks,
            check: false
        },
        {
            id: 3,
            name: '谷關七雄',
            data: guGuanSevenPeaks,
            check: false
        },
        {
            id: 4,
            name: '太魯閣七雄',
            data: tairokoSevenPeaks,
            check: false
        },
        {
            id: 5,
            name: '其他山岳',
            data: otherPeaks,
            check: false
        }
    ]);

    const centerLatLng = [23.65, 120.9738819];
    const zoom = 8;

    const getUserPosition = () => {
        return new Promise((resolve, reject) => {
            if(navigator.geolocation) {
                navigator.geolocation.getCurrentPosition(position => {
                    if(position.coords){
                        setSelfPosition([position.coords.latitude, position.coords.longitude]);
                        // console.log([position.coords.latitude, position.coords.longitude]);
                        resolve([position.coords.latitude, position.coords.longitude]);
                    }
                });
            } else { 
                console.log('Not support navigation.');
                resolve(false);
            }
        });
    };

    const moveToHere = () => {
        map.setView(selfPosition, 14);
    };

    const toggleSearchBar = () => {
        setSearchBarShow(!searchBarShow);
    };

    const getMountainMainPhoto = (item) => {
        return new Promise(async (resolve, reject) => {
            try{
                const mountainDataResp = await axios.get(corsUrl + mainRequestUrl + 'index.php?q=mountain&act=detail&id=' + item.id);
                const mountainData = mountainDataResp.data;

                let htmlObject = document.createElement('div');
                htmlObject.innerHTML = mountainData;
                const imgData = htmlObject.querySelector("meta[itemprop='image']");
                // console.log(imgData['content']);
                resolve(imgData['content']);
            }
            catch(err){
                reject(err);
            }
        });
    };

    const getThisLocation = async (e) => {
        handleBackDropOpen();
        let yourLocation, targetLocation = null;

        yourLocation = await getUserPosition();
        if(yourLocation){
            yourLocation = yourLocation[0] + ',' + yourLocation[1];
        }
       
        targetLocation = e.latlng.lat + ',' + e.latlng.lng;
        // console.log(yourLocation, targetLocation);

        if(yourLocation && targetLocation){
            handleBackDropClose();
            window.open('https://www.google.com.tw/maps/dir/' + yourLocation + '/' + targetLocation + '/', '_blank').focus();
        }else{
            handleBackDropClose();
            window.open('https://www.google.com.tw/maps/@' + targetLocation + ',15z', '_blank').focus();
        }
    };

    const handleBackDropOpen = () => {
        setBackDropOpen(true);
    };

    const handleBackDropClose = () => {
        setBackDropOpen(false);
    };

    function MapComponent() {
        const map = useMap();
        const mapE = useMapEvents({
            drag(e) {

            },
            zoom(e) {

            },
            click(e) {
                // if(e){
                //     setCurrentItem(null);
                // }
            },
        });
        return null;
    }

    useEffect(() => {
        setCurrentTrialData(null);
    }, [currentItem]);

    useEffect(() => {
        getUserPosition();

        return () => {
            setCurrentTrialData(null);
            setCurrentItem(null);
            setSelfPosition(null);
            setMarkerImgLoading(null);
            setLayerConfig(null);
            setLayerControlList(null);
            setBackDropOpen(null);
        }
    }, []);

    return (
        <div id="map-div" style={{ height: '100%', width: '100%' }}>
            <Backdrop
                sx={{ color: '#fff', zIndex: (theme) => theme.zIndex.drawer + 1 }}
                open={backDropOpen}
            >
                <CircularProgress color="inherit" />
            </Backdrop>
            <SearchMountainInput 
                isShow={searchBarShow}
                data={taiwanPeaks} 
                map={map} 
                setMarkerImgLoadingHandler={setMarkerImgLoading} 
                setCurrentItemHandler={setCurrentItem} 
                currentItem={currentItem} 
                getMountainMainPhoto={getMountainMainPhoto} 
            />
            { currentItem ? <MountainInfoBlock setCurrentItemHandler={setCurrentItem} data={currentItem} map={map} markerImgLoading={markerImgLoading} setCurrentTrialDataHandler={setCurrentTrialData} /> : null }
            <Link id="github-link" href="https://github.com/KevinCayenne/taiwan_mountain_map" underline="none">
                <img src={GitHubIcon} alt="" />
            </Link>
            <Button id="search-btn-toggle" size="small" className="w-100 text-secondary" onClick={toggleSearchBar}>
                <Icon>search</Icon>
            </Button>
            <Button id="here-btn" size="small" color="info" className="w-100" onClick={moveToHere}>
                <Icon>gps_fixed</Icon>
            </Button>
            { map ? <ResetPositionBtn map={map} center={centerLatLng} zoom={zoom} /> : null }
            <MapContainer 
                center={centerLatLng} 
                zoom={zoom} 
                scrollWheelZoom={true} 
                zoomControl={true} 
                style={{ height: '100%', width: '100%' }}
                contextmenu={true}
                contextmenuWidth={130}
                contextmenuItems={[
                  {
                    text:'google導航到這裡',
                    callback: e => getThisLocation(e)
                  }
                ]}
                whenCreated={setMap}
            >
                <MapComponent />
                <ScaleControl position="topleft" />
                <LayersControl position="topright">
                    {
                        layerControlList.map((layer, index) => 
                            <LayersControl.BaseLayer key={layer.name} checked={ index === 0 ? true : false } name={layer.name}>
                                <TileLayer
                                    attribution={layer.attribution}
                                    url={layer.url}
                                />
                            </LayersControl.BaseLayer>
                        )
                    }
                    {
                        layerConfig.map(layer => 
                            <MountainLayerControlGroup 
                                key={layer.id}
                                name={layer.name} 
                                icon={markerMointainIcon} 
                                checked={layer.check} 
                                data={layer.data}
                                map={map} 
                                setMarkerImgLoadingHandler={setMarkerImgLoading}
                                setCurrentItemHandler={setCurrentItem} 
                                currentItem={currentItem} 
                                getMountainMainPhoto={getMountainMainPhoto} 
                            />
                        )
                    }
                </LayersControl>
                {
                    currentTrialData ? 
                        currentTrialData.map((featrue, index) => 
                            featrue.visible && featrue.trial.length ? 
                                featrue.trial.map((trial, trialIndex) => 
                                    trial.geometry.type === "LineString" ? 
                                        <Polyline 
                                            key={index + '_' + trialIndex}
                                            pathOptions={{ fillColor: 'red', color: 'blue' }}
                                            positions={trial.geometry.coordinates.map(point => [point[1], point[0]])}
                                        />
                                    : null
                                )
                            : null
                        )
                    : null
                }
                {
                    selfPosition ? <Marker position={selfPosition}></Marker> : null
                }
                {
                    currentItem ? <MapMarker icon={markerMointainIcon} item={currentItem} currentItem={currentItem} /> : null
                }
            </MapContainer>
        </div>
    );
}

export default MapContainerDiv;