import { mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { DIR_RESULTADOS, lerJsonSeExistir, salvarJson } from './lib/comum.mjs';

mkdirSync(DIR_RESULTADOS, { recursive: true });
const branches = readdirSync(DIR_RESULTADOS, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name)
  .sort();

const linhas = [];
for (const dir of branches) {
  const base = path.join(DIR_RESULTADOS, dir);
  const cobertura = lerJsonSeExistir(path.join(base, 'cobertura.json'));
  const mutacao = lerJsonSeExistir(path.join(base, 'mutacao.json'));
  const bugs = lerJsonSeExistir(path.join(base, 'bugs.json'));
  const padroes = lerJsonSeExistir(path.join(base, 'padroes.json'));
  const fonte = cobertura ?? mutacao ?? bugs ?? padroes;
  if (!fonte) {
    continue;
  }
  const commits = [...new Set([cobertura, mutacao, bugs, padroes].filter(Boolean).map((r) => r.commit))];
  linhas.push({
    suite: fonte.branch,
    commits,
    testes: cobertura?.jest.testes ?? bugs?.suiteComBugs.testes ?? null,
    testesFalhandoComBugs: bugs?.suiteComBugs.falharam ?? cobertura?.jest.falharam ?? null,
    coberturaLinhas: cobertura?.total.linhas.pct ?? null,
    coberturaBranches: cobertura?.total.branches.pct ?? null,
    mutationScore: mutacao?.mutationScore ?? null,
    mutantesSobreviventes: mutacao ? mutacao.totais.survived + mutacao.totais.noCoverage : null,
    testesExcluidosDoStryker: mutacao ? (mutacao.testesExcluidosDaMedicao?.length ?? 0) : null,
    bugsDetectados: bugs?.resumo.detectados ?? null,
    bugsProtegidos: bugs?.resumo.protegidos ?? null,
    bugsIgnorados: bugs?.resumo.ignorados ?? null,
    heuristica: padroes
      ? {
          shouldCreate: padroes.total.shouldCreate,
          dubles: padroes.total.dubles,
          asserçõesDom: padroes.total.asserçõesDom,
          asserçõesComponente: padroes.total.asserçõesComponente,
          timersFalsos: padroes.total.timersFalsos,
        }
      : null,
  });
}

const geradoEm = new Date().toISOString();
salvarJson(path.join(DIR_RESULTADOS, 'resultados.json'), { geradoEm, suites: linhas });

const fmt = (v, sufixo = '') => (v === null || v === undefined ? '—' : `${v}${sufixo}`);
const lista = (v) => (v === null ? '—' : v.length === 0 ? '0' : `${v.length} (${v.join(', ')})`);

const md = [
  '# Resultados',
  '',
  `Gerado em ${geradoEm} por \`pnpm relatorio\` a partir de \`resultados/<branch>/*.json\`.`,
  '',
  '"Testes" e "Falhando com bugs" vêm do Jest sobre a branch inteira e incluem os 2 testes de `src/app/app.spec.ts`, que já existem na base. "Excluídos do Stryker" são os testes que falham sobre o código com bugs; o Stryker exige suíte verde, então eles ficam fora do mutation score (ver `docs/decisoes.md`).',
  '',
  'Cobertura e mutation score consideram apenas os arquivos-alvo (`regras-reserva.service.ts`, `reserva.component.ts`, `sala.service.ts`). O template `reserva.component.html` entra no `mutate` do Stryker, mas o Stryker não gera mutantes para bindings de templates Angular.',
  '',
  '| Suíte | Testes | Falhando com bugs | Linhas | Branches | Mutation score | Excluídos do Stryker | Bugs detectados | Bugs protegidos | Bugs ignorados |',
  '|---|---|---|---|---|---|---|---|---|---|',
  ...linhas.map(
    (l) =>
      `| \`${l.suite}\` | ${fmt(l.testes)} | ${fmt(l.testesFalhandoComBugs)} | ${fmt(l.coberturaLinhas, '%')} | ${fmt(l.coberturaBranches, '%')} | ${fmt(l.mutationScore, '%')} | ${fmt(l.testesExcluidosDoStryker)} | ${lista(l.bugsDetectados)} | ${lista(l.bugsProtegidos)} | ${lista(l.bugsIgnorados)} |`,
  ),
  '',
  '## Contagens heurísticas',
  '',
  '> **Heurística.** Contagens por expressão regular sobre o texto dos specs, sem análise sintática. Servem só de apoio à leitura humana e podem contar a mais ou a menos. Os padrões estão em `scripts/medir-padroes.mjs`.',
  '',
  '| Suíte | "should create" | Dublês (`jest.fn`, `jest.spyOn`, `useValue`) | Asserções sobre o DOM | Asserções sobre o componente | Timers falsos |',
  '|---|---|---|---|---|---|',
  ...linhas.map((l) =>
    l.heuristica
      ? `| \`${l.suite}\` | ${l.heuristica.shouldCreate} | ${l.heuristica.dubles} | ${l.heuristica.asserçõesDom} | ${l.heuristica.asserçõesComponente} | ${l.heuristica.timersFalsos} |`
      : `| \`${l.suite}\` | — | — | — | — | — |`,
  ),
  '',
  'Detalhes por suíte (testes que detectaram ou protegeram cada bug, mutantes sobreviventes, relatório HTML do Stryker) ficam em `resultados/<branch>/`.',
  '',
];
writeFileSync(path.join(DIR_RESULTADOS, 'README.md'), md.join('\n'));
console.log(`Relatório com ${linhas.length} suíte(s) salvo em ${DIR_RESULTADOS}`);
