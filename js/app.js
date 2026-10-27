import * as DB from './db.js';
import { quotePdf, orderPdf } from './pdf.js';
import {
  esc, brl, num, fmtIn, today, fmtDate, calc, docLabel, clientSnapshot, whatsappLink,
  PAYMENT_METHODS, EQUIP_TYPES, QUOTE_STATUS, ORDER_STATUS, PAY_STATUS,
} from './util.js';

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const view = () => $('#view');

let settings = null;
let pendingClientId = null; // cliente pré-selecionado ao abrir "novo orçamento/OS" pela lista de clientes

// ---------- helpers de interface ----------
function toast(msg, isErr = false) {
  const t = $('#toast');
  t.textContent = msg;
  t.className = 'show' + (isErr ? ' err' : '');
  clearTimeout(toast.t);
  toast.t = setTimeout(() => (t.className = ''), 2800);
}

function modal(html) {
  const m = $('#modal');
  m.innerHTML = html;
  if (!m.open) m.showModal();
  return m;
}
const closeModal = () => $('#modal').close();

const badge = (text, kind = '') => `<span class="badge ${kind}">${esc(text)}</span>`;
const quoteBadge = (s) => badge(QUOTE_STATUS[s] || s, { aprovado: 'ok', recusado: 'bad', convertido: 'info' }[s] || 'warn');
const orderBadge = (s) =>
  badge(ORDER_STATUS[s] || s, { concluida: 'ok', entregue: 'ok', cancelada: 'bad', andamento: 'info' }[s] || 'warn');
const payBadge = (s) => badge(PAY_STATUS[s] || s, { pago: 'ok', parcial: 'warn', pendente: 'bad' }[s] || '');

const clabel = (c) => c.name + (c.phone ? ' — ' + c.phone : '');
const company = () => ({ ...settings.company, terms: settings.terms });
const sortNewest = (a, b) => (b.updatedAt || 0) - (a.updatedAt || 0);

const options = (obj, sel) =>
  Object.entries(obj).map(([k, v]) => `<option value="${k}" ${k === sel ? 'selected' : ''}>${esc(v)}</option>`).join('');
const optionsList = (arr, sel) =>
  arr.map((v) => `<option ${v === sel ? 'selected' : ''}>${esc(v)}</option>`).join('');

// ---------- roteamento ----------
const routes = [
  [/^#\/?$/, dashboard],
  [/^#\/clientes$/, clientsView],
  [/^#\/orcamentos$/, quotesList],
  [/^#\/orcamento\/([\w-]+)$/, quoteForm],
  [/^#\/os$/, ordersList],
  [/^#\/os\/([\w-]+)$/, orderForm],
  [/^#\/config$/, configView],
];

async function render() {
  const hash = location.hash || '#/';
  const route = routes.find(([re]) => re.test(hash)) || routes[0];
  const nav = hash.startsWith('#/clientes') ? 'clientes' : hash.startsWith('#/orcamento') ? 'orcamentos'
    : hash.startsWith('#/os') ? 'os' : hash.startsWith('#/config') ? 'config' : 'dashboard';
  $$('.nav a').forEach((a) => a.classList.toggle('active', a.dataset.nav === nav));
  view().innerHTML = '<p class="muted">Carregando…</p>';
  try {
    settings = await DB.getSettings();
    await route[1](hash.match(route[0]).slice(1));
    window.scrollTo(0, 0);
  } catch (e) {
    console.error(e);
    view().innerHTML = `<div class="card"><h2>Algo deu errado</h2><p class="error">${esc(e.message)}</p></div>`;
  }
}

// ---------- início ----------
async function dashboard() {
  const [quotes, orders] = await Promise.all([DB.list('quotes'), DB.list('orders')]);
  const month = today().slice(0, 7);
  const openQuotes = quotes.filter((q) => q.status === 'aberto');
  const active = orders.filter((o) => ['aberta', 'andamento', 'aguardando'].includes(o.status));
  const receivable = orders.filter((o) => o.status !== 'cancelada')
    .reduce((s, o) => s + Math.max(calc(o).total - num(o.amountPaid), 0), 0);
  const received = orders.filter((o) => (o.paymentDate || o.entryDate || '').startsWith(month))
    .reduce((s, o) => s + num(o.amountPaid), 0);

  const recentOrders = [...orders].sort(sortNewest).slice(0, 5);
  const recentQuotes = [...quotes].sort(sortNewest).slice(0, 5);

  view().innerHTML = `
    <div class="page-head"><div><h1>${esc(settings.company.name)}</h1><p class="muted">Resumo do atendimento</p></div>
      <div class="actions"><a class="btn primary" href="#/orcamento/new">+ Orçamento</a><a class="btn" href="#/os/new">+ Ordem de serviço</a></div></div>
    <div class="stats">
      <div class="stat"><span class="muted">Orçamentos em aberto</span><b>${openQuotes.length}</b></div>
      <div class="stat"><span class="muted">OS em andamento</span><b>${active.length}</b></div>
      <div class="stat"><span class="muted">A receber</span><b>${brl(receivable)}</b></div>
      <div class="stat"><span class="muted">Recebido no mês</span><b>${brl(received)}</b></div>
    </div>
    <div class="grid">
      <div class="card c6"><h2>Últimas ordens de serviço</h2>${miniList(recentOrders, 'os', 'OS', orderBadge)}</div>
      <div class="card c6"><h2>Últimos orçamentos</h2>${miniList(recentQuotes, 'orcamento', 'ORC', quoteBadge)}</div>
    </div>`;
}

function miniList(items, route, prefix, badgeFn) {
  if (!items.length) return '<p class="muted">Nada por aqui ainda.</p>';
  return `<table><tbody>${items.map((d) => `<tr>
    <td><a href="#/${route}/${d.id}"><b>${docLabel(prefix, d)}</b></a><br><span class="muted">${esc(d.client?.name)}</span></td>
    <td class="num">${brl(calc(d).total)}<br>${badgeFn(d.status)}</td></tr>`).join('')}</tbody></table>`;
}

// ---------- clientes ----------
async function clientsView() {
  const clients = (await DB.list('clients')).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  view().innerHTML = `
    <div class="page-head"><h1>Clientes</h1><div class="actions"><button class="btn primary" id="newClient">+ Novo cliente</button></div></div>
    <div class="card"><input id="q" type="search" placeholder="Pesquisar por nome, telefone ou CPF/CNPJ…" aria-label="Pesquisar clientes">
    <div class="table-wrap" style="margin-top:.75rem"><table class="responsive"><thead><tr><th>Nome</th><th>Telefone</th><th>CPF/CNPJ</th><th></th></tr></thead><tbody id="rows"></tbody></table></div></div>`;
  const draw = () => {
    const q = $('#q').value.trim().toLowerCase();
    const list = clients.filter((c) => !q || [c.name, c.phone, c.doc, c.email].join(' ').toLowerCase().includes(q));
    $('#rows').innerHTML = list.length
      ? list.map((c) => `<tr data-id="${c.id}">
        <td data-label="Nome"><b>${esc(c.name)}</b></td><td data-label="Telefone">${esc(c.phone) || '—'}</td><td data-label="CPF/CNPJ">${esc(c.doc) || '—'}</td>
        <td class="actions"><button class="btn sm" data-act="edit">Editar</button><button class="btn sm" data-act="quote">Orçamento</button><button class="btn sm" data-act="os">OS</button><button class="btn sm danger" data-act="del">Excluir</button></td></tr>`).join('')
      : '<tr><td colspan="4" class="empty">Nenhum cliente encontrado.</td></tr>';
  };
  draw();
  $('#q').addEventListener('input', draw);
  $('#newClient').onclick = () => clientModal(null, () => clientsView());
  $('#rows').addEventListener('click', async (e) => {
    const btn = e.target.closest('button[data-act]');
    if (!btn) return;
    const c = clients.find((x) => x.id === btn.closest('tr').dataset.id);
    if (btn.dataset.act === 'edit') clientModal(c, () => clientsView());
    if (btn.dataset.act === 'quote') { pendingClientId = c.id; location.hash = '#/orcamento/new'; }
    if (btn.dataset.act === 'os') { pendingClientId = c.id; location.hash = '#/os/new'; }
    if (btn.dataset.act === 'del' && confirm(`Excluir o cliente "${c.name}"?\nOs orçamentos e OS já criados são mantidos.`)) {
      await DB.remove('clients', c.id);
      toast('Cliente excluído');
      clientsView();
    }
  });
}

function clientModal(c, onSaved) {
  const d = c || {};
  const m = modal(`<form id="cf" class="grid" method="dialog">
    <h2 style="grid-column:span 12">${c ? 'Editar' : 'Novo'} cliente</h2>
    <label class="c12">Nome *<input name="name" value="${esc(d.name)}" required></label>
    <label class="c6">Telefone / WhatsApp<input name="phone" inputmode="tel" value="${esc(d.phone)}"></label>
    <label class="c6">CPF/CNPJ<input name="doc" value="${esc(d.doc)}"></label>
    <label class="c12" style="grid-column:span 12">E-mail<input name="email" type="email" value="${esc(d.email)}"></label>
    <label style="grid-column:span 12">Endereço<input name="address" value="${esc(d.address)}"></label>
    <label style="grid-column:span 12">Observações<textarea name="notes">${esc(d.notes)}</textarea></label>
    <div style="grid-column:span 12;display:flex;gap:.5rem;justify-content:flex-end">
      <button type="button" class="btn" id="cancel">Cancelar</button><button class="btn primary" type="submit">Salvar</button></div></form>`);
  $('#cancel', m).onclick = closeModal;
  $('#cf', m).onsubmit = async (e) => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.target));
    const saved = await DB.save('clients', { ...d, ...f, name: f.name.trim() });
    closeModal();
    toast('Cliente salvo');
    onSaved?.(saved);
  };
}

// ---------- componentes compartilhados (orçamento e OS) ----------
function clientPicker(d, clients) {
  return `<label>Cliente *
    <div class="row"><input id="clientInput" list="clientList" placeholder="Digite para pesquisar…" autocomplete="off" value="${esc(d.client ? clabel(d.client) : '')}">
    <button type="button" class="btn" id="newClientBtn">+ Novo</button></div></label>
    <datalist id="clientList">${clients.map((c) => `<option value="${esc(clabel(c))}"></option>`).join('')}</datalist>`;
}

function bindClientPicker(d, clients) {
  const input = $('#clientInput');
  input.addEventListener('change', () => {
    const c = clients.find((x) => clabel(x) === input.value) || clients.find((x) => x.name.toLowerCase() === input.value.trim().toLowerCase());
    if (c) { d.clientId = c.id; d.client = clientSnapshot(c); input.value = clabel(c); }
    else { d.clientId = null; d.client = null; }
  });
  $('#newClientBtn').onclick = () =>
    clientModal(null, (c) => {
      clients.push(c);
      $('#clientList').insertAdjacentHTML('beforeend', `<option value="${esc(clabel(c))}"></option>`);
      d.clientId = c.id; d.client = clientSnapshot(c); input.value = clabel(c);
    });
}

function itemsSection(d) {
  return `<div class="card"><h2>Itens</h2>
    <div class="table-wrap"><table class="items responsive"><thead><tr><th>Descrição</th><th>Tipo</th><th>Qtd.</th><th>Valor unit.</th><th class="num">Subtotal</th><th></th></tr></thead><tbody id="itemsBody"></tbody></table></div>
    <div class="row" style="margin-top:.5rem;flex-wrap:wrap">
      <button type="button" class="btn" id="addItem">+ Item em branco</button>
      <select id="preset" style="max-width:360px" aria-label="Adicionar do catálogo"><option value="">+ Adicionar do catálogo de serviços…</option>
        ${settings.catalog.map((c, i) => `<option value="${i}">${esc(c.desc)} — ${brl(c.price)}</option>`).join('')}</select></div>
    <div class="totals">
      <div><span>Subtotal</span><span id="tSub"></span></div>
      <div class="discount"><label style="flex:1">Desconto<div class="discount">
        <select id="discType"><option value="val" ${d.discountType !== 'pct' ? 'selected' : ''}>R$</option><option value="pct" ${d.discountType === 'pct' ? 'selected' : ''}>%</option></select>
        <input id="discValue" inputmode="decimal" value="${fmtIn(num(d.discountValue))}" placeholder="0"></div></label></div>
      <div><span>Desconto aplicado</span><span id="tDisc"></span></div>
      <div class="grand"><span>Total</span><span id="tTotal"></span></div></div></div>`;
}

function bindItems(d) {
  const body = $('#itemsBody');
  const totals = () => {
    const t = calc(d);
    $('#tSub').textContent = brl(t.sub);
    $('#tDisc').textContent = '− ' + brl(t.disc);
    $('#tTotal').textContent = brl(t.total);
  };
  const draw = () => {
    body.innerHTML = d.items.length
      ? d.items.map((it, i) => `<tr data-i="${i}">
        <td data-label="Descrição"><input class="it-desc" value="${esc(it.desc)}" placeholder="Ex.: Formatação com backup" aria-label="Descrição"></td>
        <td data-label="Tipo"><select class="it-kind" aria-label="Tipo"><option value="servico" ${it.kind !== 'peca' ? 'selected' : ''}>Serviço</option><option value="peca" ${it.kind === 'peca' ? 'selected' : ''}>Peça/Produto</option></select></td>
        <td data-label="Qtd."><input class="it-qty" inputmode="decimal" value="${fmtIn(num(it.qty))}" aria-label="Quantidade"></td>
        <td data-label="Valor unit."><input class="it-price" inputmode="decimal" value="${fmtIn(num(it.price))}" placeholder="0,00" aria-label="Valor unitário"></td>
        <td data-label="Subtotal" class="it-sub">${brl(num(it.qty) * num(it.price))}</td>
        <td><button type="button" class="icon-btn del-item" aria-label="Remover item">✕</button></td></tr>`).join('')
      : '<tr><td colspan="6" class="empty">Nenhum item ainda. Adicione abaixo.</td></tr>';
  };
  body.addEventListener('input', (e) => {
    const tr = e.target.closest('tr[data-i]');
    if (!tr) return;
    const it = d.items[tr.dataset.i];
    if (e.target.classList.contains('it-desc')) it.desc = e.target.value;
    if (e.target.classList.contains('it-kind')) it.kind = e.target.value;
    if (e.target.classList.contains('it-qty')) it.qty = num(e.target.value);
    if (e.target.classList.contains('it-price')) it.price = num(e.target.value);
    $('.it-sub', tr).textContent = brl(num(it.qty) * num(it.price));
    totals();
  });
  body.addEventListener('click', (e) => {
    const b = e.target.closest('.del-item');
    if (!b) return;
    d.items.splice(b.closest('tr').dataset.i, 1);
    draw(); totals();
  });
  $('#addItem').onclick = () => { d.items.push({ desc: '', kind: 'servico', qty: 1, price: 0 }); draw(); totals(); body.querySelector('tr:last-child .it-desc')?.focus(); };
  $('#preset').onchange = (e) => {
    if (e.target.value === '') return;
    const c = settings.catalog[e.target.value];
    d.items.push({ desc: c.desc, kind: c.kind || 'servico', qty: 1, price: num(c.price) });
    e.target.value = '';
    draw(); totals();
  };
  $('#discType').onchange = (e) => { d.discountType = e.target.value; totals(); };
  $('#discValue').oninput = (e) => { d.discountValue = num(e.target.value); totals(); };
  draw(); totals();
}

// Lê os campos simples do formulário (name="...") para o objeto
function readFields(d) {
  $$('[data-f]').forEach((el) => {
    d[el.dataset.f] = el.type === 'checkbox' ? el.checked : el.value;
  });
}
const f = (name, value, extra = '') => `data-f="${name}" value="${esc(value)}" ${extra}`;

function validate(d) {
  if (!d.clientId || !d.client) return 'Selecione um cliente cadastrado (ou clique em "+ Novo").';
  d.items = (d.items || []).filter((i) => String(i.desc).trim());
  if (!d.items.length) return 'Adicione pelo menos um item com descrição.';
  return null;
}

function equipmentSection(d) {
  return `<div class="card"><h2>Equipamento</h2><div class="grid">
    <label class="c4">Tipo<select data-f="eqType">${optionsList(EQUIP_TYPES, d.eqType)}</select></label>
    <label class="c4">Marca / modelo<input ${f('eqModel', d.eqModel, 'placeholder="Ex.: Dell Inspiron 15"')}></label>
    <label class="c4">Nº de série<input ${f('eqSerial', d.eqSerial)}></label></div></div>`;
}

function waText(kind, d) {
  const t = calc(d);
  const lines = d.items.map((i) => `• ${i.desc} (${String(num(i.qty)).replace('.', ',')}x) — ${brl(num(i.qty) * num(i.price))}`);
  const head = kind === 'quote'
    ? `Olá ${d.client.name}! Segue o orçamento ${docLabel('ORC', d)} da ${settings.company.name}:`
    : `Olá ${d.client.name}! Seu equipamento está com a situação "${ORDER_STATUS[d.status]}" (${docLabel('OS', d)}) na ${settings.company.name}:`;
  const tail = [`*Total: ${brl(t.total)}*`];
  if (kind === 'order' && settings.company.pix) tail.push(`Chave PIX: ${settings.company.pix}`);
  return [head, '', ...lines, '', ...tail].join('\n');
}

// ---------- orçamentos ----------
async function quotesList() {
  const quotes = (await DB.list('quotes')).sort(sortNewest);
  view().innerHTML = `
    <div class="page-head"><h1>Orçamentos</h1><div class="actions"><a class="btn primary" href="#/orcamento/new">+ Novo orçamento</a></div></div>
    <div class="card"><div class="row"><input id="q" type="search" placeholder="Pesquisar por cliente ou número…" aria-label="Pesquisar">
    <select id="st" style="max-width:200px" aria-label="Filtrar por situação"><option value="">Todas as situações</option>${options(QUOTE_STATUS)}</select></div>
    <div class="table-wrap" style="margin-top:.75rem"><table class="responsive"><thead><tr><th>Nº</th><th>Data</th><th>Cliente</th><th class="num">Total</th><th>Situação</th><th></th></tr></thead><tbody id="rows"></tbody></table></div></div>`;
  const draw = () => {
    const q = $('#q').value.trim().toLowerCase(), st = $('#st').value;
    const list = quotes.filter((x) => (!st || x.status === st) && (!q || (docLabel('ORC', x) + ' ' + (x.client?.name || '')).toLowerCase().includes(q)));
    $('#rows').innerHTML = list.length ? list.map((x) => `<tr data-id="${x.id}">
      <td data-label="Nº"><a href="#/orcamento/${x.id}"><b>${docLabel('ORC', x)}</b></a></td><td data-label="Data">${fmtDate(x.date)}</td>
      <td data-label="Cliente">${esc(x.client?.name)}</td><td data-label="Total" class="num">${brl(calc(x).total)}</td><td data-label="Situação">${quoteBadge(x.status)}</td>
      <td class="actions"><a class="btn sm" href="#/orcamento/${x.id}">Abrir</a><button class="btn sm" data-act="pdf">PDF</button><button class="btn sm danger" data-act="del">Excluir</button></td></tr>`).join('')
      : '<tr><td colspan="6" class="empty">Nenhum orçamento encontrado.</td></tr>';
  };
  draw();
  $('#q').oninput = draw; $('#st').onchange = draw;
  $('#rows').addEventListener('click', async (e) => {
    const b = e.target.closest('button[data-act]');
    if (!b) return;
    const x = quotes.find((z) => z.id === b.closest('tr').dataset.id);
    if (b.dataset.act === 'pdf') quotePdf(x, company());
    if (b.dataset.act === 'del' && confirm(`Excluir o orçamento ${docLabel('ORC', x)}?`)) { await DB.remove('quotes', x.id); toast('Orçamento excluído'); quotesList(); }
  });
}

async function quoteForm([id]) {
  const clients = (await DB.list('clients')).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  let d;
  if (id === 'new') {
    d = {
      year: new Date().getFullYear(), date: today(), validityDays: settings.quoteValidityDays, warrantyDays: settings.warrantyDays,
      status: 'aberto', eqType: EQUIP_TYPES[0], items: [{ desc: '', kind: 'servico', qty: 1, price: 0 }], discountType: 'val', discountValue: 0,
    };
    const pre = clients.find((c) => c.id === pendingClientId);
    pendingClientId = null;
    if (pre) { d.clientId = pre.id; d.client = clientSnapshot(pre); }
  } else {
    d = await DB.get('quotes', id);
    if (!d) { view().innerHTML = '<div class="card">Orçamento não encontrado. <a href="#/orcamentos">Voltar</a></div>'; return; }
  }
  const locked = d.status === 'convertido';
  view().innerHTML = `
    <div class="page-head"><div><h1>${d.number ? 'Orçamento ' + docLabel('ORC', d) : 'Novo orçamento'}</h1>
      ${locked ? `<p class="muted">Convertido em OS — <a href="#/os/${d.orderId}">abrir ordem de serviço</a></p>` : ''}</div>
      <div class="actions"><a class="btn" href="#/orcamentos">← Voltar</a></div></div>
    <div class="card"><div class="grid">
      <div class="c8">${clientPicker(d, clients)}</div>
      <label class="c4">Situação<select data-f="status" ${locked ? 'disabled' : ''}>${options(QUOTE_STATUS, d.status)}</select></label>
      <label class="c3">Data<input type="date" ${f('date', d.date)}></label>
      <label class="c3">Validade (dias)<input type="number" min="0" ${f('validityDays', d.validityDays)}></label>
      <label class="c3">Garantia (dias)<input type="number" min="0" ${f('warrantyDays', d.warrantyDays)}></label>
      <label class="c3">Prazo de execução<input ${f('deadline', d.deadline, 'placeholder="Ex.: 1 dia útil"')}></label>
    </div></div>
    ${equipmentSection(d)}
    ${itemsSection(d)}
    <div class="card"><div class="grid">
      <label class="c4">Forma de pagamento<select data-f="paymentMethod"><option value="">—</option>${optionsList(PAYMENT_METHODS, d.paymentMethod)}</select></label>
      <label class="c8">Observações<textarea data-f="notes" placeholder="Informações adicionais para o cliente">${esc(d.notes)}</textarea></label></div></div>
    <div class="form-actions">
      <button class="btn primary" id="save">Salvar</button>
      <button class="btn" id="pdf">Gerar PDF</button>
      <button class="btn" id="wa">WhatsApp</button>
      ${!locked && d.id ? '<button class="btn" id="convert">Converter em OS</button>' : ''}</div>`;
  bindClientPicker(d, clients);
  bindItems(d);

  const persist = async () => {
    readFields(d);
    d.validityDays = num(d.validityDays); d.warrantyDays = num(d.warrantyDays);
    const err = validate(d);
    if (err) { toast(err, true); return null; }
    if (!d.number) d.number = await DB.nextNumber('quotes', d.year);
    Object.assign(d, await DB.save('quotes', d));
    return d;
  };
  $('#save').onclick = async () => {
    const wasNew = !d.id;
    if (await persist()) { toast('Orçamento salvo'); if (wasNew) location.hash = `#/orcamento/${d.id}`; else $('.page-head h1').textContent = 'Orçamento ' + docLabel('ORC', d); }
  };
  $('#pdf').onclick = async () => { if (await persist()) quotePdf(d, company()); };
  $('#wa').onclick = async () => {
    if (!(await persist())) return;
    if (!d.client.phone) return toast('Este cliente não tem telefone cadastrado.', true);
    window.open(whatsappLink(d.client.phone, waText('quote', d)), '_blank', 'noopener');
  };
  $('#convert')?.addEventListener('click', async () => {
    if (!(await persist())) return;
    if (!confirm(`Converter o orçamento ${docLabel('ORC', d)} em ordem de serviço?`)) return;
    const year = new Date().getFullYear();
    const order = await DB.save('orders', {
      year, number: await DB.nextNumber('orders', year),
      quoteId: d.id, quoteNumber: docLabel('ORC', d),
      clientId: d.clientId, client: d.client,
      eqType: d.eqType, eqModel: d.eqModel, eqSerial: d.eqSerial,
      items: JSON.parse(JSON.stringify(d.items)), discountType: d.discountType, discountValue: d.discountValue,
      entryDate: today(), status: 'aberta', paymentMethod: d.paymentMethod || '', paymentStatus: 'pendente', amountPaid: 0,
      warrantyDays: d.warrantyDays, problem: '', serviceDone: '', accessories: '', notes: d.notes || '',
    });
    await DB.save('quotes', { ...d, status: 'convertido', orderId: order.id });
    toast('Ordem de serviço criada a partir do orçamento');
    location.hash = `#/os/${order.id}`;
  });
}

// ---------- ordens de serviço ----------
async function ordersList() {
  const orders = (await DB.list('orders')).sort(sortNewest);
  view().innerHTML = `
    <div class="page-head"><h1>Ordens de serviço</h1><div class="actions"><a class="btn primary" href="#/os/new">+ Nova OS</a></div></div>
    <div class="card"><div class="row"><input id="q" type="search" placeholder="Pesquisar por cliente, equipamento ou número…" aria-label="Pesquisar">
    <select id="st" style="max-width:220px" aria-label="Filtrar por situação"><option value="">Todas as situações</option>${options(ORDER_STATUS)}</select></div>
    <div class="table-wrap" style="margin-top:.75rem"><table class="responsive"><thead><tr><th>Nº</th><th>Entrada</th><th>Cliente</th><th>Equipamento</th><th class="num">Total</th><th>Situação</th><th>Pagamento</th><th></th></tr></thead><tbody id="rows"></tbody></table></div></div>`;
  const draw = () => {
    const q = $('#q').value.trim().toLowerCase(), st = $('#st').value;
    const list = orders.filter((x) => (!st || x.status === st) &&
      (!q || (docLabel('OS', x) + ' ' + (x.client?.name || '') + ' ' + (x.eqModel || '')).toLowerCase().includes(q)));
    $('#rows').innerHTML = list.length ? list.map((x) => `<tr data-id="${x.id}">
      <td data-label="Nº"><a href="#/os/${x.id}"><b>${docLabel('OS', x)}</b></a></td><td data-label="Entrada">${fmtDate(x.entryDate)}</td>
      <td data-label="Cliente">${esc(x.client?.name)}</td><td data-label="Equipamento">${esc([x.eqType, x.eqModel].filter(Boolean).join(' ')) || '—'}</td>
      <td data-label="Total" class="num">${brl(calc(x).total)}</td><td data-label="Situação">${orderBadge(x.status)}</td><td data-label="Pagamento">${payBadge(x.paymentStatus)}</td>
      <td class="actions"><a class="btn sm" href="#/os/${x.id}">Abrir</a><button class="btn sm" data-act="pdf">PDF</button><button class="btn sm danger" data-act="del">Excluir</button></td></tr>`).join('')
      : '<tr><td colspan="8" class="empty">Nenhuma ordem de serviço encontrada.</td></tr>';
  };
  draw();
  $('#q').oninput = draw; $('#st').onchange = draw;
  $('#rows').addEventListener('click', async (e) => {
    const b = e.target.closest('button[data-act]');
    if (!b) return;
    const x = orders.find((z) => z.id === b.closest('tr').dataset.id);
    if (b.dataset.act === 'pdf') orderPdf(x, company());
    if (b.dataset.act === 'del' && confirm(`Excluir a OS ${docLabel('OS', x)}?`)) { await DB.remove('orders', x.id); toast('OS excluída'); ordersList(); }
  });
}

async function orderForm([id]) {
  const clients = (await DB.list('clients')).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  let d;
  if (id === 'new') {
    d = {
      year: new Date().getFullYear(), entryDate: today(), status: 'aberta', eqType: EQUIP_TYPES[0], warrantyDays: settings.warrantyDays,
      items: [{ desc: '', kind: 'servico', qty: 1, price: 0 }], discountType: 'val', discountValue: 0, paymentStatus: 'pendente', amountPaid: 0,
    };
    const pre = clients.find((c) => c.id === pendingClientId);
    pendingClientId = null;
    if (pre) { d.clientId = pre.id; d.client = clientSnapshot(pre); }
  } else {
    d = await DB.get('orders', id);
    if (!d) { view().innerHTML = '<div class="card">OS não encontrada. <a href="#/os">Voltar</a></div>'; return; }
  }
  view().innerHTML = `
    <div class="page-head"><div><h1>${d.number ? docLabel('OS', d) : 'Nova ordem de serviço'}</h1>
      ${d.quoteId ? `<p class="muted">Origem: orçamento <a href="#/orcamento/${d.quoteId}">${esc(d.quoteNumber)}</a></p>` : ''}</div>
      <div class="actions"><a class="btn" href="#/os">← Voltar</a></div></div>
    <div class="card"><div class="grid">
      <div class="c8">${clientPicker(d, clients)}</div>
      <label class="c4">Situação<select data-f="status">${options(ORDER_STATUS, d.status)}</select></label>
      <label class="c3">Data de entrada<input type="date" ${f('entryDate', d.entryDate)}></label>
      <label class="c3">Data de entrega<input type="date" ${f('deliveryDate', d.deliveryDate)}></label>
      <label class="c3">Garantia (dias)<input type="number" min="0" ${f('warrantyDays', d.warrantyDays)}></label>
    </div></div>
    ${equipmentSection(d)}
    <div class="card"><div class="grid">
      <label class="c12" style="grid-column:span 12">Acessórios recebidos<input ${f('accessories', d.accessories, 'placeholder="Ex.: carregador, mochila"')}></label>
      <label class="c6">Problema relatado<textarea data-f="problem">${esc(d.problem)}</textarea></label>
      <label class="c6">Serviço realizado<textarea data-f="serviceDone" placeholder="Descreva o que foi feito no equipamento">${esc(d.serviceDone)}</textarea></label></div></div>
    ${itemsSection(d)}
    <div class="card"><h2>Pagamento</h2><div class="grid">
      <label class="c3">Forma de pagamento<select data-f="paymentMethod"><option value="">—</option>${optionsList(PAYMENT_METHODS, d.paymentMethod)}</select></label>
      <label class="c3">Situação<select data-f="paymentStatus">${options(PAY_STATUS, d.paymentStatus)}</select></label>
      <label class="c3">Valor pago (R$)<input inputmode="decimal" ${f('amountPaid', fmtIn(num(d.amountPaid)), 'placeholder="0,00"')}></label>
      <label class="c3">Data do pagamento<input type="date" ${f('paymentDate', d.paymentDate)}></label>
      <label style="grid-column:span 12">Observações internas / para o cliente<textarea data-f="notes">${esc(d.notes)}</textarea></label></div></div>
    <div class="form-actions">
      <button class="btn primary" id="save">Salvar</button>
      <button class="btn" id="pdf">Gerar PDF</button>
      <button class="btn" id="wa">WhatsApp</button>
      <button class="btn" id="paid">Marcar como pago</button></div>`;
  bindClientPicker(d, clients);
  bindItems(d);

  const persist = async () => {
    readFields(d);
    d.warrantyDays = num(d.warrantyDays); d.amountPaid = num(d.amountPaid);
    const err = validate(d);
    if (err) { toast(err, true); return null; }
    if (!d.number) d.number = await DB.nextNumber('orders', d.year);
    Object.assign(d, await DB.save('orders', d));
    return d;
  };
  $('#save').onclick = async () => {
    const wasNew = !d.id;
    if (await persist()) { toast('OS salva'); if (wasNew) location.hash = `#/os/${d.id}`; else $('.page-head h1').textContent = docLabel('OS', d); }
  };
  $('#pdf').onclick = async () => { if (await persist()) orderPdf(d, company()); };
  $('#wa').onclick = async () => {
    if (!(await persist())) return;
    if (!d.client.phone) return toast('Este cliente não tem telefone cadastrado.', true);
    window.open(whatsappLink(d.client.phone, waText('order', d)), '_blank', 'noopener');
  };
  $('#paid').onclick = () => {
    $('[data-f="paymentStatus"]').value = 'pago';
    $('[data-f="amountPaid"]').value = fmtIn(calc(d).total);
    if (!$('[data-f="paymentDate"]').value) $('[data-f="paymentDate"]').value = today();
    toast('Pagamento preenchido — clique em Salvar');
  };
}

// ---------- configurações ----------
async function configView() {
  const s = settings, c = s.company;
  const catalogText = s.catalog.map((i) => `${i.desc} | ${i.kind === 'peca' ? 'peca' : 'servico'} | ${fmtIn(i.price) || '0'}`).join('\n');
  view().innerHTML = `
    <div class="page-head"><h1>Configurações</h1></div>
    <form id="cfg">
    <div class="card"><h2>Dados da empresa (cabeçalho dos PDFs)</h2><div class="grid">
      <label class="c6">Nome<input name="name" value="${esc(c.name)}" required></label>
      <label class="c6">CPF/CNPJ<input name="doc" value="${esc(c.doc)}"></label>
      <label class="c4">Telefone / WhatsApp<input name="phone" value="${esc(c.phone)}"></label>
      <label class="c4">E-mail<input name="email" type="email" value="${esc(c.email)}"></label>
      <label class="c4">Chave PIX<input name="pix" value="${esc(c.pix)}"></label>
      <label style="grid-column:span 12">Endereço<input name="address" value="${esc(c.address)}"></label></div></div>
    <div class="card"><h2>Padrões</h2><div class="grid">
      <label class="c6">Validade do orçamento (dias)<input name="quoteValidityDays" type="number" min="0" value="${esc(s.quoteValidityDays)}"></label>
      <label class="c6">Garantia padrão (dias)<input name="warrantyDays" type="number" min="0" value="${esc(s.warrantyDays)}"></label>
      <label style="grid-column:span 12">Termo impresso na ordem de serviço<textarea name="terms" style="min-height:110px">${esc(s.terms)}</textarea></label></div></div>
    <div class="card"><h2>Catálogo de serviços</h2>
      <p class="muted">Uma linha por serviço, no formato: <code>Descrição | servico ou peca | preço</code>. Os valores iniciais são apenas exemplos — ajuste aos seus preços.</p>
      <textarea name="catalog" style="min-height:200px;font-family:ui-monospace,monospace;font-size:.85rem">${esc(catalogText)}</textarea></div>
    <div class="form-actions"><button class="btn primary" type="submit">Salvar configurações</button></div></form>
    <div class="card"><h2>Backup</h2>
      <p class="muted">Modo atual: <b>${DB.usingFirebase ? 'Firebase (nuvem)' : 'Local (dados apenas neste navegador)'}</b>. ${DB.usingFirebase ? '' : 'Faça backups com frequência: limpar os dados do navegador apaga tudo.'}</p>
      <div class="row" style="flex-wrap:wrap"><button class="btn" id="export">Exportar backup (.json)</button>
      <label class="btn" style="cursor:pointer">Importar backup<input type="file" id="import" accept="application/json" hidden></label></div></div>`;
  $('#cfg').onsubmit = async (e) => {
    e.preventDefault();
    const fd = Object.fromEntries(new FormData(e.target));
    const catalog = fd.catalog.split('\n').map((l) => l.trim()).filter(Boolean).map((l) => {
      const [desc, kind, price] = l.split('|').map((x) => x.trim());
      return { desc, kind: /^pe/i.test(kind || '') ? 'peca' : 'servico', price: num(price) };
    }).filter((i) => i.desc);
    await DB.saveSettings({
      company: { name: fd.name.trim(), doc: fd.doc, phone: fd.phone, email: fd.email, address: fd.address, pix: fd.pix },
      quoteValidityDays: num(fd.quoteValidityDays), warrantyDays: num(fd.warrantyDays), terms: fd.terms, catalog,
    });
    toast('Configurações salvas');
  };
  $('#export').onclick = async () => {
    const blob = new Blob([JSON.stringify(await DB.exportAll(), null, 2)], { type: 'application/json' });
    const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: `backup-os-${today()}.json` });
    a.click();
    URL.revokeObjectURL(a.href);
  };
  $('#import').onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      await DB.importAll(JSON.parse(await file.text()));
      toast('Backup importado');
      configView();
    } catch (err) { toast('Não foi possível importar: ' + err.message, true); }
  };
}

// ---------- inicialização ----------
async function boot() {
  try {
    await DB.init();
  } catch (e) {
    document.body.innerHTML = `<p style="padding:1rem">Erro ao iniciar o Firebase: ${esc(e.message)}. Verifique js/firebase-config.js.</p>`;
    return;
  }
  $('#logoutBtn').onclick = () => DB.logout();
  $('#loginForm').onsubmit = async (e) => {
    e.preventDefault();
    $('#loginError').textContent = '';
    try { await DB.login($('#loginEmail').value, $('#loginPass').value); }
    catch { $('#loginError').textContent = 'E-mail ou senha incorretos.'; }
  };
  DB.onAuth((user) => {
    $('#login').hidden = !!user;
    $('#app').hidden = !user;
    $('#logoutBtn').hidden = !DB.usingFirebase;
    if (user) render();
  });
  window.addEventListener('hashchange', () => { if (!$('#app').hidden) render(); });
}
boot();
