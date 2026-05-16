/* Mensual ORION - render en vivo */
(function () {
  const Live = window.OrionLive;
  const charts = {};

  const baseOpts = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { labels: { color: '#cbd5e1' } },
      tooltip: { backgroundColor: '#0f172a' }
    },
    scales: {
      x: { ticks: { color: '#94a3b8' }, grid: { color: 'rgba(51,65,85,0.3)' } },
      y: { ticks: { color: '#94a3b8' }, grid: { color: 'rgba(51,65,85,0.3)' } }
    }
  };

  function renderHeader(h) {
    document.getElementById('hMes').textContent = h.mes ? Live.MES_NOMBRE[h.mes] : '--';
    document.getElementById('hAnio').textContent = h.anio || '--';
    document.getElementById('hFecha').textContent = h.fecha ? `· ${Live.fmt.date(h.fecha)}` : '';
  }

  function renderIndicadores(rows) {
    const tb = document.getElementById('tablaIndicadores');
    if (!rows.length) {
      tb.innerHTML = '<tr><td colspan="5" class="text-center text-slate-500 py-3">Sin datos</td></tr>';
      return;
    }
    tb.innerHTML = rows.map(r => `
      <tr>
        <td><span class="px-2 py-0.5 rounded-md bg-slate-800 text-xs font-semibold ${r.seccion === 'BOVINOS' ? 'text-cyan-300' : 'text-pink-300'}">${r.seccion}</span></td>
        <td class="text-slate-400">${r.item ?? ''}</td>
        <td class="font-medium">${r.criterio || '--'}</td>
        <td class="text-right">${Live.fmt.num(r.hoy, 2)}</td>
        <td class="text-right text-slate-300">${Live.fmt.num(r.acumulado, 2)}</td>
      </tr>
    `).join('');
  }

  function renderCumplimiento(rows) {
    const tb = document.getElementById('tablaCumplimiento');
    if (!rows.length) {
      tb.innerHTML = '<tr><td colspan="6" class="text-center text-slate-500 py-3">Sin datos</td></tr>';
      return;
    }
    tb.innerHTML = rows.map(r => {
      const cump = r.cumplimiento;
      const color = cump == null ? 'text-slate-300'
                    : cump >= 1 ? 'text-emerald-300'
                    : cump >= 0.7 ? 'text-amber-300' : 'text-red-300';
      return `
        <tr>
          <td class="text-slate-400">${r.item ?? ''}</td>
          <td class="font-medium">${r.criterio || '--'}</td>
          <td><span class="text-xs px-2 py-0.5 rounded-md bg-slate-800 ${r.tipo === 'HOY' ? 'text-cyan-300' : 'text-violet-300'}">${r.tipo}</span></td>
          <td class="text-right">${Live.fmt.num(r.meta, 2)}</td>
          <td class="text-right">${Live.fmt.num(r.ejecutado, 2)}</td>
          <td class="text-right font-bold ${color}">${Live.fmt.pct(cump)}</td>
        </tr>
      `;
    }).join('');
  }

  function renderOperatividad(rows) {
    const cont = document.getElementById('operatividadList');
    if (!rows.length) { cont.innerHTML = '<p class="text-slate-500 text-xs">Sin datos.</p>'; return; }
    cont.innerHTML = rows.map(r => `
      <div class="flex items-center justify-between border border-slate-800 rounded-lg px-3 py-2">
        <span>${r.criterio || '--'}</span>
        <span class="text-right">
          <span class="text-white font-semibold">${Live.fmt.num(r.cant_personas)}</span>
          <span class="text-slate-400 text-xs ml-2">${Live.fmt.pct(r.porcentaje)}</span>
        </span>
      </div>
    `).join('');
  }

  function renderOperatividadPlanta(rows) {
    const tb = document.getElementById('tablaOperatividadPlanta');
    if (!rows.length) {
      tb.innerHTML = '<tr><td colspan="4" class="text-center text-slate-500 py-3">Sin datos</td></tr>';
      return;
    }
    tb.innerHTML = rows.map(r => `
      <tr>
        <td class="text-slate-400">${r.item || ''}</td>
        <td>${r.criterio || '--'}</td>
        <td class="text-right">${Live.fmt.num(r.cant_personas)}</td>
        <td class="text-right">${Live.fmt.pct(r.porcentaje)}</td>
      </tr>
    `).join('');
  }

  function renderCifras(rows) {
    const cont = document.getElementById('cifrasMes');
    if (!cont) return;
    if (!rows.length) { cont.innerHTML = '<p class="text-slate-500 text-xs">Sin cifras del Excel todavia.</p>'; return; }
    const grouped = {};
    rows.forEach(r => {
      const key = r.seccion || 'GENERAL';
      if (!grouped[key]) grouped[key] = {};
      grouped[key][r.criterio] = r.acumulado != null ? r.acumulado : r.hoy;
    });
    cont.innerHTML = Object.entries(grouped).map(([sec, vals]) => {
      const rend = vals['% REND'];
      const merma = vals['% MERMA'];
      const rendStr = rend != null ? Live.fmt.pct(rend) : '<span class="text-slate-600">Sin datos</span>';
      const mermaStr = merma != null ? Live.fmt.pct(merma) : '<span class="text-slate-600">Sin datos</span>';
      return `
        <div class="flex items-center justify-between border border-slate-800 rounded-xl px-3 py-2">
          <p class="text-xs uppercase tracking-wide text-slate-400">${sec}</p>
          <div class="text-right text-sm">
            <p class="text-cyan-300 font-bold">% Rend ${rendStr}</p>
            <p class="text-amber-300 text-xs">% Merma ${mermaStr}</p>
          </div>
        </div>
      `;
    }).join('');
  }

  function renderExtras(rows) {
    const labels = rows.map(r => r.mes_texto);
    const data = {
      labels,
      datasets: [
        { type: 'bar', label: 'Extras (h)', data: rows.map(r => r.extras || 0), backgroundColor: '#22d3ee', borderRadius: 8 },
        { type: 'line', label: 'Promedio HE/dia', data: rows.map(r => r.promedio_he_dia || 0), borderColor: '#f59e0b', backgroundColor: '#f59e0b', tension: 0.35, yAxisID: 'y2' }
      ]
    };
    const opts = JSON.parse(JSON.stringify(baseOpts));
    opts.scales.y2 = { position: 'right', ticks: { color: '#f59e0b' }, grid: { display: false } };
    if (charts.extras) { charts.extras.data = data; charts.extras.update(); }
    else charts.extras = new Chart(document.getElementById('chartExtras'), { type: 'bar', data, options: opts });
  }

  function renderKilogramos(rows) {
    const conceptos = [...new Set(rows.map(r => r.concepto))];
    const meses = [...new Set(rows.map(r => r.mes_num))].sort((a, b) => a - b);
    const colors = ['#22d3ee','#f472b6','#a78bfa','#34d399','#fbbf24','#f87171','#60a5fa','#facc15'];
    const datasets = conceptos.map((c, i) => ({
      label: c,
      data: meses.map(m => {
        const f = rows.find(r => r.concepto === c && r.mes_num === m);
        return f ? f.kilogramos : 0;
      }),
      backgroundColor: colors[i % colors.length],
      borderRadius: 6
    }));
    const labels = meses.map(m => Live.MES_NOMBRE[m] || ('M' + m));
    const data = { labels, datasets };
    if (charts.kilos) { charts.kilos.data = data; charts.kilos.update(); }
    else charts.kilos = new Chart(document.getElementById('chartKilogramos'), { type: 'bar', data, options: baseOpts });
  }

  function renderMerma(rows) {
    const labels = rows.map(r => `${r.mes_texto?.slice(0, 3) || ''} ${r.anio || ''}`);
    const data = {
      labels,
      datasets: [{
        label: 'Merma promedio %',
        data: rows.map(r => (r.merma_prom_mensual || 0) * 100),
        borderColor: '#f43f5e',
        backgroundColor: 'rgba(244,63,94,0.18)',
        fill: true, tension: 0.35, pointRadius: 3
      }]
    };
    const opts = JSON.parse(JSON.stringify(baseOpts));
    opts.scales.y.ticks = { color: '#f87171', callback: v => v.toFixed(1) + '%' };
    if (charts.merma) { charts.merma.data = data; charts.merma.update(); }
    else charts.merma = new Chart(document.getElementById('chartMerma'), { type: 'line', data, options: opts });
  }

  function renderParadas(rows) {
    const filtered = rows.filter(r => r.total > 0);
    const data = {
      labels: filtered.map(r => r.categoria),
      datasets: [{
        data: filtered.map(r => r.total),
        backgroundColor: ['#06b6d4','#f59e0b','#a78bfa','#10b981','#f43f5e','#fb7185','#38bdf8','#facc15','#84cc16','#f472b6'],
        borderColor: '#0f172a', borderWidth: 2
      }]
    };
    const opts = {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { position: 'right', labels: { color: '#cbd5e1', font: { size: 11 } } } }
    };
    if (charts.par) { charts.par.data = data; charts.par.update(); }
    else charts.par = new Chart(document.getElementById('chartParadas'), { type: 'doughnut', data, options: opts });
  }

  function renderVelocidades(rows) {
    const tb = document.getElementById('tablaVelocidades');
    if (!rows.length) {
      tb.innerHTML = '<tr><td colspan="6" class="text-center text-slate-500 py-3">Sin datos</td></tr>';
      return;
    }
    tb.innerHTML = rows.slice(0, 60).map(r => `
      <tr>
        <td>${Live.fmt.date(r.fecha)}</td>
        <td class="truncate max-w-[180px]" title="${r.cliente || ''}">${r.cliente || '--'}</td>
        <td>${r.especie || '--'}</td>
        <td>${r.proceso || '--'}</td>
        <td class="text-right">${Live.fmt.num(r.velocidad_canal_h, 2)}</td>
        <td class="text-right">${Live.fmt.num(r.velocidad_kilos_h, 1)}</td>
      </tr>
    `).join('');
  }

  function renderParadasRecientes(rows) {
    const tb = document.getElementById('tablaParadas');
    if (!rows.length) {
      tb.innerHTML = '<tr><td colspan="6" class="text-center text-slate-500 py-3">Sin datos</td></tr>';
      return;
    }
    tb.innerHTML = rows.map(r => `
      <tr>
        <td>${Live.fmt.date(r.fecha)}</td>
        <td class="text-right">${Live.fmt.num(r.tardanza_inicio)}</td>
        <td class="text-right">${Live.fmt.num(r.lavado_desinfeccion)}</td>
        <td class="text-right">${Live.fmt.num(r.fallas_electricas)}</td>
        <td class="text-right">${Live.fmt.num(r.parada_alimentacion)}</td>
        <td class="text-right font-semibold">${Live.fmt.num(r.total)}</td>
      </tr>
    `).join('');
  }

  function renderAll(data) {
    renderHeader(data.header || {});
    renderIndicadores(data.indicadores || []);
    renderCumplimiento(data.cumplimiento || []);
    renderOperatividad(data.operatividad || []);
    renderOperatividadPlanta(data.operatividad_planta || []);
    renderCifras(data.cifras || []);
    renderExtras(data.extras || []);
    renderKilogramos(data.kilogramos || []);
    renderMerma(data.merma_resumen || []);
    renderParadas(data.paradas_categoria || []);
    renderVelocidades(data.velocidades || []);
    renderParadasRecientes(data.paradas_recientes || []);
    const ls = data.ultima_sync;
    const el = document.getElementById('lastSync');
    if (el) el.textContent = ls && ls.sincronizado_en ? new Date(ls.sincronizado_en).toLocaleString('es-CO') : 'pendiente';
  }

  function load() {
    Live.fetchJSON('/api/mensual').then(renderAll).catch(err => {
      console.error(err);
      Live.toast('No se pudieron cargar los datos', 'error');
    });
  }

  document.addEventListener('DOMContentLoaded', load);
  Live.on(() => load());
})();
