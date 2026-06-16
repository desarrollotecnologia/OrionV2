/* Dashboard oculto de usabilidad */
(function () {
  const Live = window.OrionLive;
  const charts = {};

  const base = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { labels: { color: '#2f3a35' } } },
    scales: {
      x: { ticks: { color: '#5c6b63' }, grid: { color: 'rgba(47,58,53,0.08)' } },
      y: { ticks: { color: '#5c6b63' }, grid: { color: 'rgba(47,58,53,0.08)' } },
    },
  };

  function bar(canvasId, labels, values, label, color, key) {
    const data = { labels, datasets: [{ label, data: values, backgroundColor: color, borderRadius: 8 }] };
    if (charts[key]) { charts[key].data = data; charts[key].update(); return; }
    charts[key] = new Chart(document.getElementById(canvasId), { type: 'bar', data, options: base });
  }

  function render(data) {
    const r = data.resumen || {};
    document.getElementById('uUsuarios').textContent = Live.fmt.num(r.usuarios_activos);
    document.getElementById('uSync').textContent = Live.fmt.num(r.sync_7d);
    document.getElementById('uCapBD').textContent = Live.fmt.num(r.capturas_bd_7d);
    document.getElementById('uProy').textContent = Live.fmt.num(r.proyecciones_7d);

    const cap = data.capturas_diarias || [];
    bar('uChartCap', cap.map(x => Live.fmt.date(x.fecha)), cap.map(x => x.total || 0), 'Capturas', '#4a6f56', 'cap');
    const sync = data.sync_diarias || [];
    bar('uChartSync', sync.map(x => Live.fmt.date(x.fecha)), sync.map(x => x.total || 0), 'Syncs', '#8f5560', 'sync');

    const tb = document.getElementById('uTablaUsuarios');
    const users = data.actividad_usuario || [];
    if (!users.length) {
      tb.innerHTML = '<tr><td colspan="2" class="text-center text-[#8a9690] py-3">Sin actividad</td></tr>';
      return;
    }
    tb.innerHTML = users.map(u => `
      <tr><td>${u.usuario || '--'}</td><td class="text-right font-semibold">${Live.fmt.num(u.total)}</td></tr>
    `).join('');
  }

  function load() {
    Live.fetchJSON('/api/usabilidad/data')
      .then((data) => {
        if (!data.ok) throw new Error(data.error || 'No autorizado');
        render(data);
      })
      .catch(() => Live.toast('No autorizado para esta vista', 'error'));
  }

  document.addEventListener('DOMContentLoaded', load);
})();
