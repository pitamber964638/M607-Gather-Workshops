# Gather

A full-stack web application for a community workshop business in East London. Members discover free sessions, reserve places, manage bookings and review completed experiences. Administrators manage workshops and view booking analytics.


Live application: [https://m607-gather-workshops.onrender.com](https://m607-gather-workshops.onrender.com)


## Run locally

Prerequisites: Node.js 22.13 or newer and npm. SQLite is included in Node.js. No separate database server is needed. Node 22 may print an experimental SQLite warning; this does not prevent the application from running.

```sh
git clone https://github.com/pitamber964638/M607-Gather-Workshops.git
cd M607-Gather-Workshops
npm ci
cp .env.example .env
npm run seed
npm start
```

Open [http://localhost:3000](http://localhost:3000). Use this exact origin for local browser access. `npm run dev` restarts the server when server files change; refresh the browser after frontend edits.

The seed command creates ten fictional workshops, sample reservations, one sample review and local accounts. Eight workshops start in the future relative to the seed date, and two are completed so review and history features can be exercised immediately. Seed data is illustrative and does not represent real events or partnerships with the named venues.

Generated login details are saved to `.local-credentials`, readable only by the local file owner and excluded from Git:

- Administrator: `admin@gather.local`
- Member: `alex@gather.local`

Sign up in the application to create an additional standard user. Signing up never grants administrator permissions. Seeding an existing database preserves its records and does not overwrite passwords. As sample dates pass, create fresh workshops through the admin panel.

## Features

- Sign-up, sign-in, sign-out and persistent server-side sessions.
- Server-enforced administrator and member permissions.
- Search across title, description and venue; filter by category, setting, start date and available places; sort by date or title.
- Detailed workshop pages with local artwork, host, description, venue, dates, duration and availability.
- Reservations for one to four people, with atomic capacity checks and unique booking references.
- Listings refresh availability every 30 seconds; detail pages refresh every 15 seconds. The server checks current availability again inside every booking transaction.
- Personal upcoming, past and cancelled booking history. Members can cancel before the workshop starts.
- Profile updates and password changes. Email changes require the current password. Password changes invalidate other sessions.
- Admin creation, editing, draft publication, cancellation and deletion of workshops, plus searchable booking records.
- Visual analytics for community membership, reservations, reserved places, cancellations, seven-day booking activity and category demand.
- Reviews restricted to members who reserved a place in a workshop that has finished. One review per member per workshop.
- Responsive desktop, tablet and mobile layouts, keyboard controls, labelled fields, focus indicators, reduced-motion support and accessible dialogs.

All workshops are free community events, so there is no shopping cart, payment collection or simulated checkout.

## Configuration

| Variable              | Default                 | Purpose                                                                                           |
| --------------------- | ----------------------- | ------------------------------------------------------------------------------------------------- |
| `HOST`                | `127.0.0.1`             | Interface used by the local server.                                                               |
| `PORT`                | `3000`                  | HTTP port.                                                                                        |
| `APP_ORIGIN`          | `http://localhost:3000` | Exact browser origin accepted for state-changing requests. Change this with the port or hostname. |
| `DATABASE_PATH`       | `./data/gather.sqlite`  | Persistent SQLite database file. Relative paths resolve from the project directory.               |
| `NODE_ENV`            | `development`           | Set to `production` to require HTTPS and enable secure cookies and HSTS.                          |
| `SEED_ADMIN_PASSWORD` | Generated               | Optional password of at least 12 characters for the initial local admin.                          |
| `SEED_USER_PASSWORD`  | Generated               | Optional password of at least 12 characters for the sample member accounts.                       |

Do not commit `.env`, `.local-credentials` or database files. Browser scripts contain no account credentials.

## External services

### Open-Meteo

The server requests `GET https://api.open-meteo.com/v1/forecast` for the venue's latitude and longitude, with `timezone=Europe/London`, `forecast_days=16`, and daily maximum/minimum temperature, precipitation probability and weather code. Outdoor workshop pages show the forecast for their actual London calendar date.

The integration uses an eight-second timeout, a 15-minute cache, deduplication of concurrent requests and a bounded cache of 100 coordinate pairs. During temporary provider failures, a cached result up to one hour old is identified as a recent forecast. Missing, incomplete and out-of-range forecasts receive explicit messages. Weather failure never prevents booking. The provider is attributed in the interface.

The public API needs no key for this educational, noncommercial project. Internet access is required for live forecasts. A commercial launch would need an appropriate Open-Meteo service plan. See the [forecast documentation](https://open-meteo.com/en/docs) and [terms](https://open-meteo.com/en/terms).

### Directions

Workshop pages provide venue addresses and standard Google Maps directions links. These links require no API key or billing account. Open-Meteo is the application's external API integration. No Google Cloud setup is needed.

## Data and implementation

The application uses Express 5, Node.js SQLite, vanilla JavaScript, HTML and CSS. There is no frontend compilation step. Illustrations are local SVG assets with a reproducible generator in `scripts/artwork.js`.

| Table       | Purpose and relationships                                                                                                                                   |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `users`     | Unique case-insensitive email, name, password hash and constrained role.                                                                                    |
| `sessions`  | Hashed session identifier, CSRF token, expiry and optional user foreign key.                                                                                |
| `workshops` | Listing content, category, host, venue coordinates, UTC start time, duration, capacity, setting and publication status.                                     |
| `bookings`  | User and workshop foreign keys, unique reference, seat count, confirmation state and timestamps. A partial unique index prevents duplicate active bookings. |
| `reviews`   | User and workshop foreign keys, rating, comment and timestamp. A composite unique constraint prevents repeat reviews.                                       |

`src/db.js` applies the initial schema and indexes automatically and enables foreign keys, WAL mode and a busy timeout. Database dates are stored in UTC; workshop dates are displayed in London time. The admin form identifies the browser's timezone when entering dates. The date filter uses the start of the selected London calendar day, including daylight-saving changes. The analytics activity chart uses UTC and labels that explicitly. Ongoing bookings are labelled In progress and are counted as completed only after their duration has elapsed.

Capacity checks and booking insertion run within `BEGIN IMMEDIATE` transactions. Cancellation and workshop state changes also run atomically. Deleting a workshop removes it from listings but retains the record for booking history and referential integrity. Future active reservations are cancelled. Completed reservation history remains intact.

- `src/app.js`: HTTP routes, input validation, permissions and business operations.
- `src/security.js`: password hashing, secure tokens and public user serialization.
- `src/weather.js`: provider requests, response validation and caching.
- `src/dates.js`: calendar validation and London date boundaries.
- `public/booking-state.js`: booking lifecycle and live availability comparisons.
- `src/server.js`: environment configuration, server startup and shutdown.
- `public/`: responsive interface and local visual assets.
- `scripts/seed.js`: repeat-safe local sample data and account generation.
- `tests/`: isolated automated API and weather integration tests.

## Security

Passwords are salted and hashed with Node's scrypt. Random session identifiers are hashed before storage and sent in HttpOnly, SameSite cookies. Sign-in rotates the session identifier. Password changes revoke existing sessions. Production cookies use Secure.

Every write requires JSON, an active CSRF token and an allowed Origin when the Origin header is present. General and authentication-specific rate limits restrict abusive requests. SQL values use prepared statements. Client-rendered text is escaped. Helmet supplies a restrictive Content Security Policy and other security headers. Public responses never include password hashes. Permission and ownership checks execute on the server, independently of visible navigation.

## Verification

```sh
npm run verify
```

This checks JavaScript syntax, scans project source for em dashes, and runs the automated test suite. The tests create isolated in-memory databases and temporary local HTTP servers. They do not change the development database. Network access to weather providers is replaced with controlled fixtures for repeatable automated tests.

The suite covers authentication, session rotation, CSRF, origin restrictions, role escalation, ownership, SQL search inputs, filtering, concurrent capacity conflicts, cancellation, admin CRUD, record retention, reviews, profile changes, password invalidation, analytics and weather error states.

For a browser walkthrough:

1. Explore workshops, search for `coffee`, switch categories and combine setting/date filters.
2. Sign in as the member, reserve two places, open My bookings, cancel that reservation and check the Cancelled tab.
3. Open a completed booking in the Past tab and leave a review.
4. Open an outdoor workshop to check its dated live forecast and directions link.
5. Open Account settings and save a profile change. Use Change password to verify current-password validation and session invalidation.
6. Sign in as the administrator, create a draft, publish it, edit its capacity, inspect analytics and booking records, then cancel or delete the new workshop.
7. Repeat the main screens at desktop, tablet and mobile widths and use keyboard navigation through forms and dialogs.

## Production setup

The application is deployed on Render at [https://m607-gather-workshops.onrender.com](https://m607-gather-workshops.onrender.com). The free service may take about one minute to start after a period of inactivity. Its filesystem is temporary, so the seed command recreates demonstration data when Render restarts the service.

1. Install Node.js 22.13 or newer and run `npm ci --omit=dev` in the application directory.
2. Use a persistent disk for `DATABASE_PATH`. Run one application instance with SQLite. Keep the database and its WAL files outside disposable release directories.
3. Configure `NODE_ENV=production`, the exact HTTPS `APP_ORIGIN`, and the intended `HOST` and `PORT`.
4. Place an HTTPS reverse proxy in front of the application and run `npm start` under a process supervisor. The application currently treats the direct connection as the client address; configure trusted proxy handling deliberately before enabling per-client rate limiting behind a proxy. Do not expose the HTTP backend publicly.
5. Bootstrap an administrator with `npm run create-admin`. This command reads `ADMIN_NAME`, `ADMIN_EMAIL` and `ADMIN_PASSWORD` from the environment and does not seed demo content.
6. Check `/api/health`, authentication, booking and external API access after deployment.

Back up SQLite through its backup API or stop the application before copying its database files. Restore a backup to a separate path and verify it before replacing a running database.
