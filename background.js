'use strict';

const PREFIX = '[Insights Transcript]';
const STATE_KEY = id => `ivwTranscriptState:${id}`;
const SOURCE_KEY = 'ivwSourceTabId';
const WINDOW_KEY = 'ivwTranscriptWindowId';
const MODE_KEY = 'ivwDisplayMode';
const initialState = () => ({ videoId:'', playerVideoId:'', language:'', segments:[], currentTime:0, status:'Waiting for captions. Start playback and enable CC if needed.', updatedAt:Date.now() });

const contexts = new Map();
let sourceTabId = null;
let windowId = null;
let displayMode = 'sidepanel';
let activeTabId = null;

const ready = (async () => {
  const data = await chrome.storage.local.get([SOURCE_KEY, WINDOW_KEY, MODE_KEY]);
  sourceTabId = data[SOURCE_KEY] ?? null;
  windowId = data[WINDOW_KEY] ?? null;
  displayMode = data[MODE_KEY] || 'sidepanel';
  const [activeTab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  activeTabId = activeTab?.id ?? null;
})();

function isVodUrl(url) {
  try {
    const parsed = new URL(url);
    return /(^|\.)insights\.gg$/i.test(parsed.hostname) && /^\/dashboard\/video\//.test(parsed.pathname);
  } catch (_) { return false; }
}

async function getContext(tabId) {
  await ready;
  if (!contexts.has(tabId)) contexts.set(tabId,{state:initialState(),activeVideoId:'',currentTime:0,loaded:false});
  const context=contexts.get(tabId);
  if(!context.loaded){
    const data=await chrome.storage.local.get(STATE_KEY(tabId));
    if(data[STATE_KEY(tabId)])context.state=data[STATE_KEY(tabId)];
    context.activeVideoId=context.state.playerVideoId||context.state.videoId||'';
    context.currentTime=Number(context.state.currentTime)||0;
    context.loaded=true;
  }
  return context;
}
async function persistContext(tabId,context){
  context.state={...context.state,updatedAt:Date.now()};
  await chrome.storage.local.set({[STATE_KEY(tabId)]:context.state});
}
async function activeTabInfo(){
  const [tab]=await chrome.tabs.query({active:true,lastFocusedWindow:true});
  return tab||null;
}
async function sendWindow(message){
  if(windowId==null)return;
  try{
    const win=await chrome.windows.get(windowId,{populate:true});
    const id=win.tabs?.[0]?.id;
    if(id!=null)await chrome.tabs.sendMessage(id,message);
  }catch(_){}
}
async function publishState(tabId,mode=displayMode){
  const context=await getContext(tabId);
  if(mode==='sidepanel'&&tabId!==activeTabId)return;
  const payload={type:'IVW_STATE',sourceTabId:tabId,revision:Date.now(),state:{...context.state,currentTime:context.currentTime}};
  if(mode==='window')await sendWindow(payload);
  else{try{await chrome.runtime.sendMessage({...payload,target:'sidepanel'});}catch(_){}}
}
async function showNoVodState(tabId){
  try{
    await chrome.runtime.sendMessage({
      type:'IVW_STATE',target:'sidepanel',sourceTabId:tabId,revision:Date.now(),
      state:{...initialState(),status:'Open an Insights.gg VOD to view its transcript.'}
    });
  }catch(_){}
}
async function resetVideo(tabId,videoId){
  const context=await getContext(tabId);
  if(!videoId||context.activeVideoId===videoId)return context;
  context.activeVideoId=videoId;
  context.currentTime=0;
  const next=initialState();next.playerVideoId=videoId;
  next.status='Waiting for captions for this video. Enable CC if needed.';
  context.state=next;
  await persistContext(tabId,context);
  if(displayMode==='sidepanel'&&tabId===activeTabId)await publishState(tabId,'sidepanel');
  if(displayMode==='window'&&tabId===sourceTabId)await publishState(tabId,'window');
  return context;
}
async function activateSidePanel(tabId, openPanel = true){
  await ready;
  if(tabId==null)throw new Error('No active Insights.gg VOD tab.');
  sourceTabId=tabId;activeTabId=tabId;displayMode='sidepanel';
  await chrome.storage.local.set({[SOURCE_KEY]:sourceTabId,[MODE_KEY]:displayMode});
  await getContext(tabId);
  await chrome.sidePanel.setOptions({tabId,path:'transcript.html',enabled:true});
  if(openPanel) await chrome.sidePanel.open({tabId});
  if(windowId!=null){
    try{await chrome.windows.remove(windowId);}catch(_){}
    windowId=null;await chrome.storage.local.remove(WINDOW_KEY);
  }
  await publishState(tabId,'sidepanel');
}

async function openTranscript(tabId,mode){
  await ready;
  if(tabId==null)throw new Error('No active Insights.gg VOD tab.');
  if(mode==='sidepanel'){
    await activateSidePanel(tabId,true);
    return;
  }
  sourceTabId=tabId;activeTabId=tabId;displayMode=mode;
  await chrome.storage.local.set({[SOURCE_KEY]:sourceTabId,[MODE_KEY]:displayMode});
  await getContext(tabId);
  // Selecting the standalone window hides the Side Panel for this tab.
  // The toolbar popup re-enables it before the user can select Side Panel again.
  try{await chrome.sidePanel.setOptions({tabId,enabled:false});}catch(_){}
  if(windowId!=null){
    try{
      const win=await chrome.windows.get(windowId,{populate:true});
      const bound=new URL(win.tabs?.[0]?.url||'chrome-extension://invalid').searchParams.get('sourceTabId');
      if(Number(bound)===tabId){
        await chrome.windows.update(windowId,{focused:true});
        await publishState(tabId,'window');
        return;
      }
      await chrome.windows.remove(windowId);
    }catch(_){}
    windowId=null;
  }
  const created=await chrome.windows.create({
    url:chrome.runtime.getURL(`transcript.html?mode=window&sourceTabId=${tabId}`),
    type:'popup',focused:true,width:620,height:760
  });
  windowId=created.id;
  await chrome.storage.local.set({[WINDOW_KEY]:windowId});
}
chrome.runtime.onMessage.addListener((message,sender,sendResponse)=>{
  if(message?.type==='IVW_DISPLAY_SELECTED'||message?.type==='IVW_OPEN_TRANSCRIPT'){
    (async()=>{
      await ready;
      const tabId=message.sourceTabId??sender.tab?.id;
      if(tabId==null)throw new Error('No active Insights.gg VOD tab.');
      if(message.type==='IVW_DISPLAY_SELECTED')await activateSidePanel(tabId,false);
      else await openTranscript(tabId,message.mode==='window'?'window':'sidepanel');
      sendResponse({ok:true});
    })().catch(error=>{
      console.warn(PREFIX,'could not change transcript display mode',error);
      sendResponse({ok:false,error:error.message||'Could not open transcript.'});
    });
    return true;
  }

  (async()=>{
    await ready;
    if(message?.type==='IVW_GET_STATE'){
      if(sender.id!==chrome.runtime.id||!sender.url?.startsWith(chrome.runtime.getURL('transcript.html')))return;
      const url=new URL(sender.url);
      const mode=url.searchParams.get('mode')==='window'?'window':'sidepanel';
      const tabId=mode==='window'?Number(url.searchParams.get('sourceTabId'))||sourceTabId:(await activeTabInfo())?.id;
      const tab=tabId!=null?await chrome.tabs.get(tabId).catch(()=>null):null;
      const context=tab&&isVodUrl(tab.url||'')?await getContext(tabId):null;
      sendResponse({state:context?{...context.state,currentTime:context.currentTime}:{...initialState(),status:'Open an Insights.gg VOD to view its transcript.'},sourceTabId:context?tabId:null,displayMode:mode});
      return;
    }
    if(message?.type==='IVW_SEEK_TIME'){
      if(sender.id!==chrome.runtime.id||!sender.url?.startsWith(chrome.runtime.getURL('transcript.html')))return;
      const url=new URL(sender.url);
      const tabId=url.searchParams.get('mode')==='window'?Number(url.searchParams.get('sourceTabId'))||sourceTabId:(await activeTabInfo())?.id;
      const tab=tabId!=null?await chrome.tabs.get(tabId).catch(()=>null):null;
      if(tab&&isVodUrl(tab.url||'')){
        try{await chrome.tabs.sendMessage(tabId,{type:'IVW_SEEK_TIME',time:Math.max(0,Number(message.time)||0)});}catch(_){}
      }
      return;
    }

    const tabId=sender.tab?.id;
    if(tabId==null)return;
    const context=await getContext(tabId);
    if(message?.type==='IVW_TIME'){
      const videoId=message.videoId||'';
      if(videoId&&context.activeVideoId&&videoId!==context.activeVideoId)await resetVideo(tabId,videoId);
      else if(videoId&&!context.activeVideoId)context.activeVideoId=videoId;
      context.currentTime=Number(message.currentTime)||0;
      if(displayMode==='sidepanel'&&tabId===activeTabId){
        try{await chrome.runtime.sendMessage({type:'IVW_TIME',target:'sidepanel',sourceTabId:tabId,revision:Date.now(),videoId,currentTime:context.currentTime});}catch(_){}
      }
      if(displayMode==='window'&&tabId===sourceTabId)await sendWindow({type:'IVW_TIME',sourceTabId:tabId,videoId,currentTime:context.currentTime});
      return;
    }
    if(message?.type==='IVW_TRANSCRIPT'){
      const videoId=message.videoId||'';
      if(videoId&&context.activeVideoId&&videoId!==context.activeVideoId)await resetVideo(tabId,videoId);
      if(videoId)context.activeVideoId=videoId;
      const receivedSegments=Array.isArray(message.segments)?message.segments:[];
      // An empty timedtext response must not erase captions already captured
      // for this same video (YouTube can issue empty follow-up requests).
      const segments=receivedSegments.length?receivedSegments:context.state.segments;
      context.state={...context.state,videoId,playerVideoId:videoId||context.activeVideoId,language:message.language||context.state.language||'',segments,currentTime:context.currentTime,status:segments.length?'Transcript ready':(message.status||'No captions found for this video.')};
      await persistContext(tabId,context);
      if(displayMode==='sidepanel'&&tabId===activeTabId)await publishState(tabId,'sidepanel');
      if(displayMode==='window'&&tabId===sourceTabId)await publishState(tabId,'window');
      return;
    }
    if(message?.type==='IVW_STATUS'){
      context.state={...context.state,status:String(message.status||'Transcript unavailable')};
      await persistContext(tabId,context);
      if(displayMode==='sidepanel'&&tabId===activeTabId)await publishState(tabId,'sidepanel');
      if(displayMode==='window'&&tabId===sourceTabId)await publishState(tabId,'window');
    }
  })().catch(error=>console.warn(PREFIX,'message handler failed',error));
  return message?.type==='IVW_GET_STATE';
});
chrome.tabs.onActivated.addListener(async info=>{
  await ready;activeTabId=info.tabId;
  const tab=await chrome.tabs.get(info.tabId).catch(()=>null);
  if(!tab)return;
  if(displayMode==='sidepanel'&&isVodUrl(tab.url||''))await publishState(info.tabId,'sidepanel');
  else if(displayMode==='sidepanel')await showNoVodState(info.tabId);
  else if(displayMode==='window'&&sourceTabId!=null)await publishState(sourceTabId,'window');
});
chrome.tabs.onUpdated.addListener(async(tabId,changeInfo,tab)=>{
  await ready;
  if(!tab.active||!(changeInfo.status==='complete'||changeInfo.url))return;
  activeTabId=tabId;
  if(displayMode==='sidepanel'&&isVodUrl(tab.url||''))await publishState(tabId,'sidepanel');
  else if(displayMode==='sidepanel')await showNoVodState(tabId);
});
chrome.windows.onRemoved.addListener(async removedId=>{
  await ready;
  if(windowId===removedId){windowId=null;await chrome.storage.local.remove(WINDOW_KEY);}
});
chrome.tabs.onRemoved.addListener(async removedId=>{
  await ready;contexts.delete(removedId);await chrome.storage.local.remove(STATE_KEY(removedId));
  if(sourceTabId===removedId){sourceTabId=null;await chrome.storage.local.remove(SOURCE_KEY);}
  if(activeTabId===removedId)activeTabId=null;
});
