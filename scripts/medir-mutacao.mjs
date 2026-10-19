import { cpSync, existsSync, readdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { calculateMetrics } from 'mutation-testing-metrics';
import {
  ARQUIVOS_ALVO,
  ARQUIVOS_ALVO_TEMPLATE,
  CONFIG_JEST,
  DIR_FIXES,
  dirResultadosDaBranch,
  executar,
  lerArgumentos,
  prepararClone,
  RAIZ_GABARITO,
  rodarJest,
  salvarJson,
} from './lib/comum.mjs';

const require = createRequire(import.meta.url);
const STRYKER_BIN = path.join(path.dirname(require.resolve('@stryker-mutator/core/package.json')), 'bin', 'stryker.js');
// O carregador de plugins do Stryker só procura `@stryker-mutator/*` ao lado do próprio core;
// com o layout do pnpm o jest-runner não está lá, então o plugin é passado pelo caminho absoluto.
const JEST_RUNNER = fileURLToPath(import.meta.resolve('@stryker-mutator/jest-runner'));

// Medição principal: código corrigido (todos os patches de gabarito/fixes aplicados).
// Medição secundária: `--versao com-bugs`, sobre o código da branch como está.
const VERSOES = {
  corrigida: { arquivo: 'mutacao.json', dirStryker: 'stryker' },
  'com-bugs': { arquivo: 'mutacao-com-bugs.json', dirStryker: 'stryker-com-bugs' },
};

const args = lerArgumentos({ extras: { versao: { type: 'string', default: 'corrigida' } } });
if (!VERSOES[args.versao]) {
  console.error(`--versao deve ser ${Object.keys(VERSOES).join(' ou ')}`);
  process.exit(2);
}
const { clone, commit, limpar } = prepararClone(args.app, args.branch, { manterTemp: args['manter-temp'] });

const escaparRegex = (texto) => texto.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

try {
  const patchesAplicados = [];
  if (args.versao === 'corrigida') {
    const patches = readdirSync(DIR_FIXES)
      .filter((f) => /^bug-\d+\.patch$/.test(f))
      .sort();
    for (const patch of patches) {
      executar('git', ['apply', path.join(DIR_FIXES, patch)], { cwd: clone });
      patchesAplicados.push(patch);
    }
  }

  // O Stryker aborta se algum teste falhar no dry run. Testes que falham sobre o código medido
  // (e arquivos de teste que nem carregam) são identificados aqui e excluídos da medição de
  // mutação; ver scripts/lib/excluir-testes.cjs e docs/decisoes.md.
  const { json: execucaoInicial } = rodarJest(clone);
  const testesExcluidos = [];
  const suitesExcluidas = [];
  for (const suite of execucaoInicial.testResults) {
    if (suite.status === 'failed' && suite.assertionResults.length === 0) {
      suitesExcluidas.push(path.relative(clone, suite.name));
    }
    for (const teste of suite.assertionResults) {
      if (teste.status === 'failed') {
        testesExcluidos.push(teste.fullName);
      }
    }
  }

  const configJestOriginal = createRequire(path.join(clone, 'package.json'))(path.join(clone, CONFIG_JEST));
  const ajustesJest = {};
  if (testesExcluidos.length > 0) {
    const arquivoExcluidos = path.join(clone, '..', 'testes-excluidos.json');
    salvarJson(arquivoExcluidos, testesExcluidos);
    process.env.MEDICAO_TESTES_EXCLUIDOS = arquivoExcluidos;
    ajustesJest.testNamePattern = `^(?!(?:${testesExcluidos.map(escaparRegex).join('|')})$)`;
    ajustesJest.setupFilesAfterEnv = [
      ...(configJestOriginal.setupFilesAfterEnv ?? []),
      path.join(RAIZ_GABARITO, 'scripts/lib/excluir-testes.cjs'),
    ];
  }
  if (suitesExcluidas.length > 0) {
    ajustesJest.testPathIgnorePatterns = [
      ...(configJestOriginal.testPathIgnorePatterns ?? ['/node_modules/']),
      ...suitesExcluidas.map((s) => `${escaparRegex(s)}$`),
    ];
  }

  const configStryker = {
    packageManager: 'pnpm',
    plugins: [JEST_RUNNER],
    testRunner: 'jest',
    jest: {
      projectType: 'custom',
      configFile: CONFIG_JEST,
      enableFindRelatedTests: true,
      ...(Object.keys(ajustesJest).length > 0 ? { config: ajustesJest } : {}),
    },
    coverageAnalysis: 'perTest',
    mutate: [...ARQUIVOS_ALVO, ...ARQUIVOS_ALVO_TEMPLATE],
    reporters: ['clear-text', 'progress', 'html', 'json'],
    htmlReporter: { fileName: 'reports/mutation/mutation.html' },
    jsonReporter: { fileName: 'reports/mutation/mutation.json' },
    tempDirName: '.stryker-tmp',
    cleanTempDir: true,
  };
  const arquivoConfig = path.join(clone, 'stryker.medicao.json');
  salvarJson(arquivoConfig, configStryker);

  const execucao = executar('node', [STRYKER_BIN, 'run', arquivoConfig], { cwd: clone, permitirFalha: true });

  const relatorioJson = path.join(clone, 'reports/mutation/mutation.json');
  if (!existsSync(relatorioJson)) {
    throw new Error(`O Stryker não gerou ${relatorioJson} (código ${execucao.status}).`);
  }
  const relatorio = JSON.parse(readFileSync(relatorioJson, 'utf8'));
  const { metrics } = calculateMetrics(relatorio.files);

  const sobreviventes = [];
  const porArquivo = {};
  for (const [arquivo, dados] of Object.entries(relatorio.files)) {
    const contagem = {};
    for (const mutante of dados.mutants) {
      contagem[mutante.status] = (contagem[mutante.status] ?? 0) + 1;
      if (mutante.status === 'Survived' || mutante.status === 'NoCoverage') {
        sobreviventes.push({
          arquivo,
          id: mutante.id,
          status: mutante.status,
          mutador: mutante.mutatorName,
          substituicao: mutante.replacement,
          linha: mutante.location.start.line,
          coluna: mutante.location.start.column,
          original: dados.source
            .split('\n')
            .slice(mutante.location.start.line - 1, mutante.location.end.line)
            .join('\n')
            .trim(),
        });
      }
    }
    porArquivo[arquivo] = { mutantes: dados.mutants.length, porStatus: contagem };
  }
  for (const arquivo of [...ARQUIVOS_ALVO, ...ARQUIVOS_ALVO_TEMPLATE]) {
    porArquivo[arquivo] ??= { mutantes: 0, porStatus: {} };
  }

  const dirSaida = dirResultadosDaBranch(args.branch);
  const { arquivo: arquivoSaida, dirStryker } = VERSOES[args.versao];
  cpSync(path.join(clone, 'reports/mutation'), path.join(dirSaida, dirStryker), { recursive: true });

  const resultado = {
    branch: args.branch,
    commit,
    geradoEm: new Date().toISOString(),
    versaoDoCodigo: args.versao,
    patchesAplicados,
    codigoSaidaStryker: execucao.status,
    mutationScore: Math.round(metrics.mutationScore * 100) / 100,
    mutationScoreSobreCodigoCoberto: Math.round(metrics.mutationScoreBasedOnCoveredCode * 100) / 100,
    totais: {
      mutantes: metrics.totalMutants,
      validos: metrics.totalValid,
      killed: metrics.killed,
      timeout: metrics.timeout,
      survived: metrics.survived,
      noCoverage: metrics.noCoverage,
      compileErrors: metrics.compileErrors,
      runtimeErrors: metrics.runtimeErrors,
      ignored: metrics.ignored,
    },
    testesNaExecucaoInicial: execucaoInicial.numTotalTests,
    totalTestesExcluidos: testesExcluidos.length,
    testesExcluidosDaMedicao: testesExcluidos,
    suitesExcluidasDaMedicao: suitesExcluidas,
    porArquivo,
    sobreviventes,
    configStryker,
  };
  salvarJson(path.join(dirSaida, arquivoSaida), resultado);
  console.log(`\nMutation score (${args.branch}, código ${args.versao}): ${resultado.mutationScore}%`);
  console.log(
    `Testes excluídos por falharem no código ${args.versao}: ${testesExcluidos.length}; suítes excluídas: ${suitesExcluidas.length}.`,
  );
  for (const nome of testesExcluidos) {
    console.log(`  - ${nome}`);
  }
  console.log(`Sobreviventes/sem cobertura: ${sobreviventes.length}. Resultado em ${dirSaida}`);
  if (execucao.status !== 0) {
    console.error(`Atenção: o Stryker terminou com código ${execucao.status}.`);
    process.exitCode = 1;
  }
} finally {
  limpar();
}
