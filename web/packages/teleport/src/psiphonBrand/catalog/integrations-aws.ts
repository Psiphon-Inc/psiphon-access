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
 * Brand catalog leaf: integrations, including the AWS OIDC and console flows.
 *
 * One authoring child owns this file. Add an entry to `INTEGRATIONS_AWS_ENTRIES` and
 * remove the matching entry from `INTEGRATIONS_AWS_BASELINE` in the same commit. The
 * gate raises RATCHET_FAIL when a phrase is in both, and UNKNOWN_PHRASE when a
 * phrase is in neither.
 */

import type { BrandBaselineEntry, BrandPhrase } from '../brandCatalog';

/** Catalog entries for integrations and AWS and Azure enrollment flows. */
export const INTEGRATIONS_AWS_ENTRIES: readonly BrandPhrase[] = [
  {
    source:
      '# Terraform Module\nmodule "aws_discovery" {\n  source  = ${moduleSrc}\n  version = ${version}\n\n  teleport_integration_use_name_prefix = ${integrationNameOrNull ? false : null}\n\n  teleport_proxy_public_addr    = ${cfg.proxyCluster + \':443\'}\n  teleport_discovery_group_name = "cloud-discovery-group"\n  teleport_integration_name\t    = ${integrationNameOrNull}\n\n  # Discover resources across all accounts in the AWS Organization,\n  # filtered by Organizational Units.\n  aws_organization_discovery = ${awsOrgDiscovery}\n\n  aws_matchers = ${awsMatchers}\n}\n',
    replacement:
      '# Terraform Module\nmodule "aws_discovery" {\n  source  = ${moduleSrc}\n  version = ${version}\n\n  teleport_integration_use_name_prefix = ${integrationNameOrNull ? false : null}\n\n  teleport_proxy_public_addr    = ${cfg.proxyCluster + \':443\'}\n  teleport_discovery_group_name = "cloud-discovery-group"\n  teleport_integration_name\t    = ${integrationNameOrNull}\n\n  # Discover resources across all accounts in the AWS Organization,\n  # filtered by Organizational Units.\n  aws_organization_discovery = ${awsOrgDiscovery}\n\n  aws_matchers = ${awsMatchers}\n}\n',
    count: 1,
    tier: 'protocol',
    immutable: true,
    reason:
      'This generated Terraform configuration is pasted into customer tooling, so rewriting it could break deployment.',
  },
  {
    source:
      '# Terraform Module\nmodule "azure_discovery" {\n  source  = ${moduleSrc}\n  version = ${version}\n\n  teleport_integration_use_name_prefix = ${integrationNameOrNull ? false : null}\n\n  teleport_proxy_public_addr    = ${cfg.proxyCluster + \':443\'}\n  teleport_discovery_group_name = "cloud-discovery-group"\n  teleport_integration_name\t    = ${integrationNameOrNull}\n\n  # Scope role assignment to a Management Group for discovering resources\n  # across all child subscriptions. Provide the Tenant ID to use the\n  # Tenant Root Group scope.\n  azure_management_group_id = ${managementGroupIdOrNull}\n\n  # Name of an existing Azure Resource Group where\n  # Azure resources will be created.\n  azure_resource_group_name = ${resourceGroup}\n\n  # Azure region (location) where the managed identity\n  # will be created (e.g., "eastus")\n  azure_managed_identity_location = ${managedIdentityRegionOrNull}\n\n  azure_matchers = ${azureMatchers}\n}\n',
    replacement:
      '# Terraform Module\nmodule "azure_discovery" {\n  source  = ${moduleSrc}\n  version = ${version}\n\n  teleport_integration_use_name_prefix = ${integrationNameOrNull ? false : null}\n\n  teleport_proxy_public_addr    = ${cfg.proxyCluster + \':443\'}\n  teleport_discovery_group_name = "cloud-discovery-group"\n  teleport_integration_name\t    = ${integrationNameOrNull}\n\n  # Scope role assignment to a Management Group for discovering resources\n  # across all child subscriptions. Provide the Tenant ID to use the\n  # Tenant Root Group scope.\n  azure_management_group_id = ${managementGroupIdOrNull}\n\n  # Name of an existing Azure Resource Group where\n  # Azure resources will be created.\n  azure_resource_group_name = ${resourceGroup}\n\n  # Azure region (location) where the managed identity\n  # will be created (e.g., "eastus")\n  azure_managed_identity_location = ${managedIdentityRegionOrNull}\n\n  azure_matchers = ${azureMatchers}\n}\n',
    count: 1,
    tier: 'protocol',
    immutable: true,
    reason:
      'This generated Terraform configuration is pasted into customer tooling, so rewriting it could break deployment.',
  },
  {
    source: '/teleport/discovery/aws',
    replacement: '/teleport/discovery/aws',
    count: 1,
    tier: 'protocol',
    immutable: true,
    reason:
      'This external Terraform module path is a protocol identifier, so changing it would break module resolution.',
  },
  {
    source: '/teleport/discovery/azure',
    replacement: '/teleport/discovery/azure',
    count: 1,
    tier: 'protocol',
    immutable: true,
    reason:
      'This external Terraform module path is a protocol identifier, so changing it would break module resolution.',
  },
  {
    source: '2. Configure AWS and Teleport providers',
    replacement: '2. Configure AWS and Teleport providers',
    count: 1,
    tier: 'render',
    immutable: true,
    reason:
      'Teleport is the actual upstream Terraform provider name in this heading, so the display text must remain unchanged.',
  },
  {
    source: '2. Configure Azure and Teleport providers',
    replacement: '2. Configure Azure and Teleport providers',
    count: 1,
    tier: 'render',
    immutable: true,
    reason:
      'Teleport is the actual upstream Terraform provider name in this heading, so the display text must remain unchanged.',
  },
  {
    source:
      'Compatible with any CLI and AWS SDK-based tooling (such as Terraform and AWS CLI). Teleport uses',
    replacement:
      'Compatible with any CLI and AWS SDK-based tooling (such as Terraform and AWS CLI). Psiphon Access uses',
    count: 1,
    tier: 'render',
    immutable: false,
    reason:
      'This user-facing service copy must use the Psiphon Access product name.',
  },
  {
    source:
      'Configures a new IAM Roles Anywhere which trusts your Teleport Cluster.',
    replacement:
      'Configures a new IAM Roles Anywhere which trusts your Psiphon Access cluster.',
    count: 1,
    tier: 'render',
    immutable: false,
    reason:
      'This user-facing service copy must use the Psiphon Access product name.',
  },
  {
    source:
      'Connect your AWS account to automatically discover and enroll resources in your Teleport Cluster.',
    replacement:
      'Connect your AWS account to automatically discover and enroll resources in your Psiphon Access cluster.',
    count: 1,
    tier: 'render',
    immutable: false,
    reason:
      'This user-facing service copy must use the Psiphon Access product name.',
  },
  {
    source:
      'Connect your Azure account to Teleport to automatically discover and enroll resources in your cluster.',
    replacement:
      'Connect your Azure account to Psiphon Access to automatically discover and enroll resources in your cluster.',
    count: 1,
    tier: 'render',
    immutable: false,
    reason:
      'This user-facing service copy must use the Psiphon Access product name.',
  },
  {
    source:
      'Connect your Azure account to automatically discover and enroll resources in your Teleport Cluster.',
    replacement:
      'Connect your Azure account to automatically discover and enroll resources in your Psiphon Access cluster.',
    count: 1,
    tier: 'render',
    immutable: false,
    reason:
      'This user-facing service copy must use the Psiphon Access product name.',
  },
  {
    source:
      'Create AWS Profiles and assign Roles to them in your AWS account. Teleport will allow you to import these Profiles as Resources.',
    replacement:
      'Create AWS Profiles and assign Roles to them in your AWS account. Psiphon Access will allow you to import these Profiles as Resources.',
    count: 1,
    tier: 'render',
    immutable: false,
    reason:
      'This user-facing service copy must use the Psiphon Access product name.',
  },
  {
    source: 'Create your first Profile to start accessing AWS from Teleport.',
    replacement:
      'Create your first Profile to start accessing AWS from Psiphon Access.',
    count: 1,
    tier: 'render',
    immutable: false,
    reason:
      'This user-facing service copy must use the Psiphon Access product name.',
  },
  {
    source:
      'Discover AWS-hosted databases automatically and register them with your Teleport cluster',
    replacement:
      'Discover AWS-hosted databases automatically and register them with your Psiphon Access cluster',
    count: 1,
    tier: 'render',
    immutable: false,
    reason:
      'This user-facing service copy must use the Psiphon Access product name.',
  },
  {
    source: 'Enroll Azure resources into Teleport.',
    replacement: 'Enroll Azure resources into Psiphon Access.',
    count: 1,
    tier: 'render',
    immutable: false,
    reason:
      'This user-facing service copy must use the Psiphon Access product name.',
  },
  {
    source:
      'Follow the below steps to create a Roles Anywhere Trust Anchor and configure the required IAM Roles for synchronizing Profiles as Teleport resources.',
    replacement:
      'Follow the below steps to create a Roles Anywhere Trust Anchor and configure the required IAM Roles for synchronizing Profiles as Psiphon Access resources.',
    count: 1,
    tier: 'render',
    immutable: false,
    reason:
      'This user-facing service copy must use the Psiphon Access product name.',
  },
  {
    source: 'Generate temporary bot Teleport credentials for Terraform.',
    replacement:
      'Generate temporary bot Psiphon Access credentials for Terraform.',
    count: 2,
    tier: 'render',
    immutable: false,
    reason:
      'This user-facing service copy must use the Psiphon Access product name.',
  },
  {
    source:
      'Import and synchronize AWS IAM Roles Anywhere Profiles into Teleport. Imported Profiles will be available as Resources with each Role available as an account.',
    replacement:
      'Import and synchronize AWS IAM Roles Anywhere Profiles into Psiphon Access. Imported Profiles will be available as Resources with each Role available as an account.',
    count: 1,
    tier: 'render',
    immutable: false,
    reason:
      'This user-facing service copy must use the Psiphon Access product name.',
  },
  {
    source:
      'In order to provide access to those databases, a Teleport Database Service/Agent with access to the RDS database is required. Those agents can be seen in the Agents tab.',
    replacement:
      'In order to provide access to those databases, a Psiphon Access Database Service/Agent with access to the RDS database is required. Those agents can be seen in the Agents tab.',
    count: 1,
    tier: 'render',
    immutable: false,
    reason:
      'This user-facing service copy must use the Psiphon Access product name.',
  },
  {
    source:
      'Instead of storing long-lived static credentials, Teleport will become a trusted OIDC provider with AWS to be able to request short lived credentials when performing operations automatically such as when connecting',
    replacement:
      'Instead of storing long-lived static credentials, Psiphon Access will become a trusted OIDC provider with AWS to be able to request short lived credentials when performing operations automatically such as when connecting',
    count: 1,
    tier: 'render',
    immutable: false,
    reason:
      'This user-facing service copy must use the Psiphon Access product name.',
  },
  {
    source:
      'It will then execute an install script on these discovered instances using AWS Systems Manager that will install Teleport, start it and join the cluster.',
    replacement:
      'It will then execute an install script on these discovered instances using AWS Systems Manager that will install Teleport, start it and join the cluster.',
    count: 1,
    tier: 'render',
    immutable: true,
    reason:
      'Teleport is the upstream binary installed by this script, so changing its name would make the instructions inaccurate.',
  },
  {
    source:
      'Match EC2 instances by their tags. If no tags are added, Teleport will match and enroll all EC2 instances.',
    replacement:
      'Match EC2 instances by their tags. If no tags are added, Psiphon Access will match and enroll all EC2 instances.',
    count: 1,
    tier: 'render',
    immutable: false,
    reason:
      'This user-facing service copy must use the Psiphon Access product name.',
  },
  {
    source:
      'Match EKS clusters by their tags. If no tags are added, Teleport will match and enroll all EKS clusters.',
    replacement:
      'Match EKS clusters by their tags. If no tags are added, Psiphon Access will match and enroll all EKS clusters.',
    count: 1,
    tier: 'render',
    immutable: false,
    reason:
      'This user-facing service copy must use the Psiphon Access product name.',
  },
  {
    source:
      'New and matching AWS Roles Anywhere Profiles created in the AWS Console will be automatically synced with Teleport.',
    replacement:
      'New and matching AWS Roles Anywhere Profiles created in the AWS Console will be automatically synced with Psiphon Access.',
    count: 1,
    tier: 'render',
    immutable: false,
    reason:
      'This user-facing service copy must use the Psiphon Access product name.',
  },
  {
    source:
      'Once Teleport completes setting up OIDC identity provider and creating a role named "',
    replacement:
      'Once Psiphon Access completes setting up OIDC identity provider and creating a role named "',
    count: 1,
    tier: 'render',
    immutable: false,
    reason:
      'This user-facing service copy must use the Psiphon Access product name.',
  },
  {
    source: 'Provide a name to identify this AWS integration in Teleport.',
    replacement:
      'Provide a name to identify this AWS integration in Psiphon Access.',
    count: 1,
    tier: 'render',
    immutable: false,
    reason:
      'This user-facing service copy must use the Psiphon Access product name.',
  },
  {
    source: 'Provide a name to identify this Azure integration in Teleport.',
    replacement:
      'Provide a name to identify this Azure integration in Psiphon Access.',
    count: 1,
    tier: 'render',
    immutable: false,
    reason:
      'This user-facing service copy must use the Psiphon Access product name.',
  },
  {
    source:
      'Select which AWS resource types to automatically discover and enroll in your Teleport cluster.',
    replacement:
      'Select which AWS resource types to automatically discover and enroll in your Psiphon Access cluster.',
    count: 1,
    tier: 'render',
    immutable: false,
    reason:
      'This user-facing service copy must use the Psiphon Access product name.',
  },
  {
    source:
      'Set up Teleport Discovery service to monitor the dynamic [db] resources registered by the discovery services',
    replacement:
      'Set up Psiphon Access Discovery service to monitor the dynamic [db] resources registered by the discovery services',
    count: 1,
    tier: 'render',
    immutable: false,
    reason:
      'This user-facing service copy must use the Psiphon Access product name.',
  },
  {
    source:
      'Set up Teleport as AWS OIDC IdP to support AWS resource enrollment.',
    replacement:
      'Set up Psiphon Access as AWS OIDC IdP to support AWS resource enrollment.',
    count: 1,
    tier: 'render',
    immutable: false,
    reason:
      'This user-facing service copy must use the Psiphon Access product name.',
  },
  {
    source:
      'Set up Teleport to post notifications to messaging apps, discover and import resources from cloud providers and other services.',
    replacement:
      'Set up Psiphon Access to post notifications to messaging apps, discover and import resources from cloud providers and other services.',
    count: 1,
    tier: 'render',
    immutable: false,
    reason:
      'This user-facing service copy must use the Psiphon Access product name.',
  },
  {
    source: 'Step 1: Name your Teleport Integration',
    replacement: 'Step 1: Name your Psiphon Access Integration',
    count: 1,
    tier: 'render',
    immutable: false,
    reason:
      'This user-facing service copy must use the Psiphon Access product name.',
  },
  {
    source: 'Sync AWS IAM Roles Anywhere Profiles with Teleport',
    replacement: 'Sync AWS IAM Roles Anywhere Profiles with Psiphon Access',
    count: 2,
    tier: 'render',
    immutable: false,
    reason:
      'This user-facing service copy must use the Psiphon Access product name.',
  },
  {
    source: 'Sync IAM Profiles with Teleport as Resources',
    replacement: 'Sync IAM Profiles with Psiphon Access as Resources',
    count: 1,
    tier: 'render',
    immutable: false,
    reason:
      'This user-facing service copy must use the Psiphon Access product name.',
  },
  {
    source: 'Teleport AWS Console and CLI access: Set up access',
    replacement: 'Teleport AWS Console and CLI access: Set up access',
    count: 1,
    tier: 'render',
    immutable: true,
    reason:
      'This linked upstream title must remain unchanged so its displayed name matches the destination.',
  },
  {
    source: 'Teleport AWS Discovery Documentation',
    replacement: 'Teleport AWS Discovery Documentation',
    count: 1,
    tier: 'render',
    immutable: true,
    reason:
      'This linked upstream title must remain unchanged so its displayed name matches the destination.',
  },
  {
    source: 'Teleport Azure Discovery Documentation',
    replacement: 'Teleport Azure Discovery Documentation',
    count: 1,
    tier: 'render',
    immutable: true,
    reason:
      'This linked upstream title must remain unchanged so its displayed name matches the destination.',
  },
  {
    source:
      'Teleport Discovery Terraform module currently does not support EKS Discovery with AWS Organizations. Select Single Account scope to enable EKS discovery.',
    replacement:
      'Teleport Discovery Terraform module currently does not support EKS Discovery with AWS Organizations. Select Single Account scope to enable EKS discovery.',
    count: 1,
    tier: 'render',
    immutable: true,
    reason:
      'Teleport Discovery Terraform module is the actual upstream module name, so this display text must remain unchanged.',
  },
  {
    source:
      'Teleport Kubernetes agent is not connecting for EKS cluster example-cluster',
    replacement:
      'Psiphon Access Kubernetes agent is not connecting for EKS cluster example-cluster',
    count: 1,
    tier: 'render',
    immutable: false,
    reason:
      'This status message refers to the running agent, so it must use the Psiphon Access product name.',
  },
  {
    source: 'Teleport Terraform provider',
    replacement: 'Teleport Terraform provider',
    count: 2,
    tier: 'render',
    immutable: true,
    reason:
      'This linked upstream title must remain unchanged so its displayed name matches the destination.',
  },
  {
    source:
      'Teleport can connect to Amazon EC2 and automatically discover and enroll EC2 instances matching the region and configured labels.',
    replacement:
      'Psiphon Access can connect to Amazon EC2 and automatically discover and enroll EC2 instances matching the region and configured labels.',
    count: 1,
    tier: 'render',
    immutable: false,
    reason:
      'This user-facing service copy must use the Psiphon Access product name.',
  },
  {
    source:
      'Teleport detects resources in your AWS Account and enrolls them in your Teleport cluster. When you deploy servers, databases, and Kubernetes clusters, Teleport enables secure access to these resources with no further configuration. This lets you decouple the need to protect your infrastructure resources from the work of deploying and managing them.',
    replacement:
      'Psiphon Access detects resources in your AWS Account and enrolls them in your Psiphon Access cluster. When you deploy servers, databases, and Kubernetes clusters, Psiphon Access enables secure access to these resources with no further configuration. This lets you decouple the need to protect your infrastructure resources from the work of deploying and managing them.',
    count: 1,
    tier: 'render',
    immutable: false,
    reason:
      'This user-facing service copy must use the Psiphon Access product name.',
  },
  {
    source: 'Teleport didn&#39;t find any Profiles',
    replacement: 'Psiphon Access didn&#39;t find any Profiles',
    count: 1,
    tier: 'render',
    immutable: false,
    reason:
      'This user-facing service copy must use the Psiphon Access product name.',
  },
  {
    source:
      'Teleport scans AWS for EKS clusters that match specified region and filtering labels. For each discovered cluster, Teleport will install the',
    replacement:
      'Psiphon Access scans AWS for EKS clusters that match specified region and filtering labels. For each discovered cluster, Psiphon Access will install the',
    count: 1,
    tier: 'render',
    immutable: false,
    reason:
      'This user-facing service copy must use the Psiphon Access product name.',
  },
  {
    source:
      'Teleport scans and adds RDS databases that match specified region and filtering labels.',
    replacement:
      'Psiphon Access scans and adds RDS databases that match specified region and filtering labels.',
    count: 1,
    tier: 'render',
    immutable: false,
    reason:
      'This user-facing service copy must use the Psiphon Access product name.',
  },
  {
    source:
      'Teleport scans every 30 minutes to find matching resources. Resources are enrolled in Teleport and ready for secure access.',
    replacement:
      'Psiphon Access scans every 30 minutes to find matching resources. Resources are enrolled in Psiphon Access and ready for secure access.',
    count: 2,
    tier: 'render',
    immutable: false,
    reason:
      'This user-facing service copy must use the Psiphon Access product name.',
  },
  {
    source:
      'Teleport will also remove App servers and resources used for auto-discovery that reference this integration.',
    replacement:
      'Psiphon Access will also remove App servers and resources used for auto-discovery that reference this integration.',
    count: 1,
    tier: 'render',
    immutable: false,
    reason:
      'This user-facing service copy must use the Psiphon Access product name.',
  },
  {
    source:
      'Teleport will periodically sync Roles Anywhere Profiles as AWS Access applications. You can create Roles which allow access to multiple Profiles and IAM Roles, and use them to grant AWS access to Teleport users.',
    replacement:
      'Psiphon Access will periodically sync Roles Anywhere Profiles as AWS Access applications. You can create Roles which allow access to multiple Profiles and IAM Roles, and use them to grant AWS access to Psiphon Access users.',
    count: 1,
    tier: 'render',
    immutable: false,
    reason:
      'This user-facing service copy must use the Psiphon Access product name.',
  },
  {
    source:
      "Teleport's Kubernetes App Discovery will automatically identify and enroll HTTP applications running inside discovered Kubernetes clusters.",
    replacement:
      "Psiphon Access's Kubernetes App Discovery will automatically identify and enroll HTTP applications running inside discovered Kubernetes clusters.",
    count: 1,
    tier: 'render',
    immutable: false,
    reason:
      'This user-facing service copy must use the Psiphon Access product name.',
  },
  {
    source:
      'The Terraform module will set up an OIDC connection in AWS and configure Teleport discovery to scan for your resources.',
    replacement:
      'The Terraform module will set up an OIDC connection in AWS and configure Psiphon Access discovery to scan for your resources.',
    count: 1,
    tier: 'render',
    immutable: false,
    reason:
      'This user-facing service copy must use the Psiphon Access product name.',
  },
  {
    source:
      'The generated Terraform module configuration will create an Azure managed identity that grants Teleport read-only access and configures Teleport discovery service to scan for your Azure resources.',
    replacement:
      'The generated Terraform module configuration will create an Azure managed identity that grants Psiphon Access read-only access and configures Psiphon Access discovery service to scan for your Azure resources.',
    count: 1,
    tier: 'render',
    immutable: false,
    reason:
      'This user-facing service copy must use the Psiphon Access product name.',
  },
  {
    source:
      'This Integration allows you to access protected AWS resources from Teleport. It uses AWS IAM OIDC Identity Provider to access AWS APIs. You can read more about how the integration works',
    replacement:
      'This Integration allows you to access protected AWS resources from Psiphon Access. It uses AWS IAM OIDC Identity Provider to access AWS APIs. You can read more about how the integration works',
    count: 1,
    tier: 'render',
    immutable: false,
    reason:
      'This user-facing service copy must use the Psiphon Access product name.',
  },
  {
    source: 'Unlock External Audit Storage with Teleport Enterprise',
    replacement: 'Unlock External Audit Storage with Teleport Enterprise',
    count: 1,
    tier: 'render',
    immutable: true,
    reason:
      'Teleport Enterprise is a real upstream edition title with no Psiphon Access equivalent, so the display title must remain unchanged.',
  },
  {
    source:
      'Use Terraform to connect your AWS account to Teleport and automatically discover resources.',
    replacement:
      'Use Terraform to connect your AWS account to Psiphon Access and automatically discover resources.',
    count: 1,
    tier: 'render',
    immutable: false,
    reason:
      'This user-facing service copy must use the Psiphon Access product name.',
  },
  {
    source:
      'Use Terraform to connect your Azure account to Teleport and automatically discover resources.',
    replacement:
      'Use Terraform to connect your Azure account to Psiphon Access and automatically discover resources.',
    count: 1,
    tier: 'render',
    immutable: false,
    reason:
      'This user-facing service copy must use the Psiphon Access product name.',
  },
  {
    source:
      'Use Terraform to connect your Google Cloud account to Teleport and automatically discover resources.',
    replacement:
      'Use Terraform to connect your Google Cloud account to Psiphon Access and automatically discover resources.',
    count: 1,
    tier: 'render',
    immutable: false,
    reason:
      'This user-facing service copy must use the Psiphon Access product name.',
  },
  {
    source:
      'Your cloud resources automatically appear in your Teleport cluster.',
    replacement:
      'Your cloud resources automatically appear in your Psiphon Access cluster.',
    count: 2,
    tier: 'render',
    immutable: false,
    reason:
      'This user-facing service copy must use the Psiphon Access product name.',
  },
  {
    source:
      'and copy and paste the command below. Upon executing in the AWS Shell the command will download and execute Teleport binary that configures Teleport as a IAM Roles Anywhere trusted entity. After running the script, copy the output and paste it in the field below.',
    replacement:
      'and copy and paste the command below. Upon executing in the AWS Shell the command will download and execute Teleport binary that configures Psiphon Access as a IAM Roles Anywhere trusted entity. After running the script, copy the output and paste it in the field below.',
    count: 1,
    tier: 'render',
    immutable: false,
    reason:
      'The command downloads the upstream Teleport binary, but its user-facing configuration target must use the Psiphon Access product name.',
  },
  {
    source:
      'and copy and paste the command provided below. Upon executing in the AWS Shell, the command will download and execute Teleport binary that configures Teleport as an OIDC identity provider for AWS and creates an IAM role required for the integration.',
    replacement:
      'and copy and paste the command provided below. Upon executing in the AWS Shell, the command will download and execute Teleport binary that configures Psiphon Access as an OIDC identity provider for AWS and creates an IAM role required for the integration.',
    count: 1,
    tier: 'render',
    immutable: false,
    reason:
      'The command downloads the upstream Teleport binary, but its user-facing configuration target must use the Psiphon Access product name.',
  },
  {
    source:
      'and copy and paste the role ARN below. Teleport will use this role to identify itself to AWS.',
    replacement:
      'and copy and paste the role ARN below. Psiphon Access will use this role to identify itself to AWS.',
    count: 1,
    tier: 'render',
    immutable: false,
    reason:
      'This user-facing service copy must use the Psiphon Access product name.',
  },
  {
    source: 'teleport-aws-prod',
    replacement: 'teleport-aws-prod',
    count: 1,
    tier: 'protocol',
    immutable: true,
    reason:
      'This default-style external integration name can be copied into persisted customer configuration, so it must remain unchanged.',
  },
  {
    source: 'teleport-aws-roles-anywhere-profile',
    replacement: 'teleport-aws-roles-anywhere-profile',
    count: 1,
    tier: 'protocol',
    immutable: true,
    reason:
      'This AWS Roles Anywhere profile identifier must remain unchanged to preserve references in customer IAM configuration.',
  },
  {
    source: 'teleport-aws-roles-anywhere-role',
    replacement: 'teleport-aws-roles-anywhere-role',
    count: 1,
    tier: 'protocol',
    immutable: true,
    reason:
      'This AWS Roles Anywhere role identifier must remain unchanged to preserve references in customer IAM configuration.',
  },
  {
    source: 'teleport-aws-roles-anywhere-trust-anchor',
    replacement: 'teleport-aws-roles-anywhere-trust-anchor',
    count: 1,
    tier: 'protocol',
    immutable: true,
    reason:
      'This AWS Roles Anywhere trust anchor identifier must remain unchanged to preserve references in customer IAM configuration.',
  },
  {
    source: 'teleport-kube-agent',
    replacement: 'teleport-kube-agent',
    // 3, not 6. The other three sites sit inside discover-enrolment baselined
    // phrases, and the longest-match-first ordering gives them to that leaf.
    count: 3,
    tier: 'protocol',
    immutable: true,
    reason:
      'This upstream Helm chart identifier must remain unchanged so chart installation continues to resolve.',
  },
  {
    source: 'teleport-kube-agent Chart Reference',
    replacement: 'teleport-kube-agent Chart Reference',
    count: 1,
    tier: 'render',
    immutable: true,
    reason:
      'This linked upstream title must remain unchanged so its displayed name matches the destination.',
  },
  {
    source:
      'which joins your cluster. See how the Teleport Kubernetes Agent works',
    replacement:
      'which joins your cluster. See how the Teleport Kubernetes Agent works',
    count: 1,
    tier: 'render',
    immutable: true,
    reason:
      'This complete source contains a linked upstream title that must remain unchanged so its displayed name matches the destination.',
  },
  {
    source:
      '{\n    "name": ${roleName},\n    "description": "Used by Teleport to provide access to AWS resources.",\n    "trust_policy": {\n        "Version": "2012-10-17",\n        "Statement": [\n            {\n                "Effect": "Allow",\n                "Action": "sts:AssumeRoleWithWebIdentity",\n                "Principal": {\n                    "Federated": "<YOUR_ACCOUNT_ID>":oidc-provider/${roleName}",\n                },\n                "Condition": {\n                    "StringEquals": {\n                        "${clusterId}:aud": "discover.teleport",\n                    }\n                }\n            }\n        ]\n    },\n    "tags": {\n        "teleport.dev/cluster": "${clusterId}",\n        "teleport.dev/integration": "${integrationName}",\n        "teleport.dev/origin": "integration_awsoidc"\n    }\n}',
    replacement:
      '{\n    "name": ${roleName},\n    "description": "Used by Teleport to provide access to AWS resources.",\n    "trust_policy": {\n        "Version": "2012-10-17",\n        "Statement": [\n            {\n                "Effect": "Allow",\n                "Action": "sts:AssumeRoleWithWebIdentity",\n                "Principal": {\n                    "Federated": "<YOUR_ACCOUNT_ID>":oidc-provider/${roleName}",\n                },\n                "Condition": {\n                    "StringEquals": {\n                        "${clusterId}:aud": "discover.teleport",\n                    }\n                }\n            }\n        ]\n    },\n    "tags": {\n        "teleport.dev/cluster": "${clusterId}",\n        "teleport.dev/integration": "${integrationName}",\n        "teleport.dev/origin": "integration_awsoidc"\n    }\n}',
    count: 1,
    tier: 'protocol',
    immutable: true,
    reason:
      'This generated IAM JSON is pasted into customer configuration, so rewriting it could change deployed policy data.',
  },
];

/** All measured phrases in this area now have explicit catalog entries. */
export const INTEGRATIONS_AWS_BASELINE: readonly BrandBaselineEntry[] = [];
