/* Dashboard de paradas */
(function () {
  const Live = window.OrionLive;
  const charts = {};
  const palette = [
    '#06b6d4','#f59e0b','#a78bfa','#10b981','#f43f5e',
    '#fb7185','#38bdf8','#facc15','#84cc16','#f472b6'
  ];

  const baseAxis = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { labels: { color: '#cbd5e1' } },
      tooltip: { backgroundColor: '#0f172a', borderColor: '#334155', borderWidth: 1 }
    },
    scales: {
      x: { ticks: { color: '#94a3b8' }, grid: { color: 'rgba(51,65,85,0.3)' } },
      y: { ticks: { color: '#94a3b8' }, grid: { color: 'rgba(51,65,85,0.3)' } }
    }
  };

  function fmtHoras(min) {
    const m = Math.round(min || 0);
    const h = Math.floor(m / 60);
    return `${Live.fmt.num(h)}h ${m - h * 60}m`;
  }

  // ---------- Render KPIs ----------
  function renderKPI(data) {
    const r = data.resumen || {};
    const anio = data.anio || r.anio || new Date().getFullYear();
    const dashAnio = document.getElementById('dashAnio');
    if (dashAnio) dashAnio.textContent = anio;

    document.getElementById('kpiTotal').textContent = Live.fmt.num(r.total_general);
    document.getElementById('kpiTotalHoras').textContent = fmtHoras(r.total_general);
    document.getElementById('kpiProm').textContent = Live.fmt.num(r.promedio_diario, 1);
    document.getElementById('kpiDias').textContent = Live.fmt.num(r.dias_con_paradas);
    document.getElementById('kpiUltima').textContent = r.ultima_fecha
      ? `Ultimo registro: ${Live.fmt.date(r.ultima_fecha)}`
      : `Sin datos en ${anio}`;
    if (r.categoria_top) {
      document.getElementById('kpiTopCat').textContent = r.categoria_top.categoria;
      document.getElementById('kpiTopCatMin').textContent = Live.fmt.num(r.categoria_top.total);
    } else {
      document.getElementById('kpiTopCat').textContent = '--';
      document.getElementById('kpiTopCatMin').textContent = '--';
    }
    const rb = document.getElementById('rangoBadge');
    if (rb) {
      rb.textContent = r.ultima_fecha
        ? `Año ${anio} · hasta ${Live.fmt.date(r.ultima_fecha)}`
        : `Año ${anio} · sin datos`;
    }
  }

  // ---------- Donut categoria + ranking ----------
  function renderCategoria(rows) {
    const filt = rows.filter(r => r.total > 0).sort((a, b) => b.total - a.total);
    const labels = filt.map(r => r.categoria);
    const values = filt.map(r => r.total);
    const cfg = {
      labels,
      datasets: [{
        data: values,
        backgroundColor: palette.slice(0, labels.length),
        borderColor: '#0f172a', borderWidth: 2
      }]
    };
    const opts = {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { position: 'right', labels: { color: '#cbd5e1', boxWidth: 10, font: { size: 11 } } },
        tooltip: { backgroundColor: '#0f172a' }
      }
    };
    if (charts.cat) { charts.cat.data = cfg; charts.cat.update(); }
    else charts.cat = new Chart(document.getElementById('chartCategoria'),
        { type: 'doughnut', data: cfg, options: opts });

    // Ranking
    const total = values.reduce((a, b) => a + b, 0);
    const tb = document.getElementById('tablaRanking');
    if (!filt.length) {
      tb.innerHTML = '<tr><td colspan="5" class="text-center text-slate-500 py-3">Sin paradas registradas</td></tr>';
      return;
    }
    tb.innerHTML = filt.map((r, i) => {
      const pct = total ? (r.total / total) * 100 : 0;
      return `
        <tr>
          <td class="font-bold text-slate-400">${i + 1}</td>
          <td>${r.categoria}</td>
          <td class="text-right font-semibold text-amber-300">${Live.fmt.num(r.total)}</td>
          <td class="text-right text-slate-300">${fmtHoras(r.total)}</td>
          <td class="text-right">
            <div class="flex items-center justify-end gap-2">
              <div class="w-24 h-1.5 bg-slate-800 rounded">
                <div class="h-1.5 bg-orion-500 rounded-full" style="width:${Math.min(100, pct)}%"></div>
              </div>
              <span class="text-slate-300 text-xs w-12 text-right">${pct.toFixed(1)}%</span>
            </div>
          </td>
        </tr>
      `;
    }).join('');
  }

  // ---------- Tendencia diaria ----------
  function renderTendencia(rows) {
    const cfg = {
      labels: rows.map(r => r.fecha),
      datasets: [{
        label: 'Total minutos',
        data: rows.map(r => r.total || 0),
        backgroundColor: 'rgba(34,211,238,0.18)',
        borderColor: '#22d3ee',
        borderWidth: 2,
        tension: 0.3,
        fill: true,
        pointRadius: 2,
      }]
    };
    if (charts.tend) { charts.tend.data = cfg; charts.tend.update(); }
    else charts.tend = new Chart(document.getElementById('chartTendencia'),
        { type: 'line', data: cfg, options: baseAxis });
  }

  // ---------- Evolucion mensual ----------
  function renderMensual(rows) {
    const cfg = {
      labels: rows.map(r => r.periodo),
      datasets: [{
        label: 'Minutos / mes',
        data: rows.map(r => r.total || 0),
        backgroundColor: '#f59e0b',
        borderRadius: 6,
      }]
    };
    if (charts.mes) { charts.mes.data = cfg; charts.mes.update(); }
    else charts.mes = new Chart(document.getElementById('chartMensual'),
        { type: 'bar', data: cfg, options: baseAxis });
  }

  // ---------- Tabla recientes ----------
  function renderRecientes(rows) {
    const tb = document.getElementById('tablaRecientes');
    if (!rows.length) {
      tb.innerHTML = '<tr><td colspan="13" class="text-center text-slate-500 py-3">Sin registros</td></tr>';
      return;
    }
    tb.innerHTML = rows.map(r => `
      <tr>
        <td>${Live.fmt.date(r.fecha)}</td>
        <td>
          <span class="text-[10px] uppercase tracking-wide px-2 py-0.5 rounded ${
            r.origen === 'manual'
              ? 'bg-emerald-900/40 border border-emerald-700 text-emerald-200'
              : 'bg-slate-800 border border-slate-700 text-slate-300'
          }">${r.origen === 'manual' ? 'manual' : 'base'}</span>
        </td>
        <td class="text-right">${Live.fmt.num(r.tardanza_inicio)}</td>
        <td class="text-right">${Live.fmt.num(r.lavado_desinfeccion)}</td>
        <td class="text-right">${Live.fmt.num(r.dano_sistema_1)}</td>
        <td class="text-right">${Live.fmt.num(r.dano_sistema_2)}</td>
        <td class="text-right">${Live.fmt.num(r.fallas_electricas)}</td>
        <td class="text-right">${Live.fmt.num(r.fallas_sistema)}</td>
        <td class="text-right">${Live.fmt.num(r.falta_canastillas)}</td>
        <td class="text-right">${Live.fmt.num(r.parada_alimentacion)}</td>
        <td class="text-right">${Live.fmt.num(r.recepcion_entrega)}</td>
        <td class="text-right">${Live.fmt.num(r.reunion_magica)}</td>
        <td class="text-right font-bold text-amber-300">${Live.fmt.num(r.total)}</td>
      </tr>
    `).join('');
  }

  // ---------- Tabla manuales ----------
  const CATEGORIAS_UI = [
    ['tardanza_inicio',     'Tardanza de inicio'],
    ['lavado_desinfeccion', 'Lavado y desinfeccion'],
    ['dano_sistema_1',      'Etiquetado'],
    ['dano_sistema_2',      'Pesaje'],
    ['fallas_electricas',   'Electrico'],
    ['fallas_sistema',      'Cryovac'],
    ['falta_canastillas',   'Canastillas'],
    ['parada_alimentacion', 'Alimentacion'],
    ['recepcion_entrega',   'Recepcion'],
    ['reunion_magica',      'Reunion magica'],
  ];

  function topCat(row) {
    let best = { label: '--', val: 0 };
    CATEGORIAS_UI.forEach(([k, lbl]) => {
      const v = parseFloat(row[k]) || 0;
      if (v > best.val) best = { label: lbl, val: v };
    });
    return best.val > 0 ? `${best.label} (${Live.fmt.num(best.val)} min)` : '--';
  }

  function renderManuales(rows) {
    const tb = document.getElementById('tablaManuales');
    if (!rows.length) {
      tb.innerHTML = '<tr><td colspan="5" class="text-center text-slate-500 py-3">Sin capturas manuales todavia</td></tr>';
      return;
    }
    tb.innerHTML = rows.map(r => `
      <tr>
        <td>${Live.fmt.date(r.fecha)}</td>
        <td class="text-right font-semibold text-amber-300">${Live.fmt.num(r.total)}</td>
        <td>${topCat(r)}</td>
        <td class="text-slate-400 text-xs">${r.observaciones || '--'}</td>
        <td class="text-slate-500 text-xs">${r.creado_en || '--'}</td>
      </tr>
    `).join('');
  }

  // ---------- Last sync ----------
  function renderLastSync(data) {
    const u = data.ultima_sync;
    const el = document.getElementById('lastSync');
    if (!el) return;
    if (!u) { el.textContent = '--'; return; }
    el.textContent = `${u.estado || 'ok'} · ${u.fecha || ''}`.trim();
  }

  function load() {
    Live.fetchJSON('/api/paradas-dashboard').then(data => {
      renderKPI(data);
      renderCategoria(data.por_categoria || []);
      renderTendencia(data.tendencia || []);
      renderMensual(data.evolucion_mensual || []);
      renderRecientes(data.recientes || []);
      renderManuales(data.manuales || []);
      renderLastSync(data);
      Live.flash('.kpi-card');
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    load();
    Live && Live.on && Live.on(() => load());
  });
})();
