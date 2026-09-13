import { bookingStage, reservationChanged } from './booking-state.js';
const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const main = $('#main');
const dialog = $('#dialog');
let session = { user: null, csrf: '' },
  categories = [],
  routeVersion = 0,
  availabilityTimer;
const escape = (value) =>
  String(value ?? '').replace(
    /[&<>"']/g,
    (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch],
  );
const art = (category) =>
  ({
    'Arts & crafts': 'clay',
    'Food & drink': 'coffee',
    Wellbeing: 'wellbeing',
    Photography: 'photography',
    Outdoors: 'garden',
  })[category] || 'clay';
const icon = (name, size = 20) => {
  const paths = {
    arrow: 'M4 12h16m-6-6 6 6-6 6',
    search: 'm21 21-5-5M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16',
    pin: 'M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0ZM15 10a3 3 0 1 1-6 0 3 3 0 0 1 6 0',
    calendar: 'M4 5h16v16H4zM8 2v6M16 2v6M4 11h16',
    clock: 'M12 8v5l3 2M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0',
    people:
      'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M13 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0M17 3a4 4 0 0 1 0 8M22 21v-2a4 4 0 0 0-3-3.87',
    check: 'm5 12 4 4L19 6',
    close: 'm6 6 12 12M6 18 18 6',
    leaf: 'M20 3C4 2 1 11 7 17s15 3 13-14ZM4 21 16 9',
    sun: 'M12 1v2M12 21v2M1 12h2M21 12h2M4 4l2 2M18 18l2 2M4 20l2-2M18 6l2-2M17 12a5 5 0 1 1-10 0 5 5 0 0 1 10 0',
    plus: 'M12 5v14M5 12h14',
    edit: 'm15 5 4 4M4 20l5-1L21 7l-4-4L5 15Z',
    trash: 'M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7',
    chart: 'M4 20h17M7 16v-5M12 16V4M17 16V8',
    logout: 'M9 4H4v16h5M9 12h12m-4-4 4 4-4 4',
    ticket: 'M3 5h18v5a2 2 0 0 0 0 4v5H3v-5a2 2 0 0 0 0-4ZM15 5v3M15 11v2M15 16v3',
  };
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${paths[name] || paths.arrow}"/></svg>`;
};
const date = (value, options = {}) =>
  new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/London',
    day: 'numeric',
    month: 'short',
    ...options,
  }).format(new Date(value));
const time = (value) =>
  date(value, { day: undefined, month: undefined, hour: '2-digit', minute: '2-digit' });
const fullDate = (value) => date(value, { weekday: 'long', year: 'numeric' });
const duration = (minutes) =>
  minutes % 60
    ? `${Math.floor(minutes / 60) ? `${Math.floor(minutes / 60)} hr ` : ''}${minutes % 60} min`
    : `${minutes / 60} hr`;
const remaining = (w) => Math.max(0, w.capacity - w.booked_seats);

async function api(path, options = {}) {
  const response = await fetch(`/api${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'X-CSRF-Token': session.csrf,
      ...options.headers,
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  const data = await response.json();
  if (!response.ok) {
    const error = new Error(data.error || 'Unable to complete your request.');
    error.status = response.status;
    throw error;
  }
  return data;
}
function toast(message) {
  const el = $('#toast');
  el.textContent = message;
  el.classList.add('visible');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => el.classList.remove('visible'), 5000);
}
function navigate(path) {
  history.pushState({}, '', path);
  render();
  window.scrollTo(0, 0);
}
function header() {
  const user = session.user,
    path = location.pathname;
  $('#header').innerHTML =
    `<div class="nav-shell"><a href="/" class="brand" data-link aria-label="Gather home">gather<span class="brand-star">✳</span></a><nav aria-label="Main navigation"><a href="/" data-link class="nav-link ${path === '/' ? 'active' : ''}">Explore workshops</a>${user ? `<a href="/dashboard" data-link class="nav-link ${path === '/dashboard' ? 'active' : ''}">My bookings</a>${user.role === 'admin' ? `<a href="/admin" data-link class="nav-link ${path === '/admin' ? 'active' : ''}">Admin</a>` : ''}` : `<a href="/#how-it-works" class="nav-link how-link">How it works</a>`}</nav><div class="nav-account">${user ? `<a class="avatar-link" href="/account" data-link aria-label="Account settings for ${escape(user.name)}"><span class="avatar">${escape(user.name[0].toUpperCase())}</span><span class="account-name">${escape(user.name.split(' ')[0])}</span></a><button class="icon-button" id="logout" aria-label="Sign out">${icon('logout')}</button>` : `<a class="login-link" href="/login" data-link>Sign in</a><a class="button small" href="/signup" data-link>Join the community ${icon('arrow', 16)}</a>`}</div></div>`;
  $('#logout')?.addEventListener('click', async () => {
    try {
      session = await api('/auth/logout', { method: 'POST', body: {} });
      navigate('/');
      toast('You have signed out.');
    } catch (e) {
      toast(e.message);
    }
  });
}
function formError(form, message) {
  const el = $('.form-error', form);
  el.textContent = message;
  el.hidden = false;
  el.scrollIntoView({ block: 'nearest' });
}
function bindForm(id, handler) {
  const form = $(id);
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const button = $('button[type=submit]', form),
      previous = button.innerHTML;
    button.disabled = true;
    button.textContent = 'Please wait...';
    $('.form-error', form).hidden = true;
    try {
      await handler(Object.fromEntries(new FormData(form)), form);
    } catch (error) {
      formError(form, error.message);
    } finally {
      if (button.isConnected) {
        button.disabled = false;
        button.innerHTML = previous;
      }
    }
  });
}
function showDialog(content) {
  dialog.innerHTML = `<button class="dialog-close icon-button" aria-label="Close dialog">${icon('close')}</button>${content}`;
  $('.dialog-close', dialog).onclick = () => dialog.close();
  dialog.showModal();
}
dialog.addEventListener('click', (e) => {
  if (e.target === dialog) {
    const rect = dialog.getBoundingClientRect();
    if (
      e.clientX < rect.left ||
      e.clientX > rect.right ||
      e.clientY < rect.top ||
      e.clientY > rect.bottom
    )
      dialog.close();
  }
});
function confirmAction(title, description, label, action) {
  showDialog(
    `<div class="dialog-body"><span class="eyebrow">Before you continue</span><h2 id="dialog-title">${escape(title)}</h2><p>${escape(description)}</p><p class="form-error" role="alert" hidden></p><div class="button-row"><button class="button secondary" id="keep">Keep it</button><button class="button danger" id="confirm">${escape(label)}</button></div></div>`,
  );
  $('#keep').onclick = () => dialog.close();
  $('#confirm').onclick = async () => {
    $('#confirm').disabled = true;
    try {
      await action();
      dialog.close();
    } catch (e) {
      $('.form-error', dialog).hidden = false;
      $('.form-error', dialog).textContent = e.message;
      $('#confirm').disabled = false;
    }
  };
}
function workshopCard(w) {
  const seats = remaining(w);
  return `<article class="workshop-card"><a class="card-image-link" href="/workshops/${w.id}" data-link tabindex="-1" aria-hidden="true"><img src="/assets/${art(w.category)}.svg" alt="" loading="lazy" width="800" height="520"><span class="image-badge">${w.outdoor ? `${icon('leaf', 14)} Outdoors` : 'All materials included'}</span><span class="date-tile"><b>${date(w.starts_at, { month: undefined })}</b><span>${date(w.starts_at, { day: undefined })}</span></span></a><div class="card-content"><div class="card-topline"><span class="category-label">${escape(w.category)}</span><span class="free-label">Free</span></div><h3><a href="/workshops/${w.id}" data-link>${escape(w.title)}</a></h3><p class="card-meta">${icon('pin', 16)} ${escape(w.venue)}</p><p class="card-meta">${icon('clock', 16)} ${date(w.starts_at, { weekday: 'short' })} · ${time(w.starts_at)} · ${duration(w.duration_minutes)}</p><div class="card-bottom"><span class="seat-label ${seats <= 4 ? 'low' : ''}"><i></i>${seats ? `${seats} spots left` : 'Fully booked'}</span><a href="/workshops/${w.id}" data-link class="text-link" aria-label="View ${escape(w.title)}">View workshop ${icon('arrow', 17)}</a></div></div></article>`;
}
async function explore(version) {
  main.innerHTML = `<div class="page-width"><section class="hero"><div class="hero-copy"><span class="eyebrow"><span class="tiny-spark">✳</span> A little closer to your community</span><h1>Make time for<br>something <em>good.</em></h1><p>Try a new skill. Meet a new face. Discover free,<br class="desktop-break"> small-group workshops right in your neighbourhood.</p><a href="#workshops" class="button">Find your next thing ${icon('arrow')}</a><div class="hero-note"><span class="mini-avatars"><i>J</i><i>S</i><i>M</i></span><span>Open to everyone.<br><strong>Beginners especially welcome.</strong></span></div></div><div class="hero-art"><img src="/assets/clay.svg" alt="Illustration of a handmade terracotta bowl and pottery tools" width="800" height="520"><span class="hero-sticker">Less scrolling.<br><em>More making.</em><span>✳</span></span><div class="hero-caption"><span>${icon('people')} Good things happen together.</span><span>01 / A moment to make</span></div></div></section><div class="values-strip"><span>${icon('ticket')} Always free to join</span><span>${icon('people')} Small groups, real connections</span><span>${icon('leaf')} Local hosts, lovely spaces</span></div><section id="workshops" class="explore-section"><div class="section-heading"><div><span class="eyebrow">Your next good thing</span><h2>Find a workshop. Find your people.</h2></div><span class="location-label">${icon('pin', 17)} East London, UK</span></div><form id="filters" class="filters" role="search"><div class="search-field">${icon('search')}<input aria-label="Search workshops" name="q" placeholder="Try pottery, coffee, photography..."></div><label class="filter-select"><span class="sr-only">Setting</span><select name="setting"><option value="">Any setting</option><option value="indoor">Indoors</option><option value="outdoor">Outdoors</option></select></label><label class="filter-date"><span>From</span><input type="date" name="from" aria-label="Workshops from date"></label><button type="submit" class="button">Search</button></form><div class="category-filters" role="group" aria-label="Workshop categories"><button class="chip selected" data-category="" aria-pressed="true">All workshops</button>${categories.map((c) => `<button class="chip" data-category="${escape(c)}" aria-pressed="false">${escape(c)}</button>`).join('')}</div><div class="results-toolbar"><span id="result-count" role="status">Finding workshops...</span><div><label class="check-label"><input id="available" type="checkbox"> Available spots only</label><label class="sort-label">Sort by <select id="sort"><option value="date">Soonest first</option><option value="title">Name A to Z</option></select></label></div></div><div id="workshop-grid" class="workshop-grid"><div class="loading">Loading workshops...</div></div></section><section id="how-it-works" class="how-section"><div><span class="eyebrow">A little curiosity is all you need</span><h2>Show up as you are.<br>Leave with something new.</h2></div><div class="how-step"><span>01</span><h3>Find your thing</h3><p>Follow your curiosity. Every workshop is free and open to beginners.</p></div><div class="how-step"><span>02</span><h3>Save yourself a spot</h3><p>Join the community and reserve up to four places for you and your friends.</p></div><div class="how-step"><span>03</span><h3>Come along</h3><p>Meet your local host, learn a little and enjoy some good company.</p></div></section></div>`;
  const params = new URLSearchParams(location.search);
  let category = params.get('category') || '',
    loadVersion = 0;
  for (const key of ['q', 'setting', 'from'])
    $('#filters').elements[key].value = params.get(key) || '';
  $('#available').checked = params.get('available') === 'true';
  $('#sort').value = params.get('sort') || 'date';
  const updateChips = () =>
    $$('.chip').forEach((b) => {
      b.classList.toggle('selected', b.dataset.category === category);
      b.setAttribute('aria-pressed', String(b.dataset.category === category));
    });
  updateChips();
  const load = async (updateUrl = true) => {
    const currentLoad = ++loadVersion;
    const query = new URLSearchParams(new FormData($('#filters')));
    if (category) query.set('category', category);
    if ($('#available').checked) query.set('available', 'true');
    query.set('sort', $('#sort').value);
    for (const [key, value] of [...query])
      if (!value || (key === 'sort' && value === 'date')) query.delete(key);
    if (updateUrl) history.replaceState({}, '', `/${query.size ? `?${query}` : ''}`);
    $('#workshop-grid').setAttribute('aria-busy', 'true');
    try {
      const { workshops } = await api(`/workshops?${query}`);
      if (routeVersion !== version || currentLoad !== loadVersion) return;
      $('#result-count').textContent =
        `${workshops.length} workshop${workshops.length === 1 ? '' : 's'} to look forward to`;
      $('#workshop-grid').innerHTML = workshops.length
        ? workshops.map(workshopCard).join('')
        : `<div class="empty-state"><span class="empty-icon">${icon('search', 32)}</span><h3>No workshops found</h3><p>Try a different search, date or category.</p><button id="clear-filters" class="button secondary">Clear filters</button></div>`;
      $('#clear-filters')?.addEventListener('click', () => {
        $('#filters').reset();
        $('#available').checked = false;
        $('#sort').value = 'date';
        category = '';
        updateChips();
        load();
      });
    } catch (e) {
      if (routeVersion === version)
        $('#workshop-grid').innerHTML =
          `<div class="empty-state"><h3>We could not load workshops</h3><p>${escape(e.message)}</p><button class="button secondary" id="retry">Try again</button></div>`;
      $('#retry')?.addEventListener('click', () => load());
    } finally {
      if (routeVersion === version) $('#workshop-grid').removeAttribute('aria-busy');
    }
  };
  $('#filters').onsubmit = (e) => {
    e.preventDefault();
    load();
  };
  $$('.chip').forEach(
    (b) =>
      (b.onclick = () => {
        category = b.dataset.category;
        updateChips();
        load();
      }),
  );
  $('#available').onchange = () => load();
  $('#sort').onchange = () => load();
  await load(false);
  if (routeVersion !== version) return;
  availabilityTimer = setInterval(() => {
    if (!document.hidden) load(false);
  }, 30000);
  if (location.hash) document.getElementById(location.hash.slice(1))?.scrollIntoView();
}
async function detail(id, version) {
  const data = await api(`/workshops/${id}`);
  if (routeVersion !== version) return;
  const w = data.workshop;
  document.title = `${w.title} | Gather`;
  main.innerHTML = `<div class="page-width detail-page"><a href="/" data-link class="back-link">← All workshops</a><div class="detail-grid"><div><div class="detail-image"><img src="/assets/${art(w.category)}.svg" alt="${escape(w.category)} workshop illustration" width="800" height="520"><span class="image-badge">${w.outdoor ? 'An outdoor experience' : 'All materials included'}</span></div><div class="detail-heading"><span class="eyebrow">${escape(w.category)} · ${w.outdoor ? 'Outdoors' : 'Indoors'}</span><h1>${escape(w.title)}</h1><div class="host"><span class="avatar">${escape(w.host[0])}</span><span>Hosted by <strong>${escape(w.host)}</strong><small>Your local workshop host</small></span></div></div><section class="detail-section"><h2>A little about this workshop</h2><p class="description">${escape(w.description)}</p></section><section class="detail-section"><h2>Where we will meet</h2><p><strong>${escape(w.venue)}</strong><br>${escape(w.address)}</p><a class="text-link" href="https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(w.address)}" target="_blank" rel="noopener noreferrer">Get directions on Google Maps ${icon('arrow', 17)}</a></section>${w.outdoor ? `<section class="weather-panel" aria-label="Workshop weather forecast"><div class="section-heading"><h2>${icon('sun', 24)} A look at the weather</h2><a href="https://open-meteo.com/" target="_blank" rel="noopener noreferrer">Open-Meteo</a></div><div id="weather" role="status">Checking the forecast for your workshop...</div></section>` : ''}<section class="detail-section"><div class="section-heading"><h2>Words from the community</h2><span>${w.review_count ? `★ ${w.rating} · ${w.review_count} review${w.review_count === 1 ? '' : 's'}` : 'A new experience'}</span></div>${data.reviews.length ? data.reviews.map((r) => `<article class="review"><div><strong>${escape(r.name)}</strong><span aria-label="${r.rating} out of 5 stars">${'★'.repeat(r.rating)}${'☆'.repeat(5 - r.rating)}</span></div><p>${escape(r.comment)}</p><small>${date(r.created_at, { year: 'numeric' })}</small></article>`).join('') : '<p class="muted">Reviews appear here after attendees have joined the workshop.</p>'}</section></div><aside class="booking-panel"><span class="eyebrow">Make a little time for you</span><div class="price">Free<span>All good things, no cost.</span></div><div class="booking-facts"><div>${icon('calendar')}<span><strong>${fullDate(w.starts_at)}</strong><small>${time(w.starts_at)} (London time)</small></span></div><div>${icon('clock')}<span>${duration(w.duration_minutes)} of something good</span></div><div>${icon('pin')}<span>${escape(w.venue)}</span></div><div>${icon('people')}<span>Small group · ${w.capacity} people max</span></div></div><div id="reservation-area"></div><p class="booking-note">${icon('check', 16)} Free cancellation before the workshop</p><p class="booking-note">${icon('check', 16)} Everyone welcome, no experience needed</p></aside></div></div>`;
  const reservation = (workshop, booking) => {
    const area = $('#reservation-area');
    if (!area) return;
    if (Date.parse(workshop.starts_at) <= Date.now() || workshop.status !== 'published')
      area.innerHTML = '<p class="notice">This workshop is no longer accepting bookings.</p>';
    else if (booking)
      area.innerHTML = `<div class="booking-confirmed">${icon('check', 24)}<strong>You are on the list!</strong><p>${booking.seats} place${booking.seats > 1 ? 's' : ''} reserved</p><small>${escape(booking.reference)}</small></div><a class="button full" href="/dashboard" data-link>View my bookings ${icon('arrow')}</a>`;
    else if (!remaining(workshop))
      area.innerHTML =
        '<p class="notice">This workshop is fully booked. Check back for cancellations.</p>';
    else
      area.innerHTML = `<form id="reserve-form"><p class="seat-label"><i></i><span id="live-seats">${remaining(workshop)} spots available</span><small>Updated live</small></p><label for="seats">How many places?</label><select id="seats" name="seats">${Array.from({ length: Math.min(4, remaining(workshop)) }, (_, i) => `<option value="${i + 1}">${i + 1} ${i === 0 ? 'place, just for me' : 'places'}</option>`).join('')}</select><p class="form-error" role="alert" hidden></p><button class="button full" type="submit">${session.user ? 'Reserve my spot' : 'Sign in to reserve'} ${icon('arrow')}</button></form>`;
    if ($('#reserve-form'))
      bindForm('#reserve-form', async (values) => {
        if (!session.user) {
          navigate(`/login?next=${encodeURIComponent(`/workshops/${id}`)}`);
          return;
        }
        const { booking: newBooking } = await api('/bookings', {
          method: 'POST',
          body: { workshop_id: Number(id), seats: Number(values.seats) },
        });
        reservation(workshop, newBooking);
        toast('Your place is reserved. We look forward to seeing you!');
      });
  };
  reservation(w, data.booking);
  const initial = { ...data, started: Date.parse(w.starts_at) <= Date.now() };
  let checkingAvailability = false;
  availabilityTimer = setInterval(async () => {
    if (document.hidden || checkingAvailability || $('#reserve-form button[type=submit]')?.disabled)
      return;
    checkingAvailability = true;
    try {
      const latest = await api(`/workshops/${id}`);
      if (routeVersion !== version) return;
      if (reservationChanged(initial, latest)) {
        const selected = $('#seats')?.value;
        await render();
        if ($('#seats') && Number(selected) <= remaining(latest.workshop))
          $('#seats').value = selected;
      }
    } catch (error) {
      if (routeVersion !== version) return;
      if (error.status === 404) {
        clearInterval(availabilityTimer);
        $('#reservation-area').innerHTML =
          '<p class="notice">This workshop is no longer available. Check My bookings for any existing reservation.</p>';
      } else if ($('#live-seats'))
        $('#live-seats').textContent = 'Availability will be checked when you book.';
    } finally {
      checkingAvailability = false;
    }
  }, 15000);
  if (w.outdoor) {
    const forecast = await api(`/workshops/${id}/weather`).catch(() => ({
      status: 'unavailable',
      message: 'The weather service is temporarily unavailable. Please try again later.',
    }));
    if (routeVersion !== version) return;
    $('#weather').innerHTML =
      forecast.status === 'available'
        ? `<div class="forecast"><span class="forecast-temp">${Math.round(forecast.high)}°<small> / ${Math.round(forecast.low)}°C</small></span><span><strong>${forecast.rain}% chance of rain</strong><small>For ${date(w.starts_at)} · London time</small></span></div><p class="muted">${forecast.stale ? 'Showing a recent forecast while the provider reconnects.' : `Updated ${time(forecast.updated_at)} (London time).`} Bring a layer and check again before you leave.</p>`
        : `<p>${escape(forecast.message)}</p>`;
  }
}
function authPage(signup) {
  const next = new URLSearchParams(location.search).get('next');
  const destination = next && /^\/(?!\/)/.test(next) && !next.includes('\\') ? next : '/dashboard';
  main.innerHTML = `<section class="auth-layout page-width"><div class="auth-art"><img src="/assets/garden.svg" alt="Illustration of a leafy plant growing in a terracotta pot" width="800" height="520"><div><span class="eyebrow">Good things grow together</span><h2>A place for<br>your curiosity.</h2><p>New skills, familiar faces, and a little time for you.</p></div></div><div class="auth-form-wrap"><span class="eyebrow">${signup ? 'Make yourself at home' : 'Good to see you again'}</span><h1>${signup ? 'Join the community.' : 'Welcome back.'}</h1><p class="muted">${signup ? 'Your next good thing starts here. It is free to join.' : 'Sign in to find your next workshop and manage your bookings.'}</p><form id="auth-form">${signup ? '<label for="name">Your name</label><input id="name" name="name" autocomplete="name" minlength="2" maxlength="80" required placeholder="Alex Morgan">' : ''}<label for="email">Email address</label><input id="email" name="email" type="email" autocomplete="email" maxlength="254" required placeholder="you@example.com"><label for="password">Password</label><div class="password-input"><input id="password" name="password" type="password" autocomplete="${signup ? 'new-password' : 'current-password'}" minlength="${signup ? '12' : '1'}" maxlength="128" required aria-describedby="password-hint"><button type="button" id="show-password" aria-label="Show password">Show</button></div><small id="password-hint">${signup ? 'Use at least 12 characters. A memorable phrase works well.' : 'Use the password you created when joining.'}</small><p class="form-error" role="alert" hidden></p><button class="button full" type="submit">${signup ? 'Create my account' : 'Sign in'} ${icon('arrow')}</button></form><p class="auth-switch">${signup ? 'Already part of the community?' : 'New around here?'} <a href="/${signup ? 'login' : 'signup'}${next ? `?next=${encodeURIComponent(destination)}` : ''}" data-link>${signup ? 'Sign in' : 'Join us'}</a></p></div></section>`;
  $('#show-password').onclick = () => {
    const input = $('#password'),
      visible = input.type === 'password';
    input.type = visible ? 'text' : 'password';
    $('#show-password').textContent = visible ? 'Hide' : 'Show';
    $('#show-password').setAttribute('aria-label', visible ? 'Hide password' : 'Show password');
  };
  bindForm('#auth-form', async (body) => {
    session = await api(`/auth/${signup ? 'signup' : 'login'}`, { method: 'POST', body });
    navigate(destination);
    toast(signup ? 'Welcome to Gather. Let your curiosity lead the way.' : 'Welcome back.');
  });
}
async function dashboard(version) {
  if (!session.user) return navigate('/login?next=/dashboard');
  const { bookings } = await api('/bookings');
  if (routeVersion !== version) return;
  let filter = 'upcoming';
  const statusOf = (b) => (bookingStage(b) === 'ongoing' ? 'upcoming' : bookingStage(b));
  const counts = { upcoming: 0, past: 0, cancelled: 0 };
  bookings.forEach((b) => counts[statusOf(b)]++);
  main.innerHTML = `<div class="page-width dashboard-page"><div class="page-heading"><div><span class="eyebrow">Your little corner of the community</span><h1>Hello, ${escape(session.user.name.split(' ')[0])}.</h1><p>Good things in your diary. Lovely memories in the making.</p></div><a href="/" data-link class="button secondary">Explore workshops ${icon('arrow')}</a></div><div class="stats-grid three"><div class="stat"><span>Coming up</span><strong>${counts.upcoming}</strong><small>Workshops to look forward to</small></div><div class="stat"><span>Experiences enjoyed</span><strong>${counts.past}</strong><small>New skills and good company</small></div><a href="/account" data-link class="stat account-stat"><span>Your account</span><strong>Make it yours ${icon('arrow', 26)}</strong><small>Update your profile and password</small></a></div><div class="section-heading"><h2>My bookings</h2><span>All times shown in London time</span></div><div class="tabs" role="group" aria-label="Filter bookings">${['upcoming', 'past', 'cancelled'].map((f) => `<button class="tab ${f === filter ? 'active' : ''}" data-filter="${f}" aria-pressed="${f === filter}">${f[0].toUpperCase() + f.slice(1)} <span>${counts[f]}</span></button>`).join('')}</div><div id="booking-list"></div></div>`;
  function list() {
    const items = bookings
      .filter((b) => statusOf(b) === filter)
      .sort((a, b) =>
        filter === 'upcoming'
          ? a.starts_at.localeCompare(b.starts_at)
          : b.starts_at.localeCompare(a.starts_at),
      );
    $('#booking-list').innerHTML = items.length
      ? items
          .map(
            (b) =>
              `<article class="booking-card"><img src="/assets/${art(b.category)}.svg" alt="" width="180" height="140"><div class="booking-card-main"><span class="category-label">${escape(b.category)}</span><h3>${escape(b.title)}</h3><p>${date(b.starts_at, { weekday: 'short', year: 'numeric' })} · ${time(b.starts_at)} · ${escape(b.venue)}</p><div class="booking-reference"><span>${escape(b.reference)}</span><span>${b.seats} ${b.seats === 1 ? 'place' : 'places'}</span><span class="status-pill ${filter}">${filter === 'upcoming' ? (bookingStage(b) === 'ongoing' ? 'In progress' : 'Confirmed') : filter === 'past' ? 'Completed' : b.workshop_status === 'cancelled' || b.workshop_status === 'deleted' ? 'Cancelled by host' : 'Cancelled'}</span></div></div><div class="booking-actions">${filter === 'upcoming' ? `<a class="button secondary small" href="/workshops/${b.workshop_id}" data-link>View workshop</a><button class="text-button cancel-booking" data-id="${b.id}" ${bookingStage(b) === 'ongoing' ? 'disabled title="This workshop has already started"' : ''}>Cancel booking</button>` : filter === 'past' && b.workshop_status === 'published' ? (b.review_id ? '<span class="reviewed">✓ Review shared</span>' : `<button class="button secondary small review-button" data-id="${b.workshop_id}" ${Date.parse(b.starts_at) + b.duration_minutes * 60000 > Date.now() ? 'disabled' : ''}>Leave a review</button>`) : ''}</div></article>`,
          )
          .join('')
      : `<div class="empty-state"><span class="empty-icon">${icon('calendar', 32)}</span><h3>${filter === 'upcoming' ? 'Your next good thing is waiting' : filter === 'past' ? 'The start of something good' : 'No cancelled bookings'}</h3><p>${filter === 'upcoming' ? 'Find a workshop that sparks your curiosity and save a spot.' : filter === 'past' ? 'Your completed workshops will appear here.' : 'Any bookings you cancel will be kept here for reference.'}</p>${filter === 'upcoming' ? '<a href="/" data-link class="button">Find a workshop</a>' : ''}</div>`;
    $$('.cancel-booking').forEach(
      (b) =>
        (b.onclick = () =>
          confirmAction(
            'Cancel your booking?',
            'Your places will be released for someone else. You can book again if spots are still available.',
            'Cancel booking',
            async () => {
              await api(`/bookings/${b.dataset.id}/cancel`, { method: 'POST', body: {} });
              toast('Your booking has been cancelled.');
              await render();
            },
          )),
    );
    $$('.review-button').forEach(
      (b) =>
        (b.onclick = () => {
          showDialog(
            `<div class="dialog-body"><span class="eyebrow">Share a little of your experience</span><h2 id="dialog-title">How was your workshop?</h2><form id="review-form"><label for="rating">Your rating</label><select id="rating" name="rating"><option value="5">5 stars · Loved it</option><option value="4">4 stars · Really good</option><option value="3">3 stars · It was okay</option><option value="2">2 stars · Could be better</option><option value="1">1 star · Disappointing</option></select><label for="comment">Tell the community</label><textarea id="comment" name="comment" rows="4" minlength="10" maxlength="1000" required placeholder="What did you enjoy? What could be better?"></textarea><p class="form-error" role="alert" hidden></p><button class="button full" type="submit">Share my review</button></form></div>`,
          );
          bindForm('#review-form', async (values) => {
            await api(`/workshops/${b.dataset.id}/reviews`, {
              method: 'POST',
              body: { rating: Number(values.rating), comment: values.comment },
            });
            dialog.close();
            toast('Thank you for sharing your experience.');
            await render();
          });
        }),
    );
  }
  $$('.tab').forEach(
    (b) =>
      (b.onclick = () => {
        filter = b.dataset.filter;
        $$('.tab').forEach((el) => {
          el.classList.toggle('active', el === b);
          el.setAttribute('aria-pressed', String(el === b));
        });
        list();
      }),
  );
  list();
}
function account() {
  if (!session.user) return navigate('/login?next=/account');
  main.innerHTML = `<div class="page-width account-page"><a href="/dashboard" data-link class="back-link">← My bookings</a><div class="page-heading"><div><span class="eyebrow">A space that is yours</span><h1>Account settings.</h1><p>Keep your details up to date and your account secure.</p></div></div><div class="account-grid"><section class="panel"><h2>Your profile</h2><form id="profile-form"><label for="name">Your name</label><input id="name" name="name" value="${escape(session.user.name)}" minlength="2" maxlength="80" autocomplete="name" required><label for="email">Email address</label><input id="email" name="email" type="email" value="${escape(session.user.email)}" maxlength="254" autocomplete="email" required><label for="profile-password">Current password</label><input id="profile-password" name="current_password" type="password" maxlength="128" autocomplete="current-password" aria-describedby="profile-hint"><small id="profile-hint">Required only when changing your email address.</small><p class="form-error" role="alert" hidden></p><button class="button" type="submit">Save profile ${icon('check', 18)}</button></form></section><section class="panel"><h2>Change password</h2><form id="password-form"><label for="current-password">Current password</label><input id="current-password" name="current_password" type="password" maxlength="128" autocomplete="current-password" required><label for="new-password">New password</label><input id="new-password" name="password" type="password" minlength="12" maxlength="128" autocomplete="new-password" required aria-describedby="new-password-hint"><small id="new-password-hint">Use 12 or more characters. Other sessions will be signed out.</small><label for="confirm-password">Confirm new password</label><input id="confirm-password" name="confirm" type="password" minlength="12" maxlength="128" autocomplete="new-password" required><p class="form-error" role="alert" hidden></p><button class="button" type="submit">Update password ${icon('check', 18)}</button></form></section></div></div>`;
  bindForm('#profile-form', async (body) => {
    const data = await api('/profile', { method: 'PATCH', body });
    session.user = data.user;
    $('#profile-password').value = '';
    header();
    toast('Your profile has been updated.');
  });
  bindForm('#password-form', async (body, form) => {
    if (body.password !== body.confirm) throw new Error('Your new passwords do not match.');
    session = await api('/profile/password', { method: 'POST', body });
    form.reset();
    toast('Password updated. Your other sessions have been signed out.');
  });
}
async function adminPage(version) {
  if (!session.user) return navigate('/login?next=/admin');
  if (session.user.role !== 'admin') {
    main.innerHTML =
      '<div class="empty-state"><h1>Administrator access required</h1><p>This area is for the Gather team.</p><a class="button" href="/" data-link>Back to workshops</a></div>';
    return;
  }
  const [analytics, inventory, bookingData] = await Promise.all([
    api('/admin/analytics'),
    api('/admin/workshops'),
    api('/admin/bookings'),
  ]);
  if (routeVersion !== version) return;
  const metrics = analytics.metrics;
  main.innerHTML = `<div class="page-width admin-page"><div class="page-heading"><div><span class="eyebrow">The Gather team</span><h1>A good overview.</h1><p>Keep your community growing, one workshop at a time.</p></div><button class="button" id="new-workshop">${icon('plus')} Add workshop</button></div><div class="stats-grid"><div class="stat"><span>Upcoming workshops ${icon('calendar')}</span><strong>${metrics.upcoming}</strong><small>Published and open for bookings</small></div><div class="stat"><span>Confirmed bookings ${icon('ticket')}</span><strong>${metrics.bookings}</strong><small>${metrics.seats} places reserved, all time</small></div><div class="stat"><span>Community members ${icon('people')}</span><strong>${metrics.users}</strong><small>Registered standard users</small></div><div class="stat"><span>Cancelled bookings ${icon('calendar')}</span><strong>${metrics.cancelled}</strong><small>All cancellations, including by hosts</small></div></div><div class="analytics-grid"><section class="panel"><div class="section-heading"><h2>Bookings this week</h2><span>Last 7 days · UTC</span></div><div class="chart" id="activity-chart"></div><p class="chart-note">New reservations by creation date, including later cancellations.</p></section><section class="panel"><div class="section-heading"><h2>What brings us together</h2><span>Confirmed places</span></div><div class="category-chart">${analytics.by_category.map((c) => `<div class="bar-row"><span>${escape(c.category)}</span><meter min="0" max="${Math.max(1, ...analytics.by_category.map((x) => x.seats))}" value="${c.seats}" aria-label="${escape(c.category)}: ${c.seats} confirmed places">${c.seats}</meter><strong>${c.seats}</strong></div>`).join('')}</div></section></div><div class="section-heading"><h2>Manage the details</h2><button class="text-button" id="refresh-admin">Refresh data ${icon('arrow', 16)}</button></div><div class="admin-toolbar"><div class="tabs" role="group" aria-label="Admin records"><button class="tab active" data-admin-tab="workshops" aria-pressed="true">Workshops <span>${inventory.workshops.length}</span></button><button class="tab" data-admin-tab="bookings" aria-pressed="false">Bookings <span>${bookingData.bookings.length}</span></button></div><div class="search-field compact">${icon('search', 18)}<input id="admin-search" aria-label="Search admin records" placeholder="Search records..."></div></div><div id="admin-records"></div></div>`;
  const maximum = Math.max(1, ...analytics.activity.map((d) => d.bookings));
  const chartWidth = 600,
    chartHeight = 165,
    barWidth = 44;
  $('#activity-chart').innerHTML =
    `<svg viewBox="0 0 ${chartWidth} ${chartHeight + 45}" role="img" aria-label="Bookings over the last seven days: ${analytics.activity.map((d) => `${d.day}: ${d.bookings}`).join(', ')}"><path d="M0 ${chartHeight}H600M0 90H600M0 25H600" stroke="#e3e5dc" stroke-dasharray="4 5"/>${analytics.activity
      .map((d, i) => {
        const x = 23 + i * 83,
          height = (d.bookings / maximum) * 125;
        return `<rect x="${x}" y="${chartHeight - height}" width="${barWidth}" height="${Math.max(2, height)}" rx="5" fill="${i === 6 ? '#ccdb9f' : '#3d6151'}"/><text x="${x + 22}" y="${chartHeight - height - 9}" text-anchor="middle" fill="#203d35" font-size="14">${d.bookings}</text><text x="${x + 22}" y="190" text-anchor="middle" fill="#68726c" font-size="13">${date(`${d.day}T12:00:00Z`, { day: undefined, month: undefined, weekday: 'short' })}</text>`;
      })
      .join('')}</svg>`;
  let tab = 'workshops';
  function records() {
    const q = $('#admin-search').value.toLowerCase();
    if (tab === 'workshops') {
      const items = inventory.workshops.filter((w) =>
        `${w.title} ${w.category} ${w.status}`.toLowerCase().includes(q),
      );
      $('#admin-records').innerHTML =
        `<div class="table-scroll"><table><caption class="sr-only">Workshop inventory</caption><thead><tr><th>Workshop</th><th>Date & time</th><th>Places</th><th>Status</th><th>Actions</th></tr></thead><tbody>${items.map((w) => `<tr><td><div class="table-workshop"><img src="/assets/${art(w.category)}.svg" alt="" width="56" height="44"><span><strong>${escape(w.title)}</strong><small>${escape(w.category)}</small></span></div></td><td>${date(w.starts_at, { year: 'numeric' })}<small>${time(w.starts_at)} London</small></td><td>${w.booked_seats} / ${w.capacity}</td><td><span class="status-pill ${w.status}">${w.status === 'published' && Date.parse(w.starts_at) <= Date.now() ? (Date.parse(w.starts_at) + w.duration_minutes * 60000 <= Date.now() ? 'Completed' : 'In progress') : w.status[0].toUpperCase() + w.status.slice(1)}</span></td><td><div class="table-actions"><button class="icon-button edit-workshop" data-id="${w.id}" aria-label="Edit ${escape(w.title)}" ${Date.parse(w.starts_at) <= Date.now() ? 'disabled' : ''}>${icon('edit', 18)}</button><button class="icon-button delete-workshop" data-id="${w.id}" aria-label="Delete ${escape(w.title)}">${icon('trash', 18)}</button></div></td></tr>`).join('') || '<tr><td colspan="5" class="empty-cell">No workshops match your search.</td></tr>'}</tbody></table></div>`;
      $$('.edit-workshop').forEach(
        (b) =>
          (b.onclick = () =>
            workshopEditor(inventory.workshops.find((w) => w.id === Number(b.dataset.id)))),
      );
      $$('.delete-workshop').forEach(
        (b) =>
          (b.onclick = () => {
            const w = inventory.workshops.find((w) => w.id === Number(b.dataset.id));
            confirmAction(
              'Delete this workshop?',
              `Remove "${w.title}" from the listings. Future reservations will be cancelled. Booking history will be preserved.`,
              'Delete workshop',
              async () => {
                await api(`/admin/workshops/${w.id}`, { method: 'DELETE', body: {} });
                toast('Workshop deleted. Booking history has been preserved.');
                await render();
              },
            );
          }),
      );
    } else {
      const items = bookingData.bookings.filter((b) =>
        `${b.name} ${b.email} ${b.title} ${b.reference}`.toLowerCase().includes(q),
      );
      $('#admin-records').innerHTML =
        `<p class="table-note">Showing the latest ${bookingData.bookings.length} bookings, up to 500 records.</p><div class="table-scroll"><table><caption class="sr-only">Booking records</caption><thead><tr><th>Reference</th><th>Member</th><th>Workshop</th><th>Places</th><th>Status</th></tr></thead><tbody>${items.map((b) => `<tr><td class="reference-cell">${escape(b.reference)}</td><td><strong>${escape(b.name)}</strong><small>${escape(b.email)}</small></td><td>${escape(b.title)}<small>${date(b.starts_at, { year: 'numeric' })}</small></td><td>${b.seats}</td><td><span class="status-pill ${b.status}">${b.status === 'confirmed' ? 'Confirmed' : 'Cancelled'}</span></td></tr>`).join('') || '<tr><td colspan="5" class="empty-cell">No bookings match your search.</td></tr>'}</tbody></table></div>`;
    }
  }
  $('[data-admin-tab="workshops"]').onclick = () => selectTab('workshops');
  $('[data-admin-tab="bookings"]').onclick = () => selectTab('bookings');
  function selectTab(value) {
    tab = value;
    $$('[data-admin-tab]').forEach((b) => {
      b.classList.toggle('active', b.dataset.adminTab === tab);
      b.setAttribute('aria-pressed', String(b.dataset.adminTab === tab));
    });
    records();
  }
  $('#admin-search').oninput = records;
  $('#new-workshop').onclick = () => workshopEditor();
  $('#refresh-admin').onclick = () => render();
  records();
}
function workshopEditor(w = {}) {
  const localInput = (iso) => {
    const d = new Date(iso);
    return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  };
  const field = (name, label, type = 'text', extra = '') =>
    `<label for="edit-${name}">${label}</label><input id="edit-${name}" name="${name}" type="${type}" value="${escape(w[name] ?? '')}" ${extra} required>`;
  showDialog(
    `<div class="dialog-body wide"><span class="eyebrow">A new reason to come together</span><h2 id="dialog-title">${w.id ? 'Edit workshop' : 'Create a workshop'}</h2><form id="workshop-form">${field('title', 'Workshop title', 'text', 'minlength="5" maxlength="100"')}<div class="form-grid"><div><label for="edit-category">Category</label><select id="edit-category" name="category">${categories.map((c) => `<option ${w.category === c ? 'selected' : ''}>${escape(c)}</option>`).join('')}</select></div><div>${field('host', 'Host name', 'text', 'minlength="2" maxlength="80"')}</div></div><label for="edit-description">Description and what to bring</label><textarea id="edit-description" name="description" rows="4" minlength="30" maxlength="3000" required>${escape(w.description || '')}</textarea><div class="form-grid"><div>${field('venue', 'Venue name', 'text', 'minlength="2" maxlength="100"')}</div><div>${field('address', 'Full address', 'text', 'minlength="5" maxlength="200"')}</div></div><div class="form-grid"><div>${field('latitude', 'Latitude', 'number', 'min="-90" max="90" step="any"')}</div><div>${field('longitude', 'Longitude', 'number', 'min="-180" max="180" step="any"')}</div></div><small>Coordinates are used to retrieve the local weather forecast.</small><label for="edit-starts_at">Date and time (${escape(Intl.DateTimeFormat().resolvedOptions().timeZone)})</label><input id="edit-starts_at" type="datetime-local" name="starts_at" value="${w.starts_at ? localInput(w.starts_at) : ''}" min="${localInput(new Date(Date.now() + 60000).toISOString())}" required><div class="form-grid"><div>${field('duration_minutes', 'Duration in minutes', 'number', 'min="30" max="480"')}</div><div>${field('capacity', 'Maximum places', 'number', 'min="1" max="500"')}</div></div><div class="form-grid"><div><label for="edit-outdoor">Setting</label><select id="edit-outdoor" name="outdoor"><option value="false" ${!w.outdoor ? 'selected' : ''}>Indoors</option><option value="true" ${w.outdoor ? 'selected' : ''}>Outdoors</option></select></div><div><label for="edit-status">Publication status</label><select id="edit-status" name="status"><option value="published" ${w.status === 'published' ? 'selected' : ''}>Published</option><option value="draft" ${w.status === 'draft' ? 'selected' : ''}>Draft</option>${w.id ? `<option value="cancelled" ${w.status === 'cancelled' ? 'selected' : ''}>Cancelled</option>` : ''}</select></div></div><p id="cancellation-warning" class="notice" ${w.status === 'cancelled' ? '' : 'hidden'}>Cancelling this workshop also cancels all active reservations.</p><p class="form-error" role="alert" hidden></p><button type="submit" class="button full">${w.id ? 'Save changes' : 'Create workshop'} ${icon('check', 18)}</button></form></div>`,
  );
  $('#edit-status').onchange = () => {
    $('#cancellation-warning').hidden = $('#edit-status').value !== 'cancelled';
  };
  bindForm('#workshop-form', async (values) => {
    const body = {
      ...values,
      starts_at: new Date(values.starts_at).toISOString(),
      outdoor: values.outdoor === 'true',
    };
    for (const key of ['capacity', 'duration_minutes', 'latitude', 'longitude'])
      body[key] = Number(values[key]);
    await api(`/admin/workshops${w.id ? `/${w.id}` : ''}`, {
      method: w.id ? 'PATCH' : 'POST',
      body,
    });
    dialog.close();
    toast(w.id ? 'Workshop updated.' : 'Your workshop is ready.');
    await render();
  });
}
async function render() {
  const version = ++routeVersion;
  clearInterval(availabilityTimer);
  header();
  document.title = 'Gather | Make time for something good';
  main.innerHTML = '<div class="loading" role="status">A moment, please...</div>';
  try {
    const path = location.pathname.replace(/\/$/, '') || '/';
    if (path === '/') await explore(version);
    else if (/^\/workshops\/\d+$/.test(path)) await detail(path.split('/')[2], version);
    else if (path === '/login' || path === '/signup') authPage(path === '/signup');
    else if (path === '/dashboard') await dashboard(version);
    else if (path === '/account') account();
    else if (path === '/admin') await adminPage(version);
    else
      main.innerHTML =
        '<div class="empty-state"><span class="eyebrow">A little off the beaten path</span><h1>This page could not be found.</h1><a href="/" data-link class="button">Find a workshop</a></div>';
  } catch (e) {
    if (routeVersion !== version) return;
    main.innerHTML = `<div class="empty-state"><h1>${e.status === 404 ? 'Workshop not found' : 'We hit a small bump'}</h1><p>${escape(e.message)}</p><a class="button" href="/" data-link>Back to workshops</a></div>`;
  }
}
document.addEventListener('click', (event) => {
  const a = event.target.closest('a[data-link]');
  if (
    a &&
    event.button === 0 &&
    !event.metaKey &&
    !event.ctrlKey &&
    !event.shiftKey &&
    !event.altKey
  ) {
    event.preventDefault();
    navigate(a.getAttribute('href'));
  }
});
window.addEventListener('popstate', render);
try {
  const data = await api('/session');
  session = data;
  categories = data.categories;
  await render();
} catch {
  main.innerHTML =
    '<div class="empty-state"><h1>We could not connect.</h1><p>Check your connection and refresh to try again.</p><a class="button" href="/">Try again</a></div>';
}
