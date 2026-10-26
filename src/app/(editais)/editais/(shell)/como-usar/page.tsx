import type { Metadata } from "next";
import Link from "next/link";
import { requireEditais } from "@/lib/editais-app/session";
import { PageTitle, PageWrap } from "@/components/editais-app/primitives";

export const metadata: Metadata = { title: "Como usar" };

type S = { id: string; title: string; staffOnly?: boolean; partnerOnly?: boolean; body: React.ReactNode };

const Steps = ({ items }: { items: React.ReactNode[] }) => (
  <ol className="grid gap-2.5">
    {items.map((x, i) => (
      <li key={i} className="flex gap-3">
        <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-full bg-brand-soft text-sm font-semibold text-brand">{i + 1}</span>
        <span className="text-[16px] leading-relaxed">{x}</span>
      </li>
    ))}
  </ol>
);
const L = ({ href, children }: { href: string; children: React.ReactNode }) => (
  <Link href={href} className="font-medium text-brand underline underline-offset-2">
    {children}
  </Link>
);
const Tip = ({ children }: { children: React.ReactNode }) => <p className="rounded-xl bg-brand-soft px-4 py-3 text-[15px]">{children}</p>;

const SECTIONS: S[] = [
  {
    id: "visao",
    title: "O app em um minuto",
    body: (
      <div className="grid gap-3">
        <p>Editais é um app dentro do CRM, só para licitações de restauro. Ele tem cinco lugares, sempre no menu (lateral no computador, embaixo no celular):</p>
        <ul className="grid gap-1.5 pl-1">
          <li>
            <strong>Radar</strong> — os editais encontrados, em cartões, para decidir rápido.
          </li>
          <li>
            <strong>Propostas</strong> — do “vou participar” ao resultado, com prazos.
          </li>
          <li>
            <strong>Acervo</strong> — certidões, obras e modelos que o estúdio reaproveita.
          </li>
          <li>
            <strong>Parceiros</strong> — gente de fora que ajuda, vendo só o que você compartilhar.
          </li>
          <li>
            <strong>Ajustes</strong> — dados do estúdio, padrões e sua conta.
          </li>
        </ul>
        <Tip>Quando uma tarefa tem várias perguntas, o app usa um assistente: uma pergunta por tela, com barra de progresso. Enter avança, Voltar corrige, e o que você respondeu fica salvo até concluir.</Tip>
      </div>
    ),
    staffOnly: true,
  },
  {
    id: "primeiro-dia",
    title: "Primeiro dia: deixe o estúdio pronto",
    staffOnly: true,
    body: (
      <Steps
        items={[
          <>
            Em <L href="/editais/ajustes?aba=estudio">Ajustes → Estúdio e proposta</L>, preencha razão social, CNPJ, endereço, representante legal e pelo menos um responsável técnico (com registro). Isso preenche sozinho cartas, declarações e a proposta técnica.
          </>,
          <>
            Confira o BDI, a validade da proposta e os modelos de checklist por tipo de edital (ainda em Ajustes, e em <L href="/editais/acervo?aba=modelos">Acervo → Modelos</L>).
          </>,
          <>
            Guarde no <L href="/editais/acervo?aba=cofre">Cofre</L> as certidões, o contrato social, o balanço e as declarações padrão, com a validade e o link do arquivo.
          </>,
          <>
            Cadastre em <L href="/editais/acervo?aba=obras">Obras</L> os 3 trabalhos mais fortes do estúdio: eles viram os atestados sugeridos.
          </>,
        ]}
      />
    ),
  },
  {
    id: "radar",
    title: "Radar: decidir em segundos",
    staffOnly: true,
    body: (
      <div className="grid gap-3">
        <Steps
          items={[
            <>
              Toque em <strong>Buscar oportunidades</strong>. Uma varredura rápida roda na hora e a completa roda no GitHub; todo dia, às 06:17, ela roda sozinha.
            </>,
            <>
              Leia o cartão: órgão e UF, o objeto em destaque, a relevância (Alta, Média ou Baixa), o tipo, o valor e os <strong>dias restantes</strong> (vermelho perto do prazo).
            </>,
            <>
              Toque em <strong>Tenho interesse</strong>, <strong>Descartar</strong> (escolha o motivo e pronto) ou <strong>Compartilhar</strong>. Abra o cartão para ver prazos, links oficiais e por que ele apareceu.
            </>,
            <>
              As abas separam Novos, Interessantes, Em proposta, Descartados e Todos. Filtros: busca, UF, tipo, prazo e relevância; o resto está em <em>Mais filtros</em>.
            </>,
          ]}
        />
        <Tip>O menu “…” da lista exporta o CSV com os mesmos filtros e permite selecionar vários editais para compartilhar de uma vez.</Tip>
      </div>
    ),
  },
  {
    id: "participar",
    title: "Vou participar",
    staffOnly: true,
    body: (
      <div className="grid gap-3">
        <p>Num edital interessante, toque em <strong>Vou participar</strong>. O assistente pergunta:</p>
        <Steps items={["É este o edital?", "Que tipo de licitação é (obra, projeto ou dispensa)?", "Qual a data limite da sessão (já vem do portal)?", "Quem responde pela proposta?", "Quer envolver algum parceiro?", "Este checklist serve? (com a prévia dos prazos)"]} />
        <p>Ao concluir, o app cria a proposta, o checklist com prazos contados de trás para frente (em dias úteis), as tarefas e o negócio. Se você repetir, nada é duplicado.</p>
      </div>
    ),
  },
  {
    id: "proposta",
    title: "A proposta, etapa por etapa",
    staffOnly: true,
    body: (
      <div className="grid gap-4">
        <p>Na página da proposta, o cartão <strong>Próximo passo</strong> mostra o que fazer agora e abre o assistente certo:</p>
        <ul className="grid gap-2">
          <li>
            <strong>Habilitação</strong> — “Temos a certidão X? Vence antes da sessão?”. Escolha o documento do cofre, “outro meio”, “não se aplica” ou “falta” (vira tarefa).
          </li>
          <li>
            <strong>Proposta técnica</strong> — atestados sugeridos, responsável técnico, compreensão, metodologia e cronograma; gera o documento.
          </li>
          <li>
            <strong>Proposta de preço</strong> — BDI, itens principais, prazo, validade e valor; gera a planilha e a carta-proposta.
          </li>
          <li>
            <strong>Revisão e envio</strong> — conferência final e o link do comprovante. O envio em si é feito no portal do órgão.
          </li>
          <li>
            <strong>Resultado</strong> — ganhou, perdeu, desclassificada ou desistência, com o motivo e o aprendizado.
          </li>
        </ul>
        <Tip>Abaixo da linha do tempo ficam os blocos que abrem e fecham: checklist, habilitação, documentos, planilha, atestados e a conversa. Os documentos são modelos de partida: revise com o jurídico antes de assinar.</Tip>
      </div>
    ),
  },
  {
    id: "acervo",
    title: "Acervo",
    staffOnly: true,
    body: (
      <ul className="grid gap-2">
        <li>
          <strong>Cofre</strong>: cartões com semáforo (verde válido, amarelo vence em 30 dias, vermelho vencido). Filtre por tipo e validade; toque em Renovar para atualizar. O app guarda só o link do arquivo.
        </li>
        <li>
          <strong>Obras</strong>: galeria de trabalhos com ano, valor e etiquetas. Cole o link de uma foto (.jpg, .png) para ela aparecer na capa.
        </li>
        <li>
          <strong>Modelos</strong>: os checklists e as listas de habilitação por tipo de edital.
        </li>
      </ul>
    ),
  },
  {
    id: "parceiros",
    title: "Como convidar e trabalhar com parceiros",
    staffOnly: true,
    body: (
      <div className="grid gap-4">
        <p>Parceiros são pessoas de fora do estúdio. A conta deles só abre o app Editais — nenhum outro módulo do CRM — e eles veem apenas o que você compartilhar.</p>
        <div className="grid gap-2">
          <h3 className="text-[17px] font-semibold">Passo a passo</h3>
          <Steps
            items={[
              <>
                Abra <L href="/editais/parceiros">Parceiros</L> e toque em <strong>Convidar parceiro</strong> (precisa do acesso “gerenciar” em Editais).
              </>,
              "Responda: nome, e-mail, empresa, WhatsApp, área de atuação e se libera o Radar completo (padrão: não).",
              "Se o envio de e-mail estiver ativo, o convite sai por e-mail. Senão, o app mostra o texto pronto: toque em Copiar, Abrir no WhatsApp ou Abrir no e-mail. Até você enviar, o convite fica “pendente”.",
              "O parceiro entra com “Entrar com Google” usando o e-mail do convite (o jeito mais fácil) ou com e-mail e a senha provisória do convite, que ele troca no primeiro acesso.",
              "Quando ele entrar pela primeira vez, o convite passa para “aceito” e você recebe um aviso.",
              "Compartilhe editais e propostas: toque em Compartilhar no cartão ou na página (ou selecione vários no menu “…” do Radar).",
            ]}
          />
        </div>
        <div className="grid gap-2">
          <h3 className="text-[17px] font-semibold">O que cada papel pode</h3>
          <ul className="grid gap-1.5">
            <li>
              <strong>Só ver</strong>: lê o edital, a proposta (se compartilhada) e a conversa.
            </li>
            <li>
              <strong>Pode contribuir</strong>: também comenta (com @nome), marca interesse, anexa links, envia documentos para revisão e conclui as tarefas e etapas atribuídas a ele.
            </li>
            <li>
              Documentos gerados e a planilha de preços ficam só com a equipe, a menos que você marque “mostrar”. O cofre só aparece com os documentos que você liberar.
            </li>
          </ul>
        </div>
        <Tip>Reenviar o convite gera uma nova senha provisória se a pessoa ainda não entrou. Revogar derruba as sessões na hora; reativar devolve o acesso e os compartilhamentos.</Tip>
        <p className="text-sm text-muted-foreground">
          Sobre o e-mail automático: ele só sai se o administrador configurar a chave do provedor (RESEND_API_KEY e MAIL_FROM). Sem ela, nada quebra — o convite vira texto para copiar e WhatsApp.
        </p>
      </div>
    ),
  },
  {
    id: "parceiro",
    title: "Para quem é parceiro",
    partnerOnly: true,
    body: (
      <div className="grid gap-4">
        <p>Você foi convidado pela equipe do Estúdio Restaura. Aqui você vê só o que foi compartilhado com você.</p>
        <Steps
          items={[
            "Na tela Início: os editais compartilhados, as suas tarefas e os próximos prazos. O sino avisa quando algo novo chega.",
            "Abra um edital para ler o objeto, os prazos e os links oficiais. Se a proposta foi compartilhada, você acompanha as etapas e o checklist.",
            "Com o papel “Pode contribuir”, você comenta (use @nome para chamar alguém), marca interesse, anexa links e envia documentos para revisão. Marque como concluídas as tarefas que são suas.",
            "Os arquivos ficam no seu Drive ou no site de origem: o app guarda só o link.",
          ]}
        />
      </div>
    ),
  },
  {
    id: "rotina",
    title: "Rotina sugerida",
    staffOnly: true,
    body: (
      <ul className="grid gap-1.5">
        <li>
          <strong>Todo dia</strong>: abra o Radar na aba Novos e decida: interesse, descartar ou compartilhar.
        </li>
        <li>
          <strong>Duas vezes por semana</strong>: olhe Propostas e o próximo passo de cada uma; veja as que têm prazo vermelho.
        </li>
        <li>
          <strong>Toda semana</strong>: renove no Cofre o que vence em 30 dias.
        </li>
        <li>
          <strong>A cada resultado</strong>: registre o motivo. Ele é o que torna as próximas propostas melhores.
        </li>
      </ul>
    ),
  },
  {
    id: "duvidas",
    title: "Dúvidas frequentes",
    body: (
      <dl className="grid gap-4">
        {[
          ["Onde ficam as telas antigas?", "Em Ajustes, no rodapé, há o link “Modo avançado”. É temporário, enquanto o app novo se estabiliza."],
          ["O app guarda os PDFs?", "Não. Só links (Drive, site do órgão). Os dados e as validades ficam no app."],
          ["O app envia a proposta ao órgão?", "Não. Ele organiza tudo e registra o comprovante; o envio é feito no portal do órgão."],
          ["Esqueci a senha provisória do parceiro.", "Na ficha do parceiro, toque em Nova senha provisória. Quem entra pelo Google não precisa de senha."],
          ["O parceiro vê o resto do CRM?", "Não. O servidor nega qualquer outra tela e qualquer edital que não foi compartilhado."],
        ].map(([q, a]) => (
          <div key={q}>
            <dt className="text-[16px] font-semibold">{q}</dt>
            <dd className="mt-0.5 text-[15px] text-muted-foreground">{a}</dd>
          </div>
        ))}
      </dl>
    ),
  },
  {
    id: "glossario",
    title: "Glossário",
    body: (
      <dl className="grid gap-3 sm:grid-cols-2">
        {[
          ["PNCP", "Portal Nacional de Contratações Públicas, onde os editais são publicados."],
          ["Habilitação", "Documentos que provam que a empresa pode participar (certidões, balanço, atestados)."],
          ["Atestado técnico", "Documento que comprova que o estúdio já executou obra ou serviço parecido."],
          ["BDI", "Benefícios e despesas indiretas: a margem somada ao custo direto."],
          ["Sessão", "A data e a hora limite em que as propostas são abertas."],
          ["Impugnação", "Contestação de uma regra do edital, feita antes da sessão."],
        ].map(([t, d]) => (
          <div key={t} className="ed-card p-4">
            <dt className="text-[15px] font-semibold">{t}</dt>
            <dd className="mt-0.5 text-[14px] text-muted-foreground">{d}</dd>
          </div>
        ))}
      </dl>
    ),
  },
];

export default async function ComoUsarPage() {
  const { actor } = await requireEditais();
  const staff = actor.kind === "staff";
  const list = SECTIONS.filter((s) => (staff ? !s.partnerOnly : !s.staffOnly));
  return (
    <PageWrap className="max-w-3xl pb-8">
      <PageTitle title="Como usar" sub={staff ? "Um guia curto para o dia a dia dos editais." : "Um guia curto para parceiros."} />
      <nav aria-label="Índice" className="no-scrollbar -mx-4 mb-6 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:flex-wrap sm:px-0">
        {list.map((s) => (
          <a key={s.id} href={`#${s.id}`} className="inline-flex min-h-11 shrink-0 items-center rounded-full bg-muted px-4 text-sm font-medium text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring md:min-h-9">
            {s.title}
          </a>
        ))}
      </nav>
      <div className="grid gap-8">
        {list.map((s) => (
          <section key={s.id} id={s.id} aria-labelledby={`${s.id}-t`} className="scroll-mt-20">
            <h2 id={`${s.id}-t`} className="ed-title mb-3 text-2xl">
              {s.title}
            </h2>
            <div className="text-[16px] leading-relaxed">{s.body}</div>
          </section>
        ))}
      </div>
    </PageWrap>
  );
}
