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
async function init() { data = await fetch(DATA_URL).then((response) => response.json()); makeGraph(); betweenness = new Map(data.centrality.map((node) => [node.id, node.betweenness])); const nodes = data.nodes; initRoutes(nodes); renderCentrality(nodes); renderGeneratedRemoval(); renderClique(nodes); }
init().catch((error) => { console.error(error); document.querySelectorAll('.answer-line').forEach((element) => { element.textContent = 'Could not load the network snapshot. Run this project through a local HTTP server.'; }); });

/* =========================================================
   EXPERIMENT 02B — THE MYSTERY CHARACTER
   ========================================================= */

function initMysteryCharacter() {

	const ROCKMAN = "Rockman_(character)";

	const DISPLAY_NAMES = {
		"Rockman_(character)": "Rockman",
		"Black_Widow_(Natasha_Romanova)": "Black Widow",
		"The_Witness_(character)": "The Witness"
	};

	/*
	 * -------------------------------------------------------
	 * 1. GET THE EDGES
	 * -------------------------------------------------------
	 *
	 * This assumes your existing Week 3 code has an `edges`
	 * array where each edge looks like:
	 *
	 * {
	 *   source: "...",
	 *   target: "..."
	 * }
	 *
	 * If your variable has a different name, change `edges`
	 * below.
	 */

	if (typeof edges === "undefined") {
		console.error(
			"Rockman visualization: `edges` was not found."
		);
		return;
	}


	/*
	 * -------------------------------------------------------
	 * 2. BUILD AN UNDIRECTED ADJACENCY MAP
	 * -------------------------------------------------------
	 *
	 * Your Marvel network is treated as undirected here,
	 * matching the centrality analysis.
	 */

	const adjacency = new Map();

	function addNode(node) {
		if (!adjacency.has(node)) {
			adjacency.set(node, new Set());
		}
	}

	edges.forEach(edge => {

		const source =
			typeof edge.source === "object"
				? edge.source.id
				: edge.source;

		const target =
			typeof edge.target === "object"
				? edge.target.id
				: edge.target;

		addNode(source);
		addNode(target);

		adjacency.get(source).add(target);
		adjacency.get(target).add(source);
	});


	/*
	 * -------------------------------------------------------
	 * 3. BASIC GRAPH FUNCTIONS
	 * -------------------------------------------------------
	 */

	function getNeighbors(node) {
		return Array.from(adjacency.get(node) || []);
	}


	function bfs(start, blockedNode = null) {

		const distances = new Map();
		const previous = new Map();

		if (start === blockedNode) {
			return { distances, previous };
		}

		const queue = [start];

		distances.set(start, 0);

		while (queue.length > 0) {

			const current = queue.shift();

			for (const neighbor of getNeighbors(current)) {

				if (neighbor === blockedNode) {
					continue;
				}

				if (!distances.has(neighbor)) {

					distances.set(
						neighbor,
						distances.get(current) + 1
					);

					previous.set(neighbor, current);

					queue.push(neighbor);
				}
			}
		}

		return { distances, previous };
	}


	function shortestPath(start, target, blockedNode = null) {

		const result = bfs(start, blockedNode);

		if (!result.distances.has(target)) {
			return null;
		}

		const path = [];
		let current = target;

		while (current !== undefined) {

			path.push(current);

			if (current === start) {
				break;
			}

			current = result.previous.get(current);
		}

		path.reverse();

		return path;
	}


	/*
	 * -------------------------------------------------------
	 * 4. FIND ROCKMAN'S NEIGHBORHOOD
	 * -------------------------------------------------------
	 */

	const rockmanNeighbors = getNeighbors(ROCKMAN);

	console.log(
		"Rockman neighbors:",
		rockmanNeighbors
	);


	/*
	 * -------------------------------------------------------
	 * 5. TRY TO FIND THE WITNESS
	 * -------------------------------------------------------
	 */

	const witness = rockmanNeighbors.find(node =>
		node.toLowerCase().includes("witness")
	);

	const blackWidow = rockmanNeighbors.find(node =>
		node.toLowerCase().includes("black_widow")
	);


	/*
	 * -------------------------------------------------------
	 * 6. CREATE THE SVG
	 * -------------------------------------------------------
	 */

	const svg = d3.select("#mystery-chart");

	if (svg.empty()) {
		console.error("Rockman visualization: SVG not found.");
		return;
	}

	svg.selectAll("*").remove();

	const svgNode = svg.node();

	let width =
		svgNode.getBoundingClientRect().width || 700;

	let height =
		svgNode.getBoundingClientRect().height || 480;

	svg.attr(
		"viewBox",
		`0 0 ${width} ${height}`
	);


	/*
	 * -------------------------------------------------------
	 * 7. STATE
	 * -------------------------------------------------------
	 */

	let state = {
		expanded: false,
		showPaths: false,
		removed: false
	};


	/*
	 * -------------------------------------------------------
	 * 8. BUILD INITIAL NODES
	 * -------------------------------------------------------
	 */

	function buildNodes() {

		const nodes = [];

		/*
		 * Rockman
		 */

		nodes.push({
			id: ROCKMAN,
			label: DISPLAY_NAMES[ROCKMAN] || "Rockman",
			type: "rockman"
		});


		/*
		 * Direct neighbors
		 */

		rockmanNeighbors.forEach(node => {

			nodes.push({
				id: node,
				label: DISPLAY_NAMES[node] || prettyName(node),
				type: "neighbor"
			});

		});


		/*
		 * Second neighborhood
		 */

		if (state.expanded) {

			const secondNeighbors = new Set();

			rockmanNeighbors.forEach(neighbor => {

				getNeighbors(neighbor).forEach(node => {

					if (
						node !== ROCKMAN &&
						!rockmanNeighbors.includes(node)
					) {
						secondNeighbors.add(node);
					}

				});

			});

			Array.from(secondNeighbors)
				.slice(0, 35)
				.forEach(node => {

					nodes.push({
						id: node,
						label: prettyName(node),
						type: "background"
					});

				});
		}

		return nodes;
	}


	function prettyName(name) {

		return name
			.replace(/_\(.*?\)/g, "")
			.replace(/_/g, " ");
	}


	/*
	 * -------------------------------------------------------
	 * 9. BUILD LINKS
	 * -------------------------------------------------------
	 */

	function buildLinks(nodes) {

		const nodeIds = new Set(nodes.map(node => node.id));

		const links = [];

		edges.forEach(edge => {

			const source =
				typeof edge.source === "object"
					? edge.source.id
					: edge.source;

			const target =
				typeof edge.target === "object"
					? edge.target.id
					: edge.target;

			if (
				nodeIds.has(source) &&
				nodeIds.has(target)
			) {

				links.push({
					source,
					target
				});

			}
		});

		return links;
	}


	/*
	 * -------------------------------------------------------
	 * 10. RENDER
	 * -------------------------------------------------------
	 */

	function render() {

		svg.selectAll("*").remove();

		const nodes = buildNodes();

		const links = buildLinks(nodes);

		const nodeMap = new Map(
			nodes.map(node => [node.id, node])
		);


		/*
		 * Layout
		 */

		const centerX = width / 2;
		const centerY = height / 2;

		const rockmanNode =
			nodeMap.get(ROCKMAN);

		if (rockmanNode) {
			rockmanNode.x = centerX;
			rockmanNode.y = centerY;
		}


		const directNeighbors =
			nodes.filter(node =>
				node.type === "neighbor"
			);

		directNeighbors.forEach((node, i) => {

			const angle =
				(i / Math.max(directNeighbors.length, 1))
				* Math.PI * 2;

			node.x =
				centerX + Math.cos(angle) * 150;

			node.y =
				centerY + Math.sin(angle) * 150;
		});


		const backgroundNodes =
			nodes.filter(node =>
				node.type === "background"
			);

		backgroundNodes.forEach((node, i) => {

			const angle =
				(i / Math.max(backgroundNodes.length, 1))
				* Math.PI * 2;

			const radius = 210;

			node.x =
				centerX + Math.cos(angle) * radius;

			node.y =
				centerY + Math.sin(angle) * radius;
		});


		/*
		 * Draw links
		 */

		const linkSelection = svg
			.append("g")
			.selectAll("line")
			.data(links)
			.enter()
			.append("line")
			.attr("class", "mystery-link")
			.attr("x1", d => nodeMap.get(d.source).x)
			.attr("y1", d => nodeMap.get(d.source).y)
			.attr("x2", d => nodeMap.get(d.target).x)
			.attr("y2", d => nodeMap.get(d.target).y);


		/*
		 * Draw nodes
		 */

		const nodeSelection = svg
			.append("g")
			.selectAll("g")
			.data(nodes)
			.enter()
			.append("g")
			.attr(
				"class",
				d => `mystery-node ${d.type}`
			)
			.attr(
				"transform",
				d => `translate(${d.x},${d.y})`
			);


		nodeSelection
			.append("circle")
			.attr(
				"r",
				d => {
					if (d.type === "rockman") return 18;
					if (d.type === "neighbor") return 12;
					return 7;
				}
			);


		nodeSelection
			.append("text")
			.attr(
				"dy",
				d => {
					if (d.type === "rockman") return 35;
					return 25;
				}
			)
			.text(d => d.label);


		/*
		 * ---------------------------------------------------
		 * Highlight shortest paths
		 * ---------------------------------------------------
		 */

		if (state.showPaths) {

			const paths = [];

			/*
			 * Find some paths from background nodes
			 * to The Witness.
			 */

			if (witness) {

				backgroundNodes
					.slice(0, 8)
					.forEach(node => {

						const path =
							shortestPath(
								node.id,
								witness
							);

						if (path) {
							paths.push(path);
						}

					});
			}


			/*
			 * Turn path edges into strings so we can
			 * highlight them.
			 */

			const highlightedEdges = new Set();

			paths.forEach(path => {

				for (let i = 0; i < path.length - 1; i++) {

					const a = path[i];
					const b = path[i + 1];

					highlightedEdges.add(
						`${a}|||${b}`
					);

					highlightedEdges.add(
						`${b}|||${a}`
					);
				}
			});


			linkSelection
				.classed(
					"highlighted",
					d => highlightedEdges.has(
						`${d.source}|||${d.target}`
					)
				)
				.classed(
					"dimmed",
					d => !highlightedEdges.has(
						`${d.source}|||${d.target}`
					)
				);
		}


		/*
		 * ---------------------------------------------------
		 * Rockman removed
		 * ---------------------------------------------------
		 */

		if (state.removed) {

			nodeSelection
				.filter(d => d.id === ROCKMAN)
				.classed("removed", true);

			linkSelection
				.filter(d =>
					d.source === ROCKMAN ||
					d.target === ROCKMAN
				)
				.classed("dimmed", true);
		}
	}


	/*
	 * -------------------------------------------------------
	 * 11. BUTTONS
	 * -------------------------------------------------------
	 */

	const expandButton =
		document.getElementById("mystery-expand");

	const pathsButton =
		document.getElementById("mystery-paths");

	const removeButton =
		document.getElementById("mystery-remove");

	const resetButton =
		document.getElementById("mystery-reset");


	expandButton.addEventListener(
		"click",
		() => {

			state.expanded = true;

			expandButton.classList.add("active");

			document.getElementById(
				"mystery-state"
			).textContent =
				"Neighborhood revealed";

			document.getElementById(
				"mystery-explanation"
			).innerHTML = `
				<p>
					<strong>Look closer.</strong>
					Rockman's two links connect very different parts
					of the local network. His degree is small, but his
					position is strategic.
				</p>
			`;

			render();
		}
	);


	pathsButton.addEventListener(
		"click",
		() => {

			state.expanded = true;
			state.showPaths = true;

			expandButton.classList.add("active");
			pathsButton.classList.add("active");

			document.getElementById(
				"mystery-state"
			).textContent =
				"Shortest paths highlighted";

			document.getElementById(
				"mystery-explanation"
			).innerHTML = `
				<p>
					<strong>This is the key.</strong>
					The highlighted routes pass through Rockman.
					Betweenness rewards exactly this kind of
					position: sitting between other nodes on their
					shortest paths.
				</p>
			`;

			render();
		}
	);


	removeButton.addEventListener(
		"click",
		() => {

			state.removed = true;

			removeButton.classList.add("active");

			document.getElementById(
				"mystery-state"
			).textContent =
				"Rockman removed";

			document.getElementById(
				"mystery-explanation"
			).innerHTML = `
				<p>
					<strong>Now remove the bridge.</strong>
					Rockman's two direct links disappear with him.
					The visualization shows why a low-degree node can
					still have a structural role.
				</p>
			`;

			render();
		}
	);


	resetButton.addEventListener(
		"click",
		() => {

			state = {
				expanded: false,
				showPaths: false,
				removed: false
			};

			document.querySelectorAll(
				".mystery-controls .story-button"
			).forEach(button => {
				button.classList.remove("active");
			});

			document.getElementById(
				"mystery-state"
			).textContent =
				"Rockman connected";

			document.getElementById(
				"mystery-explanation"
			).innerHTML = `
				<p>
					<strong>The mystery:</strong>
					two links do not necessarily mean a small
					structural role.
				</p>
			`;

			render();
		}
	);


	/*
	 * -------------------------------------------------------
	 * 12. STATS
	 * -------------------------------------------------------
	 */

	document.getElementById(
		"mystery-degree"
	).textContent =
		rockmanNeighbors.length;


	/*
	 * If your existing JS has a betweenness object,
	 * use it here.
	 */

	if (
		typeof betweennessCentrality !== "undefined" &&
		betweennessCentrality[ROCKMAN] !== undefined
	) {

		document.getElementById(
			"mystery-betweenness"
		).textContent =
			betweennessCentrality[ROCKMAN].toFixed(1);

	} else {

		document.getElementById(
			"mystery-betweenness"
		).textContent =
			"—";

	}


	/*
	 * -------------------------------------------------------
	 * 13. INITIAL RENDER
	 * -------------------------------------------------------
	 */

	render();
}


/* =========================================================
   START THE MYSTERY CHARACTER EXPERIMENT
   ========================================================= */

initMysteryCharacter();