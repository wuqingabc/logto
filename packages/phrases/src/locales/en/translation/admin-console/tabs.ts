const tabs = {
  get_started: 'Get started',
  dashboard: 'Dashboard',
  applications: 'Applications',
  api_resources: 'API resources',
  sign_in_experience: 'Sign-in & account',
  connectors: 'Connectors',
  enterprise_sso: 'Enterprise SSO',
  security: 'Security',
  webhooks: 'Webhooks',
  organizations: 'Organizations',
  users: 'User management',
  audit_logs: 'Audit logs',
  roles: 'Roles',
  docs: 'Docs',
  tenant_settings: 'Settings',
  mfa: 'Multi-factor auth',
  customize_jwt: 'Custom JWT',
  signing_keys: 'Signing keys',
  organization_template: 'Organization template',
  // [winamz] AI agent management tabs
  winamz_agents: 'AI Agents',
  winamz_grants: 'Delegations',
  winamz_audit: 'Agent Audit',
  winamz_create_agent: 'Create agent',
  winamz_agents_placeholder_title: 'AI Agents',
  winamz_agents_placeholder_description:
    'Register and manage AI agents that act on behalf of users or organizations. Approve agents to let them obtain tokens and perform delegated actions.',
};

export default Object.freeze(tabs);
