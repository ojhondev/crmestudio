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
});

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

export type User = typeof users.$inferSelect;
export type AuditEntry = typeof auditLog.$inferSelect;
export type Contact = typeof contacts.$inferSelect;
export type Stage = typeof stages.$inferSelect;
export type Deal = typeof deals.$inferSelect;
export type Activity = typeof activities.$inferSelect;
export type Task = typeof tasks.$inferSelect;
export type Conversation = typeof conversations.$inferSelect;
export type Message = typeof messages.$inferSelect;
export type CalendarEvent = typeof events.$inferSelect;
export type Transaction = typeof transactions.$inferSelect;
