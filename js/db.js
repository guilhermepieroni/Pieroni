// Camada de dados: Firebase (Auth + Firestore) quando configurado, senão localStorage.
// As telas só usam as funções exportadas aqui, então trocar de modo não exige mudar nada.
import { firebaseConfig } from './firebase-config.js';

export const usingFirebase = Boolean(firebaseConfig.apiKey && firebaseConfig.projectId);

const FB_VERSION = '10.14.1';
let fb = null;
let uid = null;

export const newId = () =>
  (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2, 10));

export async function init() {
  if (!usingFirebase) return;
  const base = `https://www.gstatic.com/firebasejs/${FB_VERSION}`;
  const [appM, authM, fsM] = await Promise.all([
    import(`${base}/firebase-app.js`),
    import(`${base}/firebase-auth.js`),
    import(`${base}/firebase-firestore.js`),
  ]);
  const app = appM.initializeApp(firebaseConfig);
  fb = { auth: authM.getAuth(app), db: fsM.getFirestore(app), authM, fsM };
}

export function onAuth(cb) {
  if (!usingFirebase) return cb({ local: true });
  fb.authM.onAuthStateChanged(fb.auth, (u) => {
    uid = u ? u.uid : null;
    cb(u);
  });
}

export const login = (email, pass) => fb.authM.signInWithEmailAndPassword(fb.auth, email, pass);
export const logout = () => fb.authM.signOut(fb.auth);

// ---------- coleções: clients, quotes, orders ----------
const lsGet = (k, fallback) => {
  try {
    return JSON.parse(localStorage.getItem(k)) ?? fallback;
  } catch {
    return fallback;
  }
};
const lsSet = (k, v) => localStorage.setItem(k, JSON.stringify(v));

export async function list(col) {
  if (!usingFirebase) return lsGet('os:' + col, []);
  const { collection, getDocs } = fb.fsM;
  const snap = await getDocs(collection(fb.db, 'users', uid, col));
  return snap.docs.map((d) => ({ ...d.data(), id: d.id }));
}

export async function get(col, id) {
  if (!usingFirebase) return lsGet('os:' + col, []).find((x) => x.id === id) || null;
  const { doc, getDoc } = fb.fsM;
  const s = await getDoc(doc(fb.db, 'users', uid, col, id));
  return s.exists() ? { ...s.data(), id: s.id } : null;
}

export async function save(col, obj) {
  const now = Date.now();
  const item = { ...obj, id: obj.id || newId(), createdAt: obj.createdAt || now, updatedAt: now };
  if (!usingFirebase) {
    const all = lsGet('os:' + col, []);
    const i = all.findIndex((x) => x.id === item.id);
    if (i >= 0) all[i] = item;
    else all.push(item);
    lsSet('os:' + col, all);
    return item;
  }
  const { doc, setDoc } = fb.fsM;
  await setDoc(doc(fb.db, 'users', uid, col, item.id), item);
  return item;
}

export async function remove(col, id) {
  if (!usingFirebase) {
    lsSet('os:' + col, lsGet('os:' + col, []).filter((x) => x.id !== id));
    return;
  }
  const { doc, deleteDoc } = fb.fsM;
  await deleteDoc(doc(fb.db, 'users', uid, col, id));
}

// Numeração sequencial que reinicia a cada ano (ORC-2026-0001, ORC-2026-0002...)
export async function nextNumber(col, year) {
  const all = await list(col);
  return all.filter((x) => x.year === year).reduce((m, x) => Math.max(m, Number(x.number) || 0), 0) + 1;
}

// ---------- configurações da empresa ----------
export const DEFAULT_SETTINGS = {
  company: { name: 'Pieroni Informática', doc: '', phone: '', email: '', address: '', pix: '' },
  quoteValidityDays: 7,
  warrantyDays: 90,
  terms:
    'Garantia somente para o serviço executado e peças fornecidas, conforme prazo informado, salvo indicação diferente. ' +
    'Não cobre mau uso, quedas, líquidos, oxidação ou violação do lacre. ' +
    'Equipamentos não retirados em até 90 dias após o aviso de conclusão poderão ser cobrados por armazenamento. ' +
    'Recomenda-se que o cliente mantenha backup dos seus dados.',
  catalog: [
    { desc: 'Formatação com backup', kind: 'servico', price: 120 },
    { desc: 'Formatação sem backup', kind: 'servico', price: 80 },
    { desc: 'Limpeza interna preventiva', kind: 'servico', price: 90 },
    { desc: 'Troca de pasta térmica', kind: 'servico', price: 60 },
    { desc: 'Troca de bateria de notebook (mão de obra)', kind: 'servico', price: 50 },
    { desc: 'Troca de HD por SSD (mão de obra + clonagem)', kind: 'servico', price: 100 },
    { desc: 'Upgrade de memória RAM (mão de obra)', kind: 'servico', price: 50 },
    { desc: 'Instalação de programas', kind: 'servico', price: 40 },
  ],
};

export async function getSettings() {
  let s = null;
  if (!usingFirebase) s = lsGet('os:settings', null);
  else {
    const { doc, getDoc } = fb.fsM;
    const snap = await getDoc(doc(fb.db, 'users', uid, 'meta', 'settings'));
    s = snap.exists() ? snap.data() : null;
  }
  return { ...DEFAULT_SETTINGS, ...(s || {}), company: { ...DEFAULT_SETTINGS.company, ...((s || {}).company || {}) } };
}

export async function saveSettings(s) {
  if (!usingFirebase) return lsSet('os:settings', s);
  const { doc, setDoc } = fb.fsM;
  await setDoc(doc(fb.db, 'users', uid, 'meta', 'settings'), s);
}

// ---------- backup ----------
export async function exportAll() {
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    settings: await getSettings(),
    clients: await list('clients'),
    quotes: await list('quotes'),
    orders: await list('orders'),
  };
}

export async function importAll(data) {
  if (!data || typeof data !== 'object') throw new Error('Arquivo inválido');
  for (const col of ['clients', 'quotes', 'orders']) {
    for (const item of data[col] || []) await save(col, item);
  }
  if (data.settings) await saveSettings(data.settings);
}
