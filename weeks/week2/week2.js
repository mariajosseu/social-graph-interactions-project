const nodes = [];
const edges = [];
const number = (value) => Number(value.toFixed(2));
const quizQuestions = [
  { key: 'visibility', question: 'About how many Instagram followers do you have?', options: [['0–100', 0], ['100–500', .25], ['500–2k', .5], ['2k–10k', .75], ['10k+', 1]] },
  { key: 'outreach', question: 'About how many Instagram accounts do you follow?', options: [['0–100', 0], ['100–300', .25], ['300–700', .5], ['700–1.5k', .75], ['1.5k+', 1]] },
  { key: 'connector', question: 'How many different friend groups do you regularly move between?', options: [['One', .1], ['Two', .35], ['Three or four', .7], ['Five or more', 1]] },
  { key: 'closeness', question: 'If two of your friends know you, how likely are they to know each other?', options: [['Very likely', 1], ['Somewhat likely', .65], ['Not very likely', .3], ['Almost never', 0]] },
  { key: 'outreach', question: 'How often do you start conversations or reach out first?', options: [['Rarely', .1], ['Sometimes', .4], ['Often', .7], ['Almost always', 1]] },
  { key: 'activity', question: 'How many people do you live with?', options: [['I live alone', 0], ['One other person', .25], ['Two or three', .55], ['Four or five', .8], ['Six or more', 1]] }
];
let quizIndex = 0;
const quizAnswers = {};

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

function percentile(values) {
  const ordered = [...values].sort((a, b) => a - b);
  return (value) => ordered.indexOf(value) / Math.max(1, ordered.length - 1);
}

function characterProfiles() {
  const inDegree = new Map(nodes.map((node) => [node.id, 0]));
  const outDegree = new Map(nodes.map((node) => [node.id, 0]));
  const neighbours = new Map(nodes.map((node) => [node.id, new Set()]));
  const outgoingNeighbours = new Map(nodes.map((node) => [node.id, new Set()]));
  const linked = new Set();
  edges.forEach(({ source, target }) => { inDegree.set(target, inDegree.get(target) + 1); outDegree.set(source, outDegree.get(source) + 1); neighbours.get(source).add(target); neighbours.get(target).add(source); outgoingNeighbours.get(source).add(target); linked.add(`${source}\t${target}`); linked.add(`${target}\t${source}`); });
  const closeness = nodes.map((node) => {
    const nearby = [...neighbours.get(node.id)];
    if (nearby.length < 2) return 0;
    let ties = 0;
    nearby.forEach((a, index) => nearby.slice(index + 1).forEach((b) => { if (linked.has(`${a}\t${b}`)) ties += 1; }));
    return ties / (nearby.length * (nearby.length - 1) / 2);
  });
  const totals = nodes.map((node) => inDegree.get(node.id) + outDegree.get(node.id));
  const visibilityRank = percentile(nodes.map((node) => inDegree.get(node.id)));
  const outreachRank = percentile(nodes.map((node) => outDegree.get(node.id)));
  const activityRank = percentile(totals);
  const closenessRank = percentile(closeness);
  const rawConnector = nodes.map((node, index) => (1 - closeness[index]) * Math.sqrt(activityRank(totals[index])));
  const connectorRank = percentile(rawConnector);
  return nodes.map((node, index) => ({ node, inDegree: inDegree.get(node.id), outDegree: outDegree.get(node.id), total: totals[index], closeness: closenessRank(closeness[index]), visibility: visibilityRank(inDegree.get(node.id)), outreach: outreachRank(outDegree.get(node.id)), activity: activityRank(totals[index]), connector: connectorRank(rawConnector[index]), outgoingCount: outgoingNeighbours.get(node.id).size, outgoingNeighbourPopularity: [...outgoingNeighbours.get(node.id)].reduce((sum, id) => sum + inDegree.get(id), 0) / Math.max(1, outgoingNeighbours.get(node.id).size) }));
}

function renderQuiz() {
  const question = quizQuestions[quizIndex];
  const value = quizAnswers[quizIndex];
  document.querySelector('#quiz-step').textContent = `${String(quizIndex + 1).padStart(2, '0')} / 06`;
  document.querySelector('#quiz-progress-bar').style.width = `${(quizIndex + 1) / quizQuestions.length * 100}%`;
  document.querySelector('#quiz-question').innerHTML = `<legend>${question.question}</legend><div class="quiz-options">${question.options.map(([label, optionValue], index) => `<label class="quiz-option"><input type="radio" name="answer" value="${optionValue}" ${value === optionValue ? 'checked' : ''}><span>${label}</span></label>`).join('')}</div>`;
  document.querySelector('#quiz-back').disabled = quizIndex === 0;
  const next = document.querySelector('#quiz-next');
  next.disabled = value === undefined;
  next.textContent = quizIndex === quizQuestions.length - 1 ? 'Find my twin →' : 'Next →';
}

function renderQuizResult() {
  const targets = {};
  quizQuestions.forEach((question, index) => { targets[question.key] = targets[question.key] === undefined ? quizAnswers[index] : (targets[question.key] + quizAnswers[index]) / 2; });
  const profiles = characterProfiles();
  const best = profiles.reduce((winner, profile) => {
    const distance = ['visibility', 'outreach', 'connector', 'closeness', 'activity'].reduce((sum, key) => sum + (profile[key] - targets[key]) ** 2, 0);
    const winnerDistance = ['visibility', 'outreach', 'connector', 'closeness', 'activity'].reduce((sum, key) => sum + (winner[key] - targets[key]) ** 2, 0);
    return distance < winnerDistance ? profile : winner;
  });
  const averageIn = edges.length / nodes.length;
  const linkedRatio = best.outgoingNeighbourPopularity / averageIn;
  const role = best.connector > .75 ? 'a natural bridge between different rooms' : best.closeness > .75 ? 'at home in a close-knit circle' : best.visibility > best.outreach ? 'a name many others gravitate toward' : 'a curious connector who reaches outward';
  const paradoxExplanation = best.outgoingCount
    ? `Their page links to characters with an average of <strong>${number(best.outgoingNeighbourPopularity)}</strong> incoming links. A randomly chosen Marvel character has <strong>${number(averageIn)}</strong>, so their linked characters are <strong>${number(linkedRatio)}×</strong> as visible. That is this character’s local version of the popularity trap.`
    : `This character has no outgoing links in the snapshot, so there are no linked characters to compare with a random Marvel character.`;
  document.querySelector('#footprint-quiz').hidden = true;
  const result = document.querySelector('#quiz-result');
  result.hidden = false;
  result.innerHTML = `<p class="result-kicker">Your Marvel network twin</p><h3 class="result-name">${best.node.name}</h3><p class="result-copy">Your answers most resemble ${best.node.name}: ${role}. ${paradoxExplanation}</p><div class="result-stats"><div><strong>${best.inDegree}</strong><span>pages linking to them</span></div><div><strong>${best.outDegree}</strong><span>pages they link outward to</span></div><div><strong>${number(best.outgoingNeighbourPopularity)}</strong><span>average popularity of pages they link to</span></div></div><button class="quiz-restart" type="button" id="quiz-restart">Try another footprint ↻</button>`;
  document.querySelector('#quiz-restart').addEventListener('click', () => { Object.keys(quizAnswers).forEach((key) => delete quizAnswers[key]); quizIndex = 0; result.hidden = true; document.querySelector('#footprint-quiz').hidden = false; renderQuiz(); });
}

function initialiseQuiz() {
  document.querySelector('#quiz-form').addEventListener('change', (event) => { quizAnswers[quizIndex] = Number(event.target.value); document.querySelector('#quiz-next').disabled = false; });
  document.querySelector('#quiz-back').addEventListener('click', () => { quizIndex -= 1; renderQuiz(); });
  document.querySelector('#quiz-form').addEventListener('submit', (event) => { event.preventDefault(); if (quizAnswers[quizIndex] === undefined) return; if (quizIndex === quizQuestions.length - 1) renderQuizResult(); else { quizIndex += 1; renderQuiz(); } });
  renderQuiz();
}

async function loadData() {
  const [nodesResponse, edgesResponse] = await Promise.all([fetch('data/week1_nodes.tsv'), fetch('data/week1_edges.tsv')]);
  parseTsv(await nodesResponse.text()).slice(1).forEach(([id, name]) => nodes.push({ id, name }));
  parseTsv(await edgesResponse.text()).slice(1).forEach(([source, target]) => edges.push({ source, target }));
  renderParadox();
  renderShuffle();
  initialiseQuiz();
}

loadData().catch(() => {
  document.querySelector('#paradox-copy').textContent = 'The snapshot could not be loaded. Run the project through a local HTTP server.';
});
