(() => {
  const el = id => document.getElementById(id);
  const tokenize = text => (text.match(/[a-zA-Z]+(?:['’][a-zA-Z]+)*|[0-9]+/g) || []).map(word => word.toLowerCase().replaceAll('’', "'"));
  const counts = words => words.reduce((map, word) => map.set(word, (map.get(word) || 0) + 1), new Map());
  const experiments = [
    {query:'Norse god of thunder', note:'Expected: Thor. Starr the Slayer ranks first. The word “of” can contribute far more than the distinctive words “Norse” and “thunder”: raw counts treat every term equally. Inspect the contributions below. TF-IDF would reduce the influence of common words.'},
    {query:'friendly neighborhood spider man', note:'Expected: Spider-Man. Spider-UK ranks first. Repeated “spider” and “man” tokens favor other spider characters; the model does not understand a nickname or require every query word to occur.'},
    {query:'green angry scientist', note:'Expected: Hulk. Phil Urich ranks first and Hulk ranks fifth. The model counts literal words, including “green” in names such as Green Goblin, rather than understanding the description. TF-IDF may help weighting, but it does not supply semantic understanding.'},
    {query:'telepath', note:'Doctor Druid ranks first, while “telepathy” ranks Synapse first. Related word forms are separate vocabulary entries here. TF-IDF alone will not fix that; stemming or another form of normalization would be needed.'},
    {query:'telepathy', note:'Compare with “telepath”: the ranking changes because the engine matches exact tokens. Synapse ranks first for this word; neither spelling searches automatically for the other.'},
    {query:'qzxvpl', note:'No article contains this token. Every page scores zero, so the engine returns no matches. A Bag-of-Words engine cannot infer the intended word from an unknown token.'}
  ];
  let data, ranked = [], activeQuery = new Map(), requestId = 0;
  const articles = new Map();

  // Raw term counts, a query vector, and cosine similarity: the ranking core.
  function rank(query, corpus) {
    const vector = counts(tokenize(query));
    const queryNorm = Math.sqrt([...vector.values()].reduce((sum, n) => sum + n*n, 0));
    if (!queryNorm) return [];
    const dots = new Map();
    for (const [term, count] of vector) {
      for (const [id, frequency] of corpus.index[term] || []) {
        dots.set(id, (dots.get(id) || 0) + count*frequency);
      }
    }
    return [...dots].map(([id, dot]) => ({id, score:dot/(queryNorm*corpus.pages[id].norm)}))
      .filter(result => Number.isFinite(result.score) && result.score > 0)
      .sort((a,b) => b.score-a.score || corpus.pages[a.id].name.localeCompare(corpus.pages[b.id].name));
  }
  async function inspect(result) {
    const current = ++requestId, page = data.pages[result.id];
    el('search-inspector').hidden = false;
    const link = el('search-page-link'); link.textContent=page.name;link.href=page.url;
    el('search-score').textContent=`Cosine ${result.score.toFixed(4)} · ${page.tokens.toLocaleString()} article tokens`;
    el('search-contributions').replaceChildren();
    for (const [term, queryCount] of activeQuery) {
      const frequency = (data.index[term] || []).find(([id]) => id===result.id)?.[1] || 0;
      const row=document.createElement('tr');
      [term,queryCount,frequency,queryCount*frequency].forEach(value=>{const cell=document.createElement('td');cell.textContent=value;row.append(cell);});
      el('search-contributions').append(row);
    }
    el('search-excerpt').textContent='Loading the local article passage...';
    try {
      if (!articles.has(page.article)) {
        const response=await fetch(page.article);if(!response.ok) throw new Error('Could not load the article.');
        articles.set(page.article,await response.text());
      }
      if(current!==requestId) return;
      const passages=articles.get(page.article).split(/\n+/).filter(line=>line.trim());
      const best=passages.map((text,index)=>({text,index,overlap:new Set(tokenize(text).filter(word=>activeQuery.has(word))).size}))
        .sort((a,b)=>b.overlap-a.overlap || a.index-b.index)[0];
      el('search-excerpt').textContent=best?.text || 'No passage available.';
    } catch(error) {if(current===requestId)el('search-excerpt').textContent=error.message;}
  }
  function search() {
    const query=el('search-query').value;
    activeQuery=counts(tokenize(query));ranked=rank(query,data);requestId++;
    const experiment=experiments.find(item=>item.query.toLowerCase()===query.trim().toLowerCase());
    el('search-explanation').textContent=experiment?.note || 'Select a result to inspect the exact word counts and a passage containing query terms.';
    el('search-summary').textContent=ranked.length?`${ranked.length} of ${data.pages.length} pages have a positive score. Showing the top ${Math.min(10,ranked.length)}. Scores measure word overlap, not answer confidence.`:'No matching tokens. All 303 pages score zero.';
    el('search-results').replaceChildren();el('search-inspector').hidden=true;
    ranked.slice(0,10).forEach((result,index)=>{
      const button=document.createElement('button');button.type='button';button.className='search-result';
      const name=document.createElement('span');name.textContent=`${index+1}. ${data.pages[result.id].name}`;
      const score=document.createElement('span');score.textContent=result.score.toFixed(4);
      const bar=document.createElement('span');bar.className='search-bar';bar.style.width=`${100*result.score/ranked[0].score}%`;
      button.append(name,score,bar);button.addEventListener('click',()=>inspect(result));el('search-results').append(button);
    });
    if(ranked.length)inspect(ranked[0]);
  }
  el('search-form').addEventListener('submit',event=>{event.preventDefault();if(data)search();});
  fetch('data/week5_search.json').then(response=>{if(!response.ok)throw new Error('Could not load the search index.');return response.json();}).then(corpus=>{
    data=corpus;el('search-loading').hidden=true;el('search-output').hidden=false;el('search-submit').disabled=false;
    experiments.forEach(experiment=>{const button=document.createElement('button');button.type='button';button.textContent=experiment.query;button.addEventListener('click',()=>{el('search-query').value=experiment.query;search();});el('search-examples').append(button);});
    search();
  }).catch(error=>{el('search-loading').textContent=error.message;});
})();
