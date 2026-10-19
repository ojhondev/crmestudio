/**
 * Modelo de acesso: cada pessoa tem um nível por módulo.
 *   none   — o módulo nem aparece no menu
 *   view   — só consulta
 *   edit   — cria e altera
 *   manage — também exclui e mexe em configurações sensíveis
 * Arquivo sem dependências de servidor: usado no navegador (menus) e no servidor (regra de verdade).
 */

export type Level = "none" | "view" | "edit" | "manage";
export const LEVELS: Level[] = ["none", "view", "edit", "manage"];
export const LEVEL_LABEL: Record<Level, string> = { none: "Sem acesso", view: "Ver", edit: "Editar", manage: "Gerenciar" };
const RANK: Record<Level, number> = { none: 0, view: 1, edit: 2, manage: 3 };

export type ModuleKey = "negocios" | "contatos" | "atendimento" | "agenda" | "financeiro" | "documentos" | "site" | "equipe" | "configuracoes";

export const MODULES: {
  key: ModuleKey;
  label: string;
  /** o que cada nível significa neste módulo */
  help: string;
  levels?: Level[];
  soon?: boolean;
}[] = [
  { key: "negocios", label: "Negócios", help: "Ver: consulta o funil · Editar: cria, move e registra · Gerenciar: exclui negócios" },
  { key: "contatos", label: "Leads e contatos", help: "Ver: consulta · Editar: cadastra e altera · Gerenciar: exclui contatos" },
  { key: "atendimento", label: "Atendimento", help: "Ver: lê conversas · Editar: responde, atribui e resolve" },
  { key: "agenda", label: "Agenda", help: "Ver: consulta · Editar: cria e altera eventos" },
  { key: "financeiro", label: "Financeiro", help: "Ver: consulta e exporta · Editar: lança e baixa · Gerenciar: exclui lançamentos" },
  { key: "documentos", label: "Contratos e apresentações", help: "Ver: consulta · Editar: cria e edita · Gerenciar: exclui e gerencia modelos", soon: true },
  { key: "site", label: "Site (projetos, blog, vagas)", help: "Ver: consulta · Editar: publica e altera · Gerenciar: exclui", soon: true },
  { key: "equipe", label: "Equipe e acessos", help: "Ver: vê quem tem acesso · Gerenciar: cria contas e altera permissões", levels: ["none", "view", "manage"] },
  { key: "configuracoes", label: "Configurações do sistema", help: "Ver: consulta etapas e integrações · Gerenciar: altera", levels: ["none", "view", "manage"] },
];

export type Permissions = Record<ModuleKey, Level>;
const ALL = MODULES.map((m) => m.key);

const make = (p: Partial<Permissions>): Permissions => Object.fromEntries(ALL.map((k) => [k, p[k] ?? "none"])) as Permissions;

export type ProfileKey = "administrador" | "gestor" | "comercial" | "atendimento" | "financeiro" | "parceiro" | "personalizado";
export type AccountType = "admin" | "equipe" | "parceiro";

export const PROFILES: Record<
  ProfileKey,
  { label: string; description: string; type: AccountType; ownOnly: boolean; perms: Permissions; color: string }
> = {
  administrador: {
    label: "Administrador",
    description: "Acesso total, inclusive contas, permissões e configurações.",
    type: "admin",
    ownOnly: false,
    perms: make(Object.fromEntries(ALL.map((k) => [k, "manage"]))),
    color: "#b75928",
  },
  gestor: {
    label: "Gestor",
    description: "Toca a operação inteira: negócios, atendimento, agenda, financeiro e documentos. Vê a equipe, mas não altera acessos.",
    type: "equipe",
    ownOnly: false,
    perms: make({ negocios: "manage", contatos: "manage", atendimento: "manage", agenda: "manage", financeiro: "manage", documentos: "manage", site: "edit", equipe: "view", configuracoes: "view" }),
    color: "#193f32",
  },
  comercial: {
    label: "Comercial",
    description: "Vende: funil, contatos, atendimento, agenda e documentos. Sem financeiro.",
    type: "equipe",
    ownOnly: false,
    perms: make({ negocios: "edit", contatos: "edit", atendimento: "edit", agenda: "edit", documentos: "edit" }),
    color: "#537179",
  },
  atendimento: {
    label: "Atendimento",
    description: "Responde clientes (WhatsApp e e-mail) e cuida de contatos e agenda. Consulta o funil, sem alterar.",
    type: "equipe",
    ownOnly: false,
    perms: make({ negocios: "view", contatos: "edit", atendimento: "edit", agenda: "edit" }),
    color: "#776157",
  },
  financeiro: {
    label: "Financeiro",
    description: "Cuida do caixa. Consulta negócios, contatos e agenda.",
    type: "equipe",
    ownOnly: false,
    perms: make({ negocios: "view", contatos: "view", agenda: "view", financeiro: "manage", documentos: "view" }),
    color: "#002934",
  },
  parceiro: {
    label: "Parceiro comercial",
    description: "Externo. Vê e atualiza só os negócios em que foi indicado e a própria agenda.",
    type: "parceiro",
    ownOnly: true,
    perms: make({ negocios: "edit", agenda: "edit" }),
    color: "#8a8279",
  },
  personalizado: {
    label: "Personalizado",
    description: "Permissões ajustadas módulo a módulo.",
    type: "equipe",
    ownOnly: false,
    perms: make({}),
    color: "#6a6a6a",
  },
};

/** Perfis que podem ser escolhidos ao criar uma conta (personalizado se ajusta depois). */
export const SELECTABLE_PROFILES: ProfileKey[] = ["gestor", "comercial", "atendimento", "financeiro", "parceiro", "administrador"];

export const isLevel = (v: unknown): v is Level => typeof v === "string" && v in RANK;
export const isProfile = (v: unknown): v is ProfileKey => typeof v === "string" && v in PROFILES;

export const atLeast = (have: Level, need: Level) => RANK[have] >= RANK[need];
export const minLevel = (a: Level, b: Level): Level => (RANK[a] <= RANK[b] ? a : b);

/** Perfil que o legado (`role`) equivale — usado quando a conta ainda não tem perfil gravado. */
const roleToProfile = (role: AccountType): ProfileKey => (role === "admin" ? "administrador" : role === "parceiro" ? "parceiro" : "gestor");

/** Resolve as permissões efetivas de uma conta. Administradores sempre têm tudo (trava anti-bloqueio). */
export function resolvePermissions(u: { role: AccountType; profile?: string | null; permissions?: unknown }): Permissions {
  if (u.role === "admin") return PROFILES.administrador.perms;
  const key = isProfile(u.profile) && u.profile !== "administrador" ? u.profile : roleToProfile(u.role);
  const base = key === "personalizado" ? make({}) : PROFILES[key].perms;
  const stored = u.permissions && typeof u.permissions === "object" ? (u.permissions as Record<string, unknown>) : {};
  const out = { ...base };
  for (const m of MODULES) {
    const v = stored[m.key];
    if (isLevel(v) && (!m.levels || m.levels.includes(v))) out[m.key] = v;
  }
  return out;
}

/** Normaliza uma matriz vinda de formulário. */
export function sanitizePermissions(input: unknown): Permissions {
  const src = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  return make(
    Object.fromEntries(
      MODULES.map((m) => {
        const v = src[m.key];
        return [m.key, isLevel(v) && (!m.levels || m.levels.includes(v)) ? v : "none"];
      }),
    ),
  );
}

export const samePermissions = (a: Permissions, b: Permissions) => ALL.every((k) => a[k] === b[k]);

/** Descobre o rótulo do perfil: se a matriz bate com um perfil pronto, usa ele; senão "personalizado". */
export function detectProfile(perms: Permissions, ownOnly: boolean): ProfileKey {
  for (const k of SELECTABLE_PROFILES) {
    if (k === "administrador") continue;
    if (PROFILES[k].ownOnly === ownOnly && samePermissions(PROFILES[k].perms, perms)) return k;
  }
  return "personalizado";
}

/** Página inicial segura para quem não pode ver o módulo pedido. */
export const FIRST_ALLOWED: { module: ModuleKey; href: string }[] = [
  { module: "negocios", href: "/negocios" },
  { module: "atendimento", href: "/atendimento" },
  { module: "agenda", href: "/agenda" },
  { module: "contatos", href: "/contatos" },
  { module: "financeiro", href: "/financeiro" },
];
