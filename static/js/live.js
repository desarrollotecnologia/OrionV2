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
})();
