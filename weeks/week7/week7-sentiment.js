/* Frozen model predictions; controls never invent or interpolate an inference. */
(() => {
    const $ = id => document.getElementById(id);
    const methods = [['lexicon', 'Word list'], ['linear', 'TF-IDF + logistic regression'], ['contextual', 'DistilBERT / SST-2']];
    const names = { names: 'Marvel names', negation: 'Negation', mixed: 'Mixed sentiment', sarcasm: 'Sarcasm' };
    const actions = { names: 'Swap the name', negation: 'Add “do not”', mixed: 'Swap the targets', sarcasm: 'Change the outcome' };
    const el = (tag, text, className) => {
        const node = document.createElement(tag);
        if (text !== undefined) node.textContent = text;
        if (className) node.className = className;
        return node;
    };
    async function init() {
        const response = await fetch('data/week7_sentiment.json');
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        let variant = 0;
        let options = [];
        const flips = key => data.pairs.filter(p => p.category === 'names' && p.outputs[0][key].label !== p.outputs[1][key].label).length;
        const negation = key => data.pairs.filter(p => p.category === 'negation' && p.outputs[0][key].label === 'positive' && p.outputs[1][key].label === 'negative').length;
        const sarcasm = key => data.pairs.filter(p => p.category === 'sarcasm' && p.outputs[1][key].label === 'negative').length;
        const summaries = [
            ['names', 'Name-swap results', 'name swaps changing the label', flips,
                'Only the name changes; the positive evaluation stays the same. Fewer label changes indicate more stable predictions. The word list’s sensitivity is built into its vocabulary.'],
            ['negation', 'Negation results', 'positive-to-negative reversals', negation,
                'Counts pairs where adding “do not” changes a positive label to negative, matching the intended reversal.'],
            ['mixed', 'Mixed-sentiment results', 'target swaps changing the label',
                key => data.pairs.filter(p => p.category === 'mixed' && p.outputs[0][key].label !== p.outputs[1][key].label).length,
                'Both variants contain the same words, so the word list and unigram TF-IDF return identical scores. A label change shows sensitivity to the target swap; neither binary label captures the full mixed reading.'],
            ['sarcasm', 'Sarcasm results', 'sarcastic variants labeled negative', sarcasm,
                'Counts negative labels for the intended sarcastic variants. TF-IDF also labels all three literal partners negative, so its 3/3 result does not demonstrate sarcasm recognition.']
        ];
        for (const [category, heading, metric, count, explanation] of summaries) {
            const section = el('section', undefined, 'doom-summary-group');
            const title = el('h4', heading);
            title.id = `doom-summary-${category}`;
            section.setAttribute('aria-labelledby', title.id);
            const cards = el('div', undefined, 'doom-summary');
            const total = data.pairs.filter(p => p.category === category).length;
            for (const [key, method] of methods) {
                const card = el('div', undefined, 'w7-signal');
                card.append(el('strong', `${count(key)} / ${total}`), el('span', `${method} · ${metric}`));
                cards.append(card);
            }
            section.append(title, el('p', explanation, 'doom-caption'), cards);
            $('doom-summary').append(section);
        }
        function render() {
            const pair = options[Number($('doom-pair').value)];
            $('doom-sentences').replaceChildren(...pair.sentences.map((sentence, i) => {
                const box = el('div', undefined, `doom-sentence${i === variant ? ' is-active' : ''}`);
                box.append(el('span', `${i ? 'B / Changed' : 'A / Original'} · intended: ${pair.expected[i]}`, 'eyebrow'), el('blockquote', sentence));
                return box;
            }));
            $('doom-toggle').textContent = variant ? '← Return to original' : `${actions[pair.category]} →`;
            $('doom-toggle').setAttribute('aria-pressed', String(Boolean(variant)));
            $('doom-note').textContent = pair.note;
            $('doom-results').replaceChildren(...methods.map(([key, title]) => {
                const output = pair.outputs[variant][key];
                const card = el('article', undefined, 'doom-result');
                card.append(el('h4', title), el('strong', output.label, `doom-verdict ${output.label}`));
                if (key === 'lexicon') {
                    const terms = output.matches.map(m => `${m.word} (${m.score > 0 ? '+' : ''}${m.score})`).join(' + ');
                    card.append(el('p', `Word sum: ${terms || 'no matching words'} = ${output.score}`, 'doom-number doom-matches'));
                } else {
                    const meter = el('meter');
                    meter.min = 0; meter.max = 1; meter.value = output.score;
                    meter.setAttribute('aria-label', `${title}: probability of positive sentiment`);
                    card.append(
                        el('p', `P(positive): ${output.score.toFixed(3)}`, 'doom-number'),
                        meter
                    );
                    card.append(el('p', 'Movie-review training; positive / negative labels only.', 'doom-matches'));
                }
                return card;
            }));
        }
        function chooseCategory() {
            options = data.pairs.filter(p => p.category === $('doom-category').value);
            $('doom-pair').replaceChildren(...options.map((pair, i) => {
                const option = el('option', pair.title); option.value = String(i); return option;
            }));
            $('doom-pair').value = '0'; variant = 0; render();
        }
        $('doom-category').addEventListener('change', chooseCategory);
        $('doom-pair').addEventListener('change', () => { variant = 0; render(); });
        $('doom-toggle').addEventListener('click', () => { variant = 1 - variant; render(); });
        for (const pair of data.pairs) pair.sentences.forEach((sentence, i) => {
            const row = el('tr');
            const cell = el('th'); cell.scope = 'row';
            cell.append(el('small', `${names[pair.category]} / ${i ? 'B' : 'A'}`), el('span', sentence));
            row.append(cell, el('td', pair.expected[i]));
            for (const [key] of methods) {
                const value = pair.outputs[i][key];
                row.append(el('td', `${value.label} / ${key === 'lexicon' ? value.score : value.score.toFixed(3)}`));
            }
            $('doom-all').append(row);
        });
        const meta = data.metadata;
        $('doom-lexicon').textContent = Object.entries(meta.lexicon).map(([w, n]) => `${w} ${n > 0 ? '+1' : '−1'}`).join(' · ');
        $('doom-training').textContent = `${meta.dataset}. ${meta.split} ${meta.training}`;
        $('doom-heldout').textContent = `Held-out review accuracy: ${(100 * meta.heldout_accuracy).toFixed(1)}% on ${meta.heldout_n} reviews. This checks performance on reviews, not validity on Marvel language.`;
        $('doom-revision').textContent = `Frozen model revision: ${meta.revision}.`;
        chooseCategory();
        $('doom-app').hidden = false;
        $('doom-status').hidden = true;
    }
    init().catch(error => {
        $('doom-status').textContent = 'The sentiment results could not load. Try reloading the page through the local HTTP server. The downloadable JSON contains the complete experiment.';
        console.error('Week 7 sentiment:', error);
    });
})();
