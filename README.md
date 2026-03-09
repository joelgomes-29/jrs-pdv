# JRS PDV V4

Versão 4 sem SQLite nativo.
Ela usa banco em arquivo JSON e evita o erro do better-sqlite3 no Windows.

## Recursos
- login
- usuários e vendedores
- caixa diário
- transferência entre lojas por IMEI
- leitura por código de barras
- entrada de nota
- venda com baixa por IMEI
- assistência / reembalo
- financeiro com receitas e despesas
- rankings no dashboard
- atualização em tempo real
- 11 lojas e produtos seed

## Login padrão
- usuário: admin
- senha: 123456

## Como rodar
npm install
npm start

Abra:
http://localhost:3000


## Ajuste visual
Dashboard redesenhado no estilo do projeto JRS_PDV_ERP_V5_BROWSER.


## V7
- navegação lateral profissional
- cada aba abre sozinha
- visual mais corporativo
- rodapé operacional
- transições mais limpas


## V8
- importação de XML de NFe
- leitura do XML e pré-visualização dos itens
- aplicação automática do fornecedor, número da nota e produto no formulário de entrada


## V9 REALME Multi-loja
- 11 lojas reais cadastradas
- filtro global multi-loja com opção Todas as lojas
- remoção de Marketing
- remoção da área de venda do dashboard
- módulo Clientes para base central e futura integração com app Android
- módulo Funcionários por loja
- filtros por loja em estoque, financeiro, clientes, funcionários e transferências
