/* Metrorrey — Estación Cuauhtémoc (Línea 1 elevada + transbordo a Línea 2 subterránea)
   Escena Three.js r128 (global THREE), sin módulos: abre con file://.
   Unidades = metros. Eje X = a lo largo de la vía, Y = arriba, Z = andén.
   Ciclo animado: el tren llega, abre puertas, aborda, cierra y sale. */
(function () {
  'use strict';

  var errorBox = document.getElementById('error');
  function showError(msg) {
    var vl = document.getElementById('viewLoader');
    if (vl) vl.hidden = true;   /* que el error no quede tras la cortina de carga */
    errorBox.hidden = false;
    errorBox.textContent = 'No se pudo mostrar el modelo 3D. ' + msg;
  }

  /* ---------- Cortina de carga al cambiar de vista ----------
     Cambiar de vista es casi instantáneo, pero el primer cuadro nuevo
     puede trabarse un instante (p. ej. al cruzar a la zona subterránea se
     regenera el entorno de luz y cambia qué se dibuja). La cortina se
     muestra en el clic —el navegador la pinta antes del cuadro pesado— y
     se quita cuando ya se dibujaron 2 cuadros de la vista nueva y pasaron
     al menos 320 ms, con una salida suave. La animación es CSS, así que
     sigue viva aunque el cuadro pesado ocupe el hilo principal. */
  var viewLoader = document.getElementById('viewLoader');
  var viewLoaderText = document.getElementById('viewLoaderText');
  var loaderFrames = 2, loaderShownAt = performance.now(), loaderHideTimer = 0;
  function showViewLoader(label) {
    if (!viewLoader) return;
    if (label && viewLoaderText) viewLoaderText.textContent = label;
    clearTimeout(loaderHideTimer);
    viewLoader.classList.remove('saliendo');
    viewLoader.hidden = false;
    loaderFrames = 2;
    loaderShownAt = performance.now();
  }
  function tickViewLoader() {   /* tras cada cuadro dibujado */
    if (!viewLoader || viewLoader.hidden || loaderFrames < 0) return;
    if (loaderFrames > 0) { loaderFrames--; return; }
    if (performance.now() - loaderShownAt < 320) return;
    loaderFrames = -1;
    viewLoader.classList.add('saliendo');
    loaderHideTimer = setTimeout(function () {
      viewLoader.hidden = true;
      viewLoader.classList.remove('saliendo');
    }, 260);
  }
  function viewLabelOf(name) {
    var b = document.querySelector('[data-view="' + name + '"]');
    return b ? b.textContent.trim() : name;
  }
  window.addEventListener('error', function (e) { showError(e.message || ''); });

  if (typeof THREE === 'undefined') { showError('Falta lib/three.min.js'); return; }

  var canvas = document.getElementById('scene');
  var renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true });
  } catch (err) { showError('Tu navegador no activó WebGL.'); return; }

  /* Resolución adaptable: arranca en ≤1.5× y baja/sube sola según los
     cuadros por segundo (ver adaptQuality en el bucle). */
  var maxPR = Math.min(window.devicePixelRatio || 1, 1.5), curPR = maxPR;
  renderer.setPixelRatio(curPR);
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.shadowMap.autoUpdate = false;   /* se recalcula cada 2 cuadros */
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;

  var scene = new THREE.Scene();
  scene.background = new THREE.Color(0xcfe5f2);
  scene.fog = new THREE.Fog(0xcfe5f2, 90, 230);

  var camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 500);

  /* ---------- Luces ---------- */
  var hemi = new THREE.HemisphereLight(0xeaf6ff, 0x8a7f6a, 0.85);
  scene.add(hemi);
  var sun = new THREE.DirectionalLight(0xfff2d6, 1.35);
  sun.position.set(-28, 42, 26);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -48; sun.shadow.camera.right = 48;
  sun.shadow.camera.top = 40; sun.shadow.camera.bottom = -30;
  sun.shadow.camera.near = 5; sun.shadow.camera.far = 120;
  sun.shadow.bias = -0.0003; sun.shadow.normalBias = 0.03;
  scene.add(sun); scene.add(sun.target);
  var fill = new THREE.DirectionalLight(0xdcefff, 0.3);
  fill.position.set(30, 18, -25); scene.add(fill);
  /* Luces de andén: solo existen de noche o con lluvia. Cada luz puntual
     la paga CADA material en pantalla, así que de día no se agregan. */
  var nightLights = [];
  [-12, 12].forEach(function (x) {
    var pl = new THREE.PointLight(0xffe6b0, 0, 30, 1.5);
    pl.position.set(x, 14.9, 2.6); scene.add(pl); nightLights.push(pl);
    var pl2 = new THREE.PointLight(0xffe6b0, 0, 26, 1.5);
    pl2.position.set(x, 14.7, -7.2); scene.add(pl2); nightLights.push(pl2);
  });
  /* Luces de techo de cada coche (se crean en buildInterior): de día están
     apagadas; de noche iluminan asientos y pasajeros desde el plafón */
  var carCeilLights = [], carCeilStripMats = [];
  /* Reflejos del cielo para metales y cristales: mapa de entorno generado
     (degradado cielo → horizonte → suelo), uno por escenario. */
  var pmrem = new THREE.PMREMGenerator(renderer), envRT = null;
  function makeEnv(top, horizon, ground) {
    var es = new THREE.Scene(), geo = new THREE.SphereGeometry(50, 32, 16);
    var pos = geo.attributes.position, col = new Float32Array(pos.count * 3);
    var cT = new THREE.Color(top), cH = new THREE.Color(horizon), cG = new THREE.Color(ground), c = new THREE.Color();
    for (var i = 0; i < pos.count; i++) {
      var y = pos.getY(i) / 50;
      if (y >= 0) c.copy(cH).lerp(cT, Math.pow(y, 0.6)); else c.copy(cH).lerp(cG, Math.min(1, -y * 4));
      col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    es.add(new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide })));
    if (envRT) envRT.dispose();
    envRT = pmrem.fromScene(es, 0.04);
    scene.environment = envRT.texture;
    geo.dispose();
  }

  /* ---------- Escenarios: mediodía / amanecer / lluvia / noche ---------- */
  var rain = null, rainGeo = null, scenario = 'mediodia';
  (function makeRain() {
    var N = 900, pos = new Float32Array(N * 3);
    for (var i = 0; i < N; i++) {
      pos[i * 3] = -50 + Math.random() * 100;
      pos[i * 3 + 1] = Math.random() * 26;
      pos[i * 3 + 2] = -28 + Math.random() * 52;
    }
    rainGeo = new THREE.BufferGeometry();
    rainGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    rain = new THREE.Points(rainGeo, new THREE.PointsMaterial({
      color: 0xcfe4f2, size: 0.14, transparent: true, opacity: 0.55, depthWrite: false }));
    rain.visible = false; rain.frustumCulled = false; scene.add(rain);
  })();
  function updateRain(dt) {
    if (!rain || !rain.visible) return;
    var a = rainGeo.attributes.position.array;
    for (var i = 0; i < a.length; i += 3) {
      a[i + 1] -= 24 * dt; a[i] -= 3.5 * dt;
      if (a[i + 1] < 0) { a[i + 1] = 26; a[i] = -50 + Math.random() * 100; }
    }
    rainGeo.attributes.position.needsUpdate = true;
  }
  /* Gotas sobre la cara EXTERIOR de los vidrios del tren (parabrisas,
     ventanas y puertas): microgotas quietas y, de vez en cuando, una gota
     que baja resbalando y deja una estela húmeda. Todo es procedural en un
     shader; las UV van en metros (+ una celda-semilla por cristal) para que
     las gotas salgan redondas y distintas en cada ventana. */
  var rainGlassMats = [], rainGlassWet = 0, rainGlassTarget = 0, rainGlassTime = 0;
  var rainGlassBaseMat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uWet: { value: 0 } },
    vertexShader: [
      'varying vec2 vRainUv;',
      'void main() {',
      '  vRainUv = uv;',
      '  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);',
      '}'
    ].join('\n'),
    fragmentShader: [
      'uniform float uTime;',
      'uniform float uWet;',
      'varying vec2 vRainUv;',
      'float rhash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }',
      'float staticDrops(vec2 p, vec2 seed, float cell, float density) {',
      '  vec2 g = p / cell;',
      '  vec2 id = floor(g);',
      '  vec2 f = fract(g);',
      '  float pick = rhash(id + seed * 19.7);',
      '  if (pick > density) return 0.0;',
      '  vec2 c = 0.22 + 0.56 * vec2(rhash(id + seed + 4.1), rhash(id + seed + 9.3));',
      '  float r = mix(0.10, 0.30, rhash(id + seed + 2.7));',
      '  float d = length((f - c) * vec2(1.0, 1.18));',
      '  return smoothstep(r, r * 0.30, d);',
      '}',
      'void main() {',
      '  vec2 seed = floor(vRainUv / 10.0);',
      '  vec2 p = mod(vRainUv, 10.0);',
      '  float drops = staticDrops(p, seed, 0.075, 0.62) * 0.65',
      '              + staticDrops(p + 3.17, seed + 8.0, 0.034, 0.45) * 0.38;',
      '  /* Gotas que resbalan: una columna activa de cada ~3, a su ritmo */',
      '  float colW = 0.21;',
      '  float col = floor(p.x / colW);',
      '  float colSeed = seed.x * 7.31 + seed.y * 13.7 + col * 3.17;',
      '  float onCol = step(0.66, rhash(vec2(colSeed, 1.7)));',
      '  float cx = (col + 0.18 + 0.64 * rhash(vec2(colSeed, 4.9))) * colW',
      '           + sin(p.y * 21.0 + colSeed) * 0.0025;',
      '  float speed = 0.055 + 0.14 * rhash(vec2(colSeed, 8.3));',
      '  float period = 1.55;',
      '  float headY = period - mod(rhash(vec2(colSeed, 6.1)) * period + uTime * speed, period);',
      '  float dx = p.x - cx;',
      '  float dy = p.y - headY;',
      '  float head = smoothstep(0.019, 0.006, length(vec2(dx, dy * 0.76)));',
      '  float trailLen = 0.13 + 0.20 * rhash(vec2(colSeed, 9.4));',
      '  float broken = smoothstep(0.25, 0.85, rhash(vec2(colSeed, floor(p.y / 0.028))));',
      '  float trail = step(0.0, dy) * step(dy, trailLen) * (1.0 - dy / trailLen)',
      '              * exp(-pow(dx / 0.0055, 2.0)) * broken;',
      '  float slide = onCol * (head + trail * 0.55);',
      '  float a = clamp(drops + slide, 0.0, 1.0) * uWet;',
      '  if (a < 0.012) discard;',
      '  vec3 colr = mix(vec3(0.66, 0.79, 0.89), vec3(1.0), clamp(head + drops * 0.45, 0.0, 1.0));',
      '  gl_FragColor = vec4(colr, a * 0.88);',
      '}'
    ].join('\n'),
    transparent: true, depthWrite: false, side: THREE.DoubleSide
  });
  rainGlassBaseMat.visible = false;
  rainGlassMats.push(rainGlassBaseMat);
  function makeRainGlassMat(fadeGroup) {
    var m = rainGlassBaseMat.clone();
    m.visible = false;
    if (fadeGroup) fadeMat(m, fadeGroup);
    rainGlassMats.push(m);
    return m;
  }
  var rainGlassSeq = 0;
  function rainGlassGeometry(w, h) {
    var g = new THREE.PlaneGeometry(w, h), uv = g.attributes.uv;
    var seed = ++rainGlassSeq, ox = (seed % 37) * 10, oy = Math.floor(seed / 37) * 10;
    for (var i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * w + ox, uv.getY(i) * h + oy);
    return g;
  }
  function makeRainGlass(w, h, mat) {
    if (!mat) return null;
    var m = new THREE.Mesh(rainGlassGeometry(w, h), mat);
    m.castShadow = false; m.receiveShadow = false; m.renderOrder = 6;
    return m;
  }
  function updateRainGlass(dt) {
    var rate = rainGlassTarget > rainGlassWet ? 0.3 : 0.07;   /* se moja pronto, se seca lento */
    rainGlassWet += THREE.MathUtils.clamp(rainGlassTarget - rainGlassWet, -rate * dt, rate * dt);
    if (rainGlassWet > 0.003) rainGlassTime += dt;
    rainGlassMats.forEach(function (m) {
      m.uniforms.uTime.value = rainGlassTime;
      m.uniforms.uWet.value = rainGlassWet * (m.userData.fadeBaseOpacity !== undefined ? m.opacity : 1);
      m.depthWrite = false;   /* applyFade lo reactivaría con la pared completa */
      m.visible = rainGlassWet > 0.01 && m.opacity > 0.015;
    });
  }
  /* Parámetros de la URL (?vista=corte&escenario=noche&…): permiten copiar
     el enlace exacto de lo que estás viendo. Se acepta también #… por si
     el navegador no deja reescribir el ?… en file://. */
  function parseUrlParams() {
    var s = location.search || '';
    if (s.length < 2 && location.hash.indexOf('=') > 0) s = '?' + location.hash.slice(1);
    try { return new URLSearchParams(s); } catch (e) { return new URLSearchParams(); }
  }
  var URLP = parseUrlParams();
  var SCENARIOS = {
    mediodia: { bg: 0xcfe5f2, fog: [115, 260], sunC: 0xfff2d6, sunI: 1.35, sunP: [-28, 42, 26],
      hemiI: 0.85, hemiS: 0xeaf6ff, fillI: 0.3, exp: 1.05, night: 0, rain: false },
    amanecer: { bg: 0xf4cf9f, fog: [70, 210], sunC: 0xffb27a, sunI: 1.15, sunP: [-48, 10, 20],
      hemiI: 0.55, hemiS: 0xffd9b0, fillI: 0.18, exp: 1.0, night: 0.25, rain: false },
    lluvia: { bg: 0x9db0bc, fog: [38, 150], sunC: 0xd8e2e8, sunI: 0.45, sunP: [-20, 38, 14],
      hemiI: 0.6, hemiS: 0xc3d2dc, fillI: 0.15, exp: 0.95, night: 0.35, rain: true },
    noche: { bg: 0x0d1622, fog: [55, 190], sunC: 0x8fb4ff, sunI: 0.16, sunP: [22, 42, -14],
      hemiI: 0.22, hemiS: 0x33507a, fillI: 0.05, exp: 0.98, night: 1.1, rain: false }
  };
  var sunOff = [-28, 42, 26];   /* el sol sigue a la vista con este desfase */
  function setScenario(name) {
    var sc = SCENARIOS[name]; if (!sc) return;
    scenario = name;
    sunOff = sc.sunP;
    /* Sin dibujar lo que la niebla ya tapó: los tramos lejanos no cuestan */
    camera.far = sc.fog[1] + 40; camera.updateProjectionMatrix();
    if (typeof cityWallMat !== 'undefined') cityWallMat.emissiveIntensity = Math.min(1, sc.night * 0.9);
    scene.background.setHex(sc.bg);
    scene.fog.color.setHex(sc.bg); scene.fog.near = sc.fog[0]; scene.fog.far = sc.fog[1];
    sun.color.setHex(sc.sunC); sun.intensity = sc.sunI;
    sun.position.set(sc.sunP[0], sc.sunP[1], sc.sunP[2]);
    hemi.intensity = sc.hemiI * 0.5; hemi.color.setHex(sc.hemiS);   /* el entorno aporta el resto */
    hemi.groundColor.setHex(0x8a7f6a);
    fill.intensity = sc.fillI;
    renderer.toneMappingExposure = sc.exp * 0.96;
    makeEnv(sc.hemiS, sc.bg, name === 'noche' ? 0x101418 : 0x8a8478);
    nightLights.forEach(function (pl) { pl.intensity = sc.night * 1.4; pl.visible = sc.night > 0.3; });
    /* Techo del vagón de noche: las luces del plafón prenden y la tira brilla más */
    carCeilLights.forEach(function (pl) {
      pl.intensity = sc.night > 0.3 ? 0.25 + sc.night * 0.75 : 0;
      pl.visible = sc.night > 0.3;
    });
    carCeilStripMats.forEach(function (m) { m.emissiveIntensity = 1.15 + Math.max(0, sc.night - 0.3) * 1.1; });
    if (typeof headSpot !== 'undefined' && headSpot) headSpot.visible = sc.night > 0.2;
    if (rain) rain.visible = sc.rain;
    rainGlassTarget = sc.rain ? 1 : 0;   /* los vidrios se mojan (y se secan) poco a poco */
    var sel = document.getElementById('scenarioSel');
    if (sel && sel.value !== name) sel.value = name;
    if (zone && zone.under) applyUnderLight();   /* bajo tierra manda la luz del túnel */
  }

  /* ---------- Materiales ---------- */
  function std(color, roughness, metalness) {
    return new THREE.MeshStandardMaterial({
      color: color, roughness: roughness, metalness: metalness || 0
    });
  }
  var MAT = {
    concrete: std(0xb9bdc0, 0.9, 0), concreteDark: std(0x8f969b, 0.95, 0),
    platform: std(0xd3d1c9, 0.85, 0), asphalt: std(0x3b4045, 0.95, 0),
    steel: std(0x9aa4ab, 0.3, 0.9), steelDark: std(0x3a4248, 0.45, 0.7),
    rail: std(0xd7dde0, 0.2, 1), yellow: std(0xf2b705, 0.6, 0),
    green: std(0x078a4c, 0.45, 0.1), greenDark: std(0x056a3a, 0.5, 0.1),
    body: std(0xe9edee, 0.32, 0.55), roofTrain: std(0xc7ced2, 0.45, 0.5),
    rubber: std(0x1d2124, 0.9, 0), dark: std(0x20272d, 0.6, 0.2),
    glass: new THREE.MeshPhysicalMaterial({
      color: 0x1d3746, roughness: 0.08, metalness: 0.2,
      transparent: true, opacity: 0.92
    }),
    lamp: new THREE.MeshStandardMaterial({
      color: 0xfff6c8, emissive: 0xffdf7a, emissiveIntensity: 0.9, roughness: 0.4
    }),
    redLamp: new THREE.MeshStandardMaterial({
      color: 0x7a1712, emissive: 0xd92b20, emissiveIntensity: 0.6, roughness: 0.4
    }),
    mountain: std(0x7d94a8, 1, 0), white: std(0xffffff, 0.6, 0),
    bench: std(0x37505f, 0.55, 0.3),
    blueSteel: std(0x1b4f9c, 0.4, 0.6),          /* pórticos y barandales azules de las fotos */
    wire: std(0x2b2f33, 0.5, 0.8),
    interior: new THREE.MeshStandardMaterial({  /* vestíbulo iluminado tras las puertas */
      color: 0xffe9b8, emissive: 0xffc46b, emissiveIntensity: 0.85, roughness: 0.9
    }),
    glassPanel: new THREE.MeshPhysicalMaterial({
      color: 0xbfe0ee, roughness: 0.1, metalness: 0.1, transparent: true, opacity: 0.38
    }),
    /* MM-05: colores muestreados de las fotos de referencia */
    trainBlue: std(0x1e4fa3, 0.34, 0.35), trainRed: std(0xdd2c20, 0.38, 0.25),
    skirt: std(0x8e8a85, 0.6, 0.25), seal: std(0x101417, 0.55, 0.2),
    cabGlass: new THREE.MeshPhysicalMaterial({
      color: 0x4d7089, roughness: 0.06, metalness: 0.2, transparent: true, opacity: 0.58,
      side: THREE.DoubleSide   /* el parabrisas también se ve desde la cabina */
    }),
    winGlass: new THREE.MeshPhysicalMaterial({
      color: 0x14242f, roughness: 0.08, metalness: 0.25, transparent: true, opacity: 0.8
    }),
    amberLamp: new THREE.MeshStandardMaterial({
      color: 0xcc7a12, emissive: 0xff9a1a, emissiveIntensity: 0.55, roughness: 0.4
    }),
    innerWall: std(0xe9e7e0, 0.75, 0.02), innerFloor: std(0x5d6165, 0.92, 0),
    seatBlue: std(0x8fd0ea, 0.42, 0.02), seatCream: std(0xe8e4da, 0.42, 0.02),
    ceilLight: new THREE.MeshStandardMaterial({
      color: 0xffffff, emissive: 0xfff4d6, emissiveIntensity: 1.15, roughness: 0.4
    })
  };

  /* Materiales que se desvanecen (techos transparentes configurables).
     current/target se suavizan en el bucle; ver updateRoofs(). */
  var stationRoofFade = { mats: [], current: 1, target: 1, mode: 'auto', min: 0.12 };
  var clutter = []; /* letreros, tubos y pórticos: se desvanecen con el techo en aérea */
  /* Config. (modo/opacidad del panel) de los trenes; los materiales viven
     en grupos por tren y por lado: solo se desvanece el tren más cercano
     a la cámara (su techo y la pared del lado de la vista); ver updateRoofs(). */
  var trainRoofFade = { mats: [], current: 1, target: 1, mode: 'auto', min: 0.07 };
  function makeFadeGroup() { return { mats: [], current: 1, target: 1 }; }
  var trainFades = {
    1: { roof: makeFadeGroup(), wallPlus: makeFadeGroup(), wallMinus: makeFadeGroup() },
    2: { roof: makeFadeGroup(), wallPlus: makeFadeGroup(), wallMinus: makeFadeGroup() },
    /* trenes de la Línea 2 (subterránea): nunca se desvanecen */
    3: { roof: makeFadeGroup(), wallPlus: makeFadeGroup(), wallMinus: makeFadeGroup() },
    4: { roof: makeFadeGroup(), wallPlus: makeFadeGroup(), wallMinus: makeFadeGroup() }
  };
  function fadeMat(mat, group) {
    mat.transparent = true;
    /* Se conserva su opacidad/alphaTest propios (cristal 0.8, laterales
       con alphaTest 0.35): el desvanecido los escala, no los sustituye. */
    if (mat.userData.fadeBaseOpacity === undefined) mat.userData.fadeBaseOpacity = mat.opacity;
    if (mat.alphaTest) mat.userData.fadeBaseAlphaTest = mat.alphaTest;
    mat.opacity = mat.userData.fadeBaseOpacity;
    group.mats.push(mat); return mat;
  }
  function smooth01(a, b, v) {
    var t = Math.max(0, Math.min(1, (v - a) / (b - a)));
    return t * t * (3 - 2 * t);
  }

  /* Padre por defecto: la escena, o el tramo periódico (worldTile) mientras
     se arma la estación y la vía. */
  var BUILD = scene;
  function mesh(geo, mat, x, y, z, parent) {
    var m = new THREE.Mesh(geo, mat);
    m.position.set(x || 0, y || 0, z || 0);
    m.castShadow = true; m.receiveShadow = true;
    (parent || BUILD).add(m);
    return m;
  }
  function box(w, h, d, mat, x, y, z, parent) {
    return mesh(new THREE.BoxGeometry(w, h, d), mat, x, y, z, parent);
  }
  /* Losa con huecos rectangulares [x0, x1, z0, z1] (por donde pasan las
     escaleras): se arma con cajas alrededor de ellos. Con walkY además
     queda registrada como piso caminable a esa altura. */
  function gridCuts(a, b, list) {
    var v = [a, b];
    list.forEach(function (c) { if (c > a && c < b) v.push(c); });
    v.sort(function (p, q) { return p - q; });
    return v.filter(function (c, i) { return i === 0 || c - v[i - 1] > 1e-3; });
  }
  function holeCells(x0, x1, z0, z1, holes, fn) {
    var xs = gridCuts(x0, x1, holes.reduce(function (l, h) { return l.concat([h[0], h[1]]); }, []));
    var zs = gridCuts(z0, z1, holes.reduce(function (l, h) { return l.concat([h[2], h[3]]); }, []));
    for (var i = 0; i < xs.length - 1; i++) for (var j = 0; j < zs.length - 1; j++) {
      var cx = (xs[i] + xs[i + 1]) / 2, cz = (zs[j] + zs[j + 1]) / 2;
      if (holes.some(function (h) { return cx > h[0] && cx < h[1] && cz > h[2] && cz < h[3]; })) continue;
      fn(xs[i], xs[i + 1], zs[j], zs[j + 1]);
    }
  }
  function slabWithHoles(x0, x1, z0, z1, y0, y1, mat, holes, parent, walkY) {
    holeCells(x0, x1, z0, z1, holes, function (a, b, c, d) {
      box(b - a, y1 - y0, d - c, mat, (a + b) / 2, (y0 + y1) / 2, (c + d) / 2, parent);
      if (walkY !== undefined) addFloor(a, b, c, d, walkY);
    });
  }
  /* Plano de UNA cara que mira hacia nrm ('+x', '-x', '+y', '-y', '+z',
     '-z'). Bajo tierra muros y techos se arman así: desde adentro se ven
     completos y desde afuera (vista en corte) no tapan el interior.
     uv = [su, sv]: cuántas veces se repite la textura a lo ancho y alto. */
  function panel(w, h, mat, x, y, z, nrm, parent, uv) {
    var geo = new THREE.PlaneGeometry(w, h);
    if (uv) {
      var a = geo.attributes.uv;
      for (var i = 0; i < a.count; i++) a.setXY(i, a.getX(i) * uv[0], a.getY(i) * uv[1]);
    }
    var m = mesh(geo, mat, x, y, z, parent);
    if (nrm === '+x') m.rotation.y = Math.PI / 2;
    else if (nrm === '-x') m.rotation.y = -Math.PI / 2;
    else if (nrm === '-z') m.rotation.y = Math.PI;
    else if (nrm === '+y') m.rotation.x = -Math.PI / 2;
    else if (nrm === '-y') m.rotation.x = Math.PI / 2;
    m.castShadow = false;
    return m;
  }

  /* ---------- Por dónde se camina (primera persona) ----------
     Pisos planos, rampas (escaleras) y muros bajos. El piso que vale en
     (x, z) es el más cercano a tu altura actual; un escalón de más de
     45 cm no se puede dar, así que las orillas de cada nivel son muros
     solos. WALLS bloquea además columnas, torniquetes y el bajo-escalera
     (solo a quien camina a la altura [y0, y1)). */
  var FLOORS = [], RAMPS = [], WALLS = [];
  function addFloor(x0, x1, z0, z1, y) { FLOORS.push([x0, x1, z0, z1, y]); }
  function addWall(x0, x1, z0, z1, y0, y1) { WALLS.push([x0, x1, z0, z1, y0, y1]); }
  function stairLen(drop) { return Math.round(drop / 0.18) * 0.265; }   /* peralte ~18 cm, huella 26.5 */
  /* Tramo recto de escalera a lo largo de axis ('x' o 'z'): de a0 (arriba,
     yTop) a a1 (abajo, yBot), centrado en c y de ancho w. Peldaños
     instanciados, losa inclinada abajo, pasamanos azules y su rampa para
     caminar. */
  function flight(axis, a0, a1, c, w, yTop, yBot, parent, mat) {
    var n = Math.max(2, Math.round((yTop - yBot) / 0.18)), rise = (yTop - yBot) / n;
    var len = Math.abs(a1 - a0), run = len / n, dir = a1 > a0 ? 1 : -1, steps = [];
    for (var i = 0; i < n - 1; i++) {
      var a = a0 + dir * (i + 0.5) * run, y = yTop - (i + 1) * rise - rise / 2;
      steps.push(axis === 'x' ? [a, y, c] : [c, y, a]);
    }
    instanced(axis === 'x' ? new THREE.BoxGeometry(run, rise, w) : new THREE.BoxGeometry(w, rise, run),
      mat || MAT.platform, steps, parent);
    var ang = Math.atan2(yTop - yBot, len), sl = Math.hypot(yTop - yBot, len), mid = (a0 + a1) / 2;
    var slab = axis === 'x' ? box(sl, 0.3, w, MAT.concrete, mid, (yTop + yBot) / 2 - 0.3, c, parent)
      : box(w, 0.3, sl, MAT.concrete, c, (yTop + yBot) / 2 - 0.3, mid, parent);
    if (axis === 'x') slab.rotation.z = -dir * ang; else slab.rotation.x = dir * ang;
    [-1, 1].forEach(function (k) {   /* pasamanos a ambos lados */
      var o = c + k * (w / 2 + 0.05);
      if (axis === 'x') {
        tubeBetween(parent || BUILD, a0, yTop + 0.95, o, a1, yBot + 0.95, o, 0.04, MAT.blueSteel);
        tubeBetween(parent || BUILD, a1, yBot, o, a1, yBot + 0.95, o, 0.035, MAT.blueSteel);
      } else {
        tubeBetween(parent || BUILD, o, yTop + 0.95, a0, o, yBot + 0.95, a1, 0.04, MAT.blueSteel);
        tubeBetween(parent || BUILD, o, yBot, a1, o, yBot + 0.95, a1, 0.035, MAT.blueSteel);
      }
    });
    RAMPS.push({ axis: axis, a0: a0, a1: a1, c0: c - w / 2, c1: c + w / 2, y0: yTop, y1: yBot });
  }
  /* Barandal recto (tubo superior, medio y postes) */
  function railing(x1, z1, x2, z2, y, parent) {
    tubeBetween(parent || BUILD, x1, y + 1.0, z1, x2, y + 1.0, z2, 0.04, MAT.blueSteel);
    tubeBetween(parent || BUILD, x1, y + 0.5, z1, x2, y + 0.5, z2, 0.025, MAT.blueSteel);
    var n = Math.max(1, Math.round(Math.hypot(x2 - x1, z2 - z1) / 1.5));
    for (var i = 0; i <= n; i++) {
      var x = x1 + (x2 - x1) * i / n, z = z1 + (z2 - z1) * i / n;
      tubeBetween(parent || BUILD, x, y, z, x, y + 1.0, z, 0.03, MAT.blueSteel);
    }
  }

  /* Texturas dibujadas en canvas (sin archivos externos). */
  function canvasTexture(w, h, draw) {
    var c = document.createElement('canvas'); c.width = w; c.height = h;
    draw(c.getContext('2d'), w, h);
    var tex = new THREE.CanvasTexture(c);
    tex.encoding = THREE.sRGBEncoding; tex.anisotropy = 8;
    return tex;
  }

  /* ---- MM-05: aberturas del lateral (u = m desde el centro del coche) ----
     Ritmo de las fotos: ventana · puerta · ventana · puerta · ventana.
     Las mismas medidas construyen los muros con huecos reales y el interior. */
  /* Patrón simétrico: el lateral contrario usa la misma textura girada. */
  var SIDE_WINS = [{ u: -6.3, w: 0.95, vent: true }, { u: -2.0, w: 1.15 },
    { u: 2.0, w: 1.15 }, { u: 6.3, w: 0.95, vent: true }];
  var SIDE_DOORS = [{ u: -4.2, w: 1.25 }, { u: 4.2, w: 1.25 }];
  var WIN_DY = [1.12, 1.92], DOOR_DY = [0.32, 2.2]; /* alturas desde BODY_Y */
  var SIDE_TEX_W = 2600, SIDE_TEX_H = 540, SIDE_PLANE_W = 14.7, SIDE_PLANE_H = 2.62;
  function sideX(u) { return (u + SIDE_PLANE_W / 2) / SIDE_PLANE_W * SIDE_TEX_W; }
  function sideY(dy) { return (1 - dy / SIDE_PLANE_H) * SIDE_TEX_H; }
  function sideW(wm) { return wm / SIDE_PLANE_W * SIDE_TEX_W; }

  function roundRect(g, x, y, w, h, r) {
    g.beginPath();
    g.moveTo(x + r, y); g.lineTo(x + w - r, y); g.arcTo(x + w, y, x + w, y + r, r);
    g.lineTo(x + w, y + h - r); g.arcTo(x + w, y + h, x + w - r, y + h, r);
    g.lineTo(x + r, y + h); g.arcTo(x, y + h, x, y + h - r, r);
    g.lineTo(x, y + r); g.arcTo(x, y, x + r, y, r); g.closePath();
  }

  /* Logotipo clásico de Metrorrey: «m» roja de barras inclinadas con estelas
     de velocidad y `metrorrey` azul en itálica (frente y lateral, fotos). */
  function drawMetrorreyLogo(g, x, y, w) {
    var h = w * 0.42, skew = w * 0.055;
    g.save();
    g.fillStyle = '#dd2c20';
    for (var i = 0; i < 7; i++) {           /* estelas de velocidad */
      var len = w * (0.16 - i * 0.012);
      g.fillRect(x, y + h * 0.14 + i * h * 0.115, len, h * 0.055);
    }
    var bw = w * 0.17, gap = w * 0.055, bx = x + w * 0.2;
    for (var b = 0; b < 3; b++) {           /* tres barras unidas arriba */
      var px = bx + b * (bw + gap);
      g.beginPath();
      g.moveTo(px, y + h); g.lineTo(px + skew, y + h * 0.1);
      g.quadraticCurveTo(px + skew + bw * 0.2, y - h * 0.04, px + skew + bw, y + h * 0.1);
      g.lineTo(px + bw, y + h); g.closePath(); g.fill();
    }
    g.fillRect(bx + skew, y + h * 0.02, bw * 3 + gap * 2, h * 0.16);
    g.fillStyle = '#1e4fa3';
    for (var s = 0; s < 3; s++) g.fillRect(x + w * 0.02, y + h * 1.1 + s * h * 0.11, w * 0.17, h * 0.05);
    g.font = 'italic 800 ' + Math.round(h * 0.42) + 'px Helvetica,Arial';
    g.textAlign = 'left'; g.fillText('metrorrey', x + w * 0.22, y + h * 1.38);
    g.restore();
  }

  /* Lateral MM-05 según mm05-front-side.png: banda azul alta, DOS franjas
     rojas, blanco y faldón topo. Ventanas y puertas quedan en alfa (huecos
     reales: el cristal y las hojas son piezas 3D y se ve el interior). */
  function trainSideTexture(number, cabEnd) {
    return canvasTexture(SIDE_TEX_W, SIDE_TEX_H, function (g, w, h) {
      g.fillStyle = '#f1f1ee'; g.fillRect(0, 0, w, h);                    /* blanco */
      g.fillStyle = '#1e4fa3'; g.fillRect(0, 0, w, sideY(2.18));          /* azul alto */
      g.fillStyle = '#dd2c20'; g.fillRect(0, sideY(2.18), w, sideY(1.98) - sideY(2.18)); /* roja alta */
      g.fillRect(0, sideY(1.02), w, sideY(0.78) - sideY(1.02));           /* roja baja */
      g.fillStyle = '#8e8a85'; g.fillRect(0, sideY(0.28), w, h - sideY(0.28)); /* faldón */
      g.fillStyle = 'rgba(0,0,0,.16)'; g.fillRect(0, h - 14, w, 14);
      if (cabEnd) { /* el azul envuelve la cabina hasta la franja baja (fotos) */
        var cx0 = cabEnd > 0 ? sideX(4.55) : 0, cx1 = cabEnd > 0 ? w : sideX(-4.55);
        g.fillStyle = '#1e4fa3'; g.fillRect(cx0, 0, cx1 - cx0, sideY(1.02));
        g.fillStyle = '#dd2c20';   /* cuña roja bajo la ventana de cabina */
        g.beginPath();
        if (cabEnd > 0) {
          g.moveTo(cx0 + 30, sideY(1.02)); g.lineTo(cx1, sideY(0.55)); g.lineTo(cx1, sideY(1.02));
        } else {
          g.moveTo(cx1 - 30, sideY(1.02)); g.lineTo(cx0, sideY(0.55)); g.lineTo(cx0, sideY(1.02));
        }
        g.closePath(); g.fill();
      }
      /* Ventanas: marco negro redondeado; el cristal queda transparente */
      SIDE_WINS.forEach(function (win) {
        var x = sideX(win.u - win.w / 2), ww = sideW(win.w);
        var y = sideY(WIN_DY[1]), hh = sideY(WIN_DY[0]) - y;
        g.fillStyle = '#101417'; roundRect(g, x - 9, y - 9, ww + 18, hh + 18, 26); g.fill();
        g.save(); g.globalCompositeOperation = 'destination-out';
        roundRect(g, x, y, ww, hh, 20); g.fill(); g.restore();
        if (win.vent) { /* ventila corrediza superior */
          g.fillStyle = '#101417'; g.fillRect(x - 9, y + hh * 0.2, ww + 18, 8);
        }
      });
      /* Puertas: hueco real con sello; las hojas 3D lo cubren al cerrar */
      SIDE_DOORS.forEach(function (d) {
        var x = sideX(d.u - d.w / 2), ww = sideW(d.w);
        var y = sideY(DOOR_DY[1]), hh = sideY(DOOR_DY[0]) - y;
        g.save(); g.globalCompositeOperation = 'destination-out';
        g.fillRect(x, y, ww, hh); g.restore();
        g.strokeStyle = '#101417'; g.lineWidth = 10; g.strokeRect(x, y, ww, hh);
        g.fillStyle = '#ffb020';  /* luz de puerta sobre el hueco (en azul) */
        g.fillRect(x + ww / 2 - 16, sideY(2.38), 32, 20);
      });
      /* Rejilla baja entre puertas y número de unidad M1.xxxx */
      g.strokeStyle = 'rgba(40,48,54,.55)'; g.lineWidth = 4;
      g.strokeRect(sideX(-0.31), sideY(0.72), sideW(0.62), 44);
      for (var i = 0; i < 4; i++) {
        g.beginPath(); g.moveTo(sideX(-0.31), sideY(0.72) + 9 + i * 10);
        g.lineTo(sideX(-0.31) + sideW(0.62), sideY(0.72) + 9 + i * 10); g.stroke();
      }
      /* Logo lateral bajo la primera ventana, sobre la franja roja baja */
      var logoU = cabEnd > 0 ? 1.0 : -2.55;
      drawMetrorreyLogo(g, sideX(logoU), sideY(1.16), sideW(1.55));
      g.fillStyle = '#22282d'; g.font = '700 30px Helvetica,Arial'; g.textAlign = 'left';
      g.fillText(number, sideX(-4.35), sideY(0.42));
      g.fillStyle = 'rgba(240,240,238,.92)'; g.font = '700 26px Helvetica,Arial';
      g.fillText('BOMBARDIER · MM-05', sideX(4.7), 36);
    });
  }

  /* Hoja de puerta MM-05: blanca, ventana alta con sello negro redondeado,
     calcomanía amarilla y la franja roja baja alineada (fotos). La hoja mide
     0.62 × 1.88 m; dy de la franja (0.78–1.02 sobre BODY_Y, puerta desde
     0.32) cae al 62–75 % de su altura. */
  var doorTexture = canvasTexture(256, 640, function (g, w, h) {
    g.fillStyle = '#f1f1ee'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#101417'; roundRect(g, 30, 26, 196, 252, 26); g.fill();
    /* ventana de verdad (hueco en alfa): el cristal es una pieza 3D */
    g.save(); g.globalCompositeOperation = 'destination-out';
    roundRect(g, 40, 36, 176, 232, 20); g.fill(); g.restore();
    g.fillStyle = '#f2c705'; g.fillRect(48, 52, 160, 42);
    g.fillStyle = '#16212b'; g.font = '800 17px Helvetica,Arial'; g.textAlign = 'center';
    g.fillText('PERMITA SALIR', 128, 71); g.fillText('ANTES DE ENTRAR', 128, 89);
    g.fillStyle = '#e8f1f5'; g.fillRect(102, 104, 52, 62);
    g.fillStyle = '#2b6cb0'; g.font = '800 21px Helvetica,Arial'; g.fillText('MIA', 128, 142);
    g.fillStyle = 'rgba(22,33,43,.65)'; g.font = '700 12px Helvetica,Arial';
    g.fillText('tarjeta', 128, 158);
    g.fillStyle = '#dd2c20'; g.fillRect(0, 488, w, 82);      /* franja roja baja */
    g.fillStyle = '#8e8a85'; g.fillRect(0, 606, w, 34);
    g.strokeStyle = '#565f66'; g.lineWidth = 7; g.strokeRect(4, 4, w - 8, h - 8);
    g.fillStyle = '#3a4248'; g.fillRect(w - 26, 300, 10, 90); /* sello vertical */
  });

  /* Frente MM-05 según las fotos: azul arriba con parabrisas único enorme
     (hueco en alfa: cristal 3D + cabina visible), destino LED ámbar DENTRO
     del parabrisas, franja roja central interrumpida por el trapecio blanco
     del logo, faros gemelos en carcasas negras y faldón topo.
     rear=true: trasera, con luces rojas encendidas y destino apagado. */
  function trainFrontTextureFn(rear) {
    return canvasTexture(1000, 970, function (g, w, h) {
      g.fillStyle = '#f1f1ee'; g.fillRect(0, 0, w, h);
      g.fillStyle = '#1e4fa3'; g.fillRect(0, 0, w, 585);            /* azul ~55 % */
      g.fillStyle = '#101417'; roundRect(g, 62, 62, 876, 500, 58); g.fill(); /* sello */
      g.save(); g.globalCompositeOperation = 'destination-out';
      roundRect(g, 78, 78, 844, 468, 48); g.fill(); g.restore();   /* hueco cristal */
      g.fillStyle = '#dd2c20'; g.fillRect(0, 585, w, 118);          /* franja roja */
      g.fillStyle = '#8e8a85'; g.fillRect(0, 888, w, 82);           /* faldón topo */
      g.fillStyle = '#f1f1ee';                                      /* trapecio del logo */
      g.beginPath(); g.moveTo(352, 585); g.lineTo(648, 585); g.lineTo(612, 745);
      g.lineTo(388, 745); g.closePath(); g.fill();
      drawMetrorreyLogo(g, 388, 600, 248);
      /* Faros gemelos + marcadores verticales rojo/ámbar interiores */
      [86, 656].forEach(function (x) {
        g.fillStyle = '#0d1114'; roundRect(g, x, 728, 258, 106, 20); g.fill();
        [0, 1].forEach(function (i) {
          g.fillStyle = rear ? '#5a201c' : '#e8e4da';
          roundRect(g, x + 18 + i * 122, 748, 106, 66, 10); g.fill();
          g.fillStyle = rear ? 'rgba(240,60,45,.85)' : 'rgba(255,246,200,.95)';
          roundRect(g, x + 28 + i * 122, 758, 86, 46, 8); g.fill();
        });
      });
      [[382, '#c22418'], [424, '#e07b16'], [548, '#e07b16'], [590, '#c22418']].forEach(function (m) {
        g.fillStyle = m[1]; roundRect(g, m[0], 742, 34, 74, 12); g.fill();
        if (rear && m[1] === '#c22418') {
          g.fillStyle = 'rgba(255,70,50,.9)'; roundRect(g, m[0] + 6, 752, 22, 54, 9); g.fill();
        }
      });
      g.fillStyle = '#20272d'; g.fillRect(430, 892, 140, 78);      /* hueco acoplador */
    });
  }
  /* Letrero de destino que se ve tras el cristal (plano dentro de la cabina) */
  function destSignTexture(text, on) {
    return canvasTexture(900, 150, function (g, w, h) {
      g.fillStyle = '#10151a'; g.fillRect(0, 0, w, h);
      if (!on) return;
      g.fillStyle = '#ffb020'; g.font = '700 92px Courier New,monospace';
      g.textAlign = 'center'; g.fillText(text, w / 2, 108);
      g.fillStyle = 'rgba(10,13,16,.55)';      /* rejilla de puntos del LED */
      for (var y = 0; y < h; y += 7) g.fillRect(0, y, w, 2);
      for (var x = 0; x < w; x += 7) g.fillRect(x, 0, 2, h);
    });
  }
  /* Piso interior: gris con puntos antideslizantes (foto de interior) */
  var floorTexture = canvasTexture(512, 512, function (g, w, h) {
    g.fillStyle = '#66696c'; g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(255,255,255,.07)';
    for (var y = 8; y < h; y += 24) for (var x = 8; x < w; x += 24) {
      g.beginPath(); g.arc(x + ((y / 24) % 2) * 12, y, 4, 0, 7); g.fill();
    }
    g.fillStyle = 'rgba(0,0,0,.14)';
    for (var i = 0; i < 260; i++) g.fillRect(Math.random() * w, Math.random() * h, 3, 3);
  });
  floorTexture.wrapS = floorTexture.wrapT = THREE.RepeatWrapping;
  floorTexture.repeat.set(7, 1.4);
  /* Banca corrida: plazas moldeadas alternando azul celeste y crema */
  var seatTexture = canvasTexture(1024, 128, function (g, w, h) {
    for (var i = 0; i < 8; i++) {
      g.fillStyle = i % 2 ? '#e8e4da' : '#8fd0ea'; g.fillRect(i * 128, 0, 128, h);
      g.fillStyle = 'rgba(255,255,255,.35)'; g.fillRect(i * 128, 0, 128, 16);
      g.fillStyle = 'rgba(0,0,0,.16)'; g.fillRect(i * 128, h - 18, 128, 18);
      g.fillStyle = 'rgba(0,0,0,.22)'; g.fillRect(i * 128, 0, 4, h);
    }
  });
  seatTexture.wrapS = THREE.RepeatWrapping;
  /* Publicidad interior sobre las ventanas */
  function interiorAdTexture(title, sub, bg, fg) {
    return canvasTexture(700, 200, function (g, w, h) {
      g.fillStyle = bg; g.fillRect(0, 0, w, h);
      g.fillStyle = fg; g.font = '800 52px Helvetica,Arial'; g.textAlign = 'left';
      g.fillText(title, 36, 84);
      g.font = '600 34px Helvetica,Arial'; g.fillText(sub, 38, 140);
      g.fillStyle = 'rgba(255,255,255,.85)'; g.font = '700 24px Helvetica,Arial';
      g.fillText('metrorrey', 540, 168);
    });
  }

  function signTexture(title, sub, bg) {
    return canvasTexture(1600, 360, function (g, w, h) {
      g.fillStyle = bg; g.fillRect(0, 0, w, h);
      g.fillStyle = '#078a4c'; g.fillRect(0, 0, 150, h);
      g.fillStyle = '#fff'; g.font = '800 150px Helvetica,Arial';
      g.textAlign = 'center'; g.fillText('M', 75, 235);
      g.textAlign = 'left'; g.fillStyle = '#fff';
      var titleSize = 118;
      g.font = '800 ' + titleSize + 'px Helvetica,Arial';
      while (g.measureText(title).width > w - 250 && titleSize > 40) {
        titleSize -= 8; g.font = '800 ' + titleSize + 'px Helvetica,Arial';
      }
      g.fillText(title, 200, 175);
      var subSize = 58;
      g.font = '600 ' + subSize + 'px Helvetica,Arial';
      while (g.measureText(sub).width > w - 255 && subSize > 26) {
        subSize -= 6; g.font = '600 ' + subSize + 'px Helvetica,Arial';
      }
      g.fillStyle = '#f2b705';
      g.fillText(sub, 205, 275);
    });
  }

  /* Piso de andén: granito pulido oscuro con moteado claro y juntas
     (fotos de andén del MM-05 y de estaciones elevadas). 2×2 losetas. */
  var graniteTexture = canvasTexture(512, 512, function (g, w, h) {
    var R = Math.random;
    [[0, 0, '#4a4744'], [256, 0, '#55514d'], [0, 256, '#504c48'], [256, 256, '#47433f']].forEach(function (t) {
      g.fillStyle = t[2]; g.fillRect(t[0], t[1], 256, 256);
      for (var i = 0; i < 900; i++) {
        var v = R();
        g.fillStyle = v < 0.55 ? 'rgba(230,226,218,' + (0.25 + R() * 0.5) + ')' : (v < 0.8 ? 'rgba(20,18,16,.5)' : 'rgba(150,120,95,.45)');
        var sz = 1 + R() * 3.2;
        g.fillRect(t[0] + R() * 256, t[1] + R() * 256, sz, sz * (0.6 + R()));
      }
      g.fillStyle = 'rgba(255,255,255,.05)';
      g.beginPath(); g.moveTo(t[0] + R() * 256, t[1]); g.lineTo(t[0] + R() * 256, t[1] + 256); g.lineTo(t[0] + 40 + R() * 200, t[1] + 256); g.fill();
    });
    g.fillStyle = 'rgba(15,14,13,.85)';
    g.fillRect(0, 0, w, 3); g.fillRect(0, 254, w, 4); g.fillRect(0, 0, 3, h); g.fillRect(254, 0, 4, h);
  });
  graniteTexture.wrapS = graniteTexture.wrapT = THREE.RepeatWrapping;
  /* Lámina acanalada del techo vista por abajo (costillas a lo largo) */
  var corrugatedTexture = canvasTexture(256, 32, function (g, w) {
    var grd = g.createLinearGradient(0, 0, w / 8, 0);
    grd.addColorStop(0, '#9aa2a6'); grd.addColorStop(0.35, '#e4e8ea'); grd.addColorStop(0.55, '#c3c9cc'); grd.addColorStop(1, '#8a9296');
    for (var i = 0; i < 8; i++) { g.save(); g.translate(i * w / 8, 0); g.fillStyle = grd; g.fillRect(0, 0, w / 8, 32); g.restore(); }
  });
  corrugatedTexture.wrapS = corrugatedTexture.wrapT = THREE.RepeatWrapping;
  corrugatedTexture.repeat.set(6, 1);
  /* Letrero de andén estilo Metrorrey: blanco, franja de la línea (amarillo
     L1, verde L2) con corte diagonal, «M» y nombre en negro (foto de San
     Bernabé) */
  var L1_COLOR = '#e3a600', L2_COLOR = '#078a4c';
  function stationSignTexture(title, sub, col) {
    col = col || L2_COLOR;
    return canvasTexture(1600, 360, function (g, w, h) {
      g.fillStyle = '#f4f4f1'; g.fillRect(0, 0, w, h);
      g.fillStyle = col;
      g.beginPath(); g.moveTo(0, 0); g.lineTo(w * 0.62, 0); g.lineTo(w * 0.58, 34); g.lineTo(0, 34); g.fill();
      g.fillRect(0, h - 22, w, 22);
      g.fillStyle = col; g.fillRect(40, 70, 170, 170);
      g.fillStyle = '#fff'; g.font = '800 150px Helvetica,Arial'; g.textAlign = 'center';
      g.fillText('M', 125, 212);
      g.fillStyle = '#16212b'; g.textAlign = 'left';
      var size = 132; g.font = '800 ' + size + 'px Helvetica,Arial';
      while (g.measureText(title).width > w - 300 && size > 50) { size -= 8; g.font = '800 ' + size + 'px Helvetica,Arial'; }
      g.fillText(title, 250, 200);
      g.fillStyle = '#3d5160'; g.font = '600 52px Helvetica,Arial';
      g.fillText(sub, 254, 282);
    });
  }
  var mapTexture = canvasTexture(800, 1000, function (g, w, h) {
    g.fillStyle = '#fff'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#16212b'; g.font = '800 52px Helvetica,Arial';
    g.fillText('Red Metrorrey', 55, 82);
    g.strokeStyle = '#f2b705'; g.lineWidth = 26;
    g.beginPath(); g.moveTo(80, 560); g.lineTo(720, 560); g.stroke();
    g.strokeStyle = '#078a4c';
    g.beginPath(); g.moveTo(400, 150); g.lineTo(400, 860); g.stroke();
    g.strokeStyle = '#7a4ba3';
    g.beginPath(); g.moveTo(120, 840); g.lineTo(400, 560); g.lineTo(700, 280); g.stroke();
    g.fillStyle = '#fff'; g.beginPath(); g.arc(400, 560, 36, 0, 7); g.fill();
    g.lineWidth = 8; g.strokeStyle = '#16212b'; g.stroke();
    g.fillStyle = '#16212b'; g.font = '700 34px Helvetica,Arial';
    g.fillText('Cuauhtémoc', 455, 540);
    g.font = '600 29px Helvetica,Arial';
    g.fillText('L1  Exposición — Talleres', 55, 920);
    g.fillText('L2  Sendero — Gral. I. Zaragoza', 55, 962);
  });

  var streetTexture = canvasTexture(1024, 512, function (g, w, h) {
    g.fillStyle = '#3b4045'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#f5f5f0';
    for (var x = 20; x < w; x += 130) g.fillRect(x, h / 2 - 7, 72, 14);
    g.fillStyle = 'rgba(255,255,255,.25)';
    g.fillRect(0, 42, w, 8); g.fillRect(0, h - 50, w, 8);
  });
  streetTexture.wrapS = THREE.RepeatWrapping; streetTexture.repeat.x = 28; /* 26.3 m: cabe exacto en el tramo */

  /* ---------- Entorno: suelo y Cerro de la Silla (fondo lejano) ---------- */
  /* Terreno con un hueco bajo el edificio de transbordo (x 30…46, z 18…34):
     por ahí baja la escalera a la Línea 2 */
  var groundShape = new THREE.Shape();
  groundShape.moveTo(-800, -350); groundShape.lineTo(800, -350); groundShape.lineTo(800, 350); groundShape.lineTo(-800, 350);
  var groundHole = new THREE.Path();   /* y de la figura = −z del mundo */
  groundHole.moveTo(30, -34); groundHole.lineTo(30, -18); groundHole.lineTo(46, -18); groundHole.lineTo(46, -34);
  groundShape.holes.push(groundHole);
  var groundGeo = new THREE.ShapeGeometry(groundShape);
  groundGeo.rotateX(-Math.PI / 2);
  var ground = mesh(groundGeo, std(0x93a07a, 1, 0), 0, -0.03, 0);
  ground.castShadow = false;

  /* Fondo lejano: el cerro está a kilómetros, así que en modo conductor
     acompaña al tren (casi no se mueve) y el reciclaje del tramo no lo
     hace brincar. Ver el bucle principal. */
  var farBg = new THREE.Group(); scene.add(farBg);
  /* Cerro de la Silla: silueta con su característica ensillada, extruida */
  (function cerro() {
    var s = new THREE.Shape();
    s.moveTo(-42, 0); s.lineTo(-30, 8); s.lineTo(-19, 20); s.lineTo(-11, 23);
    s.lineTo(-4, 15); s.lineTo(3, 12); s.lineTo(10, 17); s.lineTo(18, 22);
    s.lineTo(27, 16); s.lineTo(36, 7); s.lineTo(44, 0); s.lineTo(-42, 0);
    var geo = new THREE.ExtrudeGeometry(s, { depth: 8, bevelEnabled: false });
    var m = mesh(geo, MAT.mountain, -6, 0, -92, farBg);
    m.castShadow = false;
    var m2 = mesh(geo, std(0x93aabb, 1, 0), 34, 0, -104, farBg);
    m2.scale.set(1.35, 0.75, 1); m2.castShadow = false;
  })();

  /* ---------- Línea infinita: tramo periódico ----------
     Todo lo fijo (estación al centro + viaducto, catenaria y calle hasta
     media distancia a la siguiente estación) se arma dentro de worldTile,
     de TILE_LEN metros. Se clona adelante y atrás: la siguiente estación
     siempre se ve al fondo y el conductor recicla el tramo sin cortes. */
  /* 736 m entre estaciones (en la red real ~1 km): da para llegar a la
     velocidad punta de 80 km/h, sostenerla y frenar con suavidad. */
  var TILE_LEN = 736, TILE_HALF = TILE_LEN / 2;
  var worldTile = new THREE.Group(); scene.add(worldTile);
  BUILD = worldTile;
  var dummy = new THREE.Object3D();
  /* Repetidos (postes, péndolas, columnas…) en una sola malla instanciada. */
  function instanced(geo, mat, list, parent) {
    var im = new THREE.InstancedMesh(geo, mat, list.length);
    list.forEach(function (p, i) {
      dummy.position.set(p[0], p[1], p[2]);
      dummy.rotation.set(p[3] || 0, p[4] || 0, p[5] || 0);
      dummy.updateMatrix(); im.setMatrixAt(i, dummy.matrix);
    });
    /* r128 no calcula la esfera de las instancias: se arma a mano para que
       la cámara y la sombra las recorten bien */
    var bb = new THREE.Box3();
    list.forEach(function (p) { bb.expandByPoint(new THREE.Vector3(p[0], p[1], p[2])); });
    geo.computeBoundingSphere();
    var sphere = bb.getBoundingSphere(new THREE.Sphere());
    sphere.radius += geo.boundingSphere.radius + geo.boundingSphere.center.length();
    geo.boundingSphere = sphere;
    im.castShadow = true; im.receiveShadow = true;
    (parent || BUILD).add(im);
    return im;
  }

  /* ---------- Viaducto elevado y vía ---------- */
  /* La línea elevada va 3.5 m más alta que antes: debajo de los andenes
     cabe la conexión N2 y queda ~4.5 m libre sobre la avenida. */
  var LIFT = 3.5;
  var DECK_Y = 6 + LIFT, RAIL_Y = 6.55 + LIFT, TRAIN_Z = -1.20, TRACK_B_Z = -4.45;
  /* Escaleras andén → N2: bajan desde cada extremo del andén hacia afuera
     y atraviesan la losa por estos huecos (hasta donde pasa la cabeza) */
  var N2_Y = 4.9;
  var N1_STAIR = { zA: 3.9, zB: -7.95, w: 1.7 };
  var N1_HOLES = [];
  [1, -1].forEach(function (s) {
    [N1_STAIR.zA, N1_STAIR.zB].forEach(function (z) {
      N1_HOLES.push([s > 0 ? 26 : -32.9, s > 0 ? 32.9 : -26, z - 0.9, z + 0.9]);
    });
  });
  /* Vía internacional 1,435 mm: rieles (0.09 de ancho) centrados a ±0.76 m.
     Eje A a -1.20 (hueco tren-andén 0.09 m), eje B a -4.45 (entre-eje 3.25 m). */
  slabWithHoles(-43, 43, -9.55, 6.85, DECK_Y - 1.1, DECK_Y, MAT.concrete, N1_HOLES);   /* losa (ambos andenes) */
  box(86, 0.55, 0.45, MAT.concreteDark, 0, DECK_Y + 0.25, -9.3);  /* parapeto */
  box(86, 0.55, 0.45, MAT.concreteDark, 0, DECK_Y + 0.25, 5.05);
  /* Viaducto de línea (más angosto) hasta media distancia de la siguiente */
  [-1, 1].forEach(function (s) {
    var len = TILE_HALF - 43, cx = s * (43 + len / 2);
    box(len, 1.1, 13, MAT.concrete, cx, DECK_Y - 0.55, -1.6);
    box(len, 0.55, 0.45, MAT.concreteDark, cx, DECK_Y + 0.25, 4.4);
    box(len, 0.55, 0.45, MAT.concreteDark, cx, DECK_Y + 0.25, -7.9);
  });
  /* Columnas cada 18.4 m (20 por tramo, encajan con el periodo) */
  var colPts = [], capPts = [], footPts = [];
  for (var ck = -TILE_LEN / 36.8; ck < TILE_LEN / 36.8; ck++) {
    colPts.push([ck * 18.4, (DECK_Y - 1) / 2, -1.2]);
    capPts.push([ck * 18.4, DECK_Y - 1.35, -1.2]);
    footPts.push([ck * 18.4, 0.25, -1.2]);
  }
  instanced(new THREE.CylinderGeometry(0.85, 1.05, DECK_Y - 1, 20), MAT.concrete, colPts);
  instanced(new THREE.BoxGeometry(4.6, 0.9, 9.4), MAT.concrete, capPts);              /* cabezal */
  instanced(new THREE.BoxGeometry(3.4, 0.5, 3.4), MAT.concreteDark, footPts);         /* zapata */

  /* ---------- Vía completa en todo el recorrido (ambas vías) ----------
     Vía en placa: sin balasto ni piedra. Cada vía va sobre una placa plana
     de concreto gris oscuro, sólida y sin textura, unida a la losa del
     viaducto (como el metro real). Durmientes de concreto cada 0.65 m
     con sus placas de fijación, y rieles continuos. Los durmientes van
     instanciados por trozos de 46 m para que la cámara recorte lo que no
     ve (y la niebla lo lejano). */
  var trackSlabMat = std(0x777d82, 0.95, 0);   /* cemento gris oscuro, color plano */
  [TRAIN_Z, TRACK_B_Z].forEach(function (z) {
    /* placa de concreto: su cara superior queda a la misma altura que la
       antigua cama de balasto, así durmientes y rieles no cambian de nivel */
    box(TILE_LEN, 0.42, 2.9, trackSlabMat, 0, DECK_Y + 0.21, z).castShadow = false;
    [-0.76, 0.76].forEach(function (dz) { box(TILE_LEN, 0.16, 0.09, MAT.rail, 0, RAIL_Y + 0.05, z + dz); });
  });
  /* Durmiente de concreto + 2 placas de asiento bajo los rieles: una sola
     geometría con color por vértice */
  var sleeperGeo = mergeGeos([
    paintGeo(new THREE.BoxGeometry(0.24, 0.16, 2.4).translate(0, -0.11, 0), 0x8f8b84, true),
    paintGeo(new THREE.BoxGeometry(0.2, 0.05, 0.32).translate(0, -0.005, -0.76), 0x2a2d30, true),
    paintGeo(new THREE.BoxGeometry(0.2, 0.05, 0.32).translate(0, -0.005, 0.76), 0x2a2d30, true)
  ], ['position', 'normal', 'color']);
  var sleeperMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 });
  var CHUNK = 46;
  for (var cx0 = -TILE_HALF; cx0 < TILE_HALF; cx0 += CHUNK) {
    var spts = [];
    for (var sx = cx0 + 0.325; sx < cx0 + CHUNK; sx += 0.65) {
      spts.push([sx, RAIL_Y, TRAIN_Z], [sx, RAIL_Y, TRACK_B_Z]);
    }
    instanced(sleeperGeo.clone(), sleeperMat, spts).castShadow = false;
  }

  /* ---------- Catenaria: pórticos azules e hilo de contacto ---------- */
  var WIRE_Y = RAIL_Y + 5.05;
  var dropPts = [], postPts = [], beamPts = [], regPts = [], regBoxPts = [];
  [TRAIN_Z, TRACK_B_Z].forEach(function (z) {
    var contact = mesh(new THREE.CylinderGeometry(0.028, 0.028, TILE_LEN, 6), MAT.wire, 0, WIRE_Y, z);
    contact.rotation.z = Math.PI / 2; contact.castShadow = false;
    var messenger = mesh(new THREE.CylinderGeometry(0.022, 0.022, TILE_LEN, 6), MAT.wire, 0, WIRE_Y + 0.65, z);
    messenger.rotation.z = Math.PI / 2; messenger.castShadow = false;
    for (var dx = -TILE_HALF; dx < TILE_HALF; dx += 5.75) dropPts.push([dx, WIRE_Y + 0.32, z]);
  });
  /* Pórticos cada 11.5 m: postes fuera de las vías + viga sobre ambas */
  for (var gk = -TILE_LEN / 23; gk < TILE_LEN / 23; gk++) {
    var gx = gk * 11.5;
    postPts.push([gx, (DECK_Y + WIRE_Y + 1.1) / 2, 5.0], [gx, (DECK_Y + WIRE_Y + 1.1) / 2, -9.0]);
    beamPts.push([gx, WIRE_Y + 1.05, -2.0, Math.PI / 2]);
    [TRAIN_Z, TRACK_B_Z].forEach(function (z) {
      regPts.push([gx, WIRE_Y + 0.52, z]); regBoxPts.push([gx, WIRE_Y + 0.68, z]);
    });
  }
  instanced(new THREE.CylinderGeometry(0.012, 0.012, 0.65, 5), MAT.wire, dropPts).castShadow = false;
  clutter.push(instanced(new THREE.CylinderGeometry(0.13, 0.16, WIRE_Y + 1.1 - DECK_Y, 12),
    MAT.blueSteel, postPts));
  clutter.push(instanced(new THREE.CylinderGeometry(0.11, 0.11, 14.4, 12), MAT.blueSteel, beamPts));
  instanced(new THREE.CylinderGeometry(0.035, 0.035, 1.05, 8), MAT.steelDark, regPts).castShadow = false;
  instanced(new THREE.BoxGeometry(0.5, 0.08, 0.08), MAT.steelDark, regBoxPts);

  /* ---------- Avenida bajo el viaducto: calle, banquetas, farolas y árboles ---------- */
  var street = mesh(new THREE.PlaneGeometry(TILE_LEN, 13),
    new THREE.MeshStandardMaterial({ map: streetTexture, roughness: 0.95 }), 0, 0.02, 7.5);
  street.rotation.x = -Math.PI / 2; street.castShadow = false;
  var walkS = box(TILE_LEN, 0.18, 2.2, MAT.concrete, 0, 0.08, 15.2);   /* banqueta */
  var walkN = box(TILE_LEN, 0.18, 2.2, MAT.concrete, 0, 0.08, -0.4);
  /* aparte (sin fusionar): la vista en corte las oculta para ver abajo */
  street.userData.noMerge = walkS.userData.noMerge = walkN.userData.noMerge = true;
  var lampPts = [], headPts = [], trunkPts = [], leafPts = [];
  for (var lk = -TILE_LEN / 46; lk < TILE_LEN / 46; lk++) {
    var lx = lk * 23 + 11.5;
    lampPts.push([lx, 2.7, 14.6]); headPts.push([lx, 5.45, 14.6]);
    var tx = lx + 6;
    if (Math.abs(tx - 4) < 3 || Math.abs(tx - 38) < 10) continue;  /* escalera sur y edificio de transbordo */
    trunkPts.push([tx, 0.8, 16.5]); leafPts.push([tx, 2.9, 16.5]);
  }
  instanced(new THREE.CylinderGeometry(0.09, 0.12, 5.4, 10), MAT.steelDark, lampPts);
  instanced(new THREE.SphereGeometry(0.22, 12, 10), MAT.lamp, headPts).castShadow = false;
  instanced(new THREE.CylinderGeometry(0.14, 0.2, 1.6, 8), std(0x6b4a2a, 0.9, 0), trunkPts);
  var leafGeo = new THREE.SphereGeometry(1.7, 12, 10); leafGeo.scale(1, 0.82, 1);
  instanced(leafGeo, std(0x4a7d3a, 0.95, 0), leafPts);

  /* Arco monumental de Cuauhtémoc sobre la avenida (foto desde la calle):
     semicírculo de celosía con un anillo circular colgando al centro. */
  (function stationArch() {
    var g = new THREE.Group(); g.position.set(30, DECK_Y, 0); BUILD.add(g);
    var arch = mesh(new THREE.TorusGeometry(8.2, 0.22, 10, 42, Math.PI), MAT.blueSteel, 0, 0, 0, g);
    arch.rotation.y = Math.PI / 2;
    var arch2 = mesh(new THREE.TorusGeometry(7.3, 0.13, 8, 42, Math.PI), MAT.steel, 0, 0, 0, g);
    arch2.rotation.y = Math.PI / 2;
    for (var a = 0; a <= 8; a++) {
      var ang = a / 8 * Math.PI;
      var spoke = mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.95, 8), MAT.steel,
        0, Math.sin(ang) * 7.75, Math.cos(ang) * 7.75, g);
      spoke.rotation.x = ang + Math.PI / 2;
    }
    var ring = mesh(new THREE.TorusGeometry(1.9, 0.14, 10, 36), MAT.blueSteel, 0, 5.1, 0, g);
    ring.rotation.y = Math.PI / 2;
    mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.2, 8), MAT.steelDark, 0, 7.6, 0, g);
    box(0.8, 1.2, 0.8, MAT.concrete, 0, 0.4, 8.2, g);
    box(0.8, 1.2, 0.8, MAT.concrete, 0, 0.4, -8.2, g);
  })();

  /* ---------- Ciudad procedural entre estaciones ----------
     Manzanas de edificios con ventanas a ambos lados de la avenida, una por
     tramo y con semilla propia: cada tramo es distinto. Se fusionan en dos
     mallas por tramo (muros + azoteas) con color por vértice. */
  function mulberry(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  /* Geometría no indexada con color por vértice, lista para fusionar */
  function paintGeo(geo, hex, srgb) {
    var g = geo.index ? geo.toNonIndexed() : geo, c = new THREE.Color(hex);
    if (srgb) c.convertSRGBToLinear();   /* tono real (ropa y piel), no deslavado */
    var n = g.attributes.position.count, a = new Float32Array(n * 3);
    for (var i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
    g.setAttribute('color', new THREE.BufferAttribute(a, 3));
    return g;
  }
  function mergeGeos(list, names) {
    var total = 0, out = new THREE.BufferGeometry();
    list.forEach(function (g) { total += g.attributes.position.count; });
    names.forEach(function (n) {
      var size = list[0].attributes[n].itemSize, arr = new Float32Array(total * size), off = 0;
      list.forEach(function (g) { arr.set(g.attributes[n].array, off); off += g.attributes[n].array.length; });
      out.setAttribute(n, new THREE.BufferAttribute(arr, size));
    });
    out.computeBoundingSphere();
    return out;
  }
  /* Fusiona en UNA malla por material todo lo fijo de un grupo (estación,
     carrocería del tren): cientos de piezas → unas decenas de llamadas de
     dibujo. Se respeta lo que se mueve o anima (userData.noMerge en él o
     en un ancestro), las mallas con varios materiales y las instancias.
     Como el material es el mismo objeto, techos/paredes se siguen
     desvaneciendo igual. */
  function mergeStatic(root) {
    root.updateMatrixWorld(true);
    var inv = new THREE.Matrix4().copy(root.matrixWorld).invert(), buckets = {}, gone = [];
    root.traverse(function (o) {
      if (!o.isMesh || o.isInstancedMesh || Array.isArray(o.material)) return;
      for (var q = o; q && q !== root; q = q.parent) if (q.userData.noMerge) return;
      var g = o.geometry;
      if (!g.attributes.uv || !g.attributes.normal || g.attributes.color) return;
      var key = o.material.uuid + (o.castShadow ? 'c' : '') + (o.receiveShadow ? 'r' : '');
      var b = buckets[key] || (buckets[key] = { mat: o.material, cast: o.castShadow, recv: o.receiveShadow, geos: [] });
      var gg = g.index ? g.toNonIndexed() : g.clone();
      gg.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld));
      b.geos.push(gg); gone.push(o);
    });
    gone.forEach(function (o) { o.parent.remove(o); });
    Object.keys(buckets).forEach(function (k) {
      var b = buckets[k], m = new THREE.Mesh(mergeGeos(b.geos, ['position', 'normal', 'uv']), b.mat);
      m.castShadow = b.cast; m.receiveShadow = b.recv; root.add(m);
      b.geos.forEach(function (g) { g.dispose(); });
    });
    return gone.length;
  }
  /* Copia solo ciertas caras (6 vértices c/u) de una caja no indexada */
  function boxFaces(g, faces) {
    var out = new THREE.BufferGeometry();
    ['position', 'normal', 'uv', 'color'].forEach(function (n) {
      var src = g.attributes[n], size = src.itemSize, arr = new Float32Array(faces.length * 6 * size);
      faces.forEach(function (f, i) { arr.set(src.array.subarray(f * 6 * size, (f + 1) * 6 * size), i * 6 * size); });
      out.setAttribute(n, new THREE.BufferAttribute(arr, size));
    });
    return out;
  }
  /* Fachada: 4 ventanas × 4 pisos por mosaico (16 × 12.8 m); de noche
     algunas se encienden (emissiveMap). */
  function facadeTexture(lit) {
    var tex = canvasTexture(256, 256, function (g, w, h) {
      var R = mulberry(7);
      g.fillStyle = lit ? '#000' : '#fff'; g.fillRect(0, 0, w, h);
      for (var fy = 0; fy < 4; fy++) for (var fx2 = 0; fx2 < 4; fx2++) {
        var on = R() < 0.42;
        if (lit) { if (!on) continue; g.fillStyle = R() < 0.5 ? '#ffd58a' : '#ffe9c2'; }
        else g.fillStyle = '#56636e';
        g.fillRect(fx2 * 64 + 12, fy * 64 + 14, 40, 34);
        if (!lit) { g.fillStyle = 'rgba(255,255,255,.22)'; g.fillRect(fx2 * 64 + 12, fy * 64 + 14, 40, 6); }
      }
      if (!lit) { g.fillStyle = 'rgba(0,0,0,.07)'; for (var r = 0; r < 4; r++) g.fillRect(0, r * 64 + 60, w, 4); }
    });
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    return tex;
  }
  var cityWallMat = new THREE.MeshStandardMaterial({
    map: facadeTexture(false), emissiveMap: facadeTexture(true), emissive: 0xffffff,
    emissiveIntensity: 0, vertexColors: true, roughness: 0.88 });
  var cityRoofMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 });
  var CITY_COLORS = [0xd8d0c0, 0xc8bfae, 0x9fb2bd, 0xd8d5cc, 0xb5a89a, 0xe3dccb,
    0xa9a39a, 0xc9b8a0, 0x8fa3ad, 0xe8e2d4, 0xb7aa98, 0xcfc6b5];
  function buildCityTile(seed) {
    var R = mulberry(seed * 9973 + 17), walls = [], roofs = [];
    function row(z0, z1, dirZ) {
      var x = -TILE_HALF + R() * 6;
      while (x < TILE_HALF - 6) {
        var w = 8 + R() * 12, d = 9 + R() * 8;
        if (x + w > TILE_HALF - 2) w = TILE_HALF - 2 - x;
        if (w < 5) break;
        var tall = R() < 0.18, h = tall ? 24 + R() * 20 : 6 + R() * 14;
        if (dirZ > 0 && Math.abs(x + w / 2) < 70) h = Math.min(h, 13);   /* no tapar las vistas de la estación */
        var z = dirZ > 0 ? z0 + d / 2 + R() * 3 : z0 - d / 2 - R() * 3;
        if (Math.abs(z) < Math.abs(z1)) {
          var g = paintGeo(new THREE.BoxGeometry(w, h, d), CITY_COLORS[Math.floor(R() * CITY_COLORS.length)]);
          g.translate(x + w / 2, h / 2, z);
          var uv = g.attributes.uv.array;
          for (var f = 0; f < 6; f++) for (var v = 0; v < 6; v++) {
            var i = (f * 6 + v) * 2, span = f < 2 ? d : w;
            uv[i] *= span / 16; uv[i + 1] *= h / 12.8;
          }
          walls.push(boxFaces(g, [0, 1, 4, 5])); roofs.push(boxFaces(g, [2]));
        }
        x += w + (R() < 0.14 ? 12 + R() * 6 : 1 + R() * 4);   /* a veces una calle */
      }
    }
    row(-27, -70, -1);   /* norte, detrás del viaducto */
    row(34, 78, 1);      /* sur, detrás de la banqueta y el pabellón */
    var grp = new THREE.Group();
    var wm = new THREE.Mesh(mergeGeos(walls, ['position', 'normal', 'uv', 'color']), cityWallMat);
    var rm = new THREE.Mesh(mergeGeos(roofs, ['position', 'normal', 'uv', 'color']), cityRoofMat);
    wm.castShadow = rm.castShadow = false; wm.receiveShadow = rm.receiveShadow = true;
    grp.add(wm); grp.add(rm);
    return grp;
  }

  /* ---------- Andén de la estación ---------- */
  var PLAT_Y = 7.55 + LIFT; /* piso del andén, a nivel del piso del tren */
  box(52, PLAT_Y - DECK_Y, 4.7, MAT.platform, 0, (DECK_Y + PLAT_Y) / 2, 2.6);
  box(52, 0.09, 0.55, MAT.yellow, 0, PLAT_Y + 0.045, 0.62);      /* línea amarilla */
  box(52, 0.1, 0.22, MAT.dark, 0, PLAT_Y + 0.05, 0.3);           /* borde */
  box(52, 0.05, 0.4, std(0xe6c65c, 0.8, 0), 0, PLAT_Y + 0.025, 1.15); /* franja podotáctil */
  function graniteFloor(len, wid, z) {   /* granito pulido sobre la losa del andén */
    var t = graniteTexture.clone(); t.needsUpdate = true; t.repeat.set(len / 1.2, wid / 1.2);
    var m = new THREE.MeshStandardMaterial({ map: t, roughness: 0.2, metalness: 0.05 });
    m.userData.polished = true;
    var f = mesh(new THREE.PlaneGeometry(len, wid), m, 0, PLAT_Y + 0.004, z);
    f.rotation.x = -Math.PI / 2; f.castShadow = false;
  }
  graniteFloor(52, 4.6, 2.62);

  /* Bolitas podotáctiles instanciadas */
  var tactile = new THREE.InstancedMesh(
    new THREE.CylinderGeometry(0.045, 0.045, 0.03, 10), MAT.dark, 200);
  var ti = 0;
  for (var tx = -25; tx <= 25 && ti < 200; tx += 0.5) {
    dummy.position.set(tx, PLAT_Y + 0.06, 1.15); dummy.rotation.set(0, 0, 0);
    dummy.updateMatrix(); tactile.setMatrixAt(ti++, dummy.matrix);
  }
  tactile.count = ti; tactile.frustumCulled = false; BUILD.add(tactile);

  /* Cubierta curva sobre el andén (segmento de cilindro abierto) */
  /* Arco superior: tras rotar Z, el X del cilindro pasa a ser la altura (Y),
     por eso theta se centra en PI/2 (seno máximo). */
  var roofGeo = new THREE.CylinderGeometry(5.4, 5.4, 48, 24, 1, true, Math.PI * 0.35, Math.PI * 0.30);
  /* Techo de estación desvanecible (Auto/Visible/Transparente/Oculto) */
  var roofMat = fadeMat(new THREE.MeshStandardMaterial({
    map: corrugatedTexture, color: 0xc4ccd2, roughness: 0.5, metalness: 0.45, side: THREE.DoubleSide
  }), stationRoofFade);
  var gutterMat = fadeMat(std(0x3a4248, 0.45, 0.7), stationRoofFade);
  var roof = mesh(roofGeo, roofMat, 0, PLAT_Y - 0.4, 2.6);
  roof.rotation.z = Math.PI / 2;
  box(48, 0.22, 0.3, gutterMat, 0, PLAT_Y + 4.42, 0.55);   /* canalón lado vía */
  box(48, 0.22, 0.3, gutterMat, 0, PLAT_Y + 4.42, 4.65);

  /* Marcos azules curvos (fotos de andenes elevados): poste al fondo del
     andén que se dobla en arco bajo la lámina hasta la orilla de la vía. */
  function roofFrame(x, roofZ, backZ, frontZ) {
    var R = 5.22, pts = [];
    var yAt = function (z) { return PLAT_Y - 0.4 + Math.sqrt(R * R - (z - roofZ) * (z - roofZ)); };
    pts.push(new THREE.Vector3(x, PLAT_Y, backZ), new THREE.Vector3(x, yAt(backZ) - 0.75, backZ));
    for (var i = 1; i <= 8; i++) {
      var z = backZ + (frontZ - backZ) * Math.pow(i / 8, 1.15);
      pts.push(new THREE.Vector3(x, yAt(z) - (i === 1 ? 0.25 : 0), z));
    }
    var geo = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, false, 'centripetal'), 48, 0.11, 10, false);
    mesh(geo, MAT.blueSteel, 0, 0, 0);
    box(0.42, 0.06, 0.42, MAT.steelDark, x, PLAT_Y + 0.03, backZ);           /* placa base */
  }
  [-22, -15, -8, -1, 6, 13, 20].forEach(function (x) { roofFrame(x, 2.6, 4.55, 0.45); });

  /* Barandal trasero del andén: postes + tubo superior */
  var railTube = mesh(new THREE.CylinderGeometry(0.045, 0.045, 52, 10), MAT.steel,
    0, PLAT_Y + 1.08, 4.85);
  railTube.rotation.z = Math.PI / 2;
  var railTube2 = railTube.clone(); railTube2.position.y = PLAT_Y + 0.58; BUILD.add(railTube2);
  for (var rx = -25; rx <= 25; rx += 2.5) {
    mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.08, 8), MAT.steel, rx, PLAT_Y + 0.54, 4.85);
  }

  /* Bancas */
  [-16, -5, 6, 17].forEach(function (x) {
    var b = new THREE.Group(); b.position.set(x, PLAT_Y, 3.9); BUILD.add(b);
    box(2.4, 0.1, 0.55, MAT.bench, 0, 0.48, 0, b);
    box(2.4, 0.55, 0.09, MAT.bench, 0, 0.82, 0.26, b);
    box(0.12, 0.48, 0.45, MAT.steelDark, -1, 0.24, 0, b);
    box(0.12, 0.48, 0.45, MAT.steelDark, 1, 0.24, 0, b);
  });

  /* Letreros colgantes y mapa de la red */
  var signMat = new THREE.MeshStandardMaterial({
    map: stationSignTexture('CUAUHTÉMOC', 'Línea 1 · Dirección Exposición', L1_COLOR), roughness: 0.6
  });
  [-14, 0, 14].forEach(function (x) {
    var sign = mesh(new THREE.BoxGeometry(6.4, 1.45, 0.14),
      [MAT.dark, MAT.dark, MAT.dark, MAT.dark, signMat, signMat], x, PLAT_Y + 3.25, 2.6);
    sign.castShadow = false; clutter.push(sign);
    mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.6, 8), MAT.steelDark, x - 2.2, PLAT_Y + 4.25, 2.6);
    mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.6, 8), MAT.steelDark, x + 2.2, PLAT_Y + 4.25, 2.6);
  });
  var mapPanel = mesh(new THREE.BoxGeometry(1.7, 2.1, 0.12),
    [MAT.dark, MAT.dark, MAT.dark, MAT.dark,
     new THREE.MeshStandardMaterial({ map: mapTexture, roughness: 0.6 }), MAT.dark],
    -9, PLAT_Y + 1.35, 4.35);
  mapPanel.rotation.y = Math.PI; clutter.push(mapPanel); /* cara al andén */
  mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.8, 10), MAT.steelDark, -9, PLAT_Y + 0.4, 4.35);

  /* Cristalera trasera del andén (en las fotos: vidrio con marcos azules) */
  for (var gx2 = -24; gx2 <= 22; gx2 += 3.85) {
    var pane = mesh(new THREE.PlaneGeometry(3.7, 2.1), MAT.glassPanel, gx2 + 1.92, PLAT_Y + 2.15, 4.82);
    pane.rotation.y = Math.PI; pane.castShadow = false;
    box(0.09, 2.2, 0.09, MAT.blueSteel, gx2, PLAT_Y + 2.15, 4.82);
  }
  box(50, 0.1, 0.1, MAT.blueSteel, 0, PLAT_Y + 3.24, 4.82);
  box(50, 0.1, 0.1, MAT.blueSteel, 0, PLAT_Y + 1.06, 4.82);

  /* Tiras de luz bajo la cubierta y altavoces/cámaras */
  var lightStripMat = new THREE.MeshStandardMaterial({
    color: 0xffffff, emissive: 0xfff3cf, emissiveIntensity: 0.75, roughness: 0.5
  });
  box(46, 0.06, 0.28, lightStripMat, 0, PLAT_Y + 4.55, 2.6).castShadow = false;
  box(46, 0.06, 0.28, lightStripMat, 0, PLAT_Y + 4.35, 1.1).castShadow = false;
  [-18, -6, 6, 18].forEach(function (x) {
    box(0.42, 0.24, 0.3, MAT.dark, x, PLAT_Y + 4.15, 2.6);          /* altavoz */
    var cam = mesh(new THREE.CylinderGeometry(0.055, 0.07, 0.34, 10), MAT.white,
      x + 1.4, PLAT_Y + 4.05, 3.1);
    cam.rotation.x = Math.PI / 2.6;                                  /* cámara CCTV */
  });

  /* Botes de basura grandes, como el de la foto del MM-93 */
  [-11, 3, 15].forEach(function (x) {
    mesh(new THREE.CylinderGeometry(0.42, 0.36, 0.95, 14), std(0x39434a, 0.7, 0.2),
      x, PLAT_Y + 0.48, 4.1);
    mesh(new THREE.CylinderGeometry(0.45, 0.45, 0.09, 14), MAT.dark, x, PLAT_Y + 0.99, 4.1);
  });

  /* Paneles publicitarios y letrero de transbordo (Cuauhtémoc une L1 y L2) */
  function adPanel(x, title, sub, bg) {
    var mat = new THREE.MeshStandardMaterial({ map: signTexture(title, sub, bg), roughness: 0.6 });
    var p = mesh(new THREE.BoxGeometry(3.4, 1.55, 0.1),
      [MAT.dark, MAT.dark, MAT.dark, MAT.dark, mat, MAT.dark], x, PLAT_Y + 1.65, 4.68);
    p.rotation.y = Math.PI; p.castShadow = false; clutter.push(p);
  }
  adPanel(-19, 'CERRO DE LA SILLA', 'Símbolo de Monterrey', '#27567d');
  adPanel(11, 'FUNDIDORA', 'Parque · Línea 1', '#6b4a2a');
  adPanel(20.5, 'TRANSBORDO', 'Línea 2 · baja a la conexión', '#056a3a');

  /* Letreros LED de próximo tren (textura dinámica, se actualiza por estado) */
  var ledCanvas = document.createElement('canvas'); ledCanvas.width = 1024; ledCanvas.height = 224;
  var ledCtx = ledCanvas.getContext('2d');
  var ledTexture = new THREE.CanvasTexture(ledCanvas); ledTexture.encoding = THREE.sRGBEncoding;
  var lastLedText = '';
  function setLED(line1, line2) {
    var key = line1 + '|' + line2;
    if (key === lastLedText) return; lastLedText = key;
    ledCtx.fillStyle = '#0a0d10'; ledCtx.fillRect(0, 0, 1024, 224);
    ledCtx.fillStyle = '#ffb020'; ledCtx.textAlign = 'center';
    ledCtx.font = '700 72px Courier New,monospace'; ledCtx.fillText(line1, 512, 92);
    ledCtx.fillStyle = '#ff7847'; ledCtx.font = '700 58px Courier New,monospace';
    ledCtx.fillText(line2, 512, 178);
    ledTexture.needsUpdate = true;
  }
  setLED('PRÓXIMO TREN', 'EXPOSICIÓN');
  var ledMat = new THREE.MeshBasicMaterial({ map: ledTexture });
  [-7, 8].forEach(function (x) {
    var board = mesh(new THREE.BoxGeometry(4.6, 1.05, 0.14),
      [MAT.dark, MAT.dark, MAT.dark, MAT.dark, ledMat, ledMat], x, PLAT_Y + 3.35, 2.6);
    board.castShadow = false; clutter.push(board);
    mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.55, 8), MAT.steelDark, x - 1.5, PLAT_Y + 4.15, 2.6);
    mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.55, 8), MAT.steelDark, x + 1.5, PLAT_Y + 4.15, 2.6);
  });

  /* Reloj de andén (hora real; las manecillas se mueven en el bucle) */
  var clockHands = [];
  (function stationClock() {
    var g = new THREE.Group(); g.position.set(1.5, PLAT_Y + 3.5, 3.4); BUILD.add(g);
    g.userData.noMerge = true;   /* manecillas animadas */
    mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.9, 8), MAT.steelDark, 0, 0.85, 0, g);
    var rim = mesh(new THREE.CylinderGeometry(0.52, 0.52, 0.12, 28), MAT.dark, 0, 0, 0, g);
    rim.rotation.x = Math.PI / 2;
    var faceTex = canvasTexture(256, 256, function (c2) {
      c2.fillStyle = '#fff'; c2.beginPath(); c2.arc(128, 128, 124, 0, 7); c2.fill();
      c2.fillStyle = '#16212b';
      for (var i = 0; i < 12; i++) {
        var a = i / 12 * Math.PI * 2;
        c2.save(); c2.translate(128 + Math.sin(a) * 104, 128 - Math.cos(a) * 104);
        c2.rotate(a); c2.fillRect(-4, -13, 8, 26); c2.restore();
      }
    });
    [0.075, -0.075].forEach(function (dz) {
      var face = mesh(new THREE.CircleGeometry(0.47, 28),
        new THREE.MeshBasicMaterial({ map: faceTex }), 0, 0, dz, g);
      if (dz < 0) face.rotation.y = Math.PI;
      face.castShadow = false;
      var flip = dz < 0 ? Math.PI : 0;
      [['h', 0.26, 0.045, MAT.dark], ['m', 0.4, 0.03, MAT.dark], ['s', 0.42, 0.012, MAT.redLamp]]
        .forEach(function (spec) {
          var pivot = new THREE.Group();
          pivot.position.set(0, 0, dz + (dz > 0 ? 0.012 : -0.012));
          pivot.rotation.y = flip; g.add(pivot);
          var handGeo = new THREE.BoxGeometry(spec[2], spec[1], 0.008);
          handGeo.translate(0, spec[1] / 2 - 0.03, 0);
          var hand = new THREE.Mesh(handGeo, spec[3]); hand.castShadow = false;
          pivot.add(hand); clockHands.push({ kind: spec[0], pivot: pivot });
        });
    });
    g.traverse(function (o) { if (o.isMesh) clutter.push(o); });
  })();

  /* Andén contrario (dirección Talleres), versión sencilla */
  (function farPlatform() {
    box(52, PLAT_Y - DECK_Y, 3, MAT.platform, 0, (DECK_Y + PLAT_Y) / 2, -7.4);
    graniteFloor(52, 2.95, -7.4);
    box(52, 0.09, 0.5, MAT.yellow, 0, PLAT_Y + 0.045, -6.17);
    var roof2 = mesh(roofGeo, roofMat, 0, PLAT_Y - 0.4, -7.4);
    roof2.rotation.z = Math.PI / 2;
    [-20, -10, 0, 10, 20].forEach(function (x) { roofFrame(x, -7.4, -8.7, -5.95); });
    var mat = new THREE.MeshStandardMaterial({
      map: stationSignTexture('CUAUHTÉMOC', 'Línea 1 · Dirección Talleres', L1_COLOR), roughness: 0.6
    });
    [-12, 6].forEach(function (x) {
      var s = mesh(new THREE.BoxGeometry(6.4, 1.45, 0.14),
        [MAT.dark, MAT.dark, MAT.dark, MAT.dark, mat, mat], x, PLAT_Y + 3.25, -7.4);
      s.castShadow = false; clutter.push(s);
    });
    [-14, -3, 9].forEach(function (x) {
      box(2.4, 0.1, 0.55, MAT.bench, x, PLAT_Y + 0.48, -8.15);
      box(2.4, 0.55, 0.09, MAT.bench, x, PLAT_Y + 0.82, -8.4);
    });
  })();

  /* Nombre de la estación en la fascia del viaducto, visible desde la calle */
  (function fasciaSign() {
    var mat = new THREE.MeshBasicMaterial({
      map: signTexture('CUAUHTÉMOC', 'METRORREY · Transbordo L1 L2', '#16212b')
    });
    var board = mesh(new THREE.PlaneGeometry(4.3, 0.95), mat, -4, DECK_Y - 0.55, 6.87);   /* en la cara de la losa, sin estirar */
    board.castShadow = false;
  })();

  /* Calle sin carros (a petición): farolas y árboles van en la avenida
     del tramo; aquí el semáforo de la esquina */
  (function streetLife() {
    var tl = new THREE.Group(); tl.position.set(20, 0, 14.4); BUILD.add(tl);
    mesh(new THREE.CylinderGeometry(0.07, 0.09, 4.2, 10), MAT.dark, 0, 2.1, 0, tl);
    box(0.42, 1.05, 0.3, MAT.dark, 0, 4.1, 0, tl);
    [[4.42, MAT.redLamp], [4.1, MAT.lamp], [3.78, MAT.green]].forEach(function (spec) {
      var bulb = mesh(new THREE.CircleGeometry(0.11, 14), spec[1], 0, spec[0], -0.16, tl);
      bulb.rotation.y = Math.PI; bulb.castShadow = false;
    });
  })();

  /* ---------- N2: conexión bajo la estación ----------
     Piso colgado bajo la losa del viaducto, con ~4.5 m libres sobre la
     calle. Desde cada extremo de los andenes baja una escalera corta; de
     aquí se sale a la calle por el SUR y por el PONIENTE, y por el ORIENTE
     una pasarela cubierta lleva al edificio de transbordo (N3), de donde
     se baja a la Línea 2. */
  var N2B = { x0: -36, x1: 36, z0: -9.4, z1: 6.6, top: DECK_Y - 1.1 };
  var glassWall = MAT.glassPanel.clone(); glassWall.side = THREE.DoubleSide; glassWall.depthWrite = false;
  var hallFloorMat = std(0xcfccc4, 0.7, 0.02);
  function granitePlane(x, z, len, wid, y, parent) {   /* granito pulido como el del andén */
    var t = graniteTexture.clone(); t.needsUpdate = true; t.repeat.set(len / 1.2, wid / 1.2);
    var m = new THREE.MeshStandardMaterial({ map: t, roughness: 0.35, metalness: 0.05 });
    return panel(len, wid, m, x, y + 0.004, z, '+y', parent);   /* bajo techo: brilla menos que el andén */
  }
  /* Muro con cristal: zoclo de 1 m, vidrio arriba y viga; huecos [a, b] */
  function glassRun(axis, a0, a1, c, yb, yt, gaps, parent) {
    var segs = [[a0, a1]];
    (gaps || []).forEach(function (g) {
      var out = [];
      segs.forEach(function (sg) {
        if (g[0] > sg[0]) out.push([sg[0], Math.min(g[0], sg[1])]);
        if (g[1] < sg[1]) out.push([Math.max(g[1], sg[0]), sg[1]]);
      });
      segs = out;
    });
    segs.forEach(function (sg) {
      var len = sg[1] - sg[0], mid = (sg[0] + sg[1]) / 2; if (len < 0.05) return;
      var X = axis === 'x' ? mid : c, Z = axis === 'x' ? c : mid;
      box(axis === 'x' ? len : 0.2, 1.0, axis === 'x' ? 0.2 : len, MAT.concreteDark, X, yb + 0.5, Z, parent);
      var gl = mesh(new THREE.PlaneGeometry(len, yt - yb - 1.25), glassWall, X, (yb + 1 + yt - 0.25) / 2, Z, parent);
      if (axis === 'z') gl.rotation.y = Math.PI / 2;
      gl.castShadow = false; gl.receiveShadow = false;
      box(axis === 'x' ? len : 0.22, 0.25, axis === 'x' ? 0.22 : len, MAT.blueSteel, X, yt - 0.125, Z, parent);
      for (var m = sg[0] + 1.5; m < sg[1] - 0.5; m += 3) {   /* parteluces */
        box(0.08, yt - yb - 1.25, 0.08, MAT.blueSteel, axis === 'x' ? m : c, (yb + 1 + yt - 0.25) / 2, axis === 'x' ? c : m, parent);
      }
    });
  }
  function hangSign(title, sub, x, y, z, rotY, parent, bg, ceilY) {   /* colgado del techo (ceilY) */
    var mat = new THREE.MeshBasicMaterial({ map: signTexture(title, sub, bg || '#16212b') });
    var s = mesh(new THREE.BoxGeometry(4.0, 0.9, 0.1), [MAT.dark, MAT.dark, MAT.dark, MAT.dark, mat, mat], x, y, z, parent);
    var r = rotY || 0, top = ceilY === undefined ? y + 1.2 : ceilY;
    s.rotation.y = r; s.castShadow = false;
    [-1, 1].forEach(function (k) {
      var px = x + k * 1.4 * Math.cos(r), pz = z - k * 1.4 * Math.sin(r);
      tubeBetween(parent || BUILD, px, y + 0.45, pz, px, top, pz, 0.02, MAT.steelDark);
    });
    return s;
  }
  function turnstile(x, y, z, alongX, parent) {   /* cuerpo + brazo; también estorba al caminar */
    box(alongX ? 0.9 : 0.25, 0.95, alongX ? 0.25 : 0.9, MAT.steel, x, y + 0.475, z, parent);
    var arm = mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.55, 8), MAT.steelDark,
      x + (alongX ? 0 : 0.4), y + 0.85, z + (alongX ? 0.4 : 0), parent);
    if (alongX) arm.rotation.x = Math.PI / 2; else arm.rotation.z = Math.PI / 2;
    addWall(x - (alongX ? 0.45 : 0.14), x + (alongX ? 0.45 : 0.14), z - (alongX ? 0.14 : 0.45), z + (alongX ? 0.14 : 0.45), y - 0.1, y + 0.6);
  }
  (function connectionN2() {
    var W = N2B.x1 - N2B.x0, D = N2B.z1 - N2B.z0, cz = (N2B.z0 + N2B.z1) / 2;
    box(W, 0.4, D, MAT.concrete, 0, N2_Y - 0.2, cz);                    /* losa de piso */
    granitePlane(0, cz, W - 0.4, D - 0.4, N2_Y);
    addFloor(N2B.x0, N2B.x1, N2B.z0, N2B.z1, N2_Y);
    /* Muros: cristal al sur (salida sur y pasarela) y al norte; extremos de concreto */
    glassRun('x', N2B.x0, N2B.x1, N2B.z1, N2_Y, N2B.top, [[2.5, 5.5], [30.2, 32.8]]);
    glassRun('x', N2B.x0, N2B.x1, N2B.z0, N2_Y, N2B.top);
    box(0.3, N2B.top - N2_Y, 3.2, MAT.concreteDark, N2B.x0 - 0.15, (N2_Y + N2B.top) / 2, N2B.z0 + 1.6);   /* poniente: hueco de salida */
    box(0.3, N2B.top - N2_Y, N2B.z1 + 3.8, MAT.concreteDark, N2B.x0 - 0.15, (N2_Y + N2B.top) / 2, (-3.8 + N2B.z1) / 2);
    box(0.3, N2B.top - N2_Y - 2.6, 2.4, MAT.concreteDark, N2B.x0 - 0.15, (N2_Y + 2.6 + N2B.top) / 2, -5.0);
    box(0.3, N2B.top - N2_Y, D, MAT.concreteDark, N2B.x1 + 0.15, (N2_Y + N2B.top) / 2, cz);
    /* Plafón de luz bajo la losa y columnas del viaducto que atraviesan el piso */
    var lights = [];
    for (var lx = -32; lx <= 32; lx += 4) lights.push([lx, N2B.top - 0.06, 2.2], [lx, N2B.top - 0.06, -6.0]);
    instanced(new THREE.BoxGeometry(2.4, 0.06, 0.3), MAT.ceilLight, lights).castShadow = false;
    [-18.4, 0, 18.4].forEach(function (cx) { addWall(cx - 1.0, cx + 1.0, -2.2, -0.2, N2_Y - 0.1, N2_Y + 0.6); });
    /* Escaleras andén → N2 (dos por andén, en los extremos) */
    var drop = PLAT_Y - N2_Y, L = stairLen(drop);
    [1, -1].forEach(function (s) {
      [N1_STAIR.zA, N1_STAIR.zB].forEach(function (z) {
        flight('x', s * 26, s * (26 + L), z, N1_STAIR.w, PLAT_Y, N2_Y);
        /* bajo la escalera (donde ya no cabe la cabeza) no se pasa */
        addWall(Math.min(s * 31.9, s * (26 + L - 0.4)), Math.max(s * 31.9, s * (26 + L - 0.4)), z - 0.85, z + 0.85, N2_Y - 0.1, N2_Y + 0.05);
        /* barandal en la losa alrededor del hueco */
        railing(s * 26.6, z - 0.95, s * 32.9, z - 0.95, DECK_Y);
        railing(s * 26.6, z + 0.95, s * 32.9, z + 0.95, DECK_Y);
      });
    });
    /* Salida SUR: descanso y escalera a la banqueta sur */
    box(3.0, 0.4, 0.8, MAT.concrete, 4, N2_Y - 0.2, 7.0); addFloor(2.5, 5.5, 6.6, 7.4, N2_Y);
    var Ls = stairLen(N2_Y - 0.17);
    flight('z', 7.4, 7.4 + Ls, 4, 2.4, N2_Y, 0.17);
    addWall(2.8, 5.2, 9.0, 14.1, -0.1, 0.12);   /* debajo de la escalera, en la calle */
    box(0.4, 2.4, 0.4, MAT.concreteDark, 4, 1.2, 10.4);
    turnstile(2.9, N2_Y, 5.6, false); turnstile(5.1, N2_Y, 5.6, false);
    /* Salida PONIENTE: descanso y escalera al suelo, por el lado norte de la avenida */
    box(1.2, 0.4, 2.4, MAT.concrete, -36.6, N2_Y - 0.2, -5.0); addFloor(-37.2, -36, -6.2, -3.8, N2_Y);
    var Lw = stairLen(N2_Y);
    flight('x', -37.2, -37.2 - Lw, -5.0, 2.4, N2_Y, 0);
    addWall(-37.2 - Lw + 0.5, -39.5, -6.2, -3.8, -0.1, 0.1);
    turnstile(-34.5, N2_Y, -6.1, true); turnstile(-34.5, N2_Y, -3.9, true);
    /* Letreros colgantes */
    hangSign('SALIDA SUR', 'Calle · banqueta sur', 4, N2B.top - 0.75, 4.2, 0, null, null, N2B.top);
    hangSign('SALIDA PONIENTE', 'Calle · lado norte', -31, N2B.top - 0.75, -5.0, Math.PI / 2, null, null, N2B.top);
    hangSign('TRANSBORDO', 'Línea 2 · Sendero ↔ Zaragoza', 26, N2B.top - 0.75, 5.6, 0, null, '#056a3a', N2B.top);
    hangSign('LÍNEA 1 · ANDENES', 'Exposición (sur) · Talleres (norte)', -10, N2B.top - 0.75, 2.0, 0, null, '#6b5200', N2B.top);
    hangSign('LÍNEA 1 · ANDENES', 'Exposición (sur) · Talleres (norte)', 16, N2B.top - 0.75, -6.4, 0, null, '#6b5200', N2B.top);
  })();
  /* Andadores al pie de las escaleras (sur y norte) */
  box(TILE_LEN, 0.06, 1.8, MAT.concrete, 0, 0.03, 20.4).castShadow = false;
  box(TILE_LEN, 0.06, 1.8, MAT.concrete, 0, 0.03, -24).castShadow = false;

  /* ---------- Personas articuladas ----------
     Esqueleto simple: cadera → muslos → rodillas (espinilla + zapato);
     columna → hombros → codos (antebrazo + mano); cuello → cabeza. Cada
     pieza es UNA malla con color por vértice (ropa, piel y pelo fundidos)
     y todas comparten material: ~10 mallas por persona. Las poses se
     mezclan suavemente y la caminata se suma encima (ver applyRig).
     Local: mira a -Z, origen en el piso entre los pies. */
  var personMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, metalness: 0 });
  /* Cada persona es UNA malla: cada pieza sigue a su articulación como
     «hueso» rígido (1 llamada de dibujo por persona en vez de ~11) */
  var personSkinMat = personMat.clone(); personSkinMat.skinning = true;
  var J = { hip: 0.93, thigh: 0.45, shin: 0.43, upper: 0.29, fore: 0.25 };
  var SKIN = [0xf1cfae, 0xe2b48c, 0xd5a27a, 0xc68e64, 0xb07a52, 0x95633f, 0x74492e];
  var HAIR = [0x16110d, 0x1f1712, 0x2b1e15, 0x3e2a1b, 0x5c3d24, 0x8a5a2e, 0x8d8a86, 0xc2beb7];
  var TOPS = [0xf2f2ee, 0x1f2a3a, 0x24272b, 0x7d8790, 0xc23b2e, 0x2b6cb0, 0x1f7a6d, 0xd9a521,
    0x5b6b3a, 0x7a2e3a, 0x9ec6e8, 0xe58fae, 0xe07b2a, 0x3b3f8c, 0xffffff, 0x0f4c8a, 0xb8c4a0, 0x6a4c93];
  var BOTTOMS = [0x27364d, 0x2f4a6e, 0x3a5a85, 0x1d2430, 0x161719, 0x3b3f45, 0xb8a582, 0x6b5a45, 0x45503a];
  var SHOES = [0x1b1c1f, 0xf0f0ec, 0x5a3a24, 0x2a2f3a, 0x8a8f96, 0xc23b2e, 0xe8e2d4];
  var BAGS = [0x2a3440, 0x1c1c1c, 0x7a2e3a, 0x2b6cb0, 0x5b6b3a, 0x8a6a45, 0xc23b2e];
  function pick(a) { return a[Math.floor(Math.random() * a.length)]; }
  /* Estatura: la mayoría cerca de 1.60 m (mujeres ~1.55, hombres ~1.64),
     entre ~1.42 y 1.80 m. El modelo a escala 1 mide PERSON_H. */
  var PERSON_H = 1.82;
  function gaussH(mean, sd, lo, hi) {
    var u = 1 - Math.random(), v = Math.random();
    var z = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    return Math.min(hi, Math.max(lo, mean + sd * z));
  }
  function heightToScale(h) { return h / PERSON_H; }
  function randomLook() {
    var R = Math.random, fem = R() < 0.5, older = R() < 0.14;
    return {
      fem: fem, skin: pick(SKIN), hairC: older ? pick(HAIR.slice(6)) : pick(HAIR.slice(0, 6)),
      hair: fem ? pick(['long', 'long', 'pony', 'bun', 'short']) :
        pick(['short', 'short', 'buzz', 'cap', 'cap', older ? 'bald' : 'short']),
      capC: pick([0x1f2a3a, 0xc23b2e, 0xf2f2ee, 0x0f4c8a, 0x24272b, 0xd9a521]),
      top: pick(TOPS), bottom: pick(BOTTOMS), shoe: pick(SHOES),
      jacket: R() < 0.24 ? pick([0x24272b, 0x3b3f45, 0x5a3a24, 0x1f2a3a, 0x6b7a5a, 0x7d8790]) : null,
      sleeves: R() < 0.55 ? 'short' : 'long', skirt: fem && R() < 0.3, shorts: !fem && R() < 0.16,
      tights: R() < 0.4, bag: R(), bagC: pick(BAGS), glasses: R() < (older ? 0.6 : 0.18), sneakers: R() < 0.5,
      scale: heightToScale(fem ? gaussH(1.555, 0.055, 1.42, 1.70) : gaussH(1.645, 0.06, 1.50, 1.80)),
      build: 0.88 + R() * 0.3
    };
  }
  /* Piezas: [geo, color, x, y, z, rx, ry, rz, sx, sy, sz] → una geometría */
  function partGeo(items) {
    return mergeGeos(items.map(function (it) {
      var m = new THREE.Matrix4().compose(
        new THREE.Vector3(it[2] || 0, it[3] || 0, it[4] || 0),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(it[5] || 0, it[6] || 0, it[7] || 0)),
        new THREE.Vector3(it[8] || 1, it[9] || 1, it[10] || 1));
      it[0].applyMatrix4(m);
      return paintGeo(it[0], it[1], true);
    }), ['position', 'normal', 'color']);
  }
  function shade(hex, k) {   /* mismo color, más oscuro (labios, sombras) */
    var c = new THREE.Color(hex); return c.multiplyScalar(k).getHex();
  }
  function cyl(r1, r2, h, seg) { return new THREE.CylinderGeometry(r1, r2, h, seg || 8); }
  function ball(r, w, h, ts, tl) { return new THREE.SphereGeometry(r, w || 10, h || 8, 0, Math.PI * 2, ts || 0, tl || Math.PI); }

  /* Ángulos (rad): t* muslo (+ adelante), k* rodilla (− flexiona), s*x hombro
     (+ adelante), s*o hombro hacia afuera, s*y giro del brazo hacia el
     pecho (cruza el antebrazo), e* codo (+ flexiona). */
  var POSE_BASE = { hipY: J.hip, hipZ: 0, spineX: 0, headX: 0, tL: 0, tR: 0, kL: 0, kR: 0, legOut: 0.02,
    sLx: 0.04, sRx: 0.04, sLo: 0.1, sRo: 0.1, sLy: 0, sRy: 0, eL: 0.18, eR: 0.18, phone: 0, swing: 1 };
  /* Sentado: la cadera baja y se va 42 cm atrás sobre el asiento mientras
     los pies se quedan donde estaban (sin deslizar a la persona). hipY y
     hipZ están en metros reales: setPose los corrige por la estatura. */
  var SIT = { hipY: 0.56, hipZ: 0.42, spineX: 0.1, tL: 1.45, tR: 1.45, kL: -1.3, kR: -1.3, legOut: 0.07,
    /* manos descansando sobre los muslos (antes flotaban frente al pecho) */
    sLx: 0.18, sRx: 0.18, sLo: 0.02, sRo: 0.02, sLy: 0.32, sRy: 0.32, eL: 0.98, eR: 0.98, swing: 0 };
  var POSES = {
    stand: {},
    pockets: { sLx: -0.12, sRx: -0.12, sLo: 0.17, sRo: 0.17, eL: 0.4, eR: 0.4 },
    crossed: { sLx: 0.3, sRx: 0.36, sLo: 0.06, sRo: 0.06, sLy: 0.95, sRy: 0.95, eL: 1.9, eR: 1.8, swing: 0 },
    phone: { headX: -0.38, sLx: 0.3, sRx: 0.4, sLo: 0, sRo: 0, sLy: 0.5, sRy: 0.4, eL: 1.5, eR: 1.4, phone: 1, swing: 0 },
    rail: { sRx: 2.7, sRo: 0.12, eR: 0.4, swing: 0 },
    pole: { sRx: 1.0, sRo: -0.08, eR: 0.75, swing: 0 },
    sit: SIT,
    sitphone: Object.assign({}, SIT, { headX: -0.42, sLx: 0.5, sRx: 0.55, sLo: 0, sRo: 0,
      sLy: 0.45, sRy: 0.4, eL: 1.3, eR: 1.25, phone: 1 }),
    drive: Object.assign({}, SIT, { hipY: 0.66, sLx: 0.85, sRx: 0.85, eL: 0.55, eR: 0.55 })
  };
  function poseVals(name, over) {
    return Object.assign({}, POSE_BASE, POSES[name] || {}, over || {});
  }
  function setPose(rig, name, instant, over) {
    rig.pose = name; rig.tgt = poseVals(name, over);
    if (name === 'sit' || name === 'sitphone') {
      /* Sentado con los pies en el piso sea cual sea la estatura: la
         cadera va a altura fija real pero muslo y espinilla escalan con
         la persona, así que los ángulos fijos dejaban los pies flotando
         3–14 cm (más en las personas bajas, y se veía bugeado adentro del
         vagón). Se fija la espinilla casi vertical y se resuelven el
         ángulo del muslo y cuánto se recorre la cadera sobre el asiento:
         la gente baja se sienta más a la orilla, la alta más al fondo. */
      var sc = rig.scale || 1, L1 = J.thigh * sc, L2 = J.shin * sc;
      var D = rig.tgt.hipY - 0.063 * sc, beta = 0.08;   /* caída cadera→tobillo y espinilla */
      var alpha = Math.acos(THREE.MathUtils.clamp((D - L2 * Math.cos(beta)) / L1, -1, 1));
      rig.tgt.hipZ = THREE.MathUtils.clamp(L1 * Math.sin(alpha) + L2 * Math.sin(beta), 0.3, 0.5);
      rig.tgt.tL = rig.tgt.tR = alpha;
      rig.tgt.kL = rig.tgt.kR = beta - alpha;
    }
    if (rig.tgt.hipY < 0.8) { rig.tgt.hipY /= rig.scale; rig.tgt.hipZ /= rig.scale; }   /* sentado: medidas reales */
    if (instant) rig.cur = Object.assign({}, rig.tgt);
  }
  function applyRig(rig, dt) {
    var k = 1 - Math.exp(-dt * 7), c = rig.cur, t = rig.tgt;
    for (var key in t) c[key] += (t[key] - c[key]) * k;
    rig.walkW += ((rig.moving ? 1 : 0) - rig.walkW) * (1 - Math.exp(-dt * 9));
    rig.headY += (rig.headYT - rig.headY) * (1 - Math.exp(-dt * 3));
    rig.breath += dt * 1.6;
    var w = rig.walkW, ph = rig.phase, sn = Math.sin(ph), cs = Math.cos(ph);
    var amp = rig.running ? 1.55 : 1, arm = w * amp * (0.15 + 0.85 * c.swing);
    rig.tL.rotation.x = c.tL + w * 0.42 * amp * sn;
    rig.tR.rotation.x = c.tR - w * 0.42 * amp * sn;
    rig.kL.rotation.x = c.kL - w * (0.06 + 0.72 * amp * Math.max(0, cs));
    rig.kR.rotation.x = c.kR - w * (0.06 + 0.72 * amp * Math.max(0, -cs));
    rig.tL.rotation.z = -c.legOut; rig.tR.rotation.z = c.legOut;
    rig.sL.rotation.x = c.sLx - arm * 0.36 * sn; rig.sR.rotation.x = c.sRx + arm * 0.36 * sn;
    rig.sL.rotation.z = -c.sLo; rig.sR.rotation.z = c.sRo;
    rig.sL.rotation.y = -c.sLy; rig.sR.rotation.y = c.sRy;
    rig.eL.rotation.x = c.eL + arm * (rig.running ? 1.1 : 0.22);
    rig.eR.rotation.x = c.eR + arm * (rig.running ? 1.1 : 0.22);
    rig.hip.position.y = c.hipY + w * amp * 0.026 * (Math.cos(2 * ph) - 1) * 0.5;
    rig.hip.position.z = c.hipZ;
    /* La falda sigue a los muslos al sentarse (no atraviesa el asiento) */
    if (rig.skirt) rig.skirt.rotation.x = Math.max(0, Math.min(c.tL, c.tR)) * 0.92;
    rig.spine.rotation.x = c.spineX - w * (rig.running ? 0.2 : 0.035) + 0.012 * Math.sin(rig.breath);
    rig.head.rotation.x = c.headX; rig.head.rotation.y = rig.headY;
    rig.phone.visible = t.phone > 0.5;
  }

  function makePerson(look, parent, pose) {
    look = look || randomLook();
    var b = look.build, tw = 0.19 * b, skin = look.skin, legC = look.bottom;
    var torsoC = look.jacket || look.top, hairC = look.hairC;
    var g = new THREE.Group(), hip = new THREE.Group(), spine = new THREE.Group(), head = new THREE.Group();
    hip.position.y = J.hip; g.add(hip); hip.add(spine);
    head.position.y = 0.56; head.rotation.order = 'YXZ'; spine.add(head);
    var parts = [];
    function M(items, grp) { parts.push({ geo: partGeo(items), bone: grp }); }
    /* Tronco: torso, hombros, pelvis, cinturón, mochila o bolsa, falda */
    /* Tronco con forma: cintura más angosta que pecho/hombros (más en
       hombres), cadera más ancha en mujeres, pecho, cuello de la prenda */
    var fem = look.fem, shW = fem ? 0.98 : 1.1, waW = fem ? 0.82 : 0.92, hiW = fem ? 1.14 : 1.04;
    var T = [
      [cyl(tw * waW, tw * hiW * 0.98, 0.16, 12), torsoC, 0, 0.13, 0, 0, 0, 0, 1, 1, 0.66],      /* abdomen bajo */
      [cyl(tw * shW, tw * waW, 0.36, 12), torsoC, 0, 0.38, 0, 0, 0, 0, 1, 1, 0.64],             /* pecho */
      [ball(tw * shW, 12, 6, 0, Math.PI / 2), torsoC, 0, 0.555, 0, 0, 0, 0, 1, 0.38, 0.64],    /* hombros */
      [cyl(tw * hiW, tw * hiW * 0.96, 0.2, 12), legC, 0, -0.02, 0, 0, 0, 0, 1, 1, 0.72],      /* cadera */
      [cyl(tw * hiW * 1.02, tw * hiW * 1.02, 0.035, 12), 0x2a2420, 0, 0.075, 0, 0, 0, 0, 1, 1, 0.73],
      [new THREE.TorusGeometry(0.06, 0.014, 5, 14), torsoC, 0, 0.585, 0, Math.PI / 2, 0, 0, 1, 1.25, 1]   /* cuello de la prenda */
    ];
    if (look.jacket) T.push([new THREE.BoxGeometry(tw * 0.55, 0.46, 0.02), look.top, 0, 0.3, -tw * 0.64 - 0.004]);

    if (look.bag < 0.4) {            /* mochila */
      T.push([new THREE.BoxGeometry(tw * 1.5, 0.4, 0.15), look.bagC, 0, 0.3, tw * 0.64 + 0.075],
        [new THREE.BoxGeometry(tw * 1.2, 0.13, 0.06), look.bagC, 0, 0.17, tw * 0.64 + 0.17]);
    } else if (look.bag < 0.62) {    /* bolsa cruzada */
      T.push([new THREE.BoxGeometry(0.07, 0.24, 0.3), look.bagC, -(tw + 0.07), -0.02, 0.02],
        [new THREE.BoxGeometry(0.025, 0.72, 0.02), look.bagC, 0, 0.27, -tw * 0.64 - 0.012, 0, 0, 0.6]);
    }
    M(T, spine);
    var skirt = null;
    if (look.skirt) {   /* pieza aparte con su bisagra en la cintura */
      skirt = new THREE.Group(); skirt.position.y = 0.01; spine.add(skirt);
      M([[cyl(tw * 1.05, tw * 1.5, 0.42, 12), legC, 0, -0.21, 0, 0, 0, 0, 1, 1, 0.8]], skirt);
    }
    /* Cabeza: cuello, cara con nariz, ojos y orejas, pelo según estilo */
    var H = [
      [cyl(0.048, 0.055, 0.12), skin, 0, 0.04, 0],
      [ball(0.112, 14, 10), skin, 0, 0.19, 0, 0, 0, 0, 0.9, 1.1, 0.98],
      [new THREE.BoxGeometry(0.028, 0.05, 0.04), skin, 0, 0.18, -0.106],
      [ball(0.014, 6, 4), 0x1a1410, -0.038, 0.205, -0.096],
      [ball(0.014, 6, 4), 0x1a1410, 0.038, 0.205, -0.096],
      [ball(0.024, 6, 5), skin, -0.1, 0.185, 0.005, 0, 0, 0, 0.5, 1, 0.9],
      [ball(0.024, 6, 5), skin, 0.1, 0.185, 0.005, 0, 0, 0, 0.5, 1, 0.9],
      [new THREE.BoxGeometry(0.032, 0.0045, 0.01), hairC, -0.04, 0.233, -0.1, 0, 0, 0.1],   /* cejas */
      [new THREE.BoxGeometry(0.032, 0.0045, 0.01), hairC, 0.04, 0.233, -0.1, 0, 0, -0.1],
      [new THREE.BoxGeometry(0.036, 0.007, 0.01), shade(skin, 0.62), 0, 0.148, -0.104],        /* boca */
      [ball(0.06, 10, 6), skin, 0, 0.135, -0.03, 0, 0, 0, 1.15, 0.8, 1.1]                     /* mandíbula */
    ];
    var cap = [ball(0.118, 14, 8, 0, Math.PI * 0.56), hairC, 0, 0.2, 0.008, 0.3, 0, 0, 0.94, 1.02, 1.03];
    if (look.hair === 'short') H.push(cap);
    else if (look.hair === 'buzz') H.push([ball(0.115, 14, 8, 0, Math.PI * 0.5), hairC, 0, 0.198, 0.006, 0.26, 0, 0, 0.93, 1.0, 1.02]);
    else if (look.hair === 'long') {
      /* melena: elipsoide detrás de la cara que cae hasta los hombros */
      H.push(cap, [ball(0.118, 14, 10), hairC, 0, 0.115, 0.035, 0, 0, 0, 1.0, 1.45, 0.9]);
    } else if (look.hair === 'pony') {
      H.push(cap, [ball(0.045), hairC, 0, 0.22, 0.115], [cyl(0.028, 0.012, 0.2), hairC, 0, 0.12, 0.135, 0.25]);
    } else if (look.hair === 'bun') H.push(cap, [ball(0.056), hairC, 0, 0.29, 0.06]);
    else if (look.hair === 'cap') {
      H.push([ball(0.121, 14, 8, 0, Math.PI * 0.5), look.capC, 0, 0.205, 0.004, 0.12],
        [new THREE.BoxGeometry(0.16, 0.012, 0.11), look.capC, 0, 0.226, -0.14, -0.1],
        [new THREE.BoxGeometry(0.17, 0.06, 0.05), hairC, 0, 0.14, 0.085]);
    } else H.push([ball(0.116, 12, 6, Math.PI * 0.36, Math.PI * 0.2), hairC, 0, 0.19, 0.012]);
    if (look.glasses) {   /* armazón delgado: dos aros y el puente */
      H.push([new THREE.TorusGeometry(0.024, 0.005, 4, 10), 0x2a2d31, -0.038, 0.205, -0.104],
        [new THREE.TorusGeometry(0.024, 0.005, 4, 10), 0x2a2d31, 0.038, 0.205, -0.104],
        [new THREE.BoxGeometry(0.03, 0.006, 0.006), 0x2a2d31, 0, 0.21, -0.108]);
    }
    M(H, head);
    /* Piernas: muslo / espinilla + zapato (shorts y falda dejan ver piel o medias) */
    var bare = look.tights ? 0x2a2a30 : skin;
    function leg(side) {
      var th = new THREE.Group(); th.position.x = side * 0.092 * b; hip.add(th);
      var kn = new THREE.Group(); kn.position.y = -J.thigh; th.add(kn);
      M(look.shorts ? [[cyl(0.073 * b, 0.066 * b, 0.25), legC, 0, -0.125, 0], [cyl(0.062 * b, 0.057 * b, 0.21), skin, 0, -0.345, 0]]
        : [[cyl(0.072 * b, 0.058 * b, J.thigh), look.skirt ? bare : legC, 0, -J.thigh / 2, 0]], th);
      var shinC = look.shorts ? skin : (look.skirt ? bare : legC);
      var soleC = look.shoe === 0xf0f0ec || look.shoe === 0xe8e2d4 ? 0xd8d4cc : (look.sneakers ? 0xf2f2ee : 0x1a1a1c);
      M([[ball(0.062 * b, 10, 8), shinC, 0, 0, 0],                                             /* rodilla */
        [cyl(0.056 * b, 0.043, J.shin), shinC, 0, -J.shin / 2, 0],
        [new THREE.BoxGeometry(0.09, 0.06, 0.2), look.shoe, 0, -J.shin - 0.02, -0.035],          /* zapato */
        [ball(0.047, 10, 6), look.shoe, 0, -J.shin - 0.028, -0.13, 0, 0, 0, 1, 0.7, 1.15],      /* punta */
        [new THREE.BoxGeometry(0.098, 0.022, 0.275), soleC, 0, -J.shin - 0.052, -0.06]], kn);   /* suela */
      return [th, kn];
    }
    /* Brazos: brazo (manga) / antebrazo + mano */
    var sleeve = look.jacket || look.top, longS = !!look.jacket || look.sleeves === 'long';
    function arm(side) {
      var sh = new THREE.Group(); sh.position.set(side * (tw + 0.035), 0.5, 0); spine.add(sh);
      var el = new THREE.Group(); el.position.y = -J.upper; sh.add(el);
      var UA = [[ball(0.053 * b, 8, 6), sleeve, 0, 0, 0]];
      if (longS) UA.push([cyl(0.05 * b, 0.043 * b, J.upper), sleeve, 0, -J.upper / 2, 0]);
      else UA.push([cyl(0.054 * b, 0.05 * b, 0.13), sleeve, 0, -0.065, 0],
        [cyl(0.04 * b, 0.037 * b, 0.18), skin, 0, -0.2, 0]);
      M(UA, sh);
      var foreC = longS ? sleeve : skin;
      M([[ball(0.045 * b, 8, 6), longS ? sleeve : skin, 0, 0, 0],                          /* codo */
        [cyl(0.04 * b, 0.033, J.fore), foreC, 0, -J.fore / 2, 0],
        [cyl(0.03, 0.028, 0.03), skin, 0, -J.fore - 0.005, 0],                                    /* muñeca */
        [new THREE.BoxGeometry(0.03, 0.09, 0.07), skin, 0, -J.fore - 0.06, -0.004],              /* palma y dedos */
        [ball(0.035, 8, 6), skin, 0, -J.fore - 0.1, -0.004, 0, 0, 0, 0.45, 0.6, 1.0],          /* yemas redondeadas */
        [cyl(0.014, 0.012, 0.055), skin, side * -0.012, -J.fore - 0.045, -0.04, -0.55, 0, side * 0.35]], el);   /* pulgar */
      return [sh, el];
    }
    var LL = leg(-1), LR = leg(1), AL = arm(-1), AR = arm(1);
    var phone = new THREE.Mesh(partGeo([[new THREE.BoxGeometry(0.07, 0.135, 0.012), 0x101317, 0, -J.fore - 0.05, -0.03]]), personMat);
    phone.castShadow = false; phone.visible = false; AR[1].add(phone);
    /* Todas las piezas a una malla: se pasan a donde están ahora (postura
       de reposo) y cada vértice queda pegado 100% a su articulación */
    g.updateMatrixWorld(true);
    var bones = [], geos = parts.map(function (p) {
      var bi = bones.indexOf(p.bone);
      if (bi < 0) { bi = bones.length; bones.push(p.bone); }
      p.geo.applyMatrix4(p.bone.matrixWorld);
      var n = p.geo.attributes.position.count, si = new Float32Array(n * 4), sw = new Float32Array(n * 4);
      for (var i = 0; i < n; i++) { si[i * 4] = bi; sw[i * 4] = 1; }
      p.geo.setAttribute('skinIndex', new THREE.BufferAttribute(si, 4));
      p.geo.setAttribute('skinWeight', new THREE.BufferAttribute(sw, 4));
      return p.geo;
    });
    var body = new THREE.SkinnedMesh(mergeGeos(geos, ['position', 'normal', 'color', 'skinIndex', 'skinWeight']), personSkinMat);
    body.geometry.boundingSphere.radius += 0.4;   /* brazos y piernas se mueven */
    body.castShadow = true; body.receiveShadow = false;
    g.add(body); body.bind(new THREE.Skeleton(bones));
    var rig = { g: g, hip: hip, spine: spine, head: head, tL: LL[0], kL: LL[1], tR: LR[0], kR: LR[1],
      skirt: skirt, scale: look.scale,
      sL: AL[0], eL: AL[1], sR: AR[0], eR: AR[1], phone: phone, headY: 0, headYT: 0,
      moving: false, running: false, walkW: 0, phase: Math.random() * 6, breath: Math.random() * 6 };
    g.scale.setScalar(look.scale);
    g.userData.rig = rig;
    setPose(rig, pose || 'stand', true); applyRig(rig, 0);
    (parent || scene).add(g);
    return g;
  }
  /* Centros de puerta en coordenadas del tren (vagones en ±8.05, puertas a ±4.2 m) */
  var DOOR_X = [-12.25, -3.85, 3.85, 12.25];
  BUILD = scene;   /* lo que sigue (trenes, gente) ya no es parte del tramo */

  /* ---------- Tren Bombardier MM-05 (3 coches, interior real) ---------- */
  var train = new THREE.Group(); scene.add(train);
  var train2 = new THREE.Group(); scene.add(train2);
  var wheelPivots2 = [], wheelsL2 = { 3: [], 4: [] };
  var CUR_Z = TRAIN_Z, CUR_GROUP = train, CUR_DEST = 'EXPOSICIÓN', CUR_DRIVE_END = 1;
  var CUR_WHEELS = null; /* se fijan en buildTrainSet según el tren en construcción */
  var CAR_LEN = 15, CAR_GAP = 1.1, BODY_Y = RAIL_Y + 0.62, BODY_H = 2.62;
  var FLOOR_DY = 0.35, EAVE_DY = 2.24; /* piso interior y arranque del techo */
  var doorLeaves = [], wheelPivots = [], headSpot = null;
  var trainSlots = { 1: [], 2: [], 3: [], 4: [] };
  var cabDriver = null, cabDriverOf = {};
  /* Cristal claro para ventanas que se ven desde dentro (puertas, cabina,
     entre vagones): deja ver a través con un leve tinte */
  var innerGlassMat = new THREE.MeshStandardMaterial({ color: 0x9fb8c4, transparent: true, opacity: 0.18,
    roughness: 0.05, metalness: 0.1, side: THREE.DoubleSide, depthWrite: false });  /* asientos y lugares de pie (coords. del tren) */
  var CUR_PLAT_SIDE = 1, CUR_TRAIN_ID = 1; /* lado que abre y tren en construcción */
  /* Materiales desvanecibles POR TREN (se crean en buildTrainSet):
     techo = cascarón + A/A + plafón con su luz; pared de cada lado =
     lateral con balizado + muro interior + cristal + puertas + gusano.
     Así el tren lejano conserva su techo y sus paredes intactos. */
  var CUR_ROOF_MAT = null, CUR_AC_MAT = null, CUR_CEIL_MAT = null, CUR_CEIL_LIGHT_MAT = null;
  var CUR_WALL_MATS = null; /* { '1': {...}, '-1': {...} } según el tren en construcción */
  function makeTrainFadeMats(trainId) {
    var f = trainFades[trainId];
    CUR_ROOF_MAT = fadeMat(new THREE.MeshStandardMaterial({
      color: 0x31599f, roughness: 0.42, metalness: 0.4, side: THREE.DoubleSide
    }), f.roof);
    CUR_AC_MAT = fadeMat(std(0x9a958c, 0.55, 0.35), f.roof);
    CUR_CEIL_MAT = fadeMat(std(0xf0eee8, 0.8, 0), f.roof);
    CUR_CEIL_LIGHT_MAT = fadeMat(MAT.ceilLight.clone(), f.roof);
    carCeilStripMats.push(CUR_CEIL_LIGHT_MAT);
    CUR_WALL_MATS = {};
    [1, -1].forEach(function (s) {
      var g = s > 0 ? f.wallPlus : f.wallMinus;
      var doorFace = fadeMat(new THREE.MeshStandardMaterial({
        map: doorTexture, roughness: 0.38, metalness: 0.35, alphaTest: 0.5
      }), g);
      var doorEdge = fadeMat(MAT.steelDark.clone(), g);
      CUR_WALL_MATS[s] = {
        inner: fadeMat(MAT.innerWall.clone(), g),
        glass: fadeMat(MAT.winGlass.clone(), g),
        glassClear: fadeMat(innerGlassMat.clone(), g),   /* vidrio claro como el de las puertas */
        /* gotas de lluvia por fuera; en la L2 (túnel) no llueve: sin material */
        rainGlass: trainId <= 2 ? makeRainGlassMat(g) : null,
        trim: fadeMat(MAT.rubber.clone(), g),
        doorMats: [doorEdge, doorEdge, doorEdge, doorEdge, doorFace, doorFace]
      };
    });
  }

  /* Cilindro entre dos puntos (brazos del pantógrafo, tirantes) */
  function tubeBetween(parent, x1, y1, z1, x2, y2, z2, r, mat) {
    var a = new THREE.Vector3(x1, y1, z1), b = new THREE.Vector3(x2, y2, z2);
    var dir = new THREE.Vector3().subVectors(b, a), len = dir.length();
    var m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 8), mat);
    m.position.copy(a).addScaledVector(dir, 0.5);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
    m.castShadow = true; parent.add(m);
    return m;
  }

  function addDoors(car, midX) {
    SIDE_DOORS.forEach(function (d) {
      var doorCx = midX + d.u;
      [1, -1].forEach(function (s) {
        /* Sin fondo falso: al abrir se ve el vestíbulo y el pasillo real */
        box(d.w + 0.1, 0.05, 0.22, MAT.steel, doorCx, BODY_Y + FLOOR_DY - 0.02,
          CUR_Z + s * 1.32, car).castShadow = false;              /* umbral */
        [-1, 1].forEach(function (dir) {
          var leaf = mesh(new THREE.BoxGeometry(0.62, 1.88, 0.055), CUR_WALL_MATS[s].doorMats,
            doorCx + dir * 0.315, BODY_Y + 1.26, CUR_Z + s * 1.28, car); /* bolsillo en el muro */
          doorLeaves.push({ mesh: leaf, closedX: doorCx + dir * 0.315, dir: dir, side: s, platSide: CUR_PLAT_SIDE, trainId: CUR_TRAIN_ID });
          leaf.userData.noMerge = true;   /* se mueve: no se fusiona */
          var dg = new THREE.Mesh(new THREE.PlaneGeometry(0.426, 0.68), innerGlassMat);
          dg.position.y = 0.494; dg.castShadow = false; leaf.add(dg);   /* cristal de la ventana de la hoja */
          var drg = makeRainGlass(0.426, 0.68, CUR_WALL_MATS[s].rainGlass);   /* gotas por fuera de la puerta */
          if (drg) { drg.position.set(0, 0.494, s * 0.034); leaf.add(drg); }
        });
        box(2.6, 0.05, 0.05, MAT.steelDark, doorCx, BODY_Y + 2.24, CUR_Z + s * 1.33, car); /* riel oculto */
        var lamp = box(0.16, 0.1, 0.06, MAT.amberLamp, doorCx, BODY_Y + 2.36,
          CUR_Z + s * 1.38, car);                                   /* luz de puerta */
        lamp.castShadow = false;
      });
    });
  }

  /* Pantógrafo de brazo único ("media tijera"): de lado se ve como una
     «V» acostada —brazo inferior que sube al codo y brazo superior que
     regresa al patín tocando el hilo de contacto. Nada de rombo doble. */
  var pantoSparks = [];
  function addPantograph(car, px) {
    var g = new THREE.Group(); g.position.set(px, BODY_Y + BODY_H, CUR_Z); car.add(g);
    box(1.5, 0.09, 1.25, MAT.dark, 0, 0.05, 0, g);
    var topY = WIRE_Y - (BODY_Y + BODY_H) - 0.04;
    var footX = -0.5, footY = 0.14;                    /* pivote en la base */
    var elbowX = 0.38, elbowY = topY * 0.56;           /* codo: punta de la «V» */
    var headX = -0.02, headY = topY - 0.1;             /* apoyo del patín */
    [-0.18, 0.18].forEach(function (dz) {
      tubeBetween(g, footX, footY, dz, elbowX, elbowY, dz, 0.036, MAT.steelDark);   /* brazo inferior */
      tubeBetween(g, elbowX, elbowY, dz, headX, headY, dz, 0.03, MAT.steelDark);    /* brazo superior */
    });
    tubeBetween(g, footX, footY, -0.24, footX, footY, 0.24, 0.028, MAT.steel);       /* eje del pivote */
    tubeBetween(g, elbowX, elbowY, -0.24, elbowX, elbowY, 0.24, 0.028, MAT.steel);   /* eje del codo */
    tubeBetween(g, headX, headY, -0.6, headX, headY, 0.6, 0.024, MAT.steel);         /* travesaño del patín */
    [-0.55, 0.55].forEach(function (dz) {
      tubeBetween(g, headX, headY, dz, headX, topY - 0.03, dz, 0.018, MAT.steel);   /* bieletas del patín */
    });
    box(0.2, 0.06, 1.72, MAT.dark, 0, topY, 0, g);   /* patín de contacto */
    /* Chispa eléctrica en el contacto patín-hilo: núcleo + rayos aditivos,
       apagada casi siempre (ver updatePantoSparks) */
    var spark = new THREE.Group(); spark.position.set(0, topY + 0.05, 0);
    spark.visible = false; spark.userData.noMerge = true; g.add(spark);
    var core = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6),
      new THREE.MeshBasicMaterial({ color: 0xeaf6ff, transparent: true, opacity: 0.95,
        blending: THREE.AdditiveBlending, depthWrite: false }));
    core.userData.noMerge = true; spark.add(core);
    var raysGeo = new THREE.BufferGeometry();
    raysGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6 * 2 * 3), 3));
    var rays = new THREE.LineSegments(raysGeo,
      new THREE.LineBasicMaterial({ color: 0x9fd4ff, transparent: true, opacity: 0.9,
        blending: THREE.AdditiveBlending, depthWrite: false }));
    rays.frustumCulled = false; spark.add(rays);
    pantoSparks.push({ g: spark, core: core, rays: rays, t: 0, dur: 0.1, lastX: null });
  }
  var sparkTmpV = new THREE.Vector3();
  function updatePantoSparks(dt) {
    if (!dt) return;
    for (var i = 0; i < pantoSparks.length; i++) {
      var e = pantoSparks[i];
      e.g.getWorldPosition(sparkTmpV);
      var speed = e.lastX === null ? 0 : Math.hypot(sparkTmpV.x - e.lastX, sparkTmpV.z - e.lastZ) / dt;
      e.lastX = sparkTmpV.x; e.lastZ = sparkTmpV.z;   /* la L2 corre a lo largo de z */
      if (e.t > 0) {
        e.t -= dt;
        var k = Math.max(e.t, 0) / e.dur;
        e.g.visible = e.t > 0;
        e.core.material.opacity = 0.95 * k; e.rays.material.opacity = 0.9 * k;
        e.g.scale.setScalar(0.7 + 0.6 * (1 - k));
      } else if (speed > 2 && speed < 40 && Math.random() < dt / 240) {
        /* ~1 chispazo cada 4 min por pantógrafo en marcha: casi nunca */
        e.dur = e.t = 0.07 + Math.random() * 0.08;
        var pos = e.rays.geometry.attributes.position;
        for (var r2 = 0; r2 < 6; r2++) {
          pos.setXYZ(r2 * 2, 0, 0, 0);
          pos.setXYZ(r2 * 2 + 1, (Math.random() - 0.5) * 0.55,
            (Math.random() - 0.3) * 0.4, (Math.random() - 0.5) * 0.55);
        }
        pos.needsUpdate = true;
        e.g.rotation.y = Math.random() * Math.PI;
        e.g.visible = true;
      } else e.g.visible = false;
    }
  }

  /* Muros con huecos reales: bandas y pilares entre ventanas/puertas, para
     que al abrir (y tras el cristal) se vea el interior de verdad. */
  function wallBand(car, midX, s, y0, y1, blockers) {
    var cuts = [[-CAR_LEN / 2, CAR_LEN / 2]];
    blockers.forEach(function (b) {
      var lo = b.u - b.w / 2, hi = b.u + b.w / 2, next = [];
      cuts.forEach(function (c) {
        if (hi <= c[0] || lo >= c[1]) { next.push(c); return; }
        if (lo > c[0]) next.push([c[0], lo]);
        if (hi < c[1]) next.push([hi, c[1]]);
      });
      cuts = next;
    });
    cuts.forEach(function (c) {
      if (c[1] - c[0] < 0.03) return;
      box(c[1] - c[0], y1 - y0, 0.09, CUR_WALL_MATS[s].inner, midX + (c[0] + c[1]) / 2,
        BODY_Y + (y0 + y1) / 2, CUR_Z + s * 1.28, car);
    });
  }
  var floorMat = new THREE.MeshStandardMaterial({ map: floorTexture, roughness: 0.92 });
  var adMats = [
    new THREE.MeshStandardMaterial({ map: mapTexture, roughness: 0.7 }),
    new THREE.MeshStandardMaterial({
      map: interiorAdTexture('CERRO DE LA SILLA', 'Monumento natural de Monterrey', '#27567d', '#ffffff'), roughness: 0.7 }),
    new THREE.MeshStandardMaterial({
      map: interiorAdTexture('PARQUE FUNDIDORA', 'Bájate en Y Griega · Línea 1', '#8a5a20', '#ffffff'), roughness: 0.7 })
  ];

  /* Interior completo (foto interior-mm93.jpg): piso punteado, bancas
     longitudinales azul celeste/crema, tubos de acero, plafón con tira de
     luz continua, publicidad sobre ventanas y luz cálida por coche. */
  function buildInterior(car, midX, cabEnd) {
    var floor = box(CAR_LEN - 0.15, 0.08, 2.56, floorMat, midX, BODY_Y + FLOOR_DY - 0.04, CUR_Z, car);
    floor.castShadow = false;
    var ceil = box(CAR_LEN - 0.25, 0.05, 2.3, CUR_CEIL_MAT, midX, BODY_Y + 2.33, CUR_Z, car);
    ceil.castShadow = false;
    var strip = box(CAR_LEN - 1.1, 0.045, 0.46, CUR_CEIL_LIGHT_MAT, midX, BODY_Y + 2.3, CUR_Z, car);
    strip.castShadow = false;                       /* fluorescente continuo */
    box(CAR_LEN - 1.1, 0.03, 0.58, CUR_CEIL_MAT, midX, BODY_Y + 2.335, CUR_Z, car).castShadow = false;
    /* Dos luces cálidas bajo el plafón por coche: solo prenden de noche */
    [-3.3, 3.3].forEach(function (u) {
      var cpl = new THREE.PointLight(0xffe9c4, 0, 6.5, 1.7);
      cpl.position.set(midX + u, BODY_Y + 2.1, CUR_Z); cpl.visible = false;
      car.add(cpl); carCeilLights.push(cpl);
    });

    var carSign = midX > 0 ? 1 : -1;   /* no se cruza entre vagones */
    /* De pie: junto a los tubos del vestíbulo (mirando a la puerta) y en el
       pasillo bajo el pasamanos (mano derecha arriba) */
    SIDE_DOORS.forEach(function (d) {
      [-1, 1].forEach(function (k) {
        var u = d.u + k * 1.05;
        /* El mamparo de cabina va en |u| = 4.85: el lugar junto al tubo
           exterior de las puertas de los extremos caía en |u| = 5.25, es
           decir DENTRO de la cabina, y a veces amanecía un pasajero ahí */
        if ((cabEnd > 0 && u > 4.7) || (cabEnd < 0 && u < -4.7)) return;
        [1, -1].forEach(function (s) {
          trainSlots[CUR_TRAIN_ID].push({ type: 'pole', car: carSign, side: s, occ: null,
            x: midX + u, z: CUR_Z + s * 0.62, yaw: k > 0 ? Math.PI / 2 : -Math.PI / 2 });
        });
      });
    });
    [-2.4, -0.9, 0.9, 2.4].forEach(function (u) {
      [1, -1].forEach(function (s) {
        trainSlots[CUR_TRAIN_ID].push({ type: 'rail', car: carSign, side: s, occ: null,
          x: midX + u, z: CUR_Z + s * 0.2, yaw: s > 0 ? -Math.PI / 2 : Math.PI / 2 });
      });
    });
    var u0 = cabEnd < 0 ? -4.8 : -6.25, u1 = cabEnd > 0 ? 4.8 : 6.25;
    var zones = [[u0, u1]];
    SIDE_DOORS.forEach(function (d) {
      var lo = d.u - d.w / 2 - 0.32, hi = d.u + d.w / 2 + 0.32, next = [];
      zones.forEach(function (z) {
        if (lo > z[0]) next.push([z[0], Math.min(lo, z[1])]);
        if (hi < z[1]) next.push([Math.max(hi, z[0]), z[1]]);
      });
      zones = next;
    });
    [1, -1].forEach(function (s) {
      zones.forEach(function (z) {
        var len = z[1] - z[0]; if (len < 0.5) return;
        var tex = seatTexture.clone(); tex.needsUpdate = true;
        tex.repeat.x = Math.max(1, Math.round(len / 4.4));
        var seatMat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.42 });
        var cx = midX + (z[0] + z[1]) / 2;
        box(len, 0.09, 0.44, seatMat, cx, BODY_Y + FLOOR_DY + 0.45, CUR_Z + s * 1.03, car);
        box(len, 0.52, 0.09, seatMat, cx, BODY_Y + FLOOR_DY + 0.8, CUR_Z + s * 1.23, car);   /* respaldo vertical, sin inclinación */
        box(len, 0.34, 0.05, MAT.dark, cx, BODY_Y + FLOOR_DY + 0.2, CUR_Z + s * 1.19, car);
        /* Lugares para sentarse (uno cada ~0.52 m), mirando al pasillo */
        var nSeats = Math.floor(len / 0.52);
        for (var si2 = 0; si2 < nSeats; si2++) {
          trainSlots[CUR_TRAIN_ID].push({ type: 'seat', car: carSign, side: s, occ: null,
            x: midX + z[0] + len * (si2 + 0.5) / nSeats, z: CUR_Z + s * 0.98, yaw: s > 0 ? 0 : Math.PI });
        }
      });
      /* Pasamanos longitudinales bajo el plafón (uno por lado; no entran a
         la cabina, que empieza en el mamparo) */
      var r0 = cabEnd < 0 ? midX - 4.75 : midX - CAR_LEN / 2 + 0.7;
      var r1 = cabEnd > 0 ? midX + 4.75 : midX + CAR_LEN / 2 - 0.7;
      var rail = mesh(new THREE.CylinderGeometry(0.026, 0.026, r1 - r0, 10),
        MAT.steel, (r0 + r1) / 2, BODY_Y + 2.06, CUR_Z + s * 0.38, car);
      rail.rotation.z = Math.PI / 2; rail.castShadow = false;
      /* Publicidad vertical sobre las ventanas (sin inclinación) */
      [-1.7, 0, 1.7].forEach(function (u, i) {
        if (cabEnd > 0 && u > 4) return;
        var ad = mesh(new THREE.PlaneGeometry(1.7, 0.44), adMats[(i + (s > 0 ? 0 : 1)) % 3],
          midX + u, BODY_Y + 2.1, CUR_Z + s * 1.18, car);
        ad.rotation.set(0, s > 0 ? Math.PI : 0, 0); ad.castShadow = false;
      });
    });
    /* Tubos verticales curvos de vestíbulo (vertical + diagonal al pasamanos) */
    SIDE_DOORS.forEach(function (d) {
      [1, -1].forEach(function (s) {
        [-0.82, 0.82].forEach(function (dx) {
          var u2 = d.u + dx;
          if ((cabEnd > 0 && u2 > 4.85) || (cabEnd < 0 && u2 < -4.85)) return;   /* no cruza el mamparo */
          var x = midX + u2, fY = BODY_Y + FLOOR_DY;
          tubeBetween(car, x, fY, CUR_Z + s * 0.94, x, BODY_Y + 1.98, CUR_Z + s * 0.94, 0.026, MAT.steel);
          tubeBetween(car, x, BODY_Y + 1.98, CUR_Z + s * 0.94, x, BODY_Y + 2.06, CUR_Z + s * 0.38, 0.026, MAT.steel);
        });
      });
    });
  }

  /* Cabina tras el parabrisas: mamparo con puerta, consola, asiento y
     (solo en la cabina de mando) conductor; letrero LED de destino. */
  function buildCab(car, midX, cabEnd, isDriving) {
    var bx = midX + cabEnd * 4.85, endX = midX + cabEnd * (CAR_LEN / 2);
    /* Mamparo con ventana a la altura de las laterales: desde el salón se ve
       al conductor de espaldas. La puerta de cabina va del otro lado. */
    var wz0 = -0.95, wz1 = 0.05;
    var bpiece = function (y0, y1, z0, z1) {
      box(0.08, y1 - y0, z1 - z0, MAT.innerWall, bx, BODY_Y + (y0 + y1) / 2, CUR_Z + (z0 + z1) / 2, car);
    };
    bpiece(0.3, WIN_DY[0], -1.26, 1.26); bpiece(WIN_DY[1], EAVE_DY, -1.26, 1.26);
    bpiece(EAVE_DY, EAVE_DY + 0.08, -1.2, 1.2); bpiece(EAVE_DY, BODY_H - 0.14, -0.8, 0.8);
    bpiece(WIN_DY[0], WIN_DY[1], -1.26, wz0); bpiece(WIN_DY[0], WIN_DY[1], wz1, 1.26);
    var cw = mesh(new THREE.PlaneGeometry(wz1 - wz0, WIN_DY[1] - WIN_DY[0]), innerGlassMat,
      bx, BODY_Y + (WIN_DY[0] + WIN_DY[1]) / 2, CUR_Z + (wz0 + wz1) / 2, car);
    cw.rotation.y = Math.PI / 2; cw.castShadow = false; cw.receiveShadow = false;
    /* Marco de sello de la ventana tras el conductor, como en los testeros:
       sin él el cristal claro se perdía y el hueco parecía no tener vidrio */
    var cwz = CUR_Z + (wz0 + wz1) / 2, cwy = BODY_Y + (WIN_DY[0] + WIN_DY[1]) / 2;
    box(0.1, 0.05, (wz1 - wz0) + 0.08, MAT.seal, bx, BODY_Y + WIN_DY[0] - 0.02, cwz, car).castShadow = false;
    box(0.1, 0.05, (wz1 - wz0) + 0.08, MAT.seal, bx, BODY_Y + WIN_DY[1] + 0.02, cwz, car).castShadow = false;
    box(0.1, (WIN_DY[1] - WIN_DY[0]) + 0.04, 0.05, MAT.seal, bx, cwy, CUR_Z + wz0 + 0.02, car).castShadow = false;
    box(0.1, (WIN_DY[1] - WIN_DY[0]) + 0.04, 0.05, MAT.seal, bx, cwy, CUR_Z + wz1 - 0.02, car).castShadow = false;
    var door = mesh(new THREE.PlaneGeometry(0.72, 1.82),
      new THREE.MeshStandardMaterial({ color: 0xd9d6cd, roughness: 0.7 }),
      bx - cabEnd * 0.06, BODY_Y + FLOOR_DY + 0.91, CUR_Z + 0.62, car);
    door.rotation.y = cabEnd > 0 ? -Math.PI / 2 : Math.PI / 2; door.castShadow = false;
    box(0.6, 0.72, 1.95, MAT.dark, endX - cabEnd * 0.52, BODY_Y + FLOOR_DY + 0.55, CUR_Z, car);
    var desk = box(0.42, 0.08, 1.95, MAT.steelDark, endX - cabEnd * 0.5, BODY_Y + FLOOR_DY + 0.95, CUR_Z, car);
    desk.rotation.z = cabEnd * -0.22;
    tubeBetween(car, endX - cabEnd * 0.62, BODY_Y + FLOOR_DY + 0.95, CUR_Z - 0.3,
      endX - cabEnd * 0.72, BODY_Y + FLOOR_DY + 1.14, CUR_Z - 0.3, 0.02, MAT.steel);
    box(0.46, 0.1, 0.5, std(0x27313b, 0.7, 0), endX - cabEnd * 1.2, BODY_Y + FLOOR_DY + 0.55, CUR_Z - 0.42, car);
    box(0.1, 0.55, 0.5, std(0x27313b, 0.7, 0), endX - cabEnd * 1.42, BODY_Y + FLOOR_DY + 0.85, CUR_Z - 0.42, car);
    var sign = mesh(new THREE.PlaneGeometry(1.75, 0.3),
      new THREE.MeshBasicMaterial({ map: destSignTexture(CUR_DEST, isDriving) }),
      endX - cabEnd * 0.3, BODY_Y + 2.08, CUR_Z, car);
    sign.rotation.y = cabEnd > 0 ? Math.PI / 2 : -Math.PI / 2; sign.castShadow = false;
    /* Sin carcasa tras el letrero: a 0.66 m de la cámara de Cabina taparía
       media vista del conductor; el letrero solo se ve desde el andén */
    if (isDriving) {
      var driver = makePerson(Object.assign(randomLook(), { top: 0x24425e, bottom: 0x22242a,
        jacket: null, sleeves: 'short', skirt: false, shorts: false, bag: 1, hair: 'short' }), car, 'drive');
      driver.position.set(endX - cabEnd * 0.76, BODY_Y + FLOOR_DY, CUR_Z - 0.42);   /* pies; la cadera va atrás en el asiento */
      if (CUR_TRAIN_ID === 1) cabDriver = driver;   /* en vista Cabina el conductor eres tú */
      cabDriverOf[CUR_TRAIN_ID] = driver;
      driver.rotation.y = cabEnd > 0 ? -Math.PI / 2 : Math.PI / 2; /* mirando al frente */
    }
  }

  var CUR_NUMBERS = ['M1. 0074', 'M1. 0080'];
  function buildCar(index, startX, cabEnd) {
    var car = new THREE.Group(); CUR_GROUP.add(car);
    var midX = startX + CAR_LEN / 2;
    /* Cascarón de techo aparte (se desvanece con el grupo techo de SU tren) */
    var roofR = 2.59, roofAng = Math.asin(1.35 / roofR);
    var roofShell = mesh(new THREE.CylinderGeometry(roofR, roofR, CAR_LEN - 0.08, 24, 1, true,
      Math.PI / 2 - roofAng, roofAng * 2), CUR_ROOF_MAT, midX, BODY_Y + BODY_H - roofR, CUR_Z, car);
    roofShell.rotation.z = Math.PI / 2;
    [1, -1].forEach(function (s) {
      wallBand(car, midX, s, 0.28, WIN_DY[0], SIDE_DOORS);
      wallBand(car, midX, s, WIN_DY[0], WIN_DY[1], SIDE_WINS.concat(SIDE_DOORS));
      wallBand(car, midX, s, WIN_DY[1], DOOR_DY[1], SIDE_DOORS);
      wallBand(car, midX, s, DOOR_DY[1], EAVE_DY, []);
      SIDE_WINS.forEach(function (win) {   /* cristal tintado tras el marco */
        var gl = mesh(new THREE.PlaneGeometry(win.w, WIN_DY[1] - WIN_DY[0]), CUR_WALL_MATS[s].glass,
          midX + win.u, BODY_Y + (WIN_DY[0] + WIN_DY[1]) / 2, CUR_Z + s * 1.335, car);
        if (s < 0) gl.rotation.y = Math.PI;
        gl.castShadow = false; gl.receiveShadow = false;
        /* Vidrio claro como el de las puertas, un poco adentro del tintado:
           doble cara, así también se ve el cristal desde el interior */
        var cg = mesh(new THREE.PlaneGeometry(win.w, WIN_DY[1] - WIN_DY[0]), CUR_WALL_MATS[s].glassClear,
          midX + win.u, BODY_Y + (WIN_DY[0] + WIN_DY[1]) / 2, CUR_Z + s * 1.30, car);
        if (s < 0) cg.rotation.y = Math.PI;
        cg.castShadow = false; cg.receiveShadow = false;
        /* Gotas de lluvia 1 cm FUERA del tintado: se ven mojadas desde el
           salón (Caminar/Interior) y desde el andén */
        var rg = makeRainGlass(win.w, WIN_DY[1] - WIN_DY[0], CUR_WALL_MATS[s].rainGlass);
        if (rg) {
          rg.position.set(midX + win.u, BODY_Y + (WIN_DY[0] + WIN_DY[1]) / 2, CUR_Z + s * 1.345);
          if (s < 0) rg.rotation.y = Math.PI;
          car.add(rg);
        }
      });
    });
    /* Testeros entre coches con puerta de intercirculación */
    [-1, 1].forEach(function (e) {
      if (e === cabEnd) return;
      /* Testero con ventana a la altura de las laterales: se ve el otro
         vagón a través del fuelle (hueco) */
      var ex = midX + e * (CAR_LEN / 2 - 0.05);
      var tpiece = function (y0, y1, z0, z1) {
        box(0.09, y1 - y0, z1 - z0, MAT.innerWall, ex, BODY_Y + (y0 + y1) / 2, CUR_Z + (z0 + z1) / 2, car);
      };
      tpiece(0.28, WIN_DY[0], -1.28, 1.28); tpiece(WIN_DY[1], EAVE_DY, -1.28, 1.28);
      tpiece(EAVE_DY, EAVE_DY + 0.08, -1.2, 1.2); tpiece(EAVE_DY, BODY_H - 0.14, -0.8, 0.8);   /* cierra hasta el techo */
      tpiece(WIN_DY[0], WIN_DY[1], -1.28, -0.5); tpiece(WIN_DY[0], WIN_DY[1], 0.5, 1.28);
      var gw = mesh(new THREE.PlaneGeometry(1.0, WIN_DY[1] - WIN_DY[0]), innerGlassMat,
        ex, BODY_Y + (WIN_DY[0] + WIN_DY[1]) / 2, CUR_Z, car);
      gw.rotation.y = Math.PI / 2; gw.castShadow = false;
      box(0.11, 0.05, 1.08, MAT.seal, ex, BODY_Y + WIN_DY[0] - 0.02, CUR_Z, car).castShadow = false;   /* marco */
      box(0.11, 0.05, 1.08, MAT.seal, ex, BODY_Y + WIN_DY[1] + 0.02, CUR_Z, car).castShadow = false;
    });
    /* Sin postes blancos en las puntas (el MM-05 no los lleva): la esquina
       la cierran el lateral, el testero y el chaflán de la nariz. */
    /* Laterales con el balizado MM-05 (alfa en ventanas y puertas);
       cada uno entra al grupo pared de su lado y de su tren */
    var num = CUR_NUMBERS[index - 1];
    var sideMatA = fadeMat(new THREE.MeshStandardMaterial({
      map: trainSideTexture(num, cabEnd), transparent: true, alphaTest: 0.35,
      roughness: 0.35, metalness: 0.3 }), trainFades[CUR_TRAIN_ID].wallPlus);
    var sideMatB = fadeMat(new THREE.MeshStandardMaterial({
      map: trainSideTexture(num, -cabEnd), transparent: true, alphaTest: 0.35,
      roughness: 0.35, metalness: 0.3 }), trainFades[CUR_TRAIN_ID].wallMinus);
    var sideA = mesh(new THREE.PlaneGeometry(SIDE_PLANE_W, SIDE_PLANE_H), sideMatA,
      midX, BODY_Y + BODY_H / 2, CUR_Z + 1.36, car);
    sideA.castShadow = false;
    var sideB = mesh(new THREE.PlaneGeometry(SIDE_PLANE_W, SIDE_PLANE_H), sideMatB,
      midX, BODY_Y + BODY_H / 2, CUR_Z - 1.36, car);
    sideB.rotation.y = Math.PI; sideB.castShadow = false;

    box(CAR_LEN - 0.4, 0.3, 2.48, MAT.skirt, midX, BODY_Y + 0.13, CUR_Z, car);
    box(CAR_LEN - 0.6, 0.42, 2.25, MAT.dark, midX, BODY_Y - 0.16, CUR_Z, car);
    box(3.2, 0.42, 1.7, MAT.steelDark, midX - 1.5, BODY_Y - 0.4, CUR_Z, car);
    box(2.1, 0.36, 1.5, MAT.steelDark, midX + 2.6, BODY_Y - 0.38, CUR_Z, car);

    buildInterior(car, midX, cabEnd);
    if (cabEnd) buildCab(car, midX, cabEnd, cabEnd === CUR_DRIVE_END);
    addDoors(car, midX);

    /* Techo: A/A gran­de con rejillas y ventiladores + equipo menor */
    var ac = box(4.8, 0.34, 1.72, CUR_AC_MAT, midX - 2.3, BODY_Y + BODY_H + 0.1, CUR_Z, car);
    ac.castShadow = false;
    [-1, 1].forEach(function (s) {
      for (var vi = 0; vi < 3; vi++) {
        box(1.15, 0.2, 0.04, MAT.dark, midX - 3.8 + vi * 1.5, BODY_Y + BODY_H + 0.1,
          CUR_Z + s * 0.88, car).castShadow = false;
      }
    });
    [-3.4, -1.2].forEach(function (dx) {
      var fan = mesh(new THREE.CylinderGeometry(0.46, 0.46, 0.06, 20), MAT.dark,
        midX + dx, BODY_Y + BODY_H + 0.29, CUR_Z, car);
      fan.castShadow = false;
    });
    if (cabEnd > 0) box(2.2, 0.26, 1.45, CUR_AC_MAT, midX + 3.4, BODY_Y + BODY_H + 0.06, CUR_Z, car).castShadow = false;
    else box(3.0, 0.26, 1.45, CUR_AC_MAT, midX + 3.9, BODY_Y + BODY_H + 0.06, CUR_Z, car).castShadow = false;
    if (cabEnd) {   /* caja de A/A de cabina, gris topo con rejillas al frente (foto MM-05) */
      var cx2 = midX + cabEnd * (CAR_LEN / 2 - 1.3);
      box(2.2, 0.44, 2.05, CUR_AC_MAT, cx2, BODY_Y + BODY_H + 0.12, CUR_Z, car).castShadow = false;
      box(2.0, 0.06, 1.85, CUR_AC_MAT, cx2, BODY_Y + BODY_H + 0.37, CUR_Z, car).castShadow = false;
      [-0.45, 0.45].forEach(function (dz) {          /* dos rejillas de persiana */
        box(0.03, 0.22, 0.62, MAT.dark, cx2 + cabEnd * 1.105, BODY_Y + BODY_H + 0.14, CUR_Z + dz, car).castShadow = false;
      });
      [1, -1].forEach(function (s2) {
        box(1.4, 0.16, 0.03, MAT.dark, cx2, BODY_Y + BODY_H + 0.13, CUR_Z + s2 * 1.03, car).castShadow = false;
      });
    }
    addPantograph(car, midX + 1.15);

    /* Gusano (fuelle) de articulación a mitad del vagón: inicia una
       sección, el gusano, y termina la otra sección */
    [-0.24, 0, 0.24].forEach(function (k) {
      [-1, 1].forEach(function (s2) {
        box(0.15, EAVE_DY - 0.25, 0.1, CUR_WALL_MATS[s2].trim, midX + k,
          BODY_Y + (0.25 + EAVE_DY) / 2, CUR_Z + s2 * 1.35, car);
      });
      var arc = mesh(new THREE.CylinderGeometry(roofR, roofR, 0.15, 20, 1, true,
        Math.PI / 2 - roofAng, roofAng * 2), MAT.rubber,
        midX + k, BODY_Y + BODY_H - roofR, CUR_Z, car);
      arc.rotation.z = Math.PI / 2;
      box(0.15, 0.3, 2.4, MAT.rubber, midX + k, BODY_Y + 0.14, CUR_Z, car);
    });

    addBogieAt(car, startX + 2.1); addBogieAt(car, startX + CAR_LEN - 2.1);
    return car;
    function addBogieAt(parent, worldX) {
      var holder = new THREE.Group();
      holder.position.set(worldX, RAIL_Y + 0.05, CUR_Z); parent.add(holder);
      var tmp = new THREE.Group(); /* bogie en coords. del holder */
      box(2.5, 0.42, 2, MAT.dark, 0, 0.42, 0, tmp);
      [-0.82, 0.82].forEach(function (wx) {
        [-0.76, 0.76].forEach(function (wz) {
          /* Pivote en el centro de la rueda: girar en Z la hace rodar */
          var pivot = new THREE.Group(); pivot.position.set(wx, 0.34, wz); tmp.add(pivot);
          pivot.userData.noMerge = true;
          var wh = mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.16, 20),
            MAT.steelDark, 0, 0, 0, pivot);
          wh.rotation.x = Math.PI / 2;
          var hub = mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.2, 10), MAT.steel, 0, 0, 0, pivot);
          hub.rotation.x = Math.PI / 2;
          box(0.09, 0.5, 0.19, MAT.steel, 0, 0, 0, pivot); /* radio visible al rodar */
          CUR_WHEELS.push(pivot);
        });
        var ax = mesh(new THREE.CylinderGeometry(0.07, 0.07, 1.5, 10), MAT.steelDark, wx, 0.34, 0, tmp);
        ax.rotation.x = Math.PI / 2;
      });
      holder.add(tmp);
    }
  }

  /* Frentes de cabina en AMBOS extremos: el de mando (oriente, a Exposición)
     con su destino y el trasero con luces rojas. Parabrisas con hueco
     real + cristal + limpiaparabrisas 3D; acoplador, mangueras y estribos. */
  /* Panel de esquina achaflanada: las fotos muestran esquinas frontales
     alargadas en diagonal entre el parabrisas y la ventana de cabina, con
     el balizado (azul → rojo → blanco → topo) envolviéndolas. */
  var cornerTexture = canvasTexture(256, 970, function (g, w, h) {
    g.fillStyle = '#f1f1ee'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#1e4fa3'; g.fillRect(0, 0, w, 585);
    g.fillStyle = '#dd2c20'; g.fillRect(0, 585, w, 118);
    g.fillStyle = '#8e8a85'; g.fillRect(0, 888, w, 82);
    g.fillStyle = 'rgba(0,0,0,.12)'; g.fillRect(0, 0, 26, h);
  });
  function cabEndAt(frontX, dir, rear) {
    /* Nariz: frente plano más angosto y adelantado + esquinas diagonales */
    var fx = frontX + dir * 0.24;
    var front = mesh(new THREE.PlaneGeometry(2.24, 2.62),
      new THREE.MeshStandardMaterial({
        map: trainFrontTextureFn(rear), transparent: true, alphaTest: 0.35,
        roughness: 0.35, metalness: 0.3 }),
      fx, BODY_Y + BODY_H / 2, CUR_Z, CUR_GROUP);
    front.rotation.y = dir > 0 ? Math.PI / 2 : -Math.PI / 2; front.castShadow = false;
    [-1, 1].forEach(function (s) {
      var ax = fx, az = CUR_Z + s * 1.12;
      var bx = frontX - dir * 0.42, bz = CUR_Z + s * 1.36;
      var pw = Math.hypot(bx - ax, bz - az);
      var panel = mesh(new THREE.PlaneGeometry(pw, 2.62),
        new THREE.MeshStandardMaterial({ map: cornerTexture, roughness: 0.35, metalness: 0.3,
          side: THREE.DoubleSide }),   /* el chaflán también cierra la cabina por dentro */
        (ax + bx) / 2, BODY_Y + BODY_H / 2, (az + bz) / 2, CUR_GROUP);
      var nx = dir * Math.abs(bz - az), nz = s * Math.abs(bx - ax);
      panel.rotation.y = Math.atan2(nx, nz);   /* giro local: sirve también en el tren girado de la L2 */
      panel.castShadow = false;
      /* Cristal envolvente corto sobre el chaflán (borde del parabrisas) */
      var cgx = ax + (bx - ax) * 0.2, cgz = az + (bz - az) * 0.2;
      var cg = mesh(new THREE.PlaneGeometry(pw * 0.38, 1.1), MAT.cabGlass,
        cgx + nx * 0.05, BODY_Y + 1.78, cgz + nz * 0.05, CUR_GROUP);
      cg.rotation.y = Math.atan2(nx, nz);
      cg.castShadow = false;
      if (CUR_TRAIN_ID <= 2) {   /* gotas sobre el cristal del chaflán (fuera) */
        var nl = Math.hypot(nx, nz) || 1;
        var crg = makeRainGlass(pw * 0.38, 1.1, rainGlassBaseMat);
        crg.position.set(cgx + nx * 0.05 + nx / nl * 0.012, BODY_Y + 1.78, cgz + nz * 0.05 + nz / nl * 0.012);
        crg.rotation.y = Math.atan2(nx, nz);
        CUR_GROUP.add(crg);
      }
    });
    var glass = mesh(new THREE.PlaneGeometry(1.9, 1.27), MAT.cabGlass,
      fx - dir * 0.06, BODY_Y + 1.83, CUR_Z, CUR_GROUP);
    glass.rotation.y = front.rotation.y; glass.castShadow = false; glass.receiveShadow = false;
    if (CUR_TRAIN_ID <= 2) {   /* gotas sobre el parabrisas, por fuera: vista Cabina */
      var wrg = makeRainGlass(1.9, 1.27, rainGlassBaseMat);
      wrg.position.set(fx + dir * 0.012, BODY_Y + 1.83, CUR_Z);
      wrg.rotation.y = front.rotation.y;
      CUR_GROUP.add(wrg);
    }
    /* Forro interior del frente: el plano exterior es de una sola cara, así
       que desde el salón/cabina se veía vacío frente al conductor. Estas
       piezas rodean el parabrisas (hueco dy 1.20–2.46, z ±0.95) por dentro. */
    var fix = fx - dir * 0.12;
    var fpiece = function (y0, y1, z0, z1) {
      box(0.07, y1 - y0, z1 - z0, MAT.innerWall, fix, BODY_Y + (y0 + y1) / 2,
        CUR_Z + (z0 + z1) / 2, CUR_GROUP).castShadow = false;
    };
    fpiece(0.02, 1.2, -1.12, 1.12); fpiece(2.46, 2.62, -1.12, 1.12);
    fpiece(1.2, 2.46, -1.12, -0.95); fpiece(1.2, 2.46, 0.95, 1.12);
    box(0.09, 0.05, 1.95, MAT.seal, fix, BODY_Y + 1.2, CUR_Z, CUR_GROUP).castShadow = false;   /* marco del parabrisas */
    box(0.09, 0.05, 1.95, MAT.seal, fix, BODY_Y + 2.46, CUR_Z, CUR_GROUP).castShadow = false;
    box(0.09, 1.31, 0.05, MAT.seal, fix, BODY_Y + 1.83, CUR_Z - 0.95, CUR_GROUP).castShadow = false;
    box(0.09, 1.31, 0.05, MAT.seal, fix, BODY_Y + 1.83, CUR_Z + 0.95, CUR_GROUP).castShadow = false;
    var gx = fx + dir * 0.035, gy = BODY_Y + 1.22;   /* limpiaparabrisas */
    tubeBetween(CUR_GROUP, gx, gy, CUR_Z - 0.06, gx, gy + 0.92, CUR_Z + 0.52, 0.011, MAT.seal);
    tubeBetween(CUR_GROUP, gx, gy + 0.62, CUR_Z + 0.34, gx, gy + 1.22, CUR_Z + 0.52, 0.008, MAT.seal);
    tubeBetween(CUR_GROUP, gx, gy, CUR_Z + 0.72, gx, gy + 0.85, CUR_Z + 0.72, 0.008, MAT.seal);
    /* Acoplador Scharfenberg, mangueras, estribos y espejos */
    box(0.62, 0.34, 0.5, MAT.dark, fx + dir * 0.3, BODY_Y - 0.18, CUR_Z, CUR_GROUP);
    box(0.3, 0.2, 0.62, MAT.steelDark, fx + dir * 0.68, BODY_Y - 0.18, CUR_Z, CUR_GROUP);
    tubeBetween(CUR_GROUP, fx + dir * 0.06, BODY_Y + 0.05, CUR_Z - 0.5,
      fx + dir * 0.42, BODY_Y - 0.42, CUR_Z - 0.28, 0.035, MAT.rubber);
    tubeBetween(CUR_GROUP, fx + dir * 0.06, BODY_Y + 0.05, CUR_Z + 0.5,
      fx + dir * 0.42, BODY_Y - 0.42, CUR_Z + 0.28, 0.035, MAT.rubber);
    [-0.95, 0.95].forEach(function (dz) {
      box(0.34, 0.05, 0.3, MAT.steelDark, frontX - dir * 0.02, BODY_Y - 0.32, CUR_Z + dz, CUR_GROUP);
      box(0.07, 0.46, 0.3, MAT.dark, frontX - dir * 0.3, BODY_Y + 1.78,
        CUR_Z + dz * 1.52, CUR_GROUP);                              /* espejo */
      tubeBetween(CUR_GROUP, frontX - dir * 0.28, BODY_Y + 2.0, CUR_Z + dz * 1.36,
        frontX - dir * 0.3, BODY_Y + 1.95, CUR_Z + dz * 1.5, 0.02, MAT.dark);
    });
    /* Las luces de cola encendidas ya van en la textura trasera. */
    return fx;
  }
  /* Arma un tren completo de 2 vagones en la vía y sentido dados */
  function buildTrainSet(group, z, platSide, trainId, driveEnd, dest, numbers) {
    CUR_GROUP = group; CUR_Z = z; CUR_PLAT_SIDE = platSide; CUR_TRAIN_ID = trainId;
    makeTrainFadeMats(trainId);
    CUR_DRIVE_END = driveEnd; CUR_DEST = dest; CUR_NUMBERS = numbers;
    CUR_WHEELS = trainId === 1 ? wheelPivots : (trainId === 2 ? wheelPivots2 : wheelsL2[trainId]);
    var starts = [-(CAR_LEN + CAR_GAP / 2), CAR_GAP / 2];
    buildCar(1, starts[0], -1);
    buildCar(2, starts[1], 1);
    /* Conexión entre vagones, ligeramente separada: fuelle corto que no
       llena el hueco + acoplador y mangueras a la vista */
    /* fuelle hueco (lados, techo y piso) para ver de un vagón al otro */
    box(0.55, 2.0, 0.22, MAT.rubber, 0, BODY_Y + 1.25, z - 0.99, group);
    box(0.55, 2.0, 0.22, MAT.rubber, 0, BODY_Y + 1.25, z + 0.99, group);
    box(0.55, 0.22, 2.2, MAT.rubber, 0, BODY_Y + 2.14, z, group);
    box(0.55, 0.3, 2.2, MAT.rubber, 0, BODY_Y + 0.4, z, group);
    tubeBetween(group, -0.55, BODY_Y + 0.12, z, 0.55, BODY_Y + 0.12, z, 0.09, MAT.dark);
    tubeBetween(group, -0.5, BODY_Y + 0.3, z - 0.4, 0.5, BODY_Y - 0.05, z - 0.25, 0.03, MAT.rubber);
    tubeBetween(group, -0.5, BODY_Y + 0.3, z + 0.4, 0.5, BODY_Y - 0.05, z + 0.25, 0.03, MAT.rubber);
    var hx = cabEndAt(starts[1] + CAR_LEN + 0.06, 1, driveEnd !== 1);
    cabEndAt(starts[0] - 0.06, -1, driveEnd !== -1);
    if (trainId === 1) {
      headSpot = new THREE.SpotLight(0xfff2c4, 0, 42, 0.32, 0.55, 1.2);
      headSpot.position.set(hx + 0.3, BODY_Y + 0.8, z);
      headSpot.target.position.set(hx + 34, RAIL_Y + 0.4, z);
      group.add(headSpot); group.add(headSpot.target);
    }
  }
  buildTrainSet(train, TRAIN_Z, 1, 1, 1, 'EXPOSICIÓN', ['M1. 0074', 'M1. 0080']);
  buildTrainSet(train2, TRACK_B_Z, -1, 2, -1, 'TALLERES', ['M1. 0051', 'M1. 0057']);
  mergeStatic(train); mergeStatic(train2);   /* carrocería e interior: pocas llamadas */
  CUR_Z = TRAIN_Z; CUR_GROUP = train; CUR_PLAT_SIDE = 1; CUR_TRAIN_ID = 1;

  /* ================= Transbordo a la Línea 2 (subterránea) =================
     N3: edificio de transbordo a nivel suelo, al oriente y junto a la
     banqueta sur; a él llega la pasarela desde N2 y tiene salida propia a
     la calle. N4: distribuidor subterráneo bajo N3. N5: andenes de la
     Línea 2, que cruza a 90° (a lo largo de z) por debajo del viaducto, un
     poco al oriente de la estación elevada: andén lateral Zaragoza
     (poniente), andén central de servicio y andén lateral Sendero / San
     Nicolás (oriente). El túnel es infinito como la Línea 1: se repite
     cada L2_P metros y los trenes se reciclan sin que se note. */
  var AX = 42, ZC = 22, N4_Y = -5.0, N5_Y = -10.5, N5_RAIL = N5_Y - (PLAT_Y - RAIL_Y);
  var L2_P = 640, L2_HALF = 24;          /* periodo del túnel y media longitud del andén */
  var N3B = { x0: 30, x1: 46, z0: 18, z1: 34, top: 9.0 };
  var N3_HOLE = [40.5, 43.1, 25.1, 31.0];   /* escalera de N3 a N4 */
  var zone = { under: false, corte: false }, l2Ride = false, subteOrbit = false;
  var graniteMat = new THREE.MeshStandardMaterial({ map: graniteTexture, roughness: 0.2, metalness: 0.05 });
  graniteMat.userData.polished = true;
  var ceilMat = std(0xdfe2e0, 0.85, 0);
  function graniteCells(x0, x1, z0, z1, y, holes, parent) {   /* piso pulido de una sola malla */
    holeCells(x0, x1, z0, z1, holes, function (a, b, c, d) {
      panel(b - a, d - c, graniteMat, (a + b) / 2, y + 0.012, (c + d) / 2, '+y', parent, [(b - a) / 1.2, (d - c) / 1.2]);
    });
  }

  /* ---------- N3: edificio de transbordo y pasarela desde N2 ---------- */
  var transferGrp = new THREE.Group(); scene.add(transferGrp);
  var n3Roof = null;
  (function transferN3() {
    var T = transferGrp, B = N3B, cx = (B.x0 + B.x1) / 2, cz = (B.z0 + B.z1) / 2;
    slabWithHoles(B.x0, B.x1, B.z0, B.z1, 0, 0.6, hallFloorMat, [N3_HOLE], T, 0.6);
    graniteCells(B.x0 + 0.15, B.x1 - 0.15, B.z0 + 0.15, B.z1 - 0.15, 0.6, [N3_HOLE], T);
    /* Fachada norte de cristal (da a la avenida): huecos de la pasarela y de la puerta */
    glassRun('x', B.x0, B.x1, B.z0, 0.6, B.top, [[30.2, 32.8], [37, 41]], T);
    box(2.6, 3.9, 0.3, MAT.concreteDark, 31.5, 0.6 + 1.95, B.z0, T);            /* bajo la pasarela */
    box(2.6, B.top - 7.9, 0.3, MAT.concreteDark, 31.5, (7.9 + B.top) / 2, B.z0, T);
    var lintel = mesh(new THREE.PlaneGeometry(4, B.top - 3.65), glassWall, 39, (3.4 + B.top - 0.25) / 2, B.z0, T);
    lintel.castShadow = false;
    box(4, 0.25, 0.25, MAT.blueSteel, 39, 3.4, B.z0, T);
    /* Muros de concreto con banda de cristal arriba */
    [['x', B.x0, B.x1, B.z1], ['z', B.z0, B.z1, B.x0], ['z', B.z0, B.z1, B.x1]].forEach(function (w) {
      var len = w[2] - w[1], mid = (w[1] + w[2]) / 2;
      box(w[0] === 'x' ? len : 0.3, 2.0, w[0] === 'x' ? 0.3 : len, MAT.concreteDark,
        w[0] === 'x' ? mid : w[3], 1.6, w[0] === 'x' ? w[3] : mid, T);
      glassRun(w[0], w[1], w[2], w[3], 2.6, B.top, null, T);
    });
    n3Roof = new THREE.Group(); T.add(n3Roof);
    box(B.x1 - B.x0 + 0.6, 0.45, B.z1 - B.z0 + 0.6, MAT.concreteDark, cx, B.top + 0.22, cz, n3Roof);
    box(B.x1 - B.x0 + 0.7, 0.5, 0.12, MAT.blueSteel, cx, B.top + 0.2, B.z0 - 0.3, n3Roof);
    var lights = [];
    for (var lx = B.x0 + 2; lx < B.x1; lx += 4) for (var lz = B.z0 + 3; lz < B.z1; lz += 4) lights.push([lx, B.top - 0.06, lz]);
    instanced(new THREE.BoxGeometry(1.8, 0.06, 0.4), MAT.ceilLight, lights, T).castShadow = false;
    /* Llegada de la pasarela (a la altura de N2) y escalera al piso de N3 */
    box(2.6, 0.4, 1.5, MAT.concrete, 31.5, N2_Y - 0.2, B.z0 + 0.75, T); addFloor(30.2, 32.8, B.z0, B.z0 + 1.5, N2_Y);
    railing(32.85, B.z0 + 0.1, 32.85, B.z0 + 1.5, N2_Y, T);
    var Lp = stairLen(N2_Y - 0.6);
    flight('z', B.z0 + 1.5, B.z0 + 1.5 + Lp, 31.5, 2.4, N2_Y, 0.6, T);
    addWall(30.3, 32.7, B.z0, B.z0 + 1.5 + Lp - 1.2, 0.5, 0.65);
    /* Escalera a N4 (sube del lado sur; baja hacia el norte) */
    var Ln = stairLen(0.6 - N4_Y);
    flight('z', N3_HOLE[3], N3_HOLE[3] - Ln, 41.8, 2.4, 0.6, N4_Y, T);
    railing(N3_HOLE[0] - 0.05, N3_HOLE[2], N3_HOLE[0] - 0.05, N3_HOLE[3], 0.6, T);
    railing(N3_HOLE[1] + 0.05, N3_HOLE[2], N3_HOLE[1] + 0.05, N3_HOLE[3], 0.6, T);
    railing(N3_HOLE[0] - 0.05, N3_HOLE[2] - 0.05, N3_HOLE[1] + 0.05, N3_HOLE[2] - 0.05, 0.6, T);
    /* Puerta a la calle: torniquetes adentro y rampa a la banqueta */
    turnstile(37.9, 0.6, B.z0 + 1.6, false, T); turnstile(40.1, 0.6, B.z0 + 1.6, false, T);
    var rl = B.z0 - 16.3, rd = 0.6 - 0.17;
    var ramp = box(4, 0.3, Math.hypot(rl, rd), hallFloorMat, 39, (0.6 + 0.17) / 2 - 0.15, (B.z0 + 16.3) / 2, T);
    ramp.rotation.x = -Math.atan2(rd, rl);
    RAMPS.push({ axis: 'z', a0: B.z0, a1: 16.3, c0: 37, c1: 41, y0: 0.6, y1: 0.17 });
    /* Letreros */
    var fac = mesh(new THREE.PlaneGeometry(7.2, 1.6), new THREE.MeshBasicMaterial({
      map: signTexture('CUAUHTÉMOC', 'Transbordo · Línea 1 ↔ Línea 2', '#16212b') }), 39, 5.2, B.z0 - 0.2, T);
    fac.rotation.y = Math.PI; fac.castShadow = false;
    hangSign('LÍNEA 2 · ANDENES', 'Sendero · Gral. I. Zaragoza ↓', 41.8, 3.4, N3_HOLE[3] + 1.4, 0, T, '#056a3a', B.top);
    hangSign('LÍNEA 1 · ANDENES', 'Por la pasarela ↑', 31.5, 3.4, B.z0 + 1.5 + Lp + 1.2, 0, T, '#6b5200', B.top);
    hangSign('SALIDA', 'Calle · banqueta sur', 39, 3.4, B.z0 + 3.2, 0, T, '#16212b', B.top);
    /* Pasarela cubierta de N2 a N3 (cruza sobre la avenida) */
    var pz0 = N2B.z1, pz1 = B.z0, pl = pz1 - pz0, pm = (pz0 + pz1) / 2;
    box(2.6, 0.4, pl, MAT.concrete, 31.5, N2_Y - 0.2, pm, T);
    panel(2.4, pl, graniteMat, 31.5, N2_Y + 0.004, pm, '+y', T, [2, pl / 1.2]);
    addFloor(30.2, 32.8, pz0, pz1, N2_Y);
    glassRun('z', pz0, pz1, 30.2, N2_Y, N2_Y + 3.0, null, T);
    glassRun('z', pz0, pz1, 32.8, N2_Y, N2_Y + 3.0, null, T);
    box(3.0, 0.3, pl, MAT.concreteDark, 31.5, N2_Y + 3.15, pm, T);
    [30.5, 32.5].forEach(function (x) {
      box(0.4, N2_Y - 0.4, 0.4, MAT.concreteDark, x, (N2_Y - 0.4) / 2, 17.2, T);
      addWall(x - 0.25, x + 0.25, 16.95, 17.45, -0.1, 0.4);
    });
  })();
  mergeStatic(transferGrp);

  /* ---------- Bajo tierra: N4, N5 y túnel ---------- */
  var subte = new THREE.Group(); scene.add(subte);
  var subStatic = new THREE.Group(); subte.add(subStatic);
  var l2Box = new THREE.Group();   /* andenes y muros de N5: se copia a ±L2_P (estaciones vecinas) */
  var tileTexture = canvasTexture(256, 256, function (g, w, h) {
    g.fillStyle = '#e8ebe7'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#c4ccc8';
    for (var i = 0; i <= w; i += 32) { g.fillRect(i, 0, 2, h); g.fillRect(0, i, w, 2); }
  });
  tileTexture.wrapS = tileTexture.wrapT = THREE.RepeatWrapping;
  var tileMat = new THREE.MeshStandardMaterial({ map: tileTexture, roughness: 0.35, metalness: 0.02 });
  var bandMat = std(0x078a4c, 0.5, 0.05);   /* franja verde de la Línea 2 */
  var tunnelTexture = canvasTexture(256, 128, function (g, w, h) {
    g.fillStyle = '#7b7d7e'; g.fillRect(0, 0, w, h);
    for (var i = 0; i < 1400; i++) {
      var v = 95 + Math.random() * 55;
      g.fillStyle = 'rgba(' + v + ',' + v + ',' + (v + 3) + ',.35)';
      g.fillRect(Math.random() * w, Math.random() * h, 2 + Math.random() * 3, 1 + Math.random() * 2);
    }
    g.fillStyle = 'rgba(35,35,35,.55)'; g.fillRect(0, 0, 3, h);         /* junta cada 8 m */
    g.fillStyle = 'rgba(30,30,30,.25)'; g.fillRect(0, h * 0.8, w, h * 0.2);
  });
  tunnelTexture.wrapS = tunnelTexture.wrapT = THREE.RepeatWrapping;
  var tunnelMat = new THREE.MeshStandardMaterial({ map: tunnelTexture, roughness: 0.95 });
  var sleeperTexture = canvasTexture(64, 384, function (g, w, h) {
    g.fillStyle = '#6d6b67'; g.fillRect(0, 0, w, h);
    for (var k = 0; k < 12; k++) {   /* 12 durmientes cada 8 m */
      var y = (k + 0.5) * h / 12 - 6;
      g.fillStyle = '#8d8b86'; g.fillRect(2, y, w - 4, 12);
      g.fillStyle = '#2a2d30'; g.fillRect(w * 0.17, y + 2, 6, 8); g.fillRect(w * 0.78, y + 2, 6, 8);
    }
  });
  sleeperTexture.wrapS = sleeperTexture.wrapT = THREE.RepeatWrapping;
  var trackMat = new THREE.MeshStandardMaterial({ map: sleeperTexture, roughness: 0.9 });
  var WX0 = 32.3, WX1 = 51.7, N5_TOP = N4_Y - 0.4, TRACK_FLOOR = N5_RAIL - 0.5;
  /* techo del túnel arriba de la catenaria rígida (el pantógrafo llega a RAIL + 5.05) */
  var TUN_TOP = N5_RAIL + 5.6, L2_WIRE = N5_RAIL + 5.05;
  var L2_BENCH_Z = [ZC - 20, ZC + 2, ZC + 18];

  (function l2Station() {   /* N5: lo que se repite en cada estación de la Línea 2 */
    var B = l2Box, LEN = 2 * L2_HALF, H = N5_TOP - N5_Y;
    [[WX0, 37.5], [46.5, WX1], [40.5, 43.5]].forEach(function (p, i) {
      box(p[1] - p[0], N5_Y - TRACK_FLOOR, LEN, MAT.platform, (p[0] + p[1]) / 2, (N5_Y + TRACK_FLOOR) / 2, ZC, B);
      if (i === 2) return;   /* el central es de servicio */
      panel(p[1] - p[0] - 0.3, LEN, graniteMat, (p[0] + p[1]) / 2 + (i === 0 ? -0.15 : 0.15), N5_Y + 0.012, ZC, '+y', B,
        [(p[1] - p[0]) / 1.2, LEN / 1.2]);
      var edge = i === 0 ? p[1] - 0.3 : p[0] + 0.3;
      panel(0.45, LEN, MAT.yellow, edge, N5_Y + 0.024, ZC, '+y', B);
    });
    /* Muros de azulejo con franja verde y letreros de estación */
    [[WX0, '+x', 'Línea 2 · Dirección Gral. I. Zaragoza'], [WX1, '-x', 'Línea 2 · Dirección Sendero (San Nicolás)']].forEach(function (w) {
      panel(LEN, H, tileMat, w[0], (N5_Y + N5_TOP) / 2, ZC, w[1], B, [LEN / 2, H / 2]);
      panel(LEN, 0.35, bandMat, w[0] + (w[1] === '+x' ? 0.01 : -0.01), N5_Y + 2.4, ZC, w[1], B);
      var smat = new THREE.MeshStandardMaterial({ map: stationSignTexture('CUAUHTÉMOC', w[2]), roughness: 0.6 });
      [ZC - 12, ZC + 6].forEach(function (z) {
        panel(4.4, 1.0, smat, w[0] + (w[1] === '+x' ? 0.02 : -0.02), N5_Y + 3.4, z, w[1], B);
      });
      L2_BENCH_Z.forEach(function (z) {   /* bancas contra el muro */
        var sx = w[1] === '+x' ? 1 : -1;
        box(0.55, 0.1, 2.4, MAT.bench, w[0] + sx * 0.45, N5_Y + 0.48, z, B);
        box(0.09, 0.55, 2.4, MAT.bench, w[0] + sx * 0.15, N5_Y + 0.82, z, B);
        box(0.5, 0.45, 0.08, MAT.steelDark, w[0] + sx * 0.45, N5_Y + 0.22, z - 1.0, B);
        box(0.5, 0.45, 0.08, MAT.steelDark, w[0] + sx * 0.45, N5_Y + 0.22, z + 1.0, B);
      });
    });
    /* Testeros con la boca del túnel */
    [[ZC - L2_HALF, '+z'], [ZC + L2_HALF, '-z']].forEach(function (e) {
      var h = N5_TOP - TRACK_FLOOR;
      panel(35.5 - WX0, h, tileMat, (WX0 + 35.5) / 2, (TRACK_FLOOR + N5_TOP) / 2, e[0], e[1], B, [(35.5 - WX0) / 2, h / 2]);
      panel(WX1 - 48.5, h, tileMat, (WX1 + 48.5) / 2, (TRACK_FLOOR + N5_TOP) / 2, e[0], e[1], B, [(WX1 - 48.5) / 2, h / 2]);
      panel(13, N5_TOP - TUN_TOP, tileMat, AX, (N5_TOP + TUN_TOP) / 2, e[0], e[1], B, [6.5, 0.3]);
    });
    /* Columnas del andén central, luz de techo y letreros colgantes */
    var cols = [];
    for (var cz = ZC - 20; cz <= ZC + 20; cz += 8) cols.push([AX, (N5_Y + N5_TOP) / 2, cz]);
    instanced(new THREE.CylinderGeometry(0.35, 0.35, H, 16), MAT.concrete, cols, B);
    var lights = [];
    for (var lz = ZC - 22; lz <= ZC + 22; lz += 4) lights.push([35, N5_TOP - 0.05, lz], [49.2, N5_TOP - 0.05, lz], [AX, N5_TOP - 0.05, lz]);
    instanced(new THREE.BoxGeometry(0.4, 0.06, 2.6), MAT.ceilLight, lights, B).castShadow = false;
    [ZC - 16, ZC + 14].forEach(function (z) {   /* de lado a lado del andén: se leen al caminar por él */
      hangSign('ZARAGOZA', 'Línea 2 · hacia el centro', 34.9, N5_TOP - 1.0, z, 0, B, '#056a3a', N5_TOP);
      hangSign('SENDERO', 'Línea 2 · hacia San Nicolás', 49.1, N5_TOP - 1.0, z, 0, B, '#056a3a', N5_TOP);
    });
  })();
  mergeStatic(l2Box);
  subte.add(l2Box);
  [-1, 1].forEach(function (k) {   /* estaciones vecinas (al fondo del túnel) */
    var c = l2Box.clone(); c.position.z = k * L2_P; subte.add(c);
    panel(WX1 - WX0, 2 * L2_HALF, ceilMat, AX, N5_TOP, ZC + k * L2_P, '-y', subte);
  });
  /* hasta tocar el costado del tren (1.46 m del eje): sin hueco al bajar */
  addFloor(WX0, 37.56, ZC - L2_HALF, ZC + L2_HALF, N5_Y);
  addFloor(46.44, WX1, ZC - L2_HALF, ZC + L2_HALF, N5_Y);
  L2_BENCH_Z.forEach(function (z) {
    addWall(WX0, WX0 + 0.75, z - 1.25, z + 1.25, N5_Y - 0.1, N5_Y + 0.6);
    addWall(WX1 - 0.75, WX1, z - 1.25, z + 1.25, N5_Y - 0.1, N5_Y + 0.6);
  });
  for (var l2c = ZC - 20; l2c <= ZC + 20; l2c += 8) addWall(AX - 0.4, AX + 0.4, l2c - 0.4, l2c + 0.4, N5_Y - 0.1, N5_Y + 0.6);

  (function l2Tunnel() {   /* túnel y vía continuos de -1.5 a +1.5 periodos */
    var T = subStatic, Z0 = ZC - 1.5 * L2_P, Z1 = ZC + 1.5 * L2_P, LEN = Z1 - Z0;
    panel(13, LEN, std(0x4f5254, 0.95, 0), AX, TRACK_FLOOR, ZC, '+y', T);
    [AX - 3, AX + 3].forEach(function (x) {
      box(2.6, N5_RAIL - 0.15 - TRACK_FLOOR, LEN, MAT.concreteDark, x, (N5_RAIL - 0.15 + TRACK_FLOOR) / 2, ZC, T);
      panel(2.6, LEN, trackMat, x, N5_RAIL - 0.12, ZC, '+y', T, [1, LEN / 8]);   /* 3 cm sobre el concreto: no parpadea */
      [-0.76, 0.76].forEach(function (dx) { box(0.09, 0.16, LEN, MAT.rail, x + dx, N5_RAIL + 0.05, ZC, T); });
      /* catenaria rígida: perfil de aluminio colgado del techo */
      box(0.1, 0.14, LEN, MAT.steelDark, x, L2_WIRE + 0.07, ZC, T);
    });
    var segs = [[Z0, ZC - L2_P - L2_HALF], [ZC - L2_P + L2_HALF, ZC - L2_HALF],
      [ZC + L2_HALF, ZC + L2_P - L2_HALF], [ZC + L2_P + L2_HALF, Z1]], lamps = [];
    segs.forEach(function (sg) {
      var len = sg[1] - sg[0], mid = (sg[0] + sg[1]) / 2, h = TUN_TOP - TRACK_FLOOR;
      panel(len, h, tunnelMat, 35.5, (TRACK_FLOOR + TUN_TOP) / 2, mid, '+x', T, [len / 8, 1]);
      panel(len, h, tunnelMat, 48.5, (TRACK_FLOOR + TUN_TOP) / 2, mid, '-x', T, [len / 8, 1]);
      panel(13, len, tunnelMat, AX, TUN_TOP, mid, '-y', T, [13 / 8, len / 8]);
      box(0.9, 0.9, len, MAT.concreteDark, 36.0, TRACK_FLOOR + 0.45, mid, T);    /* andador de evacuación */
      box(0.9, 0.9, len, MAT.concreteDark, 48.0, TRACK_FLOOR + 0.45, mid, T);
      box(0.12, 0.25, len, MAT.dark, 35.58, -8.2, mid, T);                       /* charolas de cable */
      box(0.12, 0.25, len, MAT.dark, 48.42, -8.2, mid, T);
      for (var z = sg[0] + 8; z < sg[1]; z += 16) lamps.push([35.62, -7.4, z], [48.38, -7.4, z]);
    });
    instanced(new THREE.BoxGeometry(0.08, 0.18, 1.2), MAT.ceilLight, lamps, T).castShadow = false;
  })();

  (function l2Distributor() {   /* N4 bajo el edificio de transbordo */
    var T = subStatic, X0 = WX0, X1 = WX1, Z0 = 11, Z1 = 31.5, CEIL = -1.4, H = CEIL - N4_Y, ym = (N4_Y + CEIL) / 2;
    var holes = [[32.9, 35.5, Z0, 15], [48.5, 51.1, Z0, 15]];   /* acaban justo en el último escalón */
    slabWithHoles(X0, X1, Z0, Z1, N5_TOP, N4_Y, hallFloorMat, holes, T, N4_Y);
    graniteCells(X0 + 0.1, X1 - 0.1, Z0 + 0.1, Z1 - 0.1, N4_Y, holes, T);
    panel(Z1 - Z0, H, tileMat, X0, ym, (Z0 + Z1) / 2, '+x', T, [(Z1 - Z0) / 2, H / 2]);
    panel(Z1 - Z0, H, tileMat, X1, ym, (Z0 + Z1) / 2, '-x', T, [(Z1 - Z0) / 2, H / 2]);
    panel(X1 - X0, H, tileMat, (X0 + X1) / 2, ym, Z0, '+z', T, [(X1 - X0) / 2, H / 2]);
    panel(X1 - X0, H, tileMat, (X0 + X1) / 2, ym, Z1, '-z', T, [(X1 - X0) / 2, H / 2]);
    panel(Z1 - Z0, 0.3, bandMat, X0 + 0.01, N4_Y + 2.2, (Z0 + Z1) / 2, '+x', T);
    panel(Z1 - Z0, 0.3, bandMat, X1 - 0.01, N4_Y + 2.2, (Z0 + Z1) / 2, '-x', T);
    holeCells(X0, X1, Z0, Z1, [N3_HOLE], function (a, b, c, d) {
      panel(b - a, d - c, ceilMat, (a + b) / 2, CEIL, (c + d) / 2, '-y', T);
    });
    /* pozo de la escalera entre el techo de N4 y el piso de N3 */
    var wl = N3_HOLE[3] - N3_HOLE[2], wz = (N3_HOLE[2] + N3_HOLE[3]) / 2;
    panel(wl, 1.4, tileMat, N3_HOLE[0], -0.7, wz, '+x', T, [wl / 2, 0.7]);
    panel(wl, 1.4, tileMat, N3_HOLE[1], -0.7, wz, '-x', T, [wl / 2, 0.7]);
    panel(2.6, 1.4, tileMat, 41.8, -0.7, N3_HOLE[2], '+z', T, [1.3, 0.7]);
    addWall(40.6, 43.0, N3_HOLE[3] - stairLen(0.6 - N4_Y) + 1.0, Z1, N4_Y - 0.1, N4_Y + 0.05);
    /* escaleras a los andenes de la Línea 2 */
    var Ls = stairLen(N4_Y - N5_Y);
    [[34.2, 32.85, 35.55], [49.8, 48.45, 51.15]].forEach(function (st) {
      flight('z', 15, 15 - Ls, st[0], 2.4, N4_Y, N5_Y, T);
      railing(st[1], Z0 + 0.1, st[1], 15, N4_Y, T); railing(st[2], Z0 + 0.1, st[2], 15, N4_Y, T);
      addWall(st[0] - 1.2, st[0] + 1.2, 15 - Ls + 1.0, Z0, N5_Y - 0.1, N5_Y + 0.05);
    });
    var lights = [];
    for (var lx = X0 + 2.5; lx < X1; lx += 4) for (var lz = Z0 + 2; lz < Z1; lz += 4) {
      if (lx > 40 && lx < 44 && lz > 25) continue;
      lights.push([lx, CEIL - 0.05, lz]);
    }
    instanced(new THREE.BoxGeometry(1.6, 0.06, 0.5), MAT.ceilLight, lights, T).castShadow = false;
    hangSign('↓ ZARAGOZA', 'Línea 2 · andén poniente', 34.2, CEIL - 0.9, 16.4, 0, T, '#056a3a', CEIL);
    hangSign('↓ SENDERO', 'Línea 2 · San Nicolás · andén oriente', 49.8, CEIL - 0.9, 16.4, 0, T, '#056a3a', CEIL);
    hangSign('↑ SALIDA · LÍNEA 1', 'Edificio de transbordo', 41.8, CEIL - 0.9, 21.2, 0, T, '#16212b', CEIL);
    /* puerta del andén de servicio */
    box(2.2, 2.4, 0.1, MAT.steelDark, AX, N4_Y + 1.2, Z0 + 0.06, T);
    panel(3.6, 0.8, new THREE.MeshBasicMaterial({ map: signTexture('ANDÉN DE SERVICIO', 'Solo personal autorizado', '#7a1712') }),
      AX, N4_Y + 2.9, Z0 + 0.03, '+z', T);
  })();
  /* techo de N5 fuera de N4 (bajo N4 lo es su losa) */
  panel(WX1 - WX0, 11 - (ZC - L2_HALF), ceilMat, AX, N5_TOP, (11 + ZC - L2_HALF) / 2, '-y', subStatic);
  panel(WX1 - WX0, ZC + L2_HALF - 31.5, ceilMat, AX, N5_TOP, (31.5 + ZC + L2_HALF) / 2, '-y', subStatic);
  mergeStatic(subStatic);

  /* ---------- Trenes de la Línea 2: los mismos MM-05 ----------
     Se arman como los de arriba (a lo largo de x) dentro de un grupo
     girado 90°: x del tren = hacia el norte (Sendero). Tren 3 va a
     Sendero por la vía oriente; tren 4 a Zaragoza por la poniente. */
  var l2Rig = new THREE.Group(); l2Rig.userData.noMerge = true;
  l2Rig.position.set(AX, N5_RAIL - RAIL_Y, ZC); l2Rig.rotation.y = Math.PI / 2; subte.add(l2Rig);
  var trainL2a = new THREE.Group(), trainL2b = new THREE.Group();
  l2Rig.add(trainL2a); l2Rig.add(trainL2b);
  buildTrainSet(trainL2a, 3, 1, 3, 1, 'SENDERO', ['M2. 0112', 'M2. 0118']);
  buildTrainSet(trainL2b, -3, -1, 4, -1, 'ZARAGOZA', ['M2. 0127', 'M2. 0133']);
  mergeStatic(trainL2a); mergeStatic(trainL2b);
  CUR_Z = TRAIN_Z; CUR_GROUP = train; CUR_PLAT_SIDE = 1; CUR_TRAIN_ID = 1;
  l2Rig.updateMatrixWorld(true);

  /* Recorrido: de estación a estación (L2_P m) acelera, va a 60 km/h,
     frena y para en la marca; la estación siempre es esta misma (el
     túnel se repite), así que viajando no se acaba nunca. */
  var L2R = (function () {
    var v = 16.7, acc = 1.1, dec = 1.2, xa = v * v / (2 * acc), xd = v * v / (2 * dec), ta = v / acc, td = v / dec;
    var tc = (L2_P - xa - xd) / v;
    return { v: v, acc: acc, dec: dec, xa: xa, ta: ta, td: td, tc: tc, T: ta + tc + td };
  })();
  function l2Dist(t) {
    var R = L2R;
    if (t < R.ta) return R.acc * t * t / 2;
    if (t < R.ta + R.tc) return R.xa + R.v * (t - R.ta);
    var u = Math.min(t - R.ta - R.tc, R.td);
    return R.xa + R.v * R.tc + R.v * u - R.dec * u * u / 2;
  }
  function l2Speed(t) {
    var R = L2R;
    if (t < R.ta) return R.acc * t;
    if (t < R.ta + R.tc) return R.v;
    return Math.max(0, R.v - R.dec * (t - R.ta - R.tc));
  }
  var l2Sims = [
    { id: 3, dir: 1, g: trainL2a, s: 0, state: 'dwell', t: 6, dwell: 16, door: 1, speed: 0, base: 0 },
    { id: 4, dir: -1, g: trainL2b, s: 0, state: 'run', t: L2R.T * 0.42, dwell: 16, door: 0, speed: 0, base: 0 }
  ];
  /* Para caminar dentro: coordenadas del tren (x a lo largo, z de lado) */
  l2Sims.forEach(function (S) {
    S.pending = 0;
    S.l2t = { l2: true, id: S.id, S: S, g: S.g, z: S.id === 3 ? 3 : -3, side: S.id === 3 ? 1 : -1, tx: 0, door: 0 };
  });
  function wrapL2(s) { return s - L2_P * Math.round(s / L2_P); }
  function l2RidingSim() {
    if (l2Ride) return l2Sims[0];
    return walk.active && walk.inTrain && walk.inTrain.l2 ? walk.inTrain.S : null;
  }
  function stepL2(S, dt) {
    S.t += dt;
    switch (S.state) {
      case 'dwell':   /* espera a que termine de subir y bajar la gente */
        S.door = 1;
        if (S.t >= S.dwell && (S.pending <= 0 || S.t > 45)) { S.state = 'closing'; S.t = 0; }
        break;
      case 'closing':
        S.door = 1 - easeInOut(clamp01(S.t / DOOR_T));
        if (S.t >= DOOR_T) { S.door = 0; S.base = S.s; S.state = 'run'; S.t = 0; S.repop = false; S.pending = 0; }
        break;
      case 'run':
        S.s = S.base + S.dir * l2Dist(S.t); S.speed = l2Speed(S.t);
        /* viajando: a medio túnel cambia la gente que espera en el andén */
        if (l2RidingSim() === S && !S.repop && S.t > L2R.T / 2) { S.repop = true; l2Populate(); }
        if (S.t >= L2R.T) { S.s = 0; S.speed = 0; S.state = 'opening'; S.t = 0; }
        break;
      case 'opening':
        S.door = easeInOut(clamp01(S.t / DOOR_T));
        if (S.t >= DOOR_T) { S.door = 1; S.state = 'dwell'; S.t = 0; S.dwell = 8 + Math.random() * 8; l2Exchange(S); }
        break;
    }
  }
  function l2SimOf(id) { return id === 3 ? l2Sims[0] : l2Sims[1]; }

  /* Gente de la Línea 2: pasajeros sentados y de pie en los trenes, y
     gente esperando en los andenes, en el distribuidor y en N3 */
  var l2People = [], l2Crowd = [];
  function l2Person(parent, pose, x, y, z, yaw, list) {
    var g = makePerson(null, parent, pose);
    g.position.set(x, y, z); g.rotation.y = yaw;
    g.userData.rig.headYT = (Math.random() - 0.5) * 0.8;
    l2People.push(g); if (list) list.push(g);
    return g;
  }
  function l2FillRiders(id, group, z) {
    var seats = trainSlots[id].filter(function (s) { return s.type === 'seat'; });
    var stand = trainSlots[id].filter(function (s) { return s.type !== 'seat'; });
    function take(list, n, kind) {
      for (var i = 0; i < n && list.length; i++) {
        var s = list.splice(Math.floor(Math.random() * list.length), 1)[0], ap = slotApproach(s, z);
        var g = l2Person(group, poseFor(kind === 'seat' ? 'seat' : s.type), ap.x, BODY_Y + FLOOR_DY, ap.z, s.yaw);
        s.occ = g; g.userData.slot = s;
      }
    }
    take(seats, 7 + Math.floor(Math.random() * 9), 'seat');
    take(stand, 1 + Math.floor(Math.random() * 4), 'stand');
  }
  function l2Populate() {
    l2Crowd.slice().forEach(l2Remove);
    var n = 6 + Math.floor(Math.random() * 10);
    for (var i = 0; i < n; i++) {   /* esperando cerca de la orilla, viendo a la vía */
      var west = Math.random() < 0.5, z = ZC - 21 + Math.random() * 42;
      var x = west ? 35.7 + Math.random() * 0.9 : 47.4 + Math.random() * 0.9;
      l2Person(subte, poseFor('wait'), x, N5_Y, z, west ? -Math.PI / 2 : Math.PI / 2, l2Crowd).userData.l2side = west ? 'W' : 'E';
    }
    L2_BENCH_Z.forEach(function (bz) {   /* algunos sentados en las bancas */
      [-0.75, 0, 0.75].forEach(function (d) {
        if (Math.random() < 0.6) return;
        var west = Math.random() < 0.5;
        l2Person(subte, poseFor('seat'), west ? WX0 + 0.87 : WX1 - 0.87, N5_Y, bz + d, west ? -Math.PI / 2 : Math.PI / 2, l2Crowd)
          .userData.l2side = west ? 'W' : 'E';
      });
    });
    for (var k = 0; k < 3; k++) {   /* distribuidor y edificio de transbordo */
      l2Person(subte, poseFor('wait'), 36 + Math.random() * 4, N4_Y, 18 + Math.random() * 10, Math.random() * 6.28, l2Crowd);
    }
    for (var m = 0; m < 2; m++) {
      l2Person(transferGrp, poseFor('wait'), 34 + Math.random() * 5, 0.6, 22 + Math.random() * 9, Math.random() * 6.28, l2Crowd);
    }
  }
  var l2Look = 0;
  function updateL2People(dt) {   /* voltean de vez en cuando (solo los cercanos se animan) */
    l2Look += dt;
    var turn = l2Look > 0.5; if (turn) l2Look = 0;
    for (var i = 0; i < l2People.length; i++) {
      var g = l2People[i], r = g.userData.rig;
      if (turn && Math.random() < 0.08) r.headYT = Math.random() < 0.4 ? 0 : (Math.random() - 0.5) * 1.3;
      /* posición en el mundo sin recorrer la jerarquía: en el andén/N3 es
         la propia; a bordo, la del tren (girado 90°) más la suya */
      var P = g.parent;
      if (P === subte || P === transferGrp) _l2v.copy(g.position);
      else { var wp = l2World(g.position.x + P.position.x, g.position.z); _l2v.set(wp.x, N5_Y, wp.z); }
      if (_l2v.distanceToSquared(camera.position) < 900) applyRig(r, dt);
    }
  }
  var _l2v = new THREE.Vector3();

  /* ---- Gente de la Línea 2 que baja, sube y llega desde la calle ----
     Al abrir puertas bajan algunos (van a la escalera, al distribuidor, a
     N3 y salen a la calle) y suben los que esperaban cerca: caminan a la
     puerta, entran y buscan asiento o tubo. El tren espera a que acaben.
     De la calle va llegando gente nueva por el mismo camino al revés. */
  var L2_FLOOR = BODY_Y + FLOOR_DY + (N5_RAIL - RAIL_Y);
  function l2Local(x, z) { return { x: ZC - z, z: x - AX }; }
  function l2World(lx, lz) { return { x: AX + lz, z: ZC - lx }; }
  var l2Walkers = [], l2SpawnT = 4;
  var L2_STAIR_X = { W: 34.2, E: 49.8 }, L2_LANE_X = { W: 36.6, E: 47.4 }, L2_WAIT_X = { W: [35.7, 36.6], E: [47.4, 48.3] };
  function l2SideOf(id) { return id === 3 ? 'E' : 'W'; }
  function l2Walk(g, pts, cb) {
    var w = g.userData.l2w;
    if (!w) {
      w = g.userData.l2w = { g: g, rig: g.userData.rig, path: [], seg: null, onArrive: null,
        speed: 1.1 + Math.random() * 0.35, yawT: g.rotation.y };
      l2Walkers.push(w);
    }
    w.path = pts.map(function (pt) { return Object.assign({}, pt); }); w.seg = null; w.onArrive = cb || null;
    g.userData.busy = true; setPose(w.rig, 'stand');
  }
  function l2StopWalk(g) {
    var w = g.userData.l2w;
    if (w) { var i = l2Walkers.indexOf(w); if (i >= 0) l2Walkers.splice(i, 1); g.userData.l2w = null; w.rig.moving = false; }
    g.userData.busy = false;
  }
  function l2Remove(g) {
    l2StopWalk(g);
    if (g.userData.slot) { g.userData.slot.occ = null; g.userData.slot = null; }
    if (g.parent) g.parent.remove(g);
    g.traverse(function (o) { if (o.isMesh) o.geometry.dispose(); if (o.isSkinnedMesh) o.skeleton.dispose(); });
    var i = l2People.indexOf(g); if (i >= 0) l2People.splice(i, 1);
    i = l2Crowd.indexOf(g); if (i >= 0) l2Crowd.splice(i, 1);
  }
  /* Cambia de grupo (andén ↔ tren girado) sin moverse de lugar */
  var _l2q = new THREE.Quaternion(), _l2q2 = new THREE.Quaternion();
  function l2Reparent(g, parent) {
    g.updateMatrixWorld(true); parent.updateMatrixWorld(true);
    g.getWorldPosition(_l2v); g.getWorldQuaternion(_l2q);
    parent.worldToLocal(_l2v); parent.getWorldQuaternion(_l2q2).invert();
    parent.add(g); g.position.copy(_l2v); g.quaternion.copy(_l2q2.multiply(_l2q));
    if (g.userData.l2w) g.userData.l2w.yawT = g.rotation.y;
  }
  function l2ExitPath(side) {   /* del andén a la calle (por N4 y N3) */
    var sx = L2_STAIR_X[side], lane = L2_LANE_X[side], top = N3_HOLE[3], bot = top - stairLen(0.6 - N4_Y);
    return [{ x: lane, y: N5_Y, z: 6.2 }, { x: sx, y: N5_Y, z: 6.2 }, { x: sx, y: N5_Y, z: 15 - stairLen(N4_Y - N5_Y) },
      { x: sx, y: N4_Y, z: 15 }, { x: sx, y: N4_Y, z: 16.5 }, { x: 41.8, y: N4_Y, z: bot - 1.0 }, { x: 41.8, y: N4_Y, z: bot },
      { x: 41.8, y: 0.6, z: top }, { x: 41.8, y: 0.6, z: top + 1.2 }, { x: 37.4, y: 0.6, z: 29.5 }, { x: 39, y: 0.6, z: 21 },
      { x: 39, y: 0.6, z: N3B.z0 }, { x: 39, y: 0.17, z: 16.3 },
      { x: 39 + (Math.random() - 0.5) * 20, y: 0.17, z: 15.4 + Math.random() * 0.6 }];
  }
  function l2NearestDoor(lx) {
    var best = 0;
    for (var i = 1; i < DOOR_U.length; i++) if (Math.abs(DOOR_U[i] - lx) < Math.abs(DOOR_U[best] - lx)) best = i;
    return DOOR_U[best];
  }
  function l2Board(g, S) {
    var t = S.l2t, p = l2Local(g.position.x, g.position.z);
    var lx = S.g.position.x + l2NearestDoor(p.x - S.g.position.x) + (Math.random() - 0.5) * 0.5;
    var a = l2World(lx, t.z + t.side * 2.1), b = l2World(lx, t.z + t.side * 1.3);
    S.pending++;
    l2Walk(g, [{ x: a.x, z: a.z }, { x: b.x, z: b.z }], function () {
      S.pending--;
      if (S.state !== 'dwell') {   /* ya cerró: se queda esperando el siguiente */
        l2StopWalk(g); setPose(g.userData.rig, poseFor('wait')); return;
      }
      l2Reparent(g, S.g); g.position.y = BODY_Y + FLOOR_DY;
      var i = l2Crowd.indexOf(g); if (i >= 0) l2Crowd.splice(i, 1);
      var free = trainSlots[S.id].filter(function (sl) { return !sl.occ; });
      free.sort(function (s1, s2) {
        return (s1.type === 'seat' ? 0 : 4) + Math.abs(s1.x - g.position.x) - (s2.type === 'seat' ? 0 : 4) - Math.abs(s2.x - g.position.x);
      });
      var sl = free[0];
      if (!sl) { l2StopWalk(g); return; }
      sl.occ = g; g.userData.slot = sl;
      var ap = slotApproach(sl, t.z), aisle = t.z + t.side * 0.2;
      l2Walk(g, [{ x: g.position.x, z: aisle }, { x: ap.x, z: aisle }, { x: ap.x, z: ap.z }], function () {
        l2StopWalk(g); g.rotation.y = sl.yaw; setPose(g.userData.rig, poseFor(sl.type === 'seat' ? 'seat' : sl.type));
      });
    });
  }
  function l2Alight(g, S) {
    var t = S.l2t, u = l2NearestDoor(g.position.x), aisle = t.z + t.side * 0.15;
    if (g.userData.slot) { g.userData.slot.occ = null; g.userData.slot = null; }
    S.pending++;
    l2Walk(g, [{ x: g.position.x, z: aisle }, { x: u, z: aisle }, { x: u, z: t.z + t.side * 1.35 }], function () {
      S.pending--;
      l2Reparent(g, subte); g.position.y = N5_Y;
      var w = l2World(S.g.position.x + u, t.z + t.side * 2.3);
      l2Walk(g, [{ x: w.x, y: N5_Y, z: w.z }].concat(l2ExitPath(l2SideOf(S.id))), function () { l2Remove(g); });
    });
  }
  function l2Exchange(S) {
    var riders = l2People.filter(function (g) { return g.parent === S.g && !g.userData.busy && g.userData.slot; });
    var nOut = Math.min(riders.length, Math.floor(Math.random() * 5));
    for (var i = 0; i < nOut; i++) l2Alight(riders.splice(Math.floor(Math.random() * riders.length), 1)[0], S);
    if (riders.length > 26) return;   /* va lleno */
    var side = l2SideOf(S.id), lx0 = S.g.position.x;
    var wait = l2Crowd.filter(function (g) {
      if (g.userData.busy || g.userData.l2side !== side) return false;
      return Math.abs(l2Local(g.position.x, g.position.z).x - lx0) < 14;
    });
    var nIn = Math.round(wait.length * (0.55 + Math.random() * 0.45));
    for (var k = 0; k < nIn; k++) l2Board(wait.splice(Math.floor(Math.random() * wait.length), 1)[0], S);
  }
  function l2Arrive() {   /* llega alguien de la calle a esperar en un andén */
    var side = Math.random() < 0.5 ? 'W' : 'E';
    var g = makePerson(null, subte, 'stand');
    l2People.push(g); l2Crowd.push(g); g.userData.l2side = side;
    var path = l2ExitPath(side).reverse(), start = path.shift();
    g.position.set(start.x, start.y, start.z);
    var wx = L2_WAIT_X[side];
    path.push({ x: wx[0] + Math.random() * (wx[1] - wx[0]), y: N5_Y, z: ZC - 20 + Math.random() * 40 });
    l2Walk(g, path, function () {
      l2StopWalk(g); g.rotation.y = side === 'W' ? -Math.PI / 2 : Math.PI / 2;
      setPose(g.userData.rig, poseFor('wait'));
    });
  }
  function updateL2Walkers(dt) {
    l2SpawnT -= dt;
    if (l2SpawnT < 0) { l2SpawnT = 5 + Math.random() * 8; if (l2Crowd.length < 18) l2Arrive(); }
    var list = l2Walkers.slice();
    for (var i = 0; i < list.length; i++) {
      var w = list[i];
      if (w.path.length) moveAlong(w, dt);
      var g = w.g, dy = w.yawT - g.rotation.y;
      dy = ((dy + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
      g.rotation.y += dy * Math.min(1, dt * 6);
    }
  }

  /* ---------- Bajo tierra: luz, niebla y qué se dibuja ----------
     Abajo no hay sol ni cielo: luz pareja de lámparas, niebla oscura que
     esconde el túnel lejano, y lo de la superficie no se dibuja. Arriba lo
     subterráneo solo se dibuja cerca del pozo de N3 o en la vista Corte. */
  function applyUnderLight() {
    scene.background.setHex(0x0e1114);
    scene.fog.color.setHex(0x0e1114); scene.fog.near = 22; scene.fog.far = 165;
    camera.far = 200; camera.updateProjectionMatrix();
    sun.intensity = 0; fill.intensity = 0.18;
    /* luz de lámparas: llega de arriba y rebota en el piso, así que los
       techos no quedan negros */
    hemi.intensity = 0.7; hemi.color.setHex(0xf1f4fa); hemi.groundColor.setHex(0xb4b7bc);
    renderer.toneMappingExposure = 0.92;
    makeEnv(0xf6f7f8, 0xdcdedf, 0xc3c6c9);   /* reflejos de lámparas y azulejo, no de cielo */
    nightLights.forEach(function (pl) { pl.visible = false; });
    /* Bajo tierra tampoco llega el sol: el plafón de los coches va prendido */
    carCeilLights.forEach(function (pl) { pl.intensity = 1.05; pl.visible = true; });
    carCeilStripMats.forEach(function (m) { m.emissiveIntensity = 2.0; });
    if (rain) rain.visible = false;
  }
  var corteHide = [];   /* lo que la vista Corte oculta para ver hacia abajo */
  function updateZone() {
    var c = camera.position;
    var under = c.y < -1.0 && !zone.corte;
    if (under !== zone.under) { zone.under = under; if (under) applyUnderLight(); else setScenario(scenario); }
    var nearWell = c.x > 26 && c.x < 56 && c.z > 6 && c.z < 38 && c.y < 10;
    subte.visible = zone.corte || c.y < 0.8 || nearWell;
    var surf = !under;
    worldTile.visible = surf; farBg.visible = surf;
    tileCopies.forEach(function (t) { t.visible = surf; });
    cityTiles.forEach(function (t) { t.visible = surf && !zone.corte; });
    if (!surf) { train.visible = false; train2.visible = false; }
    transferGrp.visible = c.y > -6.5 || zone.corte;
    ground.visible = !zone.corte;
    corteHide.forEach(function (o) { o.visible = !zone.corte; });
  }
  corteHide = [street, walkS, walkN, n3Roof];
  l2FillRiders(3, trainL2a, 3); l2FillRiders(4, trainL2b, -3);
  l2Populate();

  /* Tótem de estación junto a la banqueta */
  (function totem() {
    var g = new THREE.Group(); g.position.set(21, 0, 12.5); worldTile.add(g);
    mesh(new THREE.CylinderGeometry(0.14, 0.18, 4.6, 12), MAT.steelDark, 0, 2.3, 0, g);
    var mat = new THREE.MeshStandardMaterial({
      map: signTexture('CUAUHTÉMOC', 'METRORREY · LÍNEAS 1 Y 2', '#16212b'), roughness: 0.6
    });
    mesh(new THREE.BoxGeometry(4.4, 1, 0.16),
      [MAT.dark, MAT.dark, MAT.dark, MAT.dark, mat, mat], 0, 4.15, 0, g);
  })();

  /* Espejos convexos de andén (como los redondos de las fotos), UNO POR
     TREN: colgados del techo, sobre la orilla del andén y ~4 m adelante de
     la cabina de mando, para que el conductor vea en él el costado de su
     tren y las puertas mientras sube la gente. Cada espejo es una cámara
     gran angular que dibuja a una textura de 320² (un solo render, no los
     6 de una CubeCamera) y solo se actualiza si está cerca y en cuadro;
     los dos se turnan los cuadros. La cara reflejante mira al conductor;
     por detrás solo se ve la carcasa naranja. */
  var mirrors = [], mirrorTurn = 0, mirrorFrustum = new THREE.Frustum(), mirrorMat4 = new THREE.Matrix4();
  function makeMirror(pos, roofZ, driver, view) {
    var g = new THREE.Group(); g.position.copy(pos); scene.add(g);
    var ceilY = PLAT_Y - 0.4 + Math.sqrt(5.4 * 5.4 - Math.pow(pos.z - roofZ, 2));
    var rod = ceilY - pos.y;   /* tubo que lo cuelga del techo + abrazadera */
    mesh(new THREE.CylinderGeometry(0.03, 0.03, rod, 8), MAT.blueSteel, 0, rod / 2, 0, g).castShadow = false;
    box(0.3, 0.05, 0.12, MAT.steelDark, 0, rod - 0.03, 0, g).castShadow = false;
    var face = new THREE.Group(); face.position.y = -0.62; g.add(face);
    var nrm = driver.clone().sub(pos).normalize().add(view.clone().sub(pos).normalize()).normalize();
    face.lookAt(pos.clone().add(new THREE.Vector3(0, -0.62, 0)).add(nrm));   /* +Z hacia la bisectriz */
    tubeBetween(g, 0, 0, 0, 0, -0.62 + 0.5, 0, 0.03, MAT.blueSteel);
    var orange = std(0xe07b16, 0.5, 0.2);
    var back = mesh(new THREE.CylinderGeometry(0.64, 0.64, 0.1, 32), orange, 0, 0, -0.06, face);
    back.rotation.x = Math.PI / 2;
    var rim = mesh(new THREE.TorusGeometry(0.62, 0.045, 8, 36), orange, 0, 0, 0.0, face);
    rim.castShadow = false;
    /* Casquete convexo con UV radiales: el centro se ve grande y la orilla
       comprime más escena, como un espejo convexo de verdad. */
    var R = 1.33, cap = new THREE.SphereGeometry(R, 36, 10, 0, Math.PI * 2, 0, 0.45);
    cap.rotateX(Math.PI / 2); cap.translate(0, 0, -R * Math.cos(0.45) + 0.01);
    var cp = cap.attributes.position, uv = cap.attributes.uv;
    for (var i = 0; i < cp.count; i++) {
      var x = cp.getX(i) / 0.58, y = cp.getY(i) / 0.58, r = Math.min(1, Math.hypot(x, y));
      var k = 0.78 + 0.22 * r;
      uv.setXY(i, 0.5 + 0.5 * x * k, 0.5 + 0.5 * y * k);
    }
    var rt = new THREE.WebGLRenderTarget(320, 320, { minFilter: THREE.LinearFilter, generateMipmaps: false });
    rt.texture.encoding = THREE.sRGBEncoding;
    rt.texture.wrapS = THREE.RepeatWrapping; rt.texture.repeat.x = -1; rt.texture.offset.x = 1;  /* imagen invertida */
    var glass = new THREE.Mesh(cap, new THREE.MeshBasicMaterial({ map: rt.texture, toneMapped: false, color: 0xe8eef2 }));
    glass.castShadow = false; face.add(glass);
    var shine = new THREE.Mesh(cap, new THREE.MeshStandardMaterial({ color: 0xffffff, transparent: true,
      opacity: 0.1, roughness: 0.05, metalness: 1, depthWrite: false }));
    shine.position.z = 0.004; face.add(shine);
    var cam = new THREE.PerspectiveCamera(92, 1, 0.3, 60);
    cam.layers.enable(1);   /* el espejo sí te ve a ti (capa 1) */
    cam.position.copy(pos).add(new THREE.Vector3(0, -0.62, 0)); cam.lookAt(view);
    var m = { g: g, cam: cam, rt: rt, hide: [glass, shine], center: cam.position.clone() };
    mirrors.push(m);
    return m;
  }
  /* Andén Exposición (tren 1 va a +x): espejo adelante de su cabina, mirando atrás */
  makeMirror(new THREE.Vector3(19.6, PLAT_Y + 3.05, 0.75), 2.6,
    new THREE.Vector3(14.55, BODY_Y + 1.98, TRAIN_Z - 0.3), new THREE.Vector3(-14, PLAT_Y + 1.0, 2.3));
  /* Andén Talleres (tren 2 va a −x): el mismo, en espejo */
  makeMirror(new THREE.Vector3(-19.6, PLAT_Y + 3.05, -6.35), -7.4,
    new THREE.Vector3(-14.55, BODY_Y + 1.98, TRACK_B_Z + 0.3), new THREE.Vector3(14, PLAT_Y + 1.0, -7.4));
  /* Cada espejo dibuja la escena otra vez: se turnan y cada uno se
     refresca 1 de cada 4 cuadros (~15 por segundo, de sobra para su tamaño) */
  function updateMirrors() {
    if (zone.under) return;
    mirrorFrustum.setFromProjectionMatrix(mirrorMat4.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
    mirrorTurn = (mirrorTurn + 1) % 4;
    var m = mirrors[mirrorTurn >> 1];
    if (mirrorTurn & 1) return;
    if (camera.position.distanceTo(m.center) > 45) return;
    if (!mirrorFrustum.intersectsSphere(new THREE.Sphere(m.center, 0.6))) return;
    m.hide.forEach(function (o) { o.visible = false; });
    var fogNear = scene.fog.near, fogFar = scene.fog.far;   /* el fondo se funde antes del límite de 60 m */
    scene.fog.near = Math.min(fogNear, 38); scene.fog.far = Math.min(fogFar, 60);
    renderer.setRenderTarget(m.rt);
    renderer.render(scene, m.cam);
    renderer.setRenderTarget(null);
    scene.fog.near = fogNear; scene.fog.far = fogFar;
    m.hide.forEach(function (o) { o.visible = true; });
  }
  /* Los letreros/tubos se desvanecen junto con el techo (vista aérea):
     se clona su material para no afectar piezas del tren que lo comparten */
  clutter.forEach(function (m) {
    if (Array.isArray(m.material)) {
      m.material = m.material.map(function (mm) { var c = mm.clone(); return fadeMat(c, stationRoofFade); });
    } else {
      m.material = fadeMat(m.material.clone(), stationRoofFade);
    }
  });

  /* Tramos vecinos: copias del tramo a ±TILE_LEN (comparten geometría y
     materiales, así que casi no cuestan memoria) y una ciudad procedural
     distinta por tramo que se recorre como «salto de rana» al avanzar. */
  mergeStatic(worldTile);
  var tileCopies = [-1, 1].map(function (k) {
    var c = worldTile.clone(); c.position.x = k * TILE_LEN; scene.add(c);
    return c;
  });
  var cityIndex = 0, cityTiles = [-1, 0, 1].map(function (k) {
    var c = buildCityTile(k); c.position.x = k * TILE_LEN; scene.add(c);
    return c;
  });
  function shiftCity(dir) {   /* dir = +1: el tren pasó al tramo siguiente */
    cityIndex += dir;
    var old = dir > 0 ? cityTiles.shift() : cityTiles.pop();
    scene.remove(old); old.children.forEach(function (m) { m.geometry.dispose(); });
    var fresh = buildCityTile(cityIndex + dir); scene.add(fresh);
    if (dir > 0) cityTiles.push(fresh); else cityTiles.unshift(fresh);
    cityTiles.forEach(function (c, i) { c.position.x = (i - 1) * TILE_LEN; });
  }
  /* ---------- Cámara orbital propia (sin addons, compatible file://) ---------- */
  var VIEWS = {
    anden:  { pos: [24, 12.6, 15],   target: [-3, 8.1, -1.2] },
    frente: { pos: [24.5, 9.3, 6.5], target: [15.6, 8.35, -1.2] },
    lateral:{ pos: [0.5, 9.2, -11.5], target: [0, 8.15, -1.35] },
    trasera:{ pos: [-25, 9.4, 6.0],  target: [-15.6, 8.4, -1.2] },
    aerea:  { pos: [-26, 30, 30],    target: [0, 6.5, 0] },
    cenital:{ pos: [1.5, 35, 3.0],   target: [0, 7.6, -0.6] },
    calle:  { pos: [-14, 2.2, 19],   target: [4, 8.5, -1] },
    interior: { follow: true },   /* se calcula contra el tren (viaja con él) */
    cabina:   { follow: true },
    caminar:  { walk: true },
    /* Línea 2 (subterránea) */
    andenL2:  { pos: [AX + 6.2, N5_Y + 3.6, ZC + 19], target: [AX - 1.5, N5_Y + 1.3, ZC - 4], subte: true },
    viajarL2: { l2ride: true },
    corte:    { pos: [AX + 36, 26, ZC + 48], target: [AX - 8, -3, ZC - 4], corte: true }
  };
  /* la línea elevada subió LIFT metros: las vistas de arriba también */
  ['anden', 'frente', 'lateral', 'trasera', 'aerea', 'cenital'].forEach(function (k) {
    VIEWS[k].pos[1] += LIFT; VIEWS[k].target[1] += LIFT;
  });
  VIEWS.calle.target[1] += LIFT;
  var camTarget = new THREE.Vector3();
  var sph = { radius: 30, theta: 0.6, phi: 1.1 }; /* theta acimut, phi polar */
  var currentView = 'anden';   /* vista activa (para la URL compartible) */
  var followTrain = false;
  var manualPending = false; /* la vista Cabina activa el modo conductor */
  /* Primera persona: caminando (walk) y mirada libre dentro de cabina */
  var walk = { active: false, pos: new THREE.Vector3(3.85, 9.25, 3.1), yaw: Math.PI, pitch: -0.04, fwdBtn: false };
  var cabLook = { yaw: 0, pitch: -0.06 };
  /* En Cabina puedes voltear hasta atrás y ver el salón por la ventana del
     mamparo (la gente en un frenado); en Viajar L2 la mirada va al frente */
  function cabYawLim() { return manualPending ? Math.PI : 1.25; }
  /* Inercia a bordo (trenes 1 y 2): frenar o acelerar empuja a quien va
     dentro. Un resorte amortiguado sigue el cambio de aceleración (el
     tirón) y un poco de la sostenida: al entrar la emergencia todos se van
     hacia adelante y al detenerse hay un rebote hacia atrás.
     x = empuje en m/s² hacia +X del mundo. */
  var inertia = { 1: { v: null, slow: 0, x: 0, vx: 0, g: 1 }, 2: { v: null, slow: 0, x: 0, vx: 0, g: 1 } };
  /* gain: qué tan fuerte se siente (la emergencia lo baja según la
     velocidad); baja al instante y vuelve a 1 con suavidad, sin tirón */
  function stepInertia(I, vel, dt, gain) {
    var g = gain === undefined ? 1 : gain;
    I.g = g < I.g ? g : I.g + (g - I.g) * (1 - Math.exp(-dt / 1.2));
    if (I.v === null || Math.abs(vel - I.v) > 2) { I.v = vel; return; }   /* salto: cambio de modo o reciclaje */
    var acc = THREE.MathUtils.clamp((vel - I.v) / dt, -2.5, 2.5); I.v = vel;
    I.slow += (acc - I.slow) * (1 - Math.exp(-dt / 1.1));
    var tgt = (-(acc - I.slow) - 0.35 * acc) * I.g, w = 6.5, zeta = 0.32;
    I.vx += (w * w * (tgt - I.x) - 2 * zeta * w * I.vx) * dt;
    I.x += I.vx * dt;
  }
  var keysAll = {};
  var keySmooth = { x: 0, y: 0 };   /* flechas: ejes suavizados (arranca/frena suave) */
  function inFormField(el) {
    return !!(el && (el.tagName === 'INPUT' || el.tagName === 'SELECT' || el.tagName === 'TEXTAREA'));
  }
  window.addEventListener('keydown', function (e) {
    keysAll[e.code] = true;
    /* Las flechas mueven la vista (sin desplazar la página); en selectores
       y controles siguen haciendo lo suyo (cambiar escenario, opacidad…) */
    if (e.code.indexOf('Arrow') === 0 && !inFormField(e.target)) e.preventDefault();
  });
  window.addEventListener('keyup', function (e) { keysAll[e.code] = false; });

  function applyView(name) {
    var v = VIEWS[name]; if (!v) return;
    currentView = name;
    showViewLoader('Cargando vista ' + viewLabelOf(name) + '…');
    var prevWalk = walk.active, prevCab = manualPending;
    /* Cambio limpio: se sueltan teclas y botones sostenidos de la vista
       anterior y la mirada de cabina/caminar empieza al frente */
    Object.keys(keysAll).forEach(function (k) { keysAll[k] = false; });
    keySmooth.x = 0; keySmooth.y = 0;   /* sin arrastre de flechas al cambiar de vista */
    if (typeof keysDown !== 'undefined') Object.keys(keysDown).forEach(function (k) { keysDown[k] = false; });
    if (typeof drive !== 'undefined') { drive.throttle = 0; drive.brake = false; }
    walk.fwdBtn = false;
    document.querySelectorAll('.drive-btns .held').forEach(function (b) { b.classList.remove('held'); });
    followTrain = !!v.follow;
    manualPending = (name === 'cabina');
    walk.active = !!v.walk;
    var prevRide = l2Ride;
    zone.corte = !!v.corte; subteOrbit = !!v.subte; l2Ride = !!v.l2ride;
    if (l2Ride && !prevRide) { cabLook.yaw = 0; cabLook.pitch = -0.06; }
    var wp = document.getElementById('walkPanel');
    if (wp) wp.hidden = !walk.active;
    var dp = document.getElementById('drivePanel');
    if (dp) dp.hidden = !manualPending;
    /* Primera persona: fuera ayuda y ajustes para no tapar la vista */
    var fp = walk.active || manualPending || l2Ride;
    document.body.classList.toggle('fp', fp);
    var sp = document.getElementById('settingsPanel');
    if (fp && sp) sp.open = false;
    if (prevWalk && !walk.active && walk.seat) {   /* sales de Caminar: se libera el asiento */
      if (walk.seat.c.slot.occ === PLAYER_OCC) walk.seat.c.slot.occ = null;
      walk.seat = null;
    }
    if (walk.active && !prevWalk) {   /* entra caminando al andén, mirando a la vía */
      walk.pos.set(3.85, PLAT_Y + EYE_H, 3.1); walk.ground = PLAT_Y;
      walk.yaw = Math.PI; walk.pitch = -0.04; walk.inTrain = null;
    }
    if (manualPending && !prevCab) { cabLook.yaw = 0; cabLook.pitch = -0.06; }
    if (walk.active || l2Ride) { updateCamera(); markViewBtn(name); return; }
    if (name === 'interior') {
      var tx = (typeof sim !== 'undefined' && sim) ? sim.trainX : 0;
      v = { pos: [tx + 3.4, BODY_Y + 1.72, TRAIN_Z + 0.18],
            target: [tx + 11.2, BODY_Y + 1.35, TRAIN_Z] };
    } else if (name === 'cabina') {
      var tx2 = (typeof sim !== 'undefined' && sim) ? sim.trainX : 0;
      v = { pos: [tx2 + 14.55, BODY_Y + 1.95, TRAIN_Z + 0.25],
            target: [tx2 + 23, BODY_Y + 1.05, TRAIN_Z] };
    }
    camTarget.set(v.target[0], v.target[1], v.target[2]);
    var dx = v.pos[0] - v.target[0], dy = v.pos[1] - v.target[1], dz = v.pos[2] - v.target[2];
    sph.radius = Math.sqrt(dx * dx + dy * dy + dz * dz);
    sph.phi = Math.acos(THREE.MathUtils.clamp(dy / sph.radius, -1, 1));
    sph.theta = Math.atan2(dx, dz);
    updateCamera();
    markViewBtn(name);
  }
  function markViewBtn(name) {
    var btns = document.querySelectorAll('[data-view]');
    for (var i = 0; i < btns.length; i++) {
      btns[i].classList.toggle('active', btns[i].getAttribute('data-view') === name);
    }
    maybeSyncUrl(true);   /* al tocar una vista, la URL se actualiza al momento */
  }
  function updateCamera() {
    if (walk.active) {
      camera.position.copy(walk.pos);
      var wd = new THREE.Vector3(Math.sin(walk.yaw) * Math.cos(walk.pitch),
        Math.sin(walk.pitch), Math.cos(walk.yaw) * Math.cos(walk.pitch));
      camera.lookAt(walk.pos.clone().add(wd));
      return;
    }
    if (manualPending && typeof sim !== 'undefined' && sim) {
      /* Cabina en primera persona: fijo en el asiento, solo gira la mirada.
         La inercia lleva la cabeza adelante y un poco abajo al frenar (atrás
         al arrancar); en emergencia además vibra (antideslizamiento). */
      var hx = inertia[1].x, pt = cabLook.pitch - hx * 0.05 * Math.cos(cabLook.yaw);   /* volteado: la cabeza va hacia atrás */
      if (typeof drive !== 'undefined' && drive.emerg && Math.abs(drive.speed) > 0.3) {
        var et = clock.elapsedTime, ek = Math.min(1, Math.abs(drive.speed) / 16.7);   /* la vibración crece con la velocidad (plena a 60 km/h) */
        pt += (Math.sin(et * 47) * 0.0035 + Math.sin(et * 29.3) * 0.0025) * ek;
      }
      camera.position.set(sim.trainX + 14.55 + hx * 0.05, BODY_Y + 1.98 - Math.abs(hx) * 0.01, TRAIN_Z - 0.3);
      var cd = new THREE.Vector3(Math.cos(cabLook.yaw) * Math.cos(pt),
        Math.sin(pt), -Math.sin(cabLook.yaw) * Math.cos(pt));
      camera.lookAt(camera.position.clone().add(cd));
      return;
    }
    if (l2Ride) {
      /* Viajar en la Línea 2: en la cabina del tren a Sendero, solo gira la mirada */
      var S3 = l2Sims[0];
      camera.position.set(S3.g.position.x + 14.55, BODY_Y + 1.98, 3 - 0.3);
      l2Rig.localToWorld(camera.position);
      var ld = new THREE.Vector3(Math.cos(cabLook.yaw) * Math.cos(cabLook.pitch),
        Math.sin(cabLook.pitch), -Math.sin(cabLook.yaw) * Math.cos(cabLook.pitch)).applyQuaternion(l2Rig.quaternion);
      camera.lookAt(camera.position.clone().add(ld));
      return;
    }
    sph.phi = THREE.MathUtils.clamp(sph.phi, 0.05, Math.PI * (subteOrbit ? 0.62 : 0.52));
    sph.radius = THREE.MathUtils.clamp(sph.radius, 1.2, subteOrbit ? 26 : 110);
    var sp = Math.sin(sph.phi);
    camera.position.set(
      camTarget.x + sph.radius * sp * Math.sin(sph.theta),
      camTarget.y + sph.radius * Math.cos(sph.phi),
      camTarget.z + sph.radius * sp * Math.cos(sph.theta)
    );
    if (subteOrbit) {   /* la cámara no sale del cajón de la estación */
      camera.position.x = THREE.MathUtils.clamp(camera.position.x, WX0 + 0.4, WX1 - 0.4);
      camera.position.y = THREE.MathUtils.clamp(camera.position.y, N5_Y + 0.4, N5_TOP - 0.3);
      camera.position.z = THREE.MathUtils.clamp(camera.position.z, ZC - L2_HALF + 0.4, ZC + L2_HALF - 0.4);
    } else if (camera.position.y < 0.7) camera.position.y = 0.7;
    camera.lookAt(camTarget);
  }

  /* Flechas del teclado: mueven la vista suavemente y varias a la vez
     (diagonal incluida). En vistas orbitales giran igual que arrastrar;
     con Shift desplazan el objetivo (como arrastrar con botón derecho).
     En Cabina/Viajar L2 mueven la mirada; ojo: en Cabina ↑/↓ siguen
     siendo tracción/reversa del conductor, así que ahí solo ←/→ miran.
     En Caminar las flechas ya caminan (no se toca nada). Los ejes se
     suavizan (arranque y frenado graduales, sin saltos por repetición). */
  function updateArrowKeys(dt) {
    if (walk.active) { keySmooth.x = 0; keySmooth.y = 0; return; }
    var blocked = inFormField(document.activeElement);
    var ix = blocked ? 0 : (keysAll.ArrowRight ? 1 : 0) - (keysAll.ArrowLeft ? 1 : 0);
    var iy = blocked ? 0 : (keysAll.ArrowDown ? 1 : 0) - (keysAll.ArrowUp ? 1 : 0);
    var il = Math.hypot(ix, iy);
    if (il > 1) { ix /= il; iy /= il; }   /* diagonal a la misma velocidad */
    var ease = Math.min(1, dt * 7);
    keySmooth.x += (ix - keySmooth.x) * ease;
    keySmooth.y += (iy - keySmooth.y) * ease;
    if (Math.abs(keySmooth.x) < 0.002 && Math.abs(keySmooth.y) < 0.002) {
      if (!ix && !iy) { keySmooth.x = 0; keySmooth.y = 0; }
      return;
    }
    if (manualPending || l2Ride) {
      cabLook.yaw = THREE.MathUtils.clamp(cabLook.yaw - keySmooth.x * 1.5 * dt, -cabYawLim(), cabYawLim());
      if (!manualPending) {   /* en Cabina ↑/↓ son del conductor; en L2 miran */
        cabLook.pitch = THREE.MathUtils.clamp(cabLook.pitch - keySmooth.y * 1.2 * dt, -0.55, 0.45);
      }
      updateCamera();
      return;
    }
    if (keysAll.ShiftLeft || keysAll.ShiftRight) {
      var right = new THREE.Vector3().setFromMatrixColumn(camera.matrix, 0);
      var up = new THREE.Vector3().setFromMatrixColumn(camera.matrix, 1);
      var pk = sph.radius * 0.9 * dt;
      camTarget.addScaledVector(right, keySmooth.x * pk).addScaledVector(up, -keySmooth.y * pk);
      camTarget.y = subteOrbit ? THREE.MathUtils.clamp(camTarget.y, N5_Y + 0.3, N5_TOP - 0.5)
        : THREE.MathUtils.clamp(camTarget.y, zone.corte ? -11 : 0.5, 25 + LIFT);
    } else {
      sph.theta -= keySmooth.x * 1.35 * dt;   /* mismo sentido que arrastrar */
      sph.phi -= keySmooth.y * 1.1 * dt;
    }
    updateCamera();
  }

  /* ---------- URL compartible: vista + cámara + ajustes ----------
     La barra de direcciones siempre refleja lo que estás viendo:
       ?vista=corte&escenario=noche&estacion=auto&estacionOpacidad=12
        &tren=visible&trenOpacidad=7&objetivo=x,y,z&distancia=42
        &acimut=35&polar=62
     En Caminar se guarda pos=x,y,z más yaw/pitch; a bordo de un tren pos
     va relativa al tren y abordo=1|2 (Línea 1) o 3|4 (Línea 2), porque el
     tren no estará en el mismo punto al abrir el enlace. En Cabina/Viajar
     L2, yaw/pitch de la mirada. Al abrir ese enlace se restaura todo.
     Se escribe con replaceState (sin recargar ni ensuciar el historial),
     a lo más cada 600 ms mientras te mueves, y al instante al tocar
     una vista o un ajuste. */
  var lastUrlStr = '', lastUrlWrite = 0, urlRestoring = false;
  function urlNum(n, d) { return String(Math.round(n * Math.pow(10, d)) / Math.pow(10, d)); }
  function urlDeg(rad) { return urlNum(rad * 180 / Math.PI, 1); }
  function selVal(id) { var el = document.getElementById(id); return el ? el.value : null; }
  function buildUrlParams() {
    var q = new URLSearchParams();
    q.set('vista', currentView);
    var esc = selVal('scenarioSel'); if (esc) q.set('escenario', esc);
    var em = selVal('stationRoofMode'); if (em) q.set('estacion', em);
    var eo = selVal('stationRoofMin'); if (eo !== null) q.set('estacionOpacidad', eo);
    var tm = selVal('trainRoofMode'); if (tm) q.set('tren', tm);
    var to = selVal('trainRoofMin'); if (to !== null) q.set('trenOpacidad', to);
    if (walk.active) {
      var wp = [walk.pos.x, walk.pos.y, walk.pos.z], it = walk.inTrain;
      if (it && it.l2) {
        var lp = l2Local(walk.pos.x, walk.pos.z);
        wp = [lp.x - it.S.g.position.x, walk.pos.y, lp.z]; q.set('abordo', it.id);
      } else if (it) {
        var tid = it.z === TRAIN_Z ? 1 : 2;
        wp[0] -= trainOf(tid).position.x; q.set('abordo', tid);
      }
      q.set('pos', wp.map(function (n) { return urlNum(n, 2); }).join(','));
      q.set('yaw', urlDeg(walk.yaw)); q.set('pitch', urlDeg(walk.pitch));
    } else if (manualPending || l2Ride) {
      q.set('yaw', urlDeg(cabLook.yaw)); q.set('pitch', urlDeg(cabLook.pitch));
    } else {
      /* En Interior la cámara viaja con el tren: solo ángulos/distancia,
         el objetivo se recalcula contra el tren al abrir el enlace. */
      if (!followTrain) {
        q.set('objetivo', [camTarget.x, camTarget.y, camTarget.z].map(function (n) { return urlNum(n, 2); }).join(','));
      }
      q.set('distancia', urlNum(sph.radius, 1));
      q.set('acimut', urlDeg(sph.theta));
      q.set('polar', urlDeg(sph.phi));
    }
    return q.toString().replace(/%2C/g, ',');   /* comas legibles al copiar */
  }
  function maybeSyncUrl(force) {
    if (urlRestoring) return;
    var s = buildUrlParams(); if (s === lastUrlStr) return;
    var now = performance.now();
    if (!force && now - lastUrlWrite < 600) return;
    lastUrlStr = s; lastUrlWrite = now;
    try { history.replaceState(null, '', '?' + s); }
    catch (e) { try { history.replaceState(null, '', '#' + s); } catch (e2) { /* file:// muy estricto */ } }
  }
  function urlVec(name) {
    var v = URLP.get(name); if (!v) return null;
    var p = v.split(',').map(Number);
    return p.length === 3 && p.every(function (n) { return isFinite(n); }) ? p : null;
  }
  function urlFloat(name) {
    var v = parseFloat(URLP.get(name));
    return isFinite(v) ? v : null;
  }
  function setSel(id, value, ev) {
    var el = document.getElementById(id);
    if (!el || value === null || value === undefined) return;
    if (el.tagName === 'SELECT' && ![].some.call(el.options, function (o) { return o.value === value; })) return;
    el.value = value;
    el.dispatchEvent(new Event(ev || 'change', { bubbles: true }));
  }
  /* Posición de un enlace en Caminar: ya a la altura de su piso (sin caer
     desde la altura guardada). Si queda dentro de un tren (enlace viejo,
     sin abordo) te sube a ese tren; si ahí no hay piso transitable (las
     vías del viaducto, fuera del área), al andén más cercano. */
  function placeWalkSafe(x, y, z) {
    var floor = y - EYE_H;
    if (Math.abs(floor - (BODY_Y + FLOOR_DY)) < 0.3) {
      var id = Math.abs(z - TRAIN_Z) <= 1.3 ? 1 : (Math.abs(z - TRACK_B_Z) <= 1.3 ? 2 : 0);
      if (id) { walk.aboard = { id: id, rel: Math.abs(x) <= 13 ? x : Math.sign(x) * 8.05, z: z }; return; }
    }
    if (Math.abs(floor - L2_FLOOR) < 0.3) {
      var lp = l2Local(x, z), lid = Math.abs(lp.z - 3) <= 1.3 ? 3 : (Math.abs(lp.z + 3) <= 1.3 ? 4 : 0);
      if (lid) { walk.aboard = { id: lid, rel: Math.sign(lp.x || 1) * 8.05, z: lp.z }; return; }
    }
    var g = groundAt(x, z, floor);
    var inArea = x >= -75 && x <= 90 && z >= -40 && z <= ZC + L2_HALF + 4;
    if (g === null || Math.abs(g - RAIL_Y) < 0.01 || Math.abs(g - floor) > 0.6 || !inArea) {
      var B = z < (TRAIN_Z + TRACK_B_Z) / 2;
      x = THREE.MathUtils.clamp(x, -22, 22); z = B ? -7.3 : 3.1; g = PLAT_Y;
    }
    walk.pos.set(x, g + EYE_H, z); walk.ground = g;
  }
  /* Subirte al tren del enlace en el primer cuadro (ya con los trenes en
     su lugar): el mismo punto del vagón, en el pasillo, y sigues viajando */
  function boardFromUrl(b) {
    var rel = THREE.MathUtils.clamp(Math.abs(b.rel), 0.8, 12.5) * (b.rel < 0 ? -1 : 1);
    if (b.id >= 3) {
      var S = l2Sims.filter(function (s) { return s.id === b.id; })[0];
      if (!S) return;
      var lz = THREE.MathUtils.clamp(b.z, S.l2t.z - 1, S.l2t.z + 1), w = l2World(S.g.position.x + rel, lz);
      walk.ground = L2_FLOOR; walk.pos.set(w.x, L2_FLOOR + EYE_H, w.z);
      walk.inTrain = l2TrainAt(w.x, w.z);
    } else {
      var tz = b.id === 1 ? TRAIN_Z : TRACK_B_Z, z = THREE.MathUtils.clamp(b.z, tz - 1, tz + 1);
      walk.ground = BODY_Y + FLOOR_DY;
      walk.pos.set(trainOf(b.id).position.x + rel, walk.ground + EYE_H, z);
      walk.inTrain = trainAtWalk(walk.pos.x, z);
    }
  }
  function restoreFromUrl() {
    urlRestoring = true;
    /* Ajustes: se fijan en los controles y sus propios eventos los aplican */
    setSel('stationRoofMode', URLP.get('estacion'));
    setSel('stationRoofMin', URLP.get('estacionOpacidad'), 'input');
    setSel('trainRoofMode', URLP.get('tren'));
    setSel('trainRoofMin', URLP.get('trenOpacidad'), 'input');
    var sEl = document.getElementById('scenarioSel');   /* el escenario se aplica al arrancar */
    if (sEl && SCENARIOS[URLP.get('escenario')]) sEl.value = URLP.get('escenario');
    var vista = VIEWS[URLP.get('vista')] ? URLP.get('vista') : 'anden';
    applyView(vista);
    if (walk.active) {
      var pos = urlVec('pos'), ab = parseInt(URLP.get('abordo'), 10);
      if (pos) {
        walk.inTrain = null; walk.seat = null;
        if (ab >= 1 && ab <= 4) walk.aboard = { id: ab, rel: pos[0], z: pos[2] };
        else placeWalkSafe(pos[0], pos[1], pos[2]);
      }
      var wy = urlFloat('yaw'), wp2 = urlFloat('pitch');
      if (wy !== null) walk.yaw = wy * Math.PI / 180;
      if (wp2 !== null) walk.pitch = wp2 * Math.PI / 180;
      updateCamera();
    } else if (manualPending || l2Ride) {
      var cy = urlFloat('yaw'), cp = urlFloat('pitch');
      if (cy !== null) cabLook.yaw = cy * Math.PI / 180;
      if (cp !== null) cabLook.pitch = cp * Math.PI / 180;
      updateCamera();
    } else {
      var obj = urlVec('objetivo');
      if (obj && !followTrain) camTarget.set(obj[0], obj[1], obj[2]);
      var rr = urlFloat('distancia'), th = urlFloat('acimut'), ph = urlFloat('polar');
      if (rr !== null) sph.radius = rr;
      if (th !== null) sph.theta = th * Math.PI / 180;
      if (ph !== null) sph.phi = ph * Math.PI / 180;
      if (obj || rr !== null || th !== null || ph !== null) updateCamera();
    }
    urlRestoring = false;
    lastUrlStr = ''; maybeSyncUrl(true);
  }

  var pointers = {}, pinchDist = 0, panning = false;
  canvas.addEventListener('pointerdown', function (e) {
    canvas.setPointerCapture(e.pointerId);
    pointers[e.pointerId] = { x: e.clientX, y: e.clientY };
    panning = (e.button === 2 || e.button === 1);
    pinchDist = 0;
  });
  canvas.addEventListener('pointermove', function (e) {
    var p = pointers[e.pointerId]; if (!p) return;
    var dx = e.clientX - p.x, dy = e.clientY - p.y;
    p.x = e.clientX; p.y = e.clientY;
    var ids = Object.keys(pointers);
    if (walk.active && ids.length === 1) {
      /* como en un juego en primera persona: arrastras a la derecha y miras
         a la derecha, arrastras hacia arriba y miras arriba */
      walk.yaw -= dx * 0.0042;
      walk.pitch = THREE.MathUtils.clamp(walk.pitch - dy * 0.0042, -1.1, 1.1);
    } else if ((manualPending || l2Ride) && ids.length === 1) {
      cabLook.yaw = THREE.MathUtils.clamp(cabLook.yaw - dx * 0.0042, -cabYawLim(), cabYawLim());
      cabLook.pitch = THREE.MathUtils.clamp(cabLook.pitch - dy * 0.0042, -0.55, 0.45);
    } else if (ids.length === 2) {
      var a = pointers[ids[0]], b = pointers[ids[1]];
      var d = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinchDist) sph.radius *= pinchDist / d;
      pinchDist = d;
    } else if (panning) {
      var right = new THREE.Vector3().setFromMatrixColumn(camera.matrix, 0);
      var up = new THREE.Vector3().setFromMatrixColumn(camera.matrix, 1);
      var k = sph.radius * 0.0016;
      camTarget.addScaledVector(right, -dx * k).addScaledVector(up, dy * k);
      camTarget.y = subteOrbit ? THREE.MathUtils.clamp(camTarget.y, N5_Y + 0.3, N5_TOP - 0.5)
        : THREE.MathUtils.clamp(camTarget.y, zone.corte ? -11 : 0.5, 25 + LIFT);
    } else {
      sph.theta -= dx * 0.005; sph.phi -= dy * 0.005;
    }
    updateCamera();
  });
  function endPointer(e) { delete pointers[e.pointerId]; pinchDist = 0; }
  canvas.addEventListener('pointerup', endPointer);
  canvas.addEventListener('pointercancel', endPointer);
  canvas.addEventListener('contextmenu', function (e) { e.preventDefault(); });
  canvas.addEventListener('wheel', function (e) {
    e.preventDefault();
    if (walk.active || manualPending || l2Ride) return;   /* en primera persona no hay zoom orbital */
    sph.radius *= (e.deltaY > 0 ? 1.1 : 0.9); updateCamera();
  }, { passive: false });

  /* Caminar en primera persona: WASD/flechas, Shift corre, arrastra = mirar.
     No se puede bajar a las vías: la única forma de cruzar el borde del
     andén es por una puerta abierta, y adentro viajas con el tren. */
  var DOOR_U = [-12.25, -3.85, 3.85, 12.25];
  function trainAtWalk(x, z) {
    /* solo a la altura del andén elevado: abajo (N2, calle) se pasa por debajo */
    if (walk.ground !== undefined && Math.abs(walk.ground - PLAT_Y) > 1.5) return null;
    var list = [{ tx: train.position.x, z: TRAIN_Z, door: sim.door, side: 1 },
                { tx: train2.position.x, z: TRACK_B_Z, door: sim2.door, side: -1 }];
    for (var i = 0; i < list.length; i++) {
      var t = list[i];
      /* hasta la orilla del andén (1.46): así no queda un hueco que impida subir */
      if (Math.abs(x - t.tx) <= 15.4 && Math.abs(z - t.z) <= 1.46) return t;
    }
    return null;
  }
  /* Puerta abierta en x y del lado del andén (el otro lado no abre) */
  function atOpenDoor(x, t, z) {
    if (!t || t.door < 0.7) return false;
    if (z !== undefined && (z - t.z) * t.side < 0) return false;
    for (var i = 0; i < DOOR_U.length; i++) {
      if (!doorFacesPlatform(t, i)) continue;
      if (Math.abs(x - (t.tx + DOOR_U[i])) <= 0.55) return true;
    }
    return false;
  }
  /* Línea 1: una puerta abierta fuera del andén no deja bajar (darías a
     las vías); los trenes de la Línea 2 siempre paran en su marca */
  function doorFacesPlatform(t, i) { return t.l2 || Math.abs(t.tx + DOOR_U[i]) <= PLAT_DOOR_LIM; }
  /* Piso bajo (x, z): de las superficies posibles ahí (calle, banqueta,
     viaducto, andenes, N2, edificio de transbordo, distribuidor, andenes
     de la Línea 2, escaleras) la más cercana a la altura actual; así se
     puede pasar bajo el viaducto y cambiar de nivel solo por escalera. */
  function groundAt(x, z, cur) {
    var best = null, bestD = 0, i, f;
    /* pref: la escalera gana al piso que pasa debajo de ella (al pie de
       la escalera se sube por ella, no se sigue de largo por debajo) */
    function cand(y, pref) {
      var dd = Math.abs(y - cur) - (pref || 0);
      if (best === null || dd < bestD) { best = y; bestD = dd; }
    }
    for (i = 0; i < FLOORS.length; i++) {
      f = FLOORS[i];
      if (x >= f[0] && x <= f[1] && z >= f[2] && z <= f[3]) cand(f[4]);
    }
    for (i = 0; i < RAMPS.length; i++) {
      var r = RAMPS[i], al = r.axis === 'x' ? x : z, ac = r.axis === 'x' ? z : x;
      if (ac < r.c0 || ac > r.c1) continue;
      var t = (al - r.a0) / (r.a1 - r.a0);
      if (t >= 0 && t <= 1) cand(r.y0 + (r.y1 - r.y0) * t, 0.3);
    }
    if (Math.abs(x) <= 26 && ((z > 0.25 && z < 4.95) || (z > -8.9 && z < -5.9))) cand(PLAT_Y);
    var deck = Math.abs(x) <= 43 ? [-9.55, 6.85] : [-8.1, 4.9];
    if (z > deck[0] && z < deck[1]) cand(DECK_Y + 0.55);
    cand((z > 14.1 && z < 16.3) || (z > -1.5 && z < 0.7) ? 0.17 : 0);
    return best;
  }
  /* Columnas, torniquetes y bajo-escaleras: estorban a quien camina a esa altura */
  function wallAt(x, z, y) {
    for (var i = 0; i < WALLS.length; i++) {
      var w = WALLS[i];
      if (x >= w[0] && x <= w[1] && z >= w[2] && z <= w[3] && y >= w[4] && y < w[5]) return true;
    }
    return false;
  }
  var EYE_H = 1.49;   /* ojos de una persona de 1.60 m (promedio en México) */
  /* Tu cuerpo al caminar: vive en la capa 1, que la cámara principal no
     dibuja (estás dentro de él) pero las cámaras de los espejos sí; así te
     ves reflejado caminando. */
  function setLayer(o, n) { o.traverse(function (c) { c.layers.set(n); }); }
  var playerBody = makePerson(Object.assign(randomLook(), { scale: heightToScale(1.6), bag: 0.3 }), scene, 'stand');
  setLayer(playerBody, 1); playerBody.visible = false;
  var playerRig = playerBody.userData.rig;
  function updatePlayerBody(dt) {
    playerBody.visible = walk.active;
    if (!walk.active) return;
    if (walk.seat) {   /* sentado (o sentándote / parándote) */
      var c = walk.seat.c, sw = seatWorld(c), fp = frontWorld(c), ph = walk.seat.phase;
      playerBody.position.set(fp.x, sw.floor, fp.z);   /* pies fijos; la cadera baja al asiento */
      playerBody.rotation.y = c.yaw;
      var want = ph === 'up' ? 'stand' : 'sit';
      if (playerRig.pose !== want) setPose(playerRig, want);
      playerRig.moving = false; playerRig.tgt.headX = THREE.MathUtils.clamp(walk.pitch, -0.6, 0.5);
      applyRig(playerRig, dt);
      return;
    }
    if (playerRig.pose !== 'stand') setPose(playerRig, 'stand');
    playerBody.position.set(walk.pos.x, walk.pos.y - EYE_H, walk.pos.z);
    playerBody.rotation.y = walk.yaw + Math.PI;    /* mira hacia donde miras */
    playerRig.moving = (walk.stride || 0) > 0;
    playerRig.running = (walk.stride || 0) > 4 * dt;
    playerRig.phase += (walk.stride || 0) * Math.PI / 0.68;
    playerRig.tgt.headX = THREE.MathUtils.clamp(walk.pitch, -0.6, 0.5);   /* la cabeza sigue tu mirada */
    applyRig(playerRig, dt);
  }
  /* Sentarse en Caminar: te acercas a menos de 35 cm de un asiento libre
     (banca del andén o asiento del vagón) y te sientas con una transición
     suave; adelante (W/↑ o «Avanzar») te paras y das un paso al frente. El
     lugar queda ocupado: nadie más se sienta ahí mientras estés. */
  var SEAT_EYE = 1.12, PLAYER_OCC = { player: true };
  function seatCandidates() {
    var list = [];
    if (walk.inTrain && walk.inTrain.l2) {   /* asientos del tren de la Línea 2 */
      var it = walk.inTrain;
      trainSlots[it.id].forEach(function (s) {
        if (s.type === 'seat') list.push({ slot: s, l2: it.S, z: s.z, yaw: s.yaw + Math.PI / 2, floor: L2_FLOOR,
          frontZ: it.z + s.side * 0.56 });
      });
    } else if (walk.inTrain) {
      var id = walk.inTrain.z === TRAIN_Z ? 1 : 2;
      trainSlots[id].forEach(function (s) {
        if (s.type === 'seat') list.push({ slot: s, train: id, z: s.z, yaw: s.yaw, floor: BODY_Y + FLOOR_DY,
          frontZ: walk.inTrain.z + s.side * 0.56 });
      });
    } else if (Math.abs((walk.ground || 0) - PLAT_Y) < 0.1) {
      [PLAT.A, PLAT.B].forEach(function (P) {
        P.seats.forEach(function (s) {
          list.push({ slot: s, train: 0, x: s.x, z: P.benchZ, yaw: P.face, floor: PLAT_Y, frontZ: P.benchFrontZ });
        });
      });
    }
    return list;
  }
  function seatWorld(c) {
    if (c.l2) { var p = l2World(c.slot.x + c.l2.g.position.x, c.z); return { x: p.x, z: p.z, floor: c.floor }; }
    return { x: c.train ? c.slot.x + trainOf(c.train).position.x : c.x, z: c.z, floor: c.floor };
  }
  function frontWorld(c) {
    var w = seatWorld(c);
    if (c.l2) return { x: AX + c.frontZ, z: w.z, floor: c.floor };
    return { x: w.x, z: c.frontZ, floor: c.floor };
  }
  var walkMsgEl = document.getElementById('walkMsg');
  function walkMsg(t) { if (walkMsgEl && walkMsgEl.textContent !== t) walkMsgEl.textContent = t; }
  function updateSeated(dt, fwIn) {
    var S = walk.seat, c = S.c, sw = seatWorld(c), fp = frontWorld(c);
    var seatEye = new THREE.Vector3(sw.x, sw.floor + SEAT_EYE, sw.z);
    var standEye = new THREE.Vector3(fp.x, fp.floor + EYE_H, fp.z);
    S.t += dt;
    if (S.phase === 'down') {
      S.k = easeInOut(clamp01(S.t / 0.9));
      var from = new THREE.Vector3(sw.x + S.off.x, S.y0, sw.z + S.off.z);
      walk.pos.lerpVectors(from, seatEye, S.k);
      walk.yaw = S.yaw0 + S.dyaw * S.k;
      if (S.t >= 0.9) { S.phase = 'sit'; S.t = 0; }
      walkMsg('Sentándote…');
    } else if (S.phase === 'sit') {
      walk.pos.copy(seatEye);
      walkMsg('Sentado · W / ↑ para pararte');
      if (fwIn && S.t > 0.3) { S.phase = 'up'; S.t = 0; S.k = 0; }
    } else {
      S.k = easeInOut(clamp01(S.t / 0.8));
      walk.pos.lerpVectors(seatEye, standEye, S.k);
      if (S.t >= 0.8) {
        walk.pos.copy(standEye); walk.ground = fp.floor;
        if (c.slot.occ === PLAYER_OCC) c.slot.occ = null;
        walk.lastSeat = c.slot; walk.seat = null;
        walk.sitCooldown = 2;   /* al pararte y seguir de frente no te sientas en el de enfrente */
      }
    }
    walk.stride = 0;
  }
  function trySit(dt) {
    if (walk.sitCooldown > 0) { walk.sitCooldown -= dt; return; }
    if (!walk.stride) return;
    var best = null, bd = 0.35;
    seatCandidates().forEach(function (c) {
      var w = seatWorld(c), d = Math.hypot(w.x - walk.pos.x, w.z - walk.pos.z);
      if (c.slot === walk.lastSeat) { if (d > 0.8) walk.lastSeat = null; return; }
      if (!c.slot.occ && d < bd) { bd = d; best = c; }
    });
    if (!best) return;
    var w = seatWorld(best);
    best.slot.occ = PLAYER_OCC;
    var dyaw = (best.yaw + Math.PI) - walk.yaw;
    dyaw = ((dyaw + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
    walk.seat = { c: best, phase: 'down', t: 0, k: 0, y0: walk.pos.y, yaw0: walk.yaw, dyaw: dyaw,
      off: { x: walk.pos.x - w.x, z: walk.pos.z - w.z } };
  }
  /* No atraviesas a la gente: si tu siguiente paso queda a menos de 45 cm
     de alguien (en el andén o en tu vagón), te recorre por su orilla; así
     sigues avanzando, rodeándolos, sin quedarte atorado. */
  /* Paso dentro/hacia un tren, en coordenadas del tren (x a lo largo del
     tren, z de lado). null: no hay tren de por medio. */
  function trainStep(p, n, find) {
    var inNow = find(p.x, p.z), inNext = find(n.x, n.z);
    if (inNow) {
      /* Adentro: el pasillo llega a 1.12 m del eje; más allá solo por una
         puerta abierta del lado del andén */
      var inside = function (x, z) {
        var lx = x - inNow.tx, lx0 = p.x - inNow.tx;
        if (Math.abs(lx) > 12.75) return false;                       /* mamparo de cabina */
        if (Math.abs(lx) < 0.62 || lx * lx0 < 0) return false;        /* testero entre vagones */
        return Math.abs(z - inNow.z) <= 1.12 || atOpenDoor(x, inNow, z);
      };
      if (inside(n.x, n.z)) return (inNext || atOpenDoor(p.x, inNow, n.z)) ? n : p;
      /* quieres salir y hay una puerta abierta cerca: te acomoda hacia ella */
      if (Math.abs(n.z - inNow.z) > 1.12) {
        var po = doorPull(p.x, inNow, n.z);
        if (po !== null && Math.abs(po) > 0.01) return { x: p.x + THREE.MathUtils.clamp(po, -0.07, 0.07), z: p.z };
      }
      if (inside(n.x, p.z)) return { x: n.x, z: p.z };   /* desliza junto a la pared */
      return p;
    }
    if (inNext) {
      if (atOpenDoor(n.x, inNext, p.z)) return n;
      /* empujas hacia el tren cerca de una puerta abierta: te lleva a ella */
      var pi = doorPull(p.x, inNext, p.z);
      if (pi !== null) return { x: p.x + THREE.MathUtils.clamp(pi, -0.07, 0.07), z: p.z };
      return null;   /* sin puerta: el tren es un muro y resbalas a lo largo de él */
    }
    return null;
  }
  /* Cuánto falta (a lo largo del tren) para la puerta abierta más cercana,
     si está a menos de 1.3 m y del lado del andén; si no, null */
  function doorPull(x, t, z) {
    if (!t || t.door < 0.7 || (z - t.z) * t.side < 0) return null;
    var best = null;
    for (var i = 0; i < DOOR_U.length; i++) {
      if (!doorFacesPlatform(t, i)) continue;
      var d = t.tx + DOOR_U[i] - x;
      if (Math.abs(d) <= 1.3 && (best === null || Math.abs(d) < Math.abs(best))) best = d;
    }
    return best;
  }
  /* Trenes de la Línea 2 en sus coordenadas (solo a la altura de su andén) */
  function l2TrainAtLocal(lx, lz) {
    if (walk.ground !== undefined && Math.abs(walk.ground - N5_Y) > 1.5) return null;
    for (var i = 0; i < l2Sims.length; i++) {
      var t = l2Sims[i].l2t;
      t.tx = l2Sims[i].g.position.x; t.door = l2Sims[i].door;
      if (Math.abs(lx - t.tx) <= 15.4 && Math.abs(lz - t.z) <= 1.46) return t;
    }
    return null;
  }
  function l2TrainAt(x, z) { var p = l2Local(x, z); return l2TrainAtLocal(p.x, p.z); }
  function pushOffPeople(nx, nz) {
    var R = 0.45, list, tid, ox = 0;
    if (walk.inTrain && walk.inTrain.l2) {   /* dentro de un tren de la L2: sus pasajeros */
      tid = 'l2'; list = [];
      l2People.forEach(function (g) {
        if (g.parent !== walk.inTrain.g) return;
        g.getWorldPosition(_l2v);
        list.push({ where: 'l2', g: { position: _l2v.clone() } });
      });
    } else {
      tid = walk.inTrain ? (walk.inTrain.z === TRAIN_Z ? 1 : 2) : 'world';
      ox = tid === 'world' ? 0 : trainOf(tid).position.x;
      /* también la gente de la Línea 2 y del transbordo */
      list = tid === 'world' && walk.ground < 2 ? agents.concat(l2People.filter(function (g) { return g.parent === subte || g.parent === transferGrp; })
        .map(function (g) { return { where: 'world', g: g }; })) : agents;
    }
    for (var it = 0; it < 2; it++) {
      for (var i = 0; i < list.length; i++) {
        var a = list[i];
        if (a.where !== tid) continue;
        var q = a.g.position;
        if (tid === 'world' && Math.abs(q.y - (walk.ground || PLAT_Y)) > 0.8) continue;
        var dx = nx - (q.x + ox), dz = nz - q.z, d = Math.hypot(dx, dz);
        if (d >= R) continue;
        if (d < 1e-4) { dx = walk.pos.x - (q.x + ox); dz = walk.pos.z - q.z; d = Math.hypot(dx, dz) || 1; }
        var ux = dx / d, uz = dz / d;
        /* rodeo: tu paso se convierte en avance por su costado (de frente,
           por tu derecha) */
        var mx = nx - walk.pos.x, mz = nz - walk.pos.z, ml = Math.hypot(mx, mz);
        var tx = -uz, tz = ux, along = tx * mx + tz * mz;
        if (Math.abs(along) < ml * 0.2) { var rgt = mz * ux - mx * uz; if (rgt < 0) { tx = -tx; tz = -tz; } along = ml; }
        else if (along < 0) { tx = -tx; tz = -tz; along = -along; }
        var slide = Math.max(along, ml * 0.7);
        nx = q.x + ox + ux * R + tx * slide; nz = q.z + uz * R + tz * slide;
      }
    }
    return { x: nx, z: nz };
  }
  function updateWalk(dt) {
    if (!walk.active) return;
    if (walk.aboard) { boardFromUrl(walk.aboard); walk.aboard = null; }
    if (walk.seat) {
      updateSeated(dt, keysAll.KeyW || keysAll.ArrowUp || walk.fwdBtn);
      updateCamera();
      return;
    }
    walkMsg(seatCandidates().some(function (c) { var w = seatWorld(c); return !c.slot.occ && Math.hypot(w.x - walk.pos.x, w.z - walk.pos.z) < 1.4; }) ?
      'Asiento libre cerca: acércate para sentarte' : 'WASD camina · Shift corre · arrastra para mirar');
    var sp = (keysAll.ShiftLeft || keysAll.ShiftRight) ? 6 : 3.1;
    var fw = (keysAll.KeyW || keysAll.ArrowUp || walk.fwdBtn ? 1 : 0) - (keysAll.KeyS || keysAll.ArrowDown ? 1 : 0);
    var st = (keysAll.KeyD || keysAll.ArrowRight ? 1 : 0) - (keysAll.KeyA || keysAll.ArrowLeft ? 1 : 0);
    var fx = Math.sin(walk.yaw), fz = Math.cos(walk.yaw);
    /* Derecha al caminar: rotar el frente -90° => (-fz, fx) */
    walk.stride = (fw || st) ? sp * dt : 0;   /* para animar tu cuerpo en el espejo */
    var nx = walk.pos.x + (fx * fw - fz * st) * sp * dt;
    var nz = walk.pos.z + (fz * fw + fx * st) * sp * dt;
    if (fw || st) { var r = pushOffPeople(nx, nz); nx = r.x; nz = r.z; }
    /* En el andén de la Línea 2 todo lo del tren se calcula en sus
       coordenadas (va a lo largo de z); arriba, en las del mundo */
    var onL2 = Math.abs((walk.ground === undefined ? PLAT_Y : walk.ground) - N5_Y) < 1.5;
    var tAt = onL2 ? l2TrainAt : trainAtWalk;
    var res = onL2 ? trainStep(l2Local(walk.pos.x, walk.pos.z), l2Local(nx, nz), l2TrainAtLocal)
      : trainStep({ x: walk.pos.x, z: walk.pos.z }, { x: nx, z: nz }, trainAtWalk);
    if (res && onL2) res = l2World(res.x, res.z);
    if (res) { walk.pos.x = res.x; walk.pos.z = res.z; }
    else {
      /* Sin escalones de más de 45 cm: no se baja a las vías ni se cae del
         andén; a la calle solo por la escalera. Desliza por el borde. */
      var gNow = walk.ground === undefined ? PLAT_Y : walk.ground;
      var canGo = function (x, z) {
        return Math.abs(groundAt(x, z, gNow) - gNow) <= 0.45 && !tAt(x, z) && !wallAt(x, z, gNow);
      };
      if (canGo(nx, nz)) { walk.pos.x = nx; walk.pos.z = nz; }
      else if (canGo(nx, walk.pos.z)) walk.pos.x = nx;
      else if (canGo(walk.pos.x, nz)) walk.pos.z = nz;
    }
    if (!tAt(walk.pos.x, walk.pos.z)) {   /* adentro del tren viajas con él */
      walk.pos.x = THREE.MathUtils.clamp(walk.pos.x, -75, 90);
      walk.pos.z = THREE.MathUtils.clamp(walk.pos.z, -40, ZC + L2_HALF + 4);
    }
    walk.inTrain = tAt(walk.pos.x, walk.pos.z);
    var gy = walk.inTrain ? (walk.inTrain.l2 ? L2_FLOOR : BODY_Y + FLOOR_DY) :
      groundAt(walk.pos.x, walk.pos.z, walk.ground === undefined ? PLAT_Y : walk.ground);
    walk.ground = gy;
    walk.pos.y += ((gy + EYE_H) - walk.pos.y) * Math.min(1, dt * 9);
    trySit(dt);
    updateCamera();
  }

  /* Caminar: «Ir a…» lleva directo a cada nivel del transbordo */
  var WALK_GOTO = {
    n1a: [3.85, PLAT_Y, 3.1, Math.PI], n1b: [0, PLAT_Y, -7.6, 0],
    n2: [0, N2_Y, 3.0, Math.PI / 2], calle: [4, 0.17, 15.4, Math.PI],
    n3: [36, 0.6, 24, Math.PI / 2], n4: [42, N4_Y, 19, Math.PI],
    n5z: [34.7, N5_Y, ZC + 2, -Math.PI / 2], n5s: [49.3, N5_Y, ZC + 2, Math.PI / 2]
  };
  var walkGotoEl = document.getElementById('walkGoto');
  if (walkGotoEl) walkGotoEl.addEventListener('change', function () {
    var g = WALK_GOTO[walkGotoEl.value];
    var destino = walkGotoEl.selectedIndex >= 0 ? walkGotoEl.options[walkGotoEl.selectedIndex].text : '';
    walkGotoEl.value = ''; walkGotoEl.blur();   /* las flechas vuelven a caminar */
    if (!g || !walk.active) return;
    showViewLoader('Yendo a ' + destino + '…');   /* el salto de nivel también traba un cuadro */
    if (walk.seat) { if (walk.seat.c.slot.occ === PLAYER_OCC) walk.seat.c.slot.occ = null; walk.seat = null; }
    walk.pos.set(g[0], g[1] + EYE_H, g[2]); walk.ground = g[1]; walk.inTrain = null;
    walk.yaw = g[3]; walk.pitch = -0.04;
    updateCamera();
  });

  /* Los paneles de Cabina/Caminar van justo arriba de la barra de vistas
     (que puede ocupar dos renglones en pantallas angostas) */
  var viewsBar = document.querySelector('.views');
  function placePanels() {
    if (viewsBar) document.documentElement.style.setProperty('--views-h', viewsBar.offsetHeight + 'px');
  }
  window.addEventListener('resize', placePanels); placePanels();

  var viewBtns = document.querySelectorAll('[data-view]');
  for (var vi = 0; vi < viewBtns.length; vi++) {
    viewBtns[vi].addEventListener('click', function () {
      applyView(this.getAttribute('data-view'));
    });
  }

  /* ---------- Techos transparentes: configuración + modo Auto ----------
     Auto: el techo se desvanece al acercar la cámara o al ver desde arriba
     (y el del tren también con la cámara dentro). Manual: Visible /
     Transparente (usa el control de opacidad) / Oculto. */
  function wireRoof(modeId, minId, labelId, group) {
    var modeEl = document.getElementById(modeId);
    var minEl = document.getElementById(minId);
    var labelEl = document.getElementById(labelId);
    if (!modeEl || !minEl) return;
    group.mode = modeEl.value;   /* el modo inicial es el que trae el selector */
    modeEl.addEventListener('change', function () { group.mode = modeEl.value; maybeSyncUrl(true); });
    function syncMin() {
      group.min = minEl.value / 100;
      if (labelEl) labelEl.textContent = minEl.value + ' %';
      maybeSyncUrl(false);
    }
    minEl.addEventListener('input', syncMin);
    minEl.addEventListener('change', function () { maybeSyncUrl(true); });   /* al soltar, URL exacta */
    syncMin();
  }
  wireRoof('stationRoofMode', 'stationRoofMin', 'stationRoofVal', stationRoofFade);
  wireRoof('trainRoofMode', 'trainRoofMin', 'trainRoofVal', trainRoofFade);
  var scenarioSelEl = document.getElementById('scenarioSel');
  if (scenarioSelEl) scenarioSelEl.addEventListener('change', function () { setScenario(scenarioSelEl.value); maybeSyncUrl(true); });
  var btnScenRnd = document.getElementById('btnScenarioRandom');
  if (btnScenRnd) btnScenRnd.addEventListener('click', function () {
    var names = Object.keys(SCENARIOS);
    setScenario(names[Math.floor(Math.random() * names.length)]);
    maybeSyncUrl(true);
  });
  var btnWalkFwd = document.getElementById('btnWalkFwd');
  if (btnWalkFwd) {
    btnWalkFwd.addEventListener('pointerdown', function (e) { e.preventDefault(); walk.fwdBtn = true; });
    ['pointerup', 'pointerleave', 'pointercancel'].forEach(function (ev) {
      btnWalkFwd.addEventListener(ev, function () { walk.fwdBtn = false; });
    });
  }

  function applyFade(group, dt, instant) {
    group.current += (group.target - group.current) * (instant ? 1 : 1 - Math.exp(-dt * 5));
    if (Math.abs(group.target - group.current) < 0.004) group.current = group.target;
    for (var i = 0; i < group.mats.length; i++) {
      var m = group.mats[i];
      var base = m.userData.fadeBaseOpacity !== undefined ? m.userData.fadeBaseOpacity : 1;
      m.opacity = base * group.current;
      /* Los laterales descartan ventanas/puertas con alphaTest: se escala
         igual para que se desvanezcan en vez de desaparecer de golpe. */
      if (m.userData.fadeBaseAlphaTest) m.alphaTest = m.userData.fadeBaseAlphaTest * group.current;
      m.depthWrite = group.current > 0.95;
      m.visible = group.current > 0.015;
    }
  }
  function updateRoofs(dt) {
    var cp = camera.position;
    /* En primera persona (Caminar, Cabina) nada se desvanece: paredes y
       techos de trenes y estación siempre completos. */
    var firstPerson = walk.active || manualPending || l2Ride;
    if (firstPerson || stationRoofFade.mode === 'visible') stationRoofFade.target = 1;
    else if (stationRoofFade.mode === 'oculto') stationRoofFade.target = 0;
    else if (stationRoofFade.mode === 'transparente') stationRoofFade.target = stationRoofFade.min;
    else {
      var distSt = cp.distanceTo(new THREE.Vector3(0, PLAT_Y + 2, 0.5));
      var fSt = Math.max(smooth01(10.5 + LIFT, 15.5 + LIFT, cp.y), 1 - smooth01(13, 26, distSt));
      stationRoofFade.target = 1 - fSt * (1 - stationRoofFade.min);
    }
    /* Trenes: solo se desvanece el MÁS CERCANO a la cámara —su techo y la
       pared del lado de la vista—; el lejano mantiene techo y paredes. */
    var infos = [
      { id: 1, tx: (typeof sim !== 'undefined' && sim) ? sim.trainX : 0, z: TRAIN_Z },
      { id: 2, tx: (typeof sim2 !== 'undefined' && sim2) ? trainWX(2) : 200, z: TRACK_B_Z }
    ];
    infos.forEach(function (info) {
      info.dist = cp.distanceTo(new THREE.Vector3(info.tx, BODY_Y + 1.3, info.z));
    });
    var nearest = infos[0].dist <= infos[1].dist ? infos[0] : infos[1];
    infos.forEach(function (info) {
      var f = trainFades[info.id];
      var isNear = info === nearest;
      var target = 1;
      if (isNear && !firstPerson) {
        if (trainRoofFade.mode === 'visible') target = 1;
        else if (trainRoofFade.mode === 'oculto') target = 0;
        else if (trainRoofFade.mode === 'transparente') target = trainRoofFade.min;
        else {
          /* Dentro del tren el plafón y su luz se quedan (foto de interior);
             el desvanecido es al acercarse desde fuera o ver desde arriba. */
          var inside = (cp.x > info.tx - 21 && cp.x < info.tx + 21 && cp.y > BODY_Y - 0.4 &&
            cp.y < BODY_Y + BODY_H + 0.4 && cp.z > info.z - 1.5 && cp.z < info.z + 1.5) ? 1 : 0;
          var fTr = inside ? 0 : Math.max(smooth01(10.4 + LIFT, 14 + LIFT, cp.y), 1 - smooth01(7, 16, info.dist));
          target = 1 - fTr * (1 - trainRoofFade.min);
        }
      }
      f.roof.target = target;
      /* La pared que se desvanece es la del lado de la cámara; la otra se queda. */
      var facingPlus = cp.z >= info.z;
      f.wallPlus.target = (isNear && facingPlus) ? target : 1;
      f.wallMinus.target = (isNear && !facingPlus) ? target : 1;
      applyFade(f.roof, dt, firstPerson);   /* en primera persona, completos al instante */
      applyFade(f.wallPlus, dt, firstPerson);
      applyFade(f.wallMinus, dt, firstPerson);
    });
    applyFade(stationRoofFade, dt, firstPerson);
  }

  window.addEventListener('resize', function () {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  restoreFromUrl();   /* vista inicial: la de la URL (?vista=…) o Andén */

  /* ---------- Animación: llega → abre puertas → aborda → cierra → sale ---------- */
  var statusTitle = document.getElementById('statusTitle');
  var statusText = document.getElementById('statusText');
  var statusDot = document.getElementById('statusDot');
  var btnPlay = document.getElementById('btnPlay');
  var btnRestart = document.getElementById('btnRestart');
  var lastStatus = '';
  function setStatus(title, text, color) {
    var key = title + '|' + text;
    if (key === lastStatus) return; lastStatus = key;
    statusTitle.textContent = title; statusText.textContent = text;
    statusDot.style.background = color;
  }

  /* Los trenes llegan desde la distancia a velocidad de línea (54 km/h) y
     frenan parejo (1.2 m/s²) hasta la marca; salen acelerando 1.1 m/s².
     La espera con puertas abiertas no es fija: dura lo que tarde la gente
     en bajar y subir (mínimo 5 s), como en la vida real. */
  var RUN = { L: 220, v: 16.7, dec: 1.2, acc: 1.1 };   /* llegan a 60 km/h */
  RUN.db = RUN.v * RUN.v / (2 * RUN.dec); RUN.tc = (RUN.L - RUN.db) / RUN.v;
  RUN.tArr = RUN.tc + RUN.v / RUN.dec;
  RUN.ta = RUN.v / RUN.acc; RUN.xa = RUN.acc * RUN.ta * RUN.ta / 2;
  RUN.tDep = RUN.ta + (RUN.L - RUN.xa) / RUN.v;
  function arrivalX(t) {   /* metros que faltan para la marca de parada */
    if (t < RUN.tc) return RUN.L - RUN.v * t;
    var tt = Math.min(t - RUN.tc, RUN.v / RUN.dec);
    return RUN.db - (RUN.v * tt - RUN.dec * tt * tt / 2);
  }
  function arrivalV(t) { return t < RUN.tc ? RUN.v : Math.max(0, RUN.v - RUN.dec * (t - RUN.tc)); }
  function departX(t) { return t < RUN.ta ? RUN.acc * t * t / 2 : RUN.xa + RUN.v * (t - RUN.ta); }
  /* Recorrido completo de una estación a la siguiente (dist m): acelera,
     va a velocidad de línea y frena para parar justo en la marca */
  function makeProfile(dist, v, acc, dec) {
    var xa = v * v / (2 * acc), xd = v * v / (2 * dec), ta = v / acc, td = v / dec, tc = (dist - xa - xd) / v;
    return { v: v, acc: acc, dec: dec, xa: xa, ta: ta, td: td, tc: tc, T: ta + tc + td };
  }
  function profDist(R, t) {
    if (t < R.ta) return R.acc * t * t / 2;
    if (t < R.ta + R.tc) return R.xa + R.v * (t - R.ta);
    var u = Math.min(t - R.ta - R.tc, R.td);
    return R.xa + R.v * R.tc + R.v * u - R.dec * u * u / 2;
  }
  function profSpeed(R, t) {
    if (t < R.ta) return R.acc * t;
    if (t < R.ta + R.tc) return R.v;
    return Math.max(0, R.v - R.dec * (t - R.ta - R.tc));
  }
  var RIDE2 = makeProfile(TILE_LEN, RUN.v, RUN.acc, RUN.dec);
  var DOOR_T = 1.4, AWAY_T = 3, DWELL_MIN = 5, DWELL_MAX = 32;
  /* dir: sentido de marcha (+x a Exposición, −x a Talleres). base: desfase del
     tren contrario cuando el conductor recicla el tramo. */
  var sim = { id: 1, dir: 1, state: 'arriving', t: RUN.tArr - 9, trainX: -RUN.L, door: 0, playing: true,
    speed: 0, moveDir: 1, base: 0, quiet: 0, stopSeq: 0, near: false };
  var sim2 = { id: 2, dir: -1, state: 'away', t: -16, trainX: RUN.L, door: 0,
    speed: 0, moveDir: -1, base: 0, quiet: 0, stopSeq: 0, near: false };
  function easeInOut(t) { return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; }
  function clamp01(v) { return Math.max(0, Math.min(1, v)); }
  function simOf(id) { return id === 1 ? sim : sim2; }
  function trainOf(id) { return id === 1 ? train : train2; }
  function trainWX(id) { return id === 1 ? sim.trainX : sim2.base + sim2.trainX; }

  function stepCycle(S, dt) {
    S.t += dt;
    switch (S.state) {
      case 'away':
        S.trainX = S.dir * RUN.L; S.speed = 0;
        if (S.t >= AWAY_T) enterCycle(S, 'arriving');
        break;
      case 'arriving':
        S.trainX = -S.dir * arrivalX(S.t); S.speed = arrivalV(S.t); S.moveDir = S.dir;
        if (S.t >= RUN.tArr) { S.trainX = 0; S.speed = 0; enterCycle(S, 'opening'); }
        break;
      case 'opening':
        S.door = easeInOut(clamp01(S.t / DOOR_T));
        if (S.t >= DOOR_T) enterCycle(S, 'dwell');
        break;
      case 'dwell':
        S.door = 1;
        S.quiet = exchangeBusy(S.id) ? 0 : S.quiet + dt;
        if ((S.t >= DWELL_MIN && S.quiet >= 1.2) || S.t >= DWELL_MAX) enterCycle(S, 'closing');
        break;
      case 'closing':
        S.door = 1 - easeInOut(clamp01(S.t / DOOR_T));
        /* vas a bordo del tren 2: no se va «fuera de escena», sigue a la
           siguiente estación (hacia Talleres) sin fin */
        if (S.t >= DOOR_T) { S.door = 0; enterCycle(S, S.id === 2 && playerRiding(2) ? 'rideRun' : 'departing'); }
        break;
      case 'rideRun':
        S.trainX = S.dir * profDist(RIDE2, S.t) + S.shift;
        S.speed = profSpeed(RIDE2, S.t); S.moveDir = S.dir;
        if (S.trainX * S.dir > TILE_HALF) {   /* pasó al tramo siguiente: se recicla como la línea */
          S.shift -= S.dir * TILE_LEN; S.trainX -= S.dir * TILE_LEN;
          shiftCity(S.dir); repopulatePlatforms();
        }
        if (S.t >= RIDE2.T) { S.trainX = 0; S.speed = 0; enterCycle(S, 'opening'); }
        break;
      case 'departing':
        S.trainX = S.dir * departX(S.t); S.speed = Math.min(RUN.v, RUN.acc * S.t); S.moveDir = S.dir;
        if (S.t >= RUN.tDep) enterCycle(S, 'away');
        break;
    }
  }
  function enterCycle(S, next) {
    S.state = next; S.t = 0;
    if (next === 'arriving') { S.door = 0; S.trainX = -S.dir * RUN.L; }
    if (next === 'dwell') S.quiet = 0;
    if (next === 'rideRun') S.shift = 0;
    if (next === 'closing') abortBoarding(S.id);
    if (next === 'away') {
      S.base = 0; S.door = 0;
      /* El siguiente es otro tren… salvo que tú vayas adentro: entonces es
         el mismo tren llegando a otra estación (misma gente a bordo, otra
         gente en el andén). */
      if (playerRiding(S.id)) repopulatePlatforms(); else refillRiders(S.id);
    }
  }

  var statusTitle = document.getElementById('statusTitle');
  var statusText = document.getElementById('statusText');
  var statusDot = document.getElementById('statusDot');
  var btnPlay = document.getElementById('btnPlay');
  var btnRestart = document.getElementById('btnRestart');
  var lastStatus = '';
  function setStatus(title, text, color) {
    var key = title + '|' + text;
    if (key === lastStatus) return; lastStatus = key;
    statusTitle.textContent = title; statusText.textContent = text;
    statusDot.style.background = color;
  }
  /* Viajando a bordo del tren 2 (dirección Talleres) */
  function ride2Status() {
    var S = sim2;
    if (S.state === 'rideRun') {
      var left = Math.ceil(RIDE2.T - S.t);
      setStatus('Viajando a bordo', (left < 14 ? 'Llegando a Cuauhtémoc' : 'Siguiente: Cuauhtémoc · ' + left + ' s') +
        ' · ' + Math.round(S.speed * 3.6) + ' km/h', '#1b4f9c');
    } else if (S.state === 'dwell' || S.state === 'opening') setStatus('Viajando a bordo', 'Cuauhtémoc · puertas abiertas · dirección Talleres', '#078a4c');
    else setStatus('Viajando a bordo', 'Dirección Talleres', '#1b4f9c');
  }
  /* Estado de la Línea 2 (bajo tierra o viajando en ella) */
  function l2Status() {
    function txt(S, name) {
      if (S.state === 'dwell' || S.state === 'opening') return name + ': puertas abiertas';
      if (S.state === 'closing') return name + ': cerrando';
      var eta = Math.ceil(L2R.T - S.t);
      return name + (eta <= 14 ? ': llegando' : ': en ' + eta + ' s');
    }
    var a = l2RidingSim() || l2Sims[0];
    if (l2RidingSim()) {
      var dest = a.id === 3 ? 'Sendero' : 'Zaragoza';
      var st = a.state === 'run' ? (L2R.T - a.t < 14 ? 'Llegando a Cuauhtémoc' : 'Próxima: Cuauhtémoc · ' + Math.ceil(L2R.T - a.t) + ' s')
        : (a.state === 'closing' ? 'Cerrando puertas' : 'Cuauhtémoc · puertas abiertas');
      setStatus('Línea 2 · hacia ' + dest, st + ' · ' + Math.round(a.speed * 3.6) + ' km/h', '#078a4c');
      return;
    }
    setStatus('Línea 2 · Cuauhtémoc', txt(a, 'Sendero') + ' · ' + txt(l2Sims[1], 'Zaragoza'), '#078a4c');
  }
  function cycleStatus() {
    var S = sim, eta;
    switch (S.state) {
      case 'away':
      case 'arriving':
        eta = Math.max(1, Math.ceil((S.state === 'away' ? AWAY_T - S.t : 0) + RUN.tArr - (S.state === 'arriving' ? S.t : 0)));
        if (S.state === 'arriving' && eta <= 9) {
          setStatus('Tren llegando', 'Dirección Exposición · aléjate de la línea amarilla', '#078a4c');
          setLED('TREN LLEGANDO', 'EXPOSICIÓN');
        } else {
          setStatus('Próximo tren', 'Dirección Exposición · llega en ' + eta + ' s', '#f2b705');
          setLED('PRÓXIMO TREN', 'EXPOSICIÓN ' + eta + ' S');
        }
        break;
      case 'opening':
        setStatus('Abriendo puertas', 'Permite bajar antes de subir', '#078a4c');
        setLED('PUERTAS', 'ABRIENDO');
        break;
      case 'dwell':
        var c = exchangeCounts(1);
        setStatus('Puertas abiertas', (c.out || c.inn) ? 'Bajan ' + c.out + ' · suben ' + c.inn :
          'Abordaje completo · cierra en breve', '#078a4c');
        setLED('PUERTAS ABIERTAS', 'EXPOSICIÓN');
        break;
      case 'closing':
        setStatus('Cerrando puertas', 'No intentes abordar', '#d8432a');
        setLED('PUERTAS', 'CERRANDO');
        break;
      case 'departing':
        setStatus('Tren saliendo', 'Dirección Exposición', '#1b4f9c');
        setLED('TREN SALIENDO', 'BUEN VIAJE');
        break;
    }
  }
  /* Reiniciar recorrido: solo el tren vuelve a llegar. La gente sigue su
     vida (la línea es infinita): quien hacía fila vuelve a esperar y quien
     iba saliendo se queda adentro. */
  function restartCycle() {
    agents.forEach(function (a) {
      if (a.where === 'world' && a.trainId === 1 && (a.state === 'toQueue' || a.state === 'queue' || a.state === 'board')) {
        a.trainId = 0; a.door = -1; goWaitSpot(a);
      } else if (a.where === 1 && a.state === 'alightOut') returnToSlot(a);
    });
    sim.door = 0;
    if (drive.manual || drive.riding) {   /* en cabina o viajando dentro: arranca a 220 m, en automático */
      sim.trainX = -220; drive.speed = 0; drive.aCmd = 0; drive.doorTarget = 0; drive.served = false; setAto(true);
    } else enterCycle(sim, 'arriving');
  }
  btnRestart.addEventListener('click', restartCycle);
  function setPlaying(on) {
    sim.playing = on;
    btnPlay.textContent = on ? 'Pausar' : 'Reanudar';
  }
  btnPlay.addEventListener('click', function () { setPlaying(!sim.playing); });

  /* ---------- Gente con intención (NPC) ----------
     Cada persona es un agente con un plan: sube por la escalera, elige dónde
     esperar (cerca de una puerta o en una banca), mira hacia el tren que
     llega, DEJA BAJAR ANTES DE SUBIR haciendo fila a los lados de la
     puerta, entra al vagón y se sienta o se agarra del tubo, y viaja con el
     tren. Quienes bajan se levantan al frenar, esperan junto a la puerta,
     salen y se van por la escalera. Nadie aparece ni desaparece a la vista:
     se entra y se sale por la calle. Un vigilante recorre el andén. */
  var agents = [], simTime = 0;
  var PLAT = {
    A: { id: 'A', trainId: 1, ps: 1, trainZ: TRAIN_Z, edgeZ: 0.3, queueZ: 1.05, waitZ: [1.4, 2.75],
      laneZ: 3.2, face: 0, benchFrontZ: 3.53, benchZ: 3.95, seats: [], max: 22, density: 0.5,
      spawnT: 1, stairs: ['AE', 'AW'] },
    B: { id: 'B', trainId: 2, ps: -1, trainZ: TRACK_B_Z, edgeZ: -5.9, queueZ: -6.6, waitZ: [-6.8, -7.3],
      laneZ: -7.55, face: Math.PI, benchFrontZ: -7.78, benchZ: -8.2, seats: [], max: 11, density: 0.5,
      spawnT: 2, stairs: ['BE', 'BW'] }
  };
  [-16, -5, 6, 17].forEach(function (x) { [-0.75, 0, 0.75].forEach(function (d) { PLAT.A.seats.push({ x: x + d, occ: null }); }); });
  [-14, -3, 9].forEach(function (x) { [-0.75, 0, 0.75].forEach(function (d) { PLAT.B.seats.push({ x: x + d, occ: null }); }); });
  var doorGates = { 1: DOOR_X.map(function () { return { next: 0, nextOut: 0 }; }),
    2: DOOR_X.map(function () { return { next: 0, nextOut: 0 }; }) };
  var ALIGHT_STATES = ['standUp', 'toDoorIn', 'exitWait', 'alightOut'];
  var BOARD_STATES = ['toQueue', 'queue', 'board'];
  function platOfTrain(id) { return id === 1 ? PLAT.A : PLAT.B; }
  function rollDensity() {
    var r = Math.random();   /* a veces poca gente, a veces mucha */
    return r < 0.3 ? 0.15 + Math.random() * 0.2 : (r < 0.72 ? 0.42 + Math.random() * 0.28 : 0.75 + Math.random() * 0.25);
  }

  function newAgent(look, parent, pose) {
    var g = makePerson(look, parent, pose);
    var a = { g: g, rig: g.userData.rig, path: [], seg: null, onArrive: null, slide: null,
      speed: 1.2 + Math.random() * 0.3, state: 'idle', t: 0, where: 'world', yawT: 0,
      lookT: Math.random() * 4, P: null, trainId: 0, door: -1, slot: null, seat: null };
    agents.push(a);
    return a;
  }
  function removeAgent(a) {
    if (a.slot) a.slot.occ = null;
    if (a.seat) a.seat.occ = null;
    a.g.parent.remove(a.g);
    a.g.traverse(function (o) { if (o.isMesh) o.geometry.dispose(); if (o.isSkinnedMesh) o.skeleton.dispose(); });
    var i = agents.indexOf(a); if (i >= 0) agents.splice(i, 1);
  }
  /* Copia por agente: las rutas reusan objetos de EXITS y separate()
     llega a mover el punto siguiente (al rodearte en Caminar); sin copia
     eso corrompía la ruta compartida para todos los demás. */
  function clonePts(pts) { return pts.map(function (pt) { return Object.assign({}, pt); }); }
  function go(a, pts, cb) { a.path = clonePts(pts); a.seg = null; a.onArrive = cb || null; }
  function slideTo(a, x, z, dur, delay, cb) {
    a.slide = { fx: a.g.position.x, fz: a.g.position.z, tx: x, tz: z, t: -(delay || 0), dur: dur, cb: cb };
  }
  function moveAlong(a, dt) {
    var p = a.g.position, n = a.path[0];
    if (!a.seg) {
      var dx0 = n.x - p.x, dz0 = n.z - p.z, len0 = Math.max(Math.hypot(dx0, dz0), 1e-4);
      var stair = n.y !== undefined && Math.abs(n.y - p.y) > 0.5;
      /* En escaleras cada sentido camina por SU derecha: el punto meta se
         recorre 36 cm a la derecha del rumbo, así quienes suben y quienes
         bajan usan carriles distintos y no se atoran de frente a mitad
         del tramo (antes todos iban por la misma línea central). */
      var lane = stair ? 0.36 : 0;
      var tx = n.x + (-dz0 / len0) * lane, tz = n.z + (dx0 / len0) * lane;
      a.seg = { y0: p.y, sx: p.x, sz: p.z, tx: tx, tz: tz, stair: stair,
        ux: dx0 / len0, uz: dz0 / len0, need: len0,
        len: Math.max(Math.hypot(tx - p.x, tz - p.z), 1e-4) };
    }
    var dx = a.seg.tx - p.x, dz = a.seg.tz - p.z, d = Math.hypot(dx, dz);
    var step = a.speed * (a.rig.running ? 2 : 1) * dt;
    if (a.seg.stair) step *= 0.72;   /* escalera */
    /* Llegada: en puntos intermedios basta acercarse (22 cm) o REBASAR el
       plano del punto; exigir los ~2 cm del paso hacía que, con los
       empujes de la multitud, la gente orbitara el punto sin «llegar»
       nunca (las vueltas en las bocas de escalera). */
    var along = (p.x - a.seg.sx) * a.seg.ux + (p.z - a.seg.sz) * a.seg.uz;
    var arriveR = a.path.length > 1 ? 0.22 : Math.max(step, 0.05);
    var passed = a.path.length > 1 && along >= a.seg.need - 0.04;
    if (d <= Math.max(step, arriveR) || passed) {
      if (a.path.length === 1) { p.x = n.x; p.z = n.z; }   /* el destino final sí es exacto */
      if (n.y !== undefined) p.y = n.y;
      a.path.shift(); a.seg = null;
    } else {
      p.x += dx / d * step; p.z += dz / d * step;
      if (n.y !== undefined) {
        var yr = Math.max(0, Math.min(1, (d - step) / a.seg.len));
        p.y = n.y + (a.seg.y0 - n.y) * yr;
      }
    }
    if (d > 0.03) a.yawT = Math.atan2(-dx, -dz);
    a.rig.moving = true; a.rig.phase += Math.min(step, d) * Math.PI / 0.68;
    if (!a.path.length) {
      a.rig.moving = false; a.rig.running = false;
      var cb = a.onArrive; a.onArrive = null;
      if (cb) cb(a);
    }
  }
  function poseFor(kind) {
    var r = Math.random();
    if (kind === 'wait') return r < 0.34 ? 'phone' : r < 0.6 ? 'stand' : r < 0.82 ? 'pockets' : 'crossed';
    if (kind === 'seat') return r < 0.38 ? 'sitphone' : 'sit';
    return kind;   /* rail / pole */
  }

  /* --- Recorridos: calle → N2 → andén (y de regreso) ---
     Se entra por la salida sur, la poniente o el edificio de transbordo
     (pasarela); dentro de N2 se camina por dos pasillos (sur y norte) que
     se cruzan entre columnas, y se sube por la escalera del extremo. */
  var N2_LANE = { A: 2.0, B: -6.4 }, N2_CROSS = [-27.6, -9.2, 9.2, 27.6];
  var PSTAIRS = {
    AE: { plat: 'A', s: 1, z: N1_STAIR.zA }, AW: { plat: 'A', s: -1, z: N1_STAIR.zA },
    BE: { plat: 'B', s: 1, z: N1_STAIR.zB }, BW: { plat: 'B', s: -1, z: N1_STAIR.zB }
  };
  var N1_BOT = 26 + stairLen(PLAT_Y - N2_Y);
  function pstairPts(id, P) {   /* del pasillo del andén al pasillo de N2 (bajando) */
    var st = PSTAIRS[id], s = st.s, lane = N2_LANE[st.plat];
    return [{ x: s * 25.4, y: PLAT_Y, z: P.laneZ }, { x: s * 25.4, y: PLAT_Y, z: st.z }, { x: s * 26, y: PLAT_Y, z: st.z },
      { x: s * N1_BOT, y: N2_Y, z: st.z }, { x: s * 35.5, y: N2_Y, z: st.z }, { x: s * 35.5, y: N2_Y, z: lane }];
  }
  function n2Path(x1, z1, x2, z2) {   /* dentro de N2, sin chocar con columnas */
    if (Math.abs(z1 - z2) < 0.01) return [{ x: x2, y: N2_Y, z: z2 }];
    var mid = (x1 + x2) / 2, xc = N2_CROSS.reduce(function (b, c) { return Math.abs(c - mid) < Math.abs(b - mid) ? c : b; });
    return [{ x: xc, y: N2_Y, z: z1 }, { x: xc, y: N2_Y, z: z2 }, { x: x2, y: N2_Y, z: z2 }];
  }
  var EXITS = {
    S: { pts: [{ x: 4, y: 0.17, z: 15.0 }, { x: 4, y: 0.17, z: 14.29 }, { x: 4, y: N2_Y, z: 7.4 },
      { x: 4, y: N2_Y, z: 6.0 }, { x: 4, y: N2_Y, z: N2_LANE.A }],
      street: function () { return { x: 4 + (Math.random() - 0.5) * 40, y: 0.17, z: 15.4 + Math.random() * 0.6 }; } },
    W: { pts: [{ x: -45.2, y: 0, z: -5 }, { x: -37.2 - stairLen(N2_Y), y: 0, z: -5 }, { x: -37.2, y: N2_Y, z: -5 },
      { x: -33, y: N2_Y, z: -5 }, { x: -33, y: N2_Y, z: N2_LANE.B }],
      street: function () { return { x: -48 - Math.random() * 16, y: 0, z: -5 + (Math.random() - 0.5) * 3 }; } },
    E: { pts: [{ x: 39, y: 0.17, z: 15.9 }, { x: 39, y: 0.17, z: 16.3 }, { x: 39, y: 0.6, z: N3B.z0 },
      { x: 39, y: 0.6, z: 21 }, { x: 36, y: 0.6, z: 27.2 }, { x: 31.5, y: 0.6, z: 27.2 },
      { x: 31.5, y: 0.6, z: N3B.z0 + 1.5 + stairLen(N2_Y - 0.6) }, { x: 31.5, y: N2_Y, z: N3B.z0 + 1.5 },
      { x: 31.5, y: N2_Y, z: N2B.z1 }, { x: 30.5, y: N2_Y, z: 5.6 }, { x: 30.5, y: N2_Y, z: N2_LANE.A }],
      street: function () { return { x: 39 + (Math.random() - 0.5) * 24, y: 0.17, z: 15.4 + Math.random() * 0.6 }; } }
  };
  function pickExit() { var r = Math.random(); return EXITS[r < 0.4 ? 'S' : (r < 0.7 ? 'W' : 'E')]; }
  function routeIn(ex, sid, P) {
    var up = ex.pts, last = up[up.length - 1], down = pstairPts(sid, P), b = down[down.length - 1];
    return up.concat(n2Path(last.x, last.z, b.x, b.z), down.slice().reverse().slice(1),
      [{ x: PSTAIRS[sid].s * 24, y: PLAT_Y, z: P.laneZ }]);
  }
  function routeOut(sid, ex, P) {
    var down = pstairPts(sid, P), b = down[down.length - 1], up = ex.pts, last = up[up.length - 1];
    return down.concat(n2Path(b.x, b.z, last.x, last.z), up.slice().reverse().slice(1), [ex.street()]);
  }
  function nearestStair(P, x) {
    var best = null;
    P.stairs.forEach(function (id) {
      if (!best || Math.abs(PSTAIRS[id].s * 26 - x) + Math.random() * 14 < Math.abs(PSTAIRS[best].s * 26 - x)) best = id;
    });
    return best;
  }

  /* --- En el andén --- */
  function spawnAgent(P) {
    var ex = pickExit(), sid = P.stairs[Math.floor(Math.random() * P.stairs.length)];
    var start = ex.street();
    var a = newAgent(null, scene, 'stand');
    a.P = P; a.wantsBoard = Math.random() < 0.9; a.patience = 40 + Math.random() * 90;
    a.g.position.set(start.x, start.y, start.z);
    a.state = 'enter';
    go(a, routeIn(ex, sid, P), chooseGoal);
    return a;
  }
  function chooseGoal(a) {
    var P = a.P, free = P.seats.filter(function (s) { return !s.occ; });
    var r = Math.random();
    if (free.length && r < 0.3) goBench(a, free[Math.floor(Math.random() * free.length)]);
    else if (P.id === 'A' && r < 0.37) {
      a.state = 'enter';
      go(a, [{ x: -9, z: P.laneZ }, { x: -9, z: 3.5 }], function () {
        a.state = 'browse'; a.t = 0; a.yawT = Math.PI; a.browseT = 3 + Math.random() * 5;
      });
    } else goWaitSpot(a);
  }
  function pickSpot(P) {
    var best = null;
    for (var tries = 0; tries < 12; tries++) {
      var x = DOOR_X[Math.floor(Math.random() * 4)] + (Math.random() - 0.5) * 3.6;
      var z = P.waitZ[0] + Math.random() * (P.waitZ[1] - P.waitZ[0]);
      var clear = agents.every(function (o) {
        if (o.where !== 'world' || o.P !== P) return true;
        var q = o.spot || o.g.position;
        return Math.hypot(q.x - x, q.z - z) > 0.8;
      });
      best = { x: x, z: z };
      if (clear) break;
    }
    return best;
  }
  function goWaitSpot(a) {
    var P = a.P, s = pickSpot(P), p = a.g.position;
    a.spot = s; a.state = 'enter';
    var pts = Math.abs(p.z - P.laneZ) > 0.6 ? [{ x: p.x, z: P.laneZ }] : [];
    pts.push({ x: s.x, z: P.laneZ }, { x: s.x, z: s.z });
    go(a, pts, function () {
      a.state = 'wait'; a.t = 0; a.yawT = P.face + (Math.random() - 0.5) * 0.5;
      setPose(a.rig, poseFor('wait'));
    });
  }
  function goBench(a, seat) {
    var P = a.P;
    seat.occ = a; a.seat = seat; a.state = 'enter';
    go(a, [{ x: seat.x, z: P.laneZ }, { x: seat.x, z: P.benchFrontZ }], function () {
      a.yawT = P.face;
      sitDown(a, function () { a.state = 'bench'; a.t = 0; });
    });
  }
  /* Sentarse/pararse en su lugar: primero gira de espaldas al asiento,
     luego baja la cadera hacia atrás; los pies no se mueven. */
  function sitDown(a, cb) {
    var p = a.g.position;
    slideTo(a, p.x, p.z, 0.01, 0.45, function () {
      setPose(a.rig, poseFor('seat'));
      slideTo(a, p.x, p.z, 0.8, 0, cb);
    });
  }
  function standUp(a, cb) {
    var p = a.g.position;
    setPose(a.rig, 'stand');
    slideTo(a, p.x, p.z, 0.7, 0, cb);
  }
  function standFromBench(a, cb) {
    var seat = a.seat;
    a.state = 'standing';
    standUp(a, function () { seat.occ = null; a.seat = null; cb(a); });
  }
  function leave(a) {
    var P = a.P, sid = nearestStair(P, a.g.position.x), p = a.g.position;
    a.state = 'leave'; a.spot = null; setPose(a.rig, Math.random() < 0.25 ? 'phone' : 'stand');
    var pts = [];
    if (Math.abs(p.z - P.laneZ) > 0.4) pts.push({ x: p.x, z: P.laneZ });
    go(a, pts.concat(routeOut(sid, pickExit(), P)), removeAgent);
  }
  function idleLook(a, dt) {
    var P = a.P, S = simOf(P.trainId), x = trainWX(P.trainId);
    var coming = Math.abs(x) > 2 && Math.abs(x) < 140 && S.speed > 0.3 && x * S.moveDir < 0;
    var base = POSES[a.rig.pose] && POSES[a.rig.pose].headX || 0;
    if (coming) { a.rig.headYT = 0.7; a.rig.tgt.headX = 0; return; }   /* voltean al tren */
    a.rig.tgt.headX = base;
    a.lookT -= dt;
    if (a.lookT < 0) { a.rig.headYT = Math.random() < 0.5 ? 0 : (Math.random() - 0.5) * 1.3; a.lookT = 2 + Math.random() * 5; }
  }

  /* --- Abordar: fila a los lados de la puerta, primero bajan --- */
  /* El andén va de −26 a 26 m: una puerta sirve si queda completa frente a
     él. Así, parado un poco antes o después de la marca (o con un vagón
     fuera de la estación), se sube y se baja solo por esas puertas. */
  var PLAT_DOOR_LIM = 25.2;
  function doorAtPlatform(id, i) { return Math.abs(trainWX(id) + DOOR_X[i]) <= PLAT_DOOR_LIM; }
  function platformDoors(id) {
    var n = 0;
    for (var i = 0; i < DOOR_X.length; i++) if (doorAtPlatform(id, i)) n++;
    return n;
  }
  function stationStop(S) {
    return Math.abs(S.speed) < 0.05 && platformDoors(S.id) > 0;
  }
  /* La puerta más cercana de su vagón que dé al andén (−1 si ninguna) */
  function nearestCarDoor(id, lx) {
    var best = -1, bd = 1e9;
    DOOR_X.forEach(function (dx, i) {
      var d = Math.abs(dx - lx);
      if (Math.sign(dx) === Math.sign(lx || 1) && doorAtPlatform(id, i) && d < bd) { bd = d; best = i; }
    });
    return best;
  }
  /* Al abrir puertas (también tras moverte y volver a abrir): quien iba a
     bajar se va a la puerta de su vagón que sí dé al andén. Si su vagón
     quedó fuera de la estación espera junto a su puerta: si mueves el tren
     y vuelves a abrir con su vagón en el andén, baja entonces. */
  function retargetAlighters(id) {
    agents.forEach(function (a) {
      if (a.where !== id || !a.alight) return;
      var best = nearestCarDoor(id, a.g.position.x), old = a.door;
      if (best < 0 || best === old) return;
      a.door = best;
      if (a.state === 'toDoorIn' || a.state === 'exitWait') { reflowExit(id, old); a.exitIdx = -1; reflowExit(id, best); }
    });
  }
  /* Se cerraron las puertas sin que subiera: espera ahí mismo (en Cabina
     el tren puede moverse y volver a abrir; irá a la puerta más cercana) */
  function waitHere(a) {
    a.trainId = 0; a.door = -1; a.path = []; a.state = 'wait'; a.t = 0;
    a.spot = { x: a.g.position.x, z: a.g.position.z }; a.yawT = a.P.face;
    a.rig.running = false;
  }
  function boardingOpen(id) {
    var S = simOf(id);
    if (!stationStop(S) || S.door < 0.05) return false;
    if (id === 1 && (drive.manual || drive.riding)) return drive.doorTarget === 1;
    return S.state === 'opening' || S.state === 'dwell';
  }
  function callToDoor(a) {
    var P = a.P, tx = trainWX(P.trainId), best = -1, bd = 1e9;
    DOOR_X.forEach(function (dx, i) {
      var d = Math.abs(tx + dx - a.g.position.x);
      if (doorAtPlatform(P.trainId, i) && d < bd) { bd = d; best = i; }
    });
    if (best < 0) return;
    a.trainId = P.trainId; a.door = best; a.spot = null;
    var goQueue = function () {
      var doorX = trainWX(P.trainId) + DOOR_X[best];
      var k = a.g.position.x < doorX ? -1 : 1;
      var n = agents.filter(function (o) {
        return o !== a && o.trainId === P.trainId && o.door === best && o.side === k &&
          (o.state === 'toQueue' || o.state === 'queue');
      }).length;
      a.side = k; a.state = 'toQueue'; a.queuedAt = simTime;
      /* la fila no se sale del andén cuando la puerta queda en su orilla */
      var qx = THREE.MathUtils.clamp(doorX + k * (0.75 + 0.5 * (n % 3)), -25.4, 25.4);
      var qz = P.queueZ + P.ps * 0.55 * Math.floor(n / 3);
      setPose(a.rig, 'stand');
      /* lejos de la puerta (el tren paró adelante o atrás): corre para alcanzarlo */
      a.rig.running = Math.abs(qx - a.g.position.x) > 6;
      go(a, [{ x: qx, z: qz }], function () {
        a.state = 'queue'; a.yawT = Math.atan2(-(doorX - qx), -(P.edgeZ - qz));
      });
    };
    if (a.seat) standFromBench(a, goQueue); else goQueue();
  }
  function boardNow(a) {
    var P = a.P, doorX = trainWX(P.trainId) + DOOR_X[a.door];
    a.state = 'board';
    go(a, [{ x: doorX, z: P.queueZ }, { x: doorX, z: P.trainZ + P.ps * 1.3 }], enterTrain);
  }
  function enterTrain(a) {
    var id = a.trainId, P = a.P, T = trainOf(id), p = a.g.position;
    scene.remove(a.g); T.add(a.g);
    p.x -= T.position.x; p.y = BODY_Y + FLOOR_DY;
    a.where = id; a.state = 'toSlot';
    var dLX = DOOR_X[a.door], car = dLX > 0 ? 1 : -1;
    var pts = [{ x: dLX, z: P.trainZ + P.ps * 0.5 }];
    a.slot = takeSlot(id, car, dLX);
    if (a.slot) { a.slot.occ = a; pts.push(slotApproach(a.slot, P.trainZ)); }   /* apartado desde ya */
    else pts.push({ x: Math.max(-12.55, Math.min(12.55, dLX + (Math.random() - 0.5) * 2)),
      z: P.trainZ + (Math.random() - 0.5) * 0.4 });   /* nunca tras el mamparo (±12.90) */
    go(a, pts, settle);
  }
  function takeSlot(id, car, nearX) {
    var free = trainSlots[id].filter(function (s) { return !s.occ && s.car === car; });
    var seats = free.filter(function (s) { return s.type === 'seat'; });
    var pool = seats.length && Math.random() < 0.85 ? seats : free;
    if (!pool.length) return null;
    pool.sort(function (s1, s2) { return Math.abs(s1.x - nearX) - Math.abs(s2.x - nearX) + (Math.random() - 0.5) * 6; });
    return pool[0];
  }
  function slotApproach(slot, trainZ) {
    /* asiento: donde quedan los pies (la cadera va 42 cm atrás, en el asiento) */
    return slot.type === 'seat' ? { x: slot.x, z: trainZ + slot.side * 0.56 } : { x: slot.x, z: slot.z };
  }
  function settle(a) {
    var s = a.slot;
    a.state = 'ride'; a.P = null; a.door = -1; a.alight = false;
    if (!s) { setPose(a.rig, 'rail'); return; }
    a.yawT = s.yaw; s.occ = a;
    if (s.type === 'seat') sitDown(a);
    else setPose(a.rig, poseFor(s.type));
  }
  function abortBoarding(id) {
    var stay = id === 1 && (drive.manual || drive.riding);
    agents.forEach(function (a) {
      if (a.where === 'world' && a.trainId === id && (a.state === 'toQueue' || a.state === 'queue')) {
        if (stay) waitHere(a); else { a.trainId = 0; a.door = -1; goWaitSpot(a); }
      }
    });
  }

  /* --- Bajar: se levantan al frenar, esperan junto a la puerta y salen --- */
  function planAlighters(id) {
    var share = 0.2 + Math.random() * 0.4;
    agents.forEach(function (a) {
      if (a.where !== id || a.state !== 'ride' || Math.random() > share) return;
      var best = 0, bd = 1e9;
      DOOR_X.forEach(function (dx, i) {
        var d = Math.abs(dx - a.g.position.x);
        if (Math.sign(dx) === Math.sign(a.g.position.x) && d < bd) { bd = d; best = i; }
      });
      a.alight = true; a.door = best; a.stopSeq = simOf(id).stopSeq;
      /* Cuándo se prepara cada quien (al azar, como en la vida real): unos
         desde antes, otros al frenar y otros hasta que el tren se detiene.
         Los que ya van de pie suelen acercarse antes. */
      var r = Math.random(), standing = a.slot && a.slot.type !== 'seat';
      a.alightWhen = standing ? (r < 0.55 ? 'early' : (r < 0.85 ? 'brake' : 'stop')) :
        (r < 0.25 ? 'early' : (r < 0.62 ? 'brake' : 'stop'));
    });
  }
  /* Fila para bajar en cada puerta: dos al frente junto a la puerta, dos
     detrás y luego a lo largo del pasillo; cada quien en su lugar (nadie
     se encima) y al salir uno, los demás avanzan. [dx, dz hacia el andén] */
  var EXIT_SPOTS = [[-0.3, 0.9], [0.3, 0.9], [-0.3, 0.42], [0.3, 0.42], [-0.85, 0.12],
    [0.85, 0.12], [-1.4, -0.08], [1.4, -0.08], [-1.95, -0.08], [1.95, -0.08], [-2.5, -0.08], [2.5, -0.08]];
  function exitQueue(id, door) {
    return agents.filter(function (a) {
      return a.where === id && a.door === door && (a.state === 'toDoorIn' || a.state === 'exitWait');
    }).sort(function (a, b) { return a.queuedOut - b.queuedOut; });
  }
  function sendToExitSpot(a, idx) {
    var P = platOfTrain(a.where), o = EXIT_SPOTS[Math.min(idx, EXIT_SPOTS.length - 1)];
    var x = DOOR_X[a.door] + o[0], z = P.trainZ + P.ps * o[1];
    /* Las puertas de los extremos están a ±12.25 y el mamparo a ±12.90:
       los lugares traseros de la fila (dx hasta ±2.5) caían DENTRO de la
       cabina. Esos se pegan al mamparo, escalonados hacia el pasillo. */
    var CAB_LIM = 12.55;
    if (x > CAB_LIM || x < -CAB_LIM) {
      var over = 0, lim = Math.min(idx, EXIT_SPOTS.length - 1);
      for (var j = 0; j <= lim; j++) {
        var ox = DOOR_X[a.door] + EXIT_SPOTS[j][0];
        if (ox > CAB_LIM || ox < -CAB_LIM) over++;
      }
      x = x > 0 ? CAB_LIM : -CAB_LIM;
      z = P.trainZ + P.ps * (0.12 - (over - 1) * 0.3);
    }
    a.exitIdx = idx; a.state = 'toDoorIn';
    go(a, [{ x: x, z: z }], function () {
      a.state = 'exitWait';
      a.yawT = Math.atan2(-(DOOR_X[a.door] - x), -(P.trainZ + P.ps * 1.3 - z));   /* viendo a la puerta */
    });
  }
  function reflowExit(id, door) {
    exitQueue(id, door).forEach(function (a, i) { if (a.exitIdx !== i) sendToExitSpot(a, i); });
  }
  function startAlight(a) {
    var id = a.where, s = a.slot;
    a.state = 'standUp'; a.trainId = id;
    var toDoor = function () {
      if (a.slot) { a.slot.occ = null; a.slot = null; }
      setPose(a.rig, 'stand');
      a.queuedOut = simTime; a.state = 'toDoorIn'; a.exitIdx = -1;
      reflowExit(id, a.door);   /* se forma al final de la fila de su puerta */
    };
    if (s && s.type === 'seat') standUp(a, toDoor);
    else toDoor();
  }
  function alightNow(a) {
    var P = platOfTrain(a.where), id = a.where;
    a.state = 'alightOut';
    go(a, [{ x: DOOR_X[a.door], z: P.trainZ + P.ps * 0.95 }, { x: DOOR_X[a.door], z: P.trainZ + P.ps * 1.32 }], exitTrain);
    reflowExit(id, a.door);   /* los de atrás avanzan un lugar */
  }
  function exitTrain(a) {
    var id = a.where, P = platOfTrain(id), T = trainOf(id), p = a.g.position;
    T.remove(a.g); scene.add(a.g);
    p.x += T.position.x; p.y = PLAT_Y;
    a.where = 'world'; a.P = P; a.trainId = 0; a.door = -1; a.alight = false;
    a.state = 'alighted';
    go(a, [{ x: p.x + (Math.random() - 0.5) * 0.8, z: P.queueZ + P.ps * 0.6 }], leave);
  }
  function returnToSlot(a) {   /* no abrió en su estación: se vuelve a acomodar */
    var id = a.where, P = platOfTrain(id);
    a.alight = false; a.state = 'toSlot'; a.trainId = 0;
    a.slot = takeSlot(id, a.g.position.x > 0 ? 1 : -1, a.g.position.x);
    if (a.slot) a.slot.occ = a;
    go(a, a.slot ? [slotApproach(a.slot, P.trainZ)] : [], settle);
    if (!a.slot) settle(a);
  }
  function exchangeBusy(id) {
    return agents.some(function (a) {
      if (a.trainId !== id) return false;
      return BOARD_STATES.indexOf(a.state) >= 0 || ALIGHT_STATES.indexOf(a.state) >= 0;
    });
  }
  function exchangeCounts(id) {
    var c = { out: 0, inn: 0 };
    agents.forEach(function (a) {
      if (a.trainId !== id) return;
      if (ALIGHT_STATES.indexOf(a.state) >= 0) c.out++;
      else if (BOARD_STATES.indexOf(a.state) >= 0) c.inn++;
    });
    return c;
  }
  /* Puerta por puerta: primero sale uno cada ~0.55 s; cuando ya no queda
     nadie por bajar en esa puerta, entra la fila (el que llegó primero). */
  function serviceDoors(id) {
    var S = simOf(id);
    if (!stationStop(S) || S.door < 0.85) return;
    if (id === 1 && (drive.manual || drive.riding) && drive.doorTarget !== 1) return;
    DOOR_X.forEach(function (dx, i) {
      if (!doorAtPlatform(id, i)) return;   /* esa puerta quedó fuera del andén */
      var gate = doorGates[id][i], firstOut = null, pendingOut = 0, firstIn = null;
      agents.forEach(function (a) {
        if (a.trainId !== id || a.door !== i) return;
        if (ALIGHT_STATES.indexOf(a.state) >= 0) pendingOut++;
        if (a.state === 'exitWait' && a.exitIdx <= 1 && (!firstOut || a.queuedOut < firstOut.queuedOut)) firstOut = a;
        if (a.state === 'queue' && (!firstIn || a.queuedAt < firstIn.queuedAt)) firstIn = a;
      });
      if (firstOut && gate.nextOut <= simTime) { gate.nextOut = simTime + 0.7; alightNow(firstOut); }
      var outside = agents.some(function (a) { return a.trainId === id && a.door === i && a.state === 'alightOut'; });
      if (!pendingOut && !outside && firstIn && gate.next <= simTime) { gate.next = simTime + 0.7; boardNow(firstIn); }
    });
  }

  /* --- Gente dentro del tren --- */
  function refillRiders(id) {
    agents.slice().forEach(function (a) { if (a.where === id) removeAgent(a); });
    trainSlots[id].forEach(function (s) { s.occ = s.occ === PLAYER_OCC ? PLAYER_OCC : null; });
    var n = Math.min(22, Math.round(56 * (0.12 + Math.random() * 0.3)));
    var seats = trainSlots[id].filter(function (s) { return s.type === 'seat'; });
    var stand = trainSlots[id].filter(function (s) { return s.type !== 'seat'; });
    for (var i = 0; i < n; i++) {
      var list = (Math.random() < 0.78 && seats.some(function (s) { return !s.occ; })) ? seats : stand;
      var free = list.filter(function (s) { return !s.occ; });
      if (!free.length) break;
      var s = free[Math.floor(Math.random() * free.length)];
      var a = newAgent(null, trainOf(id), poseFor(s.type === 'seat' ? 'seat' : s.type));
      a.where = id; a.state = 'ride'; a.slot = s; s.occ = a;
      var ap = slotApproach(s, id === 1 ? TRAIN_Z : TRACK_B_Z);
      a.g.position.set(ap.x, BODY_Y + FLOOR_DY, ap.z); a.g.rotation.y = a.yawT = s.yaw;
    }
  }

  /* --- Vigilante: recorre el andén despacio y se detiene a observar --- */
  function spawnGuard() {
    var look = Object.assign(randomLook(), { top: 0x1f2a3a, bottom: 0x1f2a3a, jacket: null, sleeves: 'long',
      skirt: false, shorts: false, bag: 1, hair: 'cap', capC: 0x1f2a3a, shoe: 0x111111 });
    var a = newAgent(look, scene, 'stand');
    a.P = PLAT.A; a.guard = true; a.speed = 0.85; a.state = 'patrol';
    a.g.position.set(-12, PLAT_Y, PLAT.A.laneZ + 0.2);
    patrolLeg(a);
  }
  function patrolLeg(a) {
    var x = a.g.position.x > 0 ? -16 - Math.random() * 4 : 14 + Math.random() * 6;
    a.state = 'patrol'; setPose(a.rig, 'stand');
    go(a, [{ x: x, z: PLAT.A.laneZ + 0.2 }], function () {
      a.state = 'watch'; a.t = 0; a.watchT = 3 + Math.random() * 5;
      a.yawT = PLAT.A.face; setPose(a.rig, 'crossed');
    });
  }

  /* --- Poblar de golpe (inicio, reinicio y cada estación nueva al recorrer) --- */
  function populatePlatform(P) {
    P.density = rollDensity();
    var n = Math.round(P.max * P.density * (0.45 + Math.random() * 0.4));
    for (var i = 0; i < n; i++) {
      var a = newAgent(null, scene, 'stand');
      a.P = P; a.wantsBoard = Math.random() < 0.9; a.patience = 30 + Math.random() * 90;
      var free = P.seats.filter(function (s) { return !s.occ; });
      if (free.length && Math.random() < 0.3) {
        var seat = free[Math.floor(Math.random() * free.length)];
        seat.occ = a; a.seat = seat; a.state = 'bench';
        a.g.position.set(seat.x, PLAT_Y, P.benchFrontZ);
        setPose(a.rig, poseFor('seat'), true);
      } else {
        var s = pickSpot(P);
        a.spot = s; a.state = 'wait';
        a.g.position.set(s.x, PLAT_Y, s.z);
        setPose(a.rig, poseFor('wait'), true);
      }
      a.g.rotation.y = a.yawT = P.face + (a.state === 'wait' ? (Math.random() - 0.5) * 0.5 : 0);
      a.t = Math.random() * 20;
    }
    P.spawnT = 1 + Math.random() * 2;
  }
  function resetStation() {
    agents.slice().forEach(removeAgent);
    PLAT.A.seats.concat(PLAT.B.seats).forEach(function (s) { if (s.occ !== PLAYER_OCC) s.occ = null; });
    populatePlatform(PLAT.A); populatePlatform(PLAT.B);
    refillRiders(1); refillRiders(2);
    spawnGuard();
  }
  function repopulatePlatforms() {   /* llegada a otra estación del recorrido */
    agents.slice().forEach(function (a) { if (a.where === 'world' && !a.guard) removeAgent(a); });
    PLAT.A.seats.concat(PLAT.B.seats).forEach(function (s) { s.occ = null; });
    agents.forEach(function (a) { if (a.guard) { a.g.position.set(-12, PLAT_Y, PLAT.A.laneZ + 0.2); patrolLeg(a); } });
    populatePlatform(PLAT.A); populatePlatform(PLAT.B);
  }

  function think(a, dt) {
    var P = a.P;
    switch (a.state) {
      case 'wait':
      case 'bench':
        a.t += dt;
        if (a.wantsBoard && boardingOpen(P.trainId)) callToDoor(a);
        else if (!a.wantsBoard && a.t > a.patience) {
          if (a.seat) standFromBench(a, leave); else leave(a);
        } else idleLook(a, dt);
        break;
      case 'browse':
        a.t += dt;
        if (a.t > a.browseT) goWaitSpot(a);
        break;
      case 'enter':   /* llega cuando su tren ya está abordando: corre a la puerta */
        if (a.wantsBoard && !a.seat && Math.abs(a.g.position.x) <= 25 &&
            Math.abs(a.g.position.y - PLAT_Y) < 0.1 && boardingOpen(P.trainId)) {
          a.path = []; callToDoor(a); a.rig.running = a.state === 'toQueue';
        }
        break;
      case 'queue':
        a.rig.headYT = 0;
        if (!boardingOpen(a.trainId)) {
          if (a.trainId === 1 && (drive.manual || drive.riding)) waitHere(a);
          else { a.trainId = 0; a.door = -1; goWaitSpot(a); }
        }
        break;
      case 'ride':
        var S = simOf(a.where), x = trainWX(a.where);
        if (a.alight && a.stopSeq === S.stopSeq) {
          var coming = x * S.moveDir <= 0 || Math.abs(x) < 3.2;
          /* con las puertas abiertas en la estación baja quien falte, aunque
             el tren se haya parado pasado de la marca */
          var ready = boardingOpen(a.where) || (a.alightWhen === 'early' ? (coming && Math.abs(x) < 70) :
            a.alightWhen === 'brake' ? (coming && Math.abs(x) < 30 && S.speed < 5) :
            (stationStop(S) && S.door > 0.05));
          if (ready && boardingOpen(a.where)) {   /* por la puerta de su vagón que dé al andén */
            var dn = nearestCarDoor(a.where, a.g.position.x);
            if (dn >= 0) { a.door = dn; startAlight(a); }
          } else if (ready) startAlight(a);
        }
        else if (a.alight && a.stopSeq !== S.stopSeq) a.alight = false;
        a.lookT -= dt;
        if (a.lookT < 0) { a.rig.headYT = Math.random() < 0.6 ? 0 : (Math.random() - 0.5) * 0.9; a.lookT = 3 + Math.random() * 6; }
        break;
      case 'exitWait':
        var S2 = simOf(a.where);
        if (a.stopSeq !== S2.stopSeq) { var dd = a.door; returnToSlot(a); reflowExit(a.where, dd); }
        break;
      case 'watch':
        a.t += dt;
        if (a.t > a.watchT) patrolLeg(a);
        break;
    }
  }
  function updateAgent(a, dt) {
    var p = a.g.position;
    if (a.slide) {
      var s = a.slide; s.t += dt;
      var k = easeInOut(clamp01(s.t / s.dur));
      if (s.t > 0) { p.x = s.fx + (s.tx - s.fx) * k; p.z = s.fz + (s.tz - s.fz) * k; }
      a.rig.moving = false;
      if (s.t >= s.dur) { a.slide = null; if (s.cb) s.cb(a); }
    } else if (a.path.length) moveAlong(a, dt);
    else a.rig.moving = false;
    if (agents.indexOf(a) < 0) return;   /* se fue por la escalera */
    think(a, dt);
    var dy = a.yawT - a.g.rotation.y;
    dy = ((dy + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
    a.g.rotation.y += dy * Math.min(1, dt * 6);
    applyRig(a.rig, dt);
    if (a.where === 1 || a.where === 2) leanRider(a);
    else if (a.rig.spine.rotation.z) {   /* ya bajó del tren: sin inclinación lateral */
      a.rig.hip.position.x = 0; a.rig.spine.rotation.z = 0; a.rig.head.rotation.z = 0;
    }
  }
  /* Pasajeros: el empuje de la inercia los inclina (sentados poco y no
     contra el respaldo; agarrados del tubo, a medias) y a quien va de pie
     le saca un traspié con los brazos al frente para equilibrarse */
  function leanRider(a) {
    var r = a.rig, L = inertia[a.where].x * (a.lurchK || (a.lurchK = 0.75 + Math.random() * 0.5));
    var Y = trainOf(a.where).rotation.y + a.g.rotation.y;
    var f = -Math.sin(Y) * L, s = Math.cos(Y) * L;   /* empuje hacia su frente y hacia su derecha */
    var seated = r.pose === 'sit' || r.pose === 'sitphone', holds = r.pose === 'pole' || r.pose === 'rail';
    if (seated && f < 0) f *= 0.3;
    var k = seated ? 0.7 : (holds ? 0.8 : 1), slide = seated ? 0 : (holds ? 0.6 : 1);
    r.spine.rotation.x -= f * 0.15 * k;
    r.spine.rotation.z = -s * 0.15 * k;
    r.head.rotation.x -= f * 0.09;
    r.head.rotation.z = -s * 0.08;
    var st = 0.07 * slide / (r.scale || 1);
    r.hip.position.z -= f * st; r.hip.position.x = s * st;
    var arms = Math.min(0.9, Math.max(0, Math.abs(L) - 0.9) * 0.6) * slide;
    r.sL.rotation.x += arms; if (!holds) r.sR.rotation.x += arms;
  }
  /* Separación: quien camina esquiva a los demás en el andén */
  /* Separación y paso: quien camina se aparta de los demás y, si alguien
     viene de frente o está parado en su camino, se hace a SU derecha (los
     dos esquivan hacia lados contrarios y pasan). Vale en el andén y
     dentro de cada vagón. */
  /* Hasta dónde puede moverse alguien a lo ancho: andén (línea amarilla ↔
     fondo) o pasillo del vagón */
  function zLimits(a) {
    if (a.where === 'world') {
      if (!a.P || Math.abs(a.g.position.y - PLAT_Y) > 0.05 || Math.abs(a.g.position.x) > 26) return null;
      /* de la línea amarilla al frente de las bancas (no se suben a ellas) */
      var lim = a.P.ps > 0 ? [a.P.queueZ - 0.2, 3.58] : [-7.83, a.P.queueZ + 0.2];
      /* EXCEPCIÓN (bug de los atorados): las bocas de escalera quedan TRAS
         esa línea (A: z 3.9 > 3.58; B: z −7.95 < −7.83 en los extremos,
         donde no hay bancas). Con el clamp, el punto de ruta de la
         escalera era inalcanzable y la gente orbitaba atorada en la boca.
         Sin clamp si ya viene de la escalera o si su siguiente punto es ella. */
      var pz = a.g.position.z, nn = a.path && a.path[0];
      if (pz < lim[0] || pz > lim[1]) return null;
      if (nn && (nn.z < lim[0] || nn.z > lim[1])) return null;
      return lim;
    }
    /* vagón: pasillo entre los asientos; junto a una puerta, el vestíbulo */
    var tz = a.where === 1 ? TRAIN_Z : TRACK_B_Z, lx = a.g.position.x, w = 0.72;
    for (var i = 0; i < DOOR_X.length; i++) if (Math.abs(lx - DOOR_X[i]) < 1.0) w = 1.2;
    return [tz - w, tz + w];
  }
  function separate(dt) {
    /* Tú (en Caminar) eres un obstáculo que la gente SIEMPRE rodea: si su
       siguiente punto cae encima de ti lo recorre a un lado, se aparta si
       te tiene cerca y desde 2 m antes se abre por el lado contrario a ti. */
    var me = null;
    if (walk.active && !walk.seat) {
      if (!walk.inTrain) me = { where: 'world', x: walk.pos.x, y: walk.ground || PLAT_Y, z: walk.pos.z };
      else if (!walk.inTrain.l2) {
        var tid = walk.inTrain.z === TRAIN_Z ? 1 : 2;
        me = { where: tid, x: walk.pos.x - trainOf(tid).position.x, y: BODY_Y + FLOOR_DY, z: walk.pos.z };
      }
    }
    for (var i = 0; i < agents.length; i++) {
      var a = agents[i];
      if (!a.rig.moving || a.slide) continue;
      var p = a.g.position, n = a.path[0], fx = 0, fz = 0, fl = 0;
      if (n) { fx = n.x - p.x; fz = n.z - p.z; fl = Math.hypot(fx, fz); }
      if (me && me.where === a.where && Math.abs(p.y - me.y) < 0.8) {
        var mx = p.x - me.x, mz = p.z - me.z, md = Math.hypot(mx, mz);
        if (n) {
          var nd = Math.hypot(n.x - me.x, n.z - me.z);
          if (nd < 0.65) {   /* se recorre a lo largo del andén/pasillo, nunca hacia la vía */
            var sx = n.x - me.x >= 0 ? 1 : -1;
            n.x = me.x + sx * Math.sqrt(Math.max(0, 0.65 * 0.65 - (n.z - me.z) * (n.z - me.z))) + sx * 0.02;
          }
        }
        if (md < 0.75 && md > 1e-4) {
          var out = (0.75 - md) * Math.min(1, dt * 14);
          p.x += mx / md * out; p.z += mz / md * out;
        }
        if (fl > 0.05 && md < 2.2 && md > 1e-4) {
          var rx = -fz / fl, rz = fx / fl;
          var ahead = (-mx * fx - mz * fz) / (md * fl);
          if (ahead > 0.15) {
            var sgn = (-mx * rx - mz * rz) > 0 ? -1 : 1;     /* lado contrario a donde estás */
            /* si ese lado está cerrado (línea amarilla, fondo, pared del
               vagón) te rodea por el otro */
            var lim = zLimits(a), probe = p.z + sgn * rz * 0.45;
            if (lim && (probe < lim[0] + 0.1 || probe > lim[1] - 0.1)) sgn = -sgn;
            var step = (2.2 - md) * dt * 2.1;
            p.x += sgn * rx * step; p.z += sgn * rz * step;
          }
        }
      }
      if (a.state === 'board' || a.state === 'alightOut') continue;
      /* Los empujes de TODOS los vecinos se suman y se topan: sin tope, en
         una boca de escalera el empuje lateral de la multitud superaba el
         avance propio y la persona ya nunca alcanzaba su punto (órbitas).
         En escalera no hay paso lateral: cada quien va por su carril. */
      var px = 0, pz2 = 0, onStair = !!(a.seg && a.seg.stair);
      for (var j = 0; j < agents.length; j++) {
        var o = agents[j];
        if (o === a || o.where !== a.where) continue;
        var q = o.g.position, dx = p.x - q.x, dz = p.z - q.z, d2 = dx * dx + dz * dz;
        if (d2 > 1.44 || d2 < 1e-6 || Math.abs(p.y - q.y) > 0.6) continue;
        var d = Math.sqrt(d2);
        if (d < 0.55) { var push = (0.55 - d) * dt * 3; px += dx / d * push; pz2 += dz / d * push; }
        if (!onStair && fl > 0.45 && fl > d * 0.6) {
          var ahead2 = (-dx * fx - dz * fz) / (d * fl);       /* el otro está enfrente */
          if (ahead2 > 0.4) {
            var side = (1.2 - d) * dt * 2.4;
            px += (-fz / fl) * side; pz2 += (fx / fl) * side;   /* paso a la derecha */
          }
        }
      }
      var pl = Math.hypot(px, pz2), cap = a.speed * dt * 0.5;
      if (pl > cap) { px *= cap / pl; pz2 *= cap / pl; }
      p.x += px; p.z += pz2;
      /* nadie pisa la línea amarilla, ni se mete a bancas o asientos */
      if (a.state !== 'alighted') {
        var zl = zLimits(a);
        if (zl) p.z = THREE.MathUtils.clamp(p.z, zl[0], zl[1]);
        /* y dentro del tren, nadie cruza los mamparos de cabina (±12.90)
           aunque la multitud empuje junto a las puertas de los extremos */
        if (a.where === 1 || a.where === 2) p.x = THREE.MathUtils.clamp(p.x, -12.6, 12.6);
      }
    }
  }
  function updateNPC(dt) {
    simTime += dt;
    [sim, sim2].forEach(function (S) {
      var x = trainWX(S.id);
      if (Math.abs(x) < 45) {
        if (!S.near) { S.near = true; if (x * S.moveDir <= 0 || Math.abs(x) < 3.2) planAlighters(S.id); }
      } else if (S.near) {
        S.near = false; S.stopSeq++;
        var P = platOfTrain(S.id); P.density = rollDensity();   /* nueva oleada de gente */
      }
      var open = boardingOpen(S.id);
      if (open && !S.wasOpen) retargetAlighters(S.id);
      S.wasOpen = open;
      serviceDoors(S.id);
    });
    [PLAT.A, PLAT.B].forEach(function (P) {
      P.spawnT -= dt;
      if (P.spawnT > 0) return;
      var n = agents.filter(function (a) { return a.P === P && a.where === 'world' && !a.guard &&
        a.state !== 'leave' && a.state !== 'alighted'; }).length;
      if (n < Math.round(P.max * P.density)) spawnAgent(P);
      P.spawnT = 0.8 + Math.random() * 2.4;
    });
    agents.slice().forEach(function (a) { if (agents.indexOf(a) >= 0) updateAgent(a, dt); });
    separate(dt);
  }

  /* ---------- Modo conductor (vista Cabina) ----------
     Línea infinita: al pasar media distancia a la siguiente estación el
     tramo se recicla (la estación de adelante pasa a ser la de en medio) y
     la gente del andén se renueva: cada parada tiene otra gente.
     Manejo automático (ATO) activo al entrar: curva de frenado suave hasta
     la marca, espera a que termine el abordaje, cierra y sigue, sin fin.
     Cualquier mando manual lo desactiva. Interlock real: con puertas
     abiertas o a medio cerrar NO hay tracción. */
  var ATO_VMAX = 22.2, ATO_BRAKE = 0.95;   /* 80 km/h, la máxima de Metrorrey */
  /* Curva de tracción del MM-90/MM-05 (motor Siemens 262 kW, 1182 rpm
     nominal, engranes 5.625:1, ruedas de 740 mm): 1.0 m/s² hasta la
     velocidad base (~29 km/h) y luego potencia constante, a ∝ 1/v. */
  var TRAC_A = 1.0, TRAC_VB = 8.14;
  function tracMax(v) { return TRAC_A * Math.min(1, TRAC_VB / Math.max(0.01, Math.abs(v))); }
  /* Frenos (especificación Metrorrey): servicio 1.0 m/s² con tirón
     limitado (da/dt = 0.7 m/s³, también en tracción); emergencia 1.3 m/s²,
     neumático puro: entra de golpe y queda enclavado hasta detenerse. */
  var BRAKE_SVC = 1.0, BRAKE_EMG = 1.3, JERK_SVC = 0.7, JERK_EMG = 6;
  /* La emergencia frena igual a cualquier velocidad, pero cuánto zarandea
     a la gente depende de con cuánta velocidad se aplicó: proporcional
     hasta 40 km/h (pleno de ahí para arriba), con un mínimo de 0.2 */
  var EMG_FULL_V = 11.1;
  var drive = { manual: false, speed: 0, throttle: 0, brake: false, doorTarget: 0, laps: 0, lever: 0,
    ato: true, atoState: 'run', atoT: 0, aCmd: 0, served: false, quiet: 0, emerg: false, aMan: 0, emergSev: 1 };
  var leverEl = document.getElementById('lever');
  if (leverEl) leverEl.addEventListener('input', function () { drive.lever = parseInt(leverEl.value, 10); });
  /* Paneles de cabina y caminar: minimizados por defecto (solo velocidad y
     aviso); el botón despliega los controles completos */
  function wireMini(btnId, panelId, openTxt, closedTxt) {
    var b = document.getElementById(btnId), pnl = document.getElementById(panelId);
    if (!b || !pnl) return;
    b.addEventListener('click', function () {
      var mini = pnl.classList.toggle('mini');
      b.textContent = mini ? closedTxt : openTxt;
      b.setAttribute('aria-expanded', String(!mini));
      b.title = mini ? 'Mostrar controles' : 'Ocultar controles';
    });
  }
  /* Ajustes y ayuda: se cierran al tocar fuera o con Esc */
  document.addEventListener('pointerdown', function (e) {
    document.querySelectorAll('details[open]').forEach(function (d) { if (!d.contains(e.target)) d.open = false; });
  });
  window.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') document.querySelectorAll('details[open]').forEach(function (d) { d.open = false; });
  });
  wireMini('btnDriveHide', 'drivePanel', 'Ocultar ▾', 'Controles ▴');
  wireMini('btnWalkHide', 'walkPanel', '▾', '▴');
  var atoEl = document.getElementById('atoCheck');
  function setAto(on) {
    drive.ato = on; drive.aCmd = 0; drive.atoT = 0;
    drive.atoState = drive.doorTarget === 1 || sim.door > 0.02 ? 'dwell' : 'run';
    if (atoEl) atoEl.checked = on;
    if (on && leverEl) { leverEl.value = 0; drive.lever = 0; }
  }
  if (atoEl) atoEl.addEventListener('change', function () { setAto(atoEl.checked); });
  var driveSpeedEl = document.getElementById('driveSpeed');
  var driveMsgEl = document.getElementById('driveMsg');
  var btnDoorsEl = document.getElementById('btnDoors');
  var driveMsgHold = 0;
  function driveMsg(txt, warn, hold) {
    if (!driveMsgEl) return;
    var now = performance.now();
    if (hold) driveMsgHold = now + hold * 1000;
    else if (now < driveMsgHold) return;   /* un aviso puntual (puertas) se deja leer */
    if (driveMsgEl.textContent !== txt) driveMsgEl.textContent = txt;
    driveMsgEl.className = warn ? 'drive-msg warn' : 'drive-msg';
  }
  function setDoorTarget(open) {
    if (open && Math.abs(drive.speed) > 0.05) {
      driveMsg('Detén el tren para abrir las puertas', true, 2.5); return;
    }
    if (open && !platformDoors(1)) {   /* control de puertas: fuera del andén no abren */
      driveMsg('Fuera del andén: aquí las puertas no abren', true, 2.5); return;
    }
    drive.doorTarget = open ? 1 : 0;
    if (!open) abortBoarding(1);
  }
  function manualDoor(open) {   /* abrir/cerrar a mano también quita el automático */
    if (drive.ato) setAto(false);
    setDoorTarget(open);
  }
  if (btnDoorsEl) btnDoorsEl.addEventListener('click', function () {
    manualDoor(drive.doorTarget < 0.5);
  });
  function holdButton(id, on, off) {
    var el = document.getElementById(id); if (!el) return;
    function dn(e) { e.preventDefault(); el.classList.add('held'); on(); }
    function up() { el.classList.remove('held'); off(); }
    el.addEventListener('pointerdown', dn);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointerleave', up);
    el.addEventListener('pointercancel', up);
  }
  holdButton('btnAccel', function () { drive.throttle = 1; }, function () { if (drive.throttle > 0) drive.throttle = 0; });
  holdButton('btnReverse', function () { drive.throttle = -1; }, function () { if (drive.throttle < 0) drive.throttle = 0; });
  holdButton('btnBrake', function () { drive.brake = true; }, function () { drive.brake = false; });
  /* Freno de emergencia: se aplica en marcha y solo se restablece con el
     tren detenido (otra vez E o el mismo botón) */
  var btnEmergEl = document.getElementById('btnEmerg');
  function emergency() {
    if (drive.emerg) {
      if (Math.abs(drive.speed) < 0.05) { drive.emerg = false; driveMsg('Freno de emergencia restablecido', false); }
      return;
    }
    drive.emerg = true;
    drive.emergSev = THREE.MathUtils.clamp(Math.abs(drive.speed) / EMG_FULL_V, 0.2, 1);
    if (drive.ato) setAto(false);
  }
  if (btnEmergEl) btnEmergEl.addEventListener('click', emergency);
  var keysDown = {};
  window.addEventListener('keydown', function (e) {
    if (!drive.manual) return;
    keysDown[e.code] = true;
    if (e.code === 'KeyO') manualDoor(true);
    if (e.code === 'KeyC') manualDoor(false);
    if (e.code === 'KeyE' && !e.repeat) emergency();
    if (['ArrowUp', 'ArrowDown', 'Space'].indexOf(e.code) >= 0) e.preventDefault();
  });
  window.addEventListener('keyup', function (e) { keysDown[e.code] = false; });

  function enterManual() {
    drive.riding = false;
    drive.manual = true; drive.speed = 0; drive.throttle = 0; drive.brake = false;
    drive.emerg = false; drive.aMan = 0;
    drive.doorTarget = sim.door > 0.5 ? 1 : 0;
    /* Si el tren estaba lejos, arranca detenido en la marca de Cuauhtémoc */
    if (Math.abs(sim.trainX) > TILE_HALF) sim.trainX = 0;
    drive.served = Math.abs(sim.trainX) < 3.2;
    setPlaying(true); setAto(true);
    driveMsg('Automático activo: conduce solo, para en cada estación y sigue. Toca un mando para manejar tú.', false);
  }
  function exitManual() {
    drive.manual = false; drive.speed = 0; drive.throttle = 0; drive.emerg = false; drive.aMan = 0;
    agents.forEach(function (a) {   /* intercambio a medias: cada quien a su lugar */
      if (a.where === 'world' && a.trainId === 1 && BOARD_STATES.indexOf(a.state) >= 0 && a.state !== 'board') {
        a.trainId = 0; a.door = -1; goWaitSpot(a);
      }
    });
    if (sim2.base !== 0) enterCycle(sim2, 'away');
    if (Math.abs(sim.trainX) < 3.2) {   /* en la estación: termina de abordar o sale */
      sim.trainX = 0; enterCycle(sim, sim.door > 0.02 ? 'dwell' : 'departing');
    } else enterCycle(sim, 'away');
    setPlaying(true);
  }
  /* Distancia a la siguiente marca de parada hacia adelante */
  function distToStop() {
    var d = ((-sim.trainX) % TILE_LEN + TILE_LEN) % TILE_LEN;
    if (drive.served && (d < 6 || d > TILE_LEN - 6)) d = TILE_LEN - sim.trainX;
    return d;
  }
  function onWrap(dir) {   /* el tren pasó al tramo siguiente (dir = +1) o anterior */
    sim2.base -= dir * TILE_LEN;
    shiftCity(dir);
    repopulatePlatforms();
    drive.laps++;
  }
  function atoStep(dt) {
    var d = distToStop(), msgKm = Math.round(Math.abs(drive.speed) * 3.6);
    switch (drive.atoState) {
      case 'run':
        var v = drive.speed, dEff = Math.max(0.01, d);
        if (d < 0.003 || (v < 0.03 && d < 0.03) || (!drive.served && d > TILE_LEN - 1.5 && v < 0.8)) {
          /* ya está en la marca (milímetros) y casi sin velocidad: sin brinco */
          if (d < 0.05) { sim.trainX += d; if (sim.trainX > TILE_HALF) { sim.trainX -= TILE_LEN; onWrap(1); } }
          drive.speed = 0; drive.aCmd = 0; drive.served = true;
          drive.atoState = 'open'; drive.atoT = 0; setDoorTarget(true);
          return 0;
        }
        /* Frenado: la desaceleración que hace falta para parar en la marca
           (v²/2d), descontando lo que se recorre mientras el freno entra con
           tirón limitado. En cuanto llega a la de servicio se sigue exacta. */
        var tRamp = Math.max(0, drive.aCmd + ATO_BRAKE) / JERK_SVC;
        var aReq = v > 0 ? v * v / (2 * Math.max(0.01, dEff - v * tRamp * 0.5)) : 0, aDes, jerkK = 1;
        if (d < 5) {
          /* Últimos metros: curva v = √(2·0.6·d) que llega a cero JUSTO en
             la marca (desaceleración pareja, sin quedarse corto ni saltar) */
          var vEnd = Math.min(2.4, Math.sqrt(1.2 * dEff));
          aDes = v > vEnd ? -Math.min(1.5, aReq) : THREE.MathUtils.clamp((vEnd - v) * 1.5, -1.5, 0.4);
          jerkK = 3;
        } else if (aReq > ATO_BRAKE) aDes = -Math.min(1.5, aReq);
        else aDes = THREE.MathUtils.clamp((ATO_VMAX - v) * 1.2, -0.6, tracMax(v));
        /* Sin tirones: el da/dt de servicio (0.7 m/s³); en los últimos metros
           más ágil para clavar la marca */
        var jerk = (jerkK > 1 ? (aDes < drive.aCmd ? 3.2 : 1.6) * jerkK : JERK_SVC) * dt;
        drive.aCmd += THREE.MathUtils.clamp(aDes - drive.aCmd, -jerk, jerk);
        var braking = aDes < -0.05;
        driveMsg(braking ? 'Automático: frenando para Cuauhtémoc · ' + Math.round(d) + ' m' :
          (v < ATO_VMAX - 0.6 ? 'Automático: acelerando · Cuauhtémoc en ' + Math.round(d) + ' m' :
          'Automático: ' + msgKm + ' km/h · Cuauhtémoc en ' + Math.round(d) + ' m'), false);
        return drive.aCmd;
      case 'open':
        driveMsg('Automático: abriendo puertas del lado del andén', false);
        if (sim.door >= 1) { drive.atoState = 'dwell'; drive.atoT = 0; drive.quiet = 0; }
        return 0;
      case 'dwell':
        drive.atoT += dt;
        drive.quiet = exchangeBusy(1) ? 0 : (drive.quiet || 0) + dt;
        var c = exchangeCounts(1);
        driveMsg('Automático: abordando — bajan ' + c.out + ' · suben ' + c.inn + ' · mira el espejo a tu derecha', false);
        if ((drive.atoT > DWELL_MIN && drive.quiet > 1.5) || drive.atoT > DWELL_MAX) {
          setDoorTarget(false); drive.atoState = 'close'; drive.atoT = 0;
        }
        return 0;
      case 'close':
        driveMsg('Automático: cerrando puertas · siguiente: Cuauhtémoc', false);
        if (sim.door <= 0) { drive.atoT += dt; if (drive.atoT > 1.2) { drive.atoState = 'run'; drive.aCmd = 0; } }
        return 0;
    }
    return 0;
  }
  function updateManual(dt, elapsed) {
    var keyThrottle = (keysDown.KeyW || keysDown.ArrowUp) ? 1 :
      ((keysDown.KeyS || keysDown.ArrowDown) ? -1 : drive.throttle);
    if (keyThrottle === 0 && drive.lever > 0) keyThrottle = drive.lever / 3;
    else if (keyThrottle === 0 && drive.lever === -2) keyThrottle = -1;
    var braking = drive.brake || keysDown.Space || drive.lever === -1;
    if (drive.ato && (keyThrottle !== 0 || braking)) {
      setAto(false);
      driveMsg('Automático desactivado: tienes el control', true);
    }
    var doorsLocked = (sim.door < 0.02 && drive.doorTarget === 0);
    var a = 0, v0 = drive.speed, stopped = Math.abs(v0) < 0.05, pDoors = platformDoors(1);
    var pdTxt = pDoors < 4 ? ' (' + pDoors + ' de 4 puertas frente al andén)' : '';
    if (drive.emerg) {
      a = -Math.sign(v0) * BRAKE_EMG;
      driveMsg(stopped ? 'Detenido por freno de emergencia · E para restablecer' :
        '¡FRENO DE EMERGENCIA! · ' + Math.round(Math.abs(v0) * 3.6) + ' km/h', true);
    } else if (drive.ato) {
      a = atoStep(dt);
      if (!doorsLocked) a = 0;
    } else if (!doorsLocked) {
      if (keyThrottle !== 0) driveMsg('Cierra las puertas para poder avanzar (tecla C)', true);
      else if (sim.door > 0.02) driveMsg('Puertas abiertas' + pdTxt + ' — mira el espejo del andén a tu derecha', false);
      a = -Math.sign(v0) * BRAKE_EMG;               /* freno de interlock */
    } else if (braking) {
      a = -Math.sign(v0) * BRAKE_SVC;
      driveMsg('Frenando…', false);
    } else if (keyThrottle > 0) {
      a = tracMax(v0) * keyThrottle;
      driveMsg('Tracción → Exposición' + (drive.lever > 0 && !keysDown.KeyW ? ' · palanca ' + drive.lever : ''), false);
    } else if (keyThrottle < 0) {
      a = v0 > 0.05 ? -BRAKE_SVC : -0.55; driveMsg('Reversa (máx. 14 km/h)', false);
    } else {
      driveMsg(Math.abs(v0) > 0.1 ? 'Deriva — sin tracción' :
        (pDoors ? 'En Cuauhtémoc' + pdTxt + ': pulsa O para abrir puertas' : 'Detenido: W para avanzar'), false);
    }
    /* El mando llega con tirón limitado; la emergencia, casi de golpe */
    if (drive.ato && !drive.emerg) drive.aMan = a;
    else {
      var jk = (drive.emerg || !doorsLocked ? JERK_EMG : JERK_SVC) * dt;
      drive.aMan += THREE.MathUtils.clamp(a - drive.aMan, -jk, jk);
      a = drive.aMan;
    }
    drive.speed += a * dt;
    if (!drive.ato) {
      /* Resistencia al avance (rodadura + aire), poca como en un tren real:
         ~0.05 m/s² a 80 km/h. Antes era 0.1·v y topaba la tracción en ~38 km/h. */
      var res = (0.012 + 0.00008 * drive.speed * drive.speed) * dt;
      drive.speed = Math.abs(drive.speed) > res ? drive.speed - Math.sign(drive.speed) * res : 0;
    }
    drive.speed = THREE.MathUtils.clamp(drive.speed, -3.9, ATO_VMAX);
    /* Con freno aplicado el tren se queda en cero, no cruza a reversa */
    if ((drive.emerg || (!drive.ato && braking)) && (stopped || v0 * drive.speed <= 0)) { drive.speed = 0; drive.aMan = 0; }
    if (!doorsLocked) drive.speed = 0;
    if (btnEmergEl && btnEmergEl.classList.contains('on') !== drive.emerg) btnEmergEl.classList.toggle('on', drive.emerg);
    sim.trainX += drive.speed * dt;
    if (sim.trainX > TILE_HALF) { sim.trainX -= TILE_LEN; onWrap(1); }
    else if (sim.trainX < -TILE_HALF) { sim.trainX += TILE_LEN; onWrap(-1); }
    var dS = distToStop();
    if (dS > 12 && dS < TILE_LEN - 12) drive.served = false;
    sim.speed = Math.abs(drive.speed); sim.moveDir = drive.speed >= 0 ? 1 : -1;
    /* Puertas animadas hacia su objetivo; solo abren detenido */
    var step = dt / 1.3;
    if (drive.doorTarget > sim.door) sim.door = Math.min(drive.doorTarget, sim.door + step);
    else if (drive.doorTarget < sim.door) sim.door = Math.max(drive.doorTarget, sim.door - step);
    var atStation = pDoors > 0;
    if (btnDoorsEl) btnDoorsEl.textContent = drive.doorTarget ? 'Cerrar puertas (C)' : 'Abrir puertas (O)';
    var kmh = Math.round(Math.abs(drive.speed) * 3.6);
    if (driveSpeedEl) driveSpeedEl.textContent = kmh + ' km/h' + (drive.speed < -0.05 ? ' R' : '');
    setStatus(drive.riding ? 'Viajando a bordo' : (drive.emerg ? 'FRENO DE EMERGENCIA' :
      (drive.ato ? 'Conducción automática' : 'Modo conductor')),
      (atStation ? 'Estación Cuauhtémoc' : 'Siguiente: Cuauhtémoc · ' + Math.round(dS) + ' m') +
      ' · ' + kmh + ' km/h' + (doorsLocked ? '' : ' · PUERTAS ABIERTAS'),
      doorsLocked && !drive.emerg ? '#1b4f9c' : '#d8432a');
    setLED(atStation ? 'CUAUHTÉMOC' : 'EN RUTA', 'EXPOSICIÓN');
    train.position.y = 0; train.rotation.x = Math.abs(drive.speed) > 0.2 ? Math.sin(elapsed * 2.2) * 0.0012 : 0;
    if (headSpot) headSpot.intensity = Math.abs(drive.speed) > 0.2 ? 1.5 : 0.45;
  }

  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    sim.state = 'dwell'; sim.trainX = 0; sim.door = 1;
    sim2.state = 'dwell'; sim2.trainX = 0; sim2.door = 1;
    setPlaying(false);
  }

  function playerRiding(id) {
    return walk.active && !!walk.inTrain && !walk.inTrain.l2 && walk.inTrain.z === (id === 1 ? TRAIN_Z : TRACK_B_Z);
  }
  /* Viajar caminando dentro del tren 1: el tren recorre la línea infinita
     en automático (igual que en Cabina, sin brincos de tramo) y conserva a
     sus pasajeros; al bajarte en una estación vuelve al ciclo normal. */
  function enterRide() {
    drive.riding = true; drive.throttle = 0; drive.brake = false;
    var moving = sim.state === 'arriving' || sim.state === 'departing';
    drive.speed = moving ? sim.speed * sim.dir : 0;
    drive.doorTarget = sim.door > 0.02 ? 1 : 0;
    drive.served = Math.abs(sim.trainX) < 3.2 && !moving;
    if (sim.state === 'away') sim.trainX = THREE.MathUtils.clamp(sim.trainX, -TILE_HALF, TILE_HALF);
    setAto(true);
    /* Ya en marcha (te subiste con un enlace mientras llega o sale): el
       automático sigue con el freno o la tracción que ya traía; empezar de
       cero con tirón limitado lo hacía pasarse de la estación */
    if (sim.state === 'arriving') {
      var need = drive.speed * drive.speed / (2 * Math.max(0.5, distToStop()));
      drive.aCmd = need > 0.6 ? -Math.min(1.5, need) : 0;
    } else if (moving) drive.aCmd = tracMax(drive.speed);
    if (sim.state === 'closing') { drive.doorTarget = 0; drive.atoState = 'close'; drive.atoT = 0; }
  }
  function exitRide() {
    drive.riding = false; drive.speed = 0;
    if (sim2.base !== 0) enterCycle(sim2, 'away');
    if (Math.abs(sim.trainX) < 3.2) {
      sim.trainX = 0; enterCycle(sim, sim.door > 0.02 ? 'dwell' : 'departing');
    } else enterCycle(sim, 'away');
  }
  function updateSim(dt, elapsed) {
    if (manualPending && !drive.manual) enterManual();
    else if (!manualPending && drive.manual) exitManual();
    var riding = !drive.manual && playerRiding(1) && sim.playing;
    if (riding && !drive.riding) enterRide();
    else if (!riding && drive.riding && !drive.manual) exitRide();
    if (drive.manual || drive.riding) { updateManual(dt, elapsed); return; }
    if (!sim.playing) {
      setStatus('Animación en pausa', 'Pulsa Reanudar para continuar', '#8a6d00');
      return;
    }
    stepCycle(sim, dt);
    if (zone.under || l2Ride) l2Status();
    else if (playerRiding(2)) ride2Status();
    else cycleStatus();
    /* Balanceo leve solo en movimiento */
    var moving = (sim.state === 'arriving' || sim.state === 'departing');
    train.position.y = 0; train.rotation.x = moving ? Math.sin(elapsed * 2.2) * 0.0012 : 0;
    if (headSpot) headSpot.intensity = moving ? 1.5 : 0.45;
  }

  function applyDoors() {
    for (var i = 0; i < doorLeaves.length; i++) {
      var d = doorLeaves[i];
      var S = d.trainId === 1 ? sim : (d.trainId === 2 ? sim2 : l2SimOf(d.trainId));
      var amt = (d.side === d.platSide) ? S.door : 0;
      d.mesh.position.x = d.closedX + d.dir * 0.6 * amt;  /* solo lado andén */
    }
  }

  function updateClock() {
    var now = new Date();
    var s = now.getSeconds() + now.getMilliseconds() / 1000;
    var m = now.getMinutes() + s / 60;
    var h = (now.getHours() % 12) + m / 60;
    for (var i = 0; i < clockHands.length; i++) {
      var hand = clockHands[i];
      var ang = hand.kind === 's' ? s / 60 : hand.kind === 'm' ? m / 60 : h / 12;
      hand.pivot.rotation.z = -ang * Math.PI * 2;
    }
  }

  /* Reflejo del entorno moderado: cristales casi sin velo, metales con brillo */
  scene.traverse(function (o) {
    if (!o.isMesh) return;
    (Array.isArray(o.material) ? o.material : [o.material]).forEach(function (m) {
      if (!m.isMeshStandardMaterial) return;
      m.envMapIntensity = m.userData.polished ? 1.0 :
        (m.transparent && m.opacity < 0.95 ? 0.22 : (m.metalness > 0.5 ? 0.9 : 0.5));
    });
  });
  personMat.envMapIntensity = personSkinMat.envMapIntensity = 0.35;
  /* Al entrar por primera vez el escenario es siempre de noche (el
     selector «Clima y luz» queda sincronizado en Noche), salvo que la
     URL compartida traiga otro (?escenario=lluvia, etc.). */
  setScenario(SCENARIOS[URLP.get('escenario')] ? URLP.get('escenario') : 'noche');
  maybeSyncUrl(true);
  resetStation();
  var clock = new THREE.Clock();
  var prevTrainX = sim.trainX, prevTrain2X = trainWX(2);
  renderer.setAnimationLoop(function () { frame(clock.getDelta(), true); });
  /* Calidad adaptable: si los cuadros tardan (>24 ms) baja la resolución
     interna por pasos; si sobra (<14 ms sostenido) la regresa. */
  var ftAvg = 16, ftT = 0, frameNo = 0;
  function adaptQuality(rawDt) {
    ftAvg += (Math.min(rawDt, 0.1) * 1000 - ftAvg) * 0.05; ftT += rawDt;
    if (ftT < 4) return;   /* solo si se sostiene: un pico al llegar a estación no cambia nada */
    if (ftAvg > 28 && curPR > 0.7) { curPR = Math.max(0.7, curPR - 0.1); renderer.setPixelRatio(curPR); ftT = 0; }
    else if (ftAvg < 13 && curPR < maxPR) { curPR = Math.min(maxPR, curPR + 0.1); renderer.setPixelRatio(curPR); ftT = -6; }
    else ftT = 1.5;
  }
  function frame(rawDt, draw) {   /* un paso de simulación (+ dibujo) */
    var dt = Math.min(rawDt, 0.05);
    if (draw) { adaptQuality(rawDt); renderer.shadowMap.needsUpdate = (frameNo++ % 2 === 0); }
    if (cabDriver) {   /* en Cabina el conductor eres tú: solo sale en el espejo */
      var cabLayer = manualPending ? 1 : 0;
      if (cabDriver.userData.layer !== cabLayer) { setLayer(cabDriver, cabLayer); cabDriver.userData.layer = cabLayer; }
    }
    var l2Drv = cabDriverOf[3];   /* viajando en la Línea 2 vas en su asiento */
    if (l2Drv && (l2Drv.userData.layer || 0) !== (l2Ride ? 1 : 0)) { setLayer(l2Drv, l2Ride ? 1 : 0); l2Drv.userData.layer = l2Ride ? 1 : 0; }
    updatePlayerBody(dt);
    /* Desde adentro el parabrisas casi no vela; desde afuera se ve oscuro */
    MAT.cabGlass.opacity = (manualPending || l2Ride) ? 0.12 : 0.58;
    var elapsed = clock.elapsedTime;
    var running = sim.playing || drive.manual;   /* viajando dentro también corre (requiere reproducir) */
    updateSim(dt, elapsed);
    if (running) stepCycle(sim2, dt);
    var x1 = sim.trainX, x2 = trainWX(2);
    var dx = x1 - prevTrainX; prevTrainX = x1;
    var dx2 = x2 - prevTrain2X; prevTrain2X = x2;
    if (dt > 0) {
      stepInertia(inertia[1], dx / dt, dt, drive.emerg ? drive.emergSev : 1);
      stepInertia(inertia[2], dx2 / dt, dt);
    }
    train.position.x = x1; train2.position.x = x2;
    /* Fuera de escena (entre ciclos) el tren no se dibuja, salvo si viajas dentro */
    var rideZ = walk.active && walk.inTrain && !walk.inTrain.l2 ? walk.inTrain.z : null;
    train.visible = drive.manual || followTrain || sim.state !== 'away' || rideZ === TRAIN_Z;
    train2.visible = sim2.state !== 'away' || rideZ === TRACK_B_Z;
    if (Math.abs(dx2) < 50) for (var wi = 0; wi < wheelPivots2.length; wi++) {
      wheelPivots2[wi].rotation.z -= dx2 / 0.34;
    }
    if (walk.active && walk.inTrain && !walk.inTrain.l2) {
      var nearA = Math.abs(walk.pos.z - TRAIN_Z) < Math.abs(walk.pos.z - TRACK_B_Z);
      walk.pos.x += nearA ? dx : dx2;   /* viajas dentro: el tren te lleva */
    }
    if (dx !== 0) {
      var wheelDx = Math.abs(dx) > 50 ? drive.speed * dt : dx; /* salto del reciclaje */
      for (var i = 0; i < wheelPivots.length; i++) wheelPivots[i].rotation.z -= wheelDx / 0.34;
      if (followTrain) { camTarget.x += dx; updateCamera(); }
    }
    if (running) updateNPC(dt);
    /* Línea 2: corre con la animación (o siempre que viajes en ella) */
    var l2Run = running || l2Ride || !!l2RidingSim();
    if (l2Run) { l2Sims.forEach(function (S) { stepL2(S, dt); }); updateL2Walkers(dt); }
    l2Sims.forEach(function (S) {
      var lx = wrapL2(S.s), dL = lx - S.g.position.x;
      S.g.position.x = lx;
      /* viajas a bordo caminando: el tren te lleva (también en su reciclaje) */
      if (walk.active && walk.inTrain && walk.inTrain.S === S && !walk.seat) walk.pos.z -= dL;
      var wl = wheelsL2[S.id], dw = S.speed * dt / 0.34;
      if (dw) for (var k = 0; k < wl.length; k++) wl[k].rotation.z -= S.dir * dw;
    });
    if (l2Ride) updateCamera();
    if (l2RidingSim() && !sim.playing) l2Status();
    applyDoors();
    updatePantoSparks(dt);
    updateWalk(dt);
    if (drive.manual) updateCamera();
    updateArrowKeys(dt);   /* flechas: girar/desplazar la vista (antes del sync de URL) */
    /* Cerro y sol acompañan la vista: el cerro está lejísimos y la sombra
       se calcula donde se está mirando (pasos de 4 m, sin parpadeo) */
    farBg.position.x = (drive.manual || drive.riding) ? sim.trainX : 0;
    var fx = drive.manual ? sim.trainX + 22 : (walk.active ? walk.pos.x : camTarget.x);
    fx = Math.round(THREE.MathUtils.clamp(fx, -400, 400) / 4) * 4;
    sun.target.position.set(fx, 0, 0);
    sun.position.set(fx + sunOff[0], sunOff[1], sunOff[2]);
    if (rain) rain.position.x = camera.position.x;
    updateRain(Math.min(rawDt, 0.25));
    updateRoofs(Math.min(rawDt, 0.25));
    updateRainGlass(Math.min(rawDt, 0.25));   /* tras los techos: manda su visible/depthWrite */
    maybeSyncUrl(false);   /* la URL sigue a la cámara (a lo más cada 600 ms) */
    updateZone();
    if (zone.under && draw) renderer.shadowMap.needsUpdate = false;   /* sin sol bajo tierra */
    if (subte.visible) updateL2People(Math.min(rawDt, 0.1));
    updateMirrors();
    updateClock();
    if (draw) { renderer.render(scene, camera); tickViewLoader(); }
  }
})();
