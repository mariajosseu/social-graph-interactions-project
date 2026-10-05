(() => {
	const svgNamespace = 'http://www.w3.org/2000/svg';
	const byId = (id) => document.getElementById(id);
	const articleDirectory = 'data/marvel_pages/';
	let sequences = {};
	let activeOrder = 'famous';
	let visiblePages = 0;
	let autoplayTimer = null;

	function makeSvg(tag, attributes = {}) {
		const element = document.createElementNS(svgNamespace, tag);
		Object.entries(attributes).forEach(([name, value]) => element.setAttribute(name, value));
		return element;
	}

	function parseTable(text) {
		const lines = text.split(/\r?\n/).filter((line) => line && !line.startsWith('#'));
		const headers = lines.shift().split('\t');
		return lines.map((line) => {
			const values = line.split('\t');
			return Object.fromEntries(headers.map((header, index) => [header, values[index] || '']));
		});
	}

	function parseEdges(text) {
		return text.split(/\r?\n/)
			.filter((line) => line.trim() && !line.startsWith('#'))
			.map((line) => line.split('\t'));
	}

	async function fetchArticle(nodeId) {
		const encodedId = encodeURIComponent(nodeId);
		for (const url of [`${articleDirectory}${encodedId}.txt`, `${articleDirectory}${encodeURIComponent(encodedId)}.txt`]) {
			const response = await fetch(url);
			if (response.ok) return response.text();
		}
		return '';
	}

	function tokens(text) {
		return new Set((text.toLowerCase().match(/[a-z][a-z'-]*/g) || []).filter((token) => token.length > 1));
	}

	function buildSequence(nodes, order) {
		const sorted = [...nodes].sort((a, b) => order === 'famous'
			? b.inDegree - a.inDegree || a.name.localeCompare(b.name)
			: a.inDegree - b.inDegree || a.name.localeCompare(b.name));
		const vocabulary = new Set();
		return sorted.map((node) => {
			tokens(node.article).forEach((token) => vocabulary.add(token));
			return { ...node, vocabulary: vocabulary.size };
		});
	}

	function fitHeaps(sequence) {
		const points = sequence.filter((point) => point.vocabulary > 0);
		const meanX = points.reduce((sum, point, index) => sum + Math.log(index + 1), 0) / points.length;
		const meanY = points.reduce((sum, point) => sum + Math.log(point.vocabulary), 0) / points.length;
		const slopeNumerator = points.reduce((sum, point, index) => sum + (Math.log(index + 1) - meanX) * (Math.log(point.vocabulary) - meanY), 0);
		const slopeDenominator = points.reduce((sum, point, index) => sum + (Math.log(index + 1) - meanX) ** 2, 0);
		const beta = slopeDenominator ? slopeNumerator / slopeDenominator : 0;
		return { beta, k: Math.exp(meanY - beta * meanX) };
	}

	function renderGraph(sequence) {
		const svg = byId('heaps-graph');
		const width = 920;
		const height = 500;
		const margin = { top: 28, right: 28, bottom: 62, left: 74 };
		const plotWidth = width - margin.left - margin.right;
		const plotHeight = height - margin.top - margin.bottom;
		const maxVocabulary = Math.max(...sequence.map((point) => point.vocabulary), 1);
		const x = (value) => margin.left + (value / sequence.length) * plotWidth;
		const y = (value) => margin.top + plotHeight - (value / maxVocabulary) * plotHeight;
		svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
		svg.replaceChildren();
		const title = makeSvg('title');
		title.textContent = 'Heaps law vocabulary growth in the Marvel article corpus';
		svg.append(title);
		const description = makeSvg('desc');
		description.textContent = 'Cumulative unique vocabulary as Marvel pages are added in network-degree order.';
		svg.append(description);

		for (let tick = 0; tick <= sequence.length; tick += 50) {
			const tickX = x(tick);
			svg.append(makeSvg('line', { class: 'heaps-grid', x1: tickX, x2: tickX, y1: margin.top, y2: margin.top + plotHeight }));
			const label = makeSvg('text', { class: 'heaps-tick', x: tickX, y: height - margin.bottom + 22, 'text-anchor': 'middle' });
			label.textContent = tick;
			svg.append(label);
		}
		for (let tick = 0; tick <= maxVocabulary; tick += Math.max(500, Math.ceil(maxVocabulary / 5 / 500) * 500)) {
			const tickY = y(tick);
			svg.append(makeSvg('line', { class: 'heaps-grid', x1: margin.left, x2: width - margin.right, y1: tickY, y2: tickY }));
			const label = makeSvg('text', { class: 'heaps-tick', x: margin.left - 10, y: tickY + 4, 'text-anchor': 'end' });
			label.textContent = tick.toLocaleString();
			svg.append(label);
		}
		svg.append(makeSvg('line', { class: 'heaps-axis', x1: margin.left, x2: width - margin.right, y1: margin.top + plotHeight, y2: margin.top + plotHeight }));
		svg.append(makeSvg('line', { class: 'heaps-axis', x1: margin.left, x2: margin.left, y1: margin.top, y2: margin.top + plotHeight }));
		const xLabel = makeSvg('text', { class: 'heaps-label', x: margin.left + plotWidth / 2, y: height - 12, 'text-anchor': 'middle' });
		xLabel.textContent = 'Pages added';
		svg.append(xLabel);
		const yLabel = makeSvg('text', { class: 'heaps-label', transform: `translate(17 ${margin.top + plotHeight / 2}) rotate(-90)`, 'text-anchor': 'middle' });
		yLabel.textContent = 'Unique words so far';
		svg.append(yLabel);

		const fit = fitHeaps(sequence);
		const curve = makeSvg('path', { class: 'heaps-law-line', d: sequence.map((_, index) => `${index ? 'L' : 'M'}${x(index + 1)},${y(Math.min(maxVocabulary, fit.k * (index + 1) ** fit.beta))}`).join(' ') });
		svg.append(curve);
		const points = makeSvg('g');
		sequence.slice(0, visiblePages).forEach((point, index) => {
			const circle = makeSvg('circle', { class: 'heaps-point', cx: x(index + 1), cy: y(point.vocabulary), r: index === visiblePages - 1 ? 6 : 4 });
			const pointTitle = makeSvg('title');
			pointTitle.textContent = `${index + 1}. ${point.name}: ${point.vocabulary.toLocaleString()} unique words (${point.inDegree} incoming links)`;
			circle.append(pointTitle);
			points.append(circle);
		});
		svg.append(points);
		byId('heaps-fit').textContent = `Heaps fit: V(n) ≈ ${fit.k.toFixed(0)} × n^${fit.beta.toFixed(2)}`;
		byId('heaps-current').textContent = visiblePages
			? `Page ${visiblePages}: ${sequence[visiblePages - 1].name} added ${tokens(sequence[visiblePages - 1].article).size.toLocaleString()} words; vocabulary now ${sequence[visiblePages - 1].vocabulary.toLocaleString()}.`
			: 'Press Start to add the first page.';
		byId('heaps-page-count').textContent = `${visiblePages} / ${sequence.length} pages`;
		byId('heaps-add').textContent = visiblePages >= sequence.length
			? 'Visualization complete'
			: autoplayTimer ? 'Pause visualization' : visiblePages ? 'Resume visualization' : 'Start visualization';
		byId('heaps-add').disabled = false;
	}

	function stopAutoplay() {
		if (autoplayTimer) window.clearInterval(autoplayTimer);
		autoplayTimer = null;
	}

	function toggleAutoplay() {
		if (autoplayTimer) {
			stopAutoplay();
			renderGraph(sequences[activeOrder]);
			return;
		}
		if (visiblePages >= sequences[activeOrder].length) visiblePages = 0;
		autoplayTimer = window.setInterval(() => {
			visiblePages += 1;
			renderGraph(sequences[activeOrder]);
			if (visiblePages >= sequences[activeOrder].length) stopAutoplay();
		}, 28);
		renderGraph(sequences[activeOrder]);
	}

	function updateOrder() {
		stopAutoplay();
		activeOrder = byId('heaps-order').value;
		visiblePages = 0;
		renderGraph(sequences[activeOrder]);
	}

	async function load() {
		const [nodesResponse, edgesResponse] = await Promise.all([fetch('data/week1_nodes.tsv'), fetch('data/week1_edges.tsv')]);
		if (!nodesResponse.ok || !edgesResponse.ok) throw new Error('Could not load the Marvel snapshots.');
		const rawNodes = parseTable(await nodesResponse.text());
		const incoming = new Map();
		parseEdges(await edgesResponse.text()).forEach(([, target]) => incoming.set(target, (incoming.get(target) || 0) + 1));
		const nodes = await Promise.all(rawNodes.map(async (node) => ({
			id: node.node_id,
			name: node.name || node.node_id,
			inDegree: incoming.get(node.node_id) || 0,
			article: await fetchArticle(node.node_id),
		})));
		sequences = { famous: buildSequence(nodes, 'famous'), minor: buildSequence(nodes, 'minor') };
		byId('heaps-loading').hidden = true;
		byId('heaps-output').hidden = false;
		updateOrder();
	}

	byId('heaps-order').addEventListener('change', updateOrder);
	byId('heaps-add').addEventListener('click', toggleAutoplay);
	byId('heaps-reset').addEventListener('click', () => {
		stopAutoplay();
		visiblePages = 0;
		renderGraph(sequences[activeOrder]);
	});
	load().catch((error) => {
		byId('heaps-loading').textContent = `${error.message} Serve the project over HTTP and try again.`;
		console.error(error);
	});
})();