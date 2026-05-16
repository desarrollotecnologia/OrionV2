/* Dashboard ORION - render en vivo */
(function () {
  const Live = window.OrionLive;
  const charts = {};
  const palette = {
    meta:   '#22d3ee',
    ejec:   '#06b6d4',
    cump:   '#f59e0b',
    canalH: '#22d3ee',
    kilosH: '#a78bfa',
    canalHH:'#34d399',
    paradas:[
      '#06b6d4','#f59e0b','#a78bfa','#10b981','#f43f5e',
      '#fb7185','#38bdf8','#facc15','#84cc16','#f472b6'
    ]
  };

  const baseLine = {
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

  function buildPpto(rows) {
    const labels = rows.map(r => r.mes_texto);
    const meta = rows.map(r => r.meta || 0);
    const ejec = rows.map(r => r.ejecucion || 0);
    const cump = rows.map(r => (r.cumplimiento || 0) * 100);

    const data = {
      labels,
      datasets: [
        { type: 'bar',  label: 'Meta',         data: meta, backgroundColor: palette.meta + '99', borderRadius: 8 },
        { type: 'bar',  label: 'Ejecucion',    data: ejec, backgroundColor: palette.ejec, borderRadius: 8 },
        { type: 'line', label: '% Cumplimiento', data: cump, borderColor: palette.cump, backgroundColor: palette.cump,
          tension: 0.35, yAxisID: 'y2', pointRadius: 4, pointHoverRadius: 6, borderWidth: 2 }
      ]
    };
    const opts = JSON.parse(JSON.stringify(baseLine));
    opts.scales.y.title = { display: true, text: 'Canales', color: '#94a3b8' };
    opts.scales.y2 = {
      position: 'right', ticks: { color: '#f59e0b', callback: v => v + '%' },
      grid: { display: false }, title: { display: true, text: '% Cump', color: '#f59e0b' }
    };
    if (charts.ppto) { charts.ppto.data = data; charts.ppto.update(); }
    else charts.ppto = new Chart(document.getElementById('chartPpto'), { type: 'bar', data, options: opts });
  }

  function buildVelocidad(rows) {
    const labels = rows.map(r => r.proceso || '?');
    const data = {
      labels,
      datasets: [
        { label: 'Canal/h', data: rows.map(r => r.canal_h || 0), backgroundColor: palette.canalH, borderRadius: 8 },
        { label: 'Kilos/h', data: rows.map(r => r.kilos_h || 0), backgroundColor: palette.kilosH, borderRadius: 8, yAxisID: 'y2' }
      ]
    };
    const opts = JSON.parse(JSON.stringify(baseLine));
    opts.scales.y.title = { display: true, text: 'Canal/h', color: '#94a3b8' };
    opts.scales.y2 = {
      position: 'right', ticks: { color: '#a78bfa' }, grid: { display: false },
      title: { display: true, text: 'Kg/h', color: '#a78bfa' }
    };
    if (charts.vel) { charts.vel.data = data; charts.vel.update(); }
    else charts.vel = new Chart(document.getElementById('chartVelocidad'), { type: 'bar', data, options: opts });
  }

  function buildParadas(rows) {
    const filtered = rows.filter(r => r.total > 0);
    const labels = filtered.map(r => r.categoria);
    const values = filtered.map(r => r.total);
    const data = {
      labels,
      datasets: [{
        data: values,
        backgroundColor: palette.paradas.slice(0, labels.length),
        borderColor: '#0f172a', borderWidth: 2
      }]
    };
    const opts = {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: 'right', labels: { color: '#cbd5e1', boxWidth: 10, font: { size: 11 } } },
        tooltip: { backgroundColor: '#0f172a' }
      }
    };
    if (charts.par) { charts.par.data = data; charts.par.update(); }
    else charts.par = new Chart(document.getElementById('chartParadas'), { type: 'doughnut', data, options: opts });
  }

  function buildParadasTendencia(rows) {
    const labels = rows.map(r => r.fecha);
    const data = {
      labels,
      datasets: [{
        label: 'Minutos paradas',
        data: rows.map(r => r.total),
        borderColor: palette.cump,
        backgroundColor: 'rgba(245,158,11,0.15)',
        fill: true,
        tension: 0.35,
        pointRadius: 2
      }]
    };
    if (charts.parTrend) { charts.parTrend.data = data; charts.parTrend.update(); }
    else charts.parTrend = new Chart(document.getElementById('chartParadasTendencia'), { type: 'line', data, options: baseLine });
  }

  function renderCifras(rows) {
    const cont = document.getElementById('cifrasMes');
    if (!cont) return;
    if (!rows.length) {
      cont.innerHTML = '<p class="text-slate-500 text-xs">Sin cifras del Excel todavia.</p>';
      return;
    }
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
          <div>
            <p class="text-xs uppercase tracking-wide text-slate-400">${sec}</p>
            <p class="text-[11px] text-slate-500">% Rend / % Merma</p>
          </div>
          <div class="text-right">
            <p class="text-cyan-300 font-bold">${rendStr}</p>
            <p class="text-amber-300 text-xs">${mermaStr}</p>
          </div>
        </div>
      `;
    }).join('');
  }

  function renderParadasRecientes(rows) {
    const tb = document.getElementById('tablaParadasRecientes');
    if (!tb) return;
    if (!rows.length) {
      tb.innerHTML = '<tr><td colspan="7" class="text-center text-slate-500 py-3">Sin registros</td></tr>';
      return;
    }
    tb.innerHTML = rows.map(r => `
      <tr>
        <td>${Live.fmt.date(r.fecha)}</td>
        <td class="text-right">${Live.fmt.num(r.tardanza_inicio)}</td>
        <td class="text-right">${Live.fmt.num(r.lavado_desinfeccion)}</td>
        <td class="text-right">${Live.fmt.num(r.fallas_electricas)}</td>
        <td class="text-right">${Live.fmt.num(r.parada_alimentacion)}</td>
        <td class="text-right">${Live.fmt.num(r.recepcion_entrega)}</td>
        <td class="text-right font-bold text-amber-300">${Live.fmt.num(r.total)}</td>
      </tr>
    `).join('');
  }

  function renderParadasRango(ultimaFecha) {
    const el = document.getElementById('paradasRangoLabel');
    const badge = document.getElementById('paradasBadge');
    if (!el) return;
    if (ultimaFecha) {
      el.textContent = `Ventana: 365 dias hasta ${Live.fmt.date(ultimaFecha)} (ultima parada registrada)`;
      if (badge) badge.textContent = `Hasta ${Live.fmt.date(ultimaFecha)}`;
    } else {
      el.textContent = 'Sin datos disponibles';
    }
  }

  function renderHeader(data) {
    const h = data.header || {};
    const elMes = document.getElementById('dashHeaderMes');
    const elFecha = document.getElementById('dashHeaderFecha');
    if (elMes) elMes.textContent = h.mes ? `· ${Live.MES_NOMBRE[h.mes]} ${h.anio || ''}` : '';
    if (elFecha) elFecha.textContent = h.fecha ? `Fecha de corte: ${Live.fmt.date(h.fecha)}` : 'Sin datos disponibles aun';
  }

  function renderKPIs(data) {
    const merma = data.merma_kpi || {};
    document.getElementById('kpiMermaProm').textContent = Live.fmt.pct(merma.promedio_mes);
    document.getElementById('kpiMermaLotes').textContent = Live.fmt.num(merma.lotes);

    const dias = data.merma_dias || {};
    document.getElementById('kpiMermaDias').textContent = dias.dias_promedio != null ? Number(dias.dias_promedio).toFixed(1) + ' d' : '--';
    document.getElementById('kpiMermaDiasRange').textContent = (dias.dias_min != null && dias.dias_max != null) ? `${dias.dias_min} - ${dias.dias_max}` : '--';

    const tp = data.tiempo_produccion_dia || {};
    document.getElementById('kpiTiempoProd').textContent = tp.tiempo_total || '--';
    document.getElementById('kpiTiempoProdRange').textContent = (tp.hora_inicio || tp.hora_fin) ? `${tp.hora_inicio || '--'} - ${tp.hora_fin || '--'}` : '--';

    const ppto = data.ppto_kpi || {};
    document.getElementById('kpiPpto').textContent = Live.fmt.pct(ppto.cumplimiento || 0);
    document.getElementById('kpiPptoMeta').textContent = Live.fmt.num(ppto.meta);
    document.getElementById('kpiPptoEjec').textContent = Live.fmt.num(ppto.ejecucion, 1);
  }

  function renderResumenDia(data) {
    const r = data.base_dia || {};
    const fecha = r.ultima_fecha;
    document.getElementById('resumenDiaFecha').textContent = fecha ? `Ultimo dia: ${Live.fmt.date(fecha)}` : 'Sin datos diarios';
    document.getElementById('resumenCanales').textContent = Live.fmt.num(r.canales);
    document.getElementById('resumenKilos').textContent = Live.fmt.num(r.kilos, 1);
    document.getElementById('resumenCanalH').textContent = r.canal_h_prom != null ? Number(r.canal_h_prom).toFixed(2) : '--';
    document.getElementById('resumenKilosH').textContent = r.kilos_h_prom != null ? Number(r.kilos_h_prom).toFixed(1) : '--';
  }

  function renderLastSync(data) {
    const ls = data.ultima_sync;
    const el = document.getElementById('lastSync');
    if (el) el.textContent = ls && ls.sincronizado_en ? new Date(ls.sincronizado_en).toLocaleString('es-CO') : 'pendiente';
  }

  function renderAll(data) {
    renderHeader(data);
    renderKPIs(data);
    buildPpto(data.ppto || []);
    document.getElementById('pptoYear').textContent = (data.header && data.header.anio) ? data.header.anio : '';
    buildVelocidad(data.velocidades || []);
    buildParadas(data.paradas_categoria || []);
    buildParadasTendencia(data.paradas_tendencia || []);
    renderParadasRecientes(data.paradas_recientes || []);
    renderParadasRango(data.paradas_ultima_fecha);
    renderCifras(data.cifras_mes || []);
    renderResumenDia(data);
    renderLastSync(data);
    Live.flash('.kpi-card');
  }

  function load() {
    Live.fetchJSON('/api/dashboard').then(renderAll).catch(err => {
      console.error(err);
      Live.toast('No se pudieron cargar los datos', 'error');
    });
  }

  document.addEventListener('DOMContentLoaded', load);
  Live.on(() => load());
})();
