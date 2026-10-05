(() => {
	const svgNamespace = 'http://www.w3.org/2000/svg';
	const byId = (id) => document.getElementById(id);
	const articleDirectory = 'data/marvel_pages/';
	const relationshipRules = [
		{ label: 'killed', patterns: [/\bkilled\b/i, /\bmurdered\b/i, /\bslain\b/i] },
		{ label: 'married', patterns: [/\bmarried\b/i, /\bhusband\b/i, /\bwife\b/i, /\bspouse\b/i] },
		{ label: 'enemy', patterns: [/\benemies?\b/i, /\bnemesis\b/i, /\bfoe\b/i, /\bopponent\b/i] },
		{ label: 'ally', patterns: [/\ballies?\b/i, /\ballied\b/i, /\bally\b/i] },
		{ label: 'teammate', patterns: [/\bteammates?\b/i, /\bteam-mate\b/i, /\bmember of\b/i] },
	];
	const relationshipLabels = ['all', ...relationshipRules.map((rule) => rule.label), 'unclassified', 'not found'];
	let concordance = [];

	function parseTable(text) {
		const lines = text.split(/\r?\n/).filter((line) => line && !line.startsWith('#'));
		const headers = lines.shift().split('\t');
		return lines.map((line) => {
			const values = line.split('\t');
			return Object.fromEntries(headers.map((header, index) => [header, values[index] || '']));
		});
	}

	function parseEdges(text) {
		return text
			.split(/\r?\n/)
			.filter((line) => line.trim() && !line.startsWith('#'))
			.map((line) => {
				const [source, target] = line.split('\t');
				return { source, target };
			});
	}

	function makeSvg(tag, attributes = {}) {
		const element = document.createElementNS(svgNamespace, tag);
		Object.entries(attributes).forEach(([name, value]) => element.setAttribute(name, value));
		return element;
	}

	function normalise(value) {
		return String(value).replaceAll('_', ' ').replace(/[’']/g, "'").toLowerCase().trim();
	}

	function aliasesFor(node) {
		return [
			node.node_id,
			node.name,
			node.node_id.replace(/_\([^)]*\)$/, ''),
			node.name.replace(/\s*\([^)]*\)$/, ''),
		]
			.map(normalise)
			.filter((alias, index, aliases) => alias.length > 2 && aliases.indexOf(alias) === index);
	}

	function splitSentences(text) {
		return text
			.replace(/\r/g, '')
			.split(/(?<=[.!?])\s+(?=[A-ZÀ-ÖØ-Þ"'])/)
			.map((sentence) => sentence.trim())
			.filter(Boolean);
	}

	function sentenceForTarget(article, target) {
		const aliases = aliasesFor(target);
		return splitSentences(article).find((sentence) => {
			const candidate = normalise(sentence);
			return aliases.some((alias) => candidate.includes(alias));
		}) || '';
	}

	function classify(sentence) {
		const rule = relationshipRules.find((candidate) => candidate.patterns.some((pattern) => pattern.test(sentence)));
		return rule ? rule.label : sentence ? 'unclassified' : 'not found';
	}

	async function fetchArticle(nodeId) {
		const encodedId = encodeURIComponent(nodeId);
		const articleUrls = [
			`${articleDirectory}${encodedId}.txt`,
			`${articleDirectory}${encodeURIComponent(encodedId)}.txt`,
		];
		for (const url of articleUrls) {
			const response = await fetch(url);
			if (response.ok) return response.text();
		}
		return '';
	}

	function escapeHtml(value) {
		return String(value)
			.replaceAll('&', '&amp;')
			.replaceAll('<', '&lt;')
			.replaceAll('>', '&gt;')
			.replaceAll('"', '&quot;')
			.replaceAll("'", '&#039;');
	}

	function renderCounts() {
		const counts = concordance.reduce((result, edge) => {
			result[edge.label] = (result[edge.label] || 0) + 1;
			return result;
		}, {});
		byId('relationship-counts').innerHTML = relationshipLabels
			.filter((label) => label !== 'all')
			.map((label) => `<button type="button" class="relationship-count relationship-${label}" data-relationship-filter="${label}"><strong>${counts[label] || 0}</strong><span>${label}</span></button>`)
			.join('');
		byId('relationship-counts').querySelectorAll('[data-relationship-filter]').forEach((button) => {
			button.addEventListener('click', () => {
				byId('relationship-filter').value = button.dataset.relationshipFilter;
				byId('relationship-target').value = 'all';
				renderTable();
			});
		});
	}

	function renderTable() {
		const filter = byId('relationship-filter').value;
		const target = byId('relationship-target').value;
		const rows = concordance.filter((edge) => {
			const matchesFilter = filter === 'all' || edge.label === filter;
			const matchesTarget = target === 'all' || edge.targetName === target;
			return matchesFilter && matchesTarget;
		});
		byId('relationship-row-count').textContent = `${rows.length.toLocaleString()} of ${concordance.length.toLocaleString()} edges shown`;
		byId('relationship-table-body').innerHTML = rows.slice(0, 250).map((edge) => `
			<tr>
				<td>${escapeHtml(edge.sourceName)}</td>
				<td>${escapeHtml(edge.targetName)}</td>
				<td><span class="relationship-label relationship-${edge.label}">${escapeHtml(edge.label)}</span></td>
				<td>${escapeHtml(edge.sentence || 'No matching target sentence found in the source article.')}</td>
			</tr>
		`).join('');
		renderGraph(filter, target);
	}

	function renderGraph(filter, target) {
		const svg = byId('relationship-network');
		const selected = concordance.filter((edge) => (filter === 'all' || edge.label === filter) && (target === 'all' || edge.targetName === target));
		const typed = selected.filter((edge) => !['unclassified', 'not found'].includes(edge.label));
		const graphEdges = (filter === 'all' ? (typed.length ? typed : selected) : selected).filter((edge) => edge.sentence);
		const degree = new Map();
		graphEdges.forEach((edge) => {
			degree.set(edge.sourceName, (degree.get(edge.sourceName) || 0) + 1);
			degree.set(edge.targetName, (degree.get(edge.targetName) || 0) + 1);
		});
		const visibleNames = new Set([...degree.entries()].sort((a, b) => b[1] - a[1]).slice(0, 28).map(([name]) => name));
		const visibleEdges = graphEdges.filter((edge) => visibleNames.has(edge.sourceName) && visibleNames.has(edge.targetName)).slice(0, 80);
		const names = [...visibleNames].sort();
		const width = 920;
		const height = 520;
		const centerX = width / 2;
		const centerY = height / 2;
		const radius = Math.min(185, 90 + names.length * 3.5);
		const positions = new Map(names.map((name, index) => [name, {
			x: centerX + Math.cos(index / Math.max(names.length, 1) * Math.PI * 2 - Math.PI / 2) * radius,
			y: centerY + Math.sin(index / Math.max(names.length, 1) * Math.PI * 2 - Math.PI / 2) * radius,
		}]));
		svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
		svg.replaceChildren();
		const definitions = makeSvg('defs');
		const marker = makeSvg('marker', { id: 'relationship-arrow-killed', markerWidth: '8', markerHeight: '8', refX: '7', refY: '4', orient: 'auto', markerUnits: 'strokeWidth' });
		const arrow = makeSvg('path', { d: 'M0,0 L8,4 L0,8 Z', class: 'relationship-arrow-killed' });
		marker.append(arrow);
		definitions.append(marker);
		svg.append(definitions);
		const title = makeSvg('title');
		title.textContent = 'Typed Marvel relationship network';
		svg.append(title);
		const description = makeSvg('desc');
		description.textContent = 'A filtered network of characters connected by sentences containing relationship keywords.';
		svg.append(description);
		const edgeLayer = makeSvg('g');
		visibleEdges.forEach((edge) => {
			const source = positions.get(edge.sourceName);
			const target = positions.get(edge.targetName);
				const lineAttributes = { class: `relationship-graph-edge relationship-${edge.label}`, x1: source.x, y1: source.y, x2: target.x, y2: target.y };
				if (edge.label === 'killed') lineAttributes['marker-end'] = 'url(#relationship-arrow-killed)';
				const line = makeSvg('line', lineAttributes);
			const edgeTitle = makeSvg('title');
			edgeTitle.textContent = `${edge.sourceName} → ${edge.targetName}: ${edge.label}`;
			line.append(edgeTitle);
			edgeLayer.append(line);
		});
		svg.append(edgeLayer);
		const nodeLayer = makeSvg('g');
		names.forEach((name) => {
			const position = positions.get(name);
			const node = makeSvg('circle', { class: 'relationship-graph-node', cx: position.x, cy: position.y, r: Math.min(10, 4 + (degree.get(name) || 0) * .8) });
			const nodeTitle = makeSvg('title');
			nodeTitle.textContent = `${name}: ${degree.get(name)} visible relationships`;
			node.append(nodeTitle);
			nodeLayer.append(node);
			if ((degree.get(name) || 0) > 1) {
				const label = makeSvg('text', { class: 'relationship-graph-label', x: position.x + 12, y: position.y + 4 });
				label.textContent = name;
				nodeLayer.append(label);
			}
		});
		svg.append(nodeLayer);
		byId('relationship-graph-note').textContent = visibleEdges.length
			? `Showing ${visibleEdges.length} of ${graphEdges.length} matching edges and ${names.length} characters. Nodes are limited to the most connected characters for readability.`
			: 'No matching relationship sentences are available for this filter.';
	}

	function renderFinding() {
		const enemyEdges = concordance.filter((edge) => edge.label === 'enemy');
		const inspected = concordance.filter((edge) => edge.label !== 'not found');
		byId('relationship-finding').textContent = enemyEdges.length
			? `${enemyEdges.length} edges are labelled enemy by the keyword rules. Each arrow points from the source page to the character mentioned on that page.`
			: `No edges were labelled enemy by the current keyword rules. This is a result of the chosen vocabulary, not evidence that the Marvel pages contain no antagonistic relationships.`;
		byId('relationship-method-note').textContent = `${inspected.length.toLocaleString()} of ${concordance.length.toLocaleString()} edges produced a sentence containing the target character. Labels use the first matching rule in the order killed, married, enemy, ally, teammate.`;
	}

	async function load() {
		const [nodesResponse, edgesResponse] = await Promise.all([
			fetch('data/week1_nodes.tsv'),
			fetch('data/week1_edges.tsv'),
		]);
		if (!nodesResponse.ok || !edgesResponse.ok) throw new Error('Could not load the frozen Marvel network.');
		const nodes = parseTable(await nodesResponse.text());
		const nodesById = new Map(nodes.map((node) => [node.node_id, node]));
		const edges = parseEdges(await edgesResponse.text());
		const articles = new Map(await Promise.all(nodes.map(async (node) => {
			try {
				return [node.node_id, await fetchArticle(node.node_id)];
			} catch {
				return [node.node_id, ''];
			}
		})));

		concordance = edges.map((edge) => {
			const source = nodesById.get(edge.source);
			const target = nodesById.get(edge.target);
			const sentence = source && target ? sentenceForTarget(articles.get(source.node_id) || '', target) : '';
			return {
				sourceName: source?.name || edge.source,
				targetName: target?.name || edge.target,
				sentence,
				label: classify(sentence),
			};
		});
				byId('relationship-target').innerHTML = ['<option value="all">All mentioned characters</option>', ...[...new Set(concordance.map((edge) => edge.targetName))].sort((a, b) => a.localeCompare(b)).map((name) => `<option value="${name}">${name}</option>`)].join('');
		renderCounts();
		renderFinding();
		renderTable();
		byId('relationship-loading').hidden = true;
		byId('relationship-output').hidden = false;
	}

	byId('relationship-filter').innerHTML = relationshipLabels.map((label) => `<option value="${label}">${label}</option>`).join('');
	byId('relationship-filter').addEventListener('change', renderTable);
	byId('relationship-target').addEventListener('change', renderTable);
	load().catch((error) => {
		byId('relationship-loading').textContent = `${error.message} Serve the project over HTTP and try again.`;
		console.error(error);
	});
})();