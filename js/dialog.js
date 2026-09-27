// =====================================================================
// DEV MENU — نوافذ حوار بهوية المنصة (بدل prompt و confirm حق المتصفح)
//   DMDialog.form({ title, subtitle, icon, fields, confirmText, note })  → قيم الحقول أو null
//   DMDialog.confirm({ title, message, confirmText, tone })              → true / false
// الحقول: { name, label, value, placeholder, hint, dir, maxlength, required }
//         أو { name, label, type: 'choice', value, options: [{ value, label, desc, icon }] }
//         ولحقل نصي: suggestions: ['...'] تظهر كأزرار سريعة
// =====================================================================
(function () {
  const CSS = `
    .dmd-back{position:fixed;inset:0;z-index:100;background:rgba(34,54,42,.45);backdrop-filter:blur(4px);display:flex;align-items:center;justify-content:center;padding:16px;opacity:0;transition:opacity .18s}
    .dmd-back.on{opacity:1}
    .dmd-box{width:100%;max-width:440px;max-height:calc(100vh - 32px);overflow-y:auto;background:#faf6f1;border:1px solid rgba(56,79,61,.16);border-radius:22px;
      box-shadow:0 30px 60px -20px rgba(34,54,42,.45);padding:20px;color:#22362a;font-family:inherit;transform:translateY(10px) scale(.98);transition:transform .18s}
    .dmd-back.on .dmd-box{transform:none}
    .dmd-head{display:flex;gap:12px;align-items:flex-start;margin-bottom:14px}
    .dmd-icon{width:40px;height:40px;border-radius:12px;display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:16px;background:rgba(56,79,61,.1);color:#384f3d}
    .dmd-icon.danger{background:rgba(220,38,38,.1);color:#b91c1c}
    .dmd-title{font-size:15px;font-weight:900;line-height:1.4}
    .dmd-sub{font-size:12px;color:rgba(34,54,42,.62);margin-top:3px;line-height:1.6;white-space:pre-line}
    .dmd-field{margin-top:12px}
    .dmd-label{display:block;font-size:12px;font-weight:800;margin-bottom:6px}
    .dmd-label small{font-weight:600;color:rgba(34,54,42,.5)}
    .dmd-input{width:100%;background:#fff;border:1.5px solid rgba(56,79,61,.2);border-radius:12px;padding:11px 13px;font-size:16px;color:#22362a;font-family:inherit;transition:border-color .15s,box-shadow .15s}
    .dmd-input:focus{outline:none;border-color:#384f3d;box-shadow:0 0 0 3px rgba(56,79,61,.12)}
    .dmd-input.bad{border-color:#dc2626;box-shadow:0 0 0 3px rgba(220,38,38,.1)}
    .dmd-hint{font-size:11px;color:rgba(34,54,42,.55);margin-top:5px;line-height:1.6}
    .dmd-sugg{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px}
    .dmd-sugg button{font-size:11px;font-weight:800;padding:5px 10px;border-radius:999px;background:rgba(56,79,61,.07);border:1px solid rgba(56,79,61,.15);color:#22362a;font-family:inherit;cursor:pointer}
    .dmd-choices{display:grid;gap:8px}
    .dmd-choice{display:flex;gap:10px;align-items:flex-start;text-align:right;padding:11px 12px;border-radius:14px;border:1.5px solid rgba(56,79,61,.15);background:#fff;cursor:pointer;font-family:inherit;color:#22362a;transition:all .15s}
    .dmd-choice.on{border-color:#384f3d;background:rgba(56,79,61,.06);box-shadow:0 0 0 3px rgba(56,79,61,.08)}
    .dmd-choice b{display:block;font-size:13px}
    .dmd-choice span{display:block;font-size:11px;color:rgba(34,54,42,.6);margin-top:2px;line-height:1.5}
    .dmd-choice .dmd-dot{width:18px;height:18px;border-radius:50%;border:2px solid rgba(56,79,61,.3);flex-shrink:0;margin-top:1px;display:flex;align-items:center;justify-content:center}
    .dmd-choice.on .dmd-dot{border-color:#384f3d}
    .dmd-choice.on .dmd-dot::after{content:'';width:8px;height:8px;border-radius:50%;background:#384f3d}
    .dmd-note{margin-top:14px;font-size:11px;line-height:1.7;background:rgba(56,79,61,.06);border:1px solid rgba(56,79,61,.12);border-radius:12px;padding:9px 11px;color:rgba(34,54,42,.75)}
    .dmd-err{color:#b91c1c;font-size:11px;font-weight:800;margin-top:6px;min-height:0}
    .dmd-actions{display:flex;gap:8px;margin-top:18px}
    .dmd-btn{flex:1;border-radius:13px;padding:12px;font-size:13px;font-weight:900;font-family:inherit;cursor:pointer;border:0;transition:background .15s}
    .dmd-ok{background:#384f3d;color:#faf6f1}.dmd-ok:hover{background:#2a3e2f}
    .dmd-ok.danger{background:#dc2626}.dmd-ok.danger:hover{background:#b91c1c}
    .dmd-cancel{background:rgba(56,79,61,.08);color:#22362a;border:1px solid rgba(56,79,61,.18)}.dmd-cancel:hover{background:rgba(56,79,61,.14)}
    @media (max-width:640px){.dmd-back{align-items:flex-end;padding:0}.dmd-box{max-width:none;border-radius:22px 22px 0 0;padding-bottom:calc(20px + env(safe-area-inset-bottom))}}`;
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function injectCss() {
    if (document.getElementById('dmd-css')) return;
    const st = document.createElement('style'); st.id = 'dmd-css'; st.textContent = CSS; document.head.appendChild(st);
  }

  function open({ title, subtitle = '', icon = 'fa-pen', tone = '', fields = [], confirmText = 'حفظ', cancelText = 'إلغاء', note = '' }) {
    injectCss();
    return new Promise((resolve) => {
      const back = document.createElement('div');
      back.className = 'dmd-back';
      back.setAttribute('role', 'dialog');
      back.setAttribute('aria-modal', 'true');
      const values = {};
      const fieldHtml = fields.map((f, i) => {
        if (f.type === 'choice') {
          values[f.name] = f.value ?? (f.options[0] && f.options[0].value);
          return `<div class="dmd-field">${f.label ? `<span class="dmd-label">${esc(f.label)}</span>` : ''}
            <div class="dmd-choices" data-choice="${esc(f.name)}">${f.options.map(o => `
              <button type="button" class="dmd-choice ${o.value === values[f.name] ? 'on' : ''}" data-value="${esc(o.value)}">
                <i class="dmd-dot"></i><div>${o.icon ? `<i class="fa-solid ${esc(o.icon)}"></i> ` : ''}<b style="display:inline">${esc(o.label)}</b>${o.desc ? `<span>${esc(o.desc)}</span>` : ''}</div>
              </button>`).join('')}</div></div>`;
        }
        return `<div class="dmd-field">
          <label class="dmd-label" for="dmd-f${i}">${esc(f.label)}${f.required ? '' : ' <small>(اختياري)</small>'}</label>
          <input id="dmd-f${i}" class="dmd-input" data-name="${esc(f.name)}" value="${esc(f.value ?? '')}" placeholder="${esc(f.placeholder || '')}"
            ${f.maxlength ? `maxlength="${Number(f.maxlength)}"` : ''} ${f.dir ? `dir="${esc(f.dir)}"` : ''} autocomplete="off">
          ${f.suggestions && f.suggestions.length ? `<div class="dmd-sugg">${f.suggestions.map(s => `<button type="button" data-fill="${i}" data-v="${esc(s)}">${esc(s)}</button>`).join('')}</div>` : ''}
          ${f.hint ? `<p class="dmd-hint">${esc(f.hint)}</p>` : ''}
          <p class="dmd-err" data-err="${i}"></p>
        </div>`;
      }).join('');
      back.innerHTML = `
        <div class="dmd-box">
          <div class="dmd-head">
            <span class="dmd-icon ${tone === 'danger' ? 'danger' : ''}"><i class="fa-solid ${esc(icon)}"></i></span>
            <div><p class="dmd-title">${esc(title)}</p>${subtitle ? `<p class="dmd-sub">${esc(subtitle)}</p>` : ''}</div>
          </div>
          ${fieldHtml}
          ${note ? `<p class="dmd-note">${esc(note)}</p>` : ''}
          <div class="dmd-actions">
            <button type="button" class="dmd-btn dmd-ok ${tone === 'danger' ? 'danger' : ''}" data-act="ok">${esc(confirmText)}</button>
            <button type="button" class="dmd-btn dmd-cancel" data-act="cancel">${esc(cancelText)}</button>
          </div>
        </div>`;
      const prevFocus = document.activeElement;
      document.body.appendChild(back);
      requestAnimationFrame(() => back.classList.add('on'));
      const inputs = [...back.querySelectorAll('.dmd-input')];
      setTimeout(() => { const f = inputs[0] || back.querySelector('[data-act="ok"]'); f.focus(); if (inputs[0]) inputs[0].select(); }, 60);

      const close = (result) => {
        back.classList.remove('on');
        document.removeEventListener('keydown', onKey, true);
        setTimeout(() => { back.remove(); if (prevFocus && prevFocus.focus) prevFocus.focus(); }, 180);
        resolve(result);
      };
      const submit = () => {
        let ok = true;
        fields.forEach((f, i) => {
          if (f.type === 'choice') return;
          const input = back.querySelector(`#dmd-f${i}`), v = input.value.trim();
          const err = f.required && !v ? `اكتب ${f.label}` : (f.validate ? f.validate(v) : '') || '';
          back.querySelector(`[data-err="${i}"]`).textContent = err;
          input.classList.toggle('bad', !!err);
          if (err && ok) { ok = false; input.focus(); }
          values[f.name] = v;
        });
        if (ok) close(values);
      };
      function onKey(e) {
        if (e.key === 'Escape') { e.preventDefault(); close(null); }
        else if (e.key === 'Enter' && e.target.classList && e.target.classList.contains('dmd-input')) { e.preventDefault(); submit(); }
      }
      document.addEventListener('keydown', onKey, true);
      back.addEventListener('click', (e) => {
        if (e.target === back) return close(null);
        const act = e.target.closest('[data-act]');
        if (act) return act.dataset.act === 'ok' ? submit() : close(null);
        const fill = e.target.closest('[data-fill]');
        if (fill) { const input = back.querySelector(`#dmd-f${fill.dataset.fill}`); input.value = fill.dataset.v; input.focus(); return; }
        const choice = e.target.closest('.dmd-choice');
        if (choice) {
          const group = choice.parentElement;
          values[group.dataset.choice] = choice.dataset.value;
          group.querySelectorAll('.dmd-choice').forEach(c => c.classList.toggle('on', c === choice));
        }
      });
    });
  }

  window.DMDialog = {
    form: open,
    async confirm({ title, message = '', confirmText = 'تأكيد', cancelText = 'تراجع', tone = 'danger', icon }) {
      const r = await open({ title, subtitle: message, confirmText, cancelText, tone, icon: icon || (tone === 'danger' ? 'fa-triangle-exclamation' : 'fa-circle-question') });
      return r !== null;
    }
  };
})();
