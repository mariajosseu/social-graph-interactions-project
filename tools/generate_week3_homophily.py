"""Team overlap against reproducible degree-preserving rewiring baselines."""
from concurrent.futures import ProcessPoolExecutor
import argparse
import hashlib
import json
import random
import statistics
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SEED = 3043


def team_sets(records):
    return {node: {team['id'] for team in record['affiliations']}
            for node, record in records.items() if record['status'] == 'known' and record['affiliations']}


def score(edges, teams):
    eligible = [(a, b) for a, b in edges if a in teams and b in teams]
    shared = sum(bool(teams[a] & teams[b]) for a, b in eligible)
    return {'eligibleEdges': len(eligible), 'sharedEdges': shared,
            'fraction': shared / len(eligible) if eligible else None}


def rewire(edges, nodes, directed, rng, attempts):
    """Symmetric proposals with rejection; preserve simple-graph degrees.

    Directed proposals include triangle reversals to allow transitions between
    orientations of isolated directed 3-cycles, which two-edge swaps cannot do.
    """
    choices = list(edges)
    present = set(choices)
    positions = {edge: index for index, edge in enumerate(choices)} if directed else None
    edge_count = len(choices)
    accepted = 0
    for _ in range(attempts):
        if directed and rng.random() < .1:
            a, b, c = rng.sample(nodes, 3)
            old = [(a, b), (b, c), (c, a)]
            new = [(b, a), (c, b), (a, c)]
            if not all(edge in present for edge in old) or any(edge in present for edge in new):
                continue
        else:
            first = rng.randrange(edge_count)
            second = rng.randrange(edge_count - 1)
            if second >= first:
                second += 1
            a, b = choices[first]
            c, d = choices[second]
            if a == c or a == d or b == c or b == d:
                continue
            if not directed and rng.random() < .5:
                c, d = d, c
            old = [choices[first], choices[second]]
            new = [(a, d), (c, b)]
            if not directed:
                new = [tuple(sorted(edge)) for edge in new]
            if any(edge in present for edge in new):
                continue
        indexes = [positions.pop(edge) for edge in old] if directed else [first, second]
        present.difference_update(old)
        present.update(new)
        for index, edge in zip(indexes, new):
            choices[index] = edge
            if directed:
                positions[edge] = index
        accepted += 1
    return choices, accepted


def degree_signature(edges, nodes, directed):
    degrees = {node: [0, 0] for node in nodes}
    for a, b in edges:
        degrees[a][0] += 1
        degrees[b][1 if directed else 0] += 1
    return degrees


def random_sample(arguments):
    edges, nodes, teams, directed, index, attempts_per_edge = arguments
    randomized, accepted = rewire(edges, nodes, directed, random.Random(SEED + index + (100000 if directed else 0)), attempts_per_edge * len(edges))
    assert len(randomized) == len(edges) == len(set(randomized))
    assert all(a != b for a, b in randomized)
    assert degree_signature(randomized, nodes, directed) == degree_signature(edges, nodes, directed)
    sample = score(randomized, teams)
    if sample['fraction'] is None:
        raise ValueError('A random network has no eligible edges; increase metadata coverage')
    return sample['fraction'], sample['eligibleEdges'], accepted


def analyze(view, nodes, teams, directed, count, attempts_per_edge, workers=1):
    edges = list(map(tuple, view['edges']))
    real = score(edges, teams)
    if real['fraction'] is None:
        raise ValueError('No edges with usable affiliation data')
    samples, eligible_counts, accepted_counts = [], [], []
    arguments = [(edges, nodes, teams, directed, index, attempts_per_edge) for index in range(count)]
    pool = ProcessPoolExecutor(max_workers=workers) if workers > 1 else None
    try:
        results = pool.map(random_sample, arguments, chunksize=5) if pool else map(random_sample, arguments)
        for index, (fraction, eligible, accepted) in enumerate(results):
            samples.append(fraction)
            eligible_counts.append(eligible)
            accepted_counts.append(accepted)
            if (index + 1) % 100 == 0:
                print(('directed' if directed else 'undirected'), index + 1, 'of', count, flush=True)
    finally:
        if pool:
            pool.shutdown()
    mean = statistics.mean(samples)
    ordered = sorted(samples)
    return {**real, 'totalEdges': len(edges), 'nodeCoverage': len(teams), 'totalNodes': len(nodes),
            'nullMean': mean, 'nullSd': statistics.pstdev(samples),
            'null95': [ordered[int(.025 * (count - 1))], ordered[int(.975 * (count - 1))]],
            'differencePp': 100 * (real['fraction'] - mean),
            'pValue': (1 + sum(value >= real['fraction'] for value in samples)) / (count + 1),
            'samples': samples, 'eligibleEdgeCounts': eligible_counts,
            'acceptedSwapRange': [min(accepted_counts), max(accepted_counts)]}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--workers', type=int, default=2)
    parser.add_argument('--count', type=int, default=1000)
    parser.add_argument('--attempts-per-edge', type=int, default=20)
    args = parser.parse_args()
    if args.count < 2 or args.attempts_per_edge < 1:
        parser.error('count must be at least 2 and attempts-per-edge positive')
    story = json.loads((ROOT / 'data/week3_story.json').read_text())
    team_path = ROOT / 'data/week3_teams.json'
    metadata = json.loads(team_path.read_text())
    nodes = sorted(node['id'] for node in story['nodes'])
    if set(metadata['members']) != set(nodes):
        raise ValueError('Scrape the full network first: scrape_week3_teams.py --all')
    teams = team_sets(metadata['members'])
    result = {'generatedAt': datetime.now(timezone.utc).isoformat(),
              'metadataSha256': hashlib.sha256(team_path.read_bytes()).hexdigest(),
              'metadataGeneratedAt': metadata['generatedAt'], 'seed': SEED, 'count': args.count,
              'attemptsPerEdge': args.attempts_per_edge,
              'eligibilityRule': 'Both endpoints have at least one recorded infobox team affiliation; unknown nodes excluded from the statistic, retained during rewiring.',
              'nullMethod': 'Independent replicas; uniform edge-pair proposals with rejection, 20 attempted swaps per original edge by default. Directed replicas preserve in-degree and out-degree and also propose directed triangle reversals. Undirected replicas preserve degree. Simple graphs, no connectivity constraint.',
              'views': {}}
    for mode, view in story['cliqueViews'].items():
        result['views'][mode] = analyze(view, nodes, teams, mode == 'directed', args.count, args.attempts_per_edge, max(1, args.workers))
    (ROOT / 'data/week3_homophily.json').write_text(json.dumps(result, separators=(',', ':')) + '\n')
    print(json.dumps({mode: {k: v for k, v in stats.items() if k not in {'samples', 'eligibleEdgeCounts'}} for mode, stats in result['views'].items()}, indent=2))


if __name__ == '__main__':
    main()
