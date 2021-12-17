import React, { useState, useEffect, useCallback } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, Tooltip, LayersControl, LayerGroup, useMap, useMapEvents } from 'react-leaflet';
import axios from 'axios';
import { Icon } from '@mui/material';
import LoadingButton from '@mui/lab/LoadingButton';
import Button from '@mui/material/Button';
import markerMointainIcon from './MountainIcon.js';
let gpxParser = require('gpxparser');

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

    const [markerImgLoading, setMarkerImgLoading] = useState(false);

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
                                        try{
                                            setMarkerImgLoading(true);
                                            props.map.setView([item.lat, item.lon], 14);
                                            const photo = await getMountainMainPhoto(item);
                                            item.mainPhoto = photo;
                                            props.setCurrentItemHandler(item);
                                            setMarkerImgLoading(false);
                                        }
                                        catch(err){
                                            setMarkerImgLoading(false);
                                            console.log(err);
                                        }
                                    },
                                }}
                            >
                                <Popup style={{ width: '70px' }}>
                                    <div className="fw-bold text-center" style={{ fontSize: '20px' }}>{item.title}</div>
                                    <div style={{ fontSize: '20px' }}>{ item.height }</div>
                                    <div className="text-center" style={{ fontSize: '20px' }}>
                                        <span className="badge bg-success">
                                            { item.label_item.length ? item.label_item[0].name : null }
                                        </span>
                                    </div>
                                    { markerImgLoading ? <div className="alert alert-warning px-1 py-1 mt-2">資料擷取中，請稍候</div> : null }
                                </Popup>
                                <Tooltip direction="top" offset={[0, 0]} opacity={1} permanent>
                                    { item.title }
                                </Tooltip>
                            </Marker>
                        )
                    : ""
                }
            </LayerGroup>
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

function MountainInfoBlock(props){

    const [trialDataLoading, setTrialDataLoading] = useState(false);
    const [trialData, setTrialData] = useState([]);
    const [panelVisible, setPanelVisible] = useState(true);

    const getMainTrialData = (item, map) => {
        return new Promise(async (resolve, reject) => {
            let currentItem = item;
            let trialData = [];
            // console.log(currentItem);
            try{
                if(currentItem && item.related_trials.length){
                    const pst = [currentItem.lat, currentItem.lon];
                    map.setView(pst, 14);
            
                    for(let i = 0; i < item.related_trials.length; i++){
                        // get gpx data
                        let tempTrial = {}; 
                        // console.log(item.related_trials[i].link);
                        const trailResp = await axios.get(corsUrl + mainRequestUrl + item.related_trials[i].link + '&type=route');
                        const trailData = trailResp.data;
                        let htmlObject = document.createElement('div');
                        htmlObject.innerHTML = trailData;
                        let gpxDataDiv = htmlObject.querySelector("#interactive_map");
                        let gpxDataMobileDiv = htmlObject.querySelector(".flex.col-gap-20 > a");

                        if(gpxDataDiv){
                            let gpxData = gpxDataDiv.attributes['data-value'].value;
                            // console.log(gpxData);

                            // Parse gpx
                            const trailGpxResp = await axios.get(corsUrl + gpxData);
                            var gpx = new gpxParser(); //Create gpxParser Object
                            gpx.parse(trailGpxResp.data); 
                            let geoJSON = gpx.toGeoJSON(); //parse gpx file from string data
                            tempTrial.trial = geoJSON.features;
                            tempTrial.visible = true;
                            trialData.push(tempTrial);
                        }else{
                            const gpxId = gpxDataMobileDiv['href'].split('id=')[1];
                            const trailGpxResp = await axios.get(corsUrl + mainRequestUrl + '/index.php?q=trail&act=gpx_detail&id=' + gpxId);

                            const trailGpxData = trailGpxResp.data;
                            let htmlObject = document.createElement('div');
                            htmlObject.innerHTML = trailGpxData;
                            gpxDataDiv = htmlObject.querySelector("#interactive_map");
                            let gpxData = gpxDataDiv.attributes['data-value'].value;

                            // Parse gpx
                            const trailGpxMobileResp = await axios.get(corsUrl + gpxData);
                            gpx = new gpxParser(); //Create gpxParser Object
                            gpx.parse(trailGpxMobileResp.data); 
                            let geoJSON = gpx.toGeoJSON(); //parse gpx file from string data
                            tempTrial.trial = geoJSON.features;
                            tempTrial.visible = true;
                            trialData.push(tempTrial);
                        }
                    }  
                }
                resolve(trialData);
            }
            catch(err){
                console.log(err);
                reject(trialData);
                setTrialDataLoading(false);
            }
        });
    };

    const loadTrial = async () => {
        setTrialDataLoading(true);
        const trialDataResp = await getMainTrialData(props.data, props.map);
        // console.log(trialDataResp);
        setTrialData(trialDataResp);
        props.setCurrentTrialDataHandler(trialDataResp);
        setTrialDataLoading(false);
    }

    const togglePathVisible = (item, index) => {
        let newDataArr = [...trialData]; // copying the old datas array
        newDataArr[index].visible = item.visible ? false : true; 
        setTrialData(newDataArr);
        props.setCurrentTrialDataHandler(newDataArr);
    };

    const toggleShowPanel = () => {
        panelVisible ? setPanelVisible(false) : setPanelVisible(true);
    };

    useEffect(() => {
        setTrialData([]);
    }, [props.data.id]);

    useEffect(() => {
        return () => {
            setTrialDataLoading(false);
            setTrialData(null);
        }
    }, []);

    return(
        <div id="mountain-info-block" className='row mx-0'>
            <div className="col-md-3 py-2 rwd-hide">
                {
                    props.data.mainPhoto ?
                        <img className="mountain-img w-100 h-100 rounded shodow" src={ props.data.mainPhoto } alt="" />
                    : null
                }
            </div>
            <div className="col-md-6 px-2 py-2 d-flex flex-column justify-content-end">
                <Button size="small" variant="contained" className="w-100" onClick={toggleShowPanel}>
                    { panelVisible ? <Icon>keyboard_arrow_down</Icon> : <Icon>expand_less</Icon> }
                </Button>
                {
                    panelVisible ? 
                        <div className="px-2 py-2 rounded shadow bg-light w-100">
                            <div className="fw-bold text-start d-flex align-items-center" style={{ fontSize: '25px' }}>
                                <span className="pe-2">{ props.data.title }</span>
                            </div>
                            <div className="text-start">高度: {props.data.height}</div>
                            <div className="text-start">行政區: {props.data.county}</div>
                            <div className="text-start">山系: {props.data.mountain_sys}</div>
                            <div className="text-start">備註: {props.data.title_tag}</div>
                            <div className="text-start">所屬國家公園: {props.data.park}</div>
                            <div className="text-start">基點: {props.data.base_point}</div>
                            {/* <div>簡介: {props.data.summary}</div> */}
                        </div>
                    : null
                }
            </div>
            {
                panelVisible ? 
                    <div className="col-md-3 h-100 px-2 py-2" style={{ maxHeight: '230px', overflow: 'auto' }}>
                        <div className="px-2 py-2 bg-light rounded shadow h-100">
                            <div className="border-bottom">
                                <span className="pe-2">路線資料</span>
                                { trialData.length ?  '(' + trialData.length + ')' : null }
                            </div>
                            <div>
                                {
                                    trialData.length === 0 ?
                                        <LoadingButton
                                            className="my-1"
                                            onClick={loadTrial}
                                            loading={trialDataLoading}
                                            loadingPosition="end"
                                            endIcon={<Icon>directions_walk</Icon>}
                                            variant="contained"
                                        >
                                            <span className="align-middle">載入路線</span>
                                        </LoadingButton>
                                    : null
                                }
                                {
                                    trialData.map((item, index) => 
                                        <div key={index} className="py-1">
                                            <Button size="small" variant="outlined" className="w-100" onClick={e => togglePathVisible(item, index)}>
                                                { index + 1 + '. ' }
                                                { item.trial[0].properties.name ? item.trial[0].properties.name : '路線' }
                                                { item.visible ? <Icon>visibility</Icon> : <Icon>visibility_off</Icon> }
                                            </Button>
                                        </div>
                                    )
                                }
                            </div>
                        </div>
                    </div>
                : null
            }
        </div>
    );
}

function MapContainerDiv(porps){

    const [map, setMap] = useState(null);
    const [currentItem, setCurrentItem] = useState(null);
    const [currentTrialData, setCurrentTrialData] = useState(null);
    const centerLatLng = [23.97565, 120.9738819];
    const zoom = 8;

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
        return () => {
            setCurrentTrialData(null);
            setCurrentItem(null);
        }
    }, []);

    return (
        <div id="map-div" style={{ height: '100%', width: '100%' }}>
            { currentItem ? <MountainInfoBlock data={ currentItem } map={map} setCurrentTrialDataHandler={setCurrentTrialData} /> : null }
            { map ? <ResetPositionBtn map={map} center={centerLatLng} zoom={zoom} /> : null }
            <MapContainer center={centerLatLng} whenCreated={setMap} zoom={zoom} scrollWheelZoom={true} zoomControl={false} style={{ height: '100%', width: '100%' }}>
                <MapComponent />
                <LayersControl position="topright">
                    <LayersControl.BaseLayer checked name="OpenStreetMap.Mapnik">
                        <TileLayer
                            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors 資料來源:健行筆記'
                            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                        />
                    </LayersControl.BaseLayer>
                    <MountainLayerControlGroup name="台灣百岳" icon={markerMointainIcon} checked={true} data={hondredPeaks} map={map} setCurrentItemHandler={setCurrentItem} />
                    <MountainLayerControlGroup name="台灣小百岳" icon={markerMointainIcon} checked={false} data={littleHondredPeaks} map={map} setCurrentItemHandler={setCurrentItem} />
                    <MountainLayerControlGroup name="谷關七雄" icon={markerMointainIcon} checked={false} data={guGuanSevenPeaks} map={map} setCurrentItemHandler={setCurrentItem} />
                    <MountainLayerControlGroup name="太魯閣七雄" icon={markerMointainIcon} checked={false} data={tairokoSevenPeaks} map={map} setCurrentItemHandler={setCurrentItem} />
                    <MountainLayerControlGroup name="其他山岳" icon={markerMointainIcon} checked={false} data={otherPeaks} map={map} setCurrentItemHandler={setCurrentItem} />
                </LayersControl>
                {
                    currentTrialData ? 
                        currentTrialData.map((trial, index) => 
                            trial.visible ? 
                                <Polyline 
                                    key={index}
                                    pathOptions={{ fillColor: 'red', color: 'blue' }}
                                    positions={trial.trial[0].geometry.coordinates.map(point => [point[1], point[0]])}
                                />
                            : null
                        )
                    : null
                }
            </MapContainer>
        </div>
    );
}

export default MapContainerDiv;