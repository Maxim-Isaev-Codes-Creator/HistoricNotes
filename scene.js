import * as THREE from 'three';
import { RoundedBoxGeometry } from './vendor/RoundedBoxGeometry.js';
import { nearbyPages, romanPage } from './pages.js';

const legacyIds=['letters','chronicles','records','manuscripts','thoughts','archive'];
const compartments=Array.from({length:20},(_,index)=>({id:legacyIds[index]||`drawer-${index+1}`,name:`Ящик ${index+1}`,x:-2.08+(index%5)*1.04,y:3.56-Math.floor(index/5)*.95,w:1.04,h:.89}));
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
const camera = new THREE.PerspectiveCamera(38, 1, .1, 50);
camera.position.set(0, 2.05, 11.9);
camera.lookAt(.35, 1.85, 0);
const cabinet = new THREE.Group();
const desk = new THREE.Group();
scene.add(cabinet, desk);
desk.visible = false;
const interactive = [];
const sheetHits = [];
const drawers = new Map();
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
let onCompartment = () => {};
let onSheet = () => {};
let openDrawerId = null;
let targetPosition = camera.position.clone();
let targetLook = new THREE.Vector3(.35, 1.85, 0);
let basePosition=targetPosition.clone(),baseLook=targetLook.clone(),viewZoom=1,viewYaw=0,gestureMoved=false,dragDocument=null;
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
const cordRestPosition=()=>new THREE.Vector3(innerWidth<650?-1.05:-3.35,.465,innerWidth<650?2.62:1.45);
function updateViewTarget(){const offset=basePosition.clone().sub(baseLook);const orbit=new THREE.Spherical().setFromVector3(offset);orbit.theta+=viewYaw;orbit.radius*=viewZoom;targetLook.copy(baseLook);targetPosition.copy(baseLook).add(new THREE.Vector3().setFromSpherical(orbit));}
function setBaseView(position,look){basePosition.copy(position);baseLook.copy(look);viewZoom=1;viewYaw=0;updateViewTarget();}
function slideDrawer(id){openDrawerId=id;const now=performance.now();for(const [drawerId,drawer] of drawers){drawer.userData.slide={from:drawer.position.z,to:drawerId===id?2.15:0,start:now};}}

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
const walnutMap = grainTexture('#61402c','27,12,6',4);
const horizontalMap = walnutMap.clone();horizontalMap.center.set(.5,.5);horizontalMap.rotation=Math.PI/2;horizontalMap.needsUpdate=true;
const oakMap = grainTexture('#6b4329','20,10,4',12);
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
  box(scene, 30, .24, 25, 0, -.5, -1.4, floorWood, false);
  for (let row=0;row<16;row++) for(let col=0;col<14;col++) {
    const x=(col-7)*1.15+(row%2)*.56,z=(row-7)*.83;
    const plank=box(scene,1.13,.012,.81,x,-.372,z,row%5===0?oak:floorWood,false);plank.receiveShadow=true;
  }
  box(scene,30,13,.2,0,4.2,-4.1,plaster,false);
  box(scene,.2,13,24,-8.3,4,-1.1,plaster,false);
  box(scene,.2,13,24,8.3,4,-1.1,plaster,false);
  // The aged plaster stays visually quiet behind both pieces of furniture.
  const rug=new THREE.Mesh(new THREE.PlaneGeometry(7.3,4.9),velvet);rug.rotation.x=-Math.PI/2;rug.position.set(.5,-.356,4.7);rug.receiveShadow=true;scene.add(rug);
  for(let i=-1;i<=1;i++) { bevel(scene,7.1,.018,.035,.5,-.34,4.7+i*2.1,agedBrass,.008); }
  const ambient = new THREE.AmbientLight('#dbc5aa', 1.08); scene.add(ambient);
  const key = new THREE.DirectionalLight('#ffdcab', 2.65); key.position.set(-5, 7, 5); key.castShadow = true; key.shadow.mapSize.set(2048, 2048); key.shadow.bias=-.0003; key.shadow.radius=2; key.shadow.camera.left = -8; key.shadow.camera.right = 8; key.shadow.camera.top = 8; key.shadow.camera.bottom = -8; scene.add(key);
  const fill = new THREE.PointLight('#efaa64', 19, 15, 2); fill.position.set(4, 3.7, 4); scene.add(fill);
  const windowLight = new THREE.PointLight('#a9c5d3', 17, 12, 2);windowLight.position.set(-7,3.5,1);scene.add(windowLight);
  return { ambient, key, fill };
}
const lights = buildRoom();

function buildCabinet() {
  cabinet.position.x=.55;
  // Recessed carcass: the back, shelves, stiles, and rails occupy distinct depths.
  bevel(cabinet,5.83,4.13,.86,.05,2.08,-1.67,walnut,.055);
  bevel(cabinet,5.48,3.74,.035,.05,2.08,-1.195,dark,.008);
  for(const x of [-2.75,2.85]){
    bevel(cabinet,.38,4.28,1.03,x,1.99,-1.21,walnutEdge,.06);
    bevel(cabinet,.26,4.08,.08,x,1.99,-.66,walnut,.02);
    for(let j=-2;j<=2;j++) rod(cabinet,.011,2.8,x+j*.04,2.1,-.604,agedBrass,'y');
    bevel(cabinet,.52,.20,1.12,x,4.13,-1.18,walnutCross,.03);
    bevel(cabinet,.52,.20,1.13,x,.05,-1.18,walnutCross,.03);
    carvedRosette(cabinet,x,3.79,-.53,.8); carvedRosette(cabinet,x,.48,-.53,.8);
  }
  for(const y of [.24,1.18,2.13,3.08,4.03]){
    bevel(cabinet,5.35,.18,1.02,.05,y,-1.15,walnutCross,.035);
    bevel(cabinet,5.45,.035,1.1,.05,y+.075,-1.06,agedBrass,.014);
    bevel(cabinet,5.42,.08,1.1,.05,y-.10,-1.06,walnutCross,.02);
  }
  for(const x of [-1.56,-.52,.52,1.56]){
    bevel(cabinet,.15,3.74,.91,x,2.13,-1.13,walnut,.035);
    bevel(cabinet,.04,3.72,.99,x,2.13,-.64,walnutEdge,.012);
  }
  // Oversailing cornice and curved pediment.
  bevel(cabinet,6.04,.14,1.17,.05,4.18,-1.19,walnutCross,.035);
  bevel(cabinet,6.23,.13,1.23,.05,4.31,-1.19,walnutEdge,.035);
  bevel(cabinet,6.38,.11,1.29,.05,4.43,-1.19,walnutCross,.03);
  bevel(cabinet,6.5,.07,1.32,.05,4.51,-1.19,agedBrass,.02);
  bevel(cabinet,6.45,.19,1.32,.05,4.61,-1.19,walnutCross,.055);
  bevel(cabinet,6.3,.11,1.22,.05,4.73,-1.19,walnutEdge,.035);
  for(const x of [-2.75,2.85]) { bevel(cabinet,.61,.28,1.22,x,.12,-1.15,walnutCross,.04);bevel(cabinet,.43,.18,1.15,x,-.16,-1.15,walnut,.03); }
  bevel(cabinet,5.6,.30,.92,.05,.04,-1.15,walnut,.04);
  for(const x of [-2.08,-1.04,0,1.04,2.08]) frame(cabinet,x,.04,.91,.23,-.64,.03,agedBrass);
  for (const [drawerIndex,comp] of compartments.entries()) {
    const hit = box(cabinet,comp.w-.12,comp.h-.16,.015,comp.x,comp.y,-1.165,dark,false);
    hit.userData.compartment=comp.id;interactive.push(hit);
    bevel(cabinet,comp.w-.18,.035,.83,comp.x,comp.y-comp.h*.48,-.97,oak,.014);
    frame(cabinet,comp.x,comp.y,comp.w-.03,comp.h-.02,-.61,.065,walnutEdge);
    frame(cabinet,comp.x,comp.y,comp.w-.16,comp.h-.15,-.55,.021,agedBrass);
    const drawer=new THREE.Group();drawer.position.set(comp.x,comp.y,0);cabinet.add(drawer);drawers.set(comp.id,drawer);drawer.userData.folders=new THREE.Group();drawer.add(drawer.userData.folders);drawer.userData.folderHits=[];drawer.userData.folderTabs=[];
    bevel(drawer,.86,.035,1.98,0,.04,-1.38,walnut,.015);
    for(const x of [-.43,.43])bevel(drawer,.035,.22,1.98,x,.16,-1.38,walnutEdge,.012);
    bevel(drawer,.86,.22,.035,0,.16,-2.35,walnutEdge,.012);
    const front=bevel(drawer,comp.w-.045,comp.h-.045,.17,0,0,-.43,drawerWoods[(drawerIndex*7)%4],.045);front.userData.compartment=comp.id;interactive.push(front);
    bevel(drawer,comp.w-.19,comp.h-.18,.025,0,0,-.332,walnutEdge,.025);
    bevel(drawer,comp.w-.33,comp.h-.31,.029,0,0,-.31,walnut,.02);
    frame(drawer,0,0,comp.w-.16,comp.h-.15,-.28,.055,walnutEdge);
    frame(drawer,0,0,comp.w-.29,comp.h-.28,-.25,.018,agedBrass);
    for(const x of [-.41,.41]) for(const y of [-.34,.34]) carvedRosette(drawer,x,y,-.22,.12);
    // A shallow brass label holder starts empty. Clicking it edits the drawer name.
    bevel(drawer,.85,.29,.045,0,.19,-.19,agedBrass,.025);
    bevel(drawer,.78,.23,.047,0,.19,-.155,paper,.018);
    const labelCanvas=document.createElement('canvas');labelCanvas.width=512;labelCanvas.height=160;
    const labelTexture=new THREE.CanvasTexture(labelCanvas);labelTexture.colorSpace=THREE.SRGBColorSpace;
    const label=new THREE.Mesh(new THREE.PlaneGeometry(.74,.21),new THREE.MeshBasicMaterial({map:labelTexture,transparent:true,depthWrite:false}));label.position.set(0,.19,-.123);label.userData.label=comp.id;drawer.add(label);interactive.push(label);
    const labelTarget=new THREE.Mesh(new THREE.PlaneGeometry(.85,.29),new THREE.MeshBasicMaterial({transparent:true,opacity:0,depthWrite:false}));labelTarget.position.set(0,.19,-.115);labelTarget.userData.label=comp.id;drawer.add(labelTarget);interactive.push(labelTarget);
    drawer.userData.labelCanvas=labelCanvas;drawer.userData.labelTexture=labelTexture;
    for(const dx of [-.33,.33]) sphere(drawer,.018,dx,.17,-.126,brass);
    sphere(drawer,.065,0,-.19,-.17,agedBrass);
    const ring=new THREE.Mesh(new THREE.TorusGeometry(.105,.022,8,18),brass);ring.position.set(0,-.26,-.11);ring.rotation.x=.28;ring.castShadow=true;drawer.add(ring);
    for(const x of [-.43,.43]) bevel(drawer,.07,.64,1.55,x,-.09,-.99,walnut,.018);
    bevel(drawer,.9,.055,1.55,0,.04,-.99,oak,.02);
    bevel(drawer,.79,.012,1.41,0,.075,-.99,velvet,.006);
    for(const x of [-.38,.38])rod(drawer,.011,1.39,x,.08,-.99,agedBrass,'z');
    bevel(drawer,.88,.055,.07,0,-.41,-1.73,walnutEdge,.012);
    bevel(drawer,.88,.39,.07,0,-.19,-1.69,walnut,.012);
  }
}

function buildDesk() {
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
  for(const x of [-4.25,4.25]){
    for(const z of [-.48,2.77]){bevel(desk,.54,1.47,.61,x,-.64,z,walnut,.06);bevel(desk,.66,.11,.69,x,-1.36,z,walnutEdge);}
    bevel(desk,1.4,1.06,3.42,x,-.47,1.15,walnut,.045);
    for(const y of [-.14,-.62,-1.1]){
      bevel(desk,1.27,.38,.08,x,y,3.12,walnutEdge,.025);
      frame(desk,x,y,1.17,.31,3.17,.025,agedBrass);
      sphere(desk,.045,x,y,3.24,brass);
    }
  }
  bevel(desk,4.92,.42,.14,0,-.23,3.38,walnutCross,.025);
  for(const x of [-2.4,2.4])carvedRosette(desk,x,-.23,3.47,.55);
  // Inkwell: stepped glass body, ink surface, hinged brass lid, and pedestal.
  const ink=new THREE.Group();ink.position.set(3.25,.46,.08);desk.add(ink);desk.userData.ink=ink;
  bevel(ink,.58,.07,.58,0,0,0,agedBrass,.025);
  bevel(ink,.46,.34,.46,0,.21,0,new THREE.MeshStandardMaterial({color:'#171a1a',metalness:.23,roughness:.16,transparent:true,opacity:.91}),.06);
  bevel(ink,.48,.055,.48,0,.40,0,brass,.02);
  const inkSurface=new THREE.Mesh(new THREE.CircleGeometry(.15,24),new THREE.MeshStandardMaterial({color:'#060b0e',metalness:.33,roughness:.09}));inkSurface.rotation.x=-Math.PI/2;inkSurface.position.y=.43;ink.add(inkSurface);
  const lid=new THREE.Group();lid.position.set(0,.43,-.2);ink.add(lid);bevel(lid,.5,.035,.48,0,0,-.04,agedBrass,.02);sphere(lid,.055,0,.06,-.03,brass);desk.userData.inkLid=lid;
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
buildCabinet(); buildDesk();

export function initScene(callback, sheetCallback) {
  onCompartment = callback;
  onSheet = sheetCallback;
  canvas.style.touchAction='none';
  const folderAt=event=>{const rect=canvas.getBoundingClientRect();pointer.set(((event.clientX-rect.left)/rect.width)*2-1,-((event.clientY-rect.top)/rect.height)*2+1);raycaster.setFromCamera(pointer,camera);const drawer=drawers.get(openDrawerId);const target=raycaster.intersectObjects(drawer?.userData.folderTabs||[])[0]?.object||raycaster.intersectObjects(drawer?.userData.folderHits||[])[0]?.object;return target?.userData.documentId?target.userData:null;};
  const ghost=document.createElement('div');ghost.className='drag-folder-ghost';document.body.append(ghost);
  const moveGhost=event=>{ghost.style.left=`${event.clientX}px`;ghost.style.top=`${event.clientY}px`;const button=document.querySelector('#write-button');const r=button.getBoundingClientRect();button.classList.toggle('drop-target',event.clientX>=r.left&&event.clientX<=r.right&&event.clientY>=r.top&&event.clientY<=r.bottom);};
  canvas.addEventListener('pointerdown',event=>{if(desk.visible)return;canvas.setPointerCapture(event.pointerId);pointers.set(event.pointerId,{x:event.clientX,y:event.clientY});pointerStart={x:event.clientX,y:event.clientY};gestureMoved=false;if(pointers.size===1&&openDrawerId)dragDocument=folderAt(event)||null;if(pointers.size===2){dragDocument=null;const [a,b]=[...pointers.values()];pinchDistance=Math.hypot(a.x-b.x,a.y-b.y);}});
  canvas.addEventListener('pointermove',event=>{if(!pointers.has(event.pointerId)||desk.visible)return;const last=pointers.get(event.pointerId);const dx=event.clientX-last.x,dy=event.clientY-last.y;pointers.set(event.pointerId,{x:event.clientX,y:event.clientY});if(Math.hypot(event.clientX-pointerStart.x,event.clientY-pointerStart.y)>7)gestureMoved=true;
    if(dragDocument){if(gestureMoved){ghost.classList.add('visible');moveGhost(event);}return;}
    if(pointers.size===2){const [a,b]=[...pointers.values()];const next=Math.hypot(a.x-b.x,a.y-b.y);if(pinchDistance>0){viewZoom=THREE.MathUtils.clamp(viewZoom*pinchDistance/next,.25,1.9);updateViewTarget();}pinchDistance=next;gestureMoved=true;}
    else if(gestureMoved){viewZoom=THREE.MathUtils.clamp(viewZoom*Math.exp(dy*.0025),.25,1.9);viewYaw=THREE.MathUtils.clamp(viewYaw-dx*.0018,-.34,.34);updateViewTarget();}
  });
  const release=event=>{if(dragDocument&&gestureMoved&&event.type==='pointerup'){const r=document.querySelector('#write-button').getBoundingClientRect();if(event.clientX>=r.left&&event.clientX<=r.right&&event.clientY>=r.top&&event.clientY<=r.bottom)onCompartment(dragDocument.compartment,'edit-folder',dragDocument.documentId);}dragDocument=null;ghost.classList.remove('visible');document.querySelector('#write-button').classList.remove('drop-target');pointers.delete(event.pointerId);if(pointers.size<2)pinchDistance=0;};canvas.addEventListener('pointerup',release);canvas.addEventListener('pointercancel',release);
  canvas.addEventListener('wheel',event=>{event.preventDefault();if(desk.visible)return;viewZoom=THREE.MathUtils.clamp(viewZoom*Math.exp(event.deltaY*.001),.25,1.9);updateViewTarget();},{passive:false});
  canvas.addEventListener('click', event => {
    if(gestureMoved){gestureMoved=false;return;}
    if (desk.visible) {
      if(!deskFolderOpen)return;
      const rect=canvas.getBoundingClientRect();
      pointer.set(((event.clientX-rect.left)/rect.width)*2-1,-((event.clientY-rect.top)/rect.height)*2+1);
      raycaster.setFromCamera(pointer,camera);
      const sheet=raycaster.intersectObjects(sheetHits)[0]?.object;
      if(sheet)onSheet(sheet.userData.sheetIndex);
      return;
    }
    const rect = canvas.getBoundingClientRect();
    pointer.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
    raycaster.setFromCamera(pointer, camera);
    const folderHit=folderAt(event);
    if(folderHit){onCompartment(folderHit.compartment,'folder',folderHit.documentId);return;}
    const hit = raycaster.intersectObjects(interactive)[0];
    if (hit?.object.userData.documentId) onCompartment(hit.object.userData.compartment,'folder',hit.object.userData.documentId);
    else if (hit?.object.userData.label) onCompartment(hit.object.userData.label,'label');
    else if (hit?.object.userData.compartment) onCompartment(hit.object.userData.compartment,'drawer');
  });
  resize(); window.addEventListener('resize', resize); requestAnimationFrame(render);
}

function resize() {
  const width = innerWidth, height = innerHeight;
  renderer.setSize(width, height, false);
  camera.aspect = width / height; camera.updateProjectionMatrix();
  if(desk.visible)showDesk();
}

function render(now) {
  requestAnimationFrame(render);
  if (now - lastFrame < (desk.visible ? 32 : 16)) return;
  lastFrame = now;
  if (animate) { camera.position.lerp(targetPosition, speed); currentLook.lerp(targetLook, speed); }
  else { camera.position.copy(targetPosition); currentLook.copy(targetLook); }
  for(const [id,drawer] of drawers) { const slide=drawer.userData.slide;if(!slide)continue;const t=animate?THREE.MathUtils.clamp((now-slide.start)/slideDuration,0,1):1;const eased=t*t*(3-2*t);drawer.position.z=THREE.MathUtils.lerp(slide.from,slide.to,eased);if(t===1)drawer.userData.slide=null; }
  if(desk.userData.inkLid)desk.userData.inkLid.rotation.x=THREE.MathUtils.lerp(desk.userData.inkLid.rotation.x,inkOpen?-1.85:0,.12);
  if(foldTop){foldTop.rotation.x=THREE.MathUtils.lerp(foldTop.rotation.x,foldTarget,.1);if(!paperFolded&&foldTop.rotation.x<.025)foldGroup.visible=false;}
  if(desk.userData.folderCover)desk.userData.folderCover.rotation.x=THREE.MathUtils.lerp(desk.userData.folderCover.rotation.x,deskFolderTarget,.075);
  if(cordInFlight&&desk.userData.looseCord){const target=desk.worldToLocal(desk.userData.folder.localToWorld(new THREE.Vector3(0,.10,.34)));desk.userData.looseCord.position.lerp(target,.16);desk.userData.looseCord.scale.multiplyScalar(.975);if(desk.userData.looseCord.position.distanceTo(target)<.07){cordInFlight=false;desk.userData.looseCord.visible=false;desk.userData.bundleBinding.visible=true;cordWrapProgress=0;}}
  else if(desk.userData.looseCord?.visible)desk.userData.looseCord.position.lerp(cordRestPosition(),.12);
  const binding=desk.userData.bundleBinding;
  if(binding?.visible){cordWrapProgress=Math.min(1,cordWrapProgress+.048);const ease=t=>t*t*(3-2*t);const length=ease(Math.min(1,cordWrapProgress/.55)),cross=ease(Math.max(0,Math.min(1,(cordWrapProgress-.25)/.55))),tie=ease(Math.max(0,Math.min(1,(cordWrapProgress-.72)/.28)));for(const strand of binding.userData.longStrands)strand.scale.y=Math.max(.001,length);binding.userData.crossStrand.scale.y=Math.max(.001,cross);binding.userData.knot.scale.setScalar(Math.max(.001,tie));for(const bow of binding.userData.bows)bow.scale.setScalar(Math.max(.001,tie));}
  if(desk.userData.folder){desk.userData.folder.position.lerp(deskFolderOpen?new THREE.Vector3(innerWidth<650?-1.72:-2.18,.445,1.16):new THREE.Vector3(0,.445,1.2),.075);const scale=deskFolderOpen?(innerWidth<650?.59:.72):1;desk.userData.folder.scale.lerp(new THREE.Vector3(scale,scale,scale),.075);}
  if(desk.userData.seal&&stampActive){stampProgress=Math.min(1,stampProgress+.025);const t=stampProgress;const travel=t<.38?t/.38:t<.7?1:Math.max(0,1-(t-.7)/.3);const lift=t<.38?Math.sin(t/.38*Math.PI/2)*.55:t<.55?Math.max(0,(.55-t)/.17)*.55:t<.7?0:Math.sin((t-.7)/.3*Math.PI)*.42;desk.userData.seal.position.set(3.66+(.17-3.66)*travel,.68+lift,2.35+(1.83-2.35)*travel);if(t>=.55&&!stampContact){stampContact=true;stampResolve?.();stampResolve=null;}if(t>=1){stampActive=false;desk.userData.seal.position.set(3.66,.68,2.35);}}
  if(desk.userData.flame)desk.userData.flame.scale.y=1.8+Math.sin(now*.016)*.12;
  camera.lookAt(currentLook);
  renderer.render(scene, camera);
}

export function showCabinet() { desk.visible = false; cabinet.visible = true; camera.zoom=1;camera.updateProjectionMatrix();slideDrawer(null);setBaseView(new THREE.Vector3(.2, 2.2, innerWidth < 650 ? 17 : 9.6),new THREE.Vector3(.5, 2.1, -1.3)); }
export function focusCompartment(id) { const c = compartments.find(item => item.id === id); if (!c) return; desk.visible = false; cabinet.visible = true;camera.zoom=1;camera.updateProjectionMatrix(); if(openDrawerId!==id)slideDrawer(id);setBaseView(new THREE.Vector3(c.x+.35, c.y+(innerWidth < 650 ? 5.2 : 5.3), innerWidth < 650 ? 8.8 : 6.5),new THREE.Vector3(c.x, c.y-.10, -.7)); }
export function setDrawerLabel(id,value){const drawer=drawers.get(id);if(!drawer)return;const {labelCanvas:canvas,labelTexture:texture}=drawer.userData;const context=canvas.getContext('2d');context.clearRect(0,0,canvas.width,canvas.height);const words=value.trim().split(/\s+/).filter(Boolean);let lines=[value];if(words.length>1&&value.length>10){let best=1;for(let i=2;i<words.length;i++)if(Math.abs(words.slice(0,i).join(' ').length-words.slice(i).join(' ').length)<Math.abs(words.slice(0,best).join(' ').length-words.slice(best).join(' ').length))best=i;lines=[words.slice(0,best).join(' '),words.slice(best).join(' ')];}context.fillStyle='#20140d';context.font='bold 72px Georgia';context.textAlign='center';context.textBaseline='middle';for(let i=0;i<lines.length;i++)context.fillText(lines[i],256,lines.length===1?82:48+i*68,474);texture.needsUpdate=true;}
export function setDrawerDocuments(id,docs){const drawer=drawers.get(id);if(!drawer)return;for(const mesh of drawer.userData.folderHits){const index=interactive.indexOf(mesh);if(index!==-1)interactive.splice(index,1);}drawer.userData.folderHits=[];drawer.userData.folderTabs=[];const stack=drawer.userData.folders;for(const child of [...stack.children])stack.remove(child);
  docs.slice(0,8).forEach((doc,i)=>{const folder=new THREE.Group();folder.position.set((i%2?-.025:.025),.13+i*.008,-2.12+i*.202);stack.add(folder);
    const pageCount=doc.pages?.length||1;const thickness=.012+Math.min(.13,Math.max(0,pageCount-1)*.00068);
    const cover=bevel(folder,.74,thickness,.77,0,0,0,bundlePaper,.009);cover.userData={compartment:id,documentId:doc.id};interactive.push(cover);drawer.userData.folderHits.push(cover);
    for(let layer=0;layer<Math.min(4,pageCount-1);layer++)bevel(folder,.735-layer*.003,.004,.765-layer*.003,(layer%2?-.003:.003),thickness/2+.003+layer*.004,0,bundlePaper,.002);
    const top=thickness/2+.004+Math.min(4,pageCount-1)*.004;
    const tab=new THREE.Mesh(new THREE.PlaneGeometry(.73,.17),new THREE.MeshBasicMaterial({colorWrite:false,side:THREE.DoubleSide,depthWrite:false}));tab.rotation.x=-Math.PI/2;tab.position.set(0,top+.004,.32);tab.userData={compartment:id,documentId:doc.id};folder.add(tab);drawer.userData.folderTabs.push(tab);
    if(pageCount>1&&(doc.bound??true)){for(const x of [-.16,.16])rod(folder,.006,.79,x,top+.005,0,cord,'z');rod(folder,.006,.75,0,top+.008,.12,cord,'x');}
    const labelCanvas=document.createElement('canvas');labelCanvas.width=256;labelCanvas.height=65;const ctx=labelCanvas.getContext('2d');ctx.fillStyle='#c5ab7d';ctx.fillRect(0,0,256,65);ctx.strokeStyle='#7a5b38';ctx.strokeRect(5,5,246,55);if(doc.title){ctx.fillStyle='#3b2a20';ctx.textAlign='center';ctx.textBaseline='middle';ctx.font='bold 23px Georgia';ctx.fillText(doc.title,128,33,236);}const texture=new THREE.CanvasTexture(labelCanvas);texture.colorSpace=THREE.SRGBColorSpace;
    if(doc.title){const tag=new THREE.Mesh(new THREE.PlaneGeometry(.55,.14),new THREE.MeshBasicMaterial({map:texture,side:THREE.DoubleSide}));tag.rotation.x=-Math.PI/2;tag.position.set(0,top+.012,-.14);folder.add(tag);}
  });
}
export function showDesk() { const entering=!desk.visible;desk.visible = true; cabinet.visible = false;const mobile=innerWidth<650;if(entering)deskZoom=mobile?1.2:1;desk.userData.ink.position.x=mobile?1.4:3.25;desk.userData.candleGroup.position.x=mobile?2.04:0;camera.zoom=deskZoom;camera.updateProjectionMatrix();setBaseView(new THREE.Vector3(0,mobile?9.5:11,mobile?12:9),new THREE.Vector3(0,.25,1.1)); }
export function setDeskZoom(value){if(!desk.visible)return;deskZoom=THREE.MathUtils.clamp(value,.32,3.6);camera.zoom=deskZoom;camera.updateProjectionMatrix();}
export function getDeskZoom(){return deskZoom;}
export function getInkwellScreenPosition(){
  desk.updateWorldMatrix(true,false);
  const point=desk.localToWorld(new THREE.Vector3(desk.userData.ink.position.x,.90,.08));
  point.project(camera);
  const rect=canvas.getBoundingClientRect();
  return {x:rect.left+(point.x+1)*rect.width/2,y:rect.top+(1-point.y)*rect.height/2};
}
export function getDeskFolderScreenBounds(){
  if(!desk.visible||!desk.userData.folder)return null;
  const folder=desk.userData.folder;folder.updateWorldMatrix(true,false);camera.updateMatrixWorld();
  const rect=canvas.getBoundingClientRect();
  const points=[[-1.6,-1.15],[1.6,-1.15],[-1.6,1.15],[1.6,1.15]].map(([x,z])=>{const p=folder.localToWorld(new THREE.Vector3(x,.08,z)).project(camera);return {x:rect.left+(p.x+1)*rect.width/2,y:rect.top+(1-p.y)*rect.height/2};});
  const xs=points.map(p=>p.x),ys=points.map(p=>p.y);return {x:(Math.min(...xs)+Math.max(...xs))/2,y:(Math.min(...ys)+Math.max(...ys))/2,width:Math.max(90,Math.max(...xs)-Math.min(...xs)),height:Math.max(55,Math.max(...ys)-Math.min(...ys))};
}
export function getLooseCordScreenPosition(){if(!desk.visible||!desk.userData.looseCord)return null;desk.updateWorldMatrix(true,false);camera.updateMatrixWorld();const p=desk.userData.looseCord.getWorldPosition(new THREE.Vector3()).project(camera);const rect=canvas.getBoundingClientRect();return {x:rect.left+(p.x+1)*rect.width/2,y:rect.top+(1-p.y)*rect.height/2};}
export function setBundleBound(bound,animateCord=false){const loose=desk.userData.looseCord,binding=desk.userData.bundleBinding;if(!loose||!binding)return;cordInFlight=Boolean(bound&&animateCord);cordWrapProgress=cordInFlight?0:1;loose.position.copy(cordRestPosition());loose.scale.setScalar(1);loose.visible=!bound||cordInFlight;binding.visible=Boolean(bound&&!cordInFlight&&bundlePageCount>1);}
export function getDeskPaperScreenBounds(){
  if(!desk.visible)return null;desk.updateWorldMatrix(true,false);camera.updateMatrixWorld();const rect=canvas.getBoundingClientRect();
  const points=[[-.90,-.33],[.90,-.33],[-.90,2.77],[.90,2.77]].map(([x,z])=>{const p=desk.localToWorld(new THREE.Vector3(x,.442,z)).project(camera);return {x:rect.left+(p.x+1)*rect.width/2,y:rect.top+(1-p.y)*rect.height/2};});
  const xs=points.map(p=>p.x),ys=points.map(p=>p.y);return {x:(Math.min(...xs)+Math.max(...xs))/2,y:(Math.min(...ys)+Math.max(...ys))/2,width:Math.max(...xs)-Math.min(...xs),height:Math.max(...ys)-Math.min(...ys)};
}
export function applySceneSettings(settings) {
  const ratio = settings.quality === 'high' ? Math.min(devicePixelRatio, 2) : settings.quality === 'medium' ? Math.min(devicePixelRatio, 1.5) : 1;
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
