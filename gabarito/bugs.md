# Gabarito dos bugs plantados

Referência: o código de produção de `reserva-salas-poc` está no commit `59815bf` ("Adiciona formulário de reserva de salas"), que é a ponta da `main`. A `base-com-especificacao` (`c0c69ce`) só acrescenta `docs/especificacao-reserva.md`, e as branches de rodada só podem acrescentar arquivos `.spec.ts`. Os números de linha valem para todas essas branches. A branch `experimento` (`a11dd63`) tem os prompts e o protocolo e nunca é usada como base de geração.

Cada bug tem um patch independente em `fixes/bug-0N.patch`, que corrige **somente** aquele bug e aplica limpo sobre a `main` e a `base-com-especificacao` (`pnpm verificar:patches --app <repo> --branch <branch>`). Os cinco também aplicam juntos, em ordem, que é como `medir:mutacao` monta a versão corrigida.

| Bug | Regra | Arquivo:linha | Código com bug | Correção | Natureza |
|---|---|---|---|---|---|
| B1 | R4 | `src/app/reserva/regras-reserva.service.ts:20` | `return participantes > 10;` | `return participantes >= 10;` | fronteira, no service |
| B2 | R5 | `src/app/reserva/regras-reserva.service.ts:28` | `return hora >= 7 && hora <= 20;` | `return hora >= 7 && hora < 20;` | fronteira, no service |
| B3 | R2 | `src/app/reserva/regras-reserva.service.ts:3` | `/^[A-Z]{2}-\d{3}/` | `/^[A-Z]{2}-\d{3}$/` | validação, no service |
| B4 | R6 | `src/app/reserva/reserva.component.html:58` | `[disabled]="form.invalid && !enviando()"` | `[disabled]="form.invalid \|\| enviando()"` | lógica no template |
| B5 | R7 | `src/app/reserva/reserva.component.ts:76-79` | o `tap` não limpa `sala` | `this.sala.set(null);` no início do `tap` | estado assíncrono |

## B1 — aprovação do gestor a partir de 10 participantes (R4)

`exigeAprovacaoGestor(10)` devolve `false`; a regra exige `true`. Só 11 ou mais disparam o aviso "Esta reunião precisa de aprovação do gestor." e o campo `exigeAprovacaoGestor` do envio. Detectável apenas com o valor exato da fronteira (10).

## B2 — início às 20h00 aceito (R5)

`horarioInicioPermitido('20:00')` (e qualquer horário de `20:00` a `20:59`) devolve `true`; a regra fecha em `19:59`. O validador `horarioNaoPermitido` do componente herda o erro. Detectável com `20:00`–`20:59`.

## B3 — código da sala sem âncora final (R2)

A expressão regular não tem `$`, então aceita qualquer sufixo após os três dígitos: `AZ-1012`, `AZ-101X`, `AZ-101 `. Códigos curtos (`AZ-10`) e prefixos errados continuam rejeitados. Com o bug, o componente também consulta a API para esses códigos.

## B4 — botão "Reservar" com `&&` em vez de `||` (R6)

Com `form.invalid && !enviando()`:

- formulário válido e envio em andamento → `false && …` → botão **habilitado**, permitindo envio duplicado (`reservar()` só verifica `form.invalid`);
- formulário inválido e envio em andamento → botão habilitado (caso raro, mas também errado);
- formulário inválido sem envio → desabilitado (o caso comum funciona, o que esconde o bug).

O erro está só no template; nenhuma propriedade do componente o revela. **O Stryker não gera mutantes para bindings de templates Angular**, então esse bug fica fora do alcance do mutation score, tanto na versão corrigida quanto na versão com bugs.

## B5 — dados da sala anterior permanecem durante a nova consulta (R7)

Ao alterar o código, o `tap` liga `consultandoSala` mas não limpa `sala`. O template testa `sala()` antes de `consultandoSala()`:

```html
@if (sala(); as sala) { … nome e capacidade … }
@else if (consultandoSala()) { Consultando sala… }
```

Resultado: depois de uma primeira consulta bem-sucedida, trocar o código mantém nome e capacidade da sala anterior na tela, e "Consultando sala…" não aparece, até a nova resposta chegar (depois do `debounceTime(300)` e da requisição). Na primeira consulta, sem sala anterior, "Consultando sala…" aparece normalmente, o que esconde o bug. Efeito colateral: durante esse intervalo a validação de capacidade (R3) usa a capacidade da sala anterior.

Detectar exige: uma consulta concluída, alteração do código e verificação **antes** da resposta da segunda consulta (controle do debounce e da resposta HTTP).
