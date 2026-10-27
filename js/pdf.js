// Geração de PDF (jsPDF + autotable) no layout do modelo ORC-2026-0001:
// faixa azul-marinho no topo, dados do cliente, tabela de serviços, total, validade e garantia.
// quotePdf(orcamento, empresa) e orderPdf(os, empresa) baixam o arquivo direto.
import { brl, num, calc, fmtDate, addDays, docLabel, PAY_STATUS, ORDER_STATUS } from './util.js';

const NAVY = [18, 60, 105];
const HEAD_BG = [232, 240, 250];
const TEXT = [28, 37, 48];
const MUTED = [102, 112, 133];
const M = 42;

function newDoc() {
  if (!window.jspdf) throw new Error('A biblioteca de PDF ainda não carregou. Aguarde um instante e tente de novo.');
  return new window.jspdf.jsPDF({ unit: 'pt', format: 'a4' });
}

// Logo (img/logo.png, fundo transparente): carregada uma vez e guardada em cache.
let logo; // undefined = ainda não tentou; null = indisponível; objeto = pronta
async function loadLogo() {
  if (logo !== undefined) return;
  try {
    const blob = await (await fetch(new URL('../img/logo.png', import.meta.url))).blob();
    const data = await new Promise((res, rej) => {
      const r = new FileReader();
      r.onload = () => res(r.result);
      r.onerror = rej;
      r.readAsDataURL(blob);
    });
    const img = await new Promise((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = rej;
      i.src = data;
    });
    logo = { data, ratio: img.naturalWidth / img.naturalHeight };
  } catch {
    logo = null; // sem logo, o PDF usa o nome da empresa em texto
  }
}

// Cabeçalho claro (a logo tem traços azul-escuros), com faixa azul-marinho de acabamento.
function header(doc, co, title, code) {
  const W = doc.internal.pageSize.getWidth();
  const LH = 56; // altura da logo
  if (logo) {
    doc.addImage(logo.data, 'PNG', M, 20, LH * logo.ratio, LH);
  } else {
    doc.setTextColor(...NAVY).setFont('helvetica', 'bold').setFontSize(20).text((co.name || '').toUpperCase(), M, 54);
  }
  const sub = [co.doc, co.phone].filter(Boolean).join('  •  ');
  if (sub) doc.setTextColor(...MUTED).setFont('helvetica', 'normal').setFontSize(9).text(sub, M, 92);
  doc.setTextColor(...NAVY).setFont('helvetica', 'bold').setFontSize(16).text(title, W - M, 46, { align: 'right' });
  doc.setFontSize(9.5).text(code, W - M, 64, { align: 'right' });
  doc.setFillColor(...NAVY).rect(0, 104, W, 6, 'F');
  doc.setTextColor(...TEXT);
  return 138;
}

function ensure(doc, y, need) {
  if (y + need > doc.internal.pageSize.getHeight() - 50) {
    doc.addPage();
    return 50;
  }
  return y;
}

function field(doc, y, label, value, x = M, width) {
  const W = doc.internal.pageSize.getWidth();
  const lines = doc.splitTextToSize(String(value || '—'), width || W - M * 2);
  y = ensure(doc, y, 26 + lines.length * 12);
  doc.setFont('helvetica', 'bold').setFontSize(10).setTextColor(...TEXT).text(label, x, y);
  doc.setFont('helvetica', 'normal').text(lines, x, y + 14);
  return y + 14 + lines.length * 12 + 8;
}

function twoCols(doc, y, a, b) {
  const W = doc.internal.pageSize.getWidth();
  const half = (W - M * 2) / 2 - 10;
  const y1 = field(doc, y, a[0], a[1], M, half);
  const y2 = field(doc, y, b[0], b[1], M + half + 20, half);
  return Math.max(y1, y2);
}

function clientBlock(doc, y, c = {}) {
  y = field(doc, y, 'Cliente', c.name);
  y = twoCols(doc, y, ['Telefone', c.phone], ['CPF/CNPJ', c.doc]);
  return field(doc, y, 'Endereço', c.address);
}

function itemsTable(doc, y, items) {
  const body = (items || []).filter((i) => i.desc || num(i.price)).map((i) => [
    i.desc || '',
    String(num(i.qty)).replace('.', ','),
    brl(num(i.price)),
    brl(num(i.qty) * num(i.price)),
  ]);
  doc.autoTable({
    startY: y,
    head: [['Serviço / Peça', 'Qtd.', 'Unitário', 'Total']],
    body: body.length ? body : [['—', '', '', '']],
    margin: { left: M, right: M },
    theme: 'plain',
    styles: { fontSize: 9.5, cellPadding: 7, textColor: TEXT },
    headStyles: { fillColor: HEAD_BG, textColor: TEXT, fontStyle: 'bold' },
    columnStyles: { 1: { halign: 'right', cellWidth: 45 }, 2: { halign: 'right', cellWidth: 90 }, 3: { halign: 'right', cellWidth: 90 } },
    didParseCell: (d) => {
      if (d.section === 'head' && d.column.index > 0) d.cell.styles.halign = 'right';
    },
  });
  return doc.lastAutoTable.finalY + 16;
}

function totals(doc, y, data, extra = []) {
  const W = doc.internal.pageSize.getWidth();
  const { sub, disc, total } = calc(data);
  y = ensure(doc, y, 70 + extra.length * 15);
  doc.setFont('helvetica', 'normal').setFontSize(10).setTextColor(...MUTED);
  if (disc > 0) {
    doc.text(`Subtotal: ${brl(sub)}`, W - M, y, { align: 'right' });
    y += 15;
  }
  doc.text(`Desconto: ${brl(disc)}`, W - M, y, { align: 'right' });
  y += 24;
  doc.setFont('helvetica', 'bold').setFontSize(14).setTextColor(...TEXT).text(`TOTAL: ${brl(total)}`, W - M, y, { align: 'right' });
  y += 20;
  doc.setFont('helvetica', 'normal').setFontSize(10);
  for (const line of extra) {
    doc.text(line, W - M, y, { align: 'right' });
    y += 15;
  }
  return y + 14;
}

function footer(doc, co) {
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const n = doc.getNumberOfPages();
  for (let p = 1; p <= n; p++) {
    doc.setPage(p);
    doc.setFont('helvetica', 'normal').setFontSize(8).setTextColor(...MUTED);
    const extra = [co.address, co.email].filter(Boolean).join(' • ');
    doc.text(`${co.name} • Documento gerado pelo sistema${extra ? ' • ' + extra : ''}`, M, H - 28, { maxWidth: W - M * 2 - 50 });
    doc.text(`Página ${p}/${n}`, W - M, H - 28, { align: 'right' });
  }
}

const warrantyText = (days) =>
  num(days) > 0 ? `${num(days)} dias para o serviço executado, salvo indicação diferente.` : 'Sem garantia informada.';

const equipment = (d) => [d.eqType, d.eqModel].filter(Boolean).join(' — ');

// ----------------------- Orçamento -----------------------
export async function quotePdf(q, co) {
  await loadLogo();
  const doc = newDoc();
  const code = docLabel('ORC', q);
  let y = header(doc, co, 'ORÇAMENTO', code);
  doc.setFont('helvetica', 'bold').setFontSize(10).setTextColor(...TEXT).text(`Data: ${fmtDate(q.date)}`, M, y);
  y += 26;
  y = clientBlock(doc, y, q.client);
  if (equipment(q) || q.eqSerial) y = twoCols(doc, y, ['Equipamento', equipment(q)], ['Nº de série', q.eqSerial]);
  y = itemsTable(doc, y + 6, q.items);
  y = totals(doc, y, q);
  y = field(doc, y, 'Validade', q.date && q.validityDays != null ? fmtDate(addDays(q.date, q.validityDays)) : '');
  y = field(doc, y, 'Pagamento', q.paymentMethod);
  if (q.deadline) y = field(doc, y, 'Prazo de execução', q.deadline);
  y = field(doc, y, 'Garantia', warrantyText(q.warrantyDays));
  if (co.pix) y = field(doc, y, 'Chave PIX', co.pix);
  y = field(doc, y, 'Observações', q.notes);
  footer(doc, co);
  doc.save(`${code}.pdf`);
}

// ----------------------- Ordem de serviço -----------------------
export async function orderPdf(o, co) {
  await loadLogo();
  const doc = newDoc();
  const code = docLabel('OS', o);
  const W = doc.internal.pageSize.getWidth();
  let y = header(doc, co, 'ORDEM DE SERVIÇO', code);
  doc.setFont('helvetica', 'bold').setFontSize(10).setTextColor(...TEXT);
  doc.text(`Entrada: ${fmtDate(o.entryDate)}`, M, y);
  doc.text(`Situação: ${ORDER_STATUS[o.status] || ''}`, W / 2, y);
  if (o.deliveryDate) doc.text(`Entrega: ${fmtDate(o.deliveryDate)}`, W - M, y, { align: 'right' });
  y += 26;
  y = clientBlock(doc, y, o.client);
  y = twoCols(doc, y, ['Equipamento', equipment(o)], ['Nº de série', o.eqSerial]);
  if (o.accessories) y = field(doc, y, 'Acessórios recebidos', o.accessories);
  y = field(doc, y, 'Problema relatado', o.problem);
  y = field(doc, y, 'Serviço realizado', o.serviceDone);
  y = itemsTable(doc, y + 4, o.items);

  const { total } = calc(o);
  const paid = num(o.amountPaid);
  const extra = [`Forma de pagamento: ${o.paymentMethod || '—'}`];
  let situ = `Pagamento: ${PAY_STATUS[o.paymentStatus] || '—'}`;
  if (o.paymentStatus === 'parcial') situ += ` (pago ${brl(paid)} • saldo ${brl(Math.max(total - paid, 0))})`;
  else if (o.paymentStatus === 'pago' && o.paymentDate) situ += ` em ${fmtDate(o.paymentDate)}`;
  extra.push(situ);
  y = totals(doc, y, o, extra);

  y = field(doc, y, 'Garantia', warrantyText(o.warrantyDays));
  if (o.notes) y = field(doc, y, 'Observações', o.notes);

  if (co.terms) {
    doc.setFont('helvetica', 'normal').setFontSize(8).setTextColor(...MUTED);
    const lines = doc.splitTextToSize(co.terms, W - M * 2);
    y = ensure(doc, y, lines.length * 10 + 80);
    doc.text(lines, M, y);
    y += lines.length * 10 + 44;
  } else {
    y = ensure(doc, y + 20, 60);
  }
  doc.setDrawColor(...MUTED).setLineWidth(0.5);
  doc.line(M, y, M + 210, y);
  doc.line(W - M - 210, y, W - M, y);
  doc.setFontSize(9).setTextColor(...TEXT);
  doc.text('Assinatura do cliente', M, y + 13);
  doc.text(co.name || '', W - M - 210, y + 13);

  footer(doc, co);
  doc.save(`${code}.pdf`);
}
