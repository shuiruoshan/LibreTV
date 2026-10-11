import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
async function logic() {
  const sandbox = { window: {}, URL, URLSearchParams, console, setTimeout, clearTimeout };
  vm.runInNewContext(await readFile(new URL('../js/quick-play.js', import.meta.url), 'utf8'), sandbox);
  return sandbox.window.QuickPlay.logic;
}
test('quick play rejects remakes, derivatives and different media types', async () => {
  const { matches } = await logic();
  const request = { title: '功夫女足', year: '2026', kind: 'movie' };
  assert.equal(matches({ vod_name: '功夫女足', vod_year: '2026', type_name: '喜剧片' }, request), true);
  for (const item of [
    { vod_name: '功夫女足[电影解说]', vod_year: '2026' },
    { vod_name: '功夫女足', vod_year: '1998' },
    { vod_name: '功夫女足', vod_year: '2026', type_name: '国产剧' },
    { vod_name: '功夫女足2', vod_year: '2026' }
  ]) assert.equal(matches(item, request), false);
});
test('unknown identity requires version choice across different years', async () => {
  const { groups } = await logic();
  const items = [
    { vod_name: '潜伏', vod_year: '2009', type_name: '国产剧' },
    { vod_name: '潜伏', vod_year: '2009', type_name: '国产剧' },
    { vod_name: '潜伏', vod_year: '2026', type_name: '剧情片' }
  ];
  assert.equal(groups(items).length, 2);
});
test('cross-source episodes map by label, never by matching array index', async () => {
  const { episodeIndex } = await logic();
  const history = { sourceName: 'a', vod_id: '1', episodeIndex: 1, episodeName: '第02集' };
  const candidate = { source_code: 'b', vod_id: '9' };
  assert.equal(episodeIndex({ episodes: ['x', 'y'], episodeNames: ['第2集', '第1集'] }, candidate, history), 0);
  assert.equal(episodeIndex({ episodes: ['x', 'y'], episodeNames: [] }, candidate, history), -1);
  assert.equal(episodeIndex({ episodes: ['x', 'y'], episodeNames: [] }, { source_code: 'a', vod_id: '1' }, history), 1);
});
test('resume only uses matching identity or an explicitly matching source/id', async () => {
  const { findHistory } = await logic();
  const records = [
    { title: '潜伏', movieYear: '2009', movieKind: 'tv', timestamp: 20, playbackPosition: 40 },
    { title: '潜伏', movieYear: '2026', movieKind: 'movie', timestamp: 10, playbackPosition: 80 }
  ];
  assert.equal(findHistory(records, { title: '潜伏', year: '2026', kind: 'movie' }).playbackPosition, 80);
  assert.equal(findHistory(records, { title: '潜伏' }), null);
});

test('episode labels preserve order even when two episodes share a URL', async () => {
  const sandbox = { window: {}, URL, console };
  vm.createContext(sandbox);
  vm.runInContext(await readFile(new URL('../js/config.js', import.meta.url), 'utf8'), sandbox);
  vm.runInContext(await readFile(new URL('../js/api.js', import.meta.url), 'utf8'), sandbox);
  const detail = { vod_play_from: 'hls', vod_play_url: '第01集$https://example.com/index.m3u8#第02集$https://example.com/index.m3u8' };
  const episodes = sandbox.extractPlayableEpisodes(detail);
  assert.deepEqual(Array.from(sandbox.extractPlayableEpisodeNames(detail, episodes)), ['第01集', '第02集']);
});
