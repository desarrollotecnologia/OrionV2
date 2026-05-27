/* ORION - cliente en vivo via Socket.IO */
(function () {
  if (typeof io === 'undefined') return;

  window.OrionLive = window.OrionLive || {
    listeners: [],
    on: function (cb) { this.listeners.push(cb); },
    notify: function (event, data) {
      this.listeners.forEach(fn => { try { fn(event, data); } catch (e) { console.warn(e); } });
    }
  };

  const Live = window.OrionLive;
  const socket = io('/live', { transports: ['websocket', 'polling'] });

  function setStamp() {
    const el = document.getElementById('liveTimestamp');
    if (el) {
      const d = new Date();
      el.textContent = d.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    }
  }
  function setDot(active) {
    const dot = document.getElementById('liveDot');
    if (!dot) return;
    dot.classList.remove('bg-emerald-500', 'bg-red-500', 'bg-amber-400');
    dot.classList.add(active ? 'bg-emerald-500' : 'bg-red-500');
  }

  function showToast(msg, kind = 'info') {
    const t = document.getElementById('toast');
    if (!t) return;
    const colors = {
      info:    'border-orion-500 text-orion-200',
      ok:      'border-emerald-500 text-emerald-200',
      warn:    'border-amber-400 text-amber-200',
      error:   'border-red-500 text-red-200'
    };
    t.className = `fixed top-6 right-6 z-50 bg-slate-900 border ${colors[kind] || colors.info} px-4 py-3 rounded-xl shadow-xl text-sm show`;
    t.textContent = msg;
    clearTimeout(t._timer);
    t._timer = setTimeout(() => { t.classList.add('hidden'); t.classList.remove('show'); }, 3500);
  }
  Live.toast = showToast;

  socket.on('connect',    () => { setDot(true);  setStamp(); });
  socket.on('disconnect', () => { setDot(false); });
  socket.on('orion:sync', (data) => {
    setStamp();
    showToast('Datos actualizados desde el Excel.', 'ok');
    Live.notify('sync', data);
  });
  socket.on('orion:tick', (data) => {
    setStamp();
    Live.notify('tick', data);
  });

  // Boton de sincronizacion manual
  document.addEventListener('click', (e) => {
    if (e.target && e.target.id === 'syncBtn') {
      e.target.disabled = true;
      e.target.textContent = 'Sincronizando...';
      fetch('/api/sync', { method: 'POST' })
        .then(r => r.json())
        .then(data => {
          showToast(data.ok ? 'Sincronizacion manual OK' : 'Sincronizacion con avisos', data.ok ? 'ok' : 'warn');
          Live.notify('sync', { summary: data });
        })
        .catch(() => showToast('Fallo la sincronizacion', 'error'))
        .finally(() => {
          e.target.disabled = false;
          e.target.textContent = 'Sincronizar Excel';
        });
    }
  });

  // ---------- Helpers de formato ----------
  Live.fmt = {
    num: (v, dec = 0) => {
      if (v === null || v === undefined || Number.isNaN(+v)) return '--';
      return Number(v).toLocaleString('es-CO', { minimumFractionDigits: dec, maximumFractionDigits: dec });
    },
    pct: (v, dec = 1) => {
      if (v === null || v === undefined || Number.isNaN(+v)) return '--';
      return (Number(v) * 100).toFixed(dec) + '%';
    },
    date: (v) => {
      if (!v) return '--';
      try {
        const d = new Date(v);
        if (Number.isNaN(d.getTime())) return v;
        return d.toLocaleDateString('es-CO');
      } catch (_) { return v; }
    }
  };

  Live.MES_NOMBRE = ['', 'Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

  Live.flash = (selector) => {
    document.querySelectorAll(selector).forEach(el => {
      el.classList.remove('live-flash');
      void el.offsetWidth;
      el.classList.add('live-flash');
    });
  };

  Live.fetchJSON = (url) => fetch(url, { credentials: 'same-origin' }).then(r => r.json());

  // ---------- Autocomplete reutilizable ----------
  Live.autocomplete = function (inputEl, listEl, opts) {
    if (!inputEl || !listEl) return { setItems: () => {}, hide: () => {}, refresh: () => {} };

    opts = opts || {};
    const minChars = opts.minChars != null ? opts.minChars : 1;
    const maxItems = opts.maxItems != null ? opts.maxItems : 12;
    let items = [];
    let filtered = [];
    let acIndex = -1;

    function escapeHtml(s) {
      return String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
    }

    function highlightMatch(text, query) {
      const safeText = escapeHtml(text);
      if (!query) return safeText;
      const i = text.toLowerCase().indexOf(query.toLowerCase());
      if (i < 0) return safeText;
      const q = escapeHtml(text.slice(i, i + query.length));
      return `${escapeHtml(text.slice(0, i))}<mark>${q}</mark>${escapeHtml(text.slice(i + query.length))}`;
    }

    function hide() {
      listEl.classList.add('hidden');
      listEl.innerHTML = '';
      acIndex = -1;
      filtered = [];
    }

    function select(val) {
      inputEl.value = val;
      hide();
      if (opts.onSelect) opts.onSelect(val);
    }

    function render(query) {
      const q = (query || '').trim();
      acIndex = -1;
      if (q.length < minChars) {
        hide();
        return;
      }
      const needle = q.toLowerCase();
      filtered = items.filter(c => c.toLowerCase().includes(needle)).slice(0, maxItems);

      if (!filtered.length) {
        listEl.innerHTML = '';
        const empty = document.createElement('div');
        empty.className = 'ac-empty';
        empty.textContent = opts.emptyMsg
          ? opts.emptyMsg(q)
          : `Sin coincidencias. Puedes usar "${q.toUpperCase()}" como valor nuevo.`;
        listEl.appendChild(empty);
        listEl.classList.remove('hidden');
        return;
      }

      listEl.innerHTML = filtered.map((c, i) =>
        `<button type="button" class="ac-item" data-idx="${i}">${highlightMatch(c, q)}</button>`
      ).join('');
      listEl.classList.remove('hidden');
      listEl.querySelectorAll('.ac-item').forEach(btn => {
        btn.addEventListener('mousedown', (e) => {
          e.preventDefault();
          const idx = parseInt(btn.getAttribute('data-idx'), 10);
          if (!Number.isNaN(idx) && filtered[idx] != null) select(filtered[idx]);
        });
      });
    }

    inputEl.addEventListener('input', () => render(inputEl.value));
    inputEl.addEventListener('focus', () => {
      if (inputEl.value.trim().length >= minChars) render(inputEl.value);
    });
    inputEl.addEventListener('blur', () => setTimeout(hide, 150));
    inputEl.addEventListener('keydown', (e) => {
      const btns = listEl.querySelectorAll('.ac-item');
      if (!btns.length || listEl.classList.contains('hidden')) return;
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        acIndex = Math.min(acIndex + 1, btns.length - 1);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        acIndex = Math.max(acIndex - 1, 0);
      } else if (e.key === 'Enter' && acIndex >= 0) {
        e.preventDefault();
        select(filtered[acIndex]);
        return;
      } else if (e.key === 'Escape') {
        hide();
        return;
      } else return;
      btns.forEach((el, i) => el.classList.toggle('active', i === acIndex));
      if (acIndex >= 0) btns[acIndex].scrollIntoView({ block: 'nearest' });
    });

    const wrap = inputEl.closest('.ac-wrap');
    if (wrap) {
      document.addEventListener('click', (e) => {
        if (!wrap.contains(e.target)) hide();
      });
    }

    return {
      setItems(newItems) {
        items = newItems || [];
      },
      hide,
      refresh() {
        render(inputEl.value);
      }
    };
  };
})();
