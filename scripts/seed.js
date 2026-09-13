import { openDatabase, transaction } from '../src/db.js';
import { hashPassword } from '../src/security.js';
import { randomBytes } from 'node:crypto';
import { writeFileSync } from 'node:fs';
const db = openDatabase(process.env.DATABASE_PATH || './data/gather.sqlite');
if (
  db.prepare('SELECT COUNT(*) AS n FROM users').get().n ||
  db.prepare('SELECT COUNT(*) AS n FROM workshops').get().n
) {
  console.log('Database already contains data. Seed skipped to preserve existing records.');
  db.close();
  process.exit(0);
}
const adminPassword =
  process.env.SEED_ADMIN_PASSWORD || `Gather-${randomBytes(12).toString('base64url')}`;
const userPassword =
  process.env.SEED_USER_PASSWORD || `Gather-${randomBytes(12).toString('base64url')}`;
if (adminPassword.length < 12 || userPassword.length < 12)
  throw new Error('Seed passwords must contain at least 12 characters.');
const adminHash = await hashPassword(adminPassword),
  userHash = await hashPassword(userPassword);
const workshops = [
  [
    'A little clay, a lot of possibility',
    'Arts & crafts',
    'Slow down and make something with your hands. Learn pinch-pot and hand-building techniques, then create your own ceramic bowl with guidance from a local maker. All clay, tools and firing are included. Wear clothes you do not mind getting a little messy. No experience needed.',
    'Emma Clarke',
    'The Clay Room',
    'Rich Mix, 35-47 Bethnal Green Road, London E1 6LA',
    51.5244,
    -0.0736,
    16,
    120,
    16,
    0,
  ],
  [
    'From bean to a better brew',
    'Food & drink',
    'Discover what makes a great cup of coffee. Compare beans, practise a pour-over and explore how grind size changes flavour. You will taste three coffees and leave with an easy brewing routine to use at home. All equipment is provided. Please tell your host about any dietary needs on arrival.',
    'Oliver James',
    'The Kitchen Table',
    'Round Chapel, 1D Glenarm Road, London E5 0LY',
    51.5507,
    -0.0545,
    13,
    90,
    12,
    0,
  ],
  [
    'Find your calm in the park',
    'Wellbeing',
    'Take a gentle pause with an outdoor movement and breathing session. Begin with an accessible stretch, explore simple mindfulness exercises and finish with a guided relaxation. Bring a mat, water and a light layer. The group meets at the main park entrance. In heavy rain, your host will contact attendees at the venue.',
    'Maya Patel',
    'Victoria Park',
    'Victoria Park, Grove Road, London E3 5TB',
    51.5366,
    -0.038,
    12,
    60,
    20,
    1,
  ],
  [
    'See your city in a new light',
    'Photography',
    'Explore the streets with a photographer and learn to notice light, colour and everyday details. Practise composition through small creative prompts and share your favourite shot with the group. A phone camera is all you need. Bring comfortable shoes and a charged device.',
    'Theo Williams',
    'Columbia Road',
    'Columbia Road Flower Market, London E2 7RG',
    51.5298,
    -0.069,
    14,
    120,
    14,
    1,
  ],
  [
    'Grow a greener windowsill',
    'Outdoors',
    'Get your hands in the soil and start a little garden of your own. Learn to choose herbs, repot seedlings and care for plants in small spaces. You will take home a planted pot and a simple care guide. Tools and materials are included. Bring a bag for your new plant.',
    'Sophie Green',
    'The Community Garden',
    'Hackney City Farm, 1A Goldsmiths Row, London E2 8QA',
    51.5312,
    -0.0661,
    15,
    90,
    18,
    1,
  ],
  [
    'The art of a slower afternoon',
    'Arts & crafts',
    'An easygoing introduction to watercolour. Experiment with colour mixing and simple botanical shapes before making a small painting to take home. Your host will demonstrate each technique and help you find your own style. Paper, brushes and paints are provided. Beginners are very welcome.',
    'Emma Clarke',
    'The Makers Studio',
    'Rich Mix, 35-47 Bethnal Green Road, London E1 6LA',
    51.5244,
    -0.0736,
    18,
    120,
    16,
    0,
  ],
  [
    'Fresh pasta, good company',
    'Food & drink',
    'Make fresh pasta from scratch in a friendly shared kitchen. Learn to mix and knead dough, shape it by hand and pair it with a simple seasonal sauce. The session includes a shared tasting. Contains wheat and eggs. Aprons and ingredients are provided.',
    'Oliver James',
    'The Kitchen Table',
    'Round Chapel, 1D Glenarm Road, London E5 0LY',
    51.5507,
    -0.0545,
    17,
    150,
    10,
    0,
  ],
  [
    'A mindful walk through nature',
    'Outdoors',
    'Reconnect with the outdoors on a gentle guided walk. Learn to identify a few common plants, take time to observe the changing seasons and enjoy an unhurried conversation with neighbours. The route is approximately two kilometres on park paths. Wear suitable shoes and bring water.',
    'Sophie Green',
    'Victoria Park',
    'Victoria Park, Grove Road, London E3 5TB',
    51.5366,
    -0.038,
    13,
    90,
    20,
    1,
  ],
  [
    'Your first watercolour postcard',
    'Arts & crafts',
    'Explore simple washes and colour blending in this friendly introduction to watercolour. Make a postcard inspired by local plants, practise with a small group and leave with new skills. All materials are supplied and beginners are welcome.',
    'Emma Clarke',
    'The Makers Studio',
    'Rich Mix, 35-47 Bethnal Green Road, London E1 6LA',
    51.5244,
    -0.0736,
    -4,
    90,
    16,
    0,
  ],
  [
    'Evening light photo walk',
    'Photography',
    'Walk through the neighbourhood with a local photographer and discover ways to capture the evening light. Practise framing, contrast and visual storytelling with your phone or camera. Comfortable shoes are recommended. All levels are welcome.',
    'Theo Williams',
    'Columbia Road',
    'Columbia Road Flower Market, London E2 7RG',
    51.5298,
    -0.069,
    -8,
    90,
    14,
    1,
  ],
];
transaction(db, () => {
  db.prepare("INSERT INTO users(name,email,password_hash,role) VALUES(?,?,?,'admin')").run(
    'Gather Admin',
    'admin@gather.local',
    adminHash,
  );
  db.prepare('INSERT INTO users(name,email,password_hash) VALUES(?,?,?)').run(
    'Alex Morgan',
    'alex@gather.local',
    userHash,
  );
  for (const name of ['Jamie Lee', 'Sam Taylor', 'Robin Ellis'])
    db.prepare('INSERT INTO users(name,email,password_hash) VALUES(?,?,?)').run(
      name,
      `${name.split(' ')[0].toLowerCase()}@example.test`,
      userHash,
    );
  const insert = db.prepare(
    'INSERT INTO workshops(title,category,description,host,venue,address,latitude,longitude,starts_at,duration_minutes,capacity,outdoor) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)',
  );
  for (const [
    title,
    category,
    description,
    host,
    venue,
    address,
    lat,
    lon,
    days,
    duration,
    capacity,
    outdoor,
  ] of workshops) {
    const date = new Date();
    date.setUTCDate(date.getUTCDate() + days);
    date.setUTCHours(13, 0, 0, 0);
    insert.run(
      title,
      category,
      description,
      host,
      venue,
      address,
      lat,
      lon,
      date.toISOString(),
      duration,
      capacity,
      outdoor,
    );
  }
  const booking = db.prepare(
    'INSERT INTO bookings(reference,user_id,workshop_id,seats,created_at) VALUES(?,?,?,?,?)',
  );
  let n = 1;
  for (const [user, workshop, seats, ago] of [
    [2, 3, 1, 0],
    [2, 9, 1, 6],
    [2, 10, 1, 10],
    [3, 1, 2, 1],
    [4, 1, 2, 2],
    [5, 1, 1, 3],
    [3, 2, 2, 0],
    [4, 4, 2, 4],
    [5, 5, 3, 5],
    [3, 9, 1, 6],
  ]) {
    booking.run(
      `GTH-DEMO${String(n++).padStart(4, '0')}`,
      user,
      workshop,
      seats,
      new Date(Date.now() - ago * 86400000).toISOString(),
    );
  }
  db.prepare('INSERT INTO reviews(user_id,workshop_id,rating,comment) VALUES(?,?,?,?)').run(
    3,
    9,
    5,
    'A lovely, relaxed afternoon. Emma explained everything clearly and made it easy to try something new.',
  );
});
writeFileSync(
  '.local-credentials',
  `Local development accounts\n\nAdmin email: admin@gather.local\nAdmin password: ${adminPassword}\n\nMember email: alex@gather.local\nMember password: ${userPassword}\n`,
  { mode: 0o600 },
);
console.log(
  'Seeded 10 workshops, sample bookings, and local accounts. Credentials are in .local-credentials (excluded from Git).',
);
db.close();
