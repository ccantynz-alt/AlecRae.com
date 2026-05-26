"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import {
  Box,
  Text,
  Button,
  Input,
  Card,
  CardContent,
  CardHeader,
  CardFooter,
  PageLayout,
} from "@alecrae/ui";
import { AnimatePresence, motion } from "motion/react";
import {
  templatesApi,
  type Template,
  type TemplateRenderResult,
} from "../../../lib/api";
import {
  fadeInUp,
  scaleIn,
  staggerSlow,
  SPRING_BOUNCY,
  useAlecRaeReducedMotion,
  withReducedMotion,
} from "../../../lib/animations";

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Extract {{variable}} placeholders from a string. */
function extractVariables(text: string): string[] {
  const matches = text.match(/\{\{(\w+)\}\}/g);
  if (!matches) return [];
  const unique = new Set(matches.map((m) => m.replace(/\{\{|\}\}/g, "")));
  return Array.from(unique);
}

/** Get all variables from a template's subject + body fields. */
function getTemplateVariables(template: {
  subject: string;
  htmlBody?: string | null;
  textBody?: string | null;
}): string[] {
  const combined = [
    template.subject,
    template.htmlBody ?? "",
    template.textBody ?? "",
  ].join(" ");
  return extractVariables(combined);
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface CreateFormData {
  name: string;
  subject: string;
  htmlBody: string;
  textBody: string;
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function TemplatesPage(): React.ReactNode {
  const reduced = useAlecRaeReducedMotion();
  const itemVariants = withReducedMotion(fadeInUp, reduced);
  const modalVariants = withReducedMotion(scaleIn, reduced);

  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  const loadTemplates = useCallback(async () => {
    try {
      setLoading(true);
      const res = await templatesApi.list({ limit: 50 });
      setTemplates(res.data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load templates");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTemplates();
  }, [loadTemplates]);

  const handleDelete = async (id: string) => {
    try {
      await templatesApi.delete(id);
      setTemplates((prev) => prev.filter((t) => t.id !== id));
      setDeleteConfirmId(null);
      setExpandedId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete template");
    }
  };

  const handleCreated = (template: Template) => {
    setTemplates((prev) => [template, ...prev]);
    setShowCreateForm(false);
  };

  const handleUpdated = (updated: Template) => {
    setTemplates((prev) =>
      prev.map((t) => (t.id === updated.id ? updated : t)),
    );
  };

  const actions = (
    <Button
      variant="primary"
      size="sm"
      onClick={() => setShowCreateForm(true)}
    >
      New Template
    </Button>
  );

  return (
    <PageLayout
      title="Templates"
      description="Create and manage reusable email templates with dynamic variables."
      actions={actions}
    >
      {error && (
        <Box className="mb-4 rounded-md border border-red-200 bg-red-50 p-3">
          <Text variant="body-sm" className="text-red-800">
            {error}
          </Text>
        </Box>
      )}

      <AnimatePresence mode="wait">
        {showCreateForm && (
          <motion.div
            key="create-form"
            variants={modalVariants}
            initial="initial"
            animate="animate"
            exit="exit"
          >
            <CreateTemplateForm
              onClose={() => setShowCreateForm(false)}
              onCreated={handleCreated}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {loading ? (
        <Box className="space-y-4">
          {[1, 2, 3].map((i) => (
            <Box
              key={i}
              className="h-20 animate-pulse rounded-lg bg-surface-secondary"
            />
          ))}
        </Box>
      ) : templates.length === 0 ? (
        <Card>
          <CardContent>
            <Box className="py-8 text-center">
              <Text variant="heading-sm" muted className="mb-2">
                No templates yet
              </Text>
              <Text variant="body-sm" muted>
                Create your first email template to get started. Use variables
                like {"{{name}}"} for personalization.
              </Text>
            </Box>
          </CardContent>
        </Card>
      ) : (
        <motion.div
          className="space-y-3"
          variants={staggerSlow}
          initial="initial"
          animate="animate"
        >
          <AnimatePresence>
            {templates.map((template) => (
              <motion.div
                key={template.id}
                variants={itemVariants}
                layout
                transition={SPRING_BOUNCY}
              >
                <TemplateCard
                  template={template}
                  isExpanded={expandedId === template.id}
                  onToggleExpand={() =>
                    setExpandedId(
                      expandedId === template.id ? null : template.id,
                    )
                  }
                  onUpdated={handleUpdated}
                  onPreview={() => setPreviewId(template.id)}
                  deleteConfirm={deleteConfirmId === template.id}
                  onDeleteRequest={() => setDeleteConfirmId(template.id)}
                  onDeleteCancel={() => setDeleteConfirmId(null)}
                  onDeleteConfirm={() => handleDelete(template.id)}
                />
              </motion.div>
            ))}
          </AnimatePresence>
        </motion.div>
      )}

      <AnimatePresence>
        {previewId && (
          <TemplatePreviewPanel
            templateId={previewId}
            template={templates.find((t) => t.id === previewId) ?? null}
            onClose={() => setPreviewId(null)}
          />
        )}
      </AnimatePresence>
    </PageLayout>
  );
}

// ─── Create Template Form ─────────────────────────────────────────────────────

function CreateTemplateForm({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (template: Template) => void;
}): React.ReactNode {
  const [form, setForm] = useState<CreateFormData>({
    name: "",
    subject: "",
    htmlBody: "",
    textBody: "",
  });
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const variables = useMemo(
    () => getTemplateVariables(form),
    [form],
  );

  const handleSubmit = async () => {
    if (!form.name.trim() || !form.subject.trim()) {
      setFormError("Name and subject are required.");
      return;
    }

    setSaving(true);
    setFormError(null);

    try {
      const res = await templatesApi.create({
        name: form.name.trim(),
        subject: form.subject.trim(),
        htmlBody: form.htmlBody.trim() || undefined,
        textBody: form.textBody.trim() || undefined,
      });
      onCreated(res.data);
    } catch (err) {
      setFormError(
        err instanceof Error ? err.message : "Failed to create template",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="mb-6 border-border">
      <CardHeader>
        <Text variant="heading-sm">Create New Template</Text>
      </CardHeader>
      <CardContent>
        {formError && (
          <Box className="mb-3 rounded border border-red-200 bg-red-50 p-2">
            <Text variant="body-sm" className="text-red-800">
              {formError}
            </Text>
          </Box>
        )}
        <Box className="space-y-4">
          <Input
            label="Template Name"
            variant="text"
            placeholder="e.g. Welcome Email"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
          <Input
            label="Subject Line"
            variant="text"
            placeholder="e.g. Welcome to {{company}}, {{name}}!"
            value={form.subject}
            onChange={(e) => setForm({ ...form, subject: e.target.value })}
          />
          <Box>
            <Text variant="body-sm" className="mb-1 font-medium text-content">
              HTML Body
            </Text>
            <textarea
              className="w-full rounded-md border border-border bg-surface p-3 font-mono text-sm text-content placeholder:text-content-muted focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
              rows={6}
              placeholder={"<p>Hi {{name}},</p>\n<p>Welcome to {{company}}!</p>"}
              value={form.htmlBody}
              onChange={(e) => setForm({ ...form, htmlBody: e.target.value })}
            />
          </Box>
          <Box>
            <Text variant="body-sm" className="mb-1 font-medium text-content">
              Plain Text Body
            </Text>
            <textarea
              className="w-full rounded-md border border-border bg-surface p-3 font-mono text-sm text-content placeholder:text-content-muted focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
              rows={4}
              placeholder={"Hi {{name}},\nWelcome to {{company}}!"}
              value={form.textBody}
              onChange={(e) => setForm({ ...form, textBody: e.target.value })}
            />
          </Box>

          {variables.length > 0 && (
            <Box>
              <Text variant="body-sm" muted className="mb-2">
                Detected variables:
              </Text>
              <Box className="flex flex-wrap gap-2">
                {variables.map((v) => (
                  <Box
                    key={v}
                    className="rounded-full border border-accent/30 bg-accent/10 px-2.5 py-0.5"
                  >
                    <Text variant="body-sm" className="text-accent font-medium">
                      {`{{${v}}}`}
                    </Text>
                  </Box>
                ))}
              </Box>
            </Box>
          )}
        </Box>
      </CardContent>
      <CardFooter>
        <Box className="flex items-center gap-3">
          <Button
            variant="primary"
            size="sm"
            onClick={handleSubmit}
            disabled={saving || !form.name.trim() || !form.subject.trim()}
          >
            {saving ? "Creating..." : "Create Template"}
          </Button>
          <Button variant="ghost" size="sm" onClick={onClose}>
            Cancel
          </Button>
        </Box>
      </CardFooter>
    </Card>
  );
}

CreateTemplateForm.displayName = "CreateTemplateForm";

// ─── Template Card ────────────────────────────────────────────────────────────

function TemplateCard({
  template,
  isExpanded,
  onToggleExpand,
  onUpdated,
  onPreview,
  deleteConfirm,
  onDeleteRequest,
  onDeleteCancel,
  onDeleteConfirm,
}: {
  template: Template;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onUpdated: (updated: Template) => void;
  onPreview: () => void;
  deleteConfirm: boolean;
  onDeleteRequest: () => void;
  onDeleteCancel: () => void;
  onDeleteConfirm: () => void;
}): React.ReactNode {
  const variables = useMemo(() => getTemplateVariables(template), [template]);

  return (
    <Card className="border-border transition-colors hover:border-accent/40">
      <CardContent className="p-0">
        <Box
          className="flex cursor-pointer items-center justify-between p-4"
          onClick={onToggleExpand}
        >
          <Box className="min-w-0 flex-1">
            <Box className="flex items-center gap-3">
              <Text variant="body-md" className="font-semibold text-content truncate">
                {template.name}
              </Text>
              {variables.length > 0 && (
                <Box className="hidden shrink-0 rounded-full bg-surface-secondary px-2 py-0.5 sm:block">
                  <Text variant="body-xs" muted>
                    {variables.length} variable{variables.length !== 1 ? "s" : ""}
                  </Text>
                </Box>
              )}
            </Box>
            <Text variant="body-sm" muted className="mt-0.5 truncate">
              {template.subject}
            </Text>
          </Box>
          <Box className="flex shrink-0 items-center gap-2 pl-4">
            <Text variant="body-xs" muted className="hidden md:block">
              {formatDate(template.updatedAt)}
            </Text>
            <Box
              className={`h-5 w-5 text-content-muted transition-transform ${
                isExpanded ? "rotate-180" : ""
              }`}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 20 20"
                fill="currentColor"
                className="h-5 w-5"
              >
                <path
                  fillRule="evenodd"
                  d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
                  clipRule="evenodd"
                />
              </svg>
            </Box>
          </Box>
        </Box>

        <AnimatePresence>
          {isExpanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{
                height: "auto",
                opacity: 1,
                transition: {
                  height: SPRING_BOUNCY,
                  opacity: { duration: 0.2, delay: 0.05 },
                },
              }}
              exit={{
                height: 0,
                opacity: 0,
                transition: {
                  height: { duration: 0.2 },
                  opacity: { duration: 0.1 },
                },
              }}
              className="overflow-hidden"
            >
              <TemplateEditSection
                template={template}
                variables={variables}
                onUpdated={onUpdated}
                onPreview={onPreview}
                deleteConfirm={deleteConfirm}
                onDeleteRequest={onDeleteRequest}
                onDeleteCancel={onDeleteCancel}
                onDeleteConfirm={onDeleteConfirm}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </CardContent>
    </Card>
  );
}

TemplateCard.displayName = "TemplateCard";

// ─── Template Edit Section ────────────────────────────────────────────────────

function TemplateEditSection({
  template,
  variables,
  onUpdated,
  onPreview,
  deleteConfirm,
  onDeleteRequest,
  onDeleteCancel,
  onDeleteConfirm,
}: {
  template: Template;
  variables: string[];
  onUpdated: (updated: Template) => void;
  onPreview: () => void;
  deleteConfirm: boolean;
  onDeleteRequest: () => void;
  onDeleteCancel: () => void;
  onDeleteConfirm: () => void;
}): React.ReactNode {
  const [editName, setEditName] = useState(template.name);
  const [editSubject, setEditSubject] = useState(template.subject);
  const [editHtml, setEditHtml] = useState(template.htmlBody ?? "");
  const [editText, setEditText] = useState(template.textBody ?? "");
  const [saving, setSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  const isDirty =
    editName !== template.name ||
    editSubject !== template.subject ||
    editHtml !== (template.htmlBody ?? "") ||
    editText !== (template.textBody ?? "");

  const currentVariables = useMemo(
    () =>
      getTemplateVariables({
        subject: editSubject,
        htmlBody: editHtml,
        textBody: editText,
      }),
    [editSubject, editHtml, editText],
  );

  const handleSave = async () => {
    if (!editName.trim() || !editSubject.trim()) {
      setEditError("Name and subject are required.");
      return;
    }

    setSaving(true);
    setEditError(null);

    try {
      const res = await templatesApi.update(template.id, {
        name: editName.trim(),
        subject: editSubject.trim(),
        htmlBody: editHtml.trim() || undefined,
        textBody: editText.trim() || undefined,
      });
      onUpdated(res.data);
    } catch (err) {
      setEditError(
        err instanceof Error ? err.message : "Failed to update template",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <Box className="border-t border-border px-4 pb-4 pt-3">
      {editError && (
        <Box className="mb-3 rounded border border-red-200 bg-red-50 p-2">
          <Text variant="body-sm" className="text-red-800">
            {editError}
          </Text>
        </Box>
      )}

      <Box className="space-y-3">
        <Box className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <Input
            label="Name"
            variant="text"
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
          />
          <Input
            label="Subject"
            variant="text"
            value={editSubject}
            onChange={(e) => setEditSubject(e.target.value)}
          />
        </Box>

        <Box>
          <Text variant="body-sm" className="mb-1 font-medium text-content">
            HTML Body
          </Text>
          <textarea
            className="w-full rounded-md border border-border bg-surface p-3 font-mono text-sm text-content placeholder:text-content-muted focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
            rows={5}
            value={editHtml}
            onChange={(e) => setEditHtml(e.target.value)}
          />
        </Box>

        <Box>
          <Text variant="body-sm" className="mb-1 font-medium text-content">
            Plain Text Body
          </Text>
          <textarea
            className="w-full rounded-md border border-border bg-surface p-3 font-mono text-sm text-content placeholder:text-content-muted focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
            rows={3}
            value={editText}
            onChange={(e) => setEditText(e.target.value)}
          />
        </Box>

        {currentVariables.length > 0 && (
          <Box>
            <Text variant="body-xs" muted className="mb-1.5">
              Variables in template:
            </Text>
            <Box className="flex flex-wrap gap-1.5">
              {currentVariables.map((v) => (
                <Box
                  key={v}
                  className="rounded-full border border-accent/30 bg-accent/10 px-2 py-0.5"
                >
                  <Text variant="body-xs" className="text-accent font-medium">
                    {`{{${v}}}`}
                  </Text>
                </Box>
              ))}
            </Box>
          </Box>
        )}

        <Box className="flex items-center justify-between pt-2">
          <Box className="flex items-center gap-2">
            <Button
              variant="primary"
              size="sm"
              onClick={handleSave}
              disabled={saving || !isDirty}
            >
              {saving ? "Saving..." : "Save Changes"}
            </Button>
            <Button variant="secondary" size="sm" onClick={onPreview}>
              Preview
            </Button>
          </Box>

          <Box>
            {deleteConfirm ? (
              <Box className="flex items-center gap-2">
                <Text variant="body-sm" className="text-red-600">
                  Confirm delete?
                </Text>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onDeleteConfirm}
                  className="text-red-600 hover:bg-red-50"
                >
                  Yes, Delete
                </Button>
                <Button variant="ghost" size="sm" onClick={onDeleteCancel}>
                  Cancel
                </Button>
              </Box>
            ) : (
              <Button
                variant="ghost"
                size="sm"
                onClick={onDeleteRequest}
                className="text-red-600 hover:bg-red-50"
              >
                Delete
              </Button>
            )}
          </Box>
        </Box>
      </Box>
    </Box>
  );
}

TemplateEditSection.displayName = "TemplateEditSection";

// ─── Template Preview Panel ───────────────────────────────────────────────────

function TemplatePreviewPanel({
  templateId,
  template,
  onClose,
}: {
  templateId: string;
  template: Template | null;
  onClose: () => void;
}): React.ReactNode {
  const reduced = useAlecRaeReducedMotion();
  const panelVariants = withReducedMotion(fadeInUp, reduced);

  const variables = useMemo(
    () => (template ? getTemplateVariables(template) : []),
    [template],
  );

  const [values, setValues] = useState<Record<string, string>>({});
  const [rendered, setRendered] = useState<TemplateRenderResult | null>(null);
  const [rendering, setRendering] = useState(false);
  const [renderError, setRenderError] = useState<string | null>(null);

  useEffect(() => {
    const initial: Record<string, string> = {};
    for (const v of variables) {
      initial[v] = "";
    }
    setValues(initial);
    setRendered(null);
  }, [variables]);

  const handleRender = async () => {
    setRendering(true);
    setRenderError(null);

    try {
      const res = await templatesApi.render(templateId, values);
      setRendered(res.data);
    } catch (err) {
      setRenderError(
        err instanceof Error ? err.message : "Failed to render template",
      );
    } finally {
      setRendering(false);
    }
  };

  return (
    <motion.div
      variants={panelVariants}
      initial="initial"
      animate="animate"
      exit="exit"
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
    >
      <Box
        className="absolute inset-0 bg-black/40"
        onClick={onClose}
      />
      <Box className="relative z-10 w-full max-w-2xl max-h-[85vh] overflow-y-auto rounded-xl border border-border bg-surface shadow-2xl">
        <Box className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-surface px-6 py-4">
          <Text variant="heading-sm">
            Preview: {template?.name ?? "Template"}
          </Text>
          <Button variant="ghost" size="sm" onClick={onClose}>
            Close
          </Button>
        </Box>

        <Box className="p-6 space-y-5">
          {variables.length > 0 ? (
            <Box className="space-y-3">
              <Text variant="body-sm" className="font-medium text-content">
                Fill in variable values:
              </Text>
              <Box className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {variables.map((v) => (
                  <Input
                    key={v}
                    label={v}
                    variant="text"
                    placeholder={`Value for {{${v}}}`}
                    value={values[v] ?? ""}
                    onChange={(e) =>
                      setValues({ ...values, [v]: e.target.value })
                    }
                  />
                ))}
              </Box>
              <Button
                variant="primary"
                size="sm"
                onClick={handleRender}
                disabled={rendering}
              >
                {rendering ? "Rendering..." : "Render Preview"}
              </Button>
            </Box>
          ) : (
            <Box>
              <Text variant="body-sm" muted>
                This template has no variables. Click render to see the output.
              </Text>
              <Box className="mt-3">
                <Button
                  variant="primary"
                  size="sm"
                  onClick={handleRender}
                  disabled={rendering}
                >
                  {rendering ? "Rendering..." : "Render Preview"}
                </Button>
              </Box>
            </Box>
          )}

          {renderError && (
            <Box className="rounded border border-red-200 bg-red-50 p-3">
              <Text variant="body-sm" className="text-red-800">
                {renderError}
              </Text>
            </Box>
          )}

          {rendered && (
            <Box className="space-y-4">
              <Box>
                <Text variant="body-xs" muted className="mb-1">
                  Rendered Subject
                </Text>
                <Box className="rounded-md border border-border bg-surface-secondary p-3">
                  <Text variant="body-md" className="font-medium text-content">
                    {rendered.subject}
                  </Text>
                </Box>
              </Box>

              {rendered.htmlBody && (
                <Box>
                  <Text variant="body-xs" muted className="mb-1">
                    Rendered HTML
                  </Text>
                  <Box className="max-h-64 overflow-y-auto rounded-md border border-border bg-white p-4">
                    <div
                      className="prose prose-sm max-w-none text-content"
                      dangerouslySetInnerHTML={{ __html: rendered.htmlBody }}
                    />
                  </Box>
                </Box>
              )}

              {rendered.textBody && (
                <Box>
                  <Text variant="body-xs" muted className="mb-1">
                    Rendered Plain Text
                  </Text>
                  <Box className="rounded-md border border-border bg-surface-secondary p-3">
                    <Text
                      variant="body-sm"
                      className="whitespace-pre-wrap font-mono text-content"
                    >
                      {rendered.textBody}
                    </Text>
                  </Box>
                </Box>
              )}
            </Box>
          )}
        </Box>
      </Box>
    </motion.div>
  );
}

TemplatePreviewPanel.displayName = "TemplatePreviewPanel";
