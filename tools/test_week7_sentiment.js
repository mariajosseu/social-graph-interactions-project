// Check the frozen data, every control state, and the fetch failure message.
const fs = require('fs');
const vm = require('vm');
const assert = require('assert/strict');
class Element {
    constructor() { this.children = []; this.events = {}; this.value = ''; this.hidden = false; this.attrs = {}; }
    append(...nodes) { this.children.push(...nodes); }
    replaceChildren(...nodes) { this.children = nodes; }
    setAttribute(key, value) { this.attrs[key] = value; }
    addEventListener(key, fn) { this.events[key] = fn; }
}
const source = fs.readFileSync('weeks/week7/week7-sentiment.js', 'utf8');
const html = fs.readFileSync('week-07.html', 'utf8');
const data = JSON.parse(fs.readFileSync('data/week7_sentiment.json', 'utf8'));
assert.equal(data.pairs.length, 12);
assert.equal(new Set(data.pairs.map(p => p.id)).size, 12);
for (const pair of data.pairs) {
    assert.equal(pair.sentences.length, 2);
    for (const output of pair.outputs) for (const key of ['linear', 'contextual']) {
        assert(output[key].score >= 0 && output[key].score <= 1);
        assert.equal(output[key].label, output[key].score >= .5 ? 'positive' : 'negative');
    }
}
async function run(ok) {
    const ids = Object.fromEntries([...html.matchAll(/id="([^"]+)"/g)].map(m => [m[1], new Element()]));
    ids['doom-category'].value = 'names';
    ids['doom-app'].hidden = true;
    const errors = [];
    const context = { document: { getElementById: id => { assert(ids[id], id); return ids[id]; }, createElement: () => new Element() },
        fetch: async () => ({ ok, status: 503, json: async () => data }), console: { error: (...args) => errors.push(args) } };
    vm.runInNewContext(source, context);
    await new Promise(resolve => setImmediate(resolve));
    if (!ok) {
        assert(ids['doom-status'].textContent.includes('could not load'));
        assert.equal(ids['doom-app'].hidden, true);
        assert.equal(errors.length, 1);
        return;
    }
    assert.equal(ids['doom-app'].hidden, false);
    assert.equal(ids['doom-status'].hidden, true);
    assert.equal(ids['doom-all'].children.length, 24);
    const groups = ids['doom-summary'].children;
    assert.equal(groups.length, 4);
    const expectedSummaries = [
        ['Name-swap results', ['3 / 3', '1 / 3', '0 / 3'], 'name swaps changing the label'],
        ['Negation results', ['0 / 3', '0 / 3', '3 / 3'], 'positive-to-negative reversals'],
        ['Mixed-sentiment results', ['0 / 3', '0 / 3', '3 / 3'], 'target swaps changing the label'],
        ['Sarcasm results', ['0 / 3', '3 / 3', '0 / 3'], 'sarcastic variants labeled negative']
    ];
    groups.forEach((group, i) => {
        const [heading, counts, metric] = expectedSummaries[i];
        assert.equal(group.children[0].textContent, heading);
        const cards = group.children[2];
        assert.equal(cards.className, 'doom-summary');
        assert.equal(cards.children.length, 3);
        cards.children.forEach((card, j) => {
            assert.equal(card.children[0].textContent, counts[j]);
            assert(card.children[1].textContent.endsWith(metric));
        });
    });
    for (const category of ['names', 'negation', 'mixed', 'sarcasm']) {
        ids['doom-category'].value = category;
        ids['doom-category'].events.change();
        for (let i = 0; i < 3; i++) {
            ids['doom-pair'].value = String(i);
            ids['doom-pair'].events.change();
            const pair = data.pairs.filter(p => p.category === category)[i];
            for (let variant = 0; variant < 2; variant++) {
                assert.equal(ids['doom-toggle'].attrs['aria-pressed'], String(Boolean(variant)));
                for (const [j, key] of ['lexicon', 'linear', 'contextual'].entries()) {
                    const nodes = ids['doom-results'].children[j].children;
                    assert.equal(nodes[1].textContent, pair.outputs[variant][key].label);
                    if (key !== 'lexicon') {
                        const score = pair.outputs[variant][key].score;
                        assert.equal(nodes[2].textContent, `P(positive): ${score.toFixed(3)}`);
                        assert.equal(nodes[3].value, score);
                    }
                }
                ids['doom-toggle'].events.click();
            }
        }
    }
    assert.equal(errors.length, 0);
}
(async () => { await run(true); await run(false); console.log('Passed all 24 sentence states, data checks, controls, table, and load failure.'); })().catch(error => { console.error(error); process.exitCode = 1; });
