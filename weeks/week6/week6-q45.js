(() => {
  const $ = id => document.getElementById(id);
  const articles = new Map();
  let pages;
  let snapshot;
  let wordMethod = 'raw';
  let selectedPage = 0;

  const make = (tag, className, text) => {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
  };
  const pageName = index => pages[index]?.name || `Page ${index + 1}`;
  async function article(index) {
    const path = pages[index].article;
    if (!articles.has(path)) {
      const response = await fetch(path);
      if (!response.ok) throw new Error('Article unavailable');
      articles.set(path, await response.text());
    }
    return articles.get(path);
  }
  function wordRow() { return snapshot.words.find(row => row.word === $('q45-word').value) || snapshot.words[0]; }
  function wordNeighbors() { const row = wordRow(); return row.pairs.filter(pair => pair[wordMethod] > 0).sort((a, b) => b[wordMethod] - a[wordMethod]).slice(0, 10); }
  function inspectWord(neighbor) {
    const row = wordRow();
    const pair = row.pairs.find(candidate => candidate.word === neighbor);
    if (!pair) return;
    $('q45-target').textContent = row.word;
    $('q45-neighbor').textContent = neighbor;
    $('q45-scores').textContent = `Raw cosine ${pair.raw.toFixed(3)} · PPMI cosine ${pair.ppmi.toFixed(3)} · ${snapshot.window}-word context window`;
    const box = $('q45-excerpts'); box.replaceChildren();
    if (!pair.excerpts.length) { box.append(make('p', 'q-note', 'No frozen sentence contains both words; the association is distributed across the corpus.')); return; }
    pair.excerpts.forEach(excerpt => { const quote = make('blockquote'); quote.append(make('strong', '', `${pageName(excerpt.page)}${excerpt.both ? ' · both words' : ' · target context'}`), make('p', '', excerpt.text)); box.append(quote); });
  }
  function renderWords() {
    const row = wordRow(); const neighbors = wordNeighbors();
    const changed = neighbors.filter(pair => Math.abs(pair.ppmi - pair.raw) > .12).length;
    $('q45-summary').textContent = `${row.word} has ${neighbors.length} visible neighbors under ${wordMethod === 'ppmi' ? 'PPMI' : 'raw counts'}. ${changed} pairs move by more than 0.12 cosine after common context is discounted.`;
    const list = $('q45-neighbors'); list.replaceChildren();
    neighbors.forEach((pair, index) => { const button = make('button', 'q-result', `${index + 1}. ${pair.word} · ${pair[wordMethod].toFixed(3)}`); button.type = 'button'; button.append(make('small', 'q45-delta', `${pair.ppmi >= pair.raw ? '+' : ''}${(pair.ppmi - pair.raw).toFixed(3)} after PPMI`)); button.addEventListener('click', () => { [...list.children].forEach(item => item.setAttribute('aria-pressed', item === button)); inspectWord(pair.word); }); list.append(button); });
    if (neighbors[0]) inspectWord(neighbors[0].word);
  }
  function shared(page, index) { return page.tfidf.slice(0, 5).some(row => row.page === index) && page.ppmi.slice(0, 5).some(row => row.page === index); }
  async function inspectPage(index, method) {
    const source = snapshot.pages[selectedPage]; const row = [...source.tfidf, ...source.ppmi].find(candidate => candidate.page === index);
    $('q5-45-title').textContent = `${pageName(selectedPage)} ↔ ${pageName(index)}`;
    $('q5-45-stats').textContent = `${method === 'tfidf' ? 'TF-IDF' : 'PPMI context'} cosine ${row?.cosine.toFixed(3) || '—'} · ${row?.distance == null ? 'different components' : `${row.distance} network hops`}`;
    $('q5-45-copy').textContent = shared(source, index) ? 'Shared neighbor: both representations keep this page in their top five.' : 'Representation-specific neighbor: this page appears in only one top-five list.';
    $('q5-45-label-a').textContent = pageName(selectedPage); $('q5-45-label-b').textContent = pageName(index); $('q5-45-quote-a').textContent = $('q5-45-quote-b').textContent = 'Loading article openings…';
    try { const [first, second] = await Promise.all([article(selectedPage), article(index)]); const opening = text => text.split(/\n\s*\n/).find(part => part.trim())?.trim().slice(0, 360) || 'No article text.'; $('q5-45-quote-a').textContent = opening(first); $('q5-45-quote-b').textContent = opening(second); } catch (error) { $('q5-45-quote-a').textContent = $('q5-45-quote-b').textContent = 'Could not load the frozen articles.'; }
  }
  function renderPageList(id, rows, method) {
    const list = $(id); list.replaceChildren();
    rows.forEach((row, index) => { const button = make('button', `q-result${shared(snapshot.pages[selectedPage], row.page) ? ' q45-shared' : ''}`, `${index + 1}. ${pageName(row.page)} · ${row.cosine.toFixed(3)}`); button.type = 'button'; button.append(make('small', 'q45-delta', row.distance == null ? 'no network path' : `${row.distance} network hops`)); button.addEventListener('click', () => inspectPage(row.page, method)); list.append(button); });
  }
  function renderPages() {
    const page = snapshot.pages[selectedPage]; const overlap = page.tfidf.slice(0, 5).filter(row => page.ppmi.slice(0, 5).some(other => other.page === row.page)).length;
    $('q5-45-summary').textContent = `${pageName(selectedPage)} shares ${overlap} of its top five neighbors across the two representations. Corpus-wide mean overlap is ${Math.round(snapshot.meanOverlap * 100)}%.`;
    renderPageList('q5-45-tfidf', page.tfidf, 'tfidf'); renderPageList('q5-45-ppmi', page.ppmi, 'ppmi'); if (page.tfidf[0]) inspectPage(page.tfidf[0].page, 'tfidf');
  }
  async function init() {
    const [q45Response, baseResponse] = await Promise.all([fetch('data/week6_q45.json'), fetch('data/week6_questions.json')]);
    if (!q45Response.ok || !baseResponse.ok) throw new Error('Snapshot unavailable');
    snapshot = await q45Response.json(); pages = (await baseResponse.json()).pages;
    if (!snapshot.words?.length || !snapshot.pages?.length) throw new Error('Q4/Q5 snapshot is empty');
    $('q45-loading').hidden = true; $('q45-output').hidden = false; $('q5-45-loading').hidden = true; $('q5-45-output').hidden = false;
    snapshot.words.forEach(row => $('q45-word').append(new Option(row.word, row.word)));
    $('q45-word').addEventListener('change', renderWords);
    document.querySelectorAll('[data-q45-method]').forEach(button => button.addEventListener('click', () => { wordMethod = button.dataset.q45Method; document.querySelectorAll('[data-q45-method]').forEach(item => item.setAttribute('aria-pressed', item === button)); renderWords(); }));
    $('q45-surprise').addEventListener('click', () => { const row = snapshot.words[Math.floor(Math.random() * snapshot.words.length)]; $('q45-word').value = row.word; wordMethod = 'ppmi'; document.querySelectorAll('[data-q45-method]').forEach(item => item.setAttribute('aria-pressed', item.dataset.q45Method === wordMethod)); renderWords(); });
    pages.forEach((page, index) => $('q5-45-page').append(new Option(page.name, index)));
    $('q5-45-page').addEventListener('change', () => { selectedPage = Number($('q5-45-page').value); renderPages(); });
    $('q5-45-disagreement').addEventListener('click', () => { selectedPage = snapshot.disagreement[Math.floor(Math.random() * snapshot.disagreement.length)] || 0; $('q5-45-page').value = selectedPage; renderPages(); });
    renderWords(); renderPages();
  }
  init().catch(error => { const message = error.message === 'Q4/Q5 snapshot is empty' ? 'Question 4/5 data is not generated yet. Run tools/generate_week6_q45.py.' : 'Could not load Question 4/5 data. Serve the project over HTTP and try again.'; ['q45-loading', 'q5-45-loading'].forEach(id => { if ($(id)) $(id).textContent = message; }); });
})();
