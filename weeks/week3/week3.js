const DATA_URL = 'data/week3_story.json';
const format = (value, digits = 2) => Number(value).toFixed(digits).replace(/\.00$/, '').replace(/(\.\d)0$/, '$1');
const byId = (id) => document.getElementById(id);
let data;
let adjacency;
let betweenness;

function makeGraph() {
  adjacency = new Map(data.nodes.map((node) => [node.id, new Set()]));
  data.real.edges.forEach(([source, target]) => { adjacency.get(source)?.add(target); adjacency.get(target)?.add(source); });
}
function shortestPath(source, target, graph = adjacency) {
  if (source === target) return [source];
  const queue = [source];
  const previous = new Map([[source, null]]);
  while (queue.length) {
    const current = queue.shift();
    for (const neighbor of graph.get(current) || []) {
      if (previous.has(neighbor)) continue;
      previous.set(neighbor, current);
      if (neighbor === target) { const path = []; let cursor = target; while (cursor !== null) { path.unshift(cursor); cursor = previous.get(cursor); } return path; }
      queue.push(neighbor);
    }
  }
  return [];
}
function pathThroughSpiderMan(source, target) {
  const spiderMan = data.nodes.find((node) => node.name === 'Spider-Man')?.id || 'Spider-Man';
  const toSpiderMan = shortestPath(source, spiderMan);
  const fromSpiderMan = shortestPath(spiderMan, target);
  if (!toSpiderMan.length || !fromSpiderMan.length) return [];
  return [...toSpiderMan, ...fromSpiderMan.slice(1)];
}
function computeBetweenness() {
  const scores = new Map(data.nodes.map((node) => [node.id, 0]));
  data.nodes.forEach((sourceNode) => {
    const source = sourceNode.id;
    const stack = [];
    const parents = new Map(data.nodes.map((node) => [node.id, []]));
    const paths = new Map(data.nodes.map((node) => [node.id, 0]));
    const distance = new Map([[source, 0]]);
    paths.set(source, 1);
    const queue = [source];
    while (queue.length) {
      const current = queue.shift(); stack.push(current);
      for (const neighbor of adjacency.get(current)) {
        if (!distance.has(neighbor)) { distance.set(neighbor, distance.get(current) + 1); queue.push(neighbor); }
        if (distance.get(neighbor) === distance.get(current) + 1) { parents.get(neighbor).push(current); paths.set(neighbor, paths.get(neighbor) + paths.get(current)); }
      }
    }
    const dependency = new Map(data.nodes.map((node) => [node.id, 0]));
    while (stack.length) { const current = stack.pop(); parents.get(current).forEach((parent) => dependency.set(parent, dependency.get(parent) + (paths.get(parent) / paths.get(current)) * (1 + dependency.get(current)))); if (current !== source) scores.set(current, scores.get(current) + dependency.get(current)); }
  });
  return scores;
}
function nodeName(id) { return data.nodes.find((node) => node.id === id)?.name || id; }
function populateSelect(select, nodes) { select.innerHTML = nodes.map((node) => `<option value="${node.id}">${node.name}</option>`).join(''); }
function renderRoute(path) { const output = byId('route-output'); byId('route-answer').textContent = path.length ? `${path.length - 1} links make this route through Spider-Man. Each leg is a shortest path in the undirected snapshot.` : 'No route through Spider-Man exists for these characters.'; byId('route-chain').innerHTML = path.length ? path.map((id, index) => `${index ? '<span class="route-arrow">→</span>' : ''}<span class="route-node">${nodeName(id)}</span>`).join('') : '<span class="route-node">Disconnected</span>'; output.querySelector('.route-count').textContent = path.length ? `${path.length - 1} edges` : 'No path'; }
function initRoutes(nodes) { const source = byId('route-source'); const target = byId('route-target'); populateSelect(source, nodes); populateSelect(target, nodes); source.value = nodes.find((node) => node.name === 'Spider-Man')?.id || nodes[0].id; target.value = nodes.find((node) => node.name === 'Captain America')?.id || nodes[1].id; const update = () => renderRoute(pathThroughSpiderMan(source.value, target.value)); source.addEventListener('change', update); target.addEventListener('change', update); byId('surprise-route').addEventListener('click', () => { const spiderMan = nodes.find((node) => node.name === 'Spider-Man')?.id || 'Spider-Man'; const connected = nodes.filter((node) => node.id !== spiderMan && pathThroughSpiderMan(node.id, spiderMan).length); let path = []; while (path.length < 3 || path.length > 9) { const left = connected[Math.floor(Math.random() * connected.length)]; const right = connected[Math.floor(Math.random() * connected.length)]; path = pathThroughSpiderMan(left.id, right.id); source.value = left.id; target.value = right.id; } renderRoute(path); }); update(); }
function drawCentralityNetwork(removed, top) { const svg = d3.select('#centrality-network'); const width = svg.node().clientWidth || 700; const height = 440; const positions = new Map(data.nodes.map((node, index) => { const angle = index * 2.39996; const radius = Math.min(width, height) * (.08 + Math.sqrt(index / data.nodes.length) * .42); return [node.id, { x: width / 2 + Math.cos(angle) * radius, y: height / 2 + Math.sin(angle) * radius }]; })); svg.attr('viewBox', `0 0 ${width} ${height}`).selectAll('*').remove(); svg.append('g').selectAll('line').data(data.real.edges).join('line').attr('class', ([source, target]) => `network-edge ${removed.has(source) || removed.has(target) ? 'removed' : ''}`).attr('x1', ([source]) => positions.get(source).x).attr('y1', ([source]) => positions.get(source).y).attr('x2', ([, target]) => positions.get(target).x).attr('y2', ([, target]) => positions.get(target).y); svg.append('g').selectAll('circle').data(data.nodes).join('circle').attr('class', (node) => `network-node ${top.some((item) => item.id === node.id) ? 'hub' : ''} ${removed.has(node.id) ? 'removed' : ''}`).attr('cx', (node) => positions.get(node.id).x).attr('cy', (node) => positions.get(node.id).y).attr('r', (node) => Math.min(9, 2 + Math.sqrt(adjacency.get(node.id)?.size || 0) * .45)); svg.append('g').selectAll('text').data(top.slice(0, 6).filter((node) => !removed.has(node.id))).join('text').attr('class', 'network-label').attr('x', (node) => positions.get(node.id).x + 6).attr('y', (node) => positions.get(node.id).y + 3).text((node) => node.name); }
function renderCentrality(nodes) { const values = nodes.map((node) => ({ ...node, degree: adjacency.get(node.id).size, betweenness: betweenness.get(node.id) || 0 })).filter((node) => node.degree > 0); const top = [...values].sort((a, b) => b.betweenness - a.betweenness); const maxDegree = Math.max(...values.map((node) => node.degree)); const maxBetween = Math.max(...values.map((node) => node.betweenness)); const svg = d3.select('#centrality-chart'); const width = svg.node().clientWidth || 700; const height = 440; const margin = { top: 24, right: 25, bottom: 48, left: 58 }; const x = d3.scaleLinear().domain([0, maxDegree]).nice().range([margin.left, width - margin.right]); const y = d3.scaleLinear().domain([0, maxBetween]).nice().range([height - margin.bottom, margin.top]); const tooltip = byId('centrality-tooltip'); const draw = () => { const order = byId('centrality-order').value; const removed = new Set(data.removal.orders[order].slice(0, Number(byId('centrality-removal-slider').value))); const visible = values.filter((node) => !removed.has(node.id)); drawCentralityNetwork(removed, top); svg.attr('viewBox', `0 0 ${width} ${height}`).selectAll('*').remove(); svg.append('g').attr('class', 'chart-axis').attr('transform', `translate(0,${height - margin.bottom})`).call(d3.axisBottom(x).ticks(6)); svg.append('g').attr('class', 'chart-axis').attr('transform', `translate(${margin.left},0)`).call(d3.axisLeft(y).ticks(5)); svg.append('text').attr('x', width / 2).attr('y', height - 8).attr('text-anchor', 'middle').attr('class', 'chart-axis').text('degree'); svg.append('text').attr('transform', 'rotate(-90)').attr('x', -height / 2).attr('y', 15).attr('text-anchor', 'middle').attr('class', 'chart-axis').text('betweenness'); svg.append('g').selectAll('circle').data(visible).join('circle').attr('class', (node) => `scatter-dot ${top.indexOf(node) < 10 ? 'bridge' : ''}`).attr('cx', (node) => x(node.degree)).attr('cy', (node) => y(node.betweenness)).attr('r', (node) => 2.5 + Math.sqrt(node.degree) / 2).on('mouseenter', (event, node) => { tooltip.innerHTML = `<strong>${node.name}</strong><br>Degree: ${node.degree}<br>Betweenness: ${format(node.betweenness)}<br>Triangles: ${triangles(node.id)}`; tooltip.style.display = 'block'; tooltip.style.left = `${event.offsetX + 12}px`; tooltip.style.top = `${event.offsetY + 12}px`; }).on('mouseleave', () => { tooltip.style.display = 'none'; }); byId('centrality-removal-count').textContent = removed.size; byId('centrality-answer').textContent = removed.size ? `${removed.size} characters removed in ${order} order. ${visible.length} characters remain in the degree-versus-betweenness view.` : `${top[0].name} has the highest betweenness in this snapshot. Remove characters to watch the centrality cloud change.`; }; byId('centrality-order').addEventListener('change', draw); byId('centrality-removal-slider').addEventListener('input', draw); draw(); byId('bridge-list').innerHTML = top.slice(0, 3).map((node, index) => `<div class="bridge-card"><strong>${String(index + 1).padStart(2, '0')} / ${node.name}</strong><span>${node.degree} neighbors · betweenness ${format(node.betweenness)} · ${triangles(node.id)} closed neighbor pairs</span></div>`).join(''); }
function triangles(id) { const neighbors = [...(adjacency.get(id) || [])]; let count = 0; for (let index = 0; index < neighbors.length; index += 1) for (let next = index + 1; next < neighbors.length; next += 1) if (adjacency.get(neighbors[index])?.has(neighbors[next])) count += 1; return count; }
function componentSize(graph, excluded) { const unseen = new Set(data.nodes.map((node) => node.id).filter((id) => !excluded.has(id))); let largest = 0; while (unseen.size) { const start = unseen.values().next().value; unseen.delete(start); const queue = [start]; let size = 0; while (queue.length) { const current = queue.pop(); size += 1; for (const neighbor of graph.get(current) || []) if (unseen.delete(neighbor)) queue.push(neighbor); } largest = Math.max(largest, size); } return largest; }
function renderRemoval(nodes) { const ranked = [...nodes].sort((a, b) => (adjacency.get(b.id).size - adjacency.get(a.id).size)); const connected = nodes.filter((node) => adjacency.get(node.id).size > 0); const randomOrder = [...connected].sort((left, right) => hash(left.id) - hash(right.id)); const values = d3.range(21).map((removed) => ({ removed, targeted: componentSize(adjacency, new Set(ranked.slice(0, removed).map((node) => node.id))), random: componentSize(adjacency, new Set(randomOrder.slice(0, removed).map((node) => node.id))) })); const draw = () => { const svg = d3.select('#removal-chart'); const width = svg.node().clientWidth || 700; const height = 360; const margin = { top: 20, right: 25, bottom: 45, left: 50 }; const x = d3.scaleLinear().domain([0, 20]).range([margin.left, width - margin.right]); const y = d3.scaleLinear().domain([0, d3.max(values, (item) => item.targeted)]).range([height - margin.bottom, margin.top]); const line = d3.line().x((item) => x(item.removed)).y((item) => y(item.targeted)); svg.attr('viewBox', `0 0 ${width} ${height}`).selectAll('*').remove(); svg.append('g').attr('class', 'chart-axis').attr('transform', `translate(0,${height - margin.bottom})`).call(d3.axisBottom(x).ticks(5)); svg.append('g').attr('class', 'chart-axis').attr('transform', `translate(${margin.left},0)`).call(d3.axisLeft(y).ticks(5)); [['targeted', 'Targeted hubs'], ['random', 'Random order']].forEach(([key, label]) => { const path = d3.line().x((item) => x(item.removed)).y((item) => y(item[key])); svg.append('path').datum(values).attr('class', `removal-line ${key}`).attr('d', path); svg.append('text').attr('x', width - 120).attr('y', margin.top + (key === 'targeted' ? 0 : 18)).attr('fill', key === 'targeted' ? 'var(--red)' : 'var(--ink)').attr('class', 'chart-axis').text(label); }); }; const update = () => { const count = Number(byId('removal-slider').value); byId('removal-count').textContent = count; const item = values[count]; byId('removal-answer').textContent = `After removing ${count} ${count === 1 ? 'hub' : 'hubs'}, the giant component holds ${item.targeted} characters under targeted removal versus ${item.random} under this deterministic random order.`; draw(); }; byId('removal-slider').addEventListener('input', update); update(); }
function hash(value) { return [...value].reduce((sum, character) => (sum * 31 + character.charCodeAt(0)) % 997, 7); }
function renderGeneratedRemoval() { const values = data.removal.values; const draw = () => { const svg = d3.select('#removal-chart'); const width = svg.node().clientWidth || 700; const height = 360; const margin = { top: 20, right: 25, bottom: 45, left: 50 }; const x = d3.scaleLinear().domain([0, d3.max(values, (item) => item.removed)]).range([margin.left, width - margin.right]); const y = d3.scaleLinear().domain([0, d3.max(values, (item) => Math.max(item.degree, item.betweenness, item.random))]).range([height - margin.bottom, margin.top]); svg.attr('viewBox', `0 0 ${width} ${height}`).selectAll('*').remove(); svg.append('g').attr('class', 'chart-axis').attr('transform', `translate(0,${height - margin.bottom})`).call(d3.axisBottom(x).ticks(5)); svg.append('g').attr('class', 'chart-axis').attr('transform', `translate(${margin.left},0)`).call(d3.axisLeft(y).ticks(5)); [['degree', 'Degree order'], ['betweenness', 'Betweenness order'], ['random', 'Random order']].forEach(([key, label]) => { const path = d3.line().x((item) => x(item.removed)).y((item) => y(item[key])); svg.append('path').datum(values).attr('class', `removal-line ${key}`).attr('d', path); svg.append('text').attr('x', width - 145).attr('y', margin.top + (key === 'degree' ? 0 : key === 'betweenness' ? 18 : 36)).attr('fill', key === 'degree' ? 'var(--red)' : key === 'betweenness' ? 'var(--blue)' : 'var(--ink)').attr('class', 'chart-axis').text(label); }); }; const update = () => { const count = Number(byId('removal-slider').value); const item = values[count]; byId('removal-count').textContent = count; const single = data.removal.singleHit[0]; const highestBetweenness = data.centrality[0]; const finding = count === 0 ? `Single-hit test: ${single.name} fragments the giant component most, cutting off ${single.fragmented} characters. Highest betweenness is ${highestBetweenness.name}; ${single.id === highestBetweenness.id ? 'the rankings agree.' : 'the rankings disagree.'}` : `After removing ${count} ${count === 1 ? 'character' : 'characters'}, the giant component holds ${item.degree} after degree-order removal, ${item.betweenness} after betweenness-order removal, and ${item.random} after random removal.`; byId('removal-answer').textContent = finding; draw(); }; byId('removal-slider').addEventListener('input', update); update(); }
function renderClique(nodes) { const select = byId('clique-select'); populateSelect(select, [...nodes].sort((a, b) => adjacency.get(b.id).size - adjacency.get(a.id).size).slice(0, 80)); const update = () => { const id = select.value; const neighbors = [...adjacency.get(id)].slice(0, 100); const closed = neighbors.filter((neighbor, index) => neighbors.slice(index + 1).some((other) => adjacency.get(neighbor)?.has(other))).length; byId('clique-readout').innerHTML = `<strong>${nodeName(id)}</strong><br>${neighbors.length} immediate neighbors · ${triangles(id)} triangles around this node · ${neighbors.length > 1 ? format(triangles(id) * 2 / (neighbors.length * (neighbors.length - 1))) : 0} local closure`; byId('clique-grid').innerHTML = neighbors.slice(0, 70).map((neighbor) => { const hasClosedPair = neighbors.some((other) => other !== neighbor && adjacency.get(neighbor)?.has(other)); return `<span class="clique-cell ${hasClosedPair ? 'is-link' : ''}" title="${nodeName(neighbor)}"></span>`; }).join(''); }; select.addEventListener('change', update); update(); }
async function init() { data = await fetch(DATA_URL).then((response) => response.json()); makeGraph(); betweenness = new Map(data.centrality.map((node) => [node.id, node.betweenness])); const nodes = data.nodes; initRoutes(nodes); renderCentrality(nodes); renderGeneratedRemoval(); renderClique(nodes); initMysteryCharacter(); }
init().catch((error) => { console.error(error); document.querySelectorAll('.answer-line').forEach((element) => { element.textContent = 'Could not load the network snapshot. Run this project through a local HTTP server.'; }); });

/* Experiment 05 — The mystery character. Uses the loaded undirected snapshot. */
function mysteryEvidence() {
  const rockman = 'Rockman_(character)';
  const widow = 'Black_Widow_(Natasha_Romanova)';
  const witness = 'The_Witness_(character)';
  const immediate = [...adjacency.get(rockman)];
  const second = [...new Set(immediate.flatMap((id) => [...adjacency.get(id)]))]
    .filter((id) => id !== rockman && !immediate.includes(id)).sort((a, b) => nodeName(a).localeCompare(nodeName(b)));
  const without = new Map([...adjacency].filter(([id]) => id !== rockman)
    .map(([id, neighbors]) => [id, new Set([...neighbors].filter((other) => other !== rockman))]));
  const paths = second.slice(0, 3).map((id) => shortestPath(id, witness));
  const reachable = data.nodes.filter((node) => node.id !== rockman && node.id !== witness && shortestPath(node.id, witness).length);
  const lost = reachable.filter((node) => !shortestPath(node.id, witness, without).length);
  return { rockman, widow, witness, immediate, second, without, paths, lost };
}

function initMysteryCharacter() {
  const evidence = mysteryEvidence();
  const { rockman, widow, witness, immediate, second, paths, without, lost } = evidence;
  const name = (id) => nodeName(id).replace(/ \(.*?\)/g, '');
  const peers = data.centrality.filter((node) => node.degree === adjacency.get(rockman).size)
    .sort((a, b) => b.betweenness - a.betweenness);
  const score = betweenness.get(rockman);
  byId('mystery-degree').textContent = immediate.length;
  byId('mystery-betweenness').textContent = score.toFixed(5);
  byId('mystery-answer').textContent = `Rockman ranks ${peers.findIndex((node) => node.id === rockman) + 1} of ${peers.length} characters with ${immediate.length} links by betweenness. How can so few connections matter?`;
  const svg = d3.select('#mystery-chart').attr('viewBox', '0 0 900 540');
  let step = 0;
  const buttons = ['mystery-neighbors', 'mystery-expand', 'mystery-paths', 'mystery-remove'];
  const descriptions = [
    'The mystery: Rockman has only two links, yet leads every other degree-2 character in betweenness. Reveal his immediate neighbors to start investigating.',
    `The first clue: ${immediate.map(name).join(' and ')} are Rockman’s only neighbors. He is not a hub. Article references in either direction count as undirected connections.`,
    `One step further: the ${second.length} additional characters shown are neighbors of Rockman’s neighbors. Black Widow connects to the larger network; The Witness has only one link, to Rockman. This is the complete two-hop neighborhood, with every connection among the displayed characters.`,
    'Follow the evidence: three example shortest paths to The Witness all pass through Black Widow and Rockman. Betweenness sums the fraction of shortest paths between other pairs that pass through a character; endpoints do not count. These are examples, not the whole calculation.',
    `Case solved: Rockman and his two edges are removed. The Witness ${without.get(witness).size === 0 ? 'is now isolated' : 'has remaining neighbors'}. It loses routes to ${lost.length} other characters in the full snapshot. Rockman’s importance comes from providing access to that otherwise isolated endpoint, rather than splitting the network into two large groups.`
  ];
  const render = () => {
    const expanded = step >= 2;
    const removed = step === 4;
    const ids = step === 0 ? [rockman] : [rockman, ...immediate, ...(expanded ? second : [])];
    const visible = ids.filter((id) => !removed || id !== rockman);
    const positions = new Map([[rockman, { x: 450, y: step === 0 ? 270 : 365 }], [widow, { x: 450, y: 235 }], [witness, { x: 450, y: 480 }]]);
    second.forEach((id, index) => positions.set(id, { x: 75 + index % 8 * 107, y: 45 + Math.floor(index / 8) * 65 }));
    const selected = new Set(visible);
    const links = data.real.edges.filter(([source, target]) => selected.has(source) && selected.has(target));
    const highlighted = new Set();
    if (step === 3) paths.forEach((path) => path.slice(1).forEach((id, index) => highlighted.add([path[index], id].sort().join('|'))));
    svg.selectAll('*').remove();
    svg.attr('aria-label', `Rockman investigation: ${['case opened', 'immediate neighbors', 'complete two-hop neighborhood', 'three shortest paths', 'Rockman removed; The Witness isolated'][step]}`);
    svg.append('g').selectAll('line').data(links).join('line')
      .attr('class', (link) => `mystery-link${step === 3 ? highlighted.has([...link].sort().join('|')) ? ' highlighted' : ' dimmed' : ''}`)
      .attr('x1', ([source]) => positions.get(source).x).attr('y1', ([source]) => positions.get(source).y)
      .attr('x2', ([, target]) => positions.get(target).x).attr('y2', ([, target]) => positions.get(target).y);
    const nodes = svg.append('g').selectAll('g').data(visible).join('g')
      .attr('class', (id) => `mystery-node ${id === rockman ? 'rockman' : immediate.includes(id) ? 'neighbor' : 'background'}${removed && id === witness ? ' isolated' : ''}`)
      .attr('transform', (id) => `translate(${positions.get(id).x},${positions.get(id).y})`);
    nodes.append('circle').attr('r', (id) => id === rockman ? 18 : immediate.includes(id) ? 12 : 7);
    nodes.append('text').attr('y', 26).text(name);
    nodes.append('title').text((id) => `${nodeName(id)}: ${removed ? without.get(id).size : adjacency.get(id).size} connections in the full ${removed ? 'remaining ' : ''}snapshot`);
    if (removed) svg.append('text').attr('class', 'mystery-isolation-label').attr('x', 450).attr('y', 530).attr('text-anchor', 'middle').text('The Witness: no remaining connections');
    byId('mystery-state').textContent = ['Case opened', '1 / Immediate neighbors', '2 / One step further', '3 / Shortest paths', '4 / Rockman removed'][step];
    byId('mystery-explanation').textContent = descriptions[step];
    buttons.forEach((id, index) => {
      const button = byId(id);
      button.classList.toggle('active', step === index + 1);
      button.setAttribute('aria-pressed', String(step === index + 1));
    });
    byId('mystery-path-list').replaceChildren(...(step === 3 ? paths.map((path) => {
      const item = document.createElement('li');
      item.textContent = path.map(name).join(' → ');
      return item;
    }) : []));
  };
  buttons.forEach((id, index) => byId(id).addEventListener('click', () => { step = index + 1; render(); }));
  byId('mystery-reset').addEventListener('click', () => { step = 0; render(); });
  render();
}
