import { ArrowDown, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { A, Bullets, Faq, Go, H3, Sec, Steps, Term, Tip, UI, Warn, Why } from "./parts";
import type { TocItem } from "./nav";

/**
 * Conteúdo da página “Como usar” do módulo Editais.
 * Fica em código (sem banco): para editar, mude os textos abaixo. Os nomes de botões, abas e campos seguem as telas reais;
 * se uma tela mudar, atualize aqui e em src/lib/help.ts (artigos “editais” e “esteira-de-proposta”).
 */

export const TOC: TocItem[] = [
  { id: "visao-geral", n: 1, title: "Visão geral em 1 minuto" },
  { id: "primeiro-dia", n: 2, title: "Primeiro dia: configuração" },
  { id: "oportunidades", n: 3, title: "Encontrar oportunidades" },
  { id: "triagem", n: 4, title: "Triagem: decidir o que olhar" },
  { id: "participar", n: 5, title: "Participar de um edital" },
  { id: "cofre-portfolio", n: 6, title: "Cofre e portfólio" },
  { id: "avisos", n: 7, title: "Avisos e automações" },
  { id: "permissoes", n: 8, title: "Quem pode o quê e celular" },
  { id: "rotina", n: 9, title: "Rotina e boas práticas" },
  { id: "faq", n: 10, title: "Perguntas e problemas" },
  { id: "glossario", n: 11, title: "Glossário" },
  { id: "aviso", n: 12, title: "Aviso importante" },
];

/* ------------------------------ diagrama do caminho ------------------------------ */

const FLOW: { name: string; phase: string; text: string; where: string }[] = [
  { name: "Oportunidade", phase: "Achar", text: "O CRM varre o PNCP e lista os editais de restauro, cada um com uma nota de relevância.", where: "Editais → Oportunidades" },
  { name: "Triagem", phase: "Decidir", text: "Você marca Interessante, Em análise ou descarta com um motivo.", where: "Gaveta do edital → Triagem" },
  { name: "Vou participar", phase: "Decidir", text: "Um toque monta o checklist com prazos, as tarefas e a lista de documentos.", where: "Gaveta do edital → Esteira de proposta" },
  { name: "Dossiê", phase: "Preparar", text: "A página da proposta: contagem regressiva, 8 etapas e barra de progresso.", where: "Editais → Propostas em andamento" },
  { name: "Habilitação", phase: "Preparar", text: "Certidões, atestados e declarações. A matriz confere tudo com o cofre.", where: "Dossiê → Matriz de habilitação" },
  { name: "Proposta técnica e de preço", phase: "Preparar", text: "Gera os documentos, escolhe atestados e cria a planilha de preços.", where: "Dossiê → Documentos e planilha de preços" },
  { name: "Envio", phase: "Entregar", text: "Revisão interna por outra pessoa e envio no portal do órgão, um dia antes.", where: "Portal do órgão + etapa Envio" },
  { name: "Resultado", phase: "Entregar", text: "Ganhou, perdeu, desclassificada ou desistência, sempre com o motivo.", where: "Dossiê → Resultado" },
];

function Flow() {
  return (
    <figure className="grid gap-2">
      <ol aria-label="Caminho de um edital, da oportunidade ao resultado" className="grid gap-2 lg:grid-cols-4 lg:gap-3">
        {FLOW.map((s, i) => (
          <li key={s.name} className="relative grid">
            <div className="grid content-start gap-1.5 rounded-xl border bg-card p-3.5">
              <div className="flex items-center gap-2">
                <span aria-hidden className="num grid size-7 shrink-0 place-items-center rounded-full bg-brand text-[13px] font-semibold text-on-brand">
                  {i + 1}
                </span>
                <span className="label">{s.phase}</span>
              </div>
              <p className="text-[15px] leading-snug font-semibold">{s.name}</p>
              <p className="text-[13.5px] leading-snug text-muted-foreground">{s.text}</p>
              <p className="mt-0.5 text-[12.5px] leading-snug">
                <span className="text-muted-foreground">Onde: </span>
                {s.where}
              </p>
            </div>
            {i < FLOW.length - 1 && (
              <>
                <ArrowDown aria-hidden className="mx-auto mt-2 -mb-1 size-5 text-brand lg:hidden" />
                <ArrowRight aria-hidden className={cn("absolute top-1/2 -right-[1.35rem] hidden size-5 -translate-y-1/2 text-brand", i % 4 !== 3 && "lg:block")} />
              </>
            )}
          </li>
        ))}
      </ol>
      <figcaption className="text-xs text-muted-foreground">
        As setas indicam a ordem. Em qualquer ponto você pode voltar: descartar um edital, desistir da proposta ou reabri-la.
      </figcaption>
    </figure>
  );
}

/* ------------------------------ seções ------------------------------ */

function Visao() {
  return (
    <Sec id="visao-geral" n={1} title="Visão geral em 1 minuto" lead="O módulo Editais acha licitações públicas de restauro e ajuda sua equipe a preparar a proposta sem perder prazo.">
      <Why>
        <p>
          Prefeituras, estados e órgãos federais publicam editais de restauro, de projeto, de obra e de laudo no <strong>PNCP</strong> (Portal Nacional de Contratações Públicas). O CRM procura esses editais todos os dias, dá uma nota de relevância a cada um e deixa a equipe decidir.
          Quando a equipe decide participar, o CRM monta a esteira: checklist com prazos, tarefas, lista de documentos de habilitação, modelos de documentos e planilha de preços.
        </p>
        <p>
          O sistema <strong>não envia a proposta por você</strong>: ele organiza tudo e lembra os prazos. O envio é feito no portal do órgão.
        </p>
      </Why>
      <Flow />
      <Bullets title="As abas do módulo (barra logo abaixo do título Editais)">
        <>
          <UI>Oportunidades</UI>: a lista de editais encontrados.
        </>
        <>
          <UI>Propostas em andamento</UI>: as propostas em preparação, com contagem regressiva, progresso e pendências.
        </>
        <>
          <UI>Cofre de habilitação</UI>: certidões e documentos da empresa, com validade.
        </>
        <>
          <UI>Atestados e portfólio</UI>: obras e projetos já feitos, para a proposta técnica.
        </>
        <>
          <UI>Configuração</UI>: dados do estúdio, responsáveis técnicos, BDI e modelos. Só aparece para quem tem acesso “Gerenciar” em Editais.
        </>
      </Bullets>
      <Tip>
        Sem tempo? Leia as seções <A href="#primeiro-dia">2</A> (configuração) e <A href="#participar">5</A> (participar de um edital). O resto você consulta quando precisar. O botão <UI>Como usar</UI> fica no canto direito da barra de abas de todas as telas de Editais.
      </Tip>
    </Sec>
  );
}

function Primeiro() {
  return (
    <Sec id="primeiro-dia" n={2} title="Primeiro dia: o que preencher antes de tudo" lead="Dez minutos agora evitam documentos com campos vazios e propostas sem responsável depois.">
      <Why>
        <p>
          Os dados do estúdio e dos responsáveis técnicos entram sozinhos nas cartas, nas declarações e na proposta técnica. Os padrões (BDI, validade) alimentam a planilha de preços. O cofre e o portfólio são consultados em toda proposta.
        </p>
      </Why>
      <Steps title="Checklist do primeiro dia">
        <>
          <A href="/editais/configuracao">Editais → Configuração</A> → cartão <UI>Dados do estúdio</UI>: Nome fantasia, Razão social, CNPJ, Cidade / UF, Endereço, E-mail e Telefone.
        </>
        <>
          Cartão <UI>Representante legal</UI>: Nome, CPF e Cargo de quem assina pela empresa.
        </>
        <>
          Cartão <UI>Responsáveis técnicos</UI>: toque em <UI>Adicionar responsável técnico</UI> e preencha Nome, Profissão, Registro profissional (CREA ou CAU) e CPF. O primeiro da lista é o principal e aparece nas declarações.
        </>
        <>
          Cartão <UI>Padrões da proposta</UI>: BDI padrão (%), Encargos sobre mão de obra (%), Validade da proposta (dias), o modelo de checklist para obra, para projeto/laudo e para dispensa, e a Etapa do funil ao enviar a proposta (o negócio vai para ela quando você concluir o envio).
        </>
        <>
          Cartão <UI>Quem cuida de cada função</UI>: escolha a pessoa de Coordenação, Responsável técnico, Orçamento, Administrativo e Jurídico. Os itens do checklist já nascem com o responsável certo.
        </>
        <>
          Cartão <UI>Motivos de perda</UI>: já vem uma lista pronta (um motivo por linha). Ajuste se quiser.
        </>
        <>
          Toque em <UI>Salvar configuração</UI> (o botão fica fixo no rodapé da tela).
        </>
        <>
          <A href="/editais/cofre">Cofre de habilitação</A>: cadastre as certidões e o contrato social primeiro (veja a seção <A href="#cofre-portfolio">6</A>).
        </>
        <>
          <A href="/editais/portfolio">Atestados e portfólio</A>: cadastre as 3 obras mais fortes do estúdio.
        </>
        <>
          <A href="/documentos/modelos">Documentos → Modelos e cláusulas</A>: peça ao jurídico para revisar os modelos que começam com “Licitação:” (carta-proposta, proposta comercial, proposta técnica, declarações, renúncia a recurso, pedido de esclarecimento e impugnação). Em Configuração, no fim da tela, revise também os <UI>Modelos de checklist e de habilitação</UI>.
        </>
      </Steps>
      <div className="flex flex-wrap gap-2">
        <Go href="/editais/configuracao">Abrir Configuração</Go>
        <Go href="/editais/cofre">Abrir o Cofre</Go>
        <Go href="/editais/portfolio">Abrir o Portfólio</Go>
        <Go href="/documentos/modelos">Abrir Modelos de documentos</Go>
      </div>
      <Tip>No topo da Configuração há uma faixa “Comece por aqui” que avisa o que ainda falta (razão social, CNPJ, endereço, representante legal e pelo menos um responsável técnico).</Tip>
      <Warn>
        Se você não vê a aba <UI>Configuração</UI>, seu acesso a Editais é “Ver” ou “Editar”. Peça a um administrador para ajustar em Equipe e acessos. Sem esses dados, os documentos gerados saem com campos em destaque para completar à mão.
      </Warn>
    </Sec>
  );
}

function Oportunidades() {
  return (
    <Sec id="oportunidades" n={3} title="Encontrar oportunidades" lead="Como o CRM descobre editais, como ler cada cartão e como filtrar.">
      <Why>
        <p>
          Todo dia o CRM consulta o PNCP e guarda só o que parece restauro de patrimônio. Você abre <A href="/editais">Editais → Oportunidades</A>, vê o que é novo e decide o que vale a pena.
        </p>
      </Why>

      <H3>Como os editais chegam</H3>
      <Bullets>
        <>
          <strong>Varredura completa automática</strong>: roda no GitHub todos os dias às 06:17 (horário de Brasília), mesmo sem ninguém pedir.
        </>
        <>
          <strong>A cada 30 minutos</strong> o GitHub confere se alguém pediu uma busca e, se houver pedido, faz a varredura completa.
        </>
        <>
          <strong>Varredura rápida</strong>: ao tocar em <UI>Buscar oportunidades</UI> ela roda na hora, no próprio sistema (cerca de 30 segundos), nas buscas mais importantes.
        </>
      </Bullets>

      <Steps title="Pedir uma busca agora">
        <>
          Em <A href="/editais">Editais → Oportunidades</A>, toque em <UI>Buscar oportunidades</UI> (aparece para quem pode editar Editais).
        </>
        <>
          Aparece o aviso “Busca pedida: a varredura rápida já começou e o GitHub fará a completa”. Se já havia um pedido aberto, o aviso diz isso: não precisa pedir de novo.
        </>
        <>
          Acompanhe a faixa acima da lista. Ela se atualiza sozinha a cada poucos segundos e, quando termina, a lista recarrega.
        </>
        <>
          Confira os números: “N editais novos, N relevantes encontrados”. Os novos aparecem em <UI>Novos · 7 dias</UI>.
        </>
      </Steps>

      <Bullets title="Os estados da busca (faixa acima da lista)">
        <>
          <UI>Solicitada</UI>: o pedido foi gravado e o GitHub atende em até cerca de 30 minutos.
        </>
        <>
          <UI>Executando</UI>: a varredura está rodando. Mostra quantos editais foram vistos e quantos são novos; o link “ver execução” abre o GitHub.
        </>
        <>
          <UI>Concluída</UI>: terminou. Mostra quantos são novos e quantos relevantes entre os vistos.
        </>
        <>
          <UI>Parcial</UI>: parou no meio (o PNCP demorou ou recusou). Será retomada sozinha.
        </>
        <>
          <UI>Falhou</UI>: houve um erro, que aparece na faixa. Tente de novo mais tarde.
        </>
      </Bullets>

      <H3>Como ler um cartão</H3>
      <Bullets>
        <>
          <strong>Relevância (0 a 100)</strong>: o selo com o número e o rótulo Alta, Boa ou Possível.
        </>
        <>
          <strong>Objeto e órgão</strong>: o que será contratado e quem contrata.
        </>
        <>
          <strong>Local</strong>: município · UF, e a <strong>esfera</strong> (Federal, Estadual, Municipal ou Distrital).
        </>
        <>
          <strong>Tipo</strong>: Projeto, Execução, Projeto + obra, Laudo ou Outro.
        </>
        <>
          <strong>Valor</strong>: o estimado, ou “valor não informado” (é comum o órgão não divulgar).
        </>
        <>
          <strong>Prazo</strong>: “Encerra em N dias”. Em terracota, com um ponto, quando faltam 7 dias ou menos.
        </>
        <>
          <strong>Triagem e responsável</strong>: a situação que a equipe deu ao edital e quem cuida dele.
        </>
      </Bullets>
      <p>
        Toque no cartão para abrir a gaveta de detalhes. Lá, o quadro <UI>Por que apareceu aqui</UI> mostra os termos que casaram e a classificação do tipo, para você auditar. Os botões <UI>Abrir no PNCP</UI> e <UI>Portal de origem (proposta)</UI> levam ao edital oficial e ao portal onde a proposta é enviada.
      </p>

      <H3>Relevância: quando confiar e quando desconfiar</H3>
      <Bullets>
        <>
          A nota vem de <strong>regras sobre o texto do objeto</strong>, não de inteligência artificial. Termos de restauro e de patrimônio somados a termos de obra ou projeto pontuam alto. Ruído conhecido é descartado: restauração dentária, florestal, de pavimento ou de veículos, tombamento patrimonial de móveis e energia solar, por exemplo.
        </>
        <>
          <strong>Alta (70 ou mais)</strong>: quase sempre é restauro de fato. <strong>Boa (50 ou mais)</strong>: é o padrão da lista; leia o objeto. <strong>Possível (35 ou mais)</strong>: duvidoso, só aparece se você baixar a relevância mínima. Abaixo de 35 o edital nem é guardado.
        </>
        <>
          Desconfie quando o selo for Boa ou Possível e os termos que casaram forem só genéricos (igreja, museu, histórico). Desconfie também de objetos vagos, como “reforma de prédio público”: podem ser de prédio tombado e pontuar baixo.
        </>
      </Bullets>

      <H3>Filtros, ordem e exportação</H3>
      <Bullets>
        <>
          Os quatro números do topo (<UI>Abertos e relevantes</UI>, <UI>Novos · 7 dias</UI>, <UI>Encerram em 7 dias</UI> e <UI>Acompanhando</UI>) são atalhos: toque para filtrar.
        </>
        <>
          <UI>Tipo</UI>: Todos, Projeto de restauro, Execução (obra), Laudo / consultoria. <UI>Estados</UI>: botões de UF com a quantidade de editais de cada uma.
        </>
        <>
          <UI>Buscar objeto, órgão, cidade…</UI>: busca por palavra.
        </>
        <>
          <UI>Filtros</UI> (gaveta): Tipo de contratação, Relevância mínima, Situação do edital, Prazo de propostas, Triagem da equipe, Responsável, Esfera, Estados (UF), Município e Valor mínimo/máximo. Termine com <UI>Aplicar filtros</UI>, ou use <UI>Limpar</UI>.
        </>
        <>
          <UI>Ordem</UI>: prazo, relevância, valor ou recentes.
        </>
        <>
          Padrão da tela: só editais abertos, relevância 50 ou mais, sem os descartados, por ordem de prazo. O número ao lado de Filtros mostra quantos filtros estão ligados.
        </>
        <>
          Os filtros ficam no endereço da página: copie o link para mostrar a mesma lista a um colega.
        </>
        <>
          <UI>Exportar CSV</UI> baixa a lista com exatamente os filtros da tela (abre no Excel).
        </>
        <>
          Se houver mais de 40 resultados, o botão <UI>Mostrar mais</UI> aparece no fim da lista.
        </>
      </Bullets>
      <Warn>
        Nem todo edital está no PNCP, e a triagem por regras pode deixar passar um edital bom ou trazer um que não serve. Antes de decidir, <strong>sempre abra o edital oficial</strong> (<UI>Abrir no PNCP</UI>) e confira objeto, datas, exigências e retificações.
      </Warn>
    </Sec>
  );
}

function Triagem() {
  return (
    <Sec id="triagem" n={4} title="Triagem: decidir o que olhar" lead="Classificar cada edital novo em poucos segundos e deixar um responsável.">
      <Why>
        <p>A triagem separa o que vale tempo da equipe do que não vale, registra o motivo e define quem recebe os lembretes de prazo.</p>
      </Why>
      <Steps>
        <>
          Em <A href="/editais">Oportunidades</A>, toque no edital. A gaveta abre com objeto, datas e links.
        </>
        <>
          Na seção <UI>Triagem</UI>, escolha: <UI>Interessante</UI> (quero acompanhar), <UI>Em análise</UI> (estou lendo o edital) ou <UI>Descartar…</UI>.
        </>
        <>
          Ao descartar, escolha o <UI>Motivo do descarte</UI> (fora do escopo, valor abaixo do mínimo, longe demais, exige acervo técnico que não temos, prazo curto demais, já vencido ou suspenso, duplicado ou Outro, com uma explicação curta) e toque em <UI>Confirmar descarte</UI>.
        </>
        <>
          Em <UI>Responsável</UI>, escolha quem cuida do edital. Quem marca Interessante ou Em análise assume o edital se ninguém tinha assumido, e passa a receber os lembretes.
        </>
        <>
          Em <UI>Anotações</UI>, escreva exigências, ideias de preço e contatos do órgão e toque em <UI>Salvar anotações</UI>.
        </>
        <>
          Em <UI>Histórico</UI>, registre o que acontecer (ligou para o órgão, pediu esclarecimento…) com o botão <UI>Registrar</UI>. Toda mudança de triagem também entra aí.
        </>
        <>
          Em <UI>Negócio e prazo</UI>, use <UI>Criar negócio a partir do edital</UI> (nome, contato do órgão, valor e local; marque a opção para criar também a tarefa “Enviar proposta” com o prazo) ou <UI>Criar tarefa com o prazo</UI> se só quiser o lembrete. Se o negócio já existe, aparece <UI>Abrir o negócio deste edital</UI>.
        </>
      </Steps>
      <Bullets title="Os outros estados de triagem">
        <>
          <UI>Em proposta</UI>: o edital ganha esse estado sozinho quando você toca em Vou participar.
        </>
        <>
          <UI>Proposta enviada</UI>, <UI>Ganho</UI> e <UI>Perdido</UI>: o dossiê atualiza ao concluir a etapa Envio e ao registrar o Resultado. Também há botões na gaveta, caso você queira marcar à mão.
        </>
        <>
          <UI>Voltar para novo</UI>: devolve o edital ao estado inicial (também serve para reabrir um descartado).
        </>
      </Bullets>
      <Tip>Faça a triagem no mesmo dia em que o edital aparece. Descartar com o motivo certo não custa nada e, depois, ajuda a entender por que a equipe diz não.</Tip>
      <Warn>Criar negócio exige acesso de edição a Negócios e a Leads e contatos. Criar tarefa exige edição em Tarefas. Sem esses acessos, os botões não funcionam.</Warn>
    </Sec>
  );
}

const STEP_ROWS: { n: number; name: string; prazo: string; text: string }[] = [
  { n: 1, name: "Analisar o edital", prazo: "9 dias úteis antes", text: "Ler edital e anexos e decidir se vale participar (go / no-go)." },
  { n: 2, name: "Esclarecimentos e impugnação", prazo: "5 dias úteis antes", text: "Tirar dúvidas e, se preciso, impugnar. Há prazo legal antes da sessão: confira no edital." },
  { n: 3, name: "Habilitação", prazo: "3 dias úteis antes", text: "Reunir certidões, atestados e declarações exigidos (veja a matriz)." },
  { n: 4, name: "Proposta técnica", prazo: "3 dias úteis antes", text: "Metodologia, equipe, cronograma e atestados. Nem todo edital exige." },
  { n: 5, name: "Proposta de preço", prazo: "2 dias úteis antes", text: "Planilha de preços, BDI e carta-proposta." },
  { n: 6, name: "Revisão interna", prazo: "2 dias úteis antes", text: "Uma segunda pessoa confere tudo contra o edital, item por item." },
  { n: 7, name: "Envio / protocolo", prazo: "1 dia útil antes", text: "Subir no portal ou protocolar, sem sufoco." },
  { n: 8, name: "Resultado", prazo: "na data limite", text: "Registrar se ganhou, perdeu ou foi desclassificado, com o motivo." },
];

function Participar() {
  return (
    <Sec id="participar" n={5} title="Participar de um edital, passo a passo" lead="Do “Vou participar” ao resultado, dentro do dossiê da proposta.">
      <Why>
        <p>
          O <strong>dossiê</strong> é a página da proposta. Ele junta num lugar só as 8 etapas, o checklist, a matriz de habilitação, os documentos, a planilha de preços e o resultado. Assim ninguém precisa lembrar de memória o que falta.
        </p>
      </Why>

      <H3>5.1 Criar o dossiê (“Vou participar”)</H3>
      <Steps>
        <>
          Abra o edital em <A href="/editais">Oportunidades</A>. No quadro <UI>Esteira de proposta</UI>, toque em <UI>Vou participar</UI>.
        </>
        <>
          Escolha o <UI>Modelo de checklist</UI>. O CRM sugere pelo tipo do edital: <em>Obra / execução — pregão ou concorrência</em>, <em>Projeto / serviço técnico — técnica e preço</em> ou <em>Dispensa / menor valor</em>.
        </>
        <>
          Marque, se quiser, <UI>Criar o negócio e o contato do órgão</UI> e <UI>Criar as tarefas no quadro “Editais”</UI>.
        </>
        <>
          Toque em <UI>Montar a proposta</UI>. O CRM monta checklist, tarefas e lista de habilitação, muda o edital para “Em proposta” e abre o dossiê. Depois, o mesmo quadro mostra <UI>Abrir o dossiê da proposta</UI>.
        </>
      </Steps>
      <p className="text-[13.5px] text-muted-foreground">
        O botão não aparece para editais já descartados, ganhos ou perdidos, nem para quem só pode ver. Se o edital não tem data limite, os itens ficam sem prazo até você informar uma no dossiê.
      </p>

      <H3>5.2 Conhecer a tela do dossiê</H3>
      <Bullets>
        <>
          <strong>Cabeçalho</strong>: título, contagem regressiva, tipo, triagem, barra “N% pronto” (itens do checklist feitos), Data limite, Valor estimado, Modalidade e Responsável. Botões: <UI>Ver o edital</UI>, <UI>PNCP</UI>, <UI>Portal de envio</UI> e <UI>Negócio</UI>.
        </>
        <>
          <strong>Coluna principal</strong>: <UI>Etapas e checklist</UI> e <UI>Matriz de habilitação</UI>.
        </>
        <>
          <strong>Coluna ao lado</strong> (embaixo, no celular): <UI>Dados da proposta</UI>, <UI>Documentos e planilha de preços</UI>, <UI>Atestados sugeridos</UI> e <UI>Resultado</UI>.
        </>
      </Bullets>

      <H3>5.3 As 8 etapas e seus prazos</H3>
      <p>
        O prazo de cada etapa é calculado <strong>de trás para frente</strong>, a partir da data limite do edital, em dias úteis (sem fins de semana e sem feriados nacionais). São metas internas do estúdio, e você pode mudá-las.
      </p>
      <ol className="grid gap-2">
        {STEP_ROWS.map((s) => (
          <li key={s.n} className="flex gap-3 rounded-xl border bg-card p-3">
            <span aria-hidden className="num mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-brand-soft text-[12px] font-semibold text-brand">
              {s.n}
            </span>
            <div className="min-w-0">
              <p className="font-medium">
                {s.name} <span className="font-normal text-muted-foreground">· {s.prazo}</span>
              </p>
              <p className="text-[13.5px] text-muted-foreground">{s.text}</p>
            </div>
          </li>
        ))}
      </ol>
      <Steps title="Trabalhar uma etapa">
        <>Toque na etapa para abri-la. A etapa atual já vem aberta.</>
        <>
          Ajuste, se precisar, <UI>Situação</UI> (A fazer, Em andamento, Concluída ou Não se aplica), <UI>Responsável</UI> e <UI>Prazo da etapa</UI>. Use “Não se aplica” em etapas que o edital não exige, como a proposta técnica.
        </>
        <>Marque os itens do checklist conforme forem feitos. A etapa se conclui sozinha quando todos os itens estão marcados.</>
      </Steps>

      <H3>5.4 Contagem regressiva e cores de urgência</H3>
      <Bullets>
        <>
          O selo no cabeçalho mostra “Faltam N dias” até a data limite.
        </>
        <>
          Cores: neutro quando falta mais de 7 dias; terracota suave com 7 dias ou menos; contorno terracota com 3 dias ou menos; terracota cheia com menos de 1 dia ou prazo vencido.
        </>
        <>
          Etapas e itens atrasados aparecem com a palavra “atrasada” ou “atrasado”, a data em terracota e um alerta.
        </>
      </Bullets>

      <H3>5.5 Checklist, prazos e tarefas</H3>
      <Bullets>
        <>
          <strong>Marcar</strong>: a caixa à esquerda do item marca como feito. <strong>Editar</strong>: o lápis abre o texto, o prazo e o responsável, com <UI>Subir</UI>, <UI>Descer</UI> e <UI>Remover</UI>.
        </>
        <>
          <strong>Adicionar</strong>: em cada etapa, o campo “Adicionar um item a esta etapa…” e o botão +.
        </>
        <>
          <strong>Tarefas</strong>: ficam em <A href="/tarefas">Tarefas</A>, no quadro “Editais”, com um grupo por edital e ligadas ao negócio. Marcar o item conclui a tarefa, e concluir a tarefa marca o item. O botão <UI>Criar N tarefa(s)</UI> cria só as que faltam: nunca duplica.
        </>
        <>
          <UI>Reaplicar modelo</UI> (e <UI>Aplicar modelo</UI> em Dados da proposta) só <em>acrescenta</em> o que faltava; nada do que a equipe fez é apagado.
        </>
        <>
          <UI>Recalcular prazos</UI> (em Dados da proposta) refaz os prazos dos itens e etapas ainda abertos a partir da data limite atual. Use quando o edital for retificado.
        </>
      </Bullets>
      <Warn>
        <UI>Recalcular prazos</UI> volta os itens abertos ao prazo padrão, inclusive os que você ajustou à mão. Os prazos contam feriados nacionais, mas não os estaduais e municipais: confira a data e o horário no edital e no portal.
      </Warn>

      <H3>5.6 Dados da proposta</H3>
      <p>
        Preencha <UI>Nº do edital</UI> e <UI>Nº do processo</UI>: eles entram nas cartas e declarações. Use <UI>Data limite informada à mão</UI> só se o portal estiver desatualizado (ela vale para prazos, contagem e matriz). Escolha o <UI>Responsável pela proposta</UI> e toque em <UI>Salvar dados</UI>.
      </p>

      <H3>5.7 Matriz de habilitação</H3>
      <p>
        A matriz coloca lado a lado cada <strong>exigência do edital</strong> e o <strong>documento do cofre</strong> que a atende, e confere a validade contra a data da sessão.
      </p>
      <Steps>
        <>
          Em <UI>Lista padrão</UI>, escolha a lista (obra de restauro, projeto/serviço técnico ou dispensa) e toque em <UI>Acrescentar exigências</UI>. As que já existiam são mantidas.
        </>
        <>
          Para uma exigência específica do edital, digite em “Nova exigência do edital…”, escolha o <UI>Tipo de documento</UI> e toque em <UI>Adicionar</UI>.
        </>
        <>
          Veja a situação de cada linha: <UI>Em dia</UI>, <UI>Vence antes da sessão</UI>, <UI>Vencido</UI>, <UI>Faltando</UI>, <UI>Não se aplica</UI> ou <UI>Atendida (manual)</UI>. O resumo no topo conta as pendências.
        </>
        <>
          Em <UI>Ajustar</UI>, escolha o <UI>Documento do cofre</UI> (em “Automático” o CRM usa o de maior validade do tipo) e a <UI>Situação</UI>: Conferir pelo cofre, Atendida por outro meio ou Não se aplica a este edital.
        </>
        <>
          Para resolver pendências, toque em <UI>Abrir o cofre</UI>, cadastre ou renove o documento e volte.
        </>
      </Steps>

      <H3>5.8 Sugerir atestados do portfólio</H3>
      <p>
        No quadro <UI>Atestados sugeridos</UI>, o CRM lista as obras e projetos do portfólio que mais combinam com o objeto do edital, com pontos e o motivo. Marque as que quer usar e toque em <UI>Inserir N na proposta técnica</UI>. Se ainda não existir, o CRM cria a proposta técnica. Sem sugestões, <A href="/editais/portfolio">cadastre seus atestados</A> com etiquetas.
      </p>

      <H3>5.9 Gerar os documentos da proposta</H3>
      <Steps>
        <>
          No quadro <UI>Documentos e planilha de preços</UI>, toque em <UI>Gerar documentos da proposta</UI>.
        </>
        <>
          São criados 4 documentos: <strong>Carta-proposta</strong>, <strong>Proposta comercial</strong> (preços, BDI, prazo e validade), <strong>Proposta técnica</strong> e <strong>Declarações padrão</strong> (inexistência de fato impeditivo, não emprega menor, ME/EPP, elaboração independente, conhecimento do local e responsável técnico).
        </>
        <>
          Há botões à parte para <UI>Termo de renúncia a recurso</UI>, <UI>Pedido de esclarecimento</UI> e <UI>Impugnação ao edital</UI>.
        </>
        <>
          Os textos vêm preenchidos com variáveis, como {"{{edital.orgao}}"}, {"{{edital.objeto}}"}, {"{{estudio.razao_social}}"}, {"{{proposta.bdi}}"} e {"{{proposta.validade}}"}, tiradas do edital, da Configuração e dos Dados da proposta. O que estiver sem dado aparece em destaque para completar.
        </>
        <>
          Toque no nome do documento para abrir no editor de Documentos, ou em <UI>PDF</UI> para gerar o arquivo. <strong>Revise com o jurídico e com o edital antes de assinar.</strong>
        </>
      </Steps>
      <p className="text-[13.5px] text-muted-foreground">Gerar documentos exige acesso de edição a Documentos.</p>

      <H3>5.10 Criar a planilha de preços</H3>
      <Steps>
        <>
          No mesmo quadro, toque em <UI>Criar planilha de preços</UI>.
        </>
        <>
          O CRM abre uma planilha com as abas Composição (custos), Cronograma (físico-financeiro) e Resumo, já com o BDI e os encargos da Configuração.
        </>
        <>
          Preencha as células amarelas (quantidades e custos) e apague os exemplos. Para mudar BDI ou encargos só desta proposta, edite na aba Resumo.
        </>
        <>
          Depois, o botão vira <UI>Abrir a planilha de preços</UI>. Criar exige acesso de edição a Planilhas.
        </>
      </Steps>

      <H3>5.11 Envio e resultado</H3>
      <Steps>
        <>
          Faça a <strong>Revisão interna</strong> com outra pessoa e as assinaturas do representante legal e do responsável técnico.
        </>
        <>
          Envie pela página do órgão (<UI>Portal de envio</UI>) e guarde o comprovante. Depois marque a etapa <UI>Envio / protocolo</UI> como concluída: o edital passa a “Proposta enviada” e o negócio vai para a etapa escolhida em Configuração (se ela não existir no funil, o negócio não é movido).
        </>
        <>
          Quando houver resultado, abra o quadro <UI>Resultado</UI> e escolha em <UI>Como terminou?</UI>: Ganhou, Perdeu, Desclassificada ou Desistimos.
        </>
        <>
          Para perda, desclassificação ou desistência, escolha o <UI>Motivo</UI> (ou Outro, com explicação). Preencha o valor contratado (se ganhou) ou o do vencedor (se souber) e as observações. Toque em <UI>Registrar resultado</UI>.
        </>
      </Steps>
      <Bullets title="O que acontece depois">
        <>
          Ganhou: o edital vira “Ganho” e o negócio vai para fechado ganho.
        </>
        <>
          Perdeu ou Desclassificada: o edital vira “Perdido” e o negócio vai para perdido, com o motivo.
        </>
        <>
          Desistimos: o edital volta como “Descartado” (com o motivo) e o negócio vai para perdido.
        </>
        <>
          Para reabrir, escolha “Ainda em andamento” em <UI>Como terminou?</UI> e registre.
        </>
        <>
          Em <A href="/editais?aba=propostas">Propostas em andamento</A>, o quadro <UI>Aprendizado das propostas</UI> mostra a taxa de êxito por tipo e por órgão e os motivos de perda mais comuns.
        </>
      </Bullets>
      <Tip>
        A tela <A href="/editais?aba=propostas">Propostas em andamento</A> tem os filtros Em andamento, Encerradas e Todas e os indicadores Sessão em até 7 dias, Etapas atrasadas, Habilitação com pendência e Sem responsável. Abra-a toda manhã.
      </Tip>
      <Warn>Não há botão para apagar um dossiê. Se tocou em Vou participar por engano, registre o Resultado como “Desistimos” (isso muda o edital para Descartado e, se houver negócio ligado, o move para perdido). Avise quem cuida do funil.</Warn>
    </Sec>
  );
}

function CofrePortfolio() {
  return (
    <Sec id="cofre-portfolio" n={6} title="Cofre de habilitação e portfólio de atestados" lead="Os documentos que se repetem em toda licitação, sempre à mão e com aviso de validade.">
      <Why>
        <p>
          O <strong>cofre</strong> guarda os dados e a validade de certidões, contrato social, registros e declarações. O <strong>portfólio</strong> guarda as obras e projetos que comprovam sua experiência. Os dois alimentam a matriz de habilitação e os atestados sugeridos de cada proposta.
        </p>
      </Why>
      <Warn>
        O CRM <strong>não guarda arquivos</strong>: guarda apenas o <strong>link</strong> (do Drive ou do site que emitiu o documento). Suba o PDF no Drive, copie o link e cole no campo certo. Confira que a equipe tem acesso a esse link.
      </Warn>

      <H3>Cofre de habilitação</H3>
      <Steps title="Cadastrar um documento">
        <>
          Abra o <A href="/editais/cofre">Cofre de habilitação</A> e toque em <UI>Novo documento</UI> (no cofre vazio há atalhos para começar por certidões e contrato social).
        </>
        <>
          Escolha o <UI>Tipo</UI>: certidões (federal, FGTS, trabalhista, estadual, municipal, falência e recuperação judicial), contrato social, cartão CNPJ, balanço, garantia, atestado técnico, CAT/ART/RRT, registro no CREA/CAU, cadastro IPHAN, declaração ou outro.
        </>
        <>
          Preencha <UI>Nome</UI> (como você reconhece, por exemplo “Atestado – Matriz de Itu”), <UI>Número</UI>, <UI>Emissor</UI>, <UI>Emissão</UI> e <UI>Validade</UI>.
        </>
        <>
          Cole o <UI>Link do arquivo</UI> e escolha o <UI>Responsável por renovar</UI>: ele recebe os avisos de vencimento junto com os administradores.
        </>
        <>
          Toque em <UI>Salvar</UI>. Para renovar uma certidão, toque em <UI>Editar</UI> no cartão e atualize Emissão, Validade e Link.
        </>
      </Steps>
      <Bullets title="Como ler o cofre">
        <>
          No topo: <UI>No cofre</UI>, <UI>Vencidos</UI> e <UI>Vencem em 30 dias</UI>. A aba Cofre de habilitação também mostra um número quando há algo pedindo atenção.
        </>
        <>
          Cada cartão mostra o tipo, o nome e o estado: “Vence em N dias”, “Venceu há N dias” ou “Sem validade”. Sem arquivo, aparece “Sem link do arquivo” em terracota.
        </>
        <>
          Os botões <UI>Todos</UI>, <UI>Pedem atenção</UI> e os grupos (Certidões, Empresa, Técnico, Declarações, Outros) filtram a lista. <UI>Abrir arquivo</UI> leva ao link.
        </>
        <>
          O CRM avisa <strong>30, 15 e 7 dias antes</strong> de cada documento vencer (veja a seção <A href="#avisos">7</A>). Remover um documento só é permitido a quem gerencia Editais.
        </>
      </Bullets>

      <H3>Atestados e portfólio</H3>
      <Steps title="Cadastrar uma obra ou projeto">
        <>
          Abra <A href="/editais/portfolio">Atestados e portfólio</A> e toque em <UI>Nova obra ou projeto</UI>.
        </>
        <>
          Preencha <UI>Título</UI>, <UI>Cliente / órgão</UI>, <UI>Ano</UI>, <UI>Valor (R$)</UI>, <UI>Tipo</UI> (Execução, Projeto, Laudo/consultoria ou Outro), <UI>Tombamento</UI> e <UI>Responsável técnico</UI>.
        </>
        <>
          Em <UI>Técnicas e bens (etiquetas)</UI>, adicione as técnicas usadas (restauração de forro, pintura mural, douramento, consolidação estrutural…). Há sugestões prontas para tocar.
        </>
        <>
          Em <UI>Descrição pronta para a proposta</UI>, escreva um parágrafo que possa ser colado como está: o que foi feito, área, técnicas e resultado.
        </>
        <>
          Em <UI>Links (fotos, atestado, CAT)</UI>, toque em <UI>Adicionar link</UI> para cada arquivo no Drive. Depois toque em <UI>Salvar</UI>.
        </>
      </Steps>
      <Tip>
        As <strong>etiquetas</strong> é que fazem o CRM sugerir a obra certa para cada edital: use as mesmas palavras dos editais (forro, retábulo, pintura mural, douramento…). Teste em <UI>Testar com um edital</UI>: cole o objeto de um edital e veja a lista de sugestões, da mais para a menos aderente.
      </Tip>
    </Sec>
  );
}

const AVISOS: { regra: string; quando: string; quem: string }[] = [
  { regra: "Novo edital relevante", quando: "Surge um edital com relevância 70 ou mais, publicado nos últimos 3 dias.", quem: "Quem tem acesso a Editais" },
  { regra: "Edital de interesse encerrando", quando: "7, 3 e 1 dia antes do fim do prazo de um edital aberto marcado como Interessante, Em análise ou Em proposta.", quem: "Responsável pelo edital e gestor" },
  { regra: "Etapa da proposta se aproximando", quando: "2 dias antes e no dia do prazo de cada etapa.", quem: "Responsável pelo edital e gestor" },
  { regra: "Etapa da proposta atrasada", quando: "Uma etapa passa do prazo (a partir de 1 dia).", quem: "Responsável pelo edital e gestor" },
  { regra: "Proposta sem responsável", quando: "Proposta em andamento sem responsável faltando 7 dias ou menos para a data limite.", quem: "Gestores" },
  { regra: "Certidão do cofre vencendo", quando: "30, 15 e 7 dias antes da validade de qualquer documento do cofre.", quem: "Responsável pelo documento e administradores" },
];

function Avisos() {
  return (
    <Sec id="avisos" n={7} title="Avisos e automações" lead="O CRM avisa antes de o prazo virar problema. Você só precisa saber onde olhar.">
      <Why>
        <p>
          Os avisos são regras prontas (Automações) que observam editais, propostas e cofre. Cada fato gera um aviso uma única vez, para as pessoas certas.
        </p>
      </Why>
      <div className="overflow-hidden rounded-xl border">
        <table className="w-full text-left text-[13.5px] max-md:hidden">
          <thead className="bg-muted/60 text-xs text-muted-foreground">
            <tr>
              <th className="px-3.5 py-2.5 font-medium">Aviso</th>
              <th className="px-3.5 py-2.5 font-medium">Quando chega</th>
              <th className="px-3.5 py-2.5 font-medium">Quem recebe</th>
            </tr>
          </thead>
          <tbody>
            {AVISOS.map((a) => (
              <tr key={a.regra} className="border-t align-top">
                <td className="px-3.5 py-2.5 font-medium">{a.regra}</td>
                <td className="px-3.5 py-2.5">{a.quando}</td>
                <td className="px-3.5 py-2.5 text-muted-foreground">{a.quem}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <ul className="grid divide-y md:hidden">
          {AVISOS.map((a) => (
            <li key={a.regra} className="grid gap-0.5 p-3.5">
              <p className="font-semibold">{a.regra}</p>
              <p className="text-[13.5px]">{a.quando}</p>
              <p className="text-[13px] text-muted-foreground">Quem recebe: {a.quem}</p>
            </li>
          ))}
        </ul>
      </div>
      <Bullets title="Onde ver os avisos">
        <>
          <strong>O sino</strong> no topo do sistema: o número mostra os não lidos; toque num aviso para ir direto ao edital ou ao dossiê.
        </>
        <>
          A página <A href="/notificacoes">Avisos</A> e o quadro <UI>Avisos</UI> do <A href="/">Painel</A>, com o resumo do que precisa de atenção.
        </>
        <>
          No <A href="/">Painel</A> também ficam os blocos <UI>Oportunidades de restauro</UI> (novos e os que encerram em 7 dias) e <UI>Propostas em andamento</UI>.
        </>
      </Bullets>
      <Steps title="Ligar, desligar ou ajustar uma regra">
        <>
          Abra <A href="/automacoes">Automações</A> (no menu Sistema; aparece para quem tem acesso a Configurações).
        </>
        <>
          Na aba <UI>Regras</UI>, procure o grupo <UI>Editais de restauro</UI>.
        </>
        <>
          Use o interruptor ao lado do nome da regra para ligar ou desligar.
        </>
        <>
          Para ajustar, abra a regra e mude, por exemplo, <UI>Avisar quantos dias antes</UI> (números separados por vírgula; 0 é o próprio dia) ou a condição de relevância mínima do edital novo.
        </>
        <>
          A aba <UI>Registro</UI> mostra o que cada regra já disparou.
        </>
      </Steps>
      <Tip>Se chegarem avisos demais de edital novo, em vez de desligar a regra suba a relevância mínima dela. As regras de prazo e de certidão é melhor deixar sempre ligadas.</Tip>
    </Sec>
  );
}

function Permissoes() {
  return (
    <Sec id="permissoes" n={8} title="Quem pode fazer o quê, e uso no celular">
      <Why>
        <p>O acesso ao módulo “Editais de restauro” tem três níveis, definidos por pessoa em Equipe e acessos.</p>
      </Why>
      <div className="grid gap-2 sm:grid-cols-3">
        {[
          { t: "Ver", d: "Consulta editais, propostas em andamento, cofre e portfólio. Esta página de ajuda também." },
          { t: "Editar", d: "Faz a triagem, usa a esteira de proposta, mexe no cofre e nos atestados, cria negócio e tarefa e usa Buscar oportunidades." },
          { t: "Gerenciar", d: "Tudo isso, mais a Configuração (dados do estúdio, BDI, modelos) e a exclusão no cofre e no portfólio." },
        ].map((x) => (
          <div key={x.t} className="rounded-xl border bg-card p-3.5">
            <p className="font-semibold">{x.t}</p>
            <p className="mt-1 text-[13.5px] text-muted-foreground">{x.d}</p>
          </div>
        ))}
      </div>
      <Bullets>
        <>
          Perfis prontos: Administrador e Gestor gerenciam Editais; Comercial edita. Quem ajusta é o administrador, em <A href="/equipe">Equipe e acessos</A>.
        </>
        <>
          Algumas ações pedem acesso em outros módulos: criar negócio (Negócios e Leads e contatos), tarefas (Tarefas), documentos (Documentos) e planilha de preços (Planilhas), todos com “Editar”.
        </>
        <>
          Se um botão não aparece ou não funciona, quase sempre é falta de permissão. Peça a quem administra.
        </>
      </Bullets>
      <H3>No celular</H3>
      <Bullets>
        <>
          Tudo funciona no celular: a lista vira cartões, os filtros abrem numa gaveta, as abas rolam para o lado e os botões têm tamanho de toque.
        </>
        <>
          No dossiê, as colunas se empilham e cada etapa abre e fecha com um toque.
        </>
        <>
          Para ter o sistema como aplicativo, veja <A href="/ajuda/instalar-no-celular">Instalar no celular</A>.
        </>
      </Bullets>
      <Tip>No celular, use o sistema para consultar, triar, marcar itens e receber avisos. Planilha de preços e documentos longos são mais fáceis no computador.</Tip>
    </Sec>
  );
}

const CRONO: { d: string; text: string }[] = [
  { d: "D-9", text: "Ler o edital e todos os anexos." },
  { d: "D-8", text: "Decidir se participa (go / no-go) e anotar as exigências de habilitação na matriz." },
  { d: "D-7", text: "Visita técnica (se for obra) e listar as dúvidas, com o prazo de esclarecimento do edital à vista." },
  { d: "D-5", text: "Enviar pedido de esclarecimento e avaliar se cabe impugnação (confira o prazo legal no edital)." },
  { d: "D-3", text: "Habilitação pronta: certidões, documentos da empresa, atestados, declarações; proposta técnica e planilha de preços em andamento; login do portal conferido." },
  { d: "D-2", text: "Carta-proposta pronta, revisão interna por outra pessoa e assinaturas." },
  { d: "D-1", text: "Enviar ou protocolar a proposta e guardar o comprovante." },
  { d: "D0", text: "Acompanhar a sessão e as mensagens do portal. Depois, registrar o resultado." },
];

function Rotina() {
  return (
    <Sec id="rotina" n={9} title="Rotina recomendada e boas práticas" lead="Hábitos pequenos que evitam o erro mais caro: perder o prazo.">
      <H3>Todo dia (5 minutos)</H3>
      <Steps>
        <>
          Veja o sino e o quadro Avisos do Painel.
        </>
        <>
          Em <A href="/editais">Oportunidades</A>, abra <UI>Novos · 7 dias</UI> e faça a triagem de cada edital novo.
        </>
        <>
          Em <A href="/editais?aba=propostas">Propostas em andamento</A>, olhe <UI>Sessão em até 7 dias</UI>, <UI>Etapas atrasadas</UI>, <UI>Habilitação com pendência</UI> e <UI>Sem responsável</UI>.
        </>
      </Steps>
      <H3>Toda semana</H3>
      <Bullets>
        <>
          Toque em <UI>Buscar oportunidades</UI> uma vez, se não puder esperar a varredura da manhã, e revise os editais que encerram em 7 dias.
        </>
        <>
          No <A href="/editais/cofre">Cofre</A>, abra <UI>Pedem atenção</UI> e renove o que vence em 30 dias.
        </>
        <>
          Cadastre no <A href="/editais/portfolio">Portfólio</A> as obras concluídas e registre os resultados que chegaram.
        </>
      </Bullets>
      <H3>Todo trimestre</H3>
      <Bullets>
        <>
          Revise a <A href="/editais/configuracao">Configuração</A> (BDI, encargos, responsáveis técnicos e quem cuida de cada função), os modelos com o jurídico e o quadro Aprendizado.
        </>
      </Bullets>

      <H3>Linha do tempo de uma proposta</H3>
      <p>
        É o que o modelo “Obra / execução” do sistema agenda, em <strong>dias úteis antes da data limite</strong> (D-1 é o dia útil anterior). Os outros modelos têm menos itens, mas seguem a mesma lógica.
      </p>
      <ol className="grid gap-2">
        {CRONO.map((c) => (
          <li key={c.d} className="flex gap-3 rounded-xl border bg-card p-3">
            <span className="num grid h-7 min-w-11 shrink-0 place-items-center rounded-md bg-brand-soft px-1.5 text-[13px] font-semibold text-brand">{c.d}</span>
            <span className="min-w-0 pt-0.5 text-[14px]">{c.text}</span>
          </li>
        ))}
      </ol>
      <Tip>
        Recomendação: já em D-7, abra a matriz de habilitação e veja o que está Faltando ou Vence antes da sessão. Certidões podem demorar a sair e pedem folga. O sistema agenda a habilitação para D-3, mas nada impede que você antecipe.
      </Tip>

      <Bullets title="Boas práticas para não perder prazo">
        <>
          Nunca deixe o envio para o último dia: portais caem, e o sistema agenda o protocolo para D-1 por isso.
        </>
        <>
          Confirme data e horário no edital e no portal. Retificações mudam prazos e feriados locais não estão no sistema.
        </>
        <>
          Toda proposta precisa de um responsável. Sem ele ninguém cobra, e o CRM avisa os gestores.
        </>
        <>
          Mantenha o cofre atualizado e o link de cada arquivo conferido. Nunca deixe uma certidão vencer entre a proposta e a sessão.
        </>
        <>
          Registre no Histórico do edital pedidos de esclarecimento, ligações e decisões.
        </>
        <>
          A revisão interna deve ser feita por quem não montou a proposta. Dois pares de olhos pegam o que um só não vê.
        </>
        <>
          Guarde o comprovante de envio no Drive e registre o resultado com o motivo, sempre: é o que alimenta o Aprendizado.
        </>
      </Bullets>
    </Sec>
  );
}

function FaqSec() {
  return (
    <Sec id="faq" n={10} title="Perguntas frequentes e solução de problemas">
      <div className="grid gap-2">
        <Faq q="Não apareceram editais. O que fazer?">
          <p>
            Veja primeiro o número ao lado do botão <UI>Filtros</UI>: o padrão mostra só editais abertos com relevância 50 ou mais, sem os descartados. Toque em <UI>Filtros</UI> → <UI>Limpar</UI> ou baixe a <UI>Relevância mínima</UI> para “Possível (35+)”.
          </p>
          <p>
            Se a faixa disser “Nenhuma varredura ainda”, toque em <UI>Buscar oportunidades</UI> (precisa de acesso de edição). Pode também não haver edital novo naquele dia: o PNCP nem sempre publica de restauro.
          </p>
        </Faq>
        <Faq q="O botão Buscar oportunidades demora. Está travado?">
          <p>
            Não necessariamente. A varredura rápida leva cerca de 30 segundos; a completa roda no GitHub e pode levar até cerca de 30 minutos só para começar. A faixa mostra <UI>Solicitada</UI>, <UI>Executando</UI> e <UI>Concluída</UI>. Não precisa tocar de novo: o sistema avisa que já há um pedido em andamento.
          </p>
          <p>
            Se aparecer <UI>Parcial</UI>, o PNCP demorou e a busca será retomada sozinha. Se aparecer <UI>Falhou</UI>, leia o motivo e tente de novo mais tarde.
          </p>
        </Faq>
        <Faq q="A matriz diz que uma certidão está Vencida ou Vence antes da sessão.">
          <p>
            Emita a certidão nova, abra o <A href="/editais/cofre">Cofre</A>, toque em <UI>Editar</UI> no cartão e atualize Emissão, Validade e Link. Volte ao dossiê: a matriz confere de novo. Só use “Atendida por outro meio” se a exigência realmente for cumprida de outra forma.
          </p>
        </Faq>
        <Faq q="A relevância está baixa, mas o edital parece bom.">
          <p>
            Abra o edital e leia “Por que apareceu aqui”. A nota é calculada sobre o texto do objeto: objetos vagos pontuam pouco. Se for bom, marque Interessante e siga. Para ver mais editais assim, baixe a <UI>Relevância mínima</UI> em Filtros.
          </p>
        </Faq>
        <Faq q="Como descartar um edital? E como reabrir?">
          <p>
            Na gaveta do edital, <UI>Descartar…</UI> → escolha o motivo → <UI>Confirmar descarte</UI>. Ele some da lista. Para reabrir: <UI>Filtros</UI> → <UI>Triagem da equipe</UI> → “Descartado” (ou “Tudo, inclusive descartados”), abra o edital e toque em <UI>Voltar para novo</UI>.
          </p>
        </Faq>
        <Faq q="O edital foi retificado e a data limite mudou.">
          <p>
            No dossiê, em <UI>Dados da proposta</UI>, informe a nova <UI>Data limite informada à mão</UI> (se o portal ainda não atualizou), toque em <UI>Salvar dados</UI> e depois em <UI>Recalcular prazos</UI>.
          </p>
        </Faq>
        <Faq q="Posso trocar o modelo de checklist depois de criar o dossiê?">
          <p>
            Sim. Em <UI>Dados da proposta</UI>, escolha outro modelo e toque em <UI>Aplicar modelo</UI>. Ele só acrescenta itens, nada é apagado.
          </p>
        </Faq>
        <Faq q="As tarefas vão duplicar?">
          <p>
            Não. O CRM só cria tarefa para o item que ainda não tem uma. O botão <UI>Criar N tarefa(s)</UI> some quando todas já existem.
          </p>
        </Faq>
        <Faq q="Os documentos saíram com campos vazios ou em destaque.">
          <p>
            Faltam dados em <A href="/editais/configuracao">Configuração</A> (razão social, CNPJ, representante, responsável técnico) ou em Dados da proposta (Nº do edital e do processo). Preencha-os e abra o documento; se o campo continuar em destaque, complete direto no editor.
          </p>
        </Faq>
        <Faq q="Não vejo a aba Configuração, o botão Buscar oportunidades ou o botão Vou participar.">
          <p>
            É permissão. Configuração pede “Gerenciar”; Buscar oportunidades e Vou participar pedem “Editar”. Veja a seção <A href="#permissoes">8</A>.
          </p>
        </Faq>
        <Faq q="O cofre guarda os PDFs das certidões?">
          <p>
            Não. Guarda os dados, a validade e o link. O arquivo fica no Drive ou no site que o emitiu.
          </p>
        </Faq>
        <Faq q="Quais são os erros mais comuns?">
          <ul className="grid gap-1 pl-5">
            {[
              "Ir direto ao envio sem conferir a habilitação contra a data da sessão.",
              "Deixar a proposta sem responsável.",
              "Confiar só no CRM e não conferir o edital oficial e as retificações.",
              "Assinar um modelo de documento sem revisar com o jurídico.",
              "Deixar o cofre sem link de arquivo ou com certidão vencida.",
              "Esquecer de registrar o resultado e o motivo.",
              "Deixar o envio para o último dia.",
            ].map((t) => (
              <li key={t} className="list-disc marker:text-brand/70">
                {t}
              </li>
            ))}
          </ul>
        </Faq>
      </div>
      <p className="text-[13.5px] text-muted-foreground">
        Mais ajuda: <A href="/ajuda/editais">Central de ajuda → Editais de restauro</A> e <A href="/ajuda/esteira-de-proposta">Esteira de proposta</A>.
      </p>
    </Sec>
  );
}

function Glossario() {
  return (
    <Sec id="glossario" n={11} title="Glossário" lead="Palavras que aparecem nos editais e no CRM, em linguagem simples.">
      <dl className="grid gap-2 sm:grid-cols-2">
        <Term t="PNCP">Portal Nacional de Contratações Públicas: site oficial onde órgãos federais, estaduais e municipais publicam licitações e contratações. É a fonte dos editais do CRM.</Term>
        <Term t="Edital">Documento com as regras da licitação: o que será contratado, quem pode participar, quais documentos entregar e as datas.</Term>
        <Term t="Objeto">O que o órgão quer contratar (por exemplo, o restauro do forro de uma igreja).</Term>
        <Term t="Pregão">Modalidade para bens e serviços comuns, em que em geral vence o menor preço, por disputa no portal.</Term>
        <Term t="Concorrência">Modalidade para contratações maiores ou mais complexas, como obras e serviços especiais de engenharia. O critério pode ser menor preço ou técnica e preço.</Term>
        <Term t="Dispensa">Contratação direta, sem licitação formal, nos casos previstos em lei (como valores baixos). Costuma ter prazo curto e proposta enxuta.</Term>
        <Term t="Sessão">Dia e hora em que as propostas são abertas e julgadas, normalmente no portal do órgão.</Term>
        <Term t="Habilitação">Conjunto de documentos que prova que a empresa pode contratar com o governo: jurídicos, fiscais, econômicos e técnicos.</Term>
        <Term t="Proposta técnica e de preço">A técnica explica como o serviço será feito (metodologia, equipe, cronograma). A de preço traz os valores. Nem todo edital pede as duas.</Term>
        <Term t="BDI">Benefícios e Despesas Indiretas: percentual somado ao custo direto da obra para cobrir despesas indiretas, tributos e lucro.</Term>
        <Term t="Encargos sociais">Custos trabalhistas e previdenciários que incidem sobre a mão de obra.</Term>
        <Term t="Atestado de capacidade técnica">Documento emitido por quem contratou o estúdio, comprovando que ele executou serviço semelhante ao do edital.</Term>
        <Term t="CAT, ART e RRT">CAT é a Certidão de Acervo Técnico do profissional (CREA). ART (CREA) e RRT (CAU) são os registros de responsabilidade técnica de uma obra ou projeto.</Term>
        <Term t="Esclarecimento">Pergunta formal ao órgão sobre o edital. Tem prazo, informado no próprio edital.</Term>
        <Term t="Impugnação">Contestação formal de uma cláusula do edital que pareça ilegal ou restritiva. Também tem prazo legal.</Term>
        <Term t="Tombamento">Proteção legal de um bem de valor cultural, feita por órgãos como o IPHAN (federal) ou institutos estaduais e municipais.</Term>
        <Term t="Relevância">Nota de 0 a 100 que o CRM dá a cada edital, pelas regras de triagem, indicando a chance de ser restauro.</Term>
        <Term t="Dossiê">A página da proposta de um edital: etapas, checklist, habilitação, documentos e resultado.</Term>
        <Term t="Matriz de habilitação">Tabela que cruza as exigências do edital com os documentos do cofre e confere a validade.</Term>
        <Term t="Cofre">Cadastro dos documentos da empresa (dados, validade e link), com aviso antes de vencer.</Term>
      </dl>
    </Sec>
  );
}

function Aviso() {
  return (
    <Sec id="aviso" n={12} title="Aviso importante">
      <div className="rounded-xl border border-dashed p-4 text-[13.5px] leading-relaxed text-muted-foreground">
        <p>
          Os textos jurídicos gerados pelo sistema (cartas, declarações, termo de renúncia, pedido de esclarecimento, impugnação) são <strong className="text-foreground">modelos de partida</strong>: revise-os com o jurídico e com o edital antes de assinar ou enviar. O sistema não afirma que estejam corretos para o seu caso.
        </p>
        <p className="mt-2">
          Os prazos do sistema são <strong className="text-foreground">metas internas</strong> (contam dias úteis e feriados nacionais). O prazo que vale é o do edital e o do portal do órgão. Esta página explica como usar o CRM e não substitui orientação jurídica.
        </p>
      </div>
    </Sec>
  );
}

export function ComoUsarContent() {
  return (
    <div className="grid min-w-0 gap-12 pb-24">
      <Visao />
      <Primeiro />
      <Oportunidades />
      <Triagem />
      <Participar />
      <CofrePortfolio />
      <Avisos />
      <Permissoes />
      <Rotina />
      <FaqSec />
      <Glossario />
      <Aviso />
      <p id="como-usar-vazio" hidden className="rounded-xl border border-dashed px-6 py-10 text-center text-[14px] text-muted-foreground">
        Nada encontrado para essa busca. Tente outra palavra, como “certidão”, “prazo” ou “BDI”.
      </p>
    </div>
  );
}
