(() => {
  const el = id => document.getElementById(id);
  const PAGE_WORDS = 90;
  const norm = token => token.toLowerCase().replace(/[^a-z0-9']/g, '');
  let data, vocab = 0, round = [], tally = {right: 0, total: 0};

  const pick = options => {
    let r = Math.random() * options.reduce((s, [, n]) => s + n, 0);
    for (const [word, n] of options) if ((r -= n) < 0) return word;
    return options[0][0];
  };

  // Trigram sampling: next word depends on the previous two words of this community.
  function generate(community, target = PAGE_WORDS) {
    const words = [];
    let pair = pick(community.starts.map(([a, b, n]) => [[a, b], n]));
    words.push(...pair);
    while (words.length < target) {
      const next = community.tri[`${words.at(-2)}\t${words.at(-1)}`];
      let word = next ? pick(next) : '<END>';
      if (word === '<END>') {
        if (words.length >= target * .7) break;
        pair = pick(community.starts.map(([a, b, n]) => [[a, b], n]));
        words.push('\n', ...pair);
        continue;
      }
      words.push(word);
    }
    return words.join(' ').replace(/ \n /g, '\n\n');
  }

  // Naive Bayes over unigram counts: a stand-in for a very attentive reader.
  function classify(text) {
    const words = text.split(/\s+/).map(norm).filter(Boolean);
    let best = 0, bestScore = -Infinity;
    data.communities.forEach((c, k) => {
      const denom = c.tokens + .1 * vocab;
      let score = 0;
      for (const w of words) score += Math.log(((c.uni[w] || 0) + .1) / denom);
      if (score > bestScore) { bestScore = score; best = k; }
    });
    return best;
  }

  const label = c => `${c.id + 1}. ${c.leaders.slice(0, 2).join(' / ')}`;

  function updateScore() {
    const chance = 100 / data.communities.length;
    el('ac-score').textContent = tally.total
      ? `Human guesses: ${tally.right} / ${tally.total} correct (${Math.round(100 * tally.right / tally.total)}%) · chance is ${chance.toFixed(0)}%`
      : `No guesses yet · chance is ${chance.toFixed(0)}%`;
  }

  function newRound() {
    const order = data.communities.map((_, k) => k).sort(() => Math.random() - .5);
    round = order.map(k => ({truth: k, text: generate(data.communities[k]), guessed: null}));
    el('ac-pages').replaceChildren();
    round.forEach((page, i) => {
      const card = document.createElement('article');
      card.className = 'ac-card';
      const title = document.createElement('h3');
      title.textContent = `Fake page ${i + 1}`;
      const body = document.createElement('p');
      body.className = 'ac-text';
      body.textContent = page.text;
      const verdict = document.createElement('p');
      verdict.className = 'ac-verdict';
      verdict.setAttribute('aria-live', 'polite');
      const choices = document.createElement('div');
      choices.className = 'ac-choices';
      data.communities.forEach((c, k) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.textContent = label(c);
        b.addEventListener('click', () => {
          if (page.guessed !== null) return;
          page.guessed = k;
          tally.total++;
          if (k === page.truth) tally.right++;
          verdict.textContent = k === page.truth
            ? 'Correct.'
            : `Wrong. This page was written by community ${page.truth + 1}.`;
          verdict.dataset.ok = k === page.truth;
          choices.querySelectorAll('button').forEach((x, j) => {
            x.disabled = true;
            if (j === page.truth) x.dataset.state = 'truth';
            else if (j === k) x.dataset.state = 'wrong';
          });
          updateScore();
        });
        choices.append(b);
      });
      card.append(title, body, choices, verdict);
      el('ac-pages').append(card);
    });
  }

  function runClassifier() {
    const n = Number(el('ac-trials').value), K = data.communities.length;
    const matrix = Array.from({length: K}, () => new Array(K).fill(0));
    data.communities.forEach((c, k) => {
      for (let i = 0; i < n; i++) matrix[k][classify(generate(c))]++;
    });
    let right = 0;
    matrix.forEach((row, k) => { right += row[k]; });
    el('ac-bot-summary').textContent =
      `Word-count classifier: ${right} / ${n * K} correct (${(100 * right / (n * K)).toFixed(1)}%) on ${n} fresh pages per community. Chance is ${(100 / K).toFixed(1)}%.`;
    const head = '<tr><th>True \\ guessed</th>' + data.communities.map(c => `<th>${c.id + 1}</th>`).join('') + '<th>Recall</th></tr>';
    const rows = matrix.map((row, k) => `<tr><th>${label(data.communities[k])}</th>` +
      row.map((v, j) => `<td class="${j === k ? 'diag' : ''}" style="--p:${(v / n).toFixed(2)}">${v}</td>`).join('') +
      `<td>${Math.round(100 * row[k] / n)}%</td></tr>`).join('');
    el('ac-confusion').innerHTML = head + rows;
  }

  function renderClues() {
    el('ac-clues').replaceChildren(...data.communities.map(c => {
      const li = document.createElement('li');
      li.textContent = `${label(c)} · ${c.size} characters · signature words: ${c.signature.slice(0, 6).join(', ')}`;
      return li;
    }));
  }

  async function init() {
    const response = await fetch('data/week5_autocomplete.json');
    if (!response.ok) throw new Error('Models unavailable');
    data = await response.json();
    vocab = new Set(data.communities.flatMap(c => Object.keys(c.uni))).size;
    el('ac-loading').hidden = true;
    el('ac-output').hidden = false;
    renderClues();
    el('ac-new').addEventListener('click', newRound);
    el('ac-reset').addEventListener('click', () => { tally = {right: 0, total: 0}; updateScore(); newRound(); });
    el('ac-bot').addEventListener('click', runClassifier);
    el('ac-clue-toggle').addEventListener('change', e => { el('ac-clues-wrap').hidden = !e.target.checked; });
    updateScore();
    newRound();
  }
  init().catch(() => { el('ac-loading').textContent = 'Could not load the community models. Serve the project over HTTP and try again.'; });
})();
