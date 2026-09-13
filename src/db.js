import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export function openDatabase(path) {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec(`
    PRAGMA foreign_keys = ON;
    PRAGMA journal_mode = WAL;
    PRAGMA busy_timeout = 5000;
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE COLLATE NOCASE,
      password_hash TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'user' CHECK(role IN ('user','admin')),
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    );
    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY, user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      csrf TEXT NOT NULL, expires_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS workshops (
      id INTEGER PRIMARY KEY, title TEXT NOT NULL, category TEXT NOT NULL,
      description TEXT NOT NULL, host TEXT NOT NULL, venue TEXT NOT NULL, address TEXT NOT NULL,
      latitude REAL NOT NULL CHECK(latitude BETWEEN -90 AND 90),
      longitude REAL NOT NULL CHECK(longitude BETWEEN -180 AND 180),
      starts_at TEXT NOT NULL, duration_minutes INTEGER NOT NULL CHECK(duration_minutes BETWEEN 30 AND 480),
      capacity INTEGER NOT NULL CHECK(capacity BETWEEN 1 AND 500),
      outdoor INTEGER NOT NULL DEFAULT 0 CHECK(outdoor IN (0,1)),
      status TEXT NOT NULL DEFAULT 'published' CHECK(status IN ('published','draft','cancelled','deleted')),
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    );
    CREATE TABLE IF NOT EXISTS bookings (
      id INTEGER PRIMARY KEY, reference TEXT NOT NULL UNIQUE,
      user_id INTEGER NOT NULL REFERENCES users(id), workshop_id INTEGER NOT NULL REFERENCES workshops(id),
      seats INTEGER NOT NULL CHECK(seats BETWEEN 1 AND 4),
      status TEXT NOT NULL DEFAULT 'confirmed' CHECK(status IN ('confirmed','cancelled')),
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
      cancelled_at TEXT
    );
    CREATE UNIQUE INDEX IF NOT EXISTS one_active_booking ON bookings(user_id,workshop_id) WHERE status='confirmed';
    CREATE INDEX IF NOT EXISTS workshop_bookings ON bookings(workshop_id,status);
    CREATE INDEX IF NOT EXISTS user_bookings ON bookings(user_id,created_at);
    CREATE INDEX IF NOT EXISTS workshop_dates ON workshops(status,starts_at);
    CREATE INDEX IF NOT EXISTS session_expiry ON sessions(expires_at);
    CREATE TABLE IF NOT EXISTS reviews (
      id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id),
      workshop_id INTEGER NOT NULL REFERENCES workshops(id), rating INTEGER NOT NULL CHECK(rating BETWEEN 1 AND 5),
      comment TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
      UNIQUE(user_id,workshop_id)
    );
    PRAGMA user_version = 1;
  `);
  return db;
}

export function transaction(db, operation) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = operation();
    db.exec('COMMIT');
    return result;
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

export const workshopSelect = `SELECT w.*,
  COALESCE((SELECT SUM(b.seats) FROM bookings b WHERE b.workshop_id=w.id AND b.status='confirmed'),0) AS booked_seats,
  (SELECT ROUND(AVG(r.rating),1) FROM reviews r WHERE r.workshop_id=w.id) AS rating,
  (SELECT COUNT(*) FROM reviews r WHERE r.workshop_id=w.id) AS review_count
  FROM workshops w`;
export function workshopById(db, id) {
  return db.prepare(`${workshopSelect} WHERE w.id=?`).get(id);
}
