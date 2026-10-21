/* Frozen sentence measurements and clustering runs; no models run in the browser. */
(() => {
    const $ = id => document.getElementById(id);
    const make = (tag, text, cls) => {
        const node = document.createElement(tag);
        if (text !== undefined) node.textContent = text;
        if (cls) node.className = cls;
        return node;
    };
    const svgNode = (tag, attrs = {}) => {
        const node = document.createElementNS('http://www.w3.org/2000/svg', tag);
        Object.entries(attrs).forEach(([k, v]) => node.setAttribute(k, String(v)));
        return node;
    };
    const fmt = value => value === null ? 'undefined (flat curve)' : value.toFixed(2);
    const line = (values, width, height, low, high) => values.map((v, i) => `${i ? 'L' : 'M'}${(36 + i / (values.length - 1) * (width - 52)).toFixed(2)},${(16 + (high - v) / (high - low) * (height - 44)).toFixed(2)}`).join(' ');
    function chart(series, { label, width = 500, height = 160, low = -3, high = 3, axes = false, cursor = null } = {}) {
        const svg = svgNode('svg', { viewBox: `0 0 ${width} ${height}`, role: 'img', 'aria-label': label });
        for (const y of [low, (low + high) / 2, high]) {
            const py = 16 + (high - y) / (high - low) * (height - 44);
            svg.append(svgNode('line', { x1: 36, x2: width - 16, y1: py, y2: py, class: 'arcs-gridline' }));
            if (axes) {
                const text = svgNode('text', { x: 30, y: py + 3, 'text-anchor': 'end' });
                text.textContent = y.toFixed(2); svg.append(text);
            }
        }
        for (const { values, cls } of series) svg.append(svgNode('path', { d: line(values, width, height, low, high), class: cls, fill: 'none' }));
        for (const [x, text] of [[36, 'Beginning'], [width - 16, 'End']]) {
            const label = svgNode('text', { x, y: height - 5, 'text-anchor': x === 36 ? 'start' : 'end' });
            label.textContent = text; svg.append(label);
        }
        if (cursor !== null) {
            const x = 36 + cursor / 99 * (width - 52);
            svg.append(svgNode('line', { x1: x, x2: x, y1: 12, y2: height - 28, class: 'arcs-cursor' }));
        }
        return svg;
    }

    async function init() {
        const response = await fetch('data/week7_arcs.json');
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        const stories = data.stories;
        let selected = 0;
        let activeCluster = null;
        const pct = () => $('arcs-smoothing').value;
        const bestK = p => Object.entries(data.clustering[p].runs).sort((a, b) => b[1].silhouette - a[1].silhouette)[0][0];
        for (let k = 2; k <= 8; k++) {
            const option = make('option', `${k} groups${k === 6 ? ' / test the six-shape idea' : ''}`);
            option.value = String(k); $('arcs-k').append(option);
        }
        $('arcs-k').value = bestK('5');
        const baseline = data.clustering['5'].runs[bestK('5')];
        const median = values => { const a = values.filter(v => v !== null).sort((a, b) => a - b); return a.length ? (a[Math.floor((a.length - 1) / 2)] + a[Math.ceil((a.length - 1) / 2)]) / 2 : null; };
        const medianR = median(stories.map(s => s.arcs['5'].r));
        for (const [value, label] of [[stories.length, 'Completed stories'], [bestK('5'), 'Preferred group count / 5% smoothing'], [fmt(medianR), 'Median anger–negativity correlation / 5%']]) {
            const card = make('div', undefined, 'w7-signal');
            card.append(make('strong', String(value)), make('span', label)); $('arcs-summary').append(card);
        }
        function populateStories() {
            let indices = stories.map((_, i) => i);
            const sort = $('arcs-sort').value;
            if (sort !== 'title') indices.sort((a, b) => {
                const av = stories[a].arcs[pct()].r ?? 0;
                const bv = stories[b].arcs[pct()].r ?? 0;
                return sort === 'agreement' ? bv - av : av - bv;
            });
            else indices.sort((a, b) => stories[a].title.localeCompare(stories[b].title));
            $('arcs-story').replaceChildren(...indices.map(i => {
                const option = make('option', `${stories[i].title} — ${stories[i].author}`);
                option.value = String(i); return option;
            }));
            $('arcs-story').value = String(selected);
        }
        function renderClusters() {
            const config = data.clustering[pct()];
            const run = config.runs[$('arcs-k').value];
            $('arcs-clusters').replaceChildren(...run.clusters.map(group => {
                const button = make('button', undefined, 'arcs-cluster');
                button.type = 'button';
                button.setAttribute('aria-pressed', String(activeCluster === group.id));
                button.append(make('span', `Group ${group.id + 1} · ${group.members.length} stories`, 'eyebrow'));
                const series = group.members.map(i => ({ values: config.curves[i], cls: 'arcs-member' }));
                series.push({ values: group.center, cls: 'arcs-mean' });
                const extent = Math.max(3, ...series.flatMap(s => s.values.map(Math.abs)));
                button.append(chart(series, { label: `Group ${group.id + 1}, ${group.members.length} story arcs`, low: -extent, high: extent }));
                button.append(make('strong', `Closest sketch: ${group.resemblance}`), make('small', `Similarity to sketch: r = ${group.template_r.toFixed(2)}`));
                button.addEventListener('click', () => {
                    activeCluster = group.id; selected = group.members[0];
                    $('arcs-story').value = String(selected); renderClusters(); renderStory();
                });
                return button;
            }));
            $('arcs-cluster-note').textContent = `At ${pct()}% smoothing and ${$('arcs-k').value} groups: silhouette ${run.silhouette.toFixed(2)} (higher means better separation); seed stability ${run.seed_stability.toFixed(2)}; agreement with the 5% grouping ${run.smoothing_stability.toFixed(2)}. The two agreement scores use adjusted Rand index: 1 means identical assignments, 0 is the chance baseline. ${activeCluster === null ? '' : 'The selected group contains: ' + run.clusters[activeCluster].members.map(i => stories[i].title).join(' · ')}`;
        }
        function renderStory() {
            const story = stories[selected];
            const arc = story.arcs[pct()];
            const position = Number($('arcs-position').value);
            const link = make('a', 'Read the original ↗'); link.href = story.url;
            $('arcs-story-meta').replaceChildren(make('strong', story.title), document.createTextNode(` by ${story.author} · ${story.published} · ${story.words.toLocaleString()} words · ${story.sentence_count.toLocaleString()} sentences · `), link);
            $('arcs-tracks').replaceChildren(...[
                ['Classifier negativity', arc.negative, 'arcs-negative', 1],
                ['DeepMoji anger proxy / 😡 + 😠', arc.anger, 'arcs-anger', Math.max(.05, Math.ceil(Math.max(...arc.anger) * 20) / 20)],
            ].map(([label, values, cls, high]) => {
                const figure = make('figure', undefined, 'arcs-track');
                figure.append(make('figcaption', label));
                const svg = chart([{ values, cls }], { label: `${label} along ${story.title}`, height: 190, low: 0, high, axes: true, cursor: position });
                svg.addEventListener('click', event => {
                    const rect = svg.getBoundingClientRect();
                    $('arcs-position').value = String(Math.round(Math.max(0, Math.min(99, ((event.clientX - rect.left) / rect.width * 500 - 36) / 448 * 99))));
                    renderStory();
                });
                figure.append(svg); return figure;
            }));
            $('arcs-progress').textContent = `${Math.round(position / 99 * 100)}%`;
            $('arcs-readout').textContent = `At this position: negativity ${arc.negative[position].toFixed(3)} · anger proxy ${arc.anger[position].toFixed(3)}`;
            $('arcs-correlation').textContent = `Curve correlation at ${pct()}% smoothing: r = ${fmt(arc.r)}. Separate y-axis ranges make the patterns readable; the two scores do not measure the same quantity. A low correlation alone does not establish why the instruments disagree.`;
            $('arcs-excerpts').replaceChildren(...story.excerpts.map(excerpt => {
                const article = make('article', undefined, 'arcs-excerpt');
                const button = make('button', `${excerpt.label} / ${Math.round(excerpt.position)}%`);
                button.type = 'button';
                button.addEventListener('click', () => { $('arcs-position').value = String(Math.round(excerpt.position / 100 * 99)); renderStory(); });
                article.append(button, make('blockquote', excerpt.text), make('p', `Sentence ${excerpt.index + 1}: negativity ${excerpt.negative.toFixed(3)} · anger proxy ${excerpt.anger.toFixed(3)}`, 'doom-number'));
                return article;
            }));
        }
        const winners = Object.keys(data.clustering).map(p => `${bestK(p)} groups at ${p}%`).join(', ');
        $('arcs-findings').textContent = `The best grouping changes with the smoothing window: ${winners}. That means six shapes are not a stable result in this sample.`;
        if (baseline.silhouette < .2) $('arcs-findings').textContent += ' The groups also overlap considerably, so their boundaries are uncertain.';
        const lowStory = [...stories].filter(s => s.arcs['5'].r !== null).sort((a, b) => a.arcs['5'].r - b.arcs['5'].r)[0];
        const highStory = [...stories].filter(s => s.arcs['5'].r !== null).sort((a, b) => b.arcs['5'].r - a.arcs['5'].r)[0];
        $('arcs-emotion-findings').textContent = `Anger and negativity sometimes rise together, but often follow different paths. At 5% smoothing, their typical correlation is ${fmt(medianR)} (1 would mean perfectly matched rises and falls). Compare “${highStory.title}”, where they move together most closely, with “${lowStory.title}”, where they diverge most. Read the excerpts to judge whether the difference makes sense.`;
        $('arcs-corpus-note').textContent = `We selected ${stories.length} English Avengers stories, each marked complete in the archive, with one chapter and 2,000–8,000 words. We kept one work per author and removed headers and opening/closing author notes. This historical sample covers only a small part of Marvel fan fiction.`;
        const truncation = stories.reduce((a, s) => ({ classifier: a.classifier + s.truncation.classifier, deepmoji: a.deepmoji + s.truncation.deepmoji }), { classifier: 0, deepmoji: 0 });
        $('arcs-truncation').textContent = `Some long sentences are only partly read: ${truncation.classifier} exceed DistilBERT’s input limit and ${truncation.deepmoji} exceed DeepMoji’s.`;
        for (const check of data.checks) {
            const row = make('tr');
            row.append(make('th', `${check.text} / intended: ${check.expected}`), make('td', check.negative.toFixed(3)), make('td', check.anger.toFixed(3)));
            $('arcs-checks').append(row);
        }
        $('arcs-smoothing').addEventListener('change', () => { activeCluster = null; populateStories(); renderClusters(); renderStory(); });
        $('arcs-k').addEventListener('change', () => { activeCluster = null; renderClusters(); });
        $('arcs-sort').addEventListener('change', populateStories);
        $('arcs-story').addEventListener('change', () => { selected = Number($('arcs-story').value); activeCluster = null; renderClusters(); renderStory(); });
        $('arcs-position').addEventListener('input', renderStory);
        populateStories(); renderClusters(); renderStory();
        $('arcs-app').hidden = false;
        $('arcs-status').hidden = true;
    }
    init().catch(error => {
        $('arcs-status').textContent = 'The story-arc results could not load. Reload the page through the local HTTP server.';
        console.error('Week 7 arcs:', error);
    });
})();
