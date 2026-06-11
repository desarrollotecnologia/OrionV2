/* Captura BASE DATOS - formulario en vivo */
(function () {
  const Live = window.OrionLive;

  const $ = (id) => document.getElementById(id);
  const fecha = $("f_fecha");
  const especie = $("f_especie");
  const limpieza = $("f_limpieza");
  const cliente = $("f_cliente");
  const proceso = $("f_proceso");
  const operarios = $("f_operarios");
  const canales = $("f_canales");
  const kilos = $("f_kilos");
  const reposo = $("f_reposo");
  const hi = $("f_hi");
  const hf = $("f_hf");
  const tt = $("f_tt");
  const mesAnioHint = $("f_mesanio");

  // ----- Defaults -----
  function hoyISO() { return new Date().toISOString().slice(0, 10); }
  fecha.value = hoyISO();
  reposo.value = "00:00:00";

  function actualizarMesAnioHint() {
    if (!fecha.value) { mesAnioHint.textContent = ""; return; }
    const d = new Date(fecha.value);
    if (Number.isNaN(d.getTime())) return;
    mesAnioHint.textContent = `Mes ${d.getMonth() + 1} · Año ${d.getFullYear()} (${Live.MES_NOMBRE[d.getMonth() + 1]})`;
  }
  fecha.addEventListener("change", actualizarMesAnioHint);
  actualizarMesAnioHint();

  // ----- Cargar opciones desde el backend -----
  function fillSelect(sel, items, placeholder) {
    sel.innerHTML = "";
    if (placeholder) {
      const opt = document.createElement("option");
      opt.value = ""; opt.textContent = placeholder; opt.disabled = true; opt.selected = true;
      sel.appendChild(opt);
    }
    items.forEach(v => {
      const o = document.createElement("option");
      o.value = v; o.textContent = v;
      sel.appendChild(o);
    });
  }

  // ----- Autocomplete cliente -----
  let clienteAc = null;

  function renderAtajos(elId, items, onClick, max = 6) {
    const cont = $(elId);
    cont.innerHTML = "";
    items.slice(0, max).forEach(v => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "chip";
      b.textContent = v;
      b.addEventListener("click", () => onClick(v));
      cont.appendChild(b);
    });
  }

  function renderClientesAside(items) {
    const cont = $("atajosClientes");
    cont.innerHTML = "";
    items.slice(0, 25).forEach(v => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "chip cliente";
      b.textContent = v;
      b.addEventListener("click", () => {
        cliente.value = v;
        if (clienteAc) clienteAc.hide();
        cargarReferenciaCliente(v);
        cliente.focus();
      });
      cont.appendChild(b);
    });
  }

  let opciones = null;
  function cargarOpciones() {
    return Live.fetchJSON("/api/captura/options").then(data => {
      opciones = data;
      fillSelect(especie, data.especies, "Selecciona especie");
      fillSelect(limpieza, data.limpiezas, "Selecciona limpieza");
      fillSelect(proceso, data.procesos, "Selecciona proceso");
      const clientes = data.clientes_base_datos || data.clientes || [];
      if (!clienteAc) {
        clienteAc = Live.autocomplete(cliente, $("clienteAcList"), {
          emptyMsg: (q) => `Sin coincidencias. Puedes usar "${q.toUpperCase()}" como cliente nuevo.`,
          onSelect: (val) => cargarReferenciaCliente(val),
        });
      }
      clienteAc.setItems(clientes);
      renderAtajos("atajosProcesos", data.procesos, v => proceso.value = v, 8);
      renderClientesAside(clientes);
    });
  }

  // ----- Referencia tiempo produccion por cliente -----
  let refActual = null;

  function cargarReferenciaCliente(nombre) {
    const panel = $("refTiempoPanel");
    const refClienteField = $("ref_cliente");
    if (!nombre || !nombre.trim()) {
      refActual = null;
      if (panel) panel.classList.add("hidden");
      if (refClienteField) refClienteField.value = "";
      return Promise.resolve();
    }
    const q = encodeURIComponent(nombre.trim());
    return Live.fetchJSON(`/api/captura/tiempo-produccion?cliente=${q}`).then(data => {
      refActual = data.referencia || null;
      if (refClienteField) refClienteField.value = nombre.trim().toUpperCase();
      if (panel) panel.classList.remove("hidden");
      $("refCanalesProm").textContent = refActual?.canales_promedio != null
        ? Live.fmt.num(refActual.canales_promedio, 1) : "Sin dato";
      $("refTiempoProm").textContent = refActual?.tiempo_promedio || "Sin dato";
      $("refTiempoEst").textContent = refActual?.tiempo_estimado || "Sin dato";
      if ($("ref_canales_prom")) $("ref_canales_prom").value = refActual?.canales_promedio ?? "";
      if ($("ref_tiempo_prom")) $("ref_tiempo_prom").value = normalizarTimeInput(refActual?.tiempo_promedio);
      if ($("ref_tiempo_est")) $("ref_tiempo_est").value = normalizarTimeInput(refActual?.tiempo_estimado);
    }).catch(() => {
      refActual = null;
      if (panel) panel.classList.remove("hidden");
      $("refCanalesProm").textContent = "Sin dato";
      $("refTiempoProm").textContent = "Sin dato";
      $("refTiempoEst").textContent = "Sin dato";
    });
  }

  function normalizarTimeInput(val) {
    if (!val) return "";
    const s = String(val).trim();
    if (/^\d{1,2}:\d{2}(:\d{2})?$/.test(s)) {
      const p = s.split(":");
      if (p.length === 2) return `${p[0].padStart(2,"0")}:${p[1].padStart(2,"0")}:00`;
      return `${p[0].padStart(2,"0")}:${p[1].padStart(2,"0")}:${(p[2]||"00").padStart(2,"0")}`;
    }
    return "";
  }

  cliente.addEventListener("change", () => cargarReferenciaCliente(cliente.value));
  cliente.addEventListener("blur", () => cargarReferenciaCliente(cliente.value));

  $("formTiempoRef").addEventListener("submit", (e) => {
    e.preventDefault();
    const c = cliente.value.trim();
    if (!c) { Live.toast("Selecciona un cliente en el formulario principal", "warn"); return; }
    const payload = {
      cliente: c.toUpperCase(),
      canales_promedio: $("ref_canales_prom").value || null,
      tiempo_promedio: $("ref_tiempo_prom").value || null,
      tiempo_estimado: $("ref_tiempo_est").value || null,
    };
    fetch("/api/captura/tiempo-produccion", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify(payload),
    })
      .then(r => r.json())
      .then(data => {
        if (data.ok) {
          Live.toast("Referencia de tiempo guardada", "ok");
          cargarReferenciaCliente(c);
        } else {
          Live.toast(data.error || "No se pudo guardar", "error");
        }
      })
      .catch(() => Live.toast("Fallo la peticion", "error"));
  });

  // ----- Calculo de tiempo total y velocidades -----
  function hhmmssToSec(s) {
    if (!s) return null;
    const p = s.split(":").map(n => parseInt(n, 10));
    if (p.some(Number.isNaN)) return null;
    if (p.length === 2) return p[0] * 3600 + p[1] * 60;
    if (p.length === 3) return p[0] * 3600 + p[1] * 60 + p[2];
    return null;
  }
  function secToHHMMSS(t) {
    if (t == null || t < 0) return "00:00:00";
    const h = Math.floor(t / 3600);
    const m = Math.floor((t % 3600) / 60);
    const s = Math.floor(t % 60);
    return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
  }

  function setMetric(id, value, hintId, hintOk, hintMissing) {
    $(id).textContent = value;
    const hint = $(hintId);
    if (hint) {
      hint.textContent = value === "--" ? hintMissing : hintOk;
      hint.classList.toggle("metric-hint-ok", value !== "--");
    }
  }

  function recalcular() {
    const ini = hhmmssToSec(hi.value);
    const fin = hhmmssToSec(hf.value);
    const rep = hhmmssToSec(reposo.value) || 0;
    let totalSeg = null;
    if (ini != null && fin != null) {
      let d = fin - ini;
      if (d < 0) d += 24 * 3600;
      totalSeg = Math.max(d - rep, 0);
      tt.value = secToHHMMSS(totalSeg);
    } else {
      tt.value = "";
    }

    const horas = totalSeg ? totalSeg / 3600 : null;
    const c = parseFloat(canales.value) || 0;
    const k = parseFloat(kilos.value) || 0;
    const op = parseInt(operarios.value, 10) || 0;

    if (horas && c) {
      setMetric("prev_canal_h", (c / horas).toFixed(2), "hint_canal_h", "Calculado", "Completa canales, inicio y fin");
    } else {
      setMetric("prev_canal_h", "--", "hint_canal_h", "", "Completa canales, inicio y fin");
    }
    if (horas && k) {
      setMetric("prev_kilos_h", (k / horas).toFixed(2), "hint_kilos_h", "Calculado", "Completa kilos, inicio y fin");
    } else {
      setMetric("prev_kilos_h", "--", "hint_kilos_h", "", "Completa kilos, inicio y fin");
    }
    if (horas && c && op) {
      setMetric("prev_canal_hh", (c / horas / op).toFixed(2), "hint_canal_hh", "Canal por operario y hora", "Agrega operarios para calcular");
      $("metricCanalHH")?.classList.remove("metric-card-warn");
    } else {
      setMetric("prev_canal_hh", "--", "hint_canal_hh", "", op ? "Completa tiempos y canales" : "Agrega operarios para calcular");
      if (!op) $("metricCanalHH")?.classList.add("metric-card-warn");
    }

    if (refActual?.tiempo_estimado && tt.value) {
      const estSeg = hhmmssToSec(normalizarTimeInput(refActual.tiempo_estimado));
      const actSeg = hhmmssToSec(tt.value);
      if (estSeg != null && actSeg != null) {
        const diff = actSeg - estSeg;
        const sign = diff > 0 ? "+" : "";
        const hint = $("refTiempoEst");
        if (hint) hint.textContent = `${refActual.tiempo_estimado} (${sign}${Math.round(diff / 60)} min vs turno)`;
      }
    }
  }
  ["change", "input"].forEach(ev => {
    [hi, hf, reposo, canales, kilos, operarios].forEach(el => el.addEventListener(ev, recalcular));
  });

  // ----- Submit -----
  $("formBaseDatos").addEventListener("submit", (e) => {
    e.preventDefault();
    if (!cliente.value.trim()) { Live.toast("El cliente es obligatorio", "warn"); cliente.focus(); return; }
    if (!proceso.value) { Live.toast("Selecciona un proceso", "warn"); return; }

    const payload = {
      fecha: fecha.value,
      cliente: cliente.value.trim().toUpperCase(),
      especie: especie.value || null,
      limpieza: limpieza.value || null,
      proceso: proceso.value || null,
      operarios: operarios.value || null,
      lote: $("f_lote").value || null,
      canales: canales.value || null,
      kilos: kilos.value || null,
      hora_inicio: hi.value || null,
      hora_fin: hf.value || null,
      tiempo_reposo: reposo.value || "00:00:00",
    };

    const btn = $("btnGuardar");
    btn.disabled = true;
    const prev = btn.textContent;
    btn.textContent = "Guardando...";

    fetch("/api/captura/base-datos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify(payload),
    })
      .then(r => r.json())
      .then(data => {
        if (data.ok) {
          Live.toast("Registro guardado", "ok");
          // Limpiar campos clave dejando defaults utiles
          ["f_lote","f_canales","f_kilos","f_hi","f_hf"].forEach(id => $(id).value = "");
          $("f_canales").focus();
          tt.value = "";
          recalcular();
          cargarManuales();
        } else {
          Live.toast(data.error || "No se pudo guardar", "error");
        }
      })
      .catch(() => Live.toast("Fallo la peticion", "error"))
      .finally(() => { btn.disabled = false; btn.textContent = prev; });
  });

  // ----- Tabla de manuales -----
  function cargarManuales() {
    Live.fetchJSON("/api/captura/base-datos").then(data => {
      const rows = data.manuales || [];
      $("manualCount").textContent = rows.length;
      const tb = $("tablaManuales");
      if (!rows.length) {
        tb.innerHTML = '<tr><td colspan="11" class="text-center text-slate-500 py-4">Aun no hay registros manuales</td></tr>';
        return;
      }
      tb.innerHTML = rows.map(r => `
        <tr>
          <td>${Live.fmt.date(r.fecha)}</td>
          <td class="truncate max-w-[180px]" title="${r.cliente || ''}">${r.cliente || '--'}</td>
          <td>${r.especie || '--'}</td>
          <td>${r.proceso || '--'}</td>
          <td class="text-right">${Live.fmt.num(r.canales)}</td>
          <td class="text-right">${Live.fmt.num(r.kilos, 1)}</td>
          <td class="text-right">${Live.fmt.num(r.velocidad_canal_h, 2)}</td>
          <td class="text-right">${Live.fmt.num(r.velocidad_canal_hh, 2)}</td>
          <td class="text-right">${Live.fmt.num(r.velocidad_kilos_h, 1)}</td>
          <td>${r.tiempo_total || '--'}</td>
          <td><button class="btn-danger" data-id="${r.id}">Eliminar</button></td>
        </tr>
      `).join("");
      tb.querySelectorAll("button[data-id]").forEach(btn => {
        btn.addEventListener("click", () => eliminar(parseInt(btn.dataset.id, 10)));
      });
    });
  }

  function eliminar(id) {
    if (!confirm("¿Eliminar este registro manual?")) return;
    fetch(`/api/captura/base-datos/${id}`, { method: "DELETE", credentials: "same-origin" })
      .then(r => r.json())
      .then(d => {
        if (d.ok) { Live.toast("Registro eliminado", "ok"); cargarManuales(); }
        else Live.toast("No se pudo eliminar", "error");
      });
  }

  // ----- Init -----
  document.addEventListener("DOMContentLoaded", () => {
    cargarOpciones().then(cargarManuales);
  });
  Live.on(() => cargarManuales());
})();
