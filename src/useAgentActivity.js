import {useEffect,useState} from 'react';
import {api} from './api';
export function useAgentActivity(){
 const [activity,setActivity]=useState([]);
 useEffect(()=>{
  let live=true,inFlight=false;
  async function load(){if(inFlight)return;inFlight=true;try{const rows=await api('/team-activity');if(live)setActivity(rows);}catch{if(live)setActivity([]);}finally{inFlight=false;}}
  load();const timer=setInterval(load,1500);
  window.addEventListener('team-activity-change',load);
  return()=>{live=false;clearInterval(timer);window.removeEventListener('team-activity-change',load);};
 },[]);
 return activity;
}
