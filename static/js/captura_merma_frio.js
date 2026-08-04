/* Captura MERMA FRIO - formulario en vivo */
(function () {
  const Live = window.OrionLive;
  const $ = (id) => document.getElementById(id);

  const fb = $("f_fb");
  const fp = $("f_fp");
  const especie = $("f_especie");
  const cliente = $("f_cliente");
  const lote = $("f_lote");
  const machos = $("f_machos");
  const hembras = $("f_hembras");
  const totalAuto = $("f_total");
  const pc = $("f_pc");
  const pf = $("f_pf");
  const cava = $("f_cava");
  const obs = $("f_obs");
  const diasHint = $("f_dias");

  function hoyISO() { return Live.fmt.isoDate(); }
  fp.value = hoyISO();
  fb.value = hoyISO();

  function actualizarDias() {
    if (!fb.value || !fp.value) { diasHint.textContent = "Dias en cava se calcula solo"; return; }
    const a = Live.fmt.parseDate(fb.value);
    const b = Live.fmt.parseDate(fp.value);
    if (!(a instanceof Date) || !(b instanceof Date)) return;
    if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return;
    const diff = Math.round((b - a) / (24 * 3600 * 1000));
    diasHint.textContent = diff >= 0 ? `${diff} dias en cava` : "Fechas invertidas";
    if (!obs.value) obs.placeholder = `(se autocompleta: ${diff} dias en cava)`;
  }
  fb.addEventListener("change", actualizarDias);
  fp.addEventListener("change", actualizarDias);
  actualizarDias();

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

  let clienteAc = null;
  let cavaAc = null;
  let loteAc = null;
  let lotesSirt = {};        // lote_display (upper) -> objeto SIRT del lote
  let clientesLocales = [];  // fallback: clientes de merma en la BD local
  const clienteHint = $("f_cliente_sirt");
  const enc = encodeURIComponent;

  function debounce(fn, ms) {
    let t = null;
    return function () { clearTimeout(t); t = setTimeout(fn, ms); };
  }

  function renderAtajos(elId, items, onClick, max = 10) {
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
    items.slice(0, 20).forEach(v => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "chip cliente";
      b.textContent = v;
      b.addEventListener("click", () => {
        cliente.value = v;
        if (clienteAc) clienteAc.hide();
        cargarLotesSirt();
        cliente.focus();
      });
      cont.appendChild(b);
    });
  }

  function cargarOpciones() {
    return Live.fetchJSON("/api/captura/options").then(data => {
      // Para merma solo bovinos / bufalinos por convencion
      const especiesMerma = (data.especies || []).filter(e => e !== "PORCINOS");
      fillSelect(especie, especiesMerma.length ? especiesMerma : ["BOVINOS", "BUFALINOS"], "Selecciona especie");
      clientesLocales = data.clientes_merma || data.clientes || [];
      const cavas = data.cavas || [];
      if (!clienteAc) {
        clienteAc = Live.autocomplete(cliente, $("clienteAcList"), {
          emptyMsg: (q) => `Sin coincidencias. Puedes usar "${q.toUpperCase()}" como cliente nuevo.`,
          onSelect: () => cargarLotesSirt()
        });
      }
      if (!cavaAc) {
        cavaAc = Live.autocomplete(cava, $("cavaAcList"), {
          emptyMsg: (q) => `Sin coincidencias. Puedes usar "${q}" como cava nueva.`
        });
      }
      if (!loteAc) {
        loteAc = Live.autocomplete(lote, $("loteAcList"), {
          minChars: 0, maxItems: 60,
          emptyMsg: (q) => q ? `Sin lotes que coincidan con "${q}".`
                              : "Elige fechas, especie y cliente para ver lotes.",
          onSelect: (val) => {
            const d = lotesSirt[(val || "").toUpperCase()];
            ultimoLoteSirt = (lote.value || "").trim();
            if (d) aplicarDatosSirt(d, val);
          }
        });
      }
      clienteAc.setItems(clientesLocales);
      cavaAc.setItems(cavas);
      renderAtajos("atajosCavas", cavas, v => { cava.value = v; if (cavaAc) cavaAc.hide(); }, 12);
      renderClientesAside(clientesLocales);
      // Carga inicial desde SIRT segun las fechas por defecto
      cargarClientesSirt();
      cargarLotesSirt();
    });
  }

  function recalcular() {
    const m = parseFloat(machos.value) || 0;
    const h = parseFloat(hembras.value) || 0;
    totalAuto.value = (m + h) || "";
    $("prev_total").textContent = (m + h).toString();
    const pcv = parseFloat(pc.value);
    const pfv = parseFloat(pf.value);
    if (pcv && pfv >= 0) {
      const merma = (pcv - pfv) / pcv;
      $("prev_merma").textContent = (merma * 100).toFixed(2) + "%";
    } else {
      $("prev_merma").textContent = "--";
    }
  }
  ["input", "change"].forEach(ev => {
    [machos, hembras, pc, pf].forEach(el => el.addEventListener(ev, recalcular));
  });

  // ---- Auto-relleno de pesos desde SIRT (Desposte) ----
  const sirtHint = $("f_lote_sirt");
  let sirtToken = 0;
  let ultimoLoteSirt = "";

  function setHint(msg, cls) {
    if (!sirtHint) return;
    sirtHint.textContent = msg;
    sirtHint.className = "hint" + (cls ? " " + cls : "");
  }

  function fmtNum(v) {
    return (v == null) ? "--" : Number(v).toLocaleString("es-CO", { maximumFractionDigits: 2 });
  }

  function setClienteHint(msg, cls) {
    if (!clienteHint) return;
    clienteHint.textContent = msg;
    clienteHint.className = "hint" + (cls ? " " + cls : "");
  }

  function aplicarDatosSirt(d, loteVal) {
    if (!d) return;
    if (d.lote_display && !((lote.value || "").trim())) lote.value = d.lote_display;
    if (d.peso_caliente != null) pc.value = d.peso_caliente;
    if (d.peso_frio != null) pf.value = d.peso_frio;
    if (d.machos != null) machos.value = d.machos;
    if (d.hembras != null) hembras.value = d.hembras;
    // completar solo campos vacios para no pisar lo que el usuario ya eligio
    if (d.cliente && !cliente.value.trim()) cliente.value = d.cliente;
    if (d.especie && especie.querySelector(`option[value="${d.especie}"]`) &&
        (!especie.value || especie.selectedIndex === 0)) {
      especie.value = d.especie;
    }
    if (d.fecha_beneficio) fb.value = d.fecha_beneficio;
    if (d.fecha_produccion) fp.value = d.fecha_produccion;
    actualizarDias();
    recalcular();
    const partes = [];
    if (d.peso_caliente != null) partes.push("caliente " + fmtNum(d.peso_caliente) + " kg");
    if (d.peso_frio != null) partes.push("frio " + fmtNum(d.peso_frio) + " kg");
    if (d.canales != null) {
      const sexo = (d.machos != null || d.hembras != null)
        ? ` (${d.machos || 0}M/${d.hembras || 0}H)` : "";
      partes.push(`${d.canales} canales${sexo}`);
    }
    const cuartos = d.cuartos != null ? ` · ${d.cuartos} cuartos` : "";
    setHint("SIRT: " + partes.join(" · ") + cuartos + " (lote " + (d.lote_display || d.lote || loteVal) + ")", "text-emerald-300");
  }

  // ---- Clientes disponibles en SIRT para el rango de fechas ----
  let clientesToken = 0;
  function cargarClientesSirt() {
    const desde = fb.value || fp.value;
    const hasta = fp.value || fb.value;
    if (!desde && !hasta) return;
    const token = ++clientesToken;
    const url = "/api/captura/merma-frio/sirt/clientes?desde=" + enc(desde) +
      "&hasta=" + enc(hasta) + "&especie=" + enc(especie.value || "");
    setClienteHint("Buscando clientes en SIRT...", "text-orion-300");
    fetch(url, { credentials: "same-origin" })
      .then(r => r.json().then(j => ({ status: r.status, body: j })))
      .then(({ status, body }) => {
        if (token !== clientesToken) return;
        if (body.ok && Array.isArray(body.clientes) && body.clientes.length) {
          if (clienteAc) clienteAc.setItems(body.clientes);
          renderClientesAside(body.clientes);
          setClienteHint(body.clientes.length + " clientes con lotes en ese rango (SIRT).", "text-emerald-300");
        } else {
          if (clienteAc) clienteAc.setItems(clientesLocales);
          renderClientesAside(clientesLocales);
          if (status === 503) setClienteHint("SIRT no disponible; se muestran clientes locales.", "text-amber-300");
          else setClienteHint("Sin lotes en SIRT para ese rango; se muestran clientes locales.", "text-amber-300");
        }
      })
      .catch(() => {
        if (token !== clientesToken) return;
        if (clienteAc) clienteAc.setItems(clientesLocales);
        renderClientesAside(clientesLocales);
        setClienteHint("No se pudo consultar SIRT; se muestran clientes locales.", "text-amber-300");
      });
  }

  // ---- Lotes disponibles en SIRT para el rango + cliente ----
  let lotesToken = 0;
  function cargarLotesSirt() {
    const desde = fb.value || fp.value;
    const hasta = fp.value || fb.value;
    if (!desde && !hasta) return;
    const token = ++lotesToken;
    const url = "/api/captura/merma-frio/sirt/lotes?desde=" + enc(desde) +
      "&hasta=" + enc(hasta) + "&cliente=" + enc((cliente.value || "").trim()) +
      "&especie=" + enc(especie.value || "");
    setHint("Buscando lotes en SIRT...", "text-orion-300");
    fetch(url, { credentials: "same-origin" })
      .then(r => r.json().then(j => ({ status: r.status, body: j })))
      .then(({ status, body }) => {
        if (token !== lotesToken) return;
        lotesSirt = {};
        const labels = [];
        (body.lotes || []).forEach(l => {
          const disp = l.lote_display || l.lote || "";
          if (!disp) return;
          lotesSirt[disp.toUpperCase()] = l;
          labels.push(disp);
        });
        if (loteAc) loteAc.setItems(labels);
        if (labels.length) setHint(labels.length + " lotes disponibles. Elige uno para traer los pesos.", "text-emerald-300");
        else if (status === 503) setHint("SIRT no disponible ahora. Digita el lote a mano.", "text-amber-300");
        else setHint("Sin lotes en SIRT para ese filtro. Puedes digitar el lote.", "text-amber-300");
      })
      .catch(() => {
        if (token !== lotesToken) return;
        setHint("Fallo la consulta de lotes a SIRT. Digita el lote a mano.", "text-amber-300");
      });
  }

  const recargarClientes = debounce(cargarClientesSirt, 350);
  const recargarLotes = debounce(cargarLotesSirt, 350);

  function traerDeSirt() {
    const loteVal = (lote.value || "").trim();
    if (loteVal.length < 3) {
      setHint("Escribe el lote y sal del campo para traer peso caliente/frio.");
      return;
    }
    if (loteVal === ultimoLoteSirt) return;   // evita repetir la misma consulta
    ultimoLoteSirt = loteVal;

    const token = ++sirtToken;
    setHint("Buscando en SIRT...", "text-orion-300");
    const url = "/api/captura/merma-frio/sirt?lote=" + encodeURIComponent(loteVal) +
      "&cliente=" + encodeURIComponent((cliente.value || "").trim());

    fetch(url, { credentials: "same-origin" })
      .then(r => r.json().then(j => ({ status: r.status, body: j })))
      .then(({ status, body }) => {
        if (token !== sirtToken) return;       // llego una respuesta vieja
        if (!body.ok || !body.datos) {
          if (status === 404) setHint("Lote no encontrado en SIRT. Puedes digitar los pesos a mano.", "text-amber-300");
          else if (status === 503) setHint("SIRT no disponible ahora. Digita los pesos a mano.", "text-amber-300");
          else setHint(body.error || "No se pudo consultar SIRT.", "text-amber-300");
          return;
        }
        aplicarDatosSirt(body.datos, loteVal);
      })
      .catch(() => {
        if (token !== sirtToken) return;
        setHint("Fallo la consulta a SIRT. Digita los pesos a mano.", "text-amber-300");
      });
  }

  lote.addEventListener("change", traerDeSirt);
  lote.addEventListener("blur", traerDeSirt);

  // Cambios de fecha/especie -> refrescar clientes y lotes disponibles en SIRT
  [fb, fp].forEach(el => el.addEventListener("change", () => { recargarClientes(); recargarLotes(); }));
  especie.addEventListener("change", () => { recargarClientes(); recargarLotes(); });
  // Cambio de cliente -> refrescar lotes de ese cliente
  cliente.addEventListener("change", recargarLotes);

  $("formMerma").addEventListener("submit", (e) => {
    e.preventDefault();
    if (!cliente.value.trim()) { Live.toast("El cliente es obligatorio", "warn"); cliente.focus(); return; }
    if (!fp.value) { Live.toast("Falta fecha de produccion", "warn"); return; }

    const payload = {
      fecha_beneficio: fb.value || null,
      fecha_produccion: fp.value,
      cliente: cliente.value.trim().toUpperCase(),
      especie: especie.value || null,
      lote: lote.value || null,
      cant_machos: machos.value || 0,
      cant_hembras: hembras.value || 0,
      peso_caliente: pc.value || null,
      peso_frio: pf.value || null,
      cava: cava.value || null,
      observaciones: obs.value || null,
    };

    fetch("/api/captura/merma-frio", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify(payload),
    })
      .then(r => r.json())
      .then(data => {
        if (data.ok) {
          Live.toast("Lote guardado", "ok");
          ["f_lote","f_machos","f_hembras","f_pc","f_pf","f_obs"].forEach(id => $(id).value = "");
          totalAuto.value = "";
          $("prev_total").textContent = "0";
          $("prev_merma").textContent = "--";
          ultimoLoteSirt = "";
          setHint("Escribe el lote y sal del campo para traer peso caliente/frio.");
          cargarManuales();
        } else {
          Live.toast(data.error || "No se pudo guardar", "error");
        }
      })
      .catch(() => Live.toast("Fallo la peticion", "error"));
  });

  function cargarManuales() {
    Live.fetchJSON("/api/captura/merma-frio").then(data => {
      const rows = data.manuales || [];
      $("manualCount").textContent = rows.length;
      const tb = $("tablaManuales");
      if (!rows.length) {
        tb.innerHTML = '<tr><td colspan="11" class="text-center text-slate-500 py-4">Aun no hay registros manuales</td></tr>';
        return;
      }
      tb.innerHTML = rows.map(r => `
        <tr>
          <td>${r.item || '--'}</td>
          <td>${Live.fmt.date(r.fecha_beneficio)}</td>
          <td>${Live.fmt.date(r.fecha_produccion)}</td>
          <td class="truncate max-w-[180px]" title="${r.cliente || ''}">${r.cliente || '--'}</td>
          <td>${r.especie || '--'}</td>
          <td class="text-right">${Live.fmt.num(r.total_canales)}</td>
          <td class="text-right">${Live.fmt.num(r.peso_caliente, 1)}</td>
          <td class="text-right">${Live.fmt.num(r.peso_frio, 1)}</td>
          <td class="text-right">${Live.fmt.pct(r.merma_frio)}</td>
          <td>${r.cava || '--'}</td>
          <td><button class="btn-danger" data-id="${r.id}">Eliminar</button></td>
        </tr>
      `).join("");
      tb.querySelectorAll("button[data-id]").forEach(btn => {
        btn.addEventListener("click", () => eliminar(parseInt(btn.dataset.id, 10)));
      });
    });
  }

  function eliminar(id) {
    if (!confirm("¿Eliminar este lote manual?")) return;
    fetch(`/api/captura/merma-frio/${id}`, { method: "DELETE", credentials: "same-origin" })
      .then(r => r.json())
      .then(d => {
        if (d.ok) { Live.toast("Lote eliminado", "ok"); cargarManuales(); }
        else Live.toast("No se pudo eliminar", "error");
      });
  }

  document.addEventListener("DOMContentLoaded", () => {
    cargarOpciones().then(cargarManuales);
  });
  Live.on(() => cargarManuales());
})();
