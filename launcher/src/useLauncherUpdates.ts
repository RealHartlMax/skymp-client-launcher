import {useCallback,useEffect,useRef,useState} from 'react';
import {fetchOfficialRelease,type UpdateState} from './launcherUpdates';
export default function useLauncherUpdates(){
  const [updates,setUpdates]=useState<UpdateState>({checking:true,release:null,error:false,checked:false});
  const inFlight=useRef(false),mounted=useRef(false),lastCheck=useRef(0);
  const check=useCallback(async()=>{
    if(inFlight.current)return;inFlight.current=true;setUpdates(previous=>({...previous,checking:true}));
    try{const release=await fetchOfficialRelease();if(mounted.current)setUpdates({checking:false,release,error:false,checked:true});}
    catch{if(mounted.current)setUpdates(previous=>({...previous,checking:false,error:true,checked:true}));}
    finally{inFlight.current=false;lastCheck.current=Date.now();}
  },[]);
  useEffect(()=>{
    mounted.current=true;void check();
    const focus=()=>{if(!document.hidden&&Date.now()-lastCheck.current>60000)void check();};
    const timer=window.setInterval(()=>{if(!document.hidden)void check();},30*60*1000);
    window.addEventListener('focus',focus);document.addEventListener('visibilitychange',focus);
    return()=>{mounted.current=false;window.clearInterval(timer);window.removeEventListener('focus',focus);document.removeEventListener('visibilitychange',focus);};
  },[check]);
  return {updates,check};
}
