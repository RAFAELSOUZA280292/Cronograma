// Cronograma padrão versionado (2026-10-19): o padrão é editado na tela de empresa, como um "projeto" de id fixo que só existe na tela enquanto está aberto.
export const STD_PLAN_ID = 'std-plan';
export const isStdPlan = (p) => !!p && p.id === STD_PLAN_ID;
