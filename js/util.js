// Funções utilitárias compartilhadas (telas e PDFs)

export const esc = (v) =>
  String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const brl = (n) => (Number(n) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

// Aceita "1.234,50", "1234,50" e "1234.50"
export const num = (v) => {
  if (typeof v === 'number') return isFinite(v) ? v : 0;
  let s = String(v ?? '').trim().replace(/[^\d.,-]/g, '');
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  const n = parseFloat(s);
  return isNaN(n) ? 0 : n;
};

// Valor para exibir dentro de campos de texto (vírgula decimal)
export const fmtIn = (n) => (n === 0 || n === '' || n == null ? '' : String(n).replace('.', ','));

export const pad = (n, size = 4) => String(n ?? 0).padStart(size, '0');

// Identificação no padrão ORC-2026-0001 / OS-2026-0001
export const docLabel = (prefix, d) => `${prefix}-${d.year || new Date().getFullYear()}-${pad(d.number)}`;

export const today = () => {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
};

export const fmtDate = (iso) => (iso ? iso.split('-').reverse().join('/') : '');

export const addDays = (iso, days) => {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(y, m - 1, d + Number(days || 0));
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
};

// Subtotal, desconto e total de um orçamento/OS
export const calc = (d) => {
  const sub = (d.items || []).reduce((s, i) => s + num(i.qty) * num(i.price), 0);
  const v = num(d.discountValue);
  const disc = d.discountType === 'pct' ? (sub * Math.min(v, 100)) / 100 : Math.min(v, sub);
  return { sub, disc, total: Math.max(sub - disc, 0) };
};

export const clientSnapshot = (c) => ({
  name: c.name,
  phone: c.phone || '',
  email: c.email || '',
  doc: c.doc || '',
  address: c.address || '',
});

export const PAYMENT_METHODS = ['Dinheiro', 'PIX', 'Cartão de débito', 'Cartão de crédito', 'Transferência', 'Boleto', 'A combinar'];
export const EQUIP_TYPES = ['Notebook', 'Desktop', 'All-in-one', 'Placa/Componente', 'Outro'];

export const QUOTE_STATUS = { aberto: 'Em aberto', aprovado: 'Aprovado', recusado: 'Recusado', convertido: 'Convertido em OS' };
export const ORDER_STATUS = {
  aberta: 'Aberta',
  andamento: 'Em andamento',
  aguardando: 'Aguardando peça/cliente',
  concluida: 'Concluída',
  entregue: 'Entregue',
  cancelada: 'Cancelada',
};
export const PAY_STATUS = { pendente: 'Pendente', parcial: 'Parcial', pago: 'Pago' };

export const whatsappLink = (phone, text) => {
  let p = String(phone || '').replace(/\D/g, '');
  if (p && p.length <= 11) p = '55' + p;
  return `https://wa.me/${p}?text=${encodeURIComponent(text)}`;
};
