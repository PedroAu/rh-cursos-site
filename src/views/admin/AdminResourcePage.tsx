"use client";

import Image from "next/image";
import { ArrowLeft, Download, Eye, Pencil, Plus, Search, Trash2, Upload, X } from "lucide-react";
import { isValidElement, useEffect, useId, useMemo, useRef, useState, type ChangeEvent, type ReactNode } from "react";

import { Badge } from "@/components/ui/badge";
import { LeadTimeline } from "@/features/admin/leads/timeline/lead-timeline";
import { UserCell } from "@/components/admin/user-cell";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { useHotkey } from "@/hooks/use-hotkey";
import type { ValidationError } from "@/lib/admin-form-validation";
import { buildResourceConfig, type FieldConfig, type ResourceKey } from "@/lib/admin-resource-configs";
import { useAppStore } from "@/lib/app-store";
import { formatCPF, formatPhone } from "@/lib/format";
import { cn } from "@/lib/utils";
import { neutralizeCsvFormula } from "@/lib/utils/csv-export";
import type { Instructor, Lead, LeadOrigin } from "@/types";

type CsvColumn = {
  label: string;
  render: (row: unknown) => unknown;
  exportValue?: (row: unknown) => string;
};

function toExportableValue(value: unknown): string {
  if (value == null) return "";
  if (Array.isArray(value)) return value.map((item) => toExportableValue(item)).join("; ");
  if (isValidElement<{ children?: unknown }>(value)) {
    return toExportableValue(value.props.children);
  }
  return String(value);
}

function serializeFormSnapshot(value: unknown): string {
  if (value === null) return "null";
  if (value === undefined) return "undefined";
  if (Array.isArray(value)) {
    return `[${value.map((item) => serializeFormSnapshot(item)).join(",")}]`;
  }
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).sort(([left], [right]) =>
      left.localeCompare(right)
    );
    return `{${entries
      .map(([key, nextValue]) => `${JSON.stringify(key)}:${serializeFormSnapshot(nextValue)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function exportToCSV(data: unknown[], columns: CsvColumn[], filename: string) {
  if (data.length === 0) return;

  const csvContent = [
    columns.map((col) => `"${neutralizeCsvFormula(col.label).replace(/"/g, '""')}"`).join(","),
    ...data.map((row) =>
      columns
        .map((col) => {
          const value = col.exportValue ? col.exportValue(row) : col.render(row);
          // Neutralize CSV formula injection (CWE-1236) before RFC 4180 quoting
          return `"${neutralizeCsvFormula(toExportableValue(value)).replace(/"/g, '""')}"`
        })
        .join(",")
    )
  ].join("\n");

  const blob = new Blob(["﻿" + csvContent], { type: "text/csv;charset=utf-8;" });
  const link = document.createElement("a");
  const url = URL.createObjectURL(blob);
  link.setAttribute("href", url);
  link.setAttribute("download", `${filename}-${new Date().toISOString().split("T")[0]}.csv`);
  link.style.visibility = "hidden";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

function getPageTitle(resource: ResourceKey, fallback: string) {
  if (resource === "students") return "Alunos";
  if (resource === "instructors") return "Instrutores";
  if (resource === "leads") return "Leads";
  return fallback;
}

function getPageDescription(resource: ResourceKey, fallback: string) {
  if (resource === "students") {
    return "Localize cadastros e acompanhe os vínculos reais de cada aluno com suas matrículas.";
  }
  if (resource === "instructors") return "Acompanhe especialistas, vínculos com cursos e turmas ativas.";
  if (resource === "leads") return "Priorize contatos por origem, interesse e estágio comercial.";
  return fallback;
}

function getSearchPlaceholder(resource: ResourceKey) {
  if (resource === "students") return "Filtrar por nome, CPF ou e-mail.";
  if (resource === "classes") return "Buscar turma, curso ou modalidade.";
  if (resource === "courses") return "Buscar curso ou trilha.";
  return "Buscar por nome, título ou referência.";
}

function getSearchLabel(resource: ResourceKey) {
  if (resource === "courses") return "Buscar cursos";
  if (resource === "classes") return "Buscar turmas";
  return "Buscar registros";
}

function getListHeading(resource: ResourceKey, fallback: string) {
  if (resource === "enrollments") return "Registros de pré-inscrições e matrículas";
  return resource === "students" ? "Alunos cadastrados" : fallback;
}

function getDefaultFormState(resource: ResourceKey) {
  if (resource === "courses") {
    return { featured: "Não" } satisfies Record<string, unknown>;
  }

  return {};
}

export function AdminResourcePage({ resource }: { resource: ResourceKey }) {
  const store = useAppStore();
  const [search, setSearch] = useState("");
  const [leadOrigin, setLeadOrigin] = useState<LeadOrigin | "all">("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(5);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<Record<string, unknown>>({});
  const [validationErrors, setValidationErrors] = useState<ValidationError[]>([]);
  const [formSnapshot, setFormSnapshot] = useState("");
  const previousOpenRef = useRef(open);
  const [createAction, setCreateAction] = useState(false);

  useEffect(() => {
    if (open && !previousOpenRef.current) {
      setFormSnapshot(serializeFormSnapshot(form));
    }

    if (!open && previousOpenRef.current) {
      setFormSnapshot("");
    }

    previousOpenRef.current = open;
  }, [form, open]);

  const isFormDirty = useMemo(
    () => serializeFormSnapshot(form) !== formSnapshot,
    [form, formSnapshot]
  );

  useEffect(() => {
    setPage(1);
    setDetailId(null);
  }, [leadOrigin, resource, search]);

  useEffect(() => {
    if (typeof window !== "undefined" && new URLSearchParams(window.location.search).get("action") === "create") {
      setCreateAction(true);
    }
  }, []);

  const handleDialogOpenChange = (nextOpen: boolean) => {
    if (nextOpen) {
      setOpen(true);
      return;
    }

    if (isFormDirty && !window.confirm("Descartar as alterações deste registro?")) {
      return;
    }

    setOpen(false);
  };

  const errorsByField = useMemo(() => {
    const result: Record<string, string> = {};
    validationErrors.forEach((error) => {
      if (!result[error.field]) result[error.field] = error.message;
    });
    return result;
  }, [validationErrors]);

  useHotkey(
    (event) => {
      if (event.key.toLowerCase() !== "n") return false;
      if (!window.location.pathname.startsWith("/admin")) return false;
      if (open) return false;
      const target = event.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target?.isContentEditable) return false;
      return true;
    },
    (event) => {
      event.preventDefault();
      setEditingId(null);
      setForm(getDefaultFormState(resource));
      setOpen(true);
    }
  );

  const config = useMemo(
    () =>
      buildResourceConfig(resource, store, {
        search,
        editingId,
        form,
        setForm,
        setEditingId,
        setValidationErrors,
        setOpen
      }),
    [editingId, form, resource, search, store]
  );

  const rows = config.rows as Array<{ id: string }>;
  const visibleRows = resource === "leads" && leadOrigin !== "all"
    ? rows.filter((row) => (row as Lead).origin === leadOrigin)
    : rows;
  const leadOrigins = useMemo(
    () => resource === "leads"
      ? Array.from(new Set(store.leads.map((lead) => lead.origin))).sort((left, right) => left.localeCompare(right, "pt-BR"))
      : [],
    [resource, store.leads]
  );
  const pageCount = Math.max(1, Math.ceil(visibleRows.length / pageSize));
  const pagedRows = useMemo(
    () => visibleRows.slice((page - 1) * pageSize, page * pageSize),
    [page, pageSize, visibleRows]
  );
  const detailRow = detailId ? visibleRows.find((row) => row.id === detailId) ?? null : null;

  useEffect(() => {
    if (page > pageCount) setPage(pageCount);
    if (detailId && !detailRow) setDetailId(null);
  }, [detailId, detailRow, page, pageCount]);

  useEffect(() => {
    if (!createAction || open) return;

    setEditingId(null);
    setForm(getDefaultFormState(resource));
    setValidationErrors([]);
    setOpen(true);

    setCreateAction(false);
  }, [createAction, open, resource]);
  const canCreate = true;
  const pageTitle = getPageTitle(resource, config.title);
  const pageDescription = getPageDescription(resource, config.description);

  async function handleSave() {
    setIsSaving(true);
    try {
      await config.onSave();
    } finally {
      setIsSaving(false);
    }
  }

  function handleDelete(row: { id: string }) {
    const label = `${pageTitle.toLocaleLowerCase("pt-BR")} ${row.id}`;
    if (!window.confirm(`Excluir ${label}? Esta ação não pode ser desfeita.`)) return;
    config.onDelete?.(row);
    if (detailId === row.id) setDetailId(null);
  }

  function getFieldSpan(field: FieldConfig) {
    if (
      field.type === "readonly" ||
      field.type === "textarea" ||
      field.type === "array" ||
      field.type === "modules" ||
      field.type === "multiselect"
    ) {
      return "md:col-span-2";
    }

    return "";
  }

  function inferSectionTitle(field: FieldConfig) {
    if (field.section) return field.section;
    if (field.type === "readonly") return "Contexto";
    if (field.key === "status") return "Ação operacional";
    if (field.type === "textarea" || field.type === "array" || field.type === "modules") return "Conteúdo e detalhamento";
    return "Dados principais";
  }

  const fieldSections = config.fields.reduce<Array<{ title: string; fields: FieldConfig[] }>>((sections, field) => {
    const title = inferSectionTitle(field);
    const existing = sections.find((section) => section.title === title);

    if (existing) {
      existing.fields.push(field);
      return sections;
    }

    sections.push({ title, fields: [field] });
    return sections;
  }, []);

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div className="max-w-3xl space-y-3">
          <h1 className="text-3xl font-extrabold tracking-tight text-tk-brand">{pageTitle}</h1>
          <p className="text-base leading-7 text-tk-ink-muted md:text-lg">{pageDescription}</p>
        </div>

        {canCreate ? (
          <Button
            className="rounded-full bg-tk-accent text-white hover:bg-tk-accent-strong"
            onClick={() => {
              setEditingId(null);
              setForm(getDefaultFormState(resource));
              setOpen(true);
            }}
          >
            <Plus className="h-4 w-4" />
            {config.primaryActionLabel ?? "Novo cadastro"}
          </Button>
        ) : null}
      </div>

      {config.stats ? (
        <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-4">
          {config.stats.map((stat, index) => {
            const Icon = stat.icon;
            const accentToneClass = index === 2 ? "text-warning" : "text-success";

            return (
              <Panel key={stat.label} className="p-8">
                <div className="flex items-start justify-between gap-4">
                  <p className="max-w-[160px] text-[0.95rem] font-extrabold text-tk-ink-muted">{stat.label}</p>
                  {Icon ? (
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-tk-accent-soft text-tk-brand">
                      <Icon className="h-5 w-5" />
                    </div>
                  ) : null}
                </div>
                <p className="mt-10 text-[2.2rem] font-extrabold text-tk-ink">{stat.value}</p>
                <p className={cn("mt-1.5 font-semibold", accentToneClass)}>
                  {stat.helper}
                </p>
              </Panel>
            );
          })}
        </div>
      ) : (
        <div className="grid gap-6 md:grid-cols-3">
          <Panel className="p-8">
            <p className="text-[0.95rem] font-extrabold text-tk-ink-muted">Registros visíveis</p>
            <p className="mt-10 text-[2.2rem] font-extrabold text-tk-ink">{rows.length}</p>
            <p className="mt-1.5 font-semibold text-tk-success">
              {search ? `Filtro ativo para “${search}”.` : "Visão operacional atual."}
            </p>
          </Panel>
          <Panel className="p-8">
            <p className="text-[0.95rem] font-extrabold text-tk-ink-muted">Modo de operação</p>
            <p className="mt-10 text-[2.2rem] font-extrabold text-tk-ink">{canCreate ? "CRUD" : "Supervisionado"}</p>
            <p className="mt-1.5 font-semibold text-tk-success">
              {canCreate ? "Criação e edição liberadas" : "Atualização sob controle"}
            </p>
          </Panel>
          <Panel className="p-8">
            <p className="text-[0.95rem] font-extrabold text-tk-ink-muted">Atalho</p>
            <p className="mt-10 text-[2.2rem] font-extrabold text-tk-ink">N</p>
            <p className="mt-1.5 font-semibold text-tk-success">Cria um novo registro rapidamente</p>
          </Panel>
        </div>
      )}

      {detailRow ? (
        <ResourceDetail
          title={`${pageTitle} · ${detailRow.id}`}
          columns={config.columns as Array<{ key: string; label: string; render: (row: unknown) => ReactNode }>}
          row={detailRow}
          onBack={() => setDetailId(null)}
          onEdit={() => config.onEdit(detailRow)}
          footer={resource === "leads" ? <LeadTimeline leadId={detailRow.id} /> : undefined}
        />
      ) : null}

      <Panel className="p-6">
        {resource === "leads" ? (
          <div className="mb-6 border-b border-tk-line pb-5">
            <p className="mb-3 text-sm font-semibold text-tk-ink" id="lead-origin-filter-label">Filtrar por origem</p>
            <div className="flex flex-wrap gap-2" role="group" aria-labelledby="lead-origin-filter-label">
              {[{ value: "all" as const, label: "Todas" }, ...leadOrigins.map((origin) => ({ value: origin, label: origin }))].map((option) => {
                const pressed = leadOrigin === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    aria-pressed={pressed}
                    onClick={() => setLeadOrigin(option.value)}
                    className={cn(
                      "rounded-full border px-4 py-2 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-tk-accent focus-visible:ring-offset-2",
                      pressed ? "border-tk-accent bg-tk-accent text-white" : "border-tk-line bg-tk-surface text-tk-ink-muted hover:bg-tk-surface-2 hover:text-tk-ink"
                    )}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}
        <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h2 className="text-2xl font-semibold text-tk-brand">{getListHeading(resource, config.title)}</h2>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <SearchField
              value={search}
              onChange={setSearch}
              placeholder={getSearchPlaceholder(resource)}
              label={getSearchLabel(resource)}
            />
            {visibleRows.length > 0 ? (
              <Button
                variant="outline"
                onClick={() => exportToCSV(visibleRows, config.columns as CsvColumn[], resource)}
              >
                <Download className="h-4 w-4" />
                Exportar
              </Button>
            ) : null}
          </div>
        </div>

        {visibleRows.length && resource === "instructors" ? (
          <>
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3" data-testid="instructor-card-grid">
            {(pagedRows as Instructor[]).map((instructor) => {
              const courseCount = store.courses.filter((course) => instructor.courseIds.includes(course.id)).length;
              const activeClassCount = store.classes.filter(
                (trainingClass) => trainingClass.instructorId === instructor.id && trainingClass.status !== "Encerrada"
              ).length;

              return (
                <article key={instructor.id} className="rounded-3xl border border-tk-line bg-tk-surface-2 p-5" aria-label={`Instrutor ${instructor.name}`}>
                  <div className="flex items-start justify-between gap-4">
                    <UserCell name={instructor.name} email={instructor.email} />
                    <Badge variant={instructor.status === "Ativo" ? "success" : "danger"}>{instructor.status}</Badge>
                  </div>
                  <div className="mt-5">
                    <p className="text-xs font-extrabold uppercase tracking-[0.14em] text-tk-ink-muted">Área de atuação</p>
                    <p className="mt-1 font-semibold text-tk-brand">{instructor.specialty || "Não informada"}</p>
                  </div>
                  <dl className="mt-5 grid grid-cols-2 gap-3">
                    <div className="rounded-2xl bg-tk-surface p-3">
                      <dt className="text-xs text-tk-ink-muted">Cursos</dt>
                      <dd className="mt-1 text-xl font-extrabold text-tk-ink">{courseCount}</dd>
                    </div>
                    <div className="rounded-2xl bg-tk-surface p-3">
                      <dt className="text-xs text-tk-ink-muted">Turmas ativas</dt>
                      <dd className="mt-1 text-xl font-extrabold text-tk-ink">{activeClassCount}</dd>
                    </div>
                  </dl>
                  <div className="mt-5 flex justify-end gap-2">
                    <Button variant="ghost" onClick={() => setDetailId(instructor.id)} aria-label={`Ver detalhes de ${instructor.name}`}>
                      <Eye className="h-4 w-4" /> Detalhes
                    </Button>
                    <Button variant="outline" onClick={() => config.onEdit(instructor)}>
                      <Pencil className="h-4 w-4" /> Editar
                    </Button>
                    {config.onDelete ? (
                      <IconButton label={`Excluir instrutor ${instructor.name}`} tone="danger" onClick={() => handleDelete(instructor)}>
                        <Trash2 className="h-4 w-4" />
                      </IconButton>
                    ) : null}
                  </div>
                </article>
              );
            })}
          </div>
          <ResourcePagination
            page={page}
            pageCount={pageCount}
            pageSize={pageSize}
            total={visibleRows.length}
            onPageChange={setPage}
            onPageSizeChange={(nextSize) => {
              setPageSize(nextSize);
              setPage(1);
            }}
          />
          </>
        ) : resource !== "instructors" ? (
          <>
          <Table aria-label={config.title} className="min-w-[860px]">
            <TableHeader className="bg-tk-surface-2">
              <TableRow className="hover:bg-tk-surface-2">
                {(config.columns as Array<{ key: string; label: string; render: (row: unknown) => unknown }>).map((column) => (
                  <TableHead key={column.key}>{column.label}</TableHead>
                ))}
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pagedRows.map((row) => (
                <TableRow key={row.id}>
                  {(config.columns as Array<{ key: string; label: string; render: (row: unknown) => unknown }>).map((column) => (
                    <TableCell key={`${row.id}-${column.key}`}>{column.render(row) as ReactNode}</TableCell>
                  ))}
                  <TableCell>
                    <div className="flex justify-end gap-2">
                      <IconButton
                        label={`Ver detalhes do item ${row.id}`}
                        onClick={() => setDetailId(row.id)}
                      >
                        <Eye className="h-4 w-4" />
                      </IconButton>
                      <IconButton
                        label={`Editar item ${row.id}`}
                        onClick={() => config.onEdit(row)}
                      >
                        <Pencil className="h-4 w-4" />
                      </IconButton>
                      {config.onDelete ? (
                        <IconButton
                          label={`Excluir item ${row.id}`}
                          tone="danger"
                          onClick={() => handleDelete(row)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </IconButton>
                      ) : null}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {visibleRows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={config.columns.length + 1} className="py-10 text-center">
                    <p className="font-semibold text-tk-ink">Nenhum registro encontrado.</p>
                    <p className="mt-2 text-sm text-tk-ink-muted">
                      {search || resource === "leads"
                        ? "Ajuste os filtros para consultar outros registros."
                        : "Crie um novo item para iniciar a operação desta área."}
                    </p>
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
          <ResourcePagination
            page={page}
            pageCount={pageCount}
            pageSize={pageSize}
            total={visibleRows.length}
            onPageChange={setPage}
            onPageSizeChange={(nextSize) => {
              setPageSize(nextSize);
              setPage(1);
            }}
          />
          </>
        ) : (
          <div className="rounded-2xl bg-tk-surface-2 p-8 text-center">
            <p className="font-semibold text-tk-ink">Nenhum registro encontrado.</p>
            <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-tk-ink-muted">
              {canCreate
                ? "Crie um novo item para iniciar a operação desta área."
                : "Os registros aparecem aqui conforme são gerados pelos fluxos do sistema."}
            </p>
            {canCreate ? (
              <div className="mt-5">
                <Button
                  onClick={() => {
                    setEditingId(null);
                    setForm(getDefaultFormState(resource));
                    setOpen(true);
                  }}
                >
                  Criar agora
                </Button>
              </div>
            ) : null}
          </div>
        )}
      </Panel>

      <Dialog open={open} onOpenChange={handleDialogOpenChange}>
        <DialogContent
          className="w-[min(96vw,1100px)] overflow-y-auto p-0"
          onInteractOutside={(event) => {
            event.preventDefault();
          }}
          onPointerDownOutside={(event) => {
            event.preventDefault();
          }}
        >
          <div className="max-h-[calc(100vh-2rem)] overflow-y-auto">
            <DialogHeader className="border-b border-tk-line px-6 py-5">
              <DialogTitle>{editingId ? "Editar registro" : "Criar novo registro"}</DialogTitle>
              <DialogDescription>
                Revise os dados antes de salvar para evitar retrabalho operacional.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-6 px-6 py-5">
              {validationErrors.length > 0 ? (
                <div className="rounded-2xl border border-red-200 bg-red-50 p-4">
                  <p className="font-semibold text-tk-error">Erros encontrados</p>
                  <div className="mt-3 space-y-1">
                    {validationErrors.map((error, index) => (
                      <p key={`${error.field}-${index}`} className="text-sm text-tk-error">
                        {error.message}
                      </p>
                    ))}
                  </div>
                </div>
              ) : null}

              {fieldSections.map((section) => (
                <Panel key={section.title} className="p-5">
                  <div className="space-y-1">
                    <p className="font-semibold text-tk-ink">{section.title}</p>
                    <p className="text-sm text-tk-ink-muted">
                      {section.title === "Ação operacional"
                        ? "Atualize apenas o que interfere na operação do time."
                        : "Revise os dados antes de salvar para evitar retrabalho operacional."}
                    </p>
                  </div>

                  <div className="mt-5 grid gap-4 md:grid-cols-2">
                    {section.fields.map((field) => (
                      <div key={field.key} className={getFieldSpan(field)}>
                        <RenderField
                          field={field}
                          form={form}
                          resource={resource}
                          setForm={setForm}
                          error={errorsByField[field.key]}
                        />
                      </div>
                    ))}
                  </div>
                </Panel>
              ))}
            </div>

            <DialogFooter className="border-t border-tk-line px-6 py-5">
              <Button variant="outline" onClick={() => handleDialogOpenChange(false)}>
                Cancelar
              </Button>
              <Button loading={isSaving} onClick={handleSave}>
                {editingId ? "Salvar alterações" : "Criar registro"}
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Panel({ children, className }: { children: ReactNode; className?: string }) {
  return <section className={cn("rounded-3xl border border-tk-line bg-tk-surface shadow-tk-card", className)}>{children}</section>;
}

function ResourceDetail({
  title,
  columns,
  row,
  onBack,
  onEdit,
  footer,
}: {
  title: string;
  columns: Array<{ key: string; label: string; render: (row: unknown) => ReactNode }>;
  row: unknown;
  onBack: () => void;
  onEdit: () => void;
  footer?: ReactNode;
}) {
  return (
    <Panel className="overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-tk-line px-6 py-5">
        <div>
          <button
            type="button"
            onClick={onBack}
            className="mb-2 inline-flex items-center gap-2 text-sm font-semibold text-tk-ink-muted hover:text-tk-brand"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Voltar para a lista
          </button>
          <h2 className="text-2xl font-bold text-tk-ink">{title}</h2>
        </div>
        <Button variant="outline" onClick={onEdit}>
          <Pencil className="h-4 w-4" aria-hidden="true" /> Editar
        </Button>
      </div>
      <dl className="grid gap-4 p-6 sm:grid-cols-2 xl:grid-cols-3">
        {columns.map((column) => (
          <div key={column.key} className="rounded-2xl bg-tk-surface-2 p-4">
            <dt className="text-xs font-bold uppercase tracking-[0.12em] text-tk-ink-muted">{column.label}</dt>
            <dd className="mt-2 text-sm font-semibold text-tk-ink">{column.render(row)}</dd>
          </div>
        ))}
      </dl>
      {footer}
    </Panel>
  );
}

function ResourcePagination({
  page,
  pageCount,
  pageSize,
  total,
  onPageChange,
  onPageSizeChange
}: {
  page: number;
  pageCount: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
}) {
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);
  const pageItems: Array<number | "ellipsis-start" | "ellipsis-end"> =
    pageCount <= 7
      ? Array.from({ length: pageCount }, (_, index) => index + 1)
      : page <= 4
        ? [1, 2, 3, 4, 5, "ellipsis-end", pageCount]
        : page >= pageCount - 3
          ? [1, "ellipsis-start", pageCount - 4, pageCount - 3, pageCount - 2, pageCount - 1, pageCount]
          : [1, "ellipsis-start", page - 1, page, page + 1, "ellipsis-end", pageCount];

  return (
    <div role="navigation" className="flex min-w-0 flex-wrap items-center justify-between gap-4 overflow-hidden border-t border-tk-line px-2 pt-4 text-sm text-tk-ink-muted" aria-label="Paginação">
      <span>Mostrando {from}–{to} de {total}</span>
      <div className="flex min-w-0 max-w-full flex-wrap items-center gap-3">
        <label className="flex items-center gap-2">
          Por página
          <select
            aria-label="Itens por página"
            value={pageSize}
            onChange={(event) => onPageSizeChange(Number(event.target.value))}
            className="rounded-lg border border-tk-line bg-tk-surface px-2 py-1.5 text-tk-ink"
          >
            {[5, 10, 25].map((size) => <option key={size} value={size}>{size}</option>)}
          </select>
        </label>
        <div className="flex max-w-full flex-wrap items-center gap-1" role="group" aria-label="Páginas">
          <button type="button" aria-label="Página anterior" disabled={page <= 1} onClick={() => onPageChange(page - 1)} className="h-8 min-w-8 rounded-lg px-2 hover:bg-tk-surface-2 disabled:opacity-40">‹</button>
          {pageItems.map((item) =>
            typeof item === "number" ? (
              <button
                key={item}
                type="button"
                aria-label={`Página ${item}`}
                aria-current={item === page ? "page" : undefined}
                onClick={() => onPageChange(item)}
                className={cn("h-8 min-w-8 rounded-lg px-2 font-semibold hover:bg-tk-surface-2", item === page && "bg-tk-brand text-white hover:bg-tk-brand")}
              >
                {item}
              </button>
            ) : (
              <span key={item} aria-hidden="true" className="px-1 text-tk-ink-muted">
                …
              </span>
            )
          )}
          <button type="button" aria-label="Próxima página" disabled={page >= pageCount} onClick={() => onPageChange(page + 1)} className="h-8 min-w-8 rounded-lg px-2 hover:bg-tk-surface-2 disabled:opacity-40">›</button>
        </div>
      </div>
    </div>
  );
}

function IconButton({
  children,
  label,
  onClick,
  tone = "default"
}: {
  children: ReactNode;
  label: string;
  onClick: () => void;
  tone?: "default" | "danger";
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className={cn(
        "inline-flex h-9 w-9 items-center justify-center rounded-xl border border-tk-line bg-tk-surface text-tk-ink-muted transition hover:bg-tk-surface-2 hover:text-tk-ink",
        tone === "danger" && "text-tk-error hover:bg-red-50 hover:text-tk-error"
      )}
    >
      {children}
    </button>
  );
}

function SearchField({
  value,
  onChange,
  placeholder,
  label,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  label: string;
}) {
  return (
    <div className="relative min-w-0 sm:min-w-[320px]">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-tk-ink-muted" />
      <Input
        aria-label={label}
        value={value}
        onChange={(event) => onChange(event.currentTarget.value)}
        placeholder={placeholder}
        className="pl-10 pr-10"
      />
      {value ? (
        <button
          type="button"
          aria-label="Limpar busca"
          onClick={() => onChange("")}
          className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-1 text-tk-ink-muted transition hover:bg-tk-surface-2 hover:text-tk-ink"
        >
          <X className="h-4 w-4" />
        </button>
      ) : null}
    </div>
  );
}

function RenderField({
  field,
  form,
  resource,
  setForm,
  error
}: {
  field: FieldConfig;
  form: Record<string, unknown>;
  resource: ResourceKey;
  setForm: React.Dispatch<React.SetStateAction<Record<string, unknown>>>;
  error?: string;
}) {
  const updateField = (value: unknown) => {
    setForm((current) => {
      if (resource === "enrollments" && field.key === "courseId") {
        return { ...current, courseId: value, classId: "" };
      }

      // Builders such as modules emit functional updates so a blur/focus
      // transition or a batched React update can never apply an older snapshot
      // over the text the administrator just entered.
      if (field.type === "modules" && typeof value === "function") {
        const currentModules = (current[field.key] as ModuleValue[]) || [];
        return { ...current, [field.key]: (value as (items: ModuleValue[]) => ModuleValue[])(currentModules) };
      }

      return { ...current, [field.key]: value };
    });
  };

  if (field.type === "readonly") {
    return (
      <div className="rounded-2xl border border-tk-line bg-tk-surface-2 p-4">
        <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-tk-ink-muted">{field.label}</p>
        <p className="mt-3 text-sm text-tk-ink">{String(form[field.key] ?? "—")}</p>
      </div>
    );
  }

  if (field.type === "modules") {
    return (
      <ModulesBuilderLite
        label={field.label}
        value={(form[field.key] as ModuleValue[]) || []}
        onChange={updateField}
        hint={field.hint}
        error={error}
      />
    );
  }

  if (field.type === "array") {
    return (
      <ArrayInputLite
        label={field.label}
        value={(form[field.key] as string[]) || []}
        onChange={updateField}
        error={error}
        hint={field.hint}
        placeholder={field.placeholder}
        suggestions={field.suggestions}
      />
    );
  }

  if (field.type === "multiselect" && field.options) {
    return (
      <MultiSelectLite
        label={field.label}
        required={field.required}
        options={field.options}
        value={(form[field.key] as string[]) || []}
        onChange={updateField}
        error={error}
        hint={field.hint}
      />
    );
  }

  if (field.type === "select" && field.options) {
    return (
      <NativeSelectField
        label={field.label}
        required={field.required}
        options={field.options}
        value={String(form[field.key] ?? "")}
        onChange={updateField}
        error={error}
        hint={field.hint}
      />
    );
  }

  if (field.type === "textarea") {
    return (
      <Textarea
        label={field.label}
        value={String(form[field.key] ?? "")}
        placeholder={field.placeholder ?? `Ex.: ${field.label}`}
        hint={field.hint}
        onChange={(event) => updateField(event.currentTarget.value)}
        error={error}
        maxLength={field.maxLength}
        aria-required={field.required || undefined}
      />
    );
  }

  if (field.type === "number") {
    return (
      <Input
        label={field.label}
        type="number"
        value={String(form[field.key] ?? "")}
        placeholder={field.placeholder}
        hint={field.hint}
        onChange={(event) => {
          const nextValue = event.currentTarget.value;
          updateField(nextValue === "" ? "" : Number(nextValue));
        }}
        error={error}
        aria-required={field.required || undefined}
      />
    );
  }

  if (field.type === "date") {
    return (
      <Input
        label={field.label}
        type="date"
        value={String(form[field.key] ?? "")}
        hint={field.hint}
        onChange={(event) => updateField(event.currentTarget.value)}
        error={error}
        aria-required={field.required || undefined}
      />
    );
  }

  if (field.key === "cpf") {
    return (
      <Input
        label={field.label}
        value={String(form[field.key] ?? "")}
        placeholder="000.000.000-00"
        inputMode="numeric"
        onChange={(event) => updateField(formatCPF(event.currentTarget.value))}
        error={error}
        aria-required={field.required || undefined}
      />
    );
  }

  if (field.key === "phone") {
    return (
      <Input
        label={field.label}
        type="tel"
        value={String(form[field.key] ?? "")}
        placeholder="(00) 00000-0000"
        inputMode="tel"
        autoComplete="tel"
        onChange={(event) => updateField(formatPhone(event.currentTarget.value))}
        error={error}
        aria-required={field.required || undefined}
      />
    );
  }

  if (field.type === "file") {
    return (
      <FileUploadField
        label={field.label}
        required={field.required}
        hint={field.hint}
        value={typeof form[field.key] === "string" ? (form[field.key] as string) : ""}
        onChange={updateField}
        error={error}
      />
    );
  }

  return (
    <Input
      label={field.label}
      value={String(form[field.key] ?? "")}
      placeholder={field.placeholder ?? `Ex.: ${field.label}`}
      hint={field.hint}
      onChange={(event) => updateField(event.currentTarget.value)}
      error={error}
      maxLength={field.maxLength}
      aria-required={field.required || undefined}
    />
  );
}

function FieldShell({
  label,
  labelFor,
  required,
  hint,
  error,
  children
}: {
  label: string;
  labelFor?: string;
  required?: boolean;
  hint?: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <div className="grid gap-2 text-sm font-medium text-tk-ink">
      {labelFor ? (
        <label htmlFor={labelFor}>
          {label}
          {required ? <span className="ml-1 text-tk-error">*</span> : null}
        </label>
      ) : (
        <span>
          {label}
          {required ? <span className="ml-1 text-tk-error">*</span> : null}
        </span>
      )}
      {children}
      {hint ? <span className="text-xs leading-5 text-tk-ink-muted">{hint}</span> : null}
      {error ? <span className="text-xs text-tk-error">{error}</span> : null}
    </div>
  );
}

function NativeSelectField({
  label,
  required,
  options,
  value,
  onChange,
  hint,
  error
}: {
  label: string;
  required?: boolean;
  options: Array<{ value: string; label: string }>;
  value: string;
  onChange: (value: string) => void;
  hint?: string;
  error?: string;
}) {
  const id = useId();

  return (
    <FieldShell label={label} labelFor={id} required={required} hint={hint} error={error}>
      <select
        id={id}
        value={value}
        onChange={(event) => onChange(event.currentTarget.value)}
        className={cn(
          "flex h-11 w-full rounded-tk-input border border-tk-line bg-tk-surface px-4 text-sm text-tk-ink outline-none transition duration-200 ease-[var(--tk-ease)] hover:border-tk-accent focus-visible:ring-2 focus-visible:ring-tk-focus focus-visible:ring-offset-2",
          error && "border-tk-error"
        )}
      >
        <option value="">Selecione</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </FieldShell>
  );
}

function MultiSelectLite({
  label,
  required,
  options,
  value,
  onChange,
  hint,
  error
}: {
  label: string;
  required?: boolean;
  options: Array<{ value: string; label: string }>;
  value: string[];
  onChange: (value: string[]) => void;
  hint?: string;
  error?: string;
}) {
  return (
    <FieldShell label={label} required={required} hint={hint} error={error}>
      <div className={cn("rounded-2xl border border-tk-line bg-tk-surface p-4", error && "border-tk-error")}>
        <div className="mb-3 flex flex-wrap gap-2">
          {value.length ? (
            value.map((item) => {
              const labelForItem = options.find((option) => option.value === item)?.label ?? item;
              return (
                <Badge key={item} variant="muted">
                  {labelForItem}
                </Badge>
              );
            })
          ) : (
            <span className="text-sm text-tk-ink-muted">Nenhuma opção selecionada.</span>
          )}
        </div>
        <div className="grid gap-2">
          {options.map((option) => {
            const checked = value.includes(option.value);
            return (
              <label key={option.value} className="flex items-center gap-3 rounded-xl border border-tk-line px-3 py-2 text-sm text-tk-ink">
                <input
                  type="checkbox"
                  aria-label={option.label}
                  checked={checked}
                  onChange={(event) => {
                    if (event.currentTarget.checked) {
                      onChange([...value, option.value]);
                      return;
                    }
                    onChange(value.filter((item) => item !== option.value));
                  }}
                  className="h-4 w-4 rounded border-tk-line text-tk-brand focus:ring-tk-focus"
                />
                <span>{option.label}</span>
              </label>
            );
          })}
        </div>
      </div>
    </FieldShell>
  );
}

function ArrayInputLite({
  label,
  value = [],
  onChange,
  placeholder = "Digite um item e clique em adicionar",
  hint,
  error,
  suggestions
}: {
  label: string;
  value: string[];
  onChange: (value: string[]) => void;
  placeholder?: string;
  hint?: string;
  error?: string;
  suggestions?: string[];
}) {
  const [inputValue, setInputValue] = useState("");
  const datalistId = useId();
  const hasSuggestions = Boolean(suggestions?.length);

  return (
    <FieldShell label={label} hint={hint} error={error}>
      <div className="space-y-2">
        {value.map((item, index) => (
          <div key={`${item}-${index}`} className="flex items-center gap-2">
            <Input
              value={item}
              placeholder={placeholder}
              list={hasSuggestions ? datalistId : undefined}
              onChange={(event) => {
                const next = [...value];
                next[index] = event.currentTarget.value;
                onChange(next);
              }}
            />
            <IconButton
              label={`Remover item ${index + 1}`}
              tone="danger"
              onClick={() => onChange(value.filter((_, currentIndex) => currentIndex !== index))}
            >
              <X className="h-4 w-4" />
            </IconButton>
          </div>
        ))}
        <div className="flex items-center gap-2">
          <Input
            value={inputValue}
            placeholder={placeholder}
            list={hasSuggestions ? datalistId : undefined}
            onChange={(event) => setInputValue(event.currentTarget.value)}
            onKeyDown={(event) => {
              if (event.key !== "Enter") return;
              event.preventDefault();
              if (!inputValue.trim()) return;
              onChange([...value, inputValue.trim()]);
              setInputValue("");
            }}
          />
          <Button
            type="button"
            size="icon"
            onClick={() => {
              if (!inputValue.trim()) return;
              onChange([...value, inputValue.trim()]);
              setInputValue("");
            }}
          >
            <Plus className="h-4 w-4" />
          </Button>
        </div>
        {hasSuggestions ? (
          <datalist id={datalistId}>
            {suggestions!.map((suggestion) => (
              <option key={suggestion} value={suggestion}>
                {suggestion}
              </option>
            ))}
          </datalist>
        ) : null}
      </div>
    </FieldShell>
  );
}

type ModuleValue = {
  title: string;
  description: string;
  topics: string[];
  duration: string;
};

function ModulesBuilderLite({
  label,
  value = [],
  onChange,
  hint,
  error
}: {
  label: string;
  value: ModuleValue[];
  onChange: (value: ModuleValue[] | ((current: ModuleValue[]) => ModuleValue[])) => void;
  hint?: string;
  error?: string;
}) {
  return (
    <FieldShell label={label} hint={hint} error={error}>
      <div className="space-y-3">
        {value.map((module, moduleIndex) => (
          <div key={moduleIndex} className="space-y-3 rounded-2xl border border-tk-line bg-tk-surface-2 p-4">
            <div className="flex items-start justify-between gap-3">
              <h4 className="text-sm font-semibold text-tk-ink">Módulo {moduleIndex + 1}</h4>
              <IconButton
                label={`Remover módulo ${moduleIndex + 1}`}
                tone="danger"
                onClick={() => onChange((current) => current.filter((_, index) => index !== moduleIndex))}
              >
                <X className="h-4 w-4" />
              </IconButton>
            </div>

            <Input
              placeholder="Ex.: Introdução à legislação"
              value={module.title}
              onChange={(event) => onChange((current) => {
                const next = [...current];
                next[moduleIndex] = { ...next[moduleIndex], title: event.currentTarget.value };
                return next;
              })}
            />

            <Textarea
              placeholder="Resumo do conteúdo e objetivo do módulo"
              value={module.description}
              onChange={(event) => onChange((current) => {
                const next = [...current];
                next[moduleIndex] = { ...next[moduleIndex], description: event.currentTarget.value };
                return next;
              })}
            />

            <Input
              placeholder="Ex.: 8 horas"
              value={module.duration}
              onChange={(event) => onChange((current) => {
                const next = [...current];
                next[moduleIndex] = { ...next[moduleIndex], duration: event.currentTarget.value };
                return next;
              })}
            />

            <div className="border-t border-tk-line pt-3">
              <p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-tk-ink-muted">Tópicos</p>
              <div className="space-y-2">
                {module.topics.map((topic, topicIndex) => (
                  <div key={topicIndex} className="flex items-center gap-2">
                    <Input
                      placeholder="Ex.: Casos reais, checklist e boas práticas"
                      value={topic}
                      onChange={(event) => onChange((current) => {
                        const next = [...current];
                        const nextTopics = [...(next[moduleIndex]?.topics ?? [])];
                        nextTopics[topicIndex] = event.currentTarget.value;
                        next[moduleIndex] = { ...next[moduleIndex], topics: nextTopics };
                        return next;
                      })}
                    />
                    <IconButton
                      label={`Remover tópico ${topicIndex + 1} do módulo ${moduleIndex + 1}`}
                      tone="danger"
                      onClick={() => onChange((current) => {
                        const next = [...current];
                        const currentModule = next[moduleIndex];
                        if (!currentModule) return next;
                        next[moduleIndex] = {
                          ...currentModule,
                          topics: currentModule.topics.filter((_, index) => index !== topicIndex)
                        };
                        return next;
                      })}
                    >
                      <X className="h-4 w-4" />
                    </IconButton>
                  </div>
                ))}
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mt-3 w-full"
                onClick={() => onChange((current) => {
                  const next = [...current];
                  const currentModule = next[moduleIndex];
                  if (!currentModule) return next;
                  next[moduleIndex] = { ...currentModule, topics: [...currentModule.topics, ""] };
                  return next;
                })}
              >
                <Plus className="h-4 w-4" />
                Adicionar tópico
              </Button>
            </div>
          </div>
        ))}

        <Button
          type="button"
          variant="outline"
          className="w-full"
          onClick={() => onChange((current) => [
            ...current,
            { title: "", description: "", topics: [""], duration: "" }
          ])}
        >
          <Plus className="h-4 w-4" />
          Adicionar módulo
        </Button>
      </div>
    </FieldShell>
  );
}

function FileUploadField({
  label,
  required,
  hint,
  value,
  onChange,
  error
}: {
  label: string;
  required?: boolean;
  hint?: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const previewId = useId();

  function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") onChange(reader.result);
    };
    reader.readAsDataURL(file);
  }

  return (
    <FieldShell label={label} required={required} hint={hint} error={error}>
      <div className={cn("rounded-2xl border border-dashed border-tk-line p-4", error && "border-tk-error")}>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          aria-label={`Selecionar arquivo para ${label}`}
          className="hidden"
          onChange={handleFile}
        />
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <p className="text-sm text-tk-ink-muted">Selecione uma imagem para este registro.</p>
            {value ? (
              <div id={previewId} className="text-xs text-tk-ink-muted">
                Arquivo carregado e pronto para salvar.
              </div>
            ) : null}
          </div>
          <Button type="button" variant="outline" onClick={() => inputRef.current?.click()} aria-describedby={value ? previewId : undefined}>
            <Upload className="h-4 w-4" />
            Escolher imagem
          </Button>
        </div>
        {value ? (
          <div className="mt-4 overflow-hidden rounded-2xl border border-tk-line bg-tk-surface-2">
            <Image src={value} alt="" width={640} height={192} unoptimized className="max-h-48 w-full object-contain" />
          </div>
        ) : null}
      </div>
    </FieldShell>
  );
}
