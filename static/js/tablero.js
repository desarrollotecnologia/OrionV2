/* Tablero ORION - render en vivo */
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
      x: { ticks: { color: '#94a3b8', callback: (v) => `S${v + 1}` }, grid: { color: 'rgba(51,65,85,0.3)' } },
      y: { ticks: { color: '#94a3b8' }, grid: { color: 'rgba(51,65,85,0.3)' } }
    }
  };

  function buildChart(canvasId, key, color, rows) {
    const labels = rows.map(r => `Semana ${r.semana}`);
    const meta = rows.map(r => r.meta || 0);
    const ejec = rows.map(r => r.ejecucion || 0);
    const cump = rows.map(r => (r.cumplimiento || 0) * 100);
    const data = {
      labels,
      datasets: [
        { type: 'bar',  label: 'Meta',         data: meta, backgroundColor: color + '70', borderRadius: 8 },
        { type: 'bar',  label: 'Ejecucion',    data: ejec, backgroundColor: color, borderRadius: 8 },
        { type: 'line', label: '% Cumplimiento', data: cump, borderColor: '#f59e0b', backgroundColor: '#f59e0b',
          tension: 0.35, yAxisID: 'y2', borderWidth: 2, pointRadius: 4 }
      ]
    };
    const opts = JSON.parse(JSON.stringify(baseOpts));
    opts.scales.x.ticks = { color: '#94a3b8' };
    opts.scales.y2 = { position: 'right', ticks: { color: '#f59e0b', callback: v => v + '%' }, grid: { display: false } };
    if (charts[key]) { charts[key].data = data; charts[key].update(); }
    else charts[key] = new Chart(document.getElementById(canvasId), { type: 'bar', data, options: opts });
  }

  function buildTable(tbodyId, rows) {
    const tb = document.getElementById(tbodyId);
    if (!tb) return;
    if (!rows.length) {
      tb.innerHTML = '<tr><td colspan="4" class="text-center text-slate-500 py-3">Sin datos</td></tr>';
      return;
    }
    tb.innerHTML = rows.map(r => `
      <tr>
        <td>Semana ${r.semana}</td>
        <td class="text-right">${Live.fmt.num(r.meta)}</td>
        <td class="text-right">${Live.fmt.num(r.ejecucion)}</td>
        <td class="text-right ${r.cumplimiento && r.cumplimiento < 1 ? 'text-amber-300' : 'text-emerald-300'}">
          ${Live.fmt.pct(r.cumplimiento)}
        </td>
      </tr>
    `).join('');
  }

  function renderAll(data) {
    buildChart('chartBovinos', 'bov', '#22d3ee', data.bovinos || []);
    buildChart('chartPorcinos','por', '#f472b6', data.porcinos || []);
    buildTable('tablaBovinos', data.bovinos || []);
    buildTable('tablaPorcinos', data.porcinos || []);
    const ls = data.ultima_sync;
    const el = document.getElementById('lastSync');
    if (el) el.textContent = ls && ls.sincronizado_en ? new Date(ls.sincronizado_en).toLocaleString('es-CO') : 'pendiente';
  }

  function load() {
    Live.fetchJSON('/api/tablero').then(renderAll).catch(err => {
      console.error(err);
      Live.toast('No se pudieron cargar los datos', 'error');
    });
  }

  document.addEventListener('DOMContentLoaded', load);
  Live.on(() => load());
})();
