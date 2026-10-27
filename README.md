# Sistema de Ordens de Serviço e Orçamentos

Clientes, orçamentos, ordens de serviço e PDFs para assistência de informática.
Site estático (HTML + JavaScript), sem etapa de build.

## Rodar no computador
```
npx serve . -l 3000
```
Abra http://localhost:3000. Sem Firebase configurado, o sistema funciona em **modo local**:
os dados ficam só no navegador daquele aparelho (sem login). Use *Configurações → Exportar backup* para guardar uma cópia.

## Ligar o Firebase (login + dados na nuvem)
1. Em https://console.firebase.google.com crie um projeto.
2. **Authentication → Método de login → E-mail/senha** (ative) e, em *Usuários*, crie o seu usuário.
3. **Firestore Database → Criar banco de dados**.
4. Em *Firestore → Regras*, cole o conteúdo de `firestore.rules` e publique.
5. **Configurações do projeto → Seus apps → Web (</>)**: copie as credenciais para `js/firebase-config.js`.
6. Em *Authentication → Configurações → Domínios autorizados*, adicione o domínio da Vercel.

Cada usuário só enxerga os próprios dados (`users/{uid}/...`). Não deixe o Firestore em "modo de teste".

## Publicar na Vercel
- Pelo site: suba esta pasta para um repositório no GitHub → *Add New Project* na Vercel → Framework "Other", sem build command, output na raiz.
- Ou pela CLI: `npx vercel --prod` dentro da pasta.

## Como usar
- **Clientes**: cadastro e pesquisa por nome, telefone ou CPF/CNPJ.
- **Orçamento**: escolha o cliente, lance item por item (serviço ou peça, quantidade, valor), aplique desconto em R$ ou %, e gere o PDF ou envie o resumo pelo WhatsApp.
- **Converter em OS**: no orçamento salvo, botão *Converter em OS*. Os itens e o cliente são copiados.
- **Ordem de serviço**: registre problema, serviço realizado, acessórios, pagamento (forma, situação, valor pago) e gere o PDF com campo de assinatura.
- **Configurações**: dados da empresa (aparecem nos PDFs), validade e garantia padrão, termos, chave PIX e catálogo de serviços com preços.

## Estrutura
```
index.html            página única
css/style.css         visual (celular: menu inferior, tabelas viram cartões)
js/app.js             telas e rotas
js/db.js              dados: Firestore ou localStorage
js/pdf.js             PDFs (jsPDF)
js/util.js            formatação, cálculos, listas de opções
js/firebase-config.js credenciais do Firebase
firestore.rules       regras de segurança
vercel.json           configuração de publicação
```
