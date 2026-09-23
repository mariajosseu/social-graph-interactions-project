/* Derived memberships are embedded in the post; source data remains unchanged. */
(() => {
  const analysis = JSON.parse(document.getElementById('aristotle-analysis').textContent);
  const get = id => document.getElementById(`aristotle-${id}`);
  const palette = ['#c63b2d', '#246477', '#936300', '#715583', '#237350', '#a64323'];
  const labels = ['Broad core', 'Boethius / Anselm', 'Ockham / Buridan', 'Avicenna / Al-Farabi', 'Aquinas / Averroes', 'Husserl / Heidegger'];
  let community = -1;
  let selected = analysis['5'].ties[0].name;
  const order = [];
  const length = analysis['5'].ties.length;
  for (let offset = 0; offset < 10; offset++) for (let i = offset; i < length; i += 10) order.push(i);
  const slots = new Map(order.map((index, slot) => [index, slot]));
  const svg = get('svg');
  const make = (tag, attrs, text) => {
    const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
    Object.entries(attrs).forEach(([key, value]) => el.setAttribute(key, value));
    if (text !== undefined) el.textContent = text;
    return el;
  };
  function render() {
    const k = get('k').value;
    const current = analysis[k];
    const shared = get('shared').checked;
    const label = i => k === '5' ? labels[i] : 'Broad connected core';
    const visible = tie => (community < 0 || tie.groups.includes(community)) && (!shared || tie.groups.length > 1);
    const ties = current.ties.filter(visible);
    get('reading').textContent = k === '5'
      ? 'Six overlapping circles emerge at k = 5. Select a community, then turn on “Only ties shared” to highlight philosophers who share multiple communities with Aristotle.'
      : `At k = ${k}, Aristotle belongs to one community of ${current.groups[0].size.toLocaleString()} philosophers. The looser rule joins his circles into a broad core. Switch to k = 5 to distinguish them.`;
    get('filters').replaceChildren();
    [-1, ...current.groups.map((_, i) => i)].forEach(i => {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = i < 0 ? 'All communities' : `${label(i)} · ${current.groups[i].size}`;
      button.setAttribute('aria-pressed', String(community === i));
      if (i >= 0) button.style.borderBottomColor = palette[i];
      button.addEventListener('click', () => { community = i; render(); get('filters').children[i + 1].focus(); });
      get('filters').append(button);
    });
    if (!ties.some(t => t.name === selected)) selected = ties[0]?.name || '';
    get('neighbor').replaceChildren();
    ties.forEach(tie => {
      const option = document.createElement('option'); option.value = tie.name; option.textContent = tie.name;
      get('neighbor').append(option);
    });
    get('neighbor').disabled = !ties.length;
    get('neighbor').value = selected;
    const tie = current.ties.find(t => t.name === selected);
    get('tie').textContent = tie ? `${tie.name} ↔ Aristotle: weight ${tie.weight} (summed reference mentions). Shared circles: ${tie.groups.map(label).join('; ') || 'none at this k'}.` : 'No ties match. Turn off “Only ties shared” or choose another community.';
    get('community').textContent = community < 0 ? 'Choose a community to see its size and members. The six colors at k = 5 describe circles of reception, not exclusive historical schools.' : `${label(community)}: ${current.groups[community].size} total members. ${current.groups[community].size <= 12 ? current.groups[community].members.join(', ') : 'A broad community spanning ancient and later philosophy; select a smaller circle at k = 5 to examine a more specific grouping.'}`;
    if (community >= 0) {
      const explanation = get('community');
      const name = label(community);
      const description = explanation.textContent.slice(name.length);
      const heading = document.createElement('strong');
      heading.textContent = name;
      heading.style.color = palette[community];
      explanation.replaceChildren(heading, document.createTextNode(description));
    }
    get('count').textContent = `${ties.length} of ${length} direct ties highlighted${!ties.length && shared ? '. No neighbor shares multiple Aristotle communities at this setting.' : '.'}`;
    svg.replaceChildren();
    const edges = make('g', {}), dots = make('g', {});
    current.ties.forEach((t, i) => {
      const angle = slots.get(i) / length * 2 * Math.PI - Math.PI / 2;
      const dx = 270 * Math.cos(angle), dy = 270 * Math.sin(angle);
      const active = visible(t);
      const groups = t.groups.length ? t.groups : [-1];
      groups.forEach((group, j) => edges.append(make('line', {
        x1: 350 + dx * j / groups.length, y1: 350 + dy * j / groups.length,
        x2: 350 + dx * (j + 1) / groups.length, y2: 350 + dy * (j + 1) / groups.length,
        stroke: group < 0 ? '#737373' : palette[group],
        'stroke-width': t.name === selected ? 4 : 1.8, opacity: active ? .85 : .035
      })));
      const dot = make('circle', {cx: 350 + dx, cy: 350 + dy, r: t.name === selected ? 7 : 4, fill: t.name === selected ? '#17171a' : '#f1ede5', stroke: '#17171a', opacity: active ? 1 : .12});
      dot.append(make('title', {}, `${t.name} · weight ${t.weight}`));
      if (active) { dot.style.cursor = 'pointer'; dot.addEventListener('click', () => { selected = t.name; render(); }); }
      dots.append(dot);
    });
    svg.append(edges, dots, make('circle', {cx:350,cy:350,r:43,fill:'#f1ede5'}), make('text', {x:350,y:355,'text-anchor':'middle','font-size':16}, 'Aristotle'));
  }
  get('k').addEventListener('change', () => { community = -1; render(); });
  get('shared').addEventListener('change', render);
  get('neighbor').addEventListener('change', () => { selected = get('neighbor').value; render(); });
  get('reset').addEventListener('click', () => { get('k').value = '5'; get('shared').checked = false; community = -1; selected = analysis['5'].ties[0].name; render(); });
  render();
})();
