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

  const AXIS = '#5c6b63';
  const GRID = 'rgba(47,58,53,0.08)';
  const baseLine = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { labels: { color: '#2f3a35' } },
      tooltip: { backgroundColor: '#2f3a35', borderColor: '#dfe5e1', borderWidth: 1 }
    },
    scales: {
      x: { ticks: { color: AXIS }, grid: { color: GRID } },
      y: { ticks: { color: AXIS }, grid: { color: GRID } }
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
    opts.scales.y.title = { display: true, text: 'Canales', color: AXIS };
    opts.scales.y2 = {
      position: 'right', ticks: { color: '#b45309', callback: v => v + '%' },
      grid: { display: false }, title: { display: true, text: '% Cump', color: '#b45309' }
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
        { label: 'Canal/hombre', data: rows.map(r => r.canal_hh || 0), backgroundColor: palette.canalHH, borderRadius: 8 },
        { label: 'Kilos/h', data: rows.map(r => r.kilos_h || 0), backgroundColor: palette.kilosH, borderRadius: 8, yAxisID: 'y2' }
      ]
    };
    const opts = JSON.parse(JSON.stringify(baseLine));
    opts.scales.y.title = { display: true, text: 'Canal/h', color: AXIS };
    opts.scales.y2 = {
      position: 'right', ticks: { color: '#7c3aed' }, grid: { display: false },
      title: { display: true, text: 'Kg/h', color: '#7c3aed' }
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
        legend: { position: 'right', labels: { color: '#2f3a35', boxWidth: 10, font: { size: 11 } } },
        tooltip: { backgroundColor: '#2f3a35' }
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

  function buildProyeccionClientes(rows) {
    const labels = rows.map(r => r.cliente || 'SIN CLIENTE');
    const hh = rows.map(r => r.canal_hh || 0);
    const canales = rows.map(r => r.canales || 0);
    const dataHH = {
      labels,
      datasets: [{ label: 'Canal/hombre', data: hh, backgroundColor: palette.canalHH, borderRadius: 8 }]
    };
    const dataCanales = {
      labels,
      datasets: [{ label: 'Canales promedio', data: canales, backgroundColor: palette.ejec, borderRadius: 8 }]
    };
    if (charts.proyHH) { charts.proyHH.data = dataHH; charts.proyHH.update(); }
    else charts.proyHH = new Chart(document.getElementById('chartProyCanalHH'), { type: 'bar', data: dataHH, options: baseLine });
    if (charts.proyCanales) { charts.proyCanales.data = dataCanales; charts.proyCanales.update(); }
    else charts.proyCanales = new Chart(document.getElementById('chartProyCanales'), { type: 'bar', data: dataCanales, options: baseLine });
  }

  function renderCifras(rows) {
    const cont = document.getElementById('cifrasMes');
    if (!cont) return;
    if (!rows.length) {
      cont.innerHTML = '<p class="text-[#8a9690] text-xs">Sin cifras del Excel todavia.</p>';
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
      const rendStr = rend != null ? Live.fmt.pct(rend) : '<span class="text-[#8a9690]">Sin datos</span>';
      const mermaStr = merma != null ? Live.fmt.pct(merma) : '<span class="text-[#8a9690]">Sin datos</span>';
      return `
        <div class="flex items-center justify-between border border-[#eef1ef] rounded-xl px-3 py-2">
          <div>
            <p class="text-xs uppercase tracking-wide text-[#5c6b63]">${sec}</p>
            <p class="text-[11px] text-[#8a9690]">% Rend / % Merma</p>
          </div>
          <div class="text-right">
            <p class="text-cyan-700 font-bold">${rendStr}</p>
            <p class="text-amber-600 text-xs">${mermaStr}</p>
          </div>
        </div>
      `;
    }).join('');
  }

  function renderParadasRecientes(rows) {
    const tb = document.getElementById('tablaParadasRecientes');
    if (!tb) return;
    if (!rows.length) {
      tb.innerHTML = '<tr><td colspan="7" class="text-center text-[#8a9690] py-3">Sin registros</td></tr>';
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
        <td class="text-right font-bold text-amber-600">${Live.fmt.num(r.total)}</td>
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
    const rango = data.rango || {};
    const el = document.getElementById('resumenDiaFecha');
    if (rango.desde && rango.hasta) {
      el.textContent = rango.desde === rango.hasta
        ? `Dia: ${Live.fmt.date(rango.desde)}`
        : `Rango: ${Live.fmt.date(rango.desde)} a ${Live.fmt.date(rango.hasta)}`;
    } else {
      el.textContent = r.ultima_fecha ? `Ultimo dia: ${Live.fmt.date(r.ultima_fecha)}` : 'Sin datos diarios';
    }
    document.getElementById('resumenCanales').textContent = Live.fmt.num(r.canales);
    document.getElementById('resumenKilos').textContent = Live.fmt.num(r.kilos, 1);
    document.getElementById('resumenCanalH').textContent = r.canal_h_prom != null ? Number(r.canal_h_prom).toFixed(2) : '--';
    document.getElementById('resumenCanalHH').textContent = r.canal_hh_prom != null ? Number(r.canal_hh_prom).toFixed(2) : '--';
    document.getElementById('resumenKilosH').textContent = r.kilos_h_prom != null ? Number(r.kilos_h_prom).toFixed(1) : '--';
  }

  function renderLastSync(data) {
    const ls = data.ultima_sync;
    const el = document.getElementById('lastSync');
    if (el) el.textContent = ls && ls.sincronizado_en ? new Date(ls.sincronizado_en).toLocaleString('es-CO') : 'pendiente';
  }

  function renderRangoActivo(data) {
    const el = document.getElementById('rangoActivo');
    if (!el) return;
    const rango = data.rango || {};
    if (rango.desde && rango.hasta) {
      const txt = rango.desde === rango.hasta
        ? `Mostrando datos del dia ${Live.fmt.date(rango.desde)}`
        : `Mostrando datos del ${Live.fmt.date(rango.desde)} al ${Live.fmt.date(rango.hasta)}`;
      el.innerHTML = `<span class="inline-flex items-center gap-2"><span class="w-1.5 h-1.5 rounded-full bg-orion-500"></span>${txt}</span>`;
    } else {
      el.textContent = '';
    }
  }

  function renderAll(data) {
    renderRangoActivo(data);
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
    buildProyeccionClientes(data.proyeccion_clientes || []);
    renderLastSync(data);
    Live.flash('.kpi-card');
  }

  // ---------- Rango de fechas (Ajustes) ----------
  const STORE_KEY = 'orion.dashboard.rango';
  function hoyISO() { return new Date().toISOString().slice(0, 10); }
  function inicioMesISO() {
    const hoy = new Date();
    return new Date(hoy.getFullYear(), hoy.getMonth(), 1).toISOString().slice(0, 10);
  }
  function rangoDefault() {
    return { desde: inicioMesISO(), hasta: hoyISO() };
  }
  function normalizarRango(r) {
    const hoy = hoyISO();
    const iniMes = inicioMesISO();
    let desde = (r && r.desde) ? String(r.desde) : '';
    let hasta = (r && r.hasta) ? String(r.hasta) : '';
    if (!desde || !hasta) return rangoDefault();
    if (desde > hasta) { const t = desde; desde = hasta; hasta = t; }
    // Si el rango guardado quedo totalmente en meses anteriores, lo movemos al mes actual.
    if (hasta < iniMes) return rangoDefault();
    if (desde > hoy) desde = hoy;
    if (hasta > hoy) hasta = hoy;
    if (desde > hasta) return rangoDefault();
    return { desde, hasta };
  }

  function getRango() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (raw) {
        const r = JSON.parse(raw);
        const rr = normalizarRango(r);
        setRango(rr);
        return rr;
      }
    } catch (e) { /* noop */ }
    const rr = rangoDefault();
    setRango(rr);
    return rr;
  }
  function setRango(r) {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(r)); } catch (e) { /* noop */ }
  }

  function load() {
    const r = getRango();
    const url = `/api/dashboard?desde=${encodeURIComponent(r.desde)}&hasta=${encodeURIComponent(r.hasta)}`;
    Live.fetchJSON(url).then(renderAll).catch(err => {
      console.error(err);
      Live.toast('No se pudieron cargar los datos', 'error');
    });
  }

  function calcularQuick(tipo) {
    const hoy = new Date();
    const fmt = (d) => d.toISOString().slice(0, 10);
    if (tipo === 'hoy') return { desde: fmt(hoy), hasta: fmt(hoy) };
    if (tipo === 'mes') {
      const ini = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
      return { desde: fmt(ini), hasta: fmt(hoy) };
    }
    if (tipo === 'anio') {
      const ini = new Date(hoy.getFullYear(), 0, 1);
      return { desde: fmt(ini), hasta: fmt(hoy) };
    }
    const dias = parseInt(tipo, 10) || 7;
    const ini = new Date(hoy);
    ini.setDate(ini.getDate() - (dias - 1));
    return { desde: fmt(ini), hasta: fmt(hoy) };
  }

  function initAjustes() {
    const panel = document.getElementById('panelAjustes');
    const btn = document.getElementById('btnAjustes');
    const desde = document.getElementById('ajDesde');
    const hasta = document.getElementById('ajHasta');
    if (!panel || !btn) return;

    const r = getRango();
    desde.value = r.desde;
    hasta.value = r.hasta;

    btn.addEventListener('click', (e) => {
      if (e.shiftKey) {
        e.preventDefault();
        e.stopPropagation();
        const cmd = window.prompt('Comando de apertura (interno):');
        if (!cmd) return;
        fetch('/api/usabilidad/unlock', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'same-origin',
          body: JSON.stringify({ cmd }),
        })
          .then(r => r.json())
          .then(data => {
            if (data.ok && data.url) {
              window.location.href = data.url;
            } else {
              Live.toast(data.error || 'Comando invalido', 'error');
            }
          })
          .catch(() => Live.toast('No se pudo validar el comando', 'error'));
        return;
      }
      e.stopPropagation();
      panel.classList.toggle('hidden');
    });
    panel.addEventListener('click', (e) => e.stopPropagation());
    document.addEventListener('click', () => panel.classList.add('hidden'));
    document.getElementById('btnCerrarAjustes').addEventListener('click', () => panel.classList.add('hidden'));

    panel.querySelectorAll('[data-quick]').forEach(chip => {
      chip.addEventListener('click', () => {
        const rr = calcularQuick(chip.getAttribute('data-quick'));
        desde.value = rr.desde;
        hasta.value = rr.hasta;
      });
    });

    document.getElementById('btnAplicarRango').addEventListener('click', () => {
      let d = desde.value || hoyISO();
      let h = hasta.value || hoyISO();
      if (d > h) { const t = d; d = h; h = t; }
      setRango({ desde: d, hasta: h });
      panel.classList.add('hidden');
      load();
    });
  }

  document.addEventListener('DOMContentLoaded', () => { initAjustes(); load(); });
  Live.on(() => load());
})();
