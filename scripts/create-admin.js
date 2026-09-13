import { openDatabase } from '../src/db.js';
import { hashPassword } from '../src/security.js';
const name = process.env.ADMIN_NAME?.trim();
const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
const password = process.env.ADMIN_PASSWORD;
if (
  !name ||
  name.length < 2 ||
  name.length > 80 ||
  !email ||
  email.length > 254 ||
  !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
  !password ||
  password.length < 12 ||
  password.length > 128
) {
  console.error(
    'Set ADMIN_NAME, ADMIN_EMAIL and ADMIN_PASSWORD (12 to 128 characters) in the environment.',
  );
  process.exit(1);
}
const db = openDatabase(process.env.DATABASE_PATH || './data/gather.sqlite');
try {
  const hash = await hashPassword(password);
  db.prepare("INSERT INTO users(name,email,password_hash,role) VALUES(?,?,?,'admin')").run(
    name,
    email,
    hash,
  );
  console.log('Administrator created.');
} catch (error) {
  console.error(
    [1555, 2067].includes(error.errcode)
      ? 'An account with this email already exists. No permissions were changed.'
      : error.message,
  );
  process.exitCode = 1;
} finally {
  db.close();
}
