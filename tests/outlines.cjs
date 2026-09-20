// GPU contour regression: raster staircase crossings must not grow perpendicular spurs.
const { chromium } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.BROWSER_EXECUTABLE_PATH,
    args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  try {
    const page = await browser.newPage();
    const file = process.argv[2] || path.join(__dirname, '../src/shaders/PencilOutline.glsl');
    const result = await page.evaluate(({outline, pencil}) => {
      const size=128, canvas=document.createElement('canvas'); canvas.width=canvas.height=size;
      const g=canvas.getContext('webgl2');
      const vertex=`#version 300 es\nvoid main(){vec2 p=vec2((gl_VertexID<<1)&2,gl_VertexID&2);gl_Position=vec4(p*2.-1.,0,1);}`;
      const program=(fit)=>{
        const p=g.createProgram();
        const fragment=`#version 300 es\nprecision highp float;precision highp sampler2D;
          uniform sampler2D edgeSeeds;uniform vec2 resolution;out vec4 color;
          ${fit ? '#define OUTLINE_FIT_PASS' : ''}\n${pencil}\n${outline}\nvoid main(){
          ${fit ? 'color=poFitAtSeed(ivec2(gl_FragCoord.xy));' : 'color=vec4(vec3(poFittedInk(gl_FragCoord.xy,0.,0.,1)),1.);'}}`;
        for(const [type,source] of [[g.VERTEX_SHADER,vertex],[g.FRAGMENT_SHADER,fragment]]) {
          const s=g.createShader(type);g.shaderSource(s,source);g.compileShader(s);
          if(!g.getShaderParameter(s,g.COMPILE_STATUS)) throw Error(g.getShaderInfoLog(s));
          g.attachShader(p,s);
        }
        g.linkProgram(p);if(!g.getProgramParameter(p,g.LINK_STATUS)) throw Error(g.getProgramInfoLog(p));
        return p;
      };
      const fit=program(true),compose=program(false);
      const texture=(data)=>{
        const t=g.createTexture();g.bindTexture(g.TEXTURE_2D,t);
        g.texImage2D(g.TEXTURE_2D,0,g.RGBA8,size,size,0,g.RGBA,g.UNSIGNED_BYTE,data);
        g.texParameteri(g.TEXTURE_2D,g.TEXTURE_MIN_FILTER,g.LINEAR_MIPMAP_NEAREST);
        g.texParameteri(g.TEXTURE_2D,g.TEXTURE_MAG_FILTER,g.LINEAR);
        g.texParameteri(g.TEXTURE_2D,g.TEXTURE_WRAP_S,g.CLAMP_TO_EDGE);
        g.texParameteri(g.TEXTURE_2D,g.TEXTURE_WRAP_T,g.CLAMP_TO_EDGE);g.generateMipmap(g.TEXTURE_2D);return t;
      };
      const draw=(p,tex,fbo)=>{
        g.bindFramebuffer(g.FRAMEBUFFER,fbo);g.viewport(0,0,size,size);g.useProgram(p);
        g.activeTexture(g.TEXTURE0);g.bindTexture(g.TEXTURE_2D,tex);
        g.uniform1i(g.getUniformLocation(p,'edgeSeeds'),0);g.uniform2f(g.getUniformLocation(p,'resolution'),size,size);
        g.drawArrays(g.TRIANGLES,0,3);
      };
      let worst=0,spikes=0,views=0,covered=0;
      for(const slope of [0.025,0.05,0.1,0.2,0.5,0.8]) for(const transpose of [false,true]) {
        const data=new Uint8Array(size*size*4);
        const side=(x,y)=>(transpose ? y-slope*x : x-slope*y)-(size/2-slope*size/2+0.17);
        for(let y=0;y<size;y++)for(let x=0;x<size;x++) {
          const a=side(x+.5,y+.5)>0, ex=a!==(side(x+1.5,y+.5)>0)?1:0, ey=a!==(side(x+.5,y+1.5)>0)?1:0;
          if(!ex&&!ey)continue;
          const i=(y*size+x)*4, count=ex+ey;
          let angle=Math.atan2(ey,ex);angle-=Math.PI*Math.floor((angle+Math.PI/2)/Math.PI);
          data[i]=Math.round((.5+ex*.25/count)*255);data[i+1]=Math.round((.5+ey*.25/count)*255);
          data[i+2]=Math.round((angle/Math.PI+.5)*255);data[i+3]=255;
        }
        const seeds=texture(data),fitted=texture(null),fbo=g.createFramebuffer();
        g.bindFramebuffer(g.FRAMEBUFFER,fbo);g.framebufferTexture2D(g.FRAMEBUFFER,g.COLOR_ATTACHMENT0,g.TEXTURE_2D,fitted,0);
        draw(fit,seeds,fbo);g.bindTexture(g.TEXTURE_2D,fitted);g.generateMipmap(g.TEXTURE_2D);
        draw(compose,fitted,null);
        const pixels=new Uint8Array(size*size*4);g.readPixels(0,0,size,size,g.RGBA,g.UNSIGNED_BYTE,pixels);
        for(let y=5;y<size-5;y++)for(let x=5;x<size-5;x++) {
          if(pixels[(y*size+x)*4]<40)continue;
          const distance=Math.abs(side(x+.5,y+.5))/Math.sqrt(1+slope*slope);
          covered++;worst=Math.max(worst,distance);if(distance>1.6)spikes++;
        }
        views++;g.deleteTexture(seeds);g.deleteTexture(fitted);g.deleteFramebuffer(fbo);
      }
      return {views,worstDistance:worst,spikes,covered};
    }, {outline:fs.readFileSync(file,'utf8'),pencil:fs.readFileSync(path.join(__dirname,'../src/shaders/PencilHatching.glsl'),'utf8')});
    console.log(JSON.stringify(result));
    assert.ok(result.covered>1000,'Contours must remain present');
    assert.equal(result.spikes,0,'Straight edges must not grow perpendicular spikes');
  } finally { await browser.close(); }
})().catch(e=>{console.error(e);process.exitCode=1;});
