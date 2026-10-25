// Teste puro (sem servidor) das correções de 2026-10-25: API pxk_ (pulada ao mudar done, com desfazer) e exemplos da IA sem vínculo automático.
//   DATABASE_URL=postgres://localhost:5432/cronograma_dev node scripts/connect-fixes.test.mjs
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgres://localhost:5432/cronograma_dev';
const { applyPlanOps } = await import('../server/connect.js');
const { sameCompanyExamples } = await import('../server/taskLinkLearn.js');
let f=0; const ok=(n,c,e)=>{console.log((c?'ok   ':'FAIL ')+n+(c?'':' -> '+JSON.stringify(e))); if(!c) f++;};
const data={ team:[], activities:[{ id:'a1', title:'Atividade', subactivities:[{ id:'s1', title:'Sub pulada', done:true, skipped:true, skipReason:'sem escopo', doneAt:'2026-01-01', doneBy:'X' }, { id:'s2', title:'Sub aberta', done:false }] }], log:[] };
const o1=applyPlanOps(data,[{op:'sub.set',activity:{id:'a1'},sub:{id:'s1'},set:{done:false}}],'Teste');
const s1=o1.next.activities[0].subactivities[0];
ok('desmarcar done limpa pulada e motivo', o1.errors.length===0 && s1.done===false && s1.skipped===false && s1.skipReason==='' , {e:o1.errors,s1});
const back=applyPlanOps(o1.next,o1.undo,'Teste');
const s1b=back.next.activities[0].subactivities[0];
ok('desfazer devolve done, pulada e motivo', back.errors.length===0 && s1b.done===true && s1b.skipped===true && s1b.skipReason==='sem escopo', {e:back.errors,s1b});
const o2=applyPlanOps(data,[{op:'sub.set',activity:{id:'a1'},sub:{id:'s2'},set:{done:true}}],'Teste');
const s2=o2.next.activities[0].subactivities[1];
ok('marcar feita zera pulada (igual ao painel)', s2.done===true && s2.skipped===false && s2.doneBy==='Teste');
const o3=applyPlanOps(data,[{op:'sub.set',activity:{id:'a1'},sub:{id:'s2'},set:{done:true,skipped:true,skipReason:'não se aplica'}}],'Teste');
const s3=o3.next.activities[0].subactivities[1];
ok('dá para marcar pulada de propósito (done+skipped juntos)', o3.errors.length===0 && s3.done===true && s3.skipped===true && s3.skipReason==='não se aplica', {e:o3.errors,s3});
const d2={ activities:[{id:'x',title:'Atividade X'},{id:'y',title:'Atividade Y'}], meetings:[{ actionItems:[
 {title:'Enviar relatório fiscal', activityId:'x', activityLink:{status:'confirmed'}},
 {title:'Enviar relatório fiscal mensal', activityId:'y', activityLink:{status:'auto'}},
 {title:'Revisar relatório fiscal', activityId:'x'} ]}] };
const ex=sameCompanyExamples(d2,[{title:'Enviar relatório fiscal'}]);
ok('exemplos para a IA ignoram vínculo automático não validado', ex.length===2 && !ex.some(e=>e.activity==='Atividade Y'), ex);
console.log(f ? `\n${f} FALHA(S)` : '\ntodos os testes ok');
process.exit(f ? 1 : 0);
