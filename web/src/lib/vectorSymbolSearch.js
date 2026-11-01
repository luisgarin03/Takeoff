// Compare painted PDF paths independently; overlapping text and paths are excluded.
const multiply = (a, b) => [a[0]*b[0]+a[2]*b[1],a[1]*b[0]+a[3]*b[1],a[0]*b[2]+a[2]*b[3],a[1]*b[2]+a[3]*b[3],a[0]*b[4]+a[2]*b[5]+a[4],a[1]*b[4]+a[3]*b[5]+a[5]];
export function vectorObjects(list, OPS, viewport) {
  let matrix = viewport.transform.slice(), pending = [];
  const stack = [], objects = [];
  const imageKey = (image) => {
    if (typeof image === 'string') return image;
    const bytes = image?.data;
    if (!bytes?.length) return null;
    let hash = 2166136261;
    for (const byte of bytes) hash = Math.imul(hash ^ byte, 16777619);
    return `${image.width}:${image.height}:${hash >>> 0}`;
  };
  const addImage = (image, placement) => {
    const key = imageKey(image);
    if (!key) return;
    const points = [[0,0],[1,0],[1,1],[0,1]].map(([x,y])=>[placement[0]*x+placement[2]*y+placement[4],placement[1]*x+placement[3]*y+placement[5]]);
    const xs=points.map(p=>p[0]),ys=points.map(p=>p[1]),x=Math.min(...xs),y=Math.min(...ys),w=Math.max(...xs)-x,h=Math.max(...ys)-y;
    if (w>.1 && h>.1) objects.push({x,y,w,h,codes:`image:${key}`,points:points.map(p=>[(p[0]-x)/w,(p[1]-y)/h]),paint:'image'});
  };
  const paint = new Set([OPS.stroke, OPS.closeStroke, OPS.fill, OPS.eoFill, OPS.fillStroke, OPS.eoFillStroke, OPS.closeFillStroke, OPS.closeEOFillStroke]);
  for (let i = 0; i < list.fnArray.length; i++) {
    const op = list.fnArray[i], args = list.argsArray[i];
    if (op === OPS.save || op === OPS.paintFormXObjectBegin) { stack.push(matrix.slice()); if (op === OPS.paintFormXObjectBegin && args?.[0]) matrix = multiply(matrix, args[0]); }
    else if (op === OPS.restore || op === OPS.paintFormXObjectEnd) matrix = stack.pop() || viewport.transform.slice();
    else if (op === OPS.transform) matrix = multiply(matrix, args);
    else if ([OPS.paintImageXObject,OPS.paintInlineImageXObject,OPS.paintImageMaskXObject].includes(op)) addImage(args[0],matrix);
    else if (op === OPS.paintImageXObjectRepeat) {
      const [image,a,d,positions]=args;
      for(let k=0;k<positions.length;k+=2) addImage(image,multiply(matrix,[a,0,0,d,positions[k],positions[k+1]]));
    }
    else if (op === OPS.paintImageMaskXObjectRepeat) {
      const [image,a,b,c,d,positions]=args;
      for(let k=0;k<positions.length;k+=2) addImage(image,multiply(matrix,[a,b,c,d,positions[k],positions[k+1]]));
    }
    else if (op === OPS.paintImageMaskXObjectGroup) {
      for(const image of args[0] || []) if(image.transform) addImage(image,multiply(matrix,image.transform));
    }
    else if (op === OPS.constructPath) {
      let offset = 0;
      let points = [], codes = [];
      const flush = () => { if (points.length) pending.push({ points, codes }); points = []; codes = []; };
      const point = (x,y) => points.push([matrix[0]*x+matrix[2]*y+matrix[4],matrix[1]*x+matrix[3]*y+matrix[5]]);
      for (const code of args[0]) {
        // A paint operation can contain hundreds of independent CAD symbols.
        // Preserve their subpaths rather than treating the batch as one object.
        if (code === OPS.moveTo || code === OPS.rectangle) flush();
        codes.push(code);
        if (code === OPS.rectangle) { const [x,y,w,h] = args[1].slice(offset,offset+4); offset += 4; point(x,y); point(x+w,y); point(x+w,y+h); point(x,y+h); flush(); }
        else {
          const count = code === OPS.curveTo ? 6 : [OPS.curveTo2,OPS.curveTo3].includes(code) ? 4 : [OPS.moveTo,OPS.lineTo].includes(code) ? 2 : 0;
          for (let k = 0; k < count; k += 2) point(args[1][offset+k],args[1][offset+k+1]);
          offset += count;
        }
      }
      flush();
    } else if (paint.has(op)) {
      for (const item of pending) {
      let {points, codes} = item;
      const closed = codes.includes(OPS.rectangle) || codes.includes(OPS.closePath) || op === OPS.closeStroke || op === OPS.closeFillStroke || op === OPS.closeEOFillStroke || [OPS.fill, OPS.eoFill, OPS.fillStroke, OPS.eoFillStroke].includes(op);
      const polygon = codes.every(code => [OPS.moveTo,OPS.lineTo,OPS.closePath,OPS.rectangle].includes(code));
      if (closed && polygon && points.length > 3 && Math.hypot(points[0][0]-points.at(-1)[0], points[0][1]-points.at(-1)[1]) < .001) points = points.slice(0,-1);
      if (points.length >= 3) {
        const xs = points.map(p=>p[0]), ys = points.map(p=>p[1]);
        const x=Math.min(...xs), y=Math.min(...ys), w=Math.max(...xs)-x, h=Math.max(...ys)-y;
        if (w > .1 && h > .1) objects.push({x,y,w,h,closed:closed && polygon,codes:closed && polygon ? `polygon:${points.length}` : codes.join(','),points:points.map(p=>[(p[0]-x)/w,(p[1]-y)/h]),paint:op});
      }
      }
      pending = [];
    } else if (op === OPS.endPath) pending = [];
  }
  return objects;
}
export function selectVectorReference(objects, box) {
  const contained = objects.filter(o=>o.x >= box.x-2 && o.y >= box.y-2 && o.x+o.w <= box.x+box.w+2 && o.y+o.h <= box.y+box.h+2);
  return contained.sort((a,b)=>b.w*b.h-a.w*a.h)[0] || null;
}
export function pickVectorObject(objects, point, tolerance = 2) {
  return objects.filter(object => point.x >= object.x - tolerance && point.x <= object.x + object.w + tolerance && point.y >= object.y - tolerance && point.y <= object.y + object.h + tolerance)
    .sort((a,b) => a.w*a.h - b.w*b.h)[0] || null;
}
export function matchVectorObjects(objects, reference, {threshold=.92,ratio=1,rotated=false}={}) {
  const hits=[];
  for (const object of objects) {
    if (object.codes !== reference.codes || object.paint !== reference.paint || object.points.length !== reference.points.length) continue;
    let best=0;
    for (let turn=0; turn<(rotated?4:1); turn++) {
      const rw=turn%2?reference.h:reference.w, rh=turn%2?reference.w:reference.h;
      if (Math.abs(object.w/(rw*ratio)-1)>.15 || Math.abs(object.h/(rh*ratio)-1)>.15) continue;
      // Closed paths may begin at any corner and use either winding direction.
      for (const direction of reference.closed ? [1,-1] : [1]) for (let start=0;start<(reference.closed?reference.points.length:1);start++) {
        let error=0;
        for (let i=0;i<object.points.length;i++) {
          const index=(start+direction*i+reference.points.length)%reference.points.length;
          const [x,y]=reference.points[index], expected=turn===1?[1-y,x]:turn===2?[1-x,1-y]:turn===3?[y,1-x]:[x,y];
          error+=Math.hypot(object.points[i][0]-expected[0],object.points[i][1]-expected[1]);
        }
        best=Math.max(best,Math.max(0,1-error/object.points.length));
      }
    }
    if (best>=threshold) hits.push({...object,score:best});
  }
  return {matches:hits.slice(0,250),limited:hits.length>250};
}
