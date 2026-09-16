const app = document.querySelector('#app');
let boot = { app: { name: 'leaf', support: '#', invite: '/invite' }, stats: { users: 0, guilds: 0, commands: 0, reactionMs: 15 }, me: null };
let catalog = [];
let activeCategory = 'All';
let searchText = '';
let plusOnly = false;
let settingsPane = 'general';

const ICONS = {
  discord: '<i class="fi fi-brands-discord"></i>',
  commands: '<i class="fi fi-rr-terminal"></i>',
  plus: '<i class="fa-solid fa-gem"></i>',
  team: '<i class="fa-solid fa-users"></i>',
  users: '<i class="fa-solid fa-users"></i>',
  gauge: '<i class="fa-solid fa-gauge-high"></i>',
  bolt: '<i class="fa-solid fa-bolt"></i>',
  support: '<i class="fa-solid fa-life-ring"></i>',
  level: '<i class="fa-solid fa-ranking-star"></i>',
  general: '<i class="fa-solid fa-sliders"></i>',
  nsfw: '<i class="fa-solid fa-shield-heart"></i>',
  theme: '<svg class="theme-svg-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" aria-hidden="true"><g><path fill="currentColor" d="M23.998,15.999C10.745,15.999,0,26.744,0,39.996v0.008v19.998c0,2.203,1.789,4,4,4h19.999c0.008,0,0.016-0.008,0.027-0.008c13.237-0.016,23.971-10.753,23.971-23.998C47.996,26.744,37.251,15.999,23.998,15.999z"></path><path fill="currentColor" d="M60.479,3.515c-4.683-4.687-12.284-4.687-16.967,0l-7.019,7.019c7.62,3.238,13.729,9.347,16.967,16.971l7.019-7.022C65.166,15.799,65.166,8.202,60.479,3.515z"></path></g></svg>',
  tos: '<i class="fa-regular fa-file-lines"></i>',
  privacy: '<i class="fa-solid fa-shield-halved"></i>',
  refund: '<i class="fa-solid fa-receipt"></i>',
  copy: '<i class="fa-regular fa-copy"></i>',
  arrow: '<i class="fa-solid fa-chevron-up"></i>',
  back: '<i class="fa-solid fa-arrow-left"></i>',
  fake: '<i class="fa-solid fa-comment-dots"></i>',
  gift: '<i class="fa-solid fa-gift"></i>',
  roblox: '<svg viewBox="0 0 302.7 302.7" fill="currentColor" xmlns="http://www.w3.org/2000/svg"><path d="M120.5 271.7C9.6 243.1.5 240.7.6 240.2.7 239.6 62.1.5 62.2.4c0 0 54 13.8 119.9 30.8s120 30.8 120.1 30.8c.2 0 .2.4.1.9-.2 1.5-61.5 239.3-61.7 239.5-.1.1-54.2-13.7-120.1-30.7zm54.4-113.7c3.2-12.6 5.9-23.1 6-23.4.1-.5-2.3-1.2-23.2-6.6-12.8-3.3-23.5-5.9-23.6-5.8-.3.3-12.1 46.6-12 46.7.2.2 46.7 12.2 46.8 12.1.1-.1 2.8-10.4 6-23z"></path></svg>',
};

function icon(name) { return `<span class="icon">${ICONS[name] || ''}</span>`; }
function fmt(n) { return Number(n || 0).toLocaleString('en-US'); }
function abbr(n) { n = Number(n || 0); if (n >= 1_000_000) return `${Math.floor(n / 100_000) / 10}m+`; if (n >= 1_000) return `${Math.floor(n / 1000)}k+`; return fmt(n); }
function esc(s) { return String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
function pathNow() { return location.pathname.replace(/\/$/, '') || '/'; }
function setTitle(name) { document.title = `leaf - ${name}`; }
async function api(url, options) { const r = await fetch(url, options); if (!r.ok) throw new Error(await r.text()); return r.json(); }

function setLoading(show) {
  document.querySelector('#pageLoader')?.classList.toggle('hidden', !show);
}

function transitionRender() {
  const run = async () => {
    setLoading(true);
    document.body.classList.remove('route-leave', 'route-enter');
    await render();
    window.scrollTo({ top: 0, behavior: 'smooth' });
    requestAnimationFrame(() => setLoading(false));
  };
  if (document.startViewTransition) return document.startViewTransition(run);
  document.body.classList.add('route-leave');
  setLoading(true);
  setTimeout(async () => {
    try {
      await render();
      window.scrollTo({ top: 0, behavior: 'smooth' });
      document.body.classList.add('route-enter');
    } finally {
      document.body.classList.remove('route-leave');
      requestAnimationFrame(() => setLoading(false));
      setTimeout(() => document.body.classList.remove('route-enter'), 280);
    }
  }, 80);
}

function navState() {
  const p = pathNow();
  document.querySelectorAll('[data-nav]').forEach(a => a.classList.toggle('active', p.startsWith(`/${a.dataset.nav}`)));
  const login = document.querySelector('#loginButton');
  if (boot.me) { login.innerHTML = `<img src="${boot.me.avatarUrl}" alt=""> ${esc(boot.me.globalName || boot.me.username)}`; login.href = '/settings'; }
  else { login.textContent = 'Login'; login.href = '/auth/discord'; }
  document.querySelector('#supportTop').href = boot.app.support;
  document.querySelector('#supportFoot').href = boot.app.support;
}

function route(e) {
  const a = e.target.closest('a[data-link]');
  if (!a) return;
  e.preventDefault();
  history.pushState(null, '', a.href);
  transitionRender();
}
document.addEventListener('click', route);
window.addEventListener('popstate', transitionRender);
window.addEventListener('scroll', () => {
  document.body.classList.toggle('scrolled', window.scrollY > 34);
  document.querySelector('#toTop')?.classList.toggle('show', window.scrollY > 500);
});

document.addEventListener('click', e => {
  const faq = e.target.closest('.faq-question');
  if (faq) faq.parentElement.classList.toggle('open');
  const copy = e.target.closest('[data-copy]');
  if (copy) { e.stopPropagation(); navigator.clipboard?.writeText(copy.dataset.copy).catch(() => {}); copy.classList.add('copied'); setTimeout(() => copy.classList.remove('copied'), 700); }
  if (e.target.closest('#toTop')) window.scrollTo({ top: 0, behavior: 'smooth' });
});

function afterRender(root = app, instant = false) { observeReveal(root, instant); animateCounters(root); bindTiltCards(root); navState(); }
function bindTiltCards(root = document) {
  root.querySelectorAll('[data-tilt]').forEach(card => {
    card.addEventListener('mousemove', e => {
      const rect = card.getBoundingClientRect();
      const x = (e.clientX - rect.left) / rect.width - 0.5;
      const y = (e.clientY - rect.top) / rect.height - 0.5;
      card.style.transform = `perspective(900px) rotateX(${(-y * 8).toFixed(2)}deg) rotateY(${(x * 10).toFixed(2)}deg) translateY(-6px)`;
    });
    card.addEventListener('mouseleave', () => { card.style.transform = ''; });
  });
}
function observeReveal(root = document, instant = false) {
  const nodes = [...root.querySelectorAll('.page,.card,.faq-item,.cta,.team-card,.settings-card,.legal-section,.divider,.wave-divider,.kind-card,.stat')];
  if (instant) {
    nodes.forEach((el, i) => { el.style.setProperty('--i', i % 9); el.classList.add('reveal', 'revealed'); });
    return;
  }
  const io = new IntersectionObserver(entries => entries.forEach(entry => {
    if (!entry.isIntersecting) return;
    entry.target.classList.add('revealed');
    io.unobserve(entry.target);
  }), { threshold: 0.12 });
  nodes.forEach((el, i) => { el.style.setProperty('--i', i % 9); el.classList.add('reveal'); io.observe(el); });
}
function animateCounters(root = document) {
  root.querySelectorAll('[data-count]').forEach(el => {
    const target = Number(el.dataset.count || 0);
    const start = performance.now();
    const dur = 850;
    const tick = now => {
      const p = Math.min(1, (now - start) / dur);
      const eased = 1 - Math.pow(1 - p, 3);
      el.textContent = fmt(Math.round(target * eased));
      if (p < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}

function home() {
  setTitle('Discord App');
  app.innerHTML = `<section class="page hero">
    <h1 class="leaf-word gradient-text">leaf</h1>
    <p>A multipurpose all-in-one bot, enhancing<br>your experience with user-focused commands.</p>
    <div class="substats">Powering <strong data-count="${boot.stats.users}">0</strong> indiv. users with <strong data-count="${boot.stats.commands}">0</strong> commands</div>
    <div class="hero-actions"><a class="btn primary liquid" href="/invite"><span class="icon"><i class="fi fi-brands-discord"></i></span>Authorize Me</a><a class="btn ghost liquid" href="/commands" data-link><span class="icon"><i class="fi fi-rr-terminal"></i></span>View Commands</a></div>
  </section>
  <div class="wave-divider wave-a"></div>
  <section class="page command-kinds">
    <h2 class="section-title gradient-text">A command for every kind of chat</h2>
    <p class="section-sub">From quick lookups to games, generated images, Roblox tools, and economy features. leaf has commands to fit any vibe.</p>
    <div class="kind-grid">
      ${kindCard('fake','Fake Message','Generate realistic Discord-style messages with avatars, tags, mentions, reactions, and themes.')}
      ${kindCard('roblox','Roblox','Look up Roblox profiles, games, groups, badges, friends, servers, and access links.')}
      ${kindCard('gift','Giveaways','Create timed giveaways with rewards, entries, winners, rerolls, and restart-safe storage.')}
      ${kindCard('commands','Utility','Convert IDs, define words, check domains, fetch weather, manage notes, and more.')}
      ${kindCard('plus','Plus','Unlock stronger limits, Plus-only commands, monthly rewards, and extra tools.')}
      ${kindCard('team','Games','Play captcha, hangman, wordle, social games, and other interactive commands.')}
    </div>
  </section>
  <div class="wave-divider wave-b"></div>
  <section class="page"><h2 class="section-title gradient-text">Built to be reliable</h2><p class="section-sub">A personal project with live connection status and room to grow.</p>
    <div class="stats"><div class="card stat liquid-card"><div class="stat-icon">${ICONS.bolt}</div><strong>${boot.stats.online ? "Online" : "Offline"}</strong><p class="card-muted">Current Discord connection.</p></div><div class="card stat liquid-card"><div class="stat-icon">${ICONS.gauge}</div><strong>${boot.stats.reactionMs}<small>ms</small></strong><p class="card-muted">Current gateway response time.</p></div><div class="card stat liquid-card"><div class="stat-icon">${ICONS.users}</div><strong>${abbr(boot.stats.users)}</strong><p class="card-muted">Individual users known by leaf.</p></div></div>
  </section>
  <div class="wave-divider wave-c"></div>
  <section class="page"><h2 class="section-title gradient-text">Frequently asked</h2><p class="section-sub">Quick answers to the things people ask most.</p><div class="faq">
    ${faq('Is leaf free?','Yes. Most leaf commands are free now. Plus is only needed for Plus-only commands and higher limits.')}
    ${faq('How do I pay for Plus?','Use /plus buy in Discord for built-in Discord checkout, or open the support server for other payment methods.')}
    ${faq('What does Plus actually unlock?','Plus unlocks Plus-only commands, higher limits, monthly Plus rewards, and extra utility features.')}
    ${faq('Can leaf see my messages?','leaf uses the permissions and events configured for the bot. Dashboard login uses Discord OAuth identify for your profile.')}
    ${faq('Where do I get help?','Use the Support button at the top of this page.')}
  </div><div class="cta liquid-card"><h2 class="gradient-text">Add leaf to your account in seconds.</h2><a class="btn primary liquid" href="/invite"><span class="icon"><i class="fi fi-brands-discord"></i></span>Authorize Me</a></div></section>`;
}
function kindCard(iconName,title,body){return `<article class="kind-card liquid-card"><div class="feature-icon">${ICONS[iconName]}</div><h3 class="gradient-text">${esc(title)}</h3><p>${esc(body)}</p></article>`}
function feature(iconName,title,body){return `<article class="card feature liquid-card"><div class="feature-icon">${ICONS[iconName]}</div><h3 class="gradient-text">${esc(title)}</h3><p>${esc(body)}</p></article>`}
function faq(q,a){return `<div class="faq-item liquid-card"><button class="faq-question">${esc(q)}<span><i class="fa-solid fa-chevron-down"></i></span></button><div class="faq-answer"><p>${esc(a)}</p></div></div>`}

async function ensureCatalog() {
  if (!catalog.length) { const data = await api('/api/commands'); catalog = data.commands; boot.stats = data.stats; }
}
function commandPool() { return plusOnly ? catalog.filter(c => c.premium || c.plusBenefit) : catalog; }
function commandFiltered() {
  const pool = commandPool();
  return pool.filter(c => (activeCategory === 'All' || c.category === activeCategory) && (!searchText || `${c.displayName} ${c.description} ${c.category}`.toLowerCase().includes(searchText.toLowerCase())));
}
function categoriesForPool() { const pool = commandPool(); return ['All', ...Array.from(new Set(pool.map(c => c.category))).sort()]; }
function renderCommandGrid() {
  const cats = categoriesForPool();
  if (!cats.includes(activeCategory)) activeCategory = 'All';
  const filtered = commandFiltered();
  const chips = document.querySelector('#chips');
  if (chips) chips.innerHTML = cats.map(c => `<button class="chip liquid ${c===activeCategory?'active':''}" data-cat="${esc(c)}">${esc(c)} <span>${c==='All'?commandPool().length:commandPool().filter(x=>x.category===c).length}</span></button>`).join('');
  const grid = document.querySelector('#commandGrid');
  if (grid) { grid.innerHTML = filtered.map(card).join('') || '<p class="card-muted">No commands found.</p>'; grid.querySelectorAll('.command-card').forEach(el => el.classList.add('revealed')); }
  const count = document.querySelector('#commandCount');
  if (count) count.textContent = `${fmt(filtered.length)} ${plusOnly ? 'Plus ' : ''}commands`;
}

function bindChipWheel() {
  const chips = document.querySelector('#chips');
  if (!chips || chips.dataset.wheelBound) return;
  chips.dataset.wheelBound = 'true';
  chips.addEventListener('wheel', event => {
    const canScroll = chips.scrollWidth > chips.clientWidth;
    if (!canScroll) return;
    event.preventDefault();
    chips.scrollLeft += Math.abs(event.deltaY) > Math.abs(event.deltaX) ? event.deltaY : event.deltaX;
  }, { passive: false });
}

async function commandsPage() {
  setTitle('Commands');
  await ensureCatalog();
  app.innerHTML = `<section class="page command-head command-page-ready ${plusOnly ? 'plus-command-page' : ''}"><h1 class="section-title gradient-text" style="text-align:left">${plusOnly ? 'plus commands' : 'commands'}</h1><div class="eyebrow">${fmt(commandPool().length)} commands &middot; ${categoriesForPool().length - 1} categories</div>
    <div class="toolbar"><div class="toolbar-actions">${plusOnly ? `<button class="btn ghost liquid" id="allCommands">${icon('commands')}All Commands</button><button class="btn ghost liquid" id="premiumToggle">${icon('plus')}Get Plus</button>` : `<button class="btn ghost liquid" id="premiumToggle">${icon('plus')}Plus Features</button>`}</div><input class="search liquid" id="search" placeholder="Search" value="${esc(searchText)}"></div>
    <div class="chips liquid-card" id="chips"></div><h3 id="commandCount"></h3><div class="command-grid" id="commandGrid"></div></section>`;
  document.querySelector('#search').addEventListener('input', e => { searchText = e.target.value; renderCommandGrid(); });
  document.querySelector('#premiumToggle').addEventListener('click', () => { if (plusOnly) return openPlansModal(); history.pushState(null, '', '/plus'); transitionRender(); });
  document.querySelector('#allCommands')?.addEventListener('click', () => { history.pushState(null, '', '/commands'); transitionRender(); });
  document.querySelector('#chips').addEventListener('click', e => { const b = e.target.closest('[data-cat]'); if (!b) return; activeCategory = b.dataset.cat; renderCommandGrid(); });
  renderCommandGrid();
  bindChipWheel();
  document.querySelector('#search')?.focus({ preventScroll: true });
}
function card(c){
  const args = c.arguments.filter(a => a.name !== 'plus');
  const argsHtml = args.length
    ? args.map(a=>`<span class="arg">${esc(a.name)}${a.required?'':'?'}</span>`).join('')
    : '<span class="no-args">none</span>';
  const isAdminCommand = ['admin', 'owner'].includes(String(c.category || '').toLowerCase());
  return `<article class="command-card liquid-card ${isAdminCommand?'admin-command':c.premium?'premium-command':''}"><button class="copy" data-copy="${esc(c.syntax)}" title="Copy command"><i class="fa-regular fa-copy"></i></button><h3>${esc(c.displayName)}</h3><p>${c.premium ? '<i class="fa-solid fa-wand-magic-sparkles"></i> ' : ''}${esc(c.description)}</p>${c.plusBenefit ? `<p class="card-muted"><strong>Free to use · Plus upgrade:</strong> ${esc(c.plusBenefit)}</p>` : ''}<div class="command-meta"><span>arguments</span><div class="args">${argsHtml}</div><span>usage</span><code>${esc(c.syntax)}</code></div></article>`;
}

async function team() {
  setTitle('Team');
  const data = await api('/api/team').catch(() => ({ members: [] }));
  const member = data.members[0] || { name: 'zyless', username: 'zyless', role: 'Owner & Developer', avatar: '/assets/leaf_no_bg.png' };
  const bannerStyle = member.banner
    ? `background-image:linear-gradient(180deg,rgba(0,0,0,.08),rgba(0,0,0,.5)),url('${member.banner}')`
    : `background: radial-gradient(circle at 30% 20%, ${member.accent || '#424242'}, transparent 38%), linear-gradient(135deg, rgba(255,255,255,.14), rgba(255,255,255,.04))`;
  app.innerHTML = `<section class="page team-wrap"><h1 class="section-title gradient-text">team</h1><p class="section-sub">The mind behind leaf.</p><article class="team-card"><div class="team-card-inner liquid-card" data-tilt><div class="team-banner" style="${bannerStyle}"></div><img class="avatar" src="${esc(member.avatar)}" alt=""><div class="team-name-row"><h2 class="gradient-text">${esc(member.name)}</h2><span class="team-badge admin-badge" title="Admin"><i class="fa-solid fa-shield-halved"></i> Admin</span><span class="team-badge plus-badge" title="Plus">${icon('plus')} Plus</span></div><p class="card-muted team-username">@${esc(member.username)}</p><span class="role">${esc(member.role).toUpperCase()}</span><hr><p class="card-muted">Currently building leaf.</p></div></article></section>`;
}
async function plus() { setTitle('Plus'); plusOnly = true; await commandsPage(); }
async function settings() {
  setTitle('Settings');
  const data = await api('/api/me').catch(() => ({ user:null }));
  if (!data.user) { app.innerHTML = `<section class="page detail"><h1 class="gradient-text">Login required</h1><p class="card-muted">Login with Discord to edit your leaf settings.</p><a class="btn primary liquid" href="/auth/discord">${icon('discord')}Login with Discord</a></section>`; return; }
  const s = data.settings;
  const selectedLayoutObj = s.layouts.find(l => l.id === s.layout) || {};
  const currentTime = new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  const defaultIcon = '/assets/leaf_no_bg.png';
  const initial = {
    name: selectedLayoutObj.name || `${data.user.globalName || data.user.username}'s Theme`,
    color: selectedLayoutObj.color || '#424242',
    authorName: selectedLayoutObj.author?.name || 'leaf',
    authorIcon: selectedLayoutObj.author?.icon_url || defaultIcon,
    footerText: selectedLayoutObj.footer?.text || 'leaf',
    footerIcon: selectedLayoutObj.footer?.icon_url || defaultIcon,
    thumbnail: selectedLayoutObj.thumbnail?.url || defaultIcon,
  };
  let selectedLanguage = s.language;
  const previewText = {
    en:{customizing:'is customizing',used:'used',today:'Today at',desc:'This is the Description.',net:'net worth',wallet:'Wallet',bank:'Bank',total:'Total',level:'Level Overview',title:'Title',rank:'Rank',presence:'Presence',online:'online'},
    de:{customizing:'passt an',used:'hat benutzt',today:'Heute um',desc:'Das ist die Beschreibung.',net:'Nettovermoegen',wallet:'Wallet',bank:'Bank',total:'Gesamt',level:'Level Uebersicht',title:'Titel',rank:'Rang',presence:'Status',online:'online'},
    es:{customizing:'est? personalizando',used:'us?',today:'Hoy a las',desc:'Esta es la descripci?n.',net:'patrimonio',wallet:'Cartera',bank:'Banco',total:'Total',level:'Resumen de nivel',title:'T?tulo',rank:'Rango',presence:'Estado',online:'online'},
    fr:{customizing:'personnalise',used:'a utilis?',today:'Aujourd?hui ?',desc:'Ceci est la description.',net:'valeur nette',wallet:'Portefeuille',bank:'Banque',total:'Total',level:'Aper?u du niveau',title:'Titre',rank:'Rang',presence:'Statut',online:'en ligne'},
    it:{customizing:'sta personalizzando',used:'ha usato',today:'Oggi alle',desc:'Questa ? la descrizione.',net:'patrimonio',wallet:'Portafoglio',bank:'Banca',total:'Totale',level:'Panoramica livello',title:'Titolo',rank:'Classifica',presence:'Stato',online:'online'},
    nl:{customizing:'past aan',used:'gebruikte',today:'Vandaag om',desc:'Dit is de beschrijving.',net:'vermogen',wallet:'Wallet',bank:'Bank',total:'Totaal',level:'Leveloverzicht',title:'Titel',rank:'Rang',presence:'Status',online:'online'},
    pt:{customizing:'est? personalizando',used:'usou',today:'Hoje ?s',desc:'Esta ? a descri??o.',net:'patrim?nio',wallet:'Carteira',bank:'Banco',total:'Total',level:'Vis?o do n?vel',title:'T?tulo',rank:'Rank',presence:'Status',online:'online'},
    ru:{customizing:'???????????',used:'??????????',today:'??????? ?',desc:'??? ????????.',net:'???????',wallet:'???????',bank:'????',total:'?????',level:'????? ??????',title:'?????',rank:'????',presence:'??????',online:'??????'},
    tr:{customizing:'?zelle?tiriyor',used:'kulland?',today:'Bug?n',desc:'Bu a??klamad?r.',net:'net de?er',wallet:'C?zdan',bank:'Banka',total:'Toplam',level:'Seviye ?zeti',title:'Ba?l?k',rank:'S?ra',presence:'Durum',online:'?evrimi?i'},
    ja:{customizing:'???????',used:'??',today:'??',desc:'????????',net:'???',wallet:'?????',bank:'??',total:'??',level:'?????',title:'????',rank:'???',presence:'??',online:'?????'},
    ko:{customizing:'??? ?',used:'???',today:'??',desc:'?????.',net:'???',wallet:'??',bank:'??',total:'??',level:'?? ??',title:'??',rank:'??',presence:'??',online:'???'},
    zh:{customizing:'?????',used:'???',today:'??',desc:'?????',net:'???',wallet:'??',bank:'??',total:'??',level:'????',title:'??',rank:'??',presence:'??',online:'??'}
  };
  const t = key => previewText.en[key] || key;

  app.innerHTML = `<section class="page dashboard-page">
    <div class="dashboard-head">
      <h1 class="section-title gradient-text" style="text-align:left">dashboard</h1>
      <p class="card-muted">Logged in as ${esc(data.user.globalName || data.user.username)}${data.user.admin?' &middot; Admin':''}</p>
    </div>
    <div class="dashboard-shell ${settingsPane==='appearance'?'appearance-open':''}">
      <aside class="dashboard-side liquid-card">
        <button class="dash-tab ${settingsPane==='general'?'active':''}" data-pane="general">${icon('general')}<span>General</span></button>
        <button class="dash-tab ${settingsPane==='language'?'active':''}" data-pane="language"><i class="fa-solid fa-language"></i><span>Language</span></button>
        <button class="dash-tab plus-tab ${settingsPane==='appearance'?'active':''}" data-pane="appearance">${icon('plus')}<i class="fa-solid fa-palette"></i><span>Appearance</span></button>
        <button class="dash-tab ${settingsPane==='economy'?'active':''}" data-pane="economy"><i class="fa-solid fa-coins"></i><span>Economy</span></button>
        <button class="dash-tab ${settingsPane==='level'?'active':''}" data-pane="level">${icon('level')}<span>Level</span></button>
        <button class="dash-tab ${settingsPane==='account'?'active':''}" data-pane="account"><i class="fa-solid fa-user"></i><span>Account</span></button>
        ${data.user.admin ? `<button class="dash-tab admin-tab ${settingsPane==='admin'?'active':''}" data-pane="admin"><i class="fa-solid fa-shield-halved"></i><span>Admin</span></button>` : ''}
      </aside>
      <main class="dashboard-main liquid-card">
        <section class="dash-pane ${settingsPane==='language'?'active':''}" data-pane-view="language">
          <h2 class="gradient-text">Language</h2>
          <p class="card-muted">Choose the language leaf should use for static command responses.</p>
          <div class="choice-grid" id="languageChoices">${Object.entries(s.languages).map(([k,v])=>`<button class="choice ${s.language===k?'active':''}" data-lang="${k}"><strong>${esc(v)}</strong><span>${esc(k.toUpperCase())}</span></button>`).join('')}</div>
        </section>
        <section class="dash-pane ${settingsPane==='appearance'?'active':''}" data-pane-view="appearance">
          <div class="appearance-frame" id="appearanceFrame">
            <div class="theme-home" id="themeHome">
              <div class="active-theme-card liquid-card">
                <div><span>Active theme</span><strong id="activeThemeName">${esc(selectedLayoutObj.name || 'leaf Default')}</strong></div>
                <div class="active-theme-actions"><button class="round-action theme-default-reset ${s.layout ? '' : 'hidden'}" id="defaultThemeReset" title="Reset to default"><i class="fa-solid fa-rotate-left"></i></button><button class="btn primary liquid" id="composeTheme">${icon('theme')} Compose new</button></div>
              </div>
              <div class="theme-browser liquid-card">
                <div class="theme-tabs"><button class="active" data-layout-tab="own">My Themes</button><button data-layout-tab="global">Community Themes</button><button data-layout-tab="saved">Saved Themes</button></div>
                <div class="theme-tools"><label class="theme-search-wrap"><i class="fa-solid fa-magnifying-glass"></i><input class="layout-search" id="layoutSearch" placeholder="Search themes or @user"></label><div class="theme-count"><span>Available Themes</span><strong id="themeCount">${fmt(s.layouts.length)}</strong></div></div>
                <div class="layout-list theme-list" id="layoutList"></div>
              </div>
            </div>
            <div class="theme-editor hidden" id="themeEditor">
              <div class="theme-editor-head"><div><h2 class="gradient-text">Theme editor</h2><p class="card-muted">Edit your theme using the options below.</p></div></div>
              <div class="editor-shell">
                <div class="editor-tabs">
                  <button class="editor-tab active" data-edit-tab="author"><i class="fa-solid fa-user-pen"></i><span>Author</span></button>
                  <button class="editor-tab" data-edit-tab="thumbnail"><i class="fa-regular fa-image"></i><span>Images</span></button>
                  <button class="editor-tab" data-edit-tab="color"><i class="fa-solid fa-palette"></i><span>Color</span></button>
                  <button class="editor-tab" data-edit-tab="footer"><i class="fa-solid fa-align-left"></i><span>Footer</span></button>
                </div>
                <div class="editor-panel">
                  <label class="dash-input" data-field-tab="author"><span>Author name</span><input id="layoutAuthorName" maxlength="32" value="${esc(initial.authorName)}"></label>
                  <label class="dash-input" data-field-tab="author"><span>Author icon URL</span><input id="layoutAuthorIcon" value="${esc(initial.authorIcon)}"></label><label class="upload-button thumbnail-upload-row" data-field-tab="author"><i class="fa-solid fa-upload"></i> Upload author icon<input id="layoutAuthorIconFile" type="file" accept="image/*"></label>
                  <label class="dash-input" data-field-tab="thumbnail"><span>Thumbnail URL</span><input id="layoutThumbnail" value="${esc(initial.thumbnail)}"></label><label class="upload-button thumbnail-upload-row" data-field-tab="thumbnail"><i class="fa-solid fa-upload"></i> Upload thumbnail<input id="layoutThumbnailFile" type="file" accept="image/*"></label>
                  <label class="dash-input" data-field-tab="footer"><span>Footer text</span><input id="layoutFooterText" maxlength="32" value="${esc(initial.footerText)}"></label>
                  <label class="dash-input" data-field-tab="footer"><span>Footer icon URL</span><input id="layoutFooterIcon" value="${esc(initial.footerIcon)}"></label><label class="upload-button thumbnail-upload-row" data-field-tab="footer"><i class="fa-solid fa-upload"></i> Upload footer icon<input id="layoutFooterIconFile" type="file" accept="image/*"></label>
                  <div class="color-editor" data-field-tab="color">
                    <div class="color-stage" id="colorStage"><span id="colorHandle"></span></div>
                    <div class="color-hue" id="colorHue"><span id="hueHandle"></span></div>
                    <strong>HEX COLOR</strong><input id="layoutColor" value="${esc(initial.color)}" maxlength="7">
                  </div>
                </div>
              </div>
              <div class="editor-actions"><button class="btn ghost liquid" id="exitThemeEditor">Exit</button><div class="editor-action-right"><button class="round-action" id="resetLayout" title="Reset"><i class="fa-solid fa-rotate-left"></i></button><button class="round-action" id="saveOnly" title="Save"><i class="fa-solid fa-floppy-disk"></i></button><button class="btn primary liquid ${s.plus ? '' : 'locked-plus-action'}" id="saveSettings">Save & Apply</button></div></div>
            </div>
            <div class="appearance-preview"><div class="discord-customize-preview"><div class="reply-line"><span></span><img src="${esc(data.user.avatarUrl)}" alt=""><strong>${esc(data.user.globalName || data.user.username)}</strong> ${esc(t('customizing'))}</div><div class="discord-message"><img class="discord-bot-avatar" src="${defaultIcon}" alt=""><div class="discord-message-main"><div class="discord-meta"><strong>leaf</strong><span class="verified-app">APP</span><span id="previewTime">${esc(t('today'))} ${esc(currentTime)}</span></div><div class="discord-embed-preview" id="embedPreview"><div class="embed-author"><img id="previewAuthorIcon" src="${esc(initial.authorIcon)}" alt=""><span id="previewAuthor">${esc(initial.authorName)}</span></div><h3 id="previewTitle">leaf</h3><p id="previewDescription">${esc(t('desc'))}</p><img id="previewThumb" class="embed-thumb" src="${esc(initial.thumbnail)}" alt=""><div class="embed-footer"><img id="previewFooterIcon" src="${esc(initial.footerIcon)}" alt=""><span id="previewFooter">${esc(initial.footerText)}</span></div></div></div></div></div></div>
          </div>
        </section>
        <section class="dash-pane ${settingsPane==='economy'?'active':''}" data-pane-view="economy">
          <h2 class="gradient-text">Economy</h2>
          <p class="card-muted">Claim rewards and manage your wallet without leaving the dashboard.</p>
          <div class="economy-grid">
            <div class="economy-card liquid-card"><div id="ecoPreview" class="eco-preview">Loading economy...</div><div class="eco-transfer"><input id="ecoAmount" inputmode="numeric" autocomplete="off" placeholder="Amount"><div class="eco-transfer-buttons"><button class="btn ghost liquid" data-eco-action="deposit" data-transfer-cd="deposit" data-label="Deposit">Deposit</button><button class="btn ghost liquid" data-eco-action="withdraw" data-transfer-cd="withdraw" data-label="Withdraw">Withdraw</button></div></div></div>
            <div class="eco-claims" id="ecoClaims"></div>
          </div>
        </section>
        <section class="dash-pane ${settingsPane==='level'?'active':''}" data-pane-view="level">
          <h2 class="gradient-text">Level</h2>
          <p class="card-muted">Customize how your /level command looks and who can see it.</p>
          <div class="level-settings-grid">
            <div class="level-controls liquid-card">
              <label class="toggle-row"><span><strong>Image card</strong><small>Show the full generated level image. Turn off for text-only embed.</small></span><input type="checkbox" id="levelCardToggle" ${s.rank?.card !== false ? 'checked' : ''}></label>
              <div class="level-image-options" id="levelImageOptions">
                <label class="dash-input"><span>Background image URL</span><input id="levelBackground" placeholder="https://.../image.png" value="${esc(s.rank?.background || '')}"></label>
                <div class="upload-row"><label class="upload-button liquid"><i class="fa-solid fa-upload"></i><span>Upload background</span><input id="levelBackgroundFile" type="file" accept="image/*"></label><small>Recommended: 1000 x 333 px or wider.</small></div>
              </div>
              <label class="toggle-row"><span><strong>Show level</strong><small>Display your level number on the card/embed.</small></span><input type="checkbox" id="levelShowLevel" ${s.rank?.showLevel !== false ? 'checked' : ''}></label>
              <label class="toggle-row"><span><strong>Show XP</strong><small>Display XP numbers and progress.</small></span><input type="checkbox" id="levelShowXP" ${s.rank?.showXP !== false ? 'checked' : ''}></label>
              <label class="toggle-row"><span><strong>Public level</strong><small>Allow other users to view your level.</small></span><input type="checkbox" id="levelVisibility" ${s.rank?.visibility !== 'private' ? 'checked' : ''}></label>
              <div class="level-actions"><button class="btn ghost liquid" id="resetLevelSettings"><i class="fa-solid fa-rotate-left"></i>Reset</button><button class="btn primary liquid" id="saveLevelSettings"><i class="fa-solid fa-floppy-disk"></i>Save Level</button></div>
            </div>
            <div class="level-preview-wrap"><div class="discord-customize-preview level-discord-preview"><div class="reply-line level-reply-line"><span></span><img src="${esc(data.user.avatarUrl)}" alt=""><strong>${esc(data.user.globalName || data.user.username)}</strong><em>${esc(t('used'))}</em><b class="command-pill level-command-pill"><svg class="level-command-icon" aria-hidden="true" role="img" xmlns="http://www.w3.org/2000/svg" width="10" height="10" fill="none" viewBox="0 0 24 24"><path fill="currentColor" d="M2.06 7.61c-.25.95.31 1.92 1.26 2.18l4.3 1.15c.94.25 1.91-.31 2.17-1.26l1.15-4.3c.25-.94-.31-1.91-1.26-2.17l-4.3-1.15c-.94-.25-1.91.31-2.17 1.26l-1.15 4.3ZM12.98 7.87a2 2 0 0 0 1.75 2.95H20a2 2 0 0 0 1.76-2.95l-2.63-4.83a2 2 0 0 0-3.51 0l-2.63 4.83ZM5.86 13.27a.89.89 0 0 1 1.28 0l.75.77a.9.9 0 0 0 .54.26l1.06.12c.5.06.85.52.8 1.02l-.13 1.08c-.02.2.03.42.14.6l.56.92c.27.43.14 1-.28 1.26l-.9.58a.92.92 0 0 0-.37.48l-.36 1.02a.9.9 0 0 1-1.15.57l-1-.36a.89.89 0 0 0-.6 0l-1 .36a.9.9 0 0 1-1.15-.57l-.36-1.02a.92.92 0 0 0-.37-.48l-.9-.58a.93.93 0 0 1-.28-1.26l.56-.93c.11-.17.16-.38.14-.59l-.12-1.08c-.06-.5.3-.96.8-1.02l1.05-.12a.9.9 0 0 0 .54-.26l.75-.77ZM18.52 13.71a1.1 1.1 0 0 0-2.04 0l-.46 1.24c-.19.5-.57.88-1.07 1.07l-1.24.46a1.1 1.1 0 0 0 0 2.04l1.24.46c.5.19.88.57 1.07 1.07l.46 1.24c.35.95 1.7.95 2.04 0l.46-1.24c.19-.5.57-.88 1.07-1.07l1.24-.46a1.1 1.1 0 0 0 0-2.04l-1.24-.46a1.8 1.8 0 0 1-1.07-1.07l-.46-1.24Z"></path></svg>level</b></div><div class="level-preview-shell" id="levelPreviewShell"></div></div></div>
          </div>
        </section>
        <section class="dash-pane ${settingsPane==='general'?'active':''}" data-pane-view="general">
          <h2 class="gradient-text">General</h2>
          <p class="card-muted">Control leaf reply behavior, bot DMs, and NSFW access.</p>
          <div class="general-grid">
            <label class="toggle-row liquid-card"><span><strong>Agent mode</strong><small>When enabled, command replies are private/ephemeral where possible.</small></span><input type="checkbox" id="agentToggle" ${s.general?.agent?.enabled !== false ? 'checked' : ''}></label>
            <label class="toggle-row liquid-card"><span><strong>Bot DMs</strong><small>Allow other users to DM you through leaf.</small></span><input type="checkbox" id="dmToggle" ${s.general?.dm?.enabled !== false ? 'checked' : ''}></label>
            <label class="toggle-row liquid-card"><span><strong>NSFW commands</strong><small>Allow NSFW commands for your own account.</small></span><input type="checkbox" id="nsfwToggle" ${s.general?.nsfw?.enabled ? 'checked' : ''}></label>
            <label class="toggle-row liquid-card"><span><strong>Avatar history</strong><small>Allow other users to view your saved avatar history.</small></span><input type="checkbox" id="avatarHistoryToggle" ${s.general?.avatarHistory?.public !== false ? 'checked' : ''}></label>
          </div>
        </section>
        <section class="dash-pane ${settingsPane==='account'?'active':''}" data-pane-view="account">
          <h2 class="gradient-text">Account</h2>
          <div class="account-list" id="accountList"></div>
          <div class="account-actions"><a class="btn ghost liquid" href="/auth/discord"><i class="fi fi-brands-discord"></i>Add account</a><button class="btn ghost liquid" id="logoutConfirm">Logout</button></div>
        </section>
        ${data.user.admin ? `<section class="dash-pane ${settingsPane==='admin'?'active':''}" data-pane-view="admin"><h2 class="gradient-text admin-title">Admin</h2><p class="card-muted">Admin dashboard tools will live here after login setup is finished.</p><div class="admin-grid"><div class="mini-stat"><strong>${fmt(boot.stats.commands)} <small>(${fmt(boot.stats.actions || 0)} Actions)</small></strong><span>Commands</span></div><div class="mini-stat"><strong>${fmt(boot.stats.users)}</strong><span>Users</span></div></div></section>` : ''}
      </main>
    </div>
  </section>`;

  let selectedLayout = s.layout || '';
  let equippedLayout = s.layout || '';
  let layoutTab = 'own';
  let layoutSort = 'used';
  let layoutQuery = '';
  let customDirty = false;
  let defaultReset = false;
  let editingLayoutId = '';
  let layouts = s.layouts.slice();
  const updatePanes = () => {
    document.querySelectorAll('.dash-tab').forEach(tab => tab.classList.toggle('active', tab.dataset.pane === settingsPane));
    document.querySelectorAll('.dash-pane').forEach(pane => pane.classList.toggle('active', pane.dataset.paneView === settingsPane));
    document.querySelector('.dashboard-shell')?.classList.toggle('appearance-open', settingsPane === 'appearance');
  };
  const readCustom = () => ({
    color: document.querySelector('#layoutColor')?.value || '#424242',
    authorName: document.querySelector('#layoutAuthorName')?.value || '',
    authorIcon: document.querySelector('#layoutAuthorIcon')?.value || '',
    footerText: document.querySelector('#layoutFooterText')?.value || '',
    footerIcon: document.querySelector('#layoutFooterIcon')?.value || '',
    thumbnail: document.querySelector('#layoutThumbnail')?.value || '',
  });
  const writeCustom = l => {
    document.querySelector('#layoutColor').value = l.color || '#424242';
    document.querySelector('#layoutAuthorName').value = l.author?.name || l.authorName || '';
    document.querySelector('#layoutAuthorIcon').value = l.author?.icon_url || l.authorIcon || '';
    document.querySelector('#layoutFooterText').value = l.footer?.text || l.footerText || '';
    document.querySelector('#layoutFooterIcon').value = l.footer?.icon_url || l.footerIcon || '';
    document.querySelector('#layoutThumbnail').value = l.thumbnail?.url || l.thumbnail || defaultIcon;
    customDirty = false;
    preview();
  };
  const validPreviewUrl = value => /^https?:\/\//i.test(String(value || '')) || String(value || '').startsWith('/assets/');
  const preview = () => {
    const l = readCustom();
    const color = /^#[0-9a-f]{6}$/i.test(l.color) ? l.color : '#424242';
    document.querySelector('#embedPreview').style.borderLeftColor = color;
    document.querySelector('#previewTitle').textContent = 'leaf';
    const authorRow = document.querySelector('.embed-author');
    const footerRow = document.querySelector('.embed-footer');
    const authorHasIcon = validPreviewUrl(l.authorIcon);
    const footerHasIcon = validPreviewUrl(l.footerIcon);
    const authorText = (l.authorName || '').trim();
    const footerText = (l.footerText || '').trim();
    authorRow?.classList.toggle('hidden', !authorText);
    footerRow?.classList.toggle('hidden', !footerText);
    document.querySelector('#previewAuthor').textContent = authorText;
    document.querySelector('#previewFooter').textContent = footerText;
    const authorImg = document.querySelector('#previewAuthorIcon');
    const footerImg = document.querySelector('#previewFooterIcon');
    if (authorImg) { authorImg.classList.toggle('hidden', !authorText || !authorHasIcon); if (authorText && authorHasIcon) authorImg.src = l.authorIcon; }
    if (footerImg) { footerImg.classList.toggle('hidden', !footerText || !footerHasIcon); if (footerText && footerHasIcon) footerImg.src = l.footerIcon; }
    document.querySelector('#previewThumb').classList.toggle('hidden', !validPreviewUrl(l.thumbnail));
    if (validPreviewUrl(l.thumbnail)) document.querySelector('#previewThumb').src = l.thumbnail;
  };
  const toast = (msg, type = 'success') => {
    const box = document.querySelector('#toastStack') || document.body.appendChild(Object.assign(document.createElement('div'), { id: 'toastStack' }));
    const node = document.createElement('div');
    node.className = `toast ${type}`;
    node.textContent = msg;
    box.appendChild(node);
    requestAnimationFrame(() => node.classList.add('show'));
    setTimeout(() => { node.classList.remove('show'); setTimeout(() => node.remove(), 220); }, 2600);
  };
  const levelState = () => ({
    card: document.querySelector('#levelCardToggle')?.checked !== false,
    background: (document.querySelector('#levelBackground')?.value || '').trim() || null,
    showLevel: document.querySelector('#levelShowLevel')?.checked !== false,
    showXP: document.querySelector('#levelShowXP')?.checked !== false,
    visibility: document.querySelector('#levelVisibility')?.checked ? 'everyone' : 'private',
  });
  const levelStats = s.rank?.stats || { level: 0, rank: 0, currentXP: 0, requiredXP: 1, progressPercent: 0, title: 'User' };
  const levelPreviewUrl = () => { const st = levelState(); const q = new URLSearchParams({ card: String(st.card), showXP: String(st.showXP), showLevel: String(st.showLevel), visibility: st.visibility, t: String(Date.now()) }); if (st.background) q.set('background', st.background); return '/api/level-preview.png?' + q.toString(); };
  const renderLevelPreview = () => {
    const shell = document.querySelector('#levelPreviewShell'); if (!shell) return;
    const st = levelState(); document.querySelector('#levelImageOptions')?.classList.toggle('locked', !st.card);
    if (st.card) { shell.innerHTML = '<div class="discord-message level-image-message"><img class="discord-bot-avatar" src="' + defaultIcon + '" alt=""><div class="discord-message-main"><div class="discord-meta"><strong>leaf</strong><span class="verified-app">APP</span><span>' + esc(t('today')) + ' ' + new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) + '</span></div><img class="level-card-preview" src="' + levelPreviewUrl() + '" alt="Level preview"></div></div>'; return; }
    const color = (document.querySelector('#layoutColor')?.value || s.layouts?.find(l => l.id === s.layout)?.color || '#7b808a');
    const progress = Math.max(0, Math.min(10, Math.round(Number(levelStats.progressPercent || 0) / 10))); const fields = [];
    if (st.showLevel) fields.push('<div><strong>Level</strong><span>' + esc(levelStats.level || 0) + '</span></div>');
    if (st.showXP) fields.push('<div><strong>XP</strong><span>' + esc(fmt(levelStats.currentXP || 0)) + ' / ' + esc(fmt(levelStats.requiredXP || 1)) + ' XP</span></div><div class="wide"><strong>Progress</strong><span>' + String.fromCharCode(0x25B0).repeat(progress) + String.fromCharCode(0x25B1).repeat(10-progress) + ' ' + esc(levelStats.progressPercent || 0) + '%</span></div>');
    shell.innerHTML = '<div class="discord-message level-text-message"><img class="discord-bot-avatar" src="' + defaultIcon + '" alt=""><div class="discord-message-main"><div class="discord-meta"><strong>leaf</strong><span class="verified-app">APP</span><span>' + esc(t('today')) + ' ' + new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) + '</span></div><div class="discord-embed-preview level-text-embed" style="border-left-color:' + esc(color) + '"><div class="embed-author"><img src="' + esc(data.user.avatarUrl) + '" alt=""><span>' + esc(data.user.username) + '</span></div><h3>' + esc(t('level')) + '</h3><p><b>' + esc(t('title')) + ':</b> ' + esc(levelStats.title || 'User') + '<br><b>' + esc(t('rank')) + ':</b> #' + esc(levelStats.rank || 0) + '<br><b>' + esc(t('presence')) + ':</b> ' + esc(t('online')) + '</p><div class="level-fields">' + fields.join('') + '</div><img class="embed-thumb" src="' + esc(data.user.avatarUrl) + '" alt=""><div class="embed-footer"><img src="' + defaultIcon + '" alt=""><span>Level System</span></div></div></div></div>';
  };
  const refreshSettings = fresh => {
    if (!fresh?.settings) return;
    layouts = fresh.settings.layouts || layouts;
    if (Object.prototype.hasOwnProperty.call(fresh.settings, 'layout')) { s.layout = fresh.settings.layout || ''; equippedLayout = fresh.settings.layout || ''; selectedLayout = fresh.settings.layout || selectedLayout || ''; }
    const active = layouts.find(l => l.id === equippedLayout);
    document.querySelector('#activeThemeName') && (document.querySelector('#activeThemeName').textContent = active?.name || 'leaf Default');
    document.querySelector('#defaultThemeReset')?.classList.toggle('hidden', !equippedLayout);
    renderLayouts();
  };
  const ensurePlusForAppearance = () => {
    if (s.plus) return true;
    openPlansModal();
    toast('Appearance is a Plus feature', 'error');
    return false;
  };
  const askSwitchLayout = id => {
    modalShell(`<button class="modal-x" data-modal-close>x</button><h2 class="gradient-text">Theme exists</h2><p class="modal-sub">Theme id: #${esc(id)} uses this theme already. Switch to that theme instead?</p><div class="modal-actions"><button class="btn ghost liquid" data-modal-close>Cancel</button><button class="btn primary liquid" id="switchExistingLayout">Switch theme</button></div>`, true);
    document.querySelectorAll('[data-modal-close]').forEach(btn => btn.addEventListener('click', closeModal));
    document.querySelector('#switchExistingLayout').addEventListener('click', async () => {
      try {
        const fresh = await api('/api/layouts/apply', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) });
        closeModal();
        refreshSettings(fresh);
        toast('Theme applied');
      } catch {
        toast('Could not apply theme', 'error');
      }
    });
  };
  const openLayoutNameModal = apply => {
    modalShell(`<button class="modal-x" data-modal-close>x</button><h2 class="gradient-text">${apply ? 'Save & Apply' : 'Save Theme'}</h2><p class="modal-sub">Choose a name for this theme. If the same design already exists, leaf will tell you which theme owns it.</p><label class="modal-field"><span>Theme name</span><input id="newLayoutName" maxlength="32" placeholder="leaf Theme"></label><div class="modal-actions"><button class="btn ghost liquid" data-modal-close>Cancel</button><button class="btn primary liquid" id="confirmLayoutSave">${apply ? 'Save & Apply' : 'Save'}</button></div>`, true);
    document.querySelectorAll('[data-modal-close]').forEach(btn => btn.addEventListener('click', closeModal));
    document.querySelector('#newLayoutName')?.focus();
    document.querySelector('#confirmLayoutSave').addEventListener('click', async () => {
      const name = document.querySelector('#newLayoutName').value.trim();
      if (!ensurePlusForAppearance()) return;
      if (!name) return toast('Enter a theme name', 'error');
      try {
        const fresh = await api('/api/layouts/save', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, layout: readCustom(), apply }),
        });
        closeModal();
        refreshSettings(fresh);
        customDirty = false;
        toast(apply ? 'Theme saved and applied' : 'Theme saved');
        document.querySelector('#appearanceFrame')?.classList.remove('editing');
        document.querySelector('#themeEditor')?.classList.add('hidden');
        document.querySelector('#themeHome')?.classList.remove('hidden');
      } catch (err) {
        let body = {};
        try { body = JSON.parse(err.message); } catch {}
        closeModal();
        if (body.error === 'duplicate_layout') return askSwitchLayout(body.id);
        toast(body.message || 'Could not save theme', 'error');
      }
    });
  };
  const themeDate = l => {
    const value = l.updated_at || l.created_at || l.uploaded_at;
    const date = value ? new Date(value) : new Date();
    return date.toLocaleDateString([], { day: '2-digit', month: 'long', year: 'numeric' }) + ', at ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
  };
  const isMine = l => String(l.creator_id || '') === String(data.user.id);
  const byLine = l => l.creator_name ? '@' + l.creator_name : (l.creator_id ? l.creator_id : 'leaf');
  const renderLayouts = () => {
    const ownLayouts = layouts.filter(isMine);
    const communityLayouts = layouts.filter(l => l.public !== false);
    const savedLayouts = layouts.filter(l => l.saved || isMine(l));
    const all = layoutTab === 'own' ? ownLayouts : layoutTab === 'saved' ? savedLayouts : communityLayouts;
    const q = layoutQuery.trim().toLowerCase();
    const rows = all.filter(l => {
      if (!q) return true;
      const creatorId = String(l.creator_id || '').toLowerCase();
      const creatorName = String(l.creator_name || '').toLowerCase();
      const layoutName = String(l.name || '').toLowerCase();
      if (q.startsWith('@')) { const who = q.slice(1); return creatorName.includes(who) || creatorId.includes(who); }
      return layoutName.includes(q) || creatorName.includes(q) || creatorId.includes(q);
    }).sort((a,b) => layoutSort === 'name' ? String(a.name || '').localeCompare(String(b.name || '')) : Number(b.uses || 0) - Number(a.uses || 0));
    const countNode = document.querySelector('#themeCount');
    const labelNode = document.querySelector('.theme-count span');
    if (countNode) countNode.textContent = fmt(rows.length);
    if (labelNode) labelNode.textContent = layoutTab === 'own' ? 'My Themes' : layoutTab === 'saved' ? 'Saved Themes' : 'Available Themes';
    const list = document.querySelector('#layoutList');
    if (!list) return;
    list.innerHTML = rows.map(l => {
      const mine = isMine(l);
      const active = equippedLayout === l.id;
      const previewing = selectedLayout === l.id;
      const meta = layoutTab === 'own' && mine ? themeDate(l) : `By: ${esc(byLine(l))}`;
      const showOwnerActions = layoutTab === 'own' && mine;
      const applyLabel = active ? 'Applied' : 'Apply';
      const applyClass = active ? 'theme-apply is-applied' : 'theme-apply';
      const actions = showOwnerActions ? `<button class="${applyClass}" data-theme-apply="${esc(l.id)}">${applyLabel}</button><button class="theme-menu-btn" data-theme-menu="${esc(l.id)}"><i class="fa-solid fa-ellipsis-vertical"></i></button>` : layoutTab === 'saved' ? `<button class="${applyClass}" data-theme-apply="${esc(l.id)}">${applyLabel}</button><button class="theme-unsave" data-theme-remove-saved="${esc(l.id)}" title="Remove from saved"><img src="/assets/icons/unfavorite.png" alt=""></button>` : `<button class="theme-get" data-theme-get="${esc(l.id)}">Get</button>`;
      return `<div class="layout-tile theme-row ${previewing?'active':''}" data-layout="${esc(l.id)}" style="--layout-color:${esc(l.color || '#7b808a')}"><div class="layout-main"><strong><span>${esc(l.name)}</span>${active ? '<span class="theme-active-badge">Active</span>' : ''}</strong><small>${meta}</small></div><div class="theme-row-actions">${actions}</div></div>`;
    }).join('') || '<p class="card-muted">No themes found.</p>';
  };
  const renderAccounts = () => {
    const key = 'leaf_accounts';
    const current = {
      id: data.user.id,
      name: data.user.globalName || data.user.username,
      username: data.user.username,
      avatarUrl: data.user.avatarUrl,
      plus: Boolean(s.plus),
    };
    const stored = JSON.parse(localStorage.getItem(key) || '[]').filter(a => a?.id && a.id !== current.id);
    const accounts = [current, ...stored].slice(0, 8);
    localStorage.setItem(key, JSON.stringify(accounts));
    const list = document.querySelector('#accountList');
    if (!list) return;
    list.innerHTML = accounts.map(account => `<div class="account-card ${account.id === current.id ? 'active' : ''}" data-account="${esc(account.id)}"><img src="${esc(account.avatarUrl || defaultIcon)}" alt=""><div><strong>${esc(account.name || account.username || 'Discord User')}${account.plus ? `<span class="plus-mark" title="Plus">${ICONS.plus}</span>` : ''}</strong><span>${esc(account.id)}</span></div>${account.id === current.id ? '<small>Current</small>' : `<button class="remove-account" data-remove-account="${esc(account.id)}">Remove</button>`}</div>`).join('');
  };
  document.querySelectorAll('.dash-tab').forEach(tab => tab.addEventListener('click', () => { settingsPane = tab.dataset.pane; updatePanes(); }));
  renderAccounts();
  document.querySelector('#accountList')?.addEventListener('click', e => {
    const remove = e.target.closest('[data-remove-account]');
    if (!remove) return;
    const key = 'leaf_accounts';
    const accounts = JSON.parse(localStorage.getItem(key) || '[]').filter(a => a.id !== remove.dataset.removeAccount);
    localStorage.setItem(key, JSON.stringify(accounts));
    renderAccounts();
    toast('Account removed');
  });
  document.querySelector('#logoutConfirm')?.addEventListener('click', () => {
    modalShell(`<button class="modal-x" data-modal-close>x</button><h2 class="gradient-text">Logout?</h2><p class="modal-sub">Are you sure you want to logout from this dashboard session?</p><div class="modal-actions"><button class="btn ghost liquid" data-modal-close>Cancel</button><a class="btn primary liquid" href="/logout">Logout</a></div>`, true);
    document.querySelectorAll('[data-modal-close]').forEach(btn => btn.addEventListener('click', closeModal));
  });
  document.querySelectorAll('[data-lang]').forEach(btn => btn.addEventListener('click', async () => {
    selectedLanguage = btn.dataset.lang;
    document.querySelectorAll('[data-lang]').forEach(x=>x.classList.toggle('active', x===btn));
    setLoading(true);
    try {
      await api('/api/settings',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({ language:selectedLanguage })});
      preview();
      renderLevelPreview();
      if (economyCache) drawEconomy(economyCache);
      toast('Language saved');
    } catch {
      toast('Could not save language', 'error');
    } finally {
      setLoading(false);
    }
  }));
  ['#levelCardToggle','#levelBackground','#levelShowLevel','#levelShowXP','#levelVisibility'].forEach(sel => document.querySelector(sel)?.addEventListener('input', renderLevelPreview));
  document.querySelector('#saveLevelSettings')?.addEventListener('click', async () => { setLoading(true); try { const fresh = await api('/api/settings',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({ rank: levelState() })}); s.rank = fresh.settings?.rank || s.rank; toast('Level settings saved'); renderLevelPreview(); } catch { toast('Could not save level settings', 'error'); } finally { setLoading(false); } });
  document.querySelector('#resetLevelSettings')?.addEventListener('click', () => { modalShell('<button class="modal-x" data-modal-close>x</button><h2 class="gradient-text">Reset Level?</h2><p class="modal-sub">This resets your level card, background, visibility, XP, and level display settings.</p><div class="modal-actions"><button class="btn ghost liquid" data-modal-close>Cancel</button><button class="btn primary liquid" id="confirmLevelReset">Reset</button></div>', true); document.querySelectorAll('[data-modal-close]').forEach(btn => btn.addEventListener('click', closeModal)); document.querySelector('#confirmLevelReset')?.addEventListener('click', async () => { try { const fresh = await api('/api/settings',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({ rankReset: true })}); closeModal(); s.rank = fresh.settings?.rank || s.rank; document.querySelector('#levelCardToggle').checked = true; document.querySelector('#levelBackground').value = ''; document.querySelector('#levelShowLevel').checked = true; document.querySelector('#levelShowXP').checked = true; document.querySelector('#levelVisibility').checked = true; renderLevelPreview(); toast('Level settings reset'); } catch { toast('Could not reset level settings', 'error'); } }); });
  document.querySelector('#levelBackgroundFile')?.addEventListener('change', async e => { const file = e.target.files?.[0]; if (!file) return; setLoading(true); try { const form = new FormData(); form.append('file', file); const uploaded = await api('/api/upload-image', { method: 'POST', body: form }); document.querySelector('#levelBackground').value = uploaded.url; renderLevelPreview(); toast('Background uploaded'); } catch { toast('Could not upload image', 'error'); } finally { setLoading(false); e.target.value = ''; } });
  document.querySelector('#layoutThumbnailFile')?.addEventListener('change', async e => { const file = e.target.files?.[0]; if (!file) return; setLoading(true); try { const form = new FormData(); form.append('file', file); const uploaded = await api('/api/upload-image', { method: 'POST', body: form }); document.querySelector('#layoutThumbnail').value = uploaded.url; markCustom(); toast('Thumbnail uploaded'); } catch { toast('Could not upload thumbnail', 'error'); } finally { setLoading(false); e.target.value = ''; } });
  const bindThemeImageUpload = (fileSelector, inputSelector, label) => document.querySelector(fileSelector)?.addEventListener('change', async e => { const file = e.target.files?.[0]; if (!file) return; setLoading(true); try { const form = new FormData(); form.append('file', file); const uploaded = await api('/api/upload-image', { method: 'POST', body: form }); document.querySelector(inputSelector).value = uploaded.url; markCustom(); toast(label + ' uploaded'); } catch { toast('Could not upload ' + label.toLowerCase(), 'error'); } finally { setLoading(false); e.target.value = ''; } });
  bindThemeImageUpload('#layoutAuthorIconFile', '#layoutAuthorIcon', 'Author icon');
  bindThemeImageUpload('#layoutFooterIconFile', '#layoutFooterIcon', 'Footer icon');
  const saveGeneralToggle = async (key, enabled) => {
    setLoading(true);
    try {
      await api('/api/settings',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({ general: { [key]: { enabled } } })});
      toast((key === 'agent' ? 'Agent mode' : key === 'dm' ? 'Bot DMs' : key === 'avatarHistory' ? 'Avatar history' : 'NSFW commands') + (enabled ? ' enabled' : ' disabled'));
    } catch { toast('Could not save general setting', 'error'); }
    finally { setLoading(false); }
  };
  document.querySelector('#agentToggle')?.addEventListener('change', e => saveGeneralToggle('agent', e.target.checked));
  document.querySelector('#dmToggle')?.addEventListener('change', e => saveGeneralToggle('dm', e.target.checked));
  document.querySelector('#nsfwToggle')?.addEventListener('change', e => saveGeneralToggle('nsfw', e.target.checked));
  document.querySelector('#avatarHistoryToggle')?.addEventListener('change', e => saveGeneralToggle('avatarHistory', e.target.checked));

  let economyCache = null;
  let economyTimer = null;
  let lastTransferAt = 0;
  const localClaimCooldowns = {};
  const claimCooldownMs = { daily: 86400000, bonus: 21600000, monthlyplus: 2592000000 };
  const ecoCommandIcon = '<svg class="level-command-icon" aria-hidden="true" role="img" xmlns="http://www.w3.org/2000/svg" width="10" height="10" fill="none" viewBox="0 0 24 24"><path fill="currentColor" d="M2.06 7.61c-.25.95.31 1.92 1.26 2.18l4.3 1.15c.94.25 1.91-.31 2.17-1.26l1.15-4.3c.25-.94-.31-1.91-1.26-2.17l-4.3-1.15c-.94-.25-1.91.31-2.17 1.26l-1.15 4.3ZM12.98 7.87a2 2 0 0 0 1.75 2.95H20a2 2 0 0 0 1.76-2.95l-2.63-4.83a2 2 0 0 0-3.51 0l-2.63 4.83ZM5.86 13.27a.89.89 0 0 1 1.28 0l.75.77a.9.9 0 0 0 .54.26l1.06.12c.5.06.85.52.8 1.02l-.13 1.08c-.02.2.03.42.14.6l.56.92c.27.43.14 1-.28 1.26l-.9.58a.92.92 0 0 0-.37.48l-.36 1.02a.9.9 0 0 1-1.15.57l-1-.36a.89.89 0 0 0-.6 0l-1 .36a.9.9 0 0 1-1.15-.57l-.36-1.02a.92.92 0 0 0-.37-.48l-.9-.58a.93.93 0 0 1-.28-1.26l.56-.93c.11-.17.16-.38.14-.59l-.12-1.08c-.06-.5.3-.96.8-1.02l1.05-.12a.9.9 0 0 0 .54-.26l.75-.77ZM18.52 13.71a1.1 1.1 0 0 0-2.04 0l-.46 1.24c-.19.5-.57.88-1.07 1.07l-1.24.46a1.1 1.1 0 0 0 0 2.04l1.24.46c.5.19.88.57 1.07 1.07l.46 1.24c.35.95 1.7.95 2.04 0l.46-1.24c.19-.5.57-.88 1.07-1.07l1.24-.46a1.1 1.1 0 0 0 0-2.04l-1.24-.46a1.8 1.8 0 0 1-1.07-1.07l-.46-1.24Z"></path></svg>';
  const durationFull = ms => {
    const total = Math.max(0, Math.ceil(Number(ms || 0) / 1000));
    const d = Math.floor(total / 86400);
    const h = Math.floor((total % 86400) / 3600);
    const m = Math.floor((total % 3600) / 60);
    const sec = total % 60;
    const pad = n => String(n).padStart(2, '0');
    return pad(d) + 'd ' + pad(h) + 'h ' + pad(m) + 'm ' + pad(sec) + 's';
  };
  const shortMoney = n => {
    n = Number(n || 0);
    const sign = n < 0 ? '-' : '';
    n = Math.abs(n);
    const units = [['q',1e15],['t',1e12],['b',1e9],['m',1e6],['k',1e3]];
    for (const [suffix, size] of units) if (n >= size) return sign + (Math.floor((n / size) * 100) / 100).toLocaleString('en-US', { maximumFractionDigits: 2 }) + suffix;
    return sign + Math.floor(n).toLocaleString('en-US');
  };
  const currentTheme = () => ({
    color: document.querySelector('#layoutColor')?.value || initial.color || '#424242',
    authorName: (document.querySelector('#layoutAuthorName')?.value || initial.authorName || '').trim(),
    authorIcon: (document.querySelector('#layoutAuthorIcon')?.value || initial.authorIcon || '').trim(),
    footerText: (document.querySelector('#layoutFooterText')?.value || initial.footerText || '').trim(),
    footerIcon: (document.querySelector('#layoutFooterIcon')?.value || initial.footerIcon || '').trim(),
    thumbnail: (document.querySelector('#layoutThumbnail')?.value || '').trim(),
  });
  const themeImage = value => validPreviewUrl(String(value || ''));
  const updateEconomyCountdowns = () => {
    document.querySelectorAll('[data-transfer-cd]').forEach(btn => {
      const left = Math.max(0, 1000 - (Date.now() - lastTransferAt));
      btn.disabled = left > 0;
      btn.textContent = left > 0 ? durationFull(left) : (btn.dataset.label || btn.textContent);
    });
  };
  const drawEconomy = eco => {
    const total = Number(eco.total || 0).toLocaleString('en-US') + ' Cash';
    const theme = currentTheme();
    const authorText = theme.authorName.trim();
    const footerText = theme.footerText.trim();
    const authorHtml = authorText ? '<div class="embed-author">' + (themeImage(theme.authorIcon) ? '<img src="' + esc(theme.authorIcon) + '" alt="">' : '') + '<span>' + esc(authorText) + '</span></div>' : '';
    const footerHtml = footerText ? '<div class="embed-footer">' + (themeImage(theme.footerIcon) ? '<img src="' + esc(theme.footerIcon) + '" alt="">' : '') + '<span>' + esc(footerText) + '</span></div>' : '';
    const thumbHtml = themeImage(theme.thumbnail) ? '<img class="embed-thumb" src="' + esc(theme.thumbnail) + '" alt="">' : '';
    document.querySelector('#ecoPreview').innerHTML = '<div class="discord-customize-preview eco-discord-preview"><div class="reply-line level-reply-line eco-reply"><span></span><img src="' + esc(data.user.avatarUrl) + '" alt=""><strong>' + esc(data.user.globalName || data.user.username) + '</strong><em>' + esc(t('used')) + '</em><b class="command-pill level-command-pill">' + ecoCommandIcon + 'eco bal</b></div><div class="level-text-message eco-message"><img class="discord-bot-avatar" src="/assets/leaf_no_bg.png" alt=""><div class="discord-message-main"><div class="discord-meta"><strong>leaf</strong><span class="verified-app">APP</span><span>' + esc(t('today')) + ' ' + new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) + '</span></div><div class="discord-embed-preview eco-embed ' + (thumbHtml ? 'has-thumb' : '') + '" style="border-left-color:' + esc(theme.color) + '">' + authorHtml + '<h3>' + esc(data.user.username) + '\'s ' + esc(t('net')) + '</h3><p class="eco-balance-list"><span>' + esc(t('wallet')) + ':</span> <strong>' + shortMoney(eco.cash) + ' Cash</strong><br><span>' + esc(t('bank')) + ':</span> <strong>' + shortMoney(eco.bank) + ' Cash</strong><br><span>' + esc(t('total')) + ':</span> <strong>' + total + '</strong></p>' + thumbHtml + footerHtml + '</div></div></div></div>';
    const claims = Object.entries(eco.claims || {}).filter(([,v]) => !v.hidden);
    document.querySelector('#ecoClaims').innerHTML = claims.map(([key, v]) => {
      const serverRemaining = Math.max(0, Number(v.remaining || 0));
      const localStarted = Number(localClaimCooldowns[key] || 0);
      const localRemaining = localStarted && claimCooldownMs[key] ? Math.max(0, claimCooldownMs[key] - (Date.now() - localStarted)) : 0;
      const remaining = Math.max(serverRemaining, localRemaining);
      const ready = !v.locked && v.ready !== false && remaining <= 0;
      const countdownMs = Math.max(remaining, 1000);
      const text = v.locked ? 'Requires Plus.' : ready ? 'Available now.' : 'On cooldown.';
      return '<article class="command-card liquid-card eco-claim ' + (key === 'monthlyplus' ? 'premium-command eco-plus-claim' : '') + '"><h3>' + esc(v.label) + '</h3><p>' + text + '</p><button class="btn primary liquid" data-eco-action="' + esc(key) + '" ' + (!ready ? 'disabled' : '') + '>' + (ready ? 'Claim' : 'On cooldown') + '</button></article>';
    }).join('');
    updateEconomyCountdowns();
  };
  const renderEconomy = async () => {
    try { economyCache = await api('/api/economy'); drawEconomy(economyCache); }
    catch { document.querySelector('#ecoPreview').textContent = 'Could not load economy.'; }
    if (!economyTimer) economyTimer = setInterval(updateEconomyCountdowns, 1000);
  };
  document.querySelector('#ecoAmount')?.addEventListener('input', e => { const raw = String(e.target.value || '').replace(/[^0-9]/g, ''); e.target.value = raw ? Number(raw).toLocaleString('en-US') : ''; });
  document.querySelector('[data-pane-view="economy"]')?.addEventListener('click', async e => {
    const btn = e.target.closest('[data-eco-action]');
    if (!btn) return;
    const action = btn.dataset.ecoAction;
    if (claimCooldownMs[action]) localClaimCooldowns[action] = Date.now();
    const amount = String(document.querySelector('#ecoAmount')?.value || '').replace(/[^0-9]/g, '');
    if ((action === 'deposit' || action === 'withdraw') && Date.now() - lastTransferAt < 1000) { toast('Transfer is on cooldown.', 'error'); return; }
    if (action === 'deposit' || action === 'withdraw') { lastTransferAt = Date.now(); updateEconomyCountdowns(); }
    setLoading(true);
    try { economyCache = await api('/api/economy', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ action, amount }) }); if (claimCooldownMs[action] && economyCache?.claims?.[action]) { economyCache.claims[action].ready = false; economyCache.claims[action].remaining = Math.max(Number(economyCache.claims[action].remaining || 0), claimCooldownMs[action]); } toast('Economy updated'); drawEconomy(economyCache); }
    catch (err) { let body={}; try{body=JSON.parse(err.message)}catch{} toast(body.error || 'Economy action failed', 'error'); try { economyCache = await api('/api/economy'); drawEconomy(economyCache); } catch { updateEconomyCountdowns(); } }
    finally { setLoading(false); }
  });
  ['#layoutColor','#layoutAuthorName','#layoutAuthorIcon','#layoutFooterText','#layoutFooterIcon','#layoutThumbnail'].forEach(sel => document.querySelector(sel)?.addEventListener('input', () => { if (economyCache) drawEconomy(economyCache); }));
  renderEconomy();

  renderLevelPreview();
  document.querySelectorAll('[data-edit-tab]').forEach(btn => btn.addEventListener('click', () => { document.querySelectorAll('[data-edit-tab]').forEach(x=>x.classList.toggle('active', x===btn)); document.querySelectorAll('[data-field-tab]').forEach(x=>x.classList.toggle('hidden', x.dataset.fieldTab !== btn.dataset.editTab)); }));
  document.querySelector('[data-edit-tab].active')?.click();
  let hue = 218;
  let sat = 90;
  let val = 95;
  const hsvToHex = (h, s, v) => {
    s /= 100; v /= 100;
    const c = v * s;
    const x = c * (1 - Math.abs((h / 60) % 2 - 1));
    const m = v - c;
    const rgb = h < 60 ? [c,x,0] : h < 120 ? [x,c,0] : h < 180 ? [0,c,x] : h < 240 ? [0,x,c] : h < 300 ? [x,0,c] : [c,0,x];
    return `#${rgb.map(n => Math.round((n + m) * 255).toString(16).padStart(2, '0')).join('')}`;
  };
  const setColorFromPicker = () => {
    const hex = hsvToHex(hue, sat, val);
    document.querySelector('#layoutColor').value = hex;
    document.querySelector('#colorStage').style.setProperty('--picker-hue', `hsl(${hue} 100% 50%)`);
    document.querySelector('#colorHandle').style.left = `${sat}%`;
    document.querySelector('#colorHandle').style.top = `${100 - val}%`;
    document.querySelector('#hueHandle').style.left = `${hue / 360 * 100}%`;
    defaultReset = false; customDirty = true; selectedLayout = ''; renderLayouts(); preview();
  };
  const bindDragColor = (node, move) => {
    if (!node) return;
    node.addEventListener('pointerdown', event => {
      node.setPointerCapture?.(event.pointerId);
      const onMove = e => move(e);
      const onUp = () => {
        document.removeEventListener('pointermove', onMove);
        document.removeEventListener('pointerup', onUp);
      };
      move(event);
      document.addEventListener('pointermove', onMove);
      document.addEventListener('pointerup', onUp);
    });
  };
  const markCustom = () => { defaultReset = false; customDirty = true; selectedLayout = ''; renderLayouts(); preview(); };
  document.querySelectorAll('[data-color]').forEach(btn => btn.addEventListener('click', () => { document.querySelector('#layoutColor').value = btn.dataset.color; markCustom(); }));
  bindDragColor(document.querySelector('#colorStage'), e => {
    const rect = document.querySelector('#colorStage').getBoundingClientRect();
    sat = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100));
    val = 100 - Math.max(0, Math.min(100, ((e.clientY - rect.top) / rect.height) * 100));
    setColorFromPicker();
  });
  bindDragColor(document.querySelector('#colorHue'), e => {
    const rect = document.querySelector('#colorHue').getBoundingClientRect();
    hue = Math.max(0, Math.min(360, ((e.clientX - rect.left) / rect.width) * 360));
    setColorFromPicker();
  });
  document.querySelectorAll('[data-layout-tab]').forEach(btn => btn.addEventListener('click', () => { layoutTab = btn.dataset.layoutTab; document.querySelectorAll('[data-layout-tab]').forEach(x=>x.classList.toggle('active', x===btn)); renderLayouts(); }));
  document.querySelector('#composeTheme')?.addEventListener('click', () => { editingLayoutId = ''; selectedLayout = ''; defaultReset = false; customDirty = false; writeCustom({ name: 'leaf', color: '#424242', author: { name: 'leaf', icon_url: defaultIcon }, footer: { text: 'leaf', icon_url: defaultIcon }, thumbnail: { url: defaultIcon } }); document.querySelector('#appearanceFrame')?.classList.add('editing'); document.querySelector('#themeHome')?.classList.add('hidden'); document.querySelector('#themeEditor')?.classList.remove('hidden'); });
  document.querySelector('#defaultThemeReset')?.addEventListener('click', async () => { try { const fresh = await api('/api/settings',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({ layout: '' })}); refreshSettings(fresh); writeCustom({ name: 'leaf', color: '#424242', author: { name: 'leaf', icon_url: defaultIcon }, footer: { text: 'leaf', icon_url: defaultIcon }, thumbnail: { url: defaultIcon } }); toast('Default theme applied'); } catch { toast('Could not reset theme', 'error'); } });
  document.querySelector('#exitThemeEditor')?.addEventListener('click', () => { document.querySelector('#appearanceFrame')?.classList.remove('editing'); document.querySelector('#themeEditor')?.classList.add('hidden'); document.querySelector('#themeHome')?.classList.remove('hidden'); });
  document.querySelector('#sortToggle')?.addEventListener('click', e => {
    layoutSort = layoutSort === 'used' ? 'name' : 'used';
    e.currentTarget.dataset.sort = layoutSort;
    e.currentTarget.textContent = layoutSort === 'used' ? 'Most used' : 'Name';
    renderLayouts();
  });
  document.querySelector('#layoutSearch').addEventListener('input', e => { layoutQuery = e.target.value; renderLayouts(); });
  document.addEventListener('click', e => { if (!e.target.closest('.theme-menu-wrap') && !e.target.closest('[data-theme-menu]') && !e.target.closest('[data-theme-get]')) document.querySelectorAll('.theme-menu-wrap').forEach(x => x.remove()); });
  const positionThemeMenu = (button, menu) => {
    document.body.appendChild(menu);
    const rect = button.getBoundingClientRect();
    const width = menu.offsetWidth || 210;
    const height = menu.offsetHeight || 150;
    menu.style.left = Math.max(12, Math.min(rect.right - width, window.innerWidth - width - 12)) + 'px';
    menu.style.top = Math.max(12, rect.top - height - 8) + 'px';
  };
  const openThemeMenu = (button, theme) => {
    document.querySelectorAll('.theme-menu-wrap').forEach(x => x.remove());
    const menu = document.createElement('div');
    menu.className = 'theme-menu-wrap floating-theme-menu';
    menu.innerHTML = `<button data-theme-edit="${esc(theme.id)}"><img src="/assets/icons/edit.png" alt="">Edit</button><button data-theme-rename="${esc(theme.id)}"><img src="/assets/icons/rename.png" alt="">Rename</button><button data-theme-upload="${esc(theme.id)}"><img src="/assets/icons/upload.png" alt=""><span>${theme.public ? 'Unpublish' : 'Upload'}<small>${theme.public ? 'Remove from Community Themes' : 'To Community Themes'}</small></span></button><button data-theme-share="${esc(theme.id)}"><img src="/assets/icons/share.png" alt=""><span>Share<small>Share with a friend</small></span></button><button class="danger" data-theme-delete="${esc(theme.id)}"><img src="/assets/icons/delete.png" alt="">Delete</button>`;
    positionThemeMenu(button, menu);
  };
  const openGetThemeMenu = (button, theme) => {
    document.querySelectorAll('.theme-menu-wrap').forEach(x => x.remove());
    const menu = document.createElement('div');
    menu.className = 'theme-menu-wrap get-menu floating-theme-menu';
    menu.innerHTML = `<button data-theme-save-apply="${esc(theme.id)}"><i class="fa-solid fa-code-compare"></i>Save and apply</button><button data-theme-save-only="${esc(theme.id)}"><i class="fa-solid fa-cloud-arrow-down"></i>Save</button>`;
    positionThemeMenu(button, menu);
  };
  const applyTheme = async id => { if (String(equippedLayout || '') === String(id || '')) return toast('You already use this theme', 'error'); const fresh = await api('/api/layouts/apply',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({ id })}); refreshSettings(fresh); const applied = layouts.find(x => String(x.id) === String(id)); if (applied) { selectedLayout = String(id); writeCustom(applied); customDirty = false; } toast('Theme applied'); };
  document.querySelector('#layoutList').addEventListener('click', async e => {
    const row = e.target.closest('[data-layout]');
    const action = e.target.closest('[data-theme-apply],[data-theme-menu],[data-theme-get],[data-theme-remove-saved]');
    if (!row) return;
    const l = layouts.find(x=>x.id===row.dataset.layout);
    if (!l) return;
    try {
      if (action?.dataset.themeApply) { e.stopPropagation(); return applyTheme(action.dataset.themeApply); }
      if (action?.dataset.themeRemoveSaved) { e.stopPropagation(); const removeId = action.dataset.themeRemoveSaved; return modalShell(`<button class="modal-x" data-modal-close>x</button><h2 class="gradient-text">Remove Saved Theme?</h2><p class="modal-sub">Remove <b>${esc(l.name || 'this theme')}</b> from your saved themes?</p><div class="modal-actions"><button class="btn ghost liquid" data-modal-close>Cancel</button><button class="btn primary liquid danger-button" id="confirmRemoveSavedTheme">Remove</button></div>`, true), document.querySelectorAll('[data-modal-close]').forEach(x=>x.addEventListener('click', closeModal)), document.querySelector('#confirmRemoveSavedTheme')?.addEventListener('click', async()=>{ const fresh = await api('/api/layouts/remove-saved',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({ id: removeId })}); closeModal(); refreshSettings(fresh); toast('Theme removed from saved'); }); }
      if (action?.dataset.themeMenu) { e.stopPropagation(); return openThemeMenu(action, l); }
      selectedLayout = row.dataset.layout;
      writeCustom(l);
      defaultReset = false;
      if (action?.dataset.themeGet) { e.stopPropagation(); return openGetThemeMenu(action, l); }
      renderLayouts();
      return toast('Theme preview loaded');
    } catch (err) { let body = {}; try { body = JSON.parse(err.message); } catch {} toast(body.message || 'Theme action failed', 'error'); }
  });
  document.addEventListener('click', async e => {
    const btn = e.target.closest('[data-theme-edit],[data-theme-rename],[data-theme-upload],[data-theme-share],[data-theme-delete],[data-theme-save-apply],[data-theme-save-only]');
    if (!btn) return;
    const id = btn.dataset.themeEdit || btn.dataset.themeRename || btn.dataset.themeUpload || btn.dataset.themeShare || btn.dataset.themeDelete || btn.dataset.themeSaveApply || btn.dataset.themeSaveOnly;
    const theme = layouts.find(x => x.id === id);
    if (!theme) return;
    document.querySelectorAll('.theme-menu-wrap').forEach(x => x.remove());
    try {
      if (btn.dataset.themeSaveApply || btn.dataset.themeSaveOnly) { const fresh = await api('/api/layouts/save-existing',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({ id, apply: Boolean(btn.dataset.themeSaveApply) })}); refreshSettings(fresh); toast(btn.dataset.themeSaveApply ? 'Theme saved and applied' : 'Theme saved'); document.querySelectorAll('.theme-menu-wrap').forEach(x => x.remove()); return; }
      if (btn.dataset.themeEdit) { editingLayoutId = id; selectedLayout = id; writeCustom(theme); document.querySelector('#appearanceFrame')?.classList.add('editing'); document.querySelector('#themeHome')?.classList.add('hidden'); document.querySelector('#themeEditor')?.classList.remove('hidden'); return; }
      if (btn.dataset.themeRename) return modalShell(`<button class="modal-x" data-modal-close>x</button><h2 class="gradient-text">Rename Theme</h2><label class="modal-field"><span>Theme name</span><input id="renameThemeName" maxlength="32" value="${esc(theme.name)}"></label><div class="modal-actions"><button class="btn ghost liquid" data-modal-close>Cancel</button><button class="btn primary liquid" id="confirmRenameTheme">Rename</button></div>`, true), document.querySelectorAll('[data-modal-close]').forEach(x=>x.addEventListener('click', closeModal)), document.querySelector('#confirmRenameTheme').addEventListener('click', async()=>{ const fresh = await api('/api/layouts/rename',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({ id, name: document.querySelector('#renameThemeName').value })}); closeModal(); refreshSettings(fresh); toast('Theme renamed'); });
      if (btn.dataset.themeUpload) { const fresh = await api('/api/layouts/upload',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({ id })}); refreshSettings(fresh); return toast(fresh.public ? 'Theme uploaded to Community Themes' : 'Theme unpublished from Community Themes'); }
      if (btn.dataset.themeShare) { const out = await api('/api/layouts/share',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({ id })}); return modalShell(`<button class="modal-x" data-modal-close>x</button><h2 class="gradient-text">Share Theme</h2><p class="modal-sub">One-time use link created.</p><label class="modal-field"><span>Share link</span><input id="shareThemeLink" readonly value="${esc(out.url)}"></label><div class="modal-actions"><button class="btn primary liquid" id="copyShareTheme"><i class="fa-regular fa-copy"></i>Copy</button></div>`, true), document.querySelectorAll('[data-modal-close]').forEach(x=>x.addEventListener('click', closeModal)), document.querySelector('#copyShareTheme')?.addEventListener('click', async()=>{ await navigator.clipboard?.writeText(out.url); toast('Share link copied'); }); }
      if (btn.dataset.themeDelete) return modalShell(`<button class="modal-x" data-modal-close>x</button><h2 class="gradient-text">Delete Theme</h2><p class="modal-sub">Enter <b>${esc(theme.name)}</b> to delete this theme. Everyone using it will return to default.</p><label class="modal-field"><span>Theme name</span><input id="deleteThemeName"></label><div class="modal-actions"><button class="btn ghost liquid" data-modal-close>Cancel</button><button class="btn primary liquid danger-button" id="confirmDeleteTheme">Delete</button></div>`, true), document.querySelectorAll('[data-modal-close]').forEach(x=>x.addEventListener('click', closeModal)), document.querySelector('#confirmDeleteTheme').addEventListener('click', async()=>{ const fresh = await api('/api/layouts/delete',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({ id, name: document.querySelector('#deleteThemeName').value })}); closeModal(); refreshSettings(fresh); toast('Theme deleted'); });
    } catch (err) { let body = {}; try { body = JSON.parse(err.message); } catch {} toast(body.error || 'Theme action failed', 'error'); }
  });
  document.querySelectorAll('.editor-panel input').forEach(input => input.addEventListener('input', markCustom));
  document.querySelector('#resetLayout').addEventListener('click', () => { selectedLayout = ''; writeCustom({ name: 'leaf', color: '#424242', author: { name: 'leaf', icon_url: defaultIcon }, footer: { text: 'leaf', icon_url: defaultIcon }, thumbnail: { url: defaultIcon } }); customDirty = false; defaultReset = true; renderLayouts(); toast('Default preview loaded'); });
  preview();
  renderLayouts();
  document.querySelector('#saveOnly').addEventListener('click', async () => {
    if (!ensurePlusForAppearance()) return;
    if (defaultReset) return toast('Default theme does not need to be saved');
    if (editingLayoutId) { try { const fresh = await api('/api/layouts/update',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({ id: editingLayoutId, layout: readCustom(), apply: false })}); refreshSettings(fresh); customDirty = false; toast('Theme updated'); } catch { toast('Could not update theme', 'error'); } return; }
    if (selectedLayout && !customDirty) return toast('Theme saved already', 'error');
    openLayoutNameModal(false);
  });
  document.querySelector('#saveSettings').addEventListener('click', async () => {
    if (!ensurePlusForAppearance()) return;
    try {
      if (defaultReset) {
        const fresh = await api('/api/settings',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({ layout: '' })});
        refreshSettings(fresh);
        defaultReset = true;
        toast('Default theme applied');
        return;
      }
      if (!selectedLayout && !customDirty) {
        toast('Default theme is already applied');
        return;
      }
      if (editingLayoutId) { const fresh = await api('/api/layouts/update',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({ id: editingLayoutId, layout: readCustom(), apply: true })}); refreshSettings(fresh); customDirty = false; toast('Theme updated and applied'); return; }
      if (customDirty || !selectedLayout) return openLayoutNameModal(true);
      const fresh = await api('/api/layouts/apply',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({ id: selectedLayout })});
      refreshSettings(fresh);
      toast('Theme applied');
    } catch {
      toast('Could not save settings', 'error');
    }
  });
  setInterval(() => {
    const node = document.querySelector('#previewTime');
    if (node) node.textContent = `${t('today')} ${new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
  }, 10000);
}

const legalPages = {
  "terms": {
    "title": "Terms of Service",
    "updated": "September 16, 2026",
    "intro": "leaf is an independent Discord bot and web dashboard maintained by itszyless as a learning project. These terms describe use of this instance; operators of other copies are responsible for their own service terms.",
    "sections": [
      [
        "1. Eligibility and use",
        "You must meet Discord’s minimum age for your country and follow Discord’s Terms of Service, Community Guidelines and applicable law. Adult features, where enabled, are for adults only and must not be used to expose minors to adult content."
      ],
      [
        "2. Acceptable use",
        "Do not use leaf to harass, spam, impersonate others deceptively, distribute unlawful content, bypass permissions or access someone else’s data. Fake-message and image tools are for clearly identified creative use. You are responsible for the content you submit and for having permission to use it."
      ],
      [
        "3. Features and availability",
        "leaf is a development project. Commands, external integrations and availability can change or fail. Running a local copy requires the computer and Node.js process to remain on. No uptime guarantee is offered. Keep your own copies of important notes or other content."
      ],
      [
        "4. AI and third-party content",
        "AI output and external lookups may be inaccurate or unsuitable. Review results before relying on or sharing them. Third-party services have their own terms and data practices. leaf is not affiliated with Discord or the platforms its commands reference."
      ],
      [
        "5. Economy and Plus",
        "In-bot Cash, stocks and lottery entries are virtual game values with no promised real-world value or cash redemption. Plus is an account entitlement; this repository alone does not activate purchases. If an operator enables paid access, the checkout terms, provider rules and applicable consumer rights apply. No blanket no-refund rule overrides mandatory rights."
      ],
      [
        "6. Data and account requests",
        "The Privacy Policy explains the data used by bot features and dashboard login. Contact the operator privately through the configured support channel for access, correction or deletion requests. Do not post private account data in public GitHub issues."
      ],
      [
        "7. Restrictions and liability",
        "The operator may limit access to address abuse, security issues or service problems. The service is provided as available, without additional promises to the extent permitted by law. Nothing here excludes rights or liability that cannot lawfully be excluded."
      ],
      [
        "8. Contact and changes",
        "For this project, contact itszyless through the support link configured in the running leaf instance. The source repository is https://github.com/itszyless/leaf. Material changes will be reflected in the update date. Self-hosting operators must provide their own working contact route before inviting users."
      ]
    ]
  },
  "privacy": {
    "title": "Privacy Policy",
    "updated": "September 16, 2026",
    "intro": "This policy describes the data behavior of the leaf source code and the instance operated by itszyless. A self-hosted copy is controlled by its own operator. Configuration and enabled commands affect which external services receive data.",
    "sections": [
      [
        "1. Account and feature data",
        "leaf associates feature data with Discord user IDs. Stored data can include language and display preferences, notes, reminder text, giveaway entries, polls, economy balances, XP, cooldowns, support requests, Plus access and redemption records. Avatar lookup features can save avatar history. Themes and leaderboards can expose the profile or content information needed to display those features."
      ],
      [
        "2. Command processing and analytics",
        "leaf processes command inputs and any messages or attachments selected for a command, including translation, AI summaries and image generation. Command analytics store command names, user IDs, context and timestamps, with usage totals. The current messageCreate handler is empty; the project is not a general chat archive."
      ],
      [
        "3. Dashboard login and cookies",
        "Discord OAuth requests the identify scope and supplies the user ID, username, display name and avatar. The server exchanges a temporary authorization code with Discord and keeps a signed session identifier in an HttpOnly cookie for up to seven days. Session records are held in memory and end on server restart or logout. The web server and any hosting provider necessarily receive connection metadata such as IP addresses; hosting logs depend on the operator."
      ],
      [
        "4. External services",
        "Discord receives bot responses and API requests. AI commands send submitted prompts or selected content to the configured AI provider, including Groq. Translation and lookup commands send the data needed for their requests to their providers. Dashboard image uploads may be sent to 0x0.st, Catbox or Uguu and produce externally accessible URLs. Paste commands may publish text to Pastebin or Rentry. The website loads icon styles from third-party CDNs. Each provider controls its own retention and privacy practices. Do not submit secrets or sensitive material to public upload or paste features."
      ],
      [
        "5. Storage and retention",
        "Feature state is stored in local JSON files, rather than an encrypted database. Access depends on the operator’s filesystem and hosting controls. Command event history is pruned by the analytics code during use; other records do not have one universal automatic expiry. Logs, aggregates and backups can have different lifetimes. Removing the Discord app does not automatically erase these files."
      ],
      [
        "6. Visibility and support",
        "Public themes, published image or paste URLs, shared responses and leaderboards may be visible to other people. Configured support or error webhooks can send submitted support content or diagnostic details to the operator’s Discord channels. This project does not include an advertising or data-sale integration. Access to local files is controlled by the operator."
      ],
      [
        "7. Your choices and requests",
        "Use available settings to control features such as avatar-history visibility, messages and public themes. Contact itszyless privately through the running instance’s support link to request access, correction or deletion and identify the Discord account concerned. The current project has no complete self-service erasure workflow; requests require operator action, including review of logs, related records and backups. Applicable privacy rights remain available."
      ],
      [
        "8. Operator responsibilities and updates",
        "A self-hosting operator must supply a working private contact route and explain its hosting location, legal basis, providers and retention arrangements before collecting data from others. This repository does not establish those facts for every deployment. Material changes to this description will update the date above."
      ]
    ]
  },
  "refund": {
    "title": "Refund Policy",
    "updated": "September 16, 2026",
    "intro": "Plus purchase availability depends on the running instance and its configured provider. Installing this source code does not create a paid subscription.",
    "sections": [
      [
        "Purchase terms",
        "Check the price, duration, seller and cancellation terms shown at the actual checkout before purchasing."
      ],
      [
        "Requests and consumer rights",
        "Contact the operator and the payment provider for billing or refund requests. Applicable statutory cancellation, refund and remedy rights take precedence over any conflicting service wording."
      ],
      [
        "Local development",
        "Payment setup and a complete purchase-to-refund flow have not been verified as part of this restoration."
      ]
    ]
  }
};
function legal(kind) {
  const page = legalPages[kind] || legalPages.terms;
  setTitle(page.title);
  app.innerHTML = `<section class="page legal"><h1 class="section-title gradient-text" style="text-align:left">${page.title}</h1><p class="last-updated">Last updated: ${page.updated}</p><p class="legal-intro">${esc(page.intro)}</p>${page.sections.map(([h,b])=>`<section class="legal-section"><h2 class="gradient-text">${esc(h)}</h2><p>${esc(b)}</p></section>`).join('')}<a class="btn ghost liquid" href="/" data-link>${icon('back')}Back to home</a></section>`;
}


function modalShell(content, small = false) {
  document.querySelector('.modal-backdrop')?.remove();
  const wrap = document.createElement('div');
  wrap.className = 'modal-backdrop';
  wrap.innerHTML = '<div class="plus-modal liquid-card ' + (small ? 'small' : '') + '">' + content + '</div>';
  document.body.appendChild(wrap);
  requestAnimationFrame(() => wrap.classList.add('show'));
  wrap.addEventListener('click', e => { if (e.target === wrap) closeModal(); });
}
function closeModal() {
  const wrap = document.querySelector('.modal-backdrop');
  if (!wrap) return;
  wrap.classList.remove('show');
  setTimeout(() => wrap.remove(), 180);
}
function openPlansModal() {
  modalShell('<button class="modal-x" data-modal-close>x</button><h2 class="gradient-text">Choose a plan</h2><p class="modal-sub">Unlock the full leaf experience.</p><div class="plan-grid">' +
    planCard('Free','$0','/mo',['Core utility commands','Fun, games, and pets','Media edits and QR tools','Economy basics','Discord and Roblox lookups'],false) +
    planCard('leaf Plus','$3.99','/mo',['Everything in Free','Plus-only generate tools','Monthly Plus cash reward','Website download','Higher AI image-prompt limits','Extra customization commands'],true,'MONTHLY') +
    planCard('leaf Lifetime','$9.99','once',['Everything in Plus monthly','Lifetime Plus access','One-time Roblox gamepass purchase','All future Plus commands','Priority feature limits','No monthly renewal'],true,'BEST VALUE') +
  '</div><div class="modal-support"><span>Issues or other payment methods?</span><a href="' + boot.app.support + '" target="_blank">Join our Support Server -></a></div>');
  document.querySelectorAll('[data-plan-plus]').forEach(btn => btn.addEventListener('click', openGetPlusModal));
  document.querySelector('[data-modal-close]').addEventListener('click', closeModal);
}
function planCard(name, price, suffix, items, plus, badge = '') {
  return '<article class="plan-card ' + (plus ? 'featured' : '') + '">' + (badge ? '<span class="plan-badge">' + badge + '</span>' : '') + '<h3>' + name + '</h3><div class="plan-price">' + price + '<small>' + suffix + '</small></div><ul>' + items.map(i => '<li><i class="fa-solid fa-check"></i> ' + esc(i) + '</li>').join('') + '</ul>' + (plus ? '<button class="btn ghost liquid" data-plan-plus>Get Plus</button>' : '<span class="plan-free">Current free features</span>') + '</article>';
}
function openGetPlusModal() {
  modalShell('<button class="modal-x" data-modal-back>x</button><div class="modal-star"><i class="fa-solid fa-star"></i></div><h2 class="gradient-text">Get Plus</h2><p class="modal-sub">Follow these steps to unlock global power.</p><div class="steps"><div class="step"><b>1</b><div><strong>Authorize leaf</strong><span>Add leaf as a user-app to use it anywhere.</span></div></div><div class="step"><b>2</b><div><strong>Go to any channel</strong><span>Navigate to any text channel in any server.</span></div></div><div class="step"><b>3</b><div><strong>Use the command</strong><button class="command-copy" data-copy="/plus buy"><code>/plus buy</code><i class="fa-regular fa-copy"></i></button></div></div></div><div class="modal-support"><span>Issues or other payment methods?</span><a href="' + boot.app.support + '" target="_blank">Join our Support Server -></a></div>', true);
  document.querySelector('[data-modal-back]').addEventListener('click', openPlansModal);
}

async function themeShare(token) {
  setTitle('Shared Theme');
  const data = await api('/api/theme-share/' + encodeURIComponent(token)).catch(err => null);
  if (!data?.theme) {
    app.innerHTML = `<section class="page detail"><h1 class="gradient-text">Theme unavailable</h1><p class="card-muted">This shared theme link is invalid or already used.</p><a class="btn ghost liquid" href="/" data-link>${icon('back')}Back to home</a></section>`;
    return;
  }
  app.innerHTML = `<section class="page detail"><h1 class="gradient-text">Shared Theme</h1><p class="card-muted"><b>${esc(data.theme.name || 'leaf Theme')}</b> by ${esc(data.theme.creator_name ? '@' + data.theme.creator_name : 'leaf')}</p><div class="modal-actions"><a class="btn ghost liquid" href="/settings" data-link>Decline</a><button class="btn primary liquid" id="claimTheme">Save Theme</button></div></section>`;
  document.querySelector('#claimTheme')?.addEventListener('click', async () => {
    try {
      await api('/api/theme-share/' + encodeURIComponent(token), { method: 'POST' });
      location.href = '/settings';
    } catch {
      alert('Could not save theme. Login first or the link was already used.');
      if (!boot.me) location.href = '/auth/discord';
    }
  });
}
async function render() {
  document.body.classList.remove('route-leave');
  navState();
  const p = pathNow();
  if (p === '/') { home(); afterRender(); return; }
  if (p === '/commands') { plusOnly = false; await commandsPage(); afterRender(app, true); return; }
  if (p === '/team') { await team(); afterRender(); return; }
  if (p === '/plus') { await plus(); afterRender(app, true); return; }
  if (p === '/settings') { await settings(); afterRender(); return; }
  if (p.startsWith('/theme/')) { await themeShare(p.split('/').pop()); afterRender(); return; }
  if (p.startsWith('/legal/')) { legal(p.split('/').pop()); afterRender(); return; }
  setTitle('404'); app.innerHTML = `<section class="page not-found"><div class="liquid-card not-found-card"><img src="/assets/leaf_no_bg.png" alt=""><h1 class="gradient-text">404</h1><p class="card-muted">This leaf drifted somewhere else.</p><a class="btn primary liquid" href="/" data-link>Back home</a></div></section>`; afterRender();
}

(async function init(){
  setLoading(true);
  boot = await api('/api/bootstrap').catch(() => boot);
  navState();
  await render();
  requestAnimationFrame(() => setLoading(false));
  setInterval(async()=>{ const b = await api('/api/bootstrap').catch(()=>null); if (b) { boot = b; navState(); } }, 15000);
})();


















