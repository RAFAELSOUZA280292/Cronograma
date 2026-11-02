// Aba "Cofre" da empresa (§124): acessos (login e senha), certificado digital A1, arquivos, links e notas do projeto. Só equipe.
// A senha nunca vem na listagem: "Mostrar"/"Copiar" pedem ao servidor na hora (POST) e cada uso entra no Log da empresa.
// A senha mostrada some sozinha em 30 s e não fica em nenhum armazenamento do navegador.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Award, Copy, Download, ExternalLink, Eye, EyeOff, FileText, KeyRound, Link2, Lock, Pencil, Plus, StickyNote, Trash2 } from 'lucide-react';
import { apiDelete, apiGet, apiPatch, apiPost } from '../lib/api.js';
import { Modal } from '../ui/dialog.jsx';
import { Button, Callout, Chip, ChipRow, EmptyState, ErrorState, IconButton, Segmented, SkeletonCards } from '../ui/index.jsx';
import { askConfirm, notify } from '../ui/dialogs.jsx';

const KINDS = [
  { value: 'credential', label: 'Acesso', icon: KeyRound, hint: 'Login e senha de um sistema (X da Questão, e-CAC, portal da prefeitura, ERP).' },
  { value: 'certificate', label: 'Certificado', icon: Award, hint: 'Certificado digital A1 (.pfx ou .p12), com a senha, o titular e a validade.' },
  { value: 'file', label: 'Arquivo', icon: FileText, hint: 'Contrato, procuração, PDF de entrega, planilha (até 10 MB).' },
  { value: 'link', label: 'Link', icon: Link2, hint: 'Pasta do Drive/SharePoint, portal, documento on-line.' },
  { value: 'note', label: 'Nota', icon: StickyNote, hint: 'Informação de referência do projeto.' },
];
const KIND = Object.fromEntries(KINDS.map((k) => [k.value, k]));
const SECRET_TTL_MS = 30000;
const fdt = (ts) => { try { return new Date(ts).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }); } catch { return ''; } };
const fd = (iso) => (iso ? iso.split('-').reverse().join('/') : '');
const fsize = (b) => (b >= 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);
const norm = (v) => String(v || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const certTone = (c) => (!c ? null : c.state === 'vencido' ? 'var(--ui-danger)' : c.state === 'vence_em_breve' ? 'var(--ui-warn)' : 'var(--ui-ok)');
const certText = (c) => (!c ? '' : c.state === 'vencido' ? `vencido há ${-c.days} dia(s)` : c.days === 0 ? 'vence hoje' : `vence em ${c.days} dia(s)`);

const readBase64 = (file) => new Promise((resolve, reject) => {
  const r = new FileReader();
  r.onload = () => resolve(String(r.result).split(',')[1] || '');
  r.onerror = () => reject(new Error('Não foi possível ler o arquivo.'));
  r.readAsDataURL(file);
});

async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; } catch { return false; }
}

function SecretField({ projectId, item }) {
  const [shown, setShown] = useState(null);
  const [busy, setBusy] = useState(false);
  const timer = useRef(null);
  useEffect(() => () => clearTimeout(timer.current), []);
  const fetchSecret = async (purpose) => {
    setBusy(true);
    try { return (await apiPost(`/api/project-vault/${projectId}/${item.id}/reveal`, { purpose })).secret; } catch (e) { notify(e.message, { tone: 'error' }); return null; } finally { setBusy(false); }
  };
  const show = async () => {
    if (shown !== null) { setShown(null); clearTimeout(timer.current); return; }
    const s = await fetchSecret('show');
    if (s === null) return;
    setShown(s);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setShown(null), SECRET_TTL_MS);
  };
  const copy = async () => {
    const s = await fetchSecret('copy');
    if (s === null) return;
    if (await copyText(s)) { notify('Senha copiada. O uso ficou registrado no Log.'); return; }
    setShown(s);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setShown(null), SECRET_TTL_MS);
    notify('O navegador não deixou copiar; a senha está à vista por 30 segundos.');
  };
  if (!item.hasSecret) return <span style={st.muted}>sem senha guardada</span>;
  return (
    <span style={st.secret}>
      <code style={st.code} aria-live="polite">{shown !== null ? shown : '••••••••••'}</code>
      <Button size="sm" icon={shown !== null ? EyeOff : Eye} onClick={show} loading={busy && shown === null}>{shown !== null ? 'Ocultar' : 'Mostrar'}</Button>
      <Button size="sm" icon={Copy} onClick={copy} disabled={busy} disabledReason="Aguarde">Copiar</Button>
    </span>
  );
}

async function download(projectId, item) {
  try {
    const res = await fetch(`/api/project-vault/${projectId}/${item.id}/file`, { credentials: 'include' });
    if (!res.ok) { let m = 'Não foi possível baixar o arquivo.'; try { m = (await res.json()).message || m; } catch { /* sem corpo */ } throw new Error(m); }
    const url = URL.createObjectURL(await res.blob());
    const a = document.createElement('a');
    a.href = url; a.download = item.fileName || 'arquivo';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  } catch (e) { notify(e.message, { tone: 'error' }); }
}

function VaultCard({ projectId, item, onEdit, onDelete }) {
  const K = KIND[item.kind] || KIND.note;
  const Icon = K.icon;
  return (
    <div style={st.card}>
      <div style={st.cardHead}>
        <span style={st.kindIcon} title={K.label}><Icon size={16} /></span>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={st.title}>{item.title}</div>
          <div style={st.meta}>{K.label}{item.tags.length ? ` · ${item.tags.join(', ')}` : ''}</div>
        </div>
        <IconButton size="sm" label="Editar" icon={Pencil} onClick={() => onEdit(item)} />
        <IconButton size="sm" label="Excluir" icon={Trash2} onClick={() => onDelete(item)} />
      </div>
      <div style={st.body}>
        {item.url && <div style={st.row}><span style={st.lbl}>Endereço</span><a href={item.url} target="_blank" rel="noopener noreferrer" style={st.link}>{item.url.replace(/^https?:\/\//, '').replace(/\/$/, '')} <ExternalLink size={12} /></a></div>}
        {item.kind === 'credential' && (
          <div style={st.row}><span style={st.lbl}>Usuário</span><span style={st.val}>{item.username || '—'}</span>
            {item.username && <IconButton size="sm" label="Copiar usuário" icon={Copy} onClick={async () => notify((await copyText(item.username)) ? 'Usuário copiado.' : 'Não foi possível copiar.')} />}
          </div>
        )}
        {item.kind === 'certificate' && <>
          {item.certHolder && <div style={st.row}><span style={st.lbl}>Titular</span><span style={st.val}>{item.certHolder}</span></div>}
          <div style={st.row}><span style={st.lbl}>Validade</span>
            {item.certValidUntil ? <span style={st.val}>{fd(item.certValidUntil)} <span style={{ ...st.badge, color: certTone(item.cert), borderColor: certTone(item.cert) }}>{certText(item.cert)}</span></span> : <span style={st.muted}>não informada</span>}
          </div>
        </>}
        {(item.kind === 'credential' || item.kind === 'certificate') && <div style={st.row}><span style={st.lbl}>Senha</span><SecretField projectId={projectId} item={item} /></div>}
        {item.hasFile && <div style={st.row}><span style={st.lbl}>Arquivo</span><span style={st.val}>{item.fileName} · {fsize(item.fileSize)}</span><Button size="sm" icon={Download} onClick={() => download(projectId, item)}>Baixar</Button></div>}
        {item.notes && <div style={st.notes}>{item.notes}</div>}
      </div>
      <div style={st.foot}>Incluído por {item.createdBy || '—'} em {fdt(item.createdAt)}{item.updatedBy && item.updatedAt && item.updatedAt !== item.createdAt ? ` · alterado por ${item.updatedBy} em ${fdt(item.updatedAt)}` : ''}</div>
    </div>
  );
}

function VaultForm({ projectId, item, folders, onClose, onSaved }) {
  const isNew = !item;
  const [kind, setKind] = useState(item ? item.kind : 'credential');
  const [f, setF] = useState(() => ({
    title: item?.title || '', folder: item?.folder || '', tags: (item?.tags || []).join(', '), url: item?.url || '', username: item?.username || '',
    notes: item?.notes || '', certHolder: item?.certHolder || '', certValidUntil: item?.certValidUntil || '', secret: '',
  }));
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));
  const hasSecret = kind === 'credential' || kind === 'certificate';
  const hasFile = kind === 'file' || kind === 'certificate';
  const hasUrl = kind === 'credential' || kind === 'link';
  const save = async () => {
    setError('');
    if (!f.title.trim()) { setError('Dê um nome ao item.'); return; }
    if (isNew && kind === 'file' && !file) { setError('Escolha o arquivo.'); return; }
    setBusy(true);
    try {
      const body = { title: f.title, folder: f.folder, tags: f.tags, notes: f.notes };
      if (isNew) body.kind = kind;
      if (hasUrl) body.url = f.url;
      if (kind === 'credential') body.username = f.username;
      if (kind === 'certificate') { body.certHolder = f.certHolder; body.certValidUntil = f.certValidUntil; }
      if (hasSecret && f.secret) body.secret = f.secret;
      if (hasFile && file) { body.fileName = file.name; body.fileDataBase64 = await readBase64(file); }
      const r = isNew ? await apiPost(`/api/project-vault/${projectId}`, body) : await apiPatch(`/api/project-vault/${projectId}/${item.id}`, body);
      onSaved(r.item, isNew);
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  };
  const field = (label, el, help) => <label style={st.field}><span style={st.flabel}>{label}</span>{el}{help && <span style={st.help}>{help}</span>}</label>;
  return (
    <Modal title={isNew ? 'Incluir no cofre' : `Editar: ${item.title}`} subtitle={KIND[kind].hint} onClose={onClose} busy={busy} backdrop={false} error={error}
      footer={<><Button onClick={onClose} disabled={busy} disabledReason="Aguarde">Cancelar</Button><Button variant="primary" onClick={save} loading={busy}>Salvar</Button></>}>
      <div style={st.form}>
        {isNew && <Segmented label="Tipo de item" value={kind} onChange={(v) => { setKind(v); setFile(null); }} options={KINDS.map(({ value, label, icon }) => ({ value, label, icon }))} />}
        {field('Nome', <input className="ui-input" value={f.title} onChange={set('title')} maxLength={200} placeholder={kind === 'credential' ? 'Ex.: X da Questão' : kind === 'certificate' ? 'Ex.: e-CNPJ A1 KUHN' : 'Ex.: Contrato de prestação de serviços'} autoFocus />)}
        {hasUrl && field('Endereço', <input className="ui-input" value={f.url} onChange={set('url')} maxLength={2000} placeholder="https://" inputMode="url" />)}
        {kind === 'credential' && field('Usuário', <input className="ui-input" value={f.username} onChange={set('username')} maxLength={200} autoComplete="off" />)}
        {kind === 'certificate' && <div style={st.two}>
          {field('Titular', <input className="ui-input" value={f.certHolder} onChange={set('certHolder')} maxLength={200} placeholder="Razão social ou nome" />)}
          {field('Validade', <input className="ui-input" type="date" value={f.certValidUntil} onChange={set('certValidUntil')} />, 'Avisamos 30 dias antes de vencer.')}
        </div>}
        {hasSecret && field(kind === 'certificate' ? 'Senha do certificado' : 'Senha',
          <input className="ui-input" type="password" value={f.secret} onChange={set('secret')} maxLength={500} autoComplete="new-password" placeholder={!isNew && item.hasSecret ? 'Deixe em branco para manter a atual' : ''} />,
          'Guardada cifrada. Só aparece com "Mostrar" ou "Copiar", e cada uso fica no Log.')}
        {hasFile && field(kind === 'certificate' ? 'Arquivo do certificado (.pfx ou .p12)' : 'Arquivo',
          <input className="ui-input" type="file" accept={kind === 'certificate' ? '.pfx,.p12' : undefined} onChange={(e) => setFile(e.target.files && e.target.files[0] ? e.target.files[0] : null)} />,
          !isNew && item.hasFile ? `Atual: ${item.fileName}. Escolha outro só para substituir.` : kind === 'certificate' ? 'Até 1 MB, guardado cifrado.' : 'Até 10 MB, guardado cifrado. Maior que isso: inclua como link.')}
        <div style={st.two}>
          {field('Pasta', <><input className="ui-input" value={f.folder} onChange={set('folder')} maxLength={60} list="vault-folders" placeholder="Ex.: Acessos, Contratos" /><datalist id="vault-folders">{folders.map((x) => <option key={x} value={x} />)}</datalist></>)}
          {field('Etiquetas', <input className="ui-input" value={f.tags} onChange={set('tags')} placeholder="separe por vírgula" />)}
        </div>
        {field(kind === 'note' ? 'Texto' : 'Observação', <textarea className="ui-input" value={f.notes} onChange={set('notes')} maxLength={4000} rows={kind === 'note' ? 6 : 3} style={{ resize: 'vertical' }} />)}
      </div>
    </Modal>
  );
}

export default function ProjectVault({ projectId, companyName }) {
  const [items, setItems] = useState(null);
  const [error, setError] = useState('');
  const [q, setQ] = useState('');
  const [kind, setKind] = useState('');
  const [folder, setFolder] = useState('');
  const [editing, setEditing] = useState(undefined);
  const load = () => { setError(''); apiGet(`/api/project-vault/${projectId}`).then((r) => setItems(r.items)).catch((e) => setError(e.message)); };
  useEffect(() => { setItems(null); load(); }, [projectId]);

  const folders = useMemo(() => [...new Set((items || []).map((i) => i.folder).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR')), [items]);
  const shown = useMemo(() => {
    const t = norm(q).trim();
    return (items || []).filter((i) => (!kind || i.kind === kind) && (!folder || i.folder === folder)
      && (!t || norm([i.title, i.folder, i.url, i.username, i.notes, i.fileName, i.certHolder, ...i.tags].join(' ')).includes(t)));
  }, [items, q, kind, folder]);
  const groups = useMemo(() => {
    const m = new Map();
    for (const i of shown) { const k = i.folder || 'Sem pasta'; if (!m.has(k)) m.set(k, []); m.get(k).push(i); }
    return [...m.entries()].sort(([a], [b]) => (a === 'Sem pasta') - (b === 'Sem pasta') || a.localeCompare(b, 'pt-BR'));
  }, [shown]);
  const certAlerts = (items || []).filter((i) => i.cert && i.cert.state !== 'ok');

  const remove = async (item) => {
    if (!(await askConfirm({ title: 'Excluir do cofre?', message: `"${item.title}" sai do cofre desta empresa. A exclusão fica registrada no Log.`, confirmLabel: 'Excluir', danger: true }))) return;
    try { await apiDelete(`/api/project-vault/${projectId}/${item.id}`); setItems((xs) => xs.filter((x) => x.id !== item.id)); notify('Item excluído do cofre.'); } catch (e) { notify(e.message, { tone: 'error' }); }
  };
  const saved = (item, isNew) => {
    setItems((xs) => (isNew ? [...(xs || []), item] : (xs || []).map((x) => (x.id === item.id ? item : x))));
    setEditing(undefined);
    notify(isNew ? 'Incluído no cofre.' : 'Item atualizado.');
  };

  return (
    <div style={st.wrap}>
      <div style={st.head}>
        <div style={{ minWidth: 0 }}>
          <h2 style={st.h2}><Lock size={18} /> Cofre do projeto</h2>
          <div style={st.sub}>Acessos, certificado digital, contratos, procurações e entregas de {companyName || 'esta empresa'}. Só a equipe PRICETAX vê; o link do cliente não mostra o cofre. Senhas e arquivos ficam cifrados, e mostrar, copiar ou baixar fica registrado no Log.</div>
        </div>
        <Button variant="primary" icon={Plus} onClick={() => setEditing(null)}>Incluir</Button>
      </div>

      {certAlerts.map((i) => (
        <Callout key={i.id} tone={i.cert.state === 'vencido' ? 'danger' : 'warn'} icon={Award} title={`Certificado ${i.title}: ${certText(i.cert)}`}>
          Validade {fd(i.certValidUntil)}{i.certHolder ? ` · ${i.certHolder}` : ''}. Peça a renovação ao cliente e atualize o arquivo e a senha aqui.
        </Callout>
      ))}

      <div style={st.filters}>
        <input className="ui-input" style={{ flex: '1 1 220px', minWidth: 0 }} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar no cofre (nome, pasta, etiqueta, endereço)" aria-label="Buscar no cofre" />
        <ChipRow label="Tipo">
          <Chip active={!kind} onClick={() => setKind('')}>Todos</Chip>
          {KINDS.map((k) => <Chip key={k.value} icon={k.icon} active={kind === k.value} count={(items || []).filter((i) => i.kind === k.value).length} onClick={() => setKind(kind === k.value ? '' : k.value)}>{k.label}</Chip>)}
        </ChipRow>
        {folders.length > 0 && (
          <select className="ui-select" style={{ flex: '0 0 auto' }} value={folder} onChange={(e) => setFolder(e.target.value)} aria-label="Pasta">
            <option value="">Todas as pastas</option>
            {folders.map((x) => <option key={x} value={x}>{x}</option>)}
          </select>
        )}
      </div>

      {error && <ErrorState message={error} onRetry={load} />}
      {!error && items === null && <SkeletonCards count={3} />}
      {!error && items && items.length === 0 && (
        <EmptyState icon={Lock} title="O cofre desta empresa está vazio" description="Guarde aqui o login do X da Questão, o certificado digital, o contrato, as procurações e os PDFs de entrega.">
          <Button variant="primary" icon={Plus} onClick={() => setEditing(null)}>Incluir o primeiro item</Button>
        </EmptyState>
      )}
      {!error && items && items.length > 0 && shown.length === 0 && <EmptyState compact title="Nada encontrado" description="Mude a busca ou os filtros." />}
      {groups.map(([name, list]) => (
        <section key={name} style={{ marginTop: 18 }}>
          <h3 style={st.h3}>{name} <span style={st.count}>{list.length}</span></h3>
          <div style={st.grid}>{list.map((i) => <VaultCard key={i.id} projectId={projectId} item={i} onEdit={setEditing} onDelete={remove} />)}</div>
        </section>
      ))}

      {editing !== undefined && <VaultForm projectId={projectId} item={editing} folders={folders} onClose={() => setEditing(undefined)} onSaved={saved} />}
    </div>
  );
}

const st = {
  wrap: { maxWidth: 1180, margin: '0 auto' },
  head: { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', marginBottom: 14 },
  h2: { display: 'flex', alignItems: 'center', gap: 8, margin: 0, fontSize: 18, fontWeight: 800, color: 'var(--text-1)' },
  sub: { marginTop: 4, fontSize: 13, color: 'var(--text-3)', maxWidth: 760, lineHeight: 1.5 },
  filters: { display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', margin: '14px 0 4px' },
  h3: { display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 800, color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: '.04em', margin: '0 0 10px' },
  count: { fontSize: 12, fontWeight: 700, color: 'var(--text-4)' },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 340px), 1fr))', gap: 12 },
  card: { display: 'flex', flexDirection: 'column', background: 'var(--bg-2)', border: '1px solid var(--border-2)', borderRadius: 12, padding: 14, minWidth: 0 },
  cardHead: { display: 'flex', alignItems: 'center', gap: 8 },
  kindIcon: { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 32, height: 32, borderRadius: 8, background: 'var(--bg-3)', color: 'var(--text-2)', flexShrink: 0 },
  title: { fontSize: 14, fontWeight: 800, color: 'var(--text-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  meta: { fontSize: 12, color: 'var(--text-4)', marginTop: 2 },
  body: { display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12, flex: 1 },
  row: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', fontSize: 13, minWidth: 0 },
  lbl: { width: 72, flexShrink: 0, fontSize: 12, fontWeight: 700, color: 'var(--text-4)' },
  val: { color: 'var(--text-1)', overflowWrap: 'anywhere', minWidth: 0 },
  link: { display: 'inline-flex', alignItems: 'center', gap: 4, color: 'var(--accent-text, var(--text-1))', overflowWrap: 'anywhere', minWidth: 0 },
  muted: { color: 'var(--text-4)', fontSize: 13 },
  secret: { display: 'inline-flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', minWidth: 0 },
  code: { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 13, padding: '3px 8px', borderRadius: 6, background: 'var(--bg-3)', color: 'var(--text-1)', overflowWrap: 'anywhere' },
  badge: { display: 'inline-block', marginLeft: 6, fontSize: 11.5, fontWeight: 800, padding: '1px 8px', borderRadius: 999, border: '1px solid' },
  notes: { fontSize: 13, color: 'var(--text-2)', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', lineHeight: 1.5, paddingTop: 2 },
  foot: { marginTop: 12, paddingTop: 10, borderTop: '1px solid var(--border-1)', fontSize: 11.5, color: 'var(--text-4)' },
  form: { display: 'flex', flexDirection: 'column', gap: 12 },
  two: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 },
  field: { display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 },
  flabel: { fontSize: 12.5, fontWeight: 700, color: 'var(--text-2)' },
  help: { fontSize: 12, color: 'var(--text-4)' },
};
