(() => {
  const el = id => document.getElementById(id);
  let data, selected, request = 0;
  async function inspect(pageId) {
    selected = pageId;
    const ticket = ++request;
    render();
    const page = data.pages[pageId];
    const row = data[el('weirdness-mode').value].find(r => r.page === pageId);
    el('weirdness-page').textContent = page.name;
    el('weirdness-page').href = page.url;
    el('weirdness-stats').textContent = `Rank ${row.rank} / ${data.pages.length} · distance ${row.score.toFixed(3)} · ${row.tokens.toLocaleString()} tokens`;
    el('weirdness-terms').textContent = `Most frequent words: ${row.terms.map(t => `${t.term} (${t.count})`).join(', ')}.`;
    el('weirdness-excerpt').textContent = 'Loading the frozen article…';
    try {
      const response = await fetch(page.article);
      if (!response.ok) throw new Error('Article unavailable');
      const text = await response.text();
      if (ticket === request) el('weirdness-excerpt').textContent = text;
    } catch (error) {
      if (ticket === request) el('weirdness-excerpt').textContent = 'Could not load this frozen article. Try again.';
    }
  }
  function render() {
    const mode = el('weirdness-mode').value;
    el('weirdness-results').replaceChildren();
    const rawTop = new Set(data.raw.slice(0, 10).map(r => r.page));
    const kept = data.cleaned.slice(0, 10).filter(r => rawTop.has(r.page)).length;
    el('weirdness-overlap').textContent = `${kept} of the top 10 are the same pages with and without footer sections and numbers.`;
    data[mode].slice(0, 10).forEach(row => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'weirdness-result';
      button.setAttribute('aria-pressed', row.page === selected);
      button.textContent = `${row.rank}. ${data.pages[row.page].name} · ${row.score.toFixed(3)}`;
      button.addEventListener('click', () => inspect(row.page));
      el('weirdness-results').append(button);
    });
  }
  async function init() {
    const response = await fetch('data/week5_weirdness.json');
    if (!response.ok) throw new Error('Ranking unavailable');
    data = await response.json();
    el('weirdness-loading').hidden = true;
    el('weirdness-output').hidden = false;
    el('weirdness-mode').addEventListener('change', () => inspect(selected));
    await inspect(data.raw[0].page);
  }
  init().catch(() => { el('weirdness-loading').textContent = 'Could not load the ranking. Serve the project over HTTP and try again.'; });
})();
