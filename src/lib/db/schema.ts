import {
  pgTable,
  uuid,
  text,
  integer,
  bigint,
  boolean,
  timestamp,
  date,
  doublePrecision,
  serial,
  index,
  jsonb,
  uniqueIndex,
} from "drizzle-orm/pg-core";

/** admin = acesso total (tech) · equipe = operação · parceiro = só o que é dele */
export type Role = "admin" | "equipe" | "parceiro";

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  role: text("role").$type<Role>().notNull().default("equipe"),
  title: text("title"), // cargo / empresa do parceiro
  phone: text("phone"),
  active: boolean("active").notNull().default(true),
  /** perfil de acesso (ver lib/permissions.ts) e matriz de permissões por módulo */
  profile: text("profile").notNull().default("gestor"),
  permissions: jsonb("permissions"),
  /** vê só os próprios negócios/agenda (ex.: parceiro comercial) */
  ownOnly: boolean("own_only").notNull().default(false),
  /** senha provisória: força a troca no primeiro acesso */
  mustChangePassword: boolean("must_change_password").notNull().default(false),
  /** muda ao trocar/redefinir senha ou desativar: derruba sessões antigas */
  sessionVersion: integer("session_version").notNull().default(0),
  lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
  calendarToken: text("calendar_token").notNull(), // feed .ics privado
  /** gestor/supervisor: recebe os avisos da pessoa (sem ele, os administradores recebem) */
  supervisorId: uuid("supervisor_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const contacts = pgTable(
  "contacts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    email: text("email"),
    phone: text("phone"), // E.164 sem "+", ex.: 5511999990000 (igual ao wa_id)
    company: text("company"), // paróquia, mitra, construtora, pessoa física…
    role: text("role"), // cargo do contato (padre, ecônomo, arquiteto…)
    city: text("city"),
    state: text("state"),
    /** CPF ou CNPJ (aparece nos contratos) */
    document: text("document"),
    address: text("address"),
    source: text("source"), // site, indicação, instagram, whatsapp, evento, exemplo
    tags: text("tags").array().notNull().default([]),
    notes: text("notes"),
    ownerId: uuid("owner_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("contacts_phone_idx").on(t.phone)],
);

export type StageKind = "aberto" | "ganho" | "perdido";

export const stages = pgTable("stages", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  position: integer("position").notNull(),
  color: text("color").notNull().default("#9a948f"),
  kind: text("kind").$type<StageKind>().notNull().default("aberto"),
  /** chance de fechar (0–100%), usada na previsão ponderada do funil */
  probability: integer("probability").notNull().default(0),
});

export const deals = pgTable(
  "deals",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    title: text("title").notNull(),
    contactId: uuid("contact_id").references(() => contacts.id, { onDelete: "cascade" }),
    stageId: integer("stage_id")
      .notNull()
      .references(() => stages.id),
    valueCents: bigint("value_cents", { mode: "number" }).notNull().default(0),
    service: text("service"), // restauro, conservação, projeto, laudo, consultoria…
    property: text("property"), // igreja, casarão, bem tombado, obra de arte…
    location: text("location"),
    ownerId: uuid("owner_id").references(() => users.id, { onDelete: "set null" }),
    partnerId: uuid("partner_id").references(() => users.id, { onDelete: "set null" }),
    position: doublePrecision("position").notNull().default(0),
    expectedClose: date("expected_close"),
    lostReason: text("lost_reason"),
    notes: text("notes"),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("deals_stage_idx").on(t.stageId)],
);

/** Linha do tempo de um negócio/contato: notas, ligações, mudanças de etapa… */
export const activities = pgTable(
  "activities",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    dealId: uuid("deal_id").references(() => deals.id, { onDelete: "cascade" }),
    contactId: uuid("contact_id").references(() => contacts.id, { onDelete: "cascade" }),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    type: text("type").notNull(), // nota, ligacao, email, reuniao, etapa, visita
    body: text("body").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("activities_deal_idx").on(t.dealId), index("activities_contact_idx").on(t.contactId)],
);

export type TaskStatus = "a_fazer" | "em_andamento" | "travada" | "concluida";
export type TaskPriority = "baixa" | "media" | "alta" | "urgente";

/** Quadros de tarefas (estilo Monday): cada quadro tem grupos e itens. */
export const taskBoards = pgTable("task_boards", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  color: text("color").notNull().default("#b75928"),
  position: integer("position").notNull().default(0),
  createdById: uuid("created_by_id").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  /** definição das colunas personalizadas do quadro */
  columns: jsonb("columns").$type<TaskColumn[]>().notNull().default([]),
});

export const taskGroups = pgTable("task_groups", {
  id: uuid("id").primaryKey().defaultRandom(),
  boardId: uuid("board_id")
    .notNull()
    .references(() => taskBoards.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  color: text("color").notNull().default("#537179"),
  position: integer("position").notNull().default(0),
});

export const tasks = pgTable("tasks", {
  id: uuid("id").primaryKey().defaultRandom(),
  title: text("title").notNull(),
  dueAt: timestamp("due_at", { withTimezone: true }),
  doneAt: timestamp("done_at", { withTimezone: true }),
  dealId: uuid("deal_id").references(() => deals.id, { onDelete: "cascade" }),
  contactId: uuid("contact_id").references(() => contacts.id, { onDelete: "cascade" }),
  assigneeId: uuid("assignee_id").references(() => users.id, { onDelete: "set null" }),
  createdById: uuid("created_by_id").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  /** quadro e grupo (null = tarefa solta, ligada a um negócio ou contato) */
  boardId: uuid("board_id").references(() => taskBoards.id, { onDelete: "cascade" }),
  groupId: uuid("group_id").references(() => taskGroups.id, { onDelete: "set null" }),
  status: text("status").$type<TaskStatus>().notNull().default("a_fazer"),
  priority: text("priority").$type<TaskPriority>().notNull().default("media"),
  description: text("description"),
  position: doublePrecision("position").notNull().default(0),
  /** valores das colunas personalizadas do quadro: { [columnId]: valor } */
  custom: jsonb("custom").$type<Record<string, unknown>>().notNull().default({}),
  /** checklist / subtarefas */
  subtasks: jsonb("subtasks").$type<TaskSubtask[]>().notNull().default([]),
  /** etiquetas livres */
  labels: text("labels").array().notNull().default([]),
  /** anexos por link */
  links: jsonb("links").$type<TaskLink[]>().notNull().default([]),
  /** recorrência simples: ao concluir, cria a próxima ocorrência */
  recur: text("recur").$type<TaskRecur>(),
});

export type TaskSubtask = { id: string; text: string; done: boolean };
export type TaskLink = { id: string; url: string; name: string };
export type TaskRecur = "diaria" | "semanal" | "mensal";
export type TaskColumnType = "texto" | "numero" | "data" | "selecao" | "pessoa" | "caixa" | "link";
export type TaskColumn = { id: string; name: string; type: TaskColumnType; options?: string[] };

/** Comentários e atividade (histórico de mudanças) de uma tarefa. */
export const taskComments = pgTable(
  "task_comments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    taskId: uuid("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    kind: text("kind").$type<"comentario" | "atividade">().notNull().default("comentario"),
    body: text("body").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("task_comments_task_idx").on(t.taskId)],
);

/** Uma conversa por número de WhatsApp. */
export const conversations = pgTable("conversations", {
  id: uuid("id").primaryKey().defaultRandom(),
  phone: text("phone").notNull().unique(), // wa_id
  profileName: text("profile_name"),
  contactId: uuid("contact_id").references(() => contacts.id, { onDelete: "cascade" }),
  assigneeId: uuid("assignee_id").references(() => users.id, { onDelete: "set null" }),
  status: text("status").$type<"aberta" | "resolvida">().notNull().default("aberta"),
  unread: integer("unread").notNull().default(0),
  lastMessageAt: timestamp("last_message_at", { withTimezone: true }),
  lastInboundAt: timestamp("last_inbound_at", { withTimezone: true }), // janela de 24h da Meta
  preview: text("preview"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const messages = pgTable(
  "messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    direction: text("direction").$type<"in" | "out" | "note">().notNull(),
    body: text("body").notNull(),
    waMessageId: text("wa_message_id").unique(),
    status: text("status"), // sent, delivered, read, failed, local
    authorId: uuid("author_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("messages_conversation_idx").on(t.conversationId, t.createdAt)],
);

export const events = pgTable(
  "events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    title: text("title").notNull(),
    type: text("type").notNull().default("reuniao"), // reuniao, visita, obra, prazo, outro
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
    allDay: boolean("all_day").notNull().default(false),
    location: text("location"),
    description: text("description"),
    dealId: uuid("deal_id").references(() => deals.id, { onDelete: "cascade" }),
    contactId: uuid("contact_id").references(() => contacts.id, { onDelete: "cascade" }),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("events_starts_idx").on(t.startsAt)],
);

export type TxKind = "receita" | "despesa";

export const transactions = pgTable(
  "transactions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    kind: text("kind").$type<TxKind>().notNull(),
    description: text("description").notNull(),
    category: text("category"),
    amountCents: bigint("amount_cents", { mode: "number" }).notNull(),
    dueDate: date("due_date").notNull(),
    paidAt: date("paid_at"),
    dealId: uuid("deal_id").references(() => deals.id, { onDelete: "set null" }),
    contactId: uuid("contact_id").references(() => contacts.id, { onDelete: "cascade" }),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("transactions_due_idx").on(t.dueDate)],
);

export type DocKind = "contrato" | "apresentacao";
export type DocStatus = "rascunho" | "enviado" | "aceito" | "cancelado";

/** Contratos e apresentações comerciais. O conteúdo editável fica em `content`; ao enviar, uma cópia congelada vai para `snapshot`. */
export const documents = pgTable(
  "documents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    kind: text("kind").$type<DocKind>().notNull(),
    number: text("number").unique(), // CT-2026-0001 / PR-2026-0001
    title: text("title").notNull(),
    status: text("status").$type<DocStatus>().notNull().default("rascunho"),
    dealId: uuid("deal_id").references(() => deals.id, { onDelete: "set null" }),
    contactId: uuid("contact_id").references(() => contacts.id, { onDelete: "set null" }),
    templateSlug: text("template_slug"),
    content: jsonb("content").notNull(),
    snapshot: jsonb("snapshot"),
    publicToken: text("public_token").unique(),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    acceptedName: text("accepted_name"),
    acceptedDocument: text("accepted_document"),
    acceptedIp: text("accepted_ip"),
    acceptedUserAgent: text("accepted_user_agent"),
    version: integer("version").notNull().default(1),
    createdById: uuid("created_by_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("documents_kind_idx").on(t.kind, t.status), index("documents_deal_idx").on(t.dealId)],
);

export const documentVersions = pgTable(
  "document_versions",
  {
    id: serial("id").primaryKey(),
    documentId: uuid("document_id")
      .notNull()
      .references(() => documents.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    content: jsonb("content").notNull(),
    note: text("note"),
    createdById: uuid("created_by_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("document_versions_doc_idx").on(t.documentId, t.version)],
);

/** Linha do tempo do documento: criado, enviado, visualizado, aceito, ajuste pedido… */
export const documentEvents = pgTable(
  "document_events",
  {
    id: serial("id").primaryKey(),
    documentId: uuid("document_id")
      .notNull()
      .references(() => documents.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    meta: jsonb("meta"),
    at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("document_events_doc_idx").on(t.documentId, t.at)],
);

/** Modelos de contrato/apresentação e biblioteca de cláusulas. `slug` só existe nos modelos que acompanham o sistema. */
export const docTemplates = pgTable("doc_templates", {
  id: uuid("id").primaryKey().defaultRandom(),
  kind: text("kind").$type<"contrato" | "apresentacao" | "clausula">().notNull(),
  slug: text("slug").unique(),
  name: text("name").notNull(),
  description: text("description"),
  content: jsonb("content").notNull(),
  builtin: boolean("builtin").notNull().default(false),
  createdById: uuid("created_by_id").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Configurações do estúdio (dados que entram nos contratos). */
export const appSettings = pgTable("app_settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Trilha de auditoria: quem fez o quê (acessos, financeiro, exclusões, permissões). */
export const auditLog = pgTable(
  "audit_log",
  {
    id: serial("id").primaryKey(),
    at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
    actorId: uuid("actor_id"),
    actorName: text("actor_name"),
    action: text("action").notNull(), // login, login_falhou, usuario_criado, permissoes, lancamento_criado…
    entity: text("entity"), // usuario, lancamento, negocio, contato…
    entityId: text("entity_id"),
    summary: text("summary").notNull(),
    meta: jsonb("meta"),
  },
  (t) => [index("audit_at_idx").on(t.at), index("audit_action_idx").on(t.action, t.entityId)],
);

/* ----------------------------------- Drive ---------------------------------- */

/** Conexão com o Google Drive (tokens criptografados). Uma linha por conta conectada. */
export const driveConnections = pgTable("drive_connections", {
  id: uuid("id").primaryKey().defaultRandom(),
  provider: text("provider").notNull().default("google"),
  accountEmail: text("account_email"),
  accessTokenEnc: text("access_token_enc"),
  refreshTokenEnc: text("refresh_token_enc"),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  scope: text("scope"),
  connectedById: uuid("connected_by_id").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Pastas virtuais do CRM (organização interna dos links do Drive). */
export const driveFolders = pgTable(
  "drive_folders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    parentId: uuid("parent_id"),
    createdById: uuid("created_by_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("drive_folders_parent_idx").on(t.parentId)],
);

export type DriveKind = "pasta" | "documento" | "planilha" | "apresentacao" | "pdf" | "imagem" | "video" | "formulario" | "outro";

/** Arquivo ou pasta do Drive registrado por link (ou vindo da API do Google). */
export const driveItems = pgTable(
  "drive_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    provider: text("provider").notNull().default("links"), // links | google
    kind: text("kind").$type<DriveKind>().notNull().default("outro"),
    title: text("title").notNull(),
    url: text("url").notNull(),
    externalId: text("external_id"), // id do arquivo no Google Drive
    folderId: uuid("folder_id").references(() => driveFolders.id, { onDelete: "set null" }),
    contactId: uuid("contact_id").references(() => contacts.id, { onDelete: "set null" }),
    dealId: uuid("deal_id").references(() => deals.id, { onDelete: "set null" }),
    /** nome do projeto/obra (texto livre; sugere os projetos do site) */
    project: text("project"),
    tags: text("tags").array().notNull().default([]),
    notes: text("notes"),
    favorite: boolean("favorite").notNull().default(false),
    createdById: uuid("created_by_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("drive_items_folder_idx").on(t.folderId), index("drive_items_contact_idx").on(t.contactId), index("drive_items_deal_idx").on(t.dealId)],
);

export type DriveItem = typeof driveItems.$inferSelect;
export type DriveFolder = typeof driveFolders.$inferSelect;

export type User = typeof users.$inferSelect;
export type AuditEntry = typeof auditLog.$inferSelect;
export type DocumentRow = typeof documents.$inferSelect;
export type DocTemplate = typeof docTemplates.$inferSelect;
export type Contact = typeof contacts.$inferSelect;
export type Stage = typeof stages.$inferSelect;
export type Deal = typeof deals.$inferSelect;
export type Activity = typeof activities.$inferSelect;
export type Task = typeof tasks.$inferSelect;
export type Conversation = typeof conversations.$inferSelect;
export type Message = typeof messages.$inferSelect;
export type CalendarEvent = typeof events.$inferSelect;
export type Transaction = typeof transactions.$inferSelect;

export type TaskRow = typeof tasks.$inferSelect;
export type TaskBoard = typeof taskBoards.$inferSelect;
export type TaskGroup = typeof taskGroups.$inferSelect;

/* ------------------------------- Planilhas (módulo independente do Financeiro) ------------------------------- */

export const sheets = pgTable(
  "sheets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    ownerId: uuid("owner_id").references(() => users.id, { onDelete: "set null" }),
    dealId: uuid("deal_id").references(() => deals.id, { onDelete: "set null" }),
    contactId: uuid("contact_id").references(() => contacts.id, { onDelete: "set null" }),
    favorite: boolean("favorite").notNull().default(false),
    /** sobe a cada salvamento: controle otimista de conflito */
    version: integer("version").notNull().default(1),
    /** última aba aberta, origem do arquivo etc. */
    meta: jsonb("meta"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("sheets_updated_idx").on(t.updatedAt), index("sheets_deal_idx").on(t.dealId)],
);

export const sheetTabs = pgTable(
  "sheet_tabs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sheetId: uuid("sheet_id")
      .notNull()
      .references(() => sheets.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    position: integer("position").notNull().default(0),
    /** grade esparsa { linha: { coluna: { v, f, fmt, s } } } */
    grid: jsonb("grid").notNull(),
    /** larguras, alturas, congelamento, mesclagens, ocultos, filtro, dimensões */
    layout: jsonb("layout").notNull(),
  },
  (t) => [index("sheet_tabs_sheet_idx").on(t.sheetId, t.position)],
);

export const sheetVersions = pgTable(
  "sheet_versions",
  {
    id: serial("id").primaryKey(),
    sheetId: uuid("sheet_id")
      .notNull()
      .references(() => sheets.id, { onDelete: "cascade" }),
    label: text("label"),
    /** todas as abas no momento do instantâneo */
    snapshot: jsonb("snapshot").notNull(),
    createdById: uuid("created_by_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("sheet_versions_sheet_idx").on(t.sheetId, t.createdAt)],
);

export type SheetRowDb = typeof sheets.$inferSelect;

/* --------------------------- Notificações e automações --------------------------- */

/** Aviso dentro da plataforma, para uma pessoa. `dedupeKey` evita avisar duas vezes o mesmo fato. */
export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** categoria (ver lib/notifications-types.ts) */
    type: text("type").notNull(),
    title: text("title").notNull(),
    body: text("body"),
    href: text("href"),
    entity: text("entity"), // tarefa | negocio
    entityId: text("entity_id"),
    readAt: timestamp("read_at", { withTimezone: true }),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    dedupeKey: text("dedupe_key"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("notifications_user_idx").on(t.userId, t.createdAt),
    uniqueIndex("notifications_dedupe_idx").on(t.userId, t.dedupeKey),
  ],
);

/** Preferências de aviso por pessoa: silenciar tudo e/ou desligar categorias. */
export const notificationPrefs = pgTable("notification_prefs", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  muted: boolean("muted").notNull().default(false),
  disabledTypes: text("disabled_types").array().notNull().default([]),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type RuleParams = {
  days?: number;
  hours?: number;
  /** vários avisos antes do prazo (ex.: [1, 0]) */
  daysBefore?: number[];
  minValueCents?: number;
  /** prazo por etapa do funil (id da etapa → dias); vale no lugar de `days` */
  stageDays?: Record<string, number>;
  /** limita a regra a estas etapas (vazio = todas) */
  stageIds?: number[];
};
export type RuleCondition = { field: string; op: "eq" | "neq" | "in" | "gte" | "lte" | "contains" | "empty" | "notempty"; value?: string | number | string[] };
export type RuleAction =
  | { type: "notify"; to: string[]; title?: string; body?: string }
  | { type: "set_status"; status: TaskStatus }
  | { type: "set_priority"; priority: TaskPriority }
  | { type: "assign"; to: string }
  | { type: "add_label"; label: string }
  | { type: "create_followup"; title: string; inDays: number; to: string };

/** Regras de automação (gatilho → condições → ações). `key` identifica as regras prontas que acompanham o sistema. */
export const automationRules = pgTable("automation_rules", {
  id: uuid("id").primaryKey().defaultRandom(),
  key: text("key").unique(),
  name: text("name").notNull(),
  description: text("description"),
  trigger: text("trigger").notNull(),
  enabled: boolean("enabled").notNull().default(true),
  params: jsonb("params").$type<RuleParams>().notNull().default({}),
  conditions: jsonb("conditions").$type<RuleCondition[]>().notNull().default([]),
  actions: jsonb("actions").$type<RuleAction[]>().notNull().default([]),
  builtin: boolean("builtin").notNull().default(false),
  createdById: uuid("created_by_id").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Registro de execuções. A chave (regra + fato) é única: é o que garante a idempotência. */
export const automationRuns = pgTable(
  "automation_runs",
  {
    id: serial("id").primaryKey(),
    at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
    ruleId: uuid("rule_id").references(() => automationRules.id, { onDelete: "cascade" }),
    ruleName: text("rule_name").notNull(),
    trigger: text("trigger").notNull(),
    entity: text("entity"),
    entityId: text("entity_id"),
    entityLabel: text("entity_label"),
    status: text("status").$type<"ok" | "erro">().notNull().default("ok"),
    summary: text("summary").notNull(),
    dedupeKey: text("dedupe_key").notNull(),
  },
  (t) => [uniqueIndex("automation_runs_dedupe_idx").on(t.ruleId, t.dedupeKey), index("automation_runs_at_idx").on(t.at)],
);

export type NotificationRow = typeof notifications.$inferSelect;
export type AutomationRule = typeof automationRules.$inferSelect;
export type AutomationRun = typeof automationRuns.$inferSelect;

/* ----------------------------------- Editais ----------------------------------- */

/** Fontes de coleta de editais (PNCP busca, PNCP consulta…): estado da última passada. */
export const editalSources = pgTable("edital_sources", {
  key: text("key").primaryKey(),
  name: text("name").notNull(),
  enabled: boolean("enabled").notNull().default(true),
  lastRunAt: timestamp("last_run_at", { withTimezone: true }),
  lastStatus: text("last_status"),
  lastCount: integer("last_count").notNull().default(0),
});

/** Edital de licitação (restauro): coletado do PNCP, triado por regras e acompanhado pela equipe. */
export const editais = pgTable(
  "editais",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** numeroControlePNCP (único) */
    externalId: text("external_id").notNull(),
    source: text("source").notNull().default("pncp-busca"),
    title: text("title").notNull(),
    object: text("object").notNull(),
    organ: text("organ").notNull(),
    organCnpj: text("organ_cnpj"),
    unit: text("unit"),
    esfera: text("esfera"), // federal | estadual | municipal | distrital
    uf: text("uf"),
    city: text("city"),
    ibge: text("ibge"),
    modalidade: text("modalidade"),
    /** projeto | execucao | projeto_execucao | laudo | outro */
    kind: text("kind").notNull().default("outro"),
    kindWhy: text("kind_why"),
    /** relevância 0–100 e termos que casaram (auditoria) */
    score: integer("score").notNull().default(0),
    matched: text("matched").array().notNull().default([]),
    valueCents: bigint("value_cents", { mode: "number" }),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    openAt: timestamp("open_at", { withTimezone: true }),
    closeAt: timestamp("close_at", { withTimezone: true }),
    /** aberto | encerrado | suspenso | cancelado */
    situation: text("situation").notNull().default("aberto"),
    url: text("url"),
    sourceUrl: text("source_url"),
    /** triagem da equipe: novo | interessante | em_analise | proposta_enviada | descartado | ganho | perdido */
    triage: text("triage").notNull().default("novo"),
    discardReason: text("discard_reason"),
    notes: text("notes"),
    ownerId: uuid("owner_id").references(() => users.id, { onDelete: "set null" }),
    dealId: uuid("deal_id").references(() => deals.id, { onDelete: "set null" }),
    taskId: uuid("task_id").references(() => tasks.id, { onDelete: "set null" }),
    firstSeenAt: timestamp("first_seen_at", { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
    /** rodada que trouxe o edital pela primeira vez */
    runId: integer("run_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("editais_external_idx").on(t.externalId),
    index("editais_close_idx").on(t.closeAt),
    index("editais_uf_idx").on(t.uf),
    index("editais_triage_idx").on(t.triage, t.score),
    index("editais_first_seen_idx").on(t.firstSeenAt),
  ],
);

/** Histórico de um edital: triagem, notas, responsável, vínculo com negócio/tarefa, atualizações do portal. */
export const editalEvents = pgTable(
  "edital_events",
  {
    id: serial("id").primaryKey(),
    editalId: uuid("edital_id")
      .notNull()
      .references(() => editais.id, { onDelete: "cascade" }),
    at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    userName: text("user_name"),
    type: text("type").notNull(), // triagem | nota | responsavel | negocio | tarefa | portal
    body: text("body").notNull(),
  },
  (t) => [index("edital_events_edital_idx").on(t.editalId, t.at)],
);

/** Rodadas de varredura: solicitada pelo botão → pega pelo GitHub Actions → concluída. Também guarda o ponto de retomada. */
export const editalRuns = pgTable(
  "edital_runs",
  {
    id: serial("id").primaryKey(),
    /** solicitada | executando | concluida | parcial | falhou */
    status: text("status").notNull().default("solicitada"),
    /** rapida (direto no CRM) | completa (GitHub Actions) */
    mode: text("mode").notNull().default("completa"),
    /** painel | agendada | github */
    trigger: text("trigger").notNull().default("painel"),
    requestedById: uuid("requested_by_id").references(() => users.id, { onDelete: "set null" }),
    requestedByName: text("requested_by_name"),
    requestedAt: timestamp("requested_at", { withTimezone: true }).notNull().defaultNow(),
    startedAt: timestamp("started_at", { withTimezone: true }),
    heartbeatAt: timestamp("heartbeat_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    /** janela em dias (por data de publicação) */
    days: integer("days").notNull().default(14),
    /** pedido ao qual esta rodada atende (a rápida atende o mesmo pedido da completa) */
    parentId: integer("parent_id"),
    runUrl: text("run_url"),
    /** { scanned, candidates, relevant, created, updated, errors } */
    stats: jsonb("stats").$type<Record<string, unknown>>().notNull().default({}),
    /** ponto de retomada: { phase, step, page } */
    cursor: jsonb("cursor").$type<Record<string, unknown> | null>(),
    error: text("error"),
  },
  (t) => [index("edital_runs_status_idx").on(t.status, t.requestedAt)],
);

export type EditalRow = typeof editais.$inferSelect;
export type EditalRunRow = typeof editalRuns.$inferSelect;
export type EditalEventRow = typeof editalEvents.$inferSelect;
