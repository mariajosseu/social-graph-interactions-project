const DATA_URL = 'data/week4_story.json';
const communityColors = ['#ef5a44', '#31758b', '#d59a2b', '#6c5b7b', '#3c8d69', '#b85c38', '#5e6b73', '#9b3d64'];
const byId = (id) => document.getElementById(id);
let data;
let nodeById;

function alphaKey(value) { return Number(value).toString(); }
function format(value) { return Number(value).toLocaleString('en-US'); }
function communityColor(index) { return communityColors[index % communityColors.length]; }
function backboneFor(alpha) { return data.backbones[alphaKey(alpha)] || []; }
function renderLegend() {
  const legend = Array.from({ length: data.louvain.communities }, (_, index) => `<span class="legend-item"><i style="background:${communityColor(index)}"></i>${data.louvain.names[String(index)]}</span>`).join('');
  byId('community-legend').innerHTML = legend;
  byId('comparison-legend').innerHTML = legend;
}
function renderTable(activeAlpha) {
  const maxGiant = Math.max(...data.alphaStats.map((item) => item.giant));
  byId('alpha-table').innerHTML = data.alphaStats.map((item) => `<div class="alpha-row ${item.alpha === activeAlpha ? 'is-active' : ''}"><strong>α ${item.alpha.toFixed(2)}</strong><span>${format(item.edges)} links</span><div class="alpha-bar"><i style="width:${(item.giant / maxGiant) * 100}%"></i></div><span>${format(item.giant)} giant</span></div>`).join('');
}
function renderStrength() {
  const max = data.topStrength[0].strength;
  byId('strength-list').innerHTML = data.topStrength.map((item, index) => `<div class="strength-item"><small>${String(index + 1).padStart(2, '0')}</small><span>${item.name}<small>${format(item.degree)} distinct neighbors</small></span><strong>${format(item.strength)}</strong><div class="strength-bar"><i style="width:${(item.strength / max) * 100}%"></i></div></div>`).join('');
}
function renderComparison(mode = 'unweighted', moversOnly = false) {
  const svg = d3.select('#comparison-network');
  const width = svg.node().clientWidth || 800;
  const height = window.innerWidth <= 760 ? 380 : 520;
  const padding = 28;
  const x = d3.scaleLinear().domain(d3.extent(data.nodes, (node) => node.x)).range([padding, width - padding]);
  const y = d3.scaleLinear().domain(d3.extent(data.nodes, (node) => node.y)).range([padding, height - padding]);
  const movers = new Set(data.louvain.movers.map((node) => node.id));
  const visible = data.nodes.filter((node) => !moversOnly || movers.has(node.id));
  const visibleIds = new Set(visible.map((node) => node.id));
  const communityKey = mode === 'weighted' ? 'weightedCommunity' : 'community';
  svg.attr('viewBox', `0 0 ${width} ${height}`).selectAll('*').remove();
  svg.append('g').selectAll('line').data(data.edges.filter((edge) => visibleIds.has(edge[0]) && visibleIds.has(edge[1]))).join('line').attr('class', 'comparison-edge').attr('x1', (edge) => x(nodeById.get(edge[0]).x)).attr('y1', (edge) => y(nodeById.get(edge[0]).y)).attr('x2', (edge) => x(nodeById.get(edge[1]).x)).attr('y2', (edge) => y(nodeById.get(edge[1]).y)).attr('stroke-width', (edge) => mode === 'weighted' ? Math.min(2.5, .3 + edge[2] / 10) : .45).attr('opacity', moversOnly ? .22 : .1);
  svg.append('g').selectAll('circle').data(visible).join('circle').attr('class', 'comparison-node').attr('cx', (node) => x(node.x)).attr('cy', (node) => y(node.y)).attr('r', (node) => moversOnly ? Math.min(6, 1.5 + Math.sqrt(node.strength) / 7) : 1.7).attr('fill', (node) => communityColor(node[communityKey])).append('title').text((node) => `${node.name} · ${mode} community`);
  byId('nmi-value').textContent = data.louvain.nmi.toFixed(3);
  byId('mover-value').textContent = format(data.louvain.movers.length);
  byId('comparison-answer').textContent = `NMI ${data.louvain.nmi.toFixed(3)} means the methods agree on broad structure but disagree at many borders. Showing ${moversOnly ? 'only the movers' : 'the full giant component'}.`;
  byId('mover-list').innerHTML = data.louvain.movers.slice(0, 12).map((node, index) => `<div class="mover-row"><small>${String(index + 1).padStart(2, '0')}</small><span>${node.name}<small>strength ${format(node.strength)}</small></span><strong>${node.unweighted + 1} → ${node.weighted + 1}</strong></div>`).join('');
}
function inspectNode(node, alpha) {
  const kept = backboneFor(alpha).filter((edge) => edge[0] === node.id || edge[1] === node.id).sort((a, b) => b[2] - a[2]);
  const strongest = kept[0];
  const neighbor = strongest ? nodeById.get(strongest[0] === node.id ? strongest[1] : strongest[0]) : null;
  byId('node-inspector').innerHTML = `<span>Selected philosopher</span><strong>${node.name}</strong><span>${format(node.degree)} distinct links · strength ${format(node.strength)}</span><span>${kept.length ? `At α ${alpha.toFixed(2)}, their strongest retained tie is ${neighbor.name} (${strongest[2]} mentions).` : `No links survive at α ${alpha.toFixed(2)}.`}</span>`;
}
function renderNetwork(alpha) {
  const svg = d3.select('#backbone-network');
  const width = svg.node().clientWidth || 800;
  const height = window.innerWidth <= 760 ? 430 : 610;
  const padding = 34;
  const x = d3.scaleLinear().domain(d3.extent(data.nodes, (node) => node.x)).range([padding, width - padding]);
  const y = d3.scaleLinear().domain(d3.extent(data.nodes, (node) => node.y)).range([padding, height - padding]);
  const nodes = data.nodes;
  const kept = backboneFor(alpha);
  const visible = new Set(kept.flatMap((edge) => edge.slice(0, 2)));
  svg.attr('viewBox', `0 0 ${width} ${height}`).selectAll('*').remove();
  svg.append('g').selectAll('line').data(kept).join('line').attr('class', 'network-edge').attr('x1', (edge) => x(nodeById.get(edge[0]).x)).attr('y1', (edge) => y(nodeById.get(edge[0]).y)).attr('x2', (edge) => x(nodeById.get(edge[1]).x)).attr('y2', (edge) => y(nodeById.get(edge[1]).y)).attr('stroke-width', (edge) => Math.min(3, .45 + edge[2] / 8)).attr('opacity', (edge) => Math.min(.75, .15 + edge[2] / 20));
  svg.append('g').selectAll('circle').data(nodes.filter((node) => visible.has(node.id))).join('circle').attr('class', 'network-node').attr('cx', (node) => x(node.x)).attr('cy', (node) => y(node.y)).attr('r', (node) => Math.min(8, 1.8 + Math.sqrt(node.strength) / 5)).attr('fill', (node) => communityColor(node.community)).on('click', (_, node) => inspectNode(node, alpha)).append('title').text((node) => `${node.name} · strength ${node.strength}`);
  const labels = data.topStrength.slice(0, 3).map((item) => nodes.find((node) => node.name === item.name)).filter(Boolean).filter((node) => visible.has(node.id));
  svg.append('g').selectAll('text').data(labels).join('text').attr('x', (node) => x(node.x) + 7).attr('y', (node) => y(node.y) + 3).attr('fill', 'var(--ink)').attr('stroke', 'var(--paper)').attr('stroke-width', 3).attr('paint-order', 'stroke').attr('font-family', 'DM Mono').attr('font-size', 9).text((node) => node.name);
  const stats = data.alphaStats.find((item) => item.alpha === alpha);
  byId('edge-readout').textContent = format(stats.edges);
  byId('node-readout').textContent = format(stats.nodes);
  byId('giant-readout').textContent = format(stats.giant);
  byId('alpha-value').textContent = alpha.toFixed(2);
  byId('filter-answer').textContent = `At α = ${alpha.toFixed(2)}, ${format(stats.edges)} weighted links survive and the giant component holds ${format(stats.giant)} philosophers.`;
  byId('break-answer').textContent = stats.giant < 500 ? `The network has crossed its dramatic break: only ${format(stats.giant)} philosophers remain in the giant component.` : `The giant component still holds ${format(stats.giant)} philosophers; lower α to watch the historical conversation split.`;
  renderTable(alpha);
}
function init() {
  data = window.week4Data;
  nodeById = new Map(data.nodes.map((node) => [node.id, node]));
  renderLegend();
  renderStrength();
  let comparisonMode = 'unweighted';
  const updateComparison = () => renderComparison(comparisonMode, byId('mover-toggle').checked);
  document.querySelectorAll('[data-comparison-mode]').forEach((button) => button.addEventListener('click', () => {
    comparisonMode = button.dataset.comparisonMode;
    document.querySelectorAll('[data-comparison-mode]').forEach((item) => item.classList.toggle('active', item === button));
    updateComparison();
  }));
  byId('mover-toggle').addEventListener('change', updateComparison);
  updateComparison();
  const slider = byId('alpha-slider');
  const update = () => renderNetwork(Number(slider.value));
  slider.addEventListener('input', update);
  update();
  window.addEventListener('resize', () => { update(); updateComparison(); });
}
fetch(DATA_URL).then((response) => response.json()).then((payload) => { window.week4Data = payload; init(); }).catch(() => { byId('filter-answer').textContent = 'Could not load the snapshot. Run this project through a local HTTP server.'; });
