// QA helpers — loaded with new Function('ctx', src)(ctx); ctx = { readFile, saveFile, log }
const { readFile, saveFile, log } = ctx;
const parseDoc = s => new DOMParser().parseFromString(s, 'text/html');
const styleOf = e => e.getAttribute('style') || '';
const setStyle = (e, s) => e.setAttribute('style', s.replace(/;;+/g, ';').replace(/^;|;$/g, ''));
const addStyle = (e, s) => setStyle(e, styleOf(e) + ';' + s);
const rmStyle = (e, ...props) => { const m = new Map(); styleOf(e).split(';').forEach(d => { const i = d.indexOf(':'); if (i > 0) m.set(d.slice(0, i).trim(), d.slice(i + 1).trim()); }); props.forEach(p => m.delete(p)); setStyle(e, [...m].map(([k, v]) => k + ':' + v).join(';')); };
const text = e => e.textContent.replace(/\s+/g, ' ').trim();
const frames = doc => [...doc.querySelectorAll('[data-screen-label]')];
const label = f => f.getAttribute('data-screen-label');
const mk = (doc, style, inner) => { const d = doc.createElement('div'); setStyle(d, style); if (inner) d.innerHTML = inner; return d; };
// serialize a full document back to file text (keeps doctype)
const serialize = doc => '<!DOCTYPE html>\n' + doc.documentElement.outerHTML + '\n';
async function withDoc(file, fn) { const t = await readFile(file); const doc = parseDoc(t); const r = await fn(doc, t); await saveFile(file, serialize(doc)); log(file, 'saved', serialize(doc).length); return r; }
// sidebar state per frame (desktop pages)
const RING = {
  active: '<div style="position:relative;width:18px;height:18px;flex:none"><div style="position:absolute;inset:0;border-radius:50%;border:1.5px solid #0F5F63;animation:at-breathe 2.4s ease-out infinite"></div><div style="position:absolute;inset:5px;border-radius:50%;background:#0F5F63"></div></div>',
  off: '<div style="width:18px;height:18px;border-radius:50%;border:2px solid #716859;box-sizing:border-box;flex:none"></div>',
  amber: '<div style="width:18px;height:18px;border-radius:50%;background:#B7791B;box-shadow:0 0 0 3px #F1D9A8;flex:none;box-sizing:border-box"></div>',
  red: '<div style="width:18px;height:18px;border-radius:50%;border:2px solid #B3392E;box-sizing:border-box;position:relative;flex:none"><div style="position:absolute;left:-3px;top:6px;width:20px;height:2px;background:#B3392E;transform:rotate(-45deg)"></div></div>',
};
const IA_STATES = {
  active: { ring: 'active', title: 'IA ativa', sub: 'atendendo pelo WhatsApp', action: 'Pausar', color: '#0F5F63' },
  paused: { ring: 'off', title: 'IA pausada', sub: 'desde 09:12', action: 'Reativar', color: '#0F5F63', bg: '#EFEAE2' },
  inactive: { ring: 'off', title: 'IA inativa', sub: 'falta conectar o WhatsApp', action: '', color: '' },
  unstable: { ring: 'amber', title: 'IA com instabilidade', sub: 'tentando de novo…', action: '', color: '', bg: '#F8ECD5', fg: '#7A4E0A' },
  disconnected: { ring: 'red', title: 'WhatsApp desconectado', sub: 'a IA não está atendendo', action: 'Reconectar', color: '#B3392E', bg: '#F8E2DE', fg: '#8A2A21' },
};
function setSidebar(frame, state, badge) {
  const sb = frame.querySelector(':scope > div[style*="width:232px"]'); if (!sb) return;
  const card = [...sb.querySelectorAll('div')].find(d => /border:1px solid #E5DED4/.test(styleOf(d)) && d.querySelector('span') && /^IA /.test(text(d.querySelector('span'))) || (d.getAttribute('data-ia') === '1'));
  if (card && state) {
    const s = IA_STATES[state]; card.setAttribute('data-ia', '1');
    setStyle(card, `display:flex;align-items:center;gap:12px;padding:12px 12px;border-radius:12px;border:1px solid ${s.bg ? 'transparent' : '#E5DED4'}${s.bg ? ';background:' + s.bg : ''}`);
    card.innerHTML = `${RING[s.ring]}<div style="flex:1;display:flex;flex-direction:column;min-width:0"><span style="font-size:13px;font-weight:600${s.fg ? ';color:' + s.fg : ''}">${s.title}</span><span style="font-size:12px;color:${s.fg || '#716859'};line-height:1.35">${s.sub}</span></div>${s.action ? `<span style="font-size:12px;font-weight:600;color:${s.color}">${s.action}</span>` : ''}`;
  }
  const b = [...sb.querySelectorAll('nav span')].find(x => /background:#B7791B/.test(styleOf(x)));
  if (badge === false && b) b.remove();
}
// highlight the row in a list panel whose text starts with `name`
function selectRow(frame, name, opts = {}) {
  const panels = [...frame.querySelectorAll('div[style*="width:380px"]')];
  for (const p of panels) {
    const rows = [...p.querySelectorAll('div')].filter(d => { const n = d.querySelector('span'); return n && text(n) === name && d.children.length >= 2 && /display:flex/.test(styleOf(d)); });
    // choose the outermost row-like container that has the avatar + text
    const row = rows.map(r => { let c = r; while (c.parentElement && c.parentElement !== p && !/border-bottom|border-top|padding:1\dpx/.test(styleOf(c)) ) c = c.parentElement; return c; })[0] || rows[0];
    if (!row) continue;
    const bg = opts.bg || '#EDF4F3';
    if (/background:#F8ECD5/.test(styleOf(row))) { addStyle(row, 'box-shadow:inset 3px 0 0 #0F5F63'); }
    else { rmStyle(row, 'background'); addStyle(row, `background:${bg};box-shadow:inset 3px 0 0 #0F5F63`); }
    if (!/border-radius/.test(styleOf(row))) addStyle(row, 'border-radius:0 12px 12px 0');
    return true;
  }
  return false;
}
return { parseDoc, styleOf, setStyle, addStyle, rmStyle, text, frames, label, mk, serialize, withDoc, setSidebar, selectRow, RING, IA_STATES };
