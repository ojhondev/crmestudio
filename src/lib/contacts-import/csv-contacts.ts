import { parseCsv } from "@/lib/csv";
import type { RawContact } from "./types";

/**
 * CSV de contatos: Google Contatos (inglês e português), Outlook, iPhone/iCloud (via apps) e CSV genérico.
 * Reconhece as colunas pelo nome (sem acento, sem maiúsculas) e permite ajustar o mapeamento à mão.
 */

export type Role = "nome" | "nome_proprio" | "nome_meio" | "sobrenome" | "telefone" | "email" | "empresa" | "cargo" | "endereco" | "cidade" | "estado" | "observacoes" | "ignorar";

export const ROLE_LABEL: Record<Role, string> = {
  nome: "Nome completo",
  nome_proprio: "Primeiro nome",
  nome_meio: "Nome do meio",
  sobrenome: "Sobrenome",
  telefone: "Telefone",
  email: "E-mail",
  empresa: "Empresa / instituição",
  cargo: "Cargo",
  endereco: "Endereço",
  cidade: "Cidade",
  estado: "Estado",
  observacoes: "Observações",
  ignorar: "Ignorar esta coluna",
};

const fold = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

/** Adivinha o papel de uma coluna pelo cabeçalho. */
export function guessRole(header: string): Role {
  const h = fold(header);
  if (!h) return "ignorar";
  if (/(label|rotulo|type|tipo|phonetic|fonetic|file as|archivar|nickname|apelido|prefix|prefixo|suffix|sufixo|sufixo|group|grupo|photo|foto|birthday|aniversario|website|url|event|evento|relation|relacao)/.test(h)) {
    if (/notes|observa/.test(h)) return "observacoes";
    return "ignorar";
  }
  if (/(e-?mail|email|correio)/.test(h)) return "email";
  if (/(phone|telefone|celular|mobile|fone|whats|tel\b|tel$)/.test(h)) return "telefone";
  if (/(organi[sz]ation.*(title|cargo)|job title|cargo|title|funcao|role|position)/.test(h) && !/name prefix|name suffix/.test(h)) return "cargo";
  if (/((nome|name) (da|de|of) (organi|empres|instituic)|organi[sz]a(tion|cao).*(name|nome)|^company|^empresa|^organi[sz]|^instituicao|^paroquia)/.test(h)) return "empresa";
  if (/(organi[sz]ation.*department|departamento)/.test(h)) return "ignorar";
  if (/(first name|primeiro nome|given name|^nome$|^name$|nome proprio)/.test(h)) return /^(nome|name)$/.test(h) ? "nome" : "nome_proprio";
  if (/(middle name|nome do meio|additional name)/.test(h)) return "nome_meio";
  if (/(last name|sobrenome|family name|surname)/.test(h)) return "sobrenome";
  if (/(display name|nome completo|full name|nome de exibicao|nome para exibicao)/.test(h)) return "nome";
  if (/(city|cidade|municipio|localidade)/.test(h)) return "cidade";
  if (/(region|estado|state|uf\b|province)/.test(h)) return "estado";
  if (/(formatted|formatado|street|logradouro|^address$|^endereco$|^rua\b)/.test(h)) return "endereco";
  if (/(notes?|observa|anotac|obs\b|comentario)/.test(h)) return "observacoes";
  return "ignorar";
}

export function autoMap(headers: string[]): Role[] {
  const roles = headers.map(guessRole);
  // "Nome" + "Sobrenome" (Google em português): "Nome" é só o primeiro nome
  if (roles.includes("sobrenome") && !roles.includes("nome_proprio")) {
    const i = roles.indexOf("nome");
    if (i >= 0) roles[i] = "nome_proprio";
  }
  return roles;
}

export type ParsedCsv = { headers: string[]; rows: string[][]; roles: Role[] };

export function readCsv(text: string): ParsedCsv {
  const all = parseCsv(text);
  const headers = (all[0] ?? []).map((h) => h.trim());
  const rows = all.slice(1);
  return { headers, rows, roles: autoMap(headers) };
}

const splitMulti = (v: string) =>
  v
    .split(/\s*:::\s*/)
    .map((x) => x.trim())
    .filter(Boolean);

/** Converte as linhas em contatos crus segundo o mapeamento de colunas. */
export function csvToRaw(rows: string[][], roles: Role[]): RawContact[] {
  const out: RawContact[] = [];
  for (const r of rows) {
    const c: RawContact = { phones: [], emails: [] };
    let given = "";
    let middle = "";
    let family = "";
    let full = "";
    roles.forEach((role, i) => {
      const v = (r[i] ?? "").trim();
      if (!v || role === "ignorar") return;
      switch (role) {
        case "nome":
          full = full || v;
          break;
        case "nome_proprio":
          given = given || v;
          break;
        case "nome_meio":
          middle = middle || v;
          break;
        case "sobrenome":
          family = family || v;
          break;
        case "telefone":
          for (const p of splitMulti(v)) c.phones.push({ value: p });
          break;
        case "email":
          for (const e of splitMulti(v)) c.emails.push(e);
          break;
        case "empresa":
          c.company = c.company ?? v;
          break;
        case "cargo":
          c.role = c.role ?? v;
          break;
        case "endereco":
          c.address = c.address ?? v.replace(/\s*:::\s*/g, " | ");
          break;
        case "cidade":
          c.city = c.city ?? v;
          break;
        case "estado":
          c.state = c.state ?? v;
          break;
        case "observacoes":
          c.notes = c.notes ? `${c.notes}\n${v}` : v;
          break;
      }
    });
    c.givenName = given;
    c.familyName = family;
    c.name = full || [given, middle, family].filter(Boolean).join(" ");
    if (!c.name && !c.company && c.phones.length === 0 && c.emails.length === 0) continue; // linha vazia
    out.push(c);
  }
  return out;
}

/** O mapeamento tem o mínimo para importar (nome ou empresa, e telefone ou e-mail)? */
export function mapProblems(roles: Role[]): string[] {
  const p: string[] = [];
  const has = (r: Role) => roles.includes(r);
  if (!has("nome") && !has("nome_proprio") && !has("empresa")) p.push("Escolha qual coluna é o nome.");
  if (!has("telefone") && !has("email")) p.push("Escolha qual coluna é o telefone (ou o e-mail).");
  return p;
}
