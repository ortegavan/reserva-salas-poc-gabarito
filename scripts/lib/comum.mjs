import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

export const RAIZ_GABARITO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const DIR_RESULTADOS = path.join(RAIZ_GABARITO, 'resultados');
export const DIR_FIXES = path.join(RAIZ_GABARITO, 'gabarito', 'fixes');

export const ARQUIVOS_ALVO = [
  'src/app/reserva/regras-reserva.service.ts',
  'src/app/reserva/reserva.component.ts',
  'src/app/reserva/sala.service.ts',
];

// Template e estilos do componente-alvo. O Stryker recebe o template em `mutate`,
// mas só muta blocos <script> de arquivos .html (ver docs/decisoes.md).
export const ARQUIVOS_ALVO_TEMPLATE = ['src/app/reserva/reserva.component.html'];

export const CONFIG_JEST = 'jest.config.cjs';

export function lerArgumentos({ exigeApp = true, extras = {} } = {}) {
  const { values } = parseArgs({
    options: {
      app: { type: 'string' },
      branch: { type: 'string' },
      'manter-temp': { type: 'boolean', default: false },
      ...extras,
    },
    strict: true,
  });
  if (exigeApp && (!values.app || !values.branch)) {
    console.error('Uso: --app <caminho-ou-url-do-repo-da-aplicação> --branch <branch>');
    process.exit(2);
  }
  return values;
}

export function nomeSeguro(branch) {
  return branch.replace(/[^A-Za-z0-9._-]+/g, '__');
}

export function dirResultadosDaBranch(branch) {
  const dir = path.join(DIR_RESULTADOS, nomeSeguro(branch));
  mkdirSync(dir, { recursive: true });
  return dir;
}

export function executar(comando, args, { cwd, permitirFalha = false, silencioso = false, env } = {}) {
  if (!silencioso) {
    console.log(`$ ${[comando, ...args].join(' ')}${cwd ? `   (em ${cwd})` : ''}`);
  }
  const resultado = spawnSync(comando, args, {
    cwd,
    env: { ...process.env, ...env },
    stdio: silencioso ? 'pipe' : 'inherit',
    encoding: 'utf8',
  });
  if (resultado.error) {
    throw resultado.error;
  }
  if (resultado.status !== 0 && !permitirFalha) {
    const saida = silencioso ? `\n${resultado.stdout}\n${resultado.stderr}` : '';
    throw new Error(`Falhou (código ${resultado.status}): ${comando} ${args.join(' ')}${saida}`);
  }
  return resultado;
}

function resolverOrigem(app) {
  return existsSync(app) ? path.resolve(app) : app;
}

/**
 * Clona somente a branch pedida num diretório temporário e instala as dependências.
 * Devolve o caminho do clone e uma função de limpeza.
 */
export function prepararClone(app, branch, { manterTemp = false, instalar = true } = {}) {
  const base = realpathSync(mkdtempSync(path.join(tmpdir(), 'reserva-salas-medicao-')));
  const clone = path.join(base, 'app');
  executar('git', ['clone', '--quiet', '--single-branch', '--branch', branch, resolverOrigem(app), clone]);
  const commit = executar('git', ['rev-parse', 'HEAD'], { cwd: clone, silencioso: true }).stdout.trim();
  if (instalar) {
    executar('pnpm', ['install', '--frozen-lockfile'], { cwd: clone });
  }
  const limpar = () => {
    if (manterTemp) {
      console.log(`Clone temporário mantido em ${clone}`);
    } else {
      rmSync(base, { recursive: true, force: true });
    }
  };
  return { clone, commit, limpar };
}

export function arquivosDeTeste(clone) {
  const resultado = executar('git', ['ls-files', '--', '*.spec.ts'], { cwd: clone, silencioso: true });
  return resultado.stdout.split('\n').filter(Boolean);
}

/**
 * Roda o Jest do clone com o arquivo de configuração da aplicação e devolve o resultado
 * do reporter JSON (`--json`).
 */
export function rodarJest(clone, argsExtras = [], { nomeSaida = 'jest-resultado.json' } = {}) {
  const saida = path.join(clone, '..', nomeSaida);
  rmSync(saida, { force: true });
  const r = executar(
    'pnpm',
    ['exec', 'jest', '--config', CONFIG_JEST, '--ci', '--json', `--outputFile=${saida}`, ...argsExtras],
    { cwd: clone, permitirFalha: true },
  );
  if (!existsSync(saida)) {
    throw new Error(`O Jest não gerou ${saida} (código ${r.status}).`);
  }
  return { codigo: r.status, json: JSON.parse(readFileSync(saida, 'utf8')) };
}

export function salvarJson(arquivo, dados) {
  mkdirSync(path.dirname(arquivo), { recursive: true });
  writeFileSync(arquivo, `${JSON.stringify(dados, null, 2)}\n`);
}

export function lerJsonSeExistir(arquivo) {
  return existsSync(arquivo) ? JSON.parse(readFileSync(arquivo, 'utf8')) : null;
}
