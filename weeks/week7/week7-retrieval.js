/* Q6: sparse versus dense retrieval. Reads the frozen result snapshot only. */
(() => {
    const $ = id => document.getElementById(id);
    const el = (tag, text, className) => {
        const node = document.createElement(tag);
        if (text !== undefined) node.textContent = text;
        if (className) node.className = className;
        return node;
    };
    const winnerLabel = { sparse: 'Keyword search wins', dense: 'Embedding search wins', tie: 'Roughly a tie', neither: 'Neither works' };
    const kindLabel = { 'rare-name': 'Rare exact word', paraphrase: 'Paraphrase', vocabulary: 'Vocabulary mismatch', negation: 'Negation', history: 'Event in many wordings' };

    function column(title, hits, other, query) {
        const wrap = el('section', undefined, 'ret-col');
        wrap.append(el('h4', title));
        const list = el('ol', undefined, 'ret-list');
        const terms = query.toLowerCase().split(/\W+/).filter(t => t.length > 2);
        for (const hit of hits) {
            const item = el('li');
            const head = el('div', undefined, 'ret-head');
            head.append(el('strong', hit.name), el('span', `score ${hit.score} · rank ${hit.otherRank} in ${other}`, 'ret-meta'));
            const snippet = el('p', undefined, 'ret-snippet');
            const text = hit.snippet;
            const pattern = terms.length ? new RegExp(`(${terms.map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'gi') : null;
            for (const [i, part] of (pattern ? text.split(pattern) : [text]).entries()) {
                if (i % 2 && pattern) snippet.append(el('mark', part));
                else snippet.append(document.createTextNode(part));
            }
            item.append(head, snippet);
            list.append(item);
        }
        wrap.append(list);
        return wrap;
    }

    async function init() {
        const response = await fetch('data/week7_retrieval.json');
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        const select = $('ret-query');
        data.queries.forEach((q, i) => select.append(new Option(`${kindLabel[q.kind]} / ${q.query}`, i)));

        const tally = {};
        for (const q of data.queries) tally[q.winner] = (tally[q.winner] || 0) + 1;
        $('ret-summary').replaceChildren(...['sparse', 'dense', 'tie', 'neither'].map(key => {
            const card = el('div', undefined, 'w7-signal');
            card.append(el('strong', `${tally[key] || 0} / ${data.queries.length}`), el('span', winnerLabel[key]));
            return card;
        }));

        function render() {
            const q = data.queries[Number(select.value)];
            $('ret-note').textContent = q.note;
            $('ret-verdict').replaceChildren(el('strong', `${winnerLabel[q.winner]}. `, `ret-badge ret-${q.winner}`), document.createTextNode(q.verdict));
            $('ret-overlap').textContent = `${q.overlap} of ${data.topK} results are shared. ${q.matchingPages} of ${data.pages} pages contain at least one query word.`;
            $('ret-cols').replaceChildren(
                column('Keyword search (BM25)', q.sparse, 'embedding search', q.query),
                column('Embedding search (MiniLM)', q.dense, 'keyword search', q.query)
            );
        }
        select.addEventListener('change', render);
        $('ret-method').textContent = `${data.sparse}. Dense: ${data.model}; ${data.dense}. Each snippet is the page sentence that best fits the query under that method (most query words for keyword search, nearest sentence embedding for dense). Verdicts were written after reading the returned pages, not computed.`;
        $('ret-status').hidden = true;
        $('ret-app').hidden = false;
        render();
    }

    init().catch(error => {
        $('ret-status').textContent = `Could not load the retrieval snapshot (${error.message}).`;
    });
})();
