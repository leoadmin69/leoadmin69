// Le « noyau » 3D de l'IA : une sphère d'énergie holographique qui réagit à son état.
// États : idle (repos), listening (écoute), thinking (réflexion), speaking (parole).
// Utilise Three.js (chargé par la page). Si la 3D n'est pas disponible, un noyau en CSS prend le relais.
(function () {
  const STATES = {
    idle:      { color: 0x4de8ff, color2: 0x7c5cff, speed: 0.35, amp: 0.10, pulse: 0.0, spin: 0.25 },
    listening: { color: 0x3dffb0, color2: 0x4de8ff, speed: 0.9,  amp: 0.20, pulse: 0.6, spin: 0.5 },
    thinking:  { color: 0xa46bff, color2: 0xff4fd8, speed: 1.8,  amp: 0.16, pulse: 0.2, spin: 1.6 },
    speaking:  { color: 0x4de8ff, color2: 0xffffff, speed: 1.2,  amp: 0.30, pulse: 1.0, spin: 0.7 },
  };
  const el = document.createElement('div');
  el.className = 'nova-core';
  let target = STATES.idle;
  let stateName = 'idle';

  const api = {
    el,
    setState(name) { if (STATES[name]) { stateName = name; target = STATES[name]; el.dataset.state = name; } },
    get state() { return stateName; },
  };
  window.NovaCore = api;
  el.dataset.state = 'idle';

  function fallback() { el.classList.add('fallback'); el.innerHTML = '<span></span><span></span><span></span>'; }
  if (!window.THREE) return fallback();

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'low-power' });
  } catch (e) { return fallback(); }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setClearColor(0x000000, 0);
  el.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 50);
  camera.position.z = 7.2;
  const group = new THREE.Group();
  scene.add(group);

  // --- Cœur : sphère d'énergie déformée, avec halo sur les bords (effet Fresnel) ---
  const uniforms = {
    uTime: { value: 0 }, uAmp: { value: 0.1 }, uPulse: { value: 0 },
    uColor: { value: new THREE.Color(STATES.idle.color) }, uColor2: { value: new THREE.Color(STATES.idle.color2) },
  };
  const core = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 5), new THREE.ShaderMaterial({
    uniforms, transparent: true,
    vertexShader: `
      uniform float uTime; uniform float uAmp; uniform float uPulse;
      varying vec3 vNormal; varying vec3 vView; varying float vDisp;
      float wave(vec3 p) {
        return sin(p.x * 3.1 + uTime * 1.3) * sin(p.y * 2.7 - uTime * 1.1) * sin(p.z * 3.3 + uTime * 0.9)
             + 0.5 * sin(p.x * 6.3 - uTime * 2.1) * sin(p.y * 5.9 + uTime * 1.7);
      }
      void main() {
        float d = wave(normal) * uAmp + uPulse * 0.06 * sin(uTime * 9.0);
        vDisp = d;
        vec3 pos = position + normal * d;
        vec4 mv = modelViewMatrix * vec4(pos, 1.0);
        vNormal = normalize(normalMatrix * normal);
        vView = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      uniform vec3 uColor; uniform vec3 uColor2; uniform float uTime;
      varying vec3 vNormal; varying vec3 vView; varying float vDisp;
      void main() {
        float fresnel = pow(1.0 - abs(dot(normalize(vNormal), normalize(vView))), 2.2);
        vec3 col = mix(uColor * 0.25, uColor2, clamp(vDisp * 3.0 + 0.35, 0.0, 1.0) * 0.6);
        col += uColor * fresnel * 1.6;
        float scan = 0.92 + 0.08 * sin(gl_FragCoord.y * 1.4 + uTime * 6.0);
        gl_FragColor = vec4(col * scan, 0.55 + fresnel * 0.45);
      }`,
  }));
  group.add(core);

  // --- Cage filaire ---
  const lineMat = new THREE.LineBasicMaterial({ color: STATES.idle.color, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending });
  const cage = new THREE.LineSegments(new THREE.WireframeGeometry(new THREE.IcosahedronGeometry(1.45, 1)), lineMat);
  group.add(cage);

  // --- Anneaux en orbite ---
  const ringMat = new THREE.MeshBasicMaterial({ color: STATES.idle.color, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending });
  const rings = [[1.95, 0.012, 1.2, 0.3], [2.2, 0.008, -0.6, 1.1], [2.45, 0.006, 0.4, -0.8]].map(([r, t, rx, ry]) => {
    const m = new THREE.Mesh(new THREE.TorusGeometry(r, t, 8, 120), ringMat);
    m.rotation.set(rx, ry, 0);
    group.add(m);
    return m;
  });

  // --- Particules ---
  const N = 700;
  const pos = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) {
    const r = 1.7 + Math.random() * 1.1;
    const th = Math.random() * Math.PI * 2;
    const ph = Math.acos(2 * Math.random() - 1);
    pos.set([r * Math.sin(ph) * Math.cos(th), r * Math.sin(ph) * Math.sin(th), r * Math.cos(ph)], i * 3);
  }
  const pGeo = new THREE.BufferGeometry();
  pGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const pMat = new THREE.PointsMaterial({ color: STATES.idle.color, size: 0.035, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false });
  const particles = new THREE.Points(pGeo, pMat);
  group.add(particles);

  // --- Animation ---
  const cur = { speed: 0.35, amp: 0.1, pulse: 0, spin: 0.25 };
  const cTarget = new THREE.Color();
  const reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  let t = 0;
  let last = performance.now();
  let size = 0;

  function resize() {
    const s = Math.round(Math.min(el.clientWidth, el.clientHeight));
    if (!s || s === size) return;
    size = s;
    renderer.setSize(s, s, false);
  }
  if (window.ResizeObserver) new ResizeObserver(resize).observe(el);

  function frame(now) {
    requestAnimationFrame(frame);
    if (document.hidden || !el.isConnected) { last = now; return; }
    resize();
    if (!size) return;
    const dt = Math.min((now - last) / 1000, 0.05) * (reduce ? 0.25 : 1);
    last = now;
    const k = 1 - Math.pow(0.02, dt); // transition douce entre les états
    for (const key of ['speed', 'amp', 'pulse', 'spin']) cur[key] += (target[key] - cur[key]) * k;
    t += dt * (0.6 + cur.speed);
    uniforms.uTime.value = t;
    uniforms.uAmp.value = cur.amp;
    uniforms.uPulse.value = cur.pulse;
    uniforms.uColor.value.lerp(cTarget.setHex(target.color), k);
    uniforms.uColor2.value.lerp(cTarget.setHex(target.color2), k);
    lineMat.color.copy(uniforms.uColor.value);
    ringMat.color.copy(uniforms.uColor.value);
    pMat.color.copy(uniforms.uColor.value);

    const beat = 1 + cur.pulse * 0.05 * Math.sin(t * 7);
    core.scale.setScalar(beat);
    core.rotation.y += dt * 0.2;
    cage.rotation.x += dt * 0.15 * (1 + cur.spin);
    cage.rotation.y -= dt * 0.22 * (1 + cur.spin);
    rings[0].rotation.z += dt * 0.6 * (0.4 + cur.spin);
    rings[1].rotation.x += dt * 0.45 * (0.4 + cur.spin);
    rings[2].rotation.y -= dt * 0.35 * (0.4 + cur.spin);
    particles.rotation.y += dt * 0.08 * (1 + cur.spin);
    particles.rotation.x = Math.sin(t * 0.2) * 0.2;
    group.rotation.x = Math.sin(t * 0.25) * 0.12;
    renderer.render(scene, camera);
  }
  requestAnimationFrame(frame);
})();
