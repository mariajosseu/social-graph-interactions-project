const svgNamespace = 'http://www.w3.org/2000/svg';
const byId = (id) => document.getElementById(id);
const makeSvg = (tag, attributes = {}) => {
	const element = document.createElementNS(svgNamespace, tag);
	Object.entries(attributes).forEach(([name, value]) => element.setAttribute(name, value));
	return element;
};

function parseTable(text, commentPrefix = '#') {
	const lines = text.split(/\r?\n/).filter((line) => line && !line.startsWith(commentPrefix));
	const headers = lines.shift().split('\t');
	return lines.map((line) => Object.fromEntries(line.split('\t').map((value, index) => [headers[index], value])));
}

function correlation(nodes) {
	const meanX = nodes.reduce((sum, node) => sum + node.inDegree, 0) / nodes.length;
	const meanY = nodes.reduce((sum, node) => sum + node.wordCount, 0) / nodes.length;
	const numerator = nodes.reduce((sum, node) => sum + (node.inDegree - meanX) * (node.wordCount - meanY), 0);
	const denominatorX = nodes.reduce((sum, node) => sum + (node.inDegree - meanX) ** 2, 0);
	const denominatorY = nodes.reduce((sum, node) => sum + (node.wordCount - meanY) ** 2, 0);
	return { value: numerator / Math.sqrt(denominatorX * denominatorY), meanX, meanY };
}

function renderScatter(nodes, selectedId) {
	const svg = byId('description-scatter');
	const width = 920;
	const height = 500;
	const margin = { top: 28, right: 28, bottom: 66, left: 70 };
	const plotWidth = width - margin.left - margin.right;
	const plotHeight = height - margin.top - margin.bottom;
	const maxDegree = Math.ceil(Math.max(...nodes.map((node) => node.inDegree)) / 10) * 10;
	const maxWords = Math.ceil(Math.max(...nodes.map((node) => node.wordCount)) / 10) * 10;
	const x = (value) => margin.left + value / maxDegree * plotWidth;
	const y = (value) => margin.top + plotHeight - value / maxWords * plotHeight;
	svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
	svg.replaceChildren();
	svg.append(makeSvg('title', { id: 'scatter-title' }));
	svg.lastElementChild.textContent = 'Incoming links versus description word count';
	svg.append(makeSvg('desc', { id: 'scatter-description' }));
	svg.lastElementChild.textContent = 'Each dot is a Marvel character. Select a point to inspect its local description.';

	for (let tick = 0; tick <= maxDegree; tick += 25) {
		const tickX = x(tick);
		svg.append(makeSvg('line', { class: 'scatter-grid', x1: tickX, x2: tickX, y1: margin.top, y2: margin.top + plotHeight }));
		const label = makeSvg('text', { class: 'scatter-tick', x: tickX, y: height - margin.bottom + 23, 'text-anchor': 'middle' });
		label.textContent = tick;
		svg.append(label);
	}
	for (let tick = 0; tick <= maxWords; tick += 10) {
		const tickY = y(tick);
		svg.append(makeSvg('line', { class: 'scatter-grid', x1: margin.left, x2: width - margin.right, y1: tickY, y2: tickY }));
		const label = makeSvg('text', { class: 'scatter-tick', x: margin.left - 12, y: tickY + 4, 'text-anchor': 'end' });
		label.textContent = tick;
		svg.append(label);
	}
	svg.append(makeSvg('line', { class: 'scatter-axis', x1: margin.left, x2: width - margin.right, y1: margin.top + plotHeight, y2: margin.top + plotHeight }));
	svg.append(makeSvg('line', { class: 'scatter-axis', x1: margin.left, x2: margin.left, y1: margin.top, y2: margin.top + plotHeight }));
	const xLabel = makeSvg('text', { class: 'scatter-label', x: margin.left + plotWidth / 2, y: height - 13, 'text-anchor': 'middle' });
	xLabel.textContent = 'Incoming links in the frozen network';
	svg.append(xLabel);
	const yLabel = makeSvg('text', { class: 'scatter-label', transform: `translate(17 ${margin.top + plotHeight / 2}) rotate(-90)`, 'text-anchor': 'middle' });
	yLabel.textContent = 'Words in local description';
	svg.append(yLabel);

	const stats = correlation(nodes);
	const slope = nodes.reduce((sum, node) => sum + (node.inDegree - stats.meanX) * (node.wordCount - stats.meanY), 0) / nodes.reduce((sum, node) => sum + (node.inDegree - stats.meanX) ** 2, 0);
	const intercept = stats.meanY - slope * stats.meanX;
	svg.append(makeSvg('line', { class: 'scatter-trend', x1: x(0), y1: y(Math.max(0, intercept)), x2: x(maxDegree), y2: y(Math.max(0, Math.min(maxWords, intercept + slope * maxDegree))) }));

	const pointLayer = makeSvg('g');
	nodes.forEach((node) => {
		const point = makeSvg('circle', { class: `scatter-point${node.id === selectedId ? ' is-selected' : ''}`, cx: x(node.inDegree), cy: y(node.wordCount), r: node.id === selectedId ? 6 : 4, tabindex: '0', role: 'button', 'aria-label': `${node.name}: ${node.inDegree} incoming links, ${node.wordCount} description words` });
		point.dataset.nodeId = node.id;
		point.addEventListener('click', () => selectNode(node.id, nodes));
		point.addEventListener('keydown', (event) => {
			if (event.key === 'Enter' || event.key === ' ') {
				event.preventDefault();
				selectNode(node.id, nodes);
			}
		});
		const title = makeSvg('title');
		title.textContent = `${node.name}: ${node.inDegree} incoming links, ${node.wordCount} words`;
		point.append(title);
		pointLayer.append(point);
	});
	svg.append(pointLayer);
	[
		{ name: 'Spider-Man', label: 'Spider-Man' },
		{ name: 'Super Rabbit', label: 'Super Rabbit' },
	].forEach(({ name, label }) => {
		const node = nodes.find((candidate) => candidate.name === name);
		if (!node) return;
		const annotation = makeSvg('text', { class: 'scatter-highlight', x: x(node.inDegree) + (node.inDegree > maxDegree * .72 ? -8 : 8), y: y(node.wordCount) - 9, 'text-anchor': node.inDegree > maxDegree * .72 ? 'end' : 'start' });
		annotation.textContent = label;
		svg.append(annotation);
	});
}

function selectNode(nodeId, nodes) {
	const node = nodes.find((item) => item.id === nodeId);
	if (!node) return;
	byId('character-select').value = node.id;
	byId('selected-name').textContent = node.name;
	byId('selected-description').textContent = `“${node.description}”`;
	byId('selected-indegree').textContent = node.inDegree.toLocaleString();
	byId('selected-wordcount').textContent = node.wordCount.toLocaleString();
	renderScatter(nodes, node.id);
}

async function init() {
	const [nodeResponse, edgeResponse] = await Promise.all([fetch('data/week1_nodes.tsv'), fetch('data/week1_edges.tsv')]);
	if (!nodeResponse.ok || !edgeResponse.ok) throw new Error('Could not fetch the frozen Marvel snapshots.');
	const rawNodes = parseTable(await nodeResponse.text());
	const edges = (await edgeResponse.text()).split(/\r?\n/).filter((line) => line && !line.startsWith('#')).map((line) => line.split('\t'));
	const incoming = new Map();
	edges.forEach(([, target]) => incoming.set(target, (incoming.get(target) || 0) + 1));
	const nodes = rawNodes.map((node) => ({
		id: node.node_id,
		name: node.name || node.node_id.replaceAll('_', ' '),
		description: node.description || 'No local description is available.',
		inDegree: incoming.get(node.node_id) || 0,
		wordCount: (node.description || '').trim().split(/\s+/).filter(Boolean).length,
	}));
	const stats = correlation(nodes);
	byId('finding-line').textContent = `Across ${nodes.length} characters, description word count has almost no linear association with incoming links (Pearson r = ${stats.value.toFixed(3)}).`;
	const select = byId('character-select');
	[...nodes].sort((a, b) => a.name.localeCompare(b.name)).forEach((node) => {
		const option = document.createElement('option');
		option.value = node.id;
		option.textContent = node.name;
		select.append(option);
	});
	select.addEventListener('change', () => selectNode(select.value, nodes));
	byId('chart-loading').hidden = true;
	renderScatter(nodes, 'Spider-Man');
	selectNode(nodes.find((node) => node.name === 'Spider-Man')?.id || nodes[0].id, nodes);
}

init().catch((error) => {
	byId('chart-loading').textContent = 'Could not load the frozen snapshots. Serve the project over HTTP and try again.';
	byId('finding-line').textContent = error.message;
	console.error(error);
});