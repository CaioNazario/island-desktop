const SIZES = {
  compact: [240, 30, 15], notif: [400, 62, 22], stack: [400, 178, 24], music: [500, 82, 26],
  volume: [320, 50, 25], calendar: [480, 214, 24], calendarWeek: [480, 150, 24], quick: [520, 58, 29], ai: [480, 300, 24], wifi: [520, 292, 26], bt: [520, 348, 26], system: [440, 62, 22]
};
const TRANSIENT = { notif: 4200, music: 4500, volume: 2600 };
const INCOMING = [
  { icon: 'ph-fill ph-discord-logo', app: 'Discord', text: 'Caio: “Olha isso aqui!”' },
  { icon: 'ph-fill ph-telegram-logo', app: 'Telegram', text: 'Lucas: Bora no cinema hoje?' },
  { icon: 'ph-fill ph-github-logo', app: 'GitHub', text: 'ci: add dynamic island widget' },
  { icon: 'ph-fill ph-envelope-simple', app: 'Gmail', text: 'Re: Reunião do projeto' }
];
const BASE_NOTIFS = [
  { icon: 'ph-fill ph-spotify-logo', app: 'Spotify', text: 'Get Lucky — Daft Punk', time: 'há 12 min' },
  { icon: 'ph-fill ph-github-logo', app: 'GitHub', text: 'ci: add dynamic island widget', time: 'há 18 min' },
  { icon: 'ph-fill ph-telegram-logo', app: 'Telegram', text: 'Lucas: Bora no cinema hoje?', time: 'há 27 min' },
  { icon: 'ph-fill ph-envelope-simple', app: 'Gmail', text: 'Re: Reunião do projeto', time: 'há 1 h' },
  { icon: 'ph-fill ph-code', app: 'VS Code', text: 'Build bem-sucedido (0 erros)', time: 'há 1 h' }
];
const TRACKS = [
  { artist: 'Daft Punk', title: 'Get Lucky', dur: 248 },
  { artist: 'Spice Girls', title: '2 Become 1', dur: 241 },
  { artist: 'Tame Impala', title: 'The Less I Know the Better', dur: 216 }
];
const fmt = s => Math.floor(s / 60) + ':' + String(Math.floor(s % 60)).padStart(2, '0');

class Component extends DCLogic {
  state = {
    mode: 'compact', panel: null, calOpen: false, powerOpen: false, pwFor: null, pw: '', pwVis: false, pwErr: false, btBusy: null,
    bt: [
      { id: 'airpods', name: 'AirPods Pro', icon: 'ph-fill ph-headphones', paired: true, on: true, bat: '72%' },
      { id: 'mouse', name: 'MX Master 3S', icon: 'ph-fill ph-mouse', paired: true, on: true, bat: '58%' },
      { id: 'kb', name: 'Keychron K2', icon: 'ph-fill ph-keyboard', paired: true, on: false, bat: '' },
      { id: 'jbl', name: 'JBL Flip 6', icon: 'ph-fill ph-speaker-hifi', paired: false, on: false, bat: '' },
      { id: 'pixel', name: 'Pixel 8', icon: 'ph-fill ph-device-mobile', paired: false, on: false, bat: '' }
    ], win: true, winMax: false, activeBTab: 0,
    btabs: [
      { title: 'GitHub — island', url: 'github.com/voce/gnome-island', icon: 'ph-fill ph-github-logo' },
      { title: 'Arch Wiki — GNOME', url: 'wiki.archlinux.org/title/GNOME', icon: 'ph ph-book-open' },
      { title: 'YouTube', url: 'youtube.com', icon: 'ph-fill ph-youtube-logo' }
    ], peek: false, flashAt: 0,
    ai: [
      { id: 'claude', name: 'Claude', icon: 'ph-fill ph-asterisk', plan: 'Max', s: 62, w: 41, sReset: 'em 2h 14min', wReset: 'seg, 09:00', on: true },
      { id: 'gpt', name: 'ChatGPT', icon: 'ph-fill ph-open-ai-logo', plan: 'Plus', s: 34, w: 18, sReset: 'em 3h 40min', wReset: 'qua, 14:00', on: true },
      { id: 'gemini', name: 'Gemini', icon: 'ph-fill ph-google-logo', plan: 'Pro', s: 12, w: 6, sReset: 'em 4h 05min', wReset: 'dom, 00:00', on: false }
    ], connected: 'Casa', connecting: null,
    nets: [
      { ssid: 'Casa', sig: 3, lock: true, known: true }, { ssid: 'Casa_5G', sig: 3, lock: true }, { ssid: 'Escritório', sig: 2, lock: true },
      { ssid: 'Café Aberto', sig: 2, lock: false }, { ssid: 'NET_VIRTUA_88', sig: 1, lock: true }
    ], cpu: 12, gpu: 8, temp: 54, down: 1.2, up: 86, activeTerm: 0,
    sessions: [
      { cmd: 'nvim', cwd: '~/dev/island', branch: 'main', state: 'run', start: Date.now() - 47 * 60000 },
      { cmd: 'pnpm dev', cwd: '~/dev/island', branch: 'main', state: 'run', start: Date.now() - 2 * 3600000 },
      { cmd: 'zsh', cwd: '~', branch: '—', state: 'idle', start: Date.now() - 5 * 60000 },
      { cmd: 'ssh homelab', cwd: '~/infra', branch: 'k3s', state: 'run', start: Date.now() - 18 * 60000 }
    ], now: new Date(), vol: 70, bright: 60, playing: true, pos: 92, track: 0,
    unread: true, inc: 0, monthOff: 0, hover: false, revealed: false,
    notifs: [{ icon: 'ph-fill ph-discord-logo', app: 'Discord', text: 'Caio: “Olha isso aqui!”', time: 'há 5 min' }, ...BASE_NOTIFS],
    toggles: { wifi: true, bt: true, night: false, dnd: false }
  };

  componentDidMount() {
    this.clock = setInterval(() => this.setState(s => {
      const t = TRACKS[s.track];
      const j = (v, d, lo, hi) => Math.max(lo, Math.min(hi, v + (Math.random() * 2 - 1) * d));
      return { now: new Date(), pos: s.playing ? (s.pos + 1) % t.dur : s.pos,
        cpu: Math.round(j(s.cpu, 5, 3, 72)), gpu: Math.round(j(s.gpu, 3, 1, 40)), temp: Math.round(j(s.temp, 1.5, 44, 72)),
        down: +j(s.down, 0.4, 0.1, 9.8).toFixed(1), up: Math.round(j(s.up, 20, 8, 400)),
        ai: s.ai.map(p => p.on && Math.random() < 0.15 ? { ...p, s: Math.min(100, p.s + 1), w: Math.min(100, p.w + (Math.random() < 0.3 ? 1 : 0)) } : p) };
    }), 1000);
    this.onKey = e => {
      if (e.key === 'Escape' && this.state.pwFor) return;
      if (e.key === 'Escape') { this.closeAll(); this.forceUpdate(); return; }
      if ((e.metaKey || e.altKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        if (e.repeat || e.__islandHandled) return;
        e.__islandHandled = true;
        clearTimeout(this.hideT);
        this.setState(p => p.mode === 'quick' ? { mode: 'compact', panel: null, powerOpen: false } : { mode: 'quick', panel: null, powerOpen: false }, () => this.forceUpdate());
        this.forceUpdate();
      }
    };
    const autoNotif = () => this.pushNotif();
    this.autoFirst = setTimeout(autoNotif, 5000);
    this.autoN = setInterval(autoNotif, 22000);
    if (window.__islandKey) document.removeEventListener('keydown', window.__islandKey);
    window.__islandKey = this.onKey;
    document.addEventListener('keydown', this.onKey);
  }
  componentWillUnmount() {
    clearInterval(this.clock); clearTimeout(this.peekT); clearInterval(this.autoN); clearTimeout(this.autoFirst); clearTimeout(this.hideT);
    document.removeEventListener('keydown', this.onKey);
  }

  setMode(mode) {
    clearTimeout(this.hideT);
    this.setState({ mode, panel: null, powerOpen: false, pwFor: null, pw: '', pwErr: false });
    this.arm(mode);
  }
  arm(mode) {
    clearTimeout(this.hideT);
    const ms = TRANSIENT[mode];
    if (ms && !this.state.hover) this.hideT = setTimeout(() => this.setState(s => s.mode === mode ? { mode: 'compact' } : null), ms);
  }
  closeAll = () => { clearTimeout(this.hideT); this.setState({ mode: 'compact', panel: null, powerOpen: false }); };

  slider(key, showMode) {
    return e => {
      e.stopPropagation();
      const el = e.currentTarget;
      const set = x => {
        const r = el.getBoundingClientRect();
        const v = Math.round(Math.max(0, Math.min(1, (x - r.left) / r.width)) * 100);
        this.setState({ [key]: v });
      };
      set(e.clientX);
      clearTimeout(this.hideT);
      const move = ev => set(ev.clientX);
      const up = () => {
        window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up);
        if (showMode) this.arm(this.state.mode);
      };
      window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
    };
  }

  submitPw() {
    const s = this.state;
    if (!s.pwFor) return;
    if (s.pw.length < 8) { this.setState({ pwErr: true }); return; }
    const ssid = s.pwFor;
    clearTimeout(this.connT);
    this.setState(p => ({ pwFor: null, pw: '', pwErr: false, connecting: ssid, nets: p.nets.map(n => n.ssid === ssid ? { ...n, known: true } : n) }));
    this.connT = setTimeout(() => this.setState({ connected: ssid, connecting: null }), 1200);
  }

  pushNotif() {
    this.setState(s => {
      const n = { ...INCOMING[s.inc % INCOMING.length], time: 'agora' };
      return { notifs: [n, ...s.notifs.map(x => x.time === 'agora' ? { ...x, time: 'há 1 min' } : x)].slice(0, 8), inc: s.inc + 1, unread: true };
    });
    const s = this.state;
    if (s.mode === 'compact' && !s.panel) this.setMode('notif');
    else if (s.mode === 'notif') this.arm('notif');
    else if (s.mode === 'stack') this.setState({ flashAt: Date.now() });
    else {
      clearTimeout(this.peekT);
      this.setState({ peek: true });
      this.peekT = setTimeout(() => this.setState({ peek: false }), 4000);
    }
    this.forceUpdate();
  }

  calendar(off) {
    const now = this.state.now;
    const first = new Date(now.getFullYear(), now.getMonth() + off, 1);
    const y = first.getFullYear(), m = first.getMonth();
    const lead = (first.getDay() + 6) % 7;
    const days = new Date(y, m + 1, 0).getDate();
    const cells = [];
    for (let i = -lead; cells.length < Math.ceil((lead + days) / 7) * 7; i++) {
      const d = new Date(y, m, i + 1);
      const inMonth = d.getMonth() === m;
      const isToday = d.toDateString() === now.toDateString();
      cells.push({
        n: d.getDate(),
        color: isToday ? 'var(--color-neutral-100)' : inMonth ? 'var(--color-text)' : 'var(--color-neutral-700)',
        bg: isToday ? 'var(--color-accent-600)' : 'transparent',
        weight: isToday ? 600 : 400
      });
    }
    const weeks = [];
    for (let i = 0; i < cells.length; i += 7) weeks.push({ days: cells.slice(i, i + 7) });
    const t = first.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }).replace(' de ', ' ');
    return { title: t.charAt(0).toUpperCase() + t.slice(1), weeks };
  }

  renderVals() {
    const s = this.state;
    const autoHide = this.props.autoHide ?? false;
    const clickAction = this.props.clickAction ?? 'Calendário e música';
    let [w, h, r] = SIZES[s.mode === 'calendar' && !s.calOpen ? 'calendarWeek' : s.mode];
    if (s.mode === 'quick' && s.powerOpen) h = 106;
    if (s.mode === 'wifi') h = 292 + (s.powerOpen ? 48 : 0) + (s.pwFor ? (s.pwErr ? 76 : 58) : 0);
    if (s.mode === 'bt') h = (s.toggles.bt ? 348 : 300) + (s.powerOpen ? 48 : 0);
    const aiOnList = s.ai.filter(p => p.on), aiOffList = s.ai.filter(p => !p.on);
    const aiHpx = 24 + 32 + aiOnList.length * 108 - 6;
    if (s.mode === 'ai') h = aiHpx;
    const lvl = v => v >= 90 ? 'oklch(0.68 0.19 25)' : v >= 70 ? 'var(--color-accent-300)' : 'var(--color-accent)';
    const lvlText = v => v >= 90 ? 'oklch(0.72 0.17 25)' : 'var(--color-text)';
    const aiToggle = id => e => { e.stopPropagation(); this.setState(p => ({ ai: p.ai.map(x => x.id === id ? { ...x, on: !x.on } : x) })); };
    const aiMap = p => ({ name: p.name, icon: p.icon, plan: p.plan, sPct: Math.round(p.s) + '%', wPct: Math.round(p.w) + '%',
      sColor: lvl(p.s), wColor: lvl(p.w), sText: lvlText(p.s), wText: lvlText(p.w), sReset: p.sReset, wReset: p.wReset,
      tip: p.name + ' · sessão ' + Math.round(p.s) + '% · semanal ' + Math.round(p.w) + '%', toggle: aiToggle(p.id) });
    const stackHpx = 24 + 32 + (s.notifs.length ? Math.min(6, s.notifs.length) * 52 : 72);
    if (s.mode === 'stack') h = stackHpx;
    const bat = Math.max(0, Math.min(100, this.props.battery ?? 78));
    const batColor = bat >= 80 ? 'oklch(0.78 0.16 150)' : bat <= 20 ? 'oklch(0.68 0.19 25)' : 'var(--color-neutral-300)';
    const batIcon = bat >= 95 ? 'ph-fill ph-battery-full' : bat >= 60 ? 'ph-fill ph-battery-high' : bat > 20 ? 'ph-fill ph-battery-medium' : bat > 8 ? 'ph-fill ph-battery-low' : 'ph-fill ph-battery-warning';
    const expanded = s.mode !== 'compact';
    const L = {};
    Object.keys(SIZES).forEach(k => {
      const on = k === s.mode;
      L[k] = { o: on ? 1 : 0, pe: on ? 'auto' : 'none', t: k === 'notif' ? (on ? 'translateY(0) scale(1)' : 'translateY(-18px) scale(.96)') : (on ? 'scale(1)' : 'scale(.94)') };
    });
    const t = TRACKS[s.track];
    const wd = s.now.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '');
    const wdCap = wd.charAt(0).toUpperCase() + wd.slice(1);
    const tg = s.toggles;
    const tileDefs = [
      { k: 'wifi', name: 'Wi-Fi', icon: 'ph-bold ph-wifi-high', on: s.connected, off: 'Desligado' },
      { k: 'bt', name: 'Bluetooth', icon: 'ph-bold ph-bluetooth', on: 'Ativo', off: 'Desligado' },
      { k: 'night', name: 'Modo noturno', icon: 'ph-fill ph-moon', on: 'Ativado', off: 'Desativado' },
      { k: 'dnd', name: 'Não perturbe', icon: 'ph-fill ph-bell-slash', on: 'Ativado', off: 'Desativado' }
    ];
    const tiles = tileDefs.map(d => ({
      name: d.name, icon: d.icon, sub: tg[d.k] ? d.on : d.off,
      circle: tg[d.k] ? 'var(--color-accent-600)' : 'var(--color-neutral-800)',
      fg: tg[d.k] ? 'var(--color-neutral-100)' : 'var(--color-neutral-300)',
      tileBg: tg[d.k] ? 'var(--color-accent-900)' : 'var(--color-neutral-900)',
      tileEdge: tg[d.k] ? '0 0 0 1px var(--color-accent-800)' : 'none',
      toggle: e => { e.stopPropagation(); if (d.k === 'bt' || d.k === 'wifi') { const m = d.k; if (this.state.mode === m) this.setMode('quick'); else this.setMode(m); return; } this.setState(p => ({ toggles: { ...p.toggles, [d.k]: !p.toggles[d.k] } })); this.arm(this.state.mode); }
    }));
    const sys = [
      { icon: 'ph ph-cpu', name: 'CPU', value: s.cpu + '%', pct: s.cpu + '%', bar: 'var(--color-accent-500)' },
      { icon: 'ph ph-memory', name: 'RAM', value: '7.2 GB', pct: '45%', bar: 'var(--color-accent-400)' },
      { icon: 'ph ph-arrows-down-up', name: 'Rede', value: '↓ 1.2 MB/s', pct: '30%', bar: 'var(--color-accent-300)' },
      { icon: batIcon, name: 'Bateria', value: bat + '%', pct: bat + '%', bar: batColor }
    ];
    const volIcon = s.vol === 0 ? 'ph-fill ph-speaker-x' : s.vol < 40 ? 'ph-fill ph-speaker-low' : 'ph-fill ph-speaker-high';
    const openFromBar = mode => e => { e.stopPropagation(); if (s.mode === mode) this.closeAll(); else this.setMode(mode); if (mode === 'stack') this.setState({ unread: false }); };
    const quickInIsland = true;
    const ago = ms => { const m = Math.floor(ms / 60000); return m < 60 ? m + ' min' : Math.floor(m / 60) + ' h ' + (m % 60) + ' min'; };
    const sessions = s.sessions.map((x, i) => {
      const act = i === s.activeTerm;
      return { n: i + 1, cmd: x.cmd, cwd: x.cwd, branch: x.branch, time: ago(s.now - x.start),
        dot: x.state === 'run' ? 'var(--color-accent)' : 'var(--color-neutral-600)',
        glow: x.state === 'run' ? '0 0 6px var(--color-accent)' : 'none',
        chipBg: act ? 'var(--color-accent-900)' : 'transparent',
        fg: act ? 'var(--color-accent-200)' : 'var(--color-neutral-300)',
        rowBg: act ? 'var(--color-accent-900)' : 'transparent',
        title: x.cmd + ' — ' + x.cwd,
        flex: act ? '0 0 auto' : '0 1 auto', width: act ? 'auto' : '120px',
        minW: act ? '0px' : '22px',
        closeD: act ? 'flex' : 'none',
        close: e => { e.stopPropagation(); this.setState(p => { const ss = p.sessions.filter((_, k) => k !== i); return { sessions: ss, activeTerm: Math.max(0, Math.min(p.activeTerm - (i < p.activeTerm ? 1 : 0), ss.length - 1)) }; }); },
        focus: e => { e.stopPropagation(); this.setState({ activeTerm: i }); } };
    });
    const hidden = autoHide && !s.revealed && !expanded && !s.panel;
    const pv = k => ({ o: s.panel === k ? 1 : 0, y: s.panel === k ? '0px' : '-10px', s: s.panel === k ? 1 : 0.96, pe: s.panel === k ? 'auto' : 'none' });
    const togglePanel = k => e => { e.stopPropagation(); clearTimeout(this.hideT); this.setState({ panel: s.panel === k ? null : k, mode: 'compact', unread: k === 'notifs' ? false : s.unread }); };

    return {
      islandW: w + 'px', islandH: h + 'px', islandR: r + 'px',
      islandShadow: expanded ? '0 0 0 1px var(--color-neutral-800), 0 18px 44px rgba(0,0,0,.6), 0 0 28px color-mix(in srgb, var(--color-accent) 18%, transparent)' : 'var(--shadow-sm)',
      islandCursor: s.mode === 'compact' || s.mode === 'notif' ? 'pointer' : 'default',
      accentLine: expanded || s.panel === 'center' ? 1 : 0,
      L,
      barY: hidden ? '-60px' : '0px',
      backdropEvents: s.panel || ['stack', 'calendar', 'quick', 'system', 'wifi', 'ai', 'bt'].includes(s.mode) ? 'auto' : 'none',
      timeLabel: s.now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
      dateLabel: wdCap + ', ' + s.now.getDate(),
      todayLabel: 'Hoje, ' + wd + ', ' + s.now.getDate(),
      latest: s.notifs[0] || { icon: 'ph ph-bell', app: '', text: '', time: '' },
      stack: s.notifs.map((n, i) => ({ ...n, bg: i === 0 && s.now - s.flashAt < 2500 ? 'var(--color-accent-900)' : 'transparent', close: e => { e.stopPropagation(); this.setState(p => ({ notifs: p.notifs.filter((_, k) => k !== i) })); } })),
      stackH: stackHpx + 'px', clearD: s.notifs.length ? 'block' : 'none',
      notifs: s.notifs, notifCount: s.notifs.length, noNotifs: s.notifs.length === 0,
      unreadDot: s.unread && s.notifs.length ? 1 : 0,
      track: { artist: t.artist, title: t.title, len: fmt(t.dur) },
      posLabel: fmt(s.pos), posPct: (s.pos / t.dur * 100).toFixed(1) + '%',
      playIcon: s.playing ? 'ph-fill ph-pause' : 'ph-fill ph-play',
      volPct: s.vol + '%', brightPct: s.bright + '%', volIcon,
      wifiIcon: tg.wifi ? 'ph-bold ph-wifi-high' : 'ph-bold ph-wifi-slash',
      cal: this.calendar(s.monthOff),
      calWeeks: (() => { const c = this.calendar(s.monthOff); if (s.calOpen) return c.weeks; const i = s.monthOff === 0 ? c.weeks.findIndex(wk => wk.days.some(d => d.weight === 600)) : 0; return [c.weeks[Math.max(0, i)]]; })(),
      calToggleLabel: s.calOpen ? 'Semana' : 'Mês',
      calToggleIcon: s.calOpen ? 'ph ph-caret-up' : 'ph ph-caret-down',
      toggleCal: e => { e.stopPropagation(); this.setState(p => ({ calOpen: !p.calOpen })); },
      dows: ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'],
      events: [
        { name: 'Reunião de equipe', time: '09:00 – 10:00', dot: 'var(--color-accent-500)' },
        { name: 'Estudo Java', time: '14:00 – 16:00', dot: 'var(--color-accent-300)' },
        { name: 'Academia', time: '18:00 – 19:00', dot: 'var(--color-neutral-400)' }
      ],
      tiles, sysRows: sys, sysCompact: sys,
      batColor, batIcon, batShown: (this.props.charging ?? true) ? 'ph-fill ph-battery-charging' : batIcon, batLabel: bat + '%', batText: bat <= 20 ? batColor : 'var(--color-text)',
      hw: [
        { short: 'CPU', name: 'CPU ' + s.cpu + '%', value: s.cpu + '%', w: '3.2ch', color: s.cpu >= 60 ? 'var(--color-accent-300)' : 'var(--color-text)' },
        { short: 'RAM', name: 'RAM 7.2 / 16 GB', value: '7.2G', w: '3.4ch', color: 'var(--color-text)' },
        { short: 'GPU', name: 'GPU ' + s.gpu + '%', value: s.gpu + '%', w: '3.2ch', color: 'var(--color-text)' },
        { short: 'TEMP', name: 'Temperatura ' + s.temp + '°C', value: s.temp + '°', w: '3.2ch', color: s.temp >= 70 ? 'oklch(0.68 0.19 25)' : 'var(--color-text)' },
        { short: 'NET', name: 'Rede ↓' + s.down + ' MB/s ↑' + s.up + ' KB/s', value: '↓' + s.down.toFixed(1), w: '3.6ch', color: 'var(--color-text)' }
      ],
      sessions, sessionCount: sessions.length,
      termStack: (() => { const n = Math.min(3, sessions.length); return Array.from({ length: n }, (_, k) => ({
        left: (k * 9) + 'px', z: 3 - k, o: [1, 0.75, 0.5][k], s: [1, 0.92, 0.84][k],
        bg: k === 0 ? 'var(--color-neutral-800)' : 'var(--color-neutral-900)', fg: k === 0 ? 'var(--color-text)' : 'var(--color-neutral-400)'
      })).reverse(); })(),
      stackW: (22 + (Math.min(3, Math.max(1, sessions.length)) - 1) * 9) + 'px',
      termDot: s.sessions.some(x => x.state === 'run') ? 'var(--color-accent)' : 'var(--color-neutral-600)',
      termCountD: sessions.length > 1 ? 'block' : 'none',
      termTitle: sessions.length + ' sessões no Ghostty',
      termBtnBg: s.panel === 'term' ? 'var(--color-neutral-900)' : 'transparent',
      openTerm: togglePanel('term'),
      newTab: e => { e.stopPropagation(); this.setState(p => p.sessions.length >= 24 ? null : ({ sessions: [...p.sessions, { cmd: 'zsh', cwd: '~', branch: '—', state: 'idle', start: Date.now() }], activeTerm: p.sessions.length })); },
      pT: pv('term'), wifiOn: tg.wifi, wifiOff: !tg.wifi,
      wifiSwBg: tg.wifi ? 'var(--color-accent-600)' : 'var(--color-neutral-700)', wifiSwX: tg.wifi ? '16px' : '2px',
      toggleWifi: e => { e.stopPropagation(); this.setState(p => ({ toggles: { ...p.toggles, wifi: !p.toggles.wifi } })); },
      wifiStatus: !tg.wifi ? 'Desligado' : s.connecting ? 'Conectando…' : 'Conectado a ' + s.connected,
      nets: s.nets.map(n => {
        const on = tg.wifi && n.ssid === s.connected && !s.connecting, ing = n.ssid === s.connecting;
        return { ssid: n.ssid, icon: ['', 'ph-bold ph-wifi-low', 'ph-bold ph-wifi-medium', 'ph-bold ph-wifi-high'][n.sig],
          iconColor: on ? 'var(--color-accent)' : 'var(--color-neutral-300)', lock: n.lock ? 'ph-fill ph-lock-simple' : '',
          bg: on ? 'var(--color-accent-900)' : 'transparent',
          status: on ? 'Conectado' : ing ? 'Conectando…' : '', statusColor: on ? 'var(--color-accent-300)' : 'var(--color-neutral-400)',
          askPw: s.pwFor === n.ssid,
          connect: e => { e.stopPropagation(); if (on || ing) return;
            if (n.lock && !(n.known)) { this.setState(p => p.pwFor === n.ssid ? { pwFor: null, pw: '', pwErr: false } : { pwFor: n.ssid, pw: '', pwErr: false, pwVis: false }, () => { const el = this.pwRef.current; if (el) el.focus(); }); return; } clearTimeout(this.connT); this.setState({ connecting: n.ssid }); this.connT = setTimeout(() => this.setState({ connected: n.ssid, connecting: null }), 1200); } };
      }),
      pwRef: this.pwRef || (this.pwRef = React.createRef()),
      pw: s.pw, pwType: s.pwVis ? 'text' : 'password', pwEye: s.pwVis ? 'ph ph-eye-slash' : 'ph ph-eye',
      pwErr: s.pwErr, pwEdge: s.pwErr ? 'oklch(0.55 0.16 25)' : 'var(--color-neutral-800)', pwBtnO: s.pw.length ? 1 : 0.45,
      onPw: e => this.setState({ pw: e.target.value, pwErr: false }),
      togglePwVis: e => { e.stopPropagation(); this.setState(p => ({ pwVis: !p.pwVis })); },
      cancelPw: e => { e.stopPropagation(); this.setState({ pwFor: null, pw: '', pwErr: false }); },
      submitPw: e => { if (e) e.stopPropagation(); this.submitPw(); },
      onPwKey: e => { e.stopPropagation(); if (e.key === 'Enter') this.submitPw(); if (e.key === 'Escape') this.setState({ pwFor: null, pw: '', pwErr: false }); },
      openWifi: openFromBar('wifi'),
      aiOn: aiOnList.map(aiMap), aiOff: aiOffList.map(aiMap), aiNone: aiOnList.length === 0,
      aiH: aiHpx + 'px', aiSummary: aiOnList.length + (aiOnList.length === 1 ? ' conectado' : ' conectados'),
      aiBtnBg: s.mode === 'ai' ? 'var(--color-neutral-900)' : 'transparent',
      openAi: openFromBar('ai'),
      peekTop: (h + 8) + 'px',
      peekO: s.peek ? 1 : 0, peekY: s.peek ? '0px' : '-16px', peekPE: s.peek ? 'auto' : 'none',
      openPeek: e => { e.stopPropagation(); clearTimeout(this.peekT); this.setState({ peek: false, unread: false }); this.setMode('stack'); },
      closePeek: e => { e.stopPropagation(); clearTimeout(this.peekT); this.setState({ peek: false }); },
      winOpen: s.win,
      winL: s.winMax ? '0px' : '150px', winT: '30px',
      winW: s.winMax ? '1440px' : '1140px', winH: s.winMax ? '870px' : '786px', winR: s.winMax ? '0px' : '0 0 14px 14px',
      maxIcon: s.winMax ? 'ph ph-corners-in' : 'ph ph-square',
      toggleMax: () => this.setState(p => ({ winMax: !p.winMax })),
      closeWin: () => this.setState({ win: false }),
      activeTab: s.btabs[s.activeBTab] || { url: '' },
      tabs: s.btabs.map((t, i) => { const act = i === s.activeBTab; return { ...t,
        bg: act ? 'var(--color-surface)' : 'transparent', hover: act ? 'var(--color-surface)' : 'var(--color-neutral-900)',
        fg: act ? 'var(--color-text)' : 'var(--color-neutral-400)',
        select: () => this.setState({ activeBTab: i }),
        close: e => { e.stopPropagation(); this.setState(p => { const b = p.btabs.filter((_, k) => k !== i); return b.length ? { btabs: b, activeBTab: Math.min(p.activeBTab, b.length - 1) } : { btabs: b, win: false }; }); } }; }),
      newBrowserTab: () => this.setState(p => ({ btabs: [...p.btabs, { title: 'Nova guia', url: '', icon: 'ph ph-globe' }], activeBTab: p.btabs.length })),
      wifiH: (s.mode === 'wifi' ? h : 292) + 'px',
      powerBg: s.powerOpen ? 'oklch(0.45 0.14 25)' : 'var(--color-neutral-800)',
      powerFg: s.powerOpen ? 'var(--color-neutral-100)' : 'var(--color-neutral-300)',
      showPower: s.powerOpen,
      openSettings: e => { e.stopPropagation(); this.closeAll(); },
      openPower: e => { e.stopPropagation(); clearTimeout(this.hideT); this.setState(p => ({ powerOpen: !p.powerOpen })); },
      powerActions: [
        { label: 'Suspender', icon: 'ph ph-moon-stars' },
        { label: 'Reiniciar', icon: 'ph ph-arrow-clockwise' },
        { label: 'Desligar', icon: 'ph-bold ph-power', danger: true },
        { label: 'Sair', icon: 'ph ph-sign-out' },
        { label: 'Bloquear', icon: 'ph ph-lock-simple' }
      ].map(a => ({ ...a, fg: a.danger ? 'oklch(0.78 0.13 25)' : 'var(--color-text)', run: e => { e.stopPropagation(); this.closeAll(); } })),
      btH: (s.mode === 'bt' ? h : 348) + 'px',
      btOn: tg.bt, btOff: !tg.bt,
      btStatus: !tg.bt ? 'Desligado' : s.bt.filter(d => d.on).length + ' conectados',
      btSwBg: tg.bt ? 'var(--color-accent-600)' : 'var(--color-neutral-700)', btSwX: tg.bt ? '16px' : '2px',
      toggleBt: e => { e.stopPropagation(); this.setState(p => ({ toggles: { ...p.toggles, bt: !p.toggles.bt } })); },
      ...(() => {
        const map = d => {
          const busy = s.btBusy === d.id;
          return { name: d.name, icon: d.icon,
            iconColor: d.on ? 'var(--color-accent)' : 'var(--color-neutral-300)',
            bg: d.on ? 'var(--color-accent-900)' : 'transparent',
            bat: d.bat, batD: d.on && d.bat ? 'flex' : 'none',
            status: busy ? (d.on ? 'Desconectando…' : 'Conectando…') : d.on ? 'Conectado' : d.paired ? 'Desconectado' : 'Parear',
            statusColor: d.on ? 'var(--color-accent-300)' : d.paired ? 'var(--color-neutral-500)' : 'var(--color-accent-300)',
            connect: e => { e.stopPropagation(); if (s.btBusy) return; clearTimeout(this.btT); this.setState({ btBusy: d.id });
              this.btT = setTimeout(() => this.setState(p => ({ btBusy: null, bt: p.bt.map(x => x.id === d.id ? { ...x, on: !x.on, paired: true, bat: !x.on && !x.bat ? '90%' : x.bat } : x) })), 1100); } };
        };
        return { btPaired: s.bt.filter(d => d.paired).map(map), btNearby: s.bt.filter(d => !d.paired).map(map) };
      })(),
      pC: pv('center'), pN: pv('notifs'), stop: e => e.stopPropagation(),
      showDemo: this.props.showDemo ?? true,

      islandClick: e => {
        e.stopPropagation();
        if (s.mode === 'compact') {
          if (clickAction === 'Calendário compacto') this.setMode('calendar');
          else togglePanel('center')(e);
        } else if (s.mode === 'notif') { this.setMode('stack'); this.setState({ unread: false }); }
      },
      islandEnter: () => { this.setState({ hover: true }); clearTimeout(this.hideT); },
      islandLeave: () => { this.setState({ hover: false }, () => this.arm(this.state.mode)); },
      reveal: () => this.setState({ revealed: true }),
      unreveal: () => this.setState({ revealed: false }),
      closeAll: this.closeAll,
      dismiss: e => { e.stopPropagation(); this.closeAll(); },
      openStack: e => { this.setState({ unread: false }); openFromBar('stack')(e); }, openQuick: quickInIsland ? openFromBar('quick') : togglePanel('quick'), openVolume: openFromBar('volume'), openSystem: quickInIsland ? openFromBar('quick') : togglePanel('quick'),
      openDash: quickInIsland ? openFromBar('quick') : togglePanel('quick'),
      clearAll: e => { e.stopPropagation(); this.setState({ notifs: [], unread: false }); },
      prevMonth: e => { e.stopPropagation(); this.setState(p => ({ monthOff: p.monthOff - 1 })); },
      nextMonth: e => { e.stopPropagation(); this.setState(p => ({ monthOff: p.monthOff + 1 })); },
      togglePlay: e => { e.stopPropagation(); this.setState(p => ({ playing: !p.playing })); this.arm(this.state.mode); },
      prevTrack: e => { e.stopPropagation(); this.setState(p => ({ track: (p.track + TRACKS.length - 1) % TRACKS.length, pos: 0, playing: true })); this.arm(this.state.mode); },
      nextTrack: e => { e.stopPropagation(); this.setState(p => ({ track: (p.track + 1) % TRACKS.length, pos: 0, playing: true })); this.arm(this.state.mode); },
      volDown: this.slider('vol', true),
      brightDown: this.slider('bright', true),
      demos: [
        { label: 'Notificação', icon: 'ph ph-bell-ringing', run: e => { e.stopPropagation(); this.pushNotif(); } },
        { label: 'Música', icon: 'ph ph-music-note', run: e => { e.stopPropagation(); this.setState(p => ({ track: (p.track + 1) % TRACKS.length, pos: 0, playing: true })); this.setMode('music'); } },
        { label: 'Volume', icon: 'ph ph-speaker-high', run: e => { e.stopPropagation(); this.setState(p => ({ vol: p.vol >= 90 ? 30 : p.vol + 10 })); this.setMode('volume'); } },
        { label: 'Calendário', icon: 'ph ph-calendar-blank', run: e => { e.stopPropagation(); this.setMode('calendar'); } },
        { label: 'Navegador', icon: 'ph ph-browser', run: e => { e.stopPropagation(); this.setState(p => p.win ? { win: false } : { win: true, btabs: p.btabs.length ? p.btabs : [{ title: 'Nova guia', url: '', icon: 'ph ph-globe' }], activeBTab: 0 }); } },
        { label: 'Acesso rápido', icon: 'ph ph-sliders-horizontal', run: e => { e.stopPropagation(); this.setMode('quick'); } }
      ]
    };
  }
}
