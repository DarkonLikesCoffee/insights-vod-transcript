(() => {
  'use strict';
  const $=id=>document.getElementById(id),transcriptEl=$('transcript'),statusEl=$('status'),searchEl=$('search');
  const SETTINGS_KEY='ivwTranscriptSettings';
  const { groupSegments } = globalThis.InsightsTranscriptUtils;
  const defaults={layout:'individual',density:'compact',fontSize:13,fontFamily:'system',showTimestamps:true,autoScroll:true,theme:'dark'};
  let settings={...defaults},state={videoId:'',language:'',segments:[],currentTime:0,status:'Waiting for captions…'};
  let activeIndex=-1,rows=[],renderedItems=[],displayedSourceTabId=null;
  const params=new URLSearchParams(location.search),isWindowMode=params.get('mode')==='window',fixedSourceTabId=Number(params.get('sourceTabId'))||null;
  const fmt=value=>{const n=Math.max(0,Math.floor(Number(value)||0)),h=Math.floor(n/3600),m=Math.floor(n%3600/60),s=n%60;return h?`${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`:`${m}:${String(s).padStart(2,'0')}`;};
  function appendHighlightedText(container,value,query){
    if(!query){container.textContent=value;return;}
    const lower=value.toLocaleLowerCase(),q=query.toLocaleLowerCase();let cursor=0,at;
    while((at=lower.indexOf(q,cursor))!==-1){container.append(document.createTextNode(value.slice(cursor,at)));const mark=document.createElement('mark');mark.textContent=value.slice(at,at+q.length);container.append(mark);cursor=at+q.length;}
    container.append(document.createTextNode(value.slice(cursor)));
  }
  function getDisplayItems(){
    const segments=Array.isArray(state.segments)?state.segments:[];
    if(settings.layout==='grouped') return groupSegments(segments);
    return segments.map((segment,index)=>{
      const start=Number(segment.start)||0;
      const duration=Number(segment.duration)||0;
      const end=Number(segment.end);
      return {
        start,
        end:duration>0?start+duration:(Number.isFinite(end)&&end>start?end:start),
        text:String(segment.text||'').replace(/\\s+/g,' ').trim(),
        firstIndex:index,
        lastIndex:index
      };
    }).filter(item=>item.text);
  }
  function applySettingsToDom(){
    document.body.dataset.density=settings.density;document.body.dataset.theme=settings.theme;document.body.dataset.layout=settings.layout;document.body.dataset.showTimestamps=String(settings.showTimestamps);
    document.body.style.setProperty('--transcript-font-size',`${settings.fontSize}px`);
    const fonts={system:'Inter, system-ui, -apple-system, "Segoe UI", sans-serif',arial:'Arial, sans-serif',verdana:'Verdana, sans-serif',georgia:'Georgia, serif',mono:'ui-monospace, SFMono-Regular, Consolas, monospace'};
    document.body.style.setProperty('--transcript-font',fonts[settings.fontFamily]||fonts.system);
    $('layout-mode').value=settings.layout;$('density').value=settings.density;$('font-size').value=String(settings.fontSize);$('font-size-value').textContent=`${settings.fontSize}px`;$('font-family').value=settings.fontFamily;$('theme').value=settings.theme;$('show-timestamps').checked=settings.showTimestamps;$('auto-scroll').checked=settings.autoScroll;
  }
  async function saveSettings(){applySettingsToDom();try{await chrome.storage.local.set({[SETTINGS_KEY]:settings});}catch(_){}render();}
  function render(){
    const query=searchEl.value.trim(),fragment=document.createDocumentFragment();rows=[];renderedItems=getDisplayItems();
    renderedItems.forEach((item,index)=>{
      const row=document.createElement('article');row.className='segment';row.dataset.index=String(index);row.title='Click to jump to this moment';
      if(settings.showTimestamps){const time=document.createElement('button');time.className='time';time.type='button';time.textContent=fmt(item.start);time.setAttribute('aria-label',`Jump to ${fmt(item.start)}`);row.append(time);}
      const text=document.createElement('span');text.className='text';appendHighlightedText(text,item.text,query);row.append(text);
      row.addEventListener('click',()=>chrome.runtime.sendMessage({type:'IVW_SEEK_TIME',time:item.start}));fragment.append(row);rows.push(row);
    });
    transcriptEl.replaceChildren(fragment);
    if(!rows.length){const empty=document.createElement('div');empty.className='empty';const title=document.createElement('h2');title.textContent='Waiting for transcript';const p=document.createElement('p');p.textContent=state.status||'Open an Insights.gg VOD and enable YouTube captions (CC).';empty.append(title,p);transcriptEl.append(empty);}
    $('count').textContent=settings.layout==='grouped'?`${state.segments.length.toLocaleString()} captions · ${renderedItems.length.toLocaleString()} paragraphs`:`${state.segments.length.toLocaleString()} captions`;
    $('language').textContent=state.language?state.language.toUpperCase():'—';$('subtitle').textContent=state.videoId?`Video: ${state.videoId}`:'Connected to the active Insights.gg VOD';statusEl.textContent=state.status||'Waiting for captions…';activeIndex=-1;updateActive();
  }
  function updateActive(){
    if(!renderedItems.length)return;
    const time=Number(state.currentTime)||0;let low=0,high=renderedItems.length-1,found=-1;
    while(low<=high){const mid=(low+high)>>1;if(renderedItems[mid].start<=time){found=mid;low=mid+1;}else high=mid-1;}
    if(found===activeIndex)return;rows[activeIndex]?.classList.remove('active');activeIndex=found;const row=rows[found];if(!row)return;row.classList.add('active');
    if(settings.autoScroll&&document.visibilityState==='visible')row.scrollIntoView({block:'nearest',behavior:'smooth'});
  }
  function applyState(next){
    if(!next)return;
    const incoming=Array.isArray(next.segments)?next.segments:state.segments,old=JSON.stringify([state.videoId,state.language,state.segments]),fresh=JSON.stringify([next.videoId??state.videoId,next.language??state.language,incoming]);
    state={...state,...next,segments:incoming};if(old!==fresh)render();else{statusEl.textContent=state.status||'';updateActive();}
  }
  function onSettingChange(){
    settings={layout:$('layout-mode').value,density:$('density').value,fontSize:Number($('font-size').value),fontFamily:$('font-family').value,theme:$('theme').value,showTimestamps:$('show-timestamps').checked,autoScroll:$('auto-scroll').checked};saveSettings();
  }
  $('settings-toggle').addEventListener('click',()=>{const panel=$('settings-panel');panel.hidden=!panel.hidden;$('settings-toggle').setAttribute('aria-expanded',String(!panel.hidden));});
  ['layout-mode','density','font-size','font-family','theme','show-timestamps','auto-scroll'].forEach(id=>$(id).addEventListener('input',onSettingChange));
  $('reset-settings').addEventListener('click',()=>{settings={...defaults};saveSettings();});
  searchEl.addEventListener('input',()=>{const query=searchEl.value.trim();rows.forEach((row,i)=>{const text=row.querySelector('.text');text.replaceChildren();appendHighlightedText(text,renderedItems[i].text,query);});});
  chrome.storage.onChanged.addListener((changes,area)=>{if(area==='local'&&changes[SETTINGS_KEY]?.newValue){settings={...defaults,...changes[SETTINGS_KEY].newValue};applySettingsToDom();render();}});
  chrome.runtime.onMessage.addListener(message=>{
    if(message?.type==='IVW_STATE'){
      if(isWindowMode&&message.sourceTabId!=null&&message.sourceTabId!==fixedSourceTabId)return;
      if(!isWindowMode&&message.target==='sidepanel'&&message.sourceTabId!=null&&displayedSourceTabId!=null&&message.sourceTabId!==displayedSourceTabId)return;
      if(!isWindowMode&&message.target==='sidepanel'&&message.sourceTabId!=null)displayedSourceTabId=message.sourceTabId;
      applyState(message.state);
    }
    if(message?.type==='IVW_TIME'){
      if(isWindowMode&&message.sourceTabId!=null&&message.sourceTabId!==fixedSourceTabId)return;
      if(!isWindowMode&&message.target==='sidepanel'&&message.sourceTabId!=null&&message.sourceTabId!==displayedSourceTabId)return;
      if(message.videoId&&state.videoId&&message.videoId!==state.videoId){state={...state,videoId:message.videoId,language:'',segments:[],currentTime:Number(message.currentTime)||0,status:'Waiting for captions for this video. Enable CC if needed.'};render();}
      else{state.currentTime=Number(message.currentTime)||0;updateActive();}
    }
  });
  async function refreshState(){
    try{const result=await chrome.runtime.sendMessage({type:'IVW_GET_STATE'});if(result?.state){displayedSourceTabId=result.sourceTabId??null;applyState(result.state);}statusEl.textContent=state.status||'Waiting for captions…';}
    catch(_){statusEl.textContent='Could not connect to extension service worker. Reload the extension.';}
  }
  (async()=>{try{const saved=await chrome.storage.local.get(SETTINGS_KEY);settings={...defaults,...(saved[SETTINGS_KEY]||{})};}catch(_){}applySettingsToDom();render();await refreshState();})();
})();
