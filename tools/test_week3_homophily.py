import random
import unittest

from generate_week3_homophily import analyze, degree_signature, rewire, score, team_sets
from scrape_week3_teams import extract_affiliations


class HomophilyTests(unittest.TestCase):
    def test_eligibility_and_multiple_memberships(self):
        records = {'a': {'status': 'known', 'affiliations': [{'id': 'X'}, {'id': 'Y'}]},
                   'b': {'status': 'known', 'affiliations': [{'id': 'Y'}]},
                   'c': {'status': 'known', 'affiliations': [{'id': 'Z'}]},
                   'd': {'status': 'unknown', 'affiliations': []}}
        result = score([('a', 'b'), ('b', 'c'), ('a', 'd')], team_sets(records))
        self.assertEqual(result, {'eligibleEdges': 2, 'sharedEdges': 1, 'fraction': .5})
        self.assertIsNone(score([('a', 'd')], team_sets(records))['fraction'])

    def test_rewiring_preserves_every_degree_and_simple_graph(self):
        nodes = list('abcdefgh')
        for directed in (False, True):
            edges = [(nodes[i], nodes[(i + 1) % 8]) for i in range(8)]
            if not directed:
                edges = sorted({tuple(sorted(edge)) for edge in edges})
            original = degree_signature(edges, nodes, directed)
            shuffled, accepted = rewire(edges, nodes, directed, random.Random(42), 1000)
            self.assertGreater(accepted, 0)
            self.assertNotEqual(set(shuffled), set(edges))
            self.assertEqual(original, degree_signature(shuffled, nodes, directed))
            self.assertEqual(len(shuffled), len(set(shuffled)))
            self.assertTrue(all(a != b for a, b in shuffled))
            self.assertEqual(shuffled, rewire(edges, nodes, directed, random.Random(42), 1000)[0])

    def test_directed_three_cycle_can_reverse(self):
        edges = [('a', 'b'), ('b', 'c'), ('c', 'a')]
        _, accepted = rewire(edges, list('abc'), True, random.Random(3), 100)
        self.assertGreater(accepted, 0)

    def test_empirical_p_value_and_coverage(self):
        nodes = list('abcdef')
        view = {'edges': [('a', 'b'), ('b', 'c'), ('c', 'd'), ('d', 'e'), ('e', 'f'), ('a', 'f')]}
        teams = {'a': {'X'}, 'b': {'X'}, 'c': {'X'}, 'd': {'Y'}, 'e': {'Y'}}
        result = analyze(view, nodes, teams, False, 20, 10)
        self.assertEqual(result['pValue'], (1 + sum(s >= result['fraction'] for s in result['samples'])) / 21)
        self.assertEqual(result['nodeCoverage'], 5)
        self.assertEqual(result['eligibleEdges'], 4)
        self.assertEqual(len(result['eligibleEdgeCounts']), 20)

    def test_missing_fields_and_version_headings(self):
        source = 'https://en.wikipedia.org/wiki/Test'
        self.assertEqual(extract_affiliations('<p>No infobox</p>', source)['status'], 'unknown')
        result = extract_affiliations('<table class="infobox"><tr><th>Team affiliations</th><td>(Version one)<br><a href="/wiki/X-Men">X-Men</a><br>(Version two)<br>Unlinked team</td></tr></table>', source)
        self.assertEqual([team['id'] for team in result['affiliations']], ['X-Men', 'Unlinked team'])
        result = extract_affiliations('<table class="infobox"><tr><th>Team affiliations</th><td><a href="/wiki/X-Men">X-Men</a>, <a href="/wiki/X-Force">X-Force</a></td></tr></table>', source)
        self.assertEqual([team['id'] for team in result['affiliations']], ['X-Men', 'X-Force'])


if __name__ == '__main__':
    unittest.main()
