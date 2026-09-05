// injected into preview: contrast + touch-target report for all [data-screen-label] frames
(function(){
  const lum = c => { const m = c.match(/\d+(\.\d+)?/g).map(Number); const [r,g,b] = m.slice(0,3).map(v => { v/=255; return v<=0.03928? v/12.92 : Math.pow((v+0.055)/1.055,2.4); }); return 0.2126*r+0.7152*g+0.0722*b; };
  const alpha = c => { const m = c.match(/\d+(\.\d+)?/g); return m && m.length===4 ? +m[3] : (c==='rgba(0, 0, 0, 0)'?0:1); };
  const ratio = (a,b) => { const l1=lum(a), l2=lum(b); return (Math.max(l1,l2)+0.05)/(Math.min(l1,l2)+0.05); };
  const bgOf = el => { let e = el; while (e) { const s = getComputedStyle(e); if (alpha(s.backgroundColor) >= 0.9) return s.backgroundColor; if (s.backgroundImage && s.backgroundImage !== 'none' && /linear-gradient/.test(s.backgroundImage)) { const m = s.backgroundImage.match(/rgb\([^)]+\)/); if (m) return m[0]; } e = e.parentElement; } return 'rgb(255,255,255)'; };
  const out = {contrast: [], targets: []};
  document.querySelectorAll('[data-screen-label]').forEach(f => {
    const L = f.getAttribute('data-screen-label');
    const nodes = f.querySelectorAll('span,div,p,h1,h2,h3,label,strong');
    const seenC = new Set();
    nodes.forEach(n => {
      if (!n.childNodes.length) return; const tx = [...n.childNodes].filter(c => c.nodeType===3).map(c => c.textContent.trim()).join(''); if (!tx) return;
      const s = getComputedStyle(n); if (s.visibility==='hidden' || +s.opacity < 0.5) return; if (n.closest('[style*="opacity:.5"],[style*="opacity:.6"],[style*="opacity:.4"]')) return;
      const fg = s.color; if (alpha(fg) < 0.9) return; const bg = bgOf(n); const r = ratio(fg,bg); const fs = parseFloat(s.fontSize); const bold = +s.fontWeight >= 600;
      const large = fs >= 24 || (fs >= 18.66 && bold); const min = large ? 3 : 4.5;
      if (r < min) { const key = fg+'|'+bg+'|'+Math.round(fs); if (seenC.has(key)) return; seenC.add(key); out.contrast.push({L, tx: tx.slice(0,40), fg, bg, r: +r.toFixed(2), fs}); }
    });
    // touch targets: elements that look like actions (buttons/links/icons) smaller than 44 in both dims, only within mobile frames
    if (f.closest('x-import') || /width:402px|height:100%/.test(f.getAttribute('style')||'')) {
      f.querySelectorAll('div,span').forEach(n => { const st = n.getAttribute('style')||''; if (!/cursor|justify-content:center/.test(st)) return; const isAction = /background:#0F5F63|border:1px solid #D6CEC2|color:#0F5F63/.test(st) && /display:(inline-)?flex/.test(st); if (!isAction) return; const rct = n.getBoundingClientRect(); if (rct.width < 36 && rct.height < 36 && rct.width > 4) out.targets.push({L, tx: n.textContent.trim().slice(0,24)||'(icon)', w: Math.round(rct.width), h: Math.round(rct.height)}); });
    }
  });
  window.__a11y = out;
  return out;
})();
