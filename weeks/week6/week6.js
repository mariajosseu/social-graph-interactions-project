(() => {
  const el = id => document.getElementById(id);
  const NS = 'http://www.w3.org/2000/svg';
  const COLORS = ['#31758b', '#d6452f', '#d9b92e', '#6b8f3a', '#8c5aa8', '#e0803a', '#2f2f35', '#b46a8a'];
  const texts = new Map();
  let data;

  const html = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  };
  const make = (tag, attrs = {}, text) => {
    const node = document.createElementNS(NS, tag);
    Object.entries(attrs).forEach(([k, v]) => node.setAttribute(k, v));
    if (text !== undefined) node.textContent = text;
    return node;
  };
  const hops = d => (d == null ? 'no path' : `${d} hops`);
  const name = i => data.pages[i].name;

  async function article(i) {
    const path = data.pages[i].article;
    if (!texts.has(path)) {
      const response = await fetch(path);
      if (!response.ok) throw new Error('Article unavailable');
      texts.set(path, await response.text());
    }
    return texts.get(path);
  }
  function sentenceWith(text, term) {
    const pattern = new RegExp(`(^|[^A-Za-z])${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^A-Za-z]|$)`, 'i');
    const sentence = text.split(/(?<=[.!?])\s+/).find(s => pattern.test(s));
    return sentence ? sentence.replace(/\s+/g, ' ').slice(0, 420) : 'No sentence found.';
  }
  function mixBar(vector, label) {
    const bar = html('div', 'mix-bar');
    bar.setAttribute('role', 'img');
    bar.setAttribute('aria-label', label);
    vector.forEach((v, k) => {
      if (v < .02) return;
      const part = html('span');
      part.style.flex = v;
      part.style.background = COLORS[k];
      part.title = `Topic ${k + 1}: ${Math.round(v * 100)}%`;
      bar.append(part);
    });
    return bar;
  }

  /* Question 01 */
  const REASONS = [
    ['Backhand (character)', 'Scatterbrain (Morituri)', 'Shared series', 'Both belong to the Strikeforce: Morituri series, but neither page links the other.'],
    ['Happy Sam Sawyer', 'Junior Juniper', 'Shared series', 'Both are Nick Fury\'s Howling Commandos stories, a World War II cast with no links to each other.'],
    ['Miracleman (character)', 'Spider-Man', 'Publishing history', 'Not a story match. Both pages spend their words on publishers, print runs and rights.'],
    ['Miracleman (character)', 'She-Hulk', 'Publishing history', 'Again the legal and rights vocabulary of the Miracleman page, not shared plot.'],
    ['Blue Eagle (character)', 'Hyperion (character)', 'Shared series', 'Both sit in the Squadron Supreme alternate universe.'],
    ['Hellfire (J. T. Slade)', 'Yo-Yo Rodriguez', 'Creators', 'Writer and artist names (Bendis, Maleev) and Nick Fury agents tie them to one creative run.'],
    ['Blackthorn (character)', 'Silencer (comics)', 'Shared series', 'Morituri again: the Strikeforce and the Horde.'],
    ['Scaredycat', 'Silencer (comics)', 'Shared series', 'Morituri again: Tuolema, recipients, Hordians.'],
    ['Balder the Brave', 'Hrimhari', 'Shared mythos', 'Asgard, Hela, Loki and Odin: one mythology, two disconnected corners of it.'],
    ['Dragon Lord (character)', 'Lei Kung (character)', 'Shared mythos', 'Both live in the Iron Fist mythos around K\'un-Lun.'],
    ['Brian Braddock', 'Captain Midlands', 'Shared setting', 'British heroes: the vocabulary is Britain, British and Captain.'],
    ['Ruby Summers', 'Scarlet Scarab', 'Weak match', 'Mostly generic words and a recurring first name; read the sentences before trusting it.'],
    ['Junior Juniper', 'Peggy Carter', 'Shared setting', 'Carter and Fury share a World War II backdrop.'],
    ['Captain Marvel (Marvel Comics)', 'Peggy Carter', 'Adaptations', 'Film and television vocabulary (Disney, voiced, live), not story.'],
    ['Blue Diamond (character)', 'Father Time (Marvel Comics)', 'Publishing history', 'Golden Age and Timely publishing history, not shared plot.']
  ];
  const reasonFor = (a, b) => REASONS.find(r => (r[0] === name(a) && r[1] === name(b)) || (r[0] === name(b) && r[1] === name(a)));
  let q1Selected = 0, q1Ticket = 0;

  function drawBuckets() {
    const svg = el('q1-bars');
    const rows = data.q1.buckets;
    const W = 960, H = 340, M = { left: 70, right: 24, top: 24, bottom: 60 };
    const max = Math.ceil(Math.max(...rows.map(r => r.p99)) * 20) / 20;
    const y = v => H - M.bottom - (v / max) * (H - M.top - M.bottom);
    const slot = (W - M.left - M.right) / rows.length;
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svg.replaceChildren();
    for (let t = 0; t <= max + 1e-9; t += .05) {
      svg.append(make('line', { class: 'scatter-grid', x1: M.left, x2: W - M.right, y1: y(t), y2: y(t) }));
      svg.append(make('text', { class: 'scatter-tick', x: M.left - 10, y: y(t) + 4, 'text-anchor': 'end' }, t.toFixed(2)));
    }
    svg.append(make('line', { class: 'scatter-axis', x1: M.left, x2: W - M.right, y1: y(0), y2: y(0) }));
    rows.forEach((r, i) => {
      const x = M.left + i * slot + slot * .2, w = slot * .6;
      svg.append(make('rect', { class: r.key === 'none' ? 'q-bar q-bar--none' : 'q-bar', x, y: y(r.mean), width: w, height: y(0) - y(r.mean) }));
      svg.append(make('line', { class: 'q-p99', x1: x, x2: x + w, y1: y(r.p99), y2: y(r.p99) }));
      svg.append(make('text', { class: 'scatter-tick', x: x + w / 2, y: y(r.mean) - 6, 'text-anchor': 'middle' }, r.mean.toFixed(3)));
      const label = r.key === 'none' ? 'no path' : r.key === '5' ? '5+ hops' : `${r.key} hop${r.key === '1' ? '' : 's'}`;
      svg.append(make('text', { class: 'scatter-label', x: x + w / 2, y: H - 34, 'text-anchor': 'middle' }, label));
      svg.append(make('text', { class: 'scatter-tick', x: x + w / 2, y: H - 14, 'text-anchor': 'middle' }, `${r.pairs.toLocaleString()} pairs`));
    });
  }

  async function inspectPair(k) {
    q1Selected = k;
    const ticket = ++q1Ticket;
    const pair = data.q1.pairs[k];
    [...el('q1-results').children].forEach((b, i) => b.setAttribute('aria-pressed', i === k));
    el('q1-title').textContent = `${name(pair.a)} ↔ ${name(pair.b)}`;
    el('q1-stats').textContent = `Cosine ${pair.cosine.toFixed(3)} · ${hops(pair.distance)} apart · ${pair.distance == null ? 'different components' : 'shortest path in the undirected graph'}`;
    const reason = reasonFor(pair.a, pair.b);
    el('q1-reason').textContent = reason ? `${reason[2]}. ${reason[3]}` : '';
    el('q1-terms').textContent = `Words carrying the match: ${pair.terms.map(t => t.term).join(', ')}.`;
    const term = pair.terms[0].term;
    el('q1-term').textContent = term;
    el('q1-label-a').textContent = name(pair.a);
    el('q1-label-b').textContent = name(pair.b);
    el('q1-quote-a').textContent = el('q1-quote-b').textContent = 'Loading…';
    try {
      const [a, b] = await Promise.all([article(pair.a), article(pair.b)]);
      if (ticket !== q1Ticket) return;
      el('q1-quote-a').textContent = sentenceWith(a, term);
      el('q1-quote-b').textContent = sentenceWith(b, term);
    } catch (error) {
      if (ticket === q1Ticket) el('q1-quote-a').textContent = el('q1-quote-b').textContent = 'Could not load the frozen articles.';
    }
  }
  function initQ1() {
    drawBuckets();
    data.q1.pairs.forEach((p, k) => {
      const button = html('button', 'q-result', `${k + 1}. ${name(p.a)} ↔ ${name(p.b)} · ${p.cosine.toFixed(3)} · ${hops(p.distance)}`);
      button.type = 'button';
      button.addEventListener('click', () => inspectPair(k));
      el('q1-results').append(button);
    });
    inspectPair(0);
  }

  /* Question 02 */
  const community = k => data.q2.communities[k];
  const label = k => `C${k + 1} · ${community(k).leaders[0].replace(/ \(.*\)/, '')}`;
  function pairKey(a, b) { return `${Math.min(a, b)}-${Math.max(a, b)}`; }

  function renderQ2() {
    let a = Number(el('q2-a').value), b = Number(el('q2-b').value);
    if (a === b) { el('q2-summary').textContent = 'Choose two different communities.'; return; }
    const pair = data.q2.pairs[pairKey(a, b)];
    const flip = pair.a !== a;
    const termsA = flip ? pair.termsB : pair.termsA, termsB = flip ? pair.termsA : pair.termsB;
    const rows = pair.test.map(r => ({ ...r, truth: flip ? (r.truth === 'a' ? 'b' : 'a') : r.truth, score: flip ? -r.score : r.score }));
    const right = pair.test.filter(r => r.truth === r.guess).length;
    el('q2-summary').textContent = `${right} of ${rows.length} held-out pages assigned to the right community (${Math.round(pair.accuracy * 100)}%; always guessing the larger side gives ${Math.round(pair.majority * 100)}%). With every capitalised word removed: ${Math.round(pair.accuracyNoNames * 100)}%.`;
    [['q2-terms-a', termsA, a], ['q2-terms-b', termsB, b]].forEach(([id, terms, k]) => {
      const box = el(id);
      box.replaceChildren(html('h4', '', label(k)), html('p', 'q-note', `${community(k).size} pages · leaders: ${community(k).leaders.slice(0, 3).join(', ')}`));
      const max = Math.max(...terms.map(t => t.z));
      terms.forEach(t => {
        const line = html('div', 'q2-term');
        line.append(html(t.name ? 'mark' : 'span', '', t.term));
        const bar = html('i'); bar.style.width = `${(t.z / max) * 100}%`;
        line.append(bar, html('small', '', t.z.toFixed(1)));
        box.append(line);
      });
    });
    const body = el('q2-test');
    body.replaceChildren();
    rows.sort((x, y) => (x.truth === y.truth ? 0 : x.truth === 'a' ? -1 : 1) || Math.abs(y.score) - Math.abs(x.score)).forEach(r => {
      const guessA = r.score > 0;
      const correct = (r.truth === 'a') === guessA;
      const tr = body.insertRow();
      tr.className = correct ? '' : 'is-wrong';
      [name(r.page), r.truth === 'a' ? label(a) : label(b), guessA ? label(a) : label(b), correct ? 'right' : 'wrong'].forEach(v => tr.insertCell().textContent = v);
    });
    [...el('q2-matrix').querySelectorAll('button')].forEach(btn => btn.setAttribute('aria-pressed', btn.dataset.key === pairKey(a, b)));
  }
  function initQ2() {
    const n = data.q2.communities.length;
    ['q2-a', 'q2-b'].forEach((id, side) => {
      const select = el(id);
      data.q2.communities.forEach((c, k) => select.append(Object.assign(document.createElement('option'), { value: k, textContent: label(k) })));
      select.value = side === 0 ? 0 : 3;
      select.addEventListener('change', renderQ2);
    });
    const table = el('q2-matrix');
    const head = table.createTHead().insertRow();
    head.append(document.createElement('th'));
    for (let k = 0; k < n; k++) head.append(Object.assign(document.createElement('th'), { textContent: `C${k + 1}` }));
    const body = table.createTBody();
    for (let i = 0; i < n; i++) {
      const tr = body.insertRow();
      tr.append(Object.assign(document.createElement('th'), { textContent: label(i), scope: 'row' }));
      for (let j = 0; j < n; j++) {
        const td = tr.insertCell();
        if (i === j) { td.textContent = '·'; continue; }
        const accuracy = data.q2.pairs[pairKey(i, j)].accuracy;
        const button = html('button', 'q2-cell', `${Math.round(accuracy * 100)}%`);
        button.type = 'button';
        button.dataset.key = pairKey(i, j);
        button.style.background = `rgba(49,117,139,${Math.max(0, (accuracy - .5) * 1.6)})`;
        button.addEventListener('click', () => { el('q2-a').value = i; el('q2-b').value = j; renderQ2(); });
        td.append(button);
      }
    }
    const mean = Object.values(data.q2.pairs).reduce((s, p) => s + p.accuracy, 0) / Object.keys(data.q2.pairs).length;
    const plain = Object.values(data.q2.pairs).reduce((s, p) => s + p.accuracyNoNames, 0) / Object.keys(data.q2.pairs).length;
    el('q2-mean').textContent = `Across all ${Object.keys(data.q2.pairs).length} community pairs the held-out accuracy averages ${Math.round(mean * 100)}%, and ${Math.round(plain * 100)}% once capitalised words are dropped.`;
    renderQ2();
  }

  /* Question 03 */
  let q3Selected = 0, q3Ticket = 0;
  const topicName = k => `Topic ${k + 1}`;
  const topicWords = k => data.q3.topics[k].slice(0, 5).join(', ');
  function mixed() { return data.q3.pages.map((p, i) => [p, i]).sort((x, y) => y[0].entropy - x[0].entropy); }

  async function inspectPage(i) {
    q3Selected = i;
    const ticket = ++q3Ticket;
    const p = data.q3.pages[i];
    el('q3-menu').value = i;
    [...el('q3-results').children].forEach(b => b.setAttribute('aria-pressed', Number(b.dataset.page) === i));
    const link = el('q3-page');
    link.textContent = p.name;
    link.href = p.url;
    el('q3-stats').textContent = `Entropy ${p.entropy.toFixed(2)} of 1.00 · ${p.tokens.toLocaleString()} counted words · top topics ${topicName(p.top[0])} and ${topicName(p.top[1])}`;
    const shifted = p.halfTop[0] !== p.halfTop[1];
    el('q3-verdict').textContent = shifted
      ? `The first half is mostly ${topicName(p.halfTop[0])} (${topicWords(p.halfTop[0])}) and the second half ${topicName(p.halfTop[1])} (${topicWords(p.halfTop[1])}). The page moves between themes: a candidate bridge.`
      : `Both halves are led by ${topicName(p.halfTop[0])} (${topicWords(p.halfTop[0])}) and each stays mixed. The model is spreading its bets, not seeing two themes.`;
    el('q3-mixes').replaceChildren(
      html('span', 'q-note', 'Whole page'), mixBar(p.theta, 'Topic mixture of the whole page'),
      html('span', 'q-note', 'First half'), mixBar(p.first, 'Topic mixture of the first half'),
      html('span', 'q-note', 'Second half'), mixBar(p.second, 'Topic mixture of the second half'));
    el('q3-opening').textContent = 'Loading…';
    try {
      const text = await article(i);
      if (ticket !== q3Ticket) return;
      const paragraphs = text.split(/\n\s*\n/).filter(s => s.trim());
      const cut = Math.max(1, Math.floor(paragraphs.length / 2));
      el('q3-opening').textContent = paragraphs[0].trim().slice(0, 360);
      el('q3-closing').textContent = (paragraphs[cut] || paragraphs[paragraphs.length - 1]).trim().slice(0, 360);
    } catch (error) {
      if (ticket === q3Ticket) el('q3-opening').textContent = el('q3-closing').textContent = 'Could not load the frozen article.';
    }
  }
  function initQ3() {
    const q3 = data.q3;
    const legend = el('q3-topics');
    q3.topics.forEach((words, k) => {
      const item = html('li');
      const swatch = html('i'); swatch.style.background = COLORS[k];
      item.append(swatch, html('strong', '', topicName(k)), document.createTextNode(` ${words.slice(0, 8).join(', ')}`));
      legend.append(item);
    });
    const order = mixed();
    const sameTop = order.slice(0, 30).filter(([p]) => p.halfTop[0] === p.halfTop[1]).length;
    const sameAll = q3.pages.filter(p => p.halfTop[0] === p.halfTop[1]).length;
    el('q3-summary').textContent = `Entropy and page length correlate at r = ${q3.lengthCorrelation.toFixed(2)}. ${sameAll} of ${q3.pages.length} pages keep the same leading topic in both halves; among the 30 most mixed pages, ${sameTop} do.`;
    order.slice(0, 15).forEach(([p, i], rank) => {
      const button = html('button', 'q-result', `${rank + 1}. ${p.name} · ${p.entropy.toFixed(2)}`);
      button.type = 'button';
      button.dataset.page = i;
      button.addEventListener('click', () => inspectPage(i));
      el('q3-results').append(button);
    });
    const menu = el('q3-menu');
    q3.pages.map((p, i) => [p.name, i]).sort((a, b) => a[0].localeCompare(b[0])).forEach(([n, i]) => menu.append(Object.assign(document.createElement('option'), { value: i, textContent: n })));
    menu.addEventListener('change', () => inspectPage(Number(menu.value)));
    inspectPage(order[0][1]);
  }

  async function init() {
    const response = await fetch('data/week6_questions.json');
    if (!response.ok) throw new Error('Snapshot unavailable');
    data = await response.json();
    ['q1', 'q2', 'q3'].forEach(q => { el(`${q}-loading`).hidden = true; el(`${q}-output`).hidden = false; });
    initQ1(); initQ2(); initQ3();
  }
  init().catch(() => ['q1', 'q2', 'q3'].forEach(q => { el(`${q}-loading`).textContent = 'Could not load the snapshot. Serve the project over HTTP and try again.'; }));
})();
