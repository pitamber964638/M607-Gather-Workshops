import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { openDatabase, transaction } from '../src/db.js';

test('database records survive reopening and schema setup is repeat-safe', (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'gather-db-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const path = join(dir, 'test.sqlite');
  let db = openDatabase(path);
  db.prepare('INSERT INTO users(name,email,password_hash) VALUES(?,?,?)').run(
    'Persistent User',
    'persistent@example.test',
    'hash',
  );
  db.close();
  db = openDatabase(path);
  assert.equal(db.prepare('SELECT name FROM users').get().name, 'Persistent User');
  assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check, 'ok');
  assert.equal(db.prepare('PRAGMA user_version').get().user_version, 1);
  db.close();
});
test('failed transactions roll back all intermediate changes', () => {
  const db = openDatabase(':memory:');
  assert.throws(() =>
    transaction(db, () => {
      db.prepare('INSERT INTO users(name,email,password_hash) VALUES(?,?,?)').run(
        'Rollback User',
        'rollback@example.test',
        'hash',
      );
      throw new Error('Abort');
    }),
  );
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM users').get().n, 0);
  db.close();
});
test('admin bootstrap creates only the requested admin and never elevates an existing account', (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'gather-admin-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const path = join(dir, 'test.sqlite');
  const options = {
    encoding: 'utf8',
    env: {
      ...process.env,
      DATABASE_PATH: path,
      ADMIN_NAME: 'Initial Admin',
      ADMIN_EMAIL: 'initial@example.test',
      ADMIN_PASSWORD: 'A long admin test phrase',
    },
  };
  const first = spawnSync(process.execPath, ['scripts/create-admin.js'], options);
  assert.equal(first.status, 0, first.stderr);
  const second = spawnSync(process.execPath, ['scripts/create-admin.js'], options);
  assert.equal(second.status, 1);
  const db = openDatabase(path);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM users').get().n, 1);
  assert.equal(db.prepare('SELECT role FROM users').get().role, 'admin');
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM workshops').get().n, 0);
  db.close();
});
