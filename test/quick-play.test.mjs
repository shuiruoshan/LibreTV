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

test('startup timeouts try only two alternates, then expose a manual error', async () => {
  const values = new Map([['selectedAPIs', '["a","b","c","d"]']]);
  const elements = new Map();
  const element = () => ({ hidden: true, textContent: '', querySelector: () => element(), replaceChildren() {}, appendChild() {} });
  let location = new URL('https://example.com/player.html?quick=1&title=Test&year=2026&kind=movie&id=1&source=a');
  const timers = [];
  const selected = [];
  const errors = [];
  const sandbox = {
    window: {}, URL, URLSearchParams, console, AbortController,
    location,
    history: { replaceState(_state, _title, url) { location = new URL(url); sandbox.location = location; } },
    localStorage: { getItem: key => values.get(key) || null, setItem: (key, value) => values.set(key, String(value)) },
    document: { getElementById(id) { if (!elements.has(id)) elements.set(id, element()); return elements.get(id); }, createElement: element },
    API_SITES: Object.fromEntries(['a','b','c','d'].map(key => [key, {name:key}])), DEFAULT_SELECTED_APIS: [],
    API_CONFIG: { search: {path: '?wd='} }, PROXY_URL: '/proxy/',
    getApiSearchContext: source => ({apiBaseUrl: `https://${source}.example/api`}),
    getDetailApiParamsForSource: source => `&source=${source}`,
    setTimeout(callback, delay) { const timer = {callback, delay}; timers.push(timer); return timer; },
    clearTimeout(timer) { if (timer) timer.cancelled = true; },
    fetch: async url => ({ok:true, json: async () => String(url).startsWith('/api/detail')
      ? {episodes:['https://example.com/test.m3u8'],episodeNames:['正片']}
      : {list:[{vod_id:'1',vod_name:'Test',vod_year:'2026',type_name:'movie'}]}})
  };
  sandbox.window.ProxyAuth = {addAuthToProxyUrl: async url => url};
  sandbox.window.showError = message => errors.push(message);
  vm.runInNewContext(await readFile(new URL('../js/quick-play.js', import.meta.url), 'utf8'), sandbox);
  const quick = sandbox.window.QuickPlay;
  const video = () => ({readyState:0,addEventListener(){}});
  quick.useSelection = selection => { selected.push(selection.item.source_code); quick.attach(video()); };
  assert.equal(await quick.prepare(),true);
  quick.attach(video());
  for (let attempt=0; attempt<3; attempt++) {
    const timer = timers.findLast(timer => timer.delay===15000 && !timer.cancelled);
    assert.ok(timer); timer.cancelled=true; timer.callback();
    await new Promise(resolve => setImmediate(resolve));
  }
  assert.deepEqual(selected,['b','c']);
  assert.equal(errors.length,1);
  assert.equal(quick.onError(),false);
});
