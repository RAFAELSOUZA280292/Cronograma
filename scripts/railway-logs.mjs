// Lê os logs do deploy do painel pela API da Railway (a CLI não aceita token de workspace). Só leitura.
// Uso: node scripts/railway-logs.mjs [filtro-regex] [--deploy N] [--limit 2000]   (RAILWAY_API_TOKEN vem do .env)
import fs from 'node:fs';

const env = Object.fromEntries(fs.readFileSync(new URL('../.env', import.meta.url), 'utf8').split('\n').filter((l) => /^[A-Z_]+=/.test(l)).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]));
const token = process.env.RAILWAY_API_TOKEN || env.RAILWAY_API_TOKEN;
if (!token) { console.error('Falta RAILWAY_API_TOKEN no .env'); process.exit(1); }
const args = process.argv.slice(2);
const opt = (name, def) => { const i = args.indexOf(name); return i === -1 ? def : Number(args[i + 1]); };
const filter = args.find((a, i) => !a.startsWith('--') && !(i > 0 && args[i - 1].startsWith('--')));
const nth = opt('--deploy', 0); const limit = opt('--limit', 2000);

async function gql(query) {
  const r = await fetch('https://backboard.railway.com/graphql/v2', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ query }) });
  const j = await r.json();
  if (j.errors) throw new Error(j.errors.map((e) => e.message).join('; '));
  return j.data;
}

const { projects } = await gql('{ projects { edges { node { id name environments { edges { node { id name } } } services { edges { node { id name } } } } } } }');
const proj = projects.edges.map((e) => e.node).find((p) => p.name === 'Painel');
const envId = proj.environments.edges.find((e) => e.node.name === 'production').node.id;
const svcId = proj.services.edges.find((e) => e.node.name === 'Cronograma').node.id;
const { deployments } = await gql(`{ deployments(first: 10, input: { projectId: "${proj.id}", environmentId: "${envId}", serviceId: "${svcId}" }) { edges { node { id status createdAt } } } }`);
const dep = deployments.edges[nth].node;
console.error(`deploy ${nth}: ${dep.id} ${dep.status} ${dep.createdAt}`);
const { deploymentLogs } = await gql(`{ deploymentLogs(deploymentId: "${dep.id}", limit: ${limit}) { timestamp message severity } }`);
const re = filter ? new RegExp(filter, 'i') : null;
for (const l of deploymentLogs) if (!re || re.test(l.message)) console.log(`${l.timestamp.slice(0, 19)} ${l.severity} ${l.message}`);
