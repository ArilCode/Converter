/* ==========================================================
   ACE Converter — main.js
   Semua proses berjalan di browser (client-side). Tidak ada
   data yang dikirim ke server atau disimpan di database.
   ========================================================== */
(() => {
  'use strict';

  /* ---------------------------------------------------------
     Helper
  --------------------------------------------------------- */
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const tick = () => new Promise(r => setTimeout(r, 0));
  const clamp = (n, a, b) => Math.min(b, Math.max(a, n));
  const pad = (n, l = 3) => String(n).padStart(l, '0');
  const extOf = n => (n.split('.').pop() || '').toLowerCase();
  const baseOf = n => n.replace(/\.[^.]+$/, '');

  function fmtSize(b) {
    if (b < 1024) return b + ' B';
    const u = ['KB', 'MB', 'GB'];
    let i = -1;
    do { b /= 1024; i++; } while (b >= 1024 && i < u.length - 1);
    return b.toFixed(b >= 100 ? 0 : 1).replace('.', ',') + ' ' + u[i];
  }

  const ICON_X = '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg>';

  /* ---------------------------------------------------------
     Konfigurasi
  --------------------------------------------------------- */
  const WM = window.ACE_WM || { src: '', ratio: 2 };
  // ukuran logo watermark: ~17% lebar halaman, dibatasi 20–42 mm; jarak ke tepi 4 mm
  const WM_EDGE = 4;
  const wmWidthMm = pw => clamp(pw * 0.17, 20, 42);
  const IMG_EXT = ['jpg', 'jpeg', 'jfif', 'png', 'webp', 'gif', 'bmp', 'avif'];
  const TXT_EXT = ['txt', 'md', 'csv', 'tsv', 'log', 'json', 'xml', 'html', 'htm', 'css', 'js', 'ini', 'yml', 'yaml'];

  const KIND = {
    img: f => IMG_EXT.includes(extOf(f.name)) || /^image\/(jpeg|png|webp|gif|bmp|avif)$/.test(f.type),
    pdf: f => extOf(f.name) === 'pdf' || f.type === 'application/pdf',
    txt: f => TXT_EXT.includes(extOf(f.name)) || (f.type || '').startsWith('text/')
  };

  const TOOLS = {
    img2pdf: { name: 'Gambar → PDF', kind: 'img', accept: '.jpg,.jpeg,.jfif,.png,.webp,.gif,.bmp,.avif,image/*', formats: 'JPG · JPEG · PNG · WEBP · GIF · BMP · AVIF', defName: 'gambar-ke-pdf', ext: 'pdf' },
    pdf2img: { name: 'PDF → Gambar', kind: 'pdf', accept: '.pdf,application/pdf', formats: 'PDF — semua halaman atau rentang tertentu', defName: 'pdf-ke-gambar', ext: 'zip' },
    imgconv: { name: 'Ubah Format Gambar', kind: 'img', accept: '.jpg,.jpeg,.jfif,.png,.webp,.gif,.bmp,.avif,image/*', formats: 'JPG · PNG · WEBP · GIF · BMP · AVIF', defName: 'gambar-konversi', ext: 'zip' },
    imghd: { name: 'HD Foto', kind: 'img', accept: '.jpg,.jpeg,.jfif,.png,.webp,.gif,.bmp,.avif,image/*', formats: 'JPG · PNG · WEBP · GIF · BMP · AVIF', defName: 'foto-hd', ext: 'zip' },
    removebg: { name: 'Hapus Latar', kind: 'img', accept: '.jpg,.jpeg,.jfif,.png,.webp,.gif,.bmp,.avif,image/*', formats: 'JPG · PNG · WEBP · GIF · BMP · AVIF', defName: 'tanpa-latar', ext: 'zip' },
    restore: { name: 'Restore Foto', kind: 'img', accept: '.jpg,.jpeg,.jfif,.png,.webp,.gif,.bmp,.avif,image/*', formats: 'JPG · PNG · WEBP · GIF · BMP · AVIF', defName: 'foto-restore', ext: 'zip' },
    mergepdf: { name: 'Gabung PDF', kind: 'pdf', accept: '.pdf,application/pdf', formats: 'PDF — urutan sesuai nomor', defName: 'gabungan', ext: 'pdf' },
    txt2pdf: { name: 'Teks → PDF', kind: 'txt', accept: '.' + TXT_EXT.join(',.') + ',text/*', formats: 'TXT · MD · CSV · JSON · LOG dan teks lainnya', defName: 'teks-ke-pdf', ext: 'pdf' },
    pdf2txt: { name: 'PDF → Teks', kind: 'pdf', accept: '.pdf,application/pdf', formats: 'PDF yang berisi teks (bukan hasil scan)', defName: 'pdf-ke-teks', ext: 'txt' }
  };

  // ukuran dalam mm (potret)
  const PAPERS = { a3: [297, 420], a4: [210, 297], a5: [148, 210], letter: [215.9, 279.4], legal: [215.9, 355.6], f4: [215, 330] };
  const PAPER_LABEL = { a3: 'A3', a4: 'A4', a5: 'A5', letter: 'Letter', legal: 'Legal', f4: 'F4', fit: 'Fit to image' };
  const QUALITY = { high: { q: 0.92, max: 3600 }, balanced: { q: 0.82, max: 2480 }, small: { q: 0.62, max: 1600 } };
  const MARGIN_TEXT = {
    0: ['Tanpa margin', 'Tanpa margin — gambar menyatu hingga tepi halaman, tanpa jarak.'],
    5: ['Margin kecil · 5 mm', 'Margin kecil — jarak tipis di sekeliling gambar.'],
    15: ['Margin sedang · 15 mm', 'Margin sedang — jarak yang cukup lega di sekeliling gambar.'],
    30: ['Margin besar · 30 mm', 'Margin besar — jarak yang sangat lebar di sekeliling gambar.']
  };

  /* ---------------------------------------------------------
     State & DOM
  --------------------------------------------------------- */
  const state = {
    tool: 'img2pdf',
    files: [],
    result: null,
    busy: false,
    cancel: false,
    pv: { token: 0, urls: [], io: null, pdf: null }
  };
  let uid = 0;

  const dropzone = $('#dropzone');
  const fileInput = $('#fileInput');
  const list = $('#fileList');
  const toasts = $('#toasts');
  const previewDlg = $('#previewDialog');
  const confirmDlg = $('#confirmDialog');

  /* ---------------------------------------------------------
     UI kecil: toast, dialog, progress
  --------------------------------------------------------- */
  function toast(msg, type = 'info', ms = 3600) {
    const t = document.createElement('div');
    t.className = 'toast ' + type;
    t.textContent = msg;
    toasts.appendChild(t);
    while (toasts.children.length > 4) toasts.firstChild.remove();
    setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 320); }, ms);
  }

  function openDialog(d) {
    if (typeof d.showModal === 'function') { if (!d.open) d.showModal(); } else d.setAttribute('open', '');
    document.body.classList.add('no-scroll');
  }
  function closeDialog(d) {
    if (typeof d.close === 'function') d.close(); else d.removeAttribute('open');
    document.body.classList.remove('no-scroll');
    d.dispatchEvent(new Event('close'));
  }

  function askConfirm(title, text, yes) {
    return new Promise(res => {
      $('#cfTitle').textContent = title;
      $('#cfText').textContent = text;
      $('#cfYes').textContent = yes || 'Ya';
      const done = v => { cleanup(); closeDialog(confirmDlg); res(v); };
      const onYes = () => done(true), onNo = () => done(false);
      const onBackdrop = e => { if (e.target === confirmDlg) done(false); };
      const cleanup = () => {
        $('#cfYes').removeEventListener('click', onYes);
        $('#cfNo').removeEventListener('click', onNo);
        confirmDlg.removeEventListener('click', onBackdrop);
        confirmDlg.removeEventListener('cancel', onNo);
      };
      $('#cfYes').addEventListener('click', onYes);
      $('#cfNo').addEventListener('click', onNo);
      confirmDlg.addEventListener('click', onBackdrop);
      confirmDlg.addEventListener('cancel', onNo);
      openDialog(confirmDlg);
    });
  }

  const prog = { el: $('#progress'), title: $('#progTitle'), text: $('#progText'), bar: $('#progBar'), pct: $('#progPct') };
  function showProgress(title) { prog.title.textContent = title; setProgress(0, 'Mempersiapkan…'); prog.el.hidden = false; document.body.classList.add('no-scroll'); }
  function hideProgress() { prog.el.hidden = true; if (![menuDlg, aboutDlg, previewDlg].some(d => d && d.open)) document.body.classList.remove('no-scroll'); }
  function setProgress(frac, text) {
    const p = Math.round(clamp(frac, 0, 1) * 100);
    prog.bar.style.width = p + '%';
    prog.pct.textContent = p + '%';
    if (text) prog.text.textContent = text;
  }
  function checkCancel() { if (state.cancel) { const e = new Error('cancelled'); e.cancelled = true; throw e; } }
  $('#progCancel').addEventListener('click', () => { state.cancel = true; $('#progText').textContent = 'Membatalkan…'; });

  /* ---------------------------------------------------------
     Pustaka eksternal — dimuat HANYA saat dibutuhkan (lazy),
     supaya halaman awal ringan di HP.
  --------------------------------------------------------- */
  const CDN = 'https://cdnjs.cloudflare.com/ajax/libs/';
  const LIBS = {
    jspdf: { url: CDN + 'jspdf/2.5.1/jspdf.umd.min.js', ok: () => window.jspdf && window.jspdf.jsPDF },
    jszip: { url: CDN + 'jszip/3.10.1/jszip.min.js', ok: () => window.JSZip },
    pdflib: { url: CDN + 'pdf-lib/1.17.1/pdf-lib.min.js', ok: () => window.PDFLib },
    pdfjs: {
      url: CDN + 'pdf.js/3.11.174/pdf.min.js',
      ok: () => window.pdfjsLib,
      after: () => { window.pdfjsLib.GlobalWorkerOptions.workerSrc = CDN + 'pdf.js/3.11.174/pdf.worker.min.js'; }
    }
  };
  const libPromise = {};
  function need(name) {
    const lib = LIBS[name];
    if (lib.ok()) return Promise.resolve();
    if (!libPromise[name]) {
      libPromise[name] = new Promise((res, rej) => {
        const sc = document.createElement('script');
        sc.src = lib.url; sc.async = true;
        sc.onload = () => { if (lib.after) lib.after(); res(); };
        sc.onerror = () => { sc.remove(); delete libPromise[name]; rej(new Error('Pustaka "' + name + '" belum termuat. Periksa koneksi internet lalu coba lagi.')); };
        document.head.appendChild(sc);
      });
    }
    return libPromise[name];
  }
  // unduh pustaka di latar belakang sesuai alat yang dipilih (setelah browser idle)
  const WARM = { img2pdf: ['jspdf'], txt2pdf: ['jspdf'], mergepdf: ['pdflib', 'pdfjs'], pdf2img: ['pdfjs', 'jszip'], imgconv: ['jszip'], imghd: ['jszip'], removebg: ['jszip'], restore: ['jszip'], pdf2txt: ['pdfjs'] };
  function warmLibs() {
    const run = () => (WARM[state.tool] || []).forEach(n => need(n).catch(() => {}));
    if (window.requestIdleCallback) requestIdleCallback(run, { timeout: 2500 }); else setTimeout(run, 400);
  }

  /* Logo watermark: dinormalkan lewat canvas menjadi PNG RGBA standar (aman untuk jsPDF & pdf-lib) */
  let wmPromise = null;
  function getWatermark() {
    if (!wmPromise) {
      wmPromise = new Promise((res, rej) => {
        const img = new Image();
        img.onload = () => {
          const c = document.createElement('canvas');
          c.width = img.naturalWidth; c.height = img.naturalHeight;
          c.getContext('2d').drawImage(img, 0, 0);
          const dataUrl = c.toDataURL('image/png');
          const bin = atob(dataUrl.split(',')[1]);
          const bytes = new Uint8Array(bin.length);
          for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
          res({ dataUrl, bytes, ratio: img.naturalWidth / img.naturalHeight });
        };
        img.onerror = () => rej(new Error('Logo watermark tidak dapat dimuat.'));
        img.src = WM.src;
      });
    }
    return wmPromise;
  }

  /* ---------------------------------------------------------
     Tema
  --------------------------------------------------------- */
  (function initTheme() {
    let t = null;
    try { t = localStorage.getItem('ace-theme'); } catch (e) { /* abaikan */ }
    if (!t) t = window.matchMedia && matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
    document.documentElement.dataset.theme = t;
    $('#themeToggle').addEventListener('click', () => {
      const n = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
      document.documentElement.dataset.theme = n;
      try { localStorage.setItem('ace-theme', n); } catch (e) { /* abaikan */ }
    });
    $('#year').textContent = new Date().getFullYear();
  })();

  /* ---------------------------------------------------------
     Pengaturan
  --------------------------------------------------------- */
  const val = n => { const e = $(`[name="${n}"]:checked`); return e ? e.value : null; };

  function getOpts() {
    return {
      orient: val('orient') || 'p',
      paper: $('#paper').value,
      margin: +(val('margin') || 0),
      mode: val('fitmode') || 'fit',
      quality: $('#quality').value,
      watermark: $('#watermark').checked,
      fontFamily: $('#fontFamily').value,
      fontSize: clamp(+$('#fontSize').value || 11, 6, 36),
      imgFormat: val('imgFormat') || 'png',
      dpi: +$('#dpi').value,
      range: $('#range').value.trim(),
      convFormat: val('convFormat') || 'jpeg',
      convQuality: (+$('#convQuality').value || 90) / 100,
      maxSide: +$('#maxSide').value,
      hdScale: +(val('hdScale') || 2),
      hdSharp: +$('#hdSharp').value,
      hdDenoise: $('#hdDenoise').checked,
      rbBg: val('rbBg') || 'transparent',
      rsColor: $('#rsColor').checked,
      rsScratch: $('#rsScratch').checked,
      rsDenoise: $('#rsDenoise').checked,
      rsSharp: +$('#rsSharp').value
    };
  }

  function sanitizeName(s) {
    return s.replace(/[\\/:*?"<>|\u0000-\u001f]/g, '-').replace(/^[\s.]+|[\s.]+$/g, '').slice(0, 120);
  }
  function getBase() {
    let v = sanitizeName($('#fileName').value.trim());
    v = v.replace(/\.(pdf|zip|txt|png|jpe?g|webp)$/i, '');
    return v || TOOLS[state.tool].defName;
  }
  function expectedExt() {
    if (state.result) return state.result.ext;
    const o = getOpts();
    if ((state.tool === 'imgconv' || state.tool === 'imghd' || state.tool === 'restore') && state.files.length === 1) return o.convFormat === 'jpeg' ? 'jpg' : o.convFormat;
    if (state.tool === 'removebg' && state.files.length === 1) return 'png';
    return TOOLS[state.tool].ext;
  }

  function invalidate() {
    state.result = null;
    $('#resultBar').hidden = true;
    updateSuffix();
  }
  function updateSuffix() { $('#nameSuffix').textContent = '.' + expectedExt(); }

  function updateUI() {
    const t = state.tool, cfg = TOOLS[t];
    const o = getOpts();

    // tampilkan pengaturan sesuai alat
    $$('[data-tools]').forEach(el => { el.hidden = !el.dataset.tools.split(' ').includes(t); });

    // opsi fit-to-image tidak untuk teks
    const paper = $('#paper');
    const fitOpt = paper.querySelector('option[value="fit"]');
    fitOpt.disabled = fitOpt.hidden = t === 'txt2pdf';
    if (t === 'txt2pdf' && paper.value === 'fit') paper.value = 'a4';

    const isFit = t === 'img2pdf' && paper.value === 'fit';
    $('#modeSetting').hidden = t !== 'img2pdf' || isFit;
    $('#orientSetting').classList.toggle('is-disabled', isFit);
    $('#orientHint').textContent = isFit ? 'Fit to image: orientasi mengikuti tiap gambar secara otomatis.' : (t === 'img2pdf' && o.orient === 'auto' ? 'Otomatis: foto lebar jadi lanskap, foto tinggi jadi potret.' : '');
    $('#convQualitySetting').hidden = (t !== 'imgconv' && t !== 'imghd' && t !== 'restore') || o.convFormat === 'png';
    $('#hdSharpVal').textContent = o.hdSharp;
    $('#rsSharpVal').textContent = o.rsSharp;
    $('#convQualityVal').textContent = Math.round(o.convQuality * 100);
    $('#marginHint').textContent = MARGIN_TEXT[o.margin][1];

    // judul & dropzone
    $('#toolName').textContent = cfg.name;
    $('#menuCurrent').textContent = cfg.name;
    const _ai = $('.tool.is-active svg'); if (_ai) $('#menuIcon').innerHTML = _ai.outerHTML;
    $('#dzFormats').textContent = cfg.formats;
    fileInput.accept = cfg.accept;
    $('#fileName').placeholder = cfg.defName;
    $('#downloadBtn').lastChild.textContent = ' Konversi & Download';

    // daftar
    const n = state.files.length;
    $('#emptyState').hidden = n > 0;
    $('#listHead').hidden = n === 0;
    $('#orderTip').hidden = n < 2;
    list.hidden = n === 0;
    const total = state.files.reduce((s, f) => s + f.file.size, 0);
    $('#listStat').textContent = n ? `${n} file · ${fmtSize(total)}` : '';
    $('#previewBtn').disabled = $('#downloadBtn').disabled = n === 0 || state.busy;

    updateSuffix();
    updatePreview();
  }

  /* ---------------------------------------------------------
     Pratinjau tata letak
  --------------------------------------------------------- */
  function updatePreview() {
    const t = state.tool;
    if (t !== 'img2pdf' && t !== 'txt2pdf') return;
    const o = getOpts();
    const first = state.files[0];
    const ratio = (first && first.ratio) || 0.75;
    const sheet = $('#sheet'), inner = $('#sheetInner'), img = $('#sheetImg'), ph = $('#sheetPh');
    let pw, ph_, cap;
    const m = t === 'txt2pdf' ? Math.max(o.margin, 8) : o.margin;

    if (t === 'img2pdf' && o.paper === 'fit') {
      const iw = ratio >= 1 ? 200 : 200 * ratio, ih = ratio >= 1 ? 200 / ratio : 200;
      pw = iw + 2 * m; ph_ = ih + 2 * m;
      cap = 'Fit to image · ' + MARGIN_TEXT[o.margin][0];
    } else {
      [pw, ph_] = PAPERS[o.paper];
      const land = o.orient === 'l' || (t === 'img2pdf' && o.orient === 'auto' && first && ratio > 1);
      if (land) [pw, ph_] = [ph_, pw];
      const orientName = o.orient === 'auto' && t === 'img2pdf' ? (land ? 'Lanskap (otomatis)' : 'Potret (otomatis)') : (land ? 'Lanskap' : 'Potret');
      cap = `${PAPER_LABEL[o.paper]} · ${orientName} · ${MARGIN_TEXT[o.margin][0]}`;
    }

    const ar = pw / ph_;
    const W = ar >= 1 ? 280 : Math.round(200 * ar);
    sheet.style.width = W + 'px';
    sheet.style.aspectRatio = pw + ' / ' + ph_;
    sheet.classList.toggle('is-text', t === 'txt2pdf');

    inner.style.left = inner.style.right = (m / pw * 100) + '%';
    inner.style.top = inner.style.bottom = (m / ph_ * 100) + '%';

    if (t === 'img2pdf' && first && first.thumb) {
      img.src = first.thumb; img.hidden = false; ph.hidden = true;
      img.style.objectFit = (o.mode === 'fill' && o.paper !== 'fit') ? 'cover' : 'contain';
    } else {
      img.hidden = true; ph.hidden = false;
      ph.textContent = t === 'img2pdf' ? 'Foto 1' : '';
    }

    const wm = $('#sheetWm');
    wm.hidden = !o.watermark;
    if (o.watermark) {
      const wmW = wmWidthMm(pw);
      wm.style.width = (wmW / pw * 100) + '%';
      wm.style.left = (WM_EDGE / pw * 100) + '%';
      wm.style.bottom = (WM_EDGE / ph_ * 100) + '%';
    }

    $('#sheetCap').textContent = cap;
  }

  /* ---------------------------------------------------------
     Manajemen file
  --------------------------------------------------------- */
  function addFiles(fileList) {
    const cfg = TOOLS[state.tool];
    const all = Array.from(fileList || []);
    if (!all.length) return;
    const ok = all.filter(f => KIND[cfg.kind](f));
    const bad = all.length - ok.length;
    if (bad) toast(`${bad} file dilewati karena formatnya tidak didukung oleh "${cfg.name}".`, 'warn', 4800);
    if (!ok.length) return;

    ok.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));
    const items = ok.map(file => ({ id: ++uid, file, name: file.name, size: file.size, kind: cfg.kind, thumb: null, ratio: null, pages: null, error: null }));
    state.files.push(...items);
    invalidate();
    renderList();
    warmLibs();
    items.forEach(enqueueThumb);
    toast(`${items.length} file ditambahkan.`, 'ok', 2200);
    const lastRow = list.lastElementChild;
    if (lastRow) lastRow.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }

  function subText(f) {
    if (f.error) return '⚠ ' + f.error;
    const parts = [fmtSize(f.size)];
    if (f.kind === 'pdf' && f.pages) parts.push(f.pages + ' halaman');
    return parts.join(' · ');
  }
  function thumbHTML(f) {
    if (f.thumb) return `<img src="${f.thumb}" alt="" decoding="async">`;
    return `<span>${esc(extOf(f.name) || f.kind)}</span>`;
  }
  function rowHTML(f, i, n) {
    return `<li class="file" data-id="${f.id}">
      <input class="ord" type="number" inputmode="numeric" min="1" max="${n}" value="${i + 1}" aria-label="Nomor urut untuk ${esc(f.name)}" title="Urutan">
      <div class="thumb">${thumbHTML(f)}</div>
      <div class="meta"><span class="name" title="${esc(f.name)}">${esc(f.name)}</span><span class="sub${f.error ? ' err' : ''}">${esc(subText(f))}</span></div>
      <button class="del" type="button" aria-label="Hapus ${esc(f.name)}" title="Hapus file ini">${ICON_X}</button>
    </li>`;
  }
  function renderList() {
    const n = state.files.length;
    list.innerHTML = state.files.map((f, i) => rowHTML(f, i, n)).join('');
    updateUI();
  }
  function updateRow(f) {
    const li = list.querySelector(`.file[data-id="${f.id}"]`);
    if (li) {
      li.querySelector('.thumb').innerHTML = thumbHTML(f);
      const sub = li.querySelector('.sub');
      sub.textContent = subText(f);
      sub.classList.toggle('err', !!f.error);
    }
    if (state.files[0] === f) updatePreview();
  }
  function flashRow(id) {
    const li = list.querySelector(`.file[data-id="${id}"]`);
    if (!li) return;
    li.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    li.classList.remove('flash'); void li.offsetWidth; li.classList.add('flash');
  }

  list.addEventListener('focusin', e => { if (e.target.classList.contains('ord')) e.target.select(); });
  list.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.classList.contains('ord')) { e.preventDefault(); e.target.blur(); } });
  list.addEventListener('change', e => {
    const inp = e.target.closest('.ord');
    if (!inp) return;
    const id = +inp.closest('.file').dataset.id;
    const from = state.files.findIndex(f => f.id === id);
    let to = parseInt(inp.value, 10);
    if (isNaN(to)) to = from + 1;
    to = clamp(to, 1, state.files.length) - 1;
    if (to !== from) {
      const [it] = state.files.splice(from, 1);
      state.files.splice(to, 0, it);
      invalidate();
    }
    renderList();
    if (to !== from) flashRow(id);
  });
  list.addEventListener('click', e => {
    const btn = e.target.closest('.del');
    if (!btn) return;
    const id = +btn.closest('.file').dataset.id;
    state.files = state.files.filter(f => f.id !== id);
    invalidate();
    renderList();
  });

  $('#clearAll').addEventListener('click', async () => {
    const n = state.files.length;
    if (!n) return;
    const ok = await askConfirm('Hapus semua file?', `${n} file akan dihapus dari daftar. File asli di perangkatmu tidak terpengaruh.`, 'Ya, hapus semua');
    if (!ok) return;
    state.files = [];
    thumbQueue.length = 0;
    invalidate();
    renderList();
    toast('Semua file dihapus.', 'ok', 2000);
  });

  /* ---------------------------------------------------------
     Thumbnail (antrian, hemat memori untuk 100+ file)
  --------------------------------------------------------- */
  const thumbQueue = [];
  let thumbBusy = 0;
  function enqueueThumb(f) { thumbQueue.push(f); pumpThumbs(); }
  function pumpThumbs() {
    while (thumbBusy < 1 && thumbQueue.length) {
      const f = thumbQueue.shift();
      if (!state.files.includes(f)) continue;
      thumbBusy++;
      makeThumb(f).catch(err => { f.error = f.kind === 'pdf' ? 'PDF tidak dapat dibaca (mungkin terkunci)' : 'Gambar tidak dapat dibaca'; console.warn(err); })
        .finally(() => { thumbBusy--; updateRow(f); setTimeout(pumpThumbs, 40); /* beri napas ke main thread agar scroll tetap mulus */ });
    }
  }

  async function makeThumb(f) {
    if (f.kind === 'img') {
      let bmp;
      try { bmp = await createImageBitmap(f.file, { resizeWidth: 160, resizeQuality: 'medium' }); }
      catch (e) { bmp = await loadBitmap(f.file); }
      const { w, h } = bmpSize(bmp);
      f.ratio = w / h;
      const s = Math.min(1, 160 / w);
      const c = document.createElement('canvas');
      c.width = Math.max(1, Math.round(w * s)); c.height = Math.max(1, Math.round(h * s));
      c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
      f.thumb = c.toDataURL('image/jpeg', 0.7);
      if (bmp.close) bmp.close();
    } else if (f.kind === 'pdf') {
      await need('pdfjs');
      const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(await f.file.arrayBuffer()) }).promise;
      f.pages = pdf.numPages;
      const page = await pdf.getPage(1);
      const v0 = page.getViewport({ scale: 1 });
      const vp = page.getViewport({ scale: 160 / v0.width });
      const c = document.createElement('canvas');
      c.width = Math.floor(vp.width); c.height = Math.floor(vp.height);
      const ctx = c.getContext('2d');
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
      await page.render({ canvasContext: ctx, viewport: vp }).promise;
      f.thumb = c.toDataURL('image/jpeg', 0.7);
      pdf.destroy();
    }
  }

  /* ---------------------------------------------------------
     Input file: klik, drag & drop, paste
  --------------------------------------------------------- */
  dropzone.addEventListener('click', e => { if (e.target.id !== 'pickBtn') fileInput.click(); });
  $('#pickBtn').addEventListener('click', e => { e.stopPropagation(); fileInput.click(); });
  dropzone.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInput.click(); } });
  fileInput.addEventListener('change', () => { addFiles(fileInput.files); fileInput.value = ''; });

  let dragDepth = 0;
  const hasFiles = e => e.dataTransfer && Array.from(e.dataTransfer.types || []).includes('Files');
  window.addEventListener('dragenter', e => { if (!hasFiles(e)) return; e.preventDefault(); dragDepth++; document.body.classList.add('dragging'); });
  window.addEventListener('dragleave', e => { if (!hasFiles(e)) return; dragDepth = Math.max(0, dragDepth - 1); if (!dragDepth) document.body.classList.remove('dragging'); });
  window.addEventListener('dragover', e => { if (hasFiles(e)) { e.preventDefault(); } dropzone.classList.toggle('is-over', e.target.closest && !!e.target.closest('#dropzone')); });
  window.addEventListener('drop', e => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    dragDepth = 0;
    document.body.classList.remove('dragging');
    dropzone.classList.remove('is-over');
    addFiles(e.dataTransfer.files);
  });
  document.addEventListener('paste', e => {
    const fl = e.clipboardData && e.clipboardData.files;
    if (fl && fl.length && !/^(INPUT|TEXTAREA)$/.test((document.activeElement || {}).tagName)) addFiles(fl);
  });

  /* ---------------------------------------------------------
     Ganti alat
  --------------------------------------------------------- */
  $('#tools').addEventListener('click', e => {
    const b = e.target.closest('.tool');
    if (!b || b.dataset.tool === state.tool) return;
    const next = b.dataset.tool;
    $$('.tool').forEach(x => { const on = x === b; x.classList.toggle('is-active', on); x.setAttribute('aria-selected', on); });
    const prevCount = state.files.length;
    state.tool = next;
    state.files = state.files.filter(f => f.kind === TOOLS[next].kind);
    if (state.files.length < prevCount) toast('File yang tidak cocok dengan alat ini dihapus dari daftar.', 'warn', 3800);
    invalidate();
    renderList();
    if (state.files.length) warmLibs();
  });

  /* ---------------------------------------------------------
     Menu pilihan konversi & dialog Tentang
  --------------------------------------------------------- */
  const menuDlg = $('#menuDialog');
  const aboutDlg = $('#aboutDialog');
  const sheetClose = d => { if (d.open) closeDialog(d); };
  $('#menuBtn').addEventListener('click', () => openDialog(menuDlg));
  $('#menuClose').addEventListener('click', () => sheetClose(menuDlg));
  $('#tools').addEventListener('click', e => {
    if (e.target.closest('.tool')) {
      $$('.tool').forEach(x => x.setAttribute('aria-pressed', x.classList.contains('is-active')));
      sheetClose(menuDlg);
    }
  });
  const openAbout = () => { sheetClose(menuDlg); openDialog(aboutDlg); };
  $('#aboutBtn').addEventListener('click', openAbout);
  $('#aboutClose').addEventListener('click', () => sheetClose(aboutDlg));
  [menuDlg, aboutDlg].forEach(d => {
    d.addEventListener('click', e => { if (e.target === d) sheetClose(d); });
    d.addEventListener('cancel', () => document.body.classList.remove('no-scroll'));
  });

  /* ---------------------------------------------------------
     PWA: mode offline (service worker) + info status koneksi
  --------------------------------------------------------- */
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js').catch(() => {});
    });
  }
  window.addEventListener('offline', () => toast('Kamu sedang offline. Fitur yang sudah tersimpan tetap bisa dipakai.', 'info', 4200));
  window.addEventListener('online', () => toast('Kembali online.', 'ok', 2200));

  // perubahan pengaturan membatalkan hasil sebelumnya
  $('#settings').addEventListener('input', e => { if (e.target.id !== 'fileName') { invalidate(); updateUI(); } });
  $('#settings').addEventListener('change', e => { if (e.target.id !== 'fileName') { invalidate(); updateUI(); } });
  $('#fileName').addEventListener('input', updateSuffix);

  /* ---------------------------------------------------------
     Helper gambar
  --------------------------------------------------------- */
  async function loadBitmap(file) {
    try {
      return await createImageBitmap(file, { imageOrientation: 'from-image' });
    } catch (e) {
      return await new Promise((res, rej) => {
        const url = URL.createObjectURL(file);
        const img = new Image();
        img.onload = () => { URL.revokeObjectURL(url); res(img); };
        img.onerror = () => { URL.revokeObjectURL(url); rej(new Error('Gagal membaca gambar: ' + file.name)); };
        img.src = url;
      });
    }
  }
  const bmpSize = b => ({ w: b.naturalWidth || b.width, h: b.naturalHeight || b.height });
  const canvasToBlob = (c, type, q) => new Promise((res, rej) => c.toBlob(b => b ? res(b) : rej(new Error('Gagal membuat gambar (memori perangkat mungkin tidak cukup).')), type, q));

  /* ---------------------------------------------------------
     Watermark logo (jsPDF) — hanya di halaman TERAKHIR,
     kecil, di pojok kiri bawah.
  --------------------------------------------------------- */
  async function drawLastPageWatermark(doc, pw, ph) {
    const wm = await getWatermark();
    const w = wmWidthMm(pw), h = w / wm.ratio;
    doc.setPage(doc.getNumberOfPages());
    doc.saveGraphicsState();
    doc.setGState(new doc.GState({ opacity: 0.9 }));
    doc.addImage(wm.dataUrl, 'PNG', WM_EDGE, ph - h - WM_EDGE, w, h, 'ace-wm', 'FAST');
    doc.restoreGraphicsState();
  }

  /* ---------------------------------------------------------
     BUILDER 1: Gambar → PDF
  --------------------------------------------------------- */
  async function buildImagesPdf(o) {
    await need('jspdf');
    const { jsPDF } = window.jspdf;
    const files = state.files;
    const q = QUALITY[o.quality];
    const m = o.margin;
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    let doc = null;
    let lastPw = 0, lastPh = 0;

    for (let i = 0; i < files.length; i++) {
      checkCancel();
      setProgress(i / files.length, `Memproses gambar ${i + 1} dari ${files.length}`);
      const bmp = await loadBitmap(files[i].file);
      const { w: sw, h: sh } = bmpSize(bmp);

      let pw, ph, dx, dy, dw, dh, cw, ch;
      let sx = 0, sy = 0, sW = sw, sH = sh;

      if (o.paper === 'fit') {
        const sc = Math.min(1, q.max / Math.max(sw, sh));
        cw = Math.max(1, Math.round(sw * sc)); ch = Math.max(1, Math.round(sh * sc));
        dw = cw * 25.4 / 150; dh = ch * 25.4 / 150; // 150 DPI
        pw = dw + 2 * m; ph = dh + 2 * m; dx = m; dy = m;
      } else {
        let [w, h] = PAPERS[o.paper];
        const land = o.orient === 'l' || (o.orient === 'auto' && sw > sh);
        if (land) [w, h] = [h, w];
        pw = w; ph = h;
        const bw = pw - 2 * m, bh = ph - 2 * m;
        if (o.mode === 'fill') {
          const sr = sw / sh, br = bw / bh;
          if (sr > br) { sW = sh * br; sx = (sw - sW) / 2; } else { sH = sw / br; sy = (sh - sH) / 2; }
          dw = bw; dh = bh; dx = m; dy = m;
        } else {
          const r = Math.min(bw / sw, bh / sh);
          dw = sw * r; dh = sh * r; dx = (pw - dw) / 2; dy = (ph - dh) / 2;
        }
        const sc = Math.min(1, q.max / Math.max(sW, sH));
        cw = Math.max(1, Math.round(sW * sc)); ch = Math.max(1, Math.round(sH * sc));
      }

      canvas.width = cw; canvas.height = ch;
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, cw, ch); // latar putih untuk PNG transparan
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(bmp, sx, sy, sW, sH, 0, 0, cw, ch);
      if (bmp.close) bmp.close();

      const blob = await canvasToBlob(canvas, 'image/jpeg', q.q);
      const bytes = new Uint8Array(await blob.arrayBuffer());
      const orientation = pw > ph ? 'l' : 'p';

      if (!doc) doc = new jsPDF({ orientation, unit: 'mm', format: [pw, ph], compress: true });
      else doc.addPage([pw, ph], orientation);

      doc.addImage(bytes, 'JPEG', dx, dy, dw, dh, 'img' + i, 'FAST');
      lastPw = pw; lastPh = ph;
      await tick();
    }
    canvas.width = canvas.height = 0;

    checkCancel();
    if (o.watermark) await drawLastPageWatermark(doc, lastPw, lastPh);
    setProgress(0.97, 'Menyusun file PDF…');
    await tick();
    const blob = doc.output('blob');
    return { kind: 'pdf', blob, ext: 'pdf', info: `${files.length} halaman · ${fmtSize(blob.size)}` };
  }

  /* ---------------------------------------------------------
     BUILDER 2: Teks → PDF
  --------------------------------------------------------- */
  async function buildTextPdf(o) {
    await need('jspdf');
    const { jsPDF } = window.jspdf;
    const files = state.files;
    let [pw, ph] = PAPERS[o.paper] || PAPERS.a4;
    if (o.orient === 'l') [pw, ph] = [ph, pw];
    const m = Math.max(o.margin, 8);
    // sisakan ruang bawah untuk logo agar tidak menimpa teks di halaman terakhir
    const bm = o.watermark ? Math.max(m, WM_EDGE + wmWidthMm(pw) / WM.ratio + 3) : m;
    const doc = new jsPDF({ orientation: pw > ph ? 'l' : 'p', unit: 'mm', format: [pw, ph], compress: true });
    const fs = o.fontSize;
    const lh = fs * 0.3528 * 1.4;
    const maxW = pw - 2 * m;
    let first = true;

    const setFont = () => { doc.setFont(o.fontFamily, 'normal'); doc.setFontSize(fs); doc.setTextColor(20, 24, 40); };

    for (let i = 0; i < files.length; i++) {
      checkCancel();
      setProgress(i / files.length, `Membaca ${files[i].name}`);
      let text = await files[i].file.text();
      text = text.replace(/\r\n?/g, '\n').replace(/\t/g, '    ')
        .replace(/[^\u0000-\u00FF\u2018\u2019\u201C\u201D\u2013\u2014\u2022\u2026\u20AC]/g, '?');
      if (!first) doc.addPage([pw, ph], pw > ph ? 'l' : 'p');
      first = false;
      setFont();
      let y = m + fs * 0.3528;
      const paras = text.split('\n');
      for (let p = 0; p < paras.length; p++) {
        const lines = doc.splitTextToSize(paras[p] === '' ? ' ' : paras[p], maxW);
        for (const ln of lines) {
          if (y > ph - bm) { doc.addPage([pw, ph], pw > ph ? 'l' : 'p'); setFont(); y = m + fs * 0.3528; }
          doc.text(ln, m, y);
          y += lh;
        }
        if (p % 400 === 399) { checkCancel(); await tick(); }
      }
      await tick();
    }

    const total = doc.getNumberOfPages();
    if (o.watermark) await drawLastPageWatermark(doc, pw, ph);
    setProgress(0.97, 'Menyusun file PDF…');
    await tick();
    const blob = doc.output('blob');
    return { kind: 'pdf', blob, ext: 'pdf', info: `${total} halaman · ${fmtSize(blob.size)}` };
  }

  /* ---------------------------------------------------------
     BUILDER 3: Gabung PDF (pdf-lib)
  --------------------------------------------------------- */
  async function buildMergePdf(o) {
    await need('pdflib');
    const { PDFDocument } = window.PDFLib;
    const files = state.files;
    const out = await PDFDocument.create();

    for (let i = 0; i < files.length; i++) {
      checkCancel();
      setProgress(i / files.length * 0.9, `Menggabungkan ${files[i].name}`);
      let src;
      try { src = await PDFDocument.load(await files[i].file.arrayBuffer(), { ignoreEncryption: true }); }
      catch (e) { throw new Error(`Tidak dapat membaca "${files[i].name}". File mungkin rusak atau terkunci.`); }
      const pages = await out.copyPages(src, src.getPageIndices());
      pages.forEach(p => out.addPage(p));
      await tick();
    }

    if (o.watermark && out.getPageCount()) {
      setProgress(0.92, 'Menambahkan logo di halaman terakhir…');
      const wm = await getWatermark();
      const img = await out.embedPng(wm.bytes);
      const page = out.getPages()[out.getPageCount() - 1];
      const box = page.getMediaBox();
      const w = clamp(box.width * 0.17, 48, 120);
      const h = w / wm.ratio;
      const edge = 11; // ≈ 4 mm
      page.drawImage(img, { x: box.x + edge, y: box.y + edge, width: w, height: h, opacity: 0.9 });
    }

    setProgress(0.97, 'Menyimpan PDF…');
    await tick();
    const bytes = await out.save();
    const blob = new Blob([bytes], { type: 'application/pdf' });
    return { kind: 'pdf', blob, ext: 'pdf', info: `${out.getPageCount()} halaman dari ${files.length} PDF · ${fmtSize(blob.size)}` };
  }

  /* ---------------------------------------------------------
     BUILDER 4: PDF → Gambar
  --------------------------------------------------------- */
  function parseRange(str, max) {
    if (!str) return Array.from({ length: max }, (_, i) => i + 1);
    const set = new Set();
    str.split(',').forEach(part => {
      const s = part.trim();
      if (!s) return;
      const mm = s.match(/^(\d+)\s*-\s*(\d+)$/);
      if (mm) {
        let a = +mm[1], b = +mm[2];
        if (a > b) [a, b] = [b, a];
        for (let p = Math.max(1, a); p <= Math.min(max, b); p++) set.add(p);
      } else if (/^\d+$/.test(s)) {
        const p = +s;
        if (p >= 1 && p <= max) set.add(p);
      }
    });
    return Array.from(set).sort((a, b) => a - b);
  }

  async function buildPdfToImages(o) {
    await need('pdfjs'); await need('jszip');
    const mime = o.imgFormat === 'jpeg' ? 'image/jpeg' : 'image/png';
    const ext = o.imgFormat === 'jpeg' ? 'jpg' : 'png';
    const images = [];
    const files = state.files;
    const MAXPX = 16000000;

    for (let fi = 0; fi < files.length; fi++) {
      checkCancel();
      const f = files[fi];
      let pdf;
      try { pdf = await pdfjsLib.getDocument({ data: new Uint8Array(await f.file.arrayBuffer()) }).promise; }
      catch (e) { throw new Error(`Tidak dapat membuka "${f.name}". File mungkin rusak atau terkunci kata sandi.`); }
      const pages = parseRange(o.range, pdf.numPages);
      if (!pages.length) throw new Error(`Rentang halaman tidak valid untuk "${f.name}" (jumlah halaman: ${pdf.numPages}).`);

      for (let pi = 0; pi < pages.length; pi++) {
        checkCancel();
        setProgress((fi + pi / pages.length) / files.length, `${f.name} — halaman ${pages[pi]} (${pi + 1}/${pages.length})`);
        const page = await pdf.getPage(pages[pi]);
        let scale = o.dpi / 72;
        let vp = page.getViewport({ scale });
        if (vp.width * vp.height > MAXPX) { scale *= Math.sqrt(MAXPX / (vp.width * vp.height)); vp = page.getViewport({ scale }); }
        const c = document.createElement('canvas');
        c.width = Math.floor(vp.width); c.height = Math.floor(vp.height);
        const ctx = c.getContext('2d');
        ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
        await page.render({ canvasContext: ctx, viewport: vp }).promise;
        const blob = await canvasToBlob(c, mime, 0.92);
        c.width = c.height = 0;
        const name = `${baseOf(f.name)}_halaman-${pad(pages[pi])}.${ext}`;
        images.push({ name, blob });
        page.cleanup();
        await tick();
      }
      pdf.destroy();
    }
    return await packImages(images, ext, 'gambar');
  }

  /* ---------------------------------------------------------
     BUILDER 5: Ubah format gambar
  --------------------------------------------------------- */
  async function buildConvertImages(o) {
    await need('jszip');
    const mime = 'image/' + o.convFormat;
    const ext = o.convFormat === 'jpeg' ? 'jpg' : o.convFormat;
    const files = state.files;
    const images = [];
    const c = document.createElement('canvas');
    const ctx = c.getContext('2d');

    for (let i = 0; i < files.length; i++) {
      checkCancel();
      setProgress(i / files.length, `Mengubah ${files[i].name} (${i + 1}/${files.length})`);
      const bmp = await loadBitmap(files[i].file);
      const { w, h } = bmpSize(bmp);
      const sc = o.maxSide ? Math.min(1, o.maxSide / Math.max(w, h)) : 1;
      c.width = Math.max(1, Math.round(w * sc)); c.height = Math.max(1, Math.round(h * sc));
      ctx.clearRect(0, 0, c.width, c.height);
      if (o.convFormat === 'jpeg') { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height); }
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(bmp, 0, 0, c.width, c.height);
      if (bmp.close) bmp.close();
      const blob = await canvasToBlob(c, mime, o.convQuality);
      if (blob.type && blob.type !== mime) throw new Error('Browser ini belum mendukung ekspor ke format ' + ext.toUpperCase() + '. Coba format lain.');
      images.push({ name: `${baseOf(files[i].name)}.${ext}`, blob });
      await tick();
    }
    c.width = c.height = 0;
    return await packImages(images, ext, 'konversi');
  }

  /* ---------------------------------------------------------
     HD Foto: perbesar bertahap + haluskan noise + penajaman (unsharp mask)
     Semua di canvas, tanpa pustaka luar, jadi tetap jalan offline.
  --------------------------------------------------------- */
  const HD_MAX_PIXELS = 16e6;

  // blur kotak (box blur) terpisah; RGB saja. Mengembalikan salinan yang sudah di-blur.
  async function hdBoxBlur(src, w, h, r, passes) {
    const win = 2 * r + 1;
    let a = new Uint8ClampedArray(src), b = new Uint8ClampedArray(src.length);
    const cs = new Float32Array(w * 3);
    const cl = (v, m) => v < 0 ? 0 : v > m ? m : v;
    for (let p = 0; p < passes; p++) {
      for (let y = 0; y < h; y++) {                       // horizontal a -> b
        const row = y * w * 4;
        for (let c = 0; c < 3; c++) {
          let sum = 0;
          for (let k = -r; k <= r; k++) sum += a[row + cl(k, w - 1) * 4 + c];
          for (let x = 0; x < w; x++) {
            b[row + x * 4 + c] = sum / win;
            sum += a[row + cl(x + r + 1, w - 1) * 4 + c] - a[row + cl(x - r, w - 1) * 4 + c];
          }
        }
        if (y % 64 === 0) { checkCancel(); await tick(); }
      }
      cs.fill(0);                                         // vertikal b -> a
      for (let k = -r; k <= r; k++) {
        const row = cl(k, h - 1) * w * 4;
        for (let x = 0; x < w; x++) for (let c = 0; c < 3; c++) cs[x * 3 + c] += b[row + x * 4 + c];
      }
      for (let y = 0; y < h; y++) {
        const o = y * w * 4, ad = cl(y + r + 1, h - 1) * w * 4, sb = cl(y - r, h - 1) * w * 4;
        for (let x = 0; x < w; x++) for (let c = 0; c < 3; c++) {
          const i = x * 3 + c;
          a[o + x * 4 + c] = cs[i] / win;
          cs[i] += b[ad + x * 4 + c] - b[sb + x * 4 + c];
        }
        if (y % 64 === 0) { checkCancel(); await tick(); }
      }
    }
    return a;
  }

  // haluskan bintik hanya di area datar (tepi/detail tidak ikut diburamkan)
  async function hdDenoise(ctx, w, h) {
    const img = ctx.getImageData(0, 0, w, h), d = img.data;
    const bl = await hdBoxBlur(d, w, h, 1, 1);
    const T = 36, S = 0.75;
    const L = i => d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114;
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const i = (y * w + x) * 4;
        const g = Math.abs(L(i + 4) - L(i - 4)) + Math.abs(L(i + w * 4) - L(i - w * 4));
        const t = Math.max(0, 1 - g / T) * S;
        if (t > 0) for (let c = 0; c < 3; c++) d[i + c] += (bl[i + c] - d[i + c]) * t;
      }
      if (y % 64 === 0) { checkCancel(); await tick(); }
    }
    ctx.putImageData(img, 0, 0);
  }

  async function hdSharpen(ctx, w, h, amount, radius) {
    const img = ctx.getImageData(0, 0, w, h), d = img.data;
    const bl = await hdBoxBlur(d, w, h, radius, 2);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        for (let c = 0; c < 3; c++) {
          const diff = d[i + c] - bl[i + c];
          if (diff > 2 || diff < -2) d[i + c] += diff * amount;
        }
      }
      if (y % 64 === 0) { checkCancel(); await tick(); }
    }
    ctx.putImageData(img, 0, 0);
  }

  async function buildHdImages(o) {
    await need('jszip');
    const mime = 'image/' + o.convFormat;
    const ext = o.convFormat === 'jpeg' ? 'jpg' : o.convFormat;
    const files = state.files;
    const images = [];
    let limited = false;

    for (let i = 0; i < files.length; i++) {
      checkCancel();
      const label = `${files[i].name} (${i + 1}/${files.length})`;
      const prog = (f, t) => setProgress((i + f) / files.length, `${t} ${label}`);
      prog(0, 'Membaca');
      const bmp = await loadBitmap(files[i].file);
      const { w, h } = bmpSize(bmp);
      let scale = o.hdScale;
      const cap = Math.sqrt(HD_MAX_PIXELS / (w * h));
      if (scale > cap) { scale = Math.max(1, cap); limited = true; }
      const tw = Math.max(1, Math.round(w * scale)), th = Math.max(1, Math.round(h * scale));

      let cur = document.createElement('canvas');
      cur.width = w; cur.height = h;
      let ctx = cur.getContext('2d', { willReadFrequently: true });
      if (o.convFormat === 'jpeg') { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h); }
      ctx.drawImage(bmp, 0, 0);
      if (bmp.close) bmp.close();

      if (o.hdDenoise) { prog(0.15, 'Menghaluskan noise'); await hdDenoise(ctx, w, h); }

      // perbesar bertahap (maks 2× per langkah) supaya lebih halus
      let cw = w, ch = h, step = 0;
      while (cw < tw || ch < th) {
        checkCancel();
        const nw = Math.min(tw, Math.round(cw * 2)), nh = Math.min(th, Math.round(ch * 2));
        const nx = document.createElement('canvas');
        nx.width = nw; nx.height = nh;
        const nctx = nx.getContext('2d', { willReadFrequently: true });
        nctx.imageSmoothingEnabled = true; nctx.imageSmoothingQuality = 'high';
        nctx.drawImage(cur, 0, 0, cw, ch, 0, 0, nw, nh);
        cur.width = cur.height = 0;
        cur = nx; ctx = nctx; cw = nw; ch = nh;
        prog(0.3 + 0.2 * (++step / 2), 'Memperbesar');
        await tick();
      }

      if (o.hdSharp > 0) {
        prog(0.55, 'Menajamkan');
        const radius = Math.max(1, Math.min(3, Math.round(cw / w * 0.7)));
        await hdSharpen(ctx, cw, ch, o.hdSharp / 100 * 1.6, radius);
      }

      prog(0.9, 'Menyimpan');
      const blob = await canvasToBlob(cur, mime, o.convQuality);
      if (blob.type && blob.type !== mime) throw new Error('Browser ini belum mendukung ekspor ke format ' + ext.toUpperCase() + '. Coba format lain.');
      cur.width = cur.height = 0;
      images.push({ name: `${baseOf(files[i].name)}-hd.${ext}`, blob });
      await tick();
    }
    const r = await packImages(images, ext, 'hd');
    if (limited) r.info += ' · diperbesar semaksimal 16 megapiksel';
    return r;
  }

  /* ---------------------------------------------------------
     Hapus Latar: model AI (@imgly/background-removal) dimuat saat dibutuhkan.
     Model diunduh sekali dari internet, lalu disimpan service worker.
  --------------------------------------------------------- */
  const BG_LIB_URLS = [
    'https://cdn.jsdelivr.net/npm/@imgly/background-removal@1.5.5/+esm',
    'https://cdn.jsdelivr.net/npm/@imgly/background-removal@1.4.5/+esm'
  ];
  let bgFn = null;
  async function loadBgLib() {
    if (bgFn) return bgFn;
    for (const u of BG_LIB_URLS) {
      try {
        const m = await import(u);
        const fn = m.removeBackground || m.default;
        if (typeof fn === 'function') { bgFn = fn; return fn; }
      } catch (_) { /* coba alamat berikutnya */ }
    }
    throw new Error('Pustaka hapus latar belum termuat. Fitur ini butuh internet saat pertama kali dipakai. Periksa koneksi lalu coba lagi.');
  }

  async function buildRemoveBg(o) {
    await need('jszip');
    setProgress(0.02, 'Memuat pustaka AI…');
    const removeBackground = await loadBgLib();
    const files = state.files;
    const images = [];
    const MAXS = 2560;

    for (let i = 0; i < files.length; i++) {
      checkCancel();
      const base = i / files.length, span = 1 / files.length;
      setProgress(base, `Menyiapkan ${files[i].name} (${i + 1}/${files.length})`);
      const bmp = await loadBitmap(files[i].file);
      const { w, h } = bmpSize(bmp);
      const sc = Math.min(1, MAXS / Math.max(w, h));
      const c = document.createElement('canvas');
      c.width = Math.max(1, Math.round(w * sc)); c.height = Math.max(1, Math.round(h * sc));
      const ctx = c.getContext('2d');
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(bmp, 0, 0, c.width, c.height);
      if (bmp.close) bmp.close();
      const srcBlob = await canvasToBlob(c, 'image/png');

      let outBlob;
      try {
        outBlob = await removeBackground(srcBlob, {
          progress: (key, cur, tot) => {
            const f = tot ? Math.min(1, cur / tot) : 0;
            const isFetch = String(key).startsWith('fetch');
            setProgress(base + span * (isFetch ? 0.05 + 0.6 * f : 0.7 + 0.2 * f),
              isFetch ? `Mengunduh model AI (hanya pertama kali) ${Math.round(f * 100)}%` : `Menghapus latar ${files[i].name}`);
          }
        });
      } catch (err) {
        if (err && err.cancelled) throw err;
        throw new Error('Gagal menghapus latar. Pastikan internet aktif saat pertama kali memakai fitur ini. (' + (err && err.message ? err.message : 'kesalahan tidak diketahui') + ')');
      }
      checkCancel();

      if (o.rbBg !== 'transparent') {
        const fg = await createImageBitmap(outBlob);
        ctx.clearRect(0, 0, c.width, c.height);
        c.width = fg.width; c.height = fg.height;
        ctx.fillStyle = o.rbBg === 'white' ? '#ffffff' : '#000000';
        ctx.fillRect(0, 0, c.width, c.height);
        ctx.drawImage(fg, 0, 0);
        if (fg.close) fg.close();
        outBlob = await canvasToBlob(c, 'image/png');
      }
      c.width = c.height = 0;
      images.push({ name: `${baseOf(files[i].name)}-tanpa-latar.png`, blob: outBlob });
      await tick();
    }
    return await packImages(images, 'png', 'tanpa-latar');
  }

  /* ---------------------------------------------------------
     Restore Foto: perbaikan otomatis (tanpa AI) — warna, bintik, noise, ketajaman
  --------------------------------------------------------- */
  // hapus bintik/debu kecil: piksel yang sangat berbeda dari rata-rata sekitarnya diganti median 3x3
  async function rsScratch(ctx, w, h) {
    const img = ctx.getImageData(0, 0, w, h), d = img.data;
    const mean = await hdBoxBlur(d, w, h, 1, 1);
    const T = 38, buf = [new Array(9), new Array(9), new Array(9)];
    const lum = (a, i) => a[i] * 0.299 + a[i + 1] * 0.587 + a[i + 2] * 0.114;
    const out = new Uint8ClampedArray(d);
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const i = (y * w + x) * 4;
        if (Math.abs(lum(d, i) - lum(mean, i)) <= T) continue;
        let n = 0;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          const k = ((y + dy) * w + (x + dx)) * 4;
          buf[0][n] = d[k]; buf[1][n] = d[k + 1]; buf[2][n] = d[k + 2]; n++;
        }
        for (let c = 0; c < 3; c++) { buf[c].sort((p, q) => p - q); out[i + c] = buf[c][4]; }
      }
      if (y % 64 === 0) { checkCancel(); await tick(); }
    }
    img.data.set(out);
    ctx.putImageData(img, 0, 0);
  }

  // warna & kontras otomatis: regangkan tiap kanal warna, atur kecerahan, naikkan saturasi bila pudar
  async function rsColor(ctx, w, h) {
    const img = ctx.getImageData(0, 0, w, h), d = img.data;
    const hist = [new Uint32Array(256), new Uint32Array(256), new Uint32Array(256)];
    const step = Math.max(1, Math.floor(w * h / 2e6)) * 4;
    let cnt = 0;
    for (let i = 0; i < d.length; i += step) { hist[0][d[i]]++; hist[1][d[i + 1]]++; hist[2][d[i + 2]]++; cnt++; }
    const pct = (hs, p) => { let s = 0; const t = cnt * p; for (let v = 0; v < 256; v++) { s += hs[v]; if (s >= t) return v; } return 255; };
    const lut = [];
    for (let c = 0; c < 3; c++) {
      let lo = pct(hist[c], 0.005), hi = pct(hist[c], 0.995);
      if (hi - lo < 40) { lo = Math.max(0, lo - 20); hi = Math.min(255, hi + 20); }   // jangan terlalu agresif
      const t = new Uint8ClampedArray(256);
      for (let v = 0; v < 256; v++) { const s = Math.min(1, Math.max(0, (v - lo) / (hi - lo))) * 255; t[v] = v * 0.2 + s * 0.8; }
      lut.push(t);
    }
    // kecerahan rata-rata setelah regangan -> gamma lembut
    let sumL = 0, sumS = 0, n2 = 0;
    for (let i = 0; i < d.length; i += step) {
      const r = lut[0][d[i]], g = lut[1][d[i + 1]], b = lut[2][d[i + 2]];
      sumL += (r * 0.299 + g * 0.587 + b * 0.114) / 255;
      const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
      sumS += mx ? (mx - mn) / mx : 0; n2++;
    }
    const meanL = Math.min(0.8, Math.max(0.15, sumL / n2)), meanS = sumS / n2;
    const gamma = Math.min(1.35, Math.max(0.75, Math.log(0.46) / Math.log(meanL)));
    const sat = meanS < 0.12 ? 1.3 : meanS < 0.25 ? 1.12 : 1.0;
    const gl = new Uint8ClampedArray(256);
    for (let v = 0; v < 256; v++) gl[v] = Math.pow(v / 255, gamma) * 255;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        let r = gl[lut[0][d[i]]], g = gl[lut[1][d[i + 1]]], b = gl[lut[2][d[i + 2]]];
        if (sat !== 1) { const l = r * 0.299 + g * 0.587 + b * 0.114; r = l + (r - l) * sat; g = l + (g - l) * sat; b = l + (b - l) * sat; }
        d[i] = r; d[i + 1] = g; d[i + 2] = b;
      }
      if (y % 64 === 0) { checkCancel(); await tick(); }
    }
    ctx.putImageData(img, 0, 0);
  }

  async function buildRestoreImages(o) {
    await need('jszip');
    const mime = 'image/' + o.convFormat;
    const ext = o.convFormat === 'jpeg' ? 'jpg' : o.convFormat;
    const files = state.files;
    const images = [];
    let limited = false;
    for (let i = 0; i < files.length; i++) {
      checkCancel();
      const label = `${files[i].name} (${i + 1}/${files.length})`;
      const prog = (f, t) => setProgress((i + f) / files.length, `${t} ${label}`);
      prog(0, 'Membaca');
      const bmp = await loadBitmap(files[i].file);
      let { w, h } = bmpSize(bmp);
      let sc = 1;
      if (w * h > HD_MAX_PIXELS) { sc = Math.sqrt(HD_MAX_PIXELS / (w * h)); limited = true; }
      w = Math.max(1, Math.round(w * sc)); h = Math.max(1, Math.round(h * sc));
      const c = document.createElement('canvas');
      c.width = w; c.height = h;
      const ctx = c.getContext('2d', { willReadFrequently: true });
      if (o.convFormat === 'jpeg') { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h); }
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(bmp, 0, 0, w, h);
      if (bmp.close) bmp.close();

      if (o.rsScratch) { prog(0.1, 'Menghapus bintik'); await rsScratch(ctx, w, h); }
      if (o.rsDenoise) { prog(0.35, 'Menghaluskan noise'); await hdDenoise(ctx, w, h); }
      if (o.rsColor) { prog(0.55, 'Memperbaiki warna'); await rsColor(ctx, w, h); }
      if (o.rsSharp > 0) { prog(0.75, 'Menajamkan'); await hdSharpen(ctx, w, h, o.rsSharp / 100 * 1.2, 1); }

      prog(0.92, 'Menyimpan');
      const blob = await canvasToBlob(c, mime, o.convQuality);
      if (blob.type && blob.type !== mime) throw new Error('Browser ini belum mendukung ekspor ke format ' + ext.toUpperCase() + '. Coba format lain.');
      c.width = c.height = 0;
      images.push({ name: `${baseOf(files[i].name)}-restore.${ext}`, blob });
      await tick();
    }
    const r = await packImages(images, ext, 'restore');
    if (limited) r.info += ' · foto besar dikecilkan ke maksimal 16 megapiksel';
    return r;
  }

  async function packImages(images, ext, label) {
    const total = images.reduce((s, i) => s + i.blob.size, 0);
    if (images.length === 1) {
      return { kind: 'images', blob: images[0].blob, ext, images, info: `1 gambar · ${fmtSize(total)}` };
    }
    setProgress(0.9, 'Mengemas ke dalam ZIP…');
    await tick();
    const zip = new JSZip();
    const used = new Set();
    images.forEach(im => {
      let n = im.name, k = 1;
      while (used.has(n.toLowerCase())) { k++; n = im.name.replace(/(\.[^.]+)$/, `-${k}$1`); }
      used.add(n.toLowerCase());
      im.name = n;
      zip.file(n, im.blob);
    });
    const blob = await zip.generateAsync({ type: 'blob', compression: 'STORE' }, md => setProgress(0.9 + md.percent / 1000, 'Mengemas ke dalam ZIP…'));
    return { kind: 'images', blob, ext: 'zip', images, info: `${images.length} gambar dalam ZIP · ${fmtSize(blob.size)}` };
  }

  /* ---------------------------------------------------------
     BUILDER 6: PDF → Teks
  --------------------------------------------------------- */
  async function buildPdfToText() {
    await need('pdfjs');
    const files = state.files;
    let out = '';
    let pagesTotal = 0;
    for (let fi = 0; fi < files.length; fi++) {
      checkCancel();
      const f = files[fi];
      let pdf;
      try { pdf = await pdfjsLib.getDocument({ data: new Uint8Array(await f.file.arrayBuffer()) }).promise; }
      catch (e) { throw new Error(`Tidak dapat membuka "${f.name}".`); }
      if (files.length > 1) out += `\n===== ${f.name} =====\n\n`;
      for (let p = 1; p <= pdf.numPages; p++) {
        checkCancel();
        setProgress((fi + p / pdf.numPages) / files.length, `${f.name} — halaman ${p}/${pdf.numPages}`);
        const page = await pdf.getPage(p);
        const tc = await page.getTextContent();
        let line = '';
        tc.items.forEach(it => { line += it.str + (it.hasEOL ? '\n' : ' '); });
        out += `--- Halaman ${p} ---\n${line.replace(/[ \t]+\n/g, '\n').trim()}\n\n`;
        page.cleanup();
        pagesTotal++;
        if (p % 10 === 0) await tick();
      }
      pdf.destroy();
    }
    out = out.trim() + '\n';
    const hasText = out.replace(/--- Halaman \d+ ---|=====.*=====/g, '').trim().length > 0;
    if (!hasText) throw new Error('Tidak ada teks yang ditemukan. PDF ini kemungkinan hasil scan (berupa gambar).');
    const blob = new Blob([out], { type: 'text/plain;charset=utf-8' });
    return { kind: 'text', blob, ext: 'txt', text: out, info: `${pagesTotal} halaman · ${fmtSize(blob.size)}` };
  }

  /* ---------------------------------------------------------
     Eksekusi konversi
  --------------------------------------------------------- */
  function setBusyUI(b) {
    $('#previewBtn').disabled = $('#downloadBtn').disabled = b || state.files.length === 0;
  }

  async function ensureResult() {
    if (state.result) return state.result;
    if (!state.files.length) { toast('Tambahkan file terlebih dahulu.', 'warn'); return null; }
    if (state.busy) return null;
    state.busy = true; state.cancel = false;
    setBusyUI(true);
    showProgress('Mengonversi ' + TOOLS[state.tool].name);
    try {
      const o = getOpts();
      let r;
      switch (state.tool) {
        case 'img2pdf': r = await buildImagesPdf(o); break;
        case 'pdf2img': r = await buildPdfToImages(o); break;
        case 'imgconv': r = await buildConvertImages(o); break;
        case 'imghd': r = await buildHdImages(o); break;
        case 'removebg': r = await buildRemoveBg(o); break;
        case 'restore': r = await buildRestoreImages(o); break;
        case 'mergepdf': r = await buildMergePdf(o); break;
        case 'txt2pdf': r = await buildTextPdf(o); break;
        case 'pdf2txt': r = await buildPdfToText(); break;
      }
      setProgress(1, 'Selesai');
      state.result = r;
      $('#resultInfo').textContent = 'Siap diunduh — ' + r.info;
      $('#resultBar').hidden = false;
      updateSuffix();
      return r;
    } catch (err) {
      if (err && err.cancelled) toast('Proses dibatalkan.', 'warn');
      else { console.error(err); toast(err.message || 'Terjadi kesalahan saat konversi.', 'error', 6000); }
      return null;
    } finally {
      hideProgress();
      state.busy = false;
      setBusyUI(false);
    }
  }

  function saveBlob(blob, name) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }

  async function doDownload() {
    const r = await ensureResult();
    if (!r) return;
    const name = `${getBase()}.${r.ext}`;
    saveBlob(r.blob, name);
    toast('Mengunduh ' + name, 'ok');
  }
  $('#downloadBtn').addEventListener('click', doDownload);
  $('#pvDownload').addEventListener('click', doDownload);

  /* ---------------------------------------------------------
     Preview
  --------------------------------------------------------- */
  function resetPreview() {
    const pv = state.pv;
    pv.token++;
    if (pv.io) { pv.io.disconnect(); pv.io = null; }
    if (pv.pdf) { try { pv.pdf.destroy(); } catch (e) { /* abaikan */ } pv.pdf = null; }
    pv.urls.forEach(u => URL.revokeObjectURL(u));
    pv.urls = [];
    $('#pvBody').replaceChildren();
  }

  async function openPreview() {
    const r = await ensureResult();
    if (!r) return;
    resetPreview();
    const token = state.pv.token;
    const body = $('#pvBody');
    $('#pvTitle').textContent = `Preview — ${getBase()}.${r.ext}`;
    $('#pvMeta').textContent = r.info;
    openDialog(previewDlg);
    body.scrollTop = 0;

    try {
      if (r.kind === 'pdf') await previewPdf(r.blob, body, token);
      else if (r.kind === 'images') previewImages(r.images, body);
      else if (r.kind === 'text') {
        const pre = document.createElement('pre');
        pre.className = 'pv-text';
        pre.textContent = r.text.length > 300000 ? r.text.slice(0, 300000) + '\n\n… (preview dipotong, file lengkap ada di hasil download)' : r.text;
        body.appendChild(pre);
      }
    } catch (err) {
      console.error(err);
      body.innerHTML = '<p class="muted" style="text-align:center;padding:30px">Preview tidak dapat ditampilkan, tetapi file hasil tetap bisa diunduh.</p>';
    }
  }
  $('#previewBtn').addEventListener('click', openPreview);
  $('#pvClose').addEventListener('click', () => closeDialog(previewDlg));
  previewDlg.addEventListener('click', e => { if (e.target === previewDlg) closeDialog(previewDlg); });
  previewDlg.addEventListener('close', () => { resetPreview(); document.body.classList.remove('no-scroll'); });

  async function previewPdf(blob, body, token) {
    await need('pdfjs');
    const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(await blob.arrayBuffer()) }).promise;
    if (token !== state.pv.token) { pdf.destroy(); return; }
    state.pv.pdf = pdf;
    const first = await pdf.getPage(1);
    const v1 = first.getViewport({ scale: 1 });
    const wrap = document.createElement('div');
    wrap.className = 'pv-pages';
    body.appendChild(wrap);

    const renderPage = async fig => {
      const n = +fig.dataset.n;
      if (token !== state.pv.token) return;
      const page = await pdf.getPage(n);
      if (token !== state.pv.token) return;
      const base = page.getViewport({ scale: 1 });
      const target = Math.min(Math.max(body.clientWidth - 40, 280), 900);
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      const vp = page.getViewport({ scale: (target / base.width) * dpr });
      const c = document.createElement('canvas');
      c.width = Math.floor(vp.width); c.height = Math.floor(vp.height);
      const ctx = c.getContext('2d');
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
      await page.render({ canvasContext: ctx, viewport: vp }).promise;
      if (token !== state.pv.token) return;
      const holder = fig.querySelector('.pv-canvas');
      holder.style.aspectRatio = `${base.width} / ${base.height}`;
      holder.replaceChildren(c);
    };

    const io = new IntersectionObserver(entries => {
      entries.forEach(en => { if (en.isIntersecting) { io.unobserve(en.target); renderPage(en.target); } });
    }, { root: body, rootMargin: '500px 0px' });
    state.pv.io = io;

    for (let n = 1; n <= pdf.numPages; n++) {
      const fig = document.createElement('figure');
      fig.className = 'pv-page';
      fig.dataset.n = n;
      fig.innerHTML = `<div class="pv-canvas" style="aspect-ratio:${v1.width} / ${v1.height}"><div class="pv-loading">Memuat halaman ${n}…</div></div><figcaption>Halaman ${n} / ${pdf.numPages}</figcaption>`;
      wrap.appendChild(fig);
      io.observe(fig);
    }
  }

  function previewImages(images, body) {
    const grid = document.createElement('div');
    grid.className = 'pv-grid';
    images.forEach(im => {
      const url = URL.createObjectURL(im.blob);
      state.pv.urls.push(url);
      const fig = document.createElement('figure');
      fig.innerHTML = `<div class="pv-img"><img loading="lazy" decoding="async" alt="" src="${url}"></div><figcaption title="${esc(im.name)}">${esc(im.name)} · ${fmtSize(im.blob.size)}</figcaption>`;
      grid.appendChild(fig);
    });
    body.appendChild(grid);
  }

  /* ---------------------------------------------------------
     Init
  --------------------------------------------------------- */
  renderList();
})();
