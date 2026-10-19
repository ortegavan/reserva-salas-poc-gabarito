import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  ARQUIVOS_ALVO,
  dirResultadosDaBranch,
  lerArgumentos,
  prepararClone,
  rodarJest,
  salvarJson,
} from './lib/comum.mjs';

const args = lerArgumentos();
const { clone, commit, limpar } = prepararClone(args.app, args.branch, { manterTemp: args['manter-temp'] });

try {
  const dirCobertura = path.join(clone, '..', 'cobertura');
  const { codigo, json } = rodarJest(clone, [
    '--coverage',
    `--coverageDirectory=${dirCobertura}`,
    '--coverageReporters=json-summary',
    ...ARQUIVOS_ALVO.map((arquivo) => `--collectCoverageFrom=${arquivo}`),
  ]);

  const resumo = JSON.parse(readFileSync(path.join(dirCobertura, 'coverage-summary.json'), 'utf8'));
  const porArquivo = {};
  const total = { linhas: { cobertas: 0, total: 0 }, branches: { cobertas: 0, total: 0 } };

  for (const arquivo of ARQUIVOS_ALVO) {
    const chave = Object.keys(resumo).find((k) => k.endsWith(`${path.sep}${arquivo}`));
    const entrada = chave ? resumo[chave] : undefined;
    const linhas = entrada?.lines ?? { covered: 0, total: 0, pct: 0 };
    const branches = entrada?.branches ?? { covered: 0, total: 0, pct: 0 };
    porArquivo[arquivo] = {
      encontradoNoRelatorio: Boolean(entrada),
      linhas: { cobertas: linhas.covered, total: linhas.total, pct: linhas.pct },
      branches: { cobertas: branches.covered, total: branches.total, pct: branches.pct },
    };
    total.linhas.cobertas += linhas.covered;
    total.linhas.total += linhas.total;
    total.branches.cobertas += branches.covered;
    total.branches.total += branches.total;
  }

  const pct = ({ cobertas, total: t }) => (t === 0 ? null : Math.round((cobertas / t) * 10000) / 100);
  const resultado = {
    branch: args.branch,
    commit,
    geradoEm: new Date().toISOString(),
    jest: {
      codigoSaida: codigo,
      testes: json.numTotalTests,
      passaram: json.numPassedTests,
      falharam: json.numFailedTests,
      suitesComErro: json.numRuntimeErrorTestSuites,
    },
    arquivosAlvo: porArquivo,
    total: {
      linhas: { ...total.linhas, pct: pct(total.linhas) },
      branches: { ...total.branches, pct: pct(total.branches) },
    },
  };

  const destino = path.join(dirResultadosDaBranch(args.branch), 'cobertura.json');
  salvarJson(destino, resultado);
  console.log(
    `\nCobertura dos arquivos-alvo (${args.branch}): linhas ${resultado.total.linhas.pct}% · branches ${resultado.total.branches.pct}%`,
  );
  console.log(`Resultado salvo em ${destino}`);
} finally {
  limpar();
}
