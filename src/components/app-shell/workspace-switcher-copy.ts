import type { WorkspaceSwitcherCopy } from "./workspace-switcher";

export function workspaceSwitcherCopy(labels: Record<string, string>): WorkspaceSwitcherCopy {
  return {
    activeAria:
      labels["workspaceSwitcherActiveAria"] ?? "Active workspace: {name}. Click to switch.",
    selectAria: labels["workspaceSwitcherSelectAria"] ?? "Select a workspace. Click to open.",
    selectWorkspace: labels["workspaceSwitcherSelect"] ?? "Select workspace",
    noWorkspacesAria: labels["workspaceSwitcherNoWorkspacesAria"] ?? "No workspaces",
    createFirst: labels["workspaceSwitcherCreateFirst"] ?? "Create your first workspace",
    switchTitle: labels["workspaceSwitcherSwitchTitle"] ?? "Switch workspace",
    listAria: labels["workspaceSwitcherListAria"] ?? "Workspaces",
    noWorkspacesYet: labels["workspaceSwitcherNoWorkspacesYet"] ?? "No workspaces yet.",
    newWorkspace: labels["workspaceSwitcherNew"] ?? "New workspace",
  };
}
