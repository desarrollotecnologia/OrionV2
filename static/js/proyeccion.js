/* Tiempos proyectados de desposte - calculadora en vivo */
(function () {
  const Live = window.OrionLive;
  const $ = (id) => document.getElementById(id);
  const charts = {};

  // velocidades[cliente] = { canal_h, canal_hh, kilos_h, operarios_prom }
  let velocidades = {};

  // ---------- Helpers de tiempo ----------
  function hhmmToMin(s) {
    if (!s) return 0;
    const txt = String(s).trim().replace(",", ".");
    if (!txt) return 0;
    if (txt.includes(":")) {
      const p = txt.split(":");
      const h = parseInt(p[0], 10) || 0;
      const m = parseInt(p[1], 10) || 0;
      return h * 60 + m;
    }
    // Sin ":" -> se interpreta como horas (admite decimales, ej. 1.5 = 1:30)
    const horas = parseFloat(txt);
    return isFinite(horas) ? Math.round(horas * 60) : 0;
  }
  function minToHM(min) {
    if (min == null || !isFinite(min) || min < 0) return "0:00";
    const total = Math.round(min);
    const h = Math.floor(total / 60);
    const m = total % 60;
    return `${h}:${String(m).padStart(2, "0")}`;
  }
  function minToHHMM(min) {
    const total = ((Math.round(min) % 1440) + 1440) % 1440;
    const h = Math.floor(total / 60);
    const m = total % 60;
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  }
  function fmtNum(v) {
    if (v == null || !isFinite(v) || v === 0) return "0,00";
    return Number(v).toFixed(2).replace(".", ",");
  }
  const num = (el) => {
    const v = parseFloat(el.value);
    return isFinite(v) ? v : 0;
  };

  function drawBarChart(key, canvasId, labels, values, label, color) {
    const data = {
      labels,
      datasets: [{ label, data: values, backgroundColor: color, borderRadius: 8 }],
    };
    const opts = {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { labels: { color: '#2f3a35' } } },
      scales: {
        x: { ticks: { color: '#5c6b63' }, grid: { color: 'rgba(47,58,53,0.08)' } },
        y: { ticks: { color: '#5c6b63' }, grid: { color: 'rgba(47,58,53,0.08)' } },
      },
    };
    if (charts[key]) {
      charts[key].data = data;
      charts[key].update();
      return;
    }
    charts[key] = new Chart(document.getElementById(canvasId), { type: 'bar', data, options: opts });
  }

  // ---------- Filas DESPOSTE ----------
  function buscarVel(cliente) {
    if (!cliente) return null;
    const key = cliente.trim().toUpperCase();
    return velocidades[key] || null;
  }

  function nuevaFilaDesposte() {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><input type="text" list="clientesList" class="cell-inp f-cli" placeholder="Cliente" /></td>
      <td><input type="number" min="0" step="1" class="cell-inp text-center f-tipo" placeholder="0" /></td>
      <td><input type="number" min="0" step="1" class="cell-inp text-right f-canales" placeholder="0" /></td>
      <td><input type="number" min="0" step="1" class="cell-inp text-right f-operarios" placeholder="0" /></td>
      <td><input type="number" min="0" step="0.01" class="cell-inp text-right f-velh" placeholder="0,00" /></td>
      <td class="text-right f-velhh">0,00</td>
      <td class="text-right f-tiempo">0:00</td>
      <td class="text-center"><button type="button" class="row-del" title="Quitar">&times;</button></td>
    `;
    const cli = tr.querySelector(".f-cli");
    const velh = tr.querySelector(".f-velh");
    cli.addEventListener("change", () => {
      const ref = buscarVel(cli.value);
      if (ref && ref.canal_h && (!velh.value || velh.dataset.auto === "1")) {
        velh.value = Number(ref.canal_h).toFixed(2);
        velh.dataset.auto = "1";
        velh.title = `Promedio historico (${ref.registros || 0} registros)`;
      }
      recalc();
    });
    velh.addEventListener("input", () => { velh.dataset.auto = "0"; });
    tr.querySelectorAll("input").forEach(inp => inp.addEventListener("input", recalc));
    tr.querySelector(".row-del").addEventListener("click", () => { tr.remove(); recalc(); });
    return tr;
  }

  function nuevaFilaPorcionado() {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><input type="text" list="clientesList" class="cell-inp f-cli" placeholder="Cliente" /></td>
      <td><input type="number" min="0" step="0.01" class="cell-inp text-right f-kg" placeholder="0" /></td>
      <td><input type="number" min="0" step="1" class="cell-inp text-right f-operarios" placeholder="0" /></td>
      <td><input type="number" min="0" step="0.01" class="cell-inp text-right f-velhh" placeholder="0,00" /></td>
      <td class="text-right f-tiempo">0:00</td>
      <td class="text-center"><button type="button" class="row-del" title="Quitar">&times;</button></td>
    `;
    tr.querySelectorAll("input").forEach(inp => inp.addEventListener("input", recalc));
    tr.querySelector(".row-del").addEventListener("click", () => { tr.remove(); recalc(); });
    return tr;
  }

  // ---------- Calculo ----------
  function recalc() {
    // ----- Desposte -----
    let sumCanales = 0, maxOperarios = 0, sumMin = 0, sumVelH = 0, sumVelHH = 0, nVel = 0;
    const chartTiempo = [];
    const chartCanalHH = [];
    $("tbodyDesposte").querySelectorAll("tr").forEach(tr => {
      const cli = (tr.querySelector(".f-cli").value || "").trim() || "SIN CLIENTE";
      const canales = num(tr.querySelector(".f-canales"));
      const operarios = num(tr.querySelector(".f-operarios"));
      const velh = num(tr.querySelector(".f-velh"));
      const velhh = (velh && operarios) ? velh / operarios : 0;
      const horas = (velh > 0 && canales > 0) ? canales / velh : 0;
      tr.querySelector(".f-velhh").textContent = fmtNum(velhh);
      tr.querySelector(".f-tiempo").textContent = minToHM(horas * 60);
      sumCanales += canales;
      if (operarios > maxOperarios) maxOperarios = operarios;
      sumMin += horas * 60;
      if (velh > 0) { sumVelH += velh; sumVelHH += velhh; nVel++; }
      if (horas > 0) chartTiempo.push({ cliente: cli, minutos: Math.round(horas * 60) });
      if (velhh > 0) chartCanalHH.push({ cliente: cli, valor: Number(velhh.toFixed(2)) });
    });
    $("totDespCanales").textContent = Math.round(sumCanales);
    $("totDespOperarios").textContent = maxOperarios;
    $("totDespVelH").textContent = fmtNum(nVel ? sumVelH / nVel : 0);
    $("totDespVelHH").textContent = fmtNum(nVel ? sumVelHH / nVel : 0);
    $("totDespTiempo").textContent = minToHM(sumMin);

    drawBarChart(
      "tiempo",
      "chartProyTiempo",
      chartTiempo.map(x => x.cliente),
      chartTiempo.map(x => x.minutos),
      "Minutos estimados",
      "#8f5560"
    );
    drawBarChart(
      "canalhh",
      "chartProyCanalHH",
      chartCanalHH.map(x => x.cliente),
      chartCanalHH.map(x => x.valor),
      "Canal/hombre",
      "#4a6f56"
    );

    // ----- Porcionado -----
    let pKg = 0, pMaxOp = 0, pMin = 0, pSumVel = 0, pN = 0;
    $("tbodyPorcionado").querySelectorAll("tr").forEach(tr => {
      const kg = num(tr.querySelector(".f-kg"));
      const operarios = num(tr.querySelector(".f-operarios"));
      const velhh = num(tr.querySelector(".f-velhh"));
      const velHr = velhh * operarios;
      const horas = (velHr > 0 && kg > 0) ? kg / velHr : 0;
      tr.querySelector(".f-tiempo").textContent = minToHM(horas * 60);
      pKg += kg;
      if (operarios > pMaxOp) pMaxOp = operarios;
      pMin += horas * 60;
      if (velhh > 0) { pSumVel += velhh; pN++; }
    });
    $("totPorKg").textContent = Math.round(pKg);
    $("totPorOperarios").textContent = pMaxOp;
    $("totPorVel").textContent = fmtNum(pN ? pSumVel / pN : 0);
    $("totPorTiempo").textContent = minToHM(pMin);

    // ----- Informacion general -----
    const duracionMin = sumMin + pMin;
    const descanso = hhmmToMin($("igDescanso").value);
    const parada = hhmmToMin($("igParada").value);
    const inicio = hhmmToMin($("igHoraInicio").value);
    const plantaMin = duracionMin + descanso + parada;
    const salidaMin = inicio + plantaMin;

    $("igDuracion").textContent = minToHM(duracionMin);
    $("igPlanta").textContent = minToHM(plantaMin);
    $("igSalida").textContent = duracionMin > 0 ? minToHHMM(salidaMin) : "--:--";

    const comidas = (plantaMin >= 600 || salidaMin >= 20 * 60) ? "SI" : "NO";
    const elCom = $("igComidas");
    elCom.textContent = comidas;
    elCom.classList.toggle("badge-comida-si", comidas === "SI");
  }

  // ---------- Guardar / cargar / historico ----------
  function recolectarEstado() {
    const desposte = [];
    $("tbodyDesposte").querySelectorAll("tr").forEach(tr => {
      const cli = tr.querySelector(".f-cli").value.trim();
      const canales = num(tr.querySelector(".f-canales"));
      const operarios = num(tr.querySelector(".f-operarios"));
      const velh = num(tr.querySelector(".f-velh"));
      if (!cli && !canales && !velh) return;
      desposte.push({
        cliente: cli,
        tipo: tr.querySelector(".f-tipo").value || null,
        canales, operarios, vel_canal_h: velh,
        vel_canal_hh: tr.querySelector(".f-velhh").textContent,
        tiempo: tr.querySelector(".f-tiempo").textContent,
      });
    });
    const porcionado = [];
    $("tbodyPorcionado").querySelectorAll("tr").forEach(tr => {
      const cli = tr.querySelector(".f-cli").value.trim();
      const kg = num(tr.querySelector(".f-kg"));
      const operarios = num(tr.querySelector(".f-operarios"));
      const velhh = num(tr.querySelector(".f-velhh"));
      if (!cli && !kg && !velhh) return;
      porcionado.push({
        cliente: cli, cant_kg: kg, operarios, vel_kg_hh: velhh,
        tiempo: tr.querySelector(".f-tiempo").textContent,
      });
    });
    return {
      fecha: $("proyFecha").value,
      titulo: $("proyTitulo").value,
      hora_inicio: $("igHoraInicio").value,
      descanso: $("igDescanso").value,
      parada: $("igParada").value,
      duracion: $("igDuracion").textContent,
      salida: $("igSalida").textContent,
      tiempo_planta: $("igPlanta").textContent,
      aplica_comidas: $("igComidas").textContent,
      total_canales: $("totDespCanales").textContent,
      total_operarios: $("totDespOperarios").textContent,
      total_tiempo: $("totDespTiempo").textContent,
      desposte, porcionado,
    };
  }

  function guardarProyeccion() {
    const estado = recolectarEstado();
    if (!estado.desposte.length && !estado.porcionado.length) {
      Live.toast("Agrega al menos una fila con datos", "warn");
      return;
    }
    fetch("/api/proyeccion", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify(estado),
    })
      .then(r => r.json())
      .then(data => {
        if (data.ok) {
          Live.toast("Proyeccion guardada", "ok");
          cargarHistorico();
        } else {
          Live.toast(data.error || "No se pudo guardar", "error");
        }
      })
      .catch(() => Live.toast("Fallo la peticion", "error"));
  }

  function limpiarTabla(tbody) { tbody.innerHTML = ""; }

  function nuevaProyeccion() {
    limpiarTabla($("tbodyDesposte"));
    limpiarTabla($("tbodyPorcionado"));
    $("proyTitulo").value = "";
    $("proyFecha").value = new Date().toISOString().slice(0, 10);
    $("igHoraInicio").value = "09:00";
    $("igDescanso").value = "01:00";
    $("igParada").value = "00:00";
    $("tbodyDesposte").appendChild(nuevaFilaDesposte());
    $("tbodyPorcionado").appendChild(nuevaFilaPorcionado());
    recalc();
  }

  function cargarProyeccion(id) {
    Live.fetchJSON(`/api/proyeccion/${id}`).then(data => {
      if (!data.ok) { Live.toast("No se encontro", "error"); return; }
      const p = data.proyeccion;
      $("proyTitulo").value = p.titulo || "";
      $("proyFecha").value = (p.fecha || "").slice(0, 10);
      $("igHoraInicio").value = p.hora_inicio || "09:00";
      $("igDescanso").value = p.descanso || "01:00";
      $("igParada").value = p.parada || "00:00";
      limpiarTabla($("tbodyDesposte"));
      (p.desposte || []).forEach(row => {
        const tr = nuevaFilaDesposte();
        tr.querySelector(".f-cli").value = row.cliente || "";
        if (row.tipo != null) tr.querySelector(".f-tipo").value = row.tipo;
        tr.querySelector(".f-canales").value = row.canales || "";
        tr.querySelector(".f-operarios").value = row.operarios || "";
        tr.querySelector(".f-velh").value = row.vel_canal_h || "";
        tr.querySelector(".f-velh").dataset.auto = "0";
        $("tbodyDesposte").appendChild(tr);
      });
      if (!(p.desposte || []).length) $("tbodyDesposte").appendChild(nuevaFilaDesposte());
      limpiarTabla($("tbodyPorcionado"));
      (p.porcionado || []).forEach(row => {
        const tr = nuevaFilaPorcionado();
        tr.querySelector(".f-cli").value = row.cliente || "";
        tr.querySelector(".f-kg").value = row.cant_kg || "";
        tr.querySelector(".f-operarios").value = row.operarios || "";
        tr.querySelector(".f-velhh").value = row.vel_kg_hh || "";
        $("tbodyPorcionado").appendChild(tr);
      });
      if (!(p.porcionado || []).length) $("tbodyPorcionado").appendChild(nuevaFilaPorcionado());
      recalc();
      Live.toast("Proyeccion cargada", "ok");
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  }

  function eliminarProyeccion(id) {
    fetch(`/api/proyeccion/${id}`, { method: "DELETE", credentials: "same-origin" })
      .then(r => r.json())
      .then(data => {
        if (data.ok) { Live.toast("Proyeccion eliminada", "ok"); cargarHistorico(); }
        else Live.toast("No se pudo eliminar", "error");
      });
  }

  function cargarHistorico() {
    return Live.fetchJSON("/api/proyeccion").then(data => {
      const rows = data.proyecciones || [];
      $("histCount").textContent = rows.length;
      const tb = $("tbodyHistorico");
      if (!rows.length) {
        tb.innerHTML = '<tr><td colspan="11" class="text-center text-slate-500 py-4">Aun no hay proyecciones guardadas</td></tr>';
        return;
      }
      tb.innerHTML = rows.map(r => `
        <tr data-id="${r.id}" class="hist-row">
          <td>${Live.fmt.date(r.fecha)}</td>
          <td class="truncate max-w-[200px]" title="${r.titulo || ''}">${r.titulo || '--'}</td>
          <td class="text-right">${r.total_canales ?? '--'}</td>
          <td class="text-right">${r.total_operarios ?? '--'}</td>
          <td>${r.hora_inicio || '--'}</td>
          <td>${r.salida || '--'}</td>
          <td>${r.duracion || '--'}</td>
          <td>${r.tiempo_planta || '--'}</td>
          <td class="text-center">${r.aplica_comidas || '--'}</td>
          <td class="truncate max-w-[140px]" title="${r.creado_por || ''}">${r.creado_por || '--'}</td>
          <td class="text-center"><button type="button" class="row-del hist-del" data-id="${r.id}" title="Eliminar">&times;</button></td>
        </tr>
      `).join("");
      tb.querySelectorAll(".hist-row").forEach(tr => {
        tr.addEventListener("click", (e) => {
          if (e.target.classList.contains("hist-del")) return;
          abrirDetalle(tr.getAttribute("data-id"));
        });
      });
      tb.querySelectorAll(".hist-del").forEach(btn => {
        btn.addEventListener("click", (e) => {
          e.stopPropagation();
          eliminarProyeccion(btn.getAttribute("data-id"));
        });
      });
    }).catch(() => {});
  }

  // ---------- Modal de detalle ----------
  let modalId = null;

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  function abrirDetalle(id) {
    Live.fetchJSON(`/api/proyeccion/${id}`).then(data => {
      if (!data.ok) { Live.toast("No se encontro", "error"); return; }
      const p = data.proyeccion;
      modalId = id;
      $("mFecha").textContent = `${Live.fmt.date(p.fecha)} · ${p.creado_por || "Sin autor"}`;
      $("mTitulo").textContent = p.titulo || "Proyeccion sin titulo";

      const desp = (p.desposte || []).map(r => `
        <tr>
          <td>${esc(r.cliente)}</td>
          <td class="text-center">${esc(r.tipo ?? "--")}</td>
          <td class="text-right">${esc(r.canales)}</td>
          <td class="text-right">${esc(r.operarios)}</td>
          <td class="text-right">${esc(Number(r.vel_canal_h).toFixed(2))}</td>
          <td class="text-right">${esc(r.vel_canal_hh)}</td>
          <td class="text-right">${esc(r.tiempo)}</td>
        </tr>`).join("") || '<tr><td colspan="7" class="text-center text-slate-500 py-2">Sin filas</td></tr>';

      const porc = (p.porcionado || []).map(r => `
        <tr>
          <td>${esc(r.cliente)}</td>
          <td class="text-right">${esc(r.cant_kg)}</td>
          <td class="text-right">${esc(r.operarios)}</td>
          <td class="text-right">${esc(r.vel_kg_hh)}</td>
          <td class="text-right">${esc(r.tiempo)}</td>
        </tr>`).join("");

      const infoItems = [
        ["Hora inicio", p.hora_inicio], ["Tiempo descanso", p.descanso],
        ["Parada reuniones", p.parada], ["Duracion proceso", p.duracion],
        ["Hora salida", p.salida], ["Tiempo en planta", p.tiempo_planta],
        ["Aplica comidas", p.aplica_comidas],
      ].map(([k, v]) => `<div class="m-info"><span>${k}</span><strong>${esc(v || "--")}</strong></div>`).join("");

      $("mBody").innerHTML = `
        <div class="m-info-grid">${infoItems}</div>
        <div class="m-totals">
          <span>Totales:</span>
          <strong>${esc(p.total_canales ?? "--")}</strong> canales ·
          <strong>${esc(p.total_operarios ?? "--")}</strong> operarios ·
          <strong>${esc(p.total_tiempo || "--")}</strong> tiempo
        </div>
        <h4 class="m-subtitle">Desposte</h4>
        <div class="overflow-x-auto"><table class="orion-table proy-table">
          <thead><tr><th>Cliente</th><th class="text-center">Tipo</th><th class="text-right">Canales</th>
          <th class="text-right">Operarios</th><th class="text-right">Vel canal/hr</th>
          <th class="text-right">Vel canal/hr/hm</th><th class="text-right">Tiempo</th></tr></thead>
          <tbody>${desp}</tbody>
        </table></div>
        ${porc ? `
        <h4 class="m-subtitle">Porcionado</h4>
        <div class="overflow-x-auto"><table class="orion-table proy-table">
          <thead><tr><th>Cliente</th><th class="text-right">Cant kg</th><th class="text-right">Operarios</th>
          <th class="text-right">Vel kg/hr/hm</th><th class="text-right">Tiempo</th></tr></thead>
          <tbody>${porc}</tbody>
        </table></div>` : ""}
      `;
      $("proyModal").classList.remove("hidden");
    });
  }

  function cerrarModal() {
    $("proyModal").classList.add("hidden");
    modalId = null;
  }

  // ---------- Carga inicial ----------
  function cargarOpciones() {
    return Live.fetchJSON("/api/proyeccion/options").then(data => {
      velocidades = {};
      (data.velocidades || []).forEach(v => {
        if (v.cliente) velocidades[v.cliente.trim().toUpperCase()] = v;
      });
      const dl = $("clientesList");
      dl.innerHTML = (data.clientes || []).map(c => `<option value="${c}"></option>`).join("");
    }).catch(() => Live.toast("No se pudieron cargar las velocidades historicas", "error"));
  }

  document.addEventListener("DOMContentLoaded", () => {
    $("proyFecha").value = new Date().toISOString().slice(0, 10);
    cargarOpciones().then(() => {
      $("tbodyDesposte").appendChild(nuevaFilaDesposte());
      $("tbodyDesposte").appendChild(nuevaFilaDesposte());
      $("tbodyPorcionado").appendChild(nuevaFilaPorcionado());
      recalc();
    });
    cargarHistorico();

    $("btnAddDesposte").addEventListener("click", () => {
      $("tbodyDesposte").appendChild(nuevaFilaDesposte());
    });
    $("btnAddPorcionado").addEventListener("click", () => {
      $("tbodyPorcionado").appendChild(nuevaFilaPorcionado());
    });
    $("btnGuardarProy").addEventListener("click", guardarProyeccion);
    $("btnNuevaProy").addEventListener("click", nuevaProyeccion);
    $("mClose").addEventListener("click", cerrarModal);
    $("mCerrar").addEventListener("click", cerrarModal);
    $("mCargar").addEventListener("click", () => {
      if (modalId) { const id = modalId; cerrarModal(); cargarProyeccion(id); }
    });
    $("proyModal").addEventListener("click", (e) => {
      if (e.target === $("proyModal")) cerrarModal();
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && !$("proyModal").classList.contains("hidden")) cerrarModal();
    });
    ["igHoraInicio", "igDescanso", "igParada"].forEach(id => {
      $(id).addEventListener("input", recalc);
    });
  });
})();
