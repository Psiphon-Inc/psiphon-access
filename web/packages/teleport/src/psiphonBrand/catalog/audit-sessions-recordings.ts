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
 * Brand catalog leaf: the audit log, active sessions and session recordings.
 *
 * One authoring child owns this file. Add an entry to `AUDIT_SESSIONS_RECORDINGS_ENTRIES` and
 * remove the matching entry from `AUDIT_SESSIONS_RECORDINGS_BASELINE` in the same commit. The
 * gate raises RATCHET_FAIL when a phrase is in both, and UNKNOWN_PHRASE when a
 * phrase is in neither.
 */

import type { BrandBaselineEntry, BrandPhrase } from '../brandCatalog';

/** Catalog entries for this area. */
export const AUDIT_SESSIONS_RECORDINGS_ENTRIES: readonly BrandPhrase[] = [
  {
    source:
      '---\ntitle: "Audit Event Reference"\ndescription: "Provides a comprehensive list of Teleport audit events and their fields."\n---\n{/* Generated file. Do not edit. */}\n{/* To regenerate, run \\`make audit-event-reference\\` */}\n\n${introParagraph}\n',
    replacement:
      '---\ntitle: "Audit Event Reference"\ndescription: "Provides a comprehensive list of Psiphon Access audit events and their fields."\n---\n{/* Generated file. Do not edit. */}\n{/* To regenerate, run \\`make audit-event-reference\\` */}\n\n${introParagraph}\n',
    count: 1,
    tier: 'render',
    immutable: false,
    reason:
      'The description names the running service, while the upstream document title, generator command, comments, and placeholder stay unchanged',
  },
  {
    source: 'Clipboard Sharing disabled by Teleport RBAC.',
    replacement: 'Clipboard Sharing disabled by Psiphon Access RBAC.',
    count: 1,
    tier: 'render',
    immutable: false,
    reason:
      'The message describes access policy enforced by the running service',
  },
  {
    source:
      'Creating Teleport [${resource_type}] [${teleport_id}] for [${integration}] [${resource_type}] [${external_id}] failed',
    replacement:
      'Creating Psiphon Access [${resource_type}] [${teleport_id}] for [${integration}] [${resource_type}] [${external_id}] failed',
    count: 1,
    tier: 'render',
    immutable: false,
    reason:
      'The message names the running service, while all audit field placeholders and resource kinds stay unchanged',
  },
  {
    source:
      'Creating Teleport [${resource_type}] [${teleport_id}] for [${integration}] [${resource_type}] [${external_id}] succeeded',
    replacement:
      'Creating Psiphon Access [${resource_type}] [${teleport_id}] for [${integration}] [${resource_type}] [${external_id}] succeeded',
    count: 1,
    tier: 'render',
    immutable: false,
    reason:
      'The message names the running service, while all audit field placeholders and resource kinds stay unchanged',
  },
  {
    source:
      'Deleting [${integration}] [${resource_type}] [${external_id}] / [${teleport_id}] failed',
    replacement:
      'Deleting [${integration}] [${resource_type}] [${external_id}] / [${teleport_id}] failed',
    count: 1,
    tier: 'protocol',
    immutable: true,
    reason:
      'The only brand hit is the teleport_id audit field placeholder, whose name is part of the event schema',
  },
  {
    source:
      'Deleting [${integration}] [${resource_type}] [${external_id}] / [${teleport_id}] succeeded',
    replacement:
      'Deleting [${integration}] [${resource_type}] [${external_id}] / [${teleport_id}] succeeded',
    count: 1,
    tier: 'protocol',
    immutable: true,
    reason:
      'The only brand hit is the teleport_id audit field placeholder, whose name is part of the event schema',
  },
  {
    source: 'Directory Sharing disabled by Teleport RBAC.',
    replacement: 'Directory Sharing disabled by Psiphon Access RBAC.',
    count: 1,
    tier: 'render',
    immutable: false,
    reason:
      'The message describes access policy enforced by the running service',
  },
  {
    source:
      'Downloading from https://cdn.teleport.dev/teleport-ent-v18.7.4-linux-amd64-bin.tar.gz and extracting teleport to /tmp ...',
    replacement:
      'Downloading from https://cdn.teleport.dev/teleport-ent-v18.7.4-linux-amd64-bin.tar.gz and extracting teleport to /tmp ...',
    count: 1,
    tier: 'protocol',
    immutable: true,
    reason:
      'The URL, archive name, teleport binary name, and extraction path identify upstream installation inputs and must stay exact',
  },
  {
    source:
      'Fetching Teleport [${resource_type}] [${teleport_id}] for [${integration}] [${resource_type}] [${external_id}] failed',
    replacement:
      'Fetching Psiphon Access [${resource_type}] [${teleport_id}] for [${integration}] [${resource_type}] [${external_id}] failed',
    count: 1,
    tier: 'render',
    immutable: false,
    reason:
      'The message names the running service, while all audit field placeholders and resource kinds stay unchanged',
  },
  {
    source:
      'Fetching Teleport [${resource_type}] [${teleport_id}] for [${integration}] [${resource_type}] [${external_id}] succeeded',
    replacement:
      'Fetching Psiphon Access [${resource_type}] [${teleport_id}] for [${integration}] [${resource_type}] [${external_id}] succeeded',
    count: 1,
    tier: 'render',
    immutable: false,
    reason:
      'The message names the running service, while all audit field placeholders and resource kinds stay unchanged',
  },
  {
    source:
      'HiDPI is not supported for this session. The version of Teleport running on the server may be too old.',
    replacement:
      'HiDPI is not supported for this session. The version of Psiphon Access running on the server may be too old.',
    count: 1,
    tier: 'render',
    immutable: false,
    reason: 'The warning describes the running server product',
  },
  {
    source: 'Join Active Sessions With Teleport Enterprise',
    replacement: 'Join Active Sessions With Teleport Enterprise',
    count: 1,
    tier: 'render',
    immutable: true,
    reason:
      'Teleport Enterprise is the accurate name of an upstream paid feature that this fork does not ship',
  },
  {
    source: 'Join Active Sessions with Teleport Enterprise',
    replacement: 'Join Active Sessions with Teleport Enterprise',
    count: 1,
    tier: 'render',
    immutable: true,
    reason:
      'Teleport Enterprise is the accurate name of an upstream paid feature that this fork does not ship',
  },
  {
    source: 'Join as a moderator with Teleport Enterprise',
    replacement: 'Join as a moderator with Teleport Enterprise',
    count: 1,
    tier: 'render',
    immutable: true,
    reason:
      'Teleport Enterprise is the accurate name of an upstream paid feature that this fork does not ship',
  },
  {
    source:
      "PUT https://management.azure.com/subscriptions/00000000-0000-0000-0000-000000000000/resourceGroups/example-dev-a1b2c3d4-workload-rg/providers/Microsoft.Compute/virtualMachines/example-dev-a1b2c3d4-vm-1/runCommands/teleport-install: 403 Forbidden: AuthorizationFailed: The client does not have authorization to perform action 'Microsoft.Compute/virtualMachines/runCommands/write' over scope.",
    replacement:
      "PUT https://management.azure.com/subscriptions/00000000-0000-0000-0000-000000000000/resourceGroups/example-dev-a1b2c3d4-workload-rg/providers/Microsoft.Compute/virtualMachines/example-dev-a1b2c3d4-vm-1/runCommands/teleport-install: 403 Forbidden: AuthorizationFailed: The client does not have authorization to perform action 'Microsoft.Compute/virtualMachines/runCommands/write' over scope.",
    count: 1,
    tier: 'protocol',
    immutable: true,
    reason:
      'The Azure request URL and teleport-install run-command name are protocol identifiers in an audit fixture',
  },
  {
    source:
      'Patching Teleport [${resource_type}] [${teleport_id}] from [${integration}][${resource_type}] [${external_id}] failed',
    replacement:
      'Patching Psiphon Access [${resource_type}] [${teleport_id}] from [${integration}][${resource_type}] [${external_id}] failed',
    count: 1,
    tier: 'render',
    immutable: false,
    reason:
      'The message names the running service, while all audit field placeholders and resource kinds stay unchanged',
  },
  {
    source:
      'Patching Teleport [${resource_type}] [${teleport_id}] from [${integration}][${resource_type}] [${external_id}] succeeded',
    replacement:
      'Patching Psiphon Access [${resource_type}] [${teleport_id}] from [${integration}][${resource_type}] [${external_id}] succeeded',
    count: 1,
    tier: 'render',
    immutable: false,
    reason:
      'The message names the running service, while all audit field placeholders and resource kinds stay unchanged',
  },
  {
    source:
      'Proxy specified in update.yaml does not match teleport.yaml. refusing to install with conflicting proxy addresses',
    replacement:
      'Proxy specified in update.yaml does not match teleport.yaml. refusing to install with conflicting proxy addresses',
    count: 1,
    tier: 'protocol',
    immutable: true,
    reason:
      'update.yaml and teleport.yaml are exact upstream configuration file names consumed by the installer',
  },
  {
    source:
      'Updating Teleport [${resource_type}] [${teleport_id}] from [${integration}][${resource_type}] [${external_id}] failed',
    replacement:
      'Updating Psiphon Access [${resource_type}] [${teleport_id}] from [${integration}][${resource_type}] [${external_id}] failed',
    count: 1,
    tier: 'render',
    immutable: false,
    reason:
      'The message names the running service, while all audit field placeholders and resource kinds stay unchanged',
  },
  {
    source:
      'Updating Teleport [${resource_type}] [${teleport_id}] from [${integration}][${resource_type}] [${external_id}] succeeded',
    replacement:
      'Updating Psiphon Access [${resource_type}] [${teleport_id}] from [${integration}][${resource_type}] [${external_id}] succeeded',
    count: 1,
    tier: 'render',
    immutable: false,
    reason:
      'The message names the running service, while all audit field placeholders and resource kinds stay unchanged',
  },
  {
    source:
      'Warning: adding an entry for ${e.code} (${e.raw.event}) with no example. Add a test fixture to web/packages/teleport/src/Audit/fixtures/index.ts',
    replacement:
      'Warning: adding an entry for ${e.code} (${e.raw.event}) with no example. Add a test fixture to web/packages/teleport/src/Audit/fixtures/index.ts',
    count: 1,
    tier: 'protocol',
    immutable: true,
    reason:
      'The placeholders name audit event fields and the repository path identifies the required fixture file',
  },
  {
    source: 'arn:aws:iam::1234567890:role/teleport-db-role',
    replacement: 'arn:aws:iam::1234567890:role/teleport-db-role',
    count: 1,
    tier: 'protocol',
    immutable: true,
    reason:
      'The string is an AWS ARN whose role name is an external-system identifier',
  },
  {
    source: 'example.teleport.sh',
    replacement: 'example.teleport.sh',
    count: 6,
    tier: 'protocol',
    immutable: true,
    reason: 'The string is a host name in audit event fixtures',
  },
  {
    source: 'gke_teleport-a',
    replacement: 'gke_teleport-a',
    count: 2,
    tier: 'protocol',
    immutable: true,
    reason:
      'The string is a Kubernetes cluster resource name in audit event fixtures',
  },
  {
    source: 'grv_teleport_desktop_hidpi',
    replacement: 'grv_teleport_desktop_hidpi',
    count: 2,
    tier: 'protocol',
    immutable: true,
    reason:
      'The string is a persisted storage key shared by desktop session settings and storage types',
  },
  {
    source: 'spiffe://example.teleport.com/bar',
    replacement: 'spiffe://example.teleport.com/bar',
    count: 1,
    tier: 'protocol',
    immutable: true,
    reason: 'The string is a SPIFFE ID URI in an audit event fixture',
  },
  {
    source: 'teleport has been installed successfully',
    replacement: 'teleport has been installed successfully',
    count: 1,
    tier: 'protocol',
    immutable: true,
    reason:
      'The value is exact stdout from the upstream teleport installer, so changing the binary name would make the recorded command output inaccurate',
  },
  {
    source: 'teleport-spanner',
    replacement: 'teleport-spanner',
    count: 2,
    tier: 'protocol',
    immutable: true,
    reason:
      'The string is an audit fixture resource name whose exact value is part of the event example',
  },
  {
    source: 'teleport-tdpb-1.0',
    replacement: 'teleport-tdpb-1.0',
    count: 1,
    tier: 'protocol',
    immutable: true,
    reason:
      'The value is the desktop WebSocket query parameter for the negotiated Teleport Desktop Protocol version, so changing it would break connection compatibility',
  },
  {
    source: 'teleport/console',
    replacement: 'teleport/console',
    count: 1,
    tier: 'protocol',
    immutable: true,
    reason:
      'The value is the console logger namespace, so keeping the operational identifier stable preserves log filtering and categorization',
  },
  {
    source: 'teleportdev',
    replacement: 'teleportdev',
    count: 2,
    tier: 'protocol',
    immutable: true,
    reason:
      'The value is an exact integration identifier in user-task audit event fields, so changing it would alter recorded protocol data',
  },
  {
    source: 'web/packages/teleport/src/Audit/fixtures/index.ts',
    replacement: 'web/packages/teleport/src/Audit/fixtures/index.ts',
    count: 1,
    tier: 'protocol',
    immutable: true,
    reason:
      'The repository path identifies the audit fixture file used by the generator command',
  },
  {
    source: 'web/packages/teleport/src/services/audit/makeEvent.ts',
    replacement: 'web/packages/teleport/src/services/audit/makeEvent.ts',
    count: 1,
    tier: 'protocol',
    immutable: true,
    reason:
      'The repository path identifies the audit formatter file used by the generator command',
  },
  {
    source:
      '{/*cSpell:disable*/}\n\n{/* Formatted event examples sometimes include different capitalization than\nwhat we standardize on in the docs*/}\n{/* vale messaging.capitalization = NO */}\n\nTeleport components emit audit events to record activity within the cluster. \n\nAudit event payloads have an \\`event\\` field that describes the event, which is\noften an operation performed against a dynamic resource (e.g.,\n\\`access_list.create\\` for the creation of an Access List) or some other user\nbehavior, such as a local user login (\\`user.login\\`). The \\`code\\` field\nincludes a string with pattern \\`[A-Z0-9]{6}\\` that is unique to an audit event,\nsuch as \\`TAP03I\\` for the creation of an application resource.\n\nIn some cases, an audit event describes both a success state and a failure\nstate, while the \\`event\\` field is the same for both states. In this case, the\n\\`code\\` field differs between states. For example, \\`access_list.create\\`\ndescribes both successful and failed Access List creations, while the success\nevent has code \\`TAL001I\\` and the failure has code \\`TAL001E\\`. For other\nevents, like \\`db.session.query.failed\\` and \\`db.session.query\\`, the event\ntype describes only the success or failure state.\n\nYou can set up Teleport to export audit events to third-party services for\nstorage, visualization, and analysis. For more information, read [Exporting\nTeleport Audit Events](\n../zero-trust-access/export-audit-events/export-audit-events.mdx).',
    replacement:
      '{/*cSpell:disable*/}\n\n{/* Formatted event examples sometimes include different capitalization than\nwhat we standardize on in the docs*/}\n{/* vale messaging.capitalization = NO */}\n\nPsiphon Access components emit audit events to record activity within the cluster. \n\nAudit event payloads have an \\`event\\` field that describes the event, which is\noften an operation performed against a dynamic resource (e.g.,\n\\`access_list.create\\` for the creation of an Access List) or some other user\nbehavior, such as a local user login (\\`user.login\\`). The \\`code\\` field\nincludes a string with pattern \\`[A-Z0-9]{6}\\` that is unique to an audit event,\nsuch as \\`TAP03I\\` for the creation of an application resource.\n\nIn some cases, an audit event describes both a success state and a failure\nstate, while the \\`event\\` field is the same for both states. In this case, the\n\\`code\\` field differs between states. For example, \\`access_list.create\\`\ndescribes both successful and failed Access List creations, while the success\nevent has code \\`TAL001I\\` and the failure has code \\`TAL001E\\`. For other\nevents, like \\`db.session.query.failed\\` and \\`db.session.query\\`, the event\ntype describes only the success or failure state.\n\nYou can set up Psiphon Access to export audit events to third-party services for\nstorage, visualization, and analysis. For more information, read [Exporting\nTeleport Audit Events](\n../zero-trust-access/export-audit-events/export-audit-events.mdx).',
    count: 1,
    tier: 'render',
    immutable: false,
    reason:
      'The prose names the running service, while audit event types, field names, comments, and the upstream document title stay unchanged',
  },
];

/** No unauthored phrases remain in this area. */
export const AUDIT_SESSIONS_RECORDINGS_BASELINE: readonly BrandBaselineEntry[] =
  [];
