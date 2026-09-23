import csv
import json
import math
from collections import defaultdict
from pathlib import Path

import networkx as nx


ROOT = Path(__file__).resolve().parents[1]
NODES_PATH = ROOT / "data/week4_philosophers_nodes.tsv"
EDGES_PATH = ROOT / "data/week4_philosophers_edges.tsv"
OUTPUT_PATH = ROOT / "data/week4_story.json"


def read_rows(path):
    with path.open(encoding="utf-8") as handle:
        return list(csv.DictReader((line for line in handle if not line.startswith("#")), delimiter="\t"))


def disparity_keep(graph, alpha):
    keep = []
    for source, target, attributes in graph.edges(data=True):
        weight = attributes["weight"]
        source_degree = graph.degree(source)
        target_degree = graph.degree(target)
        source_signal = (1 - weight / graph.degree(source, weight="weight")) ** (source_degree - 1) if source_degree > 1 else 0
        target_signal = (1 - weight / graph.degree(target, weight="weight")) ** (target_degree - 1) if target_degree > 1 else 0
        if source_signal < alpha or target_signal < alpha:
            keep.append([source, target, weight])
    return keep


def component_size(nodes, edges):
    graph = nx.Graph()
    graph.add_nodes_from(nodes)
    graph.add_edges_from((source, target) for source, target, _ in edges)
    return len(max(nx.connected_components(graph), key=len)) if graph else 0


def main():
    nodes = read_rows(NODES_PATH)
    edges = read_rows(EDGES_PATH)
    graph = nx.Graph()
    graph.add_nodes_from(row["node_id"] for row in nodes)
    for row in edges:
        source, target, weight = row["source"], row["target"], int(row["weight"])
        if graph.has_edge(source, target):
            graph[source][target]["weight"] += weight
        else:
            graph.add_edge(source, target, weight=weight)

    giant_nodes = max(nx.connected_components(graph), key=len)
    giant = graph.subgraph(giant_nodes).copy()
    partition = nx.community.louvain_communities(giant, weight=None, seed=7)
    community_by_node = {node: index for index, group in enumerate(partition) for node in group}
    strength = dict(giant.degree(weight="weight"))
    degree = dict(giant.degree())
    positions = {}
    for community_index, group in enumerate(sorted(partition, key=len, reverse=True)):
        group_nodes = sorted(group, key=lambda node: strength.get(node, 0), reverse=True)
        group_angle = (community_index / max(len(partition), 1)) * math.tau
        group_radius = 0.24 + (community_index % 3) * 0.08
        for node_index, node in enumerate(group_nodes):
            angle = group_angle + (node_index / max(len(group_nodes), 1)) * math.tau * 0.72
            radius = 0.04 + math.sqrt(node_index / max(len(group_nodes), 1)) * 0.18
            positions[node] = (math.cos(group_angle) * group_radius + math.cos(angle) * radius, math.sin(group_angle) * group_radius + math.sin(angle) * radius)
    names = {row["node_id"]: row["name"] for row in nodes}

    alpha_stats = []
    backbones = {}
    for alpha in (0.05, 0.10, 0.20, 0.30, 0.50):
        kept = disparity_keep(giant, alpha)
        backbones[str(alpha)] = kept
        attached = {node for edge in kept for node in edge[:2]}
        alpha_stats.append({
            "alpha": alpha,
            "edges": len(kept),
            "nodes": len(attached),
            "giant": component_size(giant.nodes, kept),
        })

    community_names = {
        str(index): f"{names[max(group, key=lambda node: strength[node])]} & co. ({len(group)})"
        for index, group in enumerate(partition)
    }
    ranked = sorted(giant.nodes, key=lambda node: strength[node], reverse=True)
    nodes_out = [
        {
            "id": node,
            "name": names[node],
            "degree": degree[node],
            "strength": strength[node],
            "community": community_by_node[node],
            "x": round(positions[node][0], 6),
            "y": round(positions[node][1], 6),
        }
        for node in giant.nodes
    ]
    edges_out = [[source, target, attributes["weight"]] for source, target, attributes in giant.edges(data=True)]
    payload = {
        "nodes": nodes_out,
        "edges": edges_out,
        "backbones": backbones,
        "alphaStats": alpha_stats,
        "louvain": {"communities": len(partition), "modularity": round(nx.community.modularity(giant, partition), 3), "names": community_names},
        "topStrength": [{"name": names[node], "strength": strength[node], "degree": degree[node]} for node in ranked[:8]],
        "meta": {"sourceNodes": len(nodes), "giantNodes": len(giant), "giantEdges": giant.number_of_edges(), "totalWeight": sum(strength.values()) // 2},
    }
    OUTPUT_PATH.write_text(json.dumps(payload, separators=(",", ":")), encoding="utf-8")


if __name__ == "__main__":
    main()