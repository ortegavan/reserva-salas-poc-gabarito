# Decisões da medição

Registro das decisões do repositório de medição e dos arquivos-fonte lidos para tomá-las. Data da montagem: 2026-10-19. As decisões de configuração da aplicação (Angular, Jest, `jest-preset-angular`, zoneless) estão em `docs/decisoes.md` do repositório `reserva-salas-poc`.

## Versões

| Pacote | Versão | Motivo |
|---|---|---|
| @stryker-mutator/core | 10.0.0 | tag `latest` no registro |
| @stryker-mutator/jest-runner | 10.0.0 | tag `latest`; `peerDependencies`: `@stryker-mutator/core 10.0.0` |
| @stryker-mutator/instrumenter (transitiva) | 10.0.0 | usa `angular-html-parser ~10.11.0` para `.html` |
| mutation-testing-metrics | 3.8.4 | mesma versão usada pelo core; calcula o mutation score |
| typescript | 6.0.3 | ver "Problemas encontrados" |

A aplicação medida usa jest 30.5.2 e jest-preset-angular 17.0.3. O Stryker usa o Jest **do clone da aplicação**, não um Jest próprio.

## Como os scripts trabalham

Todos os scripts recebem `--app <caminho-ou-url> --branch <branch>`, fazem `git clone --single-branch --branch <branch>` num diretório temporário (`os.tmpdir()`), rodam `pnpm install --frozen-lockfile` (exceto `medir:padroes` e `verificar:patches`, que não precisam) e apagam o clone ao final. `--manter-temp` preserva o clone para inspeção. Resultados vão para `resultados/<branch>/`, com `/` do nome da branch trocado por `__`.

O Jest é sempre chamado como `pnpm exec jest --config jest.config.cjs`, o mesmo arquivo usado por `pnpm test` na aplicação.

## Stryker

### Arquivos-fonte lidos (`node_modules/@stryker-mutator/jest-runner`, 10.0.0)

- `package.json`: `exports` separa `import` (`dist/src/index.js`, o plugin) de `require` (mixin do ambiente).
- `schema/jest-runner-options.json`: opções `jest.projectType` (`custom` | `create-react-app`, padrão `custom`), `jest.configFile`, `jest.config` e `jest.enableFindRelatedTests` (padrão `true`).
- `dist/src/config-loaders/index.js`: `projectType: 'custom'` usa `CustomJestConfigLoader`. É o tipo correto para Angular; `create-react-app` não se aplica.
- `dist/src/config-loaders/custom-jest-config-loader.js`: tenta primeiro `readInitialOptions(configFile)` do `jest-config` (nativo, Jest ≥ 29.3); se falhar, faz `require` do arquivo. Com `configFile: 'jest.config.cjs'` lê exatamente o arquivo da aplicação.
- `dist/src/utils/jest-wrapper.js` e `jest-config-wrapper.js`: `jest` e `jest-config` são resolvidos a partir de `process.cwd()`, ou seja, do clone da aplicação. Por isso o Stryker roda com `cwd` no clone.
- `dist/src/jest-test-runner.js`: `mergeConfigSettings` faz `{...configDoArquivo, ...jest.config, ...JEST_OVERRIDE_OPTIONS}` (merge raso). `mutantRun` monta `testNamePattern` como `(id1)|(id2)` **sem âncoras** a partir dos testes que cobriram o mutante.
- `dist/src/jest-override-options.js`: força `collectCoverage: false`, `reporters: []`, `bail: false` etc.
- `dist/src/jest-test-adapters/jest-test-adapter.js`: chama `runCLI` com `testNamePattern` (possivelmente `undefined`), `findRelatedTests` e `runInBand`.
- `dist/src/jest-plugins/with-coverage-analysis.js`, `jest-environment-generic.cjs`, `import-jest-environment.cjs`, `mixin-jest-environment.cjs`: com `coverageAnalysis` ligado, o `testEnvironment` é substituído por um ambiente genérico que carrega o original (`jest-preset-angular/environments/jest-jsdom-env`) com `require.resolve` a partir do diretório do projeto e acrescenta a captura de cobertura por teste. Funciona com o ambiente do preset (verificado).

### Arquivos-fonte lidos (`@stryker-mutator/core` e `instrumenter`, 10.0.0)

- `core/schema/stryker-schema.json`: padrões de `mutate`, `coverageAnalysis: perTest`, `reporters`, `jsonReporter.fileName` e `htmlReporter.fileName` (`reports/mutation/mutation.{json,html}`), `disableTypeChecks: true`, `plugins: ['@stryker-mutator/*']`.
- `core/dist/src/di/plugin-loader.js`: o glob `@stryker-mutator/*` é procurado em `../../../../../` relativo ao próprio core. No layout do pnpm (`.pnpm/@stryker-mutator+core@10.0.0/node_modules/`) o jest-runner não está lá. Por isso `plugins` recebe o caminho absoluto do jest-runner instalado neste repositório.
- `core/dist/src/process/3-dry-run-executor.js`: `validateResultCompleted` lança `ConfigError('There were failed tests in the initial test run.')` se qualquer teste falhar. Não há opção para tolerar falhas.
- `core/dist/src/sandbox/ts-config-preprocessor.js`: faz `import('typescript')` para reescrever o `tsconfig` no sandbox.
- `instrumenter/dist/src/parsers/create-parser.js` e `html-parser.js`: `.html` é reconhecido, mas o parser só extrai e muta o conteúdo de elementos `<script>` (sem `src`). Atributos, bindings (`[disabled]="..."`), interpolações e blocos de controle do Angular **não são mutados**.
- `mutation-testing-metrics/dist/src/calculateMetrics.js`: `mutationScore = (killed + timeout) / (killed + timeout + survived + noCoverage)`. `compileErrors` e `runtimeErrors` ficam fora do denominador. O script usa a própria função `calculateMetrics`.

### Configuração gerada (`scripts/medir-mutacao.mjs`)

```json
{
  "packageManager": "pnpm",
  "plugins": ["<absoluto>/node_modules/@stryker-mutator/jest-runner/dist/src/index.js"],
  "testRunner": "jest",
  "jest": {
    "projectType": "custom",
    "configFile": "jest.config.cjs",
    "enableFindRelatedTests": true,
    "config": { "...": "só quando há testes falhando; ver abaixo" }
  },
  "coverageAnalysis": "perTest",
  "mutate": [
    "src/app/reserva/regras-reserva.service.ts",
    "src/app/reserva/reserva.component.ts",
    "src/app/reserva/sala.service.ts",
    "src/app/reserva/reserva.component.html"
  ],
  "reporters": ["clear-text", "progress", "html", "json"]
}
```

O template entra em `mutate` para que a limitação apareça na medição, e não só na documentação: o Stryker o encontra e gera zero mutantes. Estilos (`.css`) não são mutáveis pelo Stryker.

### Código medido: versão corrigida (principal) e versão com bugs (secundária)

Por padrão, `medir:mutacao` aplica no clone temporário os cinco patches de `gabarito/fixes`, em ordem, e roda o Stryker sobre o **código corrigido**. Com `--versao com-bugs`, mede o código da branch como está. As saídas são separadas: `mutacao.json` e `stryker/` (corrigida), `mutacao-com-bugs.json` e `stryker-com-bugs/` (com bugs). O relatório usa a versão corrigida como mutation score principal e mostra a outra na coluna "Score com bugs".

Motivo: o Stryker exige suíte verde, então a medição precisa excluir os testes que falham no código medido.

- **Sobre o código com bugs**, os testes excluídos são justamente os que afirmam a regra correta e detectam os bugs. Os que afirmam o comportamento com bug continuam e ainda matam mutantes. Por exemplo, `exigeAprovacaoGestor(10) === false` mata o mutante `>` → `>=`, que é exatamente a correção do B1. O score premiaria testes que protegem o bug e ignoraria os que o detectam.
- **Sobre o código corrigido**, o critério se inverte. Os testes que afirmam a especificação ficam na medição, e saem os que só passam com o bug (ou testes quebrados). O score passa a medir o quanto a suíte distingue o comportamento correto de variações dele, que é a pergunta do experimento.

A versão com bugs fica disponível para comparação: a diferença entre os dois scores e entre as duas listas de excluídos mostra quanto da suíte depende dos bugs.

Consequências:

- Os mutantes são gerados a partir do código corrigido, então o total difere um pouco entre as versões. Na sanidade: 137 mutantes no corrigido contra 135 com bugs. A âncora `$` e o `>=` geram mutantes próprios.
- Os patches são aplicados em sequência. Se algum não aplicar sobre a branch, o script para com erro em vez de medir uma versão parcialmente corrigida.
- `mutacao.json` registra `versaoDoCodigo`, `patchesAplicados`, `testesNaExecucaoInicial`, `totalTestesExcluidos`, `testesExcluidosDaMedicao` (nomes completos) e `suitesExcluidasDaMedicao`. O relatório lista os excluídos por suíte e por versão.

### Exclusão de testes que falham no código medido

Implementação, em duas camadas, ambas via `jest.config` do Stryker (merge sobre o mesmo `jest.config.cjs`):

1. Antes do Stryker, o Jest roda uma vez sobre o código medido (corrigido ou com bugs). Os nomes completos dos testes que falharam viram `testNamePattern: ^(?!(?:nome1|nome2)$)`. Lido em `jest-config/build/index.js` (30.5.2): `testNamePattern` é aceito na configuração e o `runCLI` ignora chaves `undefined` do argv, então o padrão vale no dry run. Verificado: o teste excluído aparece como `pending`.
2. `scripts/lib/excluir-testes.cjs` entra em `setupFilesAfterEnv` e transforma esses testes em no-op. É necessário porque nas execuções de mutante o Stryker passa o próprio `testNamePattern` pelo argv, sem âncoras, substituindo o da configuração: um teste excluído cujo nome contém o nome de um teste que cobre o mutante volta a rodar. Verificado com o par `"… B2 limite"` (passa) e `"… B2 limite noturno"` (falha): com o filtro `(… B2 limite)`, sem o setup o segundo roda e falha; com o setup ele passa sem executar o corpo. O setup envolve `it`, `test`, `fit` e suas variantes `.each`, `.only` e `.concurrent`; usa `expect.getState().currentTestName`, que tem o mesmo formato de `fullName` do reporter JSON.

Arquivos de teste que nem carregam (erro de compilação) vão para `testPathIgnorePatterns` e para `suitesExcluidasDaMedicao`.

Limitações dessa decisão:

- Um teste excluído ainda executa os `beforeEach` do seu `describe` se voltar a rodar numa execução de mutante; se o hook falhar sob o mutante, conta como morte. Os outros testes do mesmo `describe` passariam pelo mesmo hook, então o efeito é raro.
- Testes que importam `it`/`test` de `@jest/globals` não passam pelo setup da camada 2 (a camada 1 continua valendo).
- O no-op faz o teste passar sem asserções; ele não mata mutantes, que é o efeito desejado.

## Detecção de bugs (`medir:bugs`)

- A suíte roda **duas vezes** sobre o código com bugs; testes com resultados diferentes entre as duas execuções são registrados como instáveis e saem da classificação.
- Para cada `gabarito/fixes/bug-0N.patch`: `git apply --check`, `git apply`, Jest, `git checkout -- .`.
- Identificador do teste: `arquivo › describe… › título`, com sufixo `#n` para nomes repetidos.
- Critérios exatamente como no enunciado: **detectado** (falha com bug, passa corrigido), **protegido** (passa com bug, falha corrigido), **ignorado** (nenhum muda). Detectado e protegido podem coexistir.
- Testes que somem depois da correção (por exemplo, arquivo que deixa de compilar) são listados em `testesAusentesAposCorrecao`.

## Cobertura (`medir:cobertura`)

`jest --coverage --coverageReporters=json-summary` com `--collectCoverageFrom` restrito aos três arquivos `.ts`-alvo, então arquivos-alvo sem nenhum teste aparecem com 0% (o Jest os instrumenta mesmo sem import). O template não tem cobertura no Istanbul. O total soma linhas e branches cobertas dos três arquivos.

## Padrões (`medir:padroes`)

Contagens por expressão regular sobre o texto dos `.spec.ts` da branch, excluindo `src/app/app.spec.ts` (já existe na base). É heurística, declarada como tal no JSON e no relatório. Os padrões estão no topo de `scripts/medir-padroes.mjs` e no campo `padroes` do JSON.

## Problemas encontrados

1. **`ERR_MODULE_NOT_FOUND: typescript`** no core do Stryker (`ts-config-preprocessor.js`). O core importa `typescript` sem declará-lo como dependência e conta com o hoisting do npm. Com pnpm isso falha. Solução: `typescript@6.0.3` (mesma versão da aplicação) como devDependency deste repositório. O preprocessador só usa `parseConfigFileTextToJson`.
2. **Plugins não encontrados pelo glob** no layout do pnpm (ver `plugin-loader.js` acima). Solução: caminho absoluto em `plugins`.
3. **Dry run com testes falhando** aborta o Stryker. Solução descrita em "Código medido" e "Exclusão de testes que falham no código medido".

## Validação (testes de sanidade descartáveis)

Feita num clone descartável da aplicação, no diretório temporário da sessão, com branches que **nunca foram commitadas nem enviadas** ao repositório da aplicação. Os resultados foram apagados de `resultados/` depois.

Rodada atual, sobre a `main` reescrita (`59815bf`):

1. `sanidade-trivial`: um único teste, `cabeNaSala(4, 4) === true`. Versão corrigida: os 5 patches foram aplicados (a fonte no relatório tem `\d{3}$`, `>= 10` e `hora < 20`) e foram instrumentados 137 mutantes em 4 arquivos, nenhum no `.html`. O mutante esperado, `EqualityOperator` em `regras-reserva.service.ts:16` (`participantes <= capacidade` → `participantes < capacidade`), foi **morto** pelo único teste. Nenhum teste excluído.
2. `sanidade-bugs`: um teste por bug escrito para detectá-lo, um teste que afirma o comportamento com bug de B1 (`B1 protege`), o par `B2 limite` / `B2 limite noturno` e testes neutros.
   - Versão corrigida: **1 teste excluído**, `B1 protege`, o único que falha com o código corrigido. Dry run verde, score 33,58%, nenhum teste excluído em `killedBy`.
   - Versão com bugs (`--versao com-bugs`): 6 testes excluídos (os cinco "detecta" e `B2 limite noturno`), score 11,11%, idêntico ao da rodada anterior sobre a `main` antiga.
   - `medir:bugs`: B1 detectado e protegido, B2 a B5 detectados.
   - `medir:cobertura`, `medir:padroes` e `relatorio` geraram as saídas esperadas, inclusive a seção de testes excluídos.

Rodada anterior (sobre a `main` antiga, `f6db726`, com o mesmo `src/`): validou a segunda camada da exclusão. Com o filtro `(… B2 limite)`, sem o setup o teste `B2 limite noturno` roda e falha; com o setup ele passa sem executar o corpo.
