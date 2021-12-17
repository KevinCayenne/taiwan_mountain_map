import React, { useState, useEffect, useCallback } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, Tooltip, LayersControl, LayerGroup, useMap, useMapEvents } from 'react-leaflet';
import axios from 'axios';
import { Icon } from '@mui/material';
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

    const [currentTrialData, setCurrentTrialData] = useState(null);

    const getMainTrialData = (item, map) => {
        return new Promise(async (resolve, reject) => {
            let currentItem = item;
            let trialData = {};
            let mainTrial = null;

            console.log(currentItem);

            try{

                if(currentItem && item.related_trials.length){
                    const pst = [currentItem.lat, currentItem.lon];
                    map.setView(pst, 14);
            
                    for(let i = 0; i < item.related_trials.length; i++){
                         // get gpx data
                        const trailResp = await axios.get(corsUrl + mainRequestUrl + item.related_trials[i].link);
                        const trailData = trailResp.data;
                        let htmlObject = document.createElement('div');
                        htmlObject.innerHTML = trailData;
                        const gpxDataDiv = htmlObject.querySelector("#interactive_map");
                        let gpxData = gpxDataDiv.attributes['data-value'].value;

                        // Parse gpx
                        // console.log(gpxData);
                        const trailGpxResp = await axios.get(corsUrl + gpxData);
                        var gpx = new gpxParser(); //Create gpxParser Object
                        gpx.parse(trailGpxResp.data); 
                        let geoJSON = gpx.toGeoJSON(); //parse gpx file from string data
                        trialData.trial = geoJSON.features;
                        // let mainPhotoData = htmlObject.querySelector(".main-left");
                    }  
                }
                resolve(trialData);
            }
            catch(err){
                console.log(err);
                reject(trialData);
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
                                            props.setCurrentItemHandler(item);
                                            props.map.setView([item.lat, item.lon], 14);
                                            const trialData = await getMainTrialData(item, props.map);
                                            console.log(trialData);
                                            setCurrentTrialData(trialData);
                                        }
                                        catch(err){
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
                                </Popup>
                                <Tooltip direction="top" offset={[0, 0]} opacity={1} permanent>{ item.title }</Tooltip>
                            </Marker>
                        )
                    : ""
                }
                {/* <Polyline
                    pathOptions={{ fillColor: 'red', color: 'blue' }}
                    positions={[
                        [40.689818841705, -74.04511194542516],
                    ]}
                /> */}
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
    return(
        <div id="mountain-info-block" className='row mx-0'>
            <div className="col-md-3"></div>
            <div className="col-md-6 px-2 py-2">
                <div className="px-2 py-2 rounded shadow bg-light">
                    <div className="fw-bold text-start" style={{ fontSize: '25px' }}>{props.data.title}</div>
                    <div className="text-start">高度: {props.data.height}</div>
                    <div className="text-start">行政區: {props.data.county}</div>
                    <div className="text-start">山系: {props.data.mountain_sys}</div>
                    <div className="text-start">備註: {props.data.title_tag}</div>
                    <div className="text-start">所屬國家公園: {props.data.park}</div>
                    <div className="text-start">基點: {props.data.base_point}</div>
                    {/* <div>簡介: {props.data.summary}</div> */}
                </div>
            </div>
            <div className="col-md-3"></div>
        </div>
    );
}

function MapContainerDiv(porps){

    const [map, setMap] = useState(null);
    const [currentItem, setCurrentItem] = useState(null);
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
        
        return () => {
            setCurrentItem(null);
        }
    }, []);

    return (
        <div style={{ height: '100%', width: '100%' }}>
            { currentItem ? <MountainInfoBlock data={ currentItem } /> : null }
            { map ? <ResetPositionBtn map={map} center={centerLatLng} zoom={zoom} /> : null }
            <MapContainer center={centerLatLng} whenCreated={setMap} zoom={zoom} scrollWheelZoom={true} zoomControl={false} style={{ height: '100%', width: '100%' }}>
                <MapComponent />
                <LayersControl position="topright">
                    <LayersControl.BaseLayer checked name="OpenStreetMap.Mapnik">
                        <TileLayer
                            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                        />
                    </LayersControl.BaseLayer>
                    <MountainLayerControlGroup name="台灣百岳" icon={markerMointainIcon} checked={true} data={hondredPeaks} map={map} setCurrentItemHandler={setCurrentItem} />
                    <MountainLayerControlGroup name="台灣小百岳" icon={markerMointainIcon} checked={false} data={littleHondredPeaks} map={map} setCurrentItemHandler={setCurrentItem} />
                    <MountainLayerControlGroup name="谷關七雄" icon={markerMointainIcon} checked={false} data={guGuanSevenPeaks} map={map} setCurrentItemHandler={setCurrentItem} />
                    <MountainLayerControlGroup name="太魯閣七雄" icon={markerMointainIcon} checked={false} data={tairokoSevenPeaks} map={map} setCurrentItemHandler={setCurrentItem} />
                    <MountainLayerControlGroup name="其他山岳" icon={markerMointainIcon} checked={false} data={otherPeaks} map={map} setCurrentItemHandler={setCurrentItem} />
                </LayersControl>
            </MapContainer>
        </div>
    );
}

export default MapContainerDiv;