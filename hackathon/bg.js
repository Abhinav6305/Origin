/* Shared poster-style background for the HACK-A-THON 2.0 portal pages. Needs <div id="frame"></div>. */
(function(){
const $ = s => document.querySelector(s);
/* poster background: smoke, diagonal light bands, circuit border, octagon frame, hex corners.
   Built as one SVG and rasterised once into a background image, so scrolling stays cheap. */
(function(){
  const host = $("#frame");
  let url;
  function draw(){
    const W = innerWidth, H = innerHeight, mn = Math.min(W,H), sm = W < 640;
    const m = Math.max(12, Math.min(26, mn*.022)), j = Math.max(16, mn*.03);
    const C = o => `rgba(242,242,239,${o})`;
    const out = [], P = pts => pts.map(p => p.map(v => (+v).toFixed(1)).join(",")).join(" ");
    const line = (pts,o=.55,w=1.3) => out.push(`<polyline points="${P(pts)}" fill="none" stroke="${C(o)}" stroke-width="${w}" stroke-linejoin="round"/>`);
    const node = (x,y,r=4.2,o=.8) => out.push(`<circle cx="${x}" cy="${y}" r="${r}" fill="#060606" stroke="${C(o)}" stroke-width="1.5"/>`);
    const D = Math.SQRT1_2;

    // 1. diagonal light bands ("/" direction) with a bright leading edge
    const band = (x,y,len,w,o,edge=.35) => {
      const ux = D, uy = -D, nx = D, ny = D;          // along, across
      const a=[x,y], b=[x+ux*len,y+uy*len], c=[b[0]+nx*w,b[1]+ny*w], d=[x+nx*w,y+ny*w];
      const id = "g"+out.length;
      out.push(`<linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="${a[0]}" y1="${a[1]}" x2="${b[0]}" y2="${b[1]}"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".45" stop-color="#d8d8d4" stop-opacity="${o}"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>`);
      out.push(`<polygon points="${P([a,b,c,d])}" fill="url(#${id})"/>`);
      if (edge) out.push(`<line x1="${a[0]}" y1="${a[1]}" x2="${b[0]}" y2="${b[1]}" stroke="url(#${id})" stroke-width="1.4" opacity="${edge/o}"/>`);
    };
    const S = Math.hypot(W,H);
    band(-S*.05, H*.42, S*.45, mn*.09, .05);
    band(-S*.02, H*.30, S*.34, mn*.025, .1);
    band(W*.45, H*.30, S*.4, mn*.06, .045);
    band(W*.62, H*.56, S*.42, mn*.11, .045);
    band(W*.40, H*1.02, S*.5, mn*.08, .08);
    band(W*.55, H*.98, S*.45, mn*.02, .12);
    band(-S*.02, H*1.05, S*.3, mn*.05, .07);

    // 2. glints: lens-flare streaks sitting on band edges
    const glint = (x,y,len,o=.9) => {
      out.push(`<ellipse cx="${x}" cy="${y}" rx="${len}" ry="1.2" fill="url(#gl)" opacity="${o}"/>`);
      out.push(`<circle cx="${x}" cy="${y}" r="${len*.16}" fill="url(#gr)" opacity="${o}"/>`);
    };
    glint(W*.74, H*.16, mn*.12); glint(W*.9, H*.6, mn*.07, .7); glint(W*.3, H*.86, mn*.14, .8); glint(W*.84, H*.74, mn*.05, .6);

    // 3. circuit border running round the page, chamfered steps + ringed nodes
    const L = m+2, R = W-m-2, T = m+2, B = H-m-2;
    line([[W*.2,T],[W*.34,T],[W*.34+j,T+j*.7],[W*.62,T+j*.7],[W*.62+j,T],[R-j*2,T],[R,T+j*2],[R,H*.36],[R-j*.8,H*.36+j*.8],[R-j*.8,H*.62],[R,H*.62+j*.8],[R,B-j*2],[R-j*2,B],[W*.58,B],[W*.58-j,B-j*.7],[W*.3,B-j*.7],[W*.3-j,B],[L+j*2,B],[L,B-j*2],[L,H*.68],[L+j*.8,H*.68-j*.8],[L+j*.8,H*.4],[L,H*.4-j*.8],[L,T+j*3],[L+j*1.2,T+j*1.8]], .5);
    [[R,H*.25],[R-j*.8,H*.45],[R-j*.8,H*.53],[R,H*.72],[R,H*.82],[L,H*.24],[L,H*.31],[L+j*.8,H*.5],[L,H*.78],[L,H*.86]].forEach(([x,y]) => node(x,y));
    node(W*.2,T,4.2);
    // inner trace runs like the poster's top and bottom bands
    line([[R,H*.2],[R-mn*.25,H*.2],[R-mn*.25-j,H*.2-j],[W*.42,H*.2-j],[W*.42-j*1.5,H*.2-j*2.5],[W*.22,H*.2-j*2.5]],.22);
    line([[L,H*.76],[L+mn*.28,H*.76],[L+mn*.28+j*1.4,H*.76+j*1.4],[L+mn*.5,H*.76+j*1.4]],.28); node(L+mn*.5+4,H*.76+j*1.4,3,.5);
    line([[L+j*4,H*.84],[W*.34,H*.84],[W*.34+j,H*.84+j],[W*.6,H*.84+j]],.16);
    line([[W*.66,B-j*2.2],[R-mn*.2,B-j*2.2],[R-mn*.2+j,B-j*3.2],[R-j*1.2,B-j*3.2]],.18);

    // 4. octagon frame around the centre
    if (!sm){
      const cx = W/2, cy = H*.5, rx = Math.min(W*.3, mn*.52), ry = mn*.4, c = mn*.12;
      line([[cx-rx+c,cy-ry],[cx+rx-c,cy-ry],[cx+rx,cy-ry+c],[cx+rx,cy+ry-c],[cx+rx-c,cy+ry],[cx-rx+c,cy+ry],[cx-rx,cy+ry-c],[cx-rx,cy-ry+c],[cx-rx+c,cy-ry]], .14, 1.1);
    }

    // 5. hexagon ring fragments in the corners, with a dark extruded side for depth
    const hexRing = (cx,cy,Rr,rot) => {
      const T2 = Rr*.24, ex = Rr*.07, segs = [];
      for (let k=0;k<6;k++){
        const a0 = rot + k*Math.PI/3 + .07, a1 = rot + (k+1)*Math.PI/3 - .07;
        const p = (r,a) => [cx + r*Math.cos(a), cy + r*Math.sin(a)];
        segs.push([p(Rr,a0),p(Rr,a1),p(Rr-T2,a1-.02),p(Rr-T2,a0+.02)]);
      }
      segs.forEach(q => out.push(`<polygon points="${P(q.map(([x,y])=>[x+ex,y+ex]))}" fill="#3a3a38"/>`));
      segs.forEach(q => out.push(`<polygon points="${P(q)}" fill="url(#hexf)"/>`));
    };
    const HR = Math.max(70, mn*.15);
    hexRing(-HR*.12, HR*.22, HR, Math.PI/6);
    hexRing(W+HR*.1, H-HR*.18, HR, Math.PI/6);

    // 6. hatch marks
    const hatch = (x,y,n,w,h,o) => { for (let i=0;i<n;i++){ const X = x + i*w*1.55; out.push(`<polygon points="${X},${y+h} ${X+w},${y+h} ${X+w+h*.8},${y} ${X+h*.8},${y}" fill="${C(o)}"/>`); } };
    const hw = sm ? 7 : 11, hh = sm ? 16 : 24;
    if (!sm) hatch(R-130, T+j*.9, 4, hw, hh, .55);
    hatch(L+j*1.5, B-j*1.6, 4, hw, hh, .45);
    hatch(W*.66, B-j*3.6, 4, hw, hh, .4);
    if (!sm) for (let i=0;i<5;i++) out.push(`<polygon points="${L-3},${H*.47+i*13} ${L+9},${H*.47+i*13-5} ${L+9},${H*.47+i*13+2} ${L-3},${H*.47+i*13+7}" fill="${C(.5)}"/>`);

    // 7. dot grids
    const dots = (x,y,cols,rows,g,o,r=1.4) => { for(let c=0;c<cols;c++) for(let q=0;q<rows;q++) out.push(`<circle cx="${x+c*g}" cy="${y+q*g}" r="${r}" fill="${C(o)}"/>`); };
    if (!sm){ dots(L+j*2, H*.32, 6, 9, 14, .3); dots(L+j*2.5, H*.62, 6, 11, 14, .22); dots(R-j*5, H*.12, 5, 10, 14, .25); dots(R-j*4, H*.76, 4, 6, 12, .14); }
    else { dots(L+j*1.6, H*.34, 4, 6, 12, .25); dots(R-j*4, H*.14, 4, 6, 12, .22); }
    [0,1,2].forEach(i => out.push(`<circle cx="${W*.7+i*14}" cy="${B-j*2.6-i*10}" r="3" fill="none" stroke="${C(.35)}"/>`));

    // 8. gear in the top-right corner
    const gx = R-6, gy = T+j*2.4, gr = mn*.03;
    let teeth = ""; for (let k=0;k<8;k++){ const a=k*Math.PI/4; teeth += `<rect x="${-gr*.18}" y="${-gr*1.35}" width="${gr*.36}" height="${gr*.5}" transform="rotate(${a*180/Math.PI})"/>`; }
    out.push(`<g transform="translate(${gx},${gy})" fill="${C(.12)}"><circle r="${gr}" fill="none" stroke="${C(.14)}" stroke-width="${gr*.35}"/>${teeth}</g>`);

    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
      <defs>
        <filter id="smoke" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency="${(2.4/Math.max(W,H)).toFixed(5)}" numOctaves="5" seed="7"/><feColorMatrix values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 .75 -.4"/></filter>
        <filter id="grain" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency=".85" numOctaves="2" seed="3"/><feColorMatrix values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 .08 0"/></filter>
        <radialGradient id="glow" cx="50%" cy="48%" r="60%"><stop offset="0" stop-color="#121211"/><stop offset=".55" stop-color="#080807"/><stop offset="1" stop-color="#020202"/></radialGradient>
        <radialGradient id="gr"><stop offset="0" stop-color="#fff" stop-opacity=".9"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>
        <linearGradient id="gl"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".5" stop-color="#fff"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>
        <linearGradient id="hexf" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f6f6f3"/><stop offset=".6" stop-color="#c9c9c5"/><stop offset="1" stop-color="#8e8e8a"/></linearGradient>
      </defs>
      <rect width="100%" height="100%" fill="url(#glow)"/>
      <rect width="100%" height="100%" filter="url(#smoke)" opacity=".3"/>
      <rect width="100%" height="100%" filter="url(#grain)"/>
      ${out.join("")}
    </svg>`;
    const next = URL.createObjectURL(new Blob([svg], {type:"image/svg+xml"}));
    const im = new Image();
    im.onload = () => { host.style.backgroundImage = `url(${next})`; if (url) URL.revokeObjectURL(url); url = next; };
    im.src = next;
  }
  let rt, lastW = innerWidth;
  // phones fire resize when the URL bar hides; only redraw on real size changes
  addEventListener("resize", () => { clearTimeout(rt); rt = setTimeout(() => { if (Math.abs(innerWidth-lastW) > 2 || !sm2()) { lastW = innerWidth; draw(); } }, 160); });
  const sm2 = () => innerWidth < 640;
  draw();
})();
})();
