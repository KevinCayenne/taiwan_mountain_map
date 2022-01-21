import React, { useState, useEffect, useCallback } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, Tooltip, LayersControl, LayerGroup, useMap, useMapEvents } from 'react-leaflet';
import axios from 'axios';
import { Icon, Link, TextField } from '@mui/material';
import Button from '@mui/material/Button';
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

function MountainLayerControlGroup(props){

    const handleMarkerClick = async (item) => {
        try{
            props.setMarkerImgLoadingHandler(true);
            props.setCurrentItemHandler(item);
            props.map.setView([item.lat, item.lon], 14);
            const photo = await getMountainMainPhoto(item);
            props.setCurrentItemHandler({...item, mainPhoto: photo});
            props.setMarkerImgLoadingHandler(false);
        }
        catch(err){
            props.setMarkerImgLoadingHandler(false);
            console.log(err);
        }
    }

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

    return(
        <LayersControl.Overlay checked={props.checked} name={props.name}>
            <MarkerClusterGroup>
                <LayerGroup>
                    {
                        props.data.length ?
                            props.data.map((item, index) => 
                                <Marker 
                                    key={item.id} 
                                    icon={props.icon} 
                                    position={[item.lat, item.lon]}
                                    eventHandlers={{ 
                                        click: async () => {
                                            handleMarkerClick(item);
                                        },
                                    }}
                                >
                                    <Popup style={{ width: '70px' }}>
                                        <div className="fw-bold text-center text-light" style={{ fontSize: '25px', textShadow: 'black 0.05em 0.05em 0.1em' }}>{item.title}</div>
                                        <div className="fw-bold text-light text-center" style={{ fontSize: '20px', textShadow: 'black 0.05em 0.05em 0.1em' }}>{ item.height }</div>
                                        <div className="text-center" style={{ fontSize: '20px' }}>
                                            <span className="badge bg-success">
                                                { item.label_item.length ? item.label_item[0].name : null }
                                            </span>
                                        </div>
                                    </Popup>
                                    {
                                        props.currentItem && item.id === props.currentItem.id ? null
                                        : <Tooltip direction="top" offset={[0, 0]} opacity={1} permanent>
                                            { item.title }
                                        </Tooltip>
                                    }
                                    
                                </Marker>
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

    const [searchName, setSearchName] = useState('dasda');

    const searchMountain = async () => {
        console.log(searchName);
    };

    return(
        <div className="bg-light rounded px-1 py-1 shadow-sm d-flex align-items-center" style={{ position: 'absolute', top: '10px', left: '55px', zIndex: '100000' }}>
            <TextField 
                id="search-input" 
                size="small" 
                label="搜尋山岳名稱" 
                variant="standard" 
                value={searchName} 
                onChange={e => setSearchName(e.target.value)}
            />
            <Button variant="outlined" startIcon={<Icon>search</Icon>} onClick={searchMountain}>
                搜尋
            </Button>
        </div>
    )
}

function MapContainerDiv(porps){

    const [map, setMap] = useState(null);
    const [currentItem, setCurrentItem] = useState(null);
    const [selfPosition, setSelfPosition] = useState(null);
    const [currentTrialData, setCurrentTrialData] = useState(null);
    const [markerImgLoading, setMarkerImgLoading] = useState(false);

    const centerLatLng = [23.65, 120.9738819];
    const zoom = 8;

    const getUserPosition = () => {
        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(getPosition);
        } else { 
            console.log('Not support navigation.');
        }
    };

    const getPosition = (position) => {
        // console.log(position);
        if(position.coords)
        setSelfPosition([position.coords.latitude, position.coords.longitude]);
    };

    const moveToHere = () => {
        map.setView(selfPosition, 14);
    };

    function MapComponent() {
        const map = useMap();
        const mapE = useMapEvents({
            drag(e) {

            },
            zoom(e) {

            },
            click(e) {
                if(e){
                    setCurrentItem(null);
                }
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
        }
    }, []);

    return (
        <div id="map-div" style={{ height: '100%', width: '100%' }}>
            {/* <SearchMountainInput /> */}
            { currentItem ? <MountainInfoBlock data={ currentItem } map={map} markerImgLoading={markerImgLoading} setCurrentTrialDataHandler={setCurrentTrialData} /> : null }
            <Link id="github-link" href="https://github.com/KevinCayenne/taiwan_mountain_map" underline="none">
                <img src={GitHubIcon} alt="" />
            </Link>
            <Button id="here-btn" size="small" color="info" className="w-100" onClick={moveToHere}>
                <Icon>gps_fixed</Icon>
            </Button>
            { map ? <ResetPositionBtn map={map} center={centerLatLng} zoom={zoom} /> : null }
            <MapContainer center={centerLatLng} whenCreated={setMap} zoom={zoom} scrollWheelZoom={true} zoomControl={true} style={{ height: '100%', width: '100%' }}>
                <MapComponent />
                <LayersControl position="topright">
                    <LayersControl.BaseLayer checked name="Open Street Map">
                        <TileLayer
                            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors 資料來源:健行筆記'
                            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                        />
                    </LayersControl.BaseLayer>
                    <LayersControl.BaseLayer name="魯地圖 (清爽)">
                        <TileLayer
                            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors 資料來源:健行筆記'
                            url="https://rs.happyman.idv.tw/map/moi_osm/{z}/{x}/{y}.png"
                        />
                    </LayersControl.BaseLayer>
                    <LayersControl.BaseLayer name="魯地圖 (彩色)">
                        <TileLayer
                            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors 資料來源:健行筆記'
                            url="http://rudy.tile.basecamp.tw/{z}/{x}/{y}.png"
                        />
                    </LayersControl.BaseLayer>
                    <MountainLayerControlGroup name="台灣百岳" icon={markerMointainIcon} checked={true} data={hondredPeaks} map={map} setMarkerImgLoadingHandler={setMarkerImgLoading} setCurrentItemHandler={setCurrentItem} currentItem={currentItem} />
                    <MountainLayerControlGroup name="台灣小百岳" icon={markerMointainIcon} checked={false} data={littleHondredPeaks} map={map} setMarkerImgLoadingHandler={setMarkerImgLoading} setCurrentItemHandler={setCurrentItem} currentItem={currentItem} />
                    <MountainLayerControlGroup name="谷關七雄" icon={markerMointainIcon} checked={false} data={guGuanSevenPeaks} map={map} setMarkerImgLoadingHandler={setMarkerImgLoading} setCurrentItemHandler={setCurrentItem} currentItem={currentItem} />
                    <MountainLayerControlGroup name="太魯閣七雄" icon={markerMointainIcon} checked={false} data={tairokoSevenPeaks} map={map} setMarkerImgLoadingHandler={setMarkerImgLoading} setCurrentItemHandler={setCurrentItem} currentItem={currentItem} />
                    <MountainLayerControlGroup name="其他山岳" icon={markerMointainIcon} checked={false} data={otherPeaks} map={map} setMarkerImgLoadingHandler={setMarkerImgLoading} setCurrentItemHandler={setCurrentItem} currentItem={currentItem} />
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
            </MapContainer>
        </div>
    );
}

export default MapContainerDiv;