// Polish pass — loaded with new Function('ctx', src)(ctx); ctx = { readFile, saveFile, log }
// Applies the Atendly motion language + interactive states to every frame of every page, in place.
const { readFile, saveFile, log } = ctx;
const parseDoc = s => new DOMParser().parseFromString(s, 'text/html');
const serialize = doc => '<!DOCTYPE html>\n' + doc.documentElement.outerHTML + '\n';
const styleOf = e => e.getAttribute('style') || '';
const setStyle = (e, s) => e.setAttribute('style', s.replace(/;;+/g, ';').replace(/^;|;$/g, ''));
const addStyle = (e, s) => setStyle(e, styleOf(e) + ';' + s);
const has = (e, re) => re.test(styleOf(e));
const EASE = 'cubic-bezier(.2,.7,.2,1)';   // saída suave — entradas, hover, tabs
const EASE_IN = 'cubic-bezier(.4,0,1,1)';   // saídas

const KEYFRAMES = `@keyframes at-breathe{0%{transform:scale(1);opacity:.75}70%{transform:scale(2.3);opacity:0}100%{transform:scale(2.3);opacity:0}}
@keyframes at-breathe-lg{0%{transform:scale(1);opacity:.6}80%{transform:scale(1.9);opacity:0}100%{transform:scale(1.9);opacity:0}}
@keyframes at-reveal{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
@keyframes at-fade{from{opacity:0}to{opacity:1}}
@keyframes at-sheet{from{transform:translateY(32px);opacity:0}to{transform:none;opacity:1}}
@keyframes at-dialog{from{transform:scale(.96);opacity:0}to{transform:none;opacity:1}}
@keyframes at-drawer{from{transform:translateX(32px);opacity:0}to{transform:none;opacity:1}}
@keyframes at-toast{from{transform:translateY(12px);opacity:0}to{transform:none;opacity:1}}
@keyframes at-shimmer{from{background-position:200% 0}to{background-position:-200% 0}}
@keyframes at-typing{0%,80%,100%{opacity:.25;transform:translateY(0)}40%{opacity:1;transform:translateY(-2px)}}
@keyframes at-pop{0%{transform:scale(.7);opacity:0}70%{transform:scale(1.04);opacity:1}100%{transform:scale(1)}}
@keyframes at-blink{50%{opacity:.2}}
@keyframes at-grow{from{width:4%}to{width:78%}}
@keyframes at-grow2{from{width:0}to{width:41%}}
@keyframes at-draw{to{stroke-dashoffset:0}}
@keyframes at-float{0%,100%{transform:translateY(0)}50%{transform:translateY(-8px)}}`;
const REDUCED = `@media (prefers-reduced-motion:reduce){*{animation-duration:.001s!important;animation-delay:0s!important;animation-iteration-count:1!important;transition-duration:.001s!important}}`;

function upgradeHelmet(doc) {
  const st = doc.querySelector('helmet style'); if (!st) return;
  const keep = st.textContent.split('\n').filter(l => /^body\{|^a\{/.test(l.trim()));
  st.textContent = '\n' + keep.join('\n') + '\n' + KEYFRAMES + '\n' + REDUCED + '\n';
}

// ---------- brand signature (Login) ----------
// p1 Λ: sobe pela perna esquerda, desce até o check · p3 check: nasce dentro do A e escapa · p2 resto da perna: o A se completa depois da confirmação
const LOGO_ANIM = {
  'M6 56L28 9L40.85 36.5': `stroke-dasharray:100 400;stroke-dashoffset:106;animation:at-draw .46s ${EASE} 0s forwards`,
  'M25.5 38L32 44.5L58 21': `stroke-dasharray:100 400;stroke-dashoffset:106;animation:at-draw .38s ${EASE} .34s forwards`,
  'M44.7 44.8L50 56': `stroke-dasharray:100 400;stroke-dashoffset:106;animation:at-draw .22s ${EASE} .6s forwards`,
};
function brandSignature(root) {
  let n = 0;
  root.querySelectorAll('path[style*="stroke-dasharray"]').forEach(p => {
    const d = p.getAttribute('d'); const a = LOGO_ANIM[d]; if (!a) return;
    p.setAttribute('style', a); p.setAttribute('pathLength', '100'); n++;
    const svg = p.closest('svg'); const word = svg && svg.nextElementSibling;
    if (word && word.tagName === 'SPAN' && /Atendly/.test(word.textContent) && !/animation:/.test(styleOf(word))) addStyle(word, `animation:at-fade .32s ease-out .38s both`);
  });
  return n;
}

// ---------- interactive states ----------
const T = {
  btn: `transition:background-color .16s ${EASE},border-color .16s ${EASE},color .16s ${EASE},transform .12s ease,box-shadow .16s ${EASE}`,
  color: `transition:color .16s ${EASE}`,
  bg: `transition:background-color .16s ${EASE},color .16s ${EASE}`,
};
function pseudo(el, hover, active) {
  if (hover && !el.hasAttribute('style-hover')) el.setAttribute('style-hover', hover);
  if (active && !el.hasAttribute('style-active')) el.setAttribute('style-active', active);
}
function trans(el, t, cursor = true) {
  let s = styleOf(el);
  if (!/(^|;)transition:/.test(s)) s += ';' + t;
  if (cursor && !/cursor:/.test(s)) s += ';cursor:pointer';
  setStyle(el, s);
}
const isFlexCenter = e => has(e, /display:(inline-)?flex/) && has(e, /justify-content:center/);
const avatarIn = e => [...e.children].some(c => /width:4[04]px;height:4[04]px;border-radius:50%/.test(styleOf(c)));

function states(frame, mobile) {
  const st = { primary: 0, secondary: 0, destructive: 0, link: 0, icon: 0, chip: 0, tab: 0, nav: 0, row: 0, seg: 0, toggle: 0, ink: 0 };
  frame.querySelectorAll('[style]').forEach(e => {
    const s = styleOf(e);
    if (e.closest('svg')) return;
    if (/background:#B9B1A6/.test(s)) return; // desabilitado
    // botão primário (inclui FAB, “Novo”, pílulas de data selecionada)
    if (/background:#0F5F63;color:#F7F4EF/.test(s) && (isFlexCenter(e) || /padding:0 1[0-9]px|height:(34|36|40|44|52)px/.test(s))) {
      pseudo(e, 'background:#0B484C', 'background:#0B484C;transform:scale(.98)'); trans(e, T.btn); st.primary++; return;
    }
    // botão forte em tinta (Pausar IA)
    if (/background:#221E1A;color:#F7F4EF/.test(s) && /font-weight:600/.test(s) && isFlexCenter(e) && /height:(44|52)px/.test(s)) {
      pseudo(e, 'background:#0F0D0B', 'background:#0F0D0B;transform:scale(.98)'); trans(e, T.btn); st.ink++; return;
    }
    // destrutivo
    if (/background:#B3392E;color:#FFFDFA/.test(s) && isFlexCenter(e)) {
      pseudo(e, 'background:#9E3128', 'background:#9E3128;transform:scale(.98)'); trans(e, T.btn); st.destructive++; return;
    }
    // secundário (contorno)
    if (/border:1px solid #D6CEC2/.test(s) && /font-weight:600/.test(s) && isFlexCenter(e) && !/height:56px/.test(s)) {
      pseudo(e, 'background:#EFEAE2;border-color:#C9C0B3', 'background:#E5DED4;transform:scale(.98)'); trans(e, T.btn); st.secondary++; return;
    }
    // pílula de ação em tom de marca (Retomar IA)
    if (/border-radius:999px;background:#DCECEB;color:#0B4A4E;font-size:14px;font-weight:600/.test(s)) {
      pseudo(e, 'background:#CFE3E1', 'background:#C2D9D6;transform:scale(.98)'); trans(e, T.btn); st.primary++; return;
    }
    // botão de ícone redondo (sino, busca)
    if (/width:40px;height:40px;border-radius:50%;background:#FFFDFA;border:1px solid #E5DED4/.test(s)) {
      pseudo(e, 'background:#F3EFE8;border-color:#D6CEC2', 'background:#EFEAE2;transform:scale(.96)'); trans(e, T.btn); st.icon++; return;
    }
    // botão de ícone sem fundo (voltar, fechar, •••)
    if (/^width:40px;height:40px;display:flex;align-items:center;justify-content:center/.test(s) && !/visibility:hidden/.test(s)) {
      pseudo(e, 'background:#EFEAE2;border-radius:50%', 'background:#E5DED4;border-radius:50%'); trans(e, T.bg); st.icon++; return;
    }
    // chips
    if (/height:36px;padding:0 14px;border-radius:10px;border:1px solid #D6CEC2/.test(s)) { pseudo(e, 'background:#F3EFE8', 'background:#EFEAE2'); trans(e, T.btn); st.chip++; return; }
    if (/border:1\.5px solid #0F5F63;background:#EDF4F3;color:#0B4A4E/.test(s) && /border-radius:1[06]px/.test(s)) { pseudo(e, 'background:#E3EEED', null); trans(e, T.btn); st.chip++; return; }
    // segmented · opção inativa
    if (/^flex:1;height:36px;border-radius:9px;display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:500;color:#5F574E/.test(s)) { pseudo(e, 'color:#221E1A', null); trans(e, T.color); st.seg++; return; }
    // tabs inativas
    if (/^padding:0 0 10px;font-size:15px;font-weight:500;color:#716859/.test(s)) { pseudo(e, 'color:#221E1A', null); trans(e, T.color); st.tab++; return; }
    // bottom navigation (sem hover no celular; feedback de toque)
    if (/^display:flex;flex-direction:column;align-items:center;gap:3px;color:#(0F5F63|716859);width:(64|72)px/.test(s)) { pseudo(e, mobile ? null : 'color:#221E1A', 'opacity:.6'); trans(e, T.color); st.nav++; return; }
    // links de texto (Ver agenda, Pausar, Corrigir…)
    if (/^font-size:1[345]px;font-weight:600;color:#0F5F63/.test(s) && e.tagName === 'SPAN' && !e.closest('[style-hover]')) {
      pseudo(e, 'color:#0B484C;text-decoration:underline;text-underline-offset:3px', 'color:#0B484C'); trans(e, T.color); st.link++; return;
    }
    // toggles
    if (/^width:46px;height:28px;border-radius:999px;background:#(0F5F63|D6CEC2);position:relative/.test(s)) { trans(e, `transition:background-color .2s ${EASE}`); st.toggle++; return; }
  });
  // sidebar (tablet landscape / desktop)
  frame.querySelectorAll('nav > div').forEach(item => {
    const s = styleOf(item); if (!/border-radius:10px/.test(s)) return;
    if (/background:transparent/.test(s)) pseudo(item, 'background:#F3EFE8;color:#221E1A', 'background:#EFEAE2');
    trans(item, T.bg); st.nav++;
  });
  // linhas de lista (só onde há ponteiro: tablet e desktop)
  if (!mobile) {
    frame.querySelectorAll('div[style^="display:flex"]').forEach(row => {
      const s = styleOf(row);
      if (!/gap:1[24]px;padding:1[024]px/.test(s) || !avatarIn(row)) return;
      if (/background:#(F8ECD5|EDF4F3)/.test(s) || /box-shadow:inset/.test(s)) return;
      pseudo(row, 'background:#F7F4EF', null); trans(row, `transition:background-color .16s ${EASE}`); st.row++;
    });
  }
  return st;
}

// ---------- overlays ----------
function overlays(frame) {
  const o = { scrim: 0, sheet: 0, dialog: 0, drawer: 0, toast: 0, reveal: 0 };
  frame.querySelectorAll('[style]').forEach(e => {
    let s = styleOf(e);
    if (/position:absolute;inset:0;background:rgba\(34,30,26,\.(38|28)\)/.test(s)) { if (!/animation:/.test(s)) s += ';animation:at-fade .2s ease-out both'; o.scrim++; }
    else if (/box-shadow:0 24px 64px rgba\(34,30,26,\.28\)/.test(s)) { s = s.replace(/;?animation:[^;]+/, ''); s += `;animation:at-dialog .22s ${EASE} both`; o.dialog++; }
    else if (/box-shadow:-16px 0 48px rgba\(34,30,26,\.18\)/.test(s)) { s = s.replace(/;?animation:[^;]+/, ''); s += `;animation:at-drawer .28s ${EASE} both`; o.drawer++; }
    else if (/position:absolute;left:0;right:0;bottom:0;background:#FFFDFA;border-radius:24px 24px 0 0/.test(s)) { s = s.replace(/;?animation:[^;]+/, ''); s += `;animation:at-sheet .32s ${EASE} both`; o.sheet++; }
    else if (/background:#221E1A;color:#F7F4EF;font-size:14px;font-weight:500/.test(s) && /position:absolute/.test(s)) { if (!/animation:/.test(s)) s += `;animation:at-toast .24s ${EASE} both`; o.toast++; }
    else if (/animation:at-reveal \.5s ease-out/.test(s)) { s = s.replace(/animation:at-reveal \.5s ease-out/, `animation:at-reveal .4s ${EASE}`); o.reveal++; }
    else if (/animation:at-sheet \.5s ease-out \.2s both/.test(s)) { s = s.replace(/animation:at-sheet \.5s ease-out \.2s both/, `animation:at-sheet .4s ${EASE} .1s both`); o.sheet++; }
    if (s !== styleOf(e)) setStyle(e, s);
  });
  return o;
}

// ---------- Login mobile: marca um pouco maior para a apresentação ----------
function loginBrandRow(frame) {
  const svg = frame.querySelector('svg[width="26"][viewBox="0 0 64 64"]'); if (!svg) return false;
  const word = svg.nextElementSibling; if (!word || !/Atendly/.test(word.textContent)) return false;
  svg.setAttribute('width', '30'); svg.setAttribute('height', '30');
  setStyle(word, styleOf(word).replace('font-size:20px', 'font-size:22px'));
  return true;
}

const sum = (a, b) => { for (const k in b) a[k] = (a[k] || 0) + b[k]; return a; };
async function run(files) {
  const report = {};
  for (const f of files) {
    const t = await readFile(f); const doc = parseDoc(t);
    upgradeHelmet(doc);
    const tot = {}; let logos = 0, brand = 0;
    const frames = [...doc.querySelectorAll('[data-screen-label]')];
    frames.forEach(frame => {
      const mobile = !!frame.closest('x-import') || /^height:100%/.test(styleOf(frame));
      sum(tot, states(frame, mobile)); sum(tot, overlays(frame));
      logos += brandSignature(frame);
      if (/^Login/.test(f) && mobile && loginBrandRow(frame)) brand++;
    });
    if (!frames.length) { sum(tot, states(doc.body, false)); logos += brandSignature(doc.body); }
    const out = serialize(doc); await saveFile(f, out);
    report[f] = { ...tot, logos, brand, kb: Math.round(out.length / 1024) };
    log(f, JSON.stringify(report[f]));
  }
  return report;
}
return { run, upgradeHelmet, states, overlays, brandSignature, KEYFRAMES, REDUCED, EASE, EASE_IN, parseDoc, serialize, styleOf, setStyle, addStyle };
