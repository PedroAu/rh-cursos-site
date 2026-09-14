"use client";

import {
  startTransition,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PropsWithChildren
} from "react";
import { toast } from "sonner";

import { courseCoverByPath, defaultCourseCover } from "@/lib/course-covers";
import { debounce } from "@/lib/debounce";
import { getInitials } from "@/lib/get-initials";
import { slugify } from "@/lib/utils";
import { company } from "@/lib/company";
import { supabase, isSupabaseConfigured } from "@/lib/supabase/client";
import { invokeFunction, isFunctionsConfigured, getStableClientIp } from "@/lib/supabase/functions-client";
import { SESSION_REFRESH_THRESHOLD_MS } from "@/lib/auth-session";
import * as rhCursosApi from "@/lib/supabase/rh-cursos-api";
import { mapBlogPost, mapLead, type BlogPostRow, type LeadRow } from "@/lib/supabase/mappers";
import { enrollmentReceiptSchema } from "@/lib/validation";
import type {
  BlogPost,
  Course,
  CurrentSession,
  Enrollment,
  Instructor,
  Lead,
  Student,
  TrainingClass
} from "@/types";

import { AdminStoreContext, type AdminStoreValue, type BlogTransitionAction } from "@/lib/contexts/admin-context";
import { CourseStoreContext, type CourseStoreValue } from "@/lib/contexts/course-context";
import { SessionStoreContext, type SessionStoreValue } from "@/lib/contexts/session-context";
import { StudentStoreContext, type StudentStoreValue } from "@/lib/contexts/student-context";
import type {
  AdminEnrollmentPayload,
  AppState,
  AppStoreInitialData,
  LeadPayload,
  StudentPayload
} from "@/lib/contexts/store-types";

export type { AppStoreInitialData } from "@/lib/contexts/store-types";

/**
 * Interface pública agregada. Mantida por retrocompatibilidade: `useAppStore()`
 * compõe os quatro contextos de domínio e expõe o mesmo shape plano de antes.
 */
export type AppStoreValue = SessionStoreValue & CourseStoreValue & StudentStoreValue & AdminStoreValue;

const STORAGE_KEY = "rhcursos-demo-store-v4";

/**
 * Fallback de `courseCategories` quando não há catálogo real nem estado
 * atual: deriva das categorias do mock de cursos (não há mock dedicado).
 */
function deriveCourseCategoriesFromCourses(courses: Course[]): string[] {
  const categories = new Set<string>();
  for (const course of courses) {
    const values = course.categories?.length ? course.categories : course.category ? [course.category] : [];
    for (const value of values) categories.add(value);
  }
  return Array.from(categories).sort((a, b) => a.localeCompare(b, "pt-BR"));
}

type AdminMutation =
  | {
      resource: "courses" | "classes" | "students" | "instructors" | "blog" | "leads" | "enrollments";
      action: "upsert";
      payload: unknown;
    }
  | { resource: "blog"; action: "save-draft"; payload: unknown }
  | { resource: "blog"; action: "save-content"; payload: unknown }
  | { resource: "blog"; action: BlogTransitionAction; id: string; scheduledAt?: string }
  | {
      resource: "students" | "enrollments";
      action: "create";
      payload: unknown;
    }
  | { resource: "courses" | "classes" | "students" | "instructors" | "blog" | "leads" | "enrollments"; action: "delete"; id: string }
  | { resource: "leads" | "enrollments"; action: "update-status"; id: string; status: string };

// Nasce vazio (sem mockCatalog/mockBlogPosts) até o bootstrap real completar
// (Story 16.1, AC4) — o catálogo público nunca deve exibir dado fictício
// como estado inicial de produção.
const initialState: AppState = {
  courses: [],
  classes: [],
  students: [],
  instructors: [],
  coursePublicContents: [],
  leads: [],
  enrollments: [],
  blogPosts: [],
  testimonials: [],
  trainingPaths: [],
  courseCategories: [],
  currentSession: null
};


const ARRAY_STATE_KEYS = [
  "courses",
  "classes",
  "students",
  "instructors",
  "coursePublicContents",
  "leads",
  "enrollments",
  "blogPosts",
  "testimonials",
  "trainingPaths",
  "courseCategories"
] as const satisfies readonly (keyof AppStoreInitialData)[];

type PublicCatalogSnapshot = Awaited<ReturnType<typeof rhCursosApi.fetchPublicCatalogFromSupabase>>;

function sanitizeInitialData(initialData?: AppStoreInitialData): AppStoreInitialData | undefined {
  if (!initialData) return initialData;

  const sanitized: AppStoreInitialData = { ...initialData };

  for (const key of ARRAY_STATE_KEYS) {
    if (key in sanitized && !Array.isArray(sanitized[key])) {
      delete sanitized[key];
    }
  }

  return sanitized;
}

/**
 * Sem fallback para mockCatalog (Story 16.1, AC5): uma busca bem-sucedida é
 * sempre a fonte da verdade, mesmo com 0 linhas — catálogo real vazio deve
 * aparecer vazio na UI, não ser mascarado por dado fictício. `catalog: null`
 * sinaliza falha de busca (rede/RLS/timeout): nesse caso preserva-se o que já
 * está em `current` (não regride para vazio nem substitui por mock); quem
 * chama é responsável por propagar o estado de erro visível (ver bootstrap
 * effect abaixo).
 */
function resolveCatalogBootstrapState(current: AppState, catalog: PublicCatalogSnapshot) {
  if (!catalog) {
    return {
      courses: current.courses,
      classes: current.classes,
      instructors: current.instructors,
      trainingPaths: current.trainingPaths,
      coursePublicContents: current.coursePublicContents,
      courseCategories: current.courseCategories
    };
  }

  return {
    courses: catalog.courses,
    classes: catalog.classes,
    instructors: catalog.instructors,
    trainingPaths: catalog.trainingPaths,
    coursePublicContents: catalog.coursePublicContents,
    courseCategories: catalog.courseCategories.length
      ? catalog.courseCategories
      : deriveCourseCategoriesFromCourses(catalog.courses)
  };
}

function readInitialState(initialSession?: CurrentSession | null, initialData?: AppStoreInitialData) {
  return {
    ...initialState,
    ...sanitizeInitialData(initialData),
    currentSession: initialSession ?? null
  };
}

function clearLegacyStoredState() {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.removeItem(STORAGE_KEY);
}

function countConfirmedEnrollments(enrollments: Enrollment[], classId: string) {
  return enrollments.filter(
    (item) =>
      item.classId === classId &&
      (item.status === "Confirmada" || item.status === "Aguardando pagamento" || item.status === "Concluída")
  ).length;
}

function deriveClassCapacity(trainingClass: TrainingClass, enrollments: Enrollment[]) {
  const siteFilledSeats = countConfirmedEnrollments(enrollments, trainingClass.id);
  const manualFilledSeats = Math.max(
    trainingClass.manualFilledSeats ?? trainingClass.filledSeats - siteFilledSeats,
    0
  );
  const filledSeats = Math.min(trainingClass.totalSeats, manualFilledSeats + siteFilledSeats);

  return {
    manualFilledSeats,
    filledSeats,
    availableSeats: Math.max(0, trainingClass.totalSeats - filledSeats),
  };
}

function createRealtimeSubscription(
  client: NonNullable<typeof supabase>,
  channelName: string,
  table: string,
  isActive: () => boolean,
  onChange: () => void
) {
  return client
    .channel(channelName)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table },
      () => {
        if (!isActive()) return;
        onChange();
      }
    )
    .subscribe((status) => {
      if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
        console.error(`Real-time subscription failed for channel '${channelName}': ${status}`);
      }
    });
}

function upsertCollection<T extends { id: string }>(
  collection: T[],
  exists: boolean,
  nextItem: T
): T[] {
  return exists
    ? collection.map((item) => (item.id === nextItem.id ? nextItem : item))
    : [nextItem, ...collection];
}

function restoreDeletedItem<T extends { id: string }>(
  collection: T[],
  removedItem: T,
  removedIndex: number
): T[] {
  const next = [...collection];
  next.splice(Math.min(Math.max(removedIndex, 0), next.length), 0, removedItem);
  return next;
}

function leadNaturalKey(lead: Lead) {
  return `${String(lead.name ?? "").trim().toLowerCase()}|${String(lead.email ?? "").trim().toLowerCase()}`;
}

function mergeLeads(current: Lead[], incoming: Lead[]) {
  const byKey = new Map<string, Lead>();

  for (const lead of current) {
    byKey.set(leadNaturalKey(lead), lead);
  }

  for (const lead of incoming) {
    byKey.set(leadNaturalKey(lead), lead);
  }

  return Array.from(byKey.values()).sort(
    (left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime()
  );
}

function buildLeadRecord(payload: LeadPayload, fallback?: Partial<Lead>): Lead {
  return {
    ...payload,
    id: fallback?.id ?? `lead-${Date.now()}`,
    createdAt: fallback?.createdAt ?? new Date().toISOString(),
    status: fallback?.status ?? payload.status ?? "Novo",
  };
}

function parseAdminLeadConfirmation(payload: unknown): Pick<Lead, "id" | "createdAt" | "status"> {
  const ok =
    payload && typeof payload === "object" && "ok" in payload
      ? (payload as { ok?: unknown }).ok
      : undefined;
  const data =
    payload && typeof payload === "object" && "data" in payload
      ? (payload as { data?: unknown }).data
      : null;
  const row = data && typeof data === "object"
    ? (data as { id?: unknown; created_at?: unknown; status_crm?: unknown })
    : null;
  const statusByDatabaseValue: Record<string, Lead["status"]> = {
    Novo: "Novo",
    Contatado: "Em atendimento",
    EmAtendimento: "Em atendimento",
    PropostaEnviada: "Proposta enviada",
    Convertido: "Convertido",
    Perdido: "Perdido",
  };
  const id = typeof row?.id === "string" ? row.id.trim() : "";
  const createdAt = typeof row?.created_at === "string" ? row.created_at : "";
  const status = typeof row?.status_crm === "string"
    ? statusByDatabaseValue[row.status_crm]
    : undefined;

  if (ok !== true || !id || !createdAt || Number.isNaN(Date.parse(createdAt)) || !status) {
    throw new Error("Resposta inválida ao cadastrar o lead.");
  }

  return { id, createdAt, status };
}

function buildStudentRecord(
  payload: StudentPayload,
  fallback?: Partial<Student>
): Student {
  return {
    id: fallback?.id ?? `student-${Date.now()}`,
    name: payload.name,
    email: payload.email,
    phone: payload.phone ?? fallback?.phone ?? "",
    cpf: payload.cpf ?? fallback?.cpf ?? "",
    organization: payload.organization ?? fallback?.organization ?? "",
    jobTitle: payload.jobTitle ?? fallback?.jobTitle ?? "",
    courseId: payload.courseId ?? fallback?.courseId ?? "",
    classId: payload.classId ?? fallback?.classId ?? "",
    enrollmentStatus: fallback?.enrollmentStatus ?? "Pendente",
    certificateIssued: fallback?.certificateIssued ?? false,
    enrolledAt: fallback?.enrolledAt ?? new Date().toISOString(),
    paymentMethod: payload.paymentMethod ?? fallback?.paymentMethod ?? "Pix",
  };
}

function buildEnrollmentRecord(
  payload: AdminEnrollmentPayload,
  fallbackId?: string,
  fallbackStatus: Enrollment["status"] = "Confirmada"
): Enrollment {
  return {
    id: fallbackId ?? `enrollment-${Date.now()}`,
    studentName: payload.studentName,
    email: payload.email,
    phone: payload.phone,
    cpf: payload.cpf,
    organization: payload.organization,
    jobTitle: payload.jobTitle,
    enrollmentType: payload.enrollmentType,
    paymentMethod: payload.paymentMethod,
    courseId: payload.courseId,
    classId: payload.classId,
    status: payload.status ?? fallbackStatus,
    createdAt: new Date().toISOString(),
    notes: payload.notes ?? "",
  };
}

/**
 * Persiste a mutação via Edge Function e só reporta sucesso quando a escrita
 * de fato aconteceu. Rejeita em caso de falha — quem chama decide o que fazer
 * (ex.: manter o modal do admin aberto e mostrar o erro) em vez de a UI
 * declarar sucesso otimista sobre uma escrita que não aconteceu.
 */
function persistAdminMutation(
  mutation: AdminMutation,
  successMessage?: string
): Promise<{ id?: string } | undefined> {
  if (!isFunctionsConfigured) {
    if (successMessage) toast.success(successMessage);
    return Promise.resolve(undefined);
  }

  return invokeFunction("admin-resources", {
    body: mutation,
    ...(mutation.action === "delete" ? { keepalive: true } : {}),
  })
    .then(async (response) => {
      if (!response.ok) {
        if (response.status === 401) {
          // Keep the BFF fail-closed, but do not navigate away from an open
          // form. The operator can copy the data, reauthenticate, and retry.
          const message = "Sua sessão administrativa expirou. Faça login novamente e tente salvar outra vez.";
          toast.error(message);
          throw new Error(message);
        }
        const message = await getFunctionErrorMessage(
          response,
          "Não foi possível sincronizar a alteração com o Supabase."
        );
        toast.error(message);
        throw new Error(message);
      }
      if (successMessage) toast.success(successMessage);
      const body = (await response.json().catch(() => null)) as { data?: { id?: string; [key: string]: unknown } } | null;
      return body?.data;
    })
    .catch((error) => {
      const message = error instanceof Error ? error.message : "Não foi possível sincronizar a alteração com o Supabase.";
      throw new Error(message);
    });
}

async function getFunctionErrorMessage(response: Response, fallback: string) {
  try {
    const payload = (await response.json()) as { error?: string };
    if (payload?.error) return payload.error;
  } catch {
    // Ignora payloads não JSON e usa fallback.
  }

  return fallback;
}

const ADMIN_ENROLLMENTS_PAGE_SIZE = 100;

type AdminEnrollmentsResponse = {
  ok?: boolean;
  data?: Enrollment[];
  page?: number;
  pageSize?: number;
  total?: number;
};

/**
 * Hidrata as inscrições administrativas pelo read model same-origin.
 *
 * A tela administrativa mantém paginação e busca locais. Por isso, o provider
 * percorre as páginas autorizadas do endpoint e entrega à UI o conjunto
 * completo, sem expor service-role nem depender do cliente Supabase anon.
 */
async function fetchAdminEnrollments(): Promise<Enrollment[]> {
  const enrollments: Enrollment[] = [];
  let page = 1;
  let total = 0;

  do {
    const params = new URLSearchParams({
      page: String(page),
      pageSize: String(ADMIN_ENROLLMENTS_PAGE_SIZE),
    });
    const response = await fetch(`/api/admin/enrollments?${params.toString()}`, {
      method: "GET",
      headers: { Accept: "application/json" },
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error(await getFunctionErrorMessage(response, "Não foi possível carregar as inscrições."));
    }

    const payload = (await response.json().catch(() => null)) as AdminEnrollmentsResponse | null;
    if (payload?.ok !== true || !Array.isArray(payload.data)) {
      throw new Error("Resposta inválida ao carregar as inscrições.");
    }

    enrollments.push(...payload.data);
    total = typeof payload.total === "number" && payload.total >= 0 ? payload.total : enrollments.length;

    if (payload.data.length === 0 || enrollments.length >= total) break;
    page += 1;
  } while (page <= 1_000);

  return enrollments;
}

async function fetchAdminLeads(): Promise<Lead[]> {
  const response = await invokeFunction("admin-resources", {
    body: {
      resource: "leads",
      action: "list",
    },
  });

  if (!response.ok) {
    throw new Error(await getFunctionErrorMessage(response, "Não foi possível carregar os leads."));
  }

  const payload = (await response.json().catch(() => null)) as
    | {
        data?: LeadRow[];
      }
    | null;

  return Array.isArray(payload?.data) ? payload.data.map(mapLead) : [];
}

async function fetchAdminBlogPosts(): Promise<BlogPost[]> {
  const response = await invokeFunction("admin-resources", {
    body: { resource: "blog", action: "list" },
  });

  if (!response.ok) {
    throw new Error(await getFunctionErrorMessage(response, "Não foi possível carregar os posts do blog."));
  }

  const payload = (await response.json().catch(() => null)) as { data?: BlogPostRow[] } | null;
  return Array.isArray(payload?.data) ? payload.data.map(mapBlogPost) : [];
}

/**
 * Follow-up REC-204 (item 6 do post-mortem REC-502): token efêmero de realtime.
 *
 * O cliente Supabase do browser é permanentemente `anon` desde o cutover Fase B
 * (sessão SSR vive só em cookie httpOnly, ADR-016 D2). Para receber eventos
 * `postgres_changes` das tabelas admin (`lead`/`aluno`/`inscricao`), cujas
 * policies RLS exigem `authenticated`, o canal precisa apresentar um JWT válido.
 * Este helper busca, sob demanda, o `access_token` de curta duração da sessão
 * SSR pelo BFF same-origin `GET /api/auth/realtime-token`. O token é usado
 * SOMENTE em memória (nunca storage) por quem chama.
 */
type RealtimeTokenResponse = { accessToken: string; expiresAt: number };
type RealtimeTokenResult =
  | ({ status: "ok" } & RealtimeTokenResponse)
  | { status: "unauthorized" }
  | { status: "transient" };

async function fetchRealtimeToken(): Promise<RealtimeTokenResult> {
  try {
    const response = await fetch("/api/auth/realtime-token", {
      method: "GET",
      headers: { Accept: "application/json" },
      cache: "no-store"
    });

    if (response.status === 401 || response.status === 403) return { status: "unauthorized" };
    if (!response.ok) return { status: "transient" };

    const payload = (await response.json().catch(() => null)) as Partial<RealtimeTokenResponse> | null;
    if (!payload || typeof payload.accessToken !== "string" || typeof payload.expiresAt !== "number") {
      return { status: "transient" };
    }

    return { status: "ok", accessToken: payload.accessToken, expiresAt: payload.expiresAt };
  } catch {
    return { status: "transient" };
  }
}

// Margem de segurança para renovar o token antes da expiração real da sessão.
const REALTIME_TOKEN_RENEWAL_MARGIN_MS = 60_000;
const REALTIME_TOKEN_TRANSIENT_RETRY_MS = 15_000;

function shouldUseLocalEnrollmentProxy() {
  if (typeof window === "undefined") return false;

  return (
    window.location.hostname === "127.0.0.1" ||
    window.location.hostname === "localhost"
  );
}

export function AppStoreProvider({
  children,
  initialSession = null,
  initialData,
  bootstrapPublicData = true
}: PropsWithChildren<{
  initialSession?: CurrentSession | null;
  initialData?: AppStoreInitialData;
  bootstrapPublicData?: boolean;
}>) {
  const [state, setState] = useState<AppState>(() => readInitialState(initialSession, initialData));

  // Ref espelhando o state para callbacks estáveis lerem o valor atual sem
  // recriar sua identidade a cada mudança (evita re-renders em cascata).
  const stateRef = useRef(state);
  const logoutInProgressRef = useRef(false);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const catalogFetchVersionRef = useRef(0);

  useEffect(() => {
    clearLegacyStoredState();
  }, []);

  // Reconciliação de sessão na inicialização: a sessão admin server-side (cookie
  // SSR httpOnly) entra por prop `initialSession`. REC-204 Fase B removeu o
  // fallback do token HMAC em localStorage — sem sessão SSR, força-se novo login.
  useEffect(() => {
    if (initialSession) {
      setState((current) => {
        if (
          current.currentSession?.role === initialSession.role &&
          current.currentSession?.email === initialSession.email &&
          current.currentSession?.name === initialSession.name
        ) {
          return current;
        }

        return { ...current, currentSession: initialSession };
      });
      return;
    }

    // Sem sessão SSR: qualquer sessão persistida em state é inconsistente.
    setState((current) =>
      current.currentSession ? { ...current, currentSession: null } : current
    );
  }, [initialSession]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!state.currentSession) return;

    let cancelled = false;

    const syncSession = async () => {
      if (logoutInProgressRef.current) return;

      try {
        const response = await fetch("/api/auth/session", {
          method: "GET",
          headers: { Accept: "application/json" },
          cache: "no-store",
        });

        if (cancelled) return;

        if (response.status === 401) {
          setState((current) =>
            current.currentSession ? { ...current, currentSession: null } : current
          );
          return;
        }

        if (!response.ok) return;

        const payload = (await response.json().catch(() => null)) as
          | {
              session?: CurrentSession;
            }
          | null;

        const nextSession = payload?.session ?? null;
        if (!nextSession) return;

        setState((current) => {
          if (
            current.currentSession?.role === nextSession.role &&
            current.currentSession?.email === nextSession.email &&
            current.currentSession?.name === nextSession.name
          ) {
            return current;
          }

          return { ...current, currentSession: nextSession };
        });
      } catch {
        // Mantém a sessão atual e tenta novamente na próxima interação visível.
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void syncSession();
      }
    };

    void syncSession();
    window.addEventListener("focus", syncSession);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    const intervalId = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        void syncSession();
      }
    }, SESSION_REFRESH_THRESHOLD_MS);

    return () => {
      cancelled = true;
      window.removeEventListener("focus", syncSession);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.clearInterval(intervalId);
    };
  }, [state.currentSession]);

  // O read model same-origin das inscrições não depende do cliente Supabase
  // público nem de WebSocket. Mantemos esta hidratação separada do efeito de
  // realtime para que o painel continue funcionando mesmo quando o cliente
  // browser não estiver configurado para subscriptions.
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (state.currentSession?.role !== "admin") return;

    let active = true;
    let inFlight = false;

    const hydrateAdminEnrollments = async () => {
      if (inFlight) return;
      inFlight = true;

      try {
        const enrollments = await fetchAdminEnrollments();
        if (active) {
          setState((current) => ({ ...current, enrollments }));
        }
      } catch (error) {
        if (active) console.error("Falha ao carregar inscrições administrativas:", error);
      } finally {
        inFlight = false;
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") void hydrateAdminEnrollments();
    };

    void hydrateAdminEnrollments();
    window.addEventListener("focus", hydrateAdminEnrollments);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      active = false;
      window.removeEventListener("focus", hydrateAdminEnrollments);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [state.currentSession?.role]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (state.currentSession?.role !== "admin") return;
    // O catálogo editorial só precisa ser hidratado quando o administrador
    // está dentro do módulo de blog. Evita uma chamada BFF em todas as telas
    // administrativas e mantém o bootstrap das demais áreas determinístico.
    if (!window.location.pathname.startsWith("/admin/blog")) return;

    let active = true;
    const hydrateAdminBlog = async () => {
      try {
        const blogPosts = await fetchAdminBlogPosts();
        if (active) setState((current) => ({ ...current, blogPosts }));
      } catch (error) {
        if (active) console.error("Falha ao carregar posts administrativos:", error);
      }
    };

    void hydrateAdminBlog();
    window.addEventListener("focus", hydrateAdminBlog);
    return () => {
      active = false;
      window.removeEventListener("focus", hydrateAdminBlog);
    };
  }, [state.currentSession?.role]);

  useEffect(() => {
    // Guard explícito de ambiente: subscriptions real-time dependem de WebSocket
    // do browser. Evita side effects de rede em SSR ou em ambientes sem window.
    if (typeof window === "undefined") return;
    if (!isSupabaseConfigured || !supabase) return;

    let active = true;
    const subscriptions: ReturnType<typeof supabase.channel>[] = [];
    const client = supabase;
    let clientPublicTestBaselineEnabled = false;
    try {
      const candidate = (rhCursosApi as typeof rhCursosApi & {
        isClientPublicTestBaselineEnabled?: () => boolean;
      }).isClientPublicTestBaselineEnabled;
      clientPublicTestBaselineEnabled = typeof candidate === "function" && candidate();
    } catch {
      // Older test doubles may omit this optional guard.
    }
    const publicTestBaselineEnabled = rhCursosApi.isExplicitPublicTestBaselineEnabled() || clientPublicTestBaselineEnabled;

    // Timer de renovação do token efêmero de realtime (limpo no cleanup).
    let realtimeTokenRenewalTimer: ReturnType<typeof setTimeout> | undefined;

    const scheduleCatalogRefetch = debounce(() => {
      if (!active) return;
      catalogFetchVersionRef.current += 1;
      const fetchVersion = catalogFetchVersionRef.current;

      rhCursosApi.fetchPublicCatalogFromSupabase()
        .then((updated) => {
          if (!active || !updated || fetchVersion !== catalogFetchVersionRef.current) return;
          setState((current) => ({
            ...current,
            courses: updated.courses,
            classes: updated.classes,
            instructors: updated.instructors,
            trainingPaths: updated.trainingPaths,
            coursePublicContents: updated.coursePublicContents,
            courseCategories: updated.courseCategories.length ? updated.courseCategories : current.courseCategories
          }));
        })
        .catch(() => undefined);
    }, 300);

    const scheduleBlogRefetch = debounce(() => {
      if (!active) return;
      const fetcher = stateRef.current.currentSession?.role === "admin"
        ? fetchAdminBlogPosts
        : rhCursosApi.fetchPublicBlogPostsFromSupabase;
      fetcher()
        .then((updated) => {
          if (!active || !updated) return;
          setState((current) => ({ ...current, blogPosts: updated }));
        })
        .catch(() => undefined);
    }, 300);

    const scheduleLeadRefetch = debounce(() => {
      if (!active) return;
      // REC-206: o refetch de leads disparado por realtime também trafega
      // exclusivamente pelo BFF same-origin (admin-resources leads/list,
      // autorizado pela sessão SSR), nunca pelo cliente Supabase direto — este
      // era o contrato duplicado de leitura de leads e foi removido.
      if (stateRef.current.currentSession?.role !== "admin") return;
      fetchAdminLeads()
        .then((updated) => {
          if (!active || !updated.length) return;
          setState((current) => ({ ...current, leads: mergeLeads(current.leads, updated) }));
        })
        .catch(() => undefined);
    }, 300);

    const scheduleEnrollmentRefetch = debounce(() => {
      if (!active) return;
      if (stateRef.current.currentSession?.role !== "admin") return;
      fetchAdminEnrollments()
        .then((updated) => {
          if (!active) return;
          setState((current) => ({ ...current, enrollments: updated }));
        })
        .catch((error) => {
          if (active) console.error("Falha ao atualizar inscrições administrativas:", error);
        });
    }, 300);

    if (bootstrapPublicData) {
      Promise.all([
        rhCursosApi.fetchPublicCatalogFromSupabase(),
        rhCursosApi.fetchPublicBlogPostsFromSupabase()
      ])
        .then(([catalog, blogPosts]) => {
          if (!active) return;

          setState((current) => ({
            ...current,
            ...resolveCatalogBootstrapState(current, catalog),
            blogPosts: blogPosts ?? []
          }));

          // Real-time subscriptions para cursos após dados iniciais carregarem
          if (active && supabase && !publicTestBaselineEnabled) {
            const courseSub = createRealtimeSubscription(
              supabase,
              "curso_changes",
              "curso",
              () => active,
              scheduleCatalogRefetch
            );

            // Real-time subscriptions para blog posts
            const blogSub = createRealtimeSubscription(
              supabase,
              "blog_changes",
              "post_blog",
              () => active,
              scheduleBlogRefetch
            );

            // Real-time para instrutores (dado público do catálogo). Refetch do
            // catálogo completo mantém cursos/turmas/instrutores consistentes.
            const instructorSub = createRealtimeSubscription(
              supabase,
              "instrutor_changes",
              "instrutor",
              () => active,
              scheduleCatalogRefetch
            );

            // Turmas mudam a disponibilidade, o status e o instrutor exibidos
            // na agenda e no detalhe do curso. O refetch atômico do catálogo
            // evita mesclar um payload parcial com os dados derivados.
            const classSub = createRealtimeSubscription(
              supabase,
              "turma_changes",
              "turma",
              () => active,
              scheduleCatalogRefetch
            );

            const courseContentSub = createRealtimeSubscription(
              supabase,
              "curso_public_content_changes",
              "curso_public_content",
              () => active,
              scheduleCatalogRefetch
            );

            subscriptions.push(courseSub, blogSub, instructorSub, classSub, courseContentSub);
          }
        })
        .catch((error) => {
          if (!active) return;
          // Erro de rede/RLS/timeout: propaga um estado de erro visível (log +
          // toast) em vez de mascarar com dado mock (Story 16.1, AC5).
          // Preserva o catálogo/blog atual em memória — não regride para vazio.
          console.error("Falha ao carregar catálogo público do Supabase:", error);
          toast.error("Não foi possível atualizar o catálogo de cursos. Tente novamente em instantes.");
          setState((current) => ({
            ...current,
            ...resolveCatalogBootstrapState(current, null)
          }));
        });
    }

    // Lazy load admin data apenas quando há sessão admin ativa (SSR).
    // REC-204 Fase B: a autoridade é a sessão SSR (cookie httpOnly), não mais
    // o token HMAC em localStorage; o BFF same-origin autoriza a leitura.
    const isAdminSession = stateRef.current.currentSession?.role === "admin";

    if (isAdminSession) {
      fetchAdminLeads()
        .then((leads) => {
          if (!active || !leads.length) return;
          setState((current) => ({ ...current, leads: mergeLeads(current.leads, leads) }));
        })
        .catch(() => undefined);

    }

    if (isAdminSession && supabase) {
      // Follow-up REC-204 (post-mortem REC-502, item 6): as tabelas admin
      // (`lead`/`inscricao`/`aluno`) têm RLS `to authenticated`. Como o cliente
      // do browser é `anon` desde o cutover Fase B, o canal precisa apresentar
      // um JWT válido via `realtime.setAuth` — obtido do BFF same-origin e usado
      // apenas em memória. Sem token válido, NÃO abrimos os canais (fail-closed).
      const scheduleRealtimeTokenRenewal = (expiresAt: number) => {
        const delay = Math.max(expiresAt - Date.now() - REALTIME_TOKEN_RENEWAL_MARGIN_MS, 0);
        realtimeTokenRenewalTimer = setTimeout(() => {
          if (!active) return;
          void fetchRealtimeToken().then((renewed) => {
            if (!active) return;
            if (renewed.status === "unauthorized") {
              subscriptions.splice(0).forEach((channel) => client.removeChannel(channel));
              return;
            }
            if (renewed.status === "transient") {
              scheduleRealtimeTokenRenewal(Date.now() + REALTIME_TOKEN_TRANSIENT_RETRY_MS + REALTIME_TOKEN_RENEWAL_MARGIN_MS);
              return;
            }
            client.realtime.setAuth(renewed.accessToken);
            scheduleRealtimeTokenRenewal(renewed.expiresAt);
          });
        }, delay);
      };

      void fetchRealtimeToken().then((token) => {
        // Fail-closed: sem token (401/403/erro) tratamos como se não houvesse
        // sessão admin para este efeito — nenhum canal autenticado é aberto.
        if (!active || token.status !== "ok") return;

        client.realtime.setAuth(token.accessToken);
        scheduleRealtimeTokenRenewal(token.expiresAt);

        // REC-206: a leitura de leads é servida exclusivamente pelo BFF
        // same-origin (fetchAdminLeads, acima). As subscriptions realtime aqui
        // apenas notificam mudanças sob RLS.
        const leadSub = createRealtimeSubscription(
          client,
          "lead_changes",
          "lead",
          () => active,
          scheduleLeadRefetch
        );

        subscriptions.push(leadSub);

        // O bootstrap administrativo contém também registros inativos.
        // Um refetch público não pode substituir esse conjunto por uma
        // visão RLS reduzida após eventos de inscrição/aluno.
        // Mudanças em inscrição afetam tanto a lista administrativa quanto a
        // capacidade das turmas (vagas). Cada consumidor refaz somente seu
        // read model autorizado, sem ler a tabela diretamente no browser.
        const enrollmentSub = createRealtimeSubscription(
          client,
          "inscricao_changes",
          "inscricao",
          () => active,
          () => {
            scheduleEnrollmentRefetch();
            if (bootstrapPublicData) scheduleCatalogRefetch();
          }
        );

        if (bootstrapPublicData) {
          // Alterações em aluno podem refletir nas estatísticas do catálogo
          // (total de alunos por curso).
          const studentSub = createRealtimeSubscription(
            client,
            "aluno_changes",
            "aluno",
            () => active,
            scheduleCatalogRefetch
          );

          subscriptions.push(enrollmentSub, studentSub);
        } else {
          subscriptions.push(enrollmentSub);
        }
      });
    }

    return () => {
      active = false;
      if (realtimeTokenRenewalTimer) {
        clearTimeout(realtimeTokenRenewalTimer);
      }
      // Cleanup todas as subscriptions
      subscriptions.forEach(channel => {
        client.removeChannel(channel);
      });
    };
  }, [bootstrapPublicData, state.currentSession?.role]);

  const setSession = useCallback<AppStoreValue["setSession"]>((session) => {
    logoutInProgressRef.current = false;
    setState((current) => ({ ...current, currentSession: session }));
    toast.success("Login realizado.");
  }, []);

  const logout = useCallback<AppStoreValue["logout"]>(() => {
    logoutInProgressRef.current = true;
    // REC-204 Fase B: sem token/sessão Supabase em localStorage. A revogação
    // da sessão SSR (incluindo signout global) é feita server-side pela rota
    // DELETE /api/auth/session, que limpa o cookie httpOnly e revoga no Supabase.
    const notifyLocalOnlyFallback = () => {
      toast.success("Sessão local encerrada.");
    };

    void (async () => {
      try {
        const clientIp = getStableClientIp();
        const response = await fetch("/api/auth/session", {
          method: "DELETE",
          headers: {
            "Content-Type": "application/json",
            "cf-connecting-ip": clientIp,
            "x-forwarded-for": clientIp,
            "x-real-ip": clientIp
          },
          body: JSON.stringify({})
        });

        if (!response.ok) {
          notifyLocalOnlyFallback();
          return;
        }

        const payload = (await response.json().catch(() => null)) as
          | { mode?: "global" | "local-only"; revoked?: boolean }
          | null;

        if (payload?.mode === "global" && payload.revoked) {
          toast.success("Sessão global encerrada.");
          return;
        }

        notifyLocalOnlyFallback();
      } catch {
        notifyLocalOnlyFallback();
      } finally {
        setState((current) => (current.currentSession ? { ...current, currentSession: null } : current));
      }
    })();

    if (supabase) {
      void supabase.auth.signOut().catch(() => undefined);
    }
    setState((current) => ({ ...current, currentSession: null }));
  }, []);

  const createEnrollment = useCallback<AppStoreValue["createEnrollment"]>(async (payload) => {
    let response: Response;

    if (shouldUseLocalEnrollmentProxy()) {
      response = await fetch("/api/enrollments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
    } else if (isFunctionsConfigured) {
      response = await invokeFunction("enrollments", { body: payload });
    } else {
      throw new Error("Pré-inscrição indisponível no momento.");
    }

    if (!response.ok) {
      throw new Error(await getFunctionErrorMessage(response, "Não foi possível enviar a pré-inscrição."));
    }

    const responsePayload = await response.json().catch(() => null);
    const parsedReceipt = enrollmentReceiptSchema.safeParse(responsePayload);
    if (!parsedReceipt.success) {
      throw new Error("Resposta inválida ao enviar a pré-inscrição.");
    }

    const receipt = {
      enrollmentId: parsedReceipt.data.enrollmentId,
      classId: parsedReceipt.data.classId,
    };
    const createdAt = new Date().toISOString();

    setState((current) => {
      const enrollments = [
        {
          id: receipt.enrollmentId,
          createdAt,
          status: "Pendente" as const,
          ...payload,
          classId: receipt.classId,
          paymentMethod: null,
        },
        ...current.enrollments
      ];

      return {
        ...current,
        enrollments,
        students: current.students,
        classes: current.classes,
      };
    });

    return receipt;
  }, []);

  const createStudent = useCallback<AppStoreValue["createStudent"]>(async (payload) => {
    const persisted = await persistAdminMutation(
      { resource: "students", action: "create", payload },
      undefined
    );
    const persistedId = typeof persisted?.id === "string" ? persisted.id.trim() : "";

    if (isFunctionsConfigured && !persistedId) {
      throw new Error("Resposta inválida ao criar o aluno.");
    }

    setState((current) => ({
      ...current,
      students: [
        buildStudentRecord(payload, {
          id: persistedId || undefined,
          courseId: payload.courseId ?? current.courses[0]?.id ?? "",
          classId: payload.classId ?? current.classes[0]?.id ?? "",
        }),
        ...current.students,
      ],
    }));
    toast.success(isFunctionsConfigured ? "Aluno criado." : "Aluno registrado apenas nesta sessão de desenvolvimento.");
  }, []);

  const deleteStudent = useCallback<AppStoreValue["deleteStudent"]>(async (id) => {
    const snapshot = stateRef.current.students;
    const removedIndex = snapshot.findIndex((item) => item.id === id);
    const removedItem = removedIndex >= 0 ? snapshot[removedIndex] : null;

    setState((current) => ({
      ...current,
      students: current.students.filter((item) => item.id !== id),
    }));

    try {
      await persistAdminMutation({ resource: "students", action: "delete", id }, undefined);
    } catch (error) {
      if (removedItem) {
        setState((current) => ({
          ...current,
          students: restoreDeletedItem(current.students, removedItem, removedIndex),
        }));
      }
      throw error;
    }
    toast.success("Aluno excluído.");
  }, []);

  const createEnrollmentAdmin = useCallback<AppStoreValue["createEnrollmentAdmin"]>(async (payload) => {
    const result = await persistAdminMutation(
      { resource: "enrollments", action: "create", payload },
      undefined
    );
    setState((current) => {
      const student = buildStudentRecord(
        {
          name: payload.studentName,
          email: payload.email,
          phone: payload.phone,
          cpf: payload.cpf,
          organization: payload.organization,
          jobTitle: payload.jobTitle,
          courseId: payload.courseId,
          classId: payload.classId,
          paymentMethod: payload.paymentMethod,
        },
        {
          courseId: payload.courseId,
          classId: payload.classId,
          enrolledAt: new Date().toISOString(),
        }
      );
      const enrollment = buildEnrollmentRecord(payload, result?.id, "Aguardando pagamento");
      const nextEnrollments = [enrollment, ...current.enrollments];

      return {
        ...current,
        enrollments: nextEnrollments,
        students: [student, ...current.students],
        classes: current.classes.map((item) => {
          if (item.id !== payload.classId) return item;
          const capacity = deriveClassCapacity(item, nextEnrollments);
          return {
            ...item,
            ...capacity,
            status: capacity.availableSeats <= 5 ? "Poucas vagas" : item.status,
          };
        }),
      };
    });

    toast.success(isFunctionsConfigured ? "Inscrição criada." : "Inscrição criada apenas nesta sessão de desenvolvimento.");
  }, []);

  const deleteEnrollment = useCallback<AppStoreValue["deleteEnrollment"]>(async (id) => {
    const snapshot = stateRef.current.enrollments;
    const removedIndex = snapshot.findIndex((item) => item.id === id);
    const removedItem = removedIndex >= 0 ? snapshot[removedIndex] : null;

    setState((current) => {
      const enrollment = current.enrollments.find((item) => item.id === id);
      const nextEnrollments = current.enrollments.filter((item) => item.id !== id);

      return {
        ...current,
        enrollments: nextEnrollments,
        classes: enrollment
          ? current.classes.map((item) => {
              if (item.id !== enrollment.classId) return item;
              const capacity = deriveClassCapacity(item, nextEnrollments);
              return {
                ...item,
                ...capacity,
                status: capacity.availableSeats <= 5 ? "Poucas vagas" : item.status,
              };
            })
          : current.classes,
      };
    });

    try {
      await persistAdminMutation({ resource: "enrollments", action: "delete", id }, undefined);
    } catch (error) {
      if (removedItem) {
        setState((current) => ({
          ...current,
          enrollments: restoreDeletedItem(current.enrollments, removedItem, removedIndex),
          classes: current.classes.map((item) => ({
            ...item,
            ...deriveClassCapacity(item, restoreDeletedItem(current.enrollments, removedItem, removedIndex)),
          })),
        }));
      }
      throw error;
    }
    toast.success("Inscrição excluída.");
  }, []);

  const deleteLead = useCallback<AppStoreValue["deleteLead"]>(async (id) => {
    const snapshot = stateRef.current.leads;
    const removedIndex = snapshot.findIndex((item) => item.id === id);
    const removedItem = removedIndex >= 0 ? snapshot[removedIndex] : null;

    setState((current) => ({
      ...current,
      leads: current.leads.filter((item) => item.id !== id),
    }));

    try {
      await persistAdminMutation({ resource: "leads", action: "delete", id }, undefined);
    } catch (error) {
      if (removedItem) {
        setState((current) => ({
          ...current,
          leads: restoreDeletedItem(current.leads, removedItem, removedIndex),
        }));
      }
      throw error;
    }
    toast.success("Lead excluído.");
  }, []);

  const createLead = useCallback<AppStoreValue["createLead"]>(async (payload) => {
    // REC-204 Fase B: a rota admin (admin-resources) é escolhida quando há
    // sessão admin SSR ativa; o BFF same-origin autoriza via cookie httpOnly.
    const usedAdminMutation = Boolean(
      isFunctionsConfigured && stateRef.current.currentSession?.role === "admin"
    );
    let confirmedLead: Pick<Lead, "id" | "createdAt" | "status"> | undefined;

    if (!isFunctionsConfigured && process.env.NODE_ENV === "production") {
      throw new Error("Serviço de atendimento indisponível. Tente novamente mais tarde.");
    }

    if (usedAdminMutation) {
      let response: Response;

      try {
        response = await invokeFunction("admin-resources", {
          body: {
            resource: "leads",
            action: "create",
            payload: {
              ...payload,
              status: "Novo",
            },
          },
        });
      } catch {
        throw new Error("Serviço indisponível no momento. A solicitação não foi enviada.");
      }

      if (!response.ok) {
        throw new Error(await getFunctionErrorMessage(response, "Não foi possível cadastrar o lead."));
      }

      const responsePayload = await response.json().catch(() => null);
      confirmedLead = parseAdminLeadConfirmation(responsePayload);
    }

    if (isFunctionsConfigured && !usedAdminMutation) {
      let response: Response;

      try {
        response = await invokeFunction("leads", { body: payload });
      } catch {
        throw new Error("Serviço indisponível no momento. A solicitação não foi enviada.");
      }

      if (!response.ok) {
        throw new Error(await getFunctionErrorMessage(response, "Não foi possível cadastrar o lead."));
      }
    }

    startTransition(() => {
      setState((current) => ({
        ...current,
        leads: mergeLeads(current.leads, [buildLeadRecord(payload, confirmedLead)])
      }));
    });
  }, []);

  const updateLeadStatus = useCallback<AppStoreValue["updateLeadStatus"]>((id, status) => {
    setState((current) => ({
      ...current,
      leads: current.leads.map((lead) => (lead.id === id ? { ...lead, status } : lead))
    }));
    return persistAdminMutation({ resource: "leads", action: "update-status", id, status }, "Status do lead atualizado.").then(() => undefined);
  }, []);

  const updateLead = useCallback<AppStoreValue["updateLead"]>((payload) => {
    setState((current) => ({
      ...current,
      leads: current.leads.map((lead) => (lead.id === payload.id ? { ...lead, ...payload } : lead))
    }));
    return persistAdminMutation({
      resource: "leads",
      action: "upsert",
      payload: {
        id: payload.id,
        name: payload.name,
        email: payload.email,
        phone: payload.phone,
        type: payload.type,
        courseInterest: payload.courseInterest,
        courseId: payload.courseId,
        origin: payload.origin,
        status: payload.status,
        organization: payload.organization,
        teamSize: payload.teamSize,
        preferredModality: payload.preferredModality,
        trainingObjective: payload.trainingObjective,
        trainingTheme: payload.trainingTheme,
        mainChallenges: payload.mainChallenges,
        message: payload.message,
      },
    }, "Lead atualizado.").then(() => undefined);
  }, []);

  const upsertCourse = useCallback<AppStoreValue["upsertCourse"]>(async (course) => {
    const snapshot = stateRef.current;
    const trainingPaths = snapshot.trainingPaths;
    const defaultPath = trainingPaths[0];
    const resolvedPathId = course.pathId ?? defaultPath?.id ?? "";
    const exists = course.id && snapshot.courses.some((item) => item.id === course.id);
    const resolvedModalities = course.modalities?.length
      ? course.modalities
      : course.modality
        ? [course.modality]
        : ["Ao vivo online"];
    const primaryModality = resolvedModalities[0] ?? "Ao vivo online";
    const nextCourse: Course = exists
      ? ({
          ...snapshot.courses.find((item) => item.id === course.id)!,
          ...course,
          modality: primaryModality,
          modalities: resolvedModalities
        } as Course)
      : ({
          id: `course-${Date.now()}`,
          slug: slugify(course.title ?? "novo-curso"),
          title: course.title ?? "Novo curso",
          pathId: resolvedPathId,
          pathName:
            trainingPaths.find((item) => item.id === resolvedPathId)?.name ??
            defaultPath?.name ??
            "",
          modality: primaryModality,
          modalities: resolvedModalities,
          durationLabel: course.durationLabel ?? "8h",
          durationHours: course.durationHours ?? 8,
          level: course.level ?? "Básico",
          category: course.category ?? course.categories?.[0] ?? defaultPath?.shortName ?? "",
          categories:
            course.categories ??
            (course.category
              ? [course.category]
              : defaultPath?.shortName
                ? [defaultPath.shortName]
                : []),
          price: course.price ?? 0,
          shortDescription: course.shortDescription ?? "Descrição curta do curso.",
          fullDescription: course.fullDescription ?? "Descrição completa do curso.",
          targetAudience: course.targetAudience ?? ["Profissionais"],
          objectives: course.objectives ?? ["Objetivo principal"],
          benefits: course.benefits ?? ["Material de apoio"],
          modules: course.modules ?? [],
          instructorId: course.instructorId ?? snapshot.instructors[0]?.id ?? "inst-1",
          image: course.image ?? courseCoverByPath[resolvedPathId] ?? defaultCourseCover,
          rating: course.rating ?? 0,
          studentsCount: course.studentsCount ?? 0,
          status: course.status ?? "Ativo",
          featured: course.featured ?? false,
          featuredCourseIds: course.featuredCourseIds ?? [],
          nextClassId: course.nextClassId ?? snapshot.classes[0]?.id ?? ""
        } as Course);

    const persisted = await persistAdminMutation(
      { resource: "courses", action: "upsert", payload: {
        id: course.id,
        title: nextCourse.title,
        pathId: nextCourse.pathId,
        modality: nextCourse.modality,
        modalities: nextCourse.modalities ?? [nextCourse.modality],
        level: nextCourse.level,
        status: nextCourse.status,
        featured: nextCourse.featured,
        durationHours: nextCourse.durationHours,
        durationLabel: `${nextCourse.durationHours ?? 0}h`,
        price: nextCourse.price,
        shortDescription: nextCourse.shortDescription,
        fullDescription: nextCourse.fullDescription,
        image: nextCourse.image,
        targetAudience: nextCourse.targetAudience,
        categories: nextCourse.categories,
        objectives: nextCourse.objectives,
        benefits: nextCourse.benefits,
        modules: nextCourse.modules,
      } },
      course.id ? "Curso editado." : "Curso criado no admin."
    );
    const canonicalCourse = typeof persisted?.id === "string" && persisted.id.trim()
      ? { ...nextCourse, id: persisted.id.trim() }
      : nextCourse;
    setState((current) => ({
      ...current,
      courses: upsertCollection(current.courses, Boolean(exists), canonicalCourse)
    }));
  }, []);

  const deleteCourse = useCallback<AppStoreValue["deleteCourse"]>(async (id) => {
    const snapshot = stateRef.current.courses;
    const removedIndex = snapshot.findIndex((item) => item.id === id);
    const removedItem = removedIndex >= 0 ? snapshot[removedIndex] : null;

    setState((current) => ({
      ...current,
      courses: current.courses.filter((item) => item.id !== id)
    }));

    try {
      await persistAdminMutation({ resource: "courses", action: "delete", id }, "Curso excluído.");
    } catch (error) {
      if (removedItem) {
        setState((current) => ({
          ...current,
          courses: restoreDeletedItem(current.courses, removedItem, removedIndex),
        }));
      }
      throw error;
    }
  }, []);

  const duplicateCourse = useCallback<AppStoreValue["duplicateCourse"]>((id) => {
    const source = stateRef.current.courses.find((item) => item.id === id);
    if (!source) return;

    setState((current) => ({
      ...current,
      courses: [
        {
          ...source,
          id: `course-${Date.now()}`,
          slug: `${source.slug}-copia`,
          title: `${source.title} (Cópia)`
        },
        ...current.courses
      ]
    }));
    toast.success("Curso duplicado.");
  }, []);

  const upsertClass = useCallback<AppStoreValue["upsertClass"]>(async (trainingClass) => {
    const snapshot = stateRef.current;
    const exists = trainingClass.id && snapshot.classes.some((item) => item.id === trainingClass.id);
    const baseClass: TrainingClass = exists
      ? ({ ...snapshot.classes.find((item) => item.id === trainingClass.id)!, ...trainingClass } as TrainingClass)
        : ({
          id: `class-${Date.now()}`,
          courseId: trainingClass.courseId ?? snapshot.courses[0]?.id ?? "",
          startDate: trainingClass.startDate ?? new Date().toISOString(),
          endDate: trainingClass.endDate ?? trainingClass.startDate ?? new Date().toISOString(),
          time: trainingClass.time ?? "09:00 às 17:00",
          modality: trainingClass.modality ?? "Ao vivo online",
          location: trainingClass.location ?? "Online",
          instructorId: trainingClass.instructorId ?? "",
          totalSeats: trainingClass.totalSeats ?? 30,
          manualFilledSeats: trainingClass.manualFilledSeats ?? trainingClass.filledSeats ?? 0,
          filledSeats: trainingClass.filledSeats ?? 0,
          availableSeats: trainingClass.availableSeats ?? 30,
          status: trainingClass.status ?? "Inscrições abertas",
          price: trainingClass.price ?? 0,
          notes: trainingClass.notes ?? "Turma criada no modo simulado."
        } as TrainingClass);
    const nextClass = {
      ...baseClass,
      ...deriveClassCapacity(baseClass, snapshot.enrollments)
    };

    const persisted = await persistAdminMutation(
      { resource: "classes", action: "upsert", payload: {
        id: trainingClass.id,
        courseId: nextClass.courseId,
        startDate: nextClass.startDate,
        endDate: nextClass.endDate,
        time: nextClass.time,
        modality: nextClass.modality,
        location: nextClass.location,
        instructorId: nextClass.instructorId || undefined,
        totalSeats: nextClass.totalSeats,
        manualFilledSeats: nextClass.manualFilledSeats,
        price: nextClass.price,
        status: nextClass.status,
      } },
      trainingClass.id ? "Turma editada." : "Turma criada."
    );
    const canonicalClass = typeof persisted?.id === "string" && persisted.id.trim()
      ? { ...nextClass, id: persisted.id.trim() }
      : nextClass;
    setState((current) => ({
      ...current,
      classes: upsertCollection(current.classes, Boolean(exists), canonicalClass)
    }));
  }, []);

  const deleteClass = useCallback<AppStoreValue["deleteClass"]>(async (id) => {
    const snapshot = stateRef.current.classes;
    const removedIndex = snapshot.findIndex((item) => item.id === id);
    const removedItem = removedIndex >= 0 ? snapshot[removedIndex] : null;

    setState((current) => ({
      ...current,
      classes: current.classes.filter((item) => item.id !== id)
    }));

    try {
      await persistAdminMutation({ resource: "classes", action: "delete", id }, "Turma excluída.");
    } catch (error) {
      if (removedItem) {
        setState((current) => ({
          ...current,
          classes: restoreDeletedItem(current.classes, removedItem, removedIndex),
        }));
      }
      throw error;
    }
  }, []);

  const upsertInstructor = useCallback<AppStoreValue["upsertInstructor"]>(async (instructor) => {
    const snapshot = stateRef.current;
    const exists = instructor.id && snapshot.instructors.some((item) => item.id === instructor.id);
    const nextInstructor: Instructor = exists
      ? ({
          ...snapshot.instructors.find((item) => item.id === instructor.id)!,
          ...instructor,
          avatar:
            instructor.photoUrl ||
            instructor.avatar ||
            snapshot.instructors.find((item) => item.id === instructor.id)!.avatar,
        } as Instructor)
      : ({
          id: `inst-${Date.now()}`,
          name: instructor.name ?? "Novo instrutor",
          email: instructor.email ?? "",
          phone: instructor.phone ?? company.phones.primary,
          specialty: instructor.specialty ?? "",
          bio: instructor.bio ?? "Mini bio do instrutor.",
          education: instructor.education ?? "",
          photoUrl: instructor.photoUrl ?? "",
          courseIds: instructor.courseIds ?? [],
          rating: instructor.rating ?? 4.8,
          avatar:
            instructor.photoUrl ??
            instructor.avatar ??
            (instructor.name ? getInitials(instructor.name) : undefined) ??
            "NI",
          status: instructor.status ?? "Ativo"
        } as Instructor);

    const persisted = await persistAdminMutation(
      { resource: "instructors", action: "upsert", payload: {
        id: instructor.id,
        name: nextInstructor.name,
        email: nextInstructor.email,
        phone: nextInstructor.phone,
        specialty: nextInstructor.specialty,
        bio: nextInstructor.bio,
        education: nextInstructor.education,
        photoUrl: nextInstructor.photoUrl,
        status: nextInstructor.status,
        courseIds: nextInstructor.courseIds ?? [],
      } },
      instructor.id ? "Instrutor editado." : "Instrutor criado."
    );
    const canonicalInstructor = typeof persisted?.id === "string" && persisted.id.trim()
      ? { ...nextInstructor, id: persisted.id.trim() }
      : nextInstructor;
    setState((current) => ({
      ...current,
      instructors: upsertCollection(current.instructors, Boolean(exists), canonicalInstructor)
    }));
  }, []);

  const deleteInstructor = useCallback<AppStoreValue["deleteInstructor"]>(async (id) => {
    const snapshot = stateRef.current.instructors;
    const removedIndex = snapshot.findIndex((item) => item.id === id);
    const removedItem = removedIndex >= 0 ? snapshot[removedIndex] : null;

    setState((current) => ({
      ...current,
      instructors: current.instructors.filter((item) => item.id !== id)
    }));

    try {
      await persistAdminMutation({ resource: "instructors", action: "delete", id }, "Instrutor excluído.");
    } catch (error) {
      if (removedItem) {
        setState((current) => ({
          ...current,
          instructors: restoreDeletedItem(current.instructors, removedItem, removedIndex),
        }));
      }
      throw error;
    }
  }, []);

  const updateStudent = useCallback<AppStoreValue["updateStudent"]>(async (student) => {
    await persistAdminMutation({ resource: "students", action: "upsert", payload: student }, "Aluno atualizado.");
    setState((current) => ({
      ...current,
      students: current.students.map((item) => (item.id === student.id ? { ...item, ...student } : item))
    }));
  }, []);

  const updateEnrollmentStatus = useCallback<AppStoreValue["updateEnrollmentStatus"]>(async (id, status) => {
    await persistAdminMutation(
      { resource: "enrollments", action: "update-status", id, status },
      "Status da inscrição atualizado."
    );
    setState((current) => {
      const enrollments = current.enrollments.map((item) => (item.id === id ? { ...item, status } : item));

      return {
        ...current,
        enrollments,
        classes: current.classes.map((item) => ({
          ...item,
          ...deriveClassCapacity(item, enrollments)
        }))
      };
    });
  }, []);

  const upsertBlogPost = useCallback<AppStoreValue["upsertBlogPost"]>(async (post) => {
    const snapshot = stateRef.current;
    const exists = post.id && snapshot.blogPosts.some((item) => item.id === post.id);
    const nextPost: BlogPost = exists
      ? ({ ...snapshot.blogPosts.find((item) => item.id === post.id)!, ...post } as BlogPost)
      : ({
          id: `post-${Date.now()}`,
          title: post.title ?? "Novo post",
          slug: slugify(post.title ?? "novo-post"),
          summary: post.summary ?? "Resumo do artigo.",
          content: post.content ?? "Conteúdo do artigo.",
          category: post.category ?? "Tecnologia",
          tags: post.tags ?? ["novo"],
          author: post.author ?? "Equipe RH Cursos",
          date: new Date().toISOString(),
          readingTime: post.readingTime ?? "5 min",
          status: post.status ?? "Rascunho",
          image: post.image ?? "https://images.unsplash.com/photo-1516321318423",
          relatedCourseId: post.relatedCourseId ?? ""
        } as BlogPost);

    const persisted = await persistAdminMutation(
      { resource: "blog", action: "upsert", payload: {
        id: post.id,
        title: nextPost.title,
        summary: nextPost.summary,
        content: nextPost.content,
        category: nextPost.category,
        tags: nextPost.tags,
        author: nextPost.author,
        readingTime: nextPost.readingTime,
        status: nextPost.status,
        image: nextPost.image,
        relatedCourseId: nextPost.relatedCourseId,
      } },
      post.id ? "Post atualizado." : "Post publicado."
    );
    const canonicalPost = typeof persisted?.id === "string" && persisted.id.trim()
      ? { ...nextPost, id: persisted.id.trim() }
      : nextPost;
    startTransition(() => {
      setState((current) => ({
        ...current,
        blogPosts: upsertCollection(current.blogPosts, Boolean(exists), canonicalPost)
      }));
    });
  }, []);

  const saveBlogDraft = useCallback<AppStoreValue["saveBlogDraft"]>(async (post, options) => {
    const snapshot = stateRef.current;
    const exists = post.id && snapshot.blogPosts.some((item) => item.id === post.id);
    const nextPost: BlogPost = exists
      ? ({ ...snapshot.blogPosts.find((item) => item.id === post.id)!, ...post, status: "Rascunho" } as BlogPost)
      : ({
          id: `post-${Date.now()}`,
          title: post.title ?? "Novo post",
          slug: slugify(post.title ?? "novo-post"),
          summary: post.summary ?? "",
          content: post.content ?? "",
          category: post.category ?? "Tecnologia",
          tags: post.tags ?? [],
          author: post.author ?? "Equipe RH Cursos",
          date: new Date().toISOString(),
          readingTime: post.readingTime ?? "5 min",
          image: post.image ?? "",
          relatedCourseId: post.relatedCourseId ?? "",
          ...post,
          status: "Rascunho"
        } as BlogPost);

    const persisted = await persistAdminMutation(
      {
        resource: "blog",
        action: "save-draft",
        payload: {
          id: post.id,
          title: nextPost.title,
          summary: nextPost.summary,
          content: nextPost.content,
          category: nextPost.category,
          tags: nextPost.tags,
          author: nextPost.author,
          readingTime: nextPost.readingTime,
          status: "Rascunho",
          image: nextPost.image,
          imageAlt: nextPost.imageAlt,
          contentFormat: nextPost.contentFormat,
          seoTitle: nextPost.seoTitle,
          seoDescription: nextPost.seoDescription,
          canonicalUrl: nextPost.canonicalUrl,
          ogImageUrl: nextPost.ogImageUrl,
          relatedCourseId: nextPost.relatedCourseId,
        }
      },
      options?.silent ? undefined : "Rascunho salvo."
    );
    const canonicalPost = persisted && typeof persisted.id === "string"
      ? mapBlogPost(persisted as unknown as BlogPostRow)
      : nextPost;
    startTransition(() => {
      setState((current) => ({ ...current, blogPosts: upsertCollection(current.blogPosts, Boolean(exists), canonicalPost) }));
    });
    return canonicalPost.id;
  }, []);

  const transitionBlogPost = useCallback<AppStoreValue["transitionBlogPost"]>(async (id, action, scheduledAt) => {
    const persisted = await persistAdminMutation(
      { resource: "blog", action, id, ...(scheduledAt ? { scheduledAt } : {}) },
      action === "submit-review" ? "Post enviado para revisão."
        : action === "schedule" ? "Post agendado."
          : action === "publish" ? "Post publicado."
            : action === "archive" ? "Post arquivado."
              : "Post restaurado como rascunho."
    );
    if (!persisted) return;
    const updated = mapBlogPost(persisted as unknown as BlogPostRow);
    startTransition(() => {
      setState((current) => ({ ...current, blogPosts: current.blogPosts.map((post) => post.id === id ? updated : post) }));
    });
  }, []);

  const saveBlogContent = useCallback<AppStoreValue["saveBlogContent"]>(async (post, options) => {
    const persisted = await persistAdminMutation(
      {
        resource: "blog",
        action: "save-content",
        payload: {
          ...post,
          status: post.status,
          relatedCourseId: post.relatedCourseId,
        }
      },
      options?.silent ? undefined : "Conteúdo salvo."
    );
    if (!persisted) return post.id;
    const updated = mapBlogPost(persisted as unknown as BlogPostRow);
    startTransition(() => {
      setState((current) => ({ ...current, blogPosts: current.blogPosts.map((item) => item.id === updated.id ? updated : item) }));
    });
    return updated.id;
  }, []);

  const deleteBlogPost = useCallback<AppStoreValue["deleteBlogPost"]>(async (id) => {
    const snapshot = stateRef.current.blogPosts;
    const removedIndex = snapshot.findIndex((item) => item.id === id);
    const removedItem = removedIndex >= 0 ? snapshot[removedIndex] : null;

    setState((current) => ({
      ...current,
      blogPosts: current.blogPosts.filter((item) => item.id !== id)
    }));

    try {
      await persistAdminMutation({ resource: "blog", action: "delete", id }, "Post excluído.");
    } catch (error) {
      if (removedItem) {
        setState((current) => ({
          ...current,
          blogPosts: restoreDeletedItem(current.blogPosts, removedItem, removedIndex),
        }));
      }
      throw error;
    }
  }, []);

  const resetStore = useCallback<AppStoreValue["resetStore"]>(() => {
    setState((current) => ({ ...initialState, currentSession: current.currentSession }));
    window.localStorage.removeItem(STORAGE_KEY);
    toast.success("Estado da aplicação limpo.");
  }, []);

  // Fatias memoizadas por domínio. Cada slice só muda quando os dados ou as
  // ações daquele domínio mudam — como o estado é atualizado por spread
  // imutável, as referências das demais fatias permanecem estáveis e seus
  // consumidores não re-renderizam. Esse é o ganho de performance do split.
  const sessionValue = useMemo<SessionStoreValue>(
    () => ({
      currentSession: state.currentSession,
      setSession,
      logout
    }),
    [state.currentSession, setSession, logout]
  );

  const courseValue = useMemo<CourseStoreValue>(
    () => ({
      courses: state.courses,
      classes: state.classes,
      instructors: state.instructors,
      trainingPaths: state.trainingPaths,
      courseCategories: state.courseCategories,
      coursePublicContents: state.coursePublicContents,
      testimonials: state.testimonials,
      upsertCourse,
      deleteCourse,
      duplicateCourse,
      upsertClass,
      deleteClass,
      upsertInstructor,
      deleteInstructor
    }),
    [
      state.courses,
      state.classes,
      state.instructors,
      state.trainingPaths,
      state.courseCategories,
      state.coursePublicContents,
      state.testimonials,
      upsertCourse,
      deleteCourse,
      duplicateCourse,
      upsertClass,
      deleteClass,
      upsertInstructor,
      deleteInstructor
    ]
  );

  const studentValue = useMemo<StudentStoreValue>(
    () => ({
      students: state.students,
      enrollments: state.enrollments,
      createEnrollment,
      createEnrollmentAdmin,
      createStudent,
      updateStudent,
      deleteStudent,
      updateEnrollmentStatus,
      deleteEnrollment
    }),
    [
      state.students,
      state.enrollments,
      createEnrollment,
      createEnrollmentAdmin,
      createStudent,
      updateStudent,
      deleteStudent,
      updateEnrollmentStatus,
      deleteEnrollment
    ]
  );

  const adminValue = useMemo<AdminStoreValue>(
    () => ({
      leads: state.leads,
      blogPosts: state.blogPosts,
      createLead,
      updateLeadStatus,
      updateLead,
      deleteLead,
      createStudent,
      deleteStudent,
      createEnrollmentAdmin,
      deleteEnrollment,
      upsertBlogPost,
      saveBlogDraft,
      saveBlogContent,
      transitionBlogPost,
      deleteBlogPost,
      resetStore
    }),
    [
      state.leads,
      state.blogPosts,
      createLead,
      updateLeadStatus,
      updateLead,
      deleteLead,
      createStudent,
      deleteStudent,
      createEnrollmentAdmin,
      deleteEnrollment,
      upsertBlogPost,
      saveBlogDraft,
      saveBlogContent,
      transitionBlogPost,
      deleteBlogPost,
      resetStore
    ]
  );

  return (
    <SessionStoreContext.Provider value={sessionValue}>
      <CourseStoreContext.Provider value={courseValue}>
        <StudentStoreContext.Provider value={studentValue}>
          <AdminStoreContext.Provider value={adminValue}>{children}</AdminStoreContext.Provider>
        </StudentStoreContext.Provider>
      </CourseStoreContext.Provider>
    </SessionStoreContext.Provider>
  );
}

/**
 * Hook agregado de retrocompatibilidade. Compõe os quatro contextos de domínio
 * no mesmo shape plano histórico. Componentes que precisam de um único domínio
 * devem preferir os hooks específicos (`useCourseStore`, `useStudentStore`,
 * `useAdminStore`, `useSessionStore`) para isolar re-renders.
 */
export function useAppStore(): AppStoreValue {
  const session = useContext(SessionStoreContext);
  const course = useContext(CourseStoreContext);
  const student = useContext(StudentStoreContext);
  const admin = useContext(AdminStoreContext);

  if (!session || !course || !student || !admin) {
    throw new Error("useAppStore must be used within AppStoreProvider");
  }

  return useMemo(
    () => ({ ...session, ...course, ...student, ...admin }),
    [session, course, student, admin]
  );
}

export { useSessionStore } from "@/lib/contexts/session-context";
export { useCourseStore, useCourseBySlug } from "@/lib/contexts/course-context";
export { useStudentStore } from "@/lib/contexts/student-context";
export { useAdminStore } from "@/lib/contexts/admin-context";

export function useDashboardCharts() {
  const { classes, courses, enrollments, leads } = useAppStore();

  return {
    leadsByStatus: Object.entries(
      leads.reduce<Record<Lead["status"], number>>((acc, lead) => {
        acc[lead.status] = (acc[lead.status] ?? 0) + 1;
        return acc;
      }, {} as Record<Lead["status"], number>)
    ).map(([name, value]) => ({ name, value })),
    enrollmentsByPath: Object.entries(
      enrollments.reduce<Record<string, number>>((acc, enrollment) => {
        const course = courses.find((item) => item.id === enrollment.courseId);
        const path = course?.pathName ?? "Sem trilha";
        acc[path] = (acc[path] ?? 0) + 1;
        return acc;
      }, {})
    ).map(([name, value]) => ({ name, value })),
    revenueByMonth: (() => {
      const byMonth: Record<string, number> = {};
      enrollments.forEach((enrollment) => {
        if (enrollment.status !== "Confirmada" && enrollment.status !== "Concluída") return;
        const course = courses.find((c) => c.id === enrollment.courseId);
        if (!course) return;
        const date = new Date(enrollment.createdAt);
        const key = date.toLocaleDateString("pt-BR", { month: "short", year: "2-digit" });
        byMonth[key] = (byMonth[key] ?? 0) + course.price;
      });
      return Object.entries(byMonth)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([month, value]) => ({ month, value }));
    })(),
    classesByModality: Object.entries(
      classes.reduce<Record<TrainingClass["modality"], number>>((acc, item) => {
        acc[item.modality] = (acc[item.modality] ?? 0) + 1;
        return acc;
      }, {} as Record<TrainingClass["modality"], number>)
    ).map(([name, value]) => ({ name, value }))
  };
}
