import * as THREE from 'three';
import { OrbitControls } from './vendor/OrbitControls.js';
import { RoomEnvironment } from './vendor/RoomEnvironment.js';
import { createCookieWalk } from './cookie-walk.js?v=20261031-walk';

const stage = document.querySelector('#tree-stage');
const host = document.querySelector('#tree-canvas');
const controlsBar = document.querySelector('#tree-controls');
const motionPreference = matchMedia('(prefers-reduced-motion: reduce)');
const smallScreen = matchMedia('(max-width: 760px)').matches;
const UP = new THREE.Vector3(0, 1, 0);
const TAU = Math.PI * 2;
let seed = 12252026;
const random = () => { seed = (1664525 * seed + 1013904223) >>> 0; return seed / 4294967296; };
const range = (min, max) => min + random() * (max - min);
const radiusAt = y => Math.max(.06, 2.76 * Math.pow(Math.max(0, (7.2 - y) / 6.4), .92));

function restoreFallback() {
  stage.classList.remove('tree-3d-ready');
  stage.dataset.renderer = 'fallback';
  controlsBar.hidden = true;
  document.querySelector('#walk-toggle').hidden = true;
  for (const button of stage.querySelectorAll('.ornament')) {
    const width=host.clientWidth,height=host.clientHeight;
    const illustrationWidth=Math.min(width,height*600/760),illustrationHeight=illustrationWidth*760/600;
    button.style.setProperty('--x', `${(width-illustrationWidth)/2+Number(button.dataset.slotX)*illustrationWidth/100}px`);
    button.style.setProperty('--y', `${(height-illustrationHeight)/2+Number(button.dataset.slotY)*illustrationHeight/100}px`);
    button.style.visibility = '';
  }
}

async function createScene() {
  const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, smallScreen ? 1.5 : 1.8));
  renderer.setClearColor(0x09140e, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.35;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  const canvas = renderer.domElement;
  canvas.setAttribute('aria-label', '입체 크리스마스트리. 좌우 방향키나 마우스로 돌리고, 더하기와 빼기 키로 가까이 볼 수 있어요.');
  canvas.setAttribute('role', 'img');
  canvas.tabIndex = 0;
  host.append(canvas);

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2('#111e16', .014);
  const camera = new THREE.PerspectiveCamera(38, 1, .1, 60);
  const controls = new OrbitControls(camera, canvas);
  let walk = null;
  controls.enableDamping = true;
  controls.dampingFactor = .08;
  controls.enablePan = false;
  // OrbitControls handles mouse dragging only. Native wheel and touch scrolling
  // must reach the page rather than being consumed as camera gestures.
  controls.enableZoom = false;
  controls.minDistance = 9.5;
  controls.maxDistance = 17;
  canvas.style.touchAction = 'pan-y pinch-zoom';
  // Clicking a very tall focusable canvas can make the browser jump down to
  // reveal it. Keep pointer gestures in place; Tab still focuses it normally.
  canvas.addEventListener('mousedown',event=>event.preventDefault());
  let touchGesture=null;
  canvas.addEventListener('pointerdown',event=>{
    if(event.pointerType!=='touch'||walk?.enabled)return;
    touchGesture=event.isPrimary?{id:event.pointerId,x:event.clientX,y:event.clientY,lastX:event.clientX,axis:null}:null;
    event.stopImmediatePropagation();
  },{capture:true,passive:true});
  controls.rotateSpeed = .48;
  controls.minPolarAngle = Math.PI * .36;
  controls.maxPolarAngle = Math.PI * .55;
  controls.target.set(0, 3.62, 0);
  const resetCamera = () => { camera.position.set(.15, 3.15, smallScreen ? 12.6 : 12.4); controls.target.set(0, 3.62, 0); controls.update(); };
  resetCamera();

  const pmrem = new THREE.PMREMGenerator(renderer);
  const room = new RoomEnvironment();
  const environment = pmrem.fromScene(room, .06);
  scene.environment = environment.texture;
  scene.environmentIntensity = .48;
  room.dispose();
  pmrem.dispose();
  scene.add(new THREE.HemisphereLight('#dce9d8', '#182319', 1.25));
  const key = new THREE.DirectionalLight('#ffe9bd', 3.2);
  key.position.set(-4, 8, 6);
  key.castShadow = true;
  key.shadow.mapSize.set(smallScreen ? 1024 : 2048, smallScreen ? 1024 : 2048);
  Object.assign(key.shadow.camera, { left: -4.5, right: 4.5, top: 8, bottom: -2, near: .5, far: 24 });
  key.shadow.bias = -.0003;
  key.shadow.normalBias = .025;
  scene.add(key);
  const rim = new THREE.DirectionalLight('#b7cbd5', 2.1);
  rim.position.set(4, 7, -4);
  scene.add(rim);
  const warmFill = new THREE.PointLight('#ffc277', 15, 12, 2);
  warmFill.position.set(-2.5, 2.5, 4);
  scene.add(warmFill);

  const tree = new THREE.Group();
  scene.add(tree);
  const materials = {
    green: new THREE.MeshStandardMaterial({ color: '#64785b', roughness: .8, metalness: .03, side: THREE.DoubleSide }),
    bark: new THREE.MeshStandardMaterial({ color: '#52402b', roughness: .97 }),
    gold: new THREE.MeshPhysicalMaterial({ color: '#dcb968', metalness: .92, roughness: .22, clearcoat: .5 }),
    red: new THREE.MeshPhysicalMaterial({ color: '#9c2520', metalness: .52, roughness: .19, clearcoat: 1 }),
    sage: new THREE.MeshPhysicalMaterial({ color: '#6c8260', metalness: .25, roughness: .38, clearcoat: .35 }),
    cream: new THREE.MeshStandardMaterial({ color: '#ebdbb7', roughness: .72 }),
    seal: new THREE.MeshPhysicalMaterial({ color: '#8c2b25', roughness: .38, clearcoat: .6 }),
    ribbon: new THREE.MeshStandardMaterial({ color: '#be9c50', metalness: .7, roughness: .35 })
  };
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(.055, .18, 6.6, 12), materials.bark);
  trunk.position.y = 3.55;
  trunk.castShadow = true;
  tree.add(trunk);

  // A single instanced draw holds the needles. Each is a tapered, faceted blade,
  // oriented around a real three-dimensional twig rather than a flat tree layer.
  const blade = new THREE.BufferGeometry();
  blade.setAttribute('position', new THREE.Float32BufferAttribute([
    0,0,0, -.012,.055,0, 0,.15,0,
    0,0,0, 0,.15,0, .012,.055,0,
    0,0,0, 0,.055,.009, 0,.15,0,
    0,0,0, 0,.15,0, 0,.055,-.009
  ], 3));
  blade.computeVertexNormals();
  const matrices = [], colors = [], stems = [];
  const dummy = new THREE.Object3D(), shade = new THREE.Color();
  const stemMatrix = new THREE.Object3D();
  function stem(a, b, radius) {
    const direction = b.clone().sub(a);
    stemMatrix.position.copy(a).add(b).multiplyScalar(.5);
    stemMatrix.quaternion.setFromUnitVectors(UP, direction.clone().normalize());
    stemMatrix.scale.set(radius, direction.length(), radius);
    stemMatrix.updateMatrix();
    stems.push(stemMatrix.matrix.clone());
  }
  function sprig(a, b, density) {
    const direction = b.clone().sub(a).normalize();
    const perpendicular = new THREE.Vector3().crossVectors(direction, UP).normalize();
    const other = new THREE.Vector3().crossVectors(direction, perpendicular).normalize();
    stem(a, b, .004);
    for (let n = 0; n < density; n++) {
      const t = (n + .25) / density;
      const center = a.clone().lerp(b, t);
      for (let k = 0; k < (smallScreen ? 3 : 4); k++) {
        const angle = k * TAU / (smallScreen ? 3 : 4) + n * 2.4 + range(-.3, .3);
        const pointing = direction.clone().multiplyScalar(.48)
          .addScaledVector(perpendicular, Math.cos(angle) * .9)
          .addScaledVector(other, Math.sin(angle) * .7).normalize();
        dummy.position.copy(center);
        dummy.quaternion.setFromUnitVectors(UP, pointing);
        const size = range(.55, 1.05) * (1 - .25 * t);
        dummy.scale.set(size * range(.7, 1.15), size, size);
        dummy.updateMatrix();
        matrices.push(dummy.matrix.clone());
        shade.setHSL(range(.285, .35), range(.3, .5), range(.12, .245));
        colors.push(shade.clone());
      }
    }
  }
  const levels = smallScreen ? 23 : 28;
  for (let level = 0; level < levels; level++) {
    const fraction = level / (levels - 1);
    const height = .91 + fraction * 6.15;
    const length = radiusAt(height) * range(.92, 1.04);
    const branches = Math.round(12 - fraction * 7);
    for (let branch = 0; branch < branches; branch++) {
      const angle = branch * TAU / branches + level * 2.399 + range(-.13, .13);
      const c = Math.cos(angle), s = Math.sin(angle);
      const steps = smallScreen ? 7 : 10;
      const point = t => new THREE.Vector3(c * length * t,
        height - Math.sin(t * Math.PI * .76) * (.18 + length * .12) + t * t * .18,
        s * length * t);
      let previous = point(0);
      for (let j = 1; j <= steps; j++) {
        const t = j / steps, center = point(t);
        stem(previous, center, .005 + (1 - t) * .013 * (1 - fraction * .5));
        previous = center;
        for (const side of [-1, 1]) {
          const twigAngle = angle + side * range(.65, 1.14);
          const twigLength = (.16 + (1 - t) * .38) * (1 - fraction * .6);
          const end = center.clone().add(new THREE.Vector3(Math.cos(twigAngle) * twigLength, range(.02, .12), Math.sin(twigAngle) * twigLength));
          sprig(center, end, smallScreen ? 9 : 11);
        }
      }
      const tip = point(.95);
      sprig(tip, point(1.08).add(new THREE.Vector3(0, .05, 0)), 8);
    }
  }
  const needles = new THREE.InstancedMesh(blade, materials.green, matrices.length);
  for (let i = 0; i < matrices.length; i++) { needles.setMatrixAt(i, matrices[i]); needles.setColorAt(i, colors[i]); }
  needles.instanceMatrix.needsUpdate = true;
  needles.instanceColor.needsUpdate = true;
  needles.castShadow = true;
  needles.receiveShadow = true;
  needles.computeBoundingSphere();
  tree.add(needles);
  const branches = new THREE.InstancedMesh(new THREE.CylinderGeometry(.6, 1, 1, 5), materials.bark, stems.length);
  stems.forEach((matrix, index) => branches.setMatrixAt(index, matrix));
  branches.instanceMatrix.needsUpdate = true;
  branches.castShadow = true;
  tree.add(branches);
  matrices.length = 0; colors.length = 0; stems.length = 0;

  // Warm bulbs travel around the entire tree, with the far side naturally hidden.
  const wirePoints = [], bulbPoints = [], phases = [];
  const turns = 11.5, bulbCount = 330;
  for (let i = 0; i < bulbCount; i++) {
    const t = i / (bulbCount - 1), y = 6.96 - t * 6.07;
    const angle = t * turns * TAU;
    const radius = radiusAt(y) * 1.015;
    const position = new THREE.Vector3(Math.sin(angle) * radius, y, Math.cos(angle) * radius);
    wirePoints.push(position);
    bulbPoints.push(position.x, position.y - .02, position.z);
    phases.push(random() * TAU);
  }
  const wireCurve = new THREE.CatmullRomCurve3(wirePoints);
  const wire = new THREE.Mesh(new THREE.TubeGeometry(wireCurve, 800, .005, 4, false), new THREE.MeshStandardMaterial({ color: '#64603b', metalness: .55, roughness: .65 }));
  tree.add(wire);
  const lightMaterial = new THREE.MeshBasicMaterial({ color: '#ffe4a4', toneMapped: false });
  const bulbs = new THREE.InstancedMesh(new THREE.SphereGeometry(.021, 7, 5), lightMaterial, bulbCount);
  for (let i = 0; i < bulbCount; i++) { dummy.position.fromArray(bulbPoints, i * 3);dummy.quaternion.identity();dummy.scale.set(1, 1.45, 1);dummy.updateMatrix();bulbs.setMatrixAt(i, dummy.matrix); }
  bulbs.instanceMatrix.needsUpdate = true;
  tree.add(bulbs);
  const glowGeometry = new THREE.BufferGeometry();
  glowGeometry.setAttribute('position', new THREE.Float32BufferAttribute(bulbPoints, 3));
  glowGeometry.setAttribute('phase', new THREE.Float32BufferAttribute(phases, 1));
  const glowMaterial = new THREE.ShaderMaterial({
    uniforms: { time: { value: 0 }, pixelRatio: { value: renderer.getPixelRatio() }, still: { value: motionPreference.matches ? 1 : 0 } },
    vertexShader: `attribute float phase; uniform float time; uniform float pixelRatio; uniform float still; varying float brightness;
      void main(){ vec4 p=modelViewMatrix*vec4(position,1.); brightness=mix(.73+.27*sin(time*.85+phase),.9,still); gl_Position=projectionMatrix*p; gl_PointSize=min(110.,330.*pixelRatio/max(1.,-p.z)); }`,
    fragmentShader: `varying float brightness; void main(){ float r=length(gl_PointCoord-.5)*2.; if(r>1.)discard; float halo=exp(-r*r*5.)*.26; float core=exp(-r*r*80.)*.72; gl_FragColor=vec4(vec3(1.,.66,.24)*brightness,(halo+core)*brightness); }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false
  });
  const glows = new THREE.Points(glowGeometry, glowMaterial);
  glows.renderOrder = 2;
  tree.add(glows);

  const baubleGeometry = new THREE.SphereGeometry(1, 20, 14);
  const baubleMaterials = [materials.red, materials.gold, new THREE.MeshPhysicalMaterial({ color: '#bdbb94', metalness: .7, roughness: .27, clearcoat: .65 })];
  for (let palette = 0; palette < 3; palette++) {
    const count = palette === 0 ? 52 : 36;
    const baubles = new THREE.InstancedMesh(baubleGeometry, baubleMaterials[palette], count);
    const caps = new THREE.InstancedMesh(new THREE.CylinderGeometry(.035, .035, .045, 8), materials.gold, count);
    for (let i = 0; i < count; i++) {
      const y = range(1.05, 6.6), angle = random() * TAU, radius = radiusAt(y) * range(.95, 1.025), size = range(.065, .115);
      dummy.position.set(Math.sin(angle) * radius, y, Math.cos(angle) * radius);
      dummy.quaternion.identity();dummy.scale.setScalar(size);dummy.updateMatrix();baubles.setMatrixAt(i, dummy.matrix);
      dummy.position.y += size;dummy.scale.setScalar(.7);dummy.updateMatrix();caps.setMatrixAt(i, dummy.matrix);
    }
    baubles.instanceMatrix.needsUpdate = true;caps.instanceMatrix.needsUpdate = true;
    baubles.castShadow = true;baubles.receiveShadow = true;tree.add(baubles, caps);
  }

  function starGeometry(radius, depth = .07) {
    const shape = new THREE.Shape();
    for (let i = 0; i < 10; i++) {
      const angle = Math.PI / 2 + i * TAU / 10, r = i % 2 ? radius * .46 : radius;
      if (!i) shape.moveTo(Math.cos(angle) * r, Math.sin(angle) * r);
      else shape.lineTo(Math.cos(angle) * r, Math.sin(angle) * r);
    }
    shape.closePath();
    const geometry = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelSegments: 2, steps: 1, bevelSize: radius * .09, bevelThickness: .035 });
    geometry.translate(0, 0, -depth / 2);
    return geometry;
  }
  const topper = new THREE.Mesh(starGeometry(.34, .12), materials.gold);
  topper.position.y = 7.34;
  topper.rotation.y = -.12;
  topper.castShadow = true;
  tree.add(topper);
  const topperLight = new THREE.PointLight('#ffcd7b', 3.5, 3, 2);
  topperLight.position.set(0, 7.3, .4);
  tree.add(topperLight);

  function gift(width, height, depth, material) {
    const group = new THREE.Group();
    const box = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), material);
    box.castShadow = true;box.receiveShadow = true;group.add(box);
    const lid = new THREE.Mesh(new THREE.BoxGeometry(width + .035, .055, depth + .035), material);
    lid.position.y = height / 2;lid.castShadow = true;group.add(lid);
    const ribbon = new THREE.Mesh(new THREE.BoxGeometry(width * .14, height + .06, depth + .042), materials.ribbon);
    group.add(ribbon);
    const cross = new THREE.Mesh(new THREE.BoxGeometry(width + .042, height + .065, depth * .14), materials.ribbon);
    group.add(cross);
    for (const side of [-1, 1]) {
      const loop = new THREE.Mesh(new THREE.TorusGeometry(width * .15, width * .018, 5, 20), materials.ribbon);
      loop.position.set(side * width * .12, height / 2 + width * .1, 0);
      loop.scale.set(1, .6, 1);loop.rotation.y = side * .4;loop.rotation.z = side * .25;group.add(loop);
    }
    return group;
  }
  const presents = [
    [-1.45,.24,1.35,.75,.45,.58,materials.red,-.2],
    [1.3,.21,1.25,.7,.38,.57,materials.cream,.25],
    [1.85,.39,.75,.5,.76,.5,materials.sage,-.18],
    [-1.94,.2,.65,.4,.36,.4,materials.gold,.25]
  ];
  for (const [x,y,z,w,h,d,material,rotation] of presents) { const present = gift(w,h,d,material);present.position.set(x,y,z);present.rotation.y=rotation;tree.add(present); }
  const skirt = new THREE.Mesh(new THREE.CylinderGeometry(1.18, 1.36, .08, 64), new THREE.MeshStandardMaterial({ color: '#131e17', roughness: 1, envMapIntensity: .1 }));
  skirt.position.y=.035;skirt.receiveShadow=true;tree.add(skirt);
  const floor = new THREE.Mesh(new THREE.CircleGeometry(10, 80), new THREE.ShadowMaterial({ opacity: .12 }));
  floor.rotation.x = -Math.PI/2;floor.position.y = -.025;floor.receiveShadow = true;scene.add(floor);
  const contactCanvas = document.createElement('canvas');contactCanvas.width=256;contactCanvas.height=256;
  const context = contactCanvas.getContext('2d'), gradient = context.createRadialGradient(128,128,20,128,128,128);
  gradient.addColorStop(0,'rgba(0,0,0,.55)');gradient.addColorStop(.4,'rgba(0,0,0,.4)');gradient.addColorStop(1,'rgba(0,0,0,0)');context.fillStyle=gradient;context.fillRect(0,0,256,256);
  const contactTexture = new THREE.CanvasTexture(contactCanvas);
  const contact = new THREE.Mesh(new THREE.PlaneGeometry(8,8),new THREE.MeshBasicMaterial({map:contactTexture,transparent:true,depthWrite:false}));
  contact.rotation.x=-Math.PI/2;contact.position.y=-.012;scene.add(contact);

  const letterModels = new Map();
  let needsRender = true, active = true, lastFrame = 0;
  const projected = new THREE.Vector3(), viewNormal = new THREE.Vector3(), cameraDirection = new THREE.Vector3();
  function letterModel(type) {
    const group = new THREE.Group();
    if (type === 'star') group.add(new THREE.Mesh(starGeometry(.23), materials.gold));
    else if (type === 'bauble') {
      const ball = new THREE.Mesh(new THREE.SphereGeometry(.19,24,18),materials.red);group.add(ball);
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(.045,.045,.055,10),materials.gold);cap.position.y=.21;group.add(cap);
      const smallStar = new THREE.Mesh(starGeometry(.072,.006),materials.gold);smallStar.position.z=.185;group.add(smallStar);
    } else if (type === 'gift') group.add(gift(.34,.3,.2,materials.sage));
    else {
      const envelope = new THREE.Mesh(new THREE.BoxGeometry(.44,.29,.028),materials.cream);group.add(envelope);
      const flap = new THREE.Shape();flap.moveTo(-.22,.145);flap.lineTo(.22,.145);flap.lineTo(0,-.045);flap.closePath();
      const paperFlap = new THREE.Mesh(new THREE.ShapeGeometry(flap),new THREE.MeshStandardMaterial({color:'#f5e6c8',roughness:.85,side:THREE.DoubleSide}));paperFlap.position.z=.017;group.add(paperFlap);
      const wax = new THREE.Mesh(new THREE.CylinderGeometry(.043,.043,.012,18),materials.seal);wax.rotation.x=Math.PI/2;wax.position.set(0,-.035,.029);group.add(wax);
    }
    const thread = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0,.15,0),new THREE.Vector3(0,.35,0)]),new THREE.LineBasicMaterial({color:'#c7ad73'}));
    group.add(thread);
    group.traverse(child=>{if(child.isMesh){child.castShadow=true;child.receiveShadow=true;}});
    return group;
  }
  function syncLetters() {
    for (const { model } of letterModels.values()) { tree.remove(model);model.traverse(child=>{child.geometry?.dispose();}); }
    letterModels.clear();
    for (const button of stage.querySelectorAll('.ornament')) {
      const xFraction = (Number(button.dataset.slotX) - 50) / 38;
      const y = (92 - Number(button.dataset.slotY)) * .082;
      const radius = radiusAt(y) * 1.035;
      const angle = Math.asin(THREE.MathUtils.clamp(xFraction,-.9,.9));
      const model = letterModel(button.dataset.decoration);
      model.position.set(Math.sin(angle)*radius,y,Math.cos(angle)*radius+.09);
      model.rotation.set(0,angle*.68,range(-.12,.12));
      tree.add(model);
      const normal = new THREE.Vector3(Math.sin(angle),0,Math.cos(angle));
      letterModels.set(button,{model,normal,hover:false});
      const highlight = on => { const item=letterModels.get(button);if(!item)return;item.hover=on;item.model.scale.setScalar(on?1.16:1);needsRender=true; };
      button.addEventListener('mouseenter',()=>highlight(true));button.addEventListener('mouseleave',()=>highlight(false));
      button.addEventListener('focus',()=>highlight(true));button.addEventListener('blur',()=>highlight(false));
    }
    needsRender=true;
    updateLetterTargets();
  }
  function updateLetterTargets() {
    const width=host.clientWidth,height=host.clientHeight;
    for (const [button,{model,normal}] of letterModels) {
      model.getWorldPosition(projected);
      cameraDirection.copy(camera.position).sub(projected).normalize();
      projected.project(camera);
      viewNormal.copy(normal).transformDirection(tree.matrixWorld);
      const visible=viewNormal.dot(cameraDirection)>.08 && projected.z<1 && Math.abs(projected.x)<1.07 && Math.abs(projected.y)<1.05;
      button.style.visibility=visible?'':'hidden';
      button.style.setProperty('--x',`${(projected.x*.5+.5)*width}px`);
      button.style.setProperty('--y',`${(-projected.y*.5+.5)*height}px`);
    }
    stage.dataset.azimuth=controls.getAzimuthalAngle().toFixed(3);
  }
  function resize() {
    const width=host.clientWidth,height=host.clientHeight;
    if(!width||!height)return;
    camera.aspect=width/height;
    // A narrow viewport fits the whole 3D silhouette while preserving its height.
    camera.fov=walk?.enabled?(matchMedia('(max-width: 760px)').matches?62:58):(matchMedia('(max-width: 760px)').matches?42:38);
    camera.updateProjectionMatrix();renderer.setSize(width,height,false);needsRender=true;
  }
  const observer=new ResizeObserver(resize);observer.observe(host);resize();
  stage.addEventListener('letterschange',syncLetters);syncLetters();
  const orbit = angle => {
    const offset=camera.position.clone().sub(controls.target).applyAxisAngle(UP,angle);
    camera.position.copy(controls.target).add(offset);controls.update();needsRender=true;
  };
  // A horizontal swipe rotates; a vertical swipe stays entirely native. Waiting
  // for direction before capture is especially important for scrolling in Safari.
  canvas.addEventListener('pointermove',event=>{
    if(walk?.enabled||!touchGesture||event.pointerId!==touchGesture.id)return;
    const dx=event.clientX-touchGesture.x,dy=event.clientY-touchGesture.y;
    if(!touchGesture.axis&&Math.max(Math.abs(dx),Math.abs(dy))>9){
      touchGesture.axis=Math.abs(dx)>Math.abs(dy)*1.15?'horizontal':'vertical';
      if(touchGesture.axis==='horizontal')canvas.setPointerCapture(event.pointerId);
    }
    if(touchGesture.axis==='horizontal')orbit(-(event.clientX-touchGesture.lastX)*.006);
    touchGesture.lastX=event.clientX;
  },{passive:true});
  const endTouch=event=>{
    if(touchGesture?.id!==event.pointerId)return;
    if(canvas.hasPointerCapture(event.pointerId))canvas.releasePointerCapture(event.pointerId);
    touchGesture=null;
  };
  canvas.addEventListener('pointerup',endTouch,{passive:true});
  canvas.addEventListener('pointercancel',endTouch,{passive:true});
  document.querySelector('#rotate-left').addEventListener('click',()=>orbit(-.35));
  document.querySelector('#rotate-right').addEventListener('click',()=>orbit(.35));
  document.querySelector('#reset-view').addEventListener('click',()=>{resetCamera();needsRender=true;});
  canvas.addEventListener('keydown',event=>{
    if(walk?.enabled)return;
    if(!['ArrowLeft','ArrowRight','+','=','-','0'].includes(event.key))return;
    event.preventDefault();
    if(event.key==='ArrowLeft')orbit(-.18);
    else if(event.key==='ArrowRight')orbit(.18);
    else if(event.key==='0')resetCamera();
    else {
      const offset=camera.position.clone().sub(controls.target),factor=event.key==='-'?1.08:.93;
      offset.setLength(THREE.MathUtils.clamp(offset.length()*factor,9.5,17));camera.position.copy(controls.target).add(offset);controls.update();
    }
    needsRender=true;
  });
  controls.addEventListener('change',()=>{needsRender=true;});
  document.querySelector('#walk-toggle').addEventListener('click',()=>{
    if(!walk)walk=createCookieWalk({scene,camera,controls,canvas,stage,motionPreference,
      requestRender:()=>{needsRender=true;},
      onModeChange:enabled=>{
        touchGesture=null;
        renderer.toneMappingExposure=enabled ? .95 : 1.35;
        renderer.setPixelRatio(Math.min(devicePixelRatio,enabled?(smallScreen?1.15:1.4):(smallScreen?1.5:1.8)));
        resize();needsRender=true;
      }
    });
    walk.setEnabled(!walk.enabled);
  });
  motionPreference.addEventListener('change',()=>{glowMaterial.uniforms.still.value=motionPreference.matches?1:0;needsRender=true;});
  document.addEventListener('visibilitychange',()=>{needsRender=true;});
  canvas.addEventListener('webglcontextlost',event=>{event.preventDefault();active=false;if(walk?.enabled)walk.setEnabled(false);restoreFallback();});
  await renderer.compileAsync(scene,camera);
  renderer.render(scene,camera);updateLetterTargets();
  stage.classList.add('tree-3d-ready');stage.dataset.renderer='webgl';
  stage.dataset.needles=String(needles.count);controlsBar.hidden=false;
  document.querySelector('#walk-toggle').disabled=false;
  if(new URLSearchParams(location.search).get('walk')==='1')document.querySelector('#walk-toggle').click();
  function frame(time) {
    if(!active)return;
    requestAnimationFrame(frame);
    if(document.hidden||time-lastFrame<33)return;
    const delta=Math.min((time-lastFrame)/1000,.05);lastFrame=time;
    controls.update();
    if(document.querySelector('dialog[open]')){walk?.stop();return;}
    if(walk?.update(delta))needsRender=true;
    if(!motionPreference.matches){glowMaterial.uniforms.time.value=time*.001;needsRender=true;}
    if(needsRender){renderer.render(scene,camera);updateLetterTargets();needsRender=false;}
  }
  requestAnimationFrame(frame);
  window.addEventListener('pagehide',event=>{
    if(event.persisted)return;
    active=false;observer.disconnect();walk?.dispose();controls.dispose();environment.dispose();contactTexture.dispose();
    scene.traverse(object=>{object.geometry?.dispose();});
    for(const material of Object.values(materials))material.dispose();
    renderer.dispose();
  },{once:true});
}

createScene().catch(error=>{
  console.warn('3D tree is unavailable; keeping the accessible illustrated tree.',error.message);
  host.replaceChildren();restoreFallback();
});
stage.addEventListener('letterschange',()=>{if(stage.dataset.renderer==='fallback')restoreFallback();});
new ResizeObserver(()=>{if(stage.dataset.renderer==='fallback')restoreFallback();}).observe(host);
