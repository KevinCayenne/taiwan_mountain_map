
import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Icon, Link } from '@mui/material';
import LoadingButton from '@mui/lab/LoadingButton';
import Button from '@mui/material/Button';

let gpxParser = require('gpxparser');
const corsUrl = 'https://cors-proxy-kevincay.herokuapp.com/';
const mainRequestUrl = 'https://hiking.biji.co/';

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
                        const url = mainRequestUrl + item.related_trials[i].link;
                        const trailResp = await axios.get(corsUrl + url + '&type=route');
                        const trailData = trailResp.data;
                        let htmlObject = document.createElement('div');
                        htmlObject.innerHTML = trailData;
                        let gpxDataDiv = htmlObject.querySelector("#interactive_map");
                        let gpxDataMobileDiv = htmlObject.querySelector(".flex.col-gap-20 > a");

                        if(gpxDataDiv){
                            let gpxData = gpxDataDiv.attributes['data-value'].value;

                            // Parse gpx
                            const trailGpxResp = await axios.get(corsUrl + gpxData);
                            var gpx = new gpxParser(); //Create gpxParser Object
                            gpx.parse(trailGpxResp.data); 
                            let geoJSON = gpx.toGeoJSON(); //parse gpx file from string data
                            tempTrial.trial = geoJSON.features;
                            tempTrial.visible = true;
                            tempTrial.url = url;
                            trialData.push(tempTrial);
                        }else if(gpxDataMobileDiv){
                            const gpxId = gpxDataMobileDiv['href'].split('id=')[1];
                            const deviceUrl = mainRequestUrl + '/index.php?q=trail&act=gpx_detail&id=' + gpxId;
                            const trailGpxResp = await axios.get(corsUrl + deviceUrl);

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
                            tempTrial.url = deviceUrl;
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
            <div className="col-md-3 mountain-img-div py-2 rwd-hide align-items-center justify-content-center">
                {
                    props.data.mainPhoto && !props.markerImgLoading ?
                        <img className="mountain-img w-100 h-100 rounded shodow" src={ props.data.mainPhoto } alt="" />
                    : 
                        <div className="spinner-border text-primary" role="status">
                            <span className="visually-hidden">Loading...</span>
                        </div>
                }
            </div>
            <div className="col-md-6 px-2 pt-0 pb-2 d-flex flex-column justify-content-end">
                <Button size="small" variant="contained" className="w-100" onClick={toggleShowPanel} style={{ position: 'sticky', top: '0px' }}>
                    { panelVisible ? <Icon>keyboard_arrow_down</Icon> : <Icon>expand_less</Icon> }
                </Button>
                {
                    panelVisible ? 
                        <div className="px-2 py-2 rounded shadow bg-light w-100">
                            <div className="fw-bold text-start d-flex align-items-center" style={{ fontSize: '25px' }}>
                                <span className="pe-2">{ props.data.title }</span>
                                <Link href={ 'https://hiking.biji.co/index.php?q=mountain&act=detail&id=' + props.data.id } target="_blank" rel="noreferrer" color="green" underline="none" style={{ fontSize: "15px" }}>
                                    <span className="align-middle">健行筆記 </span>
                                    <Icon className="align-middle">launch</Icon>
                                </Link>
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
                    <div className="col-md-3 h-100 px-2 py-2" style={{ maxHeight: '350px', overflow: 'auto' }}>
                        <div className="px-2 py-2 bg-light rounded shadow h-100 d-flex flex-column">
                            <div className="border-bottom fw-bold" style={{ flex: '0 0 auto', height: 'auto' }}>
                                <span className="pe-2">路線資料</span>
                                { trialData.length ?  '(' + trialData.length + ')' : null }
                            </div>
                            <div style={{ flex: '1 1 100%', height: '100%' }}>
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
                                        <div key={index} className="row mx-0 py-1 border-bottom">
                                            <div className="col-8 px-0">
                                                <span className="align-middle">
                                                    { index + 1 + '. ' }
                                                    { item.trial[0].properties.name ? item.trial[0].properties.name : '路線' }
                                                </span>
                                            </div>
                                            <div className="col-2 d-flex align-items-center justify-content-center">
                                                <Button size="small" className="w-100" onClick={e => togglePathVisible(item, index)}>
                                                    { item.visible ? <Icon className="align-middle">visibility</Icon> : <Icon className="align-middle text-secondary">visibility_off</Icon> }
                                                </Button>
                                            </div>
                                            <div className="col-2 d-flex align-items-center justify-content-center">
                                                <Link href={item.url} target="_blank" rel="noreferrer" color="green" underline="none" style={{ fontSize: "15px" }}>
                                                    <Icon className="align-middle">launch</Icon>
                                                </Link>
                                            </div>
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

export default MountainInfoBlock;