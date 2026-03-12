/**
 * WinAMZ AI agent management - English translations.
 *
 * [winamz] New file - no conflict with upstream Logto updates.
 */

const winamz = {
  // Page subtitles
  agents_subtitle: 'Register and manage AI agents that act on behalf of users or organizations.',
  grants_subtitle: 'View and manage user-to-agent delegation grants. Use the Kill Switch to revoke access immediately.',
  audit_subtitle: 'Immutable audit trail of all AI agent lifecycle and delegation events.',

  // Agent status labels
  status_pending_review: 'Pending review',
  status_approved: 'Approved',
  status_rejected: 'Rejected',
  status_suspended: 'Suspended',

  // Agent type labels
  type_personal: 'Personal',
  type_org: 'Organization',

  // Form field labels
  field_type: 'Type',
  field_organization: 'Organization',
  field_organization_id: 'Organization ID',
  field_owner_user: 'Owner user',
  field_owner_user_id: 'Owner user ID',
  field_logto_app_id: 'Logto app ID',
  field_requested_scopes: 'Requested scopes',
  field_scopes_placeholder: 'scope1, scope2, scope3',

  // Column headers
  col_name: 'Name',
  col_type: 'Type',
  col_status: 'Status',
  col_scopes: 'Scopes',
  col_actions: 'Actions',
  col_grant_id: 'Grant ID',
  col_agent_id: 'Agent ID',
  col_user_id: 'User ID',
  col_event: 'Event',
  col_resource: 'Resource',
  col_metadata: 'Metadata',
  col_time: 'Time',

  // Section headings
  section_status_management: 'Status management',
  section_danger_zone: 'Danger zone',

  // Action buttons
  action_create_agent: 'Create agent',
  action_approve: 'Approve',
  action_suspend: 'Suspend',
  action_restore: 'Restore',
  action_delete_agent: 'Delete agent',
  action_revoke: 'Revoke (Kill Switch)',
  action_show_active: 'Show active',
  action_show_revoked: 'Show revoked',

  // Grant status
  grant_active: 'Active',
  grant_revoked: 'Revoked',

  // Delete confirmation
  delete_agent_confirm: 'Are you sure you want to delete this agent? This action cannot be undone.',

  // Empty states
  no_agents: 'No agents found',
  no_grants: 'No grants found',
  no_audit_logs: 'No audit logs found',

  // Search / filter placeholders
  search_agents_placeholder: 'Search agents...',
  search_grants_placeholder: 'Search by agent / user ID...',
  search_audit_placeholder: 'Filter by agent ID...',
};

export default Object.freeze(winamz);
