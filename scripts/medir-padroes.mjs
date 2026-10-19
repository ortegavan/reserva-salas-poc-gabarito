import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  arquivosDeTeste,
  dirResultadosDaBranch,
  lerArgumentos,
  prepararClone,
  salvarJson,
} from './lib/comum.mjs';

// Spec que já existe na base (gerado pelo Angular CLI); não faz parte da suíte avaliada.
const SPECS_DA_BASE = ['src/app/app.spec.ts'];

// Contagens por expressão regular sobre o texto dos arquivos. É heurística: não entende
// escopo, comentários nem strings, e pode contar a mais ou a menos.
const PADROES = {
  testes: /\b(?:it|test)(?:\.each\([^)]*\))?\s*\(/g,
  shouldCreate: /\b(?:it|test)\s*\(\s*['"`](?:should (?:be )?create|deve (?:ser )?cria|deve criar|cria o componente)/gi,
  jestFn: /\bjest\.fn\s*\(/g,
  jestSpyOn: /\bjest\.spyOn\s*\(/g,
  useValue: /\buseValue\s*:/g,
  httpTestingController: /\bHttpTestingController\b/g,
  domNativeElement: /\bnativeElement\b/g,
  domQuerySelector: /\bquerySelector(?:All)?\s*\(/g,
  domDebugElement: /\bdebugElement\b/g,
  expectSobreComponente: /\bexpect\s*\(\s*(?:component|comp|componente|fixture\.componentInstance)\s*[.[]/g,
  expectSobreDom: /\bexpect\s*\([^;\n]*(?:nativeElement|querySelector|debugElement|textContent|\.disabled\b)/g,
  timersFalsos: /\b(?:jest\.useFakeTimers|jest\.advanceTimersByTime|jest\.runAllTimers|jest\.runOnlyPendingTimers|fakeAsync|tick\s*\(|flush\s*\()/g,
};

function contar(texto) {
  return Object.fromEntries(Object.entries(PADROES).map(([nome, re]) => [nome, (texto.match(re) ?? []).length]));
}

const args = lerArgumentos();
const { clone, commit, limpar } = prepararClone(args.app, args.branch, { manterTemp: args['manter-temp'], instalar: false });

try {
  const specs = arquivosDeTeste(clone).filter((f) => !SPECS_DA_BASE.includes(f));
  const porArquivo = {};
  const total = Object.fromEntries(Object.keys(PADROES).map((k) => [k, 0]));
  for (const spec of specs) {
    const contagem = contar(readFileSync(path.join(clone, spec), 'utf8'));
    porArquivo[spec] = contagem;
    for (const [k, v] of Object.entries(contagem)) {
      total[k] += v;
    }
  }
  const resultado = {
    branch: args.branch,
    commit,
    geradoEm: new Date().toISOString(),
    aviso:
      'HEURÍSTICA. Contagens por expressão regular sobre o texto dos specs, sem análise sintática; servem só de apoio à leitura humana.',
    specsIgnorados: SPECS_DA_BASE,
    padroes: Object.fromEntries(Object.entries(PADROES).map(([k, re]) => [k, re.source])),
    total: {
      ...total,
      dubles: total.jestFn + total.jestSpyOn + total.useValue,
      asserçõesDom: total.expectSobreDom,
      asserçõesComponente: total.expectSobreComponente,
    },
    porArquivo,
  };
  const destino = path.join(dirResultadosDaBranch(args.branch), 'padroes.json');
  salvarJson(destino, resultado);
  console.log(`\nPadrões (heurística) em ${specs.length} spec(s) de ${args.branch}:`);
  console.log(resultado.total);
  console.log(`Resultado salvo em ${destino}`);
} finally {
  limpar();
}
