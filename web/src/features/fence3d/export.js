const THREE_VERSION = "0.186.1";
const MODULE_SHIMS_VERSION = "2.8.4";

function bytesToBase64(value) {
  const bytes = value instanceof Uint8Array ? value : new Uint8Array(value);
  const chunks = [];
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    chunks.push(String.fromCharCode(...bytes.subarray(offset, offset + 0x8000)));
  }
  return btoa(chunks.join(""));
}

function exportName(value, fallback = "chain-link-fence") {
  const cleaned = String(value || "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase().slice(0, 64);
  return cleaned || fallback;
}

export async function createOtk3dArchive({ glb, planPng, design, metadata = {} }) {
  const { zipSync, strToU8 } = await import("fflate");
  const hasPlan = planPng instanceof Uint8Array && planPng.length > 0;
  const manifest = {
    format: "OpenTakeoff 3D project",
    formatId: "otk3d",
    formatVersion: 1,
    createdAt: new Date().toISOString(),
    model: "scene/fence.glb",
    design: "design.json",
    groundPlan: hasPlan ? "assets/ground-plan.png" : null,
    groundPlanIncluded: hasPlan,
  };
  const files = {
    "manifest.json": strToU8(JSON.stringify(manifest, null, 2)),
    "scene/fence.glb": glb instanceof Uint8Array ? glb : new Uint8Array(glb),
    "design.json": strToU8(JSON.stringify({ ...metadata, design }, null, 2)),
  };
  if (hasPlan) files["assets/ground-plan.png"] = planPng;
  return zipSync(files, { level: 1 });
}

export function createStandaloneViewer(glb, title = "OpenTakeoff 3D Fence", quantities = []) {
  const encoded = bytesToBase64(glb);
  const safeTitle = JSON.stringify(String(title)).replace(/</g, "\\u003c");
  const safeQuantities = JSON.stringify(quantities).replace(/</g, "\\u003c").replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");
  const cdn = "https://cdn.jsdelivr.net/npm/three@" + THREE_VERSION;
  const html = [
    "<!doctype html>",
    '<html lang="en"><head><meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">',
    "<title>" + String(title).replace(/[&<>"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[char]) + "</title>",
    "<style>",
    "*{box-sizing:border-box}html,body{height:100%;height:100dvh;margin:0;overflow:hidden}body{font:14px system-ui,sans-serif;color:#172234;background:#e5ebf0}",
    "#view{position:fixed;inset:0;touch-action:none;overscroll-behavior:none}canvas{display:block;width:100%;height:100%}",
    "header{position:fixed;z-index:2;top:calc(12px + env(safe-area-inset-top));left:calc(12px + env(safe-area-inset-left));right:calc(12px + env(safe-area-inset-right));display:flex;align-items:center;gap:10px;padding:9px 12px;border:1px solid #c3ccd5;border-radius:8px;background:#ffffffed;box-shadow:0 2px 12px #1722341c}",
    "header strong{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;margin-right:auto}button,summary{font:inherit;color:inherit;background:white;border:1px solid #c3ccd5;border-radius:5px;padding:6px 9px;cursor:pointer}button:hover,summary:hover{border-color:#1f3fc7}#quantity-menu{position:relative}#quantity-menu summary{list-style:none}#quantity-menu summary::-webkit-details-marker{display:none}#quantity-list{position:absolute;top:calc(100% + 8px);right:0;width:min(340px,85vw);max-height:65vh;overflow:auto;padding:8px;border:1px solid #c3ccd5;border-radius:6px;background:#fffffff5;box-shadow:0 3px 12px #17223433}#quantity-list div{padding:5px 3px;border-bottom:1px solid #dbe1e6;font:12px ui-monospace,monospace}",
    "footer{position:fixed;bottom:calc(12px + env(safe-area-inset-bottom));left:calc(12px + env(safe-area-inset-left));padding:6px 9px;border-radius:5px;background:#ffffffed;color:#38495d;font-size:12px}#status{position:fixed;z-index:3;left:50%;top:50%;max-width:min(88vw,520px);transform:translate(-50%,-50%);padding:12px 16px;border:1px solid #c3ccd5;border-radius:8px;background:#fffffff2;color:#172234;box-shadow:0 3px 18px #17223433;text-align:center}#status[hidden]{display:none}#error{display:none;color:#9d2a1c}",
    "</style>",
    '<script async src="https://cdn.jsdelivr.net/npm/es-module-shims@' + MODULE_SHIMS_VERSION + '/dist/es-module-shims.js" crossorigin="anonymous"></script>',
    '<script type="importmap-shim">{"imports":{"three":"' + cdn + '/build/three.module.js","three/addons/":"' + cdn + '/examples/jsm/"}}</script>',
    "</head><body><div id=\"view\"></div><div id=\"status\" role=\"status\" aria-live=\"polite\">Loading the 3D model and plan…</div><header><strong id=\"title\"></strong>",
    quantities.length ? '<details id="quantity-menu"><summary>Quantities</summary><div id="quantity-list"></div></details>' : "",
    '<button id="fit" type="button">Fit</button><button id="top" type="button">Top</button></header>',
    '<footer>Drag to orbit · Scroll to zoom · Right-drag to pan <span id="error"></span></footer>',
    '<script>window.__showFenceViewerError=function(message){const status=document.getElementById("status");if(status){status.hidden=false;status.textContent=message;}};window.addEventListener("error",function(){window.__showFenceViewerError("The 3D viewer could not start. Open this file in Safari or Chrome with an internet connection.");});window.addEventListener("unhandledrejection",function(){window.__showFenceViewerError("The 3D model could not be loaded. Check your internet connection and reopen this file in Safari or Chrome.");});</script>',
    '<script type="module-shim">',
    "import * as THREE from 'three';",
    "import { OrbitControls } from 'three/addons/controls/OrbitControls.js';",
    "import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';",
    "const title=" + safeTitle + ";document.getElementById('title').textContent=title;",
    "const quantities=" + safeQuantities + ";const quantityList=document.getElementById('quantity-list');if(quantityList)for(const row of quantities){const item=document.createElement('div');item.textContent=row.title+': '+row.generated+(row.manual==null?'':' (override '+row.manual+')');quantityList.appendChild(item);}",
    "const encoded='" + encoded + "';",
    "const container=document.getElementById('view');const scene=new THREE.Scene();scene.background=new THREE.Color('#e5ebf0');",
    "const camera=new THREE.PerspectiveCamera(40,1,.001,10000);let renderer;try{renderer=new THREE.WebGLRenderer({antialias:false,powerPreference:'low-power'});}catch(error){window.__showFenceViewerError('WebGL is unavailable in this browser. Open the file in Safari or Chrome on a device with WebGL enabled.');throw error;}",
    "const coarsePointer=window.matchMedia&&window.matchMedia('(pointer:coarse)').matches;renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,coarsePointer?1.5:2));renderer.outputColorSpace=THREE.SRGBColorSpace;container.appendChild(renderer.domElement);",
    "scene.add(new THREE.HemisphereLight('#eff7ff','#66727b',2));const light=new THREE.DirectionalLight('#fff2dc',2.4);light.position.set(15,25,12);scene.add(light);",
    "const controls=new OrbitControls(camera,renderer.domElement);controls.enableDamping=true;controls.zoomToCursor=true;let bounds=new THREE.Box3();",
    "function fit(direction){const center=bounds.getCenter(new THREE.Vector3());const size=bounds.getSize(new THREE.Vector3());const radius=Math.max(size.length()/2,.5);controls.target.copy(center);const dir=direction||new THREE.Vector3(1,.8,1);camera.position.copy(center).addScaledVector(dir.clone().normalize(),radius*2.8);camera.near=Math.max(.001,radius/10000);camera.far=Math.max(100,radius*100);camera.updateProjectionMatrix();controls.update();}",
    "function resize(){const w=Math.max(1,container.clientWidth),h=Math.max(1,container.clientHeight);camera.aspect=w/h;camera.updateProjectionMatrix();renderer.setSize(w,h);}",
    "if(window.ResizeObserver)new ResizeObserver(resize).observe(container);else window.addEventListener('resize',resize,{passive:true});window.addEventListener('orientationchange',resize,{passive:true});resize();",
    "function decodeBase64(value){const alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';const lookup=new Int16Array(128);lookup.fill(0);for(let i=0;i<alphabet.length;i++)lookup[alphabet.charCodeAt(i)]=i;const padding=value.endsWith('==')?2:value.endsWith('=')?1:0;const output=new Uint8Array((value.length*3>>2)-padding);let out=0;for(let i=0;i<value.length;i+=4){const n=(lookup[value.charCodeAt(i)]<<18)|(lookup[value.charCodeAt(i+1)]<<12)|(lookup[value.charCodeAt(i+2)]<<6)|lookup[value.charCodeAt(i+3)];if(out<output.length)output[out++]=n>>16;if(out<output.length)output[out++]=n>>8&255;if(out<output.length)output[out++]=n&255;}return output;}",
    "const bytes=decodeBase64(encoded);",
    "new GLTFLoader().parse(bytes.buffer,'',(result)=>{scene.add(result.scene);bounds.setFromObject(result.scene);fit();document.getElementById('status').hidden=true;},(error)=>{window.__showFenceViewerError('Could not load the exported 3D model. Check that the file finished downloading, then reopen it.');console.error(error);});",
    "document.getElementById('fit').addEventListener('click',()=>fit());document.getElementById('top').addEventListener('click',()=>fit(new THREE.Vector3(0,1,.0001)));",
    "renderer.setAnimationLoop(()=>{controls.update();renderer.render(scene,camera);});",
    "</script></body></html>",
  ];
  return html.join("\n");
}

export const fenceExportName = exportName;
