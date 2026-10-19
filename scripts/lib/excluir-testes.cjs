// Arquivo de setup (setupFilesAfterEnv) usado só pelo Stryker.
//
// O Stryker exige que todos os testes passem no dry run. As suítes do experimento podem ter
// testes que falham de propósito (afirmam a regra correta contra o código com bugs). Esses testes
// são excluídos da medição de mutação em duas camadas:
//   1. `testNamePattern` ancorado na configuração, que os pula no dry run;
//   2. este arquivo, que os transforma em no-op caso voltem a rodar numa execução de mutante
//      (o filtro por mutante do Stryker é uma regex sem âncoras e pode casar nomes que contêm
//      o nome de outro teste).
// A lista de nomes completos vem do arquivo JSON indicado em MEDICAO_TESTES_EXCLUIDOS.

const { readFileSync } = require('node:fs');

const excluidos = new Set(JSON.parse(readFileSync(process.env.MEDICAO_TESTES_EXCLUIDOS, 'utf8')));

function envolverTeste(fn) {
  if (typeof fn !== 'function') {
    return fn;
  }
  const envolvido = function (...args) {
    if (excluidos.has(expect.getState().currentTestName)) {
      const done = args[args.length - 1];
      if (fn.length > 0 && typeof done === 'function') {
        done();
      }
      return undefined;
    }
    return fn.apply(this, args);
  };
  Object.defineProperty(envolvido, 'length', { value: fn.length });
  return envolvido;
}

function envolverRegistro(registrar) {
  return new Proxy(registrar, {
    apply(alvo, esteArg, [nome, fn, ...resto]) {
      return Reflect.apply(alvo, esteArg, [nome, envolverTeste(fn), ...resto]);
    },
    get(alvo, prop, receptor) {
      const valor = Reflect.get(alvo, prop, receptor);
      if (typeof valor !== 'function') {
        return valor;
      }
      if (prop === 'each') {
        return (...tabela) => {
          const registrarCaso = valor.apply(alvo, tabela);
          return (nome, fn, ...resto) => registrarCaso(nome, envolverTeste(fn), ...resto);
        };
      }
      if (prop === 'only' || prop === 'concurrent') {
        return envolverRegistro(valor);
      }
      return valor;
    },
  });
}

if (excluidos.size > 0) {
  globalThis.it = envolverRegistro(globalThis.it);
  globalThis.test = envolverRegistro(globalThis.test);
  globalThis.fit = envolverRegistro(globalThis.fit);
}
