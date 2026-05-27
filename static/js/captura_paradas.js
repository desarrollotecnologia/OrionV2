/* Captura manual de paradas - filas dinamicas por categoria */
(function () {
  const Live = window.OrionLive;
  let categorias = [];
  let lineaId = 0;

  function todayStr() {
    return new Date().toISOString().slice(0, 10);
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

  function optionsHtml(selected) {
    const opts = categorias.map(c =>
      `<option value="${c.key}" ${c.key === selected ? 'selected' : ''}>${c.label}</option>`
    ).join('');
    return `<option value="">-- Elegir categoria --</option>${opts}`;
  }

  function refreshAllSelects() {
    document.querySelectorAll('.linea-cat').forEach(sel => {
      const prev = sel.value;
      sel.innerHTML = optionsHtml(prev);
    });
  }

  function toggleEmptyHint() {
    const empty = document.getElementById('lineasEmpty');
    const cont = document.getElementById('lineasParadas');
    if (!empty || !cont) return;
    empty.classList.toggle('hidden', cont.children.length > 0);
  }

  function addLinea(presetKey, presetMin) {
    const id = ++lineaId;
    const cont = document.getElementById('lineasParadas');
    const row = document.createElement('div');
    row.className = 'linea-row grid grid-cols-1 md:grid-cols-[1fr_140px_40px] gap-2 items-end';
    row.dataset.id = String(id);
    row.innerHTML = `
      <div>
        <label class="lbl text-[12px]">Categoria</label>
        <select class="inp linea-cat" data-id="${id}">${optionsHtml(presetKey || '')}</select>
      </div>
      <div>
        <label class="lbl text-[12px]">Minutos</label>
        <input type="number" min="0" step="1" placeholder="0"
               class="inp linea-min" data-id="${id}" value="${presetMin != null ? presetMin : ''}" />
      </div>
      <button type="button" class="linea-del h-10 w-10 rounded-lg bg-rose-900/30 border border-rose-800 text-rose-200 hover:bg-rose-900/50" title="Quitar">×</button>
    `;
    cont.appendChild(row);
    row.querySelector('.linea-min').addEventListener('input', recalcTotal);
    row.querySelector('.linea-del').addEventListener('click', () => {
      row.remove();
      toggleEmptyHint();
      recalcTotal();
    });
    toggleEmptyHint();
    recalcTotal();
  }

  function recalcTotal() {
    let total = 0;
    document.querySelectorAll('.linea-row').forEach(row => {
      const v = parseFloat(row.querySelector('.linea-min')?.value);
      if (!Number.isNaN(v) && v > 0) total += v;
    });
    document.getElementById('totalMinutos').textContent = Live.fmt.num(total, 0);
    const h = Math.floor(total / 60);
    const m = Math.round(total - h * 60);
    document.getElementById('totalHoras').textContent = `${h}h ${m}m`;
  }

  function detalleTexto(row) {
    const items = row.detalle || [];
    if (!items.length) return '--';
    return items.slice(0, 3).map(i => `${i.categoria} (${Live.fmt.num(i.minutos)} min)`).join(' · ');
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
        <td class="text-xs text-slate-300">${detalleTexto(r)}</td>
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
    return Live.fetchJSON('/api/captura/paradas/options').then(d => {
      categorias = d.categorias || [];
      refreshAllSelects();
    });
  }

  function openModalCat() {
    document.getElementById('modalCategoria').classList.remove('hidden');
    document.getElementById('nuevaCatNombre').value = '';
    document.getElementById('nuevaCatNombre').focus();
  }

  function closeModalCat() {
    document.getElementById('modalCategoria').classList.add('hidden');
  }

  function guardarCategoria() {
    const nombre = document.getElementById('nuevaCatNombre').value.trim();
    if (nombre.length < 2) {
      paint('La categoria debe tener al menos 2 caracteres.', 'err');
      return;
    }
    fetch('/api/captura/paradas/categorias', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ etiqueta: nombre }),
    })
      .then(r => r.json())
      .then(d => {
        if (!d.ok) {
          paint(d.error || 'No se pudo crear la categoria.', 'err');
          return;
        }
        closeModalCat();
        paint(`Categoria "${d.categoria.label}" agregada.`, 'ok');
        loadOptions().then(() => {
          const last = document.querySelector('.linea-row:last-child .linea-cat');
          if (last && !last.value) last.value = d.categoria.key;
        });
      })
      .catch(() => paint('Error al crear categoria.', 'err'));
  }

  function resetForm() {
    document.getElementById('lineasParadas').innerHTML = '';
    document.getElementById('f_observaciones').value = '';
    toggleEmptyHint();
    recalcTotal();
    addLinea();
  }

  function collectLineas() {
    const lineas = [];
    document.querySelectorAll('.linea-row').forEach(row => {
      const key = row.querySelector('.linea-cat')?.value;
      const mins = parseFloat(row.querySelector('.linea-min')?.value);
      if (!key || Number.isNaN(mins) || mins <= 0) return;
      lineas.push({ categoria_key: key, minutos: mins });
    });
    return lineas;
  }

  function init() {
    const fechaInp = document.getElementById('f_fecha');
    if (fechaInp && !fechaInp.value) fechaInp.value = todayStr();

    loadOptions().then(() => addLinea());
    loadManuales();

    document.getElementById('btnAgregarLinea')?.addEventListener('click', () => addLinea());
    document.getElementById('btnNuevaCategoria')?.addEventListener('click', openModalCat);
    document.getElementById('btnCancelarCat')?.addEventListener('click', closeModalCat);
    document.getElementById('btnGuardarCat')?.addEventListener('click', guardarCategoria);
    document.getElementById('modalCategoria')?.addEventListener('click', (e) => {
      if (e.target.id === 'modalCategoria') closeModalCat();
    });

    document.getElementById('btnLimpiar')?.addEventListener('click', resetForm);

    document.getElementById('formParadas').addEventListener('submit', (e) => {
      e.preventDefault();
      const lineas = collectLineas();
      if (!lineas.length) {
        paint('Agrega al menos una parada con categoria y minutos.', 'err');
        return;
      }
      const payload = {
        fecha: fechaInp.value,
        observaciones: document.getElementById('f_observaciones').value,
        lineas,
      };

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
            resetForm();
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
