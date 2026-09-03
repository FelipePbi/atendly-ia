<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Atendly frontend

### Current stack

Use somente stack instalada: Next.js 16 App Router, React 19, TypeScript strict, CSS próprio, `clsx`, Zod e contrato legal local. Tailwind, shadcn e bibliotecas de componentes não fazem parte deste app.

### Design contract

- `apps/frontend-open-design` é referência imutável de design, não dependência de runtime.
- Consulte `DESIGN-HANDOFF.md`, `DESIGN-MANIFEST.json` e HTML/CSS/JS da tela antes de alterar UI.
- `apps/frontend` é implementação React/Next real e base visual aprovada.
- Não importe HTML ou JavaScript do Open Design diretamente.
- Preserve layout, navegação, copy, tokens e CSS atual durante refatoração de backend.

### Architecture

Mantenha estrutura atual:

```text
src/app/       rotas e layouts
src/features/  módulos de produto
src/shared/    UI, layout, ícones e estilos compartilhados
src/mocks/     dados e adapters temporários
```

Evite lógica de acesso a dados dentro de componentes. Contrato futuro:

```text
UI → service adapter → BFF
```

Nunca use `component → fetch` aleatório.

### Backend boundary

Frontend conhece exclusivamente BFF. Não importe nem referencie URLs de AI Orchestrator, Scheduling Service, Evolution Go ou Minha Agenda.

### Mocks e preview

- Estado atual usa `Mock*Service`; não conecte BFF antes de GOAL 12/13.
- Após integração: produto real usa `Bff*Service`; `/_preview` continua usando `Mock*Service`.
- Não remova `/_preview`; ele preserva catálogo de estados visuais.

### UI freeze e styling

- Alterações de backend não autorizam mudanças visuais.
- Adapte dados ao design existente.
- Preserve CSS atual.
- Não introduza Tailwind, shadcn ou novo design system por preferência.
