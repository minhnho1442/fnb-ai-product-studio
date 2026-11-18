/* F&B Product Studio v0.1 | Local-first image compositing editor */
(() => {
'use strict';
const $ = (id) => document.getElementById(id);
const canvas = $('artboard'), overlay = $('overlay');
const ctx = canvas.getContext('2d'), octx = overlay.getContext('2d');
const presets = [
  {id:'cream',name:'Kem studio',css:'linear-gradient(150deg,#f6f0e9,#d7bdac)',top:'#faf5f0',bottom:'#d0b6a5'},
  {id:'sky',name:'Xanh Co&Co',css:'linear-gradient(150deg,#b5e8ff,#76bfed)',top:'#c7ebf8',bottom:'#83c7e6'},
  {id:'coffee',name:'Nâu cà phê',css:'linear-gradient(150deg,#6b422c,#1b1515)',top:'#65452f',bottom:'#1c1617'},
  {id:'marble',name:'Đá trắng',css:'linear-gradient(150deg,#fafaf7,#d7dcd9)',top:'#fefcf8',bottom:'#dadddb'},
  {id:'mint',name:'Tropical',css:'linear-gradient(150deg,#c1ebd2,#428b85)',top:'#c2ecd4',bottom:'#3e837d'},
  {id:'black',name:'Đen premium',css:'linear-gradient(150deg,#4e5661,#0c1118)',top:'#48525c',bottom:'#111720'},
  {id:'transparent',name:'Trong suốt',css:'repeating-conic-gradient(#f1f1f1 0 25%,#d1d1d1 0 50%) 50% / 15px 15px',top:null,bottom:null}
];
const slidersSpec = [
  {key:'brightness',label:'Độ sáng',min:40,max:180,step:1,default:100,suffix:'%'},
  {key:'contrast',label:'Tương phản',min:40,max:180,step:1,default:100,suffix:'%'},
  {key:'saturation',label:'Độ bão hòa',min:0,max:200,step:1,default:100,suffix:'%'},
  {key:'warmth',label:'Nhiệt độ màu',min:-100,max:100,step:1,default:0,suffix:''},
  {key:'blur',label:'Làm mờ',min:0,max:12,step:0.1,default:0,suffix:'px'},
  {key:'opacity',label:'Độ trong suốt',min:0,max:100,step:1,default:100,suffix:'%'}
];
const makeId = () => 'layer_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2,6);
const initial = () => ({width:1080,height:1350,bg:{preset:'cream',src:null},layers:[],selectedId:null,compare:false,projectName:'Dự án sản phẩm mới'});
let state = initial();
let fitScale = 1, zoomFactor = 1, drag = null, toastTimer=null;
let history = [], redoStack = [];
const imgCache = new Map();
const DEFAULT_API = 'http://127.0.0.1:8000';

function notify(message, isError=false) { const t=$('toast'); t.textContent=message; t.style.background=isError?'#ffc9bd':'#dcfba7';t.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>t.classList.remove('show'),3500);$('statusText').textContent=message; }
function snap(){return JSON.stringify({width:state.width,height:state.height,bg:state.bg,layers:state.layers,selectedId:state.selectedId,projectName:state.projectName});}
function checkpoint(){const s=snap();if(history.at(-1)!==s){history.push(s);if(history.length>30)history.shift();redoStack=[];} updateHistoryButtons();}
function updateHistoryButtons(){ $('btnUndo').disabled=history.length<2;$('btnRedo').disabled=redoStack.length===0; }
function restore(serial){ const saved=JSON.parse(serial);state={...initial(),...saved};$('projectName').textContent=state.projectName;syncAll(); }
function undo(){ if(history.length<2)return;redoStack.push(history.pop());restore(history.at(-1));updateHistoryButtons();notify('Đã hoàn tác'); }
function redo(){ if(!redoStack.length)return;const s=redoStack.pop();history.push(s);restore(s);updateHistoryButtons();notify('Đã làm lại'); }
function activeLayer(){ return state.layers.find(l=>l.id===state.selectedId)||null; }
function cacheImage(src){if(!src)return null;const cached=imgCache.get(src);if(cached)return cached.complete&&cached.naturalWidth?cached:null;const im=new Image();im.onload=()=>render();im.onerror=()=>{notify('Không tải được nguồn ảnh',true);};im.src=src;imgCache.set(src,im);return null;}
function fillBackground(g){
 if(state.bg.src){const im=cacheImage(state.bg.src);if(im){const s=Math.max(state.width/im.width,state.height/im.height),w=im.width*s,h=im.height*s;g.drawImage(im,(state.width-w)/2,(state.height-h)/2,w,h);return;}}
 const p=presets.find(p=>p.id===state.bg.preset)||presets[0];if(p.id==='transparent')return;
 const grad=g.createLinearGradient(0,0,state.width,state.height);grad.addColorStop(0,p.top);grad.addColorStop(.58,p.top);grad.addColorStop(1,p.bottom);g.fillStyle=grad;g.fillRect(0,0,state.width,state.height);
 // A soft sweep that reads as an actual studio backdrop rather than a flat wallpaper.
 const glow=g.createRadialGradient(state.width*.35,state.height*.25,0,state.width*.35,state.height*.3,state.width*.85);glow.addColorStop(0,'rgba(255,255,255,.23)');glow.addColorStop(1,'rgba(255,255,255,0)');g.fillStyle=glow;g.fillRect(0,0,state.width,state.height);
 const floor=g.createLinearGradient(0,state.height*.71,0,state.height);floor.addColorStop(0,'rgba(255,255,255,0)');floor.addColorStop(1,'rgba(255,255,255,.19)');g.fillStyle=floor;g.fillRect(0,state.height*.71,state.width,state.height*.29);
}
function applyImageFilter(l){if(state.compare)return 'none';let f=`brightness(${l.brightness ?? 100}%) contrast(${l.contrast ?? 100}%) saturate(${l.saturation ?? 100}%) blur(${l.blur??0}px)`;const warm=l.warmth||0;if(warm>0)f+=` sepia(${(warm*.4).toFixed(1)}%)`;if(warm<0)f+=` hue-rotate(${(warm*.12).toFixed(1)}deg)`;return f;}
function drawLayer(g,l){if(l.hidden)return;g.save();g.globalAlpha=(l.opacity??100)/100;const cx=l.x+l.w/2,cy=l.y+l.h/2;g.translate(cx,cy);g.rotate((l.rotation||0)*Math.PI/180);
 if(l.type==='image'){
  const im=cacheImage(l.src);if(im){g.filter=applyImageFilter(l);if(l.shadow){g.shadowColor='rgba(0,0,0,.28)';g.shadowBlur=Math.max(18,l.w*.05);g.shadowOffsetY=Math.max(12,l.h*.028);}g.drawImage(im,-l.w/2,-l.h/2,l.w,l.h);}
 }else if(l.type==='text'){
  const fontSize=l.fontSize||72;g.font=`800 ${fontSize}px system-ui,sans-serif`;g.textAlign='center';g.textBaseline='middle';g.fillStyle=l.color||'#ffffff';g.shadowColor='rgba(0,0,0,.22)';g.shadowBlur=fontSize*.11;g.shadowOffsetY=fontSize*.07;String(l.text||'').split('\n').forEach((line,i,arr)=>g.fillText(line,0,(i-(arr.length-1)/2)*fontSize*1.15,l.w));
 }
 g.restore();}
function render(){canvas.width=overlay.width=state.width;canvas.height=overlay.height=state.height;ctx.clearRect(0,0,state.width,state.height);fillBackground(ctx);state.layers.forEach(l=>drawLayer(ctx,l));drawOverlay();$('canvasDimensions').textContent=`${state.width} × ${state.height} px`;const divisor=gcd(state.width,state.height);$('canvasFormat').textContent=`${state.width/divisor}:${state.height/divisor}`;$('emptyState').classList.toggle('hidden',state.layers.length>0);}
function gcd(a,b){return b?gcd(b,a%b):a;}
function cornerCoords(l){const rad=(l.rotation||0)*Math.PI/180;return [[-l.w/2,-l.h/2],[l.w/2,-l.h/2],[l.w/2,l.h/2],[-l.w/2,l.h/2]].map(([x,y])=>({x:l.x+l.w/2+x*Math.cos(rad)-y*Math.sin(rad),y:l.y+l.h/2+x*Math.sin(rad)+y*Math.cos(rad)}));}
function drawOverlay(){octx.clearRect(0,0,state.width,state.height);const l=activeLayer();if(!l||l.hidden)return;const c=cornerCoords(l);octx.save();octx.strokeStyle='#d2fc76';octx.lineWidth=Math.max(2,2/Math.max(fitScale*zoomFactor,.2));octx.setLineDash([12,8]);octx.beginPath();c.forEach((p,i)=>i?octx.lineTo(p.x,p.y):octx.moveTo(p.x,p.y));octx.closePath();octx.stroke();octx.setLineDash([]);c.forEach(p=>{octx.beginPath();octx.fillStyle='#d2fc76';octx.strokeStyle='#19231b';octx.lineWidth=3;octx.arc(p.x,p.y,Math.max(5,7/Math.max(fitScale*zoomFactor,.3)),0,Math.PI*2);octx.fill();octx.stroke();});octx.restore();}
function fitStage(){const wrap=$('stageWrap');const maxW=Math.max(100,wrap.clientWidth-70),maxH=Math.max(100,wrap.clientHeight-70);fitScale=Math.min(maxW/state.width,maxH/state.height,1);applyZoom();}
function applyZoom(){const scale=fitScale*zoomFactor;$('stageInner').style.width=`${Math.round(state.width*scale)}px`;$('stageInner').style.height=`${Math.round(state.height*scale)}px`;$('zoomText').textContent=Math.round(scale*100)+'%';drawOverlay();}
function pointerPosition(ev){const r=overlay.getBoundingClientRect();return{x:(ev.clientX-r.left)*state.width/r.width,y:(ev.clientY-r.top)*state.height/r.height};}
function hitTest(l,p){const cx=l.x+l.w/2,cy=l.y+l.h/2,ang=-(l.rotation||0)*Math.PI/180,dx=p.x-cx,dy=p.y-cy;const x=dx*Math.cos(ang)-dy*Math.sin(ang),y=dx*Math.sin(ang)+dy*Math.cos(ang);return Math.abs(x)<=l.w/2 && Math.abs(y)<=l.h/2;}
function onPointerDown(ev){const p=pointerPosition(ev);const current=activeLayer();if(current&&!current.hidden){const corners=cornerCoords(current);const hitRadius=Math.max(17,13/Math.max(fitScale*zoomFactor,.2));if(corners.some(c=>Math.hypot(c.x-p.x,c.y-p.y)<hitRadius)){drag={type:'scale',id:current.id,original:{...current},center:{x:current.x+current.w/2,y:current.y+current.h/2},startDist:Math.max(1,Math.hypot(p.x-(current.x+current.w/2),p.y-(current.y+current.h/2)))};overlay.setPointerCapture(ev.pointerId);return;}}
 const selected=[...state.layers].reverse().find(l=>!l.hidden&&!l.locked&&hitTest(l,p));if(selected){state.selectedId=selected.id;drag={type:'move',id:selected.id,start:p,original:{x:selected.x,y:selected.y}};overlay.setPointerCapture(ev.pointerId);}else{state.selectedId=null;drag=null;}syncInspector();render();}
function onPointerMove(ev){if(!drag)return;const p=pointerPosition(ev),l=state.layers.find(l=>l.id===drag.id);if(!l)return;if(drag.type==='move'){l.x=drag.original.x+(p.x-drag.start.x);l.y=drag.original.y+(p.y-drag.start.y);}else{const ratio=Math.min(4,Math.max(.08,Math.hypot(p.x-drag.center.x,p.y-drag.center.y)/drag.startDist));l.w=drag.original.w*ratio;l.h=drag.original.h*ratio;l.x=drag.center.x-l.w/2;l.y=drag.center.y-l.h/2;}$('scaleRange').value=Math.min(220,Math.max(10,Math.round(100*l.w/(l.baseW||l.w))));$('scaleValue').textContent=Math.round(100*l.w/(l.baseW||l.w))+'%';render();}
function onPointerUp(){if(!drag)return;drag=null;checkpoint();syncLayers();notify('Đã cập nhật vị trí/kích thước');}
function readAsDataURL(file){return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(new Error('Không đọc được ảnh'));reader.readAsDataURL(file);});}
function loadImageDimensions(src){return new Promise((resolve,reject)=>{const im=new Image();im.onload=()=>resolve({w:im.naturalWidth,h:im.naturalHeight});im.onerror=reject;im.src=src;});}
async function addPhotoFiles(files){const images=Array.from(files).filter(f=>f.type.startsWith('image/'));if(!images.length)return;for(const file of images){const src=await readAsDataURL(file);await addImage(src,file.name,false);}checkpoint();notify(`Đã thêm ${images.length} ảnh`);}
async function addImage(src,name,save=true){const d=await loadImageDimensions(src);const s=Math.min(state.width*.67/d.w,state.height*.66/d.h,2);const w=d.w*s,h=d.h*s;const l={id:makeId(),type:'image',name,src,x:(state.width-w)/2,y:(state.height-h)/2,w,h,baseW:w,baseH:h,rotation:0,brightness:100,contrast:100,saturation:100,warmth:0,blur:0,opacity:100,shadow:true,hidden:false,locked:false};state.layers.push(l);state.selectedId=l.id;syncAll();if(save)checkpoint();return l;}
async function addBgFile(file){if(!file)return;state.bg.src=await readAsDataURL(file);state.bg.preset='custom';refreshPresets();render();checkpoint();notify('Đã thay bằng nền tham chiếu');}
function changePreset(id){state.bg={preset:id,src:null};refreshPresets();render();checkpoint();notify(`Nền ${presets.find(p=>p.id===id)?.name||''}`);}
function refreshPresets(){const root=$('presetGrid');root.replaceChildren();for(const p of presets){const b=document.createElement('button');b.className='preset-btn'+(state.bg.preset===p.id?' active':'');b.title=p.name;const sw=document.createElement('span');sw.className='preset-swatch';sw.style.background=p.css;const title=document.createElement('span');title.textContent=p.name;b.append(sw,title);b.addEventListener('click',()=>changePreset(p.id));root.appendChild(b);}}
function addText(){const l={id:makeId(),type:'text',name:'Tiêu đề mới',text:'SẢN PHẨM MỚI',color:'#ffffff',fontSize:80,x:state.width*.1,y:state.height*.13,w:state.width*.8,h:125,opacity:100,rotation:0,hidden:false,locked:false};state.layers.push(l);state.selectedId=l.id;syncAll();checkpoint();notify('Đã thêm layer chữ');}
function selectLayer(id){state.selectedId=id;syncInspector();syncLayers();render();}
function syncAll(){const str=`${state.width}x${state.height}`;$('sizePreset').value=str;$('btnCompare').classList.toggle('active',state.compare);refreshPresets();syncInspector();syncLayers();render();requestAnimationFrame(fitStage);}
function syncLayers(){const list=$('layerList');list.replaceChildren();$('layerCount').textContent=`${state.layers.length} đối tượng`;if(!state.layers.length){const e=document.createElement('div');e.className='empty-layers';e.textContent='Chưa có layer';list.appendChild(e);return;}
for(const l of [...state.layers].reverse()){const row=document.createElement('div');row.className='layer-item'+(l.id===state.selectedId?' active':'');row.addEventListener('click',()=>selectLayer(l.id));const icon=document.createElement('span');icon.className='layer-thumb';icon.textContent=l.type==='text'?'T':'▧';const txt=document.createElement('span');txt.className='layer-name';txt.textContent=l.name;const meta=document.createElement('small');meta.className='layer-meta';meta.textContent=l.type==='text'?'Text layer':'Image layer';txt.appendChild(meta);const show=document.createElement('button');show.className='layer-toggle';show.title=l.hidden?'Hiện layer':'Ẩn layer';show.textContent=l.hidden?'◌':'◉';show.addEventListener('click',e=>{e.stopPropagation();l.hidden=!l.hidden;checkpoint();syncLayers();render();});row.append(icon,txt,show);list.appendChild(row);}}
function initSliders(){const root=$('sliders');for(const s of slidersSpec){const node=document.createElement('div');node.className='slider-control';const label=document.createElement('label');label.className='control-label';label.textContent=s.label;const output=document.createElement('output');output.id=`out-${s.key}`;output.textContent=s.default+s.suffix;label.appendChild(output);const input=document.createElement('input');input.id=`slider-${s.key}`;input.type='range';input.min=s.min;input.max=s.max;input.step=s.step;input.value=s.default;input.addEventListener('input',()=>{const l=activeLayer();if(!l||l.type!=='image')return;l[s.key]=Number(input.value);output.textContent=input.value+s.suffix;render();});input.addEventListener('change',checkpoint);node.append(label,input);root.appendChild(node);}}
function syncInspector(){const l=activeLayer();$('noSelection').classList.toggle('hidden',!!l);$('selectedInfo').classList.toggle('hidden',!l);$('imageControls').classList.toggle('hidden',!l||l.type!=='image');$('textControls').classList.toggle('hidden',!l||l.type!=='text');$('selectedInfo').textContent=l?l.name:'';
 if(!l)return;
 if(l.type==='image'){slidersSpec.forEach(s=>{const value=l[s.key]??s.default;$(`slider-${s.key}`).value=value;$(`out-${s.key}`).textContent=value+s.suffix;});$('scaleRange').value=Math.round(l.w/(l.baseW||l.w)*100);$('scaleValue').textContent=Math.round(l.w/(l.baseW||l.w)*100)+'%';$('rotateRange').value=l.rotation||0;$('rotateValue').textContent=(l.rotation||0)+'°';$('shadowToggle').checked=!!l.shadow;}
 if(l.type==='text'){$('textContent').value=l.text;$('textColor').value=l.color;$('textSize').value=l.fontSize;}
}
function resizeCanvas(value){const [w,h]=value.split('x').map(Number);if(!w||!h)return;const sx=w/state.width,sy=h/state.height;state.layers.forEach(l=>{l.x*=sx;l.y*=sy;l.w*=sx;l.h*=sy;if(l.baseW)l.baseW*=sx;if(l.baseH)l.baseH*=sy;if(l.type==='text')l.fontSize*=Math.min(sx,sy);});state.width=w;state.height=h;zoomFactor=1;syncAll();checkpoint();notify(`Đã chọn canvas ${w} × ${h}`);}
function changeLayerOrder(direction){const i=state.layers.findIndex(l=>l.id===state.selectedId);const j=i+direction;if(i<0||j<0||j>=state.layers.length)return;[state.layers[i],state.layers[j]]=[state.layers[j],state.layers[i]];syncLayers();render();checkpoint();}
function deleteLayer(){if(!state.selectedId)return;state.layers=state.layers.filter(l=>l.id!==state.selectedId);state.selectedId=state.layers.at(-1)?.id||null;syncAll();checkpoint();notify('Đã xóa layer');}
function duplicateLayer(){const l=activeLayer();if(!l)return;const copy={...l,id:makeId(),name:l.name+' (bản sao)',x:l.x+35,y:l.y+35};state.layers.push(copy);state.selectedId=copy.id;syncAll();checkpoint();notify('Đã nhân bản');}
function downloadFile(data,filename){const a=document.createElement('a');a.href=data;a.download=filename;document.body.appendChild(a);a.click();a.remove();if(data.startsWith('blob:'))setTimeout(()=>URL.revokeObjectURL(data),20000);}
function exportImage(){const format=$('exportFormat').value, mime=format==='jpeg'?'image/jpeg':`image/${format}`;let source=canvas;if(format==='jpeg'){const temp=document.createElement('canvas');temp.width=state.width;temp.height=state.height;const c=temp.getContext('2d');c.fillStyle='#fff';c.fillRect(0,0,temp.width,temp.height);c.drawImage(canvas,0,0);source=temp;}source.toBlob(b=>{if(!b)return notify('Không thể xuất ảnh',true);downloadFile(URL.createObjectURL(b),`${safeFile(state.projectName)}.${format==='jpeg'?'jpg':format}`);notify(`Đã xuất ảnh ${state.width}×${state.height}`);},mime,.94);}
function safeFile(value){return (value||'product-studio').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9-_]+/ig,'-').replace(/^-|-$/g,'').slice(0,60)||'product-studio';}
function saveProject(){state.projectName=$('projectName').textContent.trim()||'Dự án sản phẩm';const payload={type:'FNB_PRODUCT_STUDIO',version:1,savedAt:new Date().toISOString(),document:JSON.parse(snap())};downloadFile('data:application/json;charset=utf-8,'+encodeURIComponent(JSON.stringify(payload)),`${safeFile(state.projectName)}.studio.json`);notify('Đã lưu dự án .studio.json');}
async function loadProject(file){try{const text=await file.text(),json=JSON.parse(text);if(json.type!=='FNB_PRODUCT_STUDIO'||!json.document)throw Error('Không phải định dạng dự án Studio');restore(JSON.stringify(json.document));history=[];redoStack=[];checkpoint();notify('Đã mở dự án');}catch(e){notify('Không mở được dự án: '+e.message,true);}}
function resetAdjust(){const l=activeLayer();if(!l||l.type!=='image')return;slidersSpec.forEach(s=>l[s.key]=s.default);syncInspector();render();checkpoint();notify('Đã đặt lại bộ lọc');}
async function detectAI(){try{const c=new AbortController();const timeout=setTimeout(()=>c.abort(),1600);const response=await fetch(DEFAULT_API+'/api/health',{signal:c.signal});clearTimeout(timeout);if(!response.ok)throw Error('API không sẵn sàng');$('aiStatus').textContent='Đã kết nối';$('aiStatus').classList.add('connected');}catch{$('aiStatus').textContent='Chưa kết nối';$('aiStatus').classList.remove('connected');}}
async function removeBackground(){const layer=activeLayer();if(!layer||layer.type!=='image'){notify('Hãy chọn một layer ảnh trước',true);return;}
 const b=$('btnRemoveBg'),oldText=b.querySelector('strong').textContent;b.disabled=true;b.querySelector('strong').textContent='Đang tách nền...';notify('Đang xử lý ảnh trên máy, lần đầu có thể cần tải model AI');
 try{const blob=await(await fetch(layer.src)).blob();const fd=new FormData();fd.append('file',new File([blob],'product.png',{type:blob.type||'image/png'}));const r=await fetch(DEFAULT_API+'/api/remove-background',{method:'POST',body:fd});if(!r.ok){const message=await r.text();throw Error(message.slice(0,250));}const out=await r.blob();layer.src=await readAsDataURL(out);layer.name=layer.name.replace(/\s*\[đã tách nền\]$/,'')+' [đã tách nền]';syncAll();checkpoint();notify('Đã tách nền AI, có thể thay nền và ghép layer');
 }catch(e){notify('Tách nền chưa hoạt động. Hãy chạy Python backend theo README.',true);console.warn(e);}finally{b.disabled=false;b.querySelector('strong').textContent=oldText;detectAI();}}
function initEvents(){
 $('btnAddPhoto').onclick=$('btnEmptyAdd').onclick=()=>$('photoInput').click();$('photoInput').onchange=e=>addPhotoFiles(e.target.files).catch(err=>notify(err.message,true));
 $('btnAddBackground').onclick=()=>$('bgInput').click();$('bgInput').onchange=e=>addBgFile(e.target.files[0]).catch(err=>notify(err.message,true));
 $('btnDemo').onclick=async()=>{try{const response=await fetch('assets/demo-binh-giu-nhiet.jpeg');if(!response.ok)throw Error('Không tải được ảnh mẫu');const src=await readAsDataURL(await response.blob());await addImage(src,'Bình giữ nhiệt • Demo');notify('Đã tải ảnh bình giữ nhiệt');}catch{notify('Mở bằng localhost để sử dụng ảnh demo, hoặc tải ảnh từ máy.',true);}};
 $('btnAddText').onclick=addText;$('btnUndo').onclick=undo;$('btnRedo').onclick=redo;$('btnSave').onclick=saveProject;$('btnExport').onclick=$('btnExportAside').onclick=exportImage;
 $('btnOpenProject').onclick=()=>$('openProjectInput').click();$('openProjectInput').onchange=e=>{if(e.target.files[0])loadProject(e.target.files[0]);};
 $('btnRemoveBg').onclick=removeBackground;$('btnResetAdjust').onclick=resetAdjust;$('btnDuplicate').onclick=duplicateLayer;
 $('btnLayerUp').onclick=()=>changeLayerOrder(1);$('btnLayerDown').onclick=()=>changeLayerOrder(-1);$('btnDeleteLayer').onclick=deleteLayer;
 $('btnCompare').onclick=()=>{state.compare=!state.compare;$('btnCompare').classList.toggle('active',state.compare);render();};
 $('sizePreset').onchange=e=>resizeCanvas(e.target.value);
 $('btnFit').onclick=()=>{zoomFactor=1;fitStage();};$('btnZoomIn').onclick=()=>{zoomFactor=Math.min(3,zoomFactor*1.25);applyZoom();};$('btnZoomOut').onclick=()=>{zoomFactor=Math.max(.3,zoomFactor/1.25);applyZoom();};
 $('scaleRange').addEventListener('input',e=>{const l=activeLayer();if(!l||l.type!=='image')return;const cx=l.x+l.w/2,cy=l.y+l.h/2,factor=Number(e.target.value)/100;l.w=l.baseW*factor;l.h=l.baseH*factor;l.x=cx-l.w/2;l.y=cy-l.h/2;$('scaleValue').textContent=e.target.value+'%';render();});$('scaleRange').addEventListener('change',checkpoint);
 $('rotateRange').addEventListener('input',e=>{const l=activeLayer();if(!l)return;l.rotation=Number(e.target.value);$('rotateValue').textContent=l.rotation+'°';render();});$('rotateRange').addEventListener('change',checkpoint);
 $('shadowToggle').addEventListener('change',e=>{const l=activeLayer();if(!l)return;l.shadow=e.target.checked;render();checkpoint();});
 $('textContent').addEventListener('input',e=>{const l=activeLayer();if(!l||l.type!=='text')return;l.text=e.target.value;l.name=e.target.value.slice(0,22)||'Chữ';render();syncLayers();});$('textContent').addEventListener('change',checkpoint);
 $('textColor').addEventListener('input',e=>{const l=activeLayer();if(!l||l.type!=='text')return;l.color=e.target.value;render();});$('textColor').addEventListener('change',checkpoint);
 $('textSize').addEventListener('input',e=>{const l=activeLayer();if(!l||l.type!=='text')return;l.fontSize=Number(e.target.value);render();});$('textSize').addEventListener('change',checkpoint);
 $('projectName').addEventListener('blur',()=>{state.projectName=$('projectName').textContent.trim()||'Dự án mới';checkpoint();});
 overlay.addEventListener('pointerdown',onPointerDown);overlay.addEventListener('pointermove',onPointerMove);overlay.addEventListener('pointerup',onPointerUp);overlay.addEventListener('pointercancel',onPointerUp);
 const stage=$('stageWrap');stage.addEventListener('dragover',e=>{e.preventDefault();stage.classList.add('drag-over');});stage.addEventListener('dragleave',()=>stage.classList.remove('drag-over'));stage.addEventListener('drop',e=>{e.preventDefault();stage.classList.remove('drag-over');addPhotoFiles(e.dataTransfer.files).catch(err=>notify(err.message,true));});
 document.addEventListener('keydown',e=>{const tag=document.activeElement?.tagName;const editing=tag==='INPUT'||tag==='TEXTAREA'||tag==='SELECT'||document.activeElement?.isContentEditable;if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'){e.preventDefault();if(e.shiftKey)redo();else undo();return;}if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='y'){e.preventDefault();redo();return;}if(editing)return;if(e.key==='Delete'||e.key==='Backspace'){deleteLayer();e.preventDefault();}const l=activeLayer();if(l&&['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key)){const step=e.shiftKey?10:1;if(e.key==='ArrowLeft')l.x-=step;if(e.key==='ArrowRight')l.x+=step;if(e.key==='ArrowUp')l.y-=step;if(e.key==='ArrowDown')l.y+=step;render();checkpoint();e.preventDefault();}});
 new ResizeObserver(()=>fitStage()).observe(stage);
}
initSliders();initEvents();syncAll();checkpoint();detectAI();
})();
