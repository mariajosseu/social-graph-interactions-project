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
  initCompare();
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

function initCompare() {
  const compareValueA = document.getElementById('compare-value-a');
  const compareValueB = document.getElementById('compare-value-b');
  const compareMetrics = document.getElementById('compare-metrics');
  const compareSummary = document.getElementById('compare-summary');

  if (!compareValueA || !compareValueB) return;

  const nodes = Array.isArray(data?.nodes) ? data.nodes : [];
  const edges = backboneFor(0.2);
  const communityNames = data?.louvain?.names || {};
  const getName = (node) => node?.name || node?.label || String(node?.id || 'Unnamed');
  const edgeKey = (source, target) => [String(source), String(target)].sort().join('::');

  const communities = Array.from(
    nodes.reduce((groups, node) => {
      const id = String(node.community);
      if (!groups.has(id)) {
        groups.set(id, {
          id,
          label: communityNames[id] || `Community ${id}`,
          members: [],
        });
      }
      groups.get(id).members.push(node);
      return groups;
    }, new Map()).values()
  );

  const groupOptions = () => communities;

  const setSelectOptions = (select, options, fallbackValue) => {
    select.innerHTML = '';

    if (!options.length) {
      const option = document.createElement('option');
      option.value = fallbackValue || '';
      option.textContent = 'No data';
      select.appendChild(option);
      return;
    }

    options.forEach((optionData) => {
      const option = document.createElement('option');
      option.value = String(optionData.id);
      option.textContent = optionData.label;
      select.appendChild(option);
    });

    if (fallbackValue) {
      select.value = String(fallbackValue);
    }
  };

  const getSelectedGroup = (value) => {
    const options = groupOptions();
    const match = options.find((entry) => String(entry.id) === String(value));
    if (match) return match;

    if (!options.length) return { id: 'none', label: 'None', members: [] };

    return options[0];
  };

  const getCentrality = (member) => {
    return Number(member?.strength || member?.degree || 0);
  };

  const getWithinEdgeSet = (groupMembers) => {
    const members = groupMembers || [];
    const memberKeys = new Set(members.map((member) => String(member.id)));
    const set = new Set();

    edges.forEach(([source, target]) => {
      if (memberKeys.has(String(source)) && memberKeys.has(String(target))) {
        set.add(edgeKey(source, target));
      }
    });

    return set;
  };

  const getCrossEdgeCount = (membersA, membersB) => {
    const keysA = new Set(membersA.map((member) => String(member.id)));
    const keysB = new Set(membersB.map((member) => String(member.id)));

    return edges.filter(([source, target]) => (
      (keysA.has(String(source)) && keysB.has(String(target)))
      || (keysA.has(String(target)) && keysB.has(String(source)))
    )).length;
  };

  const getDensity = (members, internalEdgeCount) => {
    const possibleEdges = (members.length * (members.length - 1)) / 2;
    return possibleEdges ? internalEdgeCount / possibleEdges : 0;
  };

  const getModularityContribution = (members, internalEdgeCount) => {
    if (!edges.length) return 0;

    const memberKeys = new Set(members.map((member) => String(member.id)));
    const degreeSum = edges.reduce((sum, [source, target]) => {
      const sourceInGroup = memberKeys.has(String(source));
      const targetInGroup = memberKeys.has(String(target));
      return sum + (sourceInGroup ? 1 : 0) + (targetInGroup ? 1 : 0);
    }, 0);

    return (internalEdgeCount / edges.length) - ((degreeSum / (2 * edges.length)) ** 2);
  };

  const getGroupLabel = (group) => group.label || group.name || group.id || 'Group';

  const renderCompareMetrics = (aGroup, bGroup) => {
    const membersA = Array.isArray(aGroup.members) ? aGroup.members : [];
    const membersB = Array.isArray(bGroup.members) ? bGroup.members : [];
    const edgesA = getWithinEdgeSet(membersA);
    const edgesB = getWithinEdgeSet(membersB);
    const crossEdges = getCrossEdgeCount(membersA, membersB);
    const densityA = getDensity(membersA, edgesA.size);
    const densityB = getDensity(membersB, edgesB.size);
    const modularityA = getModularityContribution(membersA, edgesA.size);
    const modularityB = getModularityContribution(membersB, edgesB.size);
    const avgA = membersA.length ? membersA.reduce((sum, item) => sum + getCentrality(item), 0) / membersA.length : 0;
    const avgB = membersB.length ? membersB.reduce((sum, item) => sum + getCentrality(item), 0) / membersB.length : 0;

    const topA = [...membersA].sort((x, y) => getCentrality(y) - getCentrality(x)).slice(0, 3);
    const topB = [...membersB].sort((x, y) => getCentrality(y) - getCentrality(x)).slice(0, 3);
    const labelA = getGroupLabel(aGroup);
    const labelB = getGroupLabel(bGroup);
    const memberKeysA = new Set(membersA.map((member) => String(member.id)));
    const sameSelection = membersA.length === membersB.length
      && membersB.every((member) => memberKeysA.has(String(member.id)));
    const summary = sameSelection
      ? `<p><strong>Same selection:</strong> ${labelA} contains ${membersA.length} members, ${edgesA.size} internal links, and a density of ${(densityA * 100).toFixed(1)}%. Choose a different community to compare its structure.</p>`
      : `<p><strong>These communities differ because</strong> ${labelA} has ${membersA.length} members and ${edgesA.size} internal links, while ${labelB} has ${membersB.length} members and ${edgesB.size}. They have ${crossEdges} links between them. The denser community is ${densityA >= densityB ? labelA : labelB}, while the stronger average centrality belongs to ${avgA >= avgB ? labelA : labelB}.</p>`;

    compareMetrics.innerHTML = `
      <div class="compare-metric">
        <span>${labelA} size</span>
        <strong>${membersA.length}</strong>
      </div>
      <div class="compare-metric">
        <span>${labelB} size</span>
        <strong>${membersB.length}</strong>
      </div>
      <div class="compare-metric">
        <span>size difference</span>
        <strong>${Math.abs(membersA.length - membersB.length)}</strong>
      </div>
      <div class="compare-metric">
        <span>links between groups</span>
        <strong>${crossEdges}</strong>
      </div>
      <div class="compare-metric">
        <span>internal density</span>
        <strong>${(densityA * 100).toFixed(1)}% / ${(densityB * 100).toFixed(1)}%</strong>
      </div>
      <div class="compare-metric">
        <span>modularity contribution</span>
        <strong>${modularityA.toFixed(3)} / ${modularityB.toFixed(3)}</strong>
      </div>
      <div class="compare-metric">
        <span>avg centrality</span>
        <strong>${avgA.toFixed(2)} / ${avgB.toFixed(2)}</strong>
      </div>
    `;

    const aRank = topA.length ? topA.map((member, index) => `
      <li>
        <span class="rank">${index + 1}</span>
        <span class="name">${getName(member)}</span>
        <span class="score">${getCentrality(member).toFixed(2)}</span>
      </li>
    `).join('') : '<li><span class="name">No members</span></li>';

    const bRank = topB.length ? topB.map((member, index) => `
      <li>
        <span class="rank">${index + 1}</span>
        <span class="name">${getName(member)}</span>
        <span class="score">${getCentrality(member).toFixed(2)}</span>
      </li>
    `).join('') : '<li><span class="name">No members</span></li>';

    compareSummary.innerHTML = `
      ${summary}
      <div style="display:grid; gap:1rem; grid-template-columns:1fr 1fr; margin-top:1rem;">
        <div>
          <p style="margin:0 0 .5rem; font:.56rem 'DM Mono', monospace; text-transform:uppercase; color:var(--muted);">${getGroupLabel(aGroup)}</p>
          <ul class="compare-ranking">${aRank}</ul>
        </div>
        <div>
          <p style="margin:0 0 .5rem; font:.56rem 'DM Mono', monospace; text-transform:uppercase; color:var(--muted);">${getGroupLabel(bGroup)}</p>
          <ul class="compare-ranking">${bRank}</ul>
        </div>
      </div>
    `;
  };

  const updateCompare = () => {
    const valueA = compareValueA.value;
    const valueB = compareValueB.value;

    const groupA = getSelectedGroup(valueA);
    const groupB = getSelectedGroup(valueB);

    renderCompareMetrics(groupA, groupB);
  };

  const syncOptions = () => {
    const optionsA = groupOptions();
    const optionsB = groupOptions();

    setSelectOptions(compareValueA, optionsA, optionsA[0]?.id || '');
    setSelectOptions(compareValueB, optionsB, optionsB[0]?.id || '');

    updateCompare();
  };

  compareValueA.addEventListener('change', updateCompare);
  compareValueB.addEventListener('change', updateCompare);

  syncOptions();
}

fetch(DATA_URL).then((response) => response.json()).then((payload) => { window.week4Data = payload; init(); }).catch(() => { byId('filter-answer').textContent = 'Could not load the snapshot. Run this project through a local HTTP server.'; });
