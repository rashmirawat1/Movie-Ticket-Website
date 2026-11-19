const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

// Loads a fresh copy of the website in a simulated browser.
function site() {
  const errors = [];
  const alerts = [];
  let realClose;
  const vc = new VirtualConsole();
  vc.on('jsdomError', (e) => {
    if (!/Could not parse CSS/.test(e.message)) errors.push(e.message);
  });
  const dom = new JSDOM(html, {
    runScripts: 'dangerously',
    url: 'http://localhost/',
    pretendToBeVisual: true,
    virtualConsole: vc,
    beforeParse(win) {
      realClose = win.close.bind(win); // the page defines its own close(), so keep the real one
      win.Element.prototype.scrollIntoView = () => {};
      win.Element.prototype.scrollBy = () => {};
      win.alert = (m) => alerts.push(m);
    },
  });
  const w = dom.window;
  const d = w.document;
  return {
    w, d, errors, alerts,
    $: (s) => d.querySelector(s),
    $$: (s) => [...d.querySelectorAll(s)],
    type(el, value, evt = 'input') {
      el.value = value;
      el.dispatchEvent(new w.Event(evt, { bubbles: true }));
    },
    done() {
      try { w.eval('clearInterval(timer)'); } catch (e) {}
      realClose();
    },
  };
}

function run(name, fn) {
  test(name, () => {
    const s = site();
    try { fn(s); } finally { s.done(); }
  });
}

// Helper: open the first featured movie and pick the first showtime.
function pickFirstShow(s) {
  s.$('.slide.on .play').click();
  s.$$('.time')[0].click();
}

run('page loads with no script errors and the right title', ({ errors, d }) => {
  assert.deepEqual(errors, []);
  assert.match(d.title, /Showtime/);
});

run('movie data is complete and consistent', ({ w }) => {
  const movies = w.eval('movies');
  const ids = movies.map((m) => m.id);
  assert.equal(new Set(ids).size, ids.length, 'movie ids must be unique');
  for (const m of movies) {
    for (const key of ['t', 'l', 'd', 'r', 'o', 'sc']) assert.ok(m[key], `${m.t || m.id} is missing "${key}"`);
    assert.ok(m.g.length > 0 && m.c.length === 2, `${m.t} needs genres and two colours`);
    if (m.soon) assert.equal(m.s, 0);
    else assert.ok(m.s > 0, `${m.t} needs a rating`);
  }
});

run('hero carousel shows every featured movie with one active slide', ({ w, $$ }) => {
  const n = w.eval('movies').filter((m) => m.f).length;
  assert.ok(n >= 3);
  assert.equal($$('.slide').length, n);
  assert.equal($$('.th2').length, n);
  assert.equal($$('.slide.on').length, 1);
  assert.ok($$('.ht').every((h) => h.textContent.trim().length > 0));
});

run('carousel arrows and thumbnails change the slide', ({ $, $$ }) => {
  const idx = () => $$('.slide').findIndex((s) => s.classList.contains('on'));
  assert.equal(idx(), 0);
  $('.ha.r').click();
  assert.equal(idx(), 1);
  $('.ha.l').click();
  assert.equal(idx(), 0);
  $('.ha.l').click();
  assert.equal(idx(), $$('.slide').length - 1, 'previous from the first slide wraps to the last');
  $$('.th2')[2].click();
  assert.equal(idx(), 2);
});

run('movie rows and posters render', ({ w, $$ }) => {
  const titles = $$('.row > h2').map((h) => h.textContent);
  assert.ok(titles.some((t) => /Trending in Gurugram/.test(t)));
  assert.ok(titles.some((t) => /Top rated/.test(t)));
  assert.ok(titles.some((t) => /Coming soon/.test(t)));
  assert.ok($$('article.card').length >= w.eval('movies').length);
  assert.ok($$('.poster').every((p) => p.querySelector('svg,img')), 'every poster needs artwork');
});

run('search filters movies and the hero comes back when cleared', ({ $, $$, type }) => {
  type($('#q'), 'orbit');
  assert.equal($$('.res article.card').length, 1);
  assert.equal($('.hero'), null);
  type($('#q'), 'zzzz-no-match');
  assert.match($('.empty').textContent, /Nothing matches/);
  type($('#q'), '');
  assert.ok($('.hero'));
});

run('genre chips filter the results', ({ $, $$ }) => {
  $$('.chip').find((c) => c.textContent === 'Horror').click();
  const labels = $$('.res article.card').map((c) => c.getAttribute('aria-label'));
  assert.deepEqual(labels, ['Haunted Hostel']);
  $$('.chip').find((c) => c.textContent === 'All').click();
  assert.ok($('.hero'));
});

run('changing city updates the row titles', ({ $, $$, type }) => {
  type($('#city'), 'Mumbai', 'change');
  assert.ok($$('.row > h2').some((h) => /Trending in Mumbai/.test(h.textContent)));
});

run('booking flow: pick show, choose seats, pay, get a ticket', ({ w, $, $$ }) => {
  $('.slide.on .play').click();
  assert.ok($('#view').classList.contains('open'));
  assert.equal($$('.date').length, 5);
  assert.equal($$('.seats').length, 0, 'seat map appears only after choosing a showtime');

  $$('.time')[0].click(); // first theatre: price multiplier is 1
  assert.equal($$('.s').length, 80);
  assert.ok($$('.s.t').length > 0, 'some seats should be sold');
  assert.ok($('.pay button').disabled, 'pay is disabled until a seat is chosen');

  $('.s[aria-label^="Seat A"]:not(.t)').click(); // Silver row
  assert.match($('.pay button').textContent, /Pay ₹180/);
  $('.s[aria-label^="Seat H"]:not(.t)').click(); // Premium row
  assert.match($('.pay button').textContent, /Pay ₹560/);
  assert.equal($$('.s.on').length, 2);

  $('.pay button').click();
  assert.match($('.ok').textContent, /confirmed/i);
  assert.ok($('.ticket'));
  assert.match($('.ticket').textContent, /Midnight Express 9/);
  assert.equal(JSON.parse(w.localStorage.getItem('st_b')).length, 1);
});

run('sold seats are the same every time for the same show', ({ $, $$ }) => {
  pickFirstShow({ $, $$ });
  const first = $$('.s.t').length;
  $('.back').click();
  assert.ok(!$('#view').classList.contains('open'));
  pickFirstShow({ $, $$ });
  assert.equal($$('.s.t').length, first);
});

run('a booking is limited to 8 seats', ({ $, $$, alerts }) => {
  pickFirstShow({ $, $$ });
  for (let i = 0; i < 9; i++) $$('.s:not(.t):not(.on)')[0].click();
  assert.equal($$('.s.on').length, 8);
  assert.equal(alerts.length, 1);
});

run('watchlist can be added and removed from the hero', ({ w, $, $$ }) => {
  $('.slide.on .ghost').click();
  assert.deepEqual(JSON.parse(w.localStorage.getItem('st_w')), [1]);
  assert.ok($$('.row > h2').some((h) => /My watchlist/.test(h.textContent)));
  $('.slide.on .ghost').click();
  assert.deepEqual(JSON.parse(w.localStorage.getItem('st_w')), []);
  assert.ok(!$$('.row > h2').some((h) => /My watchlist/.test(h.textContent)));
});

run('coming soon movies set a reminder instead of opening booking', ({ w, $, $$ }) => {
  $$('article.card').find((c) => c.getAttribute('aria-label') === 'Neon Nights').click();
  assert.ok(!$('#view').classList.contains('open'));
  assert.ok(JSON.parse(w.localStorage.getItem('st_w')).includes(9));
});

run('My tickets lists past bookings', ({ $, $$ }) => {
  pickFirstShow({ $, $$ });
  $$('.s:not(.t)')[0].click();
  $('.pay button').click();
  $('.tix').click();
  assert.equal($$('#view .th').length, 1);
  $('#view .th').click();
  assert.ok($('.ticket'));
});
