/* Tiempos proyectados de desposte - calculadora en vivo */
(function () {
  const Live = window.OrionLive;
  const $ = (id) => document.getElementById(id);

  // velocidades[cliente] = { canal_h, canal_hh, kilos_h, operarios_prom }
  let velocidades = {};
  let editId = null;

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

  // Parseo tolerante al formato colombiano: "1.000" = 1000, "1.000,50" = 1000.5,
  // "340,91" = 340.91, "1.5" = 1.5 (decimal con un solo digito no es miles).
  function parseNumCO(str) {
    if (str == null) return 0;
    let s = String(str).trim().replace(/\s/g, "");
    if (!s) return 0;
    const hasComma = s.includes(",");
    if (hasComma) {
      s = s.replace(/\./g, "").replace(",", ".");        // punto=miles, coma=decimal
    } else if (s.includes(".")) {
      const parts = s.split(".");
      if (parts.length > 2) {
        s = parts.join("");                               // varios puntos => miles
      } else if (parts[1].length === 3) {
        s = parts.join("");                               // "1.000" => 1000
      }
      // si el decimal no tiene 3 digitos ("1.5", "1.50") se deja tal cual
    }
    const n = parseFloat(s);
    return isFinite(n) ? n : 0;
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
    cli.addEventListener("change", () => { llenarVelDesposte(tr); recalc(); });
    cli.addEventListener("input", () => { llenarVelDesposte(tr); });
    velh.addEventListener("input", () => { velh.dataset.auto = "0"; });
    tr.querySelectorAll("input").forEach(inp => inp.addEventListener("input", recalc));
    tr.querySelector(".row-del").addEventListener("click", () => { tr.remove(); recalc(); });
    return tr;
  }

  function nuevaFilaPorcionado() {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><input type="text" list="clientesList" class="cell-inp f-cli" placeholder="Cliente" /></td>
      <td><input type="text" inputmode="decimal" class="cell-inp text-right f-kg" placeholder="1.000" /></td>
      <td><input type="number" min="0" step="1" class="cell-inp text-right f-operarios" placeholder="0" /></td>
      <td><input type="number" min="0" step="0.01" class="cell-inp text-right f-velhh" placeholder="0,00" /></td>
      <td class="text-right f-tiempo">0:00</td>
      <td class="text-center"><button type="button" class="row-del" title="Quitar">&times;</button></td>
    `;
    const cli = tr.querySelector(".f-cli");
    const velhh = tr.querySelector(".f-velhh");
    cli.addEventListener("change", () => { llenarVelPorcionado(tr); recalc(); });
    cli.addEventListener("input", () => { llenarVelPorcionado(tr); });
    velhh.addEventListener("input", () => { velhh.dataset.auto = "0"; });
    tr.querySelectorAll("input").forEach(inp => inp.addEventListener("input", recalc));
    tr.querySelector(".row-del").addEventListener("click", () => { tr.remove(); recalc(); });
    return tr;
  }

  // ---------- Calculo ----------
  function recalc() {
    // ----- Desposte -----
    let sumCanales = 0, maxOperarios = 0, sumMin = 0, sumVelH = 0, sumVelHH = 0, nVel = 0;
    $("tbodyDesposte").querySelectorAll("tr").forEach(tr => {
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
    });
    $("totDespCanales").textContent = Math.round(sumCanales);
    $("totDespOperarios").textContent = maxOperarios;
    $("totDespVelH").textContent = fmtNum(nVel ? sumVelH / nVel : 0);
    $("totDespVelHH").textContent = fmtNum(nVel ? sumVelHH / nVel : 0);
    $("totDespTiempo").textContent = minToHM(sumMin);

    // ----- Porcionado -----
    let pKg = 0, pMaxOp = 0, pMin = 0, pSumVel = 0, pN = 0;
    $("tbodyPorcionado").querySelectorAll("tr").forEach(tr => {
      const kg = parseNumCO(tr.querySelector(".f-kg").value);
      const operarios = num(tr.querySelector(".f-operarios"));
      const velhh = num(tr.querySelector(".f-velhh"));
      // Igual que el Excel: tiempo estimado = kilos / velocidad kg/hr/hm.
      const horas = (velhh > 0 && kg > 0) ? kg / velhh : 0;
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
      const kg = parseNumCO(tr.querySelector(".f-kg").value);
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

  function actualizarProyeccion() {
    if (!editId) {
      Live.toast("Primero carga una proyeccion del historico", "warn");
      return;
    }
    const estado = recolectarEstado();
    if (!estado.desposte.length && !estado.porcionado.length) {
      Live.toast("Agrega al menos una fila con datos", "warn");
      return;
    }
    fetch(`/api/proyeccion/${editId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify(estado),
    })
      .then(r => r.json())
      .then(data => {
        if (data.ok) {
          Live.toast("Proyeccion actualizada", "ok");
          cargarHistorico();
        } else {
          Live.toast(data.error || "No se pudo actualizar", "error");
        }
      })
      .catch(() => Live.toast("Fallo la peticion", "error"));
  }

  function limpiarTabla(tbody) { tbody.innerHTML = ""; }

  function nuevaProyeccion() {
    limpiarTabla($("tbodyDesposte"));
    limpiarTabla($("tbodyPorcionado"));
    $("proyTitulo").value = "";
    $("proyFecha").value = Live.fmt.isoDate();
    $("igHoraInicio").value = "09:00";
    $("igDescanso").value = "01:00";
    $("igParada").value = "00:00";
    editId = null;
    $("btnActualizarProy").classList.add("hidden");
    $("tbodyDesposte").appendChild(nuevaFilaDesposte());
    $("tbodyPorcionado").appendChild(nuevaFilaPorcionado());
    recalc();
  }

  function cargarProyeccion(id) {
    Live.fetchJSON(`/api/proyeccion/${id}`).then(data => {
      if (!data.ok) { Live.toast("No se encontro", "error"); return; }
      const p = data.proyeccion;
      editId = Number(p.id || id);
      $("btnActualizarProy").classList.remove("hidden");
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
        // Si no traia velocidad guardada, dejarla en modo auto para que se rellene sola
        tr.querySelector(".f-velh").dataset.auto = row.vel_canal_h ? "0" : "1";
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
        tr.querySelector(".f-velhh").dataset.auto = row.vel_kg_hh ? "0" : "1";
        $("tbodyPorcionado").appendChild(tr);
      });
      if (!(p.porcionado || []).length) $("tbodyPorcionado").appendChild(nuevaFilaPorcionado());
      reaplicarVelocidades();
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
      const info = $("velInfo");
      if (info) {
        const hora = new Date().toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" });
        info.textContent = `Velocidades historicas actualizadas a las ${hora} (ultimos 30 registros por cliente).`;
      }
    }).catch(() => Live.toast("No se pudieron cargar las velocidades historicas", "error"));
  }

  // Rellena la velocidad de UNA fila de desposte con el promedio historico,
  // salvo que el usuario la haya escrito a mano.
  function llenarVelDesposte(tr) {
    const cli = tr.querySelector(".f-cli");
    const velh = tr.querySelector(".f-velh");
    if (!cli || !velh) return;
    if (velh.dataset.auto === "0" && velh.value) return;  // editado a mano
    const ref = buscarVel(cli.value);
    if (ref && ref.canal_h) {
      velh.value = Number(ref.canal_h).toFixed(2);
      velh.dataset.auto = "1";
      velh.title = `Promedio historico (${ref.registros || 0} registros)`;
    }
  }

  function llenarVelPorcionado(tr) {
    const cli = tr.querySelector(".f-cli");
    const velhh = tr.querySelector(".f-velhh");
    if (!cli || !velhh) return;
    if (velhh.dataset.auto === "0" && velhh.value) return;  // editado a mano
    const ref = buscarVel(cli.value);
    if (ref && ref.kilos_hh) {
      velhh.value = Number(ref.kilos_hh).toFixed(2);
      velhh.dataset.auto = "1";
      velhh.title = `Promedio historico porcionado (${ref.registros || 0} registros)`;
    }
  }

  // Reaplica los promedios historicos a todas las filas en modo auto.
  function reaplicarVelocidades() {
    $("tbodyDesposte").querySelectorAll("tr").forEach(llenarVelDesposte);
    $("tbodyPorcionado").querySelectorAll("tr").forEach(llenarVelPorcionado);
    recalc();
  }

  function refrescarVelocidades() {
    const btn = $("btnRefrescarVel");
    if (btn) btn.disabled = true;
    cargarOpciones()
      .then(() => {
        reaplicarVelocidades();
        Live.toast("Velocidades actualizadas desde la base de datos", "ok");
      })
      .finally(() => { if (btn) btn.disabled = false; });
  }

  document.addEventListener("DOMContentLoaded", () => {
    $("proyFecha").value = Live.fmt.isoDate();
    cargarOpciones().then(() => {
      $("tbodyDesposte").appendChild(nuevaFilaDesposte());
      $("tbodyDesposte").appendChild(nuevaFilaDesposte());
      $("tbodyPorcionado").appendChild(nuevaFilaPorcionado());
      recalc();
    });
    cargarHistorico();

    $("btnRefrescarVel").addEventListener("click", refrescarVelocidades);
    $("btnAddDesposte").addEventListener("click", () => {
      $("tbodyDesposte").appendChild(nuevaFilaDesposte());
    });
    $("btnAddPorcionado").addEventListener("click", () => {
      $("tbodyPorcionado").appendChild(nuevaFilaPorcionado());
    });
    $("btnGuardarProy").addEventListener("click", guardarProyeccion);
    $("btnActualizarProy").addEventListener("click", actualizarProyeccion);
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
