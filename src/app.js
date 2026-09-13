import express from 'express';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import { transaction, workshopSelect, workshopById } from './db.js';
import { randomToken, digest, hashPassword, verifyPassword, publicUser } from './security.js';
import { createWeatherService } from './weather.js';
import { isCalendarDate, londonDayStart, isZonedTimestamp } from './dates.js';

export const categories = ['Arts & crafts', 'Food & drink', 'Outdoors', 'Wellbeing', 'Photography'];
const fail = (status, message) => Object.assign(new Error(message), { status });
const text = (value, label, min, max) => {
  if (typeof value !== 'string' || value.trim().length < min || value.trim().length > max)
    throw fail(400, `${label} must contain ${min} to ${max} characters.`);
  return value.trim().replaceAll('\u2014', '-');
};
const emailValue = (value) => {
  const result = text(value, 'Email', 5, 254).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(result)) throw fail(400, 'Enter a valid email address.');
  return result;
};
const passwordValue = (value) => {
  if (typeof value !== 'string' || value.length < 12 || value.length > 128)
    throw fail(400, 'Use a password with 12 to 128 characters.');
  return value;
};
const integer = (value, label, min, max) => {
  if (!Number.isInteger(value) || value < min || value > max)
    throw fail(400, `${label} must be a whole number from ${min} to ${max}.`);
  return value;
};
function validateWorkshop(body) {
  const out = {};
  for (const [key, label, min, max] of [
    ['title', 'Title', 5, 100],
    ['description', 'Description', 30, 3000],
    ['host', 'Host', 2, 80],
    ['venue', 'Venue', 2, 100],
    ['address', 'Address', 5, 200],
  ])
    out[key] = text(body[key], label, min, max);
  if (!categories.includes(body.category)) throw fail(400, 'Choose a valid category.');
  out.category = body.category;
  if (!isZonedTimestamp(body.starts_at) || Date.parse(body.starts_at) <= Date.now())
    throw fail(400, 'Choose a future workshop date and time.');
  out.starts_at = new Date(body.starts_at).toISOString();
  out.duration_minutes = integer(body.duration_minutes, 'Duration', 30, 480);
  out.capacity = integer(body.capacity, 'Capacity', 1, 500);
  for (const [key, min, max] of [
    ['latitude', -90, 90],
    ['longitude', -180, 180],
  ]) {
    if (
      typeof body[key] !== 'number' ||
      !Number.isFinite(body[key]) ||
      body[key] < min ||
      body[key] > max
    )
      throw fail(400, `Enter a valid ${key}.`);
    out[key] = body[key];
  }
  if (typeof body.outdoor !== 'boolean') throw fail(400, 'Choose an indoor or outdoor setting.');
  out.outdoor = body.outdoor ? 1 : 0;
  if (!['published', 'draft', 'cancelled'].includes(body.status))
    throw fail(400, 'Choose a valid status.');
  out.status = body.status;
  return out;
}

export function createApp({
  db,
  origin = 'http://localhost:3000',
  production = false,
  weatherFetcher,
  rateLimits = true,
}) {
  const app = express();
  const weather = createWeatherService(weatherFetcher);
  const dummyHash = hashPassword(randomToken());
  app.disable('x-powered-by');
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'"],
          imgSrc: ["'self'", 'data:'],
          frameSrc: ["'none'"],
          connectSrc: ["'self'"],
          upgradeInsecureRequests: production ? [] : null,
        },
      },
      strictTransportSecurity: production ? undefined : false,
    }),
  );
  app.use('/api', (req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });
  if (rateLimits)
    app.use(
      '/api',
      rateLimit({
        windowMs: 60000,
        limit: 240,
        standardHeaders: 'draft-8',
        legacyHeaders: false,
        message: { error: 'Too many requests. Please wait a minute.' },
      }),
    );
  app.use(express.json({ limit: '20kb' }));
  const cookie = (res, token) =>
    res.cookie('gather_session', token, {
      httpOnly: true,
      secure: production,
      sameSite: 'lax',
      path: '/',
      maxAge: 7 * 86400000,
    });
  const newSession = (res, userId = null, oldHash = null) => {
    const token = randomToken(),
      csrf = randomToken(),
      tokenHash = digest(token);
    transaction(db, () => {
      db.prepare('DELETE FROM sessions WHERE expires_at<?').run(Date.now());
      if (oldHash) db.prepare('DELETE FROM sessions WHERE token_hash=?').run(oldHash);
      db.prepare('INSERT INTO sessions(token_hash,user_id,csrf,expires_at) VALUES(?,?,?,?)').run(
        tokenHash,
        userId,
        csrf,
        Date.now() + 7 * 86400000,
      );
    });
    cookie(res, token);
    return {
      csrf,
      user: userId ? publicUser(db.prepare('SELECT * FROM users WHERE id=?').get(userId)) : null,
    };
  };
  app.use('/api', (req, res, next) => {
    const raw = req.headers.cookie
      ?.split(';')
      .map((v) => v.trim())
      .find((v) => v.startsWith('gather_session='))
      ?.slice(15);
    req.sessionHash = raw ? digest(raw) : null;
    req.session = req.sessionHash
      ? db
          .prepare('SELECT * FROM sessions WHERE token_hash=? AND expires_at>?')
          .get(req.sessionHash, Date.now())
      : null;
    req.user = req.session?.user_id
      ? db.prepare('SELECT * FROM users WHERE id=?').get(req.session.user_id)
      : null;
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
      if (req.headers.origin && req.headers.origin !== origin)
        return next(fail(403, 'This request origin is not allowed.'));
      if (!req.is('application/json')) return next(fail(415, 'Send requests as application/json.'));
      if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body))
        return next(fail(400, 'Send a JSON object with the request.'));
      if (!req.session || req.headers['x-csrf-token'] !== req.session.csrf)
        return next(fail(403, 'Your session has expired. Refresh the page and try again.'));
    }
    next();
  });
  const auth = (req, res, next) =>
    req.user ? next() : next(fail(401, 'Please sign in to continue.'));
  const admin = (req, res, next) =>
    req.user?.role === 'admin'
      ? next()
      : next(fail(req.user ? 403 : 401, 'Administrator access is required.'));
  const authLimit = rateLimits
    ? rateLimit({
        windowMs: 15 * 60000,
        limit: 25,
        standardHeaders: 'draft-8',
        legacyHeaders: false,
        message: { error: 'Too many sign-in attempts. Try again in 15 minutes.' },
      })
    : (req, res, next) => next();

  app.get('/api/health', (req, res) => {
    db.prepare('SELECT 1').get();
    res.json({ status: 'ok' });
  });
  app.get('/api/session', (req, res) =>
    res.json({
      ...(req.session ? { csrf: req.session.csrf, user: publicUser(req.user) } : newSession(res)),
      categories,
    }),
  );
  app.post('/api/auth/signup', authLimit, async (req, res) => {
    const name = text(req.body.name, 'Name', 2, 80),
      email = emailValue(req.body.email),
      password = passwordValue(req.body.password);
    const hashed = await hashPassword(password);
    let id;
    try {
      id = Number(
        db
          .prepare('INSERT INTO users(name,email,password_hash) VALUES(?,?,?)')
          .run(name, email, hashed).lastInsertRowid,
      );
    } catch (error) {
      if ([1555, 2067].includes(error.errcode))
        throw fail(409, 'An account with this email already exists.');
      throw error;
    }
    res.status(201).json(newSession(res, id, req.sessionHash));
  });
  app.post('/api/auth/login', authLimit, async (req, res) => {
    const email = emailValue(req.body.email);
    if (
      typeof req.body.password !== 'string' ||
      req.body.password.length < 1 ||
      req.body.password.length > 128
    )
      throw fail(400, 'Enter your password.');
    const user = db.prepare('SELECT * FROM users WHERE email=?').get(email);
    const valid = await verifyPassword(req.body.password, user?.password_hash || (await dummyHash));
    if (
      !user ||
      !valid ||
      db.prepare('SELECT password_hash FROM users WHERE id=?').get(user.id)?.password_hash !==
        user.password_hash
    )
      throw fail(401, 'Email or password is incorrect.');
    res.json(newSession(res, user.id, req.sessionHash));
  });
  app.post('/api/auth/logout', (req, res) => res.json(newSession(res, null, req.sessionHash)));
  app.patch('/api/profile', auth, authLimit, async (req, res) => {
    const name = text(req.body.name, 'Name', 2, 80),
      email = emailValue(req.body.email);
    if (
      email !== req.user.email &&
      (typeof req.body.current_password !== 'string' ||
        req.body.current_password.length > 128 ||
        !(await verifyPassword(req.body.current_password, req.user.password_hash)))
    )
      throw fail(400, 'Enter your current password to change your email.');
    try {
      db.prepare('UPDATE users SET name=?,email=? WHERE id=?').run(name, email, req.user.id);
    } catch (error) {
      if ([1555, 2067].includes(error.errcode)) throw fail(409, 'This email is already in use.');
      throw error;
    }
    res.json({ user: publicUser(db.prepare('SELECT * FROM users WHERE id=?').get(req.user.id)) });
  });
  app.post('/api/profile/password', auth, authLimit, async (req, res) => {
    const nextPassword = passwordValue(req.body.password);
    if (
      typeof req.body.current_password !== 'string' ||
      req.body.current_password.length > 128 ||
      !(await verifyPassword(req.body.current_password, req.user.password_hash))
    )
      throw fail(400, 'Current password is incorrect.');
    const hashed = await hashPassword(nextPassword);
    transaction(db, () => {
      const changed = db
        .prepare('UPDATE users SET password_hash=? WHERE id=? AND password_hash=?')
        .run(hashed, req.user.id, req.user.password_hash);
      if (changed.changes !== 1)
        throw fail(409, 'Your password changed in another session. Sign in again.');
      db.prepare('DELETE FROM sessions WHERE user_id=?').run(req.user.id);
    });
    res.json(newSession(res, req.user.id));
  });

  app.get('/api/workshops', (req, res) => {
    const conditions = ["w.status='published'", 'w.starts_at>?'];
    const values = [new Date().toISOString()];
    if (req.query.q) {
      const q = text(req.query.q, 'Search', 1, 100);
      conditions.push(
        "(w.title LIKE ? ESCAPE '\\' OR w.description LIKE ? ESCAPE '\\' OR w.venue LIKE ? ESCAPE '\\')",
      );
      const pattern = `%${q.replace(/[\\%_]/g, '\\$&')}%`;
      values.push(pattern, pattern, pattern);
    }
    if (req.query.category) {
      if (!categories.includes(req.query.category)) throw fail(400, 'Choose a valid category.');
      conditions.push('w.category=?');
      values.push(req.query.category);
    }
    if (req.query.setting) {
      if (!['indoor', 'outdoor'].includes(req.query.setting))
        throw fail(400, 'Choose a valid setting.');
      conditions.push('w.outdoor=?');
      values.push(req.query.setting === 'outdoor' ? 1 : 0);
    }
    if (req.query.from) {
      if (!isCalendarDate(req.query.from)) throw fail(400, 'Enter a valid date.');
      conditions.push('w.starts_at>=?');
      values.push(londonDayStart(req.query.from));
    }
    if (req.query.available === 'true')
      conditions.push(
        "w.capacity > COALESCE((SELECT SUM(seats) FROM bookings WHERE workshop_id=w.id AND status='confirmed'),0)",
      );
    const sort = req.query.sort === 'title' ? 'w.title COLLATE NOCASE' : 'w.starts_at';
    const workshops = db
      .prepare(`${workshopSelect} WHERE ${conditions.join(' AND ')} ORDER BY ${sort} LIMIT 200`)
      .all(...values);
    res.json({ workshops });
  });
  app.get('/api/workshops/:id', (req, res) => {
    const w = workshopById(db, req.params.id);
    if (!w || (w.status !== 'published' && req.user?.role !== 'admin'))
      throw fail(404, 'Workshop not found.');
    const reviews = db
      .prepare(
        'SELECT r.id,r.rating,r.comment,r.created_at,u.name FROM reviews r JOIN users u ON u.id=r.user_id WHERE workshop_id=? ORDER BY r.created_at DESC LIMIT 50',
      )
      .all(w.id);
    const booking = req.user
      ? db
          .prepare(
            "SELECT * FROM bookings WHERE user_id=? AND workshop_id=? AND status='confirmed'",
          )
          .get(req.user.id, w.id)
      : null;
    res.json({ workshop: w, reviews, booking: booking || null });
  });
  app.get('/api/workshops/:id/weather', async (req, res) => {
    const w = workshopById(db, req.params.id);
    if (!w || w.status !== 'published') throw fail(404, 'Workshop not found.');
    res.json(await weather(w));
  });
  app.post('/api/bookings', auth, (req, res) => {
    const workshopId = integer(req.body.workshop_id, 'Workshop', 1, Number.MAX_SAFE_INTEGER),
      seats = integer(req.body.seats, 'Seats', 1, 4);
    const result = transaction(db, () => {
      const w = workshopById(db, workshopId);
      if (!w || w.status !== 'published' || w.starts_at <= new Date().toISOString())
        throw fail(400, 'This workshop is not available for booking.');
      if (
        db
          .prepare(
            "SELECT id FROM bookings WHERE user_id=? AND workshop_id=? AND status='confirmed'",
          )
          .get(req.user.id, w.id)
      )
        throw fail(409, 'You already have a booking for this workshop.');
      if (w.capacity - w.booked_seats < seats)
        throw fail(
          409,
          'There are not enough seats remaining. Choose fewer seats or another workshop.',
        );
      const reference = `GTH-${randomBytes(6).toString('hex').toUpperCase()}`;
      const id = Number(
        db
          .prepare('INSERT INTO bookings(reference,user_id,workshop_id,seats) VALUES(?,?,?,?)')
          .run(reference, req.user.id, w.id, seats).lastInsertRowid,
      );
      return db.prepare('SELECT * FROM bookings WHERE id=?').get(id);
    });
    res.status(201).json({ booking: result });
  });
  app.get('/api/bookings', auth, (req, res) =>
    res.json({
      bookings: db
        .prepare(
          `SELECT b.*,w.title,w.category,w.venue,w.address,w.starts_at,w.duration_minutes,w.status AS workshop_status,
    (SELECT id FROM reviews r WHERE r.user_id=b.user_id AND r.workshop_id=b.workshop_id) AS review_id
    FROM bookings b JOIN workshops w ON b.workshop_id=w.id WHERE b.user_id=? ORDER BY w.starts_at DESC,b.id DESC`,
        )
        .all(req.user.id),
    }),
  );
  app.post('/api/bookings/:id/cancel', auth, (req, res) => {
    transaction(db, () => {
      const b = db
        .prepare(
          'SELECT b.*,w.starts_at FROM bookings b JOIN workshops w ON b.workshop_id=w.id WHERE b.id=? AND b.user_id=?',
        )
        .get(req.params.id, req.user.id);
      if (!b) throw fail(404, 'Booking not found.');
      if (b.status !== 'confirmed') throw fail(409, 'This booking is already cancelled.');
      if (b.starts_at <= new Date().toISOString())
        throw fail(400, 'Past bookings cannot be cancelled.');
      db.prepare("UPDATE bookings SET status='cancelled',cancelled_at=? WHERE id=?").run(
        new Date().toISOString(),
        b.id,
      );
    });
    res.json({ success: true });
  });
  app.post('/api/workshops/:id/reviews', auth, (req, res) => {
    const rating = integer(req.body.rating, 'Rating', 1, 5),
      comment = text(req.body.comment, 'Review', 10, 1000);
    const w = workshopById(db, req.params.id);
    if (
      !w ||
      w.status !== 'published' ||
      Date.parse(w.starts_at) + w.duration_minutes * 60000 > Date.now()
    )
      throw fail(400, 'You can review a workshop after it has finished.');
    if (
      !db
        .prepare("SELECT id FROM bookings WHERE user_id=? AND workshop_id=? AND status='confirmed'")
        .get(req.user.id, w.id)
    )
      throw fail(403, 'Only attendees with a confirmed booking can review this workshop.');
    try {
      db.prepare('INSERT INTO reviews(user_id,workshop_id,rating,comment) VALUES(?,?,?,?)').run(
        req.user.id,
        w.id,
        rating,
        comment,
      );
    } catch (error) {
      if ([1555, 2067].includes(error.errcode))
        throw fail(409, 'You have already reviewed this workshop.');
      throw error;
    }
    res.status(201).json({ success: true });
  });

  app.get('/api/admin/workshops', admin, (req, res) =>
    res.json({
      workshops: db
        .prepare(`${workshopSelect} WHERE w.status!='deleted' ORDER BY w.starts_at DESC`)
        .all(),
    }),
  );
  app.post('/api/admin/workshops', admin, (req, res) => {
    const w = validateWorkshop(req.body),
      keys = Object.keys(w);
    const id = Number(
      db
        .prepare(
          `INSERT INTO workshops(${keys.join(',')}) VALUES(${keys.map(() => '?').join(',')})`,
        )
        .run(...Object.values(w)).lastInsertRowid,
    );
    res.status(201).json({ workshop: workshopById(db, id) });
  });
  app.patch('/api/admin/workshops/:id', admin, (req, res) => {
    const w = validateWorkshop(req.body);
    transaction(db, () => {
      const old = workshopById(db, req.params.id);
      if (!old || old.status === 'deleted') throw fail(404, 'Workshop not found.');
      if (old.starts_at <= new Date().toISOString())
        throw fail(400, 'Completed workshops cannot be edited.');
      if (w.capacity < old.booked_seats)
        throw fail(409, 'Capacity cannot be lower than the number of reserved seats.');
      if (w.status === 'draft' && old.booked_seats > 0)
        throw fail(409, 'A workshop with bookings cannot become a draft. Cancel it instead.');
      db.prepare(
        `UPDATE workshops SET ${Object.keys(w)
          .map((k) => `${k}=?`)
          .join(',')} WHERE id=?`,
      ).run(...Object.values(w), old.id);
      if (w.status === 'cancelled')
        db.prepare(
          "UPDATE bookings SET status='cancelled',cancelled_at=? WHERE workshop_id=? AND status='confirmed'",
        ).run(new Date().toISOString(), old.id);
    });
    res.json({ workshop: workshopById(db, req.params.id) });
  });
  app.delete('/api/admin/workshops/:id', admin, (req, res) => {
    transaction(db, () => {
      const w = workshopById(db, req.params.id);
      if (!w || w.status === 'deleted') throw fail(404, 'Workshop not found.');
      db.prepare("UPDATE workshops SET status='deleted' WHERE id=?").run(w.id);
      if (w.starts_at > new Date().toISOString())
        db.prepare(
          "UPDATE bookings SET status='cancelled',cancelled_at=? WHERE workshop_id=? AND status='confirmed'",
        ).run(new Date().toISOString(), w.id);
    });
    res.json({ success: true });
  });
  app.get('/api/admin/bookings', admin, (req, res) =>
    res.json({
      bookings: db
        .prepare(
          `SELECT b.*,u.name,u.email,w.title,w.starts_at FROM bookings b JOIN users u ON b.user_id=u.id JOIN workshops w ON b.workshop_id=w.id ORDER BY b.created_at DESC LIMIT 500`,
        )
        .all(),
    }),
  );
  app.get('/api/admin/analytics', admin, (req, res) => {
    const now = new Date().toISOString();
    const metrics = {
      users: db.prepare("SELECT COUNT(*) AS n FROM users WHERE role='user'").get().n,
      upcoming: db
        .prepare("SELECT COUNT(*) AS n FROM workshops WHERE status='published' AND starts_at>?")
        .get(now).n,
      bookings: db.prepare("SELECT COUNT(*) AS n FROM bookings WHERE status='confirmed'").get().n,
      seats: db
        .prepare("SELECT COALESCE(SUM(seats),0) AS n FROM bookings WHERE status='confirmed'")
        .get().n,
      cancelled: db.prepare("SELECT COUNT(*) AS n FROM bookings WHERE status='cancelled'").get().n,
    };
    const byCategory = db
      .prepare(
        `SELECT w.category,COALESCE(SUM(b.seats),0) AS seats FROM workshops w LEFT JOIN bookings b ON b.workshop_id=w.id AND b.status='confirmed' GROUP BY w.category ORDER BY seats DESC`,
      )
      .all();
    const activity = db
      .prepare(
        `WITH RECURSIVE days(day) AS (SELECT date('now','-6 days') UNION ALL SELECT date(day,'+1 day') FROM days WHERE day<date('now')) SELECT days.day,COUNT(b.id) AS bookings FROM days LEFT JOIN bookings b ON date(b.created_at)=days.day GROUP BY days.day ORDER BY days.day`,
      )
      .all();
    res.json({ metrics, by_category: byCategory, activity });
  });
  app.use('/api', (req, res, next) => next(fail(404, 'API endpoint not found.')));
  const publicDir = fileURLToPath(new URL('../public/', import.meta.url));
  app.use(express.static(publicDir, { maxAge: production ? '1h' : 0 }));
  app.get('/{*path}', (req, res) => res.sendFile(`${publicDir}/index.html`));
  app.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    const status = error.status || (error.type === 'entity.parse.failed' ? 400 : 500);
    if (status >= 500) console.error('Request failed:', error.message);
    res.status(status).json({
      error:
        status >= 500
          ? 'Something went wrong. Please try again.'
          : error.type === 'entity.parse.failed'
            ? 'Invalid JSON request.'
            : error.message,
    });
  });
  return app;
}
