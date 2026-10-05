(() => {
  const el = id => document.getElementById(id);
  const svg = (tag, attrs = {}) => {
    const node = document.createElementNS('http://www.w3.org/2000/svg', tag);
    Object.entries(attrs).forEach(([key, value]) => node.setAttribute(key, value));
    return node;
  };
  let data;
  function components(edges) {
    const adjacency = new Map();
    edges.forEach(({source, target}) => {
      if (!adjacency.has(source)) adjacency.set(source, new Set());
      if (!adjacency.has(target)) adjacency.set(target, new Set());
      adjacency.get(source).add(target); adjacency.get(target).add(source);
    });
    const seen = new Set(), groups = [];
    for (const start of adjacency.keys()) {
      if (seen.has(start)) continue;
      const group = [], pending = [start]; seen.add(start);
      while (pending.length) {
        const id = pending.pop(); group.push(id);
        for (const next of adjacency.get(id)) if (!seen.has(next)) { seen.add(next); pending.push(next); }
      }
      groups.push(group.sort((a,b) => data.nodes[a].name.localeCompare(data.nodes[b].name)));
    }
    return groups.sort((a,b) => b.length - a.length || a[0] - b[0]);
  }
  function showPair(edge) {
    el('copying-pair-title').textContent = `${data.nodes[edge.source].name} ↔ ${data.nodes[edge.target].name}: ${edge.length} shared tokens`;
    for (const side of ['source', 'target']) {
      const link = el(`copying-${side}-link`);
      link.textContent = data.nodes[edge[side]].name; link.href = data.nodes[edge[side]].url;
      el(`copying-${side}-text`).textContent = data.excerpts[edge[`${side}Excerpt`]];
    }
  }
  function renderGroup(edges, group) {
    const ids = new Set(group), matches = edges.filter(e => ids.has(e.source) && ids.has(e.target)).sort((a,b) => b.length - a.length);
    const select = el('copying-pair'); select.replaceChildren();
    matches.forEach((edge, index) => {
      const option = document.createElement('option'); option.value = index;
      option.textContent = `${edge.length} tokens · ${data.nodes[edge.source].name} / ${data.nodes[edge.target].name}`; select.append(option);
    });
    select.onchange = () => showPair(matches[Number(select.value)]);
    const network = el('copying-network'); network.replaceChildren(); network.setAttribute('viewBox','0 0 920 620');
    const title = svg('title'); title.textContent = `Shared-passage network: ${group.length} pages and ${matches.length} edges`; network.append(title);
    const positions = new Map(group.map((id,i) => [id, {x:460 + 225 * Math.cos(2*Math.PI*i/group.length-Math.PI/2), y:310 + 225 * Math.sin(2*Math.PI*i/group.length-Math.PI/2)}]));
    matches.forEach(edge => {
      const a = positions.get(edge.source), b = positions.get(edge.target);
      const line = svg('line',{x1:a.x,y1:a.y,x2:b.x,y2:b.y, class:'copying-edge','stroke-width':Math.min(7,1+Math.log2(edge.length/16))});
      const title = svg('title'); title.textContent = `${data.nodes[edge.source].name} / ${data.nodes[edge.target].name}: ${edge.length} tokens`; line.append(title); network.append(line);
    });
    group.forEach(id => {
      const p = positions.get(id), degree = matches.filter(e => e.source === id || e.target === id).length;
      const node = svg('circle',{cx:p.x,cy:p.y,r:Math.min(12,4+Math.sqrt(degree)),class:'copying-node',tabindex:0,role:'button','aria-label':`Inspect a shared passage involving ${data.nodes[id].name}`});
      const inspect = () => { const index = matches.findIndex(e => e.source === id || e.target === id); select.value=index; showPair(matches[index]); };
      node.addEventListener('click',inspect); node.addEventListener('keydown',event => {if (event.key === 'Enter' || event.key === ' ') {event.preventDefault();inspect();}});
      const title = svg('title'); title.textContent = data.nodes[id].name; node.append(title); network.append(node);
      // Names remain available in the pair menu for dense clusters.
      if (group.length <= 35) {
        const label = svg('text',{x:p.x+(p.x<460?-14:14),y:p.y+4,'text-anchor':p.x<460?'end':'start',class:'copying-label'});
        label.textContent = data.nodes[id].name.length > 24 ? data.nodes[id].name.slice(0,22)+'…' : data.nodes[id].name; network.append(label);
      }
    });
    el('copying-graph-note').textContent = `All ${group.length} pages and ${matches.length} pairs in this connected component. Thicker edges mean longer shared passages. Select a dot or a pair to inspect the text.`;
    if (matches.length) showPair(matches[0]);
  }
  function update() {
    const minimum = Math.max(16, Number(el('copying-threshold').value)), edges = data.edges.filter(e => e.length >= minimum), groups = components(edges);
    const linked = new Set(edges.flatMap(e => [e.source,e.target])).size;
    el('copying-summary').textContent = `At ${minimum} tokens or more: ${edges.length.toLocaleString()} page pairs, ${linked} connected pages, and ${groups.length} clusters. ${data.nodes.length-linked} pages have no matching partner at this threshold.`;
    const select = el('copying-cluster'); select.replaceChildren();
    groups.forEach((group,index) => {const option=document.createElement('option'); option.value=index;option.textContent=`Cluster ${index+1} · ${group.length} pages · ${data.nodes[group[0]].name}`;select.append(option);});
    select.onchange=()=>renderGroup(edges,groups[Number(select.value)]);
    el('copying-detail').hidden=!groups.length;
    if(groups.length) renderGroup(edges,groups[0]);
  }
  fetch('data/week5_copying.json').then(response => {if(!response.ok) throw new Error('Could not load shared-passage data.');return response.json();}).then(result=>{
    data=result;el('copying-loading').hidden=true;el('copying-output').hidden=false;el('copying-threshold').addEventListener('change',update);update();
  }).catch(error=>{el('copying-loading').textContent=error.message;});
})();
