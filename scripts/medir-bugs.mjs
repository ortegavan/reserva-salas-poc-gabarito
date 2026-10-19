import { readdirSync } from 'node:fs';
import path from 'node:path';
import {
  DIR_FIXES,
  dirResultadosDaBranch,
  executar,
  lerArgumentos,
  prepararClone,
  rodarJest,
  salvarJson,
} from './lib/comum.mjs';

/**
 * Converte o reporter JSON do Jest num mapa "identificador do teste" -> status.
 * O identificador é arquivo › describes › título; nomes repetidos recebem um sufixo #n.
 */
function resultadosPorTeste(jestJson, clone) {
  const mapa = new Map();
  const suitesComErro = [];
  for (const suite of jestJson.testResults) {
    const arquivo = path.relative(clone, suite.name);
    if (suite.status === 'failed' && suite.assertionResults.length === 0) {
      suitesComErro.push({ arquivo, mensagem: (suite.message ?? '').slice(0, 2000) });
    }
    for (const teste of suite.assertionResults) {
      const base = [arquivo, ...teste.ancestorTitles, teste.title].join(' › ');
      let id = base;
      for (let n = 2; mapa.has(id); n++) {
        id = `${base} #${n}`;
      }
      mapa.set(id, teste.status);
    }
  }
  return { mapa, suitesComErro };
}

const args = lerArgumentos();
const { clone, commit, limpar } = prepararClone(args.app, args.branch, { manterTemp: args['manter-temp'] });

try {
  const patches = readdirSync(DIR_FIXES)
    .filter((f) => /^bug-\d+\.patch$/.test(f))
    .sort();

  // A suíte roda duas vezes sobre o código com bugs; testes que mudam de resultado entre
  // essas duas execuções são instáveis e não entram na classificação.
  const base1 = resultadosPorTeste(rodarJest(clone).json, clone);
  const base2 = resultadosPorTeste(rodarJest(clone).json, clone);
  const instaveis = [...base1.mapa.keys()].filter((id) => base1.mapa.get(id) !== base2.mapa.get(id));
  const base = base1;

  const bugs = [];
  for (const patch of patches) {
    const caminhoPatch = path.join(DIR_FIXES, patch);
    const bug = patch.replace(/\.patch$/, '');
    const check = executar('git', ['apply', '--check', caminhoPatch], { cwd: clone, permitirFalha: true });
    if (check.status !== 0) {
      bugs.push({ bug, patch, erro: 'O patch não aplica sobre esta branch (git apply --check falhou).' });
      continue;
    }
    executar('git', ['apply', caminhoPatch], { cwd: clone });
    try {
      const corrigido = resultadosPorTeste(rodarJest(clone).json, clone);
      const detectaram = [];
      const protegeram = [];
      const ausentes = [];
      for (const [id, statusBug] of base.mapa) {
        if (instaveis.includes(id)) {
          continue;
        }
        const statusFix = corrigido.mapa.get(id);
        if (statusFix === undefined) {
          ausentes.push(id);
        } else if (statusBug === 'failed' && statusFix === 'passed') {
          detectaram.push(id);
        } else if (statusBug === 'passed' && statusFix === 'failed') {
          protegeram.push(id);
        }
      }
      bugs.push({
        bug,
        patch,
        detectado: detectaram.length > 0,
        protegido: protegeram.length > 0,
        ignorado: detectaram.length === 0 && protegeram.length === 0,
        testesQueDetectaram: detectaram,
        testesQueProtegeram: protegeram,
        testesAusentesAposCorrecao: ausentes,
        suitesComErroAposCorrecao: corrigido.suitesComErro,
      });
    } finally {
      executar('git', ['checkout', '--', '.'], { cwd: clone });
    }
  }

  const resultado = {
    branch: args.branch,
    commit,
    geradoEm: new Date().toISOString(),
    criterio: {
      detectado: 'algum teste falha com o bug e passa com a correção',
      protegido: 'algum teste passa com o bug e falha com a correção',
      ignorado: 'nenhum teste muda de resultado',
    },
    suiteComBugs: {
      testes: base.mapa.size,
      passaram: [...base.mapa.values()].filter((s) => s === 'passed').length,
      falharam: [...base.mapa.values()].filter((s) => s === 'failed').length,
      suitesComErro: base.suitesComErro,
      testesInstaveis: instaveis,
    },
    resumo: {
      detectados: bugs.filter((b) => b.detectado).map((b) => b.bug),
      protegidos: bugs.filter((b) => b.protegido).map((b) => b.bug),
      ignorados: bugs.filter((b) => b.ignorado).map((b) => b.bug),
      comErro: bugs.filter((b) => b.erro).map((b) => b.bug),
    },
    bugs,
  };

  const destino = path.join(dirResultadosDaBranch(args.branch), 'bugs.json');
  salvarJson(destino, resultado);
  console.log(`\nDetecção de bugs (${args.branch}):`);
  for (const b of bugs) {
    const rotulo = b.erro
      ? `ERRO: ${b.erro}`
      : [b.detectado && 'detectado', b.protegido && 'protegido', b.ignorado && 'ignorado'].filter(Boolean).join(' + ');
    console.log(`  ${b.bug}: ${rotulo}`);
  }
  console.log(`Resultado salvo em ${destino}`);
} finally {
  limpar();
}
