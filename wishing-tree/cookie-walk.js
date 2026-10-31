import * as THREE from 'three';

const UP = new THREE.Vector3(0, 1, 0);
const TAU = Math.PI * 2;
const motion = Object.freeze({ speed: 2.15, follow: 9, turn: 12, stride: 10, clearance: 3.35, boundary: 10 });

/** A local, single-player walk through the existing shared letter tree. */
export function createCookieWalk({ scene, camera, controls, canvas, stage, motionPreference, requestRender, onModeChange }) {
  const world = new THREE.Group();
  world.visible = false;
  scene.add(world);
  const toggle = document.querySelector('#walk-toggle');
  const hud = document.querySelector('#walk-hud');
  const status = document.querySelector('#walk-status');
  const materials = {
    snow: new THREE.MeshStandardMaterial({ color: '#49636b', roughness: .95, metalness: .02 }),
    cookie: new THREE.MeshStandardMaterial({ color: '#9b592a', roughness: .78 }),
    edge: new THREE.MeshStandardMaterial({ color: '#603e25', roughness: .9 }),
    icing: new THREE.MeshStandardMaterial({ color: '#fff0d3', roughness: .66 }),
    eyes: new THREE.MeshStandardMaterial({ color: '#30231d', roughness: .45 }),
    red: new THREE.MeshStandardMaterial({ color: '#a63732', roughness: .7 }),
    green: new THREE.MeshStandardMaterial({ color: '#345644', roughness: .9 }),
    wood: new THREE.MeshStandardMaterial({ color: '#544b3b', roughness: .93 }),
    gold: new THREE.MeshStandardMaterial({ color: '#c5a361', metalness: .65, roughness: .3 }),
    window: new THREE.MeshBasicMaterial({ color: '#ffd693', toneMapped: false }),
    dark: new THREE.MeshStandardMaterial({ color: '#172a27', roughness: .8 })
  };
  const ownedTextures = [];
  const unitSphere = new THREE.SphereGeometry(1, 18, 12);
  const unitBox = new THREE.BoxGeometry(1, 1, 1);
  function mesh(geometry, material, parent, position, scale) {
    const object = new THREE.Mesh(geometry, material);
    if (position) object.position.set(...position);
    if (scale) object.scale.set(...scale);
    object.castShadow = true;
    object.receiveShadow = true;
    parent.add(object);
    return object;
  }
  const box = (parent, material, p, s) => mesh(unitBox, material, parent, p, s);
  const ball = (parent, material, p, s) => mesh(unitSphere, material, parent, p, s);

  const floor = mesh(new THREE.CircleGeometry(34, 80), materials.snow, world, [0, -.045, 0]);
  floor.rotation.x = -Math.PI / 2;
  floor.castShadow = false;
  // A circular path makes the tree a landmark and provides a clear walking area.
  const path = mesh(new THREE.RingGeometry(3.25, 5.15, 100), new THREE.MeshStandardMaterial({ color: '#798f85', roughness: 1 }), world, [0, -.027, 0]);
  path.rotation.x = -Math.PI / 2;path.castShadow = false;
  const spokes = new THREE.Group();world.add(spokes);
  for (let i = 0; i < 4; i++) {
    const spoke = box(spokes, materials.wood, [0, -.018, 7.3], [1.6, .03, 4.3]);
    spoke.position.set(Math.sin(i * Math.PI / 2) * 7.3, -.018, Math.cos(i * Math.PI / 2) * 7.3);
    spoke.rotation.y = i * Math.PI / 2;
  }
  const snowBanks = new THREE.InstancedMesh(unitSphere, materials.snow, 32);
  const dummy = new THREE.Object3D();
  for (let i = 0; i < 32; i++) {
    const angle = i * TAU / 32, r = 12 + Math.sin(i * 2.4) * 1.4;
    dummy.position.set(Math.cos(angle) * r, -.12, Math.sin(angle) * r);
    dummy.scale.set(1.3 + (i % 3) * .35, .3, .9);dummy.updateMatrix();snowBanks.setMatrixAt(i, dummy.matrix);
  }
  snowBanks.instanceMatrix.needsUpdate = true;world.add(snowBanks);

  const glowCanvas = document.createElement('canvas');glowCanvas.width = 64;glowCanvas.height = 64;
  const glowContext = glowCanvas.getContext('2d');
  const glow = glowContext.createRadialGradient(32, 32, 0, 32, 32, 32);
  glow.addColorStop(0, 'rgba(255,225,164,.75)');glow.addColorStop(.25, 'rgba(255,189,105,.24)');glow.addColorStop(1, 'rgba(255,180,85,0)');
  glowContext.fillStyle = glow;glowContext.fillRect(0, 0, 64, 64);
  const glowTexture = new THREE.CanvasTexture(glowCanvas);ownedTextures.push(glowTexture);
  const glowMaterial = new THREE.SpriteMaterial({ map: glowTexture, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
  for (let i = 0; i < 8; i++) {
    const angle = i * TAU / 8 + Math.PI / 8;
    const lamp = new THREE.Group();lamp.position.set(Math.sin(angle) * 6.2, 0, Math.cos(angle) * 6.2);world.add(lamp);
    mesh(new THREE.CylinderGeometry(.045, .07, 2.3, 7), materials.dark, lamp, [0, 1.15, 0]);
    mesh(new THREE.CylinderGeometry(.2, .27, .1, 8), materials.dark, lamp, [0, .05, 0]);
    box(lamp, materials.window, [0, 2.36, 0], [.25, .36, .25]);
    const roof = mesh(new THREE.ConeGeometry(.28, .2, 4), materials.dark, lamp, [0, 2.66, 0]);roof.rotation.y = Math.PI / 4;
    for (const x of [-.15, .15]) for (const z of [-.15, .15]) box(lamp, materials.dark, [x, 2.36, z], [.026, .42, .026]);
    const halo = new THREE.Sprite(glowMaterial);halo.position.y = 2.37;halo.scale.set(1.1, 1.1, 1);lamp.add(halo);
  }
  // Original gingerbread stalls, kept outside the walkable ring.
  for (const [x, z, rotation, roofMaterial] of [[-7.8, -6.9, .3, materials.red], [7.8, -6.9, -.3, materials.green]]) {
    const house = new THREE.Group();house.position.set(x, 0, z);house.rotation.y = rotation;world.add(house);
    box(house, materials.cookie, [0, 1.1, 0], [2.7, 2.2, 2.1]);
    const roof = mesh(new THREE.ConeGeometry(2.2, 1.1, 4), roofMaterial, house, [0, 2.7, 0]);roof.rotation.y = Math.PI / 4;roof.scale.z = .85;
    box(house, materials.icing, [0, 2.18, 1.1], [2.85, .12, .18]);
    box(house, materials.edge, [0, .65, 1.075], [.58, 1.3, .06]);
    for (const side of [-1, 1]) {
      box(house, materials.window, [side * .83, 1.28, 1.08], [.55, .66, .055]);
      box(house, materials.icing, [side * .83, 1.28, 1.12], [.035, .69, .04]);
      box(house, materials.icing, [side * .83, 1.28, 1.12], [.58, .035, .04]);
    }
    for (let i = 0; i < 9; i++) {
      ball(house, i % 2 ? materials.red : materials.icing, [-1.32 + i * .33, 2.13, 1.14], [.075, .075, .075]);
    }
  }
  // A few distant evergreens give the world a horizon without another heavy tree.
  for (let i = 0; i < 18; i++) {
    const angle = i * TAU / 18, r = 19 + (i % 4) * 2;
    const pine = new THREE.Group();pine.position.set(Math.sin(angle) * r, 0, Math.cos(angle) * r);world.add(pine);
    const h = 2.5 + (i % 4) * .6;
    for (let tier = 0; tier < 3; tier++) mesh(new THREE.ConeGeometry(1.05 - tier * .2, h * .56, 9), materials.green, pine, [0, h * .3 + tier * h * .23, 0]);
  }

  const player = new THREE.Group();player.position.set(0, 0, 5.85);player.rotation.y = Math.PI;world.add(player);
  const body = new THREE.Group();player.add(body);
  ball(body, materials.cookie, [0, .69, 0], [.29, .34, .18]);
  ball(body, materials.cookie, [0, 1.15, 0], [.28, .27, .16]);
  for (const side of [-1, 1]) {
    ball(body, materials.cookie, [side * .21, 1.35, 0], [.11, .11, .1]);
    ball(body, materials.edge, [side * .21, 1.35, .08], [.052, .052, .018]);
    ball(body, materials.eyes, [side * .095, 1.18, .148], [.032, .04, .02]);
    ball(body, materials.icing, [side * .103, 1.193, .164], [.009, .012, .006]);
    ball(body, materials.red, [side * .16, 1.07, .15], [.045, .025, .014]);
  }
  ball(body, materials.icing, [0, 1.08, .16], [.1, .064, .027]);
  ball(body, materials.eyes, [0, 1.105, .188], [.029, .022, .012]);
  const scarf = mesh(new THREE.TorusGeometry(.18, .058, 7, 24), materials.red, body, [0, .96, 0]);scarf.rotation.x = Math.PI / 2;
  box(body, materials.red, [.12, .8, .18], [.095, .23, .055]);
  for (const y of [.73, .57]) ball(body, materials.icing, [0, y, .18], [.035, .035, .016]);
  const arms = [], legs = [];
  for (const side of [-1, 1]) {
    const arm = new THREE.Group();arm.position.set(side * .28, .84, 0);arm.rotation.z = side * .24;body.add(arm);
    ball(arm, materials.cookie, [side * .06, -.16, 0], [.105, .22, .105]);
    ball(arm, materials.icing, [side * .095, -.29, .06], [.07, .035, .06]);arms.push(arm);
    const leg = new THREE.Group();leg.position.set(side * .15, .42, 0);player.add(leg);
    ball(leg, materials.cookie, [0, -.2, 0], [.125, .23, .12]);
    ball(leg, materials.icing, [0, -.33, .055], [.09, .035, .07]);legs.push(leg);
  }
  const hat = mesh(new THREE.ConeGeometry(.22, .4, 18), materials.red, body, [.03, 1.53, 0]);hat.rotation.z = -.18;
  const hatBand = mesh(new THREE.TorusGeometry(.2, .052, 7, 24), materials.icing, body, [0, 1.35, 0]);hatBand.rotation.x = Math.PI / 2;
  ball(body, materials.icing, [.07, 1.75, 0], [.078, .078, .078]);

  const marker = new THREE.Group();marker.visible = false;world.add(marker);
  const markerRing = mesh(new THREE.RingGeometry(.14, .19, 32), new THREE.MeshBasicMaterial({ color: '#ffe1a0', transparent: true, opacity: .9, depthWrite: false, side: THREE.DoubleSide }), marker, [0, .01, 0]);
  markerRing.rotation.x = -Math.PI / 2;markerRing.castShadow = false;
  const shadow = mesh(new THREE.CircleGeometry(.38, 24), new THREE.MeshBasicMaterial({ color: '#243a31', transparent: true, opacity: .23, depthWrite: false }), world, [0, -.017, 0]);
  shadow.rotation.x = -Math.PI / 2;shadow.castShadow = false;

  const raycaster = new THREE.Raycaster(), pointer = new THREE.Vector2();
  const targetQuaternion = new THREE.Quaternion(), cameraForward = new THREE.Vector3(), right = new THREE.Vector3();
  const desiredTarget = new THREE.Vector3(), previousTarget = new THREE.Vector3(), movement = new THREE.Vector3();
  const keys = new Set(), padKeys = new Set();
  const movementKeys = new Set(['w', 'a', 's', 'd', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);
  let enabled = false, route = [], saved = null, pointerStart = null, stride = 0;
  const listen = (target, name, handler, options) => { target.addEventListener(name, handler, options);listeners.push(() => target.removeEventListener(name, handler, options)); };
  const listeners = [];

  function setStatus(text) { if (status.textContent !== text) status.textContent = text; }
  function syncData() {
    stage.dataset.walkMode = String(enabled);
    stage.dataset.playerX = player.position.x.toFixed(3);
    stage.dataset.playerZ = player.position.z.toFixed(3);
    stage.dataset.walking = String(route.length > 0 || keys.size > 0 || padKeys.size > 0);
  }
  function safePoint(point) {
    const result = point.clone();result.y = 0;
    const distance = Math.hypot(result.x, result.z);
    if (distance < motion.clearance) {
      if (distance < .01) { result.x = 0;result.z = motion.clearance; }
      else result.multiplyScalar(motion.clearance / distance);
    }
    if (result.length() > motion.boundary) result.setLength(motion.boundary);
    // The two stalls sit at the far edge, outside the circular main path.
    for (const x of [-7.8, 7.8]) {
      const dx = result.x - x, dz = result.z + 6.9, d = Math.hypot(dx, dz);
      if (d < 2) { result.x = x + (d ? dx / d : 0) * 2;result.z = -6.9 + (d ? dz / d : 1) * 2; }
    }
    return result;
  }
  function goTo(point) {
    const destination = safePoint(point), start = player.position.clone();
    const line = destination.clone().sub(start), t = THREE.MathUtils.clamp(-start.dot(line) / Math.max(line.lengthSq(), .001), 0, 1);
    const closest = start.clone().addScaledVector(line, t);
    route = [];
    if (closest.length() < motion.clearance) {
      const from = Math.atan2(start.x, start.z), to = Math.atan2(destination.x, destination.z);
      const angle = THREE.MathUtils.euclideanModulo(to - from + Math.PI, TAU) - Math.PI;
      const radius = motion.clearance + .14;
      route.push(new THREE.Vector3(Math.sin(from) * radius, 0, Math.cos(from) * radius));
      const steps = Math.max(1, Math.ceil(Math.abs(angle) / .18));
      for (let i = 1; i <= steps; i++) route.push(new THREE.Vector3(Math.sin(from + angle * i / steps) * radius, 0, Math.cos(from + angle * i / steps) * radius));
    }
    route.push(destination);marker.position.copy(destination);marker.visible = true;
    stage.dataset.destinationX = destination.x.toFixed(3);stage.dataset.destinationZ = destination.z.toFixed(3);
    setStatus('쿠키가 그곳으로 걸어가고 있어요');syncData();requestRender();
  }
  function releaseMovement() { keys.clear();padKeys.clear();pointerStart = null; }
  function setEnabled(value) {
    if (enabled === value) return;
    releaseMovement();route = [];marker.visible = false;
    enabled = value;
    if (value) {
      saved = { position: camera.position.clone(), target: controls.target.clone(), fov: camera.fov, min: controls.minDistance, max: controls.maxDistance, minPolar: controls.minPolarAngle, maxPolar: controls.maxPolarAngle, background: scene.background, fog: scene.fog, scroll: scrollY };
      player.position.set(0, 0, 5.85);player.rotation.y = Math.PI;body.position.y = 0;
      document.body.classList.add('walk-mode');world.visible = true;hud.hidden = false;
      camera.fov = matchMedia('(max-width:760px)').matches ? 62 : 58;
      controls.target.copy(player.position).add(new THREE.Vector3(0, 2.4, 0));
      camera.position.copy(player.position).add(new THREE.Vector3(.65, 4.4, 8.6));
      controls.minDistance = 4.5;controls.maxDistance = 18;controls.minPolarAngle = Math.PI * .2;controls.maxPolarAngle = Math.PI * .51;controls.enableZoom = true;
      scene.background = new THREE.Color('#101c24');scene.fog = new THREE.FogExp2('#101c24', .04);
      canvas.style.touchAction = 'none';
      canvas.setAttribute('aria-label', '쿠키의 크리스마스 산책. 바닥을 누르거나 방향키와 WASD로 걸어요. 드래그하면 주변을 둘러볼 수 있어요.');
      toggle.querySelector('span').textContent = '산책 끝내기';toggle.setAttribute('aria-pressed', 'true');world.updateMatrixWorld(true);
      setStatus('바닥을 누르면 쿠키가 걸어가요');
    } else {
      document.body.classList.remove('walk-mode');world.visible = false;hud.hidden = true;
      camera.position.copy(saved.position);controls.target.copy(saved.target);camera.fov = saved.fov;
      controls.minDistance = saved.min;controls.maxDistance = saved.max;controls.minPolarAngle = saved.minPolar;controls.maxPolarAngle = saved.maxPolar;controls.enableZoom = false;
      scene.background = saved.background;scene.fog = saved.fog;canvas.style.touchAction = 'pan-y pinch-zoom';
      canvas.setAttribute('aria-label', '입체 크리스마스트리. 좌우 방향키나 마우스로 돌리고, 더하기와 빼기 키로 가까이 볼 수 있어요.');
      toggle.querySelector('span').textContent = '산책하기';toggle.setAttribute('aria-pressed', 'false');
      window.scrollTo(0, saved.scroll);
    }
    camera.updateProjectionMatrix();controls.update();syncData();onModeChange(value);requestRender();
  }
  listen(canvas, 'pointerdown', event => { if (enabled && event.isPrimary) pointerStart = { id: event.pointerId, x: event.clientX, y: event.clientY }; }, { capture: true, passive: true });
  listen(canvas, 'pointerup', event => {
    if (!enabled || !pointerStart || event.pointerId !== pointerStart.id) return;
    const moved = Math.hypot(event.clientX - pointerStart.x, event.clientY - pointerStart.y);pointerStart = null;
    if (moved > 7 || document.querySelector('dialog[open]')) return;
    const rect = canvas.getBoundingClientRect();pointer.set((event.clientX - rect.left) / rect.width * 2 - 1, -(event.clientY - rect.top) / rect.height * 2 + 1);
    raycaster.setFromCamera(pointer, camera);
    const hit = raycaster.intersectObject(floor, false)[0];
    if (hit) goTo(hit.point);
  });
  listen(canvas, 'pointercancel', () => { pointerStart = null; });
  listen(window, 'keydown', event => {
    if (!enabled || document.querySelector('dialog[open]') || /^(INPUT|TEXTAREA|SELECT)$/.test(event.target.tagName)) return;
    if (event.key === 'Escape') { event.preventDefault();setEnabled(false);return; }
    if (!movementKeys.has(event.key)) return;
    event.preventDefault();keys.add(event.key);route = [];marker.visible = false;
  });
  listen(window, 'keyup', event => { keys.delete(event.key); });
  listen(window, 'blur', releaseMovement);
  listen(document, 'visibilitychange', () => { if (document.hidden) { releaseMovement();route = [];marker.visible = false; } });
  for (const button of document.querySelectorAll('[data-walk-key]')) {
    const key = button.dataset.walkKey;
    let pressedAt = 0;
    listen(button, 'pointerdown', event => { if (!enabled) return;event.preventDefault();pressedAt=performance.now();button.setPointerCapture(event.pointerId);padKeys.add(key);route = [];marker.visible = false; });
    const release = () => padKeys.delete(key);
    listen(button, 'pointerup', release);listen(button, 'pointercancel', release);listen(button, 'lostpointercapture', release);
    // Keyboard activation of the native button takes a small, discrete step.
    listen(button, 'click', event => {
      if (!enabled || (event.detail !== 0 && performance.now()-pressedAt>180)) return;
      cameraForward.copy(controls.target).sub(camera.position);cameraForward.y = 0;cameraForward.normalize();right.crossVectors(cameraForward, UP);
      const direction = key === 'ArrowUp' ? cameraForward : key === 'ArrowDown' ? cameraForward.negate() : key === 'ArrowLeft' ? right.negate() : right;
      goTo(player.position.clone().addScaledVector(direction, .8));
    });
  }

  function update(delta) {
    if (!enabled) return false;
    if (document.querySelector('dialog[open]')) { releaseMovement();return false; }
    const held = new Set([...keys, ...padKeys]);
    movement.set(0, 0, 0);
    if (held.size) {
      cameraForward.copy(controls.target).sub(camera.position);cameraForward.y = 0;cameraForward.normalize();right.crossVectors(cameraForward, UP);
      if (held.has('w') || held.has('ArrowUp')) movement.add(cameraForward);
      if (held.has('s') || held.has('ArrowDown')) movement.sub(cameraForward);
      if (held.has('d') || held.has('ArrowRight')) movement.add(right);
      if (held.has('a') || held.has('ArrowLeft')) movement.sub(right);
      if (movement.lengthSq()) movement.normalize().multiplyScalar(motion.speed * delta);
    } else if (route.length) {
      movement.copy(route[0]).sub(player.position);
      const distance = movement.length();
      if (distance < .04) { route.shift();movement.set(0, 0, 0); }
      else movement.setLength(Math.min(distance, motion.speed * delta));
    }
    const walking = movement.lengthSq() > .000001;
    if (walking) {
      const destination = safePoint(player.position.clone().add(movement));
      const direction = destination.clone().sub(player.position);
      targetQuaternion.setFromAxisAngle(UP, Math.atan2(direction.x, direction.z));
      player.quaternion.slerp(targetQuaternion, motionPreference.matches ? 1 : 1 - Math.exp(-motion.turn * delta));
      player.position.copy(destination);stride += delta * motion.stride;
      setStatus('쿠키와 함께 트리를 둘러보세요');
    } else if (!route.length) { marker.visible = false;setStatus('장식을 누르면 누군가의 편지가 열려요'); }
    // Locomotion remains usable with reduced motion; decorative bob and limb
    // swing are omitted, and the camera follows without an elastic transition.
    const swing = walking && !motionPreference.matches ? Math.sin(stride) * .45 : 0;
    arms[0].rotation.x = swing;arms[1].rotation.x = -swing;legs[0].rotation.x = -swing;legs[1].rotation.x = swing;
    body.position.y = walking && !motionPreference.matches ? Math.abs(Math.sin(stride)) * .035 : 0;
    shadow.position.set(player.position.x, -.017, player.position.z);
    desiredTarget.copy(player.position);desiredTarget.y = 2.4;
    previousTarget.copy(controls.target);
    controls.target.lerp(desiredTarget, motionPreference.matches ? 1 : 1 - Math.exp(-motion.follow * delta));
    const followDelta = controls.target.clone().sub(previousTarget);
    camera.position.add(followDelta);
    // Keep an orbiting camera out of the solid core of the large tree.
    const radial = Math.hypot(camera.position.x, camera.position.z);
    const clearance = Math.max(.75, 2.76 * Math.max(0, (7.2 - camera.position.y) / 6.4) + .35);
    if (radial < clearance && camera.position.y < 7.4) { camera.position.x *= clearance / Math.max(radial, .01);camera.position.z *= clearance / Math.max(radial, .01); }
    syncData();
    return walking || followDelta.lengthSq() > .000001;
  }
  syncData();
  return {
    get enabled() { return enabled; }, setEnabled, update,
    stop() { releaseMovement();route = [];marker.visible = false; },
    dispose() {
      if (enabled) setEnabled(false);
      listeners.forEach(remove => remove());scene.remove(world);
      const geometries = new Set(), extraMaterials = new Set();
      world.traverse(object => { if (object.geometry) geometries.add(object.geometry);if (object.material) extraMaterials.add(object.material); });
      geometries.forEach(geometry => geometry.dispose());extraMaterials.forEach(material => material.dispose());ownedTextures.forEach(texture => texture.dispose());
    }
  };
}
