(() => {
    const $ = (selector) => document.querySelector(selector);
    const state = { data: null, points: [], selectedPair: null, selectedPage: 0, adjacency: new Map() };

    const page = (index) => state.data.pages[index];
    const pairKey = (a, b) => `${Math.min(a, b)}-${Math.max(a, b)}`;
    const distanceLabel = (pair) => pair.disconnected ? 'no path' : `${pair.distance} hop${pair.distance === 1 ? '' : 's'}`;
    const categoryLabel = (category) => ({
        'high-disconnected': 'high similarity / disconnected',
        'high-distant': 'high similarity / 4+ hops',
        'high_close': 'high similarity / 1 hop',
        'low_close': 'low similarity / 1 hop',
    }[category] || category);

    function pairFor(a, b) {
        const key = pairKey(a, b);
        return state.data.pairs.find((pair) => pairKey(pair.a, pair.b) === key);
    }

    function buildAdjacency() {
        state.data.pages.forEach((_, index) => state.adjacency.set(index, []));
        state.data.undirected_edges.forEach(([a, b]) => {
            const ai = state.data.pages.findIndex((pageData) => pageData.id === a);
            const bi = state.data.pages.findIndex((pageData) => pageData.id === b);
            if (ai >= 0 && bi >= 0) state.adjacency.get(ai).push(bi), state.adjacency.get(bi).push(ai);
        });
    }

    function findPath(source, target) {
        if (source === target) return [source];
        const queue = [source], previous = new Map([[source, null]]);
        while (queue.length) {
            const current = queue.shift();
            for (const neighbor of state.adjacency.get(current) || []) {
                if (previous.has(neighbor)) continue;
                previous.set(neighbor, current);
                if (neighbor === target) {
                    const path = [target];
                    let cursor = target;
                    while (previous.get(cursor) !== null) {
                        cursor = previous.get(cursor);
                        path.push(cursor);
                    }
                    return path.reverse();
                }
                queue.push(neighbor);
            }
        }
        return null;
    }

    function drawMap() {
        const canvas = $('#w7-pair-map');
        if (!canvas) return;
        const width = canvas.clientWidth;
        const height = Math.max(390, Math.min(560, width * .56));
        const ratio = window.devicePixelRatio || 1;
        canvas.width = width * ratio;
        canvas.height = height * ratio;
        canvas.style.height = `${height}px`;
        const context = canvas.getContext('2d');
        context.setTransform(ratio, 0, 0, ratio, 0, 0);
        context.clearRect(0, 0, width, height);
        const margin = { left: 58, right: 18, top: 24, bottom: 54 };
        const plotWidth = width - margin.left - margin.right;
        const plotHeight = height - margin.top - margin.bottom;
        const similarities = state.data.pairs.map((pair) => pair.cosine);
        const minSimilarity = Math.floor(Math.min(...similarities) * 10) / 10;
        const maxSimilarity = Math.ceil(Math.max(...similarities) * 10) / 10;
        const finiteDistances = state.data.pairs.filter((pair) => !pair.disconnected).map((pair) => pair.distance);
        const maxDistance = Math.max(...finiteDistances);
        const finiteHeight = plotHeight * .77;
        const disconnectedY = margin.top + finiteHeight + plotHeight * .14;
        const x = (value) => margin.left + (value - minSimilarity) / (maxSimilarity - minSimilarity) * plotWidth;
        const y = (pair) => pair.disconnected
            ? disconnectedY
            : margin.top + (maxDistance - pair.distance) / Math.max(1, maxDistance - 1) * finiteHeight;
        context.font = '10px DM Mono';
        context.fillStyle = '#706f6a';
        context.strokeStyle = 'rgba(23,23,26,.14)';
        context.lineWidth = 1;
        for (let tick = Math.ceil(minSimilarity * 10) / 10; tick <= maxSimilarity + .001; tick += .1) {
            const pointX = x(tick);
            context.beginPath(); context.moveTo(pointX, margin.top); context.lineTo(pointX, height - margin.bottom); context.stroke();
            context.fillText(tick.toFixed(1), pointX - 8, height - 28);
        }
        for (let distance = 1; distance <= maxDistance; distance += 1) {
            const pointY = margin.top + (maxDistance - distance) / Math.max(1, maxDistance - 1) * finiteHeight;
            context.beginPath(); context.moveTo(margin.left, pointY); context.lineTo(width - margin.right, pointY); context.stroke();
            if (distance === 1 || distance === maxDistance || distance % 2 === 0) context.fillText(String(distance), 34, pointY + 3);
        }
        context.fillStyle = '#f1ede5';
        context.fillRect(margin.left, disconnectedY - 15, plotWidth, 30);
        context.strokeStyle = '#ef5a44';
        context.setLineDash([4, 4]);
        context.beginPath(); context.moveTo(margin.left, disconnectedY - 15); context.lineTo(width - margin.right, disconnectedY - 15); context.stroke();
        context.setLineDash([]);
        context.fillStyle = '#706f6a'; context.fillText('no path', 8, disconnectedY + 3);
        context.fillStyle = '#706f6a'; context.fillText('cosine similarity →', width - 135, height - 9);
        context.save(); context.translate(12, margin.top + 100); context.rotate(-Math.PI / 2); context.fillText('network distance →', 0, 0); context.restore();
        state.points = [];
        state.data.pairs.forEach((pair) => {
            const point = { pair, x: x(pair.cosine), y: y(pair) };
            state.points.push(point);
            const highlighted = pair.highlight.length > 0;
            context.beginPath(); context.arc(point.x, point.y, highlighted ? 4.3 : 2.1, 0, Math.PI * 2);
            context.fillStyle = highlighted ? '#ef5a44' : pair.disconnected ? '#9ca5a0' : '#31758b';
            context.globalAlpha = highlighted ? 1 : .42;
            context.fill(); context.globalAlpha = 1;
        });
        if (state.selectedPair) {
            const selected = state.points.find((point) => pairKey(point.pair.a, point.pair.b) === pairKey(state.selectedPair.a, state.selectedPair.b));
            if (selected) {
                context.beginPath(); context.arc(selected.x, selected.y, 8, 0, Math.PI * 2); context.strokeStyle = '#17171a'; context.lineWidth = 2; context.stroke();
            }
        }
    }

    function showTooltip(event) {
        const canvas = $('#w7-pair-map'), tooltip = $('#w7-map-tooltip');
        if (!canvas || !tooltip || !state.points.length) return;
        const rect = canvas.getBoundingClientRect();
        const cursor = { x: event.clientX - rect.left, y: event.clientY - rect.top };
        let closest = null, distance = 11;
        state.points.forEach((point) => {
            const current = Math.hypot(point.x - cursor.x, point.y - cursor.y);
            if (current < distance) closest = point, distance = current;
        });
        if (!closest) { tooltip.hidden = true; return; }
        const a = page(closest.pair.a), b = page(closest.pair.b);
        tooltip.innerHTML = `<strong>${a.name} ↔ ${b.name}</strong><span>cosine ${closest.pair.cosine.toFixed(3)} · ${distanceLabel(closest.pair)}</span>`;
        tooltip.hidden = false;
        tooltip.style.left = `${Math.min(cursor.x + 12, rect.width - 230)}px`;
        tooltip.style.top = `${Math.max(8, cursor.y - 58)}px`;
        canvas.dataset.hoverPair = pairKey(closest.pair.a, closest.pair.b);
    }

    function selectPair(pair) {
        state.selectedPair = pair;
        state.selectedPage = pair.a;
        drawMap();
        renderCharacter(pair.a);
        renderComparison(pair.a, pair.b);
    }

    function renderCandidateList() {
        const target = $('#w7-case-list');
        const groups = ['high_disconnected', 'high_distant', 'low_close'];
        target.replaceChildren();
        groups.forEach((group) => {
            const pair = state.data.candidates[group][0];
            if (!pair) return;
            const button = document.createElement('button');
            button.type = 'button'; button.className = 'w7-case-button';
            button.textContent = `${page(pair.a).name} ↔ ${page(pair.b).name} · ${pair.cosine.toFixed(3)} · ${distanceLabel(pair)}`;
            button.addEventListener('click', () => selectPair(pairFor(pair.a, pair.b)));
            target.append(button);
        });
    }

    function renderCharacter(index) {
        state.selectedPage = index;
        const selected = page(index);
        $('#w7-selected-title').textContent = selected.name;
        $('#w7-selected-excerpt').textContent = selected.excerpt;
        const link = $('#w7-selected-link'); link.href = selected.url;
        const neighbors = state.data.pairs.filter((pair) => pair.a === index || pair.b === index).sort((a, b) => b.cosine - a.cosine).slice(0, 5);
        const target = $('#w7-neighbors'); target.replaceChildren();
        neighbors.forEach((pair) => {
            const other = pair.a === index ? pair.b : pair.a;
            const button = document.createElement('button'); button.type = 'button'; button.className = `w7-neighbor w7-neighbor--${pair.disconnected ? 'disconnected' : pair.distance >= 4 ? 'distant' : 'close'}`;
            button.innerHTML = `<strong>${page(other).name}</strong><span>${pair.cosine.toFixed(3)} · ${distanceLabel(pair)}</span>`;
            button.addEventListener('click', () => renderComparison(index, other));
            target.append(button);
        });
    }

    function renderComparison(source, target) {
        const pair = pairFor(source, target), sourcePage = page(source), targetPage = page(target);
        const path = pair.disconnected ? null : findPath(source, target);
        const comparison = $('#w7-comparison');
        comparison.replaceChildren();
        comparison.append(Object.assign(document.createElement('p'), { className: 'w7-case-label', textContent: 'Comparison' }));
        comparison.append(Object.assign(document.createElement('h3'), { textContent: `${sourcePage.name} ↔ ${targetPage.name}` }));
        comparison.append(Object.assign(document.createElement('p'), { className: 'w7-comparison-stats', textContent: `Cosine similarity ${pair.cosine.toFixed(3)} · ${distanceLabel(pair)} · ${pair.a_reaches_b || pair.b_reaches_a ? 'directed reachability exists' : 'no directed route between the pages'}` }));
        const excerpts = document.createElement('div'); excerpts.className = 'w7-excerpts';
        [[sourcePage, 'Page A'], [targetPage, 'Page B']].forEach(([pageData, label]) => {
            const block = document.createElement('blockquote'); block.innerHTML = `<strong>${label} · ${pageData.name}</strong><p>${pageData.excerpt}</p>`; excerpts.append(block);
        });
        comparison.append(excerpts);
        const pathText = path ? path.map((index) => page(index).name).join(' → ') : 'No undirected path exists; these pages are in different network components.';
        comparison.append(Object.assign(document.createElement('p'), { className: 'w7-path', textContent: `Shortest path: ${pathText}` }));
    }

    function initExplorer() {
        const datalist = $('#w7-character-options'), search = $('#w7-character-search');
        state.data.pages.map((pageData) => pageData.name).sort().forEach((name) => datalist.append(Object.assign(document.createElement('option'), { value: name })));
        search.addEventListener('change', () => {
            const index = state.data.pages.findIndex((pageData) => pageData.name.toLowerCase() === search.value.trim().toLowerCase());
            if (index >= 0) renderCharacter(index);
        });
        search.addEventListener('input', () => {
            const index = state.data.pages.findIndex((pageData) => pageData.name.toLowerCase() === search.value.trim().toLowerCase());
            if (index >= 0) renderCharacter(index);
        });
        renderCharacter(0);
    }

    async function init() {
        const response = await fetch('data/week7_unlikely_neighbors.json');
        if (!response.ok) throw new Error('Week 7 snapshot unavailable');
        state.data = await response.json();
        buildAdjacency();
        $('#w7-page-count').textContent = state.data.audit.page_count;
        $('#w7-edge-count').textContent = state.data.audit.directed_edge_count.toLocaleString();
        $('#w7-case-count').textContent = `${state.data.pairs.length.toLocaleString()} pairs · ${state.data.audit.disconnected_pairs.toLocaleString()} disconnected`;
        renderCandidateList();
        initExplorer();
        const canvas = $('#w7-pair-map');
        canvas.addEventListener('mousemove', showTooltip);
        canvas.addEventListener('mouseleave', () => { $('#w7-map-tooltip').hidden = true; });
        canvas.addEventListener('click', (event) => {
            const key = canvas.dataset.hoverPair;
            const point = state.points.find((candidate) => pairKey(candidate.pair.a, candidate.pair.b) === key);
            if (point) selectPair(point.pair);
        });
        drawMap();
        window.addEventListener('resize', drawMap);
    }

    init().catch((error) => {
        console.error(error);
        $('#w7-case-count').textContent = 'Could not load the pairwise snapshot.';
    });
})();

(() => {
    const $ = (selector) => document.querySelector(selector);
    const palette = ['#31758b', '#d6452f', '#d9b92e', '#6b8f3a', '#8c5aa8', '#e0803a', '#2f2f35', '#b46a8a', '#5e8c61', '#bb6b3e'];
    const state = { data: null, mode: 'embedding', points: [] };

    function colorFor(page) {
        if (state.mode === 'lda') return palette[page.lda.topic % palette.length];
        if (state.mode === 'community') return palette[page.community % palette.length];
        return palette[page.embedding_cluster % palette.length];
    }

    function labelFor(page) {
        if (state.mode === 'lda') return `LDA topic ${page.lda.topic + 1}`;
        if (state.mode === 'community') return `Network community ${page.community + 1}`;
        return `Embedding cluster ${page.embedding_cluster + 1}`;
    }

    function renderStats() {
        const comparison = state.data.comparison;
        $('#w7-grouping-stats').replaceChildren(
            Object.assign(document.createElement('span'), { textContent: `${comparison.page_count} pages · ${comparison.embedding_cluster_count} embedding clusters` }),
            Object.assign(document.createElement('span'), { textContent: `${comparison.lda_topic_count} LDA topics · ${comparison.network_community_count} communities` }),
            Object.assign(document.createElement('span'), { textContent: `LDA ↔ embedding AMI ${comparison.ami_lda_embedding.toFixed(2)}` }),
            Object.assign(document.createElement('span'), { textContent: `LDA ↔ network ${comparison.ami_lda_network.toFixed(2)} · embedding ↔ network ${comparison.ami_embedding_network.toFixed(2)}` }),
        );
    }

    function renderDisagreements() {
        const target = $('#w7-disagreement-list');
        state.data.disagreements.slice(0, 6).forEach((row) => {
            const button = Object.assign(document.createElement('button'), { type: 'button', textContent: `${state.data.pages[row.page].name} · LDA ${row.lda_topic + 1} / cluster ${row.embedding_cluster + 1} / community ${row.community + 1}` });
            button.addEventListener('click', () => renderSelected(row.page));
            target.append(button);
        });
    }

    function renderSelected(index) {
        const page = state.data.pages[index];
        const cluster = state.data.embedding_clusters[page.embedding_cluster];
        const topic = state.data.lda_topics[page.lda.topic];
        const community = state.data.communities[page.community];
        const target = $('#w7-group-selected');
        target.replaceChildren();
        target.append(Object.assign(document.createElement('p'), { className: 'w7-case-label', textContent: 'Selected page' }));
        target.append(Object.assign(document.createElement('h3'), { textContent: page.name }));
        const meta = document.createElement('div'); meta.className = 'w7-group-meta';
        [
            `Embedding cluster ${page.embedding_cluster + 1} · ${cluster.size} pages`,
            `LDA topic ${page.lda.topic + 1} · ${(page.lda.probability * 100).toFixed(0)}% dominant`,
            `Network community ${page.community + 1} · ${community.size} pages`,
        ].forEach((text) => meta.append(Object.assign(document.createElement('span'), { textContent: text })));
        target.append(meta);
        target.append(Object.assign(document.createElement('p'), { textContent: page.excerpt }));
        const details = document.createElement('p'); details.className = 'w7-map-note';
        details.textContent = `Embedding terms: ${cluster.terms.slice(0, 5).join(', ')} · LDA terms: ${topic.terms.slice(0, 5).join(', ')} · Community leaders: ${community.leaders.slice(0, 3).join(', ')}`;
        target.append(details);
        const link = Object.assign(document.createElement('a'), { className: 'text-link', href: page.url, target: '_blank', rel: 'noopener', textContent: 'Open source page ↗' });
        target.append(link);
        const neighborLabel = Object.assign(document.createElement('p'), { className: 'w7-case-label', textContent: 'Nearest embedding neighbors' });
        target.append(neighborLabel);
        const neighbors = document.createElement('div'); neighbors.className = 'w7-group-neighbors';
        page.neighbors.forEach((neighbor) => {
            const button = Object.assign(document.createElement('button'), { type: 'button', textContent: `${state.data.pages[neighbor.index].name} · ${neighbor.cosine.toFixed(3)}` });
            button.addEventListener('click', () => renderSelected(neighbor.index));
            neighbors.append(button);
        });
        target.append(neighbors);
    }

    function drawMap() {
        const canvas = $('#w7-group-map');
        if (!canvas) return;
        const width = canvas.clientWidth;
        const height = Math.max(380, Math.min(520, width * .55));
        const ratio = window.devicePixelRatio || 1;
        canvas.width = width * ratio; canvas.height = height * ratio; canvas.style.height = `${height}px`;
        const context = canvas.getContext('2d'); context.setTransform(ratio, 0, 0, ratio, 0, 0); context.clearRect(0, 0, width, height);
        const margin = { left: 40, right: 18, top: 18, bottom: 34 };
        const xs = state.data.pages.map((page) => page.pca[0]), ys = state.data.pages.map((page) => page.pca[1]);
        const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
        const x = (value) => margin.left + (value - minX) / (maxX - minX) * (width - margin.left - margin.right);
        const y = (value) => height - margin.bottom - (value - minY) / (maxY - minY) * (height - margin.top - margin.bottom);
        context.strokeStyle = 'rgba(23,23,26,.12)'; context.lineWidth = 1;
        for (let step = 1; step < 5; step += 1) {
            const px = margin.left + step / 5 * (width - margin.left - margin.right), py = margin.top + step / 5 * (height - margin.top - margin.bottom);
            context.beginPath(); context.moveTo(px, margin.top); context.lineTo(px, height - margin.bottom); context.stroke();
            context.beginPath(); context.moveTo(margin.left, py); context.lineTo(width - margin.right, py); context.stroke();
        }
        context.fillStyle = '#706f6a'; context.font = '10px DM Mono'; context.fillText('PCA 1 →', width - 62, height - 10); context.fillText('PCA 2', 8, 17);
        state.points = [];
        state.data.pages.forEach((page, index) => {
            const point = { index, x: x(page.pca[0]), y: y(page.pca[1]) }; state.points.push(point);
            context.beginPath(); context.arc(point.x, point.y, 4, 0, Math.PI * 2); context.fillStyle = colorFor(page); context.globalAlpha = .78; context.fill(); context.globalAlpha = 1;
        });
    }

    function tooltip(event) {
        const canvas = $('#w7-group-map'), tip = $('#w7-group-tooltip');
        const rect = canvas.getBoundingClientRect(), cursor = { x: event.clientX - rect.left, y: event.clientY - rect.top };
        let closest = null, distance = 10;
        state.points.forEach((point) => { const current = Math.hypot(point.x - cursor.x, point.y - cursor.y); if (current < distance) closest = point, distance = current; });
        if (!closest) { tip.hidden = true; return; }
        const page = state.data.pages[closest.index]; tip.innerHTML = `<strong>${page.name}</strong><span>${labelFor(page)}</span>`; tip.hidden = false; tip.style.left = `${Math.min(cursor.x + 12, rect.width - 220)}px`; tip.style.top = `${Math.max(8, cursor.y - 48)}px`; canvas.dataset.point = closest.index;
    }

    async function init() {
        const response = await fetch('data/week7_groupings.json');
        if (!response.ok) throw new Error('Grouping snapshot unavailable');
        state.data = await response.json(); renderStats(); renderDisagreements();
        const options = $('#w7-group-options'); state.data.pages.map((page) => page.name).sort().forEach((name) => options.append(Object.assign(document.createElement('option'), { value: name })));
        const search = $('#w7-group-search'); search.addEventListener('input', () => { const index = state.data.pages.findIndex((page) => page.name.toLowerCase() === search.value.trim().toLowerCase()); if (index >= 0) renderSelected(index); });
        document.querySelectorAll('.w7-group-mode').forEach((button) => button.addEventListener('click', () => { document.querySelectorAll('.w7-group-mode').forEach((item) => item.classList.remove('is-active')); button.classList.add('is-active'); state.mode = button.dataset.groupMode; drawMap(); }));
        const canvas = $('#w7-group-map'); canvas.addEventListener('mousemove', tooltip); canvas.addEventListener('mouseleave', () => { $('#w7-group-tooltip').hidden = true; }); canvas.addEventListener('click', () => { const index = Number(canvas.dataset.point); if (Number.isInteger(index)) renderSelected(index); });
        drawMap(); renderSelected(0); window.addEventListener('resize', drawMap);
    }

    init().catch((error) => { console.error(error); $('#w7-grouping-stats').textContent = 'Could not load the grouping snapshot.'; });
})();