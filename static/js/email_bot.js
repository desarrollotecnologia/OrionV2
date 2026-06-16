(function () {
  const Live = window.OrionLive;
  const CFG = window.EMAIL_BOT || {};
  const DOC_TYPES = CFG.documentTypes || {};
  const $ = (id) => document.getElementById(id);

  let batchId = null;
  const uploaded = {};
  let popoverDoc = null;
  let popoverPinned = false;
  let hidePopoverTimer = null;

  function toast(msg, kind) {
    if (Live && Live.toast) Live.toast(msg, kind);
    else alert(msg);
  }

  function fmtSize(bytes) {
    if (!bytes) return "0 B";
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
    return (bytes / (1024 * 1024)).toFixed(2) + " MB";
  }

  function esc(s) {
    const d = document.createElement("div");
    d.textContent = s || "";
    return d.innerHTML;
  }

  function pdfUrl(docType) {
    return `/api/email-bot/file/${batchId}/${docType}`;
  }

  async function api(url, opts) {
    const res = await fetch(url, {
      credentials: "same-origin",
      headers: opts && opts.body && !(opts.body instanceof FormData)
        ? { "Content-Type": "application/json" }
        : undefined,
      ...opts,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Error en la solicitud");
    return data;
  }

  async function initSession() {
    const data = await api("/api/email-bot/session", { method: "POST" });
    batchId = data.batch_id;
  }

  function selectedDocs() {
    return [...document.querySelectorAll(".doc-checkbox:checked")].map((el) => el.value);
  }

  function selectedDestinatarios() {
    return [...document.querySelectorAll(".dest-checkbox:checked")].map((el) => ({
      id: parseInt(el.value, 10),
      cliente: el.dataset.cliente,
      email: el.dataset.email,
    }));
  }

  function updateProgress() {
    const docs = selectedDocs();
    const docsOk = docs.length > 0 && docs.every((d) => uploaded[d]);
    const dests = selectedDestinatarios().length > 0;
    const asunto = $("emailAsunto").value.trim().length > 0;

    let step = 1;
    let pct = 25;
    if (docsOk) { step = 2; pct = 50; }
    if (docsOk && dests) { step = 3; pct = 75; }
    if (docsOk && dests && asunto) { step = 4; pct = 100; }

    document.querySelectorAll(".email-step").forEach((el) => {
      const n = parseInt(el.dataset.step, 10);
      el.classList.toggle("is-active", n === step);
      el.classList.toggle("is-done", n < step);
    });
    $("progressFill").style.width = pct + "%";
  }

  function updateCardStates() {
    document.querySelectorAll(".email-doc-card").forEach((card) => {
      const key = card.dataset.doc;
      const checked = card.querySelector(".doc-checkbox").checked;
      const zone = card.querySelector(".email-upload-zone");
      card.classList.toggle("is-checked", checked);
      card.classList.toggle("is-disabled", !checked);
      card.classList.toggle("has-file", !!uploaded[key]);
      zone.classList.toggle("is-disabled", !checked);
    });
    renderResumen();
    updatePreviewBtn();
    updateProgress();
  }

  function renderResumen() {
    const box = $("resumenArchivos");
    const docs = selectedDocs();
    if (!docs.length) {
      box.className = "email-summary-empty";
      box.innerHTML = '<p class="text-sm text-[#8a9690]">Marca documentos y sube los PDF para ver el resumen.</p>';
      return;
    }
    box.className = "email-summary-list";
    box.innerHTML = docs.map((key) => {
      const label = DOC_TYPES[key] || key;
      const file = uploaded[key];
      if (file) {
        return `<div class="email-summary-item is-ok" data-preview-doc="${key}">
          <span class="sum-label">${esc(label)}</span>
          <span class="sum-meta">${esc(file.filename)} · ${fmtSize(file.size_bytes)}</span>
          <span class="sum-hint">Pasa el cursor para previsualizar</span>
        </div>`;
      }
      return `<div class="email-summary-item is-pending">
        <span class="sum-label">${esc(label)}</span>
        <span class="sum-meta">Pendiente de subir</span>
      </div>`;
    }).join("");

    box.querySelectorAll("[data-preview-doc]").forEach((el) => {
      const doc = el.dataset.previewDoc;
      el.addEventListener("mouseenter", (e) => showPdfPopover(doc, e.currentTarget));
      el.addEventListener("mouseleave", scheduleHidePopover);
    });
  }

  function updatePreviewBtn() {
    const docs = selectedDocs();
    const dests = selectedDestinatarios();
    const allUploaded = docs.length > 0 && docs.every((d) => uploaded[d]);
    $("btnPreview").disabled = !(docs.length && dests.length && allUploaded && $("emailAsunto").value.trim());
    updateProgress();
  }

  function showFileInfo(docType, meta) {
    const card = document.querySelector(`.email-doc-card[data-doc="${docType}"]`);
    if (!card) return;
    const zone = card.querySelector(".email-upload-zone");
    const info = card.querySelector(`[data-info="${docType}"]`);
    zone.classList.add("hidden");
    info.classList.remove("hidden");
    info.querySelector(".email-file-name").textContent = meta.filename;
    info.querySelector(".email-file-size").textContent = fmtSize(meta.size_bytes);
    card.classList.add("has-file");
  }

  async function clearFileInfo(docType, skipApi) {
    const card = document.querySelector(`.email-doc-card[data-doc="${docType}"]`);
    if (!card) return;
    const zone = card.querySelector(".email-upload-zone");
    const info = card.querySelector(`[data-info="${docType}"]`);
    card.querySelectorAll(".doc-file, .doc-file-replace").forEach((inp) => { inp.value = ""; });
    zone.classList.remove("hidden");
    info.classList.add("hidden");
    card.classList.remove("has-file");
    delete uploaded[docType];

    if (!skipApi && batchId) {
      try {
        await fetch(`/api/email-bot/file/${batchId}/${docType}`, {
          method: "DELETE",
          credentials: "same-origin",
        });
      } catch (_) { /* ignore */ }
    }

    if (popoverDoc === docType) hidePdfPopover();
    renderResumen();
    updatePreviewBtn();
    refreshModalAttachmentsIfOpen();
  }

  async function handleUpload(docType, file) {
    if (!file || !batchId) return;
    const fd = new FormData();
    fd.append("batch_id", batchId);
    fd.append("doc_type", docType);
    fd.append("file", file);
    try {
      const data = await api("/api/email-bot/upload", { method: "POST", body: fd });
      uploaded[docType] = data.file;
      showFileInfo(docType, data.file);
      toast(`${DOC_TYPES[docType] || docType} subido`, "ok");
      if (popoverDoc === docType) {
        $("pdfPopoverFrame").src = pdfUrl(docType) + "?t=" + Date.now();
      }
      refreshModalAttachmentsIfOpen();
    } catch (err) {
      toast(err.message, "error");
    }
    renderResumen();
    updatePreviewBtn();
  }

  /* ---- PDF popover ---- */
  function positionPopover(anchor) {
    const pop = $("pdfPopover");
    const rect = anchor.getBoundingClientRect();
    const popW = 420;
    const popH = 460;
    let left = rect.right + 12;
    let top = rect.top;

    if (left + popW > window.innerWidth - 16) {
      left = rect.left - popW - 12;
    }
    if (left < 16) left = 16;
    if (top + popH > window.innerHeight - 16) {
      top = window.innerHeight - popH - 16;
    }
    if (top < 16) top = 16;

    pop.style.left = left + "px";
    pop.style.top = top + "px";
  }

  function showPdfPopover(docType, anchor) {
    if (!uploaded[docType] || !batchId) return;
    clearTimeout(hidePopoverTimer);
    popoverDoc = docType;
    const pop = $("pdfPopover");
    $("pdfPopoverTitle").textContent = (DOC_TYPES[docType] || docType) + " — Vista previa";
    $("pdfPopoverFrame").src = pdfUrl(docType);
    positionPopover(anchor);
    pop.classList.remove("hidden");
  }

  function scheduleHidePopover() {
    if (popoverPinned) return;
    hidePopoverTimer = setTimeout(hidePdfPopover, 200);
  }

  function hidePdfPopover() {
    popoverPinned = false;
    popoverDoc = null;
    $("pdfPopover").classList.add("hidden");
    $("pdfPopoverFrame").src = "about:blank";
  }

  function bindPopoverEvents() {
    const pop = $("pdfPopover");
    pop.addEventListener("mouseenter", () => clearTimeout(hidePopoverTimer));
    pop.addEventListener("mouseleave", scheduleHidePopover);
    $("pdfPopoverClose").addEventListener("click", hidePdfPopover);

    $("pdfPopoverReplace").addEventListener("change", (e) => {
      const file = e.target.files && e.target.files[0];
      if (file && popoverDoc) handleUpload(popoverDoc, file);
      e.target.value = "";
    });

    document.querySelectorAll(".email-file-preview-trigger").forEach((btn) => {
      const doc = btn.dataset.preview;
      btn.addEventListener("mouseenter", () => showPdfPopover(doc, btn));
      btn.addEventListener("mouseleave", scheduleHidePopover);
      btn.addEventListener("click", () => {
        popoverPinned = true;
        showPdfPopover(doc, btn);
      });
    });
  }

  function triggerReplace(docType) {
    const card = document.querySelector(`.email-doc-card[data-doc="${docType}"]`);
    const input = card && card.querySelector(".doc-file-replace");
    if (input) input.click();
  }

  let modalPreviewData = null;

  function refreshModalAttachmentsIfOpen() {
    if (!$("previewModal").classList.contains("hidden") && modalPreviewData) {
      const payload = buildPayload();
      api("/api/email-bot/preview", {
        method: "POST",
        body: JSON.stringify(payload),
      }).then(renderPreview).catch(() => {});
    }
  }

  function bindAdjCardEvents() {
    document.querySelectorAll(".email-adj-card").forEach((card) => {
      const doc = card.dataset.doc;
      card.addEventListener("mouseenter", () => showPdfPopover(doc, card));
      card.addEventListener("mouseleave", scheduleHidePopover);
      card.querySelector(".adj-change")?.addEventListener("click", (e) => {
        e.stopPropagation();
        triggerReplace(doc);
      });
    });
  }

  async function loadContactos() {
    const data = await api("/api/email-bot/contactos");
    const list = $("contactosList");
    const dl = $("clientesSinEmail");
    if (!data.contactos.length) {
      list.innerHTML = '<p class="text-sm text-[#8a9690]">No hay contactos. Agrega cliente y correo abajo.</p>';
    } else {
      list.innerHTML = data.contactos.map((c) => `
        <label>
          <input type="checkbox" class="dest-checkbox" value="${c.id}"
                 data-cliente="${esc(c.cliente)}" data-email="${esc(c.email)}" />
          <span>
            <strong>${esc(c.cliente)}</strong>
            <span class="block text-xs text-[#8a9690]">${esc(c.email)}</span>
          </span>
        </label>
      `).join("");
      list.querySelectorAll(".dest-checkbox").forEach((el) => {
        el.addEventListener("change", updatePreviewBtn);
      });
    }
    dl.innerHTML = (data.sin_email || []).map((n) => `<option value="${esc(n)}">`).join("");
  }

  async function loadHistorial() {
    const data = await api("/api/email-bot/historial");
    const tbody = $("historialBody");
    if (!data.items.length) {
      tbody.innerHTML = '<tr><td colspan="6" class="text-center text-[#8a9690]">Sin envios registrados</td></tr>';
      return;
    }
    tbody.innerHTML = data.items.map((r) => {
      const fecha = r.enviado_en ? String(r.enviado_en).replace("T", " ").slice(0, 16) : "--";
      const ok = r.estado === "ok";
      return `<tr>
        <td>${fecha}</td>
        <td>${esc(r.destinatario)}</td>
        <td>${esc(r.cliente || "—")}</td>
        <td>${esc(r.asunto)}</td>
        <td>${esc(r.documentos)}</td>
        <td><span class="${ok ? "text-orion-700" : "text-beef-600"}">${ok ? "Enviado" : "Error"}</span></td>
      </tr>`;
    }).join("");
  }

  function buildPayload() {
    return {
      batch_id: batchId,
      documentos: selectedDocs(),
      destinatarios: selectedDestinatarios(),
      asunto: $("emailAsunto").value.trim(),
      cuerpo: $("emailCuerpo").value.trim(),
    };
  }

  function renderPreview(data) {
    modalPreviewData = data;

    const dests = (data.destinatarios || []).map((d) =>
      `<div class="email-preview-dest"><strong>${esc(d.cliente || "—")}</strong> &lt;${esc(d.email)}&gt;</div>`
    ).join("");

    const adj = (data.adjuntos || []).map((a) => `
      <div class="email-adj-card" data-doc="${esc(a.doc_type)}">
        <span class="adj-icon">PDF</span>
        <span class="adj-label">${esc(a.label)}</span>
        <span class="adj-size">${fmtSize(a.size_bytes)}</span>
        <span class="adj-hover-hint">Pasa el cursor para ver el PDF</span>
        <span class="adj-change" role="button">Cambiar archivo</span>
      </div>
    `).join("");

    let alerts = "";
    if (!data.smtp_ok) {
      alerts += '<p class="email-alert email-alert-warn">SMTP no configurado: no se podra enviar.</p>';
    }
    if (data.faltantes && data.faltantes.length) {
      alerts += `<p class="email-alert email-alert-error">Faltan: ${data.faltantes.map(esc).join(", ")}</p>`;
    }

    $("previewContent").innerHTML = `
      ${alerts}
      <div class="email-preview-block">
        <h3>Destinatarios (${data.total_destinatarios})</h3>
        ${dests}
      </div>
      <div class="email-preview-block">
        <h3>Asunto</h3>
        <p>${esc(data.asunto)}</p>
      </div>
      <div class="email-preview-block">
        <h3>Mensaje</h3>
        <pre>${esc(data.cuerpo)}</pre>
      </div>
      <div class="email-preview-block">
        <h3>Documentos adjuntos (${data.total_adjuntos})</h3>
        <div class="email-adj-grid">${adj || '<span class="text-[#8a9690]">Sin adjuntos</span>'}</div>
      </div>
    `;

    bindAdjCardEvents();
    $("btnConfirmSend").disabled = !data.ok || !data.smtp_ok;
  }

  function openModal() { $("previewModal").classList.remove("hidden"); }
  function closeModal() {
    hidePdfPopover();
    $("previewModal").classList.add("hidden");
    modalPreviewData = null;
  }

  async function onPreview() {
    try {
      const data = await api("/api/email-bot/preview", {
        method: "POST",
        body: JSON.stringify(buildPayload()),
      });
      renderPreview(data);
      openModal();
    } catch (err) {
      toast(err.message, "error");
    }
  }

  async function onSend() {
    const btn = $("btnConfirmSend");
    btn.disabled = true;
    const origHtml = btn.innerHTML;
    btn.innerHTML = "Enviando...";
    try {
      const data = await api("/api/email-bot/send", {
        method: "POST",
        body: JSON.stringify(buildPayload()),
      });
      closeModal();
      if (data.ok) {
        toast(`Correos enviados: ${data.enviados}/${data.total}`, "ok");
        await resetSession();
        await loadHistorial();
      } else {
        toast(`Enviados ${data.enviados}/${data.total}. Revisa el historial.`, "warn");
        await loadHistorial();
      }
    } catch (err) {
      toast(err.message, "error");
    } finally {
      btn.disabled = false;
      btn.innerHTML = origHtml;
    }
  }

  async function resetSession() {
    hidePdfPopover();
    const oldBatch = batchId;
    Object.keys(uploaded).forEach((k) => delete uploaded[k]);
    document.querySelectorAll(".doc-checkbox").forEach((el) => { el.checked = false; });
    document.querySelectorAll(".dest-checkbox").forEach((el) => { el.checked = false; });
    document.querySelectorAll(".email-doc-card").forEach((card) => {
      const key = card.dataset.doc;
      const zone = card.querySelector(".email-upload-zone");
      const info = card.querySelector(`[data-info="${key}"]`);
      zone.classList.remove("hidden");
      info.classList.add("hidden");
      card.classList.remove("has-file");
      card.querySelectorAll(".doc-file, .doc-file-replace").forEach((inp) => { inp.value = ""; });
    });
    if (oldBatch) {
      try {
        await api("/api/email-bot/cleanup", {
          method: "POST",
          body: JSON.stringify({ batch_id: oldBatch }),
        });
      } catch (_) { /* ignore */ }
    }
    await initSession();
    updateCardStates();
  }

  function bindEvents() {
    document.querySelectorAll(".doc-checkbox").forEach((el) => {
      el.addEventListener("change", () => {
        if (!el.checked) clearFileInfo(el.value);
        updateCardStates();
      });
    });

    document.querySelectorAll(".doc-file").forEach((input) => {
      input.addEventListener("change", () => {
        const doc = input.dataset.doc;
        const checkbox = document.querySelector(`.doc-checkbox[value="${doc}"]`);
        if (!checkbox.checked) {
          checkbox.checked = true;
          updateCardStates();
        }
        if (input.files && input.files[0]) handleUpload(doc, input.files[0]);
      });
    });

    document.querySelectorAll(".doc-file-replace").forEach((input) => {
      input.addEventListener("change", () => {
        const doc = input.dataset.doc;
        if (input.files && input.files[0]) handleUpload(doc, input.files[0]);
      });
    });

    document.querySelectorAll(".email-btn-remove").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        clearFileInfo(btn.dataset.remove);
      });
    });

    $("btnSelectAllDocs").addEventListener("click", () => {
      document.querySelectorAll(".doc-checkbox").forEach((el) => { el.checked = true; });
      updateCardStates();
    });

    $("btnPreview").addEventListener("click", onPreview);
    $("btnConfirmSend").addEventListener("click", onSend);
    $("btnReset").addEventListener("click", resetSession);
    $("emailAsunto").addEventListener("input", updatePreviewBtn);

    $("formNuevoContacto").addEventListener("submit", async (e) => {
      e.preventDefault();
      try {
        await api("/api/email-bot/contactos", {
          method: "POST",
          body: JSON.stringify({
            cliente: $("ncCliente").value,
            email: $("ncEmail").value,
          }),
        });
        $("ncCliente").value = "";
        $("ncEmail").value = "";
        toast("Contacto agregado", "ok");
        await loadContactos();
      } catch (err) {
        toast(err.message, "error");
      }
    });

    document.querySelectorAll("[data-close]").forEach((el) => {
      el.addEventListener("click", closeModal);
    });

    bindPopoverEvents();
  }

  async function init() {
    bindEvents();
    await initSession();
    updateCardStates();
    await loadContactos();
    await loadHistorial();
  }

  init().catch((err) => toast(err.message, "error"));
})();
