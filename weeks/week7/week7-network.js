/* Q5: text-built network versus hyperlink network. Reads the frozen snapshot only. */
(() => {
    const $ = id => document.getElementById(id);
    const el = (tag, text, className) => {
        const node = document.createElement(tag);
        if (text !== undefined) node.textContent = text;
        if (className) node.className = className;
        return node;
    };
    const pct = x => `${Math.round(x * 100)}%`;
    const labels = {
        text: 'Only in the text network',
        link: 'Only in the hyperlinks',
        both: 'In both'
    };

    async function init() {
        const response = await fetch('data/week7_text_network.json');
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        const pages = new Map(data.pages.map(p => [p.id, p]));
        const detectable = new Set(data.pages.filter(p => p.detectable).map(p => p.id));
        const name = id => pages.get(id).name;

        const thresholdSelect = $('net-threshold');
        for (const t of data.thresholds) thresholdSelect.append(new Option(t.min === 1 ? 'any shared sentence' : `at least ${t.min} shared sentences`, t.min));
        const categorySelect = $('net-category');
        for (const key of ['text', 'link', 'both']) categorySelect.append(new Option(labels[key], key));
        categorySelect.value = 'text';

        const state = () => ({ min: Number(thresholdSelect.value), category: categorySelect.value, third: $('net-third').value });

        function kept(min) {
            return data.edges.filter(e => {
                const inText = e.w >= min;
                const inLink = e.cat === 'link' || e.cat === 'both';
                return inText || (inLink && e.a !== undefined);
            }).map(e => {
                const inText = e.w >= min;
                const inLink = e.cat === 'link' || e.cat === 'both';
                return { ...e, cat: inText && inLink ? 'both' : inText ? 'text' : 'link' };
            });
        }

        function render() {
            const { min, category, third } = state();
            const edges = kept(min);
            const comparable = edges.filter(e => e.cat !== 'link' || (detectable.has(e.a) && detectable.has(e.b)));
            const count = key => comparable.filter(e => e.cat === key).length;
            const nBoth = count('both'), nText = count('text'), nLink = count('link');
            const total = nBoth + nText + nLink;

            $('net-summary').replaceChildren(
                ...[[nText + nBoth, 'text edges'], [nBoth, 'also hyperlinks'], [nText, 'text only'], [nLink, 'hyperlink only']].map(([n, label]) => {
                    const card = el('div', undefined, 'w7-signal');
                    card.append(el('strong', String(n)), el('span', label));
                    return card;
                })
            );

            const bar = $('net-bar');
            bar.replaceChildren(...[['link', nLink], ['both', nBoth], ['text', nText]].map(([key, n]) => {
                const seg = el('span', n ? String(n) : '', `net-seg net-seg-${key}`);
                seg.style.flexGrow = String(Math.max(n, 0.0001));
                seg.title = `${labels[key]}: ${n}`;
                return seg;
            }));
            bar.setAttribute('aria-label', `${nLink} hyperlink-only, ${nBoth} shared, ${nText} text-only edges`);
            const precision = nBoth / (nBoth + nText || 1);
            const recall = nBoth / (nBoth + nLink || 1);
            $('net-readout').textContent = `Of ${nBoth + nText} text edges, ${pct(precision)} are also hyperlinks. Of ${nBoth + nLink} comparable hyperlinks, ${pct(recall)} appear in the text network. ${total} edges in the union.`;

            let rows = comparable.filter(e => e.cat === category);
            if (category === 'text' && third !== 'all') rows = rows.filter(e => (third === 'third') === e.third);
            rows.sort((x, y) => y.w - x.w || name(x.a).localeCompare(name(y.a)));
            $('net-list-count').textContent = `${rows.length} edges. Showing the ${Math.min(rows.length, 10)} ${category === 'link' ? 'first in alphabetical order' : 'with most shared sentences'}.`;
            if (category === 'link') rows.sort((x, y) => name(x.a).localeCompare(name(y.a)));
            $('net-list').replaceChildren(...rows.slice(0, 10).map(e => {
                const item = el('li', undefined, 'net-edge');
                const head = el('div', undefined, 'net-edge-head');
                const a = el('a', name(e.a)); a.href = pages.get(e.a).url;
                const b = el('a', name(e.b)); b.href = pages.get(e.b).url;
                head.append(a, el('span', ' — '), b);
                const meta = el('span', undefined, 'net-edge-meta');
                const bits = [];
                if (e.w) bits.push(`${e.w} shared sentence${e.w === 1 ? '' : 's'}`);
                bits.push(e.d === null ? 'no network path' : `hyperlink distance ${e.d}`);
                meta.textContent = bits.join(' · ');
                item.append(head, meta);
                if (e.cat === 'link') {
                    item.append(el('p', e.mention
                        ? 'One page links to the other and names it somewhere, but never in the same sentence.'
                        : 'Linked, but neither page contains the other’s name in a form our matcher knows (nickname, alias or link-only mention).', 'net-evidence'));
                } else {
                    for (const ev of e.ev || []) {
                        const quote = el('blockquote', undefined, 'net-evidence');
                        quote.append(el('span', ev.text), el('cite', ` — from ${ev.page === e.a || ev.page === e.b ? 'the page of ' : 'the page of third character '}${name(ev.page)}`));
                        item.append(quote);
                    }
                }
                return item;
            }));
        }

        const all = data.edges.filter(e => e.cat === 'text');
        const textDist2 = all.filter(e => e.d === 2).length;
        const thirdParty = all.filter(e => e.third).length;
        const linkRows = data.edges.filter(e => e.cat === 'link' && detectable.has(e.a) && detectable.has(e.b));
        const mentioned = linkRows.filter(e => e.mention).length;
        $('net-findings').textContent =
            `${all.length} character pairs share a sentence without being linked. ${pct(textDist2 / all.length)} of them are two hyperlink steps apart: the text finds friends of friends. ${pct(thirdParty / all.length)} come only from a third character’s page, typically a team roster or crossover. ` +
            `Going the other way, ${linkRows.length} hyperlinks have no shared sentence, and ${pct(mentioned / linkRows.length)} of those pages do name the other character, just not in the same sentence: a link says “see also”, a co-mention says “appears alongside”.`;
        const s = data.summary;
        $('net-method-note').textContent =
            `${s.pages} pages, ${s.sentences.toLocaleString()} sentences, ${s.aliases} unambiguous name variants (${s.pagesWithAlias} of ${s.pages} characters have at least one). Hyperlink edges are compared undirected, and only between characters whose names we can match (${s.linkEdgesDetectable} of ${s.linkEdges}). ` +
            `Matching is exact and case-sensitive, so “Blade” also matches “Ebony Blade” and a character mentioned only by first name is missed. Read the quoted sentences before trusting an edge.`;

        for (const control of [thresholdSelect, categorySelect, $('net-third')]) control.addEventListener('change', () => {
            $('net-third').disabled = categorySelect.value !== 'text';
            render();
        });
        $('net-status').hidden = true;
        $('net-app').hidden = false;
        render();
    }

    init().catch(error => {
        $('net-status').textContent = `Could not load the text-network snapshot (${error.message}).`;
    });
})();
