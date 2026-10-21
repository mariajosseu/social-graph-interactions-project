"""Numerical and data-integrity checks for the scientific arc pipeline."""
import json
from pathlib import Path
import unittest
import numpy as np
from week7_arc_math import correlation, resample, smooth, standardize


class ArcChecks(unittest.TestCase):
    def test_smoothing_and_alignment(self):
        # Windows must preserve constants and avoid depressing story edges.
        np.testing.assert_allclose(smooth(np.ones(100), .1), 1)
        np.testing.assert_allclose(smooth([0, 1, 0, 1, 0], .6), [.5, 1/3, 2/3, 1/3, .5])
        curve = resample([0, .5, 1])
        self.assertEqual(len(curve), 100)
        self.assertEqual((curve[0], curve[-1]), (0, 1))
        self.assertAlmostEqual(float(standardize(curve).mean()), 0)
        self.assertAlmostEqual(float(standardize(curve).std()), 1)
        self.assertIsNone(correlation([1, 1, 1], [2, 3, 4]))
        self.assertAlmostEqual(correlation([1, 2, 3], [3, 2, 1]), -1)

    def test_snapshot(self):
        data = json.loads((Path(__file__).resolve().parents[1] / 'data/week7_arcs.json').read_text())
        stories = data['stories']
        self.assertEqual(len(stories), 36)
        self.assertEqual(len({s['id'] for s in stories}), 36)
        self.assertEqual(len({s['author'] for s in stories}), 36)
        self.assertNotIn('8185505', {s['id'] for s in stories})  # British TV Avengers, not Marvel.
        self.assertNotIn('7078036', {s['id'] for s in stories})  # Explicitly "complete until further notice".
        for story in stories:
            self.assertTrue(story['url'].startswith('https://www.fanfiction.net/s/'))
            self.assertTrue(2000 <= story['words'] <= 8000)
            scores = np.asarray(story['scores'])
            self.assertEqual(scores.shape, (story['sentence_count'], 2))
            self.assertTrue(np.isfinite(scores).all())
            self.assertTrue(((scores >= 0) & (scores <= 1)).all())
            self.assertNotIn('text_path', story)
            for excerpt in story['excerpts']:
                self.assertLess(excerpt['index'], story['sentence_count'])
                self.assertLessEqual(len(excerpt['text'].split()), 25)
            for p in ['3', '5', '10']:
                arc = story['arcs'][p]
                self.assertEqual(len(arc['negative']), 100)
                self.assertEqual(len(arc['anger']), 100)
                fraction = int(p) / 100
                np.testing.assert_allclose(arc['negative'], resample(smooth(scores[:, 0], fraction)), atol=1e-6)
                np.testing.assert_allclose(arc['anger'], resample(smooth(scores[:, 1], fraction)), atol=1e-6)
        for p, config in data['clustering'].items():
            self.assertEqual(np.asarray(config['curves']).shape, (36, 100))
            for k, run in config['runs'].items():
                self.assertEqual(len(run['clusters']), int(k))
                members = [i for c in run['clusters'] for i in c['members']]
                self.assertEqual(sorted(members), list(range(36)))
                for group in run['clusters']:
                    self.assertTrue(all(run['labels'][i] == group['id'] for i in group['members']))
                self.assertTrue(-1 <= run['silhouette'] <= 1)
                self.assertTrue(-1 <= run['seed_stability'] <= 1)
                if p == '5':
                    self.assertEqual(run['smoothing_stability'], 1)


if __name__ == '__main__':
    unittest.main()
