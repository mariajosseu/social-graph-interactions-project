const DATA_URL = 'data/week3_story.json';
const format = (value, digits = 2) => Number(value).toFixed(digits).replace(/\.00$/, '').replace(/(\.\d)0$/, '$1');
const byId = (id) => document.getElementById(id);
let data;
let teamData;
let homophilyData;
let cliqueMode = 'undirected';
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
function renderRoute(path) { const output = byId('route-output'); byId('route-answer').textContent = path.length ? `${path.length - 1} links make this route through Spider-Man. Each leg is a shortest path in the undirected snapshot.` : 'No route through Spider-Man exists for these characters.'; byId('route-chain').innerHTML = path.length ? path.map((id, index) => `${index ? '<span class="route-arrow">→</span>' : ''}<span class="route-node${nodeName(id) === 'Spider-Man' ? ' is-spider-man' : ''}">${nodeName(id)}</span>`).join('') : '<span class="route-node">Disconnected</span>'; output.querySelector('.route-count').textContent = path.length ? `${path.length - 1} edges` : 'No path'; }
function initRoutes(nodes) { const source = byId('route-source'); const target = byId('route-target'); populateSelect(source, nodes); populateSelect(target, nodes); source.value = nodes.find((node) => node.name === 'Spider-Man')?.id || nodes[0].id; target.value = nodes.find((node) => node.name === 'Captain America')?.id || nodes[1].id; const update = () => renderRoute(pathThroughSpiderMan(source.value, target.value)); source.addEventListener('change', update); target.addEventListener('change', update); byId('surprise-route').addEventListener('click', () => { const spiderMan = nodes.find((node) => node.name === 'Spider-Man')?.id || 'Spider-Man'; const connected = nodes.filter((node) => node.id !== spiderMan && pathThroughSpiderMan(node.id, spiderMan).length); let path = []; while (path.length < 3 || path.length > 9) { const left = connected[Math.floor(Math.random() * connected.length)]; const right = connected[Math.floor(Math.random() * connected.length)]; path = pathThroughSpiderMan(left.id, right.id); source.value = left.id; target.value = right.id; } renderRoute(path); }); update(); }
function drawCentralityNetwork(removed, top) { const svg = d3.select('#centrality-network'); const width = svg.node().clientWidth || 700; const height = 440; const positions = new Map(data.nodes.map((node, index) => { const angle = index * 2.39996; const radius = Math.min(width, height) * (.08 + Math.sqrt(index / data.nodes.length) * .42); return [node.id, { x: width / 2 + Math.cos(angle) * radius, y: height / 2 + Math.sin(angle) * radius }]; })); svg.attr('viewBox', `0 0 ${width} ${height}`).selectAll('*').remove(); svg.append('g').selectAll('line').data(data.real.edges).join('line').attr('class', ([source, target]) => `network-edge ${removed.has(source) || removed.has(target) ? 'removed' : ''}`).attr('x1', ([source]) => positions.get(source).x).attr('y1', ([source]) => positions.get(source).y).attr('x2', ([, target]) => positions.get(target).x).attr('y2', ([, target]) => positions.get(target).y); svg.append('g').selectAll('circle').data(data.nodes).join('circle').attr('class', (node) => `network-node ${top.some((item) => item.id === node.id) ? 'hub' : ''} ${removed.has(node.id) ? 'removed' : ''}`).attr('cx', (node) => positions.get(node.id).x).attr('cy', (node) => positions.get(node.id).y).attr('r', (node) => Math.min(9, 2 + Math.sqrt(adjacency.get(node.id)?.size || 0) * .45)); svg.append('g').selectAll('text').data(top.slice(0, 6).filter((node) => !removed.has(node.id))).join('text').attr('class', 'network-label').attr('x', (node) => positions.get(node.id).x + 6).attr('y', (node) => positions.get(node.id).y + 3).text((node) => node.name); }
function renderCentrality(nodes) { const values = nodes.map((node) => ({ ...node, degree: adjacency.get(node.id).size, betweenness: betweenness.get(node.id) || 0 })).filter((node) => node.degree > 0); const top = [...values].sort((a, b) => b.betweenness - a.betweenness); const maxDegree = Math.max(...values.map((node) => node.degree)); const maxBetween = Math.max(...values.map((node) => node.betweenness)); const svg = d3.select('#centrality-chart'); const width = svg.node().clientWidth || 700; const height = 440; const margin = { top: 24, right: 25, bottom: 48, left: 58 }; const x = d3.scaleLinear().domain([0, maxDegree]).nice().range([margin.left, width - margin.right]); const y = d3.scaleLinear().domain([0, maxBetween]).nice().range([height - margin.bottom, margin.top]); const tooltip = byId('centrality-tooltip'); const draw = () => { const order = byId('centrality-order')?.value || 'degree'; const removalOrder = data.removal.orders?.[order] || [...values].sort((a, b) => b.degree - a.degree).map((node) => node.id); const removed = new Set(removalOrder.slice(0, Number(byId('centrality-removal-slider')?.value || 0))); const visible = values.filter((node) => !removed.has(node.id)); if (byId('centrality-network')) drawCentralityNetwork(removed, top); svg.attr('viewBox', `0 0 ${width} ${height}`).selectAll('*').remove(); svg.append('g').attr('class', 'chart-axis').attr('transform', `translate(0,${height - margin.bottom})`).call(d3.axisBottom(x).ticks(6)); svg.append('g').attr('class', 'chart-axis').attr('transform', `translate(${margin.left},0)`).call(d3.axisLeft(y).ticks(5)); svg.append('text').attr('x', width / 2).attr('y', height - 8).attr('text-anchor', 'middle').attr('class', 'chart-axis').text('degree'); svg.append('text').attr('transform', 'rotate(-90)').attr('x', -height / 2).attr('y', 15).attr('text-anchor', 'middle').attr('class', 'chart-axis').text('betweenness'); svg.append('g').selectAll('circle').data(visible).join('circle').attr('class', (node) => `scatter-dot ${top.indexOf(node) < 10 ? 'bridge' : ''}`).attr('cx', (node) => x(node.degree)).attr('cy', (node) => y(node.betweenness)).attr('r', (node) => 2.5 + Math.sqrt(node.degree) / 2).on('mouseenter', (event, node) => { tooltip.innerHTML = `<strong>${node.name}</strong><br>Degree: ${node.degree}<br>Betweenness: ${format(node.betweenness)}<br>Triangles: ${triangles(node.id)}`; tooltip.style.display = 'block'; tooltip.style.left = `${event.offsetX + 12}px`; tooltip.style.top = `${event.offsetY + 12}px`; }).on('mouseleave', () => { tooltip.style.display = 'none'; }); if (byId('centrality-removal-count')) byId('centrality-removal-count').textContent = removed.size; byId('centrality-answer').textContent = removed.size ? `${removed.size} characters removed in ${order} order. ${visible.length} characters remain in the degree-versus-betweenness view.` : `${top[0].name} has the highest betweenness in this snapshot. Remove characters to watch the centrality cloud change.`; }; byId('centrality-order')?.addEventListener('change', draw); byId('centrality-removal-slider')?.addEventListener('input', draw); draw(); byId('bridge-list').innerHTML = top.slice(0, 3).map((node, index) => `<div class="bridge-card"><strong>${String(index + 1).padStart(2, '0')} / ${node.name}</strong><span>${node.degree} neighbors · betweenness ${format(node.betweenness)} · ${triangles(node.id)} closed neighbor pairs</span></div>`).join(''); }
function triangles(id) { const neighbors = [...(adjacency.get(id) || [])]; let count = 0; for (let index = 0; index < neighbors.length; index += 1) for (let next = index + 1; next < neighbors.length; next += 1) if (adjacency.get(neighbors[index])?.has(neighbors[next])) count += 1; return count; }
function componentSize(graph, excluded) { const unseen = new Set(data.nodes.map((node) => node.id).filter((id) => !excluded.has(id))); let largest = 0; while (unseen.size) { const start = unseen.values().next().value; unseen.delete(start); const queue = [start]; let size = 0; while (queue.length) { const current = queue.pop(); size += 1; for (const neighbor of graph.get(current) || []) if (unseen.delete(neighbor)) queue.push(neighbor); } largest = Math.max(largest, size); } return largest; }
function hash(value) { return [...value].reduce((sum, character) => (sum * 31 + character.charCodeAt(0)) % 997, 7); }
function cliqueTeamSummary(members, records) {
  const known = members.map((id) => records?.[id]).filter((record) => record?.status === 'known');
  const unknown = members.filter((id) => records?.[id]?.status !== 'known');
  const common = unknown.length || !known.length ? [] : known[0].affiliations.filter((team) =>
    known.every((record) => record.affiliations.some((affiliation) => affiliation.id === team.id)));
  return { common, unknown, knownCount: known.length };
}
function renderHomophily() {
  const result = homophilyData?.views[cliqueMode];
  if (!result || homophilyData.metadataGeneratedAt !== teamData?.generatedAt) {
    byId('homophily-answer').textContent = 'Homophily results are unavailable. Regenerate the network-wide affiliation and homophily snapshots.';
    d3.select('#homophily-chart').selectAll('*').remove();
    byId('homophily-method').textContent = '';
    return;
  }
  const observed = 100 * result.fraction;
  const baseline = 100 * result.nullMean;
  const significant = result.fraction > result.nullMean && result.pValue < .05;
  byId('homophily-answer').textContent = `${format(observed, 1)}% of eligible ${cliqueMode === 'directed' ? 'directed references' : 'undirected connections'} share a recorded affiliation, versus ${format(baseline, 1)}% on average in ${homophilyData.count.toLocaleString()} randomized networks (${result.differencePp >= 0 ? '+' : ''}${format(result.differencePp, 1)} percentage points; one-sided empirical p = ${result.pValue.toFixed(4)}). ${significant ? 'Team overlap is stronger than this degree-preserving chance baseline.' : 'This test does not establish stronger team overlap than chance.'}`;
  byId('homophily-method').innerHTML = `
    <div class="homophily-process"><span>Observed network</span><b aria-hidden="true">→</b><span>Rewire edges</span><b aria-hidden="true">→</b><span>Measure team overlap</span><b aria-hidden="true">→</b><span>Repeat ${homophilyData.count.toLocaleString()} times</span></div>
    <div class="homophily-rules"><span>Fixed ${cliqueMode === 'directed' ? 'in-degree + out-degree' : 'degree'}</span><span>Fixed affiliations</span><span>${homophilyData.attemptsPerEdge} swap attempts / edge</span><span>No self-links or duplicate edges</span><span>Connectivity may change</span>${cliqueMode === 'directed' ? '<span>Includes triangle reversals</span>' : ''}</div>
    <p>The shaded histogram is the approximate rewiring baseline; the red line shows observed overlap.</p>
    <p class="homophily-p-formula">p = (1 + random scores ≥ observed) / (${homophilyData.count} + 1) = <strong>${result.pValue.toFixed(4)}</strong></p>
    <p>Recorded affiliations include historical memberships and organizations. The comparison describes article affiliations, rather than social preference or a current team roster.</p>`;
  const svg = d3.select('#homophily-chart');
  const width = svg.node().clientWidth || 700;
  const height = 320;
  const margin = { top: 35, right: 28, bottom: 50, left: 55 };
  const values = result.samples.map((value) => value * 100);
  const x = d3.scaleLinear().domain([Math.max(0, Math.min(...values, observed) - 3), Math.min(100, Math.max(...values, observed) + 3)]).nice().range([margin.left, width - margin.right]);
  const bins = d3.bin().domain(x.domain()).thresholds(x.ticks(35))(values);
  const y = d3.scaleLinear().domain([0, d3.max(bins, (bin) => bin.length) || 1]).nice().range([height - margin.bottom, margin.top]);
  svg.attr('viewBox', `0 0 ${width} ${height}`).selectAll('*').remove();
  svg.append('title').text(`${cliqueMode} team homophily: observed ${format(observed, 1)}%, random mean ${format(baseline, 1)}%`);
  svg.append('desc').text(`${homophilyData.count} rewired networks. Null 95% interval: ${result.null95.map((value) => format(value * 100, 1)).join(' to ')} percent.`);
  svg.append('g').selectAll('rect').data(bins).join('rect').attr('class', 'homophily-bar')
    .attr('x', (bin) => x(bin.x0) + 1).attr('width', (bin) => Math.max(0, x(bin.x1) - x(bin.x0) - 1))
    .attr('y', (bin) => y(bin.length)).attr('height', (bin) => y(0) - y(bin.length))
    .append('title').text((bin) => `${format(bin.x0, 1)}–${format(bin.x1, 1)}%: ${bin.length} random networks`);
  svg.append('g').attr('class', 'chart-axis').attr('transform', `translate(0,${height - margin.bottom})`).call(d3.axisBottom(x).ticks(7).tickFormat((value) => `${value}%`));
  svg.append('g').attr('class', 'chart-axis').attr('transform', `translate(${margin.left},0)`).call(d3.axisLeft(y).ticks(5));
  svg.append('line').attr('class', 'homophily-observed').attr('x1', x(observed)).attr('x2', x(observed)).attr('y1', margin.top).attr('y2', height - margin.bottom);
  svg.append('text').attr('class', 'homophily-observed-label').attr('x', x(observed)).attr('y', 21).attr('text-anchor', observed > (x.domain()[0] + x.domain()[1]) / 2 ? 'end' : 'start').text(`Observed / ${format(observed, 1)}%`);
  svg.append('text').attr('class', 'chart-axis').attr('x', width / 2).attr('y', height - 8).attr('text-anchor', 'middle').text('Eligible edges sharing at least one recorded affiliation');
  svg.append('text').attr('class', 'chart-axis').attr('transform', 'rotate(-90)').attr('x', -height / 2).attr('y', 15).attr('text-anchor', 'middle').text('Random networks');
}
function renderClique() {
  const cliqueMemberName = (id) => teamData?.members[id]?.articleTitle || nodeName(id);
  const mode = cliqueMode;
  renderHomophily();
  const directed = mode === 'directed';
  const view = data.cliqueViews[mode];
  const cliques = view.largest;
  const graph = new Map(data.nodes.map((node) => [node.id, new Set()]));
  view.edges.forEach(([source, target]) => { graph.get(source).add(target); if (!directed) graph.get(target).add(source); });
  ['undirected', 'directed'].forEach((value) => {
    const button = byId(`clique-mode-${value}`);
    button.setAttribute('aria-pressed', String(value === mode));
    button.onclick = () => {
      if (cliqueMode === value) return;
      cliqueMode = value;
      renderClique();
    };
  });
  const shared = cliques[0].filter((id) => cliques.every((clique) => clique.includes(id)));
  const sharedSet = new Set(shared);
  const coreTeams = cliqueTeamSummary(shared, teamData?.members).common;
  const coreName = coreTeams.some((team) => team.id === 'X-Men') ? 'X-Men core' : 'Shared core';
  byId('clique-view-description').textContent = `${cliques.length} largest ${mode} cliques, each with ${view.largestSize} members. ${shared.length} members appear in every largest clique in this view and stay highlighted in red.`;
  byId('clique-view-definition').textContent = directed ? 'Directed view: a clique requires every ordered pair to connect—each article must reference every other member, giving two arrows per pair. A one-way reference is insufficient.' : 'Undirected view: an article reference in either direction counts as one connection. Every pair must connect.';
  const select = byId('clique-select');
  select.replaceChildren(...cliques.map((clique, index) => {
    const option = document.createElement('option');
    option.value = index;
    option.textContent = `${index + 1} / ${coreName} + ${clique.filter((id) => !sharedSet.has(id)).map((id) => cliqueMemberName(id).replace(/ \(.*\)$/, '')).join(' + ')}`;
    return option;
  }));
  const update = () => {
    const clique = cliques[Number(select.value)];
    // Keep the shared core in the same positions across all six selections.
    const members = [...shared, ...clique.filter((id) => !sharedSet.has(id))];
    const points = members.map((id, index) => {
      const angle = index * 2 * Math.PI / members.length - Math.PI / 2;
      return { id, x: 400 + 215 * Math.cos(angle), y: 320 + 215 * Math.sin(angle), angle };
    });
    const links = points.flatMap((source, index) => (directed ? points.filter((target) => target.id !== source.id) : points.slice(index + 1))
      .filter((target) => graph.get(source.id).has(target.id))
      .map((target) => ({ source, target })));
    byId('clique-readout').textContent = `Clique ${Number(select.value) + 1} of ${cliques.length} · ${members.length} members · ${links.length} of ${members.length * (members.length - 1) / (directed ? 1 : 2)} possible ${directed ? 'directed references' : 'undirected connections'}. ${shared.length} members appear in every largest clique in this view.`;
    const sharedAffiliations = new Set(cliqueTeamSummary(members, teamData?.members).common.map((team) => team.id));
    byId('clique-members').replaceChildren(...members.map((id) => {
      const item = document.createElement('li');
      item.className = sharedSet.has(id) ? 'clique-member is-shared' : 'clique-member';
      const name = document.createElement('strong');
      name.textContent = cliqueMemberName(id);
      const badge = document.createElement('span');
      badge.textContent = sharedSet.has(id) ? 'Shared core' : 'Varies by clique';
      item.append(name, badge);
      const record = teamData?.members[id];
      const affiliations = document.createElement('div');
      affiliations.className = 'clique-affiliations';
      affiliations.setAttribute('aria-label', 'Recorded affiliations');
      const teams = record?.status === 'known' ? [...record.affiliations] : [{ id: null, name: 'unknown' }];
      teams.sort((a, b) => Number(sharedAffiliations.has(b.id)) - Number(sharedAffiliations.has(a.id)));
      const makeLabel = (team) => {
        const label = document.createElement('span');
        const isShared = sharedAffiliations.has(team.id);
        label.className = `clique-affiliation-label${isShared ? ' is-shared-team' : ''}`;
        label.textContent = team.name;
        if (isShared) {
          label.title = 'Affiliation recorded for every member of this clique';
          label.setAttribute('aria-label', `${team.name}, shared by every clique member`);
        }
        return label;
      };
      affiliations.append(...teams.slice(0, 2).map(makeLabel));
      if (teams.length > 2) {
        const more = document.createElement('button');
        more.type = 'button';
        more.className = 'clique-affiliation-more';
        more.textContent = `+${teams.length - 2}`;
        more.setAttribute('aria-label', `Show ${teams.length - 2} more affiliations for ${cliqueMemberName(id)}`);
        const popover = document.createElement('div');
        popover.id = `clique-affiliation-popover-${members.indexOf(id)}`;
        popover.className = 'clique-affiliation-popover';
        popover.setAttribute('popover', 'auto');
        more.setAttribute('popovertarget', popover.id);
        const heading = document.createElement('strong');
        heading.textContent = `${cliqueMemberName(id)} / More affiliations`;
        const labels = document.createElement('div');
        labels.className = 'clique-affiliations';
        labels.append(...teams.slice(2).map(makeLabel));
        popover.append(heading, labels);
        popover.addEventListener('beforetoggle', (event) => {
          if (event.newState !== 'open') return;
          const rect = more.getBoundingClientRect();
          const width = Math.min(320, window.innerWidth - 32);
          const top = Math.max(16, Math.min(rect.bottom + 8, window.innerHeight - 180));
          popover.style.left = `${Math.max(16, Math.min(rect.right - width, window.innerWidth - width - 16))}px`;
          popover.style.top = `${top}px`;
          popover.style.maxHeight = `${window.innerHeight - top - 16}px`;
        });
        affiliations.append(more, popover);
      }
      item.append(affiliations);
      return item;
    }));
    const svg = d3.select('#clique-chart');
    svg.selectAll('*').remove();
    svg.append('title').text(`${mode} clique ${Number(select.value) + 1}: ${members.map(cliqueMemberName).join(', ')}`);
    svg.append('desc').text(`All ${links.length} ${directed ? 'directed references are drawn as arrows' : 'undirected connections are drawn as lines'}. Red nodes are the ${shared.length} members shared by every largest clique; dark nodes vary with the selection.`);
    if (directed) {
      svg.append('defs').append('marker').attr('id', 'clique-arrow')
        .attr('viewBox', '0 -4 8 8').attr('refX', 8).attr('refY', 0)
        .attr('markerWidth', 7).attr('markerHeight', 7).attr('orient', 'auto')
        .append('path').attr('d', 'M0,-4L8,0L0,4Z').attr('fill', 'var(--ink)');
    }
    svg.append('g').selectAll('path').data(links).join('path')
      .attr('class', `clique-edge${directed ? ' is-directed' : ''}`)
      .attr('marker-end', directed ? 'url(#clique-arrow)' : null)
      .attr('d', (link) => {
        const dx = link.target.x - link.source.x;
        const dy = link.target.y - link.source.y;
        const length = Math.hypot(dx, dy);
        const ux = dx / length;
        const uy = dy / length;
        if (!directed) return `M${link.source.x},${link.source.y}L${link.target.x},${link.target.y}`;
        // Opposite directions bend to opposite sides so both arrows remain visible.
        const sx = link.source.x + ux * 17;
        const sy = link.source.y + uy * 17;
        const tx = link.target.x - ux * 17;
        const ty = link.target.y - uy * 17;
        return `M${sx},${sy}Q${(sx + tx) / 2 - uy * 14},${(sy + ty) / 2 + ux * 14} ${tx},${ty}`;
      })
      .append('title').text((link) => `${cliqueMemberName(link.source.id)} ${directed ? '→' : '—'} ${cliqueMemberName(link.target.id)}`);
    const nodes = svg.append('g').selectAll('g').data(points).join('g')
      .attr('class', (point) => `clique-node${sharedSet.has(point.id) ? ' is-shared' : ''}`)
      .attr('transform', (point) => `translate(${point.x},${point.y})`);
    nodes.append('circle').attr('r', 11);
    nodes.append('title').text((point) => `${cliqueMemberName(point.id)} — ${sharedSet.has(point.id) ? 'shared core' : 'varies by clique'}`);
    nodes.each(function(point) {
      const label = d3.select(this).append('text')
        .attr('x', 32 * Math.cos(point.angle)).attr('y', 32 * Math.sin(point.angle))
        .attr('text-anchor', Math.abs(Math.cos(point.angle)) < 0.1 ? 'middle' : Math.cos(point.angle) > 0 ? 'start' : 'end');
      const name = cliqueMemberName(point.id);
      const split = name.indexOf(' (');
      label.append('tspan').text(split < 0 ? name : name.slice(0, split));
      if (split >= 0) label.append('tspan').attr('x', 32 * Math.cos(point.angle)).attr('dy', '1.3em').text(name.slice(split + 1));
    });
  };
  select.onchange = update;
  update();
}
async function init() {
  const loadJson = async (url) => {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
    return response.json();
  };
  [data, teamData, homophilyData] = await Promise.all([
    loadJson(DATA_URL),
    loadJson('data/week3_teams.json').catch((error) => { console.warn(error); return null; }),
    loadJson('data/week3_homophily.json').catch((error) => { console.warn(error); return null; }),
  ]);
  makeGraph();
  betweenness = new Map(data.centrality.map((node) => [node.id, node.betweenness]));
  const experiments = [
    ['route-answer', () => initRoutes(data.nodes)],
    ['centrality-answer', () => renderCentrality(data.nodes)],
    ['clique-readout', renderClique],
    ['mystery-answer', initMysteryCharacter],
  ];
  experiments.forEach(([answerId, render]) => {
    try {
      render();
    } catch (error) {
      console.error(`Week 03 / ${answerId}`, error);
      byId(answerId).textContent = `Could not render this experiment: ${error.message}`;
    }
  });
}
init().catch((error) => {
  console.error(error);
  document.querySelectorAll('.answer-line').forEach((element) => {
    element.textContent = window.location.protocol === 'file:'
      ? 'Serve this project over HTTP: python3 -m http.server 8000.'
      : `Could not load Week 03 data: ${error.message}`;
  });
});


/* Experiment 04 — The mystery character. Uses the loaded undirected snapshot. */
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
