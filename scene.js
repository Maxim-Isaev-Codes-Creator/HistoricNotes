import * as THREE from './vendor/three.module.js';
import { RoundedBoxGeometry } from './vendor/RoundedBoxGeometry.js';
import { nearbyPages, romanPage } from './pages.js';

const legacyIds=['letters','chronicles','records','manuscripts','thoughts','archive'];
const bureauPlaces=[
  ...Array.from({length:6},(_,i)=>({x:-2.46+(i%2)*1.26,y:3.76-Math.floor(i/2)*.82,w:1.18,h:.7,kind:'shelf'})),
  ...Array.from({length:6},(_,i)=>({x:2.42,y:3.88-i*.48,w:.9,h:.43,kind:'small'})),
  ...Array.from({length:8},(_,i)=>({x:-2.85+(i%4)*1.9,y:.91-Math.floor(i/4)*.63,w:1.78,h:.56,kind:'large'}))
];
const compartments=[...bureauPlaces.map((place,index)=>({id:legacyIds[index]||`drawer-${index+1}`,name:'',...place})),{id:'diary',name:'Дневник',kind:'desk',x:-3.15,y:-.055},{id:'journal',name:'Журнал',kind:'desk',x:3.15,y:-.055}];
export { compartments };

const canvas = document.querySelector('#world');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'low-power' });
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.34;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const scene = new THREE.Scene();
scene.background = new THREE.Color('#211a15');
scene.fog = new THREE.Fog('#211a15', 38, 65);
const camera = new THREE.PerspectiveCamera(49, 1, .1, 50);
camera.position.set(0, 2.05, 11.9);
camera.lookAt(.35, 1.85, 0);
const cabinet = new THREE.Group();
const desk = new THREE.Group();
const fireplace = new THREE.Group();
scene.add(cabinet, desk, fireplace);
desk.visible = false;
const interactive = [];
const sheetHits = [];
const deskDrawerHits=[];
const deskDrawers=[];
const bureauDoors=[];
let doorsClosed=false;
const drawers = new Map();
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
let onCompartment = () => {};
let onSheet = () => {};
let openDrawerId = null;
let targetPosition = camera.position.clone();
let targetLook = new THREE.Vector3(.35, 1.85, 0);
let basePosition=targetPosition.clone(),baseLook=targetLook.clone(),viewZoom=1,viewYaw=0,viewPitch=0,gestureMoved=false,dragDocument=null;
const pointers=new Map();let pointerStart=null,pinchDistance=0;
let currentLook = targetLook.clone();
let animate = true;
let speed = .055;
let slideDuration = 780;
let lastFrame = 0;
let soundEnabled = false;
let inkOpen=false,stampProgress=0,stampActive=false,stampResolve=null,stampContact=false;
let paperFolded=false,foldGroup=null,foldTop=null,foldTarget=0;
let deskFolderTarget=0,deskFolderOpen=false;
let bundlePageCount=1,cordInFlight=false,cordWrapProgress=1;
let deskZoom=1;
let writingView=false;
let roomWalking=false;
const walkKeys=new Set();
let walkStick=null,mouseWalk=false,mouseWalkTimer=null;
let hasFocused=false;
let lastMobileLayout=innerWidth<650;
let fullViewportWidth=innerWidth,fullViewportHeight=innerHeight;
let burning=null;
let heldBundle=null;
export function setCarriedBundle(visible){if(heldBundle)heldBundle.visible=Boolean(visible);}
const cordRestPosition=()=>new THREE.Vector3(innerWidth<650?-2.25:-3.35,.465,innerWidth<650?2.20:1.45);
function updateViewTarget(){if(roomWalking){const direction=baseLook.clone().sub(basePosition).normalize();direction.applyAxisAngle(new THREE.Vector3(0,1,0),viewYaw);direction.y=THREE.MathUtils.clamp(direction.y-viewPitch,-.75,.48);targetPosition.copy(basePosition);targetLook.copy(basePosition).add(direction.multiplyScalar(10));camera.zoom=innerWidth<650?THREE.MathUtils.clamp(.82/viewZoom,.55,1.5):THREE.MathUtils.clamp(1/viewZoom,.75,1.45);camera.updateProjectionMatrix();return;}const offset=basePosition.clone().sub(baseLook);const orbit=new THREE.Spherical().setFromVector3(offset);orbit.theta+=viewYaw;orbit.phi=THREE.MathUtils.clamp(orbit.phi+viewPitch,.28,Math.PI-.28);orbit.radius*=viewZoom;targetPosition.copy(baseLook).add(new THREE.Vector3().setFromSpherical(orbit));targetLook.copy(baseLook);if(!writingView){targetPosition.x=THREE.MathUtils.clamp(targetPosition.x,-6.35,6.35);targetPosition.y=THREE.MathUtils.clamp(targetPosition.y,1.35,4.8);targetPosition.z=THREE.MathUtils.clamp(targetPosition.z,-3.25,6.15);camera.zoom=innerWidth<650?THREE.MathUtils.clamp(.82/viewZoom,.55,1.5):1;camera.updateProjectionMatrix();}}
function setBaseView(position,look){basePosition.copy(position);baseLook.copy(look);viewZoom=1;viewYaw=0;viewPitch=0;updateViewTarget();}
function walkRoom(forward,strafe,delta){if(!roomWalking||writingView)return;const baseDirection=baseLook.clone().sub(basePosition);const angle=Math.atan2(baseDirection.x,-baseDirection.z)-viewYaw;const step=Math.min(delta,.05)*2.8;const dx=(Math.sin(angle)*forward+Math.cos(angle)*strafe)*step,dz=(-Math.cos(angle)*forward+Math.sin(angle)*strafe)*step;const x=THREE.MathUtils.clamp(basePosition.x+dx,-6.45,6.45),z=THREE.MathUtils.clamp(basePosition.z+dz,-3.25,6.2);const deskCollision=Math.abs(x)<3.65&&z>-.9&&z<3.55;const bureauCollision=x>4.55&&z>-1.9&&z<4.0;const fireplaceCollision=x<-4.45&&z>-.9&&z<2.9;if(deskCollision||bureauCollision||fireplaceCollision)return;basePosition.x=x;basePosition.z=z;baseLook.x+=dx;baseLook.z+=dz;updateViewTarget();if(heldBundle?.visible&&Math.abs(x)<1.25&&z>3.55&&z<5.45)onCompartment(null,'sit');}
export function isNearBureau(){return basePosition.x>3.35&&basePosition.z>-2.2&&basePosition.z<4.4;}
function isNearDesk(){return Math.abs(basePosition.x)<4.7&&basePosition.z<5.6&&basePosition.z>3.4;}
function slideDrawer(id){openDrawerId=id;const now=performance.now();for(const [drawerId,drawer] of drawers){drawer.userData.slide={from:drawer.position.z,to:drawerId===id&&drawer.userData.kind!=='shelf'?2.15:0,start:now};}}

function grainTexture(base, accent, seed = 1) {
  const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = 512;
  const ctx = canvas.getContext('2d'); ctx.fillStyle = base; ctx.fillRect(0,0,512,512);
  let n = seed; const random = () => ((n = (n * 1664525 + 1013904223) >>> 0) / 4294967296);
  for(let x=0;x<512;x+=2){const band=Math.sin(x*.028+seed)*.055+Math.sin(x*.103+seed*2)*.025+(random()-.5)*.06;ctx.fillStyle=`rgba(${accent},${Math.max(.01,.12+band)})`;ctx.fillRect(x,0,1+random()*3,512);}
  for (let i=0;i<1250;i++) {
    const x = random()*512, y = random()*512, length = 35+random()*500;
    ctx.beginPath(); ctx.moveTo(x,y); ctx.bezierCurveTo(x+4,y+length*.3,x-5,y+length*.6,x+random()*8-4,y+length);
    ctx.strokeStyle = `rgba(${accent},${.015+random()*.09})`; ctx.lineWidth = .25+random()*2.4; ctx.stroke();
  }
  for(let i=0;i<20;i++){ const x=random()*512,y=random()*512; ctx.strokeStyle=`rgba(${accent},.14)`;ctx.lineWidth=.7;ctx.beginPath();ctx.ellipse(x,y,2+random()*8,12+random()*35,0,0,Math.PI*2);ctx.stroke(); }
  for(let i=0;i<90;i++){const x=random()*512,y=random()*512;ctx.strokeStyle=`rgba(238,201,145,${.025+random()*.065})`;ctx.lineWidth=.3+random()*.8;ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+random()*3-1.5,y+10+random()*90);ctx.stroke();}
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace; texture.wrapS = texture.wrapT = THREE.RepeatWrapping; texture.anisotropy = Math.min(renderer.capabilities.getMaxAnisotropy(), 8); return texture;
}
const walnutMap = grainTexture('#86573a','27,12,6',4);
const horizontalMap = walnutMap.clone();horizontalMap.center.set(.5,.5);horizontalMap.rotation=Math.PI/2;horizontalMap.needsUpdate=true;
const oakMap = grainTexture('#825235','20,10,4',12);
const floorMap = grainTexture('#4a3022','15,7,3',22); floorMap.repeat.set(4,4);
const walnut = new THREE.MeshStandardMaterial({ map: walnutMap, bumpMap:walnutMap,bumpScale:.075,color: '#c9a18a', roughness: .53, metalness: .02 });
const drawerWoods=['#b58b71','#c9a18a','#d5a17e','#b99479'].map(color=>new THREE.MeshStandardMaterial({map:walnutMap,bumpMap:walnutMap,bumpScale:.065,color,roughness:.52,metalness:.02}));
const walnutEdge = new THREE.MeshStandardMaterial({ map: walnutMap,bumpMap:walnutMap,bumpScale:.025,color: '#e0b695', roughness: .58 });
const walnutCross = new THREE.MeshStandardMaterial({ map: horizontalMap,bumpMap:horizontalMap,bumpScale:.025,color: '#d3a588', roughness: .59 });
const oak = new THREE.MeshStandardMaterial({ map: oakMap, color: '#cfaa87', roughness: .68 });
const floorWood = new THREE.MeshStandardMaterial({ map: floorMap, color: '#a5866c', roughness: .83 });
const brass = new THREE.MeshStandardMaterial({ color: '#b4945d', metalness: .78, roughness: .28 });
const agedBrass = new THREE.MeshStandardMaterial({ color: '#785d38', metalness: .67, roughness: .43 });
const dark = new THREE.MeshStandardMaterial({ color: '#1c100b', roughness: .95 });
const velvet = new THREE.MeshStandardMaterial({ color: '#382b2a', roughness: .94 });
const plaster = new THREE.MeshStandardMaterial({ color: '#6d5a4a', roughness: .98 });
function kraftTexture(){const canvas=document.createElement('canvas');canvas.width=512;canvas.height=512;const ctx=canvas.getContext('2d');ctx.fillStyle='#ad9575';ctx.fillRect(0,0,512,512);let seed=193;const random=()=>((seed=(seed*1664525+1013904223)>>>0)/4294967296);for(let i=0;i<18000;i++){const x=random()*512,y=random()*512;ctx.fillStyle=random()>.5?'#e1cba7':'#795e43';ctx.globalAlpha=.02+random()*.09;ctx.fillRect(x,y,1+random()*3,1+random()*9)}ctx.globalAlpha=1;for(let i=0;i<14;i++){ctx.strokeStyle=`rgba(80,56,35,${.04+random()*.1})`;ctx.lineWidth=1+random()*3;ctx.beginPath();ctx.ellipse(random()*512,random()*512,7+random()*30,3+random()*13,random()*3,0,Math.PI*2);ctx.stroke()}const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;texture.anisotropy=8;return texture;}
const kraftMap=kraftTexture();
const folderBoard = new THREE.MeshStandardMaterial({map:kraftMap,bumpMap:kraftMap,color:'#ddd1b8',roughness:.94,bumpScale:.03,side:THREE.DoubleSide});
const folderFlap = new THREE.MeshStandardMaterial({map:kraftMap,color:'#c7b397',roughness:.96,side:THREE.DoubleSide});
const cord = new THREE.MeshStandardMaterial({color:'#ac8752',roughness:.84});
const leather = ['#39251c','#533126','#3e3528','#493323'].map(color => new THREE.MeshStandardMaterial({ color, roughness: .86 }));
const paper = new THREE.MeshStandardMaterial({ color: '#b99561', roughness: .82 });
const leafPaper = new THREE.MeshStandardMaterial({color:'#dfcaa2',roughness:.93,side:THREE.DoubleSide});
const bundlePaper = new THREE.MeshStandardMaterial({map:kraftMap,bumpMap:kraftMap,bumpScale:.008,color:'#f3e5ca',roughness:.97,side:THREE.DoubleSide});

function bevel(parent,w,h,d,x,y,z,material,r=.035) {
  const mesh = new THREE.Mesh(new RoundedBoxGeometry(w,h,d,3,Math.min(r,w*.2,h*.2,d*.2)),material);
  mesh.position.set(x,y,z); mesh.castShadow=true; mesh.receiveShadow=true; parent.add(mesh); return mesh;
}
function envelopeFlap(parent,w,d,x,y,z){const shape=new THREE.Shape();shape.moveTo(-w/2,-d/2);shape.lineTo(w/2,-d/2);shape.lineTo(0,d*.38);shape.closePath();const flap=new THREE.Mesh(new THREE.ShapeGeometry(shape),folderFlap);flap.rotation.x=-Math.PI/2;flap.position.set(x,y,z);flap.castShadow=true;flap.receiveShadow=true;parent.add(flap);return flap;}
function rod(parent, radius, length, x,y,z, material, axis='x') {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius,radius,length,12),material);
  if(axis==='x') mesh.rotation.z=Math.PI/2; if(axis==='z') mesh.rotation.x=Math.PI/2;
  mesh.position.set(x,y,z);mesh.castShadow=true;parent.add(mesh);return mesh;
}
function frame(parent,x,y,w,h,z,thickness,material) {
  bevel(parent,w,thickness,.095,x,y+h/2,z,material,.025); bevel(parent,w,thickness,.095,x,y-h/2,z,material,.025);
  bevel(parent,thickness,h,.095,x-w/2,y,z,material,.025); bevel(parent,thickness,h,.095,x+w/2,y,z,material,.025);
}
function carvedRosette(parent,x,y,z,scale=1) {
  const center = new THREE.Mesh(new THREE.SphereGeometry(.075*scale,12,8),brass);center.position.set(x,y,z);parent.add(center);
  for(let i=0;i<8;i++){const angle=i*Math.PI/4;const petal=new THREE.Mesh(new THREE.SphereGeometry(.045*scale,8,6),walnutEdge);petal.scale.set(1.9,.8,.38);petal.rotation.z=angle;petal.position.set(x+Math.cos(angle)*.11*scale,y+Math.sin(angle)*.11*scale,z-.012);parent.add(petal);}
}

function box(parent, w, h, d, x, y, z, material, shadow = true) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  mesh.position.set(x, y, z);
  mesh.castShadow = shadow;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}
function sphere(parent, r, x, y, z, material) {
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(r, 12, 8), material);
  mesh.position.set(x, y, z); parent.add(mesh); return mesh;
}

function buildRoom() {
  box(scene, 14, .24, 10.8, 0, -.5, 1.2, floorWood, false);
  for (let row=0;row<13;row++) for(let col=0;col<12;col++) {
    const x=(col-5.5)*1.15+(row%2)*.25,z=(row-6)*.83+1.2;
    const plank=box(scene,1.13,.012,.81,x,-.372,z,row%5===0?oak:floorWood,false);plank.receiveShadow=true;
  }
  box(scene,14,6.1,.2,0,2.55,-4.1,plaster,false);
  box(scene,14,6.1,.2,0,2.55,6.6,plaster,false);
  box(scene,.2,6.1,10.8,-7,2.55,1.2,plaster,false);
  box(scene,.2,6.1,10.8,7,2.55,1.2,plaster,false);
  const ceiling=box(scene,14,.16,10.8,0,5.65,1.2,plaster,false);ceiling.visible=false;scene.userData.ceiling=ceiling;
  for(const x of [-6.8,-3.4,0,3.4,6.8])bevel(scene,.16,.19,10.6,x,5.48,1.2,walnutCross,.025);
  for(const z of [-3.8,.4,4.6,6.4])bevel(scene,13.8,.15,.17,0,5.49,z,walnutEdge,.025);
  // The aged plaster stays visually quiet behind both pieces of furniture.
  const rug=new THREE.Mesh(new THREE.PlaneGeometry(6.3,4.1),velvet);rug.rotation.x=-Math.PI/2;rug.position.set(0,-.356,3.2);rug.receiveShadow=true;scene.add(rug);
  for(let i=-1;i<=1;i++) { bevel(scene,6.2,.018,.035,0,-.34,3.2+i*1.8,agedBrass,.008); }
  buildFireplace();
  buildStudyDetails();
  const ambient = new THREE.AmbientLight('#dbc5aa', 1.05); scene.add(ambient);
  const key = new THREE.DirectionalLight('#ffdcab', 2.65); key.position.set(-5, 7, 5); key.castShadow = true; key.shadow.mapSize.set(2048, 2048); key.shadow.bias=-.0003; key.shadow.radius=2; key.shadow.camera.left = -8; key.shadow.camera.right = 8; key.shadow.camera.top = 8; key.shadow.camera.bottom = -8; scene.add(key);
  const fill = new THREE.PointLight('#efaa64', 19, 15, 2); fill.position.set(4, 3.7, 4); scene.add(fill);
  const windowLight = new THREE.PointLight('#c9d6d1', 14, 11, 2);windowLight.position.set(-2.65,3.5,-2);scene.add(windowLight);
  const shelfBounce=new THREE.PointLight('#ffd3a0',8,8,2);shelfBounce.position.set(-2.5,3.4,1.3);scene.add(shelfBounce);
  return { ambient, key, fill };
}
function buildFireplace(){
  fireplace.position.set(-5.55,0,1.0);
  fireplace.rotation.y=Math.PI/2;
  const marble=new THREE.MeshStandardMaterial({color:'#a78769',roughness:.77,metalness:.02});
  const stoneShade=new THREE.MeshStandardMaterial({color:'#6c5444',roughness:.9});
  const ember=new THREE.MeshStandardMaterial({color:'#c1501b',emissive:'#b33912',emissiveIntensity:1.8,roughness:.8});
  bevel(fireplace,3.15,.24,.73,0,-.19,.31,marble,.03);
  bevel(fireplace,3.28,.20,.78,0,2.20,.30,marble,.03);
  bevel(fireplace,3.56,.14,.94,0,2.39,.32,marble,.025);
  bevel(fireplace,3.68,.10,1.02,0,2.53,.31,agedBrass,.025);
  for(const side of [-1,1]){
    bevel(fireplace,.42,2.34,.52,side*1.34,.93,.22,marble,.04);
    for(const y of [-.03,.48,1.20,2.05])bevel(fireplace,.55,.085,.61,side*1.34,y,.28,stoneShade,.014);
    for(const y of [.30,1.62])carvedRosette(fireplace,side*1.34,y,.56,.55);
  }
  bevel(fireplace,2.37,1.88,.11,0,.86,-.02,dark,.05);
  const arch=new THREE.Mesh(new THREE.TorusGeometry(1.13,.15,12,40,Math.PI),marble);arch.position.set(0,1.59,.15);fireplace.add(arch);
  for(const side of [-1,1])bevel(fireplace,.24,1.38,.28,side*1.14,.59,.15,marble,.03);
  for(let i=0;i<8;i++){
    const x=-.83+(i%4)*.55,y=.15+Math.floor(i/4)*.5;
    bevel(fireplace,.51,.47,.05,x,y,-.03,i%2?stoneShade:plaster,.01);
  }
  for(let i=0;i<4;i++){
    const log=new THREE.Mesh(new THREE.CylinderGeometry(.13,.17,1.5,12),i%2?oak:walnut);log.rotation.z=Math.PI/2+(i%2?-.2:.2);log.rotation.y=i*.6;log.position.set((i-1.5)*.13,.03+i*.1,.43+i*.04);log.castShadow=true;fireplace.add(log);
    sphere(fireplace,.06,(i-1.5)*.29,.14+i*.09,.55,ember);
  }
  fireplace.userData.flames=[];
  for(let i=0;i<11;i++){
    const height=.48+(i%4)*.13;
    const contour=new THREE.Shape();contour.moveTo(-.15,0);contour.bezierCurveTo(-.28,height*.34,-.09,height*.53,.02,height);contour.bezierCurveTo(.12,height*.72,.30,height*.29,.15,0);contour.quadraticCurveTo(0,-.08,-.15,0);
    const outer=new THREE.Mesh(new THREE.ShapeGeometry(contour,16),new THREE.MeshBasicMaterial({color:i%3===0?'#ffe29a':i%2?'#ec6929':'#ffad39',transparent:true,opacity:.58,depthWrite:false,side:THREE.DoubleSide}));
    outer.position.set(-.86+i*.17,.12+(i%3)*.03,.66+i*.008);outer.rotation.z=(i%2?1:-1)*.11;fireplace.add(outer);fireplace.userData.flames.push(outer);
  }
  const glow=new THREE.PointLight('#ff7627',4.8,5.5,2);glow.position.set(0,.84,.88);fireplace.add(glow);fireplace.userData.glow=glow;
  const burnMesh=new THREE.Group();burnMesh.position.set(0,.25,.69);burnMesh.visible=false;fireplace.add(burnMesh);fireplace.userData.burnMesh=burnMesh;
  bevel(burnMesh,.88,.07,.62,0,0,0,bundlePaper,.018);
  for(const x of [-.21,.21])rod(burnMesh,.01,.66,x,.045,0,cord,'z');
}
function buildStudyDetails(){
  // Carved wainscoting ties the fireplace and bureau to the same room.
  for(const x of [-6.8,-4.9,-3.0,-1.1,.8,2.7,4.6,6.5]){
    bevel(scene,1.86,1.18,.07,x,.28,-3.92,walnutEdge,.018);
    bevel(scene,1.65,.98,.08,x,.28,-3.86,walnut,.016);
    frame(scene,x,.28,1.75,1.05,-3.80,.035,agedBrass);
  }
  bevel(scene,13.8,.13,.18,0,.95,-3.79,walnutCross,.03);
  bevel(scene,13.8,.16,.18,0,-.36,-3.79,walnutCross,.025);
  const windowGroup=new THREE.Group();windowGroup.position.set(0,3.30,-3.73);windowGroup.scale.set(1.52,1.05,1);scene.add(windowGroup);
  const glass=new THREE.MeshStandardMaterial({color:'#b8c7bf',emissive:'#74918d',emissiveIntensity:.28,roughness:.22,transparent:true,opacity:.83,metalness:.09});
  bevel(windowGroup,2.42,3.06,.10,0,0,0,walnutEdge,.035);
  bevel(windowGroup,2.16,2.8,.02,0,0,.07,glass,.012);
  for(const x of [-.55,0,.55])bevel(windowGroup,.055,2.85,.13,x,0,.11,walnutCross,.015);
  for(const y of [-.93,0,.93])bevel(windowGroup,2.21,.055,.13,0,y,.11,walnutCross,.015);
  const lead=new THREE.MeshStandardMaterial({color:'#625e52',metalness:.6,roughness:.5});
  for(let panel=-1;panel<=1;panel++)for(const row of [-.93,0,.93]){
    for(const side of [-1,1]){
      const bar=rod(windowGroup,.010,1.04,panel*.55+side*.28,row,.19,lead,'y');bar.rotation.z=side*.54;
    }
  }
  const curtain=new THREE.MeshStandardMaterial({color:'#182334',roughness:.96,side:THREE.DoubleSide});
  for(const side of [-1,1]){
    const cloth=new THREE.Mesh(new THREE.PlaneGeometry(.66,3.35,5,14),curtain);const pos=cloth.geometry.attributes.position;
    for(let i=0;i<pos.count;i++){const x=pos.getX(i),y=pos.getY(i);pos.setZ(i,.10+Math.sin((x+.33)*20+y*.5)*.10);}pos.needsUpdate=true;cloth.geometry.computeVertexNormals();cloth.position.set(side*1.35,-.08,.18);cloth.rotation.y=side*.24;cloth.castShadow=true;windowGroup.add(cloth);
    rod(windowGroup,.023,.74,side*1.31,-.65,.34,brass,'x');
  }
  rod(windowGroup,.041,3.45,0,1.72,.20,agedBrass,'x');
  for(const x of [-1.53,1.53])sphere(windowGroup,.08,x,1.72,.20,brass);
  const mapCanvas=document.createElement('canvas');mapCanvas.width=768;mapCanvas.height=512;const m=mapCanvas.getContext('2d');m.fillStyle='#bca477';m.fillRect(0,0,768,512);
  m.strokeStyle='#6a5334';m.lineWidth=1.4;for(let x=30;x<768;x+=64){m.beginPath();m.moveTo(x,0);m.lineTo(x,512);m.stroke();}for(let y=20;y<512;y+=64){m.beginPath();m.moveTo(0,y);m.lineTo(768,y);m.stroke();}
  const lands=[[[100,90],[210,65],[260,135],[235,215],[200,230],[175,340],[115,270],[80,180]],[[380,90],[530,75],[615,125],[660,240],[590,285],[500,215],[435,310],[365,240]],[[325,345],[420,325],[470,385],[440,470],[350,455]]];
  m.fillStyle='#867448';m.strokeStyle='#4e472d';m.lineWidth=4;for(const land of lands){m.beginPath();land.forEach(([x,y],i)=>i?m.lineTo(x,y):m.moveTo(x,y));m.closePath();m.fill();m.stroke();}
  m.strokeStyle='#584a2d';m.lineWidth=2;for(let i=0;i<3;i++){m.beginPath();m.ellipse(380,255,245+i*50,80+i*49,-.08,0,Math.PI*2);m.stroke();}
  // The front wall is reserved for the window; the rear entrance is behind the visitor.
  const door=new THREE.Group();door.position.set(0,1.45,6.46);door.rotation.y=Math.PI;scene.add(door);
  bevel(door,1.95,3.55,.16,0,0,0,walnutEdge,.04);
  bevel(door,1.62,3.25,.12,0,0,.10,walnut,.025);
  for(const y of [-.77,.72]){bevel(door,1.36,1.32,.035,0,y,.18,walnutCross,.018);bevel(door,1.12,1.08,.035,0,y,.22,walnutEdge,.018);frame(door,0,y,1.28,1.24,.23,.025,agedBrass);}
  sphere(door,.065,.61,-.12,.25,brass);
  const paintingCanvas=document.createElement('canvas');paintingCanvas.width=512;paintingCanvas.height=420;const art=paintingCanvas.getContext('2d');
  const sky=art.createLinearGradient(0,0,0,420);sky.addColorStop(0,'#5d5541');sky.addColorStop(.55,'#ae8a5a');sky.addColorStop(1,'#332e23');art.fillStyle=sky;art.fillRect(0,0,512,420);
  for(let ridge=0;ridge<5;ridge++){art.fillStyle=['#9b815c','#79674d','#635540','#473e30','#292b24'][ridge];art.beginPath();art.moveTo(0,210+ridge*30);for(let x=0;x<=512;x+=18)art.lineTo(x,205+ridge*30+Math.sin(x*.012+ridge)*19+Math.sin(x*.035+ridge*3)*7);art.lineTo(512,420);art.lineTo(0,420);art.fill();}
  for(const x of [35,75,390,445,475]){art.strokeStyle='#26291f';art.lineWidth=5;art.beginPath();art.moveTo(x,400);art.lineTo(x+7,135+(x%3)*31);art.stroke();for(let i=0;i<7;i++){art.fillStyle=`rgba(27,35,24,${.45+i*.055})`;art.beginPath();art.ellipse(x+6+(i%3-1)*18,180+(i%4-2)*19,27,36,0,0,Math.PI*2);art.fill();}}
  const painting=new THREE.Group();painting.position.set(6.78,4.22,1.0);painting.rotation.y=-Math.PI/2;scene.add(painting);
  bevel(painting,2.64,1.90,.10,0,0,0,agedBrass,.035);bevel(painting,2.39,1.66,.02,0,0,.07,walnutEdge,.012);
  const picture=new THREE.Mesh(new THREE.PlaneGeometry(2.24,1.52),new THREE.MeshStandardMaterial({map:new THREE.CanvasTexture(paintingCanvas),roughness:.85}));picture.position.z=.09;painting.add(picture);frame(painting,0,0,2.55,1.82,.12,.075,brass);
  new THREE.TextureLoader().load('./painting-ruisdael-1646.jpg',texture=>{texture.colorSpace=THREE.SRGBColorSpace;picture.material.map=texture;picture.material.needsUpdate=true;});
  const chair=new THREE.Group();chair.position.set(0,-.35,4.75);scene.add(chair);
  const upholstery=new THREE.MeshStandardMaterial({color:'#52362a',roughness:.83});
  for(const x of [-.57,.57])for(const z of [-.51,.51]){bevel(chair,.15,1.10,.15,x,.53,z,walnut,.055);bevel(chair,.22,.12,.22,x,.02,z,walnutEdge,.025);}
  bevel(chair,1.40,.19,1.15,0,1.09,0,walnutEdge,.08);bevel(chair,1.22,.10,.99,0,1.22,0,upholstery,.065);
  for(const y of [1.65,2.25])bevel(chair,1.41,.17,.16,0,y,.55,walnutCross,.06);
  for(const x of [-.57,.57]){bevel(chair,.19,1.56,.20,x,1.77,.55,walnut,.07);carvedRosette(chair,x,2.54,.66,.65);}
  bevel(chair,1.17,.61,.07,0,1.93,.61,upholstery,.05);frame(chair,0,1.93,1.20,.66,.66,.045,agedBrass);
  for(const z of [-.51,.51])bevel(chair,1.16,.09,.12,0,.54,z,walnutCross,.025);
  chair.userData.writingChair=true;scene.userData.chair=chair;
  const seatHit=box(chair,1.46,2.65,1.28,0,1.34,.14,new THREE.MeshBasicMaterial({transparent:true,opacity:0,depthWrite:false}),false);seatHit.userData.writingChair=true;interactive.push(seatHit);
}
const lights = buildRoom();

function buildDesk() {
  desk.position.y=.55;
  desk.scale.set(.8,1,.88);
  bevel(desk,9.7,.28,4.65,0,.13,1.15,walnut,.06);
  for(const y of [-.06,.17,.31])bevel(desk,9.83-(y+.06)*.13,.055,4.8-(y+.06)*.13,0,y,1.15,y===.17?walnutEdge:walnutCross,.02);
  bevel(desk,9.35,.06,4.3,0,.36,1.15,walnut,.025);
  bevel(desk,5.85,.025,3.18,0,.402,1.22,leather[2],.025);
  // The writing leaf occupies the leather inset itself; its lower edge stays on the desk.
  const leaf=bevel(desk,1.80,.012,3.10,0,.433,1.22,leafPaper,.004);
  leaf.castShadow=true;leaf.receiveShadow=true;desk.userData.writingLeaf=leaf;
  const nextLeaf=bevel(desk,1.80,.01,3.10,.23,.426,1.31,bundlePaper,.003);nextLeaf.visible=false;desk.userData.nextLeaf=nextLeaf;
  for(const z of [-.42,2.86])bevel(desk,5.93,.014,.028,0,.421,z,agedBrass,.006);
  for(const x of [-2.97,2.97])bevel(desk,.028,.014,3.28,x,.421,1.22,agedBrass,.006);
  const legXs=[-4.25,4.25],legZs=[-.48,2.77];
  for(const x of legXs)for(const z of legZs){bevel(desk,.39,1.18,.41,x,-.34,z,walnut,.08);bevel(desk,.50,.075,.52,x,-.885,z,walnutEdge,.025);bevel(desk,.48,.075,.52,x,.19,z,walnutCross,.025);}
  for(const x of [-3.15,3.15]){
    const drawer=new THREE.Group();drawer.position.set(x,-.055,3.39);desk.add(drawer);drawer.userData.deskDrawer=x<0?'diary':'journal';deskDrawers.push(drawer);
    bevel(drawer,2.10,.28,1.10,0,0,-.45,walnut,.035);
    bevel(drawer,2.02,.27,.055,0,0,.10,walnutEdge,.025);frame(drawer,0,0,1.87,.22,.15,.025,agedBrass);
    const plaque=bevel(drawer,.78,.13,.018,0,.035,.14,agedBrass,.012);plaque.userData.deskDrawer=drawer.userData.deskDrawer;deskDrawerHits.push(plaque);
    const titleCanvas=document.createElement('canvas');titleCanvas.width=512;titleCanvas.height=96;const ctx=titleCanvas.getContext('2d');ctx.fillStyle='#dbbd85';ctx.fillRect(0,0,512,96);ctx.fillStyle='#28190e';ctx.textAlign='center';ctx.textBaseline='middle';ctx.font='bold 50px Georgia';ctx.fillText(x<0?'Дневник':'Журнал',256,50);
    const label=new THREE.Mesh(new THREE.PlaneGeometry(.70,.11),new THREE.MeshBasicMaterial({map:new THREE.CanvasTexture(titleCanvas)}));label.position.set(0,.035,.156);drawer.add(label);label.userData.deskDrawer=drawer.userData.deskDrawer;deskDrawerHits.push(label);
    const handle=new THREE.Mesh(new THREE.TorusGeometry(.07,.015,8,20),brass);handle.position.set(0,-.08,.19);drawer.add(handle);handle.userData.deskDrawer=drawer.userData.deskDrawer;deskDrawerHits.push(handle);
    const book=new THREE.Group();book.position.set(0,.13,-.45);drawer.add(book);
    bevel(book,.58,.11,.82,0,0,0,leafPaper,.02);bevel(book,.68,.14,.87,0,.015,0,x<0?leather[0]:leather[1],.03);bevel(book,.08,.145,.87,-.31,.017,0,walnutEdge,.025);
    for(const z of [-.28,.28])bevel(book,.56,.008,.025,0,.089,z,agedBrass,.004);
    for(const part of book.children){part.userData.deskDrawer=drawer.userData.deskDrawer;part.userData.deskBook=true;deskDrawerHits.push(part);}
  }
  bevel(desk,4.92,.24,.14,0,-.08,3.38,walnutCross,.025);
  for(const x of [-2.4,2.4])carvedRosette(desk,x,-.08,3.47,.55);
  // Inkwell: stepped glass body, ink surface, hinged brass lid, and pedestal.
  const ink=new THREE.Group();ink.position.set(3.25,.46,.08);desk.add(ink);desk.userData.ink=ink;
  bevel(ink,.58,.07,.58,0,0,0,agedBrass,.025);
  bevel(ink,.46,.34,.46,0,.21,0,new THREE.MeshStandardMaterial({color:'#171a1a',metalness:.23,roughness:.16,transparent:true,opacity:.91}),.06);
  bevel(ink,.48,.055,.48,0,.40,0,brass,.02);
  const inkSurface=new THREE.Mesh(new THREE.CircleGeometry(.15,24),new THREE.MeshStandardMaterial({color:'#060b0e',metalness:.33,roughness:.09}));inkSurface.rotation.x=-Math.PI/2;inkSurface.position.y=.43;ink.add(inkSurface);
  const lid=new THREE.Group();lid.position.set(0,.43,-.2);ink.add(lid);bevel(lid,.5,.035,.48,0,0,-.04,agedBrass,.02);sphere(lid,.055,0,.06,-.03,brass);desk.userData.inkLid=lid;
  const redInk=new THREE.Group();redInk.position.set(2.18,.46,-.08);desk.add(redInk);desk.userData.redInk=redInk;
  bevel(redInk,.48,.065,.48,0,0,0,agedBrass,.025);
  bevel(redInk,.39,.31,.39,0,.19,0,new THREE.MeshStandardMaterial({color:'#54201b',metalness:.18,roughness:.19,transparent:true,opacity:.94}),.055);
  bevel(redInk,.42,.045,.42,0,.36,0,brass,.018);
  const redSurface=new THREE.Mesh(new THREE.CircleGeometry(.13,24),new THREE.MeshStandardMaterial({color:'#670d14',metalness:.2,roughness:.14}));redSurface.rotation.x=-Math.PI/2;redSurface.position.y=.39;redInk.add(redSurface);
  const redLid=new THREE.Group();redLid.position.set(0,.39,-.16);redInk.add(redLid);bevel(redLid,.44,.032,.39,0,0,-.04,agedBrass,.018);sphere(redLid,.045,0,.04,-.03,brass);desk.userData.redInkLid=redLid;
  // Tall brass candle with wax drips and a small warm light.
  const cx=-3.44,cz=-.25,candleGroup=new THREE.Group();desk.add(candleGroup);desk.userData.candleGroup=candleGroup;
  for(const [radius,height,y] of [[.36,.055,.45],[.25,.06,.52],[.11,.36,.73],[.22,.045,.94]]){const part=new THREE.Mesh(new THREE.CylinderGeometry(radius,radius,height,24),brass);part.position.set(cx,y,cz);part.castShadow=true;candleGroup.add(part);}
  const candle=new THREE.Mesh(new THREE.CylinderGeometry(.125,.14,.62,24),new THREE.MeshStandardMaterial({color:'#d8b983',roughness:.87}));candle.position.set(cx,1.25,cz);candle.castShadow=true;candleGroup.add(candle);
  for(const [dx,len] of [[-.08,.16],[.06,.24],[.11,.11]]){const drip=new THREE.Mesh(new THREE.CylinderGeometry(.014,.019,len,8),paper);drip.position.set(cx+dx,1.36-len*.3,cz+.09);candleGroup.add(drip);}
  rod(candleGroup,.014,.1,cx,1.61,cz,dark,'y');
  const flame=new THREE.Mesh(new THREE.SphereGeometry(.085,12,12),new THREE.MeshBasicMaterial({color:'#ffc76a'}));flame.scale.set(.7,1.8,.7);flame.position.set(cx,1.76,cz);candleGroup.add(flame);desk.userData.flame=flame;
  const glow=new THREE.PointLight('#ffae5a',5,4,2);glow.position.copy(flame.position);candleGroup.add(glow);
  // Only the working objects remain on the desktop.
  const deskFolder=new THREE.Group();deskFolder.position.set(0,.445,1.2);desk.add(deskFolder);desk.userData.folder=deskFolder;
  const bundleBody=bevel(deskFolder,1.8,.012,3.10,0,0,0,leafPaper,.003);desk.userData.bundleBody=bundleBody;
  desk.userData.bundleLayers=[];
  for(let layer=0;layer<5;layer++)desk.userData.bundleLayers.push(bevel(deskFolder,1.79-layer*.006,.005,3.08-layer*.005,(layer%2?-.007:.007),.008+layer*.005,0,leafPaper,.002));
  const sheetStack=new THREE.Group();deskFolder.add(sheetStack);desk.userData.sheetStack=sheetStack;
  const binding=new THREE.Group();deskFolder.add(binding);desk.userData.bundleBinding=binding;
  binding.userData.longStrands=[-.36,.36].map(x=>rod(binding,.021,3.18,x,0,0,cord,'z'));
  binding.userData.crossStrand=rod(binding,.021,1.88,0,.003,.34,cord,'x');
  const knot=new THREE.Mesh(new THREE.TorusGeometry(.075,.023,10,24),cord);knot.rotation.x=Math.PI/2;knot.position.set(0,.04,.34);binding.add(knot);binding.userData.knot=knot;
  binding.userData.bows=[];
  for(const side of [-1,1]){const curve=new THREE.CatmullRomCurve3([new THREE.Vector3(0,.047,.34),new THREE.Vector3(side*.13,.09,.26),new THREE.Vector3(side*.19,.06,.36),new THREE.Vector3(side*.08,.05,.40)]);const bow=new THREE.Mesh(new THREE.TubeGeometry(curve,20,.016,8,false),cord);binding.add(bow);binding.userData.bows.push(bow);}
  const looseCord=new THREE.Group();looseCord.position.copy(cordRestPosition());desk.add(looseCord);desk.userData.looseCord=looseCord;
  for(let i=0;i<5;i++){const loop=new THREE.Mesh(new THREE.TorusGeometry(.17+i*.014,.022,10,40),cord);loop.rotation.x=-Math.PI/2;loop.scale.set(1,.58+i*.045,1);loop.position.set(Math.sin(i*2.1)*.048,.016+i*.012,Math.cos(i*1.7)*.046);looseCord.add(loop);}
  for(let i=0;i<3;i++){const tail=new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([new THREE.Vector3(-.16+i*.08,.07,.04),new THREE.Vector3(-.29+i*.04,.057,.18),new THREE.Vector3(-.38+i*.08,.035,.37),new THREE.Vector3(-.31+i*.11,.025,.57)]),20,.015,7,false),cord);looseCord.add(tail);}
  foldGroup=new THREE.Group();foldGroup.position.set(0,.45,1.15);foldGroup.visible=false;desk.add(foldGroup);
  bevel(foldGroup,2.55,.012,1.68,0,0,.84,paper,.005);
  foldTop=new THREE.Group();foldGroup.add(foldTop);bevel(foldTop,2.55,.012,1.68,0,0,-.84,paper,.005);
  const waxMark=new THREE.Mesh(new THREE.CylinderGeometry(.14,.14,.018,24),new THREE.MeshStandardMaterial({color:'#75251d',roughness:.42}));waxMark.position.set(.17,.018,.68);foldGroup.add(waxMark);desk.userData.waxMark=waxMark;waxMark.visible=false;
  // Resting feather and the small cradle it leaves when writing begins.
  for(const x of [-1.15,-.65]){const support=new THREE.Mesh(new THREE.TorusGeometry(.09,.025,8,16,Math.PI),brass);support.rotation.x=Math.PI/2;support.position.set(x,.51,2.85);desk.add(support);}
  const restQuill=new THREE.Group();desk.add(restQuill);restQuill.position.set(-.89,.51,2.85);desk.userData.restQuill=restQuill;
  rod(restQuill,.012,1.2,0,.02,0,paper,'x');
  const featherShape=new THREE.Shape();featherShape.moveTo(-.58,0);featherShape.quadraticCurveTo(-.16,.15,.25,.02);featherShape.quadraticCurveTo(-.13,-.12,-.58,0);
  const feather=new THREE.Mesh(new THREE.ShapeGeometry(featherShape),paper);feather.rotation.x=-Math.PI/2;feather.position.y=.04;restQuill.add(feather);
}
function buildBureau(){
  cabinet.position.set(5.52,-.10,1.0);cabinet.rotation.y=-Math.PI/2;cabinet.scale.setScalar(.61);
  // A seventeenth-century secretary: unequal open bays, an arched niche and a broad writing fall-front.
  bevel(cabinet,8.65,5.95,1.35,0,2.35,-1.55,walnut,.065);
  bevel(cabinet,8.13,3.55,.06,0,3.14,-.82,dark,.01);
  bevel(cabinet,8.5,1.75,.18,0,.38,-.76,walnutEdge,.035);
  for(const y of [-.31,.05,1.18,4.83,5.04,5.20])bevel(cabinet,8.95+(y>4.8?.28:0),.12,1.56,0,y,-1.43,y>4.8?walnutCross:walnutEdge,.035);
  for(const x of [-4.22,-.52,3.94]){
    bevel(cabinet,.20,5.3,1.48,x,2.59,-1.44,walnutCross,.03);
    for(const y of [.13,1.49,4.63])carvedRosette(cabinet,x,y,-.64,.52);
  }
  // Open shelves have distinct trays, rather than a regular mail-slot grid.
  for(const y of [2.88,3.70,4.52]){
    bevel(cabinet,2.62,.10,1.23,-1.85,y-.39,-1.32,walnutCross,.025);
    bevel(cabinet,2.60,.025,1.25,-1.85,y-.34,-1.33,agedBrass,.008);
  }
  bevel(cabinet,.09,2.55,1.3,-1.83,3.42,-1.30,walnutEdge,.025);
  // The deep arch is framed in dark walnut and fitted with a carved keystone.
  bevel(cabinet,3.18,2.95,.12,1.58,3.18,-.77,velvet,.02);
  const arch=new THREE.Mesh(new THREE.TorusGeometry(1.43,.11,12,48,Math.PI),walnutEdge);arch.position.set(1.58,3.85,-.59);arch.castShadow=true;cabinet.add(arch);
  for(const x of [.17,2.99])bevel(cabinet,.19,2.1,.25,x,2.82,-.60,walnutEdge,.045);
  carvedRosette(cabinet,1.58,5.18,-.61,1.15);
  for(let i=0;i<4;i++){
    const x=.53+i*.48;bevel(cabinet,.28,.85,.27,x,3.35,-.67,leather[i%4],.018);
    for(const y of [3.08,3.60])bevel(cabinet,.19,.025,.025,x,y,-.52,brass,.005);
  }
  // Heavy open doors, including inset panels, strap hinges and edge wear.
  for(const side of [-1,1]){
    const pivot=new THREE.Group();pivot.position.set(side*4.13,3.25,-.56);pivot.rotation.y=side*1.12;pivot.userData.openAngle=side*1.12;cabinet.add(pivot);bureauDoors.push(pivot);
    const doorFace=bevel(pivot,3.60,3.30,.20,-side*1.8,0,0,walnut,.045);doorFace.userData.bureauDoor=true;interactive.push(doorFace);
    for(const y of [-1.08,.05,1.10]){
      bevel(pivot,3.20,.88,.045,-side*1.8,y,.12,walnutEdge,.03);
      bevel(pivot,3.02,.71,.055,-side*1.8,y,.15,drawerWoods[(y+2|0)%4],.025);
      frame(pivot,-side*1.8,y,3.12,.82,.18,.035,agedBrass);
    }
    for(const y of [-1.28,0,1.28]){
      bevel(pivot,.10,.42,.16,0,y,-.06,agedBrass,.02);
      sphere(pivot,.053,0,y,-.15,brass);
    }
    const ring=new THREE.Mesh(new THREE.TorusGeometry(.12,.025,8,20),brass);ring.position.set(-side*3.15,-.08,.22);pivot.add(ring);
  }
  // The wide hinged panel is lowered beneath the open upper cabinet.
  const fall=new THREE.Group();fall.position.set(0,1.40,-.63);fall.rotation.x=-.65;cabinet.add(fall);
  bevel(fall,7.76,.78,.10,0,-.39,.03,walnutCross,.04);
  bevel(fall,7.34,.62,.035,0,-.38,.10,leather[1],.025);
  frame(fall,0,-.39,7.55,.69,.15,.045,agedBrass);
  for(const side of [-1,1]){
    const chain=new THREE.Mesh(new THREE.CylinderGeometry(.014,.014,1.02,8),agedBrass);chain.position.set(side*3.55,1.22,-.34);chain.rotation.x=.53;cabinet.add(chain);
  }
  compartments.forEach((comp,index)=>{
    if(comp.kind==='desk')return;
    const drawer=new THREE.Group();drawer.position.set(comp.x,comp.y,0);drawer.userData.kind=comp.kind;cabinet.add(drawer);drawers.set(comp.id,drawer);
    drawer.userData.folders=new THREE.Group();drawer.add(drawer.userData.folders);drawer.userData.folderHits=[];drawer.userData.folderTabs=[];
    if(comp.kind==='shelf'){
      bevel(drawer,comp.w-.05,.045,1.45,0,-comp.h*.35,-1.37,walnutEdge,.01);
      bevel(drawer,comp.w-.10,.05,.08,0,-comp.h*.36,-.60,agedBrass,.014);
      const hit=box(drawer,comp.w-.1,comp.h-.1,.012,0,0,-.77,dark,false);hit.userData.compartment=comp.id;interactive.push(hit);
    }else{
      bevel(drawer,comp.w-.08,.055,1.75,0,-comp.h*.35,-1.43,walnut,.016);
      for(const x of [-comp.w*.43,comp.w*.43])bevel(drawer,.045,comp.h*.67,1.78,x,-.04,-1.43,walnutEdge,.014);
      const front=bevel(drawer,comp.w-.035,comp.h-.04,.17,0,0,-.42,drawerWoods[(index*3)%4],.03);
      front.userData.compartment=comp.id;interactive.push(front);
      bevel(drawer,comp.w-.16,comp.h-.15,.025,0,0,-.32,walnutEdge,.024);
      bevel(drawer,comp.w-.25,comp.h-.23,.026,0,0,-.29,walnut,.018);
      frame(drawer,0,0,comp.w-.13,comp.h-.12,-.26,.032,agedBrass);
      sphere(drawer,.05,0,-comp.h*.22,-.17,brass);
      const ring=new THREE.Mesh(new THREE.TorusGeometry(.09,.019,8,18),agedBrass);ring.position.set(0,-comp.h*.31,-.12);drawer.add(ring);
    }
    bevel(drawer,Math.min(.84,comp.w-.08),.21,.025,0,.19,-.15,agedBrass,.012);
    const labelCanvas=document.createElement('canvas');labelCanvas.width=512;labelCanvas.height=160;
    const labelTexture=new THREE.CanvasTexture(labelCanvas);labelTexture.colorSpace=THREE.SRGBColorSpace;
    const label=new THREE.Mesh(new THREE.PlaneGeometry(Math.min(.75,comp.w-.12),.16),new THREE.MeshBasicMaterial({map:labelTexture,transparent:true,depthWrite:false}));label.position.set(0,.19,-.123);label.userData.label=comp.id;drawer.add(label);interactive.push(label);
    const labelTarget=new THREE.Mesh(new THREE.PlaneGeometry(Math.min(.82,comp.w-.08),.20),new THREE.MeshBasicMaterial({transparent:true,opacity:0,depthWrite:false}));labelTarget.position.set(0,.19,-.115);labelTarget.userData.label=comp.id;drawer.add(labelTarget);interactive.push(labelTarget);
    const nameOverlay=document.createElement('button');nameOverlay.type='button';nameOverlay.className='drawer-name-overlay';nameOverlay.hidden=true;nameOverlay.setAttribute('aria-label','Изменить подпись ящика');nameOverlay.addEventListener('click',()=>onCompartment(comp.id,isNearBureau()?'label':'too-far'));document.body.append(nameOverlay);
    drawer.userData.labelCanvas=labelCanvas;drawer.userData.labelTexture=labelTexture;drawer.userData.labelMesh=label;drawer.userData.nameOverlay=nameOverlay;
  });
}
buildBureau(); buildDesk();
heldBundle=new THREE.Group();heldBundle.position.set(.42,-.38,-.85);camera.add(heldBundle);scene.add(camera);heldBundle.visible=false;
for(let i=0;i<5;i++)bevel(heldBundle,.24,.003,.33,0,i*.004,0,bundlePaper,.001);
for(const x of [-.05,.05])rod(heldBundle,.003,.36,x,.027,0,cord,'z');

export function initScene(callback, sheetCallback) {
  onCompartment = callback;
  onSheet = sheetCallback;
  canvas.style.touchAction='none';
  const folderAt=event=>{if(doorsClosed)return null;const rect=canvas.getBoundingClientRect();pointer.set(((event.clientX-rect.left)/rect.width)*2-1,-((event.clientY-rect.top)/rect.height)*2+1);raycaster.setFromCamera(pointer,camera);const drawer=drawers.get(openDrawerId);const target=raycaster.intersectObjects(drawer?.userData.folderTabs||[])[0]?.object||raycaster.intersectObjects(drawer?.userData.folderHits||[])[0]?.object;return target?.userData.documentId?target.userData:null;};
  const ghost=document.createElement('div');ghost.className='drag-folder-ghost';document.body.append(ghost);
  const moveGhost=event=>{ghost.style.left=`${event.clientX}px`;ghost.style.top=`${event.clientY}px`;const button=document.querySelector('#write-button');const r=button.getBoundingClientRect();button.classList.toggle('drop-target',event.clientX>=r.left&&event.clientX<=r.right&&event.clientY>=r.top&&event.clientY<=r.bottom);};
  canvas.addEventListener('pointerdown',event=>{if(writingView)return;canvas.setPointerCapture(event.pointerId);pointers.set(event.pointerId,{x:event.clientX,y:event.clientY});pointerStart={x:event.clientX,y:event.clientY};gestureMoved=false;if(pointers.size===1&&openDrawerId&&isNearBureau())dragDocument=folderAt(event)||null;if(pointers.size===2){dragDocument=null;const [a,b]=[...pointers.values()];pinchDistance=Math.hypot(a.x-b.x,a.y-b.y);}});
  canvas.addEventListener('pointermove',event=>{if(!pointers.has(event.pointerId)||writingView)return;const last=pointers.get(event.pointerId);const dx=event.clientX-last.x,dy=event.clientY-last.y;pointers.set(event.pointerId,{x:event.clientX,y:event.clientY});if(Math.hypot(event.clientX-pointerStart.x,event.clientY-pointerStart.y)>7)gestureMoved=true;
    if(dragDocument){if(gestureMoved){ghost.classList.add('visible');moveGhost(event);}return;}
    if(pointers.size===2){const [a,b]=[...pointers.values()];const next=Math.hypot(a.x-b.x,a.y-b.y);if(pinchDistance>0){viewZoom=THREE.MathUtils.clamp(viewZoom*pinchDistance/next,.52,1.6);updateViewTarget();}pinchDistance=next;gestureMoved=true;}
    else if(gestureMoved){viewYaw=roomWalking?viewYaw-dx*.0032:THREE.MathUtils.clamp(viewYaw-dx*.0022,-.38,.38);viewPitch=THREE.MathUtils.clamp(viewPitch+dy*.0014,roomWalking?-.65:-.18,roomWalking?.55:.18);updateViewTarget();}
  });
  const release=event=>{clearTimeout(mouseWalkTimer);mouseWalk=false;if(dragDocument&&gestureMoved&&event.type==='pointerup'){const r=document.querySelector('#write-button').getBoundingClientRect(),fire=getFireplaceScreenBounds();if(event.clientX>=r.left&&event.clientX<=r.right&&event.clientY>=r.top&&event.clientY<=r.bottom)onCompartment(dragDocument.compartment,'edit-folder',dragDocument.documentId);else if(fire&&event.clientX>=fire.left&&event.clientX<=fire.right&&event.clientY>=fire.top&&event.clientY<=fire.bottom)onCompartment(dragDocument.compartment,'burn-folder',dragDocument.documentId);}dragDocument=null;ghost.classList.remove('visible');document.querySelector('#write-button').classList.remove('drop-target');pointers.delete(event.pointerId);if(pointers.size<2)pinchDistance=0;};canvas.addEventListener('pointerup',release);canvas.addEventListener('pointercancel',release);
  canvas.addEventListener('wheel',event=>{event.preventDefault();if(writingView)return;viewZoom=THREE.MathUtils.clamp(viewZoom*Math.exp(event.deltaY*.001),.52,1.6);updateViewTarget();},{passive:false});
  canvas.addEventListener('click', event => {
    if(gestureMoved){gestureMoved=false;return;}
    if (writingView) {
      const rect=canvas.getBoundingClientRect();
      pointer.set(((event.clientX-rect.left)/rect.width)*2-1,-((event.clientY-rect.top)/rect.height)*2+1);
      raycaster.setFromCamera(pointer,camera);
      const deskBook=raycaster.intersectObjects(deskDrawerHits)[0]?.object;
      if(deskBook?.userData.deskBook){onCompartment(deskBook.userData.deskDrawer,'desk-book');return;}
      if(!deskFolderOpen)return;
      const sheet=raycaster.intersectObjects(sheetHits)[0]?.object;
      if(sheet)onSheet(sheet.userData.sheetIndex);
      return;
    }
    const rect = canvas.getBoundingClientRect();
    pointer.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
    raycaster.setFromCamera(pointer, camera);
    const folderHit=folderAt(event);
    if(folderHit){onCompartment(folderHit.compartment,isNearBureau()?'folder':'too-far',folderHit.documentId);return;}
    const deskHit=raycaster.intersectObjects(deskDrawerHits)[0]?.object;
    if(deskHit&&isNearDesk()){const unit=deskDrawers.find(item=>item.userData.deskDrawer===deskHit.userData.deskDrawer);if(deskHit.userData.deskBook&&unit.userData.open){onCompartment(unit.userData.deskDrawer,'desk-book');return;}unit.userData.open=!unit.userData.open;unit.userData.slide={from:unit.position.z,to:unit.userData.open?4.10:3.39,start:performance.now()};onCompartment(unit.userData.deskDrawer,'desk-slide');return;}
    const hit = raycaster.intersectObjects(interactive)[0];
    if(hit?.object.userData.writingChair){onCompartment(null,isNearDesk()?'sit':'too-far');return;}
    if(hit?.object.userData.bureauDoor){if(!isNearBureau()){onCompartment(null,'too-far');return;}doorsClosed=!doorsClosed;onCompartment(null,'bureau-door');return;}
    if(doorsClosed)return;
    if (hit?.object.userData.documentId) onCompartment(hit.object.userData.compartment,isNearBureau()?'folder':'too-far',hit.object.userData.documentId);
    else if (hit?.object.userData.label) onCompartment(hit.object.userData.label,isNearBureau()?'label':'too-far');
    else if (hit?.object.userData.compartment) onCompartment(hit.object.userData.compartment,isNearBureau()?'drawer':'too-far');
  });
  const movementKeys={KeyW:'forward'};
  window.addEventListener('keydown',event=>{if(document.activeElement?.matches('input,textarea,[contenteditable],select'))return;const direction=movementKeys[event.code];if(direction){event.preventDefault();walkKeys.add(direction);}});
  window.addEventListener('keyup',event=>{const direction=movementKeys[event.code];if(direction)walkKeys.delete(direction);});
  window.addEventListener('blur',()=>walkKeys.clear());
  const stick=document.querySelector('#walk-stick');stick.addEventListener('pointerdown',event=>{event.preventDefault();stick.setPointerCapture(event.pointerId);walkStick={forward:1,strafe:0};});stick.addEventListener('pointermove',event=>{if(!walkStick)return;const rect=stick.getBoundingClientRect(),x=(event.clientX-rect.left-rect.width/2)/rect.width*2,y=(event.clientY-rect.top-rect.height/2)/rect.height*2;walkStick={forward:THREE.MathUtils.clamp(-y*1.5,-1,1),strafe:THREE.MathUtils.clamp(x*1.5,-1,1)};if(Math.abs(x)+Math.abs(y)<.22)walkStick.forward=1;});for(const name of ['pointerup','pointercancel','lostpointercapture'])stick.addEventListener(name,()=>walkStick=null);
  resize(); window.addEventListener('resize', resize);window.visualViewport?.addEventListener('resize',resize); requestAnimationFrame(render);
}

function resize() {
  const width = innerWidth, height = innerHeight;
  const focused=document.activeElement?.matches?.('#editor,#document-title');
  const visibleHeight=window.visualViewport?.height||height;
  const keyboardOpen=writingView&&width<650&&focused&&width===fullViewportWidth&&
    (height<fullViewportHeight-20||visibleHeight<fullViewportHeight-20);
  if(!keyboardOpen&&(!focused||width!==fullViewportWidth||height>fullViewportHeight)){fullViewportWidth=width;fullViewportHeight=height;}
  const renderHeight=keyboardOpen?fullViewportHeight:height;
  renderer.setSize(width,renderHeight,false);
  canvas.style.height=`${renderHeight}px`;
  camera.aspect = width / renderHeight; camera.updateProjectionMatrix();
  const mobile=width<650;
  if(writingView&&mobile!==lastMobileLayout)showDesk();
  lastMobileLayout=mobile;
}

function render(now) {
  requestAnimationFrame(render);
  if (now - lastFrame < (writingView ? 32 : 16)) return;
  const delta=lastFrame?Math.min((now-lastFrame)/1000,.05):0;
  lastFrame = now;
  if(roomWalking&&(walkKeys.size||walkStick))walkRoom(Number(walkKeys.has('forward'))+(walkStick?.forward||0),walkStick?.strafe||0,delta);
  if (animate) { const cameraSpeed=roomWalking?.24:writingView?Math.max(speed,.18):speed;camera.position.lerp(targetPosition,cameraSpeed); currentLook.lerp(targetLook,cameraSpeed); }
  else { camera.position.copy(targetPosition); currentLook.copy(targetLook); }
  for(const [id,drawer] of drawers) { const slide=drawer.userData.slide;if(!slide)continue;const t=animate?THREE.MathUtils.clamp((now-slide.start)/slideDuration,0,1):1;const eased=t*t*(3-2*t);drawer.position.z=THREE.MathUtils.lerp(slide.from,slide.to,eased);if(t===1)drawer.userData.slide=null; }
  for(const drawer of deskDrawers){const slide=drawer.userData.slide;if(!slide)continue;const t=animate?THREE.MathUtils.clamp((now-slide.start)/slideDuration,0,1):1;const eased=t*t*(3-2*t);drawer.position.z=THREE.MathUtils.lerp(slide.from,slide.to,eased);if(t===1)drawer.userData.slide=null;}
  for(const door of bureauDoors)door.rotation.y=THREE.MathUtils.lerp(door.rotation.y,doorsClosed?0:door.userData.openAngle,.07);
  if(desk.userData.inkLid)desk.userData.inkLid.rotation.x=THREE.MathUtils.lerp(desk.userData.inkLid.rotation.x,inkOpen?-1.85:0,.12);
  if(desk.userData.redInkLid)desk.userData.redInkLid.rotation.x=THREE.MathUtils.lerp(desk.userData.redInkLid.rotation.x,inkOpen?-1.85:0,.12);
  if(foldTop){foldTop.rotation.x=THREE.MathUtils.lerp(foldTop.rotation.x,foldTarget,.1);if(!paperFolded&&foldTop.rotation.x<.025)foldGroup.visible=false;}
  if(desk.userData.folderCover)desk.userData.folderCover.rotation.x=THREE.MathUtils.lerp(desk.userData.folderCover.rotation.x,deskFolderTarget,.075);
  if(cordInFlight&&desk.userData.looseCord){const target=desk.worldToLocal(desk.userData.folder.localToWorld(new THREE.Vector3(0,.10,.34)));desk.userData.looseCord.position.lerp(target,.16);desk.userData.looseCord.scale.multiplyScalar(.975);if(desk.userData.looseCord.position.distanceTo(target)<.07){cordInFlight=false;desk.userData.looseCord.visible=false;desk.userData.bundleBinding.visible=true;cordWrapProgress=0;}}
  else if(desk.userData.looseCord?.visible)desk.userData.looseCord.position.lerp(cordRestPosition(),.12);
  const binding=desk.userData.bundleBinding;
  if(binding?.visible){cordWrapProgress=Math.min(1,cordWrapProgress+.048);const ease=t=>t*t*(3-2*t);const length=ease(Math.min(1,cordWrapProgress/.55)),cross=ease(Math.max(0,Math.min(1,(cordWrapProgress-.25)/.55))),tie=ease(Math.max(0,Math.min(1,(cordWrapProgress-.72)/.28)));for(const strand of binding.userData.longStrands)strand.scale.y=Math.max(.001,length);binding.userData.crossStrand.scale.y=Math.max(.001,cross);binding.userData.knot.scale.setScalar(Math.max(.001,tie));for(const bow of binding.userData.bows)bow.scale.setScalar(Math.max(.001,tie));}
  if(desk.userData.folder){desk.userData.folder.position.lerp(deskFolderOpen?new THREE.Vector3(innerWidth<650?-1.72:-2.18,.445,1.16):new THREE.Vector3(0,.445,1.2),.075);const scale=deskFolderOpen?(innerWidth<650?.59:.72):1;desk.userData.folder.scale.lerp(new THREE.Vector3(scale,scale,scale),.075);}
  if(desk.userData.seal&&stampActive){stampProgress=Math.min(1,stampProgress+.025);const t=stampProgress;const travel=t<.38?t/.38:t<.7?1:Math.max(0,1-(t-.7)/.3);const lift=t<.38?Math.sin(t/.38*Math.PI/2)*.55:t<.55?Math.max(0,(.55-t)/.17)*.55:t<.7?0:Math.sin((t-.7)/.3*Math.PI)*.42;desk.userData.seal.position.set(3.66+(.17-3.66)*travel,.68+lift,2.35+(1.83-2.35)*travel);if(t>=.55&&!stampContact){stampContact=true;stampResolve?.();stampResolve=null;}if(t>=1){stampActive=false;desk.userData.seal.position.set(3.66,.68,2.35);}}
  if(desk.userData.flame)desk.userData.flame.scale.y=1.8+Math.sin(now*.016)*.12;
  const burnBoost=burning?1.5*Math.sin(Math.PI*Math.min(1,(now-burning.start)/burning.duration)):0;
  if(fireplace.userData.flames)for(const [index,flame] of fireplace.userData.flames.entries()){
    const wave=Math.sin(now*.009+index*2.3)*.14+Math.sin(now*.021+index*.8)*.09;
    flame.scale.set(1+wave,1+wave*.9+burnBoost*.6,1);
    flame.position.y=.38+(index%3)*.08+wave*.08;
    flame.material.opacity=.47+wave*.3+burnBoost*.12;
  }
  if(fireplace.userData.glow)fireplace.userData.glow.intensity=4.8+Math.sin(now*.012)*.35+burnBoost*5;
  if(burning){const p=Math.min(1,(now-burning.start)/burning.duration);const mesh=fireplace.userData.burnMesh;mesh.visible=true;mesh.scale.setScalar(Math.max(.04,1-p*.93));mesh.rotation.y=p*2.6;mesh.position.y=.25+p*.5;if(p>=1){mesh.visible=false;const done=burning.resolve;burning=null;done();}}
  camera.lookAt(currentLook);
  updateDrawerNames();
  renderer.render(scene, camera);
}

function updateDrawerNames(){
  if(!cabinet.visible||doorsClosed||document.body.classList.contains('reading-active')){for(const drawer of drawers.values())drawer.userData.nameOverlay.hidden=true;return;}
  camera.updateMatrixWorld();cabinet.updateMatrixWorld(true);
  for(const drawer of drawers.values()){
    const overlay=drawer.userData.nameOverlay;
    if(!overlay.textContent){overlay.hidden=true;continue;}
    const center=new THREE.Vector3(0,.19,-.12).applyMatrix4(drawer.matrixWorld).project(camera);
    const left=new THREE.Vector3(-.41,.19,-.12).applyMatrix4(drawer.matrixWorld).project(camera);
    const right=new THREE.Vector3(.41,.19,-.12).applyMatrix4(drawer.matrixWorld).project(camera);
    const width=Math.abs(right.x-left.x)*innerWidth/2;
    const x=(center.x+1)*innerWidth/2,y=(1-center.y)*innerHeight/2;
    overlay.hidden=center.z<=-1||center.z>=1||x<-width||x>innerWidth+width||y<0||y>innerHeight;
    if(overlay.hidden)continue;
    overlay.style.left=`${x}px`;overlay.style.top=`${y}px`;
    overlay.style.width=`${Math.max(42,width)}px`;
    overlay.style.fontSize=`${Math.min(17,Math.max(11,width*.13))}px`;
  }
}

export function showCabinet() { writingView=false;roomWalking=true;document.body.classList.add('room-walk');desk.visible = true; cabinet.visible = true;scene.userData.chair.visible=true;slideDrawer(null);camera.fov=innerWidth<650?60:72;camera.updateProjectionMatrix();const position=hasFocused?new THREE.Vector3(3.9,2.35,4.35):new THREE.Vector3(0,3.25,6.05);setBaseView(position,hasFocused?new THREE.Vector3(5.2,1.8,1):new THREE.Vector3(0,1.8,-1.7));resize(); }
export function focusCompartment(id) { const c = compartments.find(item => item.id === id); if (!c) return;hasFocused=true;writingView=false;roomWalking=false;document.body.classList.remove('room-walk');desk.visible=true;cabinet.visible=true;scene.userData.chair.visible=c.kind!=='desk';camera.fov=49;camera.updateProjectionMatrix();if(c.kind==='desk'){setBaseView(new THREE.Vector3(c.x,2.6,5.0),new THREE.Vector3(c.x,.05,2.9));return;}if(openDrawerId!==id)slideDrawer(id);cabinet.updateWorldMatrix(true,false);const center=cabinet.localToWorld(new THREE.Vector3(c.x,c.y,0));const eye=center.clone().add(new THREE.Vector3(innerWidth<650?-2.55:-2.2,1.20,0));setBaseView(eye,center); }
export function setDrawerLabel(id,value){const drawer=drawers.get(id);if(!drawer)return;const name=value.trim();drawer.userData.nameOverlay.textContent=name;drawer.userData.nameOverlay.hidden=!name;drawer.userData.labelMesh.visible=!name;}
export function setDrawerDocuments(id,docs){const drawer=drawers.get(id);if(!drawer)return;for(const mesh of drawer.userData.folderHits){const index=interactive.indexOf(mesh);if(index!==-1)interactive.splice(index,1);}drawer.userData.folderHits=[];drawer.userData.folderTabs=[];const stack=drawer.userData.folders;for(const child of [...stack.children])stack.remove(child);
  docs.slice(0,8).forEach((doc,i)=>{const folder=new THREE.Group();folder.position.set((i%2?-.025:.025),.13+i*.012,drawer.userData.kind==='shelf'?-.72+i*.10:-2.12+i*.23);stack.add(folder);
    const pageCount=doc.pages?.length||1;const thickness=.012+Math.min(.13,Math.max(0,pageCount-1)*.00068);
    const cover=bevel(folder,.74,thickness,.77,0,0,0,bundlePaper,.009);cover.userData={compartment:id,documentId:doc.id};interactive.push(cover);drawer.userData.folderHits.push(cover);
    for(let layer=0;layer<Math.min(4,pageCount-1);layer++)bevel(folder,.735-layer*.003,.004,.765-layer*.003,(layer%2?-.003:.003),thickness/2+.003+layer*.004,0,bundlePaper,.002);
    const top=thickness/2+.004+Math.min(4,pageCount-1)*.004;
    const tab=new THREE.Mesh(new THREE.PlaneGeometry(.77,.22),new THREE.MeshBasicMaterial({colorWrite:false,side:THREE.DoubleSide,depthWrite:false}));tab.rotation.x=-Math.PI/2;tab.position.set(0,top+.004,.35);tab.userData={compartment:id,documentId:doc.id};folder.add(tab);drawer.userData.folderTabs.push(tab);
    if(pageCount>1&&(doc.bound??true)){for(const x of [-.16,.16])rod(folder,.006,.79,x,top+.005,0,cord,'z');rod(folder,.006,.75,0,top+.008,.12,cord,'x');}
    const labelCanvas=document.createElement('canvas');labelCanvas.width=256;labelCanvas.height=65;const ctx=labelCanvas.getContext('2d');ctx.fillStyle='#c5ab7d';ctx.fillRect(0,0,256,65);ctx.strokeStyle='#7a5b38';ctx.strokeRect(5,5,246,55);if(doc.title){ctx.fillStyle='#3b2a20';ctx.textAlign='center';ctx.textBaseline='middle';ctx.font='bold 23px Georgia';ctx.fillText(doc.title,128,33,236);}const texture=new THREE.CanvasTexture(labelCanvas);texture.colorSpace=THREE.SRGBColorSpace;
    if(doc.title){const tag=new THREE.Mesh(new THREE.PlaneGeometry(.55,.14),new THREE.MeshBasicMaterial({map:texture,side:THREE.DoubleSide}));tag.rotation.x=-Math.PI/2;tag.position.set(0,top+.012,-.14);folder.add(tag);}
  });
}
export function showDesk() { const entering=!writingView;writingView=true;roomWalking=false;document.body.classList.remove('room-walk');desk.visible = true; cabinet.visible = false;scene.userData.chair.visible=false;camera.fov=49;const mobile=innerWidth<650;if(entering)deskZoom=mobile?.88:1;desk.userData.ink.position.x=mobile?1.65:3.25;desk.userData.redInk.position.x=mobile?2.35:2.18;desk.userData.candleGroup.position.x=mobile?2.04:0;camera.zoom=deskZoom;camera.updateProjectionMatrix();setBaseView(new THREE.Vector3(0,mobile?9.5:11,mobile?12:9),new THREE.Vector3(0,.80,1.1)); }
export function setDeskZoom(value){if(!writingView)return;deskZoom=THREE.MathUtils.clamp(value,.32,3.6);camera.zoom=deskZoom;camera.updateProjectionMatrix();}
export function getDeskZoom(){return deskZoom;}
export function getInkwellScreenPosition(){
  desk.updateWorldMatrix(true,false);
  const point=desk.localToWorld(new THREE.Vector3(desk.userData.ink.position.x,.90,.08));
  point.project(camera);
  const rect=canvas.getBoundingClientRect();
  return {x:rect.left+(point.x+1)*rect.width/2,y:rect.top+(1-point.y)*rect.height/2};
}
export function getRedInkwellScreenPosition(){desk.updateWorldMatrix(true,false);camera.updateMatrixWorld();const point=desk.userData.redInk.localToWorld(new THREE.Vector3(0,.87,0)).project(camera);const rect=canvas.getBoundingClientRect();return {x:rect.left+(point.x+1)*rect.width/2,y:rect.top+(1-point.y)*rect.height/2};}
export function getFireplaceScreenBounds(){fireplace.updateWorldMatrix(true,false);camera.updateMatrixWorld();const rect=canvas.getBoundingClientRect();const points=[[-1.45,-.2],[1.45,-.2],[-1.45,2.5],[1.45,2.5]].map(([x,y])=>fireplace.localToWorld(new THREE.Vector3(x,y,.7)).project(camera));if(points.every(p=>p.z>=1||p.z<=-1))return null;const xs=points.map(p=>rect.left+(p.x+1)*rect.width/2),ys=points.map(p=>rect.top+(1-p.y)*rect.height/2);return {left:Math.min(...xs),right:Math.max(...xs),top:Math.min(...ys),bottom:Math.max(...ys)};}
export function burnBundle(pageCount){if(burning)return Promise.reject(new Error('Камин занят'));const duration=3000+Math.min(7000,Math.max(0,pageCount-1)*42);return new Promise(resolve=>{burning={start:performance.now(),duration,resolve};});}
export function getDeskFolderScreenBounds(){
  if(!writingView||!desk.userData.folder)return null;
  const folder=desk.userData.folder;folder.updateWorldMatrix(true,false);camera.updateMatrixWorld();
  const rect=canvas.getBoundingClientRect();
  const points=[[-1.6,-1.15],[1.6,-1.15],[-1.6,1.15],[1.6,1.15]].map(([x,z])=>{const p=folder.localToWorld(new THREE.Vector3(x,.08,z)).project(camera);return {x:rect.left+(p.x+1)*rect.width/2,y:rect.top+(1-p.y)*rect.height/2};});
  const xs=points.map(p=>p.x),ys=points.map(p=>p.y);return {x:(Math.min(...xs)+Math.max(...xs))/2,y:(Math.min(...ys)+Math.max(...ys))/2,width:Math.max(90,Math.max(...xs)-Math.min(...xs)),height:Math.max(55,Math.max(...ys)-Math.min(...ys))};
}
export function getLooseCordScreenPosition(){if(!writingView||!desk.userData.looseCord)return null;desk.updateWorldMatrix(true,false);camera.updateMatrixWorld();const p=desk.userData.looseCord.getWorldPosition(new THREE.Vector3()).project(camera);const rect=canvas.getBoundingClientRect();return {x:rect.left+(p.x+1)*rect.width/2,y:rect.top+(1-p.y)*rect.height/2};}
export function setBundleBound(bound,animateCord=false){const loose=desk.userData.looseCord,binding=desk.userData.bundleBinding;if(!loose||!binding)return;cordInFlight=Boolean(bound&&animateCord);cordWrapProgress=cordInFlight?0:1;loose.position.copy(cordRestPosition());loose.scale.setScalar(1);loose.visible=!bound||cordInFlight;binding.visible=Boolean(bound&&!cordInFlight&&bundlePageCount>1);}
export function getDeskPaperScreenBounds(){
  if(!writingView)return null;desk.updateWorldMatrix(true,false);camera.updateMatrixWorld();const rect=canvas.getBoundingClientRect();
  const points=[[-.90,-.33],[.90,-.33],[-.90,2.77],[.90,2.77]].map(([x,z])=>{const p=desk.localToWorld(new THREE.Vector3(x,.442,z)).project(camera);return {x:rect.left+(p.x+1)*rect.width/2,y:rect.top+(1-p.y)*rect.height/2};});
  const xs=points.map(p=>p.x),ys=points.map(p=>p.y);return {x:(Math.min(...xs)+Math.max(...xs))/2,y:(Math.min(...ys)+Math.max(...ys))/2,width:Math.max(...xs)-Math.min(...xs),height:Math.max(...ys)-Math.min(...ys)};
}
export function applySceneSettings(settings) {
  const ratio = settings.quality === 'high' ? Math.min(devicePixelRatio, 2.5) : settings.quality === 'medium' ? Math.min(devicePixelRatio, 2) : 1;
  renderer.setPixelRatio(ratio); resize();
  renderer.shadowMap.enabled = settings.shadows;
  lights.key.castShadow = settings.shadows;
  lights.fill.visible = settings.lighting === 'full';
  animate = settings.animations;
  speed = settings.speed === 'fast' ? .11 : settings.speed === 'slow' ? .035 : .06;
  slideDuration = settings.speed === 'fast' ? 590 : settings.speed === 'slow' ? 1100 : 780;
  soundEnabled = settings.sounds;
}
export function playOpenSound() {
  if (!soundEnabled) return;
  try { const ctx = new AudioContext(); const osc = ctx.createOscillator(); const gain = ctx.createGain(); osc.type = 'triangle'; osc.frequency.setValueAtTime(180, ctx.currentTime); osc.frequency.exponentialRampToValueAtTime(100, ctx.currentTime + .12); gain.gain.setValueAtTime(.025, ctx.currentTime); gain.gain.exponentialRampToValueAtTime(.001, ctx.currentTime + .14); osc.connect(gain).connect(ctx.destination); osc.start(); osc.stop(ctx.currentTime + .15); osc.onended = () => ctx.close(); } catch { /* audio is optional */ }
}
export function toggleInkLid(){inkOpen=!inkOpen;}
export function setInkLid(open){inkOpen=open;}
export function stampSeal(){if(!desk.userData.seal||stampActive)return Promise.resolve();stampProgress=0;stampContact=false;stampActive=true;return new Promise(resolve=>{stampResolve=resolve;});}
export function foldPaper(folded){paperFolded=folded;foldTarget=folded?Math.PI:0;if(folded)foldGroup.visible=true;}
export function showWaxMark(visible){if(desk.userData.waxMark)desk.userData.waxMark.visible=visible;}
export function closeDeskFolder(title=''){deskFolderTarget=0;deskFolderOpen=false;if(desk.userData.writingLeaf)desk.userData.writingLeaf.visible=false;if(desk.userData.folder)desk.userData.folder.visible=true;if(desk.userData.folderLabel)desk.userData.folderLabel.visible=false;}
export function openDeskFolder(){deskFolderTarget=0;deskFolderOpen=true;if(desk.userData.writingLeaf)desk.userData.writingLeaf.visible=false;if(desk.userData.folder)desk.userData.folder.visible=bundlePageCount>1;}
export function setFolderSheetCount(count,current=0,canAdd=false,bound=false){const group=desk.userData.sheetStack;if(!group)return;bundlePageCount=count;if(deskFolderOpen&&desk.userData.folder)desk.userData.folder.visible=count>1;if(desk.userData.bundleBinding&&!cordInFlight)desk.userData.bundleBinding.visible=Boolean(bound&&count>1);if(desk.userData.nextLeaf){desk.userData.nextLeaf.visible=canAdd;desk.userData.nextLeaf.userData.sheetIndex=count;}const thickness=.012+Math.min(.13,Math.max(0,count-1)*.00068);if(desk.userData.bundleBody)desk.userData.bundleBody.scale.y=thickness/.012;desk.userData.bundleLayers?.forEach((layer,index)=>{layer.visible=index<Math.min(5,count);layer.position.y=thickness/2+.003+index*.005;});if(desk.userData.bundleBinding)desk.userData.bundleBinding.position.y=thickness/2+.02;if(desk.userData.folderLabel)desk.userData.folderLabel.position.y=thickness/2+.028;for(const child of [...group.children]){group.remove(child);child.geometry?.dispose();if(child.material!==leafPaper){child.material?.map?.dispose();child.material?.dispose();}}sheetHits.length=0;if(canAdd)sheetHits.push(desk.userData.nextLeaf);
  for(const {index,offset,blank} of nearbyPages(count,current,canAdd)){
    if(index===current||blank)continue;
    const slot=offset+2;
    const z=.30-slot*.15;
    const x=-.24+slot*.12;
    const material=blank?new THREE.MeshStandardMaterial({color:'#d9c49b',roughness:.94}):leafPaper;
    const leaf=bevel(group,1.80,.009,3.10,x,.072+slot*.004,z,material,.004);
    leaf.userData.sheetIndex=index;sheetHits.push(leaf);
    const edge=bevel(group,1.80,.012,.17,x,.083+slot*.004,z+1.55,material,.003);
    edge.userData.sheetIndex=index;sheetHits.push(edge);
    const numberCanvas=document.createElement('canvas');numberCanvas.width=128;numberCanvas.height=64;
    const ctx=numberCanvas.getContext('2d');ctx.fillStyle='#24190f';ctx.font='bold italic 44px Georgia';ctx.textAlign='right';ctx.fillText(romanPage(index),119,47,110);
    const texture=new THREE.CanvasTexture(numberCanvas);texture.colorSpace=THREE.SRGBColorSpace;
    const mark=new THREE.Mesh(new THREE.PlaneGeometry(.29,.13),new THREE.MeshBasicMaterial({map:texture,transparent:true,side:THREE.DoubleSide,depthWrite:false}));
    mark.rotation.x=-Math.PI/2;mark.position.set(x+.62,.094+slot*.004,z-1.40);group.add(mark);
    if(index===current)edge.material=leafPaper;
  }
}
export function setRestQuillVisible(visible){if(desk.userData.restQuill)desk.userData.restQuill.visible=visible;}
