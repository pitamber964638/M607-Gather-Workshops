import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { openDatabase, workshopById } from '../src/db.js';
import { createApp } from '../src/app.js';
import { hashPassword } from '../src/security.js';

const password = 'A secure test phrase 123';
const payload = (overrides) => ({
  title: 'A thoughtful test workshop',
  category: 'Arts & crafts',
  description: 'A friendly creative session with all materials provided. Beginners are welcome.',
  host: 'Test Host',
  venue: 'Test Studio',
  address: '35 Bethnal Green Road, London',
  latitude: 51.5244,
  longitude: -0.0736,
  starts_at: new Date(Date.now() + 3 * 86400000).toISOString(),
  duration_minutes: 90,
  capacity: 10,
  outdoor: false,
  status: 'published',
  ...overrides,
});
async function setup(t, options = {}) {
  const db = openDatabase(':memory:');
  const hash = await hashPassword(password);
  db.prepare("INSERT INTO users(name,email,password_hash,role) VALUES(?,?,?,'admin')").run(
    'Admin',
    'admin@example.test',
    hash,
  );
  const app = createApp({ db, origin: 'http://localhost:3333', rateLimits: false, ...options });
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    db.close();
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  const client = () => {
    let cookie = '',
      csrf = '';
    return {
      async call(path, method = 'GET', body, headers = {}) {
        const res = await fetch(`${base}/api${path}`, {
          method,
          headers: {
            'Content-Type': 'application/json',
            Cookie: cookie,
            'X-CSRF-Token': csrf,
            ...headers,
          },
          body: body === undefined ? undefined : JSON.stringify(body),
        });
        const setCookie = res.headers.get('set-cookie');
        if (setCookie) cookie = setCookie.split(';')[0];
        const data = await res.json();
        if (data.csrf) csrf = data.csrf;
        return { status: res.status, data, headers: res.headers };
      },
      async init() {
        return this.call('/session');
      },
      async signup(email = `${Math.random()}@example.test`) {
        await this.init();
        return this.call('/auth/signup', 'POST', { name: 'Test Member', email, password });
      },
      async login() {
        await this.init();
        return this.call('/auth/login', 'POST', { email: 'admin@example.test', password });
      },
    };
  };
  const admin = client();
  await admin.login();
  const create = async (overrides) => {
    const res = await admin.call('/admin/workshops', 'POST', payload(overrides));
    assert.equal(res.status, 201, JSON.stringify(res.data));
    return res.data.workshop;
  };
  return { db, app, base, client, admin, create };
}

test('signup stores a hash, ignores supplied role and rotates sessions', async (t) => {
  const { client, db } = await setup(t);
  const user = client();
  const guest = await user.init();
  const result = await user.call('/auth/signup', 'POST', {
    name: 'New Member',
    email: 'NEW@example.test',
    password,
    role: 'admin',
  });
  assert.equal(result.status, 201);
  assert.equal(result.data.user.role, 'user');
  assert.equal(result.data.user.email, 'new@example.test');
  assert.notEqual(result.data.csrf, guest.data.csrf);
  const stored = db
    .prepare('SELECT password_hash FROM users WHERE email=?')
    .get('new@example.test');
  assert.notEqual(stored.password_hash, password);
  assert.match(stored.password_hash, /^[a-f0-9]{32}:[a-f0-9]{128}$/);
  assert.match(result.headers.get('set-cookie'), /HttpOnly/);
  assert.match(result.headers.get('set-cookie'), /SameSite=Lax/);
  assert.equal((await user.call('/admin/analytics')).status, 403);
});
test('duplicate emails and malformed registration fail clearly', async (t) => {
  const { client } = await setup(t);
  const a = client(),
    b = client();
  await a.signup('same@example.test');
  await b.init();
  assert.equal(
    (
      await b.call('/auth/signup', 'POST', {
        name: 'Another Member',
        email: 'SAME@example.test',
        password,
      })
    ).status,
    409,
  );
  for (const body of [
    { name: 'A', email: 'x', password },
    { name: 'Valid Name', email: 'ok@example.test', password: 'short' },
  ])
    assert.equal((await b.call('/auth/signup', 'POST', body)).status, 400);
});
test('login rejects wrong credentials and logout invalidates authentication', async (t) => {
  const { client } = await setup(t);
  const a = client();
  await a.init();
  assert.equal(
    (await a.call('/auth/login', 'POST', { email: 'admin@example.test', password: 'incorrect' }))
      .status,
    401,
  );
  assert.equal((await a.login()).status, 200);
  assert.equal((await a.call('/auth/logout', 'POST', {})).status, 200);
  assert.equal((await a.call('/bookings')).status, 401);
});
test('CSRF and origin protection reject forged mutations', async (t) => {
  const { client } = await setup(t);
  const a = client();
  await a.signup();
  assert.equal(
    (
      await a.call(
        '/profile',
        'PATCH',
        { name: 'Changed', email: 'x@example.test' },
        { 'X-CSRF-Token': 'wrong' },
      )
    ).status,
    403,
  );
  assert.equal(
    (await a.call('/auth/logout', 'POST', {}, { Origin: 'https://evil.example' })).status,
    403,
  );
  assert.equal(
    (await a.call('/auth/logout', 'POST', {}, { 'Content-Type': 'text/plain' })).status,
    415,
  );
});
test('anonymous and standard users cannot mutate admin records', async (t) => {
  const { client, create } = await setup(t);
  const w = await create(),
    a = client();
  await a.init();
  assert.equal((await a.call('/admin/workshops')).status, 401);
  await a.signup();
  for (const [path, method, body] of [
    ['/admin/workshops', 'POST', payload()],
    [`/admin/workshops/${w.id}`, 'PATCH', payload()],
    [`/admin/workshops/${w.id}`, 'DELETE', {}],
    ['/admin/bookings', 'GET'],
    ['/admin/analytics', 'GET'],
  ])
    assert.equal((await a.call(path, method, body)).status, 403);
});
test('search, category, setting, date and availability filters work together', async (t) => {
  const { create, client, db } = await setup(t);
  await create({ title: 'Pottery for everyone' });
  await create({ title: 'Garden morning session', category: 'Outdoors', outdoor: true });
  await create({ title: 'Unpublished secret workshop', status: 'draft' });
  const past = await create();
  db.prepare('UPDATE workshops SET starts_at=? WHERE id=?').run(
    '2020-01-01T12:00:00.000Z',
    past.id,
  );
  const a = client();
  const query = await a.call(
    '/workshops?q=Garden&category=Outdoors&setting=outdoor&available=true',
  );
  assert.equal(query.data.workshops.length, 1);
  assert.equal(query.data.workshops[0].title, 'Garden morning session');
  assert.equal((await a.call('/workshops')).data.workshops.length, 2);
  assert.equal((await a.call('/workshops?q=%25')).data.workshops.length, 0);
  assert.equal((await a.call('/workshops?q=%27%20OR%201%3D1--')).data.workshops.length, 0);
  assert.equal((await a.call('/workshops?from=2099-01-01')).data.workshops.length, 0);
  assert.equal((await a.call('/workshops?category=invalid')).status, 400);
});
test('bookings persist, decrement seats and prevent duplicate reservations', async (t) => {
  const { create, client, db } = await setup(t);
  const w = await create({ capacity: 4 }),
    a = client();
  await a.signup();
  const booked = await a.call('/bookings', 'POST', { workshop_id: w.id, seats: 3 });
  assert.equal(booked.status, 201);
  assert.match(booked.data.booking.reference, /^GTH-[A-F0-9]{12}$/);
  assert.equal(workshopById(db, w.id).booked_seats, 3);
  assert.equal((await a.call('/bookings')).data.bookings.length, 1);
  assert.equal((await a.call('/bookings', 'POST', { workshop_id: w.id, seats: 1 })).status, 409);
});
test('simultaneous requests cannot overbook the last place', async (t) => {
  const { create, client, db } = await setup(t);
  const w = await create({ capacity: 1 });
  const a = client(),
    b = client();
  await Promise.all([a.signup(), b.signup()]);
  const results = await Promise.all([
    a.call('/bookings', 'POST', { workshop_id: w.id, seats: 1 }),
    b.call('/bookings', 'POST', { workshop_id: w.id, seats: 1 }),
  ]);
  assert.deepEqual(results.map((r) => r.status).sort(), [201, 409]);
  assert.equal(workshopById(db, w.id).booked_seats, 1);
});
test('seat count validation and unavailable workshops reject bookings', async (t) => {
  const { create, client } = await setup(t);
  const w = await create(),
    draft = await create({ status: 'draft' }),
    a = client();
  await a.signup();
  for (const seats of [0, -1, 5, 1.5, '2', null])
    assert.equal((await a.call('/bookings', 'POST', { workshop_id: w.id, seats })).status, 400);
  assert.equal(
    (await a.call('/bookings', 'POST', { workshop_id: draft.id, seats: 1 })).status,
    400,
  );
});
test('booking ownership is enforced and cancellation releases capacity', async (t) => {
  const { create, client, db } = await setup(t);
  const w = await create({ capacity: 1 }),
    a = client(),
    b = client();
  await a.signup();
  await b.signup();
  const booking = (await a.call('/bookings', 'POST', { workshop_id: w.id, seats: 1 })).data.booking;
  assert.equal((await b.call(`/bookings/${booking.id}/cancel`, 'POST', {})).status, 404);
  assert.equal((await b.call('/bookings')).data.bookings.length, 0);
  assert.equal((await a.call(`/bookings/${booking.id}/cancel`, 'POST', {})).status, 200);
  assert.equal(workshopById(db, w.id).booked_seats, 0);
  assert.equal((await a.call(`/bookings/${booking.id}/cancel`, 'POST', {})).status, 409);
  assert.equal((await b.call('/bookings', 'POST', { workshop_id: w.id, seats: 1 })).status, 201);
});
test('past bookings cannot be cancelled', async (t) => {
  const { create, client, db } = await setup(t);
  const w = await create(),
    a = client();
  await a.signup();
  const b = (await a.call('/bookings', 'POST', { workshop_id: w.id, seats: 1 })).data.booking;
  db.prepare('UPDATE workshops SET starts_at=? WHERE id=?').run('2020-01-01T12:00:00.000Z', w.id);
  assert.equal((await a.call(`/bookings/${b.id}/cancel`, 'POST', {})).status, 400);
});
test('admin CRUD validates fields and cannot reduce capacity below reservations', async (t) => {
  const { create, admin, client } = await setup(t);
  const w = await create(),
    a = client();
  await a.signup();
  await a.call('/bookings', 'POST', { workshop_id: w.id, seats: 3 });
  assert.equal(
    (await admin.call(`/admin/workshops/${w.id}`, 'PATCH', payload({ capacity: 2 }))).status,
    409,
  );
  assert.equal(
    (await admin.call(`/admin/workshops/${w.id}`, 'PATCH', payload({ status: 'draft' }))).status,
    409,
  );
  assert.equal(
    (await admin.call('/admin/workshops', 'POST', payload({ latitude: 100 }))).status,
    400,
  );
  assert.equal(
    (await admin.call('/admin/workshops', 'POST', payload({ starts_at: '2020-01-01' }))).status,
    400,
  );
  const update = await admin.call(
    `/admin/workshops/${w.id}`,
    'PATCH',
    payload({ title: 'Updated workshop title', capacity: 12 }),
  );
  assert.equal(update.status, 200);
  assert.equal(update.data.workshop.title, 'Updated workshop title');
});
test('deleting a workshop hides it and cancels future bookings without losing history', async (t) => {
  const { create, admin, client, db } = await setup(t);
  const w = await create(),
    a = client();
  await a.signup();
  await a.call('/bookings', 'POST', { workshop_id: w.id, seats: 1 });
  assert.equal((await admin.call(`/admin/workshops/${w.id}`, 'DELETE', {})).status, 200);
  assert.equal((await a.call(`/workshops/${w.id}`)).status, 404);
  assert.equal((await a.call('/workshops')).data.workshops.length, 0);
  const history = (await a.call('/bookings')).data.bookings;
  assert.equal(history.length, 1);
  assert.equal(history[0].status, 'cancelled');
  assert.equal(history[0].workshop_status, 'deleted');
  assert.equal(db.prepare('PRAGMA foreign_key_check').all().length, 0);
});
test('cancelling an event cancels every active reservation', async (t) => {
  const { create, admin, client, db } = await setup(t);
  const w = await create(),
    a = client();
  await a.signup();
  await a.call('/bookings', 'POST', { workshop_id: w.id, seats: 2 });
  assert.equal(
    (await admin.call(`/admin/workshops/${w.id}`, 'PATCH', payload({ status: 'cancelled' })))
      .status,
    200,
  );
  assert.equal((await a.call('/bookings')).data.bookings[0].status, 'cancelled');
  assert.equal(workshopById(db, w.id).booked_seats, 0);
});
test('reviews require attendance, a finished workshop, and one review per person', async (t) => {
  const { create, client, db } = await setup(t);
  const w = await create(),
    a = client(),
    b = client();
  await a.signup();
  await b.signup();
  await a.call('/bookings', 'POST', { workshop_id: w.id, seats: 1 });
  const body = { rating: 5, comment: 'A thoughtful and enjoyable afternoon.' };
  assert.equal((await a.call(`/workshops/${w.id}/reviews`, 'POST', body)).status, 400);
  db.prepare('UPDATE workshops SET starts_at=? WHERE id=?').run('2020-01-01T12:00:00.000Z', w.id);
  assert.equal((await b.call(`/workshops/${w.id}/reviews`, 'POST', body)).status, 403);
  assert.equal(
    (await a.call(`/workshops/${w.id}/reviews`, 'POST', { ...body, rating: 6 })).status,
    400,
  );
  assert.equal((await a.call(`/workshops/${w.id}/reviews`, 'POST', body)).status, 201);
  assert.equal((await a.call(`/workshops/${w.id}/reviews`, 'POST', body)).status, 409);
  const detail = await a.call(`/workshops/${w.id}`);
  assert.equal(detail.data.workshop.rating, 5);
  assert.equal(detail.data.reviews.length, 1);
});
test('profile changes persist and changing email requires the current password', async (t) => {
  const { client } = await setup(t);
  const a = client();
  const signup = await a.signup('before@example.test');
  assert.equal(
    (await a.call('/profile', 'PATCH', { name: 'Updated Name', email: signup.data.user.email }))
      .status,
    200,
  );
  assert.equal(
    (await a.call('/profile', 'PATCH', { name: 'Updated Name', email: 'after@example.test' }))
      .status,
    400,
  );
  assert.equal(
    (
      await a.call('/profile', 'PATCH', {
        name: 'Updated Name',
        email: 'after@example.test',
        current_password: password,
      })
    ).status,
    200,
  );
  assert.equal((await a.call('/session')).data.user.email, 'after@example.test');
});
test('password changes reject the old password and revoke other sessions', async (t) => {
  const { client } = await setup(t);
  const a = client(),
    b = client();
  await a.signup('password@example.test');
  await b.init();
  await b.call('/auth/login', 'POST', { email: 'password@example.test', password });
  assert.equal(
    (
      await a.call('/profile/password', 'POST', {
        current_password: 'wrong',
        password: 'A new secure password',
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await a.call('/profile/password', 'POST', {
        current_password: password,
        password: 'A new secure password',
      })
    ).status,
    200,
  );
  assert.equal((await b.call('/bookings')).status, 401);
  await b.init();
  assert.equal(
    (await b.call('/auth/login', 'POST', { email: 'password@example.test', password })).status,
    401,
  );
  assert.equal(
    (
      await b.call('/auth/login', 'POST', {
        email: 'password@example.test',
        password: 'A new secure password',
      })
    ).status,
    200,
  );
});
test('analytics are calculated from stored bookings and include seven days', async (t) => {
  const { create, client, admin } = await setup(t);
  const w = await create(),
    a = client();
  await a.signup();
  await a.call('/bookings', 'POST', { workshop_id: w.id, seats: 3 });
  const { data } = await admin.call('/admin/analytics');
  assert.equal(data.metrics.users, 1);
  assert.equal(data.metrics.seats, 3);
  assert.equal(data.metrics.bookings, 1);
  assert.equal(data.metrics.upcoming, 1);
  assert.equal(data.activity.length, 7);
  assert.equal(data.by_category[0].seats, 3);
});
test('security headers and missing endpoints have correct responses', async (t) => {
  const { client } = await setup(t);
  const a = client();
  const response = await a.init();
  assert.match(response.headers.get('content-security-policy'), /script-src 'self'/);
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.match(response.headers.get('content-security-policy'), /frame-src 'none'/);
  assert.equal((await a.call('/missing')).status, 404);
  assert.equal((await a.call('/workshops/9999')).status, 404);
});
test('rate limits reject sustained authentication abuse', async (t) => {
  const { client } = await setup(t, { rateLimits: true });
  const a = client();
  await a.init();
  let last;
  for (let i = 0; i < 26; i++)
    last = await a.call('/auth/login', 'POST', { email: 'invalid', password: 'wrong' });
  assert.equal(last.status, 429);
  assert.match(last.data.error, /Too many/);
});

test('JSON writes reject arrays and missing fields without server errors', async (t) => {
  const { client } = await setup(t);
  const a = client();
  await a.signup();
  assert.equal((await a.call('/profile', 'PATCH', [])).status, 400);
  assert.equal((await a.call('/profile', 'PATCH', {})).status, 400);
});

test('date filtering includes workshops just after London midnight in summer', async (t) => {
  const { create, client } = await setup(t);
  const year = new Date().getUTCFullYear() + 1;
  const wanted = await create({ starts_at: `${year}-06-14T23:30:00.000Z` });
  await create({ starts_at: `${year}-06-14T22:30:00.000Z` });
  const a = client();
  const { data } = await a.call(`/workshops?from=${year}-06-15`);
  assert.deepEqual(
    data.workshops.map((w) => w.id),
    [wanted.id],
  );
  assert.equal((await a.call(`/workshops?from=${year}-02-30`)).status, 400);
});

test('concurrent password updates cannot both succeed using the old password', async (t) => {
  const { client } = await setup(t);
  const a = client(),
    b = client();
  await a.signup('race@example.test');
  await b.init();
  await b.call('/auth/login', 'POST', { email: 'race@example.test', password });
  const results = await Promise.all([
    a.call('/profile/password', 'POST', {
      current_password: password,
      password: 'New password phrase one',
    }),
    b.call('/profile/password', 'POST', {
      current_password: password,
      password: 'New password phrase two',
    }),
  ]);
  assert.equal(results.filter((r) => r.status === 200).length, 1);
  assert.ok(results.some((r) => [400, 403, 409].includes(r.status)));
});

test('workshop timestamps require an explicit timezone and a real calendar date', async (t) => {
  const { admin } = await setup(t);
  assert.equal(
    (await admin.call('/admin/workshops', 'POST', payload({ starts_at: '2099-02-30T12:00:00Z' })))
      .status,
    400,
  );
  assert.equal(
    (await admin.call('/admin/workshops', 'POST', payload({ starts_at: '2099-02-28T12:00:00' })))
      .status,
    400,
  );
});

test('production cookies and headers enforce secure transport', async (t) => {
  const { client } = await setup(t, { production: true });
  const result = await client().init();
  assert.match(result.headers.get('set-cookie'), /; Secure/);
  assert.match(result.headers.get('strict-transport-security'), /max-age=/);
  assert.match(result.headers.get('content-security-policy'), /upgrade-insecure-requests/);
});
