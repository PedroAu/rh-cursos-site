# Blog: separar acervo e editor

Status: Ready for Review

## Solicitação

Refinar a gestão do blog para que o acervo e o formulário de edição ocupem páginas próprias.

## Critérios de aceite

- [x] `/admin/blog` exibe apenas o acervo, busca, filtros e ações de abrir/criar artigo.
- [x] `/admin/blog/novo` abre um editor dedicado; cada artigo tem uma URL de edição.
- [x] O editor tem retorno ao acervo, preview, salvamento e ações editoriais existentes.
- [x] Abrir um artigo não dispara autosave; voltar pelo editor salva alterações pendentes ou apresenta erro.
- [x] Rotas inexistentes apresentam mensagem clara e retorno ao acervo.
- [x] Verificação de navegação, isolamento das telas, lint e TypeScript.

## Validação

- 82 arquivos / 814 testes unitários aprovados, incluindo seis cenários do módulo.
- Typecheck, lint e build com configuração local aprovados.
- Navegação acervo → edição → prévia → acervo verificada no navegador local.
- Campos de conteúdo e título ajustados para ocupar a largura do editor.
- Nenhuma migration ou alteração de banco necessária para este refinamento.

## File List

- `src/features/admin/blog/admin-blog-page.tsx`
- `src/features/admin/blog/admin-blog-editor.tsx`
- `app/admin/blog/novo/page.tsx`
- `app/admin/blog/[id]/editar/page.tsx`
- `src/__tests__/features/admin-blog.test.tsx`
- `docs/stories/2026-09-14-blog-acervo-editor-separados.md`
