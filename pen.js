import * as THREE from './vendor/three.module.js';

// This second Three.js layer keeps the real HTML caret and the modeled nib in
// the same screen coordinate system. It does not replace the editable text.
const scene = new THREE.Scene();
const camera = new THREE.OrthographicCamera(-innerWidth/2,innerWidth/2,innerHeight/2,-innerHeight/2,.1,100);
camera.position.z=10;
const canvas=document.createElement('canvas');canvas.id='pen-layer';canvas.setAttribute('aria-hidden','true');document.body.append(canvas);
const renderer=new THREE.WebGLRenderer({canvas,alpha:true,antialias:true,powerPreference:'low-power'});
renderer.outputColorSpace=THREE.SRGBColorSpace;
renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));
const cream=new THREE.MeshStandardMaterial({color:'#e5cf9c',side:THREE.DoubleSide,roughness:.88});
const shadow=new THREE.MeshStandardMaterial({color:'#a78861',side:THREE.DoubleSide,roughness:.89});
const shaft=new THREE.MeshStandardMaterial({color:'#d9bd86',roughness:.58});
const nibMat=new THREE.MeshStandardMaterial({color:'#3b3027',metalness:.44,roughness:.32});
const quill=new THREE.Group();scene.add(quill);
function stick(x1,y1,x2,y2,r,material){const a=new THREE.Vector3(x1,y1,0),b=new THREE.Vector3(x2,y2,0),delta=b.clone().sub(a);const m=new THREE.Mesh(new THREE.CylinderGeometry(r*.67,r,delta.length(),8),material);m.position.copy(a.add(b).multiplyScalar(.5));m.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),delta.normalize());quill.add(m);return m;}
stick(0,0,91,120,2.6,shaft);
for(const side of [-1,1]){
  const shape=new THREE.Shape();shape.moveTo(29,39);shape.bezierCurveTo(31+side*17,69,72+side*25,116,91,136);shape.bezierCurveTo(93+side*13,109,65+side*22,61,29,39);
  const vane=new THREE.Mesh(new THREE.ShapeGeometry(shape),side===1?cream:shadow);vane.position.z=side*.3;quill.add(vane);
  for(let i=0;i<15;i++){const t=i/15;const x=34+t*55,y=48+t*78;stick(x,y,x+side*(10+13*Math.sin(t*Math.PI)),y+2,0.42,side===1?shadow:cream);}
}
const nib=new THREE.Mesh(new THREE.ConeGeometry(3.1,23,8),nibMat);nib.rotation.z=Math.PI;nib.position.set(0,-11,1);quill.add(nib);
stick(0,-22,0,-4,.45,nibMat);
scene.add(new THREE.AmbientLight('#fff0d4',1.8));const light=new THREE.DirectionalLight('#fff1d5',2);light.position.set(-1,2,4);scene.add(light);
let editor,active=false,mode='rest',target={x:0,y:0},current={x:0,y:0},last=0,lastInput=0,count=0,dipUntil=0,afterDip=null,writingUntil=0,onSound=()=>{},onInkChange=()=>{},getInkwell=()=>null,restPoint={x:0,y:0};
let dragId=null,dipStarted=0,wasDipped=false,inkLevel=.68,lastInkNotice=0,lastScratch=0,autoDipSounded=false;
export function getCurrentInkClass(){return `ink-${String(Math.round(200*Math.pow(inkLevel,.78))).padStart(3,'0')}`;}
function xy(x,y){return {x:x-innerWidth/2,y:innerHeight/2-y};}
function screen(point){return {x:point.x+innerWidth/2,y:innerHeight/2-point.y};}
function announceInk(now){if(now-lastInkNotice<150)return;lastInkNotice=now;const light=[139,137,133],dark=[18,19,20];const tone=Math.pow(inkLevel,.78);const color=`rgb(${light.map((value,i)=>Math.round(value+(dark[i]-value)*tone)).join(',')})`;onInkChange(color,inkLevel);}
function place(){const sheet=document.querySelector('.editor-wrap')?.getBoundingClientRect();if(!sheet)return;const scale=innerWidth<650?.78:.84;const x=THREE.MathUtils.clamp(sheet.right+24,22,innerWidth-106*scale);const y=THREE.MathUtils.clamp(sheet.top+Math.min(130,sheet.height*.32),100*scale,innerHeight-44);restPoint=xy(x,y);if(!active||mode==='rest')target={...restPoint};}
function caret(){const selection=getSelection();if(!selection?.rangeCount||!editor.contains(selection.anchorNode))return null;const range=selection.getRangeAt(0).cloneRange();range.collapse(true);let rect=range.getClientRects()[0];if(!rect){const node=editor.getBoundingClientRect();rect={left:node.left+8,top:node.top+12,height:24};}return xy(rect.left+2,rect.top+rect.height*.72);}
function resize(){camera.left=-innerWidth/2;camera.right=innerWidth/2;camera.top=innerHeight/2;camera.bottom=-innerHeight/2;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight,false);place();if(active&&mode==='writing'){const at=caret();if(at)target=at;}}
function tick(now){requestAnimationFrame(tick);const dt=Math.min(50,now-last||16);last=now;if(!active)return;
  if(mode==='rest')place();
  if(mode==='drag'&&dipStarted){inkLevel=Math.min(1,.24+.76*(1-Math.exp(-(now-dipStarted)/1400)));announceInk(now);}
  else if(mode!=='dip'&&mode!=='writing'){inkLevel=Math.max(0,inkLevel*Math.exp(-dt/95000));announceInk(now);}
  if(mode==='writing'&&now>writingUntil){mode='rest';target={...restPoint};onSound('pen_lift');}
  if(mode==='dip'&&!autoDipSounded&&Math.hypot(target.x-current.x,target.y-current.y)<16){autoDipSounded=true;onSound('ink_dip');}
  if(mode==='dip'&&now>dipUntil){mode='writing';target=afterDip||restPoint;writingUntil=now+900;inkLevel=Math.max(inkLevel,.62);announceInk(now+200);onSound('ink_lift');}
  const ease=1-Math.exp(-dt*(mode==='drag'?.075:mode==='writing'?.014:.009));current.x+=(target.x-current.x)*ease;current.y+=(target.y-current.y)*ease;
  if(mode==='writing'&&Math.hypot(target.x-current.x,target.y-current.y)>2&&now-lastScratch>85){lastScratch=now;onSound('scratch');}
  quill.position.set(current.x,current.y+(mode==='dip'?8:mode==='rest'?4:Math.sin(now*.025)*1.2),0);
  quill.rotation.z+=((mode==='drag'?.14:mode==='writing'?-.055+Math.sin(now*.02)*.012:.04)-quill.rotation.z)*Math.min(1,dt*.01);
  quill.scale.setScalar(innerWidth<650?.78:.84);
  renderer.render(scene,camera);
}
resize();requestAnimationFrame(tick);window.addEventListener('resize',resize);window.visualViewport?.addEventListener('resize',resize);window.addEventListener('scroll',()=>{place();if(mode==='writing'){const at=caret();if(at)target=at;}},{passive:true});
document.addEventListener('selectionchange',()=>{if(!active||mode==='dip')return;const at=caret();if(at&&mode==='writing')target=at;});
export function initPen(element,sound,inkChange,inkwell){editor=element;onSound=sound;onInkChange=inkChange;getInkwell=inkwell;place();announceInk(performance.now()+200);}
export function penEnter(){active=true;canvas.classList.add('active');place();current={...restPoint};mode='rest';}
export function penLeave(){active=false;canvas.classList.remove('active');mode='rest';dragId=null;dipStarted=0;}
export function penInput(event){if(!active)return;const at=caret();if(!at)return;const now=performance.now();const before=target;afterDip=at;count+=event?.data?.length||1;
  if(count>=110){count=0;mode='dip';const well=getInkwell();if(well){target=xy(well.x,well.y);dipUntil=now+850;autoDipSounded=false;return;}}
  mode='writing';target=at;writingUntil=now+1300;
  inkLevel=Math.max(0,inkLevel-.004*(event?.data?.length||1));announceInk(now);
  if(Math.abs(before.y-at.y)>18)onSound('new_line');
  lastInput=now;
}
export function penTouch(){if(!active)return;const at=caret();if(at){mode='writing';target=at;writingUntil=performance.now()+700;onSound('pen_touch');}}
document.addEventListener('pointerdown',event=>{if(!active||dragId!==null)return;const point=screen(current);const feather={x:point.x+45*(innerWidth<650?.78:.84),y:point.y-68*(innerWidth<650?.78:.84)};if(Math.hypot(event.clientX-feather.x,event.clientY-feather.y)>55)return;event.preventDefault();event.stopPropagation();dragId=event.pointerId;mode='drag';target=xy(event.clientX,event.clientY);wasDipped=false;dipStarted=0;document.documentElement.style.touchAction='none';},{capture:true,passive:false});
document.addEventListener('pointermove',event=>{if(dragId!==event.pointerId)return;event.preventDefault();target=xy(event.clientX,event.clientY);const well=getInkwell();const inWell=well&&Math.hypot(event.clientX-well.x,event.clientY-well.y)<48;if(inWell){if(!dipStarted){dipStarted=performance.now();wasDipped=true;onSound('ink_dip');}}else if(dipStarted){dipStarted=0;onSound('ink_lift');}},{passive:false});
function endDrag(event){if(dragId!==event.pointerId)return;event.preventDefault();dragId=null;document.documentElement.style.touchAction='';if(dipStarted){dipStarted=0;onSound('ink_lift');}if(wasDipped)announceInk(performance.now()+200);mode='rest';place();onSound('pen_lift');}
document.addEventListener('pointerup',endDrag,{passive:false});document.addEventListener('pointercancel',endDrag,{passive:false});
