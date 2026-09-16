const fs=require('fs'),vm=require('vm'),assert=require('assert');
class El {constructor(tag='div'){this.tag=tag;this.children=[];this.value='';this.attrs={};this.classList={toggle(){}};} append(...items){this.children.push(...items);} replaceChildren(...items){this.children=items;if(this.tag==='select'&&items.length)this.value=String(items[0].value);} setAttribute(key,value){this.attrs[key]=value;} addEventListener(key,fn){this.events ||= {};this.events[key]=fn;} querySelector(){return new El();} getBoundingClientRect(){return {bottom:100,right:600};}}
const ids={};
const html=fs.readFileSync('week-03.html','utf8');
for(const match of html.matchAll(/<([a-z]+)[^>]*id="([^"]+)"/g)) ids[match[2]]=new El(match[1]);
const errors=[];
const document={getElementById:id=>ids[id],createElement:tag=>new El(tag),createTextNode:text=>text,querySelectorAll:()=>Object.values(ids)};
class Sel {constructor(items=[]){this.items=items;} node(){return {clientWidth:700};} selectAll(){return new Sel();} remove(){return this;} append(){return new Sel(this.items);} data(items){this.items=items;return this;} join(){return this;} attr(key,value){this.items.forEach(item=>{const result=typeof value==='function'?value(item):value;if(typeof result==='number')assert(Number.isFinite(result));});return this;} text(value){if(typeof value==='function')this.items.forEach(value);return this;} each(fn){this.items.forEach(item=>fn.call({},item));return this;} call(){return this;} on(){return this;} datum(value){this.items=[value];return this;}}
function scale(){let domain=[0,1],range=[0,1];const f=value=>range[0]+(value-domain[0])/(domain[1]-domain[0])*(range[1]-range[0]);f.domain=value=>{if(!value)return domain;domain=value;return f;};f.range=value=>{range=value;return f;};f.nice=()=>f;f.ticks=n=>Array.from({length:n+1},(_,i)=>domain[0]+(domain[1]-domain[0])*i/n);return f;}
function bin(){let domain,thresholds;const f=values=>{const bins=thresholds.slice(0,-1).map((v,i)=>Object.assign([],{x0:v,x1:thresholds[i+1]}));values.forEach(v=>{const found=bins.find(b=>v>=b.x0&&v<=b.x1);if(found)found.push(v);});return bins;};f.domain=value=>{domain=value;return f;};f.thresholds=value=>{thresholds=value;return f;};return f;}
const axis=()=>({ticks(){return this;},tickFormat(){return this;}});
const d3={select:(target)=>{if(typeof target==='string')assert(ids[target.slice(1)],`Missing SVG: ${target}`);return new Sel([{}]);},line:()=>{const f=()=> 'M0,0';f.x=()=>f;f.y=()=>f;return f;},scaleLinear:scale,bin,max:(items,f)=>Math.max(...items.map(f)),axisBottom:axis,axisLeft:axis};
const ctx=vm.createContext({document,d3,console:{log:console.log,warn:console.warn,error:(...args)=>errors.push(args)},window:{location:{protocol:'http:'},innerWidth:1100,innerHeight:800},fetch:async url=>({ok:true,json:async()=>JSON.parse(fs.readFileSync(url))})});
const source=fs.readFileSync('weeks/week3/week3.js','utf8');
vm.runInContext(source.replace(/init\(\)\.catch\([\s\S]*?\n\}\);/, ''),ctx);
(async()=>{
 await vm.runInContext('init()',ctx);
 assert(ids['centrality-network'] && ids['centrality-chart']);
 for (const order of ['degree','betweenness','random']) {
  ids['centrality-order'].value=order;
  ids['centrality-removal-slider'].value='5';
  ids['centrality-order'].events.change();
  ids['centrality-removal-slider'].events.input();
  assert.equal(ids['centrality-removal-count'].textContent,5);
 }

 assert.deepEqual(errors,[],JSON.stringify(errors));
 for(const mode of ['undirected','directed','undirected']){
  ids[`clique-mode-${mode}`].onclick();
  const count=mode==='directed'?3:6;
  assert.equal(ids['clique-select'].children.length,count);
  for(let index=0;index<count;index++){
   ids['clique-select'].value=String(index);ids['clique-select'].onchange();
   assert(ids['clique-readout'].textContent.includes(mode==='directed'?'20 of 20':'28 of 28'));
   assert.equal(ids['clique-members'].children.length,mode==='directed'?5:8);
   for(const item of ids['clique-members'].children){
    const affiliations=item.children.find(child=>child.className==='clique-affiliations');
    const labels=affiliations.children.filter(child=>child.tag==='span');
    assert(labels.length<=2);
    assert(labels.some(label=>label.textContent==='X-Men'&&label.className.includes('is-shared-team')));
    const more=affiliations.children.find(child=>child.tag==='button');
    if(more){
     const popover=affiliations.children.find(child=>child.attrs.popover==='auto');
     assert.equal(more.attrs.popovertarget,popover.id);
     assert.equal(Number(more.textContent.slice(1)),popover.children[1].children.length);
    }
   }
  }
  assert(ids['homophily-answer'].textContent.includes(mode==='directed'?'directed references':'undirected connections'));
 }
 assert.deepEqual(errors,[]);
 console.log('Passed full page initialization, all nine cliques, repeated toggles, shared labels, +N popovers, and homophily dashboard.');
})().catch(error=>{console.error(error);process.exitCode=1;});
