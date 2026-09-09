const nodes = [];
const edges = [];
const number = (value) => Number(value.toFixed(2));

function parseTsv(text) {
  return text.split(/\r?\n/).filter((line) => line && !line.startsWith('#')).map((line) => line.split('\t'));
}

function shuffle(values, random) {
  const result = [...values];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
  }
  return result;
}

function seededRandom(seed) {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
}

function reciprocalShare(targets, sources) {
  const pairs = new Set(sources.map((source, index) => `${source}\t${targets[index]}`));
  let reciprocal = 0;
  pairs.forEach((pair) => {
    const [source, target] = pair.split('\t');
    if (pairs.has(`${target}\t${source}`)) reciprocal += 1;
  });
  return reciprocal / pairs.size;
}

function renderParadox() {
  const inDegree = new Map(nodes.map((node) => [node.id, 0]));
  edges.forEach((edge) => inDegree.set(edge.target, inDegree.get(edge.target) + 1));
  const randomPopularity = edges.length / nodes.length;
  const linkedPopularity = edges.reduce((sum, edge) => sum + inDegree.get(edge.target), 0) / edges.length;
  const ratio = linkedPopularity / randomPopularity;
  document.querySelector('#paradox-ratio').textContent = `${number(ratio)}x`;
  document.querySelector('#random-value').textContent = number(randomPopularity);
  document.querySelector('#neighbor-value').textContent = number(linkedPopularity);
  document.querySelector('#random-bar').style.width = `${randomPopularity / linkedPopularity * 100}%`;
  document.querySelector('#neighbor-bar').style.width = '100%';
  document.querySelector('#paradox-copy').textContent = `${number(linkedPopularity)} incoming links for a character reached by a link, versus ${number(randomPopularity)} for a random character. Following links over-samples the famous.`;
  document.querySelector('#finding-copy').textContent = `The average character has ${number(randomPopularity)} incoming links. A character reached by following one of the ${edges.length.toLocaleString()} outgoing links has ${number(linkedPopularity)}: ${number(ratio)} times as much visibility.`;
}

function renderShuffle() {
  const sources = edges.map((edge) => edge.source);
  const targets = edges.map((edge) => edge.target);
  const realShare = reciprocalShare(targets, sources);
  const random = seededRandom(20260902);
  const results = Array.from({ length: 200 }, () => reciprocalShare(shuffle(targets, random), sources));
  const mean = results.reduce((sum, value) => sum + value, 0) / results.length;
  const maximum = Math.max(...results, realShare);
  const chart = document.querySelector('#shuffle-bars');
  chart.innerHTML = results.map((value) => `<i style="height: ${Math.max(2, value / maximum * 100)}%" title="${number(value * 100)}% reciprocal"></i>`).join('');
  const marker = document.createElement('i');
  marker.className = 'real';
  marker.style.height = `${Math.max(2, realShare / maximum * 100)}%`;
  marker.title = `Real network: ${number(realShare * 100)}% reciprocal`;
  chart.append(marker);
  document.querySelector('#real-reciprocity').textContent = `${number(realShare * 100)}%`;
  document.querySelector('#null-reciprocity').textContent = `${number(mean * 100)}%`;
  document.querySelector('#shuffle-copy').textContent = `The real network has ${number(realShare * 100)}% reciprocal links, while the degree-preserving shuffles average ${number(mean * 100)}%. Reciprocity is not explained by the degree sequence alone.`;
}

async function loadData() {
  const [nodesResponse, edgesResponse] = await Promise.all([fetch('../../data/week1_nodes.tsv'), fetch('../../data/week1_edges.tsv')]);
  parseTsv(await nodesResponse.text()).slice(1).forEach(([id, name]) => nodes.push({ id, name }));
  parseTsv(await edgesResponse.text()).slice(1).forEach(([source, target]) => edges.push({ source, target }));
  renderParadox();
  renderShuffle();
}

loadData().catch(() => {
  document.querySelector('#paradox-copy').textContent = 'The snapshot could not be loaded. Run the project through a local HTTP server.';
});