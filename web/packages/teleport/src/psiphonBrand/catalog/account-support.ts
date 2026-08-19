/*
 * Psiphon Access
 * Copyright (C) 2026  Psiphon Inc.
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 */

/**
 * Brand catalog leaf: account settings, support, login and everything not in another area.
 *
 * One authoring child owns this file. Add an entry to `ACCOUNT_SUPPORT_ENTRIES` and
 * remove the matching entry from `ACCOUNT_SUPPORT_BASELINE` in the same commit. The
 * gate raises RATCHET_FAIL when a phrase is in both, and UNKNOWN_PHRASE when a
 * phrase is in neither.
 */

import type { BrandBaselineEntry, BrandPhrase } from '../brandCatalog';

/** Catalog entries for this area. */
export const ACCOUNT_SUPPORT_ENTRIES: readonly BrandPhrase[] = [
  {
    source: ' - Configure your teleport agent',
    replacement: ' - Configure your teleport agent',
    count: 2,
    tier: 'protocol',
    immutable: true,
    reason:
      'The step label names the upstream teleport agent binary that the following command configures.',
  },
  {
    source: ' - Download Teleport Connect',
    replacement: ' - Download Teleport Connect',
    count: 1,
    tier: 'render',
    immutable: true,
    reason:
      'Teleport Connect is the upstream desktop application name, so this instruction must keep its real name.',
  },
  {
    source: ' - Log in to Teleport',
    replacement: ' - Log in to Psiphon Access',
    count: 6,
    tier: 'render',
    immutable: false,
    reason:
      'This login instruction names the running service and must use the Psiphon Access product name.',
  },
  {
    source: ' - Start VNet in Teleport Connect',
    replacement: ' - Start VNet in Teleport Connect',
    count: 1,
    tier: 'render',
    immutable: true,
    reason:
      'VNet runs in the upstream Teleport Connect desktop application, so this instruction must keep its real name.',
  },
  {
    source: ' - Start the Teleport agent with the configuration file',
    replacement: ' - Start the Teleport agent with the configuration file',
    count: 1,
    tier: 'render',
    immutable: true,
    reason:
      'The instruction names the upstream Teleport agent software that the user starts.',
  },
  {
    source: ' - Start the Teleport agent with the generated configuration file',
    replacement:
      ' - Start the Teleport agent with the generated configuration file',
    count: 1,
    tier: 'render',
    immutable: true,
    reason:
      'The instruction names the upstream Teleport agent software that the user starts.',
  },
  {
    source:
      '# POST ${cfg.api.bot.genWizardCiCd}\n:body\n\n# This is a mocked Terraform template\nresource "teleport_bot" "bot_name" {\n  version = "v1"\n\n  metadata = {\n    name = "bot_name"\n  }\n\n  spec = {\n    roles = ["access"]\n  }\n}\n',
    replacement:
      '# POST ${cfg.api.bot.genWizardCiCd}\n:body\n\n# This is a mocked Terraform template\nresource "teleport_bot" "bot_name" {\n  version = "v1"\n\n  metadata = {\n    name = "bot_name"\n  }\n\n  spec = {\n    roles = ["access"]\n  }\n}\n',
    count: 1,
    tier: 'protocol',
    immutable: true,
    reason:
      'This mocked Terraform response contains the teleport_bot resource type, which Terraform configuration must keep unchanged.',
  },
  {
    source: '$HOME/.config/teleport',
    replacement: '$HOME/.config/teleport',
    count: 1,
    tier: 'protocol',
    immutable: true,
    reason:
      'This is the default filesystem path for teleport client configuration.',
  },
  {
    source: '${DOWNLOAD_BASE_URL}teleport-${enterprise}${version}.pkg',
    replacement: '${DOWNLOAD_BASE_URL}teleport-${enterprise}${version}.pkg',
    count: 1,
    tier: 'protocol',
    immutable: true,
    reason:
      'This is an upstream Teleport package filename template, and every placeholder is part of the download contract.',
  },
  {
    source:
      '${DOWNLOAD_BASE_URL}teleport-${enterprise}v${version}-${infix}-bin.tar.gz',
    replacement:
      '${DOWNLOAD_BASE_URL}teleport-${enterprise}v${version}-${infix}-bin.tar.gz',
    count: 1,
    tier: 'protocol',
    immutable: true,
    reason:
      'This is an upstream Teleport package filename template, and every placeholder is part of the download contract.',
  },
  {
    source:
      '* Note: For a self-hosted Teleport version, you may need to update DNS and obtain a TLS certificate for this application.\n            Learn more about application access ',
    replacement:
      '* Note: For a self-hosted Psiphon Access deployment, you may need to update DNS and obtain a TLS certificate for this application.\n            Learn more about application access ',
    count: 1,
    tier: 'render',
    immutable: false,
    reason:
      'This note describes the running deployment, and deployment is more accurate than version after the rebrand.',
  },
  {
    source: '- Download Teleport package to your computer',
    replacement: '- Download Teleport package to your computer',
    count: 1,
    tier: 'render',
    immutable: true,
    reason:
      'The download link retrieves the upstream Teleport software package, so the instruction must keep the package name.',
  },
  {
    source:
      '. Every request is authenticated and audited by Teleport, which also injects the provider API key - so no real key is needed locally.',
    replacement:
      '. Every request is authenticated and audited by Psiphon Access, which also injects the provider API key - so no real key is needed locally.',
    count: 1,
    tier: 'render',
    immutable: false,
    reason:
      'This sentence describes authentication and auditing by the running service.',
  },
  {
    source: '234.dev-test.teleport',
    replacement: '234.dev-test.teleport',
    count: 4,
    tier: 'protocol',
    immutable: true,
    reason:
      'This is an example hostname used by fixture data, not product copy.',
  },
  {
    source: 'Any non-empty value works; Teleport swaps in the real key.',
    replacement:
      'Any non-empty value works; Psiphon Access swaps in the real key.',
    count: 1,
    tier: 'render',
    immutable: false,
    reason:
      'This sentence describes the running service replacing an example API key.',
  },
  {
    source:
      'Auth connectors allow Teleport to authenticate users via an external identity source such as Okta, Microsoft Entra ID, GitHub, etc. This authentication method is commonly known as single sign-on (SSO).',
    replacement:
      'Auth connectors allow Psiphon Access to authenticate users via an external identity source such as Okta, Microsoft Entra ID, GitHub, etc. This authentication method is commonly known as single sign-on (SSO).',
    count: 2,
    tier: 'render',
    immutable: false,
    reason:
      'This account copy describes authentication performed by the running service.',
  },
  {
    source:
      "Choose if Teleport's appearance should be light or dark, or follow your computer's settings.",
    replacement:
      "Choose whether Psiphon Access should use a light or dark appearance, or follow your computer's settings.",
    count: 1,
    tier: 'render',
    immutable: false,
    reason:
      'This rewrite avoids an awkward possessive while naming the Psiphon Access user interface.',
  },
  {
    source:
      'Device Trust reduces the attack surface by enforcing that only trusted, registered devices can access your Teleport cluster.',
    replacement:
      'Device Trust reduces the attack surface by enforcing that only trusted, registered devices can access your Teleport cluster.',
    count: 1,
    tier: 'render',
    immutable: true,
    reason:
      'This copy describes the upstream Device Trust capability, which Psiphon Access does not ship.',
  },
  {
    source: 'Go to Teleport Customer Center',
    replacement: 'Go to Teleport Customer Center',
    count: 1,
    tier: 'render',
    immutable: true,
    reason:
      'Teleport Customer Center is the name of the upstream external support service.',
  },
  {
    source: 'Log into Teleport.',
    replacement: 'Log into Psiphon Access.',
    count: 1,
    tier: 'render',
    immutable: false,
    reason: 'This instruction names the running service.',
  },
  {
    source: 'Manual auth w/ users local to Teleport',
    replacement: 'Manual auth w/ users local to Psiphon Access',
    count: 1,
    tier: 'render',
    immutable: false,
    reason:
      'This connector description refers to users stored by the running service.',
  },
  {
    source: 'Open Teleport-authenticated session in the browser:',
    replacement: 'Open a browser session authenticated by Psiphon Access:',
    count: 2,
    tier: 'render',
    immutable: false,
    reason:
      'This rewrite avoids an awkward branded compound adjective and names the authenticating service.',
  },
  {
    source:
      'Open a Support ticket in the Teleport Customer Center to report this view and request assistance for next steps.',
    replacement:
      'Open a Support ticket in the Teleport Customer Center to report this view and request assistance for next steps.',
    count: 1,
    tier: 'render',
    immutable: true,
    reason:
      'Teleport Customer Center is the named upstream support destination for this instruction.',
  },
  {
    source: 'Teleport Home',
    replacement: 'Psiphon Access Home',
    count: 1,
    tier: 'render',
    immutable: false,
    reason:
      'This navigation label names the home scope of the running service.',
  },
  {
    source: 'Teleport Okta',
    replacement: 'Teleport Okta',
    count: 3,
    tier: 'protocol',
    immutable: true,
    reason:
      'This is fixture data for an application resource name and friendly name, not product copy.',
  },
  {
    source: 'Teleport Version',
    replacement: 'Teleport Version',
    count: 1,
    tier: 'render',
    immutable: true,
    reason:
      'The label reports the version of the underlying upstream Teleport software.',
  },
  {
    source:
      'Teleport can automatically set up application access. Provide the name and URL of your application to generate our auto-installer script.',
    replacement:
      'Psiphon Access can automatically set up application access. Provide the name and URL of your application to generate our auto-installer script.',
    count: 1,
    tier: 'render',
    immutable: false,
    reason: 'This setup copy describes a function of the running service.',
  },
  {
    source:
      'Teleport uses security devices - TPMs on Windows and Linux and secure enclaves on Macs to give every device a cryptographic identity.',
    replacement:
      'Teleport uses security devices - TPMs on Windows and Linux and secure enclaves on Macs to give every device a cryptographic identity.',
    count: 1,
    tier: 'render',
    immutable: true,
    reason:
      'This copy describes the upstream Device Trust capability, which Psiphon Access does not ship.',
  },
  {
    source:
      'The script will install the Teleport agent to provide secure access to your application.',
    replacement:
      'The script will install the Teleport agent to provide secure access to your application.',
    count: 1,
    tier: 'render',
    immutable: true,
    reason:
      'The generated script installs the upstream Teleport agent software, so the instruction must keep its real name.',
  },
  {
    source:
      'Unable to access "${fqdn}". This may happen if your Teleport Proxy is using an untrusted or self-signed certificate. Please ensure Teleport Proxy service uses a valid certificate or access the application domain directly (https://${fqdn}${port}) and accept the certificate exception from your browser.',
    replacement:
      'Unable to access "${fqdn}". This may happen if your Teleport Proxy is using an untrusted or self-signed certificate. Please ensure Teleport Proxy service uses a valid certificate or access the application domain directly (https://${fqdn}${port}) and accept the certificate exception from your browser.',
    count: 1,
    tier: 'render',
    immutable: true,
    reason:
      'Teleport Proxy is the upstream software component whose certificate this diagnostic checks.',
  },
  {
    source: 'Unable to retrieve Teleport Context',
    replacement: 'Unable to retrieve Teleport Context',
    count: 1,
    tier: 'protocol',
    immutable: true,
    reason:
      'Teleport Context names the internal React context that this developer diagnostic could not retrieve.',
  },
  {
    source: 'Unlock OIDC & SAML Single Sign-On with Teleport Enterprise',
    replacement: 'Unlock OIDC & SAML Single Sign-On with Teleport Enterprise',
    count: 1,
    tier: 'render',
    immutable: true,
    reason:
      'Teleport Enterprise is a real upstream edition title with no Psiphon Access equivalent.',
  },
  {
    source: 'Unlock Trusted Devices With Teleport Enterprise',
    replacement: 'Unlock Trusted Devices With Teleport Enterprise',
    count: 1,
    tier: 'render',
    immutable: true,
    reason:
      'Teleport Enterprise is a real upstream edition title with no Psiphon Access equivalent.',
  },
  {
    source:
      'You have been logged out of Teleport, but we were unable to log you out of ${connectorNameText}. See the Teleport logs for details.',
    replacement:
      'You have been logged out of Psiphon Access, but we were unable to log you out of ${connectorNameText}. See the Psiphon Access logs for details.',
    count: 1,
    tier: 'render',
    immutable: false,
    reason:
      'Both brand references describe the running service, and the connector placeholder must remain unchanged.',
  },
  {
    source: 'anthropic.teleport.example.com',
    replacement: 'anthropic.teleport.example.com',
    count: 2,
    tier: 'protocol',
    immutable: true,
    reason:
      'This is an example hostname used by fixture data, not product copy.',
  },
  {
    source:
      'automatically proxies connections from your computer to TCP apps available through Teleport. Any program on your device can connect to an application behind Teleport.',
    replacement:
      'automatically proxies connections from your computer to TCP apps available through Psiphon Access. Any program on your device can connect to an application behind Psiphon Access.',
    count: 1,
    tier: 'render',
    immutable: false,
    reason:
      'Both brand references describe applications reached through the running service.',
  },
  {
    source: 'awsconsole-1.teleport-proxy.com',
    replacement: 'awsconsole-1.teleport-proxy.com',
    count: 2,
    tier: 'protocol',
    immutable: true,
    reason:
      'This is an example hostname used by fixture data, not product copy.',
  },
  {
    source: 'bedrock.teleport.example.com',
    replacement: 'bedrock.teleport.example.com',
    count: 2,
    tier: 'protocol',
    immutable: true,
    reason:
      'This is an example hostname used by fixture data, not product copy.',
  },
  {
    source: 'cloud-app.teleport.example.com',
    replacement: 'cloud-app.teleport.example.com',
    count: 2,
    tier: 'protocol',
    immutable: true,
    reason:
      'This is an example hostname used by fixture data, not product copy.',
  },
  {
    source: 'dev-test.teleport',
    replacement: 'dev-test.teleport',
    count: 2,
    tier: 'protocol',
    immutable: true,
    reason:
      'This is an example hostname used by fixture data, not product copy.',
  },
  {
    source: 'example.teleport.com',
    replacement: 'example.teleport.com',
    count: 2,
    tier: 'protocol',
    immutable: true,
    reason:
      'This is an example hostname used by fixture data, not product copy.',
  },
  {
    source: 'export ANTHROPIC_API_KEY=teleport',
    replacement: 'export ANTHROPIC_API_KEY=teleport',
    count: 1,
    tier: 'protocol',
    immutable: true,
    reason:
      'This is a displayed shell environment assignment whose example value must remain byte-identical.',
  },
  {
    source: 'export KUBECONFIG=${HOME?}/teleport-kubeconfig.yaml',
    replacement: 'export KUBECONFIG=${HOME?}/teleport-kubeconfig.yaml',
    count: 1,
    tier: 'protocol',
    immutable: true,
    reason:
      'This is a displayed shell command containing the generated kubeconfig filename and a required placeholder.',
  },
  {
    source: 'export OPENAI_API_KEY=teleport',
    replacement: 'export OPENAI_API_KEY=teleport',
    count: 1,
    tier: 'protocol',
    immutable: true,
    reason:
      'This is a displayed shell environment assignment whose example value must remain byte-identical.',
  },
  {
    source: 'grafana.teleport-proxy.com',
    replacement: 'grafana.teleport-proxy.com',
    count: 2,
    tier: 'protocol',
    immutable: true,
    reason:
      'This is an example hostname used by fixture data, not product copy.',
  },
  {
    source: 'grv_teleport_access_graph_enabled',
    replacement: 'grv_teleport_access_graph_enabled',
    count: 1,
    tier: 'protocol',
    immutable: true,
    reason:
      'This is a browser storage key whose spelling preserves existing user preferences and cached state.',
  },
  {
    source: 'grv_teleport_access_graph_iac_enabled',
    replacement: 'grv_teleport_access_graph_iac_enabled',
    count: 1,
    tier: 'protocol',
    immutable: true,
    reason:
      'This is a browser storage key whose spelling preserves existing user preferences and cached state.',
  },
  {
    source: 'grv_teleport_access_graph_query',
    replacement: 'grv_teleport_access_graph_query',
    count: 1,
    tier: 'protocol',
    immutable: true,
    reason:
      'This is a browser storage key whose spelling preserves existing user preferences and cached state.',
  },
  {
    source: 'grv_teleport_access_graph_role_tester_enabled',
    replacement: 'grv_teleport_access_graph_role_tester_enabled',
    count: 1,
    tier: 'protocol',
    immutable: true,
    reason:
      'This is a browser storage key whose spelling preserves existing user preferences and cached state.',
  },
  {
    source: 'grv_teleport_access_graph_search_mode',
    replacement: 'grv_teleport_access_graph_search_mode',
    count: 1,
    tier: 'protocol',
    immutable: true,
    reason:
      'This is a browser storage key whose spelling preserves existing user preferences and cached state.',
  },
  {
    source: 'grv_teleport_access_graph_sql_enabled',
    replacement: 'grv_teleport_access_graph_sql_enabled',
    count: 1,
    tier: 'protocol',
    immutable: true,
    reason:
      'This is a browser storage key whose spelling preserves existing user preferences and cached state.',
  },
  {
    source: 'grv_teleport_access_list_preferences',
    replacement: 'grv_teleport_access_list_preferences',
    count: 1,
    tier: 'protocol',
    immutable: true,
    reason:
      'This is a browser storage key whose spelling preserves existing user preferences and cached state.',
  },
  {
    source: 'grv_teleport_app_launcher_fragment',
    replacement: 'grv_teleport_app_launcher_fragment',
    count: 1,
    tier: 'protocol',
    immutable: true,
    reason:
      'This is a browser storage key whose spelling preserves existing user preferences and cached state.',
  },
  {
    source: 'grv_teleport_cloud_user_invites',
    replacement: 'grv_teleport_cloud_user_invites',
    count: 1,
    tier: 'protocol',
    immutable: true,
    reason:
      'This is a browser storage key whose spelling preserves existing user preferences and cached state.',
  },
  {
    source: 'grv_teleport_discover',
    replacement: 'grv_teleport_discover',
    count: 1,
    tier: 'protocol',
    immutable: true,
    reason:
      'This is a browser storage key whose spelling preserves existing user preferences and cached state.',
  },
  {
    source: 'grv_teleport_enable_telemetry',
    replacement: 'grv_teleport_enable_telemetry',
    count: 1,
    tier: 'protocol',
    immutable: true,
    reason:
      'This is a browser storage key whose spelling preserves existing user preferences and cached state.',
  },
  {
    source: 'grv_teleport_external_audit_storage_disabled',
    replacement: 'grv_teleport_external_audit_storage_disabled',
    count: 1,
    tier: 'protocol',
    immutable: true,
    reason:
      'This is a browser storage key whose spelling preserves existing user preferences and cached state.',
  },
  {
    source:
      'grv_teleport_identity_security_recommendations_unified_resources_cta_seen',
    replacement:
      'grv_teleport_identity_security_recommendations_unified_resources_cta_seen',
    count: 1,
    tier: 'protocol',
    immutable: true,
    reason:
      'This is a browser storage key whose spelling preserves existing user preferences and cached state.',
  },
  {
    source: 'grv_teleport_last_active',
    replacement: 'grv_teleport_last_active',
    count: 1,
    tier: 'protocol',
    immutable: true,
    reason:
      'This is a browser storage key whose spelling preserves existing user preferences and cached state.',
  },
  {
    source: 'grv_teleport_license_acknowledged',
    replacement: 'grv_teleport_license_acknowledged',
    count: 1,
    tier: 'protocol',
    immutable: true,
    reason:
      'This is a browser storage key whose spelling preserves existing user preferences and cached state.',
  },
  {
    source: 'grv_teleport_login_time',
    replacement: 'grv_teleport_login_time',
    count: 1,
    tier: 'protocol',
    immutable: true,
    reason:
      'This is a browser storage key whose spelling preserves existing user preferences and cached state.',
  },
  {
    source: 'grv_teleport_notification_states',
    replacement: 'grv_teleport_notification_states',
    count: 1,
    tier: 'protocol',
    immutable: true,
    reason:
      'This is a browser storage key whose spelling preserves existing user preferences and cached state.',
  },
  {
    source: 'grv_teleport_onboard_survey',
    replacement: 'grv_teleport_onboard_survey',
    count: 1,
    tier: 'protocol',
    immutable: true,
    reason:
      'This is a browser storage key whose spelling preserves existing user preferences and cached state.',
  },
  {
    source: 'grv_teleport_remembered_sso_username',
    replacement: 'grv_teleport_remembered_sso_username',
    count: 1,
    tier: 'protocol',
    immutable: true,
    reason:
      'This is a browser storage key whose spelling preserves existing user preferences and cached state.',
  },
  {
    source: 'grv_teleport_scope_selected',
    replacement: 'grv_teleport_scope_selected',
    count: 1,
    tier: 'protocol',
    immutable: true,
    reason:
      'This is a browser storage key whose spelling preserves existing user preferences and cached state.',
  },
  {
    source: 'grv_teleport_session_recording_sidebar_hidden',
    replacement: 'grv_teleport_session_recording_sidebar_hidden',
    count: 1,
    tier: 'protocol',
    immutable: true,
    reason:
      'This is a browser storage key whose spelling preserves existing user preferences and cached state.',
  },
  {
    source: 'grv_teleport_session_recording_sidebar_width',
    replacement: 'grv_teleport_session_recording_sidebar_width',
    count: 1,
    tier: 'protocol',
    immutable: true,
    reason:
      'This is a browser storage key whose spelling preserves existing user preferences and cached state.',
  },
  {
    source: 'grv_teleport_session_recording_timeline_height',
    replacement: 'grv_teleport_session_recording_timeline_height',
    count: 1,
    tier: 'protocol',
    immutable: true,
    reason:
      'This is a browser storage key whose spelling preserves existing user preferences and cached state.',
  },
  {
    source: 'grv_teleport_session_recording_timeline_hidden',
    replacement: 'grv_teleport_session_recording_timeline_hidden',
    count: 1,
    tier: 'protocol',
    immutable: true,
    reason:
      'This is a browser storage key whose spelling preserves existing user preferences and cached state.',
  },
  {
    source: 'grv_teleport_session_recording_timeline_show_absolute_time',
    replacement: 'grv_teleport_session_recording_timeline_show_absolute_time',
    count: 1,
    tier: 'protocol',
    immutable: true,
    reason:
      'This is a browser storage key whose spelling preserves existing user preferences and cached state.',
  },
  {
    source: 'grv_teleport_session_recordings_density',
    replacement: 'grv_teleport_session_recordings_density',
    count: 1,
    tier: 'protocol',
    immutable: true,
    reason:
      'This is a browser storage key whose spelling preserves existing user preferences and cached state.',
  },
  {
    source: 'grv_teleport_session_recordings_dismissed_cta',
    replacement: 'grv_teleport_session_recordings_dismissed_cta',
    count: 1,
    tier: 'protocol',
    immutable: true,
    reason:
      'This is a browser storage key whose spelling preserves existing user preferences and cached state.',
  },
  {
    source: 'grv_teleport_session_recordings_dismissed_setup',
    replacement: 'grv_teleport_session_recordings_dismissed_setup',
    count: 1,
    tier: 'protocol',
    immutable: true,
    reason:
      'This is a browser storage key whose spelling preserves existing user preferences and cached state.',
  },
  {
    source: 'grv_teleport_session_recordings_view_mode',
    replacement: 'grv_teleport_session_recordings_view_mode',
    count: 1,
    tier: 'protocol',
    immutable: true,
    reason:
      'This is a browser storage key whose spelling preserves existing user preferences and cached state.',
  },
  {
    source: 'grv_teleport_sidenav_recent_history',
    replacement: 'grv_teleport_sidenav_recent_history',
    count: 1,
    tier: 'protocol',
    immutable: true,
    reason:
      'This is a browser storage key whose spelling preserves existing user preferences and cached state.',
  },
  {
    source: 'grv_teleport_token',
    replacement: 'grv_teleport_token',
    count: 1,
    tier: 'protocol',
    immutable: true,
    reason:
      'This is a browser storage key whose spelling preserves existing user preferences and cached state.',
  },
  {
    source: 'grv_teleport_token_renew',
    replacement: 'grv_teleport_token_renew',
    count: 1,
    tier: 'protocol',
    immutable: true,
    reason:
      'This is a browser storage key whose spelling preserves existing user preferences and cached state.',
  },
  {
    source: 'grv_teleport_ui_theme',
    replacement: 'grv_teleport_ui_theme',
    count: 1,
    tier: 'protocol',
    immutable: true,
    reason:
      'This is a browser storage key whose spelling preserves existing user preferences and cached state.',
  },
  {
    source: 'grv_teleport_use_login_scope_picker',
    replacement: 'grv_teleport_use_login_scope_picker',
    count: 1,
    tier: 'protocol',
    immutable: true,
    reason:
      'This is a browser storage key whose spelling preserves existing user preferences and cached state.',
  },
  {
    source: 'grv_teleport_use_new_role_editor',
    replacement: 'grv_teleport_use_new_role_editor',
    count: 1,
    tier: 'protocol',
    immutable: true,
    reason:
      'This is a browser storage key whose spelling preserves existing user preferences and cached state.',
  },
  {
    source: 'grv_teleport_use_topbar',
    replacement: 'grv_teleport_use_topbar',
    count: 1,
    tier: 'protocol',
    immutable: true,
    reason:
      'This is a browser storage key whose spelling preserves existing user preferences and cached state.',
  },
  {
    source: 'grv_teleport_user_preferences',
    replacement: 'grv_teleport_user_preferences',
    count: 1,
    tier: 'protocol',
    immutable: true,
    reason:
      'This is a browser storage key whose spelling preserves existing user preferences and cached state.',
  },
  {
    source: 'https://${fqdn}${port}/x-teleport-auth',
    replacement: 'https://${fqdn}${port}/x-teleport-auth',
    count: 1,
    tier: 'protocol',
    immutable: true,
    reason:
      'This is the Teleport application authentication endpoint URL, including placeholders and a fixed protocol path.',
  },
  {
    source: 'https://github.com/Psiphon-Inc/psiphon-access',
    replacement: 'https://github.com/Psiphon-Inc/psiphon-access',
    count: 1,
    tier: 'protocol',
    immutable: true,
    reason:
      'This is the real AGPL source-offer repository URL fixed by ADR 0008.',
  },
  {
    source: 'https://grafana.teleport-proxy.com',
    replacement: 'https://grafana.teleport-proxy.com',
    count: 2,
    tier: 'protocol',
    immutable: true,
    reason:
      'This is an example hostname used by fixture data, not product copy.',
  },
  {
    source: 'https://jenkins.teleport-proxy.com',
    replacement: 'https://jenkins.teleport-proxy.com',
    count: 5,
    tier: 'protocol',
    immutable: true,
    reason:
      'This is an example hostname used by fixture data, not product copy.',
  },
  {
    source: 'https://mattermost1.teleport-proxy.com',
    replacement: 'https://mattermost1.teleport-proxy.com',
    count: 2,
    tier: 'protocol',
    immutable: true,
    reason:
      'This is an example hostname used by fixture data, not product copy.',
  },
  {
    source: 'https://slack.teleport-proxy.com',
    replacement: 'https://slack.teleport-proxy.com',
    count: 2,
    tier: 'protocol',
    immutable: true,
    reason:
      'This is an example hostname used by fixture data, not product copy.',
  },
  {
    source: 'jenkins.teleport-proxy.com',
    replacement: 'jenkins.teleport-proxy.com',
    count: 5,
    tier: 'protocol',
    immutable: true,
    reason:
      'This is an example hostname used by fixture data, not product copy.',
  },
  {
    source: 'mattermost.teleport-proxy.com',
    replacement: 'mattermost.teleport-proxy.com',
    count: 2,
    tier: 'protocol',
    immutable: true,
    reason:
      'This is an example hostname used by fixture data, not product copy.',
  },
  {
    source: 'mcp-everything.teleport.example.com',
    replacement: 'mcp-everything.teleport.example.com',
    count: 2,
    tier: 'protocol',
    immutable: true,
    reason:
      'This is an example hostname used by fixture data, not product copy.',
  },
  {
    source: 'openai-bedrock.teleport.example.com',
    replacement: 'openai-bedrock.teleport.example.com',
    count: 2,
    tier: 'protocol',
    immutable: true,
    reason:
      'This is an example hostname used by fixture data, not product copy.',
  },
  {
    source: 'openai.teleport.example.com',
    replacement: 'openai.teleport.example.com',
    count: 2,
    tier: 'protocol',
    immutable: true,
    reason:
      'This is an example hostname used by fixture data, not product copy.',
  },
  {
    source:
      'rendering OpenSSH config\\n\\twriting known_hosts to destination\\n\\t\\treading "/opt/teleport/identity/known_hosts"\\n\\t\\t\\topen /opt/teleport/identity/known_hosts: permission denied',
    replacement:
      'rendering OpenSSH config\\n\\twriting known_hosts to destination\\n\\t\\treading "/opt/teleport/identity/known_hosts"\\n\\t\\t\\topen /opt/teleport/identity/known_hosts: permission denied',
    count: 1,
    tier: 'protocol',
    immutable: true,
    reason:
      'This fixture is an OpenSSH diagnostic with the deployed Teleport identity filesystem path.',
  },
  {
    source: 'saml_app_launch_url.teleport.com',
    replacement: 'saml_app_launch_url.teleport.com',
    count: 1,
    tier: 'protocol',
    immutable: true,
    reason:
      'This is an example hostname used by fixture data, not product copy.',
  },
  {
    source: 'slack.teleport-proxy.com',
    replacement: 'slack.teleport-proxy.com',
    count: 2,
    tier: 'protocol',
    immutable: true,
    reason:
      'This is an example hostname used by fixture data, not product copy.',
  },
  {
    source:
      'some-long-cluster-public-url-name.cloud.teleport.gravitational.io:1234',
    replacement:
      'some-long-cluster-public-url-name.cloud.teleport.gravitational.io:1234',
    count: 1,
    tier: 'protocol',
    immutable: true,
    reason:
      'This is an example hostname used by fixture data, not product copy.',
  },
  {
    source: 'tcp-app.teleport.example.com',
    replacement: 'tcp-app.teleport.example.com',
    count: 2,
    tier: 'protocol',
    immutable: true,
    reason:
      'This is an example hostname used by fixture data, not product copy.',
  },
  {
    source:
      'teleport configure --output=${configFile} --app-name=[example-app] --app-uri=http://localhost/ \\\n--roles=app --token=${token} --proxy=${host} --data-dir=${cfg.configDir}',
    replacement:
      'teleport configure --output=${configFile} --app-name=[example-app] --app-uri=http://localhost/ \\\n--roles=app --token=${token} --proxy=${host} --data-dir=${cfg.configDir}',
    count: 1,
    tier: 'protocol',
    immutable: true,
    reason:
      'This is a shell command that invokes the teleport binary, and all placeholders and flags are interface contracts.',
  },
  {
    source: 'teleport start --config=${configFile}',
    replacement: 'teleport start --config=${configFile}',
    count: 1,
    tier: 'protocol',
    immutable: true,
    reason:
      'This is a shell command that invokes the teleport binary with its configuration flag and placeholder.',
  },
  {
    source: 'teleport-auth-01',
    replacement: 'teleport-auth-01',
    count: 1,
    tier: 'protocol',
    immutable: true,
    reason: 'This is a fixture instance identifier, not product copy.',
  },
  {
    source: 'teleport-web-ui',
    replacement: 'teleport-web-ui',
    count: 1,
    tier: 'protocol',
    immutable: true,
    reason: 'This is the telemetry service name used to identify the web UI.',
  },
  {
    source: 'teleport.internal/link',
    replacement: 'teleport.internal/link',
    count: 1,
    tier: 'protocol',
    immutable: true,
    reason:
      'This is a Teleport internal alert metadata label key read by alert rendering code.',
  },
  {
    source: 'teleport.internal/link-text',
    replacement: 'teleport.internal/link-text',
    count: 1,
    tier: 'protocol',
    immutable: true,
    reason:
      'This is a Teleport internal alert metadata label key read by alert rendering code.',
  },
  {
    source: 'teleport.internal/ver-in-use',
    replacement: 'teleport.internal/ver-in-use',
    count: 1,
    tier: 'protocol',
    immutable: true,
    reason:
      'This is a Teleport internal alert metadata label key read by alert rendering code.',
  },
  {
    source: 'tls-grpc-app.teleport.example.com',
    replacement: 'tls-grpc-app.teleport.example.com',
    count: 2,
    tier: 'protocol',
    immutable: true,
    reason:
      'This is an example hostname used by fixture data, not product copy.',
  },
  {
    source:
      'web/packages/teleport/src/ManagedUpdates/shared.tsx:259 ProgressBar fill on tonal neutral',
    replacement:
      'web/packages/teleport/src/ManagedUpdates/shared.tsx:259 ProgressBar fill on tonal neutral',
    count: 1,
    tier: 'protocol',
    immutable: true,
    reason:
      'This is an internal contrast-catalog source-location descriptor that names an upstream file and line.',
  },
  {
    source:
      'web/packages/teleport/src/ManagedUpdates/shared.tsx:264 ProgressBar fill on tonal neutral',
    replacement:
      'web/packages/teleport/src/ManagedUpdates/shared.tsx:264 ProgressBar fill on tonal neutral',
    count: 1,
    tier: 'protocol',
    immutable: true,
    reason:
      'This is an internal contrast-catalog source-location descriptor that names an upstream file and line.',
  },
];

/**
 * Phrases in this area that reach a user and that no catalog entry covers yet.
 * Measured against the catalog baseline recorded on 2026-08-19 by `brandGate.ts`.
 * The baseline can only shrink (ratchet rule).
 */
export const ACCOUNT_SUPPORT_BASELINE: readonly BrandBaselineEntry[] = [];
