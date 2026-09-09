const DATA_URL = '../../data/week2_story.json';
const colors = { ink: '#17171a', red: '#ef5a44', acid: '#d9f05a', muted: '#706f6a', paper: '#f1ede5', blue: '#a7c8e8' };
let storyData;
let selectedHero = null;
let selectedStage = 0;
let rounds = [];
let growthIndex = 0;

const format = (value, digits = 2) => Number(value).toFixed(digits).replace(/\.00$/, '').replace(/(\.\d)0$/, '$1');
const byId = (id) => document.getElementById(id);
const metricLabel = { clustering: 'Clustering', triangles: 'Triangles', assortativity: 'Assortativity', meanPath: 'Mean path length', diameter: 'Diameter' };

function nodeMap() { return new Map(storyData.nodes.map((node) => [node.id, node])); }
function degreeMap() { return storyData.real.metrics.degrees; }
function edgesForIds(edges, ids) { const allowed = new Set(ids); return edges.filter(([source, target]) => allowed.has(source) && allowed.has(target)); }
function sizeScale() { return d3.scaleSqrt().domain([0, storyData.real.metrics.maxDegree]).range([2, 18]); }
function layoutNodes(ids, width, height) { const degrees = degreeMap(); const scale = sizeScale(); return ids.map((id, index) => ({ id, x: width / 2 + Math.cos(index * 2.399) * Math.min(width, height) * (.08 + Math.sqrt(index / ids.length) * .42), y: height / 2 + Math.sin(index * 2.399) * Math.min(width, height) * (.08 + Math.sqrt(index / ids.length) * .42), r: scale(degrees[id] || 0) })); }

function drawNetwork(selector, edges, ids, options = {}) {
  const svg = d3.select(selector);
  const width = svg.node().clientWidth || 700;
  const height = svg.node().clientHeight || 420;
  svg.selectAll('*').remove();
  const positions = new Map(layoutNodes(ids, width, height).map((node) => [node.id, node]));
  const nodes = ids.map((id) => positions.get(id));
  const edgeSelection = svg.append('g').selectAll('line').data(edges).join('line').attr('class', 'network-edge').attr('x1', (edge) => positions.get(edge[0])?.x).attr('y1', (edge) => positions.get(edge[0])?.y).attr('x2', (edge) => positions.get(edge[1])?.x).attr('y2', (edge) => positions.get(edge[1])?.y).style('opacity', 0).transition().duration(options.animate === false ? 0 : 700).style('opacity', 1);
  const nodeSelection = svg.append('g').selectAll('circle').data(nodes).join('circle').attr('class', (node) => `network-node ${degreeMap()[node.id] > storyData.real.metrics.maxDegree * .35 ? 'hub' : ''}`).attr('cx', (node) => node.x).attr('cy', (node) => node.y).attr('r', (node) => node.r).style('opacity', 0).on('mouseenter', (event, node) => showTooltip(event, node)).on('mouseleave', hideTooltip).on('click', (event, node) => selectHero(node.id)).transition().duration(options.animate === false ? 0 : 650).delay((node, index) => index * 2).style('opacity', 1);
  if (options.labels) {
    svg.append('g').selectAll('text').data(nodes.filter((node) => degreeMap()[node.id] > storyData.real.metrics.maxDegree * .35)).join('text').attr('class', 'network-label').attr('x', (node) => node.x + node.r + 4).attr('y', (node) => node.y + 3).text((node) => nodeMap().get(node.id).name);
  }
  return { svg, positions, nodes, edgeSelection, nodeSelection };
}

function showTooltip(event, node) {
  const tooltip = byId('network-tooltip');
  if (!tooltip) return;
  const metrics = storyData.real.metrics;
  const local = metrics.localClustering[node.id] || 0;
  tooltip.innerHTML = `<strong>${nodeMap().get(node.id).name}</strong><br>Degree: ${metrics.degrees[node.id]}<br>Triangles: ${trianglesFor(node.id, storyData.real.edges)}<br>Local clustering: ${format(local)}`;
  tooltip.style.display = 'block';
  tooltip.style.left = `${event.offsetX + 14}px`;
  tooltip.style.top = `${event.offsetY + 14}px`;
}
function hideTooltip() { const tooltip = byId('network-tooltip'); if (tooltip) tooltip.style.display = 'none'; }
function trianglesFor(id, edges) { const neighbors = new Set(); edges.forEach(([source, target]) => { if (source === id) neighbors.add(target); if (target === id) neighbors.add(source); }); const list = [...neighbors]; let links = 0; for (let index = 0; index < list.length; index += 1) for (let next = index + 1; next < list.length; next += 1) if (edges.some(([source, target]) => (source === list[index] && target === list[next]) || (source === list[next] && target === list[index]))) links += 1; return links; }

function renderStats() {
  const metrics = storyData.real.metrics;
  document.querySelector('[data-stat="n"]').textContent = metrics.n;
  document.querySelector('[data-stat="m"]').textContent = metrics.m.toLocaleString();
  document.querySelector('[data-stat="meanDegree"]').textContent = format(metrics.meanDegree);
  byId('real-answer').textContent = `${metrics.n} characters form ${metrics.m.toLocaleString()} undirected connections. The biggest hub has degree ${metrics.maxDegree}, so popularity is sharply uneven from the start.`;
}
function selectHero(id) { selectedHero = id; document.querySelectorAll('.network-node').forEach((node) => node.classList.toggle('selected', node.__data__?.id === id)); updateHeroInspector(); }
function neighborSet(edges, id) { const neighbors = new Set(); edges.forEach(([source, target]) => { if (source === id) neighbors.add(target); if (target === id) neighbors.add(source); }); return neighbors; }
function updateHeroInspector() {
  const inspector = byId('hero-inspector');
  if (!inspector || !selectedHero) return;
  const name = nodeMap().get(selectedHero).name;
  const realNeighbors = neighborSet(storyData.real.edges, selectedHero);
  const currentNeighbors = neighborSet(storyData.shuffleStages[selectedStage].edges, selectedHero);
  const retained = realNeighbors.size ? [...realNeighbors].filter((id) => currentNeighbors.has(id)).length / realNeighbors.size : 0;
  inspector.innerHTML = `<strong>${name}</strong> / Popularity ${degreeMap()[selectedHero]} → ${degreeMap()[selectedHero]} <b>UNCHANGED</b><br>Original neighbors retained: ${format(retained * 100, 0)}%<br>Triangles: ${trianglesFor(selectedHero, storyData.real.edges)} → ${trianglesFor(selectedHero, storyData.shuffleStages[selectedStage].edges)}<br>Current stage: ${storyData.shuffleStages[selectedStage].label}`;
}
function subsetIds() { const mode = byId('subset-select')?.value || 'all'; const sorted = [...storyData.nodes].sort((left, right) => degreeMap()[right.id] - degreeMap()[left.id]); if (mode === 'top20') return sorted.slice(0, 20).map((node) => node.id); if (mode === 'top50') return sorted.slice(0, 50).map((node) => node.id); if (mode === 'top100') return sorted.slice(0, 100).map((node) => node.id); if (mode === 'nonisolates') return sorted.filter((node) => degreeMap()[node.id] > 0).map((node) => node.id); return sorted.map((node) => node.id); }
function updateShuffle() { selectedStage = Number(byId('shuffle-slider').value); const ids = subsetIds(); drawNetwork('#shuffle-network', edgesForIds(storyData.shuffleStages[selectedStage].edges, new Set(ids)), ids, { labels: true, animate: true }); updateHeroInspector(); }

function renderNullMetrics() {
  const container = byId('null-metrics');
  const nullValues = ['clustering', 'triangles', 'assortativity', 'meanPath', 'diameter'];
  const maxByMetric = { clustering: storyData.real.metrics.clustering, triangles: storyData.real.metrics.triangles, assortativity: Math.max(Math.abs(storyData.real.metrics.assortativity), .01), meanPath: Math.max(storyData.real.metrics.meanPath, 1), diameter: Math.max(storyData.real.metrics.diameter, 1) };
  container.innerHTML = nullValues.map((key) => { const values = storyData.nullMetrics.map((item) => item[key]); const average = d3.mean(values); const real = storyData.real.metrics[key]; const scale = Math.max(...values.map((value) => Math.abs(value)), Math.abs(real), maxByMetric[key], .01); const nullWidth = Math.abs(average) / scale * 100; const realPosition = Math.abs(real) / scale * 100; return `<div class="metric-row"><label>${metricLabel[key]}</label><div class="metric-track"><i style="width:${Math.min(100, nullWidth)}%"></i><b class="metric-marker" style="left:${Math.min(100, realPosition)}%" aria-label="Real Marvel value ${format(real)}"></b></div><span class="metric-values">null ${format(average)} / real ${format(real)}</span></div>`; }).join('');
  const clustering = storyData.nullSummary.clustering;
  const triangles = storyData.nullSummary.triangles;
  byId('shuffle-answer').textContent = `Answer: degree survives by construction, but local structure does not. Marvel's clustering is ${format(storyData.real.metrics.clustering)} versus ${format(clustering.mean)} across the shuffled nulls, and its ${storyData.real.metrics.triangles.toLocaleString()} triangles compare with ${format(triangles.mean, 0)} on average. The null test shows what degree alone cannot explain; it does not identify a cause.`;
}

function renderBuild() {
  const step = storyData.ba.growth[growthIndex];
  const ids = step.nodes;
  const edges = step.edges;
  const container = byId('build-network');
  drawNetwork('#build-network', edges, ids, { labels: false, animate: false });
  const degrees = new Map(ids.map((id) => [id, 0]));
  edges.forEach(([source, target]) => { degrees.set(source, degrees.get(source) + 1); degrees.set(target, degrees.get(target) + 1); });
  byId('build-count').textContent = ids.length;
  byId('build-hub').textContent = Math.max(...degrees.values());
  byId('build-degree').textContent = format(edges.length * 2 / ids.length);
  const target = storyData.ba.metrics;
  byId('ba-answer').textContent = `Answer: with n = ${storyData.real.metrics.n} and m = ${storyData.ba.m}, the model creates a hub, but its maximum degree is ${target.maxDegree} versus ${storyData.real.metrics.maxDegree} in Marvel; clustering is ${format(target.clustering)} versus ${format(storyData.real.metrics.clustering)}, and triangles are ${target.triangles.toLocaleString()} versus ${storyData.real.metrics.triangles.toLocaleString()}. The clearest miss is the local structure around the hubs.`;
  container.closest('.sticky-visual')?.classList.toggle('is-growing', growthIndex < storyData.ba.growth.length - 1);
}
function grow() { if (growthIndex >= storyData.ba.growth.length - 1) return; growthIndex += 1; renderBuild(); }

function renderCcdf() {
  const svg = d3.select('#ccdf-chart');
  const width = svg.node().clientWidth || 700;
  const height = 340;
  const margin = { top: 20, right: 20, bottom: 45, left: 48 };
  const x = d3.scaleLog().domain([1, storyData.real.metrics.maxDegree]).range([margin.left, width - margin.right]);
  const y = d3.scaleLog().domain([1 / storyData.real.metrics.n, 1]).range([height - margin.bottom, margin.top]);
  svg.attr('viewBox', `0 0 ${width} ${height}`).selectAll('*').remove();
  svg.append('g').attr('class', 'ccdf-axis').attr('transform', `translate(0,${height - margin.bottom})`).call(d3.axisBottom(x).ticks(5, '~s'));
  svg.append('g').attr('class', 'ccdf-axis').attr('transform', `translate(${margin.left},0)`).call(d3.axisLeft(y).ticks(4, '~s'));
  const line = d3.line().x((point) => x(point.degree)).y((point) => y(point.survival));
  [['er', colors.muted, 'Random baseline'], ['ba', colors.blue, 'Built Marvel'], ['real', colors.red, 'Real Marvel']].forEach(([key, color, label]) => { svg.append('path').datum(storyData.ccdf[key]).attr('class', 'ccdf-line').attr('stroke', color).attr('d', line).style('opacity', 0).transition().delay(key === 'er' ? 0 : key === 'ba' ? 450 : 900).duration(700).style('opacity', 1); svg.append('text').attr('x', width - 125).attr('y', margin.top + (key === 'er' ? 0 : key === 'ba' ? 18 : 36)).attr('fill', color).attr('font-family', 'DM Mono').attr('font-size', 10).text(label); });
  const metrics = ['maxDegree', 'clustering', 'triangles', 'meanPath'];
  byId('ba-metrics').innerHTML = metrics.map((key) => `<div class="compare-cell"><label>${metricLabel[key] || key.replace('maxDegree', 'Maximum degree')}</label><strong>Real ${format(storyData.real.metrics[key])}</strong><span>Built ${format(storyData.ba.metrics[key])}</span></div>`).join('');
  const realFit = storyData.ccdfFit.real;
  const baFit = storyData.ccdfFit.ba;
  const erFit = storyData.ccdfFit.er;
  byId('distribution-answer').textContent = `Answer: Marvel is heavier-tailed than the random baseline and closer to preferential attachment in hub formation, but it is neither a random graph nor a BA replica. The log-log CCDF fits are R2 ${format(realFit.r2)} (Marvel), ${format(baFit.r2)} (BA), and ${format(erFit.r2)} (random); maximum degrees are ${storyData.real.metrics.maxDegree}, ${storyData.ba.metrics.maxDegree}, and ${storyData.er.metrics.maxDegree}. A straight-ish fit is descriptive here, not evidence that Marvel follows a power law or that BA is its true mechanism.`;
}

function playRound() {
  const candidates = storyData.game.nodes;
  const player = candidates[Math.floor(Math.random() * candidates.length)];
  const neighborId = player.neighbors[Math.floor(Math.random() * player.neighbors.length)];
  const neighbor = storyData.game.nodes.find((item) => item.id === neighborId) || { id: neighborId, name: nodeMap().get(neighborId).name, degree: degreeMap()[neighborId] };
  rounds.push({ player, neighbor });
  byId('player-card').querySelector('strong').textContent = player.name;
  byId('player-card').querySelector('small').textContent = `${player.degree} connections`;
  byId('friend-card').querySelector('strong').textContent = neighbor.name;
  byId('friend-card').querySelector('small').textContent = `${neighbor.degree} connections`;
  const friendWins = neighbor.degree > player.degree;
  byId('game-result').textContent = friendWins ? `${neighbor.name} is more popular: ${format(neighbor.degree / Math.max(player.degree, 1), 1)}× your connections.` : `You are the more popular one. The network breaks its pattern this time.`;
  byId('round-count').textContent = rounds.length;
  byId('friend-rate').textContent = `${format(rounds.filter((round) => round.neighbor.degree > round.player.degree).length / rounds.length * 100, 0)}%`;
  renderGameScatter();
}
function renderGameScatter() { const svg = d3.select('#game-scatter'); const width = svg.node().clientWidth || 500; const height = 230; const margin = { top: 15, right: 15, bottom: 28, left: 34 }; const max = storyData.real.metrics.maxDegree; const x = d3.scaleLinear().domain([0, max]).range([margin.left, width - margin.right]); const y = d3.scaleLinear().domain([0, max]).range([height - margin.bottom, margin.top]); svg.attr('viewBox', `0 0 ${width} ${height}`).selectAll('*').remove(); svg.append('line').attr('class', 'game-diagonal').attr('x1', x(0)).attr('y1', y(0)).attr('x2', x(max)).attr('y2', y(max)); svg.append('g').selectAll('circle').data(rounds).join('circle').attr('class', 'game-point').attr('cx', (round) => x(round.player.degree)).attr('cy', (round) => y(round.neighbor.degree)).attr('r', 4); svg.append('text').attr('x', width - 90).attr('y', height - 7).attr('font-family', 'DM Mono').attr('font-size', 9).text('your degree →'); }
function renderFriends() { const max = storyData.real.metrics.popularFriends[0][2]; byId('popular-friends').innerHTML = storyData.real.metrics.popularFriends.slice(0, 6).map(([, name, count, degree]) => `<div class="friend-row"><span>${name}</span><i style="width:${count / max * 100}%"></i><b>${degree}</b></div>`).join(''); const unbeatable = storyData.game.unbeatable.map(([, name, degree]) => `${name} (${degree})`).join(', '); byId('unbeatable').textContent = unbeatable ? `Nobody is strictly more popular than these characters across their neighborhoods: ${unbeatable}.` : 'No character is un-outpopularable in this snapshot: every connected hero has a neighbor with a higher degree.'; byId('paradox-summary').textContent = `${format(storyData.real.metrics.friendshipFraction * 100, 0)}% of connected characters have neighbors whose average degree is higher than their own.`; }

async function init() { storyData = await fetch(DATA_URL).then((response) => response.json()); renderStats(); const ids = storyData.nodes.map((node) => node.id); drawNetwork('#real-network', storyData.real.edges, ids, { labels: true }); updateShuffle(); renderNullMetrics(); renderBuild(); renderCcdf(); renderGameScatter(); renderFriends(); byId('shuffle-slider').addEventListener('input', updateShuffle); byId('subset-select').addEventListener('change', updateShuffle); byId('grow-button').addEventListener('click', grow); byId('play-button').addEventListener('click', playRound); document.querySelectorAll('[data-scroll-to]').forEach((button) => button.addEventListener('click', () => byId(button.dataset.scrollTo).scrollIntoView({ behavior: 'smooth' }))); window.addEventListener('resize', () => { drawNetwork('#real-network', storyData.real.edges, ids, { labels: true, animate: false }); updateShuffle(); renderCcdf(); renderGameScatter(); }); }
init().catch((error) => { console.error(error); document.querySelectorAll('.w2-network').forEach((element) => { element.insertAdjacentHTML('beforeend', '<p class="data-error">Could not load the computed network snapshot. Run this project through a local HTTP server.</p>'); }); });
