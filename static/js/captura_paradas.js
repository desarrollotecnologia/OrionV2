/* Captura manual de paradas */
(function () {
  const Live = window.OrionLive;
  let categorias = [];

  function todayStr() {
    const d = new Date();
    return d.toISOString().slice(0, 10);
  }

  function paint(msg, kind) {
    const el = document.getElementById('formMsg');
    if (!el) return;
    const colors = {
      ok: 'bg-emerald-900/40 border border-emerald-700 text-emerald-200',
      err: 'bg-rose-900/40 border border-rose-700 text-rose-200',
      info: 'bg-slate-800 border border-slate-700 text-slate-200',
    };
    el.className = `text-sm px-3 py-2 rounded-lg ${colors[kind] || colors.info}`;
    el.textContent = msg;
    el.classList.remove('hidden');
    clearTimeout(el._t);
    el._t = setTimeout(() => el.classList.add('hidden'), 4000);
  }

  function buildGrid() {
    const grid = document.getElementById('gridCategorias');
    if (!grid) return;
    grid.innerHTML = categorias.map(c => `
      <div>
        <label class="lbl text-[13px]">${c.label}</label>
        <input type="number" name="${c.key}" data-key="${c.key}" min="0" step="1"
               placeholder="0" class="inp cat-input" />
      </div>
    `).join('');
    grid.querySelectorAll('.cat-input').forEach(inp => {
      inp.addEventListener('input', recalcTotal);
    });
  }

  function recalcTotal() {
    let total = 0;
    document.querySelectorAll('.cat-input').forEach(inp => {
      const v = parseFloat(inp.value);
      if (!Number.isNaN(v)) total += v;
    });
    document.getElementById('totalMinutos').textContent = Live.fmt.num(total, 0);
    const h = Math.floor(total / 60);
    const m = Math.round(total - h * 60);
    document.getElementById('totalHoras').textContent = `${h}h ${m}m`;
  }

  function topCategoria(row) {
    let best = { label: '--', val: 0 };
    categorias.forEach(c => {
      const v = parseFloat(row[c.key]) || 0;
      if (v > best.val) best = { label: c.label, val: v };
    });
    return best.val > 0 ? `${best.label} (${Live.fmt.num(best.val)} min)` : '--';
  }

  function renderManuales(rows) {
    const tb = document.getElementById('tablaManuales');
    const count = document.getElementById('manualCount');
    if (count) count.textContent = rows.length;
    if (!tb) return;
    if (!rows.length) {
      tb.innerHTML = '<tr><td colspan="5" class="text-center text-slate-500 py-3">Sin capturas manuales todavia</td></tr>';
      return;
    }
    tb.innerHTML = rows.map(r => `
      <tr>
        <td>${Live.fmt.date(r.fecha)}</td>
        <td class="text-right font-semibold text-amber-300">${Live.fmt.num(r.total)}</td>
        <td>${topCategoria(r)}</td>
        <td class="text-slate-400 text-xs">${r.observaciones || '--'}</td>
        <td class="text-right">
          <button data-del="${r.id}" class="px-2 py-1 text-xs rounded bg-rose-900/40 border border-rose-700 text-rose-200 hover:bg-rose-800">
            Eliminar
          </button>
        </td>
      </tr>
    `).join('');
    tb.querySelectorAll('button[data-del]').forEach(btn => {
      btn.addEventListener('click', () => eliminar(btn.dataset.del));
    });
  }

  function loadManuales() {
    Live.fetchJSON('/api/captura/paradas').then(d => renderManuales(d.manuales || []));
  }

  function eliminar(id) {
    if (!confirm('Eliminar este registro manual?')) return;
    fetch(`/api/captura/paradas/${id}`, { method: 'DELETE', credentials: 'same-origin' })
      .then(r => r.json())
      .then(d => {
        if (d.ok) {
          paint('Registro eliminado.', 'ok');
          loadManuales();
        } else {
          paint('No se pudo eliminar.', 'err');
        }
      })
      .catch(() => paint('Error al eliminar.', 'err'));
  }

  function loadOptions() {
    Live.fetchJSON('/api/captura/paradas/options').then(d => {
      categorias = d.categorias || [];
      buildGrid();
    });
  }

  function init() {
    const fechaInp = document.getElementById('f_fecha');
    if (fechaInp && !fechaInp.value) fechaInp.value = todayStr();

    loadOptions();
    loadManuales();

    document.getElementById('btnLimpiar')?.addEventListener('click', () => {
      document.querySelectorAll('.cat-input').forEach(i => (i.value = ''));
      document.getElementById('f_observaciones').value = '';
      recalcTotal();
    });

    document.getElementById('formParadas').addEventListener('submit', (e) => {
      e.preventDefault();
      const payload = { fecha: fechaInp.value };
      categorias.forEach(c => {
        const inp = document.querySelector(`.cat-input[data-key="${c.key}"]`);
        payload[c.key] = inp && inp.value !== '' ? parseFloat(inp.value) : 0;
      });
      payload.observaciones = document.getElementById('f_observaciones').value;

      fetch('/api/captura/paradas', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
        .then(r => r.json())
        .then(d => {
          if (d.ok) {
            paint('Parada guardada correctamente.', 'ok');
            document.querySelectorAll('.cat-input').forEach(i => (i.value = ''));
            document.getElementById('f_observaciones').value = '';
            recalcTotal();
            loadManuales();
          } else {
            paint(d.error || 'No se pudo guardar.', 'err');
          }
        })
        .catch(() => paint('Error de red al guardar.', 'err'));
    });

    Live && Live.on && Live.on((ev) => {
      if (ev === 'sync') loadManuales();
    });
  }

  document.addEventListener('DOMContentLoaded', init);
})();
