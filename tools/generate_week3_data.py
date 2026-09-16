import argparse
import json
import random
import statistics
from pathlib import Path

import networkx as nx

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
OUT = DATA / "week3_story.json"
SEED = 3028
SHUFFLES = 40


def read_tsv(path):
    rows = []
    for line in path.read_text().splitlines():
        if line and not line.startswith("#"):
            rows.append(line.split("\t"))
    return rows[1:]


def build_graph():
    node_rows = read_tsv(DATA / "week1_nodes.tsv")
    edge_rows = read_tsv(DATA / "week1_edges.tsv")
    nodes = [{"id": row[0], "name": row[1] or row[0].replace("_", " ")} for row in node_rows]
    ids = [node["id"] for node in nodes]
    edges = {tuple(sorted((source, target))) for source, target, *_ in edge_rows if source != target and source in ids and target in ids}
    graph = nx.Graph()
    graph.add_nodes_from(ids)
    graph.add_edges_from(sorted(edges))
    return nodes, sorted(edges), graph


def build_clique_views(nodes):
    ids = {node['id'] for node in nodes}
    directed = nx.DiGraph()
    directed.add_nodes_from(sorted(ids))
    # The edge file has comment headers only, so retain its first data row.
    for line in (DATA / 'week1_edges.tsv').read_text().splitlines():
        if not line or line.startswith('#'):
            continue
        source, target, *_ = line.split('\t')
        if source != target and source in ids and target in ids:
            directed.add_edge(source, target)
    views = {}
    for mode in ('undirected', 'directed'):
        graph = directed.to_undirected(reciprocal=mode == 'directed')
        maximal = sorted((sorted(clique) for clique in nx.find_cliques(graph)), key=lambda clique: (len(clique), clique))
        size = max(map(len, maximal), default=0)
        views[mode] = {
            'largestSize': size,
            'maximalCount': len(maximal),
            'largest': [clique for clique in maximal if len(clique) == size],
            'edges': [list(edge) for edge in sorted(directed.edges() if mode == 'directed' else (tuple(sorted(edge)) for edge in graph.edges()))],
        }
    return views


def round_value(value):
    return round(float(value), 8)


def component_size(graph, removed):
    remaining = set(graph) - set(removed)
    if not remaining:
        return 0
    return max((len(component) for component in nx.connected_components(graph.subgraph(remaining))), default=0)


def stable_key(node_id):
    return sum((index + 1) * ord(character) for index, character in enumerate(node_id))


def shuffle_graph(graph, rng):
    edges = set(tuple(sorted(edge)) for edge in graph.edges())
    edge_choices = sorted(edges)
    for _ in range(10 * len(edges)):
        for _attempt in range(100):
            first = rng.choice(edge_choices)
            second = rng.choice(edge_choices)
            if len(set(first + second)) < 4:
                continue
            left, right = first
            other_left, other_right = second
            if rng.random() < 0.5:
                left, other_left = other_left, left
            new_edges = {tuple(sorted((left, other_right))), tuple(sorted((other_left, right)))}
            if len(new_edges) != 2 or new_edges & edges:
                continue
            edges.remove(first)
            edges.remove(second)
            edges.update(new_edges)
            edge_choices = sorted(edges)
            break
    shuffled = nx.Graph()
    shuffled.add_nodes_from(graph.nodes())
    shuffled.add_edges_from(sorted(edges))
    return shuffled


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--cliques-only', action='store_true', help='Update Experiment 04 without rerunning the centrality shuffles')
    args = parser.parse_args()
    nodes, edges, graph = build_graph()
    clique_views = build_clique_views(nodes)
    if args.cliques_only:
        payload = json.loads(OUT.read_text())
        payload['cliqueViews'] = clique_views
        OUT.write_text(json.dumps(payload, separators=(',', ':')) + '\n')
        print(json.dumps({mode: {'size': view['largestSize'], 'count': len(view['largest'])} for mode, view in clique_views.items()}))
        return
    names = {node["id"]: node["name"] for node in nodes}
    degrees = dict(graph.degree())
    betweenness = nx.betweenness_centrality(graph, normalized=True)
    closeness = nx.closeness_centrality(graph)
    centrality = [{
        "id": node_id,
        "name": names[node_id],
        "degree": degrees[node_id],
        "betweenness": round_value(betweenness[node_id]),
        "closeness": round_value(closeness[node_id]),
    } for node_id in graph]
    centrality.sort(key=lambda item: (-item["betweenness"], -item["degree"], item["name"]))

    candidates = centrality[:10]
    shuffle_samples = {item["id"]: [] for item in candidates}
    assortativity_samples = []
    for index in range(SHUFFLES):
        shuffled = shuffle_graph(graph, random.Random(SEED + index))
        shuffled_betweenness = nx.betweenness_centrality(shuffled, normalized=True)
        for node_id in shuffle_samples:
            shuffle_samples[node_id].append(shuffled_betweenness[node_id])
        assortativity_samples.append(nx.degree_assortativity_coefficient(shuffled))
    shuffle_summary = []
    for item in candidates:
        values = shuffle_samples[item["id"]]
        mean = statistics.mean(values)
        sd = statistics.pstdev(values)
        shuffle_summary.append({
            **item,
            "shuffleMean": round_value(mean),
            "shuffleSd": round_value(sd),
            "z": round_value((item["betweenness"] - mean) / sd) if sd else 0,
        })

    ranked_degree = [node_id for node_id, _ in sorted(degrees.items(), key=lambda pair: (-pair[1], pair[0]))]
    ranked_betweenness = [item["id"] for item in centrality]
    connected = [node_id for node_id in graph if degrees[node_id] > 0]
    random_order = sorted(connected, key=lambda node_id: (stable_key(node_id), node_id))
    removal_values = [{
        "removed": count,
        "degree": component_size(graph, ranked_degree[:count]),
        "betweenness": component_size(graph, ranked_betweenness[:count]),
        "random": component_size(graph, random_order[:count]),
    } for count in range(21)]
    single_hit = sorted(({
        "id": node_id,
        "name": names[node_id],
        "degree": degrees[node_id],
        "betweenness": round_value(betweenness[node_id]),
        "giantComponent": component_size(graph, [node_id]),
        "fragmented": len(max(nx.connected_components(graph), key=len)) - component_size(graph, [node_id]),
    } for node_id in connected), key=lambda item: (-item["fragmented"], item["name"]))

    triangles = sum(nx.triangles(graph).values()) // 3
    maximal_cliques = sorted((sorted(clique) for clique in nx.find_cliques(graph)), key=lambda clique: (len(clique), clique))
    largest_clique_size = max((len(clique) for clique in maximal_cliques), default=0)
    largest_cliques = [clique for clique in maximal_cliques if len(clique) == largest_clique_size]
    payload = {
        "nodes": nodes,
        "real": {"edges": [list(edge) for edge in edges]},
        "centrality": centrality,
        "shuffleSummary": shuffle_summary,
        "shuffleSettings": {"count": SHUFFLES, "seed": SEED},
        "cliqueViews": clique_views,
        "cliques": {
            "triangles": triangles,
            "maximalCount": len(maximal_cliques),
            "largestSize": largest_clique_size,
            "largest": largest_cliques[:20],
        },
        "removal": {
            "giantComponent": len(max(nx.connected_components(graph), key=len)),
            "values": removal_values,
            "orders": {"degree": ranked_degree[:20], "betweenness": ranked_betweenness[:20], "random": random_order[:20]},
            "singleHit": single_hit[:10],
        },
        "assortativity": {
            "real": round_value(nx.degree_assortativity_coefficient(graph)),
            "shuffleMean": round_value(statistics.mean(assortativity_samples)),
            "shuffleSd": round_value(statistics.pstdev(assortativity_samples)),
        },
        "generatedFrom": "data/week1_nodes.tsv + data/week1_edges.tsv",
    }
    OUT.write_text(json.dumps(payload, separators=(",", ":")) + "\n")
    print(f"Wrote {OUT} from {len(nodes)} nodes and {len(edges)} undirected edges")
    print(json.dumps({
        "topBetweenness": shuffle_summary[:5],
        "triangles": triangles,
        "largestClique": largest_clique_size,
        "giantComponent": payload["removal"]["giantComponent"],
    }, indent=2))


if __name__ == "__main__":
    main()
