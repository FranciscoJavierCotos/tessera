-- C01 — cover the composite foreign keys added by `projects` (advisor
-- `unindexed_foreign_keys`).

create index projects_id_workspace_id_type_idx
  on public.projects (id, workspace_id, type);
create index project_members_project_id_workspace_id_idx
  on public.project_members (project_id, workspace_id);
