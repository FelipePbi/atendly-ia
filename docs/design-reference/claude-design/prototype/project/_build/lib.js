const { readFile, saveFile, log } = ctx;
const parse = s => new DOMParser().parseFromString('<body>' + s + '</body>', 'text/html').body;
const el = s => parse(s).firstElementChild;
const styleOf = e => e.getAttribute('style') || '';
const setStyle = (e, s) => e.setAttribute('style', s);
const addStyle = (e, s) => setStyle(e, styleOf(e).replace(/;+$/, '') + ';' + s);
const decl = s => { const m = new Map(); s.split(';').forEach(d => { const i = d.indexOf(':'); if (i > 0) m.set(d.slice(0, i).trim(), d.slice(i + 1).trim()); }); return m; };
const undecl = m => [...m].map(([k, v]) => k + ':' + v).join(';');
const esc = s => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
const mk = (doc, style, inner) => { const d = doc.createElement('div'); setStyle(d, style); if (inner) d.innerHTML = inner; return d; };
const FONT = "font-family:'Hanken Grotesk',system-ui,sans-serif";
const SERIF = 'font-family:Literata,Georgia,serif';
const EYEBROW = 'font-size:12px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:#716859';

// ---------- brand ----------
const LOGO_D = '<path d="M6 56L28 9L40.85 36.5"></path><path d="M44.7 44.8L50 56"></path><path d="M25.5 38L32 44.5L58 21"></path>';
const logo = (n, color = '#0F5F63') => `<svg width="${n}" height="${n}" viewBox="0 0 64 64" fill="none" stroke="${color}" stroke-width="6" stroke-linecap="round" stroke-linejoin="round">${LOGO_D}</svg>`;
const relogo = html => html.replace(/<svg width="(\d+)" height="(\d+)" viewBox="0 0 64 64"><path fill="([^"]+)" fill-rule="evenodd" d="M23 56L51 56[^"]*"><\/path><\/svg>/g, (m, w, h, c) => logo(w, c));

const KEYFRAMES = `@keyframes at-breathe{0%{transform:scale(1);opacity:.75}70%{transform:scale(2.3);opacity:0}100%{transform:scale(2.3);opacity:0}}
@keyframes at-breathe-lg{0%{transform:scale(1);opacity:.6}80%{transform:scale(1.9);opacity:0}100%{transform:scale(1.9);opacity:0}}
@keyframes at-reveal{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}
@keyframes at-sheet{from{transform:translateY(40px);opacity:0}to{transform:none;opacity:1}}
@keyframes at-shimmer{from{background-position:200% 0}to{background-position:-200% 0}}
@keyframes at-typing{0%,80%,100%{opacity:.25;transform:translateY(0)}40%{opacity:1;transform:translateY(-2px)}}
@keyframes at-pop{0%{transform:scale(.6);opacity:0}60%{transform:scale(1.08);opacity:1}100%{transform:scale(1)}}
@keyframes at-blink{50%{opacity:.2}}
@keyframes at-grow{from{width:4%}to{width:78%}}
@keyframes at-grow2{from{width:0}to{width:41%}}
@keyframes at-draw{to{stroke-dashoffset:0}}
@keyframes at-float{0%,100%{transform:translateY(0)}50%{transform:translateY(-8px)}}`;
const HELMET = `<helmet>
<meta name="design_doc_mode" content="canvas">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Literata:ital,opsz,wght@0,7..72,400;0,7..72,500;0,7..72,600;1,7..72,400;1,7..72,500&family=Hanken+Grotesk:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
body{margin:0;background:#E9E3DA;-webkit-font-smoothing:antialiased}
a{color:#0F5F63;text-decoration:none}a:hover{color:#0B484C;text-decoration:underline}
${KEYFRAMES}
@media (prefers-reduced-motion:reduce){*{animation-duration:.001s!important;animation-iteration-count:1!important}}
</style>
</helmet>`;

const ICON = {
  agenda: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="5.5" width="16" height="14.5" rx="2.5"></rect><path d="M4 10h16M8 3.5v4M16 3.5v4"></path></svg>',
  block: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="8"></circle><path d="M6.5 6.5l11 11"></path></svg>',
  clientes: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8.5" r="3.5"></circle><path d="M5 20a7 7 0 0 1 14 0"></path></svg>',
  conversas: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M5 6.5A2.5 2.5 0 0 1 7.5 4h9A2.5 2.5 0 0 1 19 6.5v7a2.5 2.5 0 0 1-2.5 2.5H10l-4.2 3.2c-.4.3-.8 0-.8-.5z"></path></svg>',
  plus: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round"><path d="M12 5v14M5 12h14"></path></svg>',
  keypad: '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><circle cx="6" cy="6" r="1.8"></circle><circle cx="12" cy="6" r="1.8"></circle><circle cx="18" cy="6" r="1.8"></circle><circle cx="6" cy="12" r="1.8"></circle><circle cx="12" cy="12" r="1.8"></circle><circle cx="18" cy="12" r="1.8"></circle><circle cx="12" cy="18" r="1.8"></circle></svg>',
};

let SIDEBAR = '';
async function init() {
  try { SIDEBAR = await readFile('_build/sidebar.html'); } catch (e) {}
  if (!SIDEBAR) {
    const d = await readFile('Home-Desktop.dc.html');
    const b = parse(d.slice(d.indexOf('</helmet>') + 9, d.indexOf('</x-dc>')));
    SIDEBAR = b.querySelector('[data-screen-label$="/ Desktop"] > div[style*="width:232px"]').outerHTML;
    await saveFile('_build/sidebar.html', SIDEBAR);
  }
  SIDEBAR = relogo(SIDEBAR);
}

// ---------- mobile screens ----------
async function screens(file) {
  const t = await readFile(file);
  const body = parse(t.slice(t.indexOf('</helmet>') + 9, t.indexOf('</x-dc>')));
  const out = new Map();
  body.querySelectorAll('[data-screen-label]').forEach(root => {
    const xi = root.closest('x-import'); const col = xi ? xi.parentElement : root.parentElement;
    const spans = col.querySelectorAll(':scope > div > span');
    const label = root.getAttribute('data-screen-label');
    out.set(label, { label, code: spans[0] ? spans[0].textContent.trim() : '', title: spans[1] ? spans[1].textContent.trim() : label, cap: (col.querySelector(':scope > p') || {}).textContent || '', html: root.outerHTML });
  });
  return out;
}

const TABBAR_STYLE = 'height:72px;flex:none;background:#FFFDFA;border-top:1px solid #E5DED4;display:flex;justify-content:center;gap:56px;align-items:flex-start;padding:8px 0 0';

// two-column body: children whose text starts with a left/right key go into columns; the rest stays full width below
function twoCol(body, spec) {
  const doc = body.ownerDocument; const kids = [...body.children];
  const t = c => c.textContent.trim();
  const pick = (list, idxs) => kids.filter((c, i) => (idxs && idxs.includes(i)) || (list && list.some(p => t(c).startsWith(p))));
  const L = pick(spec.left, spec.leftIdx), R = pick(spec.right, spec.rightIdx);
  if (!L.length || !R.length) return false;
  const gap = (styleOf(body).match(/gap:(\d+)px/) || [])[1] || 16;
  const row = mk(doc, `display:flex;gap:${spec.gap || 40}px;align-items:flex-start`);
  const col = f => mk(doc, `flex:${f};min-width:0;display:flex;flex-direction:column;gap:${gap}px`);
  const a = col(spec.leftFlex || 1), b = col(1); L.forEach(c => a.appendChild(c)); R.forEach(c => b.appendChild(c)); row.appendChild(a); row.appendChild(b);
  body.insertBefore(row, body.firstChild);
  return true;
}

function airClientes(root) {
  root.querySelectorAll('[style]').forEach(e => {
    let s = styleOf(e);
    s = s.replace(/^display:flex;align-items:center;gap:12px;padding:10px (\d+)px/, 'display:flex;align-items:center;gap:14px;padding:14px $1px')
      .replace(/^padding:12px (\d+)px 4px;font-size:12px/, 'padding:20px $1px 8px;font-size:12px')
      .replace(/^display:grid;grid-template-columns:repeat\(4,1fr\);gap:8px/, 'display:grid;grid-template-columns:repeat(4,1fr);gap:20px')
      .replace(/^display:flex;justify-content:space-between;align-items:baseline;padding:9px 0/, 'display:flex;justify-content:space-between;align-items:baseline;padding:13px 0')
      .replace(/^(flex:1;overflow:hidden;padding:)16px (\d+px 0;display:flex;flex-direction:column;gap:)18px/, '$122px $228px')
      .replace(/^flex:1;min-width:0;display:flex;flex-direction:column;gap:3px/, 'flex:1;min-width:0;display:flex;flex-direction:column;gap:7px')
      .replace(/^padding:6px (\d+)px 0;display:flex;align-items:center;gap:14px/, 'padding:14px $1px 0;display:flex;align-items:center;gap:20px')
      .replace(/^display:flex;gap:6px;margin-top:4px/, 'display:flex;gap:8px;margin-top:6px')
      .replace(/^padding:16px (\d+)px 0;display:flex;gap:22px;border-bottom/, 'padding:24px $1px 0;display:flex;gap:26px;border-bottom')
      .replace(/^padding:14px (\d+)px 0;display:flex;gap:10px$/, 'padding:20px $1px 0;display:flex;gap:12px')
      .replace(/^display:flex;flex-direction:column;gap:6px;padding:12px 14px;border-radius:14px/, 'display:flex;flex-direction:column;gap:10px;padding:16px 18px;border-radius:14px');
    setStyle(e, s);
  });
  root.querySelectorAll('div[style^="display:grid;grid-template-columns:repeat(4,1fr)"] > div').forEach(e => { setStyle(e, styleOf(e).replace('gap:2px', 'gap:6px')); const n = e.firstElementChild; if (n) addStyle(n, 'white-space:nowrap'); });
}

function qrSvg(size) {
  const N = 25, cells = []; let seed = 7;
  const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  const finder = (ox, oy) => { for (let y = 0; y < 7; y++) for (let x = 0; x < 7; x++) { const ring = x === 0 || y === 0 || x === 6 || y === 6, core = x >= 2 && x <= 4 && y >= 2 && y <= 4; if (ring || core) cells.push([ox + x, oy + y]); } };
  finder(0, 0); finder(N - 7, 0); finder(0, N - 7);
  const inFinder = (x, y) => (x < 8 && y < 8) || (x >= N - 8 && y < 8) || (x < 8 && y >= N - 8);
  for (let i = 8; i < N - 8; i += 2) { cells.push([i, 6]); cells.push([6, i]); }
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) { if (inFinder(x, y) || x === 6 || y === 6) continue; if (rnd() < 0.44) cells.push([x, y]); }
  return `<svg width="${size}" height="${size}" viewBox="0 0 ${N} ${N}" shape-rendering="crispEdges"><path fill="#221E1A" d="${cells.map(([x, y]) => `M${x} ${y}h1v1h-1z`).join('')}"></path></svg>`;
}
const STEP = (n, html) => `<div style="display:flex;gap:12px;align-items:center;padding:8px 0"><div style="width:26px;height:26px;border-radius:50%;background:#DCECEB;color:#0B4A4E;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;flex:none">${n}</div><span style="font-size:14px;line-height:1.35">${html}</span></div>`;
function qrTransform(root) {
  const body = [...root.children].find(c => /^flex:1;padding/.test(styleOf(c))); if (!body) return;
  const doc = root.ownerDocument;
  const card = body.children[1], steps = body.children[2];
  const qr = mk(doc, 'display:flex;gap:24px;align-items:center;padding:20px 22px;border-radius:16px;background:#FFFDFA;border:1px solid #E5DED4',
    `<div style="flex:none;padding:10px;border-radius:12px;background:#FFFFFF;border:1px solid #E5DED4;display:flex">${qrSvg(164)}</div><div style="flex:1;min-width:0;display:flex;flex-direction:column;gap:2px"><span style="${EYEBROW};padding:0 0 6px">Escaneie com o WhatsApp do negócio</span>${STEP(1, 'Abra o <strong>WhatsApp</strong> no seu celular')}${STEP(2, 'Toque em <strong>⋮</strong> ou <strong>Configurações</strong> › <strong>Dispositivos conectados</strong>')}${STEP(3, '<strong>Conectar dispositivo</strong>')}${STEP(4, 'Aponte a câmera para este QR code')}</div>`);
  body.replaceChild(qr, card); steps.remove();
  const h1 = body.querySelector('h1'); if (h1) h1.insertAdjacentHTML('afterend', '<p style="margin:-6px 0 0;font-size:15px;line-height:1.45;color:#5F574E">O QR code é lido pelo celular onde está o WhatsApp do negócio. Sem câmera por perto? Use um código.</p>');
  const foot = root.children[root.children.length - 1];
  const btn = foot && foot.firstElementChild; if (btn) { btn.innerHTML = `${ICON.keypad}Conectar com código, sem câmera`; }
}

const QA = [['Novo agendamento', 'Marcar para uma cliente', ICON.agenda], ['Bloquear horário', 'Almoço, folga ou pausa', ICON.block], ['Novo cliente', 'Cadastro rápido', ICON.clientes], ['Conversas', 'Ver as de hoje', ICON.conversas]];
function quickBlock(doc, cols) {
  const tiles = QA.map(([t, s, i]) => `<div style="display:flex;flex-direction:column;gap:12px;padding:16px;border-radius:14px;background:#FFFDFA;border:1px solid #E5DED4;min-width:0"><span style="color:#0F5F63;display:flex">${i}</span><div style="display:flex;flex-direction:column;gap:2px"><span style="font-size:14px;font-weight:600">${t}</span><span style="font-size:12px;color:#716859">${s}</span></div></div>`).join('');
  return mk(doc, 'display:flex;flex-direction:column;gap:10px', `<span style="${EYEBROW}">Ações rápidas</span><div style="display:grid;grid-template-columns:repeat(${cols},1fr);gap:10px">${tiles}</div>`);
}
function homeLayout(root, o) {
  const body = [...root.children].find(c => /^flex:1;overflow:hidden/.test(styleOf(c))); if (!body) return;
  const doc = root.ownerDocument; const kids = [...body.children];
  const hoje = kids.find(c => { const sp = c.querySelector('span'); return sp && /^Hoje\b/.test(sp.textContent.trim()); });
  const wide = o.homeCol > 0 && hoje;
  body.insertBefore(quickBlock(doc, wide ? 2 : 4), body.children[1] || null);
  if (!wide) return;
  const week = kids.find(c => { const sp = c.querySelector('span'); return sp && sp.textContent.trim() === 'Esta semana'; });
  if (week && week.children[1]) { const row = week.children[1]; setStyle(row, 'display:flex;flex-direction:column'); [...row.children].forEach(c => setStyle(c, 'display:flex;align-items:baseline;gap:10px;padding:11px 0;border-bottom:1px solid #E5DED4')); }
  const d = decl(styleOf(body)); d.set('display', 'grid'); d.set('grid-template-columns', `minmax(0,1fr) ${o.homeCol}px`); d.set('gap', '0 40px'); d.set('align-content', 'start'); d.delete('flex-direction'); setStyle(body, undecl(d));
  [...body.children].forEach((c, i) => { let s = styleOf(c); if (c === hoje) s += ';grid-column:1;grid-row:2/span 9'; else if (i === 0) s += ';grid-column:1/-1;margin-bottom:24px'; else s += ';grid-column:2;margin-bottom:24px'; setStyle(c, s); });
}

// Semana / Mês on tablet+desktop: taller grid with client names inside the blocks (like the Dia list)
const SERVICE = { '#8E5A86': 'Corte feminino', '#B8674A': 'Escova', '#7C8A3E': 'Hidratação', '#5B6E9A': 'Corte masculino', '#C07A88': 'Design de sobrancelha' };
const NAMES_F = ['Ana Paula', 'Fernanda Lima', 'Aline Santos', 'Bia Castro', 'Juliana Mendes', 'Carla Nunes'], NAMES_M = ['Pedro Souza', 'Pedro Alves'];
const TODAY_WEEK = { 48: ['Bia Castro', 'Escova'], 72: ['Carla Nunes', 'Escova'], 96: ['Almoço', ''], 144: ['Ana Paula', 'Corte feminino'], 168: ['Juliana Mendes', 'Escova + Hidratação'], 204: ['Pedro Alves', 'Corte masculino'], 240: ['Dentista', 'compromisso pessoal'] };
const TODAY_MONTH = [['Bia Castro', 'Escova'], ['Carla Nunes', 'Escova'], ['Almoço', 'bloqueio'], ['Ana Paula', 'Corte feminino'], ['Juliana Mendes', 'Escova + Hidratação']];
const pickName = (color, seed) => { const pool = color === '#5B6E9A' ? NAMES_M : NAMES_F; return pool[seed % pool.length]; };
const ELL = 'white-space:nowrap;overflow:hidden;text-overflow:ellipsis';
function agendaNames(root, cfg) {
  const doc = root.ownerDocument;
  // --- week ---
  root.querySelectorAll('div[style*="display:grid;grid-template-columns:repeat("]').forEach(grid => {
    const cols = [...grid.children].filter(c => c.children.length === 2 && /height:288px/.test(styleOf(c.children[1])));
    if (!cols.length) return;
    const k = cfg.k;
    const hours = grid.previousElementSibling;
    if (hours && /height:332px/.test(styleOf(hours))) { setStyle(hours, styleOf(hours).replace('height:332px', `height:${Math.round(44 + 288 * k)}px`)); hours.querySelectorAll('span').forEach(s => setStyle(s, styleOf(s).replace(/top:(\d+)px/, (m, t) => `top:${Math.round(37 + (t - 37) * k)}px`))); }
    cols.forEach((col, ci) => {
      const today = !!col.children[0].querySelector('span[style*="background:#0F5F63"]');
      const track = col.children[1];
      setStyle(track, styleOf(track).replace('height:288px', `height:${Math.round(288 * k)}px`).replace(/transparent 0 47px,#E5DED4 47px 48px/, `transparent 0 ${Math.round(48 * k) - 1}px,#E5DED4 ${Math.round(48 * k) - 1}px ${Math.round(48 * k)}px`));
      [...track.children].forEach(b => {
        let s = styleOf(b); const top = +((s.match(/top:(\d+(?:\.\d+)?)px/) || [])[1] || 0); const h = +((s.match(/height:(\d+(?:\.\d+)?)px/) || [])[1] || 0);
        if (/left:-4px/.test(s)) { setStyle(b, s.replace(/top:[\d.]+px/, `top:${((top + 3.5) * k - 3.5).toFixed(1)}px`)); return; }
        if (/left:-2px/.test(s)) { setStyle(b, s.replace(/top:[\d.]+px/, `top:${(top * k).toFixed(1)}px`)); return; }
        const nh = Math.round(h * k);
        s = s.replace(/top:[\d.]+px/, `top:${Math.round(top * k)}px`).replace(/height:[\d.]+px/, `height:${nh}px`);
        if (/left:0;right:0/.test(s)) { setStyle(b, s); return; }
        const color = (s.match(/background:(#[0-9A-Fa-f]{6})(?:;|$)/) || [])[1];
        const striped = /repeating-linear-gradient\(135deg/.test(s), dashed = /dashed/.test(s), personal = /background:#FFFDFA;border/.test(s), stacked = b.children.length > 0;
        const seed = ci * 7 + Math.round(top / 12);
        let name, svc, bar = color || '';
        if (today && TODAY_WEEK[top]) { [name, svc] = TODAY_WEEK[top]; if (stacked) bar = 'linear-gradient(#B8674A 0 50%,#7C8A3E 50% 100%)'; }
        else if (striped) [name, svc] = ['Almoço', 'bloqueio · 1 h'];
        else if (personal) [name, svc] = ['Compromisso', 'pessoal'];
        else if (stacked) { name = pickName('', seed); svc = 'Escova + Hidratação'; bar = 'linear-gradient(#B8674A 0 50%,#7C8A3E 50% 100%)'; }
        else if (color === '#8E5A86' && seed % 4 === 1) { name = pickName('', seed); svc = 'Manicure'; bar = ''; }
        else { const c = dashed ? '#5B6E9A' : color; name = pickName(c, seed); svc = SERVICE[c] || ''; bar = c; }
        if (dashed) bar = '#5B6E9A';
        const two = nh >= 32 && svc;
        const inner = two ? `<span style="font-size:10.5px;font-weight:600;${ELL}">${name}</span><span style="font-size:9.5px;color:#5F574E;${ELL}">${svc}</span>` : `<span style="font-size:10.5px;font-weight:600;${ELL}">${name}${svc ? `<span style="font-weight:500;color:#5F574E"> · ${svc}</span>` : ''}</span>`;
        const barEl = `<i style="position:absolute;left:0;top:0;bottom:0;width:3px;background:${bar || '#D6CEC2'}"></i>`;
        const faded = /opacity:\.4/.test(s);
        s = s.replace(/;?opacity:\.4/, '').replace(/;?background:[^;]+(;|$)/, ';').replace(/;?border:[^;]+(;|$)/, ';').replace(/;?display:flex;flex-direction:column;gap:1px;overflow:hidden/, '').replace(/;;+/g, ';').replace(/;$/, '');
        if (striped) s += ';background:repeating-linear-gradient(135deg,#EFEAE2 0 4px,#F7F4EF 4px 8px);border:1px solid #E5DED4';
        else if (dashed) s += ';background:#FFFDFA;border:1.5px dashed #5B6E9A';
        else if (personal) s += ';background:#FFFDFA;border:1.5px solid #716859';
        else s += ';background:#FFFDFA;border:1px solid #E5DED4';
        s += `;border-radius:6px;box-sizing:border-box;overflow:hidden;display:flex;flex-direction:column;justify-content:center;gap:1px;padding:0 6px 0 ${striped || personal ? 8 : 10}px;color:#221E1A;line-height:1.15${faded ? ';opacity:.6' : ''}`;
        setStyle(b, s); b.innerHTML = (striped || personal ? '' : barEl) + inner;
      });
    });
    const legend = grid.parentElement && grid.parentElement.nextElementSibling;
    if (legend && /flex-wrap:wrap;gap:6px 12px/.test(styleOf(legend))) legend.insertAdjacentHTML('beforeend', '<span style="display:inline-flex;align-items:center;gap:6px"><span style="width:8px;height:8px;border-radius:50%;border:1.5px solid #B9B1A6;box-sizing:border-box;flex:none"></span>Sem cor definida</span>');
  });
  // --- month ---
  const cells = [...root.querySelectorAll('div[style^="height:80px;padding:4px 3px 6px"]')];
  const visible = Math.max(2, Math.floor((cfg.cellH - 36) / 21));
  cells.forEach((cell, ci) => {
    setStyle(cell, styleOf(cell).replace('height:80px;padding:4px 3px 6px', `height:${cfg.cellH}px;padding:6px 4px 8px`));
    const list = cell.children[1]; if (!list) return;
    const today = !!cell.querySelector('span[style*="background:#0F5F63"]');
    const bars = [...list.children].filter(x => x.tagName === 'DIV'); const plusEl = list.querySelector('span'); const plus = plusEl ? +(plusEl.textContent.replace('+', '') || 0) : 0;
    const show = bars.length > visible || (bars.length === visible && plus) ? visible - 1 : bars.length;
    const rest = bars.length - show + plus;
    setStyle(list, 'display:flex;flex-direction:column;gap:2px;padding:0');
    list.innerHTML = '';
    bars.slice(0, show).forEach((bar, bi) => {
      const s = styleOf(bar); const color = (s.match(/background:(#[0-9A-Fa-f]{6})/) || [])[1]; const striped = /repeating-linear-gradient/.test(s);
      const seed = ci * 5 + bi * 3; const noColor = !striped && color === '#8E5A86' && seed % 4 === 1;
      const name = today && TODAY_MONTH[bi] ? TODAY_MONTH[bi][0] : striped ? 'Almoço' : pickName(color, seed);
      const svc = today && TODAY_MONTH[bi] ? TODAY_MONTH[bi][1] : striped ? 'bloqueio' : noColor ? 'Manicure' : (SERVICE[color] || '');
      const bg = striped ? 'repeating-linear-gradient(135deg,#EFEAE2 0 4px,#F7F4EF 4px 8px)' : '#FFFDFA';
      list.insertAdjacentHTML('beforeend', `<div style="position:relative;height:19px;line-height:17px;padding:0 6px 0 9px;border-radius:5px;background:${bg};border:1px solid #E5DED4;box-sizing:border-box;color:#221E1A;font-size:10.5px;font-weight:600;${ELL}">${striped ? '' : `<i style="position:absolute;left:0;top:0;bottom:0;width:3px;background:${noColor ? '#D6CEC2' : color}"></i>`}${name}${svc ? `<span style="font-weight:500;color:#5F574E"> · ${svc}</span>` : ''}</div>`);
    });
    if (rest > 0) list.insertAdjacentHTML('beforeend', `<span style="font-size:10.5px;font-weight:600;color:#716859;line-height:1;padding:2px 6px 0">+${rest}</span>`);
  });
  // --- compact “Hoje” card into one row ---
  root.querySelectorAll('div[style*="padding:12px 14px;border-radius:14px;background:#FFFDFA;border:1px solid #E5DED4;display:flex;flex-direction:column;gap:8px"]').forEach(card => {
    if (!/^margin:10px/.test(styleOf(card)) || card.children.length !== 2) return;
    const [titleRow, chips] = card.children; const [title, link] = titleRow.children; if (!title || !link) return;
    setStyle(card, styleOf(card).replace('padding:12px 14px', 'padding:10px 14px').replace('flex-direction:column;gap:8px', 'align-items:center;gap:16px'));
    addStyle(title, 'flex:none'); addStyle(chips, 'flex:1;flex-wrap:nowrap;overflow:hidden'); addStyle(link, 'flex:none');
    card.innerHTML = ''; card.appendChild(title); card.appendChild(chips); card.appendChild(link);
  });
}

function adapt(html, o) {
  const root = el(html);
  const mapSide = side => o.side === 20 ? side : (side === '12' ? Math.max(o.side - 8, 12) : o.side);
  for (const c of root.children) setStyle(c, styleOf(c).replace(/padding:(6\d|7\d)px ([\d.]+)px 0/, (m, t, side) => `padding:${o.top}px ${mapSide(side)}px 0`));
  if (o.side !== 20) root.querySelectorAll('[style]').forEach(e => setStyle(e, styleOf(e).replace(/(padding|margin):([\d.]+px) 20px/g, `$1:$2 ${o.side}px`)));
  root.querySelectorAll('[style*="46px"]').forEach(e => setStyle(e, styleOf(e).replace(/(padding:[\d.]+px [\d.]+px )46px/, `$1${o.bottom}px`)));
  for (const c of root.children) { const s = styleOf(c); if (/position:absolute/.test(s) && /bottom:(9\d|1[0-9]\d)px/.test(s) && !/left:0;right:0/.test(s)) setStyle(c, s.replace(/bottom:\d+px/, 'bottom:24px').replace(/right:20px/, `right:${o.side}px`)); }
  let tabbar = '';
  const tab = [...root.children].find(c => /position:absolute;left:0;right:0;bottom:0;height:90px/.test(styleOf(c)));
  if (tab) { tab.remove(); if (o.tab !== 'remove') { setStyle(tab, TABBAR_STYLE); tab.querySelectorAll('[style*="width:64px"]').forEach(x => setStyle(x, styleOf(x).replace('width:64px', 'width:72px'))); tabbar = tab.outerHTML; } }
  let overlay = '', dialog = '';
  const ov = [...root.children].find(c => /position:absolute;inset:0;background:rgba\(34,30,26,\.38\)/.test(styleOf(c)));
  const sh = [...root.children].find(c => /position:absolute;left:0;right:0;bottom:0;background:#FFFDFA;border-radius:24px 24px 0 0/.test(styleOf(c)));
  if (ov && sh) {
    ov.remove(); sh.remove();
    for (const c of root.children) setStyle(c, styleOf(c).replace(/;?opacity:\.5/, ''));
    const d = decl(styleOf(sh)); ['left', 'right', 'bottom', 'top', 'position', 'transform'].forEach(k => d.delete(k));
    d.set('position', 'relative'); d.set('width', (o.dialogW || 440) + 'px'); d.set('max-height', 'calc(100% - 80px)'); d.set('box-sizing', 'border-box');
    d.set('border-radius', '20px'); d.set('box-shadow', '0 24px 64px rgba(34,30,26,.28)'); d.set('padding', '22px 24px 24px'); d.set('overflow', 'hidden');
    setStyle(sh, undecl(d));
    const handle = [...sh.children].find(c => /height:4px;border-radius:2px;background:#D6CEC2/.test(styleOf(c))); if (handle) handle.remove();
    overlay = ov.outerHTML; dialog = `<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center">${sh.outerHTML}</div>`;
  }
  if (o.hideBack) {
    const first = root.children[0];
    const back = first && [...first.querySelectorAll('div[style*="width:40px;height:40px"]')].find(b => b.querySelector('path[d="M15 5l-7 7 7 7"]'));
    if (back) setStyle(back, styleOf(back) + ';visibility:hidden');
  }
  if (o.segMax) root.querySelectorAll('[style*="background:#EFEAE2;border-radius:12px;padding:3px"]').forEach(e => setStyle(e, styleOf(e) + `;max-width:${o.segMax}px`));
  if (o.renameMais) { const h1 = root.querySelector('h1'); if (h1 && h1.textContent.trim() === 'Mais') h1.textContent = 'Configurações'; }
  if (o.air) airClientes(root);
  if (o.twoCol) { const body = [...root.children].find(c => /^flex:1;overflow:hidden/.test(styleOf(c))); if (body) twoCol(body, o.twoCol); }
  if (o.qr) qrTransform(root);
  if (o.agendaNames) agendaNames(root, o.agendaNames);
  if (o.home) homeLayout(root, o);
  let rs = styleOf(root); if (o.rootExtra) rs += ';' + o.rootExtra; setStyle(root, rs);
  root.removeAttribute('data-screen-label');
  return { root, tabbar, overlay, dialog, html: root.outerHTML };
}

// ---------- frames ----------
const DEV = { P: { w: 768, h: 1024, orient: 'Portrait' }, L: { w: 1024, h: 768, orient: 'Landscape' }, D: { w: 1366, h: 768, orient: 'Desktop' } };
const FRAME = (w, h, inner, label) => `<div data-screen-label="${esc(label)}" style="width:${w}px;height:${h}px;background:#F7F4EF;border:1px solid #D6CEC2;border-radius:10px;overflow:hidden;display:flex;position:relative;flex:none;${FONT};color:#221E1A">${inner}</div>`;
const EMPTY = text => `<div style="flex:1;min-width:0;height:100%;display:flex;align-items:center;justify-content:center;padding:40px;box-sizing:border-box"><span style="font-size:14px;color:#716859;text-align:center;max-width:260px;line-height:1.5">${text}</span></div>`;
function compose({ dev, label, panels, tabbar, overlay, dialog, sidebar, floating }) {
  const { w, h } = DEV[dev]; const rowH = tabbar ? h - 72 : h;
  let inner = sidebar || '';
  inner += `<div style="flex:1;min-width:0;display:flex;flex-direction:column"><div style="display:flex;height:${rowH}px;min-height:0">${panels.join('')}</div>${tabbar || ''}</div>`;
  if (overlay) inner += overlay + (dialog || '');
  if (floating) inner += floating;
  return FRAME(w, h, inner, label);
}
function sidebar(active) {
  const sb = el(SIDEBAR);
  sb.querySelectorAll('nav > div').forEach(item => { const name = item.querySelector('span').textContent.trim(); const isA = name === active; setStyle(item, styleOf(item).replace(/font-weight:\d+;color:#[0-9A-Fa-f]+;background:[^;"]+/, isA ? 'font-weight:600;color:#0B4A4E;background:#EDF4F3' : 'font-weight:500;color:#5F574E;background:transparent')); });
  return sb.outerHTML;
}
const CHAPTERS = ['Seu negócio', 'Sua agenda', 'Sua IA', 'WhatsApp'];
function chapterStates(html) {
  const root = el(html); const head = root.children[0];
  const bars = head ? [...head.querySelectorAll('div[style*="height:4px"]')].filter(d => (d.parentElement.getAttribute('style') || '').includes('gap:4px')) : [];
  if (bars.length !== 4) return ['todo', 'todo', 'todo', 'todo'];
  return bars.map(d => d.firstElementChild ? 'current' : (styleOf(d).includes('#0F5F63') ? 'done' : 'todo'));
}
const CHECK = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#F7F4EF" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"></path></svg>';
function rail(w, states) {
  const rows = CHAPTERS.map((c, i) => { const st = states[i]; const wrap = st === 'current' ? 'background:#EDF4F3;color:#0B4A4E' : `color:${st === 'done' ? '#221E1A' : '#716859'}`; const dot = st === 'done' ? 'background:#0F5F63;color:#F7F4EF' : st === 'current' ? 'border:1.5px solid #0F5F63;color:#0F5F63;box-sizing:border-box' : 'border:1px solid #D6CEC2;color:#716859;box-sizing:border-box'; return `<div style="display:flex;align-items:center;gap:14px;padding:11px 12px;border-radius:12px;${wrap}"><span style="width:26px;height:26px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;flex:none;${dot}">${st === 'done' ? CHECK : i + 1}</span><span style="font-size:15px;font-weight:600">${c}</span></div>`; }).join('');
  return `<div style="width:${w}px;flex:none;background:#FFFDFA;border-right:1px solid #E5DED4;display:flex;flex-direction:column;gap:40px;padding:36px 32px 32px;box-sizing:border-box"><div style="display:flex;align-items:center;gap:10px">${logo(28)}<span style="${SERIF};font-size:22px;font-weight:600;letter-spacing:-0.02em">Atendly</span></div><div style="display:flex;flex-direction:column;gap:12px"><span style="${EYEBROW};padding:0 12px">Configuração inicial</span><div style="display:flex;flex-direction:column;gap:4px">${rows}</div></div></div>`;
}

// ---------- hosting modes ----------
function hostSingle(scr, dev, o = {}) {
  const a = adapt(scr.html, { top: dev === 'P' ? 28 : 24, side: 28, bottom: 28, dialogW: dev === 'P' ? 480 : 440, segMax: dev === 'P' ? 0 : (o.segMax || 0), hideBack: !!o.hideBack, home: !!o.home, homeCol: dev === 'P' ? 0 : (dev === 'D' ? 360 : 320), twoCol: o.twoCol, air: o.air, qr: o.qr, agendaNames: o.agendaNamesP ? { k: 2.15, cellH: 140 } : null, rootExtra: 'flex:1;min-width:0' });
  return compose({ dev, label: o.label, panels: [a.html], tabbar: dev === 'D' ? '' : a.tabbar, overlay: a.overlay, dialog: a.dialog, sidebar: dev === 'D' ? sidebar(o.nav) : '' });
}
function hostSplit(leftScr, rightScr, dev, o = {}) {
  const L = adapt(leftScr.html, { top: 24, side: 20, bottom: 24, hideBack: true, renameMais: !!o.renameMais, air: o.air, dialogW: 440, rootExtra: 'width:380px;flex:none;border-right:1px solid #E5DED4' });
  const R = rightScr ? adapt(rightScr.html, { top: 24, side: 28, bottom: 24, hideBack: true, air: o.air, twoCol: o.twoCol, dialogW: 440, rootExtra: 'flex:1;min-width:0' }) : null;
  const src = R && (R.overlay || !L.overlay) ? R : L;
  return compose({ dev, label: o.label, panels: [L.html, R ? R.html : EMPTY(o.empty || '')], tabbar: dev === 'D' ? '' : (L.tabbar || (R && R.tabbar) || ''), overlay: src.overlay, dialog: src.dialog, sidebar: dev === 'D' ? sidebar(o.nav) : '' });
}
function hostAuth(scr, dev, o = {}) {
  const width = dev === 'P' ? 600 : dev === 'L' ? 560 : 600;
  const a = adapt(scr.html, { top: 40, side: 20, bottom: 32, dialogW: 460, qr: o.qr, rootExtra: `width:${width}px;flex:none` });
  const panels = [];
  if (dev !== 'P') panels.push(rail(dev === 'L' ? 340 : 420, chapterStates(scr.html)));
  panels.push(`<div style="flex:1;min-width:0;height:100%;display:flex;justify-content:center">${a.html}</div>`);
  return compose({ dev, label: o.label, panels, overlay: a.overlay, dialog: a.dialog });
}
function hostDrawer(baseScr, drawerScr, dev, o = {}) {
  const B = adapt(baseScr.html, { top: 24, side: 28, bottom: 24, home: true, homeCol: dev === 'D' ? 360 : 320, rootExtra: 'flex:1;min-width:0' });
  const D = adapt(drawerScr.html, { top: 24, side: 28, bottom: 24, hideBack: true, tab: 'remove', rootExtra: 'position:absolute;top:0;right:0;bottom:0;width:440px;box-shadow:-16px 0 48px rgba(34,30,26,.18);animation:at-reveal .3s ease-out both' });
  return compose({ dev, label: o.label, panels: [B.html], tabbar: dev === 'D' ? '' : B.tabbar, overlay: '<div style="position:absolute;inset:0;background:rgba(34,30,26,.28)"></div>', dialog: D.html, sidebar: dev === 'D' ? sidebar(o.nav) : '' });
}
// Agenda: one shell for Dia / Semana / Mês — top bar (month · Dia|Semana|Mês · arrows · Novo), then day column + panel, or the full-width grid
function hostAgenda(scr, dev, o = {}) {
  const a = adapt(scr.html, { top: 24, side: 28, bottom: 24, dialogW: 460, agendaNames: dev === 'D' ? { k: 1.7, cellH: 116 } : { k: 1.45, cellH: 100 } });
  const root = a.root; const kids = [...root.children];
  const header = kids[0], seg = kids[1];
  const fab = kids.find(c => /position:absolute;right:\d+px;bottom:24px/.test(styleOf(c))); if (fab) fab.remove();
  const rest = kids.filter(c => c !== header && c !== seg && c !== fab);
  const title = header.children[0], arrows = header.children[1];
  const segCtl = seg.children[0]; addStyle(segCtl, 'max-width:420px;flex:1');
  const extra = [...seg.children].slice(1).map(x => x.outerHTML).join('');
  const novo = `<div style="height:40px;padding:0 16px;border-radius:12px;background:#0F5F63;color:#F7F4EF;font-size:14px;font-weight:600;display:inline-flex;align-items:center;gap:8px;flex:none">${ICON.plus}Novo</div>`;
  const bar = `<div style="display:flex;align-items:center;gap:20px;padding:24px 28px 0;flex:none">${title.outerHTML}<div style="flex:1;display:flex;justify-content:center;align-items:center;gap:12px">${segCtl.outerHTML}${extra}</div>${arrows ? arrows.outerHTML : ''}${novo}</div>`;
  const isDay = rest.some(c => c.children.length === 7 && /^padding:\d+px \d+px 0;display:flex;justify-content:space-between/.test(styleOf(c)));
  let body;
  if (isDay) {
    rest.forEach(c => setStyle(c, styleOf(c).replace(/^padding:(8|12)px (\d+)px 0;display:flex;justify-content:space-between/, 'padding:16px 12px 0;display:flex;justify-content:space-between').replace(/(padding|margin):([\d.]+px) 28px/g, '$1:$2 20px')));
    const left = `<div style="width:380px;flex:none;border-right:1px solid #E5DED4;display:flex;flex-direction:column;min-height:0;padding-top:4px">${rest.map(c => c.outerHTML).join('')}</div>`;
    let right;
    if (o.rightScr) right = adapt(o.rightScr.html, { top: 20, side: 28, bottom: 24, hideBack: true, twoCol: o.twoCol, dialogW: 440, rootExtra: 'flex:1;min-width:0' });
    body = `<div style="display:flex;flex:1;min-height:0">${left}${right ? right.html : EMPTY(o.empty || 'Selecione um atendimento para ver os detalhes')}</div>`;
    if (right && right.overlay) { a.overlay = right.overlay; a.dialog = right.dialog; }
  } else {
    rest.forEach(c => setStyle(c, styleOf(c).replace(/^padding:14px (\d+)px 6px/, 'padding:18px $1px 8px')));
    body = `<div style="display:flex;flex-direction:column;flex:1;min-height:0;padding-top:8px">${rest.map(c => c.outerHTML).join('')}</div>`;
  }
  const panel = `<div style="flex:1;min-width:0;display:flex;flex-direction:column">${bar}${body}</div>`;
  if (o.overlayFrom) { const ov = adapt(o.overlayFrom.html, { top: 24, side: 28, bottom: 24, dialogW: 460 }); if (ov.overlay) { a.overlay = ov.overlay; a.dialog = ov.dialog; } }
  return compose({ dev, label: o.label, panels: [panel], tabbar: dev === 'D' ? '' : a.tabbar, overlay: a.overlay, dialog: a.dialog, sidebar: dev === 'D' ? sidebar(o.nav) : '' });
}

// ---------- page assembly ----------
function item(code, title, frame, cap, w) {
  return `<div style="display:flex;flex-direction:column;gap:12px;flex:none;width:${w}px"><div style="display:flex;align-items:baseline;gap:8px"><span style="font-size:11px;font-weight:700;color:#716859">${esc(code)}</span><span style="font-size:14px;font-weight:600">${esc(title)}</span></div>${frame}<p style="margin:0;font-size:13px;line-height:1.5;color:#5F574E">${esc(cap)}</p></div>`;
}
function series(eyebrow, heading, note, items) {
  return `<section style="display:flex;flex-direction:column;gap:20px"><div style="display:flex;align-items:baseline;gap:14px"><span style="${EYEBROW}">${esc(eyebrow)}</span><h3 style="margin:0;${SERIF};font-size:22px;font-weight:500">${esc(heading)}</h3></div>${note ? `<p style="margin:0;font-size:14px;line-height:1.5;color:#5F574E;max-width:900px;text-wrap:pretty">${note}</p>` : ''}<div style="display:flex;flex-wrap:wrap;gap:28px;align-items:flex-start">${items.join('')}</div></section>`;
}
function group(id, eyebrow, heading, note, inner) {
  return `<section id="${id}" style="display:flex;flex-direction:column;gap:40px;padding-top:24px;border-top:1px solid #D6CEC2"><div style="display:flex;flex-direction:column;gap:10px"><div style="display:flex;align-items:baseline;gap:14px"><span style="${EYEBROW}">${esc(eyebrow)}</span><h2 style="margin:0;${SERIF};font-size:34px;font-weight:500;letter-spacing:-0.01em">${esc(heading)}</h2></div>${note ? `<p style="margin:0;font-size:15px;line-height:1.5;color:#5F574E;max-width:900px;text-wrap:pretty">${note}</p>` : ''}</div>${inner}</section>`;
}
function page({ title, intro, links, minWidth, body }) {
  const nav = links.map(([t, h]) => `<a href="${h}">${esc(t)}</a>`).join('');
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<script src="./support.js"></script>
</head>
<body>
<x-dc>
${HELMET}

<div style="${FONT};color:#221E1A;padding:48px 56px 96px;min-width:${minWidth}px;display:flex;flex-direction:column;gap:56px">
<header style="display:flex;align-items:flex-end;justify-content:space-between;gap:32px;padding-bottom:28px;border-bottom:1px solid #D6CEC2;max-width:1920px"><div style="display:flex;flex-direction:column;gap:14px"><a href="Atendly.dc.html" style="display:flex;align-items:center;gap:10px;color:#221E1A">${logo(30)}<span style="${SERIF};font-size:24px;font-weight:600;letter-spacing:-0.02em">Atendly</span><span style="font-size:13px;color:#716859;margin-left:6px">← Índice e design system</span></a><h1 style="margin:0;${SERIF};font-size:36px;line-height:1.1;font-weight:500;letter-spacing:-0.015em">${esc(title)}</h1><p style="margin:0;font-size:15px;line-height:1.5;color:#5F574E;max-width:820px;text-wrap:pretty">${intro}</p></div><nav style="display:flex;flex-direction:column;gap:6px;font-size:14px;font-weight:500;flex:none;text-align:right">${nav}</nav></header>
${body}
</div>
</x-dc>
</body>
</html>
`;
}

async function buildModule(cfg) {
  const maps = []; for (const f of cfg.files) maps.push(await screens(f));
  const S = label => { for (const m of maps) if (m.has(label)) return m.get(label); throw new Error('no screen ' + label); };
  const build = (spec, dev) => {
    const scr = S(spec.l);
    const o = { label: `${cfg.name} / ${scr.label} / ${DEV[dev].orient}`, nav: spec.nav || cfg.nav, empty: spec.empty !== undefined ? spec.empty : (cfg.empty || ''), segMax: spec.segMax, home: spec.home, renameMais: spec.renameMais || cfg.renameMais, hideBack: spec.hideBack, twoCol: spec.twoCol, air: spec.air || cfg.air, qr: spec.qr, rightScr: spec.right ? S(spec.right) : null };
    let frame;
    if (spec.mode === 'auth') frame = hostAuth(scr, dev, o);
    else if (spec.mode === 'agenda') frame = dev === 'P' ? hostSingle(scr, 'P', { ...o, agendaNamesP: true }) : hostAgenda(scr, dev, o);
    else if (spec.mode === 'agendaPanel') frame = dev === 'P' ? hostSingle(scr, 'P', o) : hostAgenda(S(spec.base), dev, { ...o, rightScr: scr });
    else if (spec.mode === 'agendaOverlay') frame = dev === 'P' ? hostSingle(scr, 'P', { ...o, agendaNamesP: true }) : hostAgenda(S(spec.base), dev, { ...o, overlayFrom: scr });
    else if (dev === 'P') frame = hostSingle(scr, 'P', o);
    else if (spec.mode === 'split') frame = spec.left ? hostSplit(S(spec.left), scr, dev, o) : hostSplit(scr, spec.right ? S(spec.right) : null, dev, o);
    else if (spec.mode === 'drawer') frame = hostDrawer(S(spec.base), scr, dev, o);
    else frame = hostSingle(scr, dev, o);
    return item(scr.code, scr.title, frame, scr.cap, DEV[dev].w);
  };
  const ser = dev => series('Série completa', `Cada tela do celular em ${DEV[dev].orient} · ${DEV[dev].w} × ${DEV[dev].h}`, '', cfg.specs.map(s => build(s, dev)));
  const mob = cfg.files.map(f => [`← ${f.replace('.dc.html', '')} (celular)`, f]);
  const tablet = page({ title: `${cfg.title} — Tablet`, intro: cfg.introTablet, minWidth: 2200, links: [...mob, [`${cfg.title} — Desktop →`, `${cfg.slug}-Desktop.dc.html`], ['Índice →', 'Atendly.dc.html']],
    body: group('portrait', 'Orientação 1 de 2', 'Portrait · 768 × 1024', cfg.noteP, ser('P')) + group('landscape', 'Orientação 2 de 2', 'Landscape · 1024 × 768', cfg.noteL, ser('L')) });
  const desktop = page({ title: `${cfg.title} — Desktop`, intro: cfg.introDesktop, minWidth: 2000, links: [...mob, [`${cfg.title} — Tablet →`, `${cfg.slug}-Tablet.dc.html`], ['Índice →', 'Atendly.dc.html']],
    body: group('desktop', 'Referência 1440 × 900 · validado em 1366 × 768', 'Desktop · 1366 × 768', cfg.noteD, ser('D')) });
  await saveFile(`${cfg.slug}-Tablet.dc.html`, relogo(tablet));
  await saveFile(`${cfg.slug}-Desktop.dc.html`, relogo(desktop));
  log(cfg.slug, 'tablet', tablet.length, 'desktop', desktop.length, 'screens', cfg.specs.length);
}

return { init, screens, adapt, compose, hostSingle, hostSplit, hostAuth, hostDrawer, hostAgenda, item, series, group, page, buildModule, DEV, FRAME, EMPTY, esc, parse, el, mk, styleOf, setStyle, HELMET, sidebar, rail, logo, relogo, LOGO_D, ICON, FONT, SERIF, EYEBROW, CHECK, qrSvg };
